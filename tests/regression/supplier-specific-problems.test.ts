import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupplierWorkforceRepository } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const openSupplierContext = vi.fn();
vi.mock('$lib/server/supplier-context', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/supplier-context')>();
  return { ...original, openSupplierContext };
});
const { actions } = await import('../../apps/portal/src/routes/app/supplier/+page.server.ts');

const fixtures: B5LifecycleSecurityFixture[] = [];
function setup() {
  const fixture = createB5LifecycleSecurityFixture();
  fixtures.push(fixture);
  const supplier = new SupplierWorkforceRepository(fixture.sqlite);
  const usePrincipal = (principal = fixture.owner) =>
    openSupplierContext.mockReturnValue({
      principal,
      supplier,
      sqlite: { prepare: fixture.sqlite.prepare.bind(fixture.sqlite), close: vi.fn() },
    });
  usePrincipal();
  return { fixture, supplier, usePrincipal };
}
async function submit(operation: keyof typeof actions, values: Record<string, string>) {
  return actions[operation]!({
    locals: { correlationId: 'supplier-specific-problem-test' },
    request: new Request('http://localhost/j-aautomation/app/supplier', {
      method: 'POST',
      body: new URLSearchParams(values),
    }),
  } as never);
}
function coordinatorSetup(
  fixture: B5LifecycleSecurityFixture,
  supplier: SupplierWorkforceRepository,
) {
  const record = supplier.createSupplier(fixture.owner, { name: 'Supplier required fields' });
  const timestamp = new Date().toISOString();
  fixture.sqlite
    .prepare(
      `INSERT INTO account(id,issuer,account_id,provider_id,user_id,password,created_at,updated_at)
       VALUES(?,?,?,'credential',?,?,?,?)`,
    )
    .run(
      'supplier-specific-credential',
      'local:credential',
      'supplier-specific-account',
      fixture.worker.userId,
      'fixture-credential-hash',
      timestamp,
      timestamp,
    );
  const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'supplier-specific-owner');
  supplier.setAccountProfile(owner, {
    userId: fixture.worker.userId,
    profile: 'supplier_coordinator',
    supplierId: record.id,
  });
  supplier.grantProject(owner, {
    supplierId: record.id,
    projectId: fixture.project.id,
    coordinatorId: fixture.worker.userId,
    startsOn: '2026-01-01',
  });
  const coordinator = stepUpB5Principal(
    fixture.sqlite,
    fixture.worker,
    'supplier-specific-coordinator',
  );
  const technician = supplier.addTechnician(coordinator, {
    projectId: fixture.project.id,
    name: 'Technician A',
    startsOn: '2026-01-01',
  });
  return { record, coordinator, technician };
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
  vi.clearAllMocks();
});

