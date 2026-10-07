import { describe, expect, it } from 'vitest';
import { assistantTasks, tasksForContext } from './catalog';

describe('role-aware navigation catalogue', () => {
  it('uses safe relative destinations and unique complete localized tasks', () => {
    expect(assistantTasks.length).toBeGreaterThan(100);
    expect(new Set(assistantTasks.map((task) => task.id)).size).toBe(assistantTasks.length);
    for (const task of assistantTasks) {
      for (const href of [task.href, task.recordHref].filter(Boolean) as string[]) {
        expect(href).toMatch(/^\/app(?:\/|\?|#|$)/);
        expect(href).not.toMatch(/[\s\\]/);
        expect(new URL(href.replace('{id}', 'record'), 'https://portal.invalid').origin).toBe(
          'https://portal.invalid',
        );
      }
      for (const locale of ['en', 'es', 'pt'] as const) {
        expect(task.title[locale].length).toBeGreaterThan(2);
        expect(task.description[locale].length).toBeGreaterThan(2);
        expect(task.phrases[locale].length).toBeGreaterThan(0);
      }
      if (task.recordHref) expect(task.recordKind).toBeTruthy();
    }
  });
  it('fails closed for an unknown role', () => {
    expect(tasksForContext({ role: 'administrator' })).toEqual([]);
    expect(tasksForContext({})).toEqual([]);
    expect(tasksForContext({ role: 'worker', workforceProfile: 'future_supplier' })).toEqual([]);
  });
  it('gates canonical mailbox access', () => {
    expect(
      tasksForContext({ role: 'owner_admin' }).some((task) => task.id.startsWith('mailbox-')),
    ).toBe(false);
    expect(
      tasksForContext({ role: 'owner_admin', canonicalOwner: true }).filter((task) =>
        task.id.startsWith('mailbox-'),
      ),
    ).toHaveLength(6);
  });
  it('gates team administration to the canonical owner and respects actual milestone UI', () => {
    const restricted = ['team-create', 'team-invite', 'team-status', 'team-profile'];
    expect(
      tasksForContext({ role: 'owner_admin' }).some((task) => restricted.includes(task.id)),
    ).toBe(false);
    expect(
      tasksForContext({ role: 'owner_admin', canonicalOwner: true }).filter((task) =>
        restricted.includes(task.id),
      ),
    ).toHaveLength(4);
    expect(
      tasksForContext({ role: 'project_manager' }).some((task) => task.id === 'project-milestones'),
    ).toBe(false);
    expect(
      tasksForContext({ role: 'project_manager' }).some((task) => task.id === 'approval-reports'),
    ).toBe(true);
  });
  it.each(['worker', 'project_manager'])(
    'does not expose financial or administrative tasks to %s',
    (role) => {
      const tasks = tasksForContext({ role });
      expect(
        tasks.some((task) =>
          /^(finance|invoice|billing|ledger|accounting|mailbox|management|team-status)-?/.test(
            task.id,
          ),
        ),
      ).toBe(false);
      expect(tasks.some((task) => task.id === 'time-create')).toBe(true);
    },
  );
  it('gives restricted supplier profiles only operational and own security targets', () => {
    for (const workforceProfile of ['supplier_coordinator', 'external_technician']) {
      const tasks = tasksForContext({ role: 'worker', workforceProfile });
      expect(
        tasks.every((task) =>
          /^\/(?:app\/(?:supplier|time|expenses|reports|profile|help))(?:\/|\?|#|$)/.test(
            task.href,
          ),
        ),
      ).toBe(true);
      expect(tasks.some((task) => task.id === 'supplier-own-report')).toBe(true);
      expect(tasks.some((task) => task.id === 'pay-statement')).toBe(false);
    }
    expect(
      tasksForContext({ role: 'worker', workforceProfile: 'external_technician' }).some(
        (task) => task.id === 'supplier-personnel',
      ),
    ).toBe(false);
    expect(
      tasksForContext({ role: 'worker', workforceProfile: 'supplier_coordinator' }).some(
        (task) => task.id === 'supplier-personnel',
      ),
    ).toBe(true);
  });
  it('limits auditors to read destinations and own security', () => {
    const tasks = tasksForContext({ role: 'auditor_read_only' });
    expect(tasks.map((task) => task.id).sort()).toEqual(
      [
        'accounting-register',
        'audit',
        'finance-economic',
        'finance-overview',
        'help',
        'ledger-view',
        'notifications',
        'profile-security',
      ].sort(),
    );
    expect(
      tasks
        .filter((task) => task.actionNames.length)
        .map((task) => task.id)
        .sort(),
    ).toEqual(['notifications', 'profile-security']);
  });
  it('covers major operational and financial source actions', () => {
    const actions = new Set(assistantTasks.flatMap((task) => task.actionNames));
    for (const action of [
      'createProject',
      'createClient',
      'assignWorker',
      'createInvitation',
      'createSupplier',
      'grant',
      'createTime',
      'createExpense',
      'createDailyReport',
      'createTechnicalReport',
      'createProjectCommercialPolicy',
      'savePersonTerms',
      'createInvoiceDraft',
      'issueInvoice',
      'recordPayment',
      'recordCompensationPayment',
      'recordReimbursement',
      'createAccountingPack',
      'uploadPrivateDocument',
      'createPlanning',
      'setAvailability',
      'markRead',
    ])
      expect(actions.has(action), action).toBe(true);
  });
});
