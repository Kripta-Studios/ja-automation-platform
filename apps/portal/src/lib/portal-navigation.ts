export type NavItem = {
  section: string;
  label: string;
  icon: string;
  href?: string;
  financeOnly?: boolean;
};

export type PortalRole =
  | 'worker'
  | 'project_manager'
  | 'finance_admin'
  | 'owner_admin'
  | 'auditor_read_only';

/**
 * The navigation contract is deliberately a projection of permissions, not a
 * list of every route the portal happens to expose.  Route authorization still
 * lives on the server; this contract keeps the role's normal workflow legible
 * and prevents confidential destinations from becoming navigation clutter.
 */
export type PortalNavigation = {
  primary: readonly NavItem[];
  secondary: readonly NavItem[];
  admin: readonly NavItem[];
  security: readonly NavItem[];
};

export type NavSubsection = { label: string; href: string };

/** Carry only an authorized project selection between the related finance views. */
export function financeProjectNavigationHref(
  href: string,
  {
    base,
    section,
    url,
    projectId,
  }: { base: string; section: string; url: URL; projectId?: string },
): string {
  if (section !== 'finance' || !projectId) return href;
  const target = new URL(href, url);
  const financePath = `${base}/app/finance`;
  const views = ['overview', 'economic', 'commercial'];
  if (
    url.pathname.replace(/\/+$/u, '') !== financePath ||
    target.origin !== url.origin ||
    target.pathname.replace(/\/+$/u, '') !== financePath ||
    !views.includes(url.searchParams.get('view') || 'overview') ||
    !views.includes(target.searchParams.get('view') || 'overview') ||
    target.searchParams.has('project')
  )
    return href;
  target.searchParams.set('project', projectId);
  return `${target.pathname}${target.search}${target.hash}`;
}

/**
 * Only link to sections that the destination renders for this role. The
 * ordinary row remains the page link; these are optional shortcuts into its
 * existing tabs and stable element IDs.
 */
