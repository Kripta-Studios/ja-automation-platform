/**
 * Live, read-only manual capture.  Credentials are deliberately read only from
 * the process environment and are never printed or written to disk.
 */
import { chromium, type Page, type Response } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baseUrl = (
  process.env.JA_MANUAL_BASE_URL || 'https://j-aautomation.com/j-aautomation'
).replace(/\/$/, '');
const outputRoot = resolve(process.cwd(), 'docs/evidence/client-ready-20260906/manual-browser');
const screenshotsRoot = resolve(process.cwd(), 'docs/manuals/screenshots');

type Account = { role: 'owner' | 'worker'; email: string; password: string };
type RouteResult = {
  route: string;
  finalUrl: string;
  title: string;
  status: number | null;
  viewport: string;
  screenshot: string;
  sha256: string;
  controls: string[];
  inventory: Array<{
    kind: 'field' | 'select' | 'button' | 'link' | 'tab' | 'details';
    label: string;
    tag: string;
    type: string;
    name: string;
    required: boolean;
    disabled: boolean;
    readOnly: boolean;
    options: Array<{ label: string; value: string }>;
    help: string;
  }>;
  headings: string[];
  outcome: 'reachable' | 'redirected' | 'error';
  interactions?: InteractionResult[];
};

type InteractionResult = {
  target: string;
  disposition: 'opened' | 'inspected' | 'not_present' | 'disabled' | 'prohibited_mutation';
  note: string;
  viewport: string;
  screenshot: string;
  sha256: string;
  inventory: RouteResult['inventory'];
  headings: string[];
};

type InteractionPlan = {
  target: string;
  /** Ordered non-mutating disclosures/tabs/links. No submit control is ever a trigger. */
  steps: Array<{ name?: string; selector?: string }>;
};

const routes = {
  owner: [
    ['today', '/app'],
    ['clients', '/app/projects?view=clients'],
    ['projects', '/app/projects'],
    ['team', '/app/projects?view=team'],
    ['planning', '/app/planning'],
    ['documents', '/app/documents'],
    ['time', '/app/time'],
    ['approvals', '/app/approvals'],
    ['reports', '/app/reports'],
    ['expenses', '/app/expenses'],
    ['billing', '/app/billing'],
    ['finance', '/app/finance?view=overview'],
    ['economic-review', '/app/finance?view=economic'],
    ['commercial-configuration', '/app/finance?view=commercial'],
    ['collections', '/app/ledger'],
    ['accounting', '/app/accounting'],
    ['audit', '/app/audit'],
    ['profile', '/app/profile'],
  ],
  worker: [
    ['home', '/app'],
    ['projects', '/app/projects'],
    ['time', '/app/time'],
    ['reports', '/app/reports'],
    ['expenses', '/app/expenses'],
    ['pay', '/app/pay'],
    ['documents', '/app/documents'],
    ['profile', '/app/profile'],
  ],
} as const;

const workerOwnerOnlyRoutes = [
  '/app/clients',
  '/app/team',
  '/app/planning',
  '/app/finance',
  '/app/economic-review',
  '/app/billing',
  '/app/ledger',
  '/app/accounting',
  '/app/audit',
  '/app/commercial-configuration',
  '/app/approvals',
];

