import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const componentPath = resolve(
  process.cwd(),
  'apps/portal/src/lib/portal/sections/FinanceConfigurationSection.svelte',
);

const source = (): string => readFileSync(componentPath, 'utf8');

function policyRegion(): string {
  const component = source();
  const start = component.indexOf('<!-- project-commercial-policy-start -->');
  const end = component.indexOf('<!-- project-commercial-policy-end -->');
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return component.slice(start, end);
}

describe('Finance project commercial policy UI', () => {
  it('posts the established effective-dated policy contract', () => {
    const policy = policyRegion();

    expect(policy).toContain('action="?/createProjectCommercialPolicy"');
    expect(policy).toContain('name="projectId"');
    expect(policy).toContain('name="effectiveFrom"');
    expect(policy).toContain('name="overtimeEnabled"');
    expect(policy).toContain('name="overtimeThresholdMinutes"');
    expect(policy).toContain('name="travelClientBillable"');
    expect(policy).toContain('name="customerSignoffRequired"');
    expect(policy).toContain('bind:checked={overtimeEnabled}');
    expect(policy).toContain('data-project-commercial-policy-form');
  });

  it('gates writes to Finance/Owner and keeps Auditor history read-only', () => {
    const policy = policyRegion();
    const component = source();

    expect(component).toContain("const policyWriteRoles = ['owner_admin', 'finance_admin']");
    expect(component).toContain('!isAuditor && policyWriteRoles.includes(String(data.user.role))');
    expect(policy).toContain('{#if canWritePolicy}');
    expect(policy).toContain('data-project-commercial-policy-readonly');
    expect(policy).toContain('Finance or Owner administrator');
    expect(policy).toContain('data-project-commercial-policy-history');
    expect(policy).toContain('data-project-commercial-policy-row');
    expect(policy).toContain("rowValue(policy, 'version')");
    expect(policy).toContain("'effectiveFrom', 'effective_from'");
    expect(policy).toContain("'overtimeThresholdMinutes', 'overtime_threshold_minutes'");
    expect(policy).toContain("'travelClientBillable', 'travel_client_billable'");
    expect(policy).toContain("'customerSignoffRequired', 'customer_signoff_required'");
  });

  it('does not add Finance-only rate, tax, margin, or markup inputs to this policy contract', () => {
    const policy = policyRegion();

    expect(policy).not.toMatch(/name="(?:clientRate|internalCost|tax|margin|markup)/u);
    expect(policy).not.toMatch(/label=.*(?:client rate|internal cost|tax|margin|markup)/iu);
  });

  it('keeps policy controls accessible and phone-stackable through shared primitives', () => {
    const policy = policyRegion();

    expect(policy).toContain('<FormSection');
    expect(policy).toContain('<Field');
    expect(policy).toContain('class="admin-form-grid"');
    expect(policy).toContain('required');
    expect(policy).toContain('type="submit"');
    expect(policy).not.toContain('transition: all');
  });
});
