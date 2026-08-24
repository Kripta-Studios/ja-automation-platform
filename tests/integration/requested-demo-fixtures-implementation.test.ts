import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@ja/database';
import {
  B5_TEST_DEPLOYMENT_ID,
  B5_TEST_SERVICE_CAPABILITIES,
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
          `SELECT count(*) count FROM finance_command
            WHERE (operation LIKE 'accounting_pack%' OR operation LIKE 'legal_entity_revision%')
              AND (step_up_verified_at IS NULL OR step_up_expires_at IS NULL)`,
        ),
      ).toBe(0);
      expect(
        count(
          `SELECT count(*) count FROM session
             JOIN user ON user.id=session.user_id
            WHERE user.role='finance_admin' AND user.status='active'
              AND session.step_up_at IS NOT NULL AND session.expires_at>session.step_up_at`,
        ),
      ).toBeGreaterThanOrEqual(1);
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

      const actor = sqlite
        .prepare(
          `SELECT s.id,s.name,s.status,s.tenant_id,s.deployment_id,s.capabilities_json,
                  b.singleton,b.tenant_id binding_tenant_id,b.deployment_id binding_deployment_id,
                  b.service_actor_id,b.bound_by_user_id,b.version,
                  u.role bound_by_role,u.email bound_by_email
             FROM service_actor s
             JOIN deployment_service_actor_binding b
               ON b.singleton=1 AND b.service_actor_id=s.id
             JOIN user u ON u.id=b.bound_by_user_id
            WHERE s.id=?`,
        )
        .get('demo-client-essential-service-actor') as
        | {
            id: string;
            name: string;
            status: string;
            tenant_id: string;
            deployment_id: string;
            capabilities_json: string;
            singleton: number;
            binding_tenant_id: string;
            binding_deployment_id: string;
            service_actor_id: string;
            bound_by_user_id: string;
            version: number;
            bound_by_role: string;
            bound_by_email: string;
          }
        | undefined;
      expect(actor).toBeDefined();
      expect(actor).toMatchObject({
        id: 'demo-client-essential-service-actor',
        name: 'Client Essential demo service actor',
        status: 'active',
        tenant_id: identity.tenant_id,
        deployment_id: identity.deployment_id,
        singleton: 1,
        binding_tenant_id: identity.tenant_id,
        binding_deployment_id: identity.deployment_id,
        service_actor_id: 'demo-client-essential-service-actor',
        bound_by_role: 'owner_admin',
        bound_by_email: 'antonny.luty@j-aautomation.com',
        version: 1,
      });
      expect(JSON.parse(actor!.capabilities_json)).toEqual([...B5_TEST_SERVICE_CAPABILITIES]);
      expect(count('SELECT count(*) count FROM deployment_service_actor_binding')).toBe(1);
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
