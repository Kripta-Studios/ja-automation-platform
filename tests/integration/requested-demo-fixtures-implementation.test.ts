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

type DemoRun = { root: string; databasePath: string };

const runs: DemoRun[] = [];
const restoreDeploymentIdentities: (() => void)[] = [];

beforeEach(() => {
  restoreDeploymentIdentities.push(installB5TestDeploymentIdentity());
});

afterEach(() => {
  for (const run of runs.splice(0)) rmSync(run.root, { recursive: true, force: true });
  for (const restore of restoreDeploymentIdentities.splice(0).reverse()) restore();
});

function runDemoSeed(): DemoRun {
  const root = mkdtempSync(join(tmpdir(), 'ja-demo-fixtures-implementation-'));
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
  expect(output).toMatch(/"counts"\s*:/);
  const run = { root, databasePath };
  runs.push(run);
  return run;
}

describe('requested demo fixture implementation', () => {
  it('covers representative finance and billing lifecycles', () => {
    const run = runDemoSeed();
    const { sqlite } = createDatabase(run.databasePath);
    try {
      const count = (sql: string): number =>
        Number((sqlite.prepare(sql).get() as { count: number }).count);
      expect(count('SELECT count(*) count FROM compensation_rule')).toBeGreaterThanOrEqual(6);
      expect(
        count("SELECT count(*) count FROM compensation_settlement WHERE state='settled'"),
      ).toBe(2);
      expect(
        count('SELECT count(*) count FROM billing_rule WHERE enabled=1'),
      ).toBeGreaterThanOrEqual(12);
      expect(count('SELECT count(*) count FROM invoice')).toBeGreaterThanOrEqual(6);
      expect(
        count("SELECT count(*) count FROM invoice WHERE state='issued'"),
      ).toBeGreaterThanOrEqual(1);
      expect(
        count("SELECT count(*) count FROM invoice WHERE state='draft'"),
      ).toBeGreaterThanOrEqual(3);
      expect(
        count(
          'SELECT count(*) count FROM project WHERE revenue_budget_minor IS NOT NULL AND labor_budget_minutes IS NOT NULL AND travel_budget_minor IS NOT NULL',
        ),
      ).toBe(4);
      expect(
        count(
          "SELECT count(*) count FROM technical_report WHERE report_date_provenance='native' AND report_date IS NOT NULL",
        ),
      ).toBeGreaterThanOrEqual(3);
      const identity = sqlite
        .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
        .get() as { tenant_id: string; deployment_id: string };
      const frame = (value: string): string =>
        Buffer.from(value, 'utf8').toString('hex').toUpperCase();
      const sourceLinks = sqlite
        .prepare('SELECT source_link_id FROM invoice_source ORDER BY source_link_id')
        .all() as Array<{ source_link_id: string }>;
      expect(sourceLinks.length).toBeGreaterThan(0);
      expect(new Set(sourceLinks.map((row) => row.source_link_id)).size).toBe(sourceLinks.length);
      expect(
        sourceLinks.every((row) =>
          row.source_link_id.startsWith(
            `native-source-v1:${frame(identity.tenant_id)}:${frame(identity.deployment_id)}:`,
          ),
        ),
      ).toBe(true);
    } finally {
      sqlite.close();
    }
  });

  it('provides an owner-managed skill catalog, worker assignments and availability history', () => {
    const run = runDemoSeed();
    const { sqlite } = createDatabase(run.databasePath);
    try {
      const count = (sql: string): number =>
        Number((sqlite.prepare(sql).get() as { count: number }).count);
      expect(count('SELECT count(*) count FROM skill')).toBeGreaterThanOrEqual(12);
      expect(count('SELECT count(*) count FROM worker_skill')).toBeGreaterThanOrEqual(12);
      expect(count('SELECT count(*) count FROM worker_availability')).toBeGreaterThanOrEqual(6);
      expect(count('SELECT count(*) count FROM client_contact')).toBeGreaterThanOrEqual(6);
      expect(count("SELECT count(*) count FROM user WHERE role='worker' AND status='active'")).toBe(
        3,
      );
    } finally {
      sqlite.close();
    }
  });
});
