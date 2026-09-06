/** Live-validated English manuals rendered as restrained A4 article PDFs. */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const screenDir = resolve(root, 'docs/manuals/screenshots');
const manuals = resolve(root, 'docs/manuals');
const examples = resolve(root, 'docs/examples');
mkdirSync(manuals, { recursive: true });
mkdirSync(examples, { recursive: true });
const image = (name: string) =>
  `data:image/png;base64,${readFileSync(resolve(screenDir, name)).toString('base64')}`;
const h = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
type ObservedControl = {
  kind: string;
  label: string;
  tag: string;
  type: string;
  name: string;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  options: Array<{ label: string; value: string }>;
  help: string;
};
const expectedDeployedSha = '2058db24ca4d5d6b3f66bde11b6230e271a2d06c';
const expectedRoleRoutes = {
  owner: [
    '/app',
    '/app/projects?view=clients',
    '/app/projects',
    '/app/projects?view=team',
    '/app/planning',
    '/app/documents',
    '/app/time',
    '/app/approvals',
    '/app/reports',
    '/app/expenses',
    '/app/billing',
    '/app/finance?view=overview',
    '/app/finance?view=economic',
    '/app/finance?view=commercial',
    '/app/ledger',
    '/app/accounting',
    '/app/audit',
    '/app/profile',
  ],
  worker: [
    '/app',
    '/app/projects',
    '/app/time',
    '/app/reports',
    '/app/expenses',
    '/app/pay',
    '/app/documents',
    '/app/profile',
  ],
} as const;
const expectedWorkerAuthorization = [
  ['/app/finance (owner-only authorization check)', 403],
  ['/app/economic-review (owner-only authorization check)', 404],
  ['/app/billing (owner-only authorization check)', 403],
  ['/app/ledger (owner-only authorization check)', 403],
  ['/app/accounting (owner-only authorization check)', 403],
  ['/app/audit (owner-only authorization check)', 403],
  ['/app/commercial-configuration (owner-only authorization check)', 404],
  ['/app/approvals (owner-only authorization check)', 500],
] as const;
const liveEvidence = (() => {
  try {
    const evidence = JSON.parse(
      readFileSync(
        resolve(root, 'docs/evidence/client-ready-20260906/manual-browser/RUN.json'),
        'utf8',
      ),
    );
    if (
      evidence?.deployedSha !== expectedDeployedSha ||
      !Array.isArray(evidence?.owner?.results) ||
      !Array.isArray(evidence?.worker?.results)
    )
      throw new Error('RUN.json is missing required role evidence or deployed SHA');
    for (const role of ['owner', 'worker'] as const) {
      for (const route of expectedRoleRoutes[role]) {
        const results = evidence[role].results.filter(
          (item: { route?: string }) => item.route === route,
        );
        if (results.length !== 1)
          throw new Error(`RUN.json expected one ${role} route record: ${route}`);
        const [result] = results;
        if (!result || result.status !== 200 || result.outcome === 'error' || !result.screenshot)
          throw new Error(`RUN.json lacks a successful ${role} route: ${route}`);
      }
    }
    for (const [route, status] of expectedWorkerAuthorization) {
      const results = evidence.worker.results.filter(
        (item: { route?: string }) => item.route === route,
      );
      if (results.length !== 1 || results[0]?.status !== status || results[0]?.outcome !== 'error')
        throw new Error(`RUN.json lacks the expected Worker authorization result: ${route}`);
    }
    const screenshotRecords: Array<{ screenshot: string; sha256: string }> = [];
    const collectScreenshots = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        value.forEach(collectScreenshots);
        return;
      }
      const record = value as Record<string, unknown>;
      if (typeof record.screenshot === 'string' && record.screenshot) {
        if (typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256))
          throw new Error(`RUN.json screenshot hash is missing: ${record.screenshot}`);
        screenshotRecords.push({ screenshot: record.screenshot, sha256: record.sha256 });
      }
      Object.values(record).forEach(collectScreenshots);
    };
    collectScreenshots({ owner: evidence.owner, worker: evidence.worker });
    if (screenshotRecords.length !== 68)
      throw new Error(`RUN.json expected 68 screenshots, found ${screenshotRecords.length}`);
    if (new Set(screenshotRecords.map(({ screenshot }) => screenshot)).size !== 68)
      throw new Error('RUN.json expected 68 unique screenshot paths');
    for (const record of screenshotRecords) {
      const absolute = resolve(root, record.screenshot);
      if (!absolute.startsWith(`${screenDir}/`))
        throw new Error(`RUN.json screenshot escapes the manual directory: ${record.screenshot}`);
      const actual = createHash('sha256').update(readFileSync(absolute)).digest('hex');
      if (actual !== record.sha256)
        throw new Error(`RUN.json screenshot hash mismatch: ${record.screenshot}`);
    }
    return evidence;
  } catch (error) {
    throw new Error(
      `Manual generation refused invalid RUN evidence: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
})();

type View = {
  title: string;
  route: string;
  image: string;
  purpose: string;
  steps: string[];
  note?: string;
};
const ownerRows = [
  [
    'Today dashboard',
    '/app',
    'owner/live-today.png',
    'Review operational totals, active projects, outstanding reports, and available quick actions.',
    [
      'Use Search to locate an authorized project, person, or invoice.',
      'Open project cards to reach the corresponding project workspace.',
      'Use New project, Log actual time, Write field report, Create invoice draft, or View pending reports only with business authorization.',
    ],
  ],
  [
    'Clients',
    '/app/projects?view=clients',
    'owner/live-clients.png',
    'Maintain client contacts from the Projects workspace; the direct clients address resolves to this view.',
    [
      'Use the company/contact/site search to narrow the directory.',
      'Open Contacts or Projects and sites for the selected client.',
      'Do not alter production contact or billing data during a review.',
    ],
  ],
  [
    'Projects',
    '/app/projects',
    'owner/live-projects.png',
    'Review authorized projects, client contacts, milestones, schedules, assignment history, and team access.',
    [
      'Open the relevant project before changing configuration.',
      'Review Expected working schedule and Assignment history before schedule changes or corrections.',
      'Use Create milestone only for an approved deliverable.',
    ],
  ],
  [
    'Team access',
    '/app/projects?view=team',
    'owner/live-team.png',
    'Review and manage the project team access view.',
    [
      'Use the Name, role or project search to locate a workforce record.',
      'Confirm assignment context before changing access.',
      'Do not use a team record to infer or disclose compensation.',
    ],
  ],
  [
    'Resource planning',
    '/app/planning',
    'owner/live-planning.png',
    'Review published schedules and resource planning.',
    [
      'Open the relevant published schedule.',
      'Check assignment dates and availability before proposing a change.',
      'Do not create fictitious shifts or alter an approved schedule during validation.',
    ],
  ],
  [
    'Documents',
    '/app/documents',
    'owner/live-documents.png',
    'Review private project documents and artifact details.',
    [
      'Confirm project and access scope before opening an artifact.',
      'Register an artifact only when it is an authorized business document.',
      'Do not upload credentials or unrelated customer data.',
    ],
  ],
  [
    'Time entries',
    '/app/time',
    'owner/live-time.png',
    'Review actual time one week at a glance and recent entries.',
    [
      'Select the correct project and period.',
      'Check source evidence before approving, returning, or correcting work.',
      'Retain a clear reason for any controlled correction; never silently revise approved history.',
    ],
  ],
  [
    'Approval queue',
    '/app/approvals',
    'owner/live-approvals.png',
    'Review Time, Project approvals, and Finance review queues.',
    [
      'Open the relevant queue tab.',
      'Inspect supporting time, report, and receipt evidence.',
      'Approve or return the item with a factual note.',
    ],
  ],
  [
    'Daily and technical reports',
    '/app/reports',
    'owner/live-reports.png',
    'Review Daily reports and Generated period files.',
    [
      'Use Daily to inspect field and technical reporting.',
      'Generate or review a customer-period file only after real acceptance is received.',
      'Keep customer acceptance non-monetary; do not invent a signature.',
    ],
  ],
  [
    'Expenses and receipts',
    '/app/expenses',
    'owner/live-expenses.png',
    'Review Expenses and reimbursements and recent submitted expenses.',
    [
      'Open the receipt and check project, date, amount and business reason.',
      'Approve, return, or classify through the permitted review path.',
      'Do not upload private receipts merely to populate an example.',
    ],
  ],
  [
    'Billing streams',
    '/app/billing',
    'owner/live-billing.png',
    'Review Billing streams and the Invoice register, which keep candidate streams distinct.',
    [
      'Review the candidate stream and source records before drafting.',
      'Create or edit a draft only when records and decisions are authorized.',
      'This validation did not issue an invoice, consume a sequence, send email, or create a fiscal document.',
    ],
  ],
  [
    'Project finance',
    '/app/finance?view=overview',
    'owner/live-finance.png',
    'Review Finance overview and Planned / Expected project economics.',
    [
      'Select the correct project and period.',
      'Treat rates, forecasts, cost, revenue, budget and margin as internal information.',
      'Confirm recipient and period before any report/export action.',
    ],
  ],
  [
    'Economic review',
    '/app/finance?view=economic',
    'owner/live-economic-review.png',
    'Review the owner economic-analysis view.',
    [
      'Select the authorized project and reporting period.',
      'Interpret revenue, cost and margin only with approved commercial context.',
      'Do not share owner-only economics with workers or external parties.',
    ],
  ],
  [
    'Commercial configuration',
    '/app/finance?view=commercial',
    'owner/live-commercial-configuration.png',
    'Review owner commercial configuration controls.',
    [
      'Open the correct project configuration.',
      'Check the source contract before changing a rate, budget or cap.',
      'Do not use production commercial settings as a test fixture.',
    ],
  ],
  [
    'Collections / ledger',
    '/app/ledger',
    'owner/live-collections.png',
    'Review the master Invoice / Cost / Collection Ledger.',
    [
      'Filter to the required project, invoice, or cost record.',
      'Review collection status against authoritative banking evidence.',
      'This validation did not record a payment, collection, or reconciliation.',
    ],
  ],
  [
    'Accounting',
    '/app/accounting',
    'owner/live-accounting.png',
    'Review or generate the monthly Accounting Pack and its register.',
    [
      'Choose a closed and approved reporting period.',
      'Review the pack register and generated artifacts before export.',
      'Do not close a period or send an export as a UI test.',
    ],
  ],
  [
    'Audit log',
    '/app/audit',
    'owner/live-audit.png',
    'Inspect the append-only security and finance audit view.',
    [
      'Filter to the relevant record or event.',
      'Use the audit trail to explain approved changes and corrections.',
      'Do not attempt to alter or remove audit history.',
    ],
  ],
  [
    'Profile and security',
    '/app/profile',
    'owner/live-profile.png',
    'Manage workforce skills/availability and personal security settings.',
    [
      'Register passkey is available if you choose to add a device credential.',
      'Enable MFA is available as an optional authenticator setting.',
      'Language and account options are available from the top bar.',
    ],
  ],
] as const;
const owner: View[] = ownerRows.map(([title, route, image, purpose, steps, note]) => ({
  title,
  route,
  image,
  purpose,
  steps: [...steps],
  note,
}));
const workerRows = [
  [
    'Today / field workspace',
    '/app',
    'worker/live-home.png',
    'Start daily work from the role-scoped field workspace.',
    [
      'Use the compact navigation for Today, Time, Expenses, Reports, My Pay, and Profile.',
      'Open only the assigned project and task.',
      'Use Search to locate an authorized record.',
    ],
  ],
  [
    'Authorized projects and contacts',
    '/app/projects',
    'worker/live-projects.png',
    'Review authorized projects and permitted client contacts.',
    [
      'Open the assigned project before logging time or reports.',
      'Use Client contacts only for work coordination.',
      'Commercial rates, revenue budgets, PO caps and internal economics are not worker workflow data.',
    ],
  ],
  [
    'Time entries',
    '/app/time',
    'worker/live-time.png',
    'Record actual time and review recent time entries.',
    [
      'Choose the assigned project and correct week/date.',
      'Record only actual time worked; expected schedule hours are not actuals.',
      'Submit through the displayed workflow and correct returned work with the requested note.',
    ],
    'A phone-width capture of this view follows the desktop figure.',
  ],
  [
    'Daily and technical reports',
    '/app/reports',
    'worker/live-reports.png',
    'Create or review Daily and technical field reports.',
    [
      'Select Daily and record factual work details.',
      'Attach only permitted project evidence.',
      'Submit for review; customer acceptance is not a worker-created signature.',
    ],
  ],
  [
    'Expenses and private receipts',
    '/app/expenses',
    'worker/live-expenses.png',
    'Submit expenses and receipts for reimbursement review.',
    [
      'Enter actual project, date, amount, category and business reason.',
      'Upload a legible private receipt through the authorized form.',
      'Check recent expenses for returned items before resubmitting.',
    ],
  ],
  [
    'My Pay',
    '/app/pay',
    'worker/live-pay.png',
    'Review Worker statement, own activity detail, settlement status and reimbursement status.',
    [
      'Review only your own approved activity.',
      'Use supported download/export controls for your own record when present.',
      'Escalate discrepancies to an owner or payroll contact; do not edit settlement records.',
    ],
  ],
  [
    'Documents',
    '/app/documents',
    'worker/live-documents.png',
    'Register or review private project artifacts and artifact details.',
    [
      'Use Register a private artifact only for an authorized work document.',
      'Confirm project and access scope before upload.',
      'Do not upload credentials, unrelated customer data, or sensitive personal records.',
    ],
  ],
  [
    'Profile and security',
    '/app/profile',
    'worker/live-profile.png',
    'Maintain skills, availability, passkeys, optional MFA and language preferences.',
    [
      'Register passkey is available if you choose to add a device credential.',
      'Enable MFA is available as an optional authenticator setting.',
      'Accurate profile data does not grant finance or billing access.',
    ],
  ],
] as const;
const worker: View[] = workerRows.map(([title, route, image, purpose, steps, note]) => ({
  title,
  route,
  image,
  purpose,
  steps: [...steps],
  note,
}));

const css = `
@page { size:A4; margin:20mm 18mm 18mm; } *{box-sizing:border-box} body{font-family:'Nimbus Roman','Times New Roman',serif;color:#171717;font-size:10.2pt;line-height:1.45;margin:0} h1{font-size:18pt;font-weight:normal;margin:0 0 5mm;border-bottom:.6pt solid #333;padding-bottom:2mm} h2{font-size:12.5pt;font-weight:normal;margin:4mm 0 2mm} h3{font-size:10.5pt;margin:3mm 0 1mm} p{margin:0 0 3mm} li{margin:1.2mm 0} ol,ul{margin:1mm 0 3mm;padding-left:6mm}.cover{height:257mm;display:flex;flex-direction:column;justify-content:space-between;border-top:2pt solid #222;border-bottom:2pt solid #222;padding:22mm 0}.cover h1{font-size:29pt;border:0;margin:0}.cover .sub{font-size:14pt}.cover small{font-size:9pt;color:#444}.page{break-before:page}.toc li{padding:.8mm 0}.route{font-family:'Nimbus Mono PS','Courier New',monospace;font-size:8.5pt;color:#444}.figure{border:.5pt solid #aaa;margin:4mm 0;break-inside:avoid}.figure img{width:100%;height:75mm;object-fit:contain;display:block;background:#fafafa}.caption{font-size:8.5pt;padding:2mm 2.5mm;border-top:.5pt solid #aaa;color:#333}.note{border-left:2pt solid #555;background:#f5f5f5;padding:2.5mm 3mm;margin:4mm 0}.warn{border-left-color:#8a5a00;background:#fff9ed}table{border-collapse:collapse;width:100%;margin:3mm 0;font-size:8.6pt}td,th{border:.5pt solid #888;padding:2mm;text-align:left;vertical-align:top}th{background:#eee;font-weight:normal}.control-table{font-size:7.3pt;line-height:1.28}.control-table tr{break-inside:avoid}.control-table th{background:#f0f0f0}.control-table td:nth-child(1){width:23%}.control-table td:nth-child(2){width:21%}.control-table td:nth-child(3){width:31%}.control-table td:nth-child(4){width:25%}`;

function cover(role: string, subtitle: string) {
  return `<section class="cover"><div><small>J&amp;A AUTOMATION</small><h1>${role} User Guide</h1><p class="sub">${subtitle}</p></div><div><p>Live browser validation against deployed application SHA<br><strong>2058db24ca4d5d6b3f66bde11b6230e271a2d06c</strong></p><small>English edition · document and validation date 6 September 2026</small></div></section>`;
}
const shellLabels = new Set([
  'Skip to main content',
  'Close navigation',
  'Toggle navigation',
  'Company Webmail',
  'Company Webmail ↗',
  'Sign out',
  'Language',
  'Account options',
  'Search',
  'Dashboard',
  'Today',
  'Projects',
  'Approvals',
  'Reports',
  'Clients',
  'Team',
  'Planning',
  'Documents',
  'Finance Overview',
  'Economic Review',
  'Billing',
  'Collections / Ledger',
  'Accounting',
  'Commercial Configuration',
  'Profile',
  'Audit',
  'More',
  'A',
]);
function interactiveEvidence(
  role: 'owner' | 'worker',
  route: string,
): Array<{
  target: string;
  disposition: string;
  note: string;
  viewport: string;
  screenshot: string;
  inventory: ObservedControl[];
}> {
  const result = (liveEvidence?.[role]?.results || []).find(
    (item: { route?: string }) => item.route === route,
  );
  return (result?.interactions || []) as Array<{
    target: string;
    disposition: string;
    note: string;
    viewport: string;
    screenshot: string;
    inventory: ObservedControl[];
  }>;
}
function observedControls(role: 'owner' | 'worker', route: string): ObservedControl[] {
  const result = (liveEvidence?.[role]?.results || []).find(
    (item: { route?: string }) => item.route === route,
  );
  const controls = [
    (result?.inventory || []) as ObservedControl[],
    ...interactiveEvidence(role, route).map((item) => item.inventory || []),
  ].flat();
  const unique = new Map<string, ObservedControl>();
  for (const control of controls) {
    if (control.kind === 'link' || shellLabels.has(control.label) || control.label === 'checkbox')
      continue;
    const key = [
      control.kind,
      control.label,
      control.type,
      control.name,
      JSON.stringify(control.options),
    ].join('|');
    if (!unique.has(key)) unique.set(key, control);
  }
  return [...unique.values()];
}
function interactionMatrix(role: 'owner' | 'worker', route: string, section: number): string {
  const items = interactiveEvidence(role, route);
  if (!items.length) return '';
  const rows = items
    .map(
      (item) =>
        `<tr><td>${h(item.target)}</td><td>${h(item.disposition)}</td><td>${h(item.viewport)}</td><td>${h(item.note)}</td></tr>`,
    )
    .join('');
  return `<h2>${section}.2 Interactive-surface disposition</h2><p>The following non-mutating targets were individually opened or inspected in the live role state. “Not present” means the launch surface was absent in that state; “prohibited mutation” means the visible control was deliberately not activated.</p><table class="control-table"><caption>Table ${section}.2. Opened interactive surfaces</caption><thead><tr><th>Target</th><th>Disposition</th><th>Viewport</th><th>Observed boundary</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function interactiveFigure(role: 'owner' | 'worker', route: string, section: number): string {
  const item = interactiveEvidence(role, route).find((candidate) => candidate.screenshot);
  if (!item) return '';
  return `<div class="figure"><img src="${image(item.screenshot.replace('docs/manuals/screenshots/', ''))}" alt="Sanitized opened ${h(item.target)} interface"><div class="caption">Figure ${section - 2}a. Sanitized ${h(item.disposition)} interactive surface: ${h(item.target)} (${h(item.viewport)}).</div></div>`;
}
function controlUse(control: ObservedControl): string {
  if (control.kind === 'tab')
    return 'Select to change the visible review subview; this is a read-only navigation action.';
  if (control.kind === 'details')
    return 'Expand to inspect the associated form or record detail before deciding whether a business action is authorized.';
  if (control.kind === 'button')
    return 'May open a non-submitting surface or begin a committing action. Check the interactive-surface disposition table: only tabs, details, safe links and non-submitting form launches were opened; committing actions were prohibited.';
  if (control.kind === 'select')
    return 'Choose the option that matches the approved record or filter; do not infer a value from another project or worker.';
  return 'Enter factual or approved record data only. Required fields must be completed before a submitted action can be valid.';
}
function controlTable(role: 'owner' | 'worker', route: string, section: number): string {
  const controls = observedControls(role, route);
  if (!controls.length)
    return `<p class="note">No additional non-shell controls were recorded for this view in the sanitized inventory.</p>`;
  const rows = controls
    .map((control) => {
      const state =
        [
          control.required ? 'required' : '',
          control.disabled ? 'disabled' : '',
          control.readOnly ? 'read-only' : '',
        ]
          .filter(Boolean)
          .join(', ') || 'enabled';
      const element = `${h(control.tag)}${control.type && control.type !== control.tag ? ` (${h(control.type)})` : ''}${control.name ? `<br><span class="route">name: ${h(control.name)}</span>` : ''}<br><em>${state}</em>`;
      const options = control.options.length
        ? `${control.options
            .slice(0, 12)
            .map((option) => `${h(option.label)} [${h(option.value)}]`)
            .join(
              '; ',
            )}${control.options.length > 12 ? `; +${control.options.length - 12} further sanitized options in RUN.json` : ''}`
        : control.help
          ? h(control.help)
          : '—';
      const label = control.label.length > 70 && control.name ? control.name : control.label;
      return `<tr><td>${h(label)}</td><td>${element}</td><td>${h(controlUse(control))}</td><td>${options}</td></tr>`;
    })
    .join('');
  return `<table class="control-table"><caption>Table ${section}.1. Sanitized observed controls and option sets</caption><thead><tr><th>Visible label</th><th>Element / state</th><th>How to use safely</th><th>Observed options or help</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function toc(views: View[]) {
  return `<section class="page toc"><h1>Contents</h1><ol><li>Purpose, safety boundary and navigation</li><li>Access and security</li>${views.map((v, i) => `<li>${i + 3}. ${h(v.title)} <span class="route">${h(v.route)}</span></li>`).join('')}<li>Validation record and support</li></ol><h2>Purpose and safety boundary</h2><p>This is a task-oriented reference to controls observed in the deployed interface. The live inspection was read-only: it did not send email, issue an invoice, consume a sequence, record payment/collection, create customer acceptance, alter account security, or create synthetic data.</p><p class="note">Screenshots are current sanitized browser captures. Values, personal names, email addresses, money and long identifiers were visually redacted before capture; they demonstrate layout and controls, not production records.</p><h2>Navigation</h2><p>Use the persistent left navigation at desktop widths and the compact bottom navigation at phone widths. The top bar provides Search, Language, account options, webmail and sign out.</p></section>`;
}
function security(role: 'Owner' | 'Worker') {
  const workerText =
    role === 'Worker'
      ? `<h2>Worker confidentiality verification</h2><p>The worker journey exposed Today, Time, Expenses, Reports, My Pay, Profile, assigned projects, documents, contacts and published schedule. Read-only direct navigation to Finance, Billing, Collections, Accounting and Audit returned authorization errors (403). Sanitized JSON response DTO-key inspection found no customer billing-rate, revenue-budget, PO-cap, internal-cost/margin, or other-worker-compensation key.</p><p class="note warn">Deployed-SHA finding: direct Worker navigation to Approvals returned a 500 error page rather than a normal authorization error; no protected content was rendered. A local source correction now rejects Worker and Auditor Approvals loads with a pre-repository 403 and has a dedicated regression. This manual run did not deploy that correction.</p>`
      : '';
  return `<section class="page"><h1>2. Access and security</h1><h2>Sign-in</h2><p>Enter your own email and password on the sign-in page and select Sign in. Do not record credentials, recovery material, session cookies or tokens in reports, screenshots, or uploads.</p><h2>Passkeys and MFA</h2><p>Profile and security exposes Register passkey and Enable MFA. MFA is optional for all ${role.toLowerCase()} accounts and actions; it is not required to sign in or complete an authorized workflow. No mid-session reauthentication prompt was observed in either journey. An earlier Enable MFA automation attempt returned a visible failure and did not complete enrollment; subsequent read-only Profile checks observed Not enabled for both roles.</p><h2>Language and sign-out</h2><p>Select Language before generating user-facing content. Use Sign out when leaving a shared device. Do not modify another person’s account settings.</p>${workerText}</section>`;
}
function view(role: 'owner' | 'worker', v: View, n: number) {
  const anchor = `s${n}`;
  const figure = v.image
    ? `<div class="figure"><img src="${image(v.image)}" alt="Sanitized ${h(v.title)} interface"><div class="caption">Figure ${n - 2}. Sanitized live desktop capture, 1440 × 900.</div></div>`
    : '';
  return `<section class="page" id="${anchor}"><h1>${n}. ${h(v.title)}</h1><p class="route">Observed route: ${h(v.route)}</p><p>${h(v.purpose)}</p>${figure}${interactiveFigure(role, v.route, n)}<h2>${n}.1 Procedure</h2><ol>${v.steps.map((s) => `<li>${h(s)}</li>`).join('')}</ol>${interactionMatrix(role, v.route, n)}<h2>${n}.3 Field, filter, option and action inventory</h2><p>The following table de-duplicates the base view and every opened interactive surface. Persistent navigation links are documented in Section 1 and are not repeated as form controls.</p>${controlTable(role, v.route, n)}${v.note ? `<p class="note">${h(v.note)}</p>${v.image === 'worker/live-time.png' ? `<div class="figure"><img src="${image('worker/live-time-phone.png')}" alt="Sanitized phone time interface"><div class="caption">Figure ${n - 2}b. Sanitized live phone capture, 390 × 844.</div></div>` : ''}` : ''}</section>`;
}
function article(role: 'Owner' | 'Worker', views: View[]) {
  const roleKey = role.toLowerCase() as 'owner' | 'worker';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${role} User Guide</title><style>${css}</style></head><body>${cover(role, role === 'Owner' ? 'Operational administration, review, finance and compliance reference.' : 'Field-work, time, report, receipt and personal compensation reference.')}${toc(views)}${security(role)}${views.map((v, i) => view(roleKey, v, i + 3)).join('')}<section class="page"><h1>${views.length + 3}. Validation record and support</h1><p>The auditable route/action matrix, timestamp, viewport, screenshot SHA-256 hashes, privacy checks, authorization outcomes, creation/cleanup ledger and prohibited-action notation are in <span class="route">docs/evidence/client-ready-20260906/manual-browser/RUN.json</span> and <span class="route">COVERAGE.md</span>. Prior executed lifecycle operations are cross-referenced only from <span class="route">docs/evidence/client-ready-20260906/operations/PRODUCTION_OPERATIONS_EVIDENCE.json</span> and <span class="route">RUN_REPORT.md</span>; this manual run itself was read-only.</p><p>If a required control is absent, an authorization error occurs, or a record conflicts with approved source evidence, stop and contact the platform owner. Do not bypass a role, fabricate acceptance, or use a financial action as a test.</p></section></body></html>`;
}
export const buildOwnerHtml = () => article('Owner', owner);
export const buildWorkerHtml = () => article('Worker', worker);
export async function generateManuals() {
  const b = await chromium.launch({ headless: true });
  for (const [role, html] of [
    ['Owner', buildOwnerHtml()],
    ['Worker', buildWorkerHtml()],
  ] as const) {
    const p = await b.newPage();
    await p.setContent(html, { waitUntil: 'networkidle' });
    const pdf = await p.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate:
        '<div style="font-family:Nimbus Roman,Times New Roman,serif;font-size:7pt;width:100%;padding-left:18mm;color:#555">J&amp;A Automation · ' +
        role +
        ' User Guide</div>',
      footerTemplate:
        '<div style="font-family:Nimbus Roman,Times New Roman,serif;font-size:7pt;width:100%;padding-right:18mm;text-align:right;color:#555">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
      margin: { top: '20mm', bottom: '18mm', left: '18mm', right: '18mm' },
    });
    writeFileSync(resolve(manuals, `${role}_User_Guide.pdf`), pdf);
    writeFileSync(resolve(examples, `${role}_User_Guide.pdf`), pdf);
    await p.close();
  }
  await b.close();
}
if (process.argv[1]?.includes('generate-user-manuals'))
  generateManuals().catch((e) => {
    console.error(e);
    process.exit(1);
  });
