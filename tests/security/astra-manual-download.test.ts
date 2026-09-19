import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Principal } from '@ja/domain';
import { GET } from '../../apps/portal/src/routes/app/help/[manual]/download/+server.ts';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
} from '../fixtures/b5-lifecycle-security-fixture.js';

type Fixture = ReturnType<typeof createB5LifecycleSecurityFixture>;
let fixture: Fixture;
let originalDatabasePath: string | undefined;
let originalManualRoot: string | undefined;

beforeEach(() => {
  fixture = createB5LifecycleSecurityFixture();
  originalDatabasePath = process.env.JA_DATABASE_PATH;
  originalManualRoot = process.env.JA_MANUAL_ROOT;
  process.env.JA_DATABASE_PATH = join(fixture.directory, 'app.db');
  delete process.env.JA_MANUAL_ROOT;
});
afterEach(() => {
  if (originalDatabasePath === undefined) delete process.env.JA_DATABASE_PATH;
  else process.env.JA_DATABASE_PATH = originalDatabasePath;
  if (originalManualRoot === undefined) delete process.env.JA_MANUAL_ROOT;
  else process.env.JA_MANUAL_ROOT = originalManualRoot;
  closeB5LifecycleSecurityFixture(fixture);
});

function event(
  principal: Principal | undefined,
  manual = 'worker-reference',
  query = '',
  displayedRole = principal?.role,
  displayedProfile?: string,
): unknown {
  return {
    locals: principal
      ? {
          user: {
            id: principal.userId,
            name: principal.userId,
            email: `${principal.userId}@example.test`,
            role: displayedRole,
            workforceProfile: displayedProfile,
            status: 'active',
          },
          session: {
            id: principal.sessionId,
            userId: principal.userId,
            expiresAt: new Date(Date.now() + 60_000),
          },
          correlationId: 'manual-download-test',
        }
      : { user: null, session: null, correlationId: 'manual-download-test' },
    params: { manual },
    url: new URL(`http://localhost/j-aautomation/app/help/${manual}/download${query}`),
  };
}

function supplierProfile(userId: string, profile: 'supplier_coordinator' | 'external_technician') {
  const at = new Date().toISOString();
  fixture.sqlite
    .prepare(
      "INSERT OR IGNORE INTO supplier(id,name,status,created_at,updated_at) VALUES('manual-supplier','Manual Supplier','active',?,?)",
    )
    .run(at, at);
  fixture.sqlite
    .prepare(
      'INSERT INTO supplier_user_profile(user_id,supplier_id,profile,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET profile=excluded.profile,updated_at=excluded.updated_at',
    )
    .run(userId, 'manual-supplier', profile, at, at);
}

