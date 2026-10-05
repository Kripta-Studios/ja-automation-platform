import { describe, expect, it } from 'vitest';
import { invoiceNumberPolicyInputSchema, taxProfileInputSchema } from '@ja/schemas';

describe('historical issuer form compatibility', () => {
  it.each(['legal-entity-ja-usa', '019a1234-1234-7123-8123-123456789abc'])(
    'accepts the selectable issuer %s for numbering and tax setup',
    (legalEntityId) => {
      expect(
        invoiceNumberPolicyInputSchema.safeParse({
          legalEntityId,
          prefix: 'JA',
          digits: '6',
          effectiveFrom: '2026-10-01',
          accountantApprovedAt: '2026-10-05T10:00:00.000Z',
        }).success,
      ).toBe(true);
      expect(
        taxProfileInputSchema.safeParse({
          legalEntityId,
          name: 'Training sales tax',
          currency: 'USD',
          effectiveFrom: '2026-10-01',
          componentName: 'Sales tax',
          componentBasisPoints: 500,
        }).success,
      ).toBe(true);
    },
  );
  it.each(['', '../issuer', 'issuer with spaces', 'a'.repeat(101)])(
    'rejects an invalid numbering issuer %s',
    (legalEntityId) => {
      expect(
        invoiceNumberPolicyInputSchema.safeParse({
          legalEntityId,
          prefix: 'JA',
          digits: 6,
          effectiveFrom: '2026-10-01',
          accountantApprovedAt: '2026-10-05T10:00:00.000Z',
        }).success,
      ).toBe(false);
    },
  );
});
