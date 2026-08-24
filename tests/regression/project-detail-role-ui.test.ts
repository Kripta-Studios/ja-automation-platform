import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');
const detail = read('apps/portal/src/routes/app/projects/[id]/+page.svelte');
const loader = read('apps/portal/src/routes/app/projects/[id]/+page.server.ts');

describe('Client Essential project detail role-safe UI', () => {
  it('organizes the project around role-aware detail tabs', () => {
    expect(detail).toContain('data-project-detail');
    expect(detail).toContain("{ id: 'overview'");
    expect(detail).toContain("{ id: 'team'");
    expect(detail).toContain("{ id: 'reports'");
    expect(detail).toContain("{ id: 'commercial'");
    expect(detail).toContain("{ id: 'billing'");
    expect(detail).toContain('canViewCommercial');
    expect(detail).toContain('role="tablist"');
    expect(detail).toContain('aria-selected={activeTab === tab.id}');
    expect(detail).toContain('Reports & Files');
  });

  it('keeps commercial and billing surfaces out of ordinary PM/Worker navigation', () => {
    expect(detail).toContain(
      'const canViewCommercial = $derived(isOwner || isFinance || isAuditor);',
    );
    expect(detail).toContain("{:else if activeTab === 'commercial' && canViewCommercial}");
    expect(detail).toContain("{:else if activeTab === 'billing' && canViewCommercial}");
    expect(detail).not.toContain('billing_treatment');
    expect(detail).not.toContain('client_treatment');
    expect(detail).toContain('No commercial treatment is inferred.');
    expect(loader).toContain('overview: financeVisible');
    expect(loader).toContain('billingRules = financeVisible');
    expect(loader).toContain('url.searchParams.get');
    expect(loader).toContain('currentPeriod');
    expect(loader).toContain('periodStart,');
    expect(loader).toContain('periodEnd,');
    expect(loader).not.toContain('2026-08-01');
    expect(loader).not.toContain('2026-08-31');
  });

  it('uses operational expense truth without fabricating missing money', () => {
    expect(detail).toContain('Operational expenses');
    expect(detail).toContain('expenseAmount(expense)');
    expect(detail).toContain("const raw = String(minor ?? '').trim();");
    expect(detail).toContain("return '—';");
    expect(detail).not.toContain('Number(minor ?? 0)');
    expect(detail).toContain('BigInt(raw)');
    expect(detail).not.toContain('Number(minor)');
    expect(detail).not.toContain('format(value / 100)');
    expect(detail).not.toContain('2026-08-01');
    expect(detail).not.toContain('2026-08-31');
  });

  it('keeps editing contextual and lifecycle-safe', () => {
    expect(detail).toContain('<ResponsiveSheet');
    expect(detail).toContain('data-project-edit-cta');
    expect(detail).toContain('action="?/updateProject"');
    expect(detail).toContain('name="version"');
    expect(detail).not.toContain('name="status"');
    expect(detail).not.toContain('name="actualEndDate"');
    expect(detail).not.toContain('transition: all');
  });

  it('includes phone sheet behavior, keyboard semantics and reduced-motion support', () => {
    expect(detail).toContain('class="project-edit-sheet"');
    expect(detail).toContain('class="project-invoice-sheet"');
    expect(detail).toContain('role="tabpanel"');
    expect(detail).toContain('tabindex="0"');
    expect(detail).toContain('tabindex={activeTab === tab.id ? 0 : -1}');
    expect(detail).toContain('ArrowLeft');
    expect(detail).toContain('ArrowRight');
    expect(detail).toContain("event.key === 'Home'");
    expect(detail).toContain("event.key === 'End'");
    expect(detail).toContain('event.preventDefault()');
    expect(detail).toContain('tabButtons[next.id]?.focus()');
    expect(detail).toContain('@media (max-width: 640px)');
    expect(detail).toContain('width: 100vw');
    expect(detail).toContain('@media (prefers-reduced-motion: reduce)');
    expect(detail).toContain('focus-visible');
  });
});
