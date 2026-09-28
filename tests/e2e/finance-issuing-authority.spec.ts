import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

test('owner creates a reviewed issuing revision and binds it to a project in the browser', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  test.setTimeout(90_000);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const code = `QA-AUTH-${Date.now()}`;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const project = db
      .prepare(
        `SELECT p.id,p.currency FROM project p
          WHERE p.status='active'
            AND NOT EXISTS(SELECT 1 FROM project_legal_entity_assignment a WHERE a.project_id=p.id)
          ORDER BY p.id LIMIT 1`,
      )
      .get() as { id: string; currency: string } | undefined;
    if (!project) throw new Error('Issuing-authority test requires an active project');
    await signIn(page, 'owner');
    await page.goto(portal('/billing'));
    await page.getByRole('tab', { name: 'Configure billing' }).click();
    await page.getByRole('button', { name: 'New invoice issuer' }).click();
    const entityForm = page.locator('form[action="?/createLegalEntity"]');
    await entityForm.locator('[name="code"]').fill(code);
    await entityForm.locator('[name="legalName"]').fill(`${code} Issuing Company`);
    await entityForm.locator('[name="currency"]').selectOption(project.currency);
    await entityForm.locator('[name="billingAddress"]').fill('1 QA Street, Test City');
    await entityForm.locator('[name="companyIdentifiers"]').fill('QA-TAX-IDENTIFIER');
    await entityForm.getByRole('button', { name: 'Save legal entity' }).click();
    await expect
      .poll(() => db.prepare('SELECT id FROM legal_entity WHERE code=?').get(code))
      .toBeTruthy();
    const entityId = String(
      (db.prepare('SELECT id FROM legal_entity WHERE code=?').get(code) as { id: string }).id,
    );

    await page.goto(portal(`/finance?view=commercial&project=${project.id}`));
    await page.locator('.finance-authority-revision summary').click();
    const revisionForm = page.locator('form[data-canonical-revision-form]');
    await revisionForm.locator('[name="legacyLegalEntityId"]').selectOption(entityId);
    await revisionForm.locator('[name="effectiveFrom"]').fill(today);
    await revisionForm.locator('[name="legalName"]').fill(`${code} Issuing Company`);
    await revisionForm.locator('[name="taxIdentifier"]').fill('QA-TAX-IDENTIFIER');
    await revisionForm.locator('[name="addressLine1"]').fill('1 QA Street');
    await revisionForm.locator('[name="locality"]').fill('Test City');
    await revisionForm.locator('[name="postalCode"]').fill('00000');
    await revisionForm.locator('[name="countryCode"]').fill('US');
    await revisionForm.locator('[name="baseCurrency"]').fill(project.currency);
    await revisionForm.locator('[name="timezone"]').fill('America/New_York');
    await revisionForm.locator('[name="reason"]').fill('QA issuing-authority browser acceptance');
    await revisionForm.getByRole('button', { name: 'Save legal entity revision' }).click();
    await expect
      .poll(() =>
        db
          .prepare(
            'SELECT canonical_revision_id FROM legal_entity_revision_bridge WHERE legacy_legal_entity_id=?',
          )
          .get(entityId),
      )
      .toBeTruthy();
    const revisionId = String(
      (
        db
          .prepare(
            'SELECT canonical_revision_id FROM legal_entity_revision_bridge WHERE legacy_legal_entity_id=?',
          )
          .get(entityId) as { canonical_revision_id: string }
      ).canonical_revision_id,
    );

    await page.goto(portal(`/finance?view=commercial&project=${project.id}`));
    const assignmentForm = page.locator('form[data-project-legal-entity-form]');
    await assignmentForm.locator('[name="projectId"]').selectOption(project.id);
    await assignmentForm.locator('[name="legalEntityRevisionId"]').selectOption(revisionId);
    await assignmentForm.locator('[name="effectiveFrom"]').fill(today);
    await assignmentForm.locator('[name="reason"]').fill('QA project issuing-authority assignment');
    await assignmentForm.getByRole('button', { name: 'Save issuing authority' }).click();
    await expect
      .poll(() =>
        db
          .prepare(
            'SELECT assignment_id FROM project_legal_entity_assignment WHERE project_id=? AND legal_entity_revision_id=?',
          )
          .get(project.id, revisionId),
      )
      .toBeTruthy();
    await page.reload();
    await expect(page.locator('[data-project-legal-entity-history]')).toContainText(code);
  } finally {
    db.close();
  }
});

test('invalid issuing revision keeps its task, values, field errors, and scroll after native response', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-390', 'desktop'].includes(testInfo.project.name));
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    const project = db.prepare('SELECT id FROM project ORDER BY id LIMIT 1').get() as
      | { id: string }
      | undefined;
    const entity = db.prepare('SELECT id,currency FROM legal_entity ORDER BY id LIMIT 1').get() as
      | { id: string; currency: string }
      | undefined;
    if (!project || !entity)
      throw new Error('Issuing revision validation needs a seeded project and legal entity');
    await signIn(page, 'owner');
    await page.goto(portal(`/finance?view=commercial&project=${project.id}`));
    await page.locator('.finance-authority-revision summary').click();
    const form = page.locator('form[data-canonical-revision-form]');
    await form.locator('[name="legacyLegalEntityId"]').selectOption(entity.id);
    await form.locator('[name="effectiveFrom"]').fill('2026-09-26');
    await form.locator('[name="legalName"]').fill('  ');
    await form.locator('[name="addressLine1"]').fill('1 Review Street');
    await form.locator('[name="locality"]').fill('Test City');
    await form.locator('[name="postalCode"]').fill('00000');
    await form.locator('[name="countryCode"]').fill('US');
    await form.locator('[name="baseCurrency"]').fill(entity.currency);
    await form.locator('[name="timezone"]').fill('Europe/Madrid');
    await form.locator('[name="reason"]').fill('Review this draft before saving');
    await form.getByRole('button', { name: 'Save legal entity revision' }).scrollIntoViewIfNeeded();
    const beforeScroll = await page.evaluate(() => window.scrollY);
    await form.getByRole('button', { name: 'Save legal entity revision' }).click();

    await expect(page.locator('[data-finance-problem] [data-problem-code]')).toHaveAttribute(
      'data-problem-code',
      'FINANCE_LEGAL_ENTITY_REVISION_FIELDS_INVALID',
    );
    await expect(page.locator('#finance-configuration-task')).toHaveValue(
      'Project issuing authority',
    );
    await expect(page.locator('.finance-authority-revision')).toHaveAttribute('open', '');
    await expect(form.locator('[name="legacyLegalEntityId"]')).toHaveValue(entity.id);
    await expect(form.locator('[name="timezone"]')).toHaveValue('Europe/Madrid');
    await expect(form.locator('[data-validation-summary]')).toBeVisible();
    await expect(form.locator('[name="legalName"]')).toHaveAttribute('aria-invalid', 'true');
    expect(beforeScroll).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(form.locator('[name="legalName"]')).toBeFocused();
    const focusedFieldIsVisible = await form.locator('[name="legalName"]').evaluate((field) => {
      const bounds = field.getBoundingClientRect();
      return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
    });
    expect(focusedFieldIsVisible).toBe(true);
  } finally {
    db.close();
  }
});
