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
    await page.getByRole('button', { name: 'New legal entity' }).click();
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
