import { afterEach, describe, expect, it } from 'vitest';
import {
  DigitalWorkersRepository,
  DigitalWorkAccessDeniedError,
  DigitalWorkConflictError,
} from '../../packages/database/src/domains/digital-workers/index.ts';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  stepUpB5Principal,
  seedB5User,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';

const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture));
function setup() {
  const base = createB5LifecycleSecurityFixture();
  fixtures.push(base);
  const finance = stepUpB5Principal(base.sqlite, base.finance, 'digital-work');
  const owner = stepUpB5Principal(base.sqlite, base.owner, 'digital-work');
  const manager = stepUpB5Principal(base.sqlite, base.manager, 'digital-work');
  const worker = stepUpB5Principal(base.sqlite, base.worker, 'digital-work');
  base.v3.createClientLaborRate(finance, {
    projectId: base.project.id,
    workerId: worker.userId,
    currency: 'EUR',
    hourlyRateMinor: 6001n,
    overtimeMethod: 'NONE',
    effectiveFrom: '2026-08-01',
  });
  base.v3.createInternalCostRule(finance, {
    workerId: worker.userId,
    projectId: base.project.id,
    currency: 'EUR',
    hourlyRateMinor: 1500n,
    overtimeMethod: 'NONE',
    effectiveFrom: '2026-08-01',
  });
  base.v3.createCompensationRule(finance, {
    workerId: worker.userId,
    projectId: base.project.id,
    currency: 'EUR',
    ruleType: 'Hourly',
    rateMinor: 2000n,
    overtimeMethod: 'NONE',
    travelMethod: 'BASE',
    effectiveFrom: '2026-08-01',
  });
  const entity = base.repository.createLegalEntity(owner, {
    code: 'DWORK',
    legalName: 'Digital work issuer',
    currency: 'EUR',
    billingAddress: 'Test address',
    companyIdentifiers: 'DWORK',
  });
  const rule = base.repository.createBillingRule(finance, {
    projectId: base.project.id,
    legalEntityId: entity.id,
    streamType: 'labor',
    cadenceType: 'custom',
    currency: 'EUR',
    effectiveFrom: '2026-08-01',
  });
  const digital = new DigitalWorkersRepository(base.sqlite);
  const scope = {
    projectId: base.project.id,
    billingRuleId: rule.id,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
  };
  const time = (day: string) => {
    const row = base.repository.createTimeEntry(worker, {
      projectId: base.project.id,
      workDate: day,
      category: 'regular',
      minutes: 60,
      summary: `Work ${day}`,
    });
    base.repository.submitTime(worker, row.id, row.version);
    base.repository.operationalApproveTime(manager, row.id, 'approved');
    base.repository.financeApproveTime(finance, row.id, true);
    const version = Number(
      base.sqlite.prepare('SELECT version FROM time_entry WHERE id=?').get(row.id)!.version,
    );
    return { type: 'time' as const, id: row.id, version };
  };
  return { ...base, finance, owner, manager, worker, digital, scope, time };
}