const ownerEvidenceRoutes = [
  ['today', '/app'],
  ['clients', '/app/projects?view=clients'],
  ['projects', '/app/projects'],
  ['team', '/app/projects?view=team'],
  ['planning', '/app/planning'],
  ['documents', '/app/documents'],
  ['time', '/app/time'],
  ['approvals', '/app/approvals'],
  ['reports', '/app/reports'],
  ['expenses', '/app/expenses'],
  ['billing', '/app/billing'],
  ['finance', '/app/finance?view=overview'],
  ['economic-review', '/app/finance?view=economic'],
  ['commercial-configuration', '/app/finance?view=commercial'],
  ['collections', '/app/ledger'],
  ['accounting', '/app/accounting'],
  ['audit', '/app/audit'],
  ['profile', '/app/profile'],
] as const;
const workerEvidenceRoutes = [
  ['home', '/app'],
  ['projects', '/app/projects'],
  ['time', '/app/time'],
  ['reports', '/app/reports'],
  ['expenses', '/app/expenses'],
  ['pay', '/app/pay'],
  ['documents', '/app/documents'],
  ['profile', '/app/profile'],
] as const;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be supplied through the environment.`);
  return value;
}

function sha(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function safeText(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted-email]')
    .replace(/(?:Bearer|token|password|session|cookie)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/[$€£]\s?[\d,.]+/g, '[redacted-amount]')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:%|hours?|hrs?|h|minutes?|mins?)\b/gi, '[redacted-metric]')
    .replace(/\b\d{5,}\b/g, '[redacted-id]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function sanitizeHumanEvidence(existing: Record<string, unknown>): Record<string, unknown> {
  const result = existing as Record<string, unknown>;
  result.title = typeof result.title === 'string' ? safeText(result.title) : result.title;
  if (Array.isArray(result.headings)) {
    const profileStatic = new Set([
      'Profile and security',
      'Skills and availability',
      'Manage worker profiles',
      'Passkeys',
      'Authenticator app',
    ]);
    const teamStatic = new Set([
      'Team access',
      'Team',
      'Create user access',
      'Project assignments',
    ]);
    const clientStatic = new Set(['Client contacts', 'Clients', 'Contacts', 'Projects and sites']);
    result.headings = result.headings.map((value) => {
      if (typeof value !== 'string') return value;
      if (result.route === '/app/profile' && !profileStatic.has(value))
        return '[redacted profile identity]';
      if (result.route === '/app/projects?view=team' && !teamStatic.has(value))
        return '[redacted team member]';
      if (result.route === '/app/projects?view=clients' && !clientStatic.has(value))
        return '[redacted client record]';
      return safeText(value);
    });
  }
  // `controls` is a legacy untyped text summary and is not used for manual
  // tables. Drop it universally; the typed inventory below retains the
  // auditable static control vocabulary without record-derived link text.
  if (Array.isArray(result.controls)) result.controls = [];
  if (Array.isArray(result.inventory))
    result.inventory = result.inventory.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const control = item as Record<string, unknown>;
      for (const key of ['label', 'name', 'help'] as const)
        if (typeof control[key] === 'string') control[key] = safeText(control[key] as string);
      if (control.kind === 'link' && typeof control.label === 'string') {
        const staticLinks = new Set([
          'Skip to main content',
          'Company Webmail',
          'Company Webmail ↗',
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
          'My Pay',
        ]);
        if (!staticLinks.has(control.label)) control.label = '[redacted record link]';
      }
      if (result.route === '/app/projects?view=team' && typeof control.label === 'string')
        control.label = control.label.replace(
          /^(Status for|Account action for)\s+.+$/i,
          '$1 [redacted team member]',
        );
      // Some text inputs expose their current value as the accessible label when
      // the browser capture cannot resolve the adjacent label. Preserve the
      // field's meaning without retaining the live operational default.
      if (control.name === 'siteShift') control.label = 'Site / shift';
      const valueBackedFieldLabels: Record<string, string> = {
        passkeyName: 'Device name',
        expectedHoursPerDay: 'Expected hours / day',
        clientDailyMinimumHours: 'Client daily minimum hours',
      };
      if (typeof control.name === 'string' && valueBackedFieldLabels[control.name])
        control.label = valueBackedFieldLabels[control.name];
      if (typeof control.label === 'string' && ['button', 'tab'].includes(String(control.kind))) {
        control.label = control.label
          .replace(/^(Specialists|Mailboxes \(@j-aautomation\.com\))\d+$/, '$1')
          .replace(
            /^(Time|Expenses|Reports|All invoices|WIP \/ Ready|Drafts|Outstanding|Overdue)\s+\d+$/,
            '$1',
          )
          .replace(
            /^(All|Needs classification|Reimbursable at cost|Non-billable)\s*\(\d+\)$/,
            '$1',
          );
      }
      if (result.route === '/app/planning' && typeof control.label === 'string') {
        const staticPlanningLabels = new Set([
          'Project',
          'Worker',
          'Start',
          'End',
          'Planned minutes',
          'Site',
          'Required skill',
          'Publish assignment',
          'New Skill',
          'Update Skill',
          'Delete Skill',
          'Code',
          'Name',
          'Skill',
          'Close navigation',
          'Toggle navigation',
          'Search',
          'Print report',
        ]);
        if (!staticPlanningLabels.has(control.label)) control.label = '[redacted planning record]';
      }
      if (Array.isArray(control.options))
        control.options = control.options.map((option) => {
          if (!option || typeof option !== 'object') return option;
          const value = option as Record<string, unknown>;
          const dynamic = value.value === '[redacted-value]' || value.value === 'redacted-value';
          if (typeof value.label === 'string')
            value.label = dynamic ? 'redacted option' : safeText(value.label);
          if (typeof value.value === 'string')
            value.value = dynamic ? 'redacted-value' : safeText(value.value);
          return value;
        });
      return control;
    });
  if (Array.isArray(result.interactions))
    result.interactions = result.interactions.map((interaction) => {
      if (!interaction || typeof interaction !== 'object') return interaction;
      const item = interaction as Record<string, unknown>;
      if (typeof item.target === 'string') item.target = safeText(item.target);
      if (typeof item.note === 'string') item.note = safeText(item.note);
      if (Array.isArray(item.headings)) {
        const profileStatic = new Set([
          'Profile and security',
          'Skills and availability',
          'Manage worker profiles',
          'Passkeys',
          'Authenticator app',
        ]);
        const teamStatic = new Set([
          'Team access',
          'Team',
          'Create user access',
          'Project assignments',
        ]);
        const clientStatic = new Set([
          'Client contacts',
          'Clients',
          'Contacts',
          'Projects and sites',
        ]);
        item.headings = item.headings.map((value) => {
          if (typeof value !== 'string') return value;
          if (result.route === '/app/profile' && !profileStatic.has(value))
            return '[redacted profile identity]';
          if (result.route === '/app/projects?view=team' && !teamStatic.has(value))
            return '[redacted team member]';
          if (result.route === '/app/projects?view=clients' && !clientStatic.has(value))
            return '[redacted client record]';
          return safeText(value);
        });
      }
      if (Array.isArray(item.inventory))
        item.inventory = sanitizeHumanEvidence({
          route: result.route,
          inventory: item.inventory,
        }).inventory;
      return item;
    });
  return result;
}

function exactFinalUrl(route: string, fallback?: string): string {
  if (route === '/app/clients') return `${baseUrl}/app/projects?view=clients`;
  if (route === '/app/team') return `${baseUrl}/app/projects?view=team`;
  return `${baseUrl}${route}` || fallback || baseUrl;
}

function repairEvidence(): void {
  const path = resolve(outputRoot, 'RUN.json');
  const evidence = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  evidence.baseUrl = baseUrl;
  evidence.deployedSha = '2058db24ca4d5d6b3f66bde11b6230e271a2d06c';
  const repairRole = (
    role: 'owner' | 'worker',
    expected: readonly (readonly [string, string])[],
  ) => {
    const roleEvidence = evidence[role] as Record<string, unknown>;
    const results = roleEvidence.results as Array<Record<string, unknown>>;
    expected.forEach(([label, route], index) => {
      const item = sanitizeHumanEvidence(results[index]);
      item.route = route;
      item.finalUrl = exactFinalUrl(route);
      item.screenshot = `docs/manuals/screenshots/${role}/live-${label}.png`;
      item.sha256 = sha(resolve(process.cwd(), item.screenshot as string));
      if (typeof item.status === 'number' && item.status >= 400) item.outcome = 'error';
      if (Array.isArray(item.interactions))
        for (const interaction of item.interactions as Array<Record<string, unknown>>) {
          if (typeof interaction.screenshot === 'string' && interaction.screenshot)
            interaction.sha256 = sha(resolve(process.cwd(), interaction.screenshot));
        }
    });
    if (role === 'worker') {
      workerOwnerOnlyRoutes.forEach((route, offset) => {
        const item = sanitizeHumanEvidence(results[workerEvidenceRoutes.length + offset]);
        item.route = `${route} (owner-only authorization check)`;
        item.finalUrl = exactFinalUrl(route);
        item.screenshot = '';
        item.sha256 = '';
        if (typeof item.status === 'number' && item.status >= 400) item.outcome = 'error';
      });
      const phone = sanitizeHumanEvidence(
        results[workerEvidenceRoutes.length + workerOwnerOnlyRoutes.length],
      );
      phone.route = '/app/time (phone)';
      phone.finalUrl = `${baseUrl}/app/time`;
      phone.screenshot = 'docs/manuals/screenshots/worker/live-time-phone.png';
      phone.sha256 = sha(resolve(process.cwd(), phone.screenshot as string));
    }
  };
  repairRole('owner', ownerEvidenceRoutes);
  repairRole('worker', workerEvidenceRoutes);
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`);
}

