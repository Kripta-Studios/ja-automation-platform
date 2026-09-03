import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '@ja/database';

vi.mock('$app/server', () => ({ getRequestEvent: vi.fn() }));
vi.mock('$app/environment', () => ({ building: false }));

const { billingActions } =
  await import('../../apps/portal/src/lib/server/actions/billing-actions.ts');

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  delete process.env.JA_DATABASE_PATH;
  delete process.env.JA_DOCUMENT_ROOT;
  delete process.env.JA_TENANT_ID;
  delete process.env.JA_DEPLOYMENT_ID;
});

function seedDemoDatabase(): Readonly<{
  databasePath: string;
  finance: { id: string; name: string; email: string; role: 'finance_admin'; status: 'active' };
  financeSessionId: string;
  worker: { id: string; name: string; email: string; role: 'worker'; status: 'active' };
  workerSessionId: string;
}> {
  const directory = mkdtempSync(join(tmpdir(), 'ja-accounting-pack-action-'));
  directories.push(directory);
  const databasePath = join(directory, 'app.db');
  const documentRoot = join(directory, 'documents');
  process.env.JA_DATABASE_PATH = databasePath;
  process.env.JA_DOCUMENT_ROOT = documentRoot;
  process.env.JA_TENANT_ID = 'test-tenant';
  process.env.JA_DEPLOYMENT_ID = 'test-deployment';
  process.env.JA_MIGRATIONS_PATH = resolve('migrations');
  execFileSync(
    process.execPath,
    ['--experimental-strip-types', resolve('packages/database/src/demo-seed.ts')],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        JA_DEMO_SEED_PRESERVE_DB: 'false',
        JA_FIXTURE_RESET_DOCUMENTS: 'true',
      },
      stdio: 'ignore',
    },
  );
  const { sqlite } = createDatabase(databasePath);
  try {
    const finance = sqlite
      .prepare(
        "SELECT id,name,email,role,status FROM user WHERE role='finance_admin' AND status='active' LIMIT 1",
      )
      .get() as {
      id: string;
      name: string;
      email: string;
      role: 'finance_admin';
      status: 'active';
    };
    const financeSession = sqlite
      .prepare(
        'SELECT id FROM session WHERE user_id=? AND step_up_at IS NOT NULL ORDER BY created_at DESC LIMIT 1',
      )
      .get(finance.id) as { id: string };
    const worker = sqlite
      .prepare(
        "SELECT id,name,email,role,status FROM user WHERE role='worker' AND status='active' LIMIT 1",
      )
      .get() as {
      id: string;
      name: string;
      email: string;
      role: 'worker';
      status: 'active';
    };
    const workerSession = sqlite
      .prepare('SELECT id FROM session WHERE user_id=? ORDER BY created_at DESC LIMIT 1')
      .get(worker.id) as { id: string } | undefined;
    const workerSessionId = workerSession?.id ?? 'wp03-worker-session';
    if (!workerSession) {
      const now = new Date().toISOString();
      sqlite
        .prepare(
          'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,NULL)',
        )
        .run(
          workerSessionId,
          'wp03-worker-session-token',
          worker.id,
          new Date(Date.now() + 60 * 60_000).toISOString(),
          now,
          now,
        );
    }
    sqlite
      .prepare('UPDATE session SET step_up_at=?,expires_at=? WHERE id=?')
      .run(
        new Date().toISOString(),
        new Date(Date.now() + 60 * 60_000).toISOString(),
        financeSession.id,
      );
    sqlite
      .prepare('UPDATE session SET step_up_at=NULL,expires_at=? WHERE id=?')
      .run(new Date(Date.now() + 60 * 60_000).toISOString(), workerSessionId);
    return {
      databasePath,
      finance,
      financeSessionId: financeSession.id,
      worker,
      workerSessionId,
    };
  } finally {
    sqlite.close();
  }
}

