import { describe, expect, it } from 'vitest';
import {
  assignmentDirectoryView,
  assignmentFormAction,
  assignmentReviewHref,
  assignmentRetainedValue,
  assignmentWorkflowHref,
  projectWorkflowFrom,
} from '../../apps/portal/src/lib/portal/assignment-form-action';

describe('native assignment workflow form destinations', () => {
  it.each([
    ['updateAssignment', 'update-assignment'],
    ['removeAssignment', 'remove-assignment'],
  ] as const)('keeps the scoped project, worker, language and view for %s', (action, workflow) => {
    const current = new URL(
      'https://portal.example/j-aautomation/app/projects?action=assign-worker&project=qa-project&worker=qa-worker&lang=pt&view=team',
    );
    const result = new URL(assignmentFormAction(current, action), current);
    expect(result.pathname).toBe(current.pathname);
    expect(result.searchParams.get('project')).toBe('qa-project');
    expect(result.searchParams.get('worker')).toBe('qa-worker');
    expect(result.searchParams.get('lang')).toBe('pt');
    expect(result.searchParams.get('view')).toBe('team');
    expect(result.searchParams.get('action')).toBe(workflow);
    expect([...result.searchParams.keys()].filter((key) => key.startsWith('/'))).toEqual([
      `/${action}`,
    ]);
    expect(result.hash).toBe('#project-assignment-list');
  });

  it('replaces all previous named actions without mutating the source URL', () => {
    const current = new URL(
      'https://portal.example/app/projects?/updateAssignment&%2FremoveAssignment=1&%2FoldAction=2&action=update-assignment&project=qa&lang=es#assignment-history',
    );
    const original = current.href;
    const result = new URL(assignmentFormAction(current, 'removeAssignment'), current);
    expect([...result.searchParams.keys()].filter((key) => key.startsWith('/'))).toEqual([
      '/removeAssignment',
    ]);
    expect(result.searchParams.get('action')).toBe('remove-assignment');
    expect(result.hash).toBe('#assignment-history');
    expect(current.href).toBe(original);
  });

  it('preserves encoded query values, empty filters and repeated normal parameters', () => {
    const current = new URL(
      'https://portal.example/app/projects?project=QA%2FA%26B&worker=member%2B1&lang=es&q=Meals+%26+travel&view=&filter=one&filter=two',
    );
    const result = new URL(assignmentFormAction(current, 'updateAssignment'), current);
    for (const key of ['project', 'worker', 'lang', 'q', 'view', 'filter'])
      expect(result.searchParams.getAll(key)).toEqual(current.searchParams.getAll(key));
    expect(result.searchParams.has('/removeAssignment')).toBe(false);
  });

  it('keeps a Manager detail view path and its existing anchor', () => {
    const current = new URL(
      'https://portal.example/tenant/app/projects?view=team&project=qa&worker=own&lang=en#project-assignment-list',
    );
    const result = new URL(assignmentFormAction(current, 'updateAssignment'), current);
    expect(result.pathname).toBe('/tenant/app/projects');
    expect(result.searchParams.get('view')).toBe('team');
    expect(result.searchParams.get('project')).toBe('qa');
    expect(result.hash).toBe(current.hash);
  });

  it('does not carry credentials or an origin into the relative native form destination', () => {
    const current = new URL('https://user:password@portal.example/app/projects?lang=pt');
    expect(assignmentFormAction(current, 'removeAssignment')).toBe(
      '/app/projects?/removeAssignment&lang=pt&action=remove-assignment#project-assignment-list',
    );
  });
});

describe('assignment entry and chooser navigation', () => {
  it('preserves normal directory context while choosing a worker and replacing obsolete named actions', () => {
    const current = new URL(
      'https://portal.example/app/projects?/updateAssignment&action=update-assignment&project=qa&worker=previous&view=team&lang=pt&q=QA%20%26%20test#team-directory',
    );
    const original = current.href;
    const next = new URL(
      assignmentWorkflowHref(current, 'updateAssignment', { worker: 'member+1' }),
      current,
    );
    expect(next.searchParams.get('project')).toBe('qa');
    expect(next.searchParams.get('worker')).toBe('member+1');
    expect(next.searchParams.get('view')).toBe('team');
    expect(next.searchParams.get('lang')).toBe('pt');
    expect(next.searchParams.get('q')).toBe('QA & test');
    expect([...next.searchParams.keys()].some((key) => key.startsWith('/'))).toBe(false);
    expect(next.hash).toBe('#project-assignment-list');
    expect(current.href).toBe(original);
  });

  it('retains selected project and worker when switching Update to Remove', () => {
    const current = new URL(
      'https://portal.example/app/projects?action=update-assignment&project=qa&worker=member&view=team&lang=es',
    );
    const next = new URL(assignmentWorkflowHref(current, 'removeAssignment'), current);
    expect(next.searchParams.get('project')).toBe('qa');
    expect(next.searchParams.get('worker')).toBe('member');
    expect(next.searchParams.get('view')).toBe('team');
    expect(next.searchParams.get('lang')).toBe('es');
    expect(projectWorkflowFrom(next, 'updateAssignment')).toBe('remove-assignment');
  });

  it('does not let a retained Update result reopen its workflow after navigating to the list', () => {
    expect(
      projectWorkflowFrom(
        new URL('https://portal.example/app/projects?view=team'),
        'updateAssignment',
      ),
    ).toBeNull();
  });

  it('preserves a native failed action workflow only while that action remains current', () => {
    const current = new URL('https://portal.example/app/projects?/updateAssignment&worker=member');
    expect(projectWorkflowFrom(current, 'updateAssignment')).toBe('update-assignment');
    expect(projectWorkflowFrom(current, 'removeAssignment')).toBeNull();
    expect(
      projectWorkflowFrom(
        new URL('https://portal.example/app/projects?/createProject'),
        'createProject',
      ),
    ).toBe('new-project');
  });

  it('honors explicit new-project navigation over a previous assignment result', () => {
    expect(
      projectWorkflowFrom(
        new URL('https://portal.example/app/projects?action=new-project'),
        'updateAssignment',
      ),
    ).toBe('new-project');
  });
});

