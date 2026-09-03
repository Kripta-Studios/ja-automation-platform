import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const component = readFileSync(
  'apps/portal/src/lib/portal/sections/FinanceConfigurationSection.svelte',
  'utf8',
);

describe('canonical project legal-entity Finance UI', () => {
  it('renders a labeled normal-flow assignment form and human-readable history', () => {
    expect(component).toContain('action="?/assignProjectLegalEntity"');
    expect(component).toContain('name="projectId"');
    expect(component).toContain('name="legalEntityRevisionId"');
    expect(component).toContain('name="effectiveFrom"');
    expect(component).toContain('name="reason"');
    expect(component).toContain("translate('Save issuing authority')");
    expect(component).toContain('data-project-legal-entity-history');
    expect(component).toContain("rowValue(assignment, 'legalName', 'legal_name')");
    expect(component).toContain("rowValue(assignment, 'revisionNumber', 'revision_number')");
    expect(component).not.toContain("rowValue(assignment, 'legalEntityRevisionId'");
  });

  it('does not render canonical revision choices to an auditor', () => {
    expect(component).toContain(
      'const canManageCanonicalAuthority = $derived(\n    !isAuditor && policyWriteRoles.includes(String(data.user.role)),\n  );',
    );
    expect(component).toContain('{#if canManageCanonicalAuthority}');
    expect(component).toContain('data-project-legal-entity-readonly');
    expect(component).toContain(
      'Issuing authority assignment is restricted to an authorized Finance or Owner administrator.',
    );
  });
});
