import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@ja/database';
import {
  B5_TEST_DEPLOYMENT_ID,
  B5_TEST_TENANT_ID,
  installB5TestDeploymentIdentity,
} from '../fixtures/b5-test-environment.js';

// Requirement coverage: V32-001, V33-017 and the compensation/billing fixture portions of V31-014.

type SeedRun = {
  root: string;
  databasePath: string;
  documentRoot: string;
};

const runs: SeedRun[] = [];
const restoreDeploymentIdentities: (() => void)[] = [];

beforeEach(() => {
  restoreDeploymentIdentities.push(installB5TestDeploymentIdentity());
});

afterEach(() => {
  for (const run of runs.splice(0)) rmSync(run.root, { recursive: true, force: true });
  for (const restore of restoreDeploymentIdentities.splice(0).reverse()) restore();
});

function seededDemo(): SeedRun {
  const root = mkdtempSync(join(tmpdir(), 'ja-requested-demo-'));
  const databasePath = join(root, 'demo.db');
  const documentRoot = join(root, 'documents');
  const output = execFileSync(
    process.execPath,
    ['--experimental-strip-types', resolve(process.cwd(), 'packages/database/src/demo-seed.ts')],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        JA_DATABASE_PATH: databasePath,
        JA_DOCUMENT_ROOT: documentRoot,
        JA_TENANT_ID: B5_TEST_TENANT_ID,
        JA_DEPLOYMENT_ID: B5_TEST_DEPLOYMENT_ID,
        JA_DEMO_SEED_PRESERVE_DB: 'false',
        JA_FIXTURE_RESET_DOCUMENTS: 'true',
      },
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  expect(output, 'demo seed must finish with a JSON summary').toMatch(/"counts"\s*:/);
  const run = { root, databasePath, documentRoot };
  runs.push(run);
  return run;
}

function counts(run: SeedRun): Record<string, number> {
  // Opening the isolated seeded database exercises the same migration/runtime path
  // as the portal without touching the repository's shared demo database.
  const { sqlite } = createDatabase(run.databasePath);
  try {
    const read = (sql: string): number =>
      Number((sqlite.prepare(sql).get() as { count: number }).count);
    return {
      compensationRules: read('SELECT count(*) count FROM compensation_rule'),
      projectBudgetContexts: read(
        'SELECT count(*) count FROM project WHERE budget_minor IS NOT NULL OR revenue_budget_minor IS NOT NULL OR po_cap_minor IS NOT NULL OR labor_budget_minutes IS NOT NULL OR travel_budget_minor IS NOT NULL',
      ),
      settlements: read('SELECT count(*) count FROM compensation_settlement'),
      billingRules: read('SELECT count(*) count FROM billing_rule'),
      invoices: read('SELECT count(*) count FROM invoice'),
      skills: read('SELECT count(*) count FROM skill'),
      workers: read("SELECT count(*) count FROM user WHERE role='worker' AND status='active'"),
      contacts: read('SELECT count(*) count FROM client_contact'),
    };
  } finally {
    sqlite.close();
  }
}

describe('requested deterministic demo data', () => {
  it('seeds representative compensation, budget, settlement, billing and invoice records', () => {
    const run = seededDemo();
    const result = counts(run);

    expect(
      result.compensationRules,
      'compensation statement needs multiple rules',
    ).toBeGreaterThanOrEqual(3);
    expect(
      result.projectBudgetContexts,
      'assignment budget context needs representative projects',
    ).toBeGreaterThanOrEqual(3);
    expect(
      result.settlements,
      'settlement status needs at least one deterministic record',
    ).toBeGreaterThanOrEqual(1);
    expect(
      result.billingRules,
      'billing streams/rules need representative records',
    ).toBeGreaterThanOrEqual(3);
    expect(result.invoices, 'invoice screen needs representative records').toBeGreaterThanOrEqual(
      3,
    );
  });

  it('seeds a non-empty skill catalog for worker selection and availability management', () => {
    const run = seededDemo();
    const result = counts(run);
    expect(
      result.skills,
      'skills must be selectable from the owner/admin forms',
    ).toBeGreaterThanOrEqual(3);
    expect(
      result.workers,
      'owner/admin worker selectors need active workers',
    ).toBeGreaterThanOrEqual(2);
    expect(
      result.contacts,
      'client-contact surface needs representative records',
    ).toBeGreaterThanOrEqual(3);
  });
});
