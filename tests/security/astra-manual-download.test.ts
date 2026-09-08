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

beforeEach(() => {
  fixture = createB5LifecycleSecurityFixture();
  originalDatabasePath = process.env.JA_DATABASE_PATH;
  process.env.JA_DATABASE_PATH = join(fixture.directory, 'app.db');
});

afterEach(() => {
  if (originalDatabasePath === undefined) delete process.env.JA_DATABASE_PATH;
  else process.env.JA_DATABASE_PATH = originalDatabasePath;
  closeB5LifecycleSecurityFixture(fixture);
});

function event(
  principal: Principal | undefined,
  manual = 'employee-field-guide',
  query = '',
  displayedRole = principal?.role,
): unknown {
  return {
    locals: principal
      ? {
          user: {
            id: principal.userId,
            name: principal.userId,
            email: `${principal.userId}@example.test`,
            role: displayedRole,
            status: 'active',
          },
          session: {
            id: principal.sessionId,
            userId: principal.userId,
            expiresAt: new Date(Date.now() + 60_000),
          },
          correlationId: 'astra-help-download-test',
        }
      : { user: null, session: null, correlationId: 'astra-help-download-test' },
    params: { manual },
    url: new URL(`http://localhost/j-aautomation/app/help/${manual}/download${query}`),
  };
}

describe('ASTRA Help PDF authorization boundary', () => {
  it('requires an active authenticated session', async () => {
    const response = await GET(event(undefined) as never);
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('uses the persisted role and session when serving or denying a download', async () => {
    const worker = stepUpB5Principal(fixture.sqlite, fixture.worker, 'manual-worker');
    const denied = await GET(event(worker, 'owner-reference') as never);
    expect(denied.status).toBe(404);

    const allowed = await GET(event(worker, 'employee-field-guide', '?lang=es') as never);
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('content-type')).toBe('application/pdf');
    expect(allowed.headers.get('cache-control')).toBe('private, no-store');
    expect(allowed.headers.get('x-content-type-options')).toBe('nosniff');
    expect(allowed.headers.get('x-help-manual-language')).toBe('es');
    expect(allowed.headers.get('content-disposition')).toContain('employee-field-guide-ES-');
    expect(
      Buffer.from(await allowed.arrayBuffer())
        .subarray(0, 5)
        .toString('ascii'),
    ).toBe('%PDF-');

    const finance = stepUpB5Principal(fixture.sqlite, fixture.finance, 'manual-demotion');
    fixture.sqlite
      .prepare('UPDATE user SET role=? WHERE id=?')
      .run('worker', fixture.finance.userId);
    const demoted = await GET(event(finance, 'owner-reference', '', 'finance_admin') as never);
    expect(demoted.status).toBe(404);
  });

  it('rejects a session revoked after the browser received its locals', async () => {
    const worker = stepUpB5Principal(fixture.sqlite, fixture.worker, 'manual-revoked');
    fixture.sqlite.prepare('DELETE FROM session WHERE id=?').run(worker.sessionId);

    const response = await GET(event(worker) as never);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Sign in required.' });
  });

  it('allows Owner and Finance to download the detailed Owner reference and rejects invalid languages', async () => {
    const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'manual-owner-reference');
    const ownerResponse = await GET(event(owner, 'owner-reference') as never);
    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.headers.get('x-help-manual-language')).toBe('en');

    const finance = stepUpB5Principal(fixture.sqlite, fixture.finance, 'manual-finance');
    const financeResponse = await GET(event(finance, 'owner-reference') as never);
    expect(financeResponse.status).toBe(200);

    const invalidLanguage = await GET(event(finance, 'owner-reference', '?lang=fr') as never);
    expect(invalidLanguage.status).toBe(400);
  });
});
