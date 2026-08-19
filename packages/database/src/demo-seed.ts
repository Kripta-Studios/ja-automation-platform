import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { newId, type Principal, type Role } from '@ja/domain';
import { createDatabase, PortalRepository, V3Repository } from './index.ts';

const path = process.env.JA_DATABASE_PATH ?? resolve(process.cwd(), 'data/demo.db');
if (existsSync(path) && process.env.JA_DEMO_SEED_PRESERVE_DB !== 'true') rmSync(path);
mkdirSync(dirname(path), { recursive: true });
const { sqlite } = createDatabase(path);
const repository = new PortalRepository(sqlite);
const v3 = new V3Repository(sqlite);
const timestamp = '2026-08-18T12:00:00.000Z';
const ownerAdminEmail = 'antonny.luty@j-aautomation.com';
const configuredDocumentRoot = process.env.JA_DOCUMENT_ROOT;
const demoDocumentRoot = resolve(
  configuredDocumentRoot ?? resolve(process.cwd(), 'data/documents'),
);
if (
  process.env.JA_DEMO_SEED_PRESERVE_DB !== 'true' &&
  (!configuredDocumentRoot || process.env.JA_FIXTURE_RESET_DOCUMENTS === 'true') &&
  existsSync(demoDocumentRoot)
)
  rmSync(demoDocumentRoot, { recursive: true, force: true });
for (const directory of [
  'receipts',
  'reports',
  'invoices',
  'technical',
  'plc-backups',
  'exports',
  'temp',
])
  mkdirSync(resolve(demoDocumentRoot, directory), { recursive: true });

const pdfEscape = (value: string): string => value.replace(/[\\()]/g, '\\$&');
const syntheticPdf = (title: string, lines: readonly string[]): Buffer => {
  const body = [
    'BT',
    '/F1 16 Tf',
    '50 790 Td',
    `(${pdfEscape(title)}) Tj`,
    '/F1 10 Tf',
    ...lines.flatMap((line) => ['0 -18 Td', `(${pdfEscape(line)}) Tj`]),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(body, 'utf8')} >>\nstream\n${body}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const header = Buffer.from('%PDF-1.4\n', 'utf8');
  const chunks: Buffer[] = [header];
  const offsets = [0];
  let offset = header.byteLength;
  for (const [index, object] of objects.entries()) {
    offsets.push(offset);
    const chunk = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, 'utf8');
    chunks.push(chunk);
    offset += chunk.byteLength;
  }
  const xrefOffset = offset;
  chunks.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((value) => `${String(value).padStart(10, '0')} 00000 n `)
        .join(
          '\n',
        )}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
      'utf8',
    ),
  );
  return Buffer.concat(chunks);
};

