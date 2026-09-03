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
export function portalNavigationForRole(base: string, role?: string | null): PortalNavigation {
  const route = (section: string, view?: string): string =>
    `${base}/app/${section}${view ? `?view=${encodeURIComponent(view)}` : ''}`;

  const worker: PortalNavigation = {
    primary: [
      item('today', 'Today', '⌂'),
      item('time', 'Time', '◷'),
      item('expenses', 'Expenses', '◇'),
      item('reports', 'Reports', '▤'),
    ],
    secondary: [item('pay', 'My Pay', '$'), item('profile', 'Profile', '◎')],
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
        admin: [],
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

/**
 * Keep the account menu a small, role-safe projection of the navigation that
 * the shell already received. Profile is shown at most once; notifications
 * and other global destinations are intentionally not promoted here.
 */
export function accountNavigationFor(navigation: PortalNavigation): NavItem[] {
  const seen = new Set<string>();
  const allowedSections = new Set(['pay', 'documents', 'profile']);
  const candidates = [
    ...navigation.primary,
    ...navigation.secondary,
    ...navigation.admin,
    ...navigation.security,
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
  billing: 'Billing streams',
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
    technical: 'PLC / Technical reports',
  },
  billing: {
    invoices: 'Invoices',
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