export function subsectionsForNavItem(
  item: NavItem,
  href: string,
  role?: string | null,
): readonly NavSubsection[] {
  const link = (label: string, hash?: string, params?: Record<string, string>): NavSubsection => {
    const target = new URL(href, 'https://portal.invalid');
    for (const [key, value] of Object.entries(params ?? {})) target.searchParams.set(key, value);
    if (hash) target.hash = hash;
    return { label, href: `${target.pathname}${target.search}${target.hash}` };
  };
  const owner = role === 'owner_admin';
  const finance = role === 'finance_admin' || owner;

  if (item.section === 'today' && role === 'worker')
    return [
      link('Your workday', '#agenda-heading'),
      link('Upcoming assignments', '#upcoming-assignments-heading'),
    ];
  if (item.section === 'today' && (owner || role === 'project_manager'))
    return [
      link('Field operations overview', '#dashboard-overview'),
      link('Active project board', '#dashboard-project-board'),
    ];
  if (item.section === 'time') {
    return [
      ...(owner ? [link('Enter a week in a table', '#time-owner-batch-title')] : []),
      link('Filter time entries', '#time-filters'),
      link('Recent time entries', '#time-records'),
    ];
  }
  if (item.section === 'expenses')
    return [
      link('Filter expenses', '#expense-register-filters'),
      link('Recent expenses', '#expense-records'),
    ];
  if (item.section === 'reports')
    return [
      link('Daily', '#report-panel-daily', { view: 'daily' }),
      link('Technical / PLC', '#report-panel-technical', { view: 'technical' }),
      link('Client Sign-off', '#report-panel-signoff', { view: 'signoff' }),
    ];
  if (item.section === 'projects' && item.label === 'Projects')
    return role === 'project_manager'
      ? [link('Authorized projects'), link('Assign worker', undefined, { action: 'assign-worker' })]
      : owner || role === 'finance_admin'
        ? [
            link('Project calendar', '#project-calendar'),
            link('Project register', '#project-register'),
            ...(owner ? [link('Assignment history', '#assignment-history')] : []),
          ]
        : [];
  if (item.section === 'projects' && item.label === 'Clients')
    return [
      link('Filter clients', '#client-directory-filters'),
      link('Clients', '#client-directory-list'),
    ];
  if (item.section === 'projects' && item.label === 'Team')
    return [
      link('Specialists', '#team-panel-specialists', { directory: 'specialists' }),
      link('Search team', '#team-search', { directory: 'specialists' }),
    ];
  if (item.section === 'approvals')
    return [
      link('Time', '#approval-queue', { tab: 'time' }),
      link('Expenses', '#approval-queue', { tab: 'expenses' }),
      link('Reports', '#approval-queue', { tab: 'reports' }),
    ];
  if (item.section === 'planning')
    return [
      link('Planning', '#planning-day-agenda'),
      ...(owner || role === 'project_manager'
        ? [link('Publish assignment', '#planning-create-form')]
        : []),
      ...(owner ? [link('Manage worker expertise', '#planning-skills')] : []),
    ];
  if (item.section === 'documents')
    return [
      link('Register a private artifact', '#document-upload'),
      link('Documents', '#document-list'),
    ];
  if (item.section === 'supplier' && item.label !== 'Operational report') {
    const workspace = (label: string, action: string): NavSubsection =>
      link(label, '#supplier-workspace', { workspaceAction: action });
    return owner
      ? [
          workspace('Supplier directory', 'directory'),
          workspace('Supplier setup', 'setup'),
          workspace('Supplier access', 'authorize'),
          workspace('Supplier personnel', 'personnel'),
          workspace('Supplier report', 'report'),
        ]
      : [
          workspace('Supplier personnel', 'personnel'),
          workspace('Supplier time', 'time'),
          workspace('Supplier report', 'report'),
        ];
  }
  if (item.section === 'supplier' && item.label === 'Operational report')
    return [
      link('Project', '#supplier-report-project'),
      link('Operational report', '#supplier-report'),
    ];
  if (item.section === 'crew')
    return owner
      ? [link('Assign a crew chief', '#crew-assign'), link('Crew delegations', '#crew-delegations')]
      : [link('Project', '#crew-project'), link('Work date', '#crew-date')];
  if (item.section === 'manage' && owner)
    return [
      link('Operational records', undefined, { type: 'expense' }),
      link('Planning', undefined, { area: 'planning_assignment' }),
      link('Availability', undefined, { area: 'worker_availability' }),
      link('Documents', undefined, { area: 'document' }),
      link('Technical changes', undefined, { area: 'technical_change' }),
      link('Milestones', undefined, { area: 'project_milestone' }),
    ];
  if (item.section === 'finance' && item.label === 'Finance Overview')
    return [
      link('Forecast and budget control', '#finance-alerts'),
      link('Source records', '#finance-source-records', { view: 'economic' }),
    ];
  if (item.section === 'finance' && item.label === 'Economic Review')
    return [
      link('Portfolio views', '#finance-source-records', { source: 'portfolio' }),
      link('Workers', '#finance-source-records', { source: 'workers' }),
      link('Time', '#finance-source-records', { source: 'time' }),
      link('Expenses', '#finance-source-records', { source: 'expenses' }),
      link('Compensation settlements', '#worker-payments', { source: 'settlements' }),
    ];
  if (item.section === 'finance' && item.label === 'Commercial Configuration' && finance)
    return [
      link('How labor terms are selected', '#commercial-terms-summary'),
      link('Worker compensation', '#finance-rule-registers', {
        task: 'Worker compensation',
      }),
      link('Internal loaded cost', '#finance-rule-registers', {
        task: 'Internal loaded cost',
      }),
      link('Project issuing authority', '#project-issuing-authority', {
        task: 'Project issuing authority',
      }),
      link('Project commercial and time policy', '#project-commercial-policy', {
        task: 'Project commercial and time policy',
      }),
    ];
  if (item.section === 'billing')
    return [
      link('Invoices', undefined, { view: 'invoices' }),
      link('Billing streams', undefined, { view: 'streams' }),
      ...(finance ? [link('Configure billing', undefined, { view: 'setup' })] : []),
    ];
  if (item.section === 'ledger')
    return [
      link('Filter collections', '#collections-ledger-filters'),
      link('Collections / Ledger', '#collections-ledger-register'),
    ];
  if (item.section === 'accounting')
    return [
      ...(finance ? [link('Generate monthly Accounting Pack', '#accounting-generate')] : []),
      link('Accounting Pack register', '#accounting-register'),
    ];
  if (item.section === 'pay')
    return [
      link('Worker statement', '#pay-export-title'),
      link('Own activity detail', '#pay-activity-title'),
      link('Reimbursement status', '#pay-reimbursements-title'),
    ];
  if (item.section === 'profile')
    return [
      link('Expertise and availability', '#profile-skills'),
      link('Profile & security', '#account-mfa'),
    ];
  return [];
}

