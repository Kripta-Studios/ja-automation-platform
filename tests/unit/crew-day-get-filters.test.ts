import { beforeEach, describe, expect, it, vi } from 'vitest';

const scenario = vi.hoisted(() => ({
  role: 'worker' as 'worker' | 'owner_admin' | 'finance_admin',
  projects: [{ id: 'project-1', name: 'Visible project' }],
  projectsAfterRead: null as null | { id: string; name: string }[],
  denyBeforeFilters: false,
  projectCalls: 0,
  rowCalls: [] as string[],
  closed: false,
}));

vi.mock('@ja/database', async (importOriginal) => {
  const original = await importOriginal<typeof import('@ja/database')>();
  return {
    ...original,
    CrewLeaderRepository: class {
      projects() {
        scenario.projectCalls += 1;
        if (scenario.denyBeforeFilters)
          throw new original.AccessDeniedError('Crew chief access required');
        return scenario.projectCalls > 1 && scenario.projectsAfterRead !== null
          ? scenario.projectsAfterRead
          : scenario.projects;
      }
      candidateWorkers() {
        scenario.rowCalls.push('candidates');
        return [];
      }
      grants() {
        scenario.rowCalls.push('grants');
        return [];
      }
      assignedWorkers() {
        scenario.rowCalls.push('assigned');
        return [];
      }
      entries() {
        scenario.rowCalls.push('entries');
        return [];
      }
    },
    CrewSharedExpenseAllocationRepository: class {
      allocatedReceipts() {
        scenario.rowCalls.push('allocated');
        return [];
      }
      allocationForReceipt() {
        scenario.rowCalls.push('receipt');
        return null;
      }
      eligibleReceipts() {
        scenario.rowCalls.push('eligible');
        return [];
      }
    },
  };
});

vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: () => ({
    principal: { role: scenario.role, userId: 'user-1' },
    sqlite: { close: () => (scenario.closed = true) },
  }),
}));

import { actions, load } from '../../apps/portal/src/routes/app/crew/+page.server';
import { portalText } from '../../apps/portal/src/lib/portal-i18n';

async function day(query: string) {
  return (await load({
    locals: {
      user: { id: 'user-1', role: scenario.role },
      session: { id: 'session-1' },
      correlationId: 'test-reference',
    },
    url: new URL(`http://localhost/j-aautomation/app/crew${query}`),
  } as never)) as Record<string, unknown>;
}

beforeEach(() => {
  scenario.role = 'worker';
  scenario.projects = [{ id: 'project-1', name: 'Visible project' }];
  scenario.projectsAfterRead = null;
  scenario.denyBeforeFilters = false;
  scenario.projectCalls = 0;
  scenario.rowCalls = [];
  scenario.closed = false;
});

