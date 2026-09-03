import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ja/database', () => ({
  openDatabase: vi.fn(),
  readinessCheck: vi.fn(),
  validateReviewedMigrationContract: vi.fn(() => ({
    directory: process.env.JA_MIGRATIONS_PATH ?? 'migrations',
    expectedMigrationVersion: 25,
    manifestSha256: 'a'.repeat(64),
    reviewedMigrationFiles: ['0025_client_essential_client_fields.sql'],
  })),
}));

import { openDatabase, readinessCheck, validateReviewedMigrationContract } from '@ja/database';
import {
  cachedOperationalReadiness,
  createReadinessGate,
  isRealDirectoryPath,
  operationalReadiness,
  parseMinimumFreeBytes,
  probeDiskReadiness,
  readinessGate,
} from '../../apps/portal/src/lib/server/health-readiness.js';

const mockedOpenDatabase = vi.mocked(openDatabase);
const mockedReadinessCheck = vi.mocked(readinessCheck);
const mockedValidateContract = vi.mocked(validateReviewedMigrationContract);
const originalEnvironment = { ...process.env };
const createdDirectories: string[] = [];

function baseReadiness(overrides: Partial<ReturnType<typeof readinessCheck>> = {}) {
  return {
    ok: true,
    integrity: 'ok',
    migrationVersion: 25,
    expectedMigrationVersion: 25,
    writableDirectories: true,
    writeReady: true,
    diskFreeBytes: 2_000_000_000,
    diskFreeThresholdBytes: 1_000,
    ...overrides,
  } as ReturnType<typeof readinessCheck>;
}

function fixtureDirectories() {
  const root = mkdtempSync(join(tmpdir(), 'ja-health-'));
  createdDirectories.push(root);
  const migrations = join(root, 'migrations');
  mkdirSync(migrations);
  writeFileSync(join(migrations, '0025_client_essential.sql'), '-- test migration\n');
  return { root, migrations };
}

beforeEach(() => {
  readinessGate.clear();
  mockedOpenDatabase.mockReturnValue({ close: vi.fn() } as never);
  mockedValidateContract.mockImplementation(() => ({
    directory: process.env.JA_MIGRATIONS_PATH ?? 'migrations',
    expectedMigrationVersion: 25,
    manifestSha256: 'a'.repeat(64),
    reviewedMigrationFiles: ['0025_client_essential_client_fields.sql'],
  }));
  mockedReadinessCheck.mockReturnValue(baseReadiness());
  process.env.JA_MIN_FREE_BYTES = '0';
});

afterEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnvironment)) process.env[key] = value;
  for (const directory of createdDirectories.splice(0))
    rmSync(directory, { force: true, recursive: true });
});

