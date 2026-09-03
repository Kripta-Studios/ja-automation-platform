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
const demoServiceActorId = 'demo-client-essential-service-actor';
const demoServiceActorName = 'Client Essential demo service actor';
const demoServiceActorCapabilities = [
  'artifact.invoice.render',
  'artifact.report.render',
  'billing.draft.generate',
  'artifact.accounting_pack.render',
  'storage.temporary.cleanup',
  'artifact.localized_pdf.render',
  'artifact.worker_statement.render',
  'document.scan',
  'outbox.deliver',
  'alert.dispatch',
  'email.send',
  'backup.verify',
] as const;
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

// The demo database must exercise the same fail-closed service-actor contract
// as a deployed instance.  Keep this fixture identity explicit and stable:
// scheduled jobs may only run through this deployment-scoped actor, never a
// human Finance session and never a production fallback.
const deploymentIdentity = sqlite
  .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
  .get() as { tenant_id: string; deployment_id: string } | undefined;
if (!deploymentIdentity) throw new Error('Missing seeded deployment identity');
sqlite
  .prepare(
    `INSERT OR IGNORE INTO service_actor(
       id,tenant_id,deployment_id,name,status,capabilities_json,created_at,updated_at,version
     ) VALUES(?,?,?,?,?,?,?,?,?)`,
  )
  .run(
    demoServiceActorId,
    deploymentIdentity.tenant_id,
    deploymentIdentity.deployment_id,
    demoServiceActorName,
    'active',
    JSON.stringify(demoServiceActorCapabilities),
    timestamp,
    timestamp,
    1,
  );
sqlite
  .prepare(
    `INSERT OR IGNORE INTO deployment_service_actor_binding(
       singleton,tenant_id,deployment_id,service_actor_id,bound_at,bound_by_user_id,version
     ) VALUES(?,?,?,?,?,?,?)`,
  )
  .run(
    1,
    deploymentIdentity.tenant_id,
    deploymentIdentity.deployment_id,
    demoServiceActorId,
    timestamp,
    owner.userId,
    1,
  );
const configuredDemoServiceActor = sqlite
  .prepare(
    `SELECT s.tenant_id,s.deployment_id,s.name,s.status,s.capabilities_json,
            b.service_actor_id,b.bound_by_user_id
       FROM service_actor s
       JOIN deployment_service_actor_binding b
         ON b.singleton=1 AND b.service_actor_id=s.id
      WHERE s.id=?`,
  )
  .get(demoServiceActorId) as
  | {
      tenant_id: string;
      deployment_id: string;
      name: string;
      status: string;
      capabilities_json: string;
      service_actor_id: string;
      bound_by_user_id: string;
    }
  | undefined;
if (
  !configuredDemoServiceActor ||
  configuredDemoServiceActor.tenant_id !== deploymentIdentity.tenant_id ||
  configuredDemoServiceActor.deployment_id !== deploymentIdentity.deployment_id ||
  configuredDemoServiceActor.name !== demoServiceActorName ||
  configuredDemoServiceActor.status !== 'active' ||
  configuredDemoServiceActor.service_actor_id !== demoServiceActorId ||
  configuredDemoServiceActor.bound_by_user_id !== owner.userId ||
  configuredDemoServiceActor.capabilities_json !== JSON.stringify(demoServiceActorCapabilities)
)
  throw new Error('Seeded service actor binding is not the configured Client Essential fixture');

// Accounting Pack revisions are immutable Finance evidence and therefore use
// the same bounded, human-session step-up contract as the live portal. The
// opaque fixture token is never printed or exported as a demo credential.
const financeSessionId = newId();
const financeStepUpAt = new Date().toISOString();
const financeSessionExpiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
sqlite
  .prepare(
    'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
  )
  .run(
    financeSessionId,
    newId(),
    userIds.get('finance')!,
    financeSessionExpiresAt,
    financeStepUpAt,
    financeStepUpAt,
    financeStepUpAt,
  );
const finance = {
  ...principal('finance', 'finance_admin'),
  sessionId: financeSessionId,
} satisfies Principal;