describe('assignment workflows outrank retained project directory and use correct recovery route', () => {
  it.each(['team', 'clients'])(
    'selects every recognized workflow over the retained %s directory, then restores that directory',
    (view) => {
      const current = new URL(
        `https://portal.example/app/projects?view=${view}&lang=es&worker=member`,
      );
      for (const workflow of [
        'new-client',
        'update-client',
        'new-project',
        'assign-worker',
        'update-assignment',
        'remove-assignment',
      ]) {
        const target = new URL(current);
        target.searchParams.set('action', workflow);
        expect(
          assignmentDirectoryView(target, projectWorkflowFrom(target, 'updateAssignment')),
        ).toBeNull();
        expect(target.searchParams.get('view')).toBe(view);
        target.searchParams.delete('action');
        expect(
          assignmentDirectoryView(target, projectWorkflowFrom(target, 'updateAssignment')),
        ).toBe(view);
      }
    },
  );

  it.each(['time', 'expenses', 'reports'])(
    'routes the %s assignment remedy to Projects without carrying an unrelated register search',
    (section) => {
      const current = new URL(
        `https://portal.example/tenant/app/${section}?lang=pt&project=qa&worker=member&q=old-register-query&view=table`,
      );
      const result = new URL(assignmentReviewHref(current, '/tenant/app/projects'), current);
      expect(result.pathname).toBe('/tenant/app/projects');
      expect(result.searchParams.get('lang')).toBe('pt');
      expect(result.searchParams.get('project')).toBe('qa');
      expect(result.searchParams.get('worker')).toBe('member');
      expect(result.searchParams.has('q')).toBe(false);
      expect(result.searchParams.has('view')).toBe(false);
      expect(result.searchParams.get('action')).toBe('update-assignment');
      expect(result.hash).toBe('#project-assignment-list');
    },
  );

  it('retains normal directory filters for an assignment remedy already in Projects', () => {
    const current = new URL(
      'https://portal.example/app/projects?view=clients&lang=es&q=QA&project=qa&worker=member',
    );
    const result = new URL(assignmentReviewHref(current, '/app/projects'), current);
    for (const key of ['view', 'lang', 'q', 'project', 'worker'])
      expect(result.searchParams.get(key)).toBe(current.searchParams.get(key));
  });
});

describe('failed assignment input retention is action-scoped', () => {
  const failedUpdate = {
    actionName: 'updateAssignment',
    values: {
      assignmentId: 'row',
      endsOn: '2026-10-30',
      version: '10',
      plannedMinutes: 0,
      startsOn: '',
    },
  };
  it('preserves exact stale version, empty and zero input for the same failed Update', () => {
    expect(assignmentRetainedValue(failedUpdate, 'updateAssignment', 'row', 'version', '11')).toBe(
      '10',
    );
    expect(
      assignmentRetainedValue(failedUpdate, 'updateAssignment', 'row', 'plannedMinutes', '60'),
    ).toBe('0');
    expect(
      assignmentRetainedValue(failedUpdate, 'updateAssignment', 'row', 'startsOn', '2026-09-01'),
    ).toBe('');
  });
  it('does not carry Update values or stale version into Remove or another assignment', () => {
    expect(
      assignmentRetainedValue(failedUpdate, 'removeAssignment', 'row', 'endsOn', '2026-09-30'),
    ).toBe('2026-09-30');
    expect(assignmentRetainedValue(failedUpdate, 'removeAssignment', 'row', 'version', '11')).toBe(
      '11',
    );
    expect(
      assignmentRetainedValue(failedUpdate, 'updateAssignment', 'other', 'endsOn', 'original'),
    ).toBe('original');
  });
  it('does not carry Remove input into Update and uses fresh fallback for fields never submitted', () => {
    const failedRemove = {
      actionName: 'removeAssignment',
      values: { assignmentId: 'row', endsOn: '2026-09-30', reason: 'My entered reason' },
    };
    expect(
      assignmentRetainedValue(failedRemove, 'updateAssignment', 'row', 'endsOn', '2026-10-30'),
    ).toBe('2026-10-30');
    expect(assignmentRetainedValue(failedRemove, 'removeAssignment', 'row', 'reason')).toBe(
      'My entered reason',
    );
    expect(assignmentRetainedValue(failedRemove, 'removeAssignment', 'row', 'version', '11')).toBe(
      '11',
    );
  });
});