describe('digital work coordination', () => {
  it('binds review to all-source truth, creates only a selected draft, and retries without duplicate writes', () => {
    const f = setup();
    const selected = f.time('2026-08-20');
    const other = f.time('2026-08-21');
    const input = {
      ...f.scope,
      scopeKind: 'selected_sources' as const,
      selectedSources: [selected],
      requestKey: 'case-open-001',
    };
    const opened = f.digital.openCase(f.finance, input);
    expect(opened.manifest.sources.map((s) => s.id)).toContain(other.id);
    expect(opened.manifest.remainder.map((s) => s.id)).toContain(other.id);
    expect(f.digital.openCase(f.finance, input).id).toBe(opened.id);
    expect(f.sqlite.prepare('SELECT count(*) n FROM digital_work_case').get()!.n).toBe(1);
    const reviewed = f.digital.recordCaseReview(f.finance, {
      caseId: opened.id,
      expectedVersion: 1,
      manifestSha256: opened.manifestSha256,
      reason: 'Checked dated source inventory',
      requestKey: 'case-review-001',
    });
    expect(reviewed.reviewCurrent).toBe(true);
    const prepared = f.digital.prepareInvoiceDraft(f.finance, {
      caseId: opened.id,
      expectedVersion: 1,
      requestKey: '  case-draft-001  ',
    });
    expect(prepared.draftInvoiceId).toBeTruthy();
    expect(prepared.phase).toBe('invoice_prepared');
    expect(prepared.invoiceState).toBe('draft');
    expect(prepared.manifestSha256).toBe(reviewed.manifestSha256);
    expect(() =>
      f.digital.prepareInvoiceDraft(f.finance, {
        caseId: opened.id,
        expectedVersion: 1,
        requestKey: 'case-draft-again',
      }),
    ).toThrow(/handed over/);
    expect(() =>
      f.digital.reconcileCase(f.finance, {
        caseId: opened.id,
        expectedVersion: 1,
        requestKey: 'case-reconcile-prepared',
      }),
    ).toThrow(/handed over/);

    expect(
      f.digital.prepareInvoiceDraft(f.finance, {
        caseId: opened.id,
        expectedVersion: 1,
        requestKey: 'case-draft-001',
      }).draftInvoiceId,
    ).toBe(prepared.draftInvoiceId);
    expect(
      f.sqlite.prepare('SELECT state FROM invoice WHERE id=?').get(prepared.draftInvoiceId!)!.state,
    ).toBe('draft');
    expect(
      f.sqlite
        .prepare("SELECT count(*) n FROM invoice_source WHERE invoice_id=? AND source_type='time'")
        .get(prepared.draftInvoiceId!)!.n,
    ).toBe(1);
    expect(
      f.sqlite.prepare('SELECT invoice_id FROM time_entry WHERE id=?').get(other.id)!.invoice_id,
    ).toBeNull();
    expect(
      f.sqlite
        .prepare('SELECT count(*) n FROM digital_work_case_event WHERE case_id=?')
        .get(opened.id)!.n,
    ).toBe(3);
  });
  it('invalidates a reviewed case when excluded source changes even with unchanged totals, and preserves prior review diff', () => {
    const f = setup();
    const selected = f.time('2026-08-20');
    const excluded = f.time('2026-08-21');
    const opened = f.digital.openCase(f.finance, {
      ...f.scope,
      scopeKind: 'selected_sources',
      selectedSources: [selected],
      requestKey: 'case-open-002',
    });
    f.digital.recordCaseReview(f.finance, {
      caseId: opened.id,
      expectedVersion: 1,
      manifestSha256: opened.manifestSha256,
      reason: 'Checked all sources',
      requestKey: 'case-review-002',
    });
    f.sqlite
      .prepare('UPDATE time_entry SET activity_summary=?,version=version+1 WHERE id=?')
      .run('Revised evidence wording', excluded.id);
    const stale = f.digital.caseDetail(f.finance, opened.id);
    expect(stale.reviewCurrent).toBe(false);
    expect(stale.snapshotChanges.changedSources).toContain(`time:${excluded.id}`);
    expect(() =>
      f.digital.prepareInvoiceDraft(f.finance, {
        caseId: opened.id,
        expectedVersion: 1,
        requestKey: 'case-draft-002',
      }),
    ).toThrow(DigitalWorkConflictError);
    const reconciled = f.digital.reconcileCase(f.finance, {
      caseId: opened.id,
      expectedVersion: 1,
      requestKey: 'case-reconcile-002',
    });
    expect(reconciled.version).toBe(2);
    expect(reconciled.snapshotChanges.changedSources).toContain(`time:${excluded.id}`);
    expect(
      f.sqlite
        .prepare('SELECT count(*) n FROM digital_work_case_revision WHERE case_id=?')
        .get(opened.id)!.n,
    ).toBe(2);
  });
  it('limits case finance data, keeps supplier/worker access narrow, and records work item decisions without billing changes', () => {
    const f = setup();
    const item = f.digital.saveWorkItem(f.manager, {
      projectId: f.project.id,
      kind: 'handover',
      title: 'Verify commissioning handover',
      ownerId: f.worker.userId,
      dueOn: '2026-08-31',
      requestKey: 'work-save-001',
    });
    expect(item.status).toBe('open');
    expect(f.digital.listWorkspace(f.worker).cases).toEqual([]);
    expect(f.digital.listWorkspace(f.worker).workItems.map((i) => i.id)).toEqual([item.id]);
    expect(f.digital.listWorkspace(f.manager).cases).toEqual([]);
    expect(() => f.digital.caseDetail(f.manager, 'unknown')).toThrow(DigitalWorkAccessDeniedError);
    expect(() =>
      f.digital.updateWorkItem(f.worker, {
        id: item.id,
        expectedVersion: 1,
        status: 'accepted',
        reason: 'I accept',
        requestKey: 'work-update-nope',
      }),
    ).toThrow(DigitalWorkAccessDeniedError);
    const progressed = f.digital.updateWorkItem(f.worker, {
      id: item.id,
      expectedVersion: 1,
      status: 'ready_for_review',
      evidenceRefs: [{ type: 'external', id: 'customer-email-1', note: 'Customer says complete' }],
      reason: 'Evidence requested',
      requestKey: 'work-update-001',
    });
    expect(progressed.evidenceRefs[0]?.state).toBe('claimed');
    expect(() =>
      f.digital.updateWorkItem(f.manager, {
        id: item.id,
        expectedVersion: 2,
        status: 'accepted',
        reason: 'Accept',
        requestKey: 'work-update-002',
      }),
    ).toThrow(DigitalWorkConflictError);
    const waived = f.digital.updateWorkItem(f.manager, {
      id: item.id,
      expectedVersion: 2,
      status: 'waived',
      reason: 'Documented customer exception',
      requestKey: 'work-update-003',
    });
    expect(waived.status).toBe('waived');
    expect(
      f.sqlite
        .prepare('SELECT count(*) n FROM digital_work_item_event WHERE work_item_id=?')
        .get(item.id)!.n,
    ).toBe(3);
    expect(f.sqlite.prepare('SELECT count(*) n FROM invoice').get()!.n).toBe(0);
  });
  it('excludes canonical nonbillable history in whole-period scope while showing its disposition', () => {
    const f = setup();
    const billable = f.time('2026-08-20');
    const nonbillable = f.repository.createTimeEntry(f.worker, {
      projectId: f.project.id,
      workDate: '2026-08-21',
      category: 'regular',
      minutes: 60,
      summary: 'Internal rework',
    });
    f.repository.submitTime(f.worker, nonbillable.id, nonbillable.version);
    f.repository.operationalApproveTime(f.manager, nonbillable.id, 'approved');
    f.repository.financeApproveTime(f.finance, nonbillable.id, false);
    const view = f.digital.openCase(f.finance, {
      ...f.scope,
      scopeKind: 'whole_period',
      requestKey: 'case-whole-exclusions',
    });
    expect(view.manifest.sources.map((s) => s.id)).toContain(nonbillable.id);
    expect(view.manifest.dispositions.find((d) => d.id === nonbillable.id)?.disposition).toBe(
      'excluded',
    );
    expect(view.manifest.selectedSources.map((s) => s.id)).toEqual([billable.id]);
  });
  it('requires current project ownership and reviewer grants, and keeps terminal decisions immutable', () => {
    const f = setup();
    expect(() =>
      f.digital.saveWorkItem(f.manager, {
        projectId: f.project.id,
        kind: 'handover',
        title: 'Wrong assignee',
        ownerId: f.outsider.userId,
        requestKey: 'work-outsider-owner',
      }),
    ).toThrow();
    const item = f.digital.saveWorkItem(f.manager, {
      projectId: f.project.id,
      kind: 'evidence',
      title: 'Collect dated proof',
      ownerId: f.worker.userId,
      requestKey: 'work-owner-valid',
    });
    f.sqlite
      .prepare('UPDATE project_member SET can_review=0 WHERE project_id=? AND user_id=?')
      .run(f.project.id, f.manager.userId);
    expect(() =>
      f.digital.updateWorkItem(f.manager, {
        id: item.id,
        expectedVersion: 1,
        status: 'cancelled',
        reason: 'No grant',
        requestKey: 'work-no-review',
      }),
    ).toThrow(DigitalWorkAccessDeniedError);
    f.sqlite
      .prepare('UPDATE project_member SET can_review=1 WHERE project_id=? AND user_id=?')
      .run(f.project.id, f.manager.userId);
    const ended = f.digital.updateWorkItem(f.manager, {
      id: item.id,
      expectedVersion: 1,
      status: 'cancelled',
      reason: 'No longer needed',
      requestKey: 'work-cancel-valid',
    });
    expect(ended.status).toBe('cancelled');
    expect(() =>
      f.digital.updateWorkItem(f.manager, {
        id: item.id,
        expectedVersion: 2,
        title: 'Retitle reviewed',
        reason: 'Too late',
        requestKey: 'work-terminal-edit',
      }),
    ).toThrow(DigitalWorkConflictError);
    f.sqlite
      .prepare("UPDATE project_member SET status='inactive' WHERE project_id=? AND user_id=?")
      .run(f.project.id, f.worker.userId);
    expect(f.digital.listWorkspace(f.worker).workItems).toEqual([]);
  });
  it('requires typed policy proposals and does not allow auditor writes', () => {
    const f = setup();
    seedB5User(f.sqlite, 'b5-auditor-digital', 'auditor_read_only');
    const auditor = stepUpB5Principal(
      f.sqlite,
      { userId: 'b5-auditor-digital', role: 'auditor_read_only', projectIds: new Set() },
      'digital-work',
    );
    expect(() =>
      f.digital.saveWorkItem(auditor, {
        projectId: f.project.id,
        kind: 'evidence',
        title: 'Cannot write',
        ownerId: f.worker.userId,
        requestKey: 'auditor-write-denied',
      }),
    ).toThrow(DigitalWorkAccessDeniedError);
    expect(() =>
      f.digital.saveWorkItem(f.finance, {
        projectId: f.project.id,
        kind: 'policy_review',
        title: 'Review clause',
        ownerId: f.finance.userId,
        policyReference: 'Signed contract clause 4',
        proposedSettings: { fixedPriceMinor: 1.5 },
        requestKey: 'invalid-policy-proposal',
      }),
    ).toThrow();
    expect(() =>
      f.digital.saveWorkItem(f.finance, {
        projectId: f.project.id,
        kind: 'policy_review',
        title: 'Review clause',
        ownerId: f.worker.userId,
        policyReference: 'Signed contract clause 4',
        requestKey: 'policy-ineligible-owner',
      }),
    ).toThrow(/Finance policy reviewer required/);
    const proposal = f.digital.saveWorkItem(f.finance, {
      projectId: f.project.id,
      kind: 'policy_review',
      title: 'Review clause',
      ownerId: f.finance.userId,
      policyReference: 'Signed contract clause 4',
      proposedSettings: { fixedPriceMinor: '150', effectiveFrom: '2026-09-01' },
      requestKey: 'valid-policy-proposal',
    });
    expect(() =>
      f.digital.updateWorkItem(f.finance, {
        id: proposal.id,
        expectedVersion: 1,
        ownerId: f.manager.userId,
        reason: 'Cannot assign finance-only work to an operational role',
        requestKey: 'policy-ineligible-reassignment',
      }),
    ).toThrow(/Finance policy reviewer required/);
    expect(proposal.proposedSettings).toEqual({
      fixedPriceMinor: '150',
      effectiveFrom: '2026-09-01',
    });
    expect(f.digital.listWorkspace(f.manager).workItems).toEqual([]);
    expect(f.digital.listWorkspace(auditor).workItems.map((i) => i.id)).toContain(proposal.id);
  });
  it('binds known evidence versions, marks later changes stale, and denies supplier profiles', () => {
    const f = setup();
    const source = f.time('2026-08-22');
    const item = f.digital.saveWorkItem(f.manager, {
      projectId: f.project.id,
      kind: 'evidence',
      title: 'Review daily source',
      ownerId: f.worker.userId,
      evidenceRefs: [{ type: 'time', id: source.id }],
      requestKey: 'work-evidence-bound',
    });
    expect(item.evidenceRefs[0]).toMatchObject({ version: source.version, state: 'current' });
    f.sqlite.prepare('UPDATE time_entry SET version=version+1 WHERE id=?').run(source.id);
    expect(
      f.digital.listWorkspace(f.manager).workItems.find((i) => i.id === item.id)?.evidenceRefs[0]
        ?.state,
    ).toBe('stale');
    const now = new Date().toISOString();
    f.sqlite
      .prepare('INSERT INTO supplier(id,name,status,created_at,updated_at) VALUES(?,?,?,?,?)')
      .run('digital-supplier', 'Digital supplier', 'active', now, now);
    f.sqlite
      .prepare(
        'INSERT INTO supplier_user_profile(user_id,supplier_id,profile,created_at,updated_at) VALUES(?,?,?,?,?)',
      )
      .run(f.worker.userId, 'digital-supplier', 'external_technician', now, now);
    expect(() => f.digital.listWorkspace(f.worker)).toThrow(DigitalWorkAccessDeniedError);
    expect(() =>
      f.digital.saveWorkItem(f.manager, {
        projectId: f.project.id,
        kind: 'evidence',
        title: 'No supplier owner',
        ownerId: f.worker.userId,
        requestKey: 'work-supplier-owner',
      }),
    ).toThrow();
  });
  it('refreshes only the originally selected eligible records and requires a new review', () => {
    const f = setup(),
      selected = f.time('2026-08-24'),
      remainder = f.time('2026-08-25');
    const opened = f.digital.openCase(f.finance, {
      ...f.scope,
      scopeKind: 'selected_sources',
      selectedSources: [selected],
      requestKey: 'selected-refresh-open',
    });
    f.digital.recordCaseReview(f.finance, {
      caseId: opened.id,
      expectedVersion: 1,
      manifestSha256: opened.manifestSha256,
      reason: 'Original selection checked',
      requestKey: 'selected-refresh-review',
    });
    f.sqlite
      .prepare('UPDATE time_entry SET activity_summary=?,version=version+1 WHERE id=?')
      .run('Clarified factual evidence', selected.id);
    const reconciled = f.digital.reconcileCase(f.finance, {
      caseId: opened.id,
      expectedVersion: 1,
      requestKey: 'selected-refresh-reconcile',
    });
    expect(reconciled.version).toBe(2);
    expect(reconciled.reviewCurrent).toBe(false);
    expect(reconciled.selectedSources).toEqual([{ ...selected, version: selected.version + 1 }]);
    expect(reconciled.manifest.readyForDraft).toBe(true);
    expect(reconciled.manifest.remainder.map((source) => source.id)).toContain(remainder.id);
    expect(() =>
      f.digital.prepareInvoiceDraft(f.finance, {
        caseId: opened.id,
        expectedVersion: 2,
        requestKey: 'selected-refresh-before-review',
      }),
    ).toThrow(/review/);
    f.digital.recordCaseReview(f.finance, {
      caseId: opened.id,
      expectedVersion: 2,
      manifestSha256: reconciled.manifestSha256,
      reason: 'Changed source checked',
      requestKey: 'selected-refresh-review-new',
    });
    const prepared = f.digital.prepareInvoiceDraft(f.finance, {
      caseId: opened.id,
      expectedVersion: 2,
      requestKey: 'selected-refresh-draft',
    });
    expect(
      f.sqlite
        .prepare('SELECT source_id,source_version FROM invoice_source WHERE invoice_id=?')
        .all(prepared.draftInvoiceId!),
    ).toEqual([{ source_id: selected.id, source_version: selected.version + 1 }]);
    expect(
      f.sqlite
        .prepare('SELECT COUNT(*) n FROM digital_work_case_revision WHERE case_id=?')
        .get(opened.id)!.n,
    ).toBe(2);
  });
});