describe('supplier action specific problems', () => {
  it('identifies supplier and technician name fields without a shared generic code', async () => {
    const { fixture, supplier } = setup();
    const values = { name: '  ' };
    expect(await submit('createSupplier', values)).toMatchObject({
      status: 400,
      data: {
        code: 'SUPPLIER_NAME_REQUIRED',
        messageKey: 'problem.supplier.nameRequired',
        fieldErrors: { name: ['problem.supplier.nameRequired'] },
        remedies: [{ id: 'correct_supplier_field' }],
        values,
      },
    });
    const supplierRecord = supplier.createSupplier(fixture.owner, {
      name: 'Supplier for technician',
    });
    const technicianValues = {
      name: '',
      supplierId: supplierRecord.id,
      projectId: fixture.project.id,
      startsOn: '2026-01-01',
    };
    expect(await submit('addTechnician', technicianValues)).toMatchObject({
      status: 400,
      data: {
        code: 'SUPPLIER_TECHNICIAN_NAME_REQUIRED',
        fieldErrors: { name: ['problem.supplier.technicianNameRequired'] },
        values: technicianValues,
      },
    });
  });

  it('points to supplier selection and correction request fields', async () => {
    const { fixture } = setup();
    expect(
      await submit('addTechnician', {
        name: 'Technician A',
        projectId: fixture.project.id,
        startsOn: '2026-01-01',
      }),
    ).toMatchObject({
      status: 400,
      data: {
        code: 'SUPPLIER_SELECTION_REQUIRED',
        fieldErrors: { supplierId: ['problem.supplier.supplierSelectionRequired'] },
      },
    });
    expect(
      await submit('correctTime', { id: 'missing', requestId: '', reason: 'Fix time' }),
    ).toMatchObject({
      status: 400,
      data: {
        code: 'SUPPLIER_CORRECTION_REQUEST_REQUIRED',
        fieldErrors: { requestId: ['problem.supplier.correctionRequestRequired'] },
      },
    });
    expect(
      await submit('correctTime', { id: 'missing', requestId: 'correction-request-1', reason: '' }),
    ).toMatchObject({
      status: 400,
      data: {
        code: 'SUPPLIER_CORRECTION_REASON_REQUIRED',
        fieldErrors: { reason: ['problem.supplier.correctionReasonRequired'] },
      },
    });
  });

  it('identifies time category, summary, and batch request fields', async () => {
    const { fixture, supplier, usePrincipal } = setup();
    const { coordinator, technician } = coordinatorSetup(fixture, supplier);
    usePrincipal(coordinator);
    const base = {
      workerId: technician.id,
      projectId: fixture.project.id,
      workDate: '2026-09-20',
      minutes: '60',
      category: 'work',
      summary: 'Work performed',
    };
    expect(await submit('createTime', { ...base, category: '' })).toMatchObject({
      status: 400,
      data: {
        code: 'SUPPLIER_CATEGORY_REQUIRED',
        fieldErrors: { category: ['problem.supplier.categoryRequired'] },
      },
    });
    expect(await submit('createTime', { ...base, summary: '' })).toMatchObject({
      status: 400,
      data: {
        code: 'SUPPLIER_ACTIVITY_SUMMARY_REQUIRED',
        fieldErrors: { summary: ['problem.supplier.activitySummaryRequired'] },
      },
    });
    expect(
      await submit('createTimeBatch', {
        ...base,
        requestId: '',
        workerIds: technician.id,
        durationMode: 'duration',
        durationHours: '1',
      }),
    ).toMatchObject({
      status: 400,
      data: {
        code: 'SUPPLIER_BATCH_REQUEST_REQUIRED',
        fieldErrors: { requestId: ['problem.supplier.batchRequestRequired'] },
      },
    });
  });

  it('names the technician whose daily limit atomically blocks a batch', async () => {
    const { fixture, supplier, usePrincipal } = setup();
    const { coordinator, technician } = coordinatorSetup(fixture, supplier);
    supplier.createTime(coordinator, {
      workerId: technician.id,
      projectId: fixture.project.id,
      workDate: '2026-09-20',
      category: 'work',
      minutes: 1440,
      summary: 'Already recorded',
    });
    usePrincipal(coordinator);
    const values = {
      requestId: 'supplier-daily-limit-batch-1',
      workerIds: technician.id,
      projectId: fixture.project.id,
      workDate: '2026-09-20',
      category: 'work',
      summary: 'More work',
      batchMode: 'shared',
      durationMode: 'duration',
      durationHours: '1',
    };
    expect(await submit('createTimeBatch', values)).toMatchObject({
      status: 400,
      data: {
        code: 'SUPPLIER_BATCH_TECHNICIAN_DAILY_LIMIT',
        messageKey: 'problem.supplier.batchTechnicianDailyLimit',
        params: { technicianName: 'Technician A' },
        fieldErrors: { workDate: ['problem.supplier.batchTechnicianDailyLimit'] },
        remedies: [{ id: 'review_time_drafts' }],
        values,
      },
    });
    expect(
      fixture.sqlite
        .prepare('SELECT COUNT(*) AS count FROM time_entry WHERE worker_id=?')
        .get(technician.id),
    ).toEqual({ count: 1 });
  });

  it('names the technician whose existing interval overlaps a batch', async () => {
    const { fixture, supplier, usePrincipal } = setup();
    const { coordinator, technician } = coordinatorSetup(fixture, supplier);
    supplier.createTime(coordinator, {
      workerId: technician.id,
      projectId: fixture.project.id,
      workDate: '2026-09-20',
      category: 'work',
      minutes: 60,
      summary: 'Morning work',
      startTime: '09:00',
      endTime: '10:00',
      breakMinutes: 0,
    });
    usePrincipal(coordinator);
    const values = {
      requestId: 'supplier-overlap-batch-1',
      workerIds: technician.id,
      projectId: fixture.project.id,
      workDate: '2026-09-20',
      category: 'work',
      summary: 'Overlapping work',
      batchMode: 'shared',
      durationMode: 'interval',
      startTime: '09:30',
      endTime: '10:30',
      breakMinutes: '0',
    };
    expect(await submit('createTimeBatch', values)).toMatchObject({
      status: 400,
      data: {
        code: 'SUPPLIER_BATCH_TECHNICIAN_INTERVAL_OVERLAP',
        messageKey: 'problem.supplier.batchTechnicianIntervalOverlap',
        params: { technicianName: 'Technician A' },
        fieldErrors: { startTime: ['problem.supplier.batchTechnicianIntervalOverlap'] },
        remedies: [{ id: 'review_time_drafts' }],
        values,
      },
    });
    expect(
      fixture.sqlite
        .prepare('SELECT COUNT(*) AS count FROM time_entry WHERE worker_id=?')
        .get(technician.id),
    ).toEqual({ count: 1 });
  });

  it.each([
    ['25:00', '26:00', '0', 'SUPPLIER_CLOCK_FORMAT_INVALID', 'startTime'],
    ['12:00', '12:00', '0', 'SUPPLIER_INTERVAL_ORDER_INVALID', 'endTime'],
    ['12:00', '13:00', '60', 'SUPPLIER_SHIFT_BREAK_INVALID', 'breakMinutes'],
  ])(
    'explains invalid interval %s to %s with %s break minutes',
    async (startTime, endTime, breakMinutes, code, field) => {
      setup();
      const values = {
        requestId: 'supplier-specific-batch-1',
        workerIds: 'technician',
        projectId: 'project',
        workDate: '2026-09-20',
        category: 'work',
        summary: 'Work performed',
        batchMode: 'shared',
        durationMode: 'interval',
        startTime,
        endTime,
        breakMinutes,
      };
      const result = await submit('createTimeBatch', values);
      expect(result).toMatchObject({
        status: 400,
        data: {
          code,
          fieldErrors: { [field]: [expect.stringMatching(/^problem\./u)] },
          values,
        },
      });
    },
  );
});
