import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { capabilityForJobKind, createDatabase } from '@ja/database';
import {
  B5_TEST_SERVICE_CAPABILITIES,
  installB5TestDeploymentIdentity,
} from '../fixtures/b5-test-environment.js';

type DemoRun = { root: string; databasePath: string };
const fixtureSentinel = '550e8400-e29b-41d4-a716-446655440000';

const runs: DemoRun[] = [];
const restoreDeploymentIdentities: (() => void)[] = [];

beforeEach(() => {
  restoreDeploymentIdentities.push(installB5TestDeploymentIdentity());
  process.env.JA_TENANT_ID = 'e2e-client-essential-tenant';
  process.env.JA_DEPLOYMENT_ID = 'e2e-client-essential-deployment';
});

afterEach(() => {
  for (const run of runs.splice(0)) rmSync(run.root, { recursive: true, force: true });
  for (const restore of restoreDeploymentIdentities.splice(0).reverse()) restore();
});

function runDemoSeed(): DemoRun {
  const root = mkdtempSync(join(tmpdir(), 'ja-demo-fixtures-implementation-'));
  const databasePath = join(root, 'demo.db');
  const documentRoot = join(root, `documents-${fixtureSentinel}`);
  const output = execFileSync(
    process.execPath,
    ['--experimental-strip-types', resolve(process.cwd(), 'packages/database/src/demo-seed.ts')],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        JA_DATABASE_PATH: databasePath,
        JA_DOCUMENT_ROOT: documentRoot,
        JA_TENANT_ID: 'e2e-client-essential-tenant',
        JA_DEPLOYMENT_ID: 'e2e-client-essential-deployment',
        JA_DEMO_SEED_PRESERVE_DB: 'false',
        JA_FIXTURE_RESET_DOCUMENTS: 'true',
        JA_FIXTURE_SENTINEL: fixtureSentinel,
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
              AND (step_up_verified_at IS NOT NULL OR step_up_expires_at IS NOT NULL)`,
        ),
      ).toBe(0);
      expect(
        count(
          `SELECT count(*) count FROM user
            WHERE status='active' AND mfa_required<>0`,
        ),
      ).toBe(0);
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
        tenant_id: 'e2e-client-essential-tenant',
        deployment_id: 'e2e-client-essential-deployment',
        singleton: 1,
        binding_tenant_id: 'e2e-client-essential-tenant',
        binding_deployment_id: 'e2e-client-essential-deployment',
        service_actor_id: 'demo-client-essential-service-actor',
        bound_by_role: 'owner_admin',
        bound_by_email: 'owner@demo.jaautomation.test',
        version: 1,
      });
      const capabilities = JSON.parse(actor!.capabilities_json) as unknown;
      expect(capabilityForJobKind('worker_statement_artifact_render')).toBe(
        'artifact.worker_statement.render',
      );
      expect(capabilities).toEqual([...B5_TEST_SERVICE_CAPABILITIES]);
      expect(capabilities).toContain('artifact.worker_statement.render');
      expect(
        count(
          `SELECT count(*) count
             FROM service_actor s
             JOIN user u ON u.id=s.id`,
        ),
        'a human user must never be reused as the service actor',
      ).toBe(0);
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
