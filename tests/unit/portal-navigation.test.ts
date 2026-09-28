import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  accountNavigationFor,
  activeNavItem,
  isNavItemActive,
  portalGlobalNavigationForRole,
  portalLandingForRole,
  portalNavigationForRole,
  type NavItem,
} from '../../apps/portal/src/lib/portal-navigation';

const flatten = (role: string | null | undefined): NavItem[] => {
  const navigation = portalNavigationForRole('/j-aautomation', role);
  return [
    ...navigation.primary,
    ...navigation.secondary,
    ...navigation.admin,
    ...navigation.security,
  ];
};

const labels = (role: string | null | undefined): string[] =>
  flatten(role).map((item) => item.label);

describe('portal role navigation contract', () => {
  it('keeps the worker menu operational and free of administrative destinations', () => {
    expect(labels('worker')).toEqual([
      'Today',
      'Time',
      'Expenses',
      'Reports',
      'Crew hours',
      'My Pay',
      'Profile',
    ]);
    expect(labels('worker')).not.toEqual(
      expect.arrayContaining(['Projects', 'Billing', 'Finance']),
    );
    expect(portalNavigationForRole('/j-aautomation', 'worker').admin).toHaveLength(0);
    expect(portalNavigationForRole('/j-aautomation', 'worker').security).toHaveLength(0);
  });

  it('gives PM the project workflow without finance or commercial configuration', () => {
    expect(labels('project_manager')).toEqual([
      'Dashboard',
      'Projects',
      'Approvals',
      'Reports',
      'Time',
      'Expenses',
      'My Pay',
      'Team',
      'Planning',
      'Documents',
      'Profile',
    ]);
    expect(labels('project_manager')).not.toEqual(
      expect.arrayContaining([
        'Finance Overview',
        'Economic Review',
        'Billing',
        'Collections / Ledger',
        'Accounting',
        'Commercial Configuration',
      ]),
    );
  });

  it('gives Finance the economic and billing workflow without audit clutter', () => {
    expect(labels('finance_admin')).toEqual([
      'Finance Overview',
      'Projects',
      'Economic Review',
      'Billing',
      'Approvals',
      'Collections / Ledger',
      'Accounting',
      'Commercial Configuration',
      'Documents',
      'Profile',
    ]);
    expect(labels('finance_admin')).not.toContain('Audit');
  });

  it('maps finance landings to an authorized active destination', () => {
    expect(portalLandingForRole('/j-aautomation', 'finance_admin')).toBe(
      '/j-aautomation/app/finance?view=overview',
    );
    expect(portalLandingForRole('/j-aautomation', 'auditor_read_only')).toBe(
      '/j-aautomation/app/finance?view=overview',
    );
    expect(portalLandingForRole('/j-aautomation', 'owner_admin')).toBe('/j-aautomation/app/');
    expect(portalLandingForRole('/j-aautomation', 'worker')).toBe('/j-aautomation/app/');
  });

  it('gives Owner the authorized superset and keeps Audit explicit', () => {
    expect(labels('owner_admin')).toEqual([
      'Dashboard',
      'Projects',
      'Approvals',
      'Reports',
      'Clients',
      'Team',
      'Suppliers',
      'Crew hours',
      'Time',
      'Expenses',
      'Planning',
      'Documents',
      'Finance Overview',
      'Economic Review',
      'Billing',
      'Collections / Ledger',
      'Accounting',
      'Commercial Configuration',
      'Profile',
      'Data management',
      'Audit',
    ]);
  });

  it('keeps the read-only auditor menu limited to read-only finance, audit and profile areas', () => {
    expect(labels('auditor_read_only')).toEqual([
      'Finance Overview',
      'Economic Review',
      'Collections / Ledger',
      'Accounting',
      'Profile',
      'Audit',
    ]);
    expect(labels('auditor_read_only')).not.toEqual(
      expect.arrayContaining(['Billing', 'Commercial Configuration', 'Projects', 'Approvals']),
    );
  });

  it('fails closed to the worker menu for missing and unknown role values', () => {
    expect(labels(undefined)).toEqual(labels('worker'));
    expect(labels(null)).toEqual(labels('worker'));
    expect(labels('future_role')).toEqual(labels('worker'));
  });

  it('does not publish disabled placeholders and preserves query-view routes', () => {
    const all = flatten('owner_admin');
    expect(all.some((item) => 'disabled' in item)).toBe(false);
    expect(all.find((item) => item.label === 'Clients')?.href).toBe(
      '/j-aautomation/app/projects?view=clients',
    );
    expect(all.find((item) => item.label === 'Economic Review')?.href).toBe(
      '/j-aautomation/app/finance?view=economic',
    );
    expect(all.find((item) => item.label === 'Commercial Configuration')?.href).toBe(
      '/j-aautomation/app/finance?view=commercial',
    );
  });

  it('includes the authorized personal inbox in the account menu without duplicate destinations', () => {
    const accountLabels = (role: string): string[] =>
      accountNavigationFor(
        portalNavigationForRole('/j-aautomation', role),
        portalGlobalNavigationForRole(role),
      ).map((item) => item.label);

    expect(accountLabels('worker')).toEqual(['My Pay', 'Profile', 'Notifications']);
    expect(accountLabels('project_manager')).toEqual([
      'My Pay',
      'Documents',
      'Profile',
      'Notifications',
    ]);
    expect(accountLabels('finance_admin')).toEqual(['Documents', 'Profile', 'Notifications']);
    expect(accountLabels('owner_admin')).toEqual(['Documents', 'Profile', 'Notifications']);
    expect(accountLabels('auditor_read_only')).toEqual(['Profile', 'Notifications']);
    const global = portalGlobalNavigationForRole('worker');
    expect(
      accountNavigationFor(portalNavigationForRole('/j-aautomation', 'worker'), [
        ...global,
        ...global,
      ]).filter((item) => item.section === 'notifications'),
    ).toHaveLength(1);
  });

  it.each(['external_technician', 'supplier_coordinator', 'future_profile'])(
    'does not advertise the inbox to the restricted %s workforce profile',
    (profile) => {
      for (const role of [
        'worker',
        'project_manager',
        'finance_admin',
        'owner_admin',
        'auditor_read_only',
      ]) {
        const global = portalGlobalNavigationForRole(role, profile);
        expect(global).toEqual([]);
        expect(
          accountNavigationFor(
            portalNavigationForRole('/j-aautomation', role, profile),
            global,
          ).map((item) => item.section),
        ).not.toContain('notifications');
      }
    },
  );

  it.each([undefined, null, 'future_role'])(
    'does not advertise global destinations for an unrecognized role %s',
    (role) => {
      expect(portalGlobalNavigationForRole(role)).toEqual([]);
    },
  );

  it('resolves the personal inbox separately from the operational sidebar', () => {
    const items = [...flatten('worker'), ...portalGlobalNavigationForRole('worker')];
    const current = activeNavItem(items, {
      base: '/j-aautomation',
      section: 'notifications',
      url: new URL('https://example.test/j-aautomation/app/notifications?lang=es&status=unread'),
      role: 'worker',
      itemHref: (item) =>
        item.href ?? `/j-aautomation/app/${item.section === 'today' ? '' : item.section}`,
    });
    expect(current?.label).toBe('Notifications');
  });

  it('lets the mobile footer size itself from its links without fixed columns or inline CSP styles', () => {
    const shell = readFileSync(
      resolve(process.cwd(), 'apps/portal/src/lib/PortalShell.svelte'),
      'utf8',
    );
    const responsive = readFileSync(
      resolve(process.cwd(), 'apps/portal/src/styles/portal/responsive.css'),
      'utf8',
    );

    expect(shell).not.toContain('mobileNavigationStyle');
    expect(shell).not.toMatch(/<nav class="bottom-nav"[^>]*\sstyle=/u);
    expect(responsive).not.toContain('grid-template-columns: repeat(5, 1fr)');
    expect(responsive).toContain('grid-auto-flow: column');
    expect(responsive).toContain('grid-auto-columns: minmax(0, 1fr)');
  });
});