/**
 * Resolve the authenticated user's landing destination. Finance roles do not
 * have an operational Today destination in their allowlist, so the portal
 * root must land on the read-only Finance Overview instead of rendering a
 * page with no active navigation item.
 */
export function portalLandingForRole(base: string, role?: string | null): string {
  if (role === 'finance_admin' || role === 'auditor_read_only') {
    return `${base}/app/finance?view=overview`;
  }
  return `${base}/app/`;
}

const item = (section: string, label: string, icon: string, href?: string): NavItem => ({
  section,
  label,
  icon,
  ...(href ? { href } : {}),
});

/**
 * Return the allowlisted navigation for a role.  Unknown or missing roles use
 * the worker-safe menu so an incomplete session cannot reveal administrative
 * or financial destinations through the shell.
 */
export function portalNavigationForRole(
  base: string,
  role?: string | null,
  workforceProfile?: string,
): PortalNavigation {
  const route = (section: string, view?: string): string =>
    `${base}/app/${section}${view ? `?view=${encodeURIComponent(view)}` : ''}`;

  if (workforceProfile === 'external_technician' || workforceProfile === 'supplier_coordinator')
    return {
      primary: [
        ...(workforceProfile === 'supplier_coordinator'
          ? [item('supplier', 'Supplier team', '◌')]
          : []),
        item('time', 'Time', '◷'),
        item('expenses', 'Expenses', '◇'),
        item('reports', 'Reports', '▤'),
      ],
      secondary: [
        item('supplier', 'Operational report', '▤', route('supplier/report')),
        item('profile', 'Profile', '◎'),
        item('help', 'Help', '?'),
      ],
      admin: [],
      security: [],
    };

  const worker: PortalNavigation = {
    primary: [
      item('today', 'Today', '⌂'),
      item('time', 'Time', '◷'),
      item('expenses', 'Expenses', '◇'),
      item('reports', 'Reports', '▤'),
    ],
    secondary: [
      item('crew', 'Crew hours', '◌'),
      item('pay', 'My Pay', '$'),
      item('profile', 'Profile', '◎'),
    ],
    admin: [],
    security: [],
  };

  switch (role) {
    case 'project_manager':
      return {
        primary: [
          item('today', 'Dashboard', '⌂'),
          item('projects', 'Projects', '▦'),
          item('approvals', 'Approvals', '✓'),
          item('reports', 'Reports', '▤'),
        ],
        secondary: [
          item('time', 'Time', '◷'),
          item('expenses', 'Expenses', '◇'),
          item('pay', 'My Pay', '$'),
          item('projects', 'Team', '◌', route('projects', 'team')),
          item('planning', 'Planning', '⌘'),
          item('documents', 'Documents', '▧'),
          item('profile', 'Profile', '◎'),
        ],
        admin: [],
        security: [],
      };
    case 'finance_admin':
      return {
        primary: [
          item('finance', 'Finance Overview', '↗', route('finance', 'overview')),
          item('projects', 'Projects', '▦'),
          item('finance', 'Economic Review', '∑', route('finance', 'economic')),
          item('billing', 'Billing', '◫'),
        ],
        secondary: [
          item('approvals', 'Approvals', '✓'),
          item('ledger', 'Collections / Ledger', '▤'),
          item('accounting', 'Accounting', '▥'),
          item('finance', 'Commercial Configuration', '⚙', route('finance', 'commercial')),
          item('documents', 'Documents', '▧'),
          item('profile', 'Profile', '◎'),
        ],
        admin: [],
        security: [],
      };
    case 'owner_admin':
      return {
        primary: [
          item('today', 'Dashboard', '⌂'),
          item('projects', 'Projects', '▦'),
          item('approvals', 'Approvals', '✓'),
          item('reports', 'Reports', '▤'),
        ],
        secondary: [
          item('projects', 'Clients', '◉', route('projects', 'clients')),
          item('projects', 'Team', '◌', route('projects', 'team')),
          item('supplier', 'Suppliers', '◌'),
          item('crew', 'Crew hours', '◌'),
          item('time', 'Time', '◷'),
          item('expenses', 'Expenses', '◇'),
          item('planning', 'Planning', '⌘'),
          item('documents', 'Documents', '▧'),
          item('finance', 'Finance Overview', '↗', route('finance', 'overview')),
          item('finance', 'Economic Review', '∑', route('finance', 'economic')),
          item('billing', 'Billing', '◫'),
          item('ledger', 'Collections / Ledger', '▤'),
          item('accounting', 'Accounting', '▥'),
          item('finance', 'Commercial Configuration', '⚙', route('finance', 'commercial')),
          item('profile', 'Profile', '◎'),
        ],
        admin: [item('manage', 'Data management', '⚙')],
        security: [item('audit', 'Audit', '⌁')],
      };
    case 'auditor_read_only':
      return {
        primary: [
          item('finance', 'Finance Overview', '↗', route('finance', 'overview')),
          item('finance', 'Economic Review', '∑', route('finance', 'economic')),
        ],
        secondary: [
          item('ledger', 'Collections / Ledger', '▤'),
          item('accounting', 'Accounting', '▥'),
          item('profile', 'Profile', '◎'),
        ],
        admin: [],
        security: [item('audit', 'Audit', '⌁')],
      };
    case 'worker':
    default:
      return worker;
  }
}