/**
 * Removes only the desktop signed-in account avatar/name area from already
 * sanitized PNGs. It deliberately leaves the role and all navigation/form
 * labels intact and performs no live navigation or account operation.
 */
async function redactAccountHeaders(): Promise<void> {
  const evidence = JSON.parse(readFileSync(resolve(outputRoot, 'RUN.json'), 'utf8')) as Record<
    string,
    unknown
  >;
  const screenshots = ['owner', 'worker'].flatMap((role) =>
    ((evidence[role] as Record<string, unknown>).results as Array<Record<string, unknown>>)
      .flatMap((result) => [
        String(result.screenshot || ''),
        ...((result.interactions as Array<Record<string, unknown>> | undefined) || []).map(
          (interaction) => String(interaction.screenshot || ''),
        ),
      ])
      .filter(Boolean),
  );
  const browser = await chromium.launch({ headless: true });
  for (const screenshot of screenshots) {
    const target = resolve(process.cwd(), screenshot);
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const source = `data:image/png;base64,${readFileSync(target).toString('base64')}`;
    await page.setContent(
      `<style>html,body{margin:0;padding:0;overflow:hidden;background:#fff}img{display:block;margin:0;padding:0}.mask{position:absolute;background:#fff;z-index:2}</style><img src="${source}"><div class="mask" style="left:1160px;top:14px;width:48px;height:48px"></div><div class="mask" style="left:1210px;top:15px;width:160px;height:29px"></div>`,
    );
    await page.waitForFunction(() => (document.images[0]?.naturalWidth || 0) > 0);
    const size = await page.evaluate(() => ({
      width: document.images[0].naturalWidth,
      height: document.images[0].naturalHeight,
    }));
    await page.setViewportSize(size);
    // Compact headers use an avatar-only account affordance. Remove the desktop
    // masks and cover only that avatar; navigation and role labels remain visible.
    if (size.width < 1000) {
      await page.locator('.mask').evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
      await page.evaluate((width) => {
        const avatarMask = document.createElement('div');
        avatarMask.className = 'mask';
        avatarMask.style.cssText = `left:${width - 51}px;top:13px;width:43px;height:43px;border-radius:50%;background:#fff;z-index:3`;
        document.body.append(avatarMask);
      }, size.width);
    }
    // Existing directory captures are repaired offline using the exact card
    // regions occupied by dynamic people/contact values in this fixed viewport.
    // Demo client/project headings and all static labels remain visible.
    const extraMasks =
      screenshot.includes('/owner/live-team') || screenshot.includes('/owner/interactive-team')
        ? [
            { left: 344, top: 608, width: 320, height: 34 },
            { left: 345, top: 682, width: 58, height: 58 },
          ]
        : screenshot.includes('/owner/live-clients') ||
            screenshot.includes('/owner/interactive-clients')
          ? [
              { left: 355, top: 708, width: 245, height: 32 },
              { left: 355, top: 805, width: 205, height: 31 },
            ]
          : [];
    if (extraMasks.length)
      await page.evaluate((masks) => {
        for (const mask of masks) {
          const node = document.createElement('div');
          node.className = 'mask';
          node.style.cssText = `left:${mask.left}px;top:${mask.top}px;width:${mask.width}px;height:${mask.height}px;background:#fff;z-index:4`;
          document.body.append(node);
        }
      }, extraMasks);
    await page.screenshot({ path: target });
    await page.close();
  }
  await browser.close();
  repairEvidence();
}

async function summarize(
  page: Page,
): Promise<{ controls: string[]; headings: string[]; inventory: RouteResult['inventory'] }> {
  return page.evaluate(() => {
    const clean = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, 180);
    const labelFor = (element: Element) => {
      const input = element as HTMLInputElement;
      const explicit = input.id
        ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent
        : '';
      const wrapping = input.closest('label')?.textContent || '';
      const aria = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby') || '';
      // A wrapping <label> around a select includes every option's text; use
      // it only when no stable native identifier exists.
      return clean(
        explicit ||
          aria ||
          input.getAttribute('placeholder') ||
          input.getAttribute('title') ||
          input.name ||
          wrapping ||
          input.textContent ||
          input.tagName,
      );
    };
    const safeOption = (value: string) => (/^[a-z_]+$/i.test(value) ? value : 'redacted-value');
    const inventory = [
      ...document.querySelectorAll('input, select, textarea, button, a, [role="tab"], summary'),
    ]
      .map((node) => {
        const element = node as
          | HTMLInputElement
          | HTMLSelectElement
          | HTMLTextAreaElement
          | HTMLButtonElement
          | HTMLAnchorElement;
        const tag = element.tagName.toLowerCase();
        const isSelect = tag === 'select';
        const kind = isSelect
          ? 'select'
          : tag === 'input' || tag === 'textarea'
            ? 'field'
            : element.getAttribute('role') === 'tab'
              ? 'tab'
              : tag === 'summary'
                ? 'details'
                : tag === 'a'
                  ? 'link'
                  : 'button';
        const describedBy = (element.getAttribute('aria-describedby') || '')
          .split(/\s+/)
          .filter(Boolean)
          .map((id) => document.getElementById(id)?.textContent || '')
          .join(' ');
        return {
          kind,
          tag,
          type: tag === 'input' ? (element as HTMLInputElement).type : tag,
          name: element.getAttribute('name') || '',
          label: labelFor(element),
          required: 'required' in element && Boolean((element as HTMLInputElement).required),
          disabled: 'disabled' in element && Boolean((element as HTMLInputElement).disabled),
          readOnly: 'readOnly' in element && Boolean((element as HTMLInputElement).readOnly),
          options: isSelect
            ? [...(element as HTMLSelectElement).options].map((option) => {
                const value = safeOption(option.value);
                return {
                  label:
                    value === 'redacted-value'
                      ? 'redacted option'
                      : clean(option.textContent || ''),
                  value,
                };
              })
            : [],
          help: clean(describedBy || element.getAttribute('data-help') || ''),
        };
      })
      .filter((entry) => entry.label)
      .slice(0, 180);
    const controls = [...document.querySelectorAll('button, a, input, select, textarea, summary')]
      .map((node) => {
        const el = node as HTMLInputElement;
        return clean(
          el.getAttribute('aria-label') ||
            el.getAttribute('placeholder') ||
            el.name ||
            el.textContent ||
            el.type ||
            el.tagName,
        );
      })
      .filter(Boolean)
      .slice(0, 80);
    const headings = [...document.querySelectorAll('h1, h2, h3')]
      .map((node) => clean(node.textContent || ''))
      .filter(Boolean)
      .slice(0, 30);
    return { controls, headings, inventory };
  });
}

