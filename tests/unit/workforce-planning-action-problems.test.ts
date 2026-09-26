import { beforeEach, describe, expect, it, vi } from 'vitest';

const scenario = vi.hoisted(() => ({
  operation: '',
  message: '',
  kind: 'validation' as 'validation' | 'conflict' | 'access' | 'openAccess',
}));

vi.mock('$lib/server/portal-repository', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/portal-repository')>();
  const database = await import('@ja/database');
  const throwIfConfigured = (operation: string) => {
    if (scenario.operation !== operation) return;
    if (scenario.kind === 'access') throw new database.AccessDeniedError(scenario.message);
    if (scenario.kind === 'conflict') throw new database.ConflictError(scenario.message);
    throw new database.ValidationError(scenario.message);
  };
  return {
    ...original,
    openPortalRepository: () => {
      if (scenario.kind === 'openAccess') throw new database.AccessDeniedError('Sign in required');
      return {
        principal: { userId: 'owner-1', role: 'owner_admin' },
        sqlite: { close: vi.fn() },
        repository: {
          createPlanningAssignment: () => throwIfConfigured('createPlanning'),
          updatePlanningAssignment: () => throwIfConfigured('updatePlanning'),
          cancelPlanningAssignment: () => throwIfConfigured('cancelPlanning'),
          createSkill: () => throwIfConfigured('createSkill'),
          setWorkerSkill: () => throwIfConfigured('setWorkerSkill'),
          updateSkill: () => throwIfConfigured('updateSkill'),
          deleteSkill: () => throwIfConfigured('deleteSkill'),
          deleteWorkerSkill: () => throwIfConfigured('deleteWorkerSkill'),
          setWorkerAvailability: () => throwIfConfigured('setAvailability'),
        },
      };
    },
  };
});

import { reportActions } from '../../apps/portal/src/lib/server/actions/operations-actions';

const projectId = '11111111-1111-4111-8111-111111111111';
const workerId = '22222222-2222-4222-8222-222222222222';
const skillId = '33333333-3333-4333-8333-333333333333';
const recordId = '44444444-4444-4444-8444-444444444444';

function actionRequest(values: Record<string, string>, action: string): Request {
  return new Request(`http://localhost/app/planning?/${action}`, {
    method: 'POST',
    body: new URLSearchParams(values),
  });
}

function event(request: Request, section = 'planning') {
  return { request, params: { section }, locals: { user: { id: 'owner-1' } } } as never;
}

beforeEach(() => {
  scenario.operation = '';
  scenario.message = '';
  scenario.kind = 'validation';
});

