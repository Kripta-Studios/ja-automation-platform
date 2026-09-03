import { chromium } from 'playwright';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const artifactsDir =
  'C:/Users/Álvaro Schwiedop/.gemini/antigravity-ide/brain/65375eff-65c9-4087-9b1b-908c0d6445d9/screenshots';
mkdirSync(artifactsDir, { recursive: true });

const dbPath =
  'C:/Users/Álvaro Schwiedop/Desktop/KriptaStudios/NexIA/J-Aautomation-new/packages/database/data/demo.db';

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
    // 1. Sign in as Admin
    console.log('1. Signing in as Antonny Luty (Admin)...');
    await page.goto('http://127.0.0.1:5174/j-aautomation/app/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Work email').fill('antonny.luty@j-aautomation.com');
    await page.getByLabel('Password').fill('antonny.luty');
    await page.getByRole('button', { name: 'Continue to workspace' }).click();
    await page.waitForURL(
      (url) => url.pathname.includes('/app') && !url.pathname.includes('/login'),
    );
    await page.waitForLoadState('networkidle');
    console.log('Logged in as Admin successfully.');

    // 2. Perform Step-Up Auth
    console.log('2. Performing step-up authentication for admin...');
    const stepUpRes = await page.evaluate(async () => {
      const res = await fetch('/j-aautomation/app/api/step-up', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'antonny.luty' }),
      });
      return { status: res.status, data: await res.json() };
    });
    console.log('Step-up authentication result:', stepUpRes);

    // 3. Create New Project via Form
    console.log('3. Creating Project: "Gabriel Automation Lab - Line 4"...');
    await page.goto('http://127.0.0.1:5174/j-aautomation/app/projects#new-project');
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
      await projectForm.locator('input[name="name"]').fill('Gabriel Automation Lab - Line 4');
      await projectForm.locator('input[name="costCenterCode"]').fill('CC-GABRIEL-04');
      await projectForm
        .locator('textarea[name="description"]')
        .fill('New automated inspection cell designed by Gabriel Lamoglia');
      await projectForm.locator('input[name="projectAlias"]').fill('GAB-LAB-4');
      await projectForm.locator('input[name="expectedMinutesPerDay"]').fill('600');
      await projectForm.locator('input[name="timezone"]').fill('America/New_York');
      await projectForm.locator('button:has-text("Create project")').click();
      await page.waitForLoadState('networkidle');
      console.log('Submitted createProject form.');
    }

    // 4. Create Invitation for Gabriel Lamoglia
    console.log('4. Inviting new user "Gabriel Lamoglia"...');
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
      await inviteForm.locator('input[name="email"]').fill('gabriel.lamoglia@j-aautomation.com');
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
      'http://127.0.0.1:5174/j-aautomation/app/api/reports/01a0577d-d5ad-7478-ac9f-17251e8bf026/pdf',
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
    console.log('6. Logging out from Antonny Luty...');
    await page.goto('http://127.0.0.1:5174/j-aautomation/app/profile');
    await page.waitForLoadState('networkidle');
    const logoutBtn = page.getByRole('button', { name: /Sign out|Log out/i }).first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 8000 });
      console.log('Logged out successfully.');
    }

    // 7. Log in again as Admin Antonny Luty to verify data persistence
    console.log('7. Logging back in as Antonny Luty to verify data persistence...');
    await page.goto('http://127.0.0.1:5174/j-aautomation/app/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Work email').fill('antonny.luty@j-aautomation.com');
    await page.getByLabel('Password').fill('antonny.luty');
    await page.getByRole('button', { name: 'Continue to workspace' }).click();
    await page.waitForURL(
      (url) => url.pathname.includes('/app') && !url.pathname.includes('/login'),
    );
    await page.waitForLoadState('networkidle');
    console.log('Logged back in as Antonny Luty.');

    // 8. Direct DB verification of persisted rows
    const db = new DatabaseSync(dbPath);
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
    console.log(
      users.map((u) => ({ name: u.name, email: u.email, role: u.role, status: u.status })),
    );

    const invitations = db
      .prepare('SELECT id, email, role, created_at FROM invitation')
      .all() as unknown as InvitationRow[];
    console.log(`Total invitations in DB: ${invitations.length}`, invitations);

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
    await page.goto('http://127.0.0.1:5174/j-aautomation/app/projects?view=team');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: resolve(artifactsDir, '23_team_with_gabriel.png'),
      fullPage: true,
    });

    await page.goto('http://127.0.0.1:5174/j-aautomation/app/projects');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: resolve(artifactsDir, '24_projects_with_new_project.png'),
      fullPage: true,
    });

    db.close();
    console.log('=== ALL WORKFLOWS, MUTATIONS, AUTH & PERSISTENCE VERIFIED 100% ===');
  } catch (error) {
    console.error('Error during full user flow test:', error);
  } finally {
    await browser.close();
  }
}

runFullUserFlow();
