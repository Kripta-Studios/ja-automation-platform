import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (): string =>
  readFileSync(
    resolve(process.cwd(), 'apps/portal/src/lib/portal/sections/ApprovalSection.svelte'),
    'utf8',
  );

describe('PM approvals section', () => {
  it('defines the role-safe approval surface and the three operational tabs', () => {
    const value = source();

    expect(value).toContain('canSeeFinanceReview');
    expect(value).toContain("type Tab = 'time' | 'expenses' | 'reports'");
    expect(value).toContain("'Time'");
    expect(value).toContain("'Expenses'");
    expect(value).toContain("'Reports'");
    expect(value).toContain('approval-tabs');
    expect(value).toContain('approval-attention');
    expect(value).toContain('approval-filters');
    expect(value).toContain('data-approval-row');
    expect(value).toContain('const tabs: readonly Tab[]');
    expect(value).toContain('id={tabId(tab)}');
    expect(value).toContain('aria-controls={panelId()}');
    expect(value).toContain('tabindex={activeTab === tab ? 0 : -1}');
    expect(value).toContain('role="tabpanel"');
    expect(value).toContain('aria-labelledby={tabId(activeTab)}');
  });

  it('keeps PM decisions operational and preserves existing action contracts', () => {
    const value = source();

    expect(value).toContain('action="?/approveRecord"');
    expect(value).toContain('action="?/reviewReport"');
    expect(value).toContain('action="?/createCorrectionDraft"');
    expect(value).toContain('action="?/reviewMilestone"');
    expect(value).toContain('name="decision"');
    expect(value).toContain('name="reason"');
    expect(value).toMatch(/name="reason"[^>]+required/);
    expect(value).toContain('owner override');
    expect(value).toContain('canSeeFinanceReview &&');
    expect(value).toContain('onkeydown={(event) => handleTabKeydown(event, tab)}');
    expect(value).toContain("case 'ArrowRight':");
    expect(value).toContain("case 'ArrowLeft':");
    expect(value).toContain("case 'Home':");
    expect(value).toContain("case 'End':");
    expect(value).toContain('event.preventDefault();');
    expect(value).toContain('document.getElementById(tabId(tab))?.focus()');
    expect(value).toContain("encodeURIComponent(value(row, 'id'))");
    expect(value).toContain("encodeURIComponent(value(milestone, 'project_id'))");
    expect(value).toContain("if (type === 'expense') return `${base}/app/expenses/${id}`");
    expect(value).toContain("if (type === 'time') return `${base}/app/time/${id}`");
    expect(value).not.toContain("${base}/app/${encodeURIComponent(value(row, 'type'))}/${id}");

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

  it('has deliberate responsive and keyboard-safe interaction rules', () => {
    const value = source();

    expect(value).toContain('@media (max-width: 760px)');
    expect(value).toContain('min-height: 44px');
    expect(value).toContain(':focus-visible');
    expect(value).toContain('prefers-reduced-motion');
    expect(value).not.toContain('transition: all');
  });
});
