import { expect, test } from '@playwright/test';
import { portalText } from '../../apps/portal/src/lib/portal-i18n';

const projectId = process.env.JA_PROD_QA_PROJECT_ID;
const memberId = process.env.JA_PROD_QA_FINITE_ASSIGNMENT_ID;

test.beforeAll(() => {
  for (const [name, value] of [
    ['JA_PROD_QA_PROJECT_ID', projectId],
    ['JA_PROD_QA_FINITE_ASSIGNMENT_ID', memberId],
  ]) {
    if (!value || !/^[0-9a-f-]{36}$/iu.test(value))
      throw new Error(`${name} must identify an existing disposable QA record`);
  }
});

for (const locale of ['en', 'es', 'pt'] as const) {
  test(`person policy posts canonical categories and requires its finite end in ${locale}`, async ({
    page,
  }) => {
    await page.goto(
      `/j-aautomation/app/finance?view=commercial&project=${projectId}&lang=${locale}#person-expense-policies`,
    );
    const form = page.locator('form[data-assignment-expense-policy-form]');
    await expect(form).toBeVisible();
    await form.locator('[name="projectMemberId"]').selectOption(memberId!);
    const category = form.locator('[name="category"]');
    await category.selectOption({ label: portalText(locale, 'Meals') });
    expect(
      await form.evaluate((element) => new FormData(element as HTMLFormElement).get('category')),
    ).toBe('meals');

    const from = form.locator('[name="effectiveFrom"]');
    const to = form.locator('[name="effectiveTo"]');
    const assignmentEnd = await to.getAttribute('max');
    expect(assignmentEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    await expect(to).toHaveAttribute('required', '');
    await from.fill(assignmentEnd!);
    await to.fill('');
    await form.locator('[name="clientRecovery"]').selectOption('markup');
    await form.locator('[name="markupBps"]').fill('250');
    const reason = `QA finite end validation ${locale}; no policy write`;
    await form.locator('[name="reason"]').fill(reason);
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('createAssignmentExpensePolicy'))
        posts.push(request.url());
    });
    await form.locator('button[type="submit"]').click();
    await expect(to).toBeFocused();
    await expect(to).toHaveAttribute('aria-invalid', 'true');
    await expect(form.locator('[data-validation-summary]')).toContainText(
      portalText(locale, 'Please complete this field.'),
    );
    await expect(category).toHaveValue('meals');
    await expect(from).toHaveValue(assignmentEnd!);
    await expect(form.locator('[name="markupBps"]')).toHaveValue('250');
    await expect(form.locator('[name="reason"]')).toHaveValue(reason);
    expect(posts).toEqual([]);
  });
}
