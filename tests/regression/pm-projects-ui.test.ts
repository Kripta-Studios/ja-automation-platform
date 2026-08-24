import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const source = (): string => read('apps/portal/src/lib/portal/sections/ProjectSection.svelte');

describe('PM Projects section architecture', () => {
  it('uses a list-first surface with filters and one optional primary action', () => {
    const component = source();
    expect(component).toContain('Authorized projects');
    expect(component).toContain('Filter projects');
    expect(component).toContain('primaryAction');
    expect(component.indexOf('Filter projects')).toBeLessThan(
      component.indexOf('<table class="project-section__table">'),
    );
    expect(component).toMatch(/<table class="project-section__table">/);
    const listSurface = component.indexOf("<SectionCard title={translate('Authorized projects')}");
    const postListAction = component.indexOf('project-section__post-list-action');
    expect(listSurface).toBeGreaterThan(-1);
    expect(postListAction).toBeGreaterThan(listSurface);
  });

  it('enforces privileged controls by role and explicit capabilities', () => {
    const component = source();
    expect(component).toContain("role === 'owner_admin' || role === 'finance_admin'");
    expect(component).toContain('capabilities.canCreateProject === true');
    expect(component).toContain('capabilities.canTransitionProject === true');
    expect(component).toContain('capabilities.canManageClients === true');
    expect(component).toContain('canTransitionProject');
    expect(component).toContain('canManageClients');
  });

  it('forwards scalar lifecycle fields such as status and rejects nested values', () => {
    const component = source();
    expect(component).toContain('fields?: Readonly<Record<string, string | number>>');
    expect(component).toContain("typeof fieldValue === 'string'");
    expect(component).toContain('Number.isFinite(fieldValue)');
    expect(component).toMatch(
      /type="hidden"\s+(?:name=\{name\}|\{name\})\s+value=\{String\(fieldValue\)\}/,
    );
    expect(component).toMatch(/fields:\s*\{\s*status:/);
    expect(component).toContain('actions.length > 0');
    expect(component).not.toContain('fields: Record<string, unknown>');
  });

  it('keeps PM-visible project data operational and excludes commercial fields', () => {
    const component = source();
    for (const forbidden of [
      'client_rate',
      'internal_cost',
      'contribution',
      'tax_profile',
      'billing_treatment',
      'markup',
      'amount_minor',
    ]) {
      expect(component).not.toContain(forbidden);
    }
    expect(component).not.toMatch(/(?:contribution|margin)\s*(?:%|minor|bps)/i);
    expect(component).toContain('project_number');
    expect(component).toContain('cost_center');
    expect(component).toContain('projectSchedule');
  });

  it('provides deliberate mobile representation and accessible interaction states', () => {
    const component = source();
    expect(component).toContain('mobileMode="cards"');
    expect(component).toContain('data-project-row');
    expect(component).toContain("aria-label={translate('Filter projects')}");
    expect(component).toContain('focus-visible');
    expect(component).toContain('@media (prefers-reduced-motion: reduce)');
    expect(component).not.toContain('transition: all');
  });
});
