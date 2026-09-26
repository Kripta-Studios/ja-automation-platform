import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictError } from '@ja/database';
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
    locals: { correlationId: 'project-rule-test' },
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

describe('project action repository problems', () => {
  it('returns a field-local code and entered amount for an invalid project edit', async () => {
    const value = fixture();
    const version = (
      value.sqlite.prepare('SELECT version FROM project WHERE id=?').get(value.project.id) as {
        version: number;
      }
    ).version;
    const form = {
      projectId: value.project.id,
      version: String(version),
      expenseBudgetMinor: 'not-an-amount',
    };
    expect(await projectActions.updateProject(event(form))).toMatchObject({
      status: 400,
      data: {
        code: 'PROJECT_NUMBER_FIELD_INVALID',
        messageKey: 'problem.project.numberFieldInvalid',
        actionName: 'updateProject',
        values: form,
        fieldErrors: { expenseBudgetMinor: ['problem.project.numberFieldInvalid'] },
        correlationId: 'project-rule-test',
      },
    });
  });

  it('maps a changed milestone to a review remedy with the submitted version', async () => {
    const value = fixture();
    vi.spyOn(value.repository, 'submitProjectMilestone').mockImplementation(() => {
      throw new ConflictError('Milestone changed or not found');
    });
    expect(
      await projectActions.submitMilestone(event({ id: value.project.id, version: '1' })),
    ).toMatchObject({
      status: 409,
      data: {
        code: 'MILESTONE_STALE',
        messageKey: 'problem.milestone.changed',
        actionName: 'submitMilestone',
        values: { id: value.project.id, version: '1' },
        remedies: [{ id: 'review_updated_record' }],
      },
    });
  });

  it('keeps assignment dates and points to the end date when the range is invalid', async () => {
    const value = fixture();
    const assignment = value.sqlite
      .prepare("SELECT id,version FROM project_member WHERE project_id=? AND user_id='b5-worker'")
      .get(value.project.id) as { id: string; version: number };
    const form = {
      assignmentId: assignment.id,
      version: String(assignment.version),
      startsOn: '2026-09-25',
      endsOn: '2026-09-24',
    };
    expect(await projectActions.updateAssignment(event(form))).toMatchObject({
      status: 400,
      data: {
        code: 'ASSIGNMENT_DATE_RANGE_INVALID',
        messageKey: 'problem.assignment.dateRangeInvalid',
        values: form,
        fieldErrors: { endsOn: ['problem.assignment.dateRangeInvalid'] },
        remedies: [{ id: 'review_assignments', recordId: assignment.id }],
      },
    });
  });
});

describe('project action input problems', () => {
  it.each([
    ['createClient', {}, 'CLIENT_FIELDS_INVALID', 'problem.client.fieldsInvalid'],
    [
      'createClientContact',
      {},
      'CLIENT_CONTACT_FIELDS_INVALID',
      'problem.client.contactFieldsInvalid',
    ],
    ['createProject', {}, 'PROJECT_FIELDS_INVALID', 'problem.project.fieldsInvalid'],
    ['createMilestone', {}, 'MILESTONE_FIELDS_INVALID', 'problem.milestone.fieldsInvalid'],
    ['submitMilestone', {}, 'MILESTONE_RECORD_INVALID', 'problem.milestone.recordInvalid'],
    [
      'updateSchedule',
      {},
      'PROJECT_SCHEDULE_FIELDS_INVALID',
      'problem.project.scheduleFieldsInvalid',
    ],
    ['assignWorker', {}, 'ASSIGNMENT_FIELDS_INVALID', 'problem.assignment.fieldsInvalid'],
    ['updateClient', {}, 'CLIENT_FIELDS_INVALID', 'problem.client.fieldsInvalid'],
  ] as const)('returns a typed field problem for %s', async (action, values, code, messageKey) => {
    const result = await projectActions[action](event(values));
    expect(result).toMatchObject({
      status: 400,
      data: {
        code,
        messageKey,
        actionName: action,
        correlationId: 'project-rule-test',
        remedies: [
          { id: code === 'MILESTONE_RECORD_INVALID' ? 'review_updated_record' : 'correct_fields' },
        ],
      },
    });
    expect(result.data?.fieldErrors).not.toEqual({});
    expect(openPortalRepository).not.toHaveBeenCalled();
  });

  it.each([
    [
      'transitionClient',
      { clientId: 'client-1', status: 'closed', version: '1' },
      'CLIENT_TRANSITION_REASON_REQUIRED',
      'reason',
    ],
    [
      'transitionProject',
      { projectId: 'project-1', status: 'closed', version: '1' },
      'PROJECT_TRANSITION_REASON_REQUIRED',
      'reason',
    ],
    [
      'archiveClient',
      { clientId: 'client-1', version: '1' },
      'CLIENT_TRANSITION_REASON_REQUIRED',
      'reason',
    ],
    [
      'removeAssignment',
      { assignmentId: 'assignment-1', version: '1' },
      'ASSIGNMENT_REMOVAL_REASON_REQUIRED',
      'reason',
    ],
    [
      'updateAssignment',
      { assignmentId: 'assignment-1', version: '' },
      'ASSIGNMENT_VERSION_REQUIRED',
      'version',
    ],
    [
      'deleteAssignment',
      { assignmentId: 'assignment-1', version: '' },
      'ASSIGNMENT_VERSION_REQUIRED',
      'version',
    ],
  ] as const)(
    'retains values and identifies the missing %s field',
    async (action, values, code, field) => {
      const result = await projectActions[action](event(values));
      expect(result).toMatchObject({
        status: 400,
        data: {
          code,
          actionName: action,
          values,
          correlationId: 'project-rule-test',
        },
      });
      expect(result.data?.fieldErrors).toHaveProperty(field);
      expect(openPortalRepository).not.toHaveBeenCalled();
    },
  );

  it('reports a bad project transition status before the reason and keeps the submitted values', async () => {
    const values = { projectId: 'project-1', version: '2', status: 'unknown', reason: 'retain' };
    expect(await projectActions.transitionProject(event(values))).toMatchObject({
      status: 400,
      data: {
        code: 'PROJECT_TRANSITION_STATUS_INVALID',
        messageKey: 'problem.project.transitionStatusInvalid',
        fieldErrors: { status: ['problem.project.transitionStatusInvalid'] },
        values,
        remedies: [{ id: 'correct_fields' }],
      },
    });
  });
});