/** Short alias for callers that only need the role projection. */
export const navigationForRole = portalNavigationForRole;

/**
 * Project the role-authorized primary navigation onto the compact phone bar.
 * The drawer remains the source of truth for secondary and administrative
 * destinations; this helper only limits presentation and never adds routes.
 */
export function mobilePrimaryNavigationFor(navigation: PortalNavigation): readonly NavItem[] {
  return navigation.primary.slice(0, 4);
}

export type PortalNavigationLocation = {
  base: string;
  section: string;
  url: URL;
  role?: string | null;
  itemHref: (item: NavItem) => string;
};

/**
 * Identify one destination from its route and view, independently of filters,
 * sorting, pagination or language. Pass the complete navigation, including
 * secondary views, even when rendering only the compact primary phone bar.
 */
export function activeNavItem(
  items: readonly NavItem[],
  { base, section, url, role, itemHref }: PortalNavigationLocation,
): NavItem | undefined {
  const pathname = (target: URL): string => target.pathname.replace(/\/+$/u, '');
  const root = `${base}/app`;
  const current = pathname(url) === root ? new URL(portalLandingForRole(base, role), url) : url;
  const currentPath = pathname(current);
  const candidates = items.map((item) => ({ item, target: new URL(itemHref(item), url) }));
  const matchingPaths = candidates.filter(({ target }) => {
    const targetPath = pathname(target);
    return (
      targetPath === currentPath ||
      (targetPath !== root && currentPath.startsWith(`${targetPath}/`))
    );
  });
  // A supplier's operational report is a distinct destination beneath the
  // supplier section. Prefer the closest route before comparing query views.
  const closestPathLength = Math.max(...matchingPaths.map(({ target }) => pathname(target).length));
  const available = matchingPaths.length
    ? matchingPaths.filter(({ target }) => pathname(target).length === closestPathLength)
    : candidates.filter(({ item }) => item.section === section);
  const view = current.searchParams.get('view') ?? '';
  return (
    available.find(({ target }) => (target.searchParams.get('view') ?? '') === view) ??
    available.find(({ target }) => !target.searchParams.get('view')) ??
    available[0]
  )?.item;
}