describe('Client Essential readiness policy', () => {
  it('uses a production-safe default and rejects malformed thresholds', () => {
    delete process.env.JA_MIN_FREE_BYTES;
    expect(parseMinimumFreeBytes(undefined)).toEqual({ valid: true, value: 1_073_741_824 });
    expect(parseMinimumFreeBytes('0')).toEqual({ valid: true, value: 0 });
    expect(parseMinimumFreeBytes('536870912')).toEqual({ valid: true, value: 536_870_912 });
    for (const invalid of ['', ' 1', '-1', '1.5', '1e6', '9007199254740992']) {
      expect(parseMinimumFreeBytes(invalid).valid, invalid).toBe(false);
    }
  });

  it('passes only when the DB, current migration set and private storage are ready', () => {
    const fixture = fixtureDirectories();
    process.env.JA_MIGRATIONS_PATH = fixture.migrations;
    process.env.JA_DOCUMENT_ROOT = fixture.root;

    expect(operationalReadiness({} as never).ok).toBe(true);

    mockedReadinessCheck.mockReturnValue(baseReadiness({ migrationVersion: 24 }));
    expect(operationalReadiness({} as never).ok).toBe(false);

    mockedReadinessCheck.mockReturnValue(
      baseReadiness({ integrity: 'database unavailable', ok: false }),
    );
    expect(operationalReadiness({} as never).ok).toBe(false);
  });

  it('fails closed for missing private storage and missing migrations', () => {
    const fixture = fixtureDirectories();
    process.env.JA_DOCUMENT_ROOT = join(fixture.root, 'missing');
    process.env.JA_MIGRATIONS_PATH = join(fixture.root, 'missing-migrations');

    expect(operationalReadiness({} as never).ok).toBe(false);

    process.env.JA_MIGRATIONS_PATH = fixture.migrations;
    mockedReadinessCheck.mockReturnValue(baseReadiness({ writableDirectories: false }));
    expect(operationalReadiness({} as never).ok).toBe(false);
  });

  it('rejects symlinked private roots and nested path components', () => {
    const root = mkdtempSync(join(tmpdir(), 'ja-health-symlink-'));
    const outside = mkdtempSync(join(tmpdir(), 'ja-health-symlink-outside-'));
    createdDirectories.push(root, outside);
    const linkedRoot = join(root, 'linked-root');
    try {
      symlinkSync(outside, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      throw error;
    }
    expect(isRealDirectoryPath(linkedRoot)).toBe(false);
    process.env.JA_DOCUMENT_ROOT = linkedRoot;
    expect(operationalReadiness({} as never).ok).toBe(false);

    const nestedRoot = join(root, 'nested-root');
    mkdirSync(nestedRoot);
    const linkedParent = join(nestedRoot, 'reports');
    try {
      symlinkSync(outside, linkedParent, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      throw error;
    }
    expect(isRealDirectoryPath(join(nestedRoot, 'reports', 'daily'))).toBe(false);
    process.env.JA_DOCUMENT_ROOT = join(nestedRoot, 'reports', 'daily');
    expect(operationalReadiness({} as never).ok).toBe(false);
  });

  it('fails closed for invalid thresholds even when all other probes pass', () => {
    const fixture = fixtureDirectories();
    process.env.JA_MIGRATIONS_PATH = fixture.migrations;
    process.env.JA_DOCUMENT_ROOT = fixture.root;
    process.env.JA_MIN_FREE_BYTES = 'not-a-number';

    const result = operationalReadiness({} as never);
    expect(result.ok).toBe(false);
    expect(result.configurationValid).toBe(false);
    expect(result.diskFreeThresholdBytes).toBe(1_073_741_824);
  });

  it('supports deterministic healthy, low-space and unavailable disk probes', () => {
    expect(probeDiskReadiness('/private', 100, () => ({ bavail: 200, bsize: 1 }))).toEqual({
      available: true,
      freeBytes: 200,
      ready: true,
    });
    expect(probeDiskReadiness('/private', 100, () => ({ bavail: 99, bsize: 1 }))).toEqual({
      available: true,
      freeBytes: 99,
      ready: false,
    });
    expect(
      probeDiskReadiness('/private', 0, () => {
        throw new Error('unreadable');
      }),
    ).toEqual({ available: false, freeBytes: null, ready: false });
  });

  it('single-flights concurrent expensive probes and caches them briefly', async () => {
    const gate = createReadinessGate<number>(50);
    let calls = 0;
    const probe = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return 42;
    };

    const values = await Promise.all(Array.from({ length: 20 }, () => gate.get(probe)));
    expect(values).toEqual(Array.from({ length: 20 }, () => 42));
    expect(calls).toBe(1);
    expect(await gate.get(probe)).toBe(42);
    expect(calls).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(await gate.get(probe)).toBe(42);
    expect(calls).toBe(2);
  });

  it('single-flights the actual cached readiness database probe', async () => {
    const fixture = fixtureDirectories();
    process.env.JA_MIGRATIONS_PATH = fixture.migrations;
    process.env.JA_DOCUMENT_ROOT = fixture.root;
    const responses = await Promise.all(
      Array.from({ length: 12 }, () => cachedOperationalReadiness()),
    );
    expect(responses).toHaveLength(12);
    expect(mockedOpenDatabase).toHaveBeenCalledTimes(1);
    expect(mockedReadinessCheck).toHaveBeenCalledTimes(1);
  });
});

describe('Client Essential deployment contracts', () => {
  it('routes readiness to the portal and keeps the response redacted', () => {
    const route = readFileSync(resolve('apps/portal/src/routes/app/api/health/+server.ts'), 'utf8');
    const readyRoute = readFileSync(
      resolve('apps/portal/src/routes/health/ready/+server.ts'),
      'utf8',
    );
    const caddy = readFileSync(resolve('deployment/Caddyfile.snippet'), 'utf8');
    const compose = readFileSync(resolve('deployment/compose.production.yml'), 'utf8');
    const verifier = readFileSync(resolve('deployment/scripts/verify-vps.sh'), 'utf8');

    expect(route).toContain('cache-control');
    expect(route).toContain('cachedOperationalReadiness');
    expect(route).not.toContain('JA_DATABASE_PATH');
    expect(route).not.toContain('error.message');
    expect(readyRoute).toContain('cachedOperationalReadiness');
    expect(readyRoute).toContain('status: readiness.ok ? 200 : 503');
    expect(caddy).toMatch(/remote_ip 127\.0\.0\.1 ::1/u);
    expect(caddy).toMatch(/handle \/j-aautomation\/health\/\*[\s\S]*respond "Not Found" 404/u);
    expect(caddy).toMatch(
      /handle @jaautomation_health_local[\s\S]*reverse_proxy 127\.0\.0\.1:5100/u,
    );
    expect(caddy).toContain('log_skip /j-aautomation/app/invite/*');
    expect(compose).toContain('/j-aautomation/health/ready');
    expect(verifier).toContain('/j-aautomation/health/ready');
  });

  it('starts the portal/site topology through the supervised production service', () => {
    const service = readFileSync(resolve('deployment/jaautomation.service'), 'utf8');
    const jobsService = readFileSync(resolve('deployment/jaautomation-jobs.service'), 'utf8');
    const jobsTimer = readFileSync(resolve('deployment/jaautomation-jobs.timer'), 'utf8');
    const dockerfile = readFileSync(resolve('deployment/Dockerfile.portal'), 'utf8');
    const config = readFileSync(resolve('deployment/jaautomation.env.example'), 'utf8');
    const compose = readFileSync(resolve('deployment/compose.production.yml'), 'utf8');
    expect(service).toContain(
      'docker compose --env-file /etc/jaautomation/jaautomation.env -f deployment/compose.production.yml up -d',
    );
    expect(jobsService).toContain('EnvironmentFile=/etc/jaautomation/jaautomation.env');
    expect(jobsService).not.toContain('EnvironmentFile=-/etc/jaautomation/jaautomation.env');
    expect(jobsService).toContain(
      'docker compose --env-file /etc/jaautomation/jaautomation.env -f deployment/compose.production.yml up -d --no-deps jobs',
    );
    expect(jobsService).not.toContain('--profile jobs');
    expect(jobsService).not.toContain('run --rm --no-deps jobs');
    expect(jobsTimer).toContain('Unit=jaautomation-jobs.service');
    expect(jobsTimer).toContain('OnUnitActiveSec=5min');
    expect(compose).toContain('command: [node, /app/deployment/jobs-run.mjs, --loop]');
    expect(compose).not.toContain('profiles: [jobs]');
    expect(dockerfile).toContain('node:24.19.0-bookworm-slim');
    expect(config).toContain('JA_MIN_FREE_BYTES=1073741824');
    expect(config).toContain('JA_JOBS_POLL_MS=5000');
  });

  it('uses the canonical production host for implicit VPS smoke checks', () => {
    const verifier = readFileSync(resolve('deployment/scripts/verify-vps.sh'), 'utf8');
    const deployer = readFileSync(resolve('deployment/scripts/jaautomation-zip-deploy'), 'utf8');

    expect(verifier).toContain('BASE_URL=${1:-https://j-aautomation.com/j-aautomation}');
    expect(deployer).toContain('PUBLIC_SITE_URL=https://j-aautomation.com/j-aautomation/en');
    expect(deployer).toContain(
      'PUBLIC_PORTAL_URL=https://j-aautomation.com/j-aautomation/app/login',
    );
    expect(verifier).toContain('Always-on jobs worker has no structured jobs.cycle record');
    expect(deployer).toContain('El worker de jobs del candidato no quedó en ejecución');
    expect(deployer).toContain('"event":"jobs.cycle"');
    expect(verifier).not.toContain('gex-dashboard.hopto.org');
    expect(deployer).not.toContain('gex-dashboard.hopto.org');
  });
});
