import { AssignmentExpensePolicyRepository } from '@ja/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';
const state = vi.hoisted(() => ({ context: null as unknown }));
vi.mock('$lib/server/portal-repository', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  openPortalRepository: () => state.context,
}));
import { GET, POST } from '../../apps/portal/src/routes/app/api/billing/composer/+server.ts';

let fixture: B5LifecycleSecurityFixture;
let scope: { projectId: string; billingRuleId: string; periodStart: string; periodEnd: string };
let context: {
  sqlite: B5LifecycleSecurityFixture['sqlite'];
  repository: B5LifecycleSecurityFixture['repository'];
  v3: B5LifecycleSecurityFixture['v3'];
  principal: B5LifecycleSecurityFixture['owner'];
};
beforeEach(() => {
  fixture = createB5LifecycleSecurityFixture();
  fixture.worker = stepUpB5Principal(fixture.sqlite, fixture.worker, 'composer-api-worker');
  const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'composer-api-owner');
  const sqlite = new Proxy(fixture.sqlite, {
    get(target, name) {
      if (name === 'close') return () => undefined;
      const value = Reflect.get(target, name);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  context = { sqlite, repository: fixture.repository, v3: fixture.v3, principal: owner };
  state.context = context;
  const issuer = fixture.repository.createLegalEntity(owner, {
    code: 'API',
    legalName: 'API issuer',
    currency: 'EUR',
    billingAddress: 'Address',
    companyIdentifiers: 'API',
  });
  const rule = fixture.repository.createBillingRule(owner, {
    projectId: fixture.project.id,
    legalEntityId: issuer.id,
    streamType: 'labor',
    cadenceType: 'custom',
    currency: 'EUR',
    effectiveFrom: '2026-08-01',
  });
  scope = {
    projectId: fixture.project.id,
    billingRuleId: rule.id,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
  };
  fixture.v3.createClientLaborRate(owner, {
    projectId: fixture.project.id,
    workerId: fixture.worker.userId,
    currency: 'EUR',
    hourlyRateMinor: 6000n,
    overtimeMethod: 'NONE',
    effectiveFrom: '2026-08-01',
  });
  fixture.v3.createInternalCostRule(owner, {
    projectId: fixture.project.id,
    workerId: fixture.worker.userId,
    currency: 'EUR',
    hourlyRateMinor: 2000n,
    overtimeMethod: 'NONE',
    effectiveFrom: '2026-08-01',
  });
  fixture.v3.createCompensationRule(owner, {
    projectId: fixture.project.id,
    workerId: fixture.worker.userId,
    currency: 'EUR',
    ruleType: 'Hourly',
    rateMinor: 1000n,
    overtimeMethod: 'NONE',
    travelMethod: 'BASE',
    effectiveFrom: '2026-08-01',
  });
});
afterEach(() => {
  state.context = null;
  closeB5LifecycleSecurityFixture(fixture);
});
const locals = () => ({
  user: { id: context.principal.userId },
  session: { id: context.principal.sessionId },
  correlationId: 'composer-api-test',
});
async function post(body: unknown, origin = 'http://localhost') {
  const url = new URL('http://localhost/j-aautomation/app/api/billing/composer');
  return POST({
    locals: locals(),
    url,
    request: new Request(url, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  } as never);
}
function time(minutes: number) {
  const row = fixture.repository.createTimeEntry(fixture.worker, {
    projectId: fixture.project.id,
    workDate: '2026-08-20',
    category: 'regular',
    minutes,
    summary: 'Actual API work',
  });
  fixture.repository.submitTime(fixture.worker, row.id, row.version);
  const version = Number(
    fixture.sqlite.prepare('SELECT version FROM time_entry WHERE id=?').get(row.id)!.version,
  );
  return { type: 'time' as const, id: row.id, version };
}
describe('invoice composer HTTP lifecycle and boundaries', () => {
  it('returns operational source rows and issuing requirements to a live Owner without creating invoices', async () => {
    time(60);
    const response = await GET({
      locals: locals(),
      url: new URL(
        `http://localhost/j-aautomation/app/api/billing/composer?${new URLSearchParams(scope)}`,
      ),
    } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      sources: [{ approvalState: 'submitted', financeAccepted: false }],
      issuing: {
        issues: expect.arrayContaining([
          'canonical_legal_entity_revision_required',
          'missing_accountant_approved_number_policy',
        ]),
      },
    });
    expect(fixture.sqlite.prepare('SELECT COUNT(*) n FROM invoice').get()!.n).toBe(0);
  });
  it('approves only selected pending hours and preserves exact preview/retry identity', async () => {
    const chosen = time(60);
    const unchosen = time(30);
    const approved = await post({
      operation: 'approveSources',
      projectId: scope.projectId,
      sources: [chosen],
    });
    expect(approved.status).toBe(200);
    const source = (await approved.json()).sources[0];
    expect(
      fixture.sqlite.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(unchosen.id)!
        .approval_state,
    ).toBe('submitted');
    const selection = {
      ...scope,
      sources: [{ type: source.type, id: source.id, version: source.version }],
    };
    const preview = await post({ operation: 'preview', ...selection });
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      success: true,
      state: 'ready',
      subtotalMinor: '6000',
      totalMinor: '6000',
    });
    expect(fixture.sqlite.prepare('SELECT COUNT(*) n FROM invoice').get()!.n).toBe(0);
    const create = { operation: 'create', ...selection, requestKey: 'composer-api-stable-request' };
    const first = await post(create);
    expect(first.status).toBe(200);
    const invoice = (await first.json()).invoice;
    const replay = await post(create);
    expect(replay.status).toBe(200);
    expect((await replay.json()).invoice.id).toBe(invoice.id);
    expect(fixture.sqlite.prepare('SELECT COUNT(*) n FROM invoice').get()!.n).toBe(1);
  });
  it.each(['worker', 'manager'] as const)(
    'does not expose sources or money to %s',
    async (role) => {
      context.principal = stepUpB5Principal(
        fixture.sqlite,
        fixture[role],
        `composer-api-boundary-${role}`,
      );
      const response = await GET({
        locals: locals(),
        url: new URL(
          `http://localhost/j-aautomation/app/api/billing/composer?${new URLSearchParams(scope)}`,
        ),
      } as never);
      expect(response.status).toBe(403);
      expect(await response.json()).not.toHaveProperty('sources');
    },
  );
  it('applies actual configured expense conditions once and recovers an exact completed retry', async () => {
    const issuerId = String(
      fixture.repository
        .listBillingRules(context.principal)
        .find((row) => row.id === scope.billingRuleId)!.legal_entity_id,
    );
    const revision = fixture.v3.createCanonicalLegalEntityRevision(context.principal, {
      legacyLegalEntityId: issuerId,
      effectiveFrom: '2026-01-01',
      legalName: 'API issuer',
      taxIdentifier: 'API-TAX',
      addressLine1: 'Address',
      locality: 'Madrid',
      postalCode: '28001',
      countryCode: 'ES',
      baseCurrency: 'EUR',
      timezone: 'Europe/Madrid',
      reason: 'Verified fixture issuer',
      idempotencyKey: 'composer-expense-issuer',
    });
    fixture.v3.assignCanonicalLegalEntityToProject(context.principal, {
      projectId: scope.projectId,
      legalEntityRevisionId: revision.revisionId,
      effectiveFrom: '2026-01-01',
      reason: 'Verified fixture assignment',
      idempotencyKey: 'composer-expense-authority',
    });
    const membership = fixture.sqlite
      .prepare('SELECT id FROM project_member WHERE project_id=? AND user_id=?')
      .get(scope.projectId, fixture.worker.userId)!;
    new AssignmentExpensePolicyRepository(fixture.sqlite).create(context.principal, {
      projectMemberId: String(membership.id),
      payer: 'worker',
      effectiveFrom: '2026-01-01',
      workerReimbursement: 'at_cost',
      clientRecovery: 'at_cost',
      reason: 'Configured expense terms',
    });
    const expense = fixture.repository.createExpense(fixture.worker, {
      projectId: scope.projectId,
      spentOn: '2026-08-20',
      vendor: 'Transport',
      category: 'travel',
      description: 'Actual travel receipt',
      currency: 'EUR',
      amountMinor: 1234n,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    fixture.repository.submitExpense(fixture.worker, expense.id, expense.version);
    const version = Number(
      fixture.sqlite.prepare('SELECT version FROM expense WHERE id=?').get(expense.id)!.version,
    );
    const body = {
      operation: 'applyExpenseConditions',
      projectId: scope.projectId,
      source: { type: 'expense', id: expense.id, version },
      requestKey: '  composer-expense-stable-request  ',
    };
    const first = await post(body);
    expect(first.status).toBe(200);
    const row = fixture.sqlite
      .prepare(
        'SELECT version,billing_amount_minor,commercial_classification_state FROM expense WHERE id=?',
      )
      .get(expense.id)!;
    expect(row).toMatchObject({
      version: version + 1,
      billing_amount_minor: 1234,
      commercial_classification_state: 'classified',
    });
    const replay = await post(body);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      success: true,
      version: version + 1,
      replayed: true,
    });
    expect(
      fixture.sqlite
        .prepare('SELECT COUNT(*) n FROM expense_classification_revision WHERE expense_id=?')
        .get(expense.id)!.n,
    ).toBe(1);
    const conflict = await post({ ...body, source: { ...body.source, version: version + 1 } });
    expect(conflict.status).toBe(409);
  });

  it('rejects a cross-origin write before lifecycle mutation', async () => {
    const source = time(60);
    expect(
      (
        await post(
          { operation: 'approveSources', projectId: scope.projectId, sources: [source] },
          'https://unrelated.example',
        )
      ).status,
    ).toBe(403);
    expect(
      fixture.sqlite.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(source.id)!
        .approval_state,
    ).toBe('submitted');
  });
  it('returns visible structured failures for stale selected records', async () => {
    const source = time(60);
    const response = await post({
      operation: 'approveSources',
      projectId: scope.projectId,
      sources: [{ ...source, version: source.version + 1 }],
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      correlationId: 'composer-api-test',
    });
    expect(
      fixture.sqlite.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(source.id)!
        .approval_state,
    ).toBe('submitted');
  });
});