describe('planning, skill, and availability action problems', () => {
  it('reports a deleted planning project with retained dates', async () => {
    scenario.operation = 'createPlanning';
    scenario.message = 'Project not found';
    const result = await reportActions.createPlanning(
      event(
        actionRequest(
          {
            projectId,
            workerId,
            startsAt: '2026-09-25T08:00',
            endsAt: '2026-09-25T16:00',
            plannedMinutes: '480',
          },
          'createPlanning',
        ),
      ),
    );
    expect(result.status).toBe(404);
    expect(result.data).toMatchObject({
      code: 'PLANNING_PROJECT_NOT_FOUND',
      operation: 'createPlanning',
      values: { startsAt: '2026-09-25T08:00', plannedMinutes: '480' },
      remedies: [{ id: 'review_projects' }],
    });
  });

  it('keeps planning edits after manager scope expires', async () => {
    scenario.operation = 'updatePlanning';
    scenario.message = 'Project assignment is not currently effective';
    scenario.kind = 'access';
    const result = await reportActions.updatePlanning(
      event(
        actionRequest(
          {
            id: recordId,
            version: '2',
            projectId,
            workerId,
            startsAt: '2026-09-25T08:00',
            endsAt: '2026-09-25T16:00',
            plannedMinutes: '480',
          },
          'updatePlanning',
        ),
      ),
    );
    expect(result.status).toBe(403);
    expect(result.data).toMatchObject({
      code: 'PLANNING_MANAGER_ASSIGNMENT_EXPIRED',
      operation: 'updatePlanning',
      values: { id: recordId, version: '2' },
      remedies: [{ id: 'contact_project_owner' }],
    });
  });

  it('keeps the legacy planning field hook alongside the shared field errors', async () => {
    scenario.operation = 'createPlanning';
    scenario.message = 'Worker already has an overlapping planning assignment';
    scenario.kind = 'conflict';
    const result = await reportActions.createPlanning(
      event(
        actionRequest(
          {
            projectId,
            workerId,
            startsAt: '2026-09-25T08:00',
            endsAt: '2026-09-25T16:00',
            plannedMinutes: '480',
          },
          'createPlanning',
        ),
      ),
    );
    expect(result.data).toMatchObject({
      code: 'PLANNING_WORKER_OVERLAP',
      fields: { startsAt: ['action.planning.workerOverlap'] },
      fieldErrors: { startsAt: ['action.planning.workerOverlap'] },
    });
  });

  it('names the duplicate skill code and retains its input', async () => {
    scenario.operation = 'createSkill';
    scenario.message = 'Skill code already exists';
    scenario.kind = 'conflict';
    const result = await reportActions.createSkill(
      event(actionRequest({ code: 'PLC', name: 'PLC maintenance' }, 'createSkill')),
    );
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'SKILL_CODE_EXISTS',
      values: { code: 'PLC', name: 'PLC maintenance' },
      remedies: [{ id: 'review_skills' }],
      fields: { code: ['problem.workforce.skillCodeExists'] },
      fieldErrors: { code: ['problem.workforce.skillCodeExists'] },
    });
  });

  it('marks an empty skill name on update', async () => {
    scenario.operation = 'updateSkill';
    scenario.message = 'Skill name is required';
    const result = await reportActions.updateSkill(
      event(actionRequest({ skillId, name: '' }, 'updateSkill')),
    );
    expect(result.status).toBe(400);
    expect(result.data).toMatchObject({
      code: 'SKILL_NAME_REQUIRED',
      operation: 'updateSkill',
      values: { skillId, name: '' },
      fieldErrors: { name: ['problem.workforce.skillNameRequired'] },
    });
  });

  it('reports an inactive worker when assigning a skill', async () => {
    scenario.operation = 'setWorkerSkill';
    scenario.message = 'Active worker not found';
    const result = await reportActions.setWorkerSkill(
      event(actionRequest({ workerId, skillId, proficiency: '3' }, 'setWorkerSkill')),
    );
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'WORKFORCE_WORKER_UNAVAILABLE',
      operation: 'setWorkerSkill',
      values: { workerId, skillId, proficiency: '3' },
      remedies: [{ id: 'review_workers' }],
    });
  });

  it('returns stale availability with safe retained values', async () => {
    scenario.operation = 'setAvailability';
    scenario.message = 'Availability changed before update';
    scenario.kind = 'conflict';
    const form = new FormData();
    for (const [key, value] of Object.entries({
      id: recordId,
      version: '2',
      workerId,
      startsAt: '2026-09-25T08:00:00.000Z',
      endsAt: '2026-09-25T16:00:00.000Z',
      availability: 'unavailable',
      note: 'Leave',
    }))
      form.set(key, value);
    form.set('unrelatedFile', new File(['private'], 'private.txt'));
    const result = await reportActions.setAvailability(
      event(
        new Request('http://localhost/app/profile?/setAvailability', {
          method: 'POST',
          body: form,
        }),
        'profile',
      ),
    );
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'AVAILABILITY_CHANGED',
      operation: 'setAvailability',
      values: { startsAt: '2026-09-25T08:00:00.000Z', note: 'Leave' },
      remedies: [{ id: 'review_availability' }],
    });
    expect(result.data.values).not.toHaveProperty('unrelatedFile');
  });

  it('turns repository-opening session expiry into an action problem', async () => {
    scenario.kind = 'openAccess';
    const result = await reportActions.createSkill(
      event(actionRequest({ code: 'PLC', name: 'PLC maintenance' }, 'createSkill')),
    );
    expect(result.status).toBe(401);
    expect(result.data).toMatchObject({
      code: 'WORKFORCE_SESSION_ENDED',
      operation: 'createSkill',
      values: { code: 'PLC' },
      remedies: [{ id: 'sign_in_again' }],
    });
  });
});