export function isNavItemActive(
  item: NavItem,
  items: readonly NavItem[],
  location: PortalNavigationLocation,
): boolean {
  return activeNavItem(items, location) === item;
}

/** Personal inbox access follows the server's internal-workforce role boundary. */
export function portalGlobalNavigationForRole(
  role?: string | null,
  workforceProfile?: string,
): readonly NavItem[] {
  if (
    workforceProfile ||
    !['worker', 'project_manager', 'finance_admin', 'owner_admin', 'auditor_read_only'].includes(
      role ?? '',
    )
  )
    return [];
  return [item('notifications', 'Notifications', '♧')];
}

/**
 * Keep the account menu a small, role-safe projection of the navigation that
 * the shell already received, including authorized personal destinations.
 */
export function accountNavigationFor(
  navigation: PortalNavigation,
  globalNavigation: readonly NavItem[] = [],
): NavItem[] {
  const seen = new Set<string>();
  const allowedSections = new Set(['pay', 'documents', 'profile', 'notifications']);
  const candidates = [
    ...navigation.primary,
    ...navigation.secondary,
    ...navigation.admin,
    ...navigation.security,
    ...globalNavigation,
  ];

  return candidates.filter((item) => {
    if (!allowedSections.has(item.section) || seen.has(item.section)) return false;
    seen.add(item.section);
    return true;
  });
}

/**
 * Compatibility projections for older browser helpers.  The shell no longer
 * composes these independent lists; all production navigation goes through
 * `portalNavigationForRole` above.
 */
export const primaryNavigation: NavItem[] = [...portalNavigationForRole('', 'worker').primary];
export const secondaryNavigation: NavItem[] = [...portalNavigationForRole('', 'worker').secondary];
export function adminNavigation(base: string): NavItem[] {
  const owner = portalNavigationForRole(base, 'owner_admin');
  return [...owner.primary, ...owner.secondary, ...owner.security];
}
export const securityNavigation: NavItem[] = [
  ...portalNavigationForRole('', 'owner_admin').security,
];

export const portalTitles: Record<string, string> = {
  today: 'Today',
  time: 'Time entries',
  reports: 'Daily and technical reports',
  expenses: 'Expenses and receipts',
  projects: 'Projects',
  pay: 'My Pay',
  documents: 'Documents',
  notifications: 'Notifications',
  profile: 'Profile and security',
  planning: 'Resource planning',
  approvals: 'Approval queue',
  billing: 'Billing',
  finance: 'Project finance',
  ledger: 'Collections / Ledger',
  accounting: 'Monthly Accounting Pack',
  audit: 'Audit log',
};

/** Titles for navigation items that share a route but expose a query view. */
export const portalViewTitles: Record<string, Record<string, string>> = {
  projects: {
    clients: 'Client contacts',
    team: 'Team access',
  },
  reports: {
    technical: 'PLC / technical reports',
  },
  billing: {
    invoices: 'Invoices',
    streams: 'Billing streams',
  },
  finance: {
    overview: 'Finance Overview',
    economic: 'Economic Review',
    commercial: 'Commercial Configuration',
  },
};

export function portalTitleFor(section: string, view?: string | null): string {
  return (view && portalViewTitles[section]?.[view]) || portalTitles[section] || '';
}