function countWrites(databasePath: string): Readonly<{
  packs: number;
  jobs: number;
  successAudits: number;
}> {
  const { sqlite } = createDatabase(databasePath);
  try {
    return {
      packs: Number(
        (
          sqlite.prepare('SELECT COUNT(*) count FROM accounting_pack_run').get() as {
            count: number;
          }
        ).count,
      ),
      jobs: Number(
        (
          sqlite
            .prepare("SELECT COUNT(*) count FROM job WHERE kind='accounting_pack_artifact_render'")
            .get() as { count: number }
        ).count,
      ),
      successAudits: Number(
        (
          sqlite
            .prepare("SELECT COUNT(*) count FROM audit_event WHERE action='accounting_pack.create'")
            .get() as { count: number }
        ).count,
      ),
    };
  } finally {
    sqlite.close();
  }
}

function requestFromBrowserForm(formData: FormData): Request {
  return new Request('http://localhost/app/accounting?/createAccountingPack', {
    method: 'POST',
    // Native HTML forms use this encoding. Request.formData() still returns the
    // browser-equivalent FormData object consumed by the action boundary.
    body: new URLSearchParams([...formData.entries()] as Array<[string, string]>),
  });
}

function actionEvent(
  user: Readonly<{ id: string; name: string; email: string; role: string; status: string }>,
  sessionId: string,
  form: Readonly<Record<string, string>>,
) {
  const formData = new FormData();
  for (const [name, value] of Object.entries(form)) formData.set(name, value);
  return {
    locals: {
      user,
      session: {
        id: sessionId,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
      correlationId: `wp03-${user.role}`,
    },
    params: { section: 'accounting' },
    request: requestFromBrowserForm(formData),
  } as never;
}

describe('Accounting Pack action boundary', () => {
  it('accepts the exact browser FormData period without rewriting it to a calendar month', async () => {
    const seeded = seedDemoDatabase();
    const before = countWrites(seeded.databasePath);
    const result = await billingActions.createAccountingPack(
      actionEvent(seeded.finance, seeded.financeSessionId, {
        periodStart: '2026-08-01',
        periodEnd: '2026-08-24',
        reportLocale: 'en',
      }),
    );

    expect(result).toMatchObject({ success: true, packState: 'queued' });
    expect(countWrites(seeded.databasePath)).toEqual({
      packs: before.packs + 1,
      jobs: before.jobs + 1,
      successAudits: before.successAudits + 1,
    });
  });

  it('creates no pack, job, or success audit for invalid periods or denied principals', async () => {
    const seeded = seedDemoDatabase();
    const before = countWrites(seeded.databasePath);

    const invalidDate = await billingActions.createAccountingPack(
      actionEvent(seeded.finance, seeded.financeSessionId, {
        periodStart: '2026-02-30',
        periodEnd: '2026-03-01',
        reportLocale: 'en',
      }),
    );
    expect(invalidDate).toMatchObject({ status: 400 });

    const reversed = await billingActions.createAccountingPack(
      actionEvent(seeded.finance, seeded.financeSessionId, {
        periodStart: '2026-09-01',
        periodEnd: '2026-08-24',
        reportLocale: 'en',
      }),
    );
    expect(reversed).toMatchObject({ status: 400 });

    const { sqlite } = createDatabase(seeded.databasePath);
    try {
      sqlite
        .prepare('UPDATE session SET expires_at=? WHERE id=?')
        .run(new Date(Date.now() - 1).toISOString(), seeded.financeSessionId);
    } finally {
      sqlite.close();
    }
    const expiredSession = await billingActions.createAccountingPack(
      actionEvent(seeded.finance, seeded.financeSessionId, {
        periodStart: '2026-08-01',
        periodEnd: '2026-08-24',
        reportLocale: 'en',
      }),
    );
    expect(expiredSession).toMatchObject({
      status: 403,
      data: { success: false, stepUpRequired: true },
    });

    const unauthorized = await billingActions.createAccountingPack(
      actionEvent(seeded.worker, seeded.workerSessionId, {
        periodStart: '2026-08-01',
        periodEnd: '2026-08-24',
        reportLocale: 'en',
      }),
    );
    expect(unauthorized).toMatchObject({
      status: 403,
      data: { success: false },
    });
    expect((unauthorized as { data?: { stepUpRequired?: unknown } }).data?.stepUpRequired).not.toBe(
      true,
    );
    expect(countWrites(seeded.databasePath)).toEqual(before);
  });
});