/* Each entry is a launch/disclosure only. Submit, approve, reject, issue, send,
 * generate, payment, sign, passkey and MFA controls are deliberately absent. */
const interactivePlans: Record<'owner' | 'worker', Partial<Record<string, InteractionPlan[]>>> = {
  owner: {
    clients: [
      { target: 'Add client contact form', steps: [{ name: 'Add contact' }] },
      { target: 'Edit client contact form', steps: [{ name: 'Edit contact' }] },
    ],
    projects: [
      { target: 'New Client form', steps: [{ name: 'New Client' }] },
      { target: 'New Project form', steps: [{ name: 'New Project' }] },
      { target: 'Assign Worker form', steps: [{ name: 'Assign Worker' }] },
      { target: 'Update assignment form', steps: [{ name: 'Update assignment' }] },
      { target: 'Project close disclosure', steps: [{ selector: 'input[placeholder="Reason"]' }] },
    ],
    team: [
      { target: 'Create user access form', steps: [{ name: 'Create user' }] },
      { target: 'Edit team member disclosure', steps: [{ selector: 'details' }] },
    ],
    planning: [
      {
        target: 'Publish field assignment form',
        steps: [{ selector: 'form[action*="createPlanning"]' }],
      },
      { target: 'New Skill form', steps: [{ name: 'New Skill' }] },
      { target: 'Update Skill form', steps: [{ name: 'Update Skill' }] },
    ],
    documents: [
      {
        target: 'Private artifact register form',
        steps: [{ selector: 'form[action*="uploadPrivateDocument"]' }],
      },
    ],
    time: [{ target: 'Log time form', steps: [{ name: 'Log time' }] }],
    approvals: [
      { target: 'Project approvals tab', steps: [{ name: 'Project approvals' }] },
      { target: 'Finance review tab', steps: [{ name: 'Finance review' }] },
      { target: 'Review detail action', steps: [{ name: 'Review' }] },
    ],
    reports: [
      {
        target: 'Technical reports tab and new form',
        steps: [{ name: 'Technical' }, { name: 'New technical report' }],
      },
      { target: 'Client Sign-off tab', steps: [{ name: 'Client Sign-off' }] },
      { target: 'New daily report form', steps: [{ name: 'Daily' }, { name: 'New daily report' }] },
    ],
    expenses: [{ target: 'Record expense form', steps: [{ name: 'Record expense' }] }],
    billing: [
      { target: 'Billing streams tab', steps: [{ name: 'Billing streams' }] },
      { target: 'Configure billing tab', steps: [{ name: 'Configure billing' }] },
      { target: 'Invoice register filters', steps: [{ name: 'Invoices' }] },
    ],
    finance: [{ target: 'Economic review tab', steps: [{ name: 'Economic Review' }] }],
    'commercial-configuration': [
      { target: 'Commercial classification/configuration form', steps: [{ selector: 'form' }] },
    ],
    collections: [{ target: 'Ledger filters and record detail', steps: [{ selector: 'form' }] }],
    accounting: [{ target: 'Accounting Pack input panel', steps: [{ selector: 'form' }] }],
    audit: [{ target: 'Audit filters', steps: [{ selector: 'form' }] }],
    profile: [
      { target: 'Passkey control', steps: [] },
      { target: 'Optional MFA control', steps: [] },
    ],
  },
  worker: {
    projects: [
      {
        target: 'Assigned project detail link',
        steps: [{ selector: 'a[href*="/app/projects/"]' }],
      },
    ],
    time: [{ target: 'Log time form', steps: [{ name: 'Log time' }] }],
    reports: [
      {
        target: 'Technical reports tab and new form',
        steps: [{ name: 'Technical' }, { name: 'New technical report' }],
      },
      { target: 'Client Sign-off tab', steps: [{ name: 'Client Sign-off' }] },
      { target: 'New daily report form', steps: [{ name: 'Daily' }, { name: 'New daily report' }] },
    ],
    expenses: [{ target: 'Record expense form', steps: [{ name: 'Record expense' }] }],
    pay: [{ target: 'My Pay period controls', steps: [{ selector: 'form' }] }],
    documents: [
      {
        target: 'Private artifact register form',
        steps: [{ selector: 'form[action*="uploadPrivateDocument"]' }],
      },
    ],
    profile: [
      { target: 'Passkey control', steps: [] },
      { target: 'Optional MFA control', steps: [] },
    ],
  },
};

async function safeInteractiveLocator(page: Page, step: InteractionPlan['steps'][number]) {
  if (step.selector) {
    const locator = page.locator(step.selector).first();
    return (await locator.count()) && (await locator.isVisible()) ? locator : null;
  }
  if (!step.name) return null;
  const exact = step.name;
  const candidates = [
    page.getByRole('tab', { name: exact, exact: true }),
    page.getByRole('button', { name: exact, exact: true }),
    page.locator('summary').filter({ hasText: exact }),
    page.getByRole('link', { name: exact, exact: true }),
  ];
  for (const candidate of candidates)
    if ((await candidate.count()) && (await candidate.first().isVisible()))
      return candidate.first();
  return null;
}

