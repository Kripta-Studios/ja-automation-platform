import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
let restoreDeploymentIdentity: (() => void) | undefined;
beforeAll(() => {
  restoreDeploymentIdentity = installB5TestDeploymentIdentity();
});
afterAll(() => restoreDeploymentIdentity?.());

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

function method(target: object, name: string): unknown {
  return (target as Record<string, unknown>)[name];
}

describe('B5 lifecycle policy (RED characterization)', () => {
  it('exposes explicit client and project update/archive/restore transitions', () => {
    const value = fixture();
    for (const name of ['updateClient', 'transitionClient', 'updateProject', 'transitionProject']) {
      expect(typeof method(value.repository, name), `${name} must be a real domain operation`).toBe(
        'function',
      );
    }
  });

  it('exposes one coherent draft-delete and correction-draft contract', () => {
    const value = fixture();
    expect(typeof method(value.repository, 'deleteDraft')).toBe('function');
    expect(typeof method(value.repository, 'createCorrectionDraft')).toBe('function');
  });

  it('does not hard-delete a submitted daily report', () => {
    const value = fixture();
    const created = value.repository.createDailyReport(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      summary: 'B5 lifecycle report',
      tasksCompleted: 'Characterize immutable submitted history',
      downtimeMinutes: 0,
      safetyRelated: false,
    }) as { id: string };

    const draft = value.sqlite
      .prepare('SELECT version FROM daily_report WHERE id=?')
      .get(created.id) as { version: number };
    value.repository.submitReport(value.worker, 'daily', created.id, draft.version);
    const submitted = value.sqlite
      .prepare('SELECT version,approval_state FROM daily_report WHERE id=?')
      .get(created.id) as { version: number; approval_state: string };
    expect(submitted.approval_state).toBe('submitted');

    expect(() =>
      value.repository.deleteReport(value.owner, 'daily', created.id, submitted.version),
    ).toThrow();
    expect(
      value.sqlite.prepare('SELECT id FROM daily_report WHERE id=?').get(created.id),
      'submitted history must still exist',
    ).toBeTruthy();
    expect(value.repository.reportDetail(value.owner, created.id).canDelete).toBe(false);
  });

  it('offers canDelete only for never-submitted draft reports', () => {
    const value = fixture();
    const created = value.repository.createDailyReport(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-21',
      summary: 'Draft that can still be removed',
      tasksCompleted: 'Keep the delete control truthful',
      downtimeMinutes: 0,
      safetyRelated: false,
    }) as { id: string };
    expect(value.repository.reportDetail(value.owner, created.id).canDelete).toBe(true);
    expect(value.repository.reportDetail(value.worker, created.id).canDelete).toBe(true);
  });
});
