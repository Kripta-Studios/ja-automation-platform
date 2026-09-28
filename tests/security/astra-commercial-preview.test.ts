import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { load, actions } from '../../apps/portal/src/routes/app/finance/preview/+page.server.ts';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';

const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
  vi.unstubAllEnvs();
});

function fixture() {
  const result = createB5LifecycleSecurityFixture();
  fixtures.push(result);
  vi.stubEnv('JA_DATABASE_PATH', join(result.directory, 'app.db'));
  return result;
}

function event(f: B5LifecycleSecurityFixture, userId = 'b5-finance', sessionId?: string) {
  const principal = f.repository.principalFor(userId);
  const session = sessionId ?? stepUpB5Principal(f.sqlite, principal, 'astra-preview').sessionId;
  return {
    locals: { user: { id: userId, role: principal.role }, session: { id: session } },
    url: new URL(`http://localhost/j-aautomation/app/finance/preview?project=${f.project.id}`),
  };
}

describe('commercial example HTTP authorization and read-only calculation', () => {
  it('denies Worker and PM even with a valid session and denies a revoked finance session', () => {
    const f = fixture();
    for (const role of ['b5-worker', 'b5-manager']) {
      expect(() => load(event(f, role) as never)).toThrow(expect.objectContaining({ status: 403 }));
    }
    const finance = event(f);
    f.sqlite.prepare('DELETE FROM session WHERE id=?').run(finance.locals.session.id!);
    expect(() => load(finance as never)).toThrow(expect.objectContaining({ status: 401 }));
  });

  it('calculates without changing database records and preserves invalid inputs', async () => {
    const f = fixture();
    const finance = event(f);
    const data = (await load(finance as never)) as { defaults: Record<string, string> };
    const readBusinessRows = () =>
      Object.fromEntries(
        [
          'project',
          'time_entry',
          'expense',
          'invoice',
          'compensation_rule',
          'compensation_settlement',
          'client_labor_rate',
          'internal_cost_rule',
          'audit_event',
        ].map((table) => [table, f.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]),
      );
    const before = readBusinessRows();
    const values = new URLSearchParams(data.defaults);
    const response = (await actions.default!({
      ...finance,
      request: new Request(finance.url, { method: 'POST', body: values }),
    } as never)) as { result: { revenueMinor: string } };
    expect(response.result.revenueMinor).toBe('96000');
    expect(readBusinessRows()).toEqual(before);
    expect(f.sqlite.prepare('SELECT COUNT(*) count FROM time_entry').get()).toMatchObject({
      count: 0,
    });
    values.set('sellRate', '-123');
    const invalid = (await actions.default!({
      ...finance,
      request: new Request(finance.url, { method: 'POST', body: values }),
    } as never)) as { status: number; data: { values: Record<string, string>; invalid: boolean } };
    expect(invalid.status).toBe(400);
    expect(invalid.data.invalid).toBe(true);
    expect(invalid.data.values.sellRate).toBe('-123');
    expect(invalid.data.values.workerRate).toBe('55');
  });
});
