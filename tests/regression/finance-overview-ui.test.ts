import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const componentPath = resolve(
  process.cwd(),
  'apps/portal/src/lib/portal/sections/FinanceOverviewSection.svelte',
);

const source = (): string => readFileSync(componentPath, 'utf8');

describe('Finance Overview section architecture', () => {
  it('starts with context, attention summary, project filter, and canonical actual metrics', () => {
    const component = source();

    expect(component).toContain('Finance overview');
    expect(component).toContain('Finance attention summary');
    expect(component).toContain('Filter finance by project');
    expect(component).toContain('data-finance-actual');
    expect(component).toContain('Direct Project Result');
    expect(component).toContain('Contribution');
    expect(component).toContain('Contribution Margin %');
    expect(component.indexOf('Finance attention summary')).toBeLessThan(
      component.indexOf('Filter finance by project'),
    );
    expect(component.indexOf('Filter finance by project')).toBeLessThan(
      component.indexOf('data-finance-actual'),
    );
  });

  it('keeps planned and expected values visibly separate from actual cash', () => {
    const component = source();

    expect(component).toContain('data-finance-expected');
    expect(component).toContain('Planned / Expected');
    expect(component).toContain('Collected (actual)');
    expect(component).toContain('Planning and expected values are directional controls');
    expect(component).toContain('They never count as actual time, paid cash, or collected revenue');
    expect(component).toContain('Only append-only payment events count as collected');
  });

  it('does not present an incomplete canonical projection as ready', () => {
    const component = source();

    expect(component).toContain("finance?.financeProjectionState === 'incomplete'");
    expect(component).toContain("finance?.state === 'incomplete'");
    expect(component).toContain('data-finance-projection-warning');
    expect(component).toContain('role="alert"');
    expect(component).toContain('financeProjectionReasons');
    expect(component).toContain('Projection completeness reasons');
    expect(component).toContain('Canonical finance projection incomplete');
  });

  it('uses the injected money formatter and does not recalculate money in the component', () => {
    const component = source();

    expect(component).toContain('money: MoneyFormatter');
    expect(component).toContain('return money(minor');
    expect(component).not.toMatch(/\bNumber\(/);
    expect(component).not.toContain('parseFloat');
    expect(component).not.toMatch(/minor[^\n]*[+\-*/][^\n]*minor/);
  });

  it('provides source drill-down, role-safe configuration, and phone card contracts', () => {
    const component = source();

    expect(component).toContain('href={projectHref(row)}');
    expect(component).toContain('Open source');
    expect(component).toContain('mobileMode="cards"');
    expect(component).toContain('FinanceConfigurationSection');
    expect(component).toContain(
      "financeRoles = ['owner_admin', 'finance_admin', 'auditor_read_only']",
    );
    expect(component).toContain('data-ui="finance-overview-denied"');
    expect(component).toContain('Compensation settlements');
    expect(component).toContain('Worker reimbursement queue');
  });

  it('keeps actions and timelines explicit while preserving accessibility safeguards', () => {
    const component = source();

    expect(component).toContain('action="?/settleCompensation"');
    expect(component).toContain('action="?/recordReimbursement"');
    expect(component).toContain('Expected / actual');
    expect(component).toContain('Expected');
    expect(component).toContain('Actual');
    expect(component).toContain('required');
    expect(component).toContain('focus-visible');
    expect(component).toContain('@media (prefers-reduced-motion: reduce)');
    expect(component).not.toContain('transition: all');
  });
});