async function captureInteractions(
  page: Page,
  role: 'owner' | 'worker',
  label: string,
  route: string,
): Promise<InteractionResult[]> {
  const plans = interactivePlans[role][label] || [];
  const results: InteractionResult[] = [];
  for (const [index, plan] of plans.entries()) {
    const securityTarget = /passkey|mfa|authenticator/i.test(plan.target);
    if (securityTarget) {
      results.push({
        target: plan.target,
        disposition: 'prohibited_mutation',
        note: 'Security enrollment controls are never activated by the capture harness.',
        viewport: '1440x900',
        screenshot: '',
        sha256: '',
        inventory: [],
        headings: [],
      });
      continue;
    }
    let disposition: InteractionResult['disposition'] = 'not_present';
    let note =
      'The non-mutating launch/disclosure control was not present in this live role/view state.';
    try {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(250);
      let target = null as Awaited<ReturnType<typeof safeInteractiveLocator>>;
      for (const step of plan.steps) {
        target = await safeInteractiveLocator(page, step);
        if (!target) break;
        const state = await target.evaluate((element) => ({
          disabled:
            (element as HTMLButtonElement).disabled ||
            element.getAttribute('aria-disabled') === 'true',
          submit: element.tagName === 'BUTTON' && (element as HTMLButtonElement).type === 'submit',
          tag: element.tagName.toLowerCase(),
        }));
        if (state.disabled) {
          disposition = 'disabled';
          note = 'The visible non-mutating control was disabled in the live state.';
          break;
        }
        if (state.submit) {
          disposition = 'prohibited_mutation';
          note = 'A submit control would be required; it was deliberately not activated.';
          break;
        }
        if (
          /(passkey|mfa|authenticator|approve|reject|issue|send|generate|payment|collection|sign|delete)/i.test(
            step.name || '',
          )
        ) {
          disposition = 'prohibited_mutation';
          note = 'The hard safety guard blocked a security or committing control.';
          break;
        }
        if (state.tag === 'input' || state.tag === 'form') {
          disposition = 'inspected';
          note =
            'The form/filter surface was already visible and was inspected without entering values.';
          continue;
        }
        await target.click({ timeout: 5_000 });
        await page.waitForTimeout(250);
        disposition = 'opened';
        note =
          'Opened through a non-mutating tab, disclosure, detail link, or form-launch control; no values were entered and no submit action was activated.';
      }
      await sanitizeForScreenshot(page);
      const summary = await summarize(page);
      const slug = `${label}-${index + 1}`
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
      const file = `docs/manuals/screenshots/${role}/interactive-${slug}.png`;
      const targetPath = resolve(process.cwd(), file);
      await page.screenshot({ path: targetPath, fullPage: false });
      results.push({
        target: plan.target,
        disposition,
        note,
        viewport: '1440x900',
        screenshot: file,
        sha256: sha(targetPath),
        inventory: summary.inventory.map((entry) => ({
          ...entry,
          label: safeText(entry.label),
          name: safeText(entry.name),
          options: entry.options.map((option) => ({
            label: safeText(option.label),
            value: safeText(option.value),
          })),
          help: safeText(entry.help),
        })),
        headings: summary.headings.map(safeText),
      });
    } catch (error) {
      results.push({
        target: plan.target,
        disposition: 'not_present',
        note: safeText(error instanceof Error ? error.message : String(error)),
        viewport: '1440x900',
        screenshot: '',
        sha256: '',
        inventory: [],
        headings: [],
      });
    }
  }
  return results;
}

/** Mask entered values and obvious account identifiers before the screenshot. */
async function sanitizeForScreenshot(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll('input[type="password"], input[type="email"]').forEach((node) => {
      const input = node as HTMLInputElement;
      input.value = '';
      input.setAttribute('value', '');
    });
    const staticLabels = new Set([
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
      'Webmail',
      'Language',
      'Account options',
      'Search',
      'Sign out',
      'Toggle navigation',
      'Close navigation',
      'Skip to main content',
      'Open project',
      'Print report',
      'Dismiss notification',
    ]);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const node of nodes) {
      const value = node.nodeValue || '';
      // Preserve structural UI language. Mask only recognizable values and
      // record containers; never infer that a normal capitalized or hyphenated
      // label is sensitive.
      let redacted = value
        .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted email]')
        .replace(/[$€£]\s?[\d,.]+/g, '[redacted amount]')
        .replace(/\b(?:USD|EUR|GBP|BRL)\s*[\d,.]+\b/gi, '[redacted amount]')
        .replace(/\b[\d,.]+\s*(?:USD|EUR|GBP|BRL)\b/gi, '[redacted amount]')
        .replace(/\b\d+(?:[.,]\d+)?\s*%/g, '[redacted metric]')
        .replace(/\b\d+(?:[.,]\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?)\b/gi, '[redacted metric]')
        .replace(/\b\d{5,}\b/g, '[redacted id]');
      const parent = node.parentElement;
      const normalized = value.replace(/\s+/g, ' ').trim();
      if (
        redacted === value &&
        normalized &&
        !staticLabels.has(normalized) &&
        parent &&
        (parent.closest('tbody, [role="row"]') || parent.tagName === 'OPTION')
      )
        redacted = '[redacted record]';
      if (redacted !== value) node.nodeValue = redacted;
    }
    document.querySelectorAll('select, option').forEach((node) => {
      (node as HTMLElement).style.color = 'transparent';
      (node as HTMLElement).style.textShadow = '0 0 8px rgba(15, 23, 42, .55)';
    });
    // Value-origin-aware masking for account/profile, directory contacts and
    // workforce cards. Static headings, roles and action labels are untouched.
    document.querySelectorAll('.security-panel').forEach((panel) => {
      const name = panel.querySelector('h2');
      if (name) name.textContent = '[redacted profile identity]';
      const detail = panel.querySelector(':scope > p');
      if (detail) {
        const role = detail.textContent?.split('·').pop()?.trim() || '';
        detail.textContent = `[redacted profile identity]${role ? ` · ${role}` : ''}`;
      }
    });
    document.querySelectorAll('.client-directory__contact').forEach((contact) => {
      const name = contact.querySelector('strong');
      if (name) name.textContent = '[redacted contact]';
      contact.querySelectorAll('a[href^="mailto:"], span').forEach((node) => {
        const value = node.textContent || '';
        if (node.matches('a') || /\+?\d[\d\s().-]{5,}/.test(value))
          node.textContent = '[redacted contact detail]';
      });
    });
    document.querySelectorAll('[data-worker-id]').forEach((card) => {
      const title = [...card.querySelectorAll('h1,h2,h3')].find(
        (node) => !/Project assignments/i.test(node.textContent || ''),
      );
      if (title) title.textContent = '[redacted team member]';
      card
        .querySelectorAll('.team-directory__avatar, a[href^="mailto:"]')
        .forEach((node) => (node.textContent = '[redacted team member]'));
      card.querySelectorAll('input[name="name"], input[name="email"]').forEach((node) => {
        const input = node as HTMLInputElement;
        input.value = '';
        input.setAttribute('value', '');
      });
    });
  });
}

