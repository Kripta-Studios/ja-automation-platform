import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
let restore: (() => void) | undefined;
beforeAll(() => {
  restore = installB5TestDeploymentIdentity();
});
afterAll(() => restore?.());
afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

function setup() {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  const row = () =>
    value.sqlite
      .prepare('SELECT status,version,actual_end_date FROM project WHERE id=?')
      .get(value.project.id) as { status: string; version: number; actual_end_date: string | null };
  const move = (principal: typeof value.owner, status: string, extra: Record<string, string> = {}) =>
    value.repository.transitionProject(principal, {
      projectId: value.project.id,
      status: status as never,
      version: row().version,
      reason: `QA ${status}`,
      ...extra,
    });
  if (row().status !== 'active') move(value.owner, 'active');
  return { value, row, move };
}

describe('project reactivation and close date (B5)', () => {
  it('records the chosen close date and lets the owner reactivate a closed project', () => {
    const { value, row, move } = setup();
    move(value.owner, 'closing');
    move(value.owner, 'closed', { closeDate: '2026-02-15' });
    expect(row()).toMatchObject({ status: 'closed', actual_end_date: '2026-02-15' });
    move(value.owner, 'active');
    expect(row()).toMatchObject({ status: 'active', actual_end_date: null });
    const audit = value.sqlite
      .prepare(
        "SELECT details_json AS payload FROM audit_event WHERE entity_type='project' AND entity_id=? AND action='project.reactivate' ORDER BY rowid DESC LIMIT 1",
      )
      .get(value.project.id) as { payload: string } | undefined;
    expect(audit).toBeDefined();
    expect(JSON.parse(audit!.payload)).toMatchObject({ fromState: 'closed', toState: 'active', reactivated: true });
    // Since migration 0079 the lifecycle history records the reactivation natively.
    expect(
      value.sqlite
        .prepare(
          "SELECT from_state,to_state FROM entity_lifecycle_event WHERE entity_type='project' AND entity_id=? ORDER BY version_after DESC LIMIT 1",
        )
        .get(value.project.id),
    ).toEqual({ from_state: 'closed', to_state: 'active' });
  });

  it('lets the owner cancel a pending close (closing -> active)', () => {
    const { value, row, move } = setup();
    move(value.owner, 'closing');
    move(value.owner, 'active');
    expect(row().status).toBe('active');
    expect(
      value.sqlite
        .prepare(
          "SELECT from_state,to_state FROM entity_lifecycle_event WHERE entity_type='project' AND entity_id=? ORDER BY version_after DESC LIMIT 1",
        )
        .get(value.project.id),
    ).toEqual({ from_state: 'closing', to_state: 'active' });
  });

  it('only the owner may reactivate', () => {
    const { value, row, move } = setup();
    move(value.owner, 'closing');
    expect(() => move(value.finance, 'active')).toThrow(/owner/i);
    expect(row().status).toBe('closing');
  });

  it('rejects a future close date or a close date on other transitions', () => {
    const { value, row, move } = setup();
    expect(() => move(value.owner, 'closing', { closeDate: '2026-01-02' })).toThrow(/close date/i);
    move(value.owner, 'closing');
    expect(() => move(value.owner, 'closed', { closeDate: '2999-01-01' })).toThrow(/future/i);
    expect(row().status).toBe('closing');
  });
});
