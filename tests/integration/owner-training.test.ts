import { NotificationRepository } from '../../packages/database/src/domains/notifications/notification-repository.ts';
import { runImmediateTransaction } from '../../packages/database/src/core/transaction.ts';
import { afterEach, expect, it } from 'vitest';
import { AccessDeniedError, SupplierWorkforceRepository } from '@ja/database';
import type { Role } from '@ja/domain';
import { populateOwnerTraining, TRAINING_BATCH } from '../../scripts/populate-owner-training.ts';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  seedB5User,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) closeB5LifecycleSecurityFixture(f);
});
function setup() {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  const { sqlite, repository } = f;
  const owner = stepUpB5Principal(sqlite, f.owner, 'training');
  const subjectSessions: Record<string, string> = {};
  for (const [name, role] of Object.entries({
    manager: 'project_manager',
    worker: 'worker',
    technician: 'worker',
    supplier: 'worker',
    finance: 'finance_admin',
    auditor: 'auditor_read_only',
  })) {
    const id = `${name}-test`;
    seedB5User(sqlite, id, role as Role);
    sqlite.prepare('UPDATE user SET email=? WHERE id=?').run(`${id}@j-aautomation.com`, id);
    const session = stepUpB5Principal(sqlite, repository.principalFor(id), 'training');
    subjectSessions[id] = session.sessionId!;
    const now = new Date().toISOString();
    sqlite
      .prepare(
        "INSERT INTO account(id,issuer,account_id,provider_id,user_id,password,created_at,updated_at) VALUES(?,?,?,'credential',?,?,?,?)",
      )
      .run(id, 'local:credential', id, id, 'isolated-fixture-placeholder', now, now);
  }
  const suppliers = new SupplierWorkforceRepository(sqlite);
  const supplier = suppliers.createSupplier(owner, { name: 'Training supplier' });
  for (const [userId, profile] of [
    ['supplier-test', 'supplier_coordinator'],
    ['technician-test', 'external_technician'],
  ] as const)
    suppliers.setAccountProfile(owner, { userId, profile, supplierId: supplier.id });
  for (const id of ['worker-test', 'technician-test']) {
    subjectSessions[id] = stepUpB5Principal(
      sqlite,
      repository.principalFor(id),
      'after-profile',
    ).sessionId!;
  }
  const client = repository.createClient(owner, {
    legalName: 'Training · Demo',
    displayName: 'Training · Demo',
    currency: 'USD',
    timezone: 'UTC',
    billingEmail: 'training@example.test',
    billingAddress: 'Fictional training address',
    paymentTermsDays: 30,
  });
  for (let i = 0; i < 4; i++)
    repository.createProject(owner, {
      clientId: client.id,
      name: `Project ${i} · Demo`,
      currency: 'USD',
      timezone: 'UTC',
      billingModel: i === 3 ? 'all_in' : 'tm',
      startDate: '2026-01-01',
    });
  const entity = repository.createLegalEntity(owner, {
    code: 'DEMO',
    legalName: 'J&A Automation · Demonstration Invoice',
    currency: 'USD',
    billingAddress: 'Fictional training address',
    companyIdentifiers: 'DEMO ONLY',
  });
  repository.createInvoiceNumberPolicy(owner, {
    legalEntityId: entity.id,
    prefix: 'DEMO',
    digits: 5,
    effectiveFrom: '2026-01-01',
    accountantApprovedAt: new Date().toISOString(),
  });
  return { ...f, owner, options: { financialHistory: true, subjectSessions } };
}
it('adds coherent financial history, quarantines delivery and never recreates renamed demo data', () => {
  const f = setup(),
    oldProject = f.sqlite.prepare('SELECT * FROM project WHERE id=?').get(f.project.id);
  const result = populateOwnerTraining(f.sqlite, f.owner, f.options);
  if (result.alreadyApplied || !result.ids || !result.counts)
    throw new Error('Unexpected existing batch');
  expect(result.counts.issuedInvoices).toBeGreaterThan(3);
  expect(result.counts.payments).toBeGreaterThan(2);
  const states = result.ids.invoices!.map(
    (id) =>
      (f.sqlite.prepare('SELECT state FROM invoice WHERE id=?').get(id) as { state: string }).state,
  );
  expect(states).toEqual(expect.arrayContaining(['draft', 'issued', 'paid', 'partially_paid']));
  for (const id of result.ids.issuedInvoices!)
    expect(
      f.sqlite
        .prepare(
          "SELECT failed_at,delivered_at,last_error FROM outbox_event WHERE topic='invoice.issued' AND aggregate_id=?",
        )
        .get(id),
    ).toBeUndefined();
  const batchTime = new Set(result.ids.time),
    batchExpenses = new Set(result.ids.expenses);
  for (const id of result.ids.invoices!)
    for (const source of f.sqlite
      .prepare('SELECT source_type,source_id FROM invoice_source WHERE invoice_id=?')
      .all(id) as { source_type: string; source_id: string }[])
      expect(
        source.source_type === 'time'
          ? batchTime.has(source.source_id)
          : batchExpenses.has(source.source_id),
      ).toBe(true);
  expect(f.sqlite.prepare('SELECT * FROM project WHERE id=?').get(f.project.id)).toEqual(
    oldProject,
  );
  expect(f.sqlite.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
  expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  const notices = new NotificationRepository({
    sqlite: f.sqlite,
    now: () => new Date().toISOString(),
    transaction: (work) => runImmediateTransaction(f.sqlite, 'training-notices-test', work),
  });
  notices.dispatchBusinessNotifications();
  const emails = f.sqlite
    .prepare(
      "SELECT failed_at,last_error FROM outbox_event WHERE topic='notification.email.requested'",
    )
    .all();
  expect(emails).toEqual([]);
  const normalTime = f.repository.createTimeEntry(
    f.owner,
    {
      projectId: f.project.id,
      workDate: new Date().toISOString().slice(0, 10),
      category: 'regular',
      minutes: 30,
      summary: 'Normal operational record',
    },
    f.worker.userId,
  );
  f.repository.submitTime(f.owner, normalTime.id, normalTime.version);
  notices.dispatchBusinessNotifications();
  expect(
    f.sqlite
      .prepare(
        "SELECT 1 FROM outbox_event WHERE topic='notification.email.requested' AND failed_at IS NULL AND payload_json LIKE ?",
      )
      .get(`%${normalTime.id}%`),
  ).toBeUndefined();
  // A later rename must not make reruns recreate content or fail discovery.
  f.sqlite
    .prepare(
      "UPDATE project SET name='Renamed training project' WHERE id=(SELECT id FROM project WHERE name LIKE '% · Demo' LIMIT 1)",
    )
    .run();
  const before = f.sqlite.prepare('SELECT count(*) n FROM invoice').get();
  expect(populateOwnerTraining(f.sqlite, f.owner, f.options).alreadyApplied).toBe(true);
  expect(f.sqlite.prepare('SELECT count(*) n FROM invoice').get()).toEqual(before);
});
it('rolls the entire batch back if a late financial command fails', () => {
  const f = setup();
  const before = f.sqlite.prepare('SELECT count(*) n FROM time_entry').get();
  f.sqlite.exec(
    "CREATE TRIGGER training_test_failure BEFORE INSERT ON payment BEGIN SELECT RAISE(ABORT,'isolated simulated payment failure'); END;",
  );
  expect(() => populateOwnerTraining(f.sqlite, f.owner, f.options)).toThrow(
    'isolated simulated payment failure',
  );
  expect(f.sqlite.prepare('SELECT count(*) n FROM time_entry').get()).toEqual(before);
  expect(
    f.sqlite.prepare('SELECT 1 FROM audit_event WHERE correlation_id=?').get(TRAINING_BATCH),
  ).toBeUndefined();
  expect(f.sqlite.prepare('SELECT count(*) n FROM invoice').get()).toEqual({ n: 0 });
});
it('requires a live Owner and authenticated report subjects', () => {
  const f = setup();
  expect(() =>
    populateOwnerTraining(f.sqlite, { ...f.owner, sessionId: undefined }, f.options),
  ).toThrow(AccessDeniedError);
  const finance = stepUpB5Principal(f.sqlite, f.finance, 'training-denial');
  expect(() => populateOwnerTraining(f.sqlite, finance, f.options)).toThrow(AccessDeniedError);
  expect(() =>
    populateOwnerTraining(f.sqlite, f.owner, { ...f.options, subjectSessions: {} }),
  ).toThrow('Authenticated training subject session required');
  expect(
    f.sqlite.prepare('SELECT 1 FROM audit_event WHERE correlation_id=?').get(TRAINING_BATCH),
  ).toBeUndefined();
});