const automotive = repository.createClient(owner, {
  legalName: 'Northline Mobility (Demo)',
  displayName: 'Northline Mobility · Demo',
  currency: 'USD',
  timezone: 'America/Detroit',
  billingEmail: 'ap@northline.demo',
  billingAddress: 'Northline Mobility, Demo billing address',
});
const packaging = repository.createClient(owner, {
  legalName: 'Harbor Packaging Group (Demo)',
  displayName: 'Harbor Packaging · Demo',
  currency: 'USD',
  timezone: 'America/New_York',
  billingEmail: 'billing@harbor.demo',
  billingAddress: 'Harbor Packaging Group, Demo billing address',
});
const processClient = repository.createClient(owner, {
  legalName: 'BlueRiver Process Systems (Demo)',
  displayName: 'BlueRiver Process · Demo',
  currency: 'USD',
  timezone: 'America/Chicago',
  billingEmail: 'finance@blueriver.demo',
  billingAddress: 'BlueRiver Process Systems, Demo billing address',
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

// Keep the assignment-budget view representative of the distinct commercial
// contexts supported by the repository. Values are integer USD cents/minutes;
// they are deliberately set through the project workflow so the demo exercises
// the same validation and audit path as an administrator edit.
for (const input of [
  {
    projectId: line.id,
    revenueBudgetMinor: 18500000n,
    poCapMinor: 19000000n,
    laborBudgetMinutes: 72000,
    travelBudgetMinor: 1800000n,
    otherCostBudgetMinor: 650000n,
    budgetType: 'revenue_cap',
    plannedMinutes: 72000,
    plannedEndDate: '2026-12-31',
  },
  {
    projectId: palletizer.id,
    revenueBudgetMinor: 9200000n,
    fixedPriceMinor: 7600000n,
    laborBudgetMinutes: 36000,
    travelBudgetMinor: 1250000n,
    otherCostBudgetMinor: 300000n,
    budgetType: 'fixed_price',
    plannedMinutes: 36000,
    plannedEndDate: '2026-11-30',
  },
  {
    projectId: recovery.id,
    revenueBudgetMinor: 14200000n,
    poCapMinor: 15000000n,
    laborBudgetMinutes: 48000,
    travelBudgetMinor: 2200000n,
    otherCostBudgetMinor: 900000n,
    budgetType: 'purchase_order_cap',
    plannedMinutes: 48000,
    plannedEndDate: '2027-01-31',
  },
  {
    projectId: support.id,
    revenueBudgetMinor: 4800000n,
    poCapMinor: 5000000n,
    laborBudgetMinutes: 18000,
    travelBudgetMinor: 600000n,
    otherCostBudgetMinor: 150000n,
    budgetType: 'retainer_cap',
    plannedMinutes: 18000,
    plannedEndDate: '2026-12-31',
  },
] as const)
  repository.updateProject(owner, input);
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
  ['CONTROLLOGIX', 'ControlLogix programming'],
  ['SAFETY-PLC', 'Safety PLC validation'],
  ['SERVO-MOTION', 'Servo and motion control'],
  ['VFD-DRIVES', 'Variable-frequency drives'],
  ['VISION-SYSTEMS', 'Machine vision systems'],
  ['INSTRUMENTATION', 'Industrial instrumentation'],
  ['PROCESS-CONTROLS', 'Process controls'],
  ['ETHERNET-IP', 'EtherNet/IP diagnostics'],
  ['PROFINET', 'PROFINET commissioning'],
  ['SCADA-HIST', 'SCADA historian integration'],
  ['FAT-SAT', 'FAT/SAT test execution'],
  ['STARTUP-HANDOVER', 'Startup and customer handover'],
  ['TECH-DOCS', 'Technical documentation'],
] as const;
const skillIds = new Map<string, string>();
for (const [code, name] of skills)
  skillIds.set(code, repository.createSkill(owner, { code, name }).id);
for (const [workerKey, skillCode, proficiency] of [
  ['worker', 'PLC-COMM', 5],
  ['worker', 'IND-NET', 4],
  ['worker', 'CONTROLLOGIX', 5],
  ['worker', 'SAFETY-PLC', 4],
  ['worker', 'STARTUP-HANDOVER', 5],
  ['worker', 'TECH-DOCS', 4],
  ['worker2', 'IND-NET', 5],
  ['worker2', 'ELEC-DESIGN', 4],
  ['worker2', 'SERVO-MOTION', 5],
  ['worker2', 'VFD-DRIVES', 4],
  ['worker2', 'FAT-SAT', 4],
  ['worker3', 'ROBOT-SAFE', 5],
  ['worker3', 'HMI-SCADA', 4],
  ['worker3', 'VISION-SYSTEMS', 5],
  ['worker3', 'INSTRUMENTATION', 4],
  ['worker3', 'PROCESS-CONTROLS', 4],
  ['worker3', 'SCADA-HIST', 3],
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
repository.setWorkerAvailability(owner, {
  workerId: worker.userId,
  startsAt: '2026-08-10T00:00:00.000Z',
  endsAt: '2026-08-11T23:59:00.000Z',
  availability: 'tentative',
  note: 'Customer release window was being confirmed.',
});
repository.setWorkerAvailability(owner, {
  workerId: worker2.userId,
  startsAt: '2026-08-24T00:00:00.000Z',
  endsAt: '2026-08-31T23:59:00.000Z',
  availability: 'available',
  note: 'Available for the next palletizer maintenance window.',
});
repository.setWorkerAvailability(owner, {
  workerId: worker3.userId,
  startsAt: '2026-08-24T00:00:00.000Z',
  endsAt: '2026-08-31T23:59:00.000Z',
  availability: 'tentative',
  note: 'Tentative pending process-plant shutdown planning.',
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
for (const [key, rate] of [['manager', 5200n]] as const) {
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
    notes: 'Synthetic showcase management compensation rule.',
  });
  v3.createInternalCostRule(finance, {
    workerId: userIds.get(key)!,
    currency: 'USD',
    hourlyRateMinor: rate + 1800n,
    effectiveFrom: '2026-01-01',
    overtimeMethod: 'BASE_RATE_MULTIPLIER',
    overtimeMultiplierBps: 12500,
    notes: 'Synthetic loaded management cost rule.',
  });
}
for (const [workerId, projectId, rateMinor] of [
  [worker.userId, line.id, 4600n],
  [worker2.userId, palletizer.id, 4900n],
] as const)
  v3.createCompensationRule(finance, {
    workerId,
    projectId,
    currency: 'USD',
    rateMinor,
    rateBasis: 'hourly',
    ruleType: 'Hourly',
    overtimeMethod: 'BASE_RATE_MULTIPLIER',
    overtimeMultiplierBps: 15000,
    travelMethod: 'BASE',
    standbyMethod: 'BASE',
    effectiveFrom: '2026-07-01',
    notes: 'Synthetic project-specific compensation rule.',
  });
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

// Keep the operational screens useful for every seeded identity. These rows
// are deliberately deterministic and already approved so the demo can show
// the complete review/pay/reporting lifecycle without a manual setup step.
const scopedDemoUsers = [
  ['manager', palletizer.id, 'America/New_York', 480],
  ['worker', recovery.id, 'America/Chicago', 420],
  ['worker2', palletizer.id, 'America/New_York', 390],
  ['worker3', recovery.id, 'America/Chicago', 450],
] as const;
const scopedDemoDates = [
  '2026-08-03',
  '2026-08-06',
  '2026-08-10',
  '2026-08-14',
  '2026-08-18',
  '2026-08-21',
];
for (const [userKey, projectId, projectTimezone, baseMinutes] of scopedDemoUsers) {
  for (const [index, workDate] of scopedDemoDates.entries()) {
    const id = newId();
    const createdAt = `${workDate}T18:00:00.000Z`;
    sqlite
      .prepare(
        `INSERT INTO time_entry(
          id,project_id,worker_id,work_date,category,minutes,project_timezone,activity_summary,
          approval_state,billability_state,created_at,updated_at,submitted_at,approved_by,approved_at,
          finance_approved_by,finance_approved_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        projectId,
        userIds.get(userKey)!,
        workDate,
        index % 3 === 0 ? 'commissioning' : index % 3 === 1 ? 'regular' : 'travel',
        baseMinutes + index * 15,
        projectTimezone,
        `Synthetic period-close entry for ${userKey} · ${workDate}.`,
        'approved',
        'billable',
        createdAt,
        createdAt,
        createdAt,
        owner.userId,
        createdAt,
        finance.userId,
        createdAt,
      );
  }
}

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
  projectId: support.id,
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
const updatedPendingDaily = repository.updateDailyReport(worker, {
  projectId: support.id,
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
  version: pendingDaily.version,
});
repository.submitReport(worker, 'daily', updatedPendingDaily.id, updatedPendingDaily.version);
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
  reportDate: '2026-08-11',
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

for (const [projectId, workDate, siteShift, summary] of [
  [
    recovery.id,
    '2026-08-15',
    'Process plant · day shift',
    'Skid integration checks and permissive verification completed.',
  ],
  [
    recovery.id,
    '2026-08-20',
    'Process plant · afternoon shift',
    'Alarm propagation and pump rotation evidence captured for handover.',
  ],
  [
    support.id,
    '2026-08-16',
    'Remote support · morning window',
    'Remote diagnostic review completed with the customer controls lead.',
  ],
  [
    support.id,
    '2026-08-21',
    'Remote support · evening window',
    'Resolved a sequence observation and documented the release recommendation.',
  ],
] as const) {
  const report = repository.createDailyReport(worker, {
    projectId,
    workDate,
    siteShift,
    summary,
    tasksCompleted:
      'Reviewed source records, validated the operating sequence and updated the handover notes.',
    problemsFound: 'No blocking issue remains in the synthetic showcase record.',
    correctiveActions: 'Recorded the validation result and next observation window.',
    clientDecisions: 'Customer engineering contact accepted the next validation step.',
    downtimeMinutes: 0,
    blockers: '',
    openItems: 'Retain the record for the next period close.',
    nextDayPlan: 'Review the evidence during the next operational checkpoint.',
    safetyRelated: false,
    customerContact: 'Demo plant controls lead',
  });
  repository.submitReport(worker, 'daily', report.id, report.version);
  repository.reviewReport(
    projectId === recovery.id ? manager : owner,
    'daily',
    report.id,
    'approved',
  );
}

for (const [projectId, systemName, controller] of [
  [recovery.id, 'Caustic recovery skid controls', 'ControlLogix 5570'],
  [support.id, 'Remote support diagnostic package', 'CompactLogix 5380'],
] as const) {
  const report = repository.createTechnicalReport(worker, {
    projectId,
    reportDate: projectId === recovery.id ? '2026-08-15' : '2026-08-16',
    systemName,
    plantSite: projectId === recovery.id ? recovery.id : support.id,
    systemType: 'Process automation controls',
    plcPlatform: 'Rockwell Automation',
    controller,
    networkProtocol: 'EtherNet/IP',
    softwareVersion: 'Studio 5000 v35',
    programReference: `DEMO-${systemName.replaceAll(' ', '-').toUpperCase()}`,
    changeSummary: 'Documented a controlled configuration adjustment and its validation evidence.',
    safetyRelated: false,
    productionImpact: 'No production bypasses introduced; validation remains traceable.',
    validation: 'Dry-cycle validation and operator confirmation completed.',
    validationResult: 'Passed for the synthetic showcase period.',
    openRisk: 'Retain the next observation window in the project register.',
    rollbackPlan: 'Restore the registered pre-change backup if the observation regresses.',
  });
  repository.submitReport(worker, 'technical', report.id, report.version);
  repository.reviewReport(
    projectId === recovery.id ? manager : owner,
    'technical',
    report.id,
    'approved',
  );
}

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
for (const [projectId, name, amountMinor, dueOn] of [
  [recovery.id, 'Skid integration acceptance', 275000n, '2026-08-22'],
  [support.id, 'Remote support monthly close', 185000n, '2026-08-28'],
] as const) {
  const milestone = repository.createProjectMilestone(owner, {
    projectId,
    name,
    description:
      'Synthetic commercial milestone included to exercise project close and billing views.',
    amountMinor,
    dueOn,
  });
  repository.submitProjectMilestone(owner, milestone.id, milestone.version);
  repository.reviewProjectMilestone(finance, milestone.id, 'approved');
}

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

const syntheticPrivateDocument = (
  actor: Principal,
  projectId: string,
  filename: string,
  title: string,
  type: string,
  lines: readonly string[],
) => {
  const bytes = syntheticPdf(title, lines);
  const id = newId();
  const storageKey = `plc-backups/${id}.pdf`;
  writeFileSync(resolve(demoDocumentRoot, storageKey), bytes, { flag: 'wx' });
  const registered = repository.registerPrivateDocument(actor, {
    projectId,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    mediaType: 'application/pdf',
    byteLength: bytes.byteLength,
    storageKey,
    originalFilename: filename,
    description: `Synthetic showcase document: ${title}`,
    artifactType: type,
    sensitivity: 'customer_private',
  });
  sqlite
    .prepare("UPDATE document SET scan_status='clean',scanned_at=?,scan_provider=? WHERE id=?")
    .run(timestamp, 'demo-seed', registered.id);
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
const scopedDemoExpenses = [
  ['admin', line.id],
  ['finance', line.id],
  ['manager', palletizer.id],
  ['worker', recovery.id],
  ['worker2', palletizer.id],
  ['worker3', recovery.id],
] as const;
const expenseDates = ['2026-08-02', '2026-08-07', '2026-08-11', '2026-08-16', '2026-08-20'];
for (const [userIndex, [userKey, projectId]] of scopedDemoExpenses.entries()) {
  for (const [dateIndex, spentOn] of expenseDates.entries()) {
    const amountMinor = 4200 + userIndex * 700 + dateIndex * 550;
    const createdAt = `${spentOn}T19:00:00.000Z`;
    sqlite
      .prepare(
        `INSERT INTO expense(
          id,project_id,worker_id,spent_on,category,currency,amount_minor,client_treatment,
          vendor,description,who_paid,receipt_required,approval_state,reimbursement_state,
          submitted_at,approved_by,approved_at,finance_approved_by,finance_approved_at,
          tax_amount_minor,payment_method,project_currency_amount_minor,fx_rate_bps,
          billing_treatment,billing_state,billing_amount_minor,reimbursement_amount_minor,
          created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        newId(),
        projectId,
        userIds.get(userKey)!,
        spentOn,
        dateIndex % 2 === 0 ? 'ground_transport' : 'meals',
        'USD',
        amountMinor,
        'reimbursable',
        `Demo ${userKey} travel desk`,
        `Synthetic reimbursable expense for ${userKey} · ${spentOn}.`,
        'worker',
        0,
        'approved',
        'approved',
        createdAt,
        owner.userId,
        createdAt,
        finance.userId,
        createdAt,
        0,
        'Demo corporate card',
        amountMinor,
        10000,
        'reimbursable_at_cost',
        'unlocked',
        amountMinor,
        amountMinor,
        createdAt,
        createdAt,
      );
  }
}

// Settlement status is produced by the Finance workflow from approved,
// billable time and the compensation rules above. Keeping this as a real
// domain call makes the fixture useful for both the worker statement and the
// finance settlement register; it also remains safe to rerun because the
// repository upserts the same worker/project/period key.
const demoSettlements = [
  ...v3.settleCompensation(finance, {
    workerId: worker.userId,
    projectId: line.id,
    periodStart: '2026-08-10',
    periodEnd: '2026-08-16',
  }),
  ...v3.settleCompensation(finance, {
    workerId: worker2.userId,
    projectId: palletizer.id,
    periodStart: '2026-08-10',
    periodEnd: '2026-08-16',
  }),
];

repository.createPlanningAssignment(owner, {
  projectId: line.id,
  workerId: worker.userId,
  startsAt: '2026-08-18T12:00:00.000Z',
  endsAt: '2026-08-18T22:00:00.000Z',
  plannedMinutes: 600,
  site: 'Detroit Assembly Campus · Demo',
  requiredSkill: 'ControlLogix programming',
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
repository.createPlanningAssignment(owner, {
  projectId: recovery.id,
  workerId: worker3.userId,
  startsAt: '2026-08-20T13:00:00.000Z',
  endsAt: '2026-08-20T21:00:00.000Z',
  plannedMinutes: 480,
  site: 'Lake County Process Plant · Demo',
  requiredSkill: 'HMI and SCADA',
});
repository.createPlanningAssignment(owner, {
  projectId: support.id,
  workerId: worker.userId,
  startsAt: '2026-08-21T14:00:00.000Z',
  endsAt: '2026-08-21T20:00:00.000Z',
  plannedMinutes: 360,
  site: 'Remote / Detroit · Demo',
  requiredSkill: 'PLC commissioning',
});

const entity = repository.createLegalEntity(owner, {
  code: 'DEMO',
  legalName: 'J&A Automation · Demonstration Invoice',
  currency: 'USD',
  billingAddress: 'Demonstration record · not for payment',
  companyIdentifiers: 'TEST DEMO',
});
const canonicalEntity = v3.createCanonicalLegalEntityRevision(finance, {
  legacyLegalEntityId: entity.id,
  effectiveFrom: '2026-08-01',
  legalName: 'J&A Automation · Demonstration Invoice',
  taxIdentifier: 'TEST-DEMO-TAX',
  registrationIdentifier: 'TEST-DEMO-REGISTRATION',
  addressLine1: 'Demonstration record · not for payment',
  locality: 'Detroit',
  region: 'Michigan',
  postalCode: '48201',
  countryCode: 'US',
  baseCurrency: 'USD',
  timezone: 'UTC',
  reason: 'Canonical legal-entity authority for deterministic Client Essential evidence',
  idempotencyKey: 'demo:canonical-legal-entity:2026-08-01',
});
for (const project of [line, palletizer, recovery, support]) {
  v3.assignCanonicalLegalEntityToProject(finance, {
    projectId: project.id,
    legalEntityRevisionId: canonicalEntity.revisionId,
    effectiveFrom: '2026-08-01',
    reason: 'Bind the deterministic project to its canonical legal-entity authority',
    idempotencyKey: `demo:project-legal-entity:${project.id}:2026-08-01`,
  });
}
repository.createInvoiceNumberPolicy(owner, {
  legalEntityId: entity.id,
  prefix: 'DEMO',
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
const additionalBillingRules = new Map<
  string,
  { labor: string; expense: string; milestone: string }
>();
for (const [projectId, recipientEmail] of [
  [palletizer.id, 'billing@harbor.demo'],
  [recovery.id, 'finance@blueriver.demo'],
  [support.id, 'ap@northline.demo'],
] as const) {
  const labor = repository.createBillingRule(finance, {
    projectId,
    legalEntityId: entity.id,
    streamType: 'labor',
    cadenceType: 'weekly',
    taxProfileId: laborTax.id,
    currency: 'USD',
    effectiveFrom: '2026-01-01',
    recipientEmail,
  });
  const expense = repository.createBillingRule(finance, {
    projectId,
    legalEntityId: entity.id,
    streamType: 'expense',
    cadenceType: 'monthly',
    taxProfileId: expenseTax.id,
    currency: 'USD',
    effectiveFrom: '2026-01-01',
    recipientEmail,
  });
  const milestone = repository.createBillingRule(finance, {
    projectId,
    legalEntityId: entity.id,
    streamType: 'milestone',
    cadenceType: 'milestone',
    taxProfileId: laborTax.id,
    currency: 'USD',
    effectiveFrom: '2026-01-01',
    recipientEmail,
  });
  additionalBillingRules.set(projectId, {
    labor: labor.id,
    expense: expense.id,
    milestone: milestone.id,
  });
}
const billingRulesFor = (projectId: string) => {
  const rules = additionalBillingRules.get(projectId);
  if (!rules) throw new Error(`Missing seeded billing rules for project ${projectId}`);
  return rules;
};

// Give the invoice register useful breadth across projects and lifecycle
// states. Drafts remain editable previews, while one labor invoice completes
// the approved -> issued workflow and therefore exposes a real immutable
// invoice state in the showcase.
const additionalInvoiceDrafts = [
  repository.createInvoiceDraft(
    finance,
    billingRulesFor(palletizer.id).labor,
    '2026-08-10',
    '2026-08-16',
  ),
  repository.createInvoiceDraft(
    finance,
    billingRulesFor(recovery.id).expense,
    '2026-08-01',
    '2026-08-31',
  ),
  repository.createInvoiceDraft(
    finance,
    billingRulesFor(support.id).milestone,
    '2026-08-01',
    '2026-08-31',
  ),
];
const [palletizerInvoiceDraft] = additionalInvoiceDrafts;
if (!palletizerInvoiceDraft) throw new Error('Missing seeded palletizer invoice draft');
repository.approveInvoiceDraft(finance, palletizerInvoiceDraft.id);
const issuedPalletizerInvoice = repository.issueInvoice(finance, palletizerInvoiceDraft.id, 'en');

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
const canonicalRevisionMetadata = (accountingPack.reconciliation as Record<string, unknown>)
  .canonicalRevision as { revisions?: Array<{ revisionId?: string }> } | undefined;
const canonicalAccountingPackRevisionId = canonicalRevisionMetadata?.revisions?.[0]?.revisionId;
if (!canonicalAccountingPackRevisionId)
  throw new Error('Seeded Accounting Pack did not create its canonical revision');
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

// Add private project documents
syntheticPrivateDocument(owner, line.id, 'PLC_Backup_V1.pdf', 'PLC Backup Archive', 'PLC backup', [
  'Date: 2026-08-15',
  'Project: P-0042',
  'System: Main Conveyor',
  'Status: Verified',
  'This is a synthetic backup file generated for showcase.',
]);

syntheticPrivateDocument(
  owner,
  line.id,
  'Safety_Manual.pdf',
  'Safety Protocols & Guidelines',
  'engineering report',
  ['Date: 2026-08-01', 'Project: P-0042', 'Confidential safety guidelines.', 'Do not distribute.'],
);

// ---------------------------------------------------------------------------
// Real J&A Automation Clients, Projects & IMPC Invoices (Production Seed Data)
// ---------------------------------------------------------------------------
const realProjectCatalog = [
  {
    folder: '005',
    code: 'VAL',
    clientNumber: 'C-0005',
    projectNumber: 'CP005',
    clientName: 'Valiant',
    projectName: 'Valiant',
    timezone: 'America/Detroit',
    country: 'US',
    billingAddress: 'Pending billing address',
  },
  {
    folder: '006',
    code: 'RAM',
    clientNumber: 'C-0006',
    projectNumber: 'CP006',
    clientName: 'RAM',
    projectName: 'RAM',
    timezone: 'America/Chicago',
    country: 'US',
    billingAddress: 'Pending billing address',
  },
  {
    folder: '007',
    code: 'MINO',
    clientNumber: 'C-0007',
    projectNumber: 'CP007',
    clientName: 'Mino Automation',
    projectName: 'Mino Automation',
    timezone: 'America/Detroit',
    country: 'US',
    billingAddress: 'Pending billing address',
  },
  {
    folder: '008',
    code: 'ASC',
    clientNumber: 'C-0008',
    projectNumber: 'CP008',
    clientName: 'Ascension',
    projectName: 'Ascension',
    timezone: 'America/Chicago',
    country: 'US',
    billingAddress: 'Pending billing address',
  },
  {
    folder: '009',
    code: 'KHS',
    clientNumber: 'C-0009',
    projectNumber: 'CP009',
    clientName: 'KHS',
    projectName: 'KHS',
    timezone: 'America/Chicago',
    country: 'US',
    billingAddress: 'Pending billing address',
  },
  {
    folder: '010',
    code: 'WWC',
    clientNumber: 'C-0010',
    projectNumber: 'CP010',
    clientName: 'WWC',
    projectName: 'WWC',
    timezone: 'America/Chicago',
    country: 'US',
    billingAddress: 'Pending billing address',
  },
  {
    folder: '011',
    code: 'INPRO',
    clientNumber: 'C-0011',
    projectNumber: 'CP011',
    clientName: 'InPro',
    projectName: 'InPro',
    timezone: 'America/Detroit',
    country: 'US',
    billingAddress: 'Pending billing address',
  },
  {
    folder: '012',
    code: 'NIAG',
    clientNumber: 'C-0012',
    projectNumber: 'CP012',
    clientName: 'Niagara',
    projectName: 'Niagara',
    timezone: 'America/New_York',
    country: 'US',
    billingAddress: 'Pending billing address',
  },
  {
    folder: '013',
    code: 'FORERUN',
    clientNumber: 'C-0013',
    projectNumber: 'CP013',
    clientName: 'Forerunner',
    projectName: 'Forerunner',
    timezone: 'America/Detroit',
    country: 'US',
    billingAddress: 'Pending billing address',
  },
  {
    folder: '014',
    code: 'EMPACK',
    clientNumber: 'C-0014',
    projectNumber: 'CP014',
    clientName: 'Empack',
    projectName: 'Empack',
    timezone: 'America/Chicago',
    country: 'US',
    billingAddress: 'Pending billing address',
  },
  {
    folder: '015',
    code: 'CAP',
    clientNumber: 'C-0015',
    projectNumber: 'CP015',
    clientName: 'CAP Automation Gmbh',
    projectName: 'CAP Automation Gmbh',
    timezone: 'Europe/Berlin',
    country: 'DE',
    billingAddress: 'Pending billing address',
  },
  {
    folder: '016',
    code: 'CASTOR',
    clientNumber: 'C-0016',
    projectNumber: 'CP016',
    clientName: 'Castor Engineering',
    projectName: 'Castor Engineering',
    timezone: 'America/Chicago',
    country: 'US',
    billingAddress: 'Pending billing address',
  },
  {
    folder: '017',
    code: 'JOINER',
    clientNumber: 'C-0017',
    projectNumber: 'CP017',
    clientName: 'Joiner',
    projectName: 'Joiner',
    timezone: 'America/Chicago',
    country: 'US',
    billingAddress: 'Pending billing address',
  },
  {
    folder: '018',
    code: 'SOCAPS',
    clientNumber: 'C-0018',
    projectNumber: 'CP018',
    clientName: 'Socaps',
    projectName: 'Socaps',
    timezone: 'America/New_York',
    country: 'US',
    billingAddress: 'Pending billing address',
  },
  {
    folder: '019',
    code: 'PENREC',
    clientNumber: 'C-0019',
    projectNumber: 'CP019',
    clientName: 'Peninsula Recycling',
    projectName: 'Peninsula Recycling',
    timezone: 'America/Detroit',
    country: 'US',
    billingAddress: 'Pending billing address',
  },
  {
    folder: '020',
    code: 'IMPC',
    clientNumber: 'C-0020',
    projectNumber: 'CP020',
    clientName: 'IMPC Gmbh',
    projectName: 'BBS Mexico',
    poNumber: 'BBS Mexico',
    timezone: 'America/Chicago',
    country: 'US',
    billingAddress: 'Niedersachsenstr. 43, 71640 Ludwigsburg, DE',
    billingEmail: 'field.operations@j-aautomation.com',
    secondProject: {
      projectNumber: 'CP020-DFW',
      projectName: 'Junkers DFW',
      poNumber: 'Junkers DFW',
      timezone: 'America/Chicago',
      country: 'US',
    },
    contacts: [
      {
        name: 'Hans Schwiedop',
        email: 'field.operations@j-aautomation.com',
        phone: '+49 7141 0000',
        role: 'General Manager',
        isPrimary: 1,
        isBillingContact: 0,
      },
      {
        name: 'Stephan Hauser',
        email: 'field.operations@j-aautomation.com',
        phone: '+49 7141 0001',
        role: 'General Manager',
        isPrimary: 0,
        isBillingContact: 1,
      },
    ],
  },
  {
    folder: '021',
    code: 'BASTIAN',
    clientNumber: 'C-0021',
    projectNumber: 'CP021',
    clientName: 'Bastian Solutions',
    projectName: 'Bastian Solutions',
    timezone: 'America/Indiana/Indianapolis',
    country: 'US',
    billingAddress: 'Pending billing address',
  },
  {
    folder: '022',
    code: 'ZEPPELIN',
    clientNumber: 'C-0022',
    projectNumber: 'CP022',
    clientName: 'Zeppelin Systems',
    projectName: 'Zeppelin Systems',
    timezone: 'America/Chicago',
    country: 'US',
    billingAddress: 'Pending billing address',
  },
  {
    folder: '023',
    code: 'OXFORD',
    clientNumber: 'C-0023',
    projectNumber: 'CP023',
    clientName: 'Oxford',
    projectName: 'Oxford',
    timezone: 'America/Detroit',
    country: 'US',
    billingAddress: 'Pending billing address',
  },
  {
    folder: '024',
    code: 'DAMON',
    clientNumber: 'C-0024',
    projectNumber: 'CP024',
    clientName: 'Damon',
    projectName: 'Damon',
    timezone: 'America/Detroit',
    country: 'US',
    billingAddress: 'Pending billing address',
  },
];

const insertClient = sqlite.prepare(`
  INSERT INTO client (
    id, client_number, client_code, legal_name, display_name, status, currency,
    timezone, billing_email, billing_address, payment_terms_days, po_reference,
    created_at, updated_at, version
  ) VALUES (?, ?, ?, ?, ?, 'active', 'USD', ?, ?, ?, 30, ?, ?, ?, 1)
  ON CONFLICT(id) DO UPDATE SET
    client_number=excluded.client_number,
    legal_name=excluded.legal_name,
    display_name=excluded.display_name,
    updated_at=excluded.updated_at
`);

const insertProject = sqlite.prepare(`
  INSERT INTO project (
    id, project_number, name, client_id, po_number, status, billing_model,
    currency, timezone, country, created_at, updated_at, version
  ) VALUES (?, ?, ?, ?, ?, 'active', 'time_and_materials', 'USD', ?, ?, ?, ?, 1)
  ON CONFLICT(id) DO UPDATE SET
    project_number=excluded.project_number,
    name=excluded.name,
    updated_at=excluded.updated_at
`);

const insertSchedule = sqlite.prepare(`
  INSERT INTO schedule (
    id, project_id, timezone, monday_minutes, tuesday_minutes, wednesday_minutes,
    thursday_minutes, friday_minutes, saturday_minutes, sunday_minutes, effective_from, version
  ) VALUES (?, ?, ?, 480, 480, 480, 480, 480, 0, 0, '2026-01-01', 1)
  ON CONFLICT(id) DO NOTHING
`);

const insertContact = sqlite.prepare(`
  INSERT INTO client_contact (
    id, client_id, name, email, phone, role, is_billing_contact, is_primary, created_at, updated_at, version
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  ON CONFLICT(id) DO NOTHING
`);

let projectCp020Id = 'project-cp020-bbs-mexico';
let projectCp020DfwId = 'project-cp020-dfw-junkers';

for (const entry of realProjectCatalog) {
  const clientId = `client-${entry.folder}-${entry.code.toLowerCase()}`;
  const projectId = `project-${entry.projectNumber.toLowerCase()}-${entry.projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  if (entry.folder === '020') projectCp020Id = projectId;

  insertClient.run(
    clientId,
    entry.clientNumber,
    entry.code,
    entry.clientName,
    entry.clientName,
    entry.timezone,
    entry.billingEmail ?? 'field.operations@j-aautomation.com',
    entry.billingAddress,
    entry.poNumber ?? entry.projectName,
    timestamp,
    timestamp,
  );

  insertProject.run(
    projectId,
    entry.projectNumber,
    entry.projectName,
    clientId,
    entry.poNumber ?? null,
    entry.timezone,
    entry.country,
    timestamp,
    timestamp,
  );

  insertSchedule.run(newId(), projectId, entry.timezone);

  if (entry.secondProject) {
    projectCp020DfwId = `project-${entry.secondProject.projectNumber.toLowerCase()}`;
    insertProject.run(
      projectCp020DfwId,
      entry.secondProject.projectNumber,
      entry.secondProject.projectName,
      clientId,
      entry.secondProject.poNumber,
      entry.secondProject.timezone,
      entry.secondProject.country,
      timestamp,
      timestamp,
    );
    insertSchedule.run(newId(), projectCp020DfwId, entry.secondProject.timezone);
  }

  if (entry.contacts) {
    for (const contact of entry.contacts) {
      insertContact.run(
        newId(),
        clientId,
        contact.name,
        contact.email,
        contact.phone,
        contact.role,
        contact.isBillingContact,
        contact.isPrimary,
        timestamp,
        timestamp,
      );
    }
  }
}

// Keep sequence counter past C-0024 so newly created portal clients start at C-0025
sqlite
  .prepare(
    "INSERT INTO number_sequence(scope,scope_id,next_value,version) VALUES('client','global',25,1) ON CONFLICT(scope,scope_id) DO UPDATE SET next_value=max(next_value,25)",
  )
  .run();

// Real Legal Entity & IMPC Invoices
const jaEntityId = 'legal-entity-ja-usa';
sqlite
  .prepare(
    `
    INSERT INTO legal_entity (id, code, legal_name, currency, billing_address, company_identifiers, status, created_at, updated_at, version)
    VALUES (?, 'JA-USA', 'J&A Automation LLC', 'USD', '112 Birkshire Dr, Georgetown TX 78626', 'USA division', 'active', ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET legal_name=excluded.legal_name
  `,
  )
  .run(jaEntityId, timestamp, timestamp);

const zeroTaxProfileId = 'tax-profile-zero-usd';
sqlite
  .prepare(
    `
    INSERT INTO tax_profile (id, name, currency, effective_from, status, version)
    VALUES (?, 'Zero Tax Profile · 0%', 'USD', '2026-01-01', 'active', 1)
    ON CONFLICT(id) DO NOTHING
  `,
  )
  .run(zeroTaxProfileId);

const ruleCp020LaborId = 'rule-cp020-labor';
sqlite
  .prepare(
    `
    INSERT INTO billing_rule (id, project_id, legal_entity_id, tax_profile_id, stream_type, template_id, cadence_type, currency, enabled, effective_from, grouping_mode, created_at, updated_at, version)
    VALUES (?, ?, ?, ?, 'labor', 'labor-detailed', 'monthly', 'USD', 1, '2026-01-01', 'summary', ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at
  `,
  )
  .run(ruleCp020LaborId, projectCp020Id, jaEntityId, zeroTaxProfileId, timestamp, timestamp);

const ruleCp020ExpenseId = 'rule-cp020-expense';
sqlite
  .prepare(
    `
    INSERT INTO billing_rule (id, project_id, legal_entity_id, tax_profile_id, stream_type, template_id, cadence_type, currency, enabled, effective_from, grouping_mode, created_at, updated_at, version)
    VALUES (?, ?, ?, ?, 'expense', 'expenses-detailed', 'monthly', 'USD', 1, '2026-01-01', 'summary', ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at
  `,
  )
  .run(ruleCp020ExpenseId, projectCp020Id, jaEntityId, zeroTaxProfileId, timestamp, timestamp);

const defaultCompany = {
  name: 'J&A Automation LLC',
  division: 'USA division',
  phone: '+1 (864) 208 4684',
  address: '112 Birkshire Dr, Georgetown TX 78626',
  email: 'field.operations@j-aautomation.com',
  website: 'www.j-aautomation.com',
};

const defaultTerms = {
  bankSwiftNumber: 'WFBIUS6S',
  bankAccountNumber: '8769915615',
  bankName: 'Wells Fargo Bank',
  beneficiary: 'J&A Automation LLC',
  pastDueNotice:
    'Past Due account subject to service charge of 1.5% per month and/or maximum permitted by law',
};

// 1. Invoice CP020-013 (Labor Detailed - 8 workers)
const invoiceCp020_013Id = 'invoice-cp020-013';
const inv013Lines = [
  { description: 'Gabriel Hours CW31 and CW32', num: 263, den: 2, rate: 7000, subtotal: 920500 },
  { description: 'Maico Hours CW31 and CW32', num: 263, den: 2, rate: 5500, subtotal: 723250 },
  { description: 'Victor Hours CW31 and CW32', num: 543, den: 4, rate: 5500, subtotal: 746625 },
  { description: 'Andrew Hours CW31 and CW32', num: 673, den: 5, rate: 5500, subtotal: 740300 },
  { description: 'Lucas Hours CW31 and CW32', num: 1261, den: 10, rate: 5500, subtotal: 693550 },
  { description: 'Luiz Hours CW31 and CW32', num: 130, den: 1, rate: 5500, subtotal: 715000 },
  { description: 'Fernando Hours CW31 and CW32', num: 139, den: 1, rate: 5500, subtotal: 764500 },
  { description: 'Alejandro Hours CW31 and CW32', num: 80, den: 1, rate: 5500, subtotal: 440000 },
];

const inv013Snapshot = {
  template: { id: 'labor-detailed', version: 1 },
  number: 'CP020-013',
  invoiceNumber: 'CP020-013',
  purchaseNo: 'BBS Mexico',
  issueDate: '8/10/2026',
  dueDate: '9/10/2026',
  currency: 'USD',
  companyInfo: defaultCompany,
  termsAndInstructions: defaultTerms,
  discountMinor: '0',
  legalEntity: {
    legalName: 'J&A Automation LLC',
    billingAddress: '112 Birkshire Dr, Georgetown TX 78626',
  },
  client: {
    legalName: 'IMPC Gmbh',
    contact: { name: 'Hans Schwiedop' },
    billingAddress: 'Niedersachsenstr. 43, 71640 Ludwigsburg, DE',
    billingEmail: 'field.operations@j-aautomation.com',
  },
  project: { number: 'CP020', name: 'BBS Mexico', poNumber: 'BBS Mexico' },
  calculation: { currency: 'USD', subtotalMinor: '5743725', taxMinor: '0', totalMinor: '5743725' },
  lines: inv013Lines.map((l) => ({
    description: l.description,
    quantity_numerator: l.num,
    quantity_denominator: l.den,
    qty: (l.num / l.den).toFixed(2),
    quantity: (l.num / l.den).toFixed(2),
    hours: (l.num / l.den).toFixed(2),
    unit_price_minor: l.rate.toString(),
    subtotal_minor: l.subtotal.toString(),
    amount_minor: l.subtotal.toString(),
  })),
  updatedAt: timestamp,
};

sqlite
  .prepare(
    `
    INSERT INTO invoice (
      id, project_id, billing_rule_id, invoice_number, stream_type, state, currency,
      subtotal_minor, tax_minor, total_minor, period_start, period_end, issued_at,
      snapshot_json, created_at, updated_at, version
    ) VALUES (?, ?, ?, 'CP020-013', 'labor', 'draft', 'USD', 5743725, 0, 5743725, '2026-08-01', '2026-08-14', '2026-08-10T12:00:00.000Z', ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET
      invoice_number=excluded.invoice_number,
      subtotal_minor=excluded.subtotal_minor,
      total_minor=excluded.total_minor,
      snapshot_json=excluded.snapshot_json,
      updated_at=excluded.updated_at
  `,
  )
  .run(
    invoiceCp020_013Id,
    projectCp020Id,
    ruleCp020LaborId,
    JSON.stringify(inv013Snapshot),
    timestamp,
    timestamp,
  );

sqlite.prepare('DELETE FROM invoice_line WHERE invoice_id=?').run(invoiceCp020_013Id);
for (const line of inv013Lines) {
  sqlite
    .prepare(
      `
      INSERT INTO invoice_line (
        id, invoice_id, description, quantity_numerator, quantity_denominator,
        unit_price_minor, subtotal_minor, source_type, source_id, snapshot_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'time', ?, ?, ?)
    `,
    )
    .run(
      newId(),
      invoiceCp020_013Id,
      line.description,
      line.num,
      line.den,
      line.rate,
      line.subtotal,
      newId(),
      JSON.stringify(line),
      timestamp,
    );
}

// 2. Invoice CP020-014 (Expenses & Josafa Labor Detailed)
const invoiceCp020_014Id = 'invoice-cp020-014';
const inv014Lines = [
  { description: 'Josafa Hours', num: 13737, den: 100, rate: 5000, subtotal: 686850 },
  { description: 'Flight', num: 1, den: 1, rate: 165503, subtotal: 165503 },
  { description: 'Uber', num: 1, den: 1, rate: 18652, subtotal: 18652 },
  { description: 'Luggage', num: 1, den: 1, rate: 6508, subtotal: 6508 },
  { description: 'Hotel', num: 1, den: 1, rate: 165662, subtotal: 165662 },
  { description: 'Car rental', num: 1, den: 1, rate: 162016, subtotal: 162016 },
  { description: 'Fuel', num: 1, den: 1, rate: 11140, subtotal: 11140 },
  { description: 'Per diem', num: 25, den: 1, rate: 4800, subtotal: 120000 },
];

const inv014Snapshot = {
  template: { id: 'expenses-detailed', version: 1 },
  number: 'CP020-014',
  invoiceNumber: 'CP020-014',
  purchaseNo: 'Junkers DFW',
  issueDate: '8/14/2026',
  dueDate: '9/14/2026',
  currency: 'USD',
  companyInfo: defaultCompany,
  termsAndInstructions: defaultTerms,
  discountMinor: '0',
  legalEntity: {
    legalName: 'J&A Automation LLC',
    billingAddress: '112 Birkshire Dr, Georgetown TX 78626',
  },
  client: {
    legalName: 'IMPC Gmbh',
    contact: { name: 'Stephan Hauser' },
    billingAddress: 'Niedersachsenstr. 43, 71640 Ludwigsburg, DE',
    billingEmail: 'field.operations@j-aautomation.com',
  },
  project: { number: 'CP020', name: 'BBS Mexico', poNumber: 'Junkers DFW' },
  calculation: { currency: 'USD', subtotalMinor: '1336331', taxMinor: '0', totalMinor: '1336331' },
  lines: inv014Lines.map((l) => ({
    description: l.description,
    quantity_numerator: l.num,
    quantity_denominator: l.den,
    qty: (l.num / l.den).toFixed(2),
    quantity: (l.num / l.den).toFixed(2),
    hours: (l.num / l.den).toFixed(2),
    unit_price_minor: l.rate.toString(),
    subtotal_minor: l.subtotal.toString(),
    amount_minor: l.subtotal.toString(),
  })),
  updatedAt: timestamp,
};

sqlite
  .prepare(
    `
    INSERT INTO invoice (
      id, project_id, billing_rule_id, invoice_number, stream_type, state, currency,
      subtotal_minor, tax_minor, total_minor, period_start, period_end, issued_at,
      snapshot_json, created_at, updated_at, version
    ) VALUES (?, ?, ?, 'CP020-014', 'expense', 'draft', 'USD', 1336331, 0, 1336331, '2026-08-01', '2026-08-14', '2026-08-14T12:00:00.000Z', ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET
      invoice_number=excluded.invoice_number,
      subtotal_minor=excluded.subtotal_minor,
      total_minor=excluded.total_minor,
      snapshot_json=excluded.snapshot_json,
      updated_at=excluded.updated_at
  `,
  )
  .run(
    invoiceCp020_014Id,
    projectCp020Id,
    ruleCp020ExpenseId,
    JSON.stringify(inv014Snapshot),
    timestamp,
    timestamp,
  );

sqlite.prepare('DELETE FROM invoice_line WHERE invoice_id=?').run(invoiceCp020_014Id);
for (const line of inv014Lines) {
  sqlite
    .prepare(
      `
      INSERT INTO invoice_line (
        id, invoice_id, description, quantity_numerator, quantity_denominator,
        unit_price_minor, subtotal_minor, source_type, source_id, snapshot_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'expense', ?, ?, ?)
    `,
    )
    .run(
      newId(),
      invoiceCp020_014Id,
      line.description,
      line.num,
      line.den,
      line.rate,
      line.subtotal,
      newId(),
      JSON.stringify(line),
      timestamp,
    );
}

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
        invoices: (sqlite.prepare('SELECT count(*) count FROM invoice').get() as { count: number })
          .count,
        issuedInvoices: (
          sqlite
            .prepare(
              "SELECT count(*) count FROM invoice WHERE state IN ('issued','sent','paid','partially_paid','overdue')",
            )
            .get() as { count: number }
        ).count,
        billingRules: (
          sqlite.prepare('SELECT count(*) count FROM billing_rule WHERE enabled=1').get() as {
            count: number;
          }
        ).count,
        skills: (sqlite.prepare('SELECT count(*) count FROM skill').get() as { count: number })
          .count,
        workerSkills: (
          sqlite.prepare('SELECT count(*) count FROM worker_skill').get() as { count: number }
        ).count,
        availabilities: (
          sqlite.prepare('SELECT count(*) count FROM worker_availability').get() as {
            count: number;
          }
        ).count,
        settlements: (
          sqlite.prepare('SELECT count(*) count FROM compensation_settlement').get() as {
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
      additionalInvoiceDrafts: additionalInvoiceDrafts.map((invoice) => invoice.id),
      issuedPalletizerInvoice: {
        id: palletizerInvoiceDraft.id,
        invoiceNumber: issuedPalletizerInvoice.invoiceNumber,
      },
      settlementIds: demoSettlements.map((settlement) => settlement.id),
      closedPeriods: [closedLaborPeriod, closedExpensePeriod],
      periodReportIds: periodReports.map((report) => report.id),
      accountingPackId: accountingPack.id,
      canonicalAccountingPackRevisionId,
      closeoutId: closeout.id,
    },
    null,
    2,
  ),
);
sqlite.close();
