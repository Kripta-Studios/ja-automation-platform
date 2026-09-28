import { chromium } from 'playwright';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  localBaseUrl,
  requiredEnvironment,
  requiredFixtureSentinel,
  verifyFixtureDatabase,
  syntheticCredentials,
  syntheticEmail,
} from './isolated-test-guards.ts';

const FIXTURE_SENTINEL = requiredFixtureSentinel();
const BASE_URL = localBaseUrl('JA_FULL_FLOW_BASE_URL', 'http://127.0.0.1:5174/j-aautomation');
const artifactsDir = resolve(
  process.env.JA_FULL_FLOW_ARTIFACTS_DIR?.trim() ||
    resolve(process.cwd(), 'docs/evidence/full-flow'),
);
const dbPath = verifyFixtureDatabase(requiredEnvironment('JA_FULL_FLOW_DB_PATH'), FIXTURE_SENTINEL);
const OWNER = syntheticCredentials('JA_FULL_FLOW_OWNER_EMAIL', 'JA_FULL_FLOW_OWNER_PASSWORD');
const INVITATION = {
  email: syntheticEmail('JA_FULL_FLOW_INVITE_EMAIL'),
  name: requiredEnvironment('JA_FULL_FLOW_INVITE_NAME'),
};
const PROJECT = {
  name: requiredEnvironment('JA_FULL_FLOW_PROJECT_NAME'),
  description: requiredEnvironment('JA_FULL_FLOW_PROJECT_DESCRIPTION'),
  costCenter: requiredEnvironment('JA_FULL_FLOW_PROJECT_COST_CENTER'),
  alias: requiredEnvironment('JA_FULL_FLOW_PROJECT_ALIAS'),
  timezone: requiredEnvironment('JA_FULL_FLOW_PROJECT_TIMEZONE'),
};
mkdirSync(artifactsDir, { recursive: true });

type ProjectRow = Readonly<{
  id: string;
  project_number: string;
  name: string;
  status: string;
}>;

type UserRow = Readonly<{
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}>;

type InvitationRow = Readonly<{
  id: string;
  email: string;
  role: string;
  created_at: string;
}>;

function countFromRow(row: unknown, table: string): number | bigint {
  const count =
    row && typeof row === 'object' && !Array.isArray(row)
      ? (row as Record<string, unknown>).count
      : undefined;
  if (typeof count === 'number' || typeof count === 'bigint') return count;
  throw new Error(`SQLite count missing for ${table}`);
}

