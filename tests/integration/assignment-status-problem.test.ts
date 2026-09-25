import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AccessDeniedError,
  ConflictError,
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const openPortalRepository = vi.fn();
vi.mock('$lib/server/portal-repository', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/portal-repository')>();
  return { ...original, openPortalRepository };
});
const { projectActions } =
  await import('../../apps/portal/src/lib/server/actions/project-actions.ts');

const fixtures: B5LifecycleSecurityFixture[] = [];
function fixture() {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}
function event(form: Record<string, string>) {
  return {
    locals: {},
    params: { section: 'projects' },
    request: new Request('http://localhost/app/projects', {
      method: 'POST',
      body: new URLSearchParams(form),
    }),
  } as never;
}
function context(value: B5LifecycleSecurityFixture, principal = value.owner) {
  openPortalRepository.mockReturnValue({
    repository: value.repository,
    principal,
    sqlite: { close: vi.fn() },
  });
}

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
  vi.clearAllMocks();
});

describe('assignment status changes during form entry', () => {
  it.each(['closing', 'closed'] as const)(
    'returns a structured %s conflict without changing project or assignments',
    (status) => {
      const value = fixture();
      value.sqlite.prepare('UPDATE project SET status=? WHERE id=?').run(status, value.project.id);
      const before = value.sqlite
        .prepare('SELECT COUNT(*) count FROM project_member WHERE project_id=?')
        .get(value.project.id);

      expect(() =>
        value.repository.assignWorker(value.owner, {
          projectId: value.project.id,
          workerId: 'b5-outsider',
          startsOn: '2026-09-25',
        }),
      ).toThrowError(
        expect.objectContaining({
          code: 'PROJECT_ASSIGNMENT_BLOCKED_STATUS',
          projectId: value.project.id,
          projectName: 'B5 lifecycle fixture',
          status,
        }),
      );
      expect(
        value.sqlite.prepare('SELECT status FROM project WHERE id=?').get(value.project.id),
      ).toEqual({
        status,
      });
      expect(
        value.sqlite
          .prepare('SELECT COUNT(*) count FROM project_member WHERE project_id=?')
          .get(value.project.id),
      ).toEqual(before);
    },
  );

  it('shows the same blocker to a previously scoped manager and denies an unrelated manager', () => {
    const value = fixture();
    const manager = value.repository.principalFor('b5-manager');
    const unrelated = value.repository.createProject(value.owner, {
      clientId: value.client.id,
      costCenterCode: 'QA-ASSIGNMENT-STATUS-UNRELATED-2',
      name: 'Other managed project',
      timezone: 'Europe/Madrid',
      currency: 'EUR',
      billingModel: 'tm',
      startDate: '2026-01-01',
    });
    value.sqlite.prepare('UPDATE project SET status=? WHERE id=?').run('closing', value.project.id);
    value.sqlite.prepare('UPDATE project SET status=? WHERE id=?').run('closing', unrelated.id);
    const freshManager = value.repository.principalFor('b5-manager');
    expect(freshManager.projectIds.has(value.project.id)).toBe(false);
    for (const principal of [manager, freshManager]) {
      expect(() =>
        value.repository.assignWorker(principal, {
          projectId: value.project.id,
          workerId: 'b5-outsider',
          startsOn: '2026-09-25',
        }),
      ).toThrow(ConflictError);
      expect(() =>
        value.repository.assignWorker(principal, {
          projectId: unrelated.id,
          workerId: 'b5-outsider',
          startsOn: '2026-09-25',
        }),
      ).toThrow(AccessDeniedError);
    }
  });

  it('returns the same typed form payload with retained inputs and a role-safe remedy', async () => {
    const value = fixture();
    value.sqlite.prepare('UPDATE project SET status=? WHERE id=?').run('closing', value.project.id);
    const form = {
      projectId: value.project.id,
      workerId: 'b5-outsider',
      startsOn: '2026-09-25',
      endsOn: '2026-10-02',
    };
    context(value);
    expect(await projectActions.assignWorker(event(form))).toMatchObject({
      status: 409,
      data: {
        actionName: 'assignWorker',
        values: { ...form, plannedMinutes: '' },
        code: 'PROJECT_ASSIGNMENT_BLOCKED_STATUS',
        params: { projectName: 'B5 lifecycle fixture', status: 'Closing' },
        remedies: [{ id: 'review_project_status', projectId: value.project.id }],
      },
    });

    context(value, value.repository.principalFor('b5-manager'));
    expect(await projectActions.assignWorker(event(form))).toMatchObject({
      status: 409,
      data: {
        code: 'PROJECT_ASSIGNMENT_BLOCKED_STATUS',
        remedies: [{ id: 'contact_project_owner' }],
      },
    });
  });

  it('rejects overlapping active assignments but permits a later nonoverlapping interval', async () => {
    const value = fixture();
    const first = value.repository.assignWorker(value.owner, {
      projectId: value.project.id,
      workerId: 'b5-outsider',
      startsOn: '2026-09-01',
      endsOn: '2026-09-30',
    });
    context(value);
    expect(
      await projectActions.assignWorker(
        event({
          projectId: value.project.id,
          workerId: 'b5-outsider',
          startsOn: '2026-09-30',
          endsOn: '2026-10-15',
        }),
      ),
    ).toMatchObject({
      status: 409,
      data: {
        code: 'PROJECT_ASSIGNMENT_OVERLAP',
        messageKey: 'problem.project.assignmentOverlap',
        remedies: [{ id: 'review_assignments', projectId: value.project.id }],
      },
    });
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) count FROM project_member WHERE project_id=? AND user_id=?')
        .get(value.project.id, 'b5-outsider'),
    ).toEqual({ count: 1 });
    const later = value.repository.assignWorker(value.owner, {
      projectId: value.project.id,
      workerId: 'b5-outsider',
      startsOn: '2026-10-01',
    });
    expect(later.id).not.toBe(first.id);
    context(value);
    expect(
      await projectActions.updateAssignment(
        event({
          assignmentId: later.id,
          version: '1',
          startsOn: '2026-09-30',
          endsOn: '2026-11-01',
        }),
      ),
    ).toMatchObject({
      status: 409,
      data: {
        code: 'PROJECT_ASSIGNMENT_OVERLAP',
        actionName: 'updateAssignment',
        remedies: [{ id: 'review_assignments', recordId: later.id }],
      },
    });
    expect(
      value.sqlite.prepare('SELECT starts_on FROM project_member WHERE id=?').get(later.id),
    ).toEqual({ starts_on: '2026-10-01' });
  });
});