const users = [
  ['admin', 'Antonny Nascimento', ownerAdminEmail, 'owner_admin'],
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
repository.createClientContact(owner, {
  clientId: automotive.id,
  name: 'Morgan Lee',
  email: 'morgan.lee@northline.demo',
  phone: '+1 555 010 2401',
  role: 'Controls Program Lead',
  isPrimary: true,
});
repository.createClientContact(owner, {
  clientId: automotive.id,
  name: 'Taylor Brooks',
  email: 'ap@northline.demo',
  role: 'Accounts Payable',
  isBillingContact: true,
});
repository.createClientContact(owner, {
  clientId: packaging.id,
  name: 'Priya Shah',
  email: 'priya.shah@harbor.demo',
  phone: '+1 555 010 1180',
  role: 'Plant Engineering Manager',
  isPrimary: true,
});
repository.createClientContact(owner, {
  clientId: packaging.id,
  name: 'Sam Wilson',
  email: 'billing@harbor.demo',
  role: 'Billing Contact',
  isBillingContact: true,
});
repository.createClientContact(owner, {
  clientId: processClient.id,
  name: 'Camila Ferreira',
  email: 'camila.ferreira@blueriver.demo',
  phone: '+1 555 010 8842',
  role: 'Process Automation Lead',
  isPrimary: true,
});
repository.createClientContact(owner, {
  clientId: processClient.id,
  name: 'Jordan Kim',
  email: 'finance@blueriver.demo',
  role: 'Finance Contact',
  isBillingContact: true,
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
for (const [projectId, timezone] of [
  [line.id, 'America/Detroit'],
  [palletizer.id, 'America/New_York'],
  [recovery.id, 'America/Chicago'],
  [support.id, 'America/Detroit'],
] as const)
  repository.updateProjectSchedule(owner, {
    projectId,
    timezone,
    mondayMinutes: 600,
    tuesdayMinutes: 600,
    wednesdayMinutes: 600,
    thursdayMinutes: 600,
    fridayMinutes: 600,
    saturdayMinutes: 600,
    sundayMinutes: 0,
    effectiveFrom: '2026-07-01',
  });

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

const skills = [
  ['PLC-COMM', 'PLC commissioning'],
  ['IND-NET', 'Industrial networks'],
  ['ROBOT-SAFE', 'Robotics safety'],
  ['HMI-SCADA', 'HMI and SCADA'],
  ['ELEC-DESIGN', 'Electrical controls design'],
] as const;
const skillIds = new Map<string, string>();
for (const [code, name] of skills)
  skillIds.set(code, repository.createSkill(owner, { code, name }).id);
for (const [workerKey, skillCode, proficiency] of [
  ['worker', 'PLC-COMM', 5],
  ['worker', 'IND-NET', 4],
  ['worker2', 'IND-NET', 5],
  ['worker2', 'ELEC-DESIGN', 4],
  ['worker3', 'ROBOT-SAFE', 5],
  ['worker3', 'HMI-SCADA', 4],
] as const)
  repository.setWorkerSkill(owner, {
    workerId: userIds.get(workerKey)!,
    skillId: skillIds.get(skillCode)!,
    proficiency,
  });
repository.setWorkerAvailability(owner, {
  workerId: worker.userId,
  startsAt: '2026-08-18T00:00:00.000Z',
  endsAt: '2026-08-23T23:59:00.000Z',
  availability: 'available',
  note: 'Available for commissioning and remote support.',
});
repository.setWorkerAvailability(owner, {
  workerId: worker2.userId,
  startsAt: '2026-08-18T00:00:00.000Z',
  endsAt: '2026-08-20T23:59:00.000Z',
  availability: 'tentative',
  note: 'Tentative while the Newark handover is confirmed.',
});
repository.setWorkerAvailability(owner, {
  workerId: worker3.userId,
  startsAt: '2026-08-21T00:00:00.000Z',
  endsAt: '2026-08-23T23:59:00.000Z',
  availability: 'unavailable',
  note: 'Planned personal leave; synthetic showcase record.',
});

for (const [key, rate] of [
  ['worker', 4200n],
  ['worker2', 4500n],
  ['worker3', 4800n],
] as const) {
  v3.createCompensationRule(finance, {
    workerId: userIds.get(key)!,
    currency: 'USD',
    rateMinor: rate,
    rateBasis: 'hourly',
    ruleType: 'Hourly',
    overtimeMethod: 'BASE_RATE_MULTIPLIER',
    overtimeMultiplierBps: 15000,
    travelMethod: 'BASE',
    standbyMethod: 'BASE',
    effectiveFrom: '2026-01-01',
    notes: 'Synthetic showcase hourly compensation rule.',
  });
  v3.createInternalCostRule(finance, {
    workerId: userIds.get(key)!,
    currency: 'USD',
    hourlyRateMinor: rate + 1800n,
    effectiveFrom: '2026-01-01',
    overtimeMethod: 'BASE_RATE_MULTIPLIER',
    overtimeMultiplierBps: 12500,
    notes: 'Synthetic loaded internal cost rule.',
  });
}
for (const projectId of [line.id, palletizer.id, recovery.id, support.id])
  v3.createClientLaborRate(finance, {
    projectId,
    currency: 'USD',
    hourlyRateMinor: projectId === recovery.id ? 16500n : 15000n,
    effectiveFrom: '2026-01-01',
    overtimeMethod: 'BASE_RATE_MULTIPLIER',
    overtimeMultiplierBps: 15000,
    notes: 'Synthetic client billing rate for showcase data.',
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

// Current-week showcase data makes the weekly timesheet legible: approved days,
// a submitted day with a shortfall, and category-level context instead of one
// isolated placeholder row.
addApprovedTime(
  worker,
  line.id,
  '2026-08-17',
  'regular',
  480,
  'Completed planned Line 4 startup checks and operator handover.',
);
addApprovedTime(
  worker,
  line.id,
  '2026-08-17',
  'standby',
  120,
  'Waited for production clearance before the live-cycle window.',
);
const submittedStandby = repository.createTimeEntry(worker, {
  projectId: line.id,
  workDate: '2026-08-18',
  category: 'standby',
  minutes: 120,
  summary: 'Held for a customer production window after sensor timing checks.',
});
repository.submitTime(worker, submittedStandby.id, submittedStandby.version);
addApprovedTime(
  worker,
  line.id,
  '2026-08-19',
  'commissioning',
  480,
  'Validated restart sequence and confirmed interlock recovery.',
);
addApprovedTime(
  worker,
  line.id,
  '2026-08-19',
  'remote_support',
  120,
  'Remote support for the evening shift diagnostic review.',
);
addApprovedTime(
  worker,
  line.id,
  '2026-08-20',
  'regular',
  600,
  'Completed production observation and closed the remaining startup notes.',
);
addApprovedTime(
  worker,
  line.id,
  '2026-08-21',
  'regular',
  480,
  'Completed final point-to-point checks and signed the handover checklist.',
);
addApprovedTime(
  worker,
  line.id,
  '2026-08-21',
  'travel',
  120,
  'Travel between the controls office and the customer line.',
);
addApprovedTime(
  worker,
  line.id,
  '2026-08-22',
  'commissioning',
  540,
  'Saturday commissioning window for final sequence validation.',
);
addApprovedTime(
  worker,
  line.id,
  '2026-08-22',
  'standby',
  60,
  'Held for the production restart confirmation.',
);

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
repository.updateDailyReport(worker, {
  projectId: line.id,
  workDate: '2026-08-18',
  siteShift: 'Body shop · first shift',
  summary: 'Startup support, sensor timing investigation and customer handover notes.',
  tasksCompleted: 'Cleared timing faults and documented affected devices.',
  problemsFound: 'Two prox sensors showed inconsistent transition timing.',
  correctiveActions: 'Adjusted debounce parameters within the approved range.',
  clientDecisions: '',
  downtimeMinutes: 0,
  standbyReason: '',
  blockers: '',
  openItems: 'Monitor through afternoon production.',
  nextDayPlan: 'Close issue after trend review.',
  safetyRelated: false,
  customerContact: '',
  id: pendingDaily.id,
  version: pendingDaily.version + 1,
});
const submittedDaily = repository.createDailyReport(worker2, {
  projectId: palletizer.id,
  workDate: '2026-08-19',
  siteShift: 'Commissioning bay · second shift',
  summary: 'Palletizer layer transition review submitted for project approval.',
  tasksCompleted: 'Verified layer timing, guard signals and restart behavior.',
  problemsFound: 'No blocking issues found during the planned validation run.',
  correctiveActions: 'Recorded an observation for the next maintenance window.',
  clientDecisions: 'Customer requested the observation remain open until handover.',
  downtimeMinutes: 0,
  blockers: '',
  openItems: 'Confirm maintenance window date.',
  nextDayPlan: 'Review handover checklist with the plant lead.',
  safetyRelated: false,
});
repository.submitReport(worker2, 'daily', submittedDaily.id, submittedDaily.version);
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

const approvedTechnicalChange = v3.createTechnicalChange(worker, {
  projectId: line.id,
  technicalReportId: plc.id,
  component: 'Line 4 conveyor release routine',
  originalBehavior: 'The release request could arrive before the robot-cell-clear confirmation.',
  rootCause: 'Asynchronous input timing was not bounded by the sequence step.',
  changeMade: 'Added a bounded wait state, diagnostic alarm and operator reset path.',
  reason: 'Remove the intermittent startup hold while preserving the existing interlocks.',
  safetyImpact: false,
  productionImpact: 'Improves automatic restart reliability without bypassing safety logic.',
  validation: 'Dry-cycle test, forced-fault recovery test and three automatic production cycles.',
  validationResult: 'All tests passed; no unresolved sequence faults.',
  openRisk: 'Monitor input timing after the planned sensor replacement.',
  rollbackInformation: 'Restore the registered pre-change backup and revert the routine revision.',
});
v3.submitTechnicalChange(worker, approvedTechnicalChange.id, approvedTechnicalChange.version);
v3.reviewTechnicalChange(manager, approvedTechnicalChange.id, 'approved');
const submittedTechnicalChange = v3.createTechnicalChange(worker2, {
  projectId: palletizer.id,
  component: 'Palletizer layer transition timer',
  originalBehavior: 'Layer transition pauses when the downstream pallet-present sensor is noisy.',
  rootCause: 'The debounce window is shorter than the observed sensor settling time.',
  changeMade: 'Prepared a parameter adjustment and added a diagnostic counter for review.',
  reason: 'Reduce nuisance pauses during the handover test.',
  safetyImpact: false,
  productionImpact: 'Pending validation during the next controlled production window.',
  validation: 'Pending controlled production-cycle validation.',
  validationResult: 'Not yet executed; change remains in review queue.',
  openRisk: 'Do not release until the plant engineering lead confirms the test window.',
  rollbackInformation: 'Restore the current timer parameter from the commissioning backup.',
});
v3.submitTechnicalChange(worker2, submittedTechnicalChange.id, submittedTechnicalChange.version);

const approvedMilestone = repository.createProjectMilestone(owner, {
  projectId: line.id,
  name: 'Controls validation package',
  description: 'Approved functional validation and production-cycle evidence package.',
  amountMinor: 480000n,
  dueOn: '2026-08-15',
});
repository.submitProjectMilestone(owner, approvedMilestone.id, approvedMilestone.version);
repository.reviewProjectMilestone(finance, approvedMilestone.id, 'approved');
const submittedMilestone = repository.createProjectMilestone(owner, {
  projectId: palletizer.id,
  name: 'Production handover and operator training',
  description: 'Handover checklist and operator walkthrough awaiting client sign-off.',
  amountMinor: 325000n,
  dueOn: '2026-08-20',
});
repository.submitProjectMilestone(owner, submittedMilestone.id, submittedMilestone.version);

const receipt = (
  actor: Principal,
  projectId: string,
  filename: string,
  title: string,
  lines: readonly string[],
) => {
  const bytes = syntheticPdf(title, lines);
  const id = newId();
  const storageKey = `receipts/${id}.pdf`;
  writeFileSync(resolve(demoDocumentRoot, storageKey), bytes, { flag: 'wx' });
  const registered = repository.registerReceipt(actor, {
    projectId,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    mediaType: 'application/pdf',
    byteLength: bytes.byteLength,
    storageKey,
    originalFilename: filename,
  });
  sqlite
    .prepare(
      "UPDATE document SET description=?,scan_status='clean',scanned_at=?,scan_provider=? WHERE id=?",
    )
    .run(`Synthetic showcase document: ${title}`, timestamp, 'demo-seed', registered.id);
  return registered.id;
};
const addExpense = (
  actor: Principal,
  projectId: string,
  input: {
    spentOn: string;
    vendor: string;
    category:
      | 'hotel'
      | 'rental_car'
      | 'fuel'
      | 'airfare'
      | 'ground_transport'
      | 'meals'
      | 'per_diem'
      | 'materials'
      | 'tools'
      | 'tolls'
      | 'parking';
    amount: bigint;
    treatment: 'all_in' | 'reimbursable';
    billingTreatment?:
      | 'reimbursable_at_cost'
      | 'reimbursable_plus_markup'
      | 'all_in'
      | 'allowance_per_diem';
    markupBps?: number;
    paymentMethod?: string;
    description: string;
  },
) => {
  const filename =
    input.category === 'airfare'
      ? 'airfare-ticket-demo.pdf'
      : input.category === 'hotel'
        ? 'hotel-folio-demo.pdf'
        : input.category === 'rental_car'
          ? 'rental-car-invoice-demo.pdf'
          : `${input.category}-demo-receipt.pdf`;
  const documentId = receipt(actor, projectId, filename, `${input.vendor} receipt`, [
    `Date: ${input.spentOn}`,
    `Category: ${input.category}`,
    `Amount: USD ${(Number(input.amount) / 100).toFixed(2)}`,
    'Synthetic showcase document; not for payment.',
  ]);
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
    billingTreatment:
      input.billingTreatment ?? (input.treatment === 'all_in' ? 'all_in' : 'reimbursable_at_cost'),
    markupBps: input.markupBps,
    paymentMethod: input.paymentMethod ?? 'Demo corporate card',
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
addExpense(worker3, palletizer.id, {
  spentOn: '2026-08-12',
  vendor: 'Demo Atlantic Airways',
  category: 'airfare',
  amount: 72000n,
  treatment: 'reimbursable',
  paymentMethod: 'Company travel card',
  description: 'Round-trip commissioning ticket with synthetic boarding-pass evidence.',
});
addExpense(worker3, palletizer.id, {
  spentOn: '2026-08-12',
  vendor: 'Demo City Hotel',
  category: 'hotel',
  amount: 21000n,
  treatment: 'reimbursable',
  paymentMethod: 'Company travel card',
  description: 'Commissioning hotel bill with synthetic folio evidence.',
});
addExpense(worker3, palletizer.id, {
  spentOn: '2026-08-13',
  vendor: 'Demo Rail and Taxi',
  category: 'ground_transport',
  amount: 6200n,
  treatment: 'reimbursable',
  description: 'Airport-to-site rail and taxi transfers.',
});
addExpense(worker2, palletizer.id, {
  spentOn: '2026-08-13',
  vendor: 'Demo Plant Meals',
  category: 'meals',
  amount: 4800n,
  treatment: 'reimbursable',
  description: 'Commissioning meal receipts within the approved travel policy.',
});
addExpense(worker2, palletizer.id, {
  spentOn: '2026-08-14',
  vendor: 'Demo Daily Allowance',
  category: 'per_diem',
  amount: 8500n,
  treatment: 'reimbursable',
  billingTreatment: 'allowance_per_diem',
  description: 'Approved daily allowance for the Newark commissioning window.',
});
addExpense(worker, line.id, {
  spentOn: '2026-08-12',
  vendor: 'Demo Calibration Supplies',
  category: 'materials',
  amount: 35000n,
  treatment: 'all_in',
  description: 'Calibration leads and labelled terminal stock included in the project cost.',
});
addExpense(worker, recovery.id, {
  spentOn: '2026-08-13',
  vendor: 'Demo Process Tools',
  category: 'tools',
  amount: 16500n,
  treatment: 'reimbursable',
  billingTreatment: 'reimbursable_plus_markup',
  markupBps: 1000,
  description: 'Temporary commissioning tool hire with configured 10% reimbursement markup.',
});
addExpense(worker, recovery.id, {
  spentOn: '2026-08-13',
  vendor: 'Demo Plant Parking and Tolls',
  category: 'tolls',
  amount: 3200n,
  treatment: 'reimbursable',
  description: 'Site access tolls and parking charge.',
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
const milestoneRule = repository.createBillingRule(finance, {
  projectId: line.id,
  legalEntityId: entity.id,
  streamType: 'milestone',
  cadenceType: 'milestone',
  taxProfileId: laborTax.id,
  currency: 'USD',
  effectiveFrom: '2026-01-01',
  recipientEmail: 'ap@northline.demo',
  poNumberOverride: 'DEMO-PO-24017-M',
});
const milestoneInvoice = repository.createInvoiceDraft(
  finance,
  milestoneRule.id,
  '2026-08-01',
  '2026-08-31',
);

const closedLaborPeriod = v3.closeBillingPeriod(
  finance,
  laborRule.id,
  '2026-08-10',
  '2026-08-16',
  'en',
);
const closedExpensePeriod = v3.closeBillingPeriod(
  finance,
  expenseRule.id,
  '2026-08-01',
  '2026-08-31',
  'en',
);
const periodReports = v3.refreshPeriodReports(finance, {
  projectId: line.id,
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  reportLocale: 'en',
});
const accountingPack = v3.createAccountingPack(finance, '2026-08-01', '2026-08-31', 'en');
const closeout = repository.createProjectCloseout(owner, line.id);
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
console.log(
  JSON.stringify(
    {
      database: path,
      demoUsers: Object.fromEntries(users.map(([key, , email]) => [key, email])),
      demoUserIds: Object.fromEntries(users.map(([key]) => [key, userIds.get(key)])),
      ownerAdmin: {
        name: 'Antonny Nascimento',
        email: ownerAdminEmail,
        role: 'owner_admin',
      },
      counts: {
        clients: (sqlite.prepare('SELECT count(*) count FROM client').get() as { count: number })
          .count,
        contacts: (
          sqlite.prepare('SELECT count(*) count FROM client_contact').get() as { count: number }
        ).count,
        projects: (sqlite.prepare('SELECT count(*) count FROM project').get() as { count: number })
          .count,
        users: (sqlite.prepare('SELECT count(*) count FROM user').get() as { count: number }).count,
        workers: (
          sqlite.prepare("SELECT count(*) count FROM user WHERE role='worker'").get() as {
            count: number;
          }
        ).count,
        timeEntries: (
          sqlite.prepare('SELECT count(*) count FROM time_entry').get() as { count: number }
        ).count,
        reports: (
          sqlite.prepare('SELECT count(*) count FROM daily_report').get() as { count: number }
        ).count,
        technicalReports: (
          sqlite.prepare('SELECT count(*) count FROM technical_report').get() as { count: number }
        ).count,
        technicalChanges: (
          sqlite.prepare('SELECT count(*) count FROM technical_change').get() as { count: number }
        ).count,
        expenses: (sqlite.prepare('SELECT count(*) count FROM expense').get() as { count: number })
          .count,
        documents: (
          sqlite.prepare('SELECT count(*) count FROM document').get() as { count: number }
        ).count,
        milestones: (
          sqlite.prepare('SELECT count(*) count FROM project_milestone').get() as { count: number }
        ).count,
        invoiceDrafts: (
          sqlite.prepare("SELECT count(*) count FROM invoice WHERE state='draft'").get() as {
            count: number;
          }
        ).count,
        periodReports: (
          sqlite.prepare('SELECT count(*) count FROM period_report').get() as { count: number }
        ).count,
        accountingPacks: (
          sqlite.prepare('SELECT count(*) count FROM accounting_pack_run').get() as {
            count: number;
          }
        ).count,
      },
      projects: [line.id, palletizer.id, recovery.id, support.id],
      invoiceDrafts: [laborInvoice.id, expenseInvoice.id, milestoneInvoice.id],
      closedPeriods: [closedLaborPeriod, closedExpensePeriod],
      periodReportIds: periodReports.map((report) => report.id),
      accountingPackId: accountingPack.id,
      closeoutId: closeout.id,
    },
    null,
    2,
  ),
);
sqlite.close();
