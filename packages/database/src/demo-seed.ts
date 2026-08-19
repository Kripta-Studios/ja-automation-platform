import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { newId, type Principal, type Role } from '@ja/domain';
import { createDatabase, PortalRepository } from './index.ts';

const path = process.env.JA_DATABASE_PATH ?? resolve(process.cwd(), 'data/demo.db');
if (existsSync(path) && process.env.JA_DEMO_SEED_PRESERVE_DB !== 'true') rmSync(path);
mkdirSync(dirname(path), { recursive: true });
const { sqlite } = createDatabase(path);
const repository = new PortalRepository(sqlite);
const timestamp = '2026-08-18T12:00:00.000Z';

const users = [
  ['admin', 'Antonny Nascimento', 'owner@demo.jaautomation.local', 'owner_admin'],
  ['finance', 'Elena Costa', 'finance@demo.jaautomation.local', 'finance_admin'],
  ['manager', 'Daniel Brooks', 'pm@demo.jaautomation.local', 'project_manager'],
  ['worker', 'Alex Rivera', 'worker@demo.jaautomation.local', 'worker'],
  ['worker2', 'Rafael Santos', 'rafael@demo.jaautomation.local', 'worker'],
  ['worker3', 'Maya Chen', 'maya@demo.jaautomation.local', 'worker'],
] as const;
const userIds = new Map<string, string>();
for (const [key, name, email, role] of users) {
  const id = newId();
  userIds.set(key, id);
  sqlite
    .prepare(
      "INSERT INTO user(id,name,email,email_verified,role,status,mfa_enrolled,created_at,updated_at) VALUES(?,?,?,1,?,'active',0,?,?)",
    )
    .run(id, name, email, role, timestamp, timestamp);
}
const principal = (key: string, role: Role, projectIds: string[] = []): Principal => ({
  userId: userIds.get(key)!,
  role,
  projectIds: new Set(projectIds),
});
const owner = principal('admin', 'owner_admin');
const finance = principal('finance', 'finance_admin');

const automotive = repository.createClient(owner, {
  legalName: 'Northline Mobility (Demo)',
  displayName: 'Northline Mobility · Demo',
  currency: 'USD',
  timezone: 'America/Detroit',
  billingEmail: 'ap@northline.demo',
});
const packaging = repository.createClient(owner, {
  legalName: 'Harbor Packaging Group (Demo)',
  displayName: 'Harbor Packaging · Demo',
  currency: 'USD',
  timezone: 'America/New_York',
  billingEmail: 'billing@harbor.demo',
});
const processClient = repository.createClient(owner, {
  legalName: 'BlueRiver Process Systems (Demo)',
  displayName: 'BlueRiver Process · Demo',
  currency: 'USD',
  timezone: 'America/Chicago',
  billingEmail: 'finance@blueriver.demo',
});
const line = repository.createProject(owner, {
  clientId: automotive.id,
  name: 'Body Shop Line 4 Controls Upgrade · Demo',
  timezone: 'America/Detroit',
  currency: 'USD',
  billingModel: 'tm_daily_minimum',
  siteName: 'Detroit Assembly Campus · Demo',
  country: 'US',
  expectedMinutesPerDay: 600,
  clientDailyMinimumMinutes: 600,
  poNumber: 'DEMO-PO-24017',
});
const palletizer = repository.createProject(owner, {
  clientId: packaging.id,
  name: 'High-Speed Palletizer Commissioning · Demo',
  timezone: 'America/New_York',
  currency: 'USD',
  billingModel: 'all_in',
  siteName: 'Newark Packaging Plant · Demo',
  country: 'US',
  expectedMinutesPerDay: 600,
  poNumber: 'DEMO-PO-11804',
});
const recovery = repository.createProject(owner, {
  clientId: processClient.id,
  name: 'Caustic Recovery Skid Integration · Demo',
  timezone: 'America/Chicago',
  currency: 'USD',
  billingModel: 'tm',
  siteName: 'Lake County Process Plant · Demo',
  country: 'US',
  expectedMinutesPerDay: 600,
  poNumber: 'DEMO-PO-8842',
});
const support = repository.createProject(owner, {
  clientId: automotive.id,
  name: 'Remote Controls Support Retainer · Demo',
  timezone: 'America/Detroit',
  currency: 'USD',
  billingModel: 'capped_tm',
  siteName: 'Remote / Detroit · Demo',
  country: 'US',
  expectedMinutesPerDay: 480,
  poNumber: 'DEMO-PO-24022',
});
for (const [id, budget, minutes] of [
  [line.id, 18500000, 72000],
  [palletizer.id, 9200000, 36000],
  [recovery.id, 14200000, 48000],
  [support.id, 4800000, 18000],
] as const)
  sqlite
    .prepare('UPDATE project SET budget_minor=?,planned_minutes=? WHERE id=?')
    .run(budget, minutes, id);

