import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { Principal } from '@ja/domain';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const openPortalRepository = vi.fn();
vi.mock('$lib/server/portal-repository', () => ({ openPortalRepository }));

const { actions, load } =
  await import('../../apps/portal/src/routes/app/reports/review/+page.server.ts');
const { actions: detailActions } =
  await import('../../apps/portal/src/routes/app/reports/period/[id]/+page.server.ts');

const fixtures: B5LifecycleSecurityFixture[] = [];

afterEach(() => {
  openPortalRepository.mockReset();
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

function seedReport(value: B5LifecycleSecurityFixture): { id: string; hash: string } {
  const json = JSON.stringify({ reportVersion: 1, approvedMinutes: 480 });
  const hash = createHash('sha256').update(json).digest('hex');
  value.sqlite
    .prepare(
      `INSERT INTO period_report(
         id,project_id,period_start,period_end,audience,report_type,state,snapshot_json,
         pdf_storage_key,pdf_sha256,created_by,created_at,updated_at,pdf_byte_length,
         snapshot_version,snapshot_sha256
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'astra-c1-http-report',
      value.project.id,
      '2026-08-01',
      '2026-08-31',
      'customer',
      'customer_period',
      'approved',
      json,
      'reports/astra-c1-http-report/v1.pdf',
      'e'.repeat(64),
      value.owner.userId,
      '2026-08-25T08:00:00.000Z',
      '2026-08-25T08:00:00.000Z',
      128,
      1,
      hash,
    );
  return { id: 'astra-c1-http-report', hash };
}

function seedCurrentConformity(
  value: B5LifecycleSecurityFixture,
  report: { id: string; hash: string },
): void {
  const snapshotJson = JSON.stringify({ reportVersion: 1, approvedMinutes: 480 });
  value.sqlite
    .prepare(
      `INSERT INTO customer_conformity(
         id,period_report_id,snapshot_version,snapshot_sha256,snapshot_json,
         report_pdf_storage_key,report_pdf_sha256,report_pdf_byte_length,signer_name,
         signer_identity,signed_at,signature_document_id,created_by,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'astra-c1-http-conformity',
      report.id,
      1,
      report.hash,
      snapshotJson,
      'reports/astra-c1-http-report/v1.pdf',
      'e'.repeat(64),
      128,
      'Signed Customer',
      null,
      '2026-08-25T09:00:00.000Z',
      null,
      value.owner.userId,
      '2026-08-25T09:00:00.000Z',
    );
}

function context(
  value: B5LifecycleSecurityFixture,
  principal: Principal,
  v3: Record<string, unknown> = {},
) {
  const close = vi.fn();
  const sqlite = new Proxy(value.sqlite, {
    get(target, property) {
      if (property === 'close') return close;
      const current = Reflect.get(target, property, target);
      return typeof current === 'function' ? current.bind(target) : current;
    },
  });
  return {
    principal,
    sqlite,
    v3: {
      getCustomerConformityForPeriodReport: () => null,
      getCustomerConformity: () => null,
      ...v3,
    },
    repository: value.repository,
    close,
  };
}

function locals(principal: Principal) {
  return {
    user: { id: principal.userId, role: principal.role },
    session: { id: principal.sessionId },
  };
}

function request(values: Record<string, string>): Request {
  return new Request('http://localhost/j-aautomation/app/reports/review', {
    method: 'POST',
    body: new URLSearchParams(values),
  });
}

describe('ASTRA C1 review HTTP boundaries', () => {
  it('rejects Worker before loading any follow-up DTO', () => {
    const value = fixture();
    const principal = stepUpB5Principal(value.sqlite, value.worker, 'c1-http-worker');
    const routeContext = context(value, principal);
    openPortalRepository.mockReturnValue(routeContext);

    expect(() =>
      load({
        locals: locals(principal),
        url: new URL('http://localhost/j-aautomation/app/reports/review'),
      } as never),
    ).toThrow(expect.objectContaining({ status: 403 }));
    expect(routeContext.close).toHaveBeenCalledOnce();
  });

  it('keeps PM review results scoped and omits finance DTOs', () => {
    const value = fixture();
    seedReport(value);
    const principal = stepUpB5Principal(value.sqlite, value.manager, 'c1-http-pm');
    const routeContext = context(value, principal);
    openPortalRepository.mockReturnValue(routeContext);

    const result = load({
      locals: locals(principal),
      url: new URL(
        `http://localhost/j-aautomation/app/reports/review?project=${value.project.id}&from=2026-08-01&to=2026-08-31`,
      ),
    } as never) as Record<string, unknown>;
    expect(result).toMatchObject({
      userRole: 'project_manager',
      review: { projectId: value.project.id },
      finance: { billing: [], invoices: [] },
    });
    expect(JSON.stringify(result.finance)).not.toMatch(/minor|amount|margin|billingRuleId/iu);
    expect(routeContext.close).toHaveBeenCalledOnce();
  });

  it('retains invalid action input and does not open a repository on overposting', async () => {
    const result = await actions.recordFollowup!({
      locals: { user: { id: 'pm', role: 'project_manager' } },
      request: request({
        periodReportId: 'astra-c1-http-report',
        expectedSnapshotVersion: '1',
        expectedSnapshotSha256: 'a'.repeat(64),
        expectedLatestEventId: '',
        idempotencyKey: 'http-invalid',
        eventType: 'shared',
        responsibleUserId: 'pm',
        unexpected: 'must be rejected',
      }),
      params: { id: 'unused-on-review-route' },
    } as never);
    expect(result).toMatchObject({
      status: 400,
      data: { values: { unexpected: 'must be rejected' } },
    });
    expect(openPortalRepository).not.toHaveBeenCalled();
  });

  it('does not let returned/disputed follow-up bypass current verified conformity invalidation', async () => {
    const value = fixture();
    const report = seedReport(value);
    seedCurrentConformity(value, report);
    const principal = stepUpB5Principal(value.sqlite, value.manager, 'c1-http-signed');
    const routeContext = context(value, principal, {
      getCustomerConformityForPeriodReport: () => ({
        status: 'active',
        signatureEvidenceStatus: 'verified',
      }),
      getCustomerConformity: () => ({
        status: 'active',
        signatureEvidenceStatus: 'verified',
      }),
    });
    openPortalRepository.mockReturnValue(routeContext);

    const result = await actions.recordFollowup!({
      locals: locals(principal),
      request: request({
        periodReportId: report.id,
        expectedSnapshotVersion: '1',
        expectedSnapshotSha256: report.hash,
        expectedLatestEventId: '',
        idempotencyKey: 'http-signed-return',
        eventType: 'returned',
        reason: 'Customer correction requested',
        responsibleUserId: principal.userId,
      }),
      params: { id: report.id },
    } as never);
    expect(result).toMatchObject({ status: 409 });
    const detailResult = await detailActions.recordFollowup!({
      locals: locals(principal),
      params: { id: report.id },
      request: request({
        expectedSnapshotVersion: '1',
        expectedSnapshotSha256: report.hash,
        expectedLatestEventId: '',
        idempotencyKey: 'detail-signed-return',
        eventType: 'returned',
        reason: 'Customer correction requested',
        responsibleUserId: principal.userId,
      }),
    } as never);
    expect(detailResult).toMatchObject({ status: 409 });
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) count FROM period_report_followup_event WHERE period_report_id=?')
        .get(report.id),
    ).toEqual({ count: 0 });
    expect(routeContext.close).toHaveBeenCalledTimes(2);
  });

  it('ignores a verified conformity from an older report version for review acceptance and return gating', async () => {
    const value = fixture();
    const report = seedReport(value);
    seedCurrentConformity(value, report);
    value.sqlite
      .prepare(
        `INSERT INTO customer_conformity_invalidation
      (id,conformity_id,reason,actor_id,occurred_at) VALUES(?,?,?,?,?)`,
      )
      .run(
        'old-version-invalidation',
        'astra-c1-http-conformity',
        'Replace report version',
        value.owner.userId,
        new Date().toISOString(),
      );
    value.sqlite
      .prepare('UPDATE period_report SET snapshot_version=?,snapshot_sha256=? WHERE id=?')
      .run(2, 'f'.repeat(64), report.id);
    const principal = stepUpB5Principal(value.sqlite, value.manager, 'c1-http-stale-signoff');
    const routeContext = context(value, principal, {
      getCustomerConformityForPeriodReport: () => ({
        status: 'active',
        signatureEvidenceStatus: 'verified',
      }),
      getCustomerConformity: () => ({
        status: 'active',
        signatureEvidenceStatus: 'verified',
      }),
    });
    openPortalRepository.mockReturnValue(routeContext);

    const review = load({
      locals: locals(principal),
      url: new URL(
        `http://localhost/j-aautomation/app/reports/review?project=${value.project.id}&from=2026-08-01&to=2026-08-31`,
      ),
    } as never) as { review: { reports: Array<{ conformityState: string }> } };
    expect(review.review.reports[0]?.conformityState).toBe('not_accepted');

    const result = await actions.recordFollowup!({
      locals: locals(principal),
      request: request({
        periodReportId: report.id,
        expectedSnapshotVersion: '2',
        expectedSnapshotSha256: 'f'.repeat(64),
        expectedLatestEventId: '',
        idempotencyKey: 'http-stale-return',
        eventType: 'returned',
        reason: 'Customer correction requested on the new version',
        responsibleUserId: principal.userId,
      }),
      params: { id: report.id },
    } as never);
    expect(result).not.toMatchObject({ status: 409 });
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) count FROM period_report_followup_event WHERE period_report_id=?')
        .get(report.id),
    ).toEqual({ count: 1 });
  });
});
