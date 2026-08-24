import { inflateRawSync } from 'node:zlib';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PortalRepository, createDatabase } from '@ja/database';
import type { Principal, Role } from '@ja/domain';
import {
  invoiceCollectionLedgerCsv,
  invoiceCollectionLedgerXlsx,
  workerStatementCsv,
  workerStatementPdf,
  type InvoiceCollectionLedgerRow,
  type WorkerStatementSnapshot,
} from '@ja/reporting';
import { installB5TestDeploymentIdentity } from './fixtures/b5-test-environment.js';

const { GET: workerStatementGet } =
  await import('../apps/portal/src/routes/app/api/worker-statement/[format]/+server.js');
const { GET: invoiceLedgerGet } =
  await import('../apps/portal/src/routes/app/api/invoice-collection-ledger/[format]/+server.js');

function unzip(bytes: Uint8Array): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const buffer = Buffer.from(bytes);
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedLength = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const compressed = buffer.subarray(dataStart, dataStart + compressedLength);
    files.set(name, method === 8 ? inflateRawSync(compressed) : Buffer.from(compressed));
    offset = dataStart + compressedLength;
  }
  return files;
}

const statement: WorkerStatementSnapshot = {
  worker: { id: 'worker', name: 'Own Worker' },
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  currency: 'USD',
  approvedMinutes: 480,
  pendingMinutes: 60,
  estimatedApprovedMinor: '123456789012345',
  estimatedPendingMinor: '2500',
  approvedReimbursementMinor: '12345',
  pendingReimbursementMinor: '500',
  missingCompensationRules: 0,
  activities: [
    {
      id: 'time-own',
      projectNumber: 'P-001',
      projectName: 'Own project',
      date: '2026-08-11',
      category: 'work',
      activitySummary: 'Commissioned own equipment',
      actualMinutes: 480,
      approvalState: 'approved',
    },
  ],
  settlements: [
    {
      id: 'settlement-own',
      projectNumber: 'P-001',
      projectName: 'Own project',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      amountMinor: '123456789012345',
      currency: 'USD',
      state: 'settled',
      expectedPaymentOn: '2026-09-01',
      settledAt: '2026-09-01T12:00:00.000Z',
    },
  ],
  expenses: [
    {
      id: 'expense-own',
      projectNumber: 'P-001',
      spentOn: '2026-08-12',
      vendor: '=unsafe-vendor',
      category: 'hotel',
      reimbursementAmountMinor: '12345',
      currency: 'USD',
      approvalState: 'approved',
      reimbursementState: 'reimbursed',
      expectedReimbursementOn: '2026-09-02',
      reimbursedAt: '2026-09-02T12:00:00.000Z',
    },
  ],
};

const ledger: readonly InvoiceCollectionLedgerRow[] = [
  {
    invoiceId: 'invoice-a',
    invoiceNumber: 'JA-001',
    clientNumber: 'C-001',
    clientName: '=unsafe-client',
    projectNumber: 'P-001',
    projectName: 'Project A',
    issueDate: '2026-08-05T10:00:00.000Z',
    dueDate: '2026-09-04',
    currency: 'USD',
    subtotalMinor: '9000',
    taxMinor: '1000',
    totalMinor: '10000',
    grossPaymentsMinor: '8000',
    paymentReversalsMinor: '3000',
    netCollectedMinor: '5000',
    collectedMinor: '5000',
    outstandingMinor: '5000',
    directCostKnownMinor: '4000',
    directCostMinor: null,
    directCostComplete: false,
    directCostMissingSourceIds: ['time-missing'],
    contributionMinor: null,
    contributionMarginBps: null,
    paymentStatus: 'partially_paid',
    billingStatus: 'partially_paid',
    payments: [
      {
        id: 'payment-a',
        grossAmountMinor: '8000',
        reversedMinor: '3000',
        netAmountMinor: '5000',
      },
    ],
    paymentReversals: [{ id: 'reversal-a', originalPaymentId: 'payment-a', amountMinor: '3000' }],
  },
  {
    invoiceId: 'invoice-void',
    invoiceNumber: 'JA-002',
    clientNumber: 'C-002',
    clientName: 'Client B',
    projectNumber: 'P-002',
    projectName: 'Project B',
    currency: 'USD',
    subtotalMinor: '20000',
    taxMinor: '0',
    totalMinor: '20000',
    grossPaymentsMinor: '25000',
    paymentReversalsMinor: '0',
    netCollectedMinor: '25000',
    collectedMinor: '0',
    outstandingMinor: '0',
    directCostKnownMinor: '5000',
    directCostMinor: '5000',
    directCostComplete: true,
    directCostMissingSourceIds: [],
    contributionMinor: '15000',
    contributionMarginBps: '7500',
    paymentStatus: 'void',
    billingStatus: 'void',
    payments: [{ id: 'payment-b', grossAmountMinor: '25000', netAmountMinor: '25000' }],
    paymentReversals: [],
  },
];