const assignments = [
  [line.id, 'manager', true],
  [line.id, 'worker', false],
  [line.id, 'worker2', false],
  [palletizer.id, 'manager', true],
  [palletizer.id, 'worker2', false],
  [palletizer.id, 'worker3', false],
  [recovery.id, 'manager', true],
  [recovery.id, 'worker', false],
  [recovery.id, 'worker3', false],
  [support.id, 'worker', false],
] as const;
for (const [projectId, key, canReview] of assignments)
  repository.assignWorker(owner, {
    projectId,
    workerId: userIds.get(key)!,
    startsOn: '2026-07-01',
    plannedMinutes: projectId === line.id ? 24000 : 12000,
    canReview,
  });
const projectIdsByUser = (key: string) =>
  assignments.filter((row) => row[1] === key).map((row) => row[0]);
const worker = principal('worker', 'worker', projectIdsByUser('worker'));
const worker2 = principal('worker2', 'worker', projectIdsByUser('worker2'));
const worker3 = principal('worker3', 'worker', projectIdsByUser('worker3'));
const manager = principal('manager', 'project_manager', projectIdsByUser('manager'));

for (const [key, rate] of [
  ['worker', 4200n],
  ['worker2', 4500n],
  ['worker3', 4800n],
] as const) {
  repository.createCompensationRule(finance, {
    workerId: userIds.get(key)!,
    currency: 'USD',
    rateMinor: rate,
    rateBasis: 'hourly',
    effectiveFrom: '2026-01-01',
  });
  repository.createInternalCostRule(finance, {
    workerId: userIds.get(key)!,
    currency: 'USD',
    hourlyRateMinor: rate + 1800n,
    effectiveFrom: '2026-01-01',
  });
}
for (const projectId of [line.id, palletizer.id, recovery.id, support.id])
  repository.createClientLaborRate(finance, {
    projectId,
    currency: 'USD',
    hourlyRateMinor: projectId === recovery.id ? 16500n : 15000n,
    effectiveFrom: '2026-01-01',
  });
const addApprovedTime = (
  actor: Principal,
  projectId: string,
  workDate: string,
  category: string,
  minutes: number,
  summary: string,
) => {
  const record = repository.createTimeEntry(actor, {
    projectId,
    workDate,
    category,
    minutes,
    summary,
  });
  repository.submitTime(actor, record.id, record.version);
  repository.operationalApproveTime(owner, record.id, 'approved');
  repository.financeApproveTime(finance, record.id, category !== 'training');
};
addApprovedTime(
  worker,
  line.id,
  '2026-08-11',
  'commissioning',
  540,
  'Validated conveyor zone handshakes and station permissives.',
);
addApprovedTime(
  worker,
  line.id,
  '2026-08-11',
  'standby',
  60,
  'Waited for production clearance before live-cycle test.',
);
addApprovedTime(
  worker2,
  line.id,
  '2026-08-11',
  'regular',
  600,
  'Re-terminated remote I/O panel and completed point-to-point checks.',
);
addApprovedTime(
  worker,
  line.id,
  '2026-08-12',
  'overtime',
  120,
  'Supported second-shift restart after controls validation.',
);
addApprovedTime(
  worker2,
  palletizer.id,
  '2026-08-12',
  'commissioning',
  570,
  'Tuned pallet pattern sequence and verified layer transition timing.',
);
addApprovedTime(
  worker3,
  palletizer.id,
  '2026-08-12',
  'travel',
  180,
  'Travel from airport to commissioning site.',
);
addApprovedTime(
  worker,
  recovery.id,
  '2026-08-13',
  'regular',
  600,
  'Mapped skid signals and tested permissive exchange with the plant PLC.',
);
addApprovedTime(
  worker3,
  recovery.id,
  '2026-08-13',
  'commissioning',
  480,
  'Verified pump rotation, analog scaling and alarm propagation.',
);
const pending = repository.createTimeEntry(worker, {
  projectId: line.id,
  workDate: '2026-08-18',
  category: 'regular',
  minutes: 420,
  summary: 'Checked Line 4 startup sequence and cleared two sensor timing faults.',
});
repository.submitTime(worker, pending.id, pending.version);

