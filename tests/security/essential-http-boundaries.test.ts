import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '@ja/database';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const authMocks = vi.hoisted(() => ({ verifyPassword: vi.fn() }));
vi.mock('$lib/server/auth', () => ({
  auth: { api: { verifyPassword: authMocks.verifyPassword } },
}));

const { POST: stepUpPost } =
  await import('../../apps/portal/src/routes/app/api/step-up/+server.js');
const { GET: financeExportGet } =
  await import('../../apps/portal/src/routes/app/api/projects/[id]/finance-export/+server.js');
const { isRealIsoDate } = await import('../../apps/portal/src/lib/server/iso-date.js');

let directory: string;
let restoreDeploymentIdentity: (() => void) | undefined;
const previousDatabasePath = process.env.JA_DATABASE_PATH;
const previousNodeEnv = process.env.NODE_ENV;

function seedStepUpDatabase(databasePath: string): void {
  const database = createDatabase(databasePath);
  const now = new Date(Date.now() - 60_000).toISOString();
  const future = new Date(Date.now() + 60 * 60_000).toISOString();
  database.sqlite
    .prepare(
      "INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES('finance','Finance','finance@example.test','finance_admin','active',1,?,?)",
    )
    .run(now, now);
  database.sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run('finance-session', 'finance-token', 'finance', future, now, now, now);
  database.sqlite.close();
}

function stepUpEvent(password: string, clientIp = '198.51.100.17') {
  return {
    locals: {
      user: {
        id: 'finance',
        name: 'Finance',
        email: 'finance@example.test',
        role: 'finance_admin',
        status: 'active',
        mfaEnrolled: true,
        mfaRequired: false,
      },
      session: {
        id: 'finance-session',
        userId: 'finance',
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      },
    },
    request: new Request('http://localhost/j-aautomation/app/api/step-up', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    }),
    getClientAddress: () => clientIp,
  } as unknown as Parameters<typeof stepUpPost>[0];
}

function readStepUpSession(): { step_up_at: string | null } {
  const database = createDatabase();
  try {
    return database.sqlite
      .prepare('SELECT step_up_at FROM session WHERE id=?')
      .get('finance-session') as { step_up_at: string | null };
  } finally {
    database.sqlite.close();
  }
}

function readBucketCount(): number | undefined {
  const database = createDatabase();
  try {
    return (
      database.sqlite
        .prepare('SELECT request_count FROM rate_limit_bucket WHERE bucket_key LIKE ?')
        .get('%') as { request_count: number } | undefined
    )?.request_count;
  } finally {
    database.sqlite.close();
  }
}

beforeEach(() => {
  restoreDeploymentIdentity = installB5TestDeploymentIdentity();
  directory = mkdtempSync(join(tmpdir(), 'ja-essential-http-'));
  process.env.JA_DATABASE_PATH = join(directory, 'app.db');
  process.env.NODE_ENV = 'test';
  seedStepUpDatabase(process.env.JA_DATABASE_PATH);
  authMocks.verifyPassword.mockReset();
});

afterEach(() => {
  authMocks.verifyPassword.mockReset();
  if (previousDatabasePath === undefined) delete process.env.JA_DATABASE_PATH;
  else process.env.JA_DATABASE_PATH = previousDatabasePath;
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  restoreDeploymentIdentity?.();
  restoreDeploymentIdentity = undefined;
  rmSync(directory, { recursive: true, force: true });
});

describe('Client Essential step-up HTTP boundary', () => {
  it('returns 429 after repeated failures without changing step_up_at', async () => {
    authMocks.verifyPassword.mockResolvedValue({ status: false });
    const before = readStepUpSession().step_up_at;

    for (let attempt = 0; attempt < 5; attempt += 1)
      expect((await stepUpPost(stepUpEvent('definitely-wrong-password'))).status).toBe(401);

    const blocked = await stepUpPost(stepUpEvent('definitely-wrong-password'));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(authMocks.verifyPassword).toHaveBeenCalledTimes(5);
    expect(readStepUpSession().step_up_at).toBe(before);
    expect(readBucketCount()).toBe(5);
  });

  it('updates only the bound session and clears failures after a successful step-up', async () => {
    authMocks.verifyPassword
      .mockResolvedValueOnce({ status: false })
      .mockResolvedValueOnce({ status: true });
    const before = readStepUpSession().step_up_at;

    expect((await stepUpPost(stepUpEvent('wrong-password'))).status).toBe(401);
    const success = await stepUpPost(stepUpEvent('correct-password'));

    expect(success.status).toBe(200);
    expect(await success.json()).toEqual({ steppedUp: true });
    const after = readStepUpSession().step_up_at;
    expect(after).not.toBe(before);
    expect(after).toEqual(expect.any(String));
    expect(readBucketCount()).toBeUndefined();
  });
});

describe('Client Essential finance-export HTTP boundary', () => {
  it('accepts only real ISO calendar dates and rejects malformed periods', () => {
    expect(isRealIsoDate('2026-02-28')).toBe(true);
    expect(isRealIsoDate('2024-02-29')).toBe(true);
    expect(isRealIsoDate('2026-02-29')).toBe(false);
    expect(isRealIsoDate('2026-13-01')).toBe(false);
    expect(isRealIsoDate('2026-1-01')).toBe(false);
    expect(isRealIsoDate('2026-01-01\r\n";')).toBe(false);
  });

  it('rejects reversed periods before opening a project repository', () => {
    const event = {
      locals: {
        user: { id: 'finance', role: 'finance_admin' },
        session: { id: 'finance-session' },
      },
      params: { id: 'project-1' },
      url: new URL(
        'http://localhost/j-aautomation/app/api/projects/project-1/finance-export?periodStart=2026-09-01&periodEnd=2026-08-01',
      ),
    } as unknown as Parameters<typeof financeExportGet>[0];

    let thrown: unknown;
    try {
      financeExportGet(event);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ status: 400 });
  });

  it('keeps the ordinary XLSX response contract and safe semantic filename boundary', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'apps/portal/src/routes/app/api/projects/[id]/finance-export/+server.ts',
      ),
      'utf8',
    );
    expect(source).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(source).toContain('\'content-disposition\': `attachment; filename="${filename}"`');
    expect(source).toContain(".replace(/[^A-Za-z0-9._-]+/gu, '-')");
    expect(source).toContain('periodStart > periodEnd');
    expect(source).not.toMatch(/filename=.*periodStart.*request/iu);
  });
});
