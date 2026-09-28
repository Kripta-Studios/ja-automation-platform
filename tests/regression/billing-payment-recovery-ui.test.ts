import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

const filename = resolve(
  process.cwd(),
  'apps/portal/src/lib/portal/sections/BillingSection.svelte',
);

describe('payment failure recovery in billing', () => {
  it('compiles without capturing the initial action form as local state', () => {
    const result = compile(readFileSync(filename, 'utf8'), { filename, generate: 'client' });
    expect(
      result.warnings.filter((warning) => warning.code === 'state_referenced_locally'),
    ).toEqual([]);
  });

  it('keeps field errors linked to the payment inputs in native responses', () => {
    const source = readFileSync(filename, 'utf8');
    for (const field of ['amount', 'currency', 'receivedOn', 'reference']) {
      expect(source).toContain(`id="billing-payment-${field}"`);
      expect(source).toContain(`aria-describedby={paymentError('${field}')`);
    }
    expect(source).toContain('data-billing-payment-summary');
    expect(source).toContain('paymentDraft.receivedOn');
    expect(source).not.toContain('paymentDraft.receivedOn || todayIso');
  });
});
