import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { money } from '../../apps/portal/src/lib/portal/portal-format.js';
import { paymentMoney } from '../../apps/portal/src/lib/portal/payment-money.js';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('exact minor-unit display', () => {
  it('formats values beyond Number.MAX_SAFE_INTEGER and negatives without rounding', () => {
    expect(paymentMoney('900719925474099301', 'EUR')).toBe('€9,007,199,254,740,993.01');
    expect(paymentMoney('-900719925474099301', 'EUR')).toBe('-€9,007,199,254,740,993.01');
    expect(paymentMoney('900719925474099301', 'EUR', 'de-DE')).toBe('9.007.199.254.740.993,01 €');
    expect(money('900719925474099301', 'USD')).toBe('$9,007,199,254,740,993.01');
  });

  it('routes every reviewed standalone money surface through the shared formatter', () => {
    const portalFormat = read('apps/portal/src/lib/portal/portal-format.ts');
    const paymentFormat = read('apps/portal/src/lib/portal/payment-money.ts');
    expect(portalFormat).toContain("import { paymentMoney } from './payment-money';");
    expect(portalFormat).not.toContain('Number(minor');
    expect(paymentFormat).toContain('BigInt(raw)');
    expect(paymentFormat).not.toContain('Number(');

    for (const path of [
      'apps/portal/src/routes/app/expenses/[id]/+page.svelte',
      'apps/portal/src/routes/app/billing/invoices/[id]/+page.svelte',
      'apps/portal/src/routes/app/reports/period/[id]/+page.svelte',
    ]) {
      const source = read(path);
      expect(source, `${path} must use the shared exact-money formatter`).toContain(
        "import { money as formatMoney } from '$lib/portal/portal-format';",
      );
      expect(source, `${path} must not convert minor units through Number`).not.toContain(
        'format(Number(minor',
      );
    }
  });
});