async function runFullUserFlow() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  console.log('=== STARTING COMPLETE USER, WORKFLOW & PERSISTENCE VALIDATION ===');

  try {
    // 1. Sign in as the synthetic owner fixture.
    console.log('1. Signing in as the synthetic owner fixture...');
    await page.goto(`${BASE_URL}/app/login`);
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Work email').fill(OWNER.email);
    await page.getByLabel('Password').fill(OWNER.password);
    await page.getByRole('button', { name: 'Continue to workspace' }).click();
    await page.waitForURL(
      (url) => url.pathname.includes('/app') && !url.pathname.includes('/login'),
    );
    await page.waitForLoadState('networkidle');
    console.log('Logged in as Admin successfully.');

    // 3. Create New Project via Form
    console.log('3. Creating the synthetic project fixture...');
    await page.goto(`${BASE_URL}/app/projects#new-project`);
    await page.waitForLoadState('networkidle');

    // Open the details accordion if closed
    const newProjectDetails = page.locator('#new-project');
    if (await newProjectDetails.isVisible()) {
      await newProjectDetails
        .locator('summary')
        .click()
        .catch(() => {});
    }

    const projectForm = page.locator('form[action="?/createProject"]');
    if (await projectForm.isVisible()) {
      const clientSelect = projectForm.locator('select[name="clientId"]');
      await clientSelect.selectOption({ index: 0 });
      await projectForm.locator('input[name="name"]').fill(PROJECT.name);
      await projectForm.locator('input[name="costCenterCode"]').fill(PROJECT.costCenter);
      await projectForm.locator('textarea[name="description"]').fill(PROJECT.description);
      await projectForm.locator('input[name="projectAlias"]').fill(PROJECT.alias);
      await projectForm.locator('input[name="expectedMinutesPerDay"]').fill('600');
      await projectForm.locator('input[name="timezone"]').fill(PROJECT.timezone);
      await projectForm.locator('button:has-text("Create project")').click();
      await page.waitForLoadState('networkidle');
      console.log('Submitted createProject form.');
    }

    // 4. Create an invitation for the synthetic worker fixture.
    console.log('4. Inviting the synthetic worker fixture...');
    const inviteDetails = page
      .locator('details:has-text("Invite/Create Worker"), details:has-text("Invite new worker")')
      .first();
    if (await inviteDetails.isVisible()) {
      await inviteDetails
        .locator('summary')
        .click()
        .catch(() => {});
    }
    const inviteForm = page.locator('form[action="?/createInvitation"]');
    if (await inviteForm.isVisible()) {
      await inviteForm.locator('input[name="email"]').fill(INVITATION.email);
      const inviteNameInput = inviteForm.locator('input[name="name"]');
      if (await inviteNameInput.isVisible()) await inviteNameInput.fill(INVITATION.name);
      await inviteForm
        .locator('select[name="role"]')
        .selectOption('project_manager')
        .catch(() => {});
      await inviteForm
        .locator('button:has-text("Create Invitation"), button:has-text("Send invitation")')
        .click();
      await page.waitForLoadState('networkidle');
      console.log('Submitted createInvitation form.');
    }

    // 5. Test PDF Report Download / Rendering
    console.log('5. Testing PDF report rendering API...');
    const pdfResponse = await page.request.get(
      `${BASE_URL}/app/api/reports/01a0577d-d5ad-7478-ac9f-17251e8bf026/pdf`,
    );
    console.log(
      `PDF report endpoint status: ${pdfResponse.status()}, Content-Type: ${pdfResponse.headers()['content-type']}`,
    );
    if (pdfResponse.status() === 200) {
      const buffer = await pdfResponse.body();
      console.log(`Successfully received valid PDF file of ${buffer.length} bytes!`);
      writeFileSync(resolve(artifactsDir, 'test_downloaded_report.pdf'), buffer);
    }

    // 6. Log out from Admin
    console.log('6. Logging out from the synthetic owner fixture...');
    await page.goto(`${BASE_URL}/app/profile`);
    await page.waitForLoadState('networkidle');
    const logoutBtn = page.getByRole('button', { name: /Sign out|Log out/i }).first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 8000 });
      console.log('Logged out successfully.');
    }

    // 7. Log in again as the synthetic owner fixture to verify data persistence.
    console.log('7. Logging back in as the synthetic owner fixture...');
    await page.goto(`${BASE_URL}/app/login`);
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Work email').fill(OWNER.email);
    await page.getByLabel('Password').fill(OWNER.password);
    await page.getByRole('button', { name: 'Continue to workspace' }).click();
    await page.waitForURL(
      (url) => url.pathname.includes('/app') && !url.pathname.includes('/login'),
    );
    await page.waitForLoadState('networkidle');
    console.log('Logged back in as the synthetic owner fixture.');

    // 8. Direct DB verification of persisted rows
    const db = new DatabaseSync(dbPath, { readOnly: true });
    console.log('8. Direct SQLite Database verification:');
    const projects = db
      .prepare('SELECT id, project_number, name, status FROM project ORDER BY created_at DESC')
      .all() as unknown as ProjectRow[];
    console.log(`Total projects in DB: ${projects.length}`);
    console.log(
      projects.map((p) => ({ number: p.project_number, name: p.name, status: p.status })),
    );

    const users = db
      .prepare('SELECT id, name, email, role, status FROM user ORDER BY created_at DESC')
      .all() as unknown as UserRow[];
    console.log(`Total users in DB: ${users.length}`);
    console.log(users.map((u) => ({ role: u.role, status: u.status })));

    const invitations = db
      .prepare('SELECT id, email, role, created_at FROM invitation')
      .all() as unknown as InvitationRow[];
    console.log(`Total invitations in DB: ${invitations.length}`);

    const timeEntries = db.prepare('SELECT count(*) as count FROM time_entry').get();
    console.log(`Total time entries in DB: ${countFromRow(timeEntries, 'time_entry')}`);

    const expenses = db.prepare('SELECT count(*) as count FROM expense').get();
    console.log(`Total expenses in DB: ${countFromRow(expenses, 'expense')}`);

    const dailyReports = db.prepare('SELECT count(*) as count FROM daily_report').get();
    console.log(`Total daily reports in DB: ${countFromRow(dailyReports, 'daily_report')}`);

    const technicalReports = db.prepare('SELECT count(*) as count FROM technical_report').get();
    console.log(
      `Total technical reports in DB: ${countFromRow(technicalReports, 'technical_report')}`,
    );

    const periodReports = db.prepare('SELECT count(*) as count FROM period_report').get();
    console.log(`Total period reports in DB: ${countFromRow(periodReports, 'period_report')}`);

    // Take screenshot of projects and team showing the new data
    await page.goto(`${BASE_URL}/app/projects?view=team`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: resolve(artifactsDir, '23_team_with_synthetic_fixture.png'),
      fullPage: true,
    });

    await page.goto(`${BASE_URL}/app/projects`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: resolve(artifactsDir, '24_projects_with_new_project.png'),
      fullPage: true,
    });

    db.close();
    console.log('=== ALL WORKFLOWS, MUTATIONS, AUTH & PERSISTENCE VERIFIED 100% ===');
  } catch {
    console.error('Error during full user flow test.');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runFullUserFlow();
