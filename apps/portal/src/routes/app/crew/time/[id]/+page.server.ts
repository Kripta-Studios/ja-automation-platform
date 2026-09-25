import { error, isRedirect, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import {
  AccessDeniedError,
  ConflictError,
  CrewLeaderRepository,
  ValidationError,
} from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  actionFail,
  actionFailure,
  type ActionMessageKey,
} from '$lib/server/actions/action-message';
import type { Actions, PageServerLoad } from './$types';

type CrewTimeOperation = 'update' | 'discard' | 'correct' | 'submit';
type CrewTimeProblem = {
  status: number;
  code: string;
  key: ActionMessageKey;
  message: string;
  field?: string;
  remedy: string;
};
const crewTimeProblems: Record<string, CrewTimeProblem> = {
  'A valid draft version is required': {
    status: 400,
    code: 'CREW_DRAFT_VERSION_INVALID',
    key: 'problem.crew.draftVersionInvalid',
    message: 'This form has no valid draft version. Review the current entry before saving.',
    remedy: 'review_time',
  },
  'Crew time entry access required': {
    status: 403,
    code: 'CREW_TIME_ACCESS_REQUIRED',
    key: 'problem.crew.timeAccessRequired',
    message:
      'This crew time entry is unavailable under your current delegation. Review your crew entries or contact the project owner.',
    remedy: 'contact_project_owner',
  },
  'Crew chief access required': {
    status: 403,
    code: 'CREW_CHIEF_ROLE_REQUIRED',
    key: 'problem.crew.chiefRoleRequired',
    message:
      'Crew time entry requires an active crew chief role. Contact the project owner to review access.',
    remedy: 'contact_project_owner',
  },
  'Time intervals cannot overlap for the same worker and date': {
    status: 400,
    code: 'CREW_TIME_INTERVAL_OVERLAP',
    key: 'problem.crew.timeIntervalOverlap',
    message:
      'This worker already has time recorded in the selected interval. Adjust the time or date.',
    field: 'workDate',
    remedy: 'review_time',
  },
  'A worker cannot enter more than 1440 minutes per day': {
    status: 400,
    code: 'CREW_TIME_DAILY_LIMIT',
    key: 'problem.crew.timeDailyLimit',
    message: 'This worker already has time on the selected day. Total time cannot exceed 24 hours.',
    field: 'workDate',
    remedy: 'review_time',
  },
  'This crew draft changed. Reload it before saving.': {
    status: 409,
    code: 'CREW_DRAFT_CHANGED',
    key: 'problem.crew.draftChanged',
    message:
      'This crew draft changed while you were editing. Review the current version before saving.',
    remedy: 'review_time',
  },
  'This crew draft changed. Reload it before discarding.': {
    status: 409,
    code: 'CREW_DRAFT_CHANGED',
    key: 'problem.crew.draftChanged',
    message:
      'This crew draft changed while you were editing. Review the current version before saving.',
    remedy: 'review_time',
  },
  'Only a never-submitted crew draft can change': {
    status: 409,
    code: 'CREW_DRAFT_NOT_EDITABLE',
    key: 'problem.crew.draftNotEditable',
    message:
      'Only a crew draft that has never been submitted can be edited or discarded. Review the record.',
    remedy: 'review_time',
  },
  'This crew draft is linked to an expense, receipt, report, correction, or billing record and cannot change':
    {
      status: 409,
      code: 'CREW_DRAFT_LINKED_EVIDENCE',
      key: 'problem.crew.draftLinkedEvidence',
      message:
        'This crew draft is linked to another record and cannot be changed here. Review the linked record and request a documented correction.',
      remedy: 'review_time',
    },
  'This crew time changed. Reload it before correcting.': {
    status: 409,
    code: 'CREW_CORRECTION_STALE',
    key: 'problem.crew.correctionStale',
    message:
      'This crew time changed before the correction. Review the current record before creating a new draft.',
    remedy: 'review_time',
  },
  'Only reviewer-returned crew time can be corrected here': {
    status: 409,
    code: 'CREW_CORRECTION_STATE_BLOCKED',
    key: 'problem.crew.correctionStateBlocked',
    message:
      'A corrected draft can be created here only after a reviewer returns this crew time for changes.',
    remedy: 'review_time',
  },
  'Crew time entry delegation changed': {
    status: 403,
    code: 'CREW_DELEGATION_CHANGED',
    key: 'problem.crew.timeDelegationChanged',
    message:
      'The crew delegation changed after this form opened. Contact the project owner to review access.',
    remedy: 'contact_project_owner',
  },
  'Active project crew delegation required': {
    status: 403,
    code: 'CREW_DELEGATION_NOT_ACTIVE',
    key: 'problem.crew.delegationNotActive',
    message:
      'This crew delegation or a project assignment is no longer active for the selected date. Contact the project owner.',
    field: 'workDate',
    remedy: 'contact_project_owner',
  },
  'Choose a valid time category': {
    status: 400,
    code: 'CREW_CATEGORY_INVALID',
    key: 'problem.crew.categoryInvalid',
    message: 'Choose a valid operational time category.',
    field: 'category',
    remedy: 'review_time',
  },
  'Enter 1 to 1440 minutes': {
    status: 400,
    code: 'CREW_DURATION_INVALID',
    key: 'problem.crew.durationInvalid',
    message: 'Enter more than zero and no more than 24 hours.',
    field: 'durationHours',
    remedy: 'review_time',
  },
  'Time entry changed or cannot be submitted': {
    status: 409,
    code: 'CREW_TIME_SUBMISSION_CHANGED',
    key: 'problem.crew.timeSubmissionChanged',
    message:
      'This crew time changed or is no longer a draft. Review the current entry before submitting.',
    remedy: 'review_time',
  },
};

function crewTimeActionFailure(
  error: unknown,
  operation: CrewTimeOperation,
  values: Record<string, string>,
) {
  const extras = { operation, values };
  if (
    error instanceof ValidationError ||
    error instanceof ConflictError ||
    error instanceof AccessDeniedError
  ) {
    const known = crewTimeProblems[error.message];
    if (known)
      return actionFail(known.status, known.key, {}, known.message, {
        ...extras,
        code: known.code,
        remedies: [{ id: known.remedy }],
        ...(known.field ? { fields: { [known.field]: [known.message] } } : {}),
      });
  }
  return actionFailure(error, extras);
}

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
      if (isRedirect(caught)) throw caught;
      return crewTimeActionFailure(
        caught,
        operation,
        Object.fromEntries(
          [...formData]
            .filter(([, entry]) => typeof entry === 'string')
            .map(([key, entry]) => [key, String(entry)]),
        ),
      );
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