const daily = repository.createDailyReport(worker, {
  projectId: line.id,
  workDate: '2026-08-11',
  siteShift: 'Body shop · first shift',
  summary: 'Line 4 controls validation continued through automatic cycle.',
  tasksCompleted: 'Verified zone handshakes, station permissives and fault recovery.',
  problemsFound: 'Robot cell clear signal arrived after conveyor release request.',
  correctiveActions: 'Added a bounded wait state and operator diagnostic message.',
  clientDecisions: 'Controls lead approved a live test during the lunch window.',
  downtimeMinutes: 60,
  standbyReason: 'Production clearance',
  blockers: '',
  openItems: 'Observe three full production cycles.',
  nextDayPlan: 'Validate second-shift restart and capture final backups.',
  safetyRelated: false,
  customerContact: 'Demo plant controls lead',
});
repository.submitReport(worker, 'daily', daily.id, daily.version);
repository.reviewReport(manager, 'daily', daily.id, 'approved');
const pendingDaily = repository.createDailyReport(worker, {
  projectId: line.id,
  workDate: '2026-08-18',
  siteShift: 'Body shop · first shift',
  summary: 'Startup support and sensor timing investigation.',
  tasksCompleted: 'Cleared timing faults and documented affected devices.',
  problemsFound: 'Two prox sensors showed inconsistent transition timing.',
  correctiveActions: 'Adjusted debounce parameters within the approved range.',
  clientDecisions: '',
  downtimeMinutes: 0,
  blockers: '',
  openItems: 'Monitor through afternoon production.',
  nextDayPlan: 'Close issue after trend review.',
  safetyRelated: false,
});
repository.submitReport(worker, 'daily', pendingDaily.id, pendingDaily.version);
const plc = repository.createTechnicalReport(worker, {
  projectId: line.id,
  systemName: 'Line 4 Main Conveyor',
  plantSite: 'Detroit Assembly Campus · Demo',
  areaLine: 'Body Shop / Line 4',
  stationMachine: 'Transfer Zone TZ-240',
  systemType: 'Conveyor controls',
  plcPlatform: 'Rockwell Automation',
  controller: 'ControlLogix 5580',
  hmiScada: 'FactoryTalk View SE',
  networkProtocol: 'EtherNet/IP',
  softwareVersion: 'Studio 5000 v35',
  programReference: 'L4_MAIN_DEMO_2026-08-11',
  changeSummary:
    'Corrected the sequence race between robot-cell-clear confirmation and conveyor zone release. Added a bounded wait state, diagnostic alarm and reset path.',
  safetyRelated: false,
  productionImpact: 'Removed intermittent startup hold without bypassing interlocks.',
  validation: 'Dry-cycle test, forced-fault recovery test and three automatic production cycles.',
  validationResult: 'All tests passed. No unresolved sequence faults.',
  openRisk: 'Monitor input timing after planned sensor replacement.',
  rollbackPlan: 'Restore prior routine revision from the registered pre-change backup.',
});
repository.submitReport(worker, 'technical', plc.id, plc.version);
repository.reviewReport(manager, 'technical', plc.id, 'approved');

