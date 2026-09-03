import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  accountNavigationFor,
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
    expect(labels('worker')).toEqual(['Today', 'Time', 'Expenses', 'Reports', 'My Pay', 'Profile']);
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

  it('derives the account menu from the role allowlist without duplicate or global links', () => {
    const accountLabels = (role: string): string[] =>
      accountNavigationFor(portalNavigationForRole('/j-aautomation', role)).map(
        (item) => item.label,
      );

    expect(accountLabels('worker')).toEqual(['My Pay', 'Profile']);
    expect(accountLabels('project_manager')).toEqual(['Documents', 'Profile']);
    expect(accountLabels('finance_admin')).toEqual(['Documents', 'Profile']);
    expect(accountLabels('owner_admin')).toEqual(['Documents', 'Profile']);
    expect(accountLabels('auditor_read_only')).toEqual(['Profile']);
    expect(accountLabels('worker')).not.toContain('Notifications');
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
