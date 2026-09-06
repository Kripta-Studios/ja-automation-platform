import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@ja/database';
import { join } from 'node:path';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  readSource,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

// Requirement coverage: V31-008/010, V32-001, V33-017, SPEC-HISTORY-001,
// SEC-RBAC-001 and SEC-UPLOAD-001.

const fixtures: B5LifecycleSecurityFixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

describe('requested immutable-history and RBAC invariants (RED characterization)', () => {
  it('supports client-contact create, edit and delete by record id', () => {
    const value = fixture();
    const created = value.repository.createClientContact(value.owner, {
      clientId: value.client.id,
      name: 'Operations contact',
      email: 'ops@example.test',
      role: 'Controls lead',
    });
    expect(value.repository.listClientContacts(value.owner, value.client.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.id, name: 'Operations contact' }),
      ]),
    );

    value.repository.updateClientContact(value.owner, created.id, {
      name: 'Updated operations contact',
      phone: '+34 900 000 000',
    });
    expect(value.repository.listClientContacts(value.owner, value.client.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.id,
          name: 'Updated operations contact',
          phone: '+34 900 000 000',
        }),
      ]),
    );

    value.repository.deleteClientContact(value.owner, created.id);
    expect(value.repository.listClientContacts(value.owner, value.client.id)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );
  });

  it('lets owner/admin assign a catalog skill and availability window to a selected worker', () => {
    const value = fixture();
    const skill = value.repository.createSkill(value.owner, {
      code: 'PLC-OPS',
      name: 'PLC operations',
    });
    value.repository.setWorkerSkill(value.owner, {
      workerId: value.worker.userId,
      skillId: skill.id,
      proficiency: 4,
    });
    value.repository.setWorkerAvailability(value.owner, {
      workerId: value.worker.userId,
      startsAt: '2026-08-24T08:00:00.000Z',
      endsAt: '2026-08-24T17:00:00.000Z',
      availability: 'available',
      note: 'Owner-assigned availability',
    });

    expect(value.repository.listWorkerSkills(value.owner, value.worker.userId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ skill_id: skill.id, proficiency: 4 })]),
    );
    expect(value.repository.listWorkerAvailability(value.owner, value.worker.userId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ availability: 'available', note: 'Owner-assigned availability' }),
      ]),
    );
  });

  it('blocks void/delete of a locked time entry and preserves the locked state', () => {
    const value = fixture();
    const created = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'commissioning',
      minutes: 90,
      summary: 'Locked history fixture',
    }) as { id: string; version: number };
    value.repository.submitTime(value.worker, created.id, created.version);
    const submitted = value.sqlite
      .prepare('SELECT version FROM time_entry WHERE id=?')
      .get(created.id) as { version: number };
    value.repository.operationalApproveTime(value.manager, created.id, 'approved');

    value.sqlite
      .prepare("UPDATE time_entry SET approval_state='locked',version=version+1 WHERE id=?")
      .run(created.id);
    const locked = value.sqlite
      .prepare('SELECT version,approval_state FROM time_entry WHERE id=?')
      .get(created.id) as { version: number; approval_state: string };
    expect(locked.approval_state).toBe('locked');
    expect(locked.version).toBeGreaterThan(submitted.version);

    expect(() => value.repository.deleteTime(value.owner, created.id, locked.version)).toThrow(
      /locked|void|immutable/i,
    );
    expect(
      value.sqlite.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(created.id),
      'locked source history must remain locked after a rejected destructive request',
    ).toEqual({ approval_state: 'locked' });
  });

  it('deletes only never-submitted time drafts and preserves returned time for reasoned correction', () => {
    const value = fixture();
    const draft = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-21',
      category: 'regular',
      minutes: 60,
      summary: 'Safe draft deletion fixture',
    });
    value.repository.deleteTime(value.worker, draft.id, draft.version);
    expect(
      value.sqlite.prepare('SELECT 1 FROM time_entry WHERE id=?').get(draft.id),
    ).toBeUndefined();

    const returned = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-21',
      category: 'regular',
      minutes: 60,
      summary: 'Needs-changes deletion fixture',
    });
    value.repository.submitTime(value.worker, returned.id, returned.version);
    value.repository.operationalApproveTime(
      value.manager,
      returned.id,
      'needs_changes',
      'Correct the work description',
    );
    const returnedVersion = value.sqlite
      .prepare('SELECT version FROM time_entry WHERE id=?')
      .get(returned.id) as { version: number };
    expect(() =>
      value.repository.deleteTime(value.worker, returned.id, returnedVersion.version),
    ).toThrow(/correction|reviewed/i);
    expect(() =>
      value.repository.updateTimeEntry(value.worker, {
        id: returned.id,
        version: returnedVersion.version,
        summary: 'Forged overwrite of a reviewed source',
      }),
    ).toThrow(/draft|editable|correction/i);
    expect(() =>
      value.repository.deleteDraft(value.worker, {
        recordType: 'time_entry',
        recordId: returned.id,
        version: returnedVersion.version,
      }),
    ).toThrow(/never-submitted|draft/i);
    expect(
      value.sqlite
        .prepare('SELECT approval_state,activity_summary,version FROM time_entry WHERE id=?')
        .get(returned.id),
    ).toEqual({
      approval_state: 'needs_changes',
      activity_summary: 'Needs-changes deletion fixture',
      version: returnedVersion.version,
    });
    expect(
      value.sqlite
        .prepare(
          "SELECT from_state,to_state,reason FROM approval_event WHERE entity_type='time' AND entity_id=?",
        )
        .get(returned.id),
    ).toEqual({
      from_state: 'submitted',
      to_state: 'needs_changes',
      reason: 'Correct the work description',
    });
    const returnedBeforeResubmit = value.sqlite
      .prepare('SELECT approval_state,version,submitted_at FROM time_entry WHERE id=?')
      .get(returned.id);
    const approvalEventsBeforeResubmit = value.sqlite
      .prepare("SELECT COUNT(*) count FROM approval_event WHERE entity_type='time' AND entity_id=?")
      .get(returned.id);
    const auditsBeforeResubmit = value.sqlite
      .prepare(
        "SELECT COUNT(*) count FROM audit_event WHERE entity_type='time_entry' AND entity_id=?",
      )
      .get(returned.id);
    expect(() =>
      value.repository.submitTime(value.worker, returned.id, returnedVersion.version),
    ).toThrow(/cannot be submitted/i);
    expect(
      value.sqlite
        .prepare('SELECT approval_state,version,submitted_at FROM time_entry WHERE id=?')
        .get(returned.id),
    ).toEqual(returnedBeforeResubmit);
    expect(
      value.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM approval_event WHERE entity_type='time' AND entity_id=?",
        )
        .get(returned.id),
    ).toEqual(approvalEventsBeforeResubmit);
    expect(
      value.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM audit_event WHERE entity_type='time_entry' AND entity_id=?",
        )
        .get(returned.id),
    ).toEqual(auditsBeforeResubmit);
    const correction = value.repository.createCorrectionDraft(value.worker, {
      recordType: 'time_entry',
      originalId: returned.id,
      requestId: 'returned-time-correction',
      reason: 'Correct returned time without overwriting review history',
      patch: { activitySummary: 'Corrected returned-time detail' },
    });
    expect(correction).not.toHaveProperty('replayed');
    expect(
      value.sqlite
        .prepare('SELECT approval_state,activity_summary FROM time_entry WHERE id=?')
        .get(correction.correctionId),
    ).toEqual({ approval_state: 'draft', activity_summary: 'Corrected returned-time detail' });
    expect(
      value.sqlite
        .prepare(
          'SELECT original_id,correction_id,reason FROM record_correction_link WHERE correction_id=?',
        )
        .get(correction.correctionId),
    ).toEqual({
      original_id: returned.id,
      correction_id: correction.correctionId,
      reason: 'Correct returned time without overwriting review history',
    });
    expect(
      (value.repository.listTimeForScope(value.worker) as Array<Record<string, unknown>>).find(
        (row) => row.id === correction.correctionId,
      ),
    ).toEqual(expect.objectContaining({ correction_linked: 1 }));
    expect(() =>
      value.repository.submitTime(value.worker, returned.id, returnedVersion.version),
    ).toThrow(/cannot be submitted/i);
    expect(() =>
      value.repository.updateTimeEntry(value.worker, {
        id: returned.id,
        version: returnedVersion.version,
        summary: 'Overwrite linked review source',
      }),
    ).toThrow(/draft|correction/i);
    expect(() =>
      value.repository.deleteTime(value.worker, returned.id, returnedVersion.version),
    ).toThrow(/correction|reviewed/i);
    expect(() => value.repository.deleteTime(value.worker, correction.correctionId, 1)).toThrow(
      /correction drafts.*immutable/i,
    );
    expect(() =>
      value.repository.deleteDraft(value.worker, {
        recordType: 'time_entry',
        recordId: correction.correctionId,
        version: 1,
      }),
    ).toThrow(/correction drafts.*immutable/i);
    expect(
      value.sqlite
        .prepare('SELECT approval_state,activity_summary,version FROM time_entry WHERE id=?')
        .get(correction.correctionId),
    ).toEqual({
      approval_state: 'draft',
      activity_summary: 'Corrected returned-time detail',
      version: 1,
    });
    expect(
      value.sqlite
        .prepare(
          'SELECT original_id,correction_id FROM record_correction_link WHERE correction_id=?',
        )
        .get(correction.correctionId),
    ).toEqual({ original_id: returned.id, correction_id: correction.correctionId });
    expect(
      value.repository.createCorrectionDraft(value.worker, {
        recordType: 'time_entry',
        originalId: returned.id,
        requestId: 'returned-time-correction',
        reason: 'Correct returned time without overwriting review history',
        patch: { activitySummary: 'Corrected returned-time detail' },
      }),
    ).toEqual(expect.objectContaining({ correctionId: correction.correctionId, replayed: true }));
    expect(
      value.sqlite
        .prepare('SELECT approval_state,activity_summary,version FROM time_entry WHERE id=?')
        .get(returned.id),
    ).toEqual({
      approval_state: 'needs_changes',
      activity_summary: 'Needs-changes deletion fixture',
      version: returnedVersion.version,
    });

    const approved = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-21',
      category: 'regular',
      minutes: 60,
      summary: 'Approved correction fixture',
    });
    value.repository.submitTime(value.worker, approved.id, approved.version);
    value.repository.operationalApproveTime(value.manager, approved.id, 'approved');
    const approvedVersion = value.sqlite
      .prepare('SELECT version FROM time_entry WHERE id=?')
      .get(approved.id) as { version: number };
    expect(() =>
      value.repository.deleteTime(value.worker, approved.id, approvedVersion.version),
    ).toThrow(/correction|reviewed/i);
    expect(
      value.sqlite.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(approved.id),
    ).toEqual({ approval_state: 'approved' });
  });

  it('excludes legacy voided time from worker compensation statements', () => {
    const value = fixture();
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'voided-pay');
    value.v3.createCompensationRule(finance, {
      workerId: value.worker.userId,
      projectId: value.project.id,
      currency: 'EUR',
      rateMinor: 6_000n,
      rateBasis: 'hourly',
      ruleType: 'Hourly',
      effectiveFrom: '2026-01-01',
    });
    const created = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-21',
      category: 'regular',
      minutes: 120,
      summary: 'Voided history fixture',
    }) as { id: string; version: number };
    value.repository.submitTime(value.worker, created.id, created.version);
    value.repository.operationalApproveTime(value.manager, created.id, 'approved');
    // Void remains a historical terminal state for imported/previously
    // corrected records. New reviewed records cannot enter it through the
    // worker's generic delete command (covered above).
    value.sqlite.prepare("UPDATE time_entry SET approval_state='void' WHERE id=?").run(created.id);

    const pay = value.v3.workerPay(value.worker, '2026-08-01', '2026-08-31');
    expect(pay.approvedMinutes, 'voided minutes must not be treated as approved pay').toBe(0);
    expect(pay.pendingMinutes, 'voided minutes must not be treated as pending pay').toBe(0);
  });

  it('counts an approved time correction once while retaining the superseded source in history', () => {
    const value = fixture();
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'corrected-time-pay');
    value.v3.createCompensationRule(finance, {
      workerId: value.worker.userId,
      projectId: value.project.id,
      currency: 'EUR',
      rateMinor: 6_000n,
      rateBasis: 'hourly',
      ruleType: 'Hourly',
      effectiveFrom: '2026-01-01',
    });
    const original = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-21',
      category: 'regular',
      minutes: 120,
      summary: 'Original time later corrected',
    });
    value.repository.submitTime(value.worker, original.id, original.version);
    value.repository.operationalApproveTime(value.manager, original.id, 'approved');
    const correction = value.repository.createCorrectionDraft(value.worker, {
      recordType: 'time_entry',
      originalId: original.id,
      requestId: 'time-economic-source-correction',
      reason: 'Actual duration was over-recorded',
      patch: { minutes: 90 },
    });
    expect(() => value.repository.financeApproveTime(finance, original.id, true)).toThrow(
      /approved unlocked time required/i,
    );
    expect(
      value.repository.createCorrectionDraft(value.worker, {
        recordType: 'time_entry',
        originalId: original.id,
        requestId: 'time-economic-source-correction',
        reason: 'Actual duration was over-recorded',
        patch: { minutes: 90 },
      }),
    ).toMatchObject({ correctionId: correction.correctionId, replayed: true });
    expect(() =>
      value.repository.createCorrectionDraft(value.worker, {
        recordType: 'time_entry',
        originalId: original.id,
        requestId: 'duplicate-time-economic-source-correction',
        reason: 'A second correction must not fork current truth',
      }),
    ).toThrow(/correction draft already exists/i);
    expect(
      value.repository.listApprovalQueue(finance).filter((row) => row.id === original.id),
      'a superseded original must not remain in the finance approval queue',
    ).toEqual([]);
    value.repository.submitTime(value.worker, correction.correctionId, 1);
    value.repository.operationalApproveTime(value.manager, correction.correctionId, 'approved');

    expect(
      value.repository
        .listTimeForScope(value.worker)
        .filter((row) => [original.id, correction.correctionId].includes(String(row.id))),
      'append-only history must retain both original and correction rows',
    ).toHaveLength(2);
    const pay = value.v3.workerPay(value.worker, '2026-08-01', '2026-08-31');
    expect(pay.approvedMinutes, 'only the correction is a current economic source').toBe(90);
    expect(pay.pendingMinutes).toBe(0);
    const overview = value.repository.projectOverview(value.owner, value.project.id);
    expect(overview.actualMinutes, 'project actuals must not retain the superseded minutes').toBe(
      90,
    );
    expect(overview.time).toEqual([{ category: 'regular', minutes: 90 }]);
  });

  it('resets commercial and reimbursement derivations on an expense correction before reclassification', () => {
    const value = fixture();
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'corrected-expense-finance');
    const legalEntity = value.repository.createLegalEntity(value.owner, {
      code: 'CORR-EXPENSE',
      legalName: 'Correction Expense Fixture S.L.',
      currency: 'EUR',
      billingAddress: 'Synthetic correction fixture address',
      companyIdentifiers: 'SYNTHETIC-CORRECTION-ENTITY',
    });
    const canonical = value.v3.createCanonicalLegalEntityRevision(finance, {
      legacyLegalEntityId: legalEntity.id,
      effectiveFrom: '2026-01-01',
      legalName: 'Correction Expense Fixture S.L.',
      taxIdentifier: 'ES-CORRECTION-EXPENSE',
      addressLine1: 'Synthetic correction fixture address',
      locality: 'Madrid',
      postalCode: '28001',
      countryCode: 'ES',
      baseCurrency: 'EUR',
      timezone: 'UTC',
      reason: 'Bind synthetic correction fixture to legal-entity authority',
      idempotencyKey: 'corrected-expense:canonical',
    });
    value.v3.assignCanonicalLegalEntityToProject(finance, {
      projectId: value.project.id,
      legalEntityRevisionId: canonical.revisionId,
      effectiveFrom: '2026-01-01',
      reason: 'Bind correction project to canonical authority',
      idempotencyKey: 'corrected-expense:assignment',
    });
    const original = value.repository.createExpense(value.worker, {
      projectId: value.project.id,
      spentOn: '2026-08-21',
      vendor: 'Original hotel',
      category: 'hotel',
      description: 'Original expense later corrected',
      currency: 'EUR',
      amountMinor: 10_000n,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    const classified = value.repository.classifyExpenseCommercially(finance, {
      expenseId: original.id,
      expectedVersion: original.version,
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_at_cost',
      markupBps: 0,
      taxBps: 0,
      reason: 'Original commercial classification',
      idempotencyKey: 'corrected-expense-original-classification',
    });
    value.repository.submitExpense(value.worker, original.id, classified.version);
    value.repository.operationalApproveExpense(value.manager, original.id, 'approved');
    value.repository.financeApproveExpense(finance, original.id);
    const correction = value.repository.createCorrectionDraft(value.worker, {
      recordType: 'expense',
      originalId: original.id,
      requestId: 'expense-economic-source-correction',
      reason: 'Receipt total was corrected from 100 to 125',
      patch: { amountMinor: 12_500 },
    });
    expect(() =>
      value.repository.classifyExpenseCommercially(finance, {
        expenseId: original.id,
        expectedVersion: 4,
        clientTreatment: 'reimbursable',
        billingTreatment: 'reimbursable_at_cost',
        markupBps: 0,
        taxBps: 0,
        reason: 'Superseded source must not be reclassified',
        idempotencyKey: 'superseded-expense-reclassification',
      }),
    ).toThrow(/superseded expense/i);
    expect(() => value.repository.financeApproveExpense(finance, original.id)).toThrow(
      /approved, classified, unlocked expense required/i,
    );
    expect(() =>
      value.repository.setExpensePlanningDates(finance, {
        expenseId: original.id,
        expectedReimbursementOn: '2026-09-01',
        expectedRecoveryOn: '2026-09-15',
        expectedVersion: 4,
      }),
    ).toThrow(/superseded expense/i);
    expect(() =>
      value.v3.recordReimbursement(finance, {
        expenseId: original.id,
        reference: 'SYNTHETIC-SUPERSEDED-REIMBURSEMENT',
      }),
    ).toThrow(/approved worker-paid expense required/i);
    expect(
      value.sqlite
        .prepare(
          'SELECT amount_minor,commercial_classification_state,billing_treatment,billing_amount_minor,project_currency_amount_minor,tax_amount_minor,finance_approved_at,reimbursement_state,reimbursement_amount_minor,reimbursed_at,reimbursement_reference FROM expense WHERE id=?',
        )
        .get(correction.correctionId),
    ).toEqual({
      amount_minor: 12500,
      commercial_classification_state: 'unclassified',
      billing_treatment: 'internal_non_billable',
      billing_amount_minor: null,
      project_currency_amount_minor: null,
      tax_amount_minor: null,
      finance_approved_at: null,
      reimbursement_state: 'pending',
      reimbursement_amount_minor: null,
      reimbursed_at: null,
      reimbursement_reference: null,
    });
    expect(
      value.sqlite
        .prepare(
          'SELECT amount_minor,billing_amount_minor,commercial_classification_state FROM expense WHERE id=?',
        )
        .get(original.id),
      'the superseded record remains immutable history',
    ).toEqual({
      amount_minor: 10000,
      billing_amount_minor: 10000,
      commercial_classification_state: 'classified',
    });
    value.repository.submitExpense(value.worker, correction.correctionId, 1);
    value.repository.operationalApproveExpense(value.manager, correction.correctionId, 'approved');
    expect(() => value.repository.financeApproveExpense(finance, correction.correctionId)).toThrow(
      /classified|classification/i,
    );
    const reclassified = value.repository.classifyExpenseCommercially(finance, {
      expenseId: correction.correctionId,
      expectedVersion: 3,
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_at_cost',
      markupBps: 0,
      taxBps: 0,
      reason: 'Correction commercial classification at 125',
      idempotencyKey: 'corrected-expense-correction-classification',
    });
    value.repository.financeApproveExpense(finance, reclassified.id);
    const pay = value.v3.workerPay(value.worker, '2026-08-01', '2026-08-31');
    expect(pay.approvedReimbursementMinor).toBe('12500');
    const pack = value.v3.createAccountingPack(finance, '2026-08-01', '2026-08-31');
    const sourceItems = (pack.snapshot as { sourceItems: Array<{ sourceId: string }> }).sourceItems;
    expect(sourceItems).toEqual(
      expect.arrayContaining([expect.objectContaining({ sourceId: correction.correctionId })]),
    );
    expect(sourceItems).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ sourceId: original.id })]),
    );
  });

  it('does not multiply worker pay under overlapping eligible project assignments', () => {
    const value = fixture();
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'overlapping-pay-assignments');
    value.v3.createCompensationRule(finance, {
      workerId: value.worker.userId,
      projectId: value.project.id,
      currency: 'EUR',
      rateMinor: 6_000n,
      rateBasis: 'hourly',
      ruleType: 'Hourly',
      effectiveFrom: '2026-01-01',
    });
    value.sqlite
      .prepare(
        'INSERT INTO project_member(id,project_id,user_id,assignment_role,status,can_review,starts_on,ends_on,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        'overlapping-worker-assignment',
        value.project.id,
        value.worker.userId,
        'worker',
        'active',
        0,
        '2025-12-01',
        null,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    const entry = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-21',
      category: 'regular',
      minutes: 60,
      summary: 'One source under overlapping assignments',
    });
    value.repository.submitTime(value.worker, entry.id, entry.version);
    value.repository.operationalApproveTime(value.manager, entry.id, 'approved');
    expect(value.v3.workerPay(value.worker, '2026-08-01', '2026-08-31').approvedMinutes).toBe(60);
  });

  it('rejects an approval after a separate connection changed the submitted expense', () => {
    const value = fixture();
    const expense = value.repository.createExpense(value.worker, {
      projectId: value.project.id,
      spentOn: '2026-08-21',
      vendor: 'Race hotel',
      category: 'hotel',
      description: 'Two-connection approval race',
      currency: 'EUR',
      amountMinor: 100n,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    value.repository.submitExpense(value.worker, expense.id, expense.version);
    const second = createDatabase(join(value.directory, 'app.db'));
    try {
      second.sqlite
        .prepare(
          "UPDATE expense SET approval_state='needs_changes',version=version+1 WHERE id=? AND approval_state='submitted'",
        )
        .run(expense.id);
    } finally {
      second.sqlite.close();
    }
    const auditsBefore = value.sqlite
      .prepare(
        "SELECT count(*) count FROM approval_event WHERE entity_type='expense' AND entity_id=?",
      )
      .get(expense.id) as { count: number };
    expect(() =>
      value.repository.operationalApproveExpense(value.manager, expense.id, 'approved'),
    ).toThrow(/not submitted|changed/i);
    expect(
      value.sqlite.prepare('SELECT approval_state FROM expense WHERE id=?').get(expense.id),
    ).toEqual({ approval_state: 'needs_changes' });
    expect(
      value.sqlite
        .prepare(
          "SELECT count(*) count FROM approval_event WHERE entity_type='expense' AND entity_id=?",
        )
        .get(expense.id),
    ).toEqual(auditsBefore);
  });

  it('blocks correction for settled time and reimbursed expense final truth', () => {
    const value = fixture();
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'final-correction-block');
    value.v3.createCompensationRule(finance, {
      workerId: value.worker.userId,
      projectId: value.project.id,
      currency: 'EUR',
      rateMinor: 6000n,
      rateBasis: 'hourly',
      ruleType: 'Hourly',
      effectiveFrom: '2026-01-01',
    });
    const time = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-21',
      category: 'regular',
      minutes: 60,
      summary: 'Settled source',
    });
    value.repository.submitTime(value.worker, time.id, time.version);
    value.repository.operationalApproveTime(value.manager, time.id, 'approved');
    value.v3.settleCompensation(finance, {
      workerId: value.worker.userId,
      projectId: value.project.id,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
    });
    expect(() =>
      value.repository.createCorrectionDraft(value.worker, {
        recordType: 'time_entry',
        originalId: time.id,
        requestId: 'settled-time',
        reason: 'Must use adjustment',
      }),
    ).toThrow(/settled.*adjustment/i);
    const expense = value.repository.createExpense(value.worker, {
      projectId: value.project.id,
      spentOn: '2026-08-21',
      vendor: 'Reimbursed fixture',
      category: 'hotel',
      description: 'Final reimbursement source',
      currency: 'EUR',
      amountMinor: 100n,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    value.repository.submitExpense(value.worker, expense.id, expense.version);
    value.repository.operationalApproveExpense(value.manager, expense.id, 'approved');
    value.sqlite
      .prepare("UPDATE expense SET reimbursement_state='reimbursed',reimbursed_at=? WHERE id=?")
      .run(new Date().toISOString(), expense.id);
    expect(() =>
      value.repository.createCorrectionDraft(value.worker, {
        recordType: 'expense',
        originalId: expense.id,
        requestId: 'reimbursed-expense',
        reason: 'Must use adjustment',
      }),
    ).toThrow(/reimbursed.*adjustment/i);
  });

  it('does not allow an owner to demote the last owner account through worker profile editing', () => {
    const value = fixture();
    const owner = stepUpB5Principal(value.sqlite, value.owner, 'last-owner-demotion');
    expect(() =>
      value.repository.updateWorkerProfile(owner, value.owner.userId, {
        name: 'B5 Owner',
        email: 'b5-owner@example.test',
        role: 'worker',
        joinedAt: '2026-01-01',
      }),
    ).toThrow(/owner|role|administration/i);
    expect(
      value.sqlite.prepare('SELECT role FROM user WHERE id=?').get(value.owner.userId),
      'the final owner role must remain intact when a self-demotion is attempted',
    ).toEqual({ role: 'owner_admin' });
  });

  it('revokes every target session when a privileged team member is demoted', () => {
    const value = fixture();
    const owner = stepUpB5Principal(value.sqlite, value.owner, 'role-demotion-owner');
    stepUpB5Principal(value.sqlite, value.finance, 'role-demotion-target');

    expect(
      value.sqlite
        .prepare('SELECT count(*) count FROM session WHERE user_id=?')
        .get(value.finance.userId),
    ).toEqual({ count: 1 });

    value.repository.updateWorkerProfile(owner, value.finance.userId, {
      name: 'Former Finance User',
      email: 'former-finance@example.test',
      role: 'worker',
      joinedAt: '2026-01-01',
    });

    expect(
      value.sqlite.prepare('SELECT role FROM user WHERE id=?').get(value.finance.userId),
    ).toEqual({ role: 'worker' });
    expect(
      value.sqlite
        .prepare('SELECT count(*) count FROM session WHERE user_id=?')
        .get(value.finance.userId),
      'role changes must invalidate every principal carrying the former role',
    ).toEqual({ count: 0 });
  });

  it('requires a durable stale-upload cleanup path and reservation-scoped keys', () => {
    const value = fixture();
    const first = value.v3.reserveUpload(value.owner, {
      projectId: value.project.id,
      originalFilename: 'handover.pdf',
      artifactType: 'report',
    });
    let second: ReturnType<typeof value.v3.reserveUpload> | undefined;
    expect(() => {
      second = value.v3.reserveUpload(value.owner, {
        projectId: value.project.id,
        originalFilename: 'handover.pdf',
        artifactType: 'report',
      });
    }, 'reservation metadata must not collide on the temporary pending hash').not.toThrow();
    expect(second).toBeDefined();
    if (!second) return;
    expect(first.reservationId).not.toBe(second.reservationId);
    expect(first.storageKey).not.toBe(second.storageKey);
    expect(
      value.sqlite.prepare("SELECT count(*) count FROM document WHERE state='temporary'").get(),
    ).toEqual({ count: 2 });

    const repository = readSource('packages/database/src/v3-repository.ts');
    expect(
      repository,
      'temporary reservations need a cleanup operation with an age boundary',
    ).toMatch(/(?:cleanup|purge|expire)[A-Za-z]*(?:Upload|Reservation|Temporary)/i);
  });
});
