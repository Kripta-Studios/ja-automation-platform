import { randomUUID } from 'node:crypto';
import { V3Repository } from '@ja/database';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  seedB5User,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';
import {
  nameLooksLikeLogin,
  proposedPersonName,
} from '../../apps/portal/src/lib/portal/person-name.ts';

const openPortalRepository = vi.fn();
vi.mock('$lib/server/portal-repository', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/portal-repository')>();
  return { ...original, openPortalRepository };
});
const { teamActions } = await import('../../apps/portal/src/lib/server/actions/team-actions.ts');

const fixtures: B5LifecycleSecurityFixture[] = [];
function fixture() {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  const principal = stepUpB5Principal(value.sqlite, value.owner, 'team-people');
  const sqlite = new Proxy(value.sqlite, {
    get(target, key) {
      if (key === 'close') return vi.fn();
      const member = Reflect.get(target, key);
      return typeof member === 'function' ? member.bind(target) : member;
    },
  });
  openPortalRepository.mockReturnValue({
    repository: value.repository,
    v3: new V3Repository(sqlite),
    principal,
    sqlite,
  });
  return value;
}
function event(body: URLSearchParams, role = 'owner_admin', email = 'antonny.luty@j-aautomation.com') {
  return {
    locals: { correlationId: 'team-test', user: { email, role }, session: { id: 's' } },
    params: { section: 'projects' },
    request: new Request('http://localhost/app/projects', { method: 'POST', body }),
  } as never;
}
afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
  vi.clearAllMocks();
});

describe('person name helpers', () => {
  it('detects logins and proposes names from them or the e-mail', () => {
    expect(nameLooksLikeLogin('gabriel.lamoglia', 'gabriel.lamoglia@j-aautomation.com')).toBe(true);
    expect(proposedPersonName('gabriel.lamoglia', 'gabriel.lamoglia@j-aautomation.com')).toBe(
      'Gabriel Lamoglia',
    );
    expect(proposedPersonName('', 'maria_lopez@j-aautomation.com')).toBe('Maria Lopez');
    expect(proposedPersonName('rodolfo', 'rodolfo@j-aautomation.com')).toBe('Rodolfo');
    expect(nameLooksLikeLogin('Antonny Nascimento', 'antonny.luty@j-aautomation.com')).toBe(false);
    expect(proposedPersonName('María José', 'mj@j-aautomation.com')).toBe('');
  });
});

describe('fixPersonNames', () => {
  it('renames through the audited profile update and keeps e-mail and role', async () => {
    const value = fixture();
    const id = randomUUID();
    seedB5User(value.sqlite, id, 'worker');
    const before = value.sqlite.prepare('SELECT email,role FROM user WHERE id=?').get(id) as {
      email: string;
      role: string;
    };
    const body = new URLSearchParams();
    body.append('workerId', id);
    body.append('name', 'Gabriel Lamoglia');
    const result = (await teamActions.fixPersonNames(event(body))) as { success?: boolean };
    expect(result.success).toBe(true);
    const after = value.sqlite.prepare('SELECT name,email,role FROM user WHERE id=?').get(id) as {
      name: string;
      email: string;
      role: string;
    };
    expect(after).toEqual({ name: 'Gabriel Lamoglia', email: before.email, role: before.role });
    const audit = value.sqlite
      .prepare("SELECT COUNT(*) n FROM audit_event WHERE action='worker.update' AND entity_id=?")
      .get(id) as { n: number };
    expect(audit.n).toBe(1);
  });

  it('rejects non-owners and invalid names without changes', async () => {
    const value = fixture();
    const id = randomUUID();
    seedB5User(value.sqlite, id, 'worker');
    const body = new URLSearchParams([
      ['workerId', id],
      ['name', 'X'],
    ]);
    const denied = (await teamActions.fixPersonNames(
      event(body, 'project_manager', 'pm@j-aautomation.com'),
    )) as { status?: number };
    expect(denied.status).toBe(403);
    const invalid = (await teamActions.fixPersonNames(event(body))) as { status?: number };
    expect(invalid.status).toBe(400);
    expect((value.sqlite.prepare('SELECT name FROM user WHERE id=?').get(id) as { name: string }).name).toBe(id);
  });
});

describe('setPersonDefaultRates', () => {
  it('saves exact minor-unit default rates for all projects, superseding an open default', async () => {
    const value = fixture();
    const id = randomUUID();
    seedB5User(value.sqlite, id, 'worker');
    const save = (from: string, pay: string) =>
      teamActions.setPersonDefaultRates(
        event(
          new URLSearchParams({
            workerId: id,
            currency: 'USD',
            internalCostHourlyRate: '25.50',
            compensationRate: pay,
            compensationBasis: 'hourly',
            effectiveFrom: from,
          }),
        ),
      );
    expect(((await save('2026-11-01', '20.10')) as { success?: boolean }).success).toBe(true);
    expect(((await save('2026-12-01', '21')) as { success?: boolean }).success).toBe(true);
    const rules = value.sqlite
      .prepare(
        'SELECT rate_minor,effective_from,effective_to FROM compensation_rule WHERE worker_id=? AND project_id IS NULL ORDER BY effective_from',
      )
      .all(id);
    expect(rules).toEqual([
      { rate_minor: 2010, effective_from: '2026-11-01', effective_to: '2026-11-30' },
      { rate_minor: 2100, effective_from: '2026-12-01', effective_to: null },
    ]);
    const cost = value.sqlite
      .prepare('SELECT COUNT(*) n FROM internal_cost_rule WHERE worker_id=? AND project_id IS NULL')
      .get(id) as { n: number };
    expect(cost.n).toBe(2);
    const early = (await save('2026-11-15', '22')) as { status?: number };
    expect(early.status).toBe(409);
  });
});
