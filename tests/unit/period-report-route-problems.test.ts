import { beforeEach, describe, expect, it, vi } from 'vitest';

const scenario = vi.hoisted(() => ({
  followupError: '',
  approvalError: '',
  invalidationError: '',
  documents: [] as Array<Record<string, unknown>>,
  snapshotVersion: 2,
  uploadConflict: '',
  recordedSignoff: false,
}));

vi.mock('$lib/server/private-artifact-access', () => ({
  writePrivateFileExclusive: vi.fn(async () => {}),
  removePrivateFileIfPresent: vi.fn(async () => {}),
}));

vi.mock('$lib/server/report-attachment-route', () => ({
  assertRegularPrivateFile: vi.fn(async () => {}),
}));

vi.mock('@ja/database', async (importOriginal) => {
  const original = await importOriginal<typeof import('@ja/database')>();
  return {
    ...original,
    PeriodFollowupRepository: class {
      getReportFollowup() {
        return null;
      }
      recordEvent() {
        if (scenario.followupError)
          throw new original.PeriodFollowupConflictError(scenario.followupError);
        return { eventType: 'shared' };
      }
    },
  };
});

vi.mock('$lib/server/portal-repository', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/portal-repository')>();
  const database = await import('@ja/database');
  return {
    ...original,
    openPortalRepository: () => ({
      principal: { userId: 'finance-1', role: 'finance_admin', projectIds: new Set(['project-1']) },
      sqlite: {
        close: () => {},
        prepare(sql: string) {
          return {
            all(...args: unknown[]) {
              if (!sql.includes('FROM document d')) return [];
              const [ownerId, projectId, requestedId] = args;
              return scenario.documents.filter(
                (document) =>
                  document.owner_id === ownerId &&
                  document.project_id === projectId &&
                  (requestedId === undefined || document.id === requestedId),
              );
            },
            get() {
              return undefined;
            },
          };
        },
      },
      v3: {
        periodReportSnapshot() {
          return { project: { id: 'project-1' }, audience: 'customer' };
        },
        listPeriodReports() {
          return [
            {
              id: 'report-1',
              audience: 'customer',
              state: 'approved',
              snapshot_version: scenario.snapshotVersion,
              snapshot_sha256: 'a'.repeat(64),
            },
          ];
        },
        periodReportPdfMetadata() {
          return { storageKey: 'reports/report-1/report.pdf' };
        },
        reserveUpload() {
          return {
            reservationId: '55555555-5555-4555-8555-555555555555',
            storageKey: 'uploads/test.pdf',
          };
        },
        finalizeUpload() {
          if (scenario.uploadConflict) throw new database.V3ConflictError(scenario.uploadConflict);
          return { created: true };
        },
        cancelUploadReservation() {},
        recordCustomerConformity() {
          scenario.recordedSignoff = true;
          return { id: 'conformity-1' };
        },
        approvePeriodReport() {
          if (scenario.approvalError) throw new database.V3ConflictError(scenario.approvalError);
          return { changed: true, id: 'report-1', snapshotVersion: 1 };
        },
        invalidateCustomerConformity() {
          if (scenario.invalidationError)
            throw new database.V3ConflictError(scenario.invalidationError);
          return { conformityId: 'conformity-1' };
        },
      },
    }),
  };
});

import { actions, load } from '../../apps/portal/src/routes/app/reports/period/[id]/+page.server';

function request(values: Record<string, string>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return new Request('http://localhost/j-aautomation/app/reports/period/report-1', {
    method: 'POST',
    body: form,
  });
}

function evidence(
  id: string,
  options: {
    ownerId?: string;
    projectId?: string;
    version?: number;
    state?: 'quarantined' | 'committed';
  } = {},
) {
  const state = options.state ?? 'committed';
  return {
    id,
    owner_id: options.ownerId ?? 'finance-1',
    project_id: options.projectId ?? 'project-1',
    description: JSON.stringify({
      kind: 'customer_signoff_evidence_binding_v1',
      periodReportId: 'report-1',
      snapshotVersion: options.version ?? 2,
      snapshotSha256: 'a'.repeat(64),
    }),
    state,
    scan_status: state === 'quarantined' ? 'pending' : 'clean',
    media_type: 'application/pdf',
    sha256: 'b'.repeat(64),
    byte_length: 300,
  };
}