describe('crew day GET filters', () => {
  it('resolves each filter and picker message in English, Spanish, and Portuguese', () => {
    const keys = [
      'problem.crew.dayProjectUnavailableOwner',
      'problem.crew.dayProjectUnavailableChief',
      'problem.crew.dayProjectRequiredOwner',
      'problem.crew.dayProjectRequiredChief',
      'problem.crew.dayProjectSelectionRequired',
      'problem.crew.dayDateInvalid',
      'problem.crew.dayProjectDuplicate',
      'problem.crew.dayDateDuplicate',
      'problem.crew.dayFilterNotApplied',
      'problem.crew.dayProjectUnavailableOption',
    ];
    for (const locale of ['en', 'es', 'pt'] as const)
      for (const key of keys) {
        const rendered = portalText(locale, key);
        expect(rendered, `${locale}: ${key}`).not.toBe(key);
        expect(rendered.trim().length).toBeGreaterThan(12);
      }
  });

  it.each([
    ['?project=project-1&date=2026-02-30', 'CREW_DAY_DATE_INVALID', '2026-02-30'],
    ['?project=project-1&date=not-a-date', 'CREW_DAY_DATE_INVALID', 'not-a-date'],
    ['?project=project-1&date=', 'CREW_DAY_DATE_INVALID', ''],
    ['?project=project-1&date=2026-09-27&date=2026-09-28', 'CREW_DAY_DATE_DUPLICATE', '2026-09-27'],
  ])('retains the work date and loads no rows for %s', async (query, code, workDate) => {
    const result = await day(query);
    expect(result.workDate).toBe(workDate);
    expect(result.filterProblem).toMatchObject({
      code,
      fieldErrors: { date: [expect.stringMatching(/^problem\.crew\./u)] },
      correlationId: 'test-reference',
    });
    expect(result.entries).toEqual([]);
    expect(result.allocatedReceipts).toEqual([]);
    expect(scenario.rowCalls).toEqual([]);
    expect(scenario.closed).toBe(true);
  });

  it('keeps a stale direct project choice without revealing its name or crew rows', async () => {
    const result = await day('?project=private-project&date=2026-09-27');
    expect(result.projectId).toBe('private-project');
    expect(result.projects).toEqual(scenario.projects);
    expect(result.filterProblem).toMatchObject({
      code: 'CREW_DAY_PROJECT_UNAVAILABLE_CHIEF',
      messageKey: 'problem.crew.dayProjectUnavailableChief',
      fieldErrors: { project: ['problem.crew.dayProjectUnavailableChief'] },
      remedies: [{ id: 'contact_project_owner' }],
    });
    expect(JSON.stringify(result)).not.toContain('private project name');
    expect(scenario.rowCalls).toEqual([]);
  });

  it('offers owner project review for a stale project without loading crew rows', async () => {
    scenario.role = 'owner_admin';
    const result = await day('?project=closing-project&date=2026-09-27');
    expect(result.filterProblem).toMatchObject({
      code: 'CREW_DAY_PROJECT_UNAVAILABLE_OWNER',
      messageKey: 'problem.crew.dayProjectUnavailableOwner',
      remedies: [{ id: 'review_projects' }],
    });
    expect(scenario.rowCalls).toEqual([]);
  });

  it('keeps the first project for duplicate parameters and does not load rows', async () => {
    const result = await day('?project=project-1&project=private-project&date=2026-09-27');
    expect(result.projectId).toBe('project-1');
    expect(result.filterProblem).toMatchObject({
      code: 'CREW_DAY_PROJECT_DUPLICATE',
      fieldErrors: { project: ['problem.crew.dayProjectDuplicate'] },
    });
    expect(scenario.rowCalls).toEqual([]);
  });

  it('keeps both causes for a duplicated malformed work date', async () => {
    const result = await day('?project=project-1&date=not-a-date&date=2026-09-27');
    expect(result.workDate).toBe('not-a-date');
    expect(result.filterProblem).toMatchObject({
      code: 'CREW_DAY_DATE_DUPLICATE',
      fieldErrors: {
        date: ['problem.crew.dayDateDuplicate', 'problem.crew.dayDateInvalid'],
      },
    });
    expect(scenario.rowCalls).toEqual([]);
  });

  it('returns a role-specific next step when no authorized projects exist', async () => {
    scenario.projects = [];
    const worker = await day('?date=2026-09-27');
    expect(worker.filterProblem).toMatchObject({
      code: 'CREW_DAY_PROJECT_REQUIRED_CHIEF',
      remedies: [{ id: 'contact_project_owner' }],
    });
    scenario.projectCalls = 0;
    scenario.role = 'owner_admin';
    const owner = await day('?date=2026-09-27');
    expect(owner.filterProblem).toMatchObject({
      code: 'CREW_DAY_PROJECT_REQUIRED_OWNER',
      remedies: [{ id: 'review_projects' }],
    });
    expect(scenario.rowCalls).toEqual([]);
  });

  it('asks for a project selection when choices exist but the submitted value is empty', async () => {
    const result = await day('?project=&date=2026-09-27');
    expect(result.projectId).toBe('');
    expect(result.filterProblem).toMatchObject({
      code: 'CREW_DAY_PROJECT_SELECTION_REQUIRED',
      messageKey: 'problem.crew.dayProjectSelectionRequired',
      remedies: [{ id: 'correct_field' }],
    });
    expect(scenario.rowCalls).toEqual([]);
  });

  it('does not interpret filter facts before a live crew role check', async () => {
    scenario.role = 'finance_admin';
    scenario.denyBeforeFilters = true;
    await expect(day('?project=private-project&date=bad')).rejects.toMatchObject({ status: 403 });
    expect(scenario.projectCalls).toBe(1);
    expect(scenario.rowCalls).toEqual([]);
    expect(scenario.closed).toBe(true);
  });

  it('drops rows if project scope changes after the first authorized list', async () => {
    scenario.projectsAfterRead = [];
    const result = await day('?project=project-1&date=2026-09-27');
    expect(result.filterProblem).toMatchObject({ code: 'CREW_DAY_PROJECT_UNAVAILABLE_CHIEF' });
    expect(result.projects).toEqual([]);
    expect(result.entries).toEqual([]);
    expect(result.allocatedReceipts).toEqual([]);
    expect(scenario.rowCalls).toContain('entries');
  });

  it('loads scoped rows when the date and project remain valid', async () => {
    const result = await day('?project=project-1&date=2026-09-27');
    expect(result.filterProblem).toBeNull();
    expect(result.projectId).toBe('project-1');
    expect(result.workDate).toBe('2026-09-27');
    expect(scenario.rowCalls).toContain('entries');
    expect(scenario.projectCalls).toBe(2);
  });

  it('redirects each filter submission to a fresh GET that rechecks a revoked scope', async () => {
    const fields = new FormData();
    fields.set('project', 'project-1');
    fields.set('date', '2026-09-27');
    fields.set('lang', 'pt');
    fields.set('viewportScrollY', '300');
    fields.set('filterTarget', 'crew-hours');
    const submit = async (): Promise<{ status: number; location: string }> => {
      try {
        await actions.refreshFilter!({
          locals: { user: { id: 'user-1' }, session: { id: 'session-1' } },
          request: new Request('http://localhost/j-aautomation/app/crew?/refreshFilter', {
            method: 'POST',
            body: fields,
          }),
        } as never);
        throw new Error('Crew filter did not redirect');
      } catch (caught) {
        return caught as { status: number; location: string };
      }
    };
    const first = await submit();
    const second = await submit();
    expect(first.status).toBe(303);
    expect(second.status).toBe(303);
    const firstUrl = new URL(first.location, 'http://localhost');
    const secondUrl = new URL(second.location, 'http://localhost');
    expect(firstUrl.searchParams.get('project')).toBe('project-1');
    expect(firstUrl.searchParams.get('date')).toBe('2026-09-27');
    expect(firstUrl.searchParams.get('lang')).toBe('pt');
    expect(firstUrl.searchParams.get('viewportScrollY')).toBe('300');
    expect(firstUrl.hash).toBe('#crew-hours');
    expect(secondUrl.searchParams.get('filterRefresh')).toMatch(/^[0-9a-f-]{36}$/u);
    expect(secondUrl.searchParams.get('filterRefresh')).not.toBe(
      firstUrl.searchParams.get('filterRefresh'),
    );
    scenario.projects = [];
    const afterRevoke = await day(secondUrl.search);
    expect(afterRevoke.filterProblem).toMatchObject({ code: 'CREW_DAY_PROJECT_UNAVAILABLE_CHIEF' });
    expect(afterRevoke.entries).toEqual([]);
  });
});
