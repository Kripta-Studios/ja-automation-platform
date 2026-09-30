import { expect, test } from '@playwright/test';
import { portalText } from '../../apps/portal/src/lib/portal-i18n';

const projectId = process.env.JA_PROD_QA_PROJECT_ID;
const milestoneId = process.env.JA_PROD_QA_MILESTONE_ID;

test.beforeAll(() => {
  for (const [name, value] of [
    ['JA_PROD_QA_PROJECT_ID', projectId],
    ['JA_PROD_QA_MILESTONE_ID', milestoneId],
  ]) {
    if (!value || !/^[0-9a-f-]{36}$/iu.test(value))
      throw new Error(`${name} must identify an existing disposable QA record`);
  }
});

for (const locale of ['en', 'es', 'pt'] as const) {
  test(`Owner catalog distinguishes creation and editing in ${locale} while retaining validation`, async ({
    page,
  }) => {
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST') posts.push(request.url());
    });
    await page.goto(
      `/j-aautomation/app/manage?area=project_milestone&project=${projectId}&focus=${milestoneId}&lang=${locale}`,
    );
    await page.waitForLoadState('networkidle');
    const edit = page.locator(`form[data-management-record-id="${milestoneId}"]`);
    await expect(edit).toBeVisible();
    await expect(edit.getByLabel(portalText(locale, 'Correction reason'))).toHaveAttribute(
      'required',
      '',
    );
    await expect(
      edit.getByLabel(portalText(locale, 'I confirm this change to the selected record.')),
    ).toHaveAttribute('required', '');
    await expect(edit.locator('button[name="operation"][value="update"]')).toHaveText(
      portalText(locale, 'Save changes'),
    );

    const create = page.locator('form[data-management-record-id=""]');
    await create.locator('xpath=ancestor::details').locator(':scope > summary').click();
    await expect(create).toBeVisible();
    await expect(create.getByLabel(portalText(locale, 'Reason'), { exact: true })).toHaveCount(1);
    const reason = create.locator('[name="reason"]');
    await expect(reason).toHaveAttribute('required', '');
    await expect(reason).toHaveAttribute('minlength', '3');
    await expect(reason).toHaveAttribute('maxlength', '2000');
    await expect(
      create.getByLabel(portalText(locale, 'I confirm creation of this record.')),
    ).toHaveCount(1);
    const confirmation = create.locator('[name="confirmed"]');
    await expect(confirmation).toHaveAttribute('required', '');
    await expect(confirmation).toHaveAttribute('name', 'confirmed');
    await expect(confirmation).toHaveValue('yes');
    const submit = create.locator('button[name="operation"][value="create"]');
    await expect(submit).toHaveText(portalText(locale, 'Create record'));
    await create.locator('[name="project_id"]').selectOption(projectId!);
    const name = `QA mode copy ${locale}; do not create`;
    await create.locator('[name="name"]').fill(name);
    await create.locator('[name="amount"]').fill('1.23');
    await confirmation.check();
    await reason.fill('');
    await submit.click();
    await expect(reason).toBeFocused();
    await expect(reason).toHaveAttribute('aria-invalid', 'true');
    await expect(create.locator('[data-validation-summary]')).toContainText(
      portalText(locale, 'Please complete this field.'),
    );
    await reason.fill(`QA mode copy ${locale}; validation only`);
    await confirmation.uncheck();
    await submit.click();
    await expect(confirmation).toBeFocused();
    await expect(confirmation).toHaveAttribute('aria-invalid', 'true');
    await expect(create.locator('[name="name"]')).toHaveValue(name);
    await expect(create.locator('[name="amount"]')).toHaveValue('1.23');
    expect(posts).toEqual([]);
  });
}
