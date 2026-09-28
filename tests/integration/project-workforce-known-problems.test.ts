import { afterEach, describe, expect, it, vi } from 'vitest';
import {
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
  openPortalRepository.mockReturnValue({
    repository: value.repository,
    principal: value.owner,
    sqlite: { ...value.sqlite, close: vi.fn(), prepare: value.sqlite.prepare.bind(value.sqlite) },
  });
  return value;
}
function event(form: Record<string, string>) {
  return {
    locals: { correlationId: 'project-problem-test' },
    params: { section: 'projects' },
    request: new Request('http://localhost/app/projects', {
      method: 'POST',
      body: new URLSearchParams(form),
    }),
  } as never;
}

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
  vi.clearAllMocks();
});

describe('known project and workforce blockers', () => {
  it('explains which client rule blocks closing and offers project review', async () => {
    const value = fixture();
    const version = (
      value.sqlite.prepare('SELECT version FROM client WHERE id=?').get(value.client.id) as {
        version: number;
      }
    ).version;
    expect(
      await projectActions.transitionClient(
        event({
          clientId: value.client.id,
          status: 'closed',
          version: String(version),
          reason: 'Done',
        }),
      ),
    ).toMatchObject({
      status: 409,
      data: {
        code: 'CLIENT_CLOSE_OPEN_PROJECTS',
        messageKey: 'problem.client.closeOpenProjects',
        remedies: [{ id: 'review_client_projects', recordId: value.client.id }],
        correlationId: 'project-problem-test',
      },
    });
  });

  it('reports the current project status and revision after a stale transition', async () => {
    const value = fixture();
    value.sqlite
      .prepare('UPDATE project SET status=?,version=version+1 WHERE id=?')
      .run('paused', value.project.id);
    expect(
      await projectActions.transitionProject(
        event({ projectId: value.project.id, status: 'closing', version: '1', reason: 'Close' }),
      ),
    ).toMatchObject({
      status: 409,
      data: {
        code: 'PROJECT_STALE',
        messageKey: 'problem.project.stale',
        params: { currentStatus: 'Paused', currentVersion: 2 },
        remedies: [{ id: 'review_updated_record', projectId: value.project.id }],
      },
    });
    expect(
      value.sqlite.prepare('SELECT status FROM project WHERE id=?').get(value.project.id),
    ).toEqual({
      status: 'paused',
    });
  });

  it('preserves the submitted assignment dates when a revision is stale', async () => {
    const value = fixture();
    const assignment = value.sqlite
      .prepare("SELECT id,version FROM project_member WHERE project_id=? AND user_id='b5-worker'")
      .get(value.project.id) as { id: string; version: number };
    value.sqlite
      .prepare('UPDATE project_member SET version=version+1 WHERE id=?')
      .run(assignment.id);
    const form = {
      assignmentId: assignment.id,
      version: String(assignment.version),
      startsOn: '2026-09-25',
      endsOn: '2026-10-25',
    };
    expect(await projectActions.updateAssignment(event(form))).toMatchObject({
      status: 409,
      data: {
        code: 'ASSIGNMENT_STALE',
        values: form,
        remedies: [{ id: 'review_assignments', recordId: assignment.id }],
      },
    });
  });

  it('returns a field-local unavailable-worker problem without creating an assignment', async () => {
    const value = fixture();
    value.sqlite.prepare('UPDATE user SET status=? WHERE id=?').run('suspended', 'b5-outsider');
    expect(
      await projectActions.assignWorker(
        event({
          projectId: value.project.id,
          workerId: 'b5-outsider',
          startsOn: '2026-09-25',
          endsOn: '2026-10-25',
        }),
      ),
    ).toMatchObject({
      status: 400,
      data: {
        code: 'PROJECT_ASSIGNMENT_WORKER_UNAVAILABLE',
        fieldErrors: { workerId: ['Choose an active worker.'] },
        remedies: [{ id: 'choose_available_worker' }],
      },
    });
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) count FROM project_member WHERE project_id=? AND user_id=?')
        .get(value.project.id, 'b5-outsider'),
    ).toEqual({ count: 0 });
  });
});