beforeEach(() => {
  scenario.followupError = '';
  scenario.approvalError = '';
  scenario.invalidationError = '';
  scenario.documents = [];
  scenario.snapshotVersion = 2;
  scenario.uploadConflict = '';
  scenario.recordedSignoff = false;
});

describe('period report action problems', () => {
  it('preserves follow-up entries when history changes', async () => {
    scenario.followupError = 'Follow-up history changed; refresh before recording follow-up';
    const response = await actions.recordFollowup!({
      request: request({
        expectedSnapshotVersion: '1',
        expectedSnapshotSha256: 'a'.repeat(64),
        expectedLatestEventId: 'event-1',
        idempotencyKey: 'attempt-1',
        eventType: 'shared',
        method: 'Email',
        eventDate: '2026-09-25',
        reference: 'Customer dispatch',
        responsibleUserId: 'finance-1',
      }),
      params: { id: 'report-1' },
      locals: { user: { id: 'finance-1' } },
    } as never);
    expect(response.status).toBe(409);
    expect(response.data).toMatchObject({
      code: 'PERIOD_FOLLOWUP_HISTORY_CHANGED',
      operation: 'recordFollowup',
      values: { method: 'Email', reference: 'Customer dispatch' },
      remedies: [{ id: 'review_followup' }],
    });
  });

  it('identifies stale approval without exposing repository text', async () => {
    scenario.approvalError = 'Period report snapshot changed before approval';
    const response = await actions.approve!({
      request: request({
        expectedSnapshotVersion: '1',
        expectedSnapshotSha256: 'a'.repeat(64),
      }),
      params: { id: 'report-1' },
      locals: { user: { id: 'finance-1' } },
    } as never);
    expect(response.status).toBe(409);
    expect(response.data).toMatchObject({
      code: 'PERIOD_REPORT_APPROVAL_CHANGED',
      remedies: [{ id: 'review_report' }],
    });
  });

  it('asks for a signed PDF without retaining uploaded bytes', async () => {
    const response = await actions.sign!({
      request: request({ signerName: 'Customer', signatureDate: '2026-09-24' }),
      params: { id: 'report-1' },
      locals: { user: { id: 'finance-1' } },
    } as never);
    expect(response.status).toBe(400);
    expect(response.data).toMatchObject({
      code: 'PERIOD_SIGNOFF_PDF_REQUIRED',
      operation: 'sign',
      values: { signerName: 'Customer', signatureDate: '2026-09-24' },
      remedies: [{ id: 'reattach_signed_pdf' }],
      fieldErrors: { signatureFile: expect.any(Array) },
    });
    expect(response.data.values).not.toHaveProperty('signatureFile');
  });

  it('preserves an invalidation reason after a stale sign-off conflict', async () => {
    scenario.invalidationError = 'Customer conformity is already invalidated';
    const response = await actions.invalidateSignoff!({
      request: request({ conformityId: 'conformity-1', reason: 'Superseded evidence' }),
      locals: { user: { id: 'finance-1' } },
    } as never);
    expect(response.status).toBe(409);
    expect(response.data).toMatchObject({
      code: 'PERIOD_SIGNOFF_ALREADY_INVALIDATED',
      operation: 'invalidateSignoff',
      values: { reason: 'Superseded evidence' },
      remedies: [{ id: 'review_signoff' }],
    });
  });

  it('recovers only the current uploader and snapshot after reload', async () => {
    const ownId = '66666666-6666-4666-8666-666666666666';
    scenario.documents = [
      evidence('77777777-7777-4777-8777-777777777777', { ownerId: 'other-user' }),
      evidence('88888888-8888-4888-8888-888888888888', { version: 1 }),
      evidence(ownId, { state: 'quarantined' }),
    ];
    const result = await load({
      locals: { user: { id: 'finance-1', role: 'finance_admin' } },
      params: { id: 'report-1' },
      url: new URL('http://localhost/j-aautomation/app/reports/period/report-1'),
      cookies: { get: () => undefined },
    } as never);
    expect(result).toMatchObject({
      pendingSignoffEvidence: { id: ownId, state: 'pending_scan' },
    });
  });

  it('returns the selected cookie locale for native action responses', async () => {
    const result = await load({
      locals: { user: { id: 'finance-1', role: 'finance_admin' } },
      params: { id: 'report-1' },
      url: new URL('http://localhost/j-aautomation/app/reports/period/report-1'),
      cookies: { get: (key: string) => (key === 'ja.portal.locale' ? 'es' : undefined) },
    } as never);
    expect(result).toMatchObject({ locale: 'es' });
  });

  it('reuses a committed owned PDF without requiring another upload', async () => {
    const id = '66666666-6666-4666-8666-666666666666';
    scenario.documents = [evidence(id)];
    const result = await actions.sign!({
      request: request({
        pendingSignatureDocumentId: id,
        signerName: 'Customer',
        signatureDate: '2026-09-24',
      }),
      params: { id: 'report-1' },
      locals: { user: { id: 'finance-1' } },
    } as never);
    expect(result).toMatchObject({ success: true });
    expect(scenario.recordedSignoff).toBe(true);
  });

  it('keeps pending evidence and refuses a stale or foreign retry ID', async () => {
    const id = '66666666-6666-4666-8666-666666666666';
    scenario.documents = [evidence(id, { state: 'quarantined' })];
    const pending = await actions.sign!({
      request: request({
        pendingSignatureDocumentId: id,
        signerName: 'Customer',
        signatureDate: '2026-09-24',
      }),
      params: { id: 'report-1' },
      locals: { user: { id: 'finance-1' } },
    } as never);
    expect(pending.status).toBe(409);
    expect(pending.data).toMatchObject({
      code: 'PERIOD_SIGNOFF_SCAN_PENDING',
      pendingSignatureDocumentId: id,
      values: { signerName: 'Customer' },
    });
    expect(scenario.recordedSignoff).toBe(false);

    scenario.snapshotVersion = 3;
    const stale = await actions.sign!({
      request: request({
        pendingSignatureDocumentId: id,
        signerName: 'Customer',
        signatureDate: '2026-09-24',
      }),
      params: { id: 'report-1' },
      locals: { user: { id: 'finance-1' } },
    } as never);
    expect(stale.status).toBe(409);
    expect(stale.data).toMatchObject({ code: 'PERIOD_SIGNOFF_RETRY_UNAVAILABLE' });

    scenario.snapshotVersion = 2;
    scenario.documents = [evidence(id, { ownerId: 'other-user' })];
    const foreign = await actions.sign!({
      request: request({
        pendingSignatureDocumentId: id,
        signerName: 'Customer',
        signatureDate: '2026-09-24',
      }),
      params: { id: 'report-1' },
      locals: { user: { id: 'finance-1' } },
    } as never);
    expect(foreign.status).toBe(409);
    expect(foreign.data).toMatchObject({ code: 'PERIOD_SIGNOFF_RETRY_UNAVAILABLE' });
    expect(scenario.recordedSignoff).toBe(false);
  });

  it('explains duplicate content without identifying the existing document', async () => {
    scenario.uploadConflict = 'Upload conflicts with existing content';
    const form = new FormData();
    form.set('signerName', 'Customer');
    form.set('signatureDate', '2026-09-24');
    form.set(
      'signatureFile',
      new File(['%PDF-1.7\n%%EOF'], 'signed.pdf', { type: 'application/pdf' }),
    );
    const result = await actions.sign!({
      request: new Request('http://localhost/j-aautomation/app/reports/period/report-1', {
        method: 'POST',
        body: form,
      }),
      params: { id: 'report-1' },
      locals: { user: { id: 'finance-1' } },
    } as never);
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'PERIOD_SIGNOFF_DUPLICATE_CONTENT',
      remedies: [{ id: 'review_signoff' }],
    });
    expect(JSON.stringify(result.data)).not.toContain('existing document');
  });
});
