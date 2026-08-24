import { afterEach, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

describe('B5 effective membership (RED characterization)', () => {
  it('does not put a future assignment into the current principal project set', () => {
    const value = fixture();
    value.sqlite
      .prepare(
        "UPDATE project_member SET starts_on='2099-01-01',ends_on=NULL,status='active' WHERE project_id=? AND user_id='b5-worker'",
      )
      .run(value.project.id);
    const principal = value.repository.principalFor('b5-worker');
    expect(principal.projectIds.has(value.project.id)).toBe(false);
  });

  it('does not put an expired assignment into the current principal project set', () => {
    const value = fixture();
    value.sqlite
      .prepare(
        "UPDATE project_member SET starts_on='2020-01-01',ends_on='2020-12-31',status='active' WHERE project_id=? AND user_id='b5-worker'",
      )
      .run(value.project.id);
    const principal = value.repository.principalFor('b5-worker');
    expect(principal.projectIds.has(value.project.id)).toBe(false);
  });

  it('blocks stale workers from project objects after assignment expiry while keeping an authorized PM visible', () => {
    const value = fixture();
    const time = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-18',
      category: 'regular',
      minutes: 480,
      summary: 'Effective membership time',
    });
    const daily = value.repository.createDailyReport(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-18',
      summary: 'Daily work',
      tasksCompleted: 'Completed tasks',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    const expense = value.repository.createExpense(value.worker, {
      projectId: value.project.id,
      spentOn: '2026-08-18',
      vendor: 'Site transport',
      category: 'travel',
      description: 'Transport to site',
      currency: 'EUR',
      amountMinor: 1_000n,
      whoPaid: 'worker',
      clientTreatment: 'reimbursable',
      receiptRequired: false,
    });
    const document = value.repository.registerPrivateDocument(value.worker, {
      projectId: value.project.id,
      sha256: 'a'.repeat(64),
      mediaType: 'application/pdf',
      byteLength: 128,
      storageKey: 'reports/effective-membership.pdf',
      originalFilename: 'effective-membership.pdf',
      artifactType: 'report',
    });

    expect(value.repository.search(value.worker, value.project.projectNumber)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: value.project.id })]),
    );
    expect(value.repository.search(value.worker, 'Daily work')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: daily.id })]),
    );
    expect(value.repository.search(value.worker, 'Site transport')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: expense.id })]),
    );
    expect(value.repository.searchSuggestions(value.worker)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: value.project.id }),
        expect.objectContaining({ id: daily.id }),
        expect.objectContaining({ id: expense.id }),
      ]),
    );

    // Keep the captured Principal's projectIds to exercise the stale-principal
    // path; authorization must re-check the assignment in SQLite.
    value.sqlite
      .prepare(
        "UPDATE project_member SET ends_on='2026-08-20' WHERE project_id=? AND user_id='b5-worker'",
      )
      .run(value.project.id);

    expect(value.worker.projectIds.has(value.project.id)).toBe(true);
    expect(value.repository.listTimeForScope(value.worker)).toEqual([]);
    expect(value.repository.listExpensesForScope(value.worker)).toEqual([]);
    expect(value.repository.listOwnReports(value.worker)).toEqual([]);
    const staleSearch = value.repository.search(value.worker, '');
    expect(staleSearch).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: value.project.id }),
        expect.objectContaining({ id: daily.id }),
        expect.objectContaining({ id: expense.id }),
      ]),
    );
    expect(value.repository.searchSuggestions(value.worker)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: value.project.id }),
        expect.objectContaining({ id: daily.id }),
        expect.objectContaining({ id: expense.id }),
      ]),
    );
    expect(() => value.repository.listDocuments(value.worker, value.project.id)).toThrow();
    expect(() => value.repository.timeDetail(value.worker, time.id)).toThrow();
    expect(() => value.repository.reportDetail(value.worker, daily.id)).toThrow();
    expect(() => value.repository.expenseDetail(value.worker, expense.id)).toThrow();
    expect(() =>
      value.repository.updateTimeEntry(value.worker, {
        id: time.id,
        version: time.version,
        minutes: 60,
      }),
    ).toThrow();
    expect(() => value.repository.submitTime(value.worker, time.id, time.version)).toThrow();
    expect(() =>
      value.repository.updateExpense(value.worker, {
        id: expense.id,
        version: expense.version,
        description: 'Should be denied',
      }),
    ).toThrow();
    expect(() =>
      value.repository.submitExpense(value.worker, expense.id, expense.version),
    ).toThrow();
    expect(() => value.v3.authorizeDocument(value.worker, document.id)).toThrow();

    expect(value.repository.timeDetail(value.manager, time.id)).toEqual(
      expect.objectContaining({ id: time.id, project_id: value.project.id }),
    );
    expect(value.repository.expenseDetail(value.manager, expense.id)).toEqual(
      expect.objectContaining({ id: expense.id, project_id: value.project.id }),
    );
    expect(value.repository.reportDetail(value.manager, daily.id)).toEqual(
      expect.objectContaining({ report: expect.objectContaining({ id: daily.id }) }),
    );
    expect(value.repository.timeDetail(value.owner, time.id)).toEqual(
      expect.objectContaining({ id: time.id }),
    );
  });

  it('omits Worker search records when the project lifecycle is archived', () => {
    const value = fixture();
    const expense = value.repository.createExpense(value.worker, {
      projectId: value.project.id,
      spentOn: '2026-08-18',
      vendor: 'Archived search expense',
      category: 'travel',
      description: 'Must disappear with archived project lifecycle',
      currency: 'EUR',
      amountMinor: 1_000n,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    expect(value.repository.search(value.worker, 'Archived search expense')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: expense.id })]),
    );
    value.sqlite.prepare("UPDATE project SET status='archived' WHERE id=?").run(value.project.id);
    expect(value.repository.search(value.worker, '')).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: value.project.id }),
        expect.objectContaining({ id: expense.id }),
      ]),
    );
  });

  it('blocks a captured worker principal from a project after its assignment is moved into the future', () => {
    const value = fixture();
    const time = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-18',
      category: 'regular',
      minutes: 480,
      summary: 'Future assignment isolation',
    });
    value.sqlite
      .prepare(
        "UPDATE project_member SET starts_on='2099-01-01',ends_on=NULL WHERE project_id=? AND user_id='b5-worker'",
      )
      .run(value.project.id);
    expect(value.worker.projectIds.has(value.project.id)).toBe(true);
    expect(value.repository.listTimeForScope(value.worker)).toEqual([]);
    expect(() => value.repository.timeDetail(value.worker, time.id)).toThrow();
  });

  it('uses the technical report date for normal and offline membership checks', () => {
    const value = fixture();
    value.sqlite
      .prepare(
        "UPDATE project_member SET starts_on='2026-08-20' WHERE project_id=? AND user_id='b5-worker'",
      )
      .run(value.project.id);

    expect(() =>
      value.repository.createTechnicalReport(value.worker, {
        projectId: value.project.id,
        reportDate: '2026-08-18',
        systemName: 'PLC',
        changeSummary: 'Historical report outside assignment',
        safetyRelated: false,
      }),
    ).toThrow();
    expect(
      value.repository.createTechnicalReport(value.worker, {
        projectId: value.project.id,
        reportDate: '2026-08-21',
        systemName: 'PLC',
        changeSummary: 'Report during assignment',
        safetyRelated: false,
      }),
    ).toEqual(expect.objectContaining({ version: 1 }));

    expect(() =>
      value.v3.syncMutation(value.worker, {
        mutationId: '0198be45-cd9c-7ab4-9a5a-a6c000000001',
        entityType: 'technical_report',
        entityId: '0198be45-cd9c-7ab4-9a5a-a6c000000002',
        baseVersion: 0,
        payload: {
          projectId: value.project.id,
          reportDate: '2026-08-18',
          systemName: 'PLC',
          changeSummary: 'Offline historical report outside assignment',
          safetyRelated: false,
        },
        attachments: [],
      }),
    ).toThrow();
  });

  it('rejects receipts from another project in normal and offline expense creation', () => {
    const value = fixture();
    const otherProject = value.repository.createProject(value.owner, {
      clientId: value.client.id,
      name: 'Receipt isolation project',
      timezone: 'Europe/Madrid',
      currency: 'EUR',
      billingModel: 'tm',
    });
    value.repository.assignWorker(value.owner, {
      projectId: otherProject.id,
      workerId: 'b5-worker',
      startsOn: '2026-01-01',
    });
    const receipt = value.repository.registerReceipt(value.worker, {
      projectId: otherProject.id,
      sha256: 'b'.repeat(64),
      mediaType: 'application/pdf',
      byteLength: 128,
      storageKey: 'receipts/other-project.pdf',
      originalFilename: 'other-project.pdf',
    });
    expect(() =>
      value.repository.createExpense(value.worker, {
        projectId: value.project.id,
        spentOn: '2026-08-18',
        vendor: 'Wrong project receipt',
        category: 'travel',
        description: 'Receipt must not cross project boundaries',
        currency: 'EUR',
        amountMinor: 1_000n,
        whoPaid: 'worker',
        clientTreatment: 'reimbursable',
        receiptRequired: true,
        receiptDocumentId: receipt.id,
      }),
    ).toThrow();
    expect(() =>
      value.v3.syncMutation(value.worker, {
        mutationId: '0198be45-cd9c-7ab4-9a5a-a6c000000003',
        entityType: 'expense',
        entityId: '0198be45-cd9c-7ab4-9a5a-a6c000000004',
        baseVersion: 0,
        payload: {
          projectId: value.project.id,
          spentOn: '2026-08-18',
          vendor: 'Wrong project receipt',
          category: 'travel',
          description: 'Receipt must not cross project boundaries',
          currency: 'EUR',
          amountMinor: '1000',
          whoPaid: 'worker',
          clientTreatment: 'reimbursable',
          receiptRequired: true,
          receiptDocumentId: receipt.id,
        },
        attachments: [],
      }),
    ).toThrow();
  });
});