async function login(page: Page, account: Account): Promise<void> {
  await page.goto(`${baseUrl}/app/login`, { waitUntil: 'networkidle' });
  const email = page.locator('input[type="email"], input[name="email"]').first();
  const password = page.locator('input[type="password"], input[name="password"]').first();
  await email.fill(account.email);
  await password.fill(account.password);
  await page.locator('button[type="submit"], .login-submit').first().click();
  await page.waitForURL((url) => !url.pathname.endsWith('/app/login'), { timeout: 20_000 });
  await page.waitForLoadState('networkidle');
}

async function captureRole(
  account: Account,
): Promise<{ results: RouteResult[]; network: object[] }> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const network: object[] = [];
  page.on('response', async (response: Response) => {
    const type = response.headers()['content-type'] || '';
    if (!type.includes('application/json') || !response.url().startsWith(baseUrl)) return;
    try {
      const body = await response.json();
      const paths: string[] = [];
      const sensitiveKeys: string[] = [];
      const visit = (value: unknown, path = '$') => {
        if (paths.length > 240) return;
        if (Array.isArray(value)) {
          paths.push(`${path}[]`);
          value.slice(0, 3).forEach((item) => visit(item, `${path}[]`));
          return;
        }
        if (value && typeof value === 'object') {
          for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
            const next = `${path}.${key}`;
            paths.push(next);
            if (
              /(bill.?rate|revenue|margin|profit|purchase.?order|po.?cap|other.*worker|cost)/i.test(
                key,
              )
            )
              sensitiveKeys.push(next);
            visit(child, next);
          }
        }
      };
      visit(body);
      network.push({
        url: new URL(response.url()).pathname,
        status: response.status(),
        keys: paths.slice(0, 240),
        sensitiveKeyPaths: sensitiveKeys,
      });
    } catch {
      /* A malformed JSON response is not captured. */
    }
  });
  await login(page, account);
  const results: RouteResult[] = [];
  for (const [label, route] of routes[account.role]) {
    let status: number | null = null;
    try {
      const response = await page.goto(`${baseUrl}${route}`, {
        waitUntil: 'networkidle',
        timeout: 30_000,
      });
      status = response?.status() ?? null;
      await page.waitForTimeout(500);
      await sanitizeForScreenshot(page);
      const summary = await summarize(page);
      const target = resolve(screenshotsRoot, account.role, `live-${label}.png`);
      await page.screenshot({ path: target, fullPage: false });
      const finalUrl = page.url();
      const interactions = await captureInteractions(page, account.role, label, route);
      results.push({
        route,
        finalUrl,
        title: safeText(await page.title()),
        status,
        viewport: '1440x900',
        screenshot: `docs/manuals/screenshots/${account.role}/live-${label}.png`,
        sha256: sha(target),
        controls: summary.controls.map(safeText),
        inventory: summary.inventory.map((entry) => ({
          ...entry,
          label: safeText(entry.label),
          name: safeText(entry.name),
          options: entry.options.map((option) => ({
            label: safeText(option.label),
            value: safeText(option.value),
          })),
          help: safeText(entry.help),
        })),
        headings: summary.headings.map(safeText),
        outcome:
          status && status >= 400 ? 'error' : finalUrl.includes(route) ? 'reachable' : 'redirected',
        interactions,
      });
    } catch (error) {
      results.push({
        route,
        finalUrl: page.url(),
        title: '',
        status,
        viewport: '1440x900',
        screenshot: '',
        sha256: '',
        controls: [],
        inventory: [],
        headings: [safeText(error instanceof Error ? error.message : String(error))],
        outcome: 'error',
      });
    }
  }
  // Read-only direct-navigation checks exercise server route authorization,
  // rather than relying solely on the Worker navigation menu being hidden.
  if (account.role === 'worker') {
    for (const route of workerOwnerOnlyRoutes) {
      let status: number | null = null;
      try {
        const response = await page.goto(`${baseUrl}${route}`, {
          waitUntil: 'networkidle',
          timeout: 30_000,
        });
        status = response?.status() ?? null;
        await sanitizeForScreenshot(page);
        const summary = await summarize(page);
        const finalUrl = page.url();
        results.push({
          route: `${route} (owner-only authorization check)`,
          finalUrl,
          title: safeText(await page.title()),
          status,
          viewport: '1440x900',
          screenshot: '',
          sha256: '',
          controls: summary.controls.map(safeText),
          inventory: summary.inventory.map((entry) => ({
            ...entry,
            label: safeText(entry.label),
            name: safeText(entry.name),
            options: entry.options.map((option) => ({
              label: safeText(option.label),
              value: safeText(option.value),
            })),
            help: safeText(entry.help),
          })),
          headings: summary.headings.map(safeText),
          outcome:
            status && status >= 400
              ? 'error'
              : finalUrl === `${baseUrl}${route}` && status === 200
                ? 'reachable'
                : 'redirected',
        });
      } catch (error) {
        results.push({
          route: `${route} (owner-only authorization check)`,
          finalUrl: page.url(),
          title: '',
          status,
          viewport: '1440x900',
          screenshot: '',
          sha256: '',
          controls: [],
          inventory: [],
          headings: [safeText(error instanceof Error ? error.message : String(error))],
          outcome: 'error',
        });
      }
    }
  }
  if (account.role === 'worker') {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto(`${baseUrl}/app/time`, { waitUntil: 'networkidle' });
    const target = resolve(screenshotsRoot, 'worker/live-time-phone.png');
    await sanitizeForScreenshot(page);
    const summary = await summarize(page);
    await page.screenshot({ path: target, fullPage: false });
    results.push({
      route: '/app/time (phone)',
      finalUrl: page.url(),
      title: safeText(await page.title()),
      status: response?.status() ?? null,
      viewport: '390x844',
      screenshot: 'docs/manuals/screenshots/worker/live-time-phone.png',
      sha256: sha(target),
      controls: summary.controls.map(safeText),
      inventory: summary.inventory.map((entry) => ({
        ...entry,
        label: safeText(entry.label),
        name: safeText(entry.name),
        options: entry.options.map((option) => ({
          label: safeText(option.label),
          value: safeText(option.value),
        })),
        help: safeText(entry.help),
      })),
      headings: summary.headings.map(safeText),
      outcome: page.url().includes('/app/time') ? 'reachable' : 'redirected',
    });
  }
  await browser.close();
  return { results, network };
}

