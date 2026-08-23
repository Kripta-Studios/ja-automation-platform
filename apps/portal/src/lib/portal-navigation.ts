export type NavItem = {
  section: string;
  label: string;
  icon: string;
  href?: string;
  financeOnly?: boolean;
};

export const primaryNavigation: NavItem[] = [
  { section: 'today', label: 'Today', icon: '⌂' },
  { section: 'time', label: 'Time', icon: '◷' },
  { section: 'reports', label: 'Reports', icon: '▤' },
  { section: 'expenses', label: 'Expenses', icon: '◇' },
  { section: 'projects', label: 'Projects', icon: '▦' },
];

export const secondaryNavigation: NavItem[] = [
  { section: 'pay', label: 'My Pay', icon: '$' },
  { section: 'documents', label: 'Documents', icon: '▧' },
  { section: 'notifications', label: 'Notifications', icon: '◌' },
  { section: 'profile', label: 'Profile', icon: '◎' },
];

export function adminNavigation(base: string): NavItem[] {
  return [
    { section: 'today', label: 'Dashboard', icon: '⌂' },
    { section: 'projects', label: 'Projects', icon: '▦' },
    { section: 'projects', label: 'Clients', icon: '◉', href: `${base}/app/projects?view=clients` },
    { section: 'projects', label: 'Team', icon: '◌', href: `${base}/app/projects?view=team` },
    { section: 'planning', label: 'Planning', icon: '⌘' },
    { section: 'time', label: 'Time', icon: '◷' },
    { section: 'reports', label: 'Reports', icon: '▤' },
    {
      section: 'reports',
      label: 'PLC / Technical',
      icon: '⌁',
      href: `${base}/app/reports?view=technical`,
    },
    { section: 'expenses', label: 'Expenses', icon: '◇' },
    { section: 'approvals', label: 'Approvals', icon: '✓' },
    { section: 'billing', label: 'Billing', icon: '◫', financeOnly: true },
    {
      section: 'billing',
      label: 'Invoices',
      icon: '▤',
      href: `${base}/app/billing?view=invoices`,
      financeOnly: true,
    },
    { section: 'finance', label: 'Finance', icon: '↗', financeOnly: true },
    { section: 'documents', label: 'Documents', icon: '▧' },
    { section: 'notifications', label: 'Notifications', icon: '◌' },
    { section: 'profile', label: 'Settings', icon: '⚙' },
  ];
}

export const securityNavigation: NavItem[] = [{ section: 'audit', label: 'Audit', icon: '⌁' }];

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
  ledger: 'Invoice / cost ledger',
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
  },
};

export function portalTitleFor(section: string, view?: string | null): string {
  return (view && portalViewTitles[section]?.[view]) || portalTitles[section] || '';
}
