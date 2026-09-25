import { describe, expect, it } from 'vitest';
import { billingRuleInputSchema } from '@ja/schemas';

const input = {
  projectId: '00000000-0000-4000-8000-000000000001',
  legalEntityId: '00000000-0000-4000-8000-000000000002',
  streamType: 'labor',
  cadenceType: 'custom',
  taxProfileId: '00000000-0000-4000-8000-000000000003',
  currency: 'EUR',
  effectiveFrom: '2026-08-01',
};

describe('billing-rule combined expense input', () => {
  it('accepts no tax profile and a legacy selected issuer', () => {
    expect(
      billingRuleInputSchema.parse({ ...input, taxProfileId: '' }).taxProfileId,
    ).toBeUndefined();
    expect(
      billingRuleInputSchema.parse({ ...input, taxProfileId: undefined }).taxProfileId,
    ).toBeUndefined();
    expect(
      billingRuleInputSchema.parse({ ...input, legalEntityId: 'legal-entity-ja-usa' })
        .legalEntityId,
    ).toBe('legal-entity-ja-usa');
  });
  it('defaults to separate billing and distinguishes false from a checked box', () => {
    expect(billingRuleInputSchema.parse(input).includeExpenses).toBe(false);
    expect(
      billingRuleInputSchema.parse({ ...input, includeExpenses: 'false' }).includeExpenses,
    ).toBe(false);
    expect(billingRuleInputSchema.parse({ ...input, includeExpenses: 'on' }).includeExpenses).toBe(
      true,
    );
    expect(billingRuleInputSchema.parse({ ...input, includeExpenses: true }).includeExpenses).toBe(
      true,
    );
    expect(billingRuleInputSchema.safeParse({ ...input, includeExpenses: 'maybe' }).success).toBe(
      false,
    );
  });
});
