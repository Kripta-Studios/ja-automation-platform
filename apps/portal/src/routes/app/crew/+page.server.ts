import { randomUUID } from 'node:crypto';
import { fail, error, redirect } from '@sveltejs/kit';
import {
  AccessDeniedError,
  CrewLeaderRepository,
  CrewSharedExpenseAllocationRepository,
  ValidationError,
} from '@ja/database';
import { openPortalRepository, actionFailure } from '$lib/server/portal-repository';
import type { Actions, PageServerLoad } from './$types';

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
        operation === 'createBatch' || operation === 'allocateReceipt' ? value('workDate') : '';
      const query = new URLSearchParams();
      if (projectId) query.set('project', projectId);
      if (workDate) query.set('date', workDate);
      redirect(303, `/j-aautomation/app/crew?${query}`);
    } catch (caught) {
      const response = actionFailure(caught);
      return fail(response.status, {
        ...response.data,
        operation,
        values,
        workerIds: formData.getAll('workerIds').map(String),
        timeEntryIds: formData.getAll('timeEntryIds').map(String),
      });
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
