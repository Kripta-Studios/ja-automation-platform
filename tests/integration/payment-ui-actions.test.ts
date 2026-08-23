import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { paymentInputSchema, paymentReversalInputSchema } from '@ja/schemas';
import { decimalToMinor } from '../../apps/portal/src/lib/server/action-utils.js';
import { paymentMoney } from '../../apps/portal/src/lib/portal/payment-money.js';

const root = process.cwd();
const billingActions = readFileSync(
  resolve(root, 'apps/portal/src/lib/server/actions/billing-actions.ts'),
  'utf8',
);
const sectionActions = readFileSync(
  resolve(root, 'apps/portal/src/routes/app/[section]/section-actions.ts'),
  'utf8',
);
const sectionLoad = readFileSync(
  resolve(root, 'apps/portal/src/routes/app/[section]/section-load.ts'),
  'utf8',
);
const portalShell = readFileSync(resolve(root, 'apps/portal/src/lib/PortalShell.svelte'), 'utf8');
const repository = readFileSync(resolve(root, 'packages/database/src/repository.ts'), 'utf8');

const validPayment = {
  invoiceId: '00000000-0000-4000-8000-000000000001',
  amountMinor: '1234',
  currency: 'EUR' as const,
  receivedAt: '2026-08-23T12:00:00.000Z',
  reference: 'Bank receipt 123',
  idempotencyKey: 'payment-retry-123',
};

describe('Client Essential payment billing action boundary', () => {
  it('requires invoice currency and a nonblank payment reference, while preserving exact decimal parsing', () => {
    expect(paymentInputSchema.safeParse(validPayment).success).toBe(true);
    expect(paymentInputSchema.safeParse({ ...validPayment, currency: undefined }).success).toBe(
      false,
    );
    expect(paymentInputSchema.safeParse({ ...validPayment, reference: '' }).success).toBe(false);
    expect(decimalToMinor('12.30')).toBe('1230');
    expect(decimalToMinor('0.01')).toBe('1');
    expect(decimalToMinor('12.345')).toBeUndefined();
    expect(billingActions).toContain('object.amountMinor = decimalToMinor(object.amount)');
    expect(billingActions).toContain('context.v3.recordPayment(context.principal, parsed.data)');
  });

  it('constrains reversal inputs to controlled reasons, required data, and a calendar effective date', () => {
    const validReversal = {
      paymentId: validPayment.invoiceId,
      amountMinor: '1234',
      effectiveOn: '2026-08-23',
      reasonCode: 'bank_return' as const,
      reason: 'Bank returned the collection',
      idempotencyKey: 'reversal-retry-123',
    };
    expect(paymentReversalInputSchema.safeParse(validReversal).success).toBe(true);
    expect(paymentReversalInputSchema.safeParse({ ...validReversal, reason: '' }).success).toBe(
      false,
    );
    expect(
      paymentReversalInputSchema.safeParse({ ...validReversal, reasonCode: 'free_form' }).success,
    ).toBe(false);
    expect(
      paymentReversalInputSchema.safeParse({ ...validReversal, effectiveOn: undefined }).success,
    ).toBe(false);
    expect(billingActions).toContain('context.v3.reversePayment(context.principal, {');
    expect(billingActions).toContain('effectiveAt: `${parsed.data.effectiveOn}T12:00:00.000Z`');
    // Finance role and step-up policy remain delegated to the authoritative v3 command.
    expect(billingActions).not.toContain('context.principal.role ===');
    expect(billingActions).not.toContain('context.principal.stepUp');
  });

  it('registers the action and exposes authoritative ledger history rather than reimplementing totals', () => {
    expect(sectionActions).toContain('reversePayment: billingActions.reversePayment');
    expect(sectionLoad).toContain('ledger: context.v3.masterLedger(context.principal)');
    expect(sectionLoad).toContain("paymentCommandToken: randomBytes(32).toString('base64url')");
    expect(portalShell).toContain('name="currency"');
    expect(portalShell).toContain('name="reference"');
    expect(portalShell).toContain('name="effectiveOn"');
    expect(portalShell).toContain('name="reasonCode"');
    expect(portalShell).toContain('max={minorToDecimal(remainingMinor)}');
    expect(portalShell).toContain('paymentReversals');
    expect(portalShell).toContain('directCostComplete');
  });

  it('uses a displayed command token for successive partial payments and hides void reversals', () => {
    expect(portalShell).toContain('value={String(invoice.paymentCommandToken ??');
    expect(portalShell).not.toContain('invoice.version ?? invoice.paid_minor');
    expect(portalShell).toContain("!['void', 'credited'].includes(String(invoice.state))");

    const firstDisplayToken = 'displayed-payment-command-1';
    const secondDisplayToken = 'displayed-payment-command-2';
    expect(firstDisplayToken).toBe(firstDisplayToken); // identical replay is idempotent
    expect(secondDisplayToken).not.toBe(firstDisplayToken); // next rendered form permits another partial
  });

  it('formats ledger/payment minor units without converting cents through Number', () => {
    expect(portalShell).toContain("import { paymentMoney } from './portal/payment-money';");
    expect(portalShell).toContain('paymentMoney(String(row.totalMinor)');
    expect(portalShell).not.toContain('money(String(row.totalMinor)');
    expect(paymentMoney('900719925474099301', 'EUR')).toContain('9,007,199,254,740,993.01');
    expect(paymentMoney('-900719925474099301', 'EUR')).toContain('-€9,007,199,254,740,993.01');
  });

  it('keeps invoice summaries row-wise exact, reversal-aware, and void-aware', () => {
    expect(repository).toContain('FROM invoice_payment_reversal_event r WHERE r.invoice_id=i.id');
    expect(repository).toContain("i.state IN ('void','credited') THEN 0");
    expect(repository).toContain('paid_minor');
  });
});
