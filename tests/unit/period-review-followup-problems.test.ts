import { beforeEach, describe, expect, it, vi } from 'vitest';

const scenario = vi.hoisted(() => ({
  error: null as Error | null,
  recorded: false,
  conformityActive: false,
}));
const close = vi.fn();

vi.mock('@ja/database', async (importOriginal) => {
  const original = await importOriginal<typeof import('@ja/database')>();
  return {
    ...original,
    PeriodFollowupRepository: class {
      assertReviewAccess() {}
      recordEvent() {
        if (scenario.error) throw scenario.error;
        scenario.recorded = true;
        return { eventType: 'shared' };
      }
    },
  };
});

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

import {
  PeriodFollowupAccessDeniedError,
  PeriodFollowupConflictError,
  PeriodFollowupNotFoundError,
  PeriodFollowupValidationError,
} from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actions, load } from '../../apps/portal/src/routes/app/reports/review/+page.server';

function request(values: Record<string, string>): Request {
  const form = new FormData();
  for (const [name, value] of Object.entries(values)) form.set(name, value);
  return new Request('http://localhost/j-aautomation/app/reports/review', {
    method: 'POST',
    body: form,
  });
}

function values(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    periodReportId: 'report-1',
    expectedSnapshotVersion: '2',
    expectedSnapshotSha256: 'a'.repeat(64),
    expectedLatestEventId: '',
    idempotencyKey: 'report-1-event-1',
    eventType: 'shared',
    method: 'Email',
    eventDate: '2026-09-25',
    reference: 'Customer dispatch',
    signatoryName: '',
    reason: '',
    responsibleUserId: 'manager-1',
    nextFollowUpOn: '',
    ...overrides,
  };
}

async function submit(overrides: Record<string, string> = {}) {
  return actions.recordFollowup!({
    request: request(values(overrides)),
    locals: {
      user: { id: 'manager-1', role: 'project_manager' },
      session: { id: 'session-1' },
    },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  scenario.error = null;
  scenario.recorded = false;
  scenario.conformityActive = false;
  vi.mocked(openPortalRepository).mockReturnValue({
    principal: { userId: 'manager-1', role: 'project_manager', projectIds: new Set(['project-1']) },
    repository: { listFinanceProjects: () => [] },
    sqlite: {
      close,
      prepare: (sql: string) => ({
        all: () => [],
        get: () =>
          scenario.conformityActive && sql.includes('FROM customer_conformity c')
            ? {
                id: 'conformity-1',
                reportState: 'approved',
                reportPdfStorageKey: 'reports/report-1.pdf',
                reportPdfSha256: 'a'.repeat(64),
                reportPdfByteLength: 100,
                conformityPdfStorageKey: 'reports/report-1.pdf',
                conformityPdfSha256: 'a'.repeat(64),
                conformityPdfByteLength: 100,
                invalidatedAt: null,
              }
            : undefined,
      }),
    },
    v3: {
      getCustomerConformity: () => ({ status: 'active', signatureEvidenceStatus: 'verified' }),
    },
  } as unknown as ReturnType<typeof openPortalRepository>);
});

describe('period review follow-up action', () => {
  it('records valid follow-up and retains the shared success contract', async () => {
    const result = await submit();
    expect(result).toMatchObject({
      success: true,
      messageKey: 'action.reports.periodFollowupRecorded',
      messageParams: { eventType: 'shared' },
    });
    expect(scenario.recorded).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });

  it('returns adjacent field errors and entered values for invalid input', async () => {
    const result = await submit({ eventType: 'unknown', responsibleUserId: '' });
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'PERIOD_FOLLOWUP_FIELDS_INVALID',
        values: { periodReportId: 'report-1', eventType: 'unknown', responsibleUserId: '' },
        fieldErrors: {
          eventType: ['Please select an option.'],
          responsibleUserId: ['Please select an option.'],
        },
        remedies: [{ id: 'review_followup' }],
      },
    });
    expect(scenario.recorded).toBe(false);
  });

  it.each([
    [
      'Follow-up history changed; refresh before recording follow-up',
      'PERIOD_FOLLOWUP_HISTORY_CHANGED',
      'review_followup',
    ],
    [
      'Customer report snapshot changed; refresh before recording follow-up',
      'PERIOD_FOLLOWUP_SNAPSHOT_CHANGED',
      'review_report',
    ],
    [
      'A ready customer PDF is required before dispatch or signatory follow-up',
      'PERIOD_FOLLOWUP_PDF_NOT_READY',
      'review_report',
    ],
    [
      'Idempotency key was already used for different follow-up data',
      'PERIOD_FOLLOWUP_RETRY_KEY_USED',
      'review_followup',
    ],
  ])('maps %s to a typed review remedy', async (message, code, remedy) => {
    scenario.error = new PeriodFollowupConflictError(message);
    const result = await submit({ method: 'Portal message' });
    expect(result).toMatchObject({
      status: 409,
      data: {
        code,
        values: { method: 'Portal message' },
        remedies: [{ id: remedy }],
      },
    });
  });

  it('identifies a stale responsible person beside the selection', async () => {
    scenario.error = new PeriodFollowupValidationError(
      'Responsible staff member is not assigned to the project',
    );
    const result = await submit();
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'PERIOD_FOLLOWUP_RESPONSIBLE_UNAVAILABLE',
        fieldErrors: { responsibleUserId: ['problem.period.responsibleUnavailable'] },
      },
    });
  });

  it('does not silently override verified customer sign-off for a return', async () => {
    scenario.conformityActive = true;
    const result = await submit({ eventType: 'returned', reason: 'Customer requested changes' });
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'PERIOD_FOLLOWUP_CONFORMITY_ACTIVE',
        remedies: [{ id: 'review_signoff' }],
      },
    });
    expect(scenario.recorded).toBe(false);
  });

  it('keeps access and not-found responses role-safe', async () => {
    scenario.error = new PeriodFollowupAccessDeniedError('Project review required');
    const forbidden = await submit();
    expect(forbidden).toMatchObject({
      status: 403,
      data: {
        code: 'PERIOD_REPORT_PERMISSION_REQUIRED',
        remedies: [{ id: 'contact_project_owner' }],
      },
    });
    scenario.error = new PeriodFollowupNotFoundError('Period report not found');
    const missing = await submit();
    expect(missing).toMatchObject({
      status: 404,
      data: {
        code: 'PERIOD_REPORT_NOT_FOUND',
        remedies: [{ id: 'review_reports' }],
      },
    });
  });

  it('loads the cookie locale for native translated responses', async () => {
    const result = await load({
      locals: { user: { id: 'manager-1', role: 'project_manager' }, session: { id: 'session-1' } },
      url: new URL('http://localhost/j-aautomation/app/reports/review'),
      cookies: { get: (key: string) => (key === 'ja.portal.locale' ? 'pt' : undefined) },
    } as never);
    expect(result).toMatchObject({ locale: 'pt', review: null });
  });
});
