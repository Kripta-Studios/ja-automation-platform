import { expect, test } from '@playwright/test';
import { translate } from '../../apps/portal/src/lib/i18n/catalog';

const packId = process.env.JA_UI_ACCOUNTING_PARTIAL_PACK;
const emptyPeriodMessage =
  'This empty period has no confirmed invoice issuer for its final version. You can still download formats marked Ready. Review invoice issuers or choose a period with issued invoices.';

for (const [role, state] of [
  ['owner', process.env.JA_UI_OWNER_STATE],
  ['finance', process.env.JA_UI_FINANCE_STATE],
  ['auditor', process.env.JA_UI_AUDITOR_STATE],
] as const) {
  test.describe(`${role} Accounting finalization readiness`, () => {
    test.use({ storageState: state || undefined });
    for (const locale of ['en', 'es', 'pt'] as const) {
      test(`${locale}: an existing empty pack explains issuer readiness while files remain ready`, async ({
        page,
      }) => {
        test.skip(
          !state || !packId,
          'Requires an existing UI-authenticated role and UI-generated partial pack; no seeded fixture.',
        );
        await page.goto(`/j-aautomation/app/accounting?lang=${locale}`, {
          waitUntil: 'networkidle',
        });
        await page
          .locator('#accounting-register .record-browser input[type="search"]')
          .fill(packId!);
        const pack = page.locator(`#accounting-pack-${packId}`);
        await expect(pack).toBeVisible();
        const warning = pack.locator('[data-accounting-finalization-blocked]');
        await expect(warning).toContainText(translate(locale, 'Finalization unavailable'));
        await expect(warning).toContainText(translate(locale, emptyPeriodMessage));
        await expect(pack.locator('form[action*="finalizeAccountingPack"]')).toHaveCount(0);
        const artifacts = pack.locator('a.preview-link');
        await expect(artifacts).toHaveCount(5);
        for (const artifact of await artifacts.all()) {
          await expect(artifact).toContainText(translate(locale, 'Ready'));
          await expect(artifact).toHaveAttribute('href', /\/api\/accounting-pack\//);
        }
        if (role === 'auditor') {
          await expect(warning.getByRole('link')).toHaveCount(0);
          await expect(warning).toContainText(translate(locale, 'Contact an owner'));
        } else {
          await expect(
            warning.getByRole('link', {
              name: translate(locale, 'Review invoice issuers'),
              exact: false,
            }),
          ).toHaveAttribute('href', '/j-aautomation/app/billing?view=setup');
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        await page.reload({ waitUntil: 'networkidle' });
        await expect(warning).toContainText(translate(locale, emptyPeriodMessage));
        await expect(pack.locator('form[action*="finalizeAccountingPack"]')).toHaveCount(0);
      });
    }
  });
}