describe('Client Essential report-family serializers', () => {
  it('produces an own-only statement CSV and a real PDF without commercial fields', () => {
    const csv = Buffer.from(workerStatementCsv(statement)).toString('utf8');
    expect(csv).toContain('123456789012345');
    expect(csv).toContain('settled');
    expect(csv).toContain('reimbursed');
    expect(csv).toContain('Commissioned own equipment');
    expect(csv).toContain('2026-09-01');
    expect(csv).toContain('2026-09-02T12:00:00.000Z');
    expect(csv).toContain("'=unsafe-vendor");
    expect(csv).not.toMatch(/client.?rate|internal.?cost|contribution|margin|other.?worker/iu);

    const pdf = workerStatementPdf(statement);
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(1_000);
  });

  it('keeps reversal, void and incomplete-cost truth row-local in CSV and XLSX', () => {
    const csv = Buffer.from(invoiceCollectionLedgerCsv(ledger)).toString('utf8');
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('8000,3000,5000,5000,5000,4000,,false,time-missing');
    expect(lines[1]).toContain('reversal-a');
    expect(lines[2]).toContain('25000,0,25000,0,0,5000,5000,true,,15000,7500,void,void');
    expect(csv).toContain("'=unsafe-client");

    const files = unzip(invoiceCollectionLedgerXlsx(ledger));
    expect(files.get('xl/workbook.xml')?.toString()).toContain('Invoice collection ledger');
    const ledgerSheet = files.get('xl/worksheets/sheet1.xml')?.toString() ?? '';
    expect(ledgerSheet).toContain('time-missing');
    expect(ledgerSheet).toContain('reversal-a');
    expect(ledgerSheet).toContain('r="AA2"');
    expect(files.get('xl/worksheets/sheet2.xml')?.toString()).toContain('payment-a');
    expect(files.get('xl/worksheets/sheet3.xml')?.toString()).toContain('reversal-a');
  });

  it('uses the native technical report date before creation timestamps', () => {
    const source = readFileSync(resolve('packages/reporting/src/exports.ts'), 'utf8');
    expect(source).toContain(
      'row.report_date ?? row.reportDate ?? row.date ?? row.created_at ?? row.createdAt',
    );
  });
});

let directory: string;
let restoreIdentity: (() => void) | undefined;
const previousDatabasePath = process.env.JA_DATABASE_PATH;

function seedUser(repository: PortalRepository, role: Role, id: string): Principal {
  const sqlite = (repository as unknown as { sqlite: ReturnType<typeof createDatabase>['sqlite'] })
    .sqlite;
  const now = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(id, id, `${id}@example.test`, role, 'active', 1, now, now);
  return { userId: id, role, projectIds: new Set() };
}

function event(
  role: Role | null,
  route: 'worker' | 'ledger',
  format: string,
  query = 'periodStart=2026-08-01&periodEnd=2026-08-31',
) {
  const id = role ?? 'anonymous';
  return {
    locals: {
      user: role ? { id, name: id, email: `${id}@example.test`, role, status: 'active' } : null,
      session: role ? { id: `${id}-session`, userId: id, expiresAt: new Date() } : null,
      correlationId: `${id}-correlation`,
    },
    params: { format },
    url: new URL(`http://localhost/app/api/${route}/${format}?${query}`),
  } as never;
}