describe('active portal navigation destination', () => {
  const base = '/j-aautomation';
  const itemHref = (item: NavItem): string =>
    item.href ?? `${base}/app/${item.section === 'today' ? '' : item.section}`;
  const location = (route: string, section: string, role = 'owner_admin') => ({
    base,
    section,
    role,
    url: new URL(`${base}/app/${route}`, 'https://example.test'),
    itemHref,
  });

  it.each([
    ['projects?view=clients&lang=es&status=active&q=company', 'Clients'],
    ['projects?projectId=one&lang=pt&view=team&page=2', 'Team'],
    ['projects?status=archived&clientId=one&sort=name', 'Projects'],
    ['projects?view=unknown&status=active', 'Projects'],
    ['projects/project-id?lang=es&tab=activity', 'Projects'],
  ])('keeps %s attached to %s independently of filters', (route, label) => {
    const items = flatten('owner_admin');
    const current = location(route, 'projects');
    expect(activeNavItem(items, current)?.label).toBe(label);
    expect(items.filter((item) => isNavItemActive(item, items, current))).toHaveLength(1);
  });

  it.each([
    ['finance_admin', 'overview', 'Finance Overview'],
    ['finance_admin', 'economic', 'Economic Review'],
    ['finance_admin', 'commercial', 'Commercial Configuration'],
    ['owner_admin', 'economic', 'Economic Review'],
    ['auditor_read_only', 'economic', 'Economic Review'],
  ])('keeps %s in the selected finance %s view after filtering', (role, view, label) => {
    const items = flatten(role);
    const current = location(
      `finance?clientId=one&view=${view}&status=open&lang=pt&projectId=two`,
      'finance',
      role,
    );
    expect(activeNavItem(items, current)?.label).toBe(label);
    expect(items.filter((item) => isNavItemActive(item, items, current))).toHaveLength(1);
  });

  it.each([
    ['worker', 'Today'],
    ['project_manager', 'Dashboard'],
    ['owner_admin', 'Dashboard'],
    ['finance_admin', 'Finance Overview'],
    ['auditor_read_only', 'Finance Overview'],
  ])('selects the role landing for %s at the root URL', (role, label) => {
    expect(activeNavItem(flatten(role), location('?lang=es', 'today', role))?.label).toBe(label);
  });

  it('does not select the mobile Projects destination while Clients or Team is open', () => {
    const navigation = portalNavigationForRole(base, 'owner_admin');
    const items = flatten('owner_admin');
    for (const view of ['clients', 'team']) {
      const current = location(`projects?view=${view}&status=active`, 'projects');
      const active = activeNavItem(items, current);
      expect(
        navigation.primary.some(
          (item) => item.section === active?.section && item.label === active?.label,
        ),
      ).toBe(false);
    }
  });

  it('keeps the supplier team and operational report destinations distinct', () => {
    const nav = portalNavigationForRole(base, 'worker', 'supplier_coordinator');
    const items = [...nav.primary, ...nav.secondary];
    expect(activeNavItem(items, location('supplier?lang=pt', 'supplier'))?.label).toBe(
      'Supplier team',
    );
    expect(
      activeNavItem(items, location('supplier/report?month=2026-09&lang=pt', 'supplier'))?.label,
    ).toBe('Operational report');
  });

  it('uses the parent destination on report detail routes and no item for unrelated routes', () => {
    const items = flatten('worker');
    expect(
      activeNavItem(items, location('reports/report-id?lang=pt', 'reports', 'worker'))?.label,
    ).toBe('Reports');
    expect(activeNavItem(items, location('help?lang=es', 'help', 'worker'))).toBeUndefined();
  });
});
