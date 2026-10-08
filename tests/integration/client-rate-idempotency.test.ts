import { afterEach, describe, expect, it } from 'vitest';
import { resolveClientLaborRule } from '../../packages/database/src/domains/commercial/assignment-commercial-terms.js';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture));
function fixture() {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  const principal = stepUpB5Principal(value.sqlite, value.owner, 'client-rate');
  const input = {
    projectId: value.project.id,
    currency: 'EUR' as const,
    hourlyRateMinor: 7000n,
    effectiveFrom: '2026-08-01',
    overtimeMultiplierBps: 15000,
  };
  const context = {
    projectId: value.project.id,
    workerId: value.worker.userId,
    workDate: '2026-08-15',
    category: 'regular',
  };
  return { ...value, principal, input, context };
}
function clone(value: ReturnType<typeof fixture>, id: string) {
  const columns = value.sqlite
    .prepare("SELECT name FROM pragma_table_info('client_labor_rate') WHERE name<>'id'")
    .all()
    .map((row) => String(row.name))
    .join(',');
  value.sqlite
    .prepare(
      `INSERT INTO client_labor_rate(id,${columns}) SELECT ?,${columns} FROM client_labor_rate WHERE id=?`,
    )
    .run('legacy-duplicate', id);
}
describe('Customer rate exact retries and historical identical terms', () => {
  it('returns the original rule and one create audit for normalized exact retries', () => {
    const value = fixture();
    const first = value.v3.createClientLaborRate(value.principal, value.input);
    expect(
      value.v3.createClientLaborRate(value.principal, {
        ...value.input,
        workerId: '',
        category: '',
        effectiveTo: '',
      }),
    ).toEqual(first);
    expect(value.sqlite.prepare('SELECT count(*) n FROM client_labor_rate').get()?.n).toBe(1);
    expect(
      value.sqlite
        .prepare("SELECT count(*) n FROM audit_event WHERE action='client_rate.create'")
        .get()?.n,
    ).toBe(1);
  });
  it('prices identical retained legacy rows deterministically without modifying history', () => {
    const value = fixture();
    const first = value.v3.createClientLaborRate(value.principal, value.input);
    clone(value, first.id);
    const before = value.sqlite.prepare('SELECT * FROM client_labor_rate ORDER BY id').all();
    const result = resolveClientLaborRule(value.sqlite, value.context);
    expect(result.issues).toEqual([]);
    expect(result.selected?.rule.hourly_rate_minor).toBe('7000');
    expect(result.selected?.rule.id).toBe(first.id);
    expect(value.sqlite.prepare('SELECT * FROM client_labor_rate ORDER BY id').all()).toEqual(
      before,
    );
  });
  it.each([
    'hourly_rate_minor',
    'overtime_multiplier_bps',
    'eligible_for_percentage',
    'effective_to',
  ])('retains the ambiguity blocker when %s differs', (field) => {
    const value = fixture();
    const first = value.v3.createClientLaborRate(value.principal, value.input);
    clone(value, first.id);
    const changed = {
      hourly_rate_minor: 7100,
      overtime_multiplier_bps: 20000,
      eligible_for_percentage: 0,
      effective_to: '2026-08-31',
    }[field as 'hourly_rate_minor'];
    value.sqlite
      .prepare(`UPDATE client_labor_rate SET ${field}=? WHERE id='legacy-duplicate'`)
      .run(changed);
    expect(resolveClientLaborRule(value.sqlite, value.context).issues).toMatchObject([
      { code: 'ambiguous_client_rate' },
    ]);
  });
  it('does not reuse a different price and preserves authorization on an exact retry', () => {
    const value = fixture();
    value.v3.createClientLaborRate(value.principal, value.input);
    value.v3.createClientLaborRate(value.principal, { ...value.input, hourlyRateMinor: 7100n });
    expect(value.sqlite.prepare('SELECT count(*) n FROM client_labor_rate').get()?.n).toBe(2);
    expect(() => value.v3.createClientLaborRate(value.manager, value.input)).toThrow();
    expect(() =>
      value.v3.createClientLaborRate({ ...value.principal, sessionId: undefined }, value.input),
    ).toThrow();
  });
});