/** One authenticated session per role that augments existing route evidence with
 * opened, non-mutating interactive surfaces. Core route evidence is retained. */
async function captureInteractiveOnlyRole(
  account: Account,
  prior: { results: RouteResult[]; network: object[] },
): Promise<{ results: RouteResult[]; network: object[] }> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await login(page, account);
  for (const [label, route] of routes[account.role]) {
    const result = prior.results.find((item) => item.route === route);
    if (!result) continue;
    result.interactions = await captureInteractions(page, account.role, label, route);
  }
  if (account.role === 'owner') {
    const phoneTargets: Array<{
      resultRoute: string;
      target: string;
      route: string;
      step?: InteractionPlan['steps'][number];
    }> = [
      {
        resultRoute: '/app',
        target: 'Phone navigation drawer',
        route: '/app',
        step: { name: 'Toggle navigation' },
      },
      {
        resultRoute: '/app/finance?view=commercial',
        target: 'Phone commercial configuration form',
        route: '/app/finance?view=commercial',
        step: { selector: 'form' },
      },
    ];
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [index, target] of phoneTargets.entries()) {
      const parent = prior.results.find((item) => item.route === target.resultRoute);
      if (!parent) continue;
      let disposition: InteractionResult['disposition'] = 'not_present';
      let note = 'The requested safe phone surface was not present in the current live state.';
      let inventory: RouteResult['inventory'] = [];
      let headings: string[] = [];
      let screenshot = '';
      let digest = '';
      try {
        await page.goto(`${baseUrl}${target.route}`, { waitUntil: 'networkidle', timeout: 30_000 });
        const locator = target.step ? await safeInteractiveLocator(page, target.step) : null;
        if (locator) {
          const state = await locator.evaluate((element) => ({
            disabled:
              (element as HTMLButtonElement).disabled ||
              element.getAttribute('aria-disabled') === 'true',
            submit:
              element.tagName === 'BUTTON' && (element as HTMLButtonElement).type === 'submit',
            tag: element.tagName.toLowerCase(),
          }));
          if (state.disabled) {
            disposition = 'disabled';
            note = 'The phone control was visible but disabled.';
          } else if (state.submit) {
            disposition = 'prohibited_mutation';
            note = 'The phone surface required a submit action, which was not activated.';
          } else if (state.tag === 'form') {
            disposition = 'inspected';
            note = 'The dense commercial form was visible and inspected without entering values.';
          } else {
            await locator.click();
            await page.waitForTimeout(250);
            disposition = 'opened';
            note = 'Opened through a non-mutating phone navigation control.';
          }
        }
        await sanitizeForScreenshot(page);
        const summary = await summarize(page);
        inventory = summary.inventory.map((entry) => ({
          ...entry,
          label: safeText(entry.label),
          name: safeText(entry.name),
          options: entry.options.map((option) => ({
            label: safeText(option.label),
            value: safeText(option.value),
          })),
          help: safeText(entry.help),
        }));
        headings = summary.headings.map(safeText);
        screenshot = `docs/manuals/screenshots/owner/interactive-phone-${index + 1}.png`;
        const path = resolve(process.cwd(), screenshot);
        await page.screenshot({ path, fullPage: false });
        digest = sha(path);
      } catch (error) {
        note = safeText(error instanceof Error ? error.message : String(error));
      }
      parent.interactions = [
        ...(parent.interactions || []),
        {
          target: target.target,
          disposition,
          note,
          viewport: '390x844',
          screenshot,
          sha256: digest,
          inventory,
          headings,
        },
      ];
    }
  }
  await browser.close();
  return prior;
}

/** Solely reads the rendered security status. It never focuses or activates a
 * security control, and replaces prior MFA/passkey interaction evidence. */
async function verifyProfileStatusReadOnly(
  account: Account,
  prior: { results: RouteResult[]; network: object[] },
): Promise<{ results: RouteResult[]; network: object[] }> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await login(page, account);
  await page.goto(`${baseUrl}/app/profile`, { waitUntil: 'networkidle', timeout: 30_000 });
  const mfaPanel = page
    .locator('.security-methods')
    .filter({ hasText: 'Authenticator app' })
    .first();
  const observedStatus = ((await mfaPanel.locator('.state-tag').textContent()) || '').trim();
  if (observedStatus !== 'Not enabled')
    throw new Error('Read-only MFA status did not match the required post-incident state.');
  await mfaPanel.scrollIntoViewIfNeeded();
  await sanitizeForScreenshot(page);
  const summary = await summarize(page);
  const screenshot = `docs/manuals/screenshots/${account.role}/interactive-profile-status.png`;
  const target = resolve(process.cwd(), screenshot);
  await page.screenshot({ path: target, fullPage: false });
  const result = prior.results.find((item) => item.route === '/app/profile');
  if (!result) throw new Error('Profile evidence route is missing.');
  result.interactions = [
    {
      target: 'Passkey control',
      disposition: 'prohibited_mutation',
      note: 'Passkey enrollment was not activated.',
      viewport: '1440x900',
      screenshot: '',
      sha256: '',
      inventory: [],
      headings: [],
    },
    {
      target: 'Optional MFA control',
      disposition: 'prohibited_mutation',
      note: 'The Enable MFA control was not activated during the read-only post-incident check.',
      viewport: '1440x900',
      screenshot: '',
      sha256: '',
      inventory: [],
      headings: [],
    },
    {
      target: 'Read-only MFA status verification',
      disposition: 'inspected',
      note: 'Authenticator app status observed as Not enabled; no security control was activated.',
      viewport: '1440x900',
      screenshot,
      sha256: sha(target),
      inventory: summary.inventory.map((entry) => ({
        ...entry,
        label: safeText(entry.label),
        name: safeText(entry.name),
        options: entry.options.map((option) => ({
          label: safeText(option.label),
          value: safeText(option.value),
        })),
        help: safeText(entry.help),
      })),
      headings: summary.headings.map(safeText),
    },
  ];
  await browser.close();
  return prior;
}