const receipt = (ownerId: string, projectId: string, filename: string) => {
  const id = newId();
  const sha = createHash('sha256').update(id).digest('hex');
  sqlite
    .prepare(
      "INSERT INTO document(id,project_id,owner_id,sha256,media_type,byte_length,state,storage_key,original_filename,description,sensitive,artifact_type,created_at,updated_at) VALUES(?,?,?,?,?,?,'committed',?,?,?,?,?,?,?)",
    )
    .run(
      id,
      projectId,
      ownerId,
      sha,
      'image/jpeg',
      184320,
      `demo/${id}`,
      filename,
      'Synthetic receipt metadata for the test-only demo',
      0,
      'receipt',
      timestamp,
      timestamp,
    );
  return id;
};
const addExpense = (
  actor: Principal,
  projectId: string,
  input: {
    spentOn: string;
    vendor: string;
    category: 'hotel' | 'rental_car' | 'fuel';
    amount: bigint;
    treatment: 'all_in' | 'reimbursable';
    description: string;
  },
) => {
  const documentId = receipt(actor.userId, projectId, `${input.category}-demo-receipt.jpg`);
  const record = repository.createExpense(actor, {
    projectId,
    spentOn: input.spentOn,
    vendor: input.vendor,
    category: input.category,
    description: input.description,
    currency: 'USD',
    amountMinor: input.amount,
    whoPaid: 'worker',
    clientTreatment: input.treatment,
    receiptRequired: true,
    receiptDocumentId: documentId,
  });
  repository.submitExpense(actor, record.id, record.version);
  repository.operationalApproveExpense(owner, record.id, 'approved');
  repository.financeApproveExpense(finance, record.id);
};
addExpense(worker, line.id, {
  spentOn: '2026-08-11',
  vendor: 'Demo Airport Hotel',
  category: 'hotel',
  amount: 18900n,
  treatment: 'reimbursable',
  description: 'One project night, synthetic demo expense.',
});
addExpense(worker2, line.id, {
  spentOn: '2026-08-11',
  vendor: 'Demo Mobility Rentals',
  category: 'rental_car',
  amount: 9600n,
  treatment: 'reimbursable',
  description: 'Two-day site rental, synthetic demo expense.',
});
addExpense(worker2, palletizer.id, {
  spentOn: '2026-08-12',
  vendor: 'Demo Fuel Stop',
  category: 'fuel',
  amount: 5800n,
  treatment: 'all_in',
  description: 'Commissioning travel fuel included in the all-in project.',
});
repository.createPlanningAssignment(owner, {
  projectId: line.id,
  workerId: worker.userId,
  startsAt: '2026-08-18T12:00:00.000Z',
  endsAt: '2026-08-18T22:00:00.000Z',
  plannedMinutes: 600,
  site: 'Detroit Assembly Campus · Demo',
  requiredSkill: 'ControlLogix commissioning',
});
repository.createPlanningAssignment(owner, {
  projectId: line.id,
  workerId: worker2.userId,
  startsAt: '2026-08-19T12:00:00.000Z',
  endsAt: '2026-08-19T22:00:00.000Z',
  plannedMinutes: 600,
  site: 'Detroit Assembly Campus · Demo',
  requiredSkill: 'Industrial networks',
});

const entity = repository.createLegalEntity(owner, {
  code: 'DEMO',
  legalName: 'J&A Automation · Demonstration Invoice',
  currency: 'USD',
  billingAddress: 'Demonstration record · not for payment',
  companyIdentifiers: 'TEST DEMO',
});
repository.createInvoiceNumberPolicy(owner, {
  legalEntityId: entity.id,
  prefix: 'DEMO-',
  digits: 5,
  effectiveFrom: '2026-01-01',
  accountantApprovedAt: timestamp,
});
const laborTax = repository.createTaxProfile(finance, {
  name: 'Demo labor tax profile · 5%',
  currency: 'USD',
  effectiveFrom: '2026-01-01',
  components: [{ name: 'Configured demo tax', basisPoints: 500 }],
});
const expenseTax = repository.createTaxProfile(finance, {
  name: 'Demo expense tax profile · 8%',
  currency: 'USD',
  effectiveFrom: '2026-01-01',
  components: [{ name: 'Configured demo tax', basisPoints: 800 }],
});
const laborRule = repository.createBillingRule(finance, {
  projectId: line.id,
  legalEntityId: entity.id,
  streamType: 'labor',
  cadenceType: 'weekly',
  taxProfileId: laborTax.id,
  currency: 'USD',
  effectiveFrom: '2026-01-01',
});
const expenseRule = repository.createBillingRule(finance, {
  projectId: line.id,
  legalEntityId: entity.id,
  streamType: 'expense',
  cadenceType: 'monthly',
  taxProfileId: expenseTax.id,
  currency: 'USD',
  effectiveFrom: '2026-01-01',
});
const laborInvoice = repository.createInvoiceDraft(
  finance,
  laborRule.id,
  '2026-08-10',
  '2026-08-16',
);
const expenseInvoice = repository.createInvoiceDraft(
  finance,
  expenseRule.id,
  '2026-08-01',
  '2026-08-31',
);
sqlite
  .prepare(
    'INSERT OR IGNORE INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)',
  )
  .run(newId(), worker.userId, 'assignment_published', line.id, timestamp);
sqlite
  .prepare(
    'INSERT OR IGNORE INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)',
  )
  .run(newId(), owner.userId, 'report_submitted', pendingDaily.id, timestamp);
sqlite.close();
console.log(
  JSON.stringify(
    {
      database: path,
      demoUsers: Object.fromEntries(users.map(([key, , email]) => [key, email])),
      projects: [line.id, palletizer.id, recovery.id, support.id],
      invoiceDrafts: [laborInvoice.id, expenseInvoice.id],
    },
    null,
    2,
  ),
);
