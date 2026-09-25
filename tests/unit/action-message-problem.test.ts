import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictError } from '@ja/database';
import { actionFail, actionFailure } from '../../apps/portal/src/lib/server/actions/action-message';
import { projectActions } from '../../apps/portal/src/lib/server/actions/project-actions';
import { translate } from '../../apps/portal/src/lib/i18n/catalog';

afterEach(() => vi.restoreAllMocks());

describe('shared form problem contract', () => {
  it('keeps validation data at the top level of a SvelteKit failure', () => {
    const response = actionFail(400, 'action.validation.assignmentFields', {}, undefined, {
      fields: { startsOn: ['Enter a start date.'] },
      values: { projectId: 'p1', startsOn: '' },
    });

    expect(response.constructor.name).toBe('ActionFailure');
    expect(response.status).toBe(400);
    expect(response.data).toMatchObject({
      success: false,
      code: 'ACTION_VALIDATION_ASSIGNMENT_FIELDS',
      messageKey: 'action.validation.assignmentFields',
      params: {},
      messageParams: {},
      fieldErrors: { startsOn: ['Enter a start date.'] },
      fields: { startsOn: ['Enter a start date.'] },
      remedies: [],
      values: { projectId: 'p1', startsOn: '' },
    });
    expect(response.data.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(JSON.stringify(response.data))).toEqual(response.data);
  });

  it('maps a changed project status to the precise, role-safe assignment problem', () => {
    const error = Object.assign(new ConflictError('private raw repository detail'), {
      code: 'PROJECT_ASSIGNMENT_BLOCKED_STATUS' as const,
      projectId: 'project-1',
      projectName: 'Junkers',
      status: 'Closing',
    });
    const response = actionFailure(error, {
      values: { projectId: 'project-1', workerId: 'worker-1', startsOn: '2026-09-25' },
      remedies: [{ id: 'review_project_status', projectId: 'project-1' }],
      correlationId: 'request-12345678',
    });

    expect(response.constructor.name).toBe('ActionFailure');
    expect(response.status).toBe(409);
    expect(response.data).toMatchObject({
      code: 'PROJECT_ASSIGNMENT_BLOCKED_STATUS',
      messageKey: 'problem.project.assignmentBlockedStatus',
      params: { projectName: 'Junkers', status: 'Closing' },
      fieldErrors: {},
      remedies: [{ id: 'review_project_status', projectId: 'project-1' }],
      values: { workerId: 'worker-1', startsOn: '2026-09-25' },
      correlationId: 'request-12345678',
    });
    expect(JSON.stringify(response.data)).not.toContain('private raw repository detail');
    for (const locale of ['en', 'es', 'pt'] as const) {
      expect(translate(locale, response.data.messageKey, response.data.params)).toContain(
        'Junkers',
      );
    }
  });

  it('logs unexpected details with a reference while returning only safe guidance', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = actionFailure(new Error('private connection token xyz'), {
      correlationId: 'request-87654321',
    });

    expect(response.constructor.name).toBe('ActionFailure');
    expect(response.status).toBe(500);
    expect(response.data).toMatchObject({
      code: 'UNEXPECTED_ERROR',
      messageKey: 'problem.error.unexpected',
      params: { correlationId: 'request-87654321' },
      correlationId: 'request-87654321',
      remedies: [],
    });
    expect(JSON.stringify(response.data)).not.toContain('private connection token xyz');
    expect(logged).toHaveBeenCalledWith(
      'Unexpected form action failure',
      expect.objectContaining({ correlationId: 'request-87654321' }),
    );
  });

  it('logs an unmapped business conflict with the response reference', () => {
    const logged = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = actionFailure(new ConflictError('Unmapped known rule'));

    expect(response.status).toBe(409);
    expect(response.data.code).toBe('ACTION_ERROR_CONFLICT');
    expect(logged).toHaveBeenCalledWith(
      'Unmapped form business failure',
      expect.objectContaining({
        correlationId: response.data.correlationId,
        status: 409,
      }),
    );
  });

  it('keeps owner client fields and the open workflow on native validation failure', async () => {
    const fields = new FormData();
    fields.set('legalName', 'Junkers');
    fields.set('displayName', 'Junkers');
    fields.set('billingEmail', 'invalid-email');
    const response = await projectActions.createClient({
      request: new Request('http://localhost/app/projects?/createClient', {
        method: 'POST',
        body: fields,
      }),
      params: { section: 'projects' },
    } as never);

    expect(response.status).toBe(400);
    expect(response.data).toMatchObject({
      actionName: 'createClient',
      values: { legalName: 'Junkers', displayName: 'Junkers', billingEmail: 'invalid-email' },
      fieldErrors: expect.any(Object),
    });
  });
});
