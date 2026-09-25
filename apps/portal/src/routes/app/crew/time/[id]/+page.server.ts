import { error, fail, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { AccessDeniedError, CrewLeaderRepository, ValidationError } from '@ja/database';
import { openPortalRepository, actionFailure } from '$lib/server/portal-repository';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    if (context.principal.role === 'owner_admin') {
      context.repository.timeDetail(context.principal, params.id);
      redirect(303, `/j-aautomation/app/time/${encodeURIComponent(params.id)}`);
    }
    return {
      record: new CrewLeaderRepository(context.sqlite).entryDetail(context.principal, params.id),
      correctionRequestId: randomUUID(),
    };
  } catch (caught) {
    if (caught instanceof AccessDeniedError || caught instanceof ValidationError)
      error(404, 'Crew time entry not found');
    throw caught;
  } finally {
    context.sqlite.close();
  }
};

function action(operation: 'update' | 'discard' | 'correct' | 'submit'): Actions[string] {
  return async ({ locals, params, request }) => {
    if (!locals.user) redirect(303, '/j-aautomation/app/login');
    const formData = await request.formData();
    const value = (name: string) => String(formData.get(name) || '');
    const context = openPortalRepository(locals);
    try {
      const crew = new CrewLeaderRepository(context.sqlite);
      const version = Number(value('version'));
      if (operation === 'correct') {
        const corrected = crew.createCorrectedDraft(context.principal, {
          originalId: params.id,
          version,
          requestId: value('requestId'),
          reason: value('reason'),
          workDate: value('workDate'),
          category: value('category'),
          minutes: Number(value('minutes')),
          summary: value('summary'),
          ...(value('startTime') ? { startTime: value('startTime') } : {}),
          ...(value('endTime') ? { endTime: value('endTime') } : {}),
          ...(value('breakMinutes') ? { breakMinutes: Number(value('breakMinutes')) } : {}),
        });
        redirect(303, `/j-aautomation/app/crew/time/${corrected.id}`);
      }
      if (operation === 'submit') {
        crew.submit(context.principal, params.id, version);
        redirect(303, `/j-aautomation/app/crew/time/${params.id}`);
      }
      if (operation === 'update') {
        crew.updateDraft(context.principal, {
          id: params.id,
          version,
          workDate: value('workDate'),
          category: value('category'),
          minutes: Number(value('minutes')),
          summary: value('summary'),
        });
        redirect(303, `/j-aautomation/app/crew/time/${params.id}`);
      }
      const record = crew.entryDetail(context.principal, params.id);
      crew.discardDraft(context.principal, params.id, version);
      redirect(
        303,
        `/j-aautomation/app/crew?${new URLSearchParams({ project: record.projectId, date: record.workDate })}#crew-entries`,
      );
    } catch (caught) {
      const response = actionFailure(caught);
      return fail(response.status, {
        ...response.data,
        operation,
        values: Object.fromEntries(
          [...formData]
            .filter(([, entry]) => typeof entry === 'string')
            .map(([key, entry]) => [key, String(entry)]),
        ),
      });
    } finally {
      context.sqlite.close();
    }
  };
}

export const actions: Actions = {
  update: action('update'),
  discard: action('discard'),
  correct: action('correct'),
  submit: action('submit'),
};