beforeEach(() => {
  restoreIdentity = installB5TestDeploymentIdentity();
  directory = mkdtempSync(join(tmpdir(), 'ja-essential-report-routes-'));
  process.env.JA_DATABASE_PATH = join(directory, 'app.db');
  const database = createDatabase();
  const repository = new PortalRepository(database.sqlite);
  const principals = new Map<Role, Principal>();
  for (const role of ['owner_admin', 'finance_admin', 'project_manager', 'worker'] as const)
    principals.set(role, seedUser(repository, role, role));
  const otherWorker = seedUser(repository, 'worker', 'other-worker');
  const owner = principals.get('owner_admin') as Principal;
  const client = repository.createClient(owner, {
    legalName: 'Statement Client',
    displayName: 'Statement Client',
    currency: 'USD',
    timezone: 'UTC',
    billingAddress: '1 Statement Street',
    billingEmail: 'billing@example.test',
    paymentTermsDays: 30,
  });
  const project = repository.createProject(owner, {
    clientId: client.id,
    name: 'Statement Project',
    timezone: 'UTC',
    currency: 'USD',
    billingModel: 'tm',
  });
  repository.assignWorker(owner, {
    projectId: project.id,
    workerId: 'worker',
    startsOn: '2026-01-01',
  });
  repository.assignWorker(owner, {
    projectId: project.id,
    workerId: 'other-worker',
    startsOn: '2026-01-01',
  });
  const worker = { ...principals.get('worker'), projectIds: new Set([project.id]) } as Principal;
  const other = { ...otherWorker, projectIds: new Set([project.id]) } as Principal;
  repository.createTimeEntry(worker, {
    projectId: project.id,
    workDate: '2026-08-11',
    category: 'commissioning',
    minutes: 420,
    summary: 'OWN-WORKER-ACTIVITY',
  });
  const ownExpense = repository.createExpense(worker, {
    projectId: project.id,
    spentOn: '2026-08-12',
    category: 'hotel',
    currency: 'USD',
    amountMinor: 12_345n,
    clientTreatment: 'reimbursable',
    vendor: 'OWN-WORKER-VENDOR',
    description: 'Own reimbursement',
    whoPaid: 'worker',
    paymentMethod: 'personal_card',
    receiptRequired: false,
  });
  repository.setExpensePlanningDates(principals.get('finance_admin') as Principal, {
    expenseId: ownExpense.id,
    expectedReimbursementOn: '2026-09-05',
    expectedRecoveryOn: '2026-09-20',
    expectedVersion: ownExpense.version,
  });
  repository.createExpense(other, {
    projectId: project.id,
    spentOn: '2026-08-13',
    category: 'hotel',
    currency: 'USD',
    amountMinor: 99_999n,
    clientTreatment: 'reimbursable',
    vendor: 'OTHER-WORKER-SECRET',
    description: 'Other reimbursement',
    whoPaid: 'worker',
    paymentMethod: 'personal_card',
    receiptRequired: false,
  });
  database.sqlite.close();
});

afterEach(() => {
  if (previousDatabasePath === undefined) delete process.env.JA_DATABASE_PATH;
  else process.env.JA_DATABASE_PATH = previousDatabasePath;
  restoreIdentity?.();
  restoreIdentity = undefined;
  rmSync(directory, { recursive: true, force: true });
});

describe('Client Essential private report routes', () => {
  it('allows only a worker to export their own statement and ignores guessed worker IDs', async () => {
    expect(() => workerStatementGet(event(null, 'worker', 'csv'))).toThrowError();
    for (const role of ['project_manager', 'finance_admin', 'owner_admin'] as const)
      expect(() => workerStatementGet(event(role, 'worker', 'csv'))).toThrowError();

    const response = workerStatementGet(
      event(
        'worker',
        'worker',
        'csv',
        'periodStart=2026-08-01&periodEnd=2026-08-31&workerId=other-worker',
      ),
    ) as Response;
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain(
      'ja-worker-statement-worker-2026-08-01-2026-08-31.csv',
    );
    const body = await response.text();
    expect(body).toContain('OWN-WORKER-VENDOR');
    expect(body).toContain('OWN-WORKER-ACTIVITY');
    expect(body).toContain('2026-09-05');
    expect(body).not.toContain('OTHER-WORKER-SECRET');
    expect(body).not.toContain('2026-09-20');
    expect(body).not.toContain('99999');
    const database = createDatabase();
    const audit = database.sqlite
      .prepare(
        "SELECT entity_type,entity_id,details_json FROM audit_event WHERE action='artifact.access' ORDER BY occurred_at DESC LIMIT 1",
      )
      .get() as { entity_type: string; entity_id: string; details_json: string };
    expect(audit.entity_type).toBe('document');
    expect(audit.entity_id).toContain('worker-statement:worker:');
    expect(audit.details_json).not.toContain('other-worker');
    database.sqlite.close();
  });

  it('allows Finance and Owner ledger exports while denying PM, worker and anonymous users', () => {
    for (const role of [null, 'project_manager', 'worker'] as const)
      expect(() => invoiceLedgerGet(event(role, 'ledger', 'csv'))).toThrowError();
    for (const role of ['finance_admin', 'owner_admin'] as const) {
      const response = invoiceLedgerGet(event(role, 'ledger', 'xlsx')) as Response;
      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toContain(
        'ja-invoice-collection-ledger-2026-08-01-2026-08-31.xlsx',
      );
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
  });

  it('rejects missing, duplicated, impossible and reversed periods before export', () => {
    for (const query of [
      'periodStart=2026-08-01',
      'periodStart=2026-08-01&periodStart=2026-08-02&periodEnd=2026-08-31',
      'periodStart=2026-02-30&periodEnd=2026-03-01',
      'periodStart=2026-09-01&periodEnd=2026-08-31',
    ])
      expect(() => invoiceLedgerGet(event('finance_admin', 'ledger', 'csv', query))).toThrowError();
  });
});
