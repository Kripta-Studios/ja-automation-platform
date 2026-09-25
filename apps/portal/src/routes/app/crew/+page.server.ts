import { randomUUID } from 'node:crypto';
import { error, isRedirect, redirect } from '@sveltejs/kit';
import {
  AccessDeniedError,
  CrewLeaderRepository,
  CrewSharedExpenseAllocationRepository,
  ConflictError,
  ValidationError,
} from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  actionFail,
  actionFailure,
  type ActionMessageKey,
} from '$lib/server/actions/action-message';
import type { Actions, PageServerLoad } from './$types';

type CrewOperation = 'grant' | 'revoke' | 'createBatch' | 'submit' | 'allocateReceipt';
type CrewProblem = {
  code: string;
  key: ActionMessageKey;
  message: string;
  field?: string;
  remedy: string;
  status: number;
};
const crewProblems: Record<string, CrewProblem> = {
  'Crew chief access required': {
    status: 403,
    code: 'CREW_CHIEF_ROLE_REQUIRED',
    key: 'problem.crew.chiefRoleRequired',
    message:
      'Crew time entry requires an active crew chief role. Contact the project owner to review access.',
    remedy: 'contact_project_owner',
  },
  'Owner administration required': {
    status: 403,
    code: 'CREW_OWNER_ROLE_REQUIRED',
    key: 'problem.crew.ownerRoleRequired',
    message:
      'Only the project owner can change crew delegations. Contact the owner for assistance.',
    remedy: 'contact_project_owner',
  },
  'Active account required': {
    status: 403,
    code: 'CREW_ACCOUNT_INACTIVE',
    key: 'problem.crew.accountInactive',
    message: 'Your account is no longer active for this action. Contact the project owner.',
    remedy: 'contact_project_owner',
  },
  'Crew time entry access required': {
    status: 403,
    code: 'CREW_TIME_ACCESS_REQUIRED',
    key: 'problem.crew.timeAccessRequired',
    message:
      'This crew time entry is unavailable under your current delegation. Review your crew entries or contact the project owner.',
    remedy: 'review_crew_day',
  },
  'Crew time entry delegation changed': {
    status: 403,
    code: 'CREW_DELEGATION_CHANGED',
    key: 'problem.crew.timeDelegationChanged',
    message:
      'The crew delegation changed after this form opened. Contact the project owner to review access.',
    remedy: 'contact_project_owner',
  },
  'Valid project timezone required for crew access': {
    status: 409,
    code: 'CREW_PROJECT_TIMEZONE_REQUIRED',
    key: 'problem.crew.projectTimezoneRequired',
    message:
      'The project needs a valid timezone before crew access can be checked. Contact the project owner.',
    remedy: 'contact_project_owner',
  },
  'Choose shared or individual hours': {
    status: 400,
    code: 'CREW_HOUR_MODE_REQUIRED',
    key: 'problem.crew.hourModeRequired',
    message: 'Choose shared hours or individual hours for this crew entry.',
    field: 'mode',
    remedy: 'review_crew_day',
  },
  'Batch request is too short': {
    status: 400,
    code: 'CREW_BATCH_REQUEST_INVALID',
    key: 'problem.crew.batchRequestInvalid',
    message:
      'Refresh this form before saving crew time. Your entered hours can be copied into the new form.',
    remedy: 'review_crew_day',
  },
  'Crew duration entries cannot include an inferred clock interval': {
    status: 400,
    code: 'CREW_INTERVAL_NOT_ALLOWED',
    key: 'problem.crew.intervalNotAllowed',
    message:
      'Crew batch hours cannot include a start or end time inferred from duration. Enter actual hours for each worker.',
    remedy: 'review_crew_day',
  },
  'Shared receipt request ID is invalid': {
    status: 400,
    code: 'CREW_RECEIPT_REQUEST_INVALID',
    key: 'problem.crew.receiptRequestInvalid',
    message:
      'Refresh this form before allocating the receipt. Review existing allocations before trying again.',
    remedy: 'review_receipts',
  },
  'Receipt access required': {
    status: 403,
    code: 'CREW_RECEIPT_ACCESS_REQUIRED',
    key: 'problem.crew.receiptAccessRequired',
    message: 'This receipt is unavailable under your current crew access. Review current receipts.',
    remedy: 'review_receipts',
  },
  'Shared receipt needs one worker or company payer': {
    status: 400,
    code: 'CREW_RECEIPT_PAYER_INVALID',
    key: 'problem.crew.receiptPayerInvalid',
    message:
      'A shared receipt must have one worker or the company as its payer. Review the receipt before allocation.',
    field: 'expenseId',
    remedy: 'review_receipts',
  },
  'Receipt amount is invalid': {
    status: 400,
    code: 'CREW_RECEIPT_AMOUNT_INVALID',
    key: 'problem.crew.receiptAmountInvalid',
    message: 'The receipt amount is invalid for allocation. Review the saved receipt.',
    field: 'expenseId',
    remedy: 'review_receipts',
  },
  'Enter each receipt allocation as an amount such as 6.50': {
    status: 400,
    code: 'CREW_RECEIPT_AMOUNT_FORMAT_INVALID',
    key: 'problem.crew.receiptAmountFormatInvalid',
    message: 'Enter each allocation as a positive amount, such as 6.50.',
    field: 'timeEntryIds',
    remedy: 'review_receipts',
  },
  'Each receipt allocation must be positive': {
    status: 400,
    code: 'CREW_RECEIPT_AMOUNT_FORMAT_INVALID',
    key: 'problem.crew.receiptAmountFormatInvalid',
    message: 'Enter each allocation as a positive amount, such as 6.50.',
    field: 'timeEntryIds',
    remedy: 'review_receipts',
  },
  'Active crew delegation already exists': {
    status: 409,
    code: 'CREW_DELEGATION_EXISTS',
    key: 'problem.crew.delegationExists',
    message:
      'These workers already have an active crew delegation. Review it before adding another.',
    remedy: 'review_delegations',
  },
  'Both people must be assigned to the project on the start date': {
    status: 403,
    code: 'CREW_ASSIGNMENT_REQUIRED',
    key: 'problem.crew.assignmentRequired',
    message:
      'Both workers need active project assignments on the delegation start date. Contact the project owner to review assignments.',
    field: 'startsOn',
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
  'Active worker accounts required': {
    status: 403,
    code: 'CREW_WORKER_INACTIVE',
    key: 'problem.crew.workerInactive',
    message:
      'Both selected workers need active accounts. Contact the project owner to review access.',
    remedy: 'contact_project_owner',
  },
  'Chief and worker must be different people': {
    status: 400,
    code: 'CREW_SAME_PERSON',
    key: 'problem.crew.samePerson',
    message: 'Choose different people for the chief and team member.',
    field: 'workerUserId',
    remedy: 'review_delegations',
  },
  'End date must follow start date': {
    status: 400,
    code: 'CREW_DATE_ORDER_INVALID',
    key: 'problem.crew.dateOrderInvalid',
    message: 'The end date must follow the start date.',
    field: 'endsOn',
    remedy: 'review_delegations',
  },
  'Active crew delegation not found': {
    status: 409,
    code: 'CREW_DELEGATION_CHANGED',
    key: 'problem.crew.delegationChanged',
    message: 'This delegation was already changed or revoked. Review current delegations.',
    remedy: 'review_delegations',
  },
  'Batch request was used with different values': {
    status: 409,
    code: 'CREW_BATCH_RETRY_CHANGED',
    key: 'problem.crew.batchRetryChanged',
    message:
      'This request ID was already used with different hours. Review saved crew time before submitting again.',
    remedy: 'review_crew_day',
  },
  'Select 1 to 100 crew members': {
    status: 400,
    code: 'CREW_MEMBERS_REQUIRED',
    key: 'problem.crew.membersRequired',
    message: 'Select between one and 100 assigned crew members.',
    field: 'workerIds',
    remedy: 'review_crew_day',
  },
  'Enter valid shared minutes': {
    status: 400,
    code: 'CREW_SHARED_HOURS_INVALID',
    key: 'problem.crew.sharedHoursInvalid',
    message: 'Enter shared hours greater than zero and no more than 24 for each selected worker.',
    field: 'sharedHours',
    remedy: 'review_crew_day',
  },
  'Enter valid minutes for each crew member': {
    status: 400,
    code: 'CREW_INDIVIDUAL_HOURS_INVALID',
    key: 'problem.crew.individualHoursInvalid',
    message: 'Enter valid hours for every selected worker.',
    field: 'workerIds',
    remedy: 'review_crew_day',
  },
  'Time entry changed or cannot be submitted': {
    status: 409,
    code: 'CREW_TIME_SUBMISSION_CHANGED',
    key: 'problem.crew.timeSubmissionChanged',
    message:
      'This crew time changed or is no longer a draft. Review the current entry before submitting.',
    remedy: 'review_crew_day',
  },
  'Shared receipt retry has changed': {
    status: 409,
    code: 'CREW_RECEIPT_RETRY_CHANGED',
    key: 'problem.crew.receiptRetryChanged',
    message:
      'This receipt allocation request was already used with different amounts. Review existing allocations.',
    remedy: 'review_receipts',
  },
  'Choose 2 to 100 crew time rows': {
    status: 400,
    code: 'CREW_RECEIPT_ROWS_REQUIRED',
    key: 'problem.crew.receiptRowsRequired',
    message: 'Select two to 100 crew time rows for this shared receipt.',
    field: 'timeEntryIds',
    remedy: 'review_receipts',
  },
  'Each selected crew time row needs a distinct positive amount': {
    status: 400,
    code: 'CREW_RECEIPT_AMOUNTS_INVALID',
    key: 'problem.crew.receiptAmountsInvalid',
    message: 'Enter a positive amount for each distinct crew time row.',
    field: 'timeEntryIds',
    remedy: 'review_receipts',
  },
  'Unallocated chief-entered receipt required': {
    status: 409,
    code: 'CREW_RECEIPT_UNAVAILABLE',
    key: 'problem.crew.receiptUnavailable',
    message: 'The receipt is no longer an unallocated draft you entered. Review current receipts.',
    field: 'expenseId',
    remedy: 'review_receipts',
  },
  'Crew time and receipt project/date must match': {
    status: 403,
    code: 'CREW_RECEIPT_SCOPE_MISMATCH',
    key: 'problem.crew.receiptScopeMismatch',
    message:
      'The selected time rows and receipt must belong to the same project and date. Review both records.',
    field: 'timeEntryIds',
    remedy: 'review_receipts',
  },
  'Crew allocations must equal the receipt amount exactly': {
    status: 400,
    code: 'CREW_RECEIPT_TOTAL_MISMATCH',
    key: 'problem.crew.receiptTotalMismatch',
    message: 'The allocation amounts must add up to the receipt amount exactly.',
    field: 'timeEntryIds',
    remedy: 'review_receipts',
  },
  'Allocate the shared receipt to at least two different workers': {
    status: 400,
    code: 'CREW_RECEIPT_WORKERS_REQUIRED',
    key: 'problem.crew.receiptWorkersRequired',
    message: 'Allocate the shared receipt to at least two different workers.',
    field: 'timeEntryIds',
    remedy: 'review_receipts',
  },
  'Include the receipt payer/attribution worker in the allocation': {
    status: 400,
    code: 'CREW_RECEIPT_PAYER_REQUIRED',
    key: 'problem.crew.receiptPayerRequired',
    message: 'Include the receipt’s payer or attributed worker in the allocation.',
    field: 'timeEntryIds',
    remedy: 'review_receipts',
  },
  'Include the time row already linked to this receipt': {
    status: 400,
    code: 'CREW_RECEIPT_LINKED_TIME_REQUIRED',
    key: 'problem.crew.receiptLinkedTimeRequired',
    message: 'Include the time row already linked to this receipt.',
    field: 'timeEntryIds',
    remedy: 'review_receipts',
  },
};

function crewPageActionFailure(
  error: unknown,
  operation: CrewOperation,
  values: Record<string, string>,
  workerIds: string[] = [],
  timeEntryIds: string[] = [],
) {
  const extras = { operation, values, workerIds, timeEntryIds };
  if (
    error instanceof ValidationError ||
    error instanceof ConflictError ||
    error instanceof AccessDeniedError
  ) {
    const message = error.message;
    const known =
      crewProblems[message] ??
      (message.startsWith('No crew time was saved. ')
        ? {
            status: 409,
            code: 'CREW_BATCH_WORKER_BLOCKED',
            key: 'problem.crew.batchWorkerBlocked' as ActionMessageKey,
            message:
              'No crew time was saved because a selected worker has a date, assignment, or existing time conflict. Review that worker and the current entries.',
            remedy: 'review_crew_day',
          }
        : message.startsWith('Crew member hours:')
          ? {
              status: 400,
              code: 'CREW_INDIVIDUAL_HOURS_INVALID',
              key: 'problem.crew.individualHoursInvalid' as ActionMessageKey,
              message: 'Enter valid hours for every selected worker.',
              field: 'workerIds',
              remedy: 'review_crew_day',
            }
          : message.startsWith('Shared hours:')
            ? crewProblems['Enter valid shared minutes']
            : null);
    if (known)
      return actionFail(known.status, known.key, {}, known.message, {
        ...extras,
        code: known.code,
        remedies: [{ id: known.remedy }],
        ...('field' in known && known.field ? { fields: { [known.field]: [known.message] } } : {}),
      });
  }
  return actionFailure(error, extras);
}

function date(value: string | null): string {
  const result = value || new Date().toISOString().slice(0, 10);
  const parsed = new Date(`${result}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(result) ||
    !Number.isFinite(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== result
  )
    throw new ValidationError('Choose a real work date');
  return result;
}

function minutesFromHours(value: string, label: string): number {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d{1,2}(?:\.\d{1,2})?$/u.test(normalized))
    throw new ValidationError(`${label}: enter hours such as 7.5`);
  const [whole, fraction = ''] = normalized.split('.');
  const hundredths = Number(fraction.padEnd(2, '0'));
  const hundredthMinutes = Number(whole) * 6000 + hundredths * 60;
  if (hundredthMinutes % 100 !== 0)
    throw new ValidationError(`${label}: use increments of one minute`);
  const minutes = hundredthMinutes / 100;
  if (minutes < 1 || minutes > 1440)
    throw new ValidationError(`${label}: enter more than zero and no more than 24 hours`);
  return minutes;
}

function minorFromMoney(value: string): bigint {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d{1,12}(?:\.\d{1,2})?$/u.test(normalized))
    throw new ValidationError('Enter each receipt allocation as an amount such as 6.50');
  const [whole = '0', fraction = ''] = normalized.split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (amount <= 0n) throw new ValidationError('Each receipt allocation must be positive');
  return amount;
}

export const load: PageServerLoad = ({ locals, url }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    const crew = new CrewLeaderRepository(context.sqlite);
    const owner = context.principal.role === 'owner_admin';
    const projects = crew.projects(context.principal);
    const projectId = url.searchParams.get('project') || projects[0]?.id || '';
    if (projectId && !projects.some((project) => project.id === projectId))
      error(403, 'Project crew access denied');
    const workDate = date(url.searchParams.get('date'));
    return {
      owner,
      projects,
      projectId,
      workDate,
      requestId: randomUUID(),
      allocationRequestId: randomUUID(),
      candidates: owner && projectId ? crew.candidateWorkers(context.principal, projectId) : [],
      grants: crew.grants(context.principal, projectId || undefined),
      assigned:
        !owner && projectId ? crew.assignedWorkers(context.principal, projectId, workDate) : [],
      entries:
        !owner && projectId ? crew.entries(context.principal, projectId, workDate, workDate) : [],
      receipts:
        !owner && projectId
          ? new CrewSharedExpenseAllocationRepository(context.sqlite).eligibleReceipts(
              context.principal,
              projectId,
              workDate,
            )
          : [],
      allocatedReceipts:
        !owner && projectId
          ? new CrewSharedExpenseAllocationRepository(context.sqlite).allocatedReceipts(
              context.principal,
              projectId,
              workDate,
            )
          : [],
    };
  } catch (caught) {
    if (caught instanceof AccessDeniedError) error(403, 'Project crew access denied');
    if (caught instanceof ValidationError) error(400, caught.message);
    throw caught;
  } finally {
    context.sqlite.close();
  }
};

function action(
  operation: 'grant' | 'revoke' | 'createBatch' | 'submit' | 'allocateReceipt',
): Actions[string] {
  return async ({ locals, request }) => {
    if (!locals.user) redirect(303, '/j-aautomation/app/login');
    const formData = await request.formData();
    const value = (name: string) => String(formData.get(name) || '');
    const values = Object.fromEntries(
      [...formData]
        .filter(([, entry]) => typeof entry === 'string')
        .map(([key, entry]) => [key, String(entry)]),
    );
    const context = openPortalRepository(locals);
    try {
      const crew = new CrewLeaderRepository(context.sqlite);
      if (operation === 'grant') {
        crew.grant(context.principal, {
          projectId: value('projectId'),
          chiefUserId: value('chiefUserId'),
          workerUserId: value('workerUserId'),
          startsOn: value('startsOn'),
          endsOn: value('endsOn') || undefined,
        });
      } else if (operation === 'revoke') {
        crew.revoke(context.principal, value('id'));
      } else if (operation === 'submit') {
        crew.submit(context.principal, value('id'), Number(value('version')));
      } else if (operation === 'allocateReceipt') {
        const timeEntryIds = formData.getAll('timeEntryIds').map(String);
        new CrewSharedExpenseAllocationRepository(context.sqlite).create(context.principal, {
          requestId: value('requestId'),
          expenseId: value('expenseId'),
          allocations: timeEntryIds.map((timeEntryId) => ({
            timeEntryId,
            amountMinor: minorFromMoney(value(`amount_${timeEntryId}`)),
          })),
        });
      } else {
        const workerIds = formData.getAll('workerIds').map(String);
        const individual = value('mode') === 'individual';
        if (!individual && value('mode') !== 'shared')
          throw new ValidationError('Choose shared or individual hours');
        const workerMinutes = individual
          ? Object.fromEntries(
              workerIds.map((id) => [
                id,
                minutesFromHours(value(`hours_${id}`), 'Crew member hours'),
              ]),
            )
          : undefined;
        crew.createBatch(context.principal, {
          requestId: value('requestId'),
          projectId: value('projectId'),
          workDate: value('workDate'),
          category: value('category') || 'regular',
          summary: value('summary'),
          workerIds,
          minutes: individual ? 0 : minutesFromHours(value('sharedHours'), 'Shared hours'),
          workerMinutes,
          submit: value('submit') === 'yes',
        });
      }
      const projectId = value('projectId');
      const workDate =
        operation === 'createBatch' || operation === 'allocateReceipt' || operation === 'submit'
          ? value('workDate')
          : '';
      const query = new URLSearchParams();
      if (projectId) query.set('project', projectId);
      const actionUrl = new URL(request.url);
      const selectedDate = workDate || actionUrl.searchParams.get('date') || '';
      if (/^\d{4}-\d{2}-\d{2}$/u.test(selectedDate)) query.set('date', selectedDate);
      const selectedLocale = actionUrl.searchParams.get('lang');
      if (selectedLocale && ['en', 'es', 'pt'].includes(selectedLocale))
        query.set('lang', selectedLocale);
      const destination =
        operation === 'grant' || operation === 'revoke'
          ? 'crew-delegations'
          : operation === 'allocateReceipt'
            ? 'crew-receipts'
            : 'crew-entries';
      redirect(303, `/j-aautomation/app/crew?${query}#${destination}`);
    } catch (caught) {
      if (isRedirect(caught)) throw caught;
      return crewPageActionFailure(
        caught,
        operation,
        values,
        formData.getAll('workerIds').filter((entry): entry is string => typeof entry === 'string'),
        formData
          .getAll('timeEntryIds')
          .filter((entry): entry is string => typeof entry === 'string'),
      );
    } finally {
      context.sqlite.close();
    }
  };
}

export const actions: Actions = {
  grant: action('grant'),
  revoke: action('revoke'),
  createBatch: action('createBatch'),
  submit: action('submit'),
  allocateReceipt: action('allocateReceipt'),
};