describe('Help PDF authorization boundary', () => {
  it('requires a live session and localizes the Portuguese 401', async () => {
    const unsigned = await GET(event(undefined, 'work-projects-reference', '?lang=pt') as never);
    expect(unsigned.status).toBe(401);
    expect(await unsigned.json()).toEqual({ error: 'É necessário entrar na conta.' });
    expect(unsigned.headers.get('cache-control')).toBe('private, no-store');

    const worker = stepUpB5Principal(fixture.sqlite, fixture.worker, 'revoked');
    fixture.sqlite.prepare('DELETE FROM session WHERE id=?').run(worker.sessionId);
    const revoked = await GET(event(worker) as never);
    expect(revoked.status).toBe(401);
  });

  it('uses persisted persona rather than forged locals and gives indistinguishable 404s', async () => {
    const worker = stepUpB5Principal(fixture.sqlite, fixture.worker, 'worker');
    const forbidden = await GET(
      event(worker, 'administration-finance-reference', '?lang=pt', 'owner_admin') as never,
    );
    const unknown = await GET(event(worker, 'does-not-exist', '?lang=pt') as never);
    expect(forbidden.status).toBe(404);
    const unknownBody = await unknown.json();
    expect(await forbidden.json()).toEqual(unknownBody);
    expect(unknownBody).toEqual({ error: 'Documento de ajuda não encontrado.' });
    expect((await GET(event(worker, 'finance-reference') as never)).status).toBe(404);
    expect((await GET(event(worker, 'supplier-operations-reference') as never)).status).toBe(404);

    supplierProfile(worker.userId, 'supplier_coordinator');
    expect(
      (await GET(event(worker, 'work-projects-reference', '', 'worker', 'standard') as never))
        .status,
    ).toBe(404);
    expect((await GET(event(worker, 'worker-reference') as never)).status).toBe(404);
    expect((await GET(event(worker, 'administration-finance-reference') as never)).status).toBe(
      404,
    );
    expect((await GET(event(worker, 'external-technician-reference') as never)).status).toBe(200);
    const coordinator = await GET(
      event(
        worker,
        'supplier-operations-reference',
        '?lang=pt',
        'worker',
        'external_technician',
      ) as never,
    );
    expect(coordinator.status).toBe(200);
    expect(coordinator.headers.get('x-help-manual-language')).toBe('pt');

    supplierProfile(worker.userId, 'external_technician');
    expect((await GET(event(worker, 'supplier-coordinator-reference') as never)).status).toBe(200);
    expect((await GET(event(worker, 'work-projects-reference') as never)).status).toBe(404);
  });

  it('serves one shared PDF for both members of each group and the full Owner library', async () => {
    const worker = stepUpB5Principal(fixture.sqlite, fixture.worker, 'worker');
    const manager = stepUpB5Principal(fixture.sqlite, fixture.manager, 'manager');
    const finance = stepUpB5Principal(fixture.sqlite, fixture.finance, 'finance');
    const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'owner');
    for (const [principal, canonical, alias] of [
      [worker, 'work-projects-reference', 'project-manager-reference'],
      [manager, 'work-projects-reference', 'worker-reference'],
      [finance, 'administration-finance-reference', 'owner-reference'],
    ] as const) {
      for (const manual of [canonical, alias]) {
        const response = await GET(event(principal, manual, '?lang=en') as never);
        expect(response.status, `${principal.role}:${manual}`).toBe(200);
        expect(response.headers.get('x-help-manual-path')).toContain(canonical);
        expect(
          Buffer.from(await response.arrayBuffer())
            .subarray(0, 5)
            .toString('ascii'),
        ).toBe('%PDF-');
      }
    }
    for (const manual of [
      'administration-finance-reference',
      'work-projects-reference',
      'supplier-operations-reference',
      'auditor-reference',
    ]) {
      expect((await GET(event(owner, manual, '?lang=en') as never)).status, manual).toBe(200);
    }
    const spanishReference = await GET(
      event(worker, 'work-projects-reference', '?lang=es') as never,
    );
    expect(spanishReference.status).toBe(200);
    expect(spanishReference.headers.get('x-help-manual-language')).toBe('en');
    const spanishQuickStart = await GET(event(worker, 'employee-field-guide', '?lang=es') as never);
    expect(spanishQuickStart.status).toBe(200);
    expect(spanishQuickStart.headers.get('x-help-manual-language')).toBe('es');
    expect((await GET(event(owner, 'employee-field-guide') as never)).status).toBe(404);
    expect((await GET(event(finance, 'work-projects-reference') as never)).status).toBe(404);
    expect((await GET(event(manager, 'administration-finance-reference') as never)).status).toBe(
      404,
    );
  });

  it('reports invalid locale and persistent PDF storage failure in the requested language', async () => {
    const worker = stepUpB5Principal(fixture.sqlite, fixture.worker, 'errors');
    const invalid = await GET(event(worker, 'work-projects-reference', '?lang=fr') as never);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'Unsupported manual language.' });
    process.env.JA_MANUAL_ROOT = join(fixture.directory, 'no-manuals');
    const unavailable = await GET(event(worker, 'work-projects-reference', '?lang=pt') as never);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({
      error: 'O documento de ajuda está temporariamente indisponível.',
    });
    expect(unavailable.headers.get('cache-control')).toBe('private, no-store');
  });
});
