import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (): string =>
  readFileSync(
    resolve(process.cwd(), 'apps/portal/src/lib/portal/sections/ApprovalSection.svelte'),
    'utf8',
  );

describe('Approvals queue (grouped by worker and week)', () => {
  it('defines the role-safe approval surface and the three operational tabs', () => {
    const value = source();

    expect(value).toContain('canSeeFinanceReview');
    expect(value).toContain("type Tab = 'time' | 'expenses' | 'reports'");
    expect(value).toContain('const tabs: readonly Tab[]');
    expect(value).toContain('approval-tabs');
    expect(value).toContain('data-approval-row');
    expect(value).toContain('data-approval-group');
    expect(value).toContain('id={tabId(tab)}');
    expect(value).toContain('aria-controls={panelId()}');
    expect(value).toContain('tabindex={activeTab === tab ? 0 : -1}');
    expect(value).toContain('role="tabpanel"');
    expect(value).toContain('aria-labelledby={tabId(activeTab)}');
  });

  it('uses existing decision actions plus one batch action and no browser confirm()', () => {
    const value = source();

    expect(value).toContain('action="?/approveBatch"');
    expect(value).toContain('action="?/approveRecord"');
    expect(value).toContain('action="?/reviewReport"');
    expect(value).toContain('action="?/reviewMilestone"');
    expect(value).toContain('name="item"');
    // Each batch item is pinned to the version the reviewer saw.
    expect(value).toContain('`${item.type}:${item.id}:${item.version}`');
    expect(value).toMatch(/name="reason"[^>]+required/);
    expect(value).toContain('name="decision"');
    expect(value).not.toContain('window.confirm');
    // Corrections stay on the audited record path; approvals are never "undone".
    expect(value).toContain(
      "['correction', 'owner_override'].includes(value(row, 'review_stage'))",
    );
    expect(value).toContain('correctionHref(row)');
    expect(value).toContain("encodeURIComponent(value(row, 'id'))");
    expect(value).toContain("encodeURIComponent(value(milestone, 'project_id'))");
    expect(value).toContain("if (type === 'expense') return `${base}/app/expenses/${id}`");
    expect(value).toContain("if (type === 'time') return `${base}/app/time/${id}`");

    for (const forbidden of [
      'client_rate',
      'internal_cost',
      'tax_profile',
      'contribution_margin',
      'reimbursement_amount',
      'client_billability',
    ]) {
      expect(value).not.toContain(forbidden);
    }
  });

  it('keeps tab keyboard navigation', () => {
    const value = source();
    expect(value).toContain('onkeydown={(event) => handleTabKeydown(event, tab)}');
    for (const key of ["case 'ArrowRight':", "case 'ArrowLeft':", "case 'Home':", "case 'End':"])
      expect(value).toContain(key);
    expect(value).toContain('document.getElementById(tabId(tab))?.focus()');
  });

  it('has deliberate responsive and keyboard-safe interaction rules', () => {
    const value = source();

    expect(value).toContain('@media (max-width: 760px)');
    expect(value).toContain('min-height: 44px');
    expect(value).toContain(':focus-visible');
    expect(value).toContain('prefers-reduced-motion');
    expect(value).not.toContain('transition: all');
  });
});