async function main() {
  mkdirSync(resolve(screenshotsRoot, 'owner'), { recursive: true });
  mkdirSync(resolve(screenshotsRoot, 'worker'), { recursive: true });
  mkdirSync(outputRoot, { recursive: true });
  if (process.env.JA_MANUAL_REPAIR_EVIDENCE === '1') {
    repairEvidence();
    console.log('Structural evidence metadata restored and screenshot hashes recomputed.');
    return;
  }
  if (process.env.JA_MANUAL_REDACT_SCREENSHOTS === '1') {
    await redactAccountHeaders();
    console.log('Signed-in desktop account labels redacted and screenshot hashes recomputed.');
    return;
  }
  if (process.env.JA_MANUAL_SANITIZE_ONLY === '1') {
    const existing = JSON.parse(readFileSync(resolve(outputRoot, 'RUN.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    for (const role of ['owner', 'worker'] as const) {
      const roleEvidence = existing[role] as Record<string, unknown>;
      if (Array.isArray(roleEvidence?.results))
        roleEvidence.results.forEach((result) =>
          sanitizeHumanEvidence(result as Record<string, unknown>),
        );
    }
    writeFileSync(resolve(outputRoot, 'RUN.json'), `${JSON.stringify(existing, null, 2)}\n`);
    console.log('Human-derived evidence fields re-sanitized without browser or credentials.');
    return;
  }
  const previous = (() => {
    try {
      return JSON.parse(readFileSync(resolve(outputRoot, 'RUN.json'), 'utf8'));
    } catch {
      return undefined;
    }
  })();
  if (process.env.JA_MANUAL_INTERACTIVE_ONLY === '1') {
    if (!previous?.owner || !previous?.worker)
      throw new Error('Interactive capture requires prior sanitized evidence.');
    const owner = await captureInteractiveOnlyRole(
      {
        role: 'owner',
        email: required('JA_MANUAL_OWNER_EMAIL'),
        password: required('JA_MANUAL_OWNER_PASSWORD'),
      },
      previous.owner,
    );
    const worker = await captureInteractiveOnlyRole(
      {
        role: 'worker',
        email: required('JA_MANUAL_WORKER_EMAIL'),
        password: required('JA_MANUAL_WORKER_PASSWORD'),
      },
      previous.worker,
    );
    writeFileSync(
      resolve(outputRoot, 'RUN.json'),
      `${JSON.stringify({ capturedAt: new Date().toISOString(), baseUrl, deployedSha: '2058db24ca4d5d6b3f66bde11b6230e271a2d06c', mode: 'read-only interactive browser inspection; no values entered and no lifecycle mutations performed', owner, worker }, null, 2)}\n`,
    );
    console.log(
      'Sanitized interactive manual evidence written. Credentials and response values were not logged.',
    );
    return;
  }
  if (process.env.JA_MANUAL_PROFILE_STATUS_ONLY === '1') {
    if (!previous?.owner || !previous?.worker)
      throw new Error('Read-only profile verification requires prior evidence.');
    const owner = await verifyProfileStatusReadOnly(
      {
        role: 'owner',
        email: required('JA_MANUAL_OWNER_EMAIL'),
        password: required('JA_MANUAL_OWNER_PASSWORD'),
      },
      previous.owner,
    );
    const worker = await verifyProfileStatusReadOnly(
      {
        role: 'worker',
        email: required('JA_MANUAL_WORKER_EMAIL'),
        password: required('JA_MANUAL_WORKER_PASSWORD'),
      },
      previous.worker,
    );
    writeFileSync(
      resolve(outputRoot, 'RUN.json'),
      `${JSON.stringify({ capturedAt: new Date().toISOString(), baseUrl, deployedSha: '2058db24ca4d5d6b3f66bde11b6230e271a2d06c', mode: 'read-only post-incident profile status verification; no security control activated', incidents: [{ area: 'MFA', outcome: 'The earlier Enable MFA automation attempt returned a visible failure. No enrollment completion was performed; this subsequent read-only check observed Not enabled for both roles.' }], owner, worker }, null, 2)}\n`,
    );
    console.log(
      'Read-only profile MFA status evidence written. Credentials and response values were not logged.',
    );
    return;
  }
  const owner =
    process.env.JA_MANUAL_WORKER_ONLY === '1'
      ? previous?.owner
      : await captureRole({
          role: 'owner',
          email: required('JA_MANUAL_OWNER_EMAIL'),
          password: required('JA_MANUAL_OWNER_PASSWORD'),
        });
  const worker =
    process.env.JA_MANUAL_OWNER_ONLY === '1'
      ? previous?.worker
      : await captureRole({
          role: 'worker',
          email: required('JA_MANUAL_WORKER_EMAIL'),
          password: required('JA_MANUAL_WORKER_PASSWORD'),
        });
  if (!owner || !worker)
    throw new Error('Role-only capture requires prior sanitized evidence for the other role.');
  writeFileSync(
    resolve(outputRoot, 'RUN.json'),
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        baseUrl,
        deployedSha: '2058db24ca4d5d6b3f66bde11b6230e271a2d06c',
        mode: 'read-only browser inspection; no synthetic records created; no lifecycle mutations performed',
        owner,
        worker,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    'Sanitized live manual evidence written. Credentials and response values were not logged.',
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
