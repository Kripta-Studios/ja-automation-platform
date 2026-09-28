import { describe, expect, it } from 'vitest';
import {
  portalNavigationForRole,
  subsectionsForNavItem,
  type NavItem,
} from '../../apps/portal/src/lib/portal-navigation';

const base = '/j-aautomation';
const shortcuts = (item: NavItem, role: string) =>
  subsectionsForNavItem(item, item.href ?? `${base}/app/${item.section}`, role);

describe('role-scoped sidebar subsections', () => {
  it('keeps manager approval tabs and owner management areas tied to their own routes', () => {
    const manager = portalNavigationForRole(base, 'project_manager');
    const approvals = manager.primary.find((item) => item.section === 'approvals')!;
    expect(shortcuts(approvals, 'project_manager').map((item) => item.href)).toEqual([
      `${base}/app/approvals?tab=time#approval-queue`,
      `${base}/app/approvals?tab=expenses#approval-queue`,
      `${base}/app/approvals?tab=reports#approval-queue`,
    ]);
    const owner = portalNavigationForRole(base, 'owner_admin');
    const manage = owner.admin.find((item) => item.section === 'manage')!;
    expect(shortcuts(manage, 'owner_admin')).toHaveLength(6);
    expect(
      shortcuts(manage, 'owner_admin').every((item) => item.href.startsWith(`${base}/app/manage?`)),
    ).toBe(true);
  });

  it('keeps private commercial setup outside auditor and worker menus', () => {
    const auditor = portalNavigationForRole(base, 'auditor_read_only');
    expect(
      [...auditor.primary, ...auditor.secondary].some(
        (item) => item.label === 'Commercial Configuration',
      ),
    ).toBe(false);
    const worker = portalNavigationForRole(base, 'worker');
    expect(
      [...worker.primary, ...worker.secondary].some((item) => item.section === 'finance'),
    ).toBe(false);
    expect(
      shortcuts(worker.primary.find((item) => item.section === 'today')!, 'worker'),
    ).toHaveLength(2);
  });

  it('separates supplier owner setup from coordinator operational work', () => {
    const owner = portalNavigationForRole(base, 'owner_admin');
    const ownerSupplier = owner.secondary.find((item) => item.label === 'Suppliers')!;
    expect(
      shortcuts(ownerSupplier, 'owner_admin').map((item) =>
        new URL(item.href, 'https://example.test').searchParams.get('workspaceAction'),
      ),
    ).toEqual(['directory', 'setup', 'authorize', 'personnel', 'report']);
    const coordinator = portalNavigationForRole(base, 'worker', 'supplier_coordinator');
    const coordinatorSupplier = coordinator.primary.find((item) => item.label === 'Supplier team')!;
    expect(
      shortcuts(coordinatorSupplier, 'worker').map((item) =>
        new URL(item.href, 'https://example.test').searchParams.get('workspaceAction'),
      ),
    ).toEqual(['personnel', 'time', 'report']);
    const technician = portalNavigationForRole(base, 'worker', 'external_technician');
    const report = technician.secondary.find((item) => item.label === 'Operational report')!;
    expect(
      shortcuts(report, 'worker').every((item) =>
        item.href.startsWith(`${base}/app/supplier/report`),
      ),
    ).toBe(true);
  });
});
