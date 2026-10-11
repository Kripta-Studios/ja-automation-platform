import { randomUUID } from 'node:crypto';
import { base } from '$app/paths';
import { error, isRedirect, redirect } from '@sveltejs/kit';
import {
  AccessDeniedError,
  DigitalWorkAccessDeniedError,
  DigitalWorkersRepository,
  PeriodFollowupAccessDeniedError,
  PeriodFollowupRepository,
  type ScopeClassification,
  type WorkItemKind,
  type WorkItemStatus,
} from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  accessibleWorkflowProjects,
  workflowOwnersForProjects,
} from '$lib/server/workflow-project-memberships';
import type { Actions, PageServerLoad } from './$types';
import {
  evidenceFromForm,
  formValues,
  parseProposedSettings,
  selectedSourceRefs,
  validDateRange,
  workflowActionFailure,
  workflowInputFailure,
  type EvidenceInput,
} from '$lib/portal/workflow/server';

type SafeProject = { id: string; number: string; name: string };
type QueueRow = {
  id: string;
  projectId: string;
  projectName: string;
  projectNumber: string;
  type: string;
  date: string;
  status: string;
  reviewStage: string;
  title: string;
  workerName: string;
  href: string;
};

function currentDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

function safeProject(row: Record<string, unknown>): SafeProject {
  return {
    id: String(row.id),
    number: String(row.project_number ?? ''),
    name: String(row.name ?? ''),
  };
}

function reviewQueue(context: ReturnType<typeof openPortalRepository>): QueueRow[] {
  const queue = context.repository.listApprovalQueue(context.principal) as Array<
    Record<string, unknown>
  >;
  const rows = queue.filter((row) =>
    ['operational', 'report', 'correction'].includes(String(row.review_stage)),
  );
  const projects = new Map<string, SafeProject>();
  const projectIds = [...new Set(rows.map((row) => String(row.project_id)))];
  if (projectIds.length) {
    const found = context.sqlite
      .prepare(
        `SELECT id,project_number,name FROM project WHERE id IN (${projectIds.map(() => '?').join(',')})`,
      )
      .all(...projectIds) as Array<Record<string, unknown>>;
    for (const project of found) projects.set(String(project.id), safeProject(project));
  }
  const sourceQueries = {
    time: context.sqlite.prepare(
      'SELECT u.name worker_name FROM time_entry t JOIN user u ON u.id=t.worker_id WHERE t.id=? AND t.project_id=? AND t.worker_id=?',
    ),
    expense: context.sqlite.prepare(
      'SELECT u.name worker_name FROM expense e JOIN user u ON u.id=e.worker_id WHERE e.id=? AND e.project_id=? AND e.worker_id=?',
    ),
    daily: context.sqlite.prepare(
      'SELECT u.name worker_name FROM daily_report d JOIN user u ON u.id=d.worker_id WHERE d.id=? AND d.project_id=? AND d.worker_id=?',
    ),
    technical: context.sqlite.prepare(
      'SELECT u.name worker_name FROM technical_report t JOIN user u ON u.id=t.author_id WHERE t.id=? AND t.project_id=? AND t.author_id=?',
    ),
  };
  const result: QueueRow[] = [];
  for (const row of rows) {
    const projectId = String(row.project_id ?? '');
    const project = projects.get(projectId);
    const type = String(row.type ?? '');
    const sourceId = String(row.id ?? '');
    const workerId = String(row.worker_id ?? '');
    if (!project || !sourceId || !workerId || !(type in sourceQueries)) continue;
    const query = sourceQueries[type as keyof typeof sourceQueries];
    const source = query.get(sourceId, projectId, workerId) as
      | { worker_name?: string | null }
      | undefined;
    if (!source) continue;
    const href =
      type === 'time'
        ? `${base}/app/time/${encodeURIComponent(sourceId)}`
        : type === 'expense'
          ? `${base}/app/expenses/${encodeURIComponent(sourceId)}`
          : `${base}/app/reports/${encodeURIComponent(sourceId)}`;
    result.push({
      id: sourceId,
      projectId,
      projectName: project.name,
      projectNumber: project.number,
      type,
      date: String(row.date ?? ''),
      status: String(row.approval_state ?? ''),
      reviewStage: String(row.review_stage ?? ''),
      // PM queue cards link to source records; avoid copying user-entered text
      // that may contain amounts, compensation, or other finance-only context.
      title: type === 'time' ? 'Time entry' : type === 'expense' ? 'Expense' : 'Report',
      workerName: String(source.worker_name ?? ''),
      href,
    });
  }
  return result.sort(
    (left, right) =>
      left.projectNumber.localeCompare(right.projectNumber) ||
      left.projectName.localeCompare(right.projectName) ||
      left.date.localeCompare(right.date) ||
      left.id.localeCompare(right.id),
  );
}

function ownOperationalWork(context: ReturnType<typeof openPortalRepository>, today: string) {
  const timeRows = context.repository.listTimeForScope(context.principal) as Array<
    Record<string, unknown>
  >;
  const times = timeRows
    .filter(
      (row) =>
        String(row.worker_id) === context.principal.userId &&
        ['draft', 'needs_changes'].includes(String(row.approval_state)),
    )
    .map((row) => ({
      id: String(row.id),
      projectId: String(row.project_id),
      projectName: String(row.project_name ?? ''),
      projectNumber: String(row.project_number ?? ''),
      type: 'time',
      title: String(row.activity_summary ?? ''),
      date: String(row.work_date ?? ''),
      status: String(row.approval_state),
      receiptNeeded: false,
      href: `${base}/app/time/${encodeURIComponent(String(row.id))}`,
    }));
  const reportRows = context.repository.listOwnReports(context.principal) as Array<
    Record<string, unknown>
  >;
  const reports = reportRows
    .filter(
      (row) =>
        String(row.worker_id) === context.principal.userId &&
        ['draft', 'needs_changes'].includes(String(row.approval_state)),
    )
    .map((row) => ({
      id: String(row.id),
      projectId: String(row.project_id),
      projectName: String(row.project_name ?? ''),
      projectNumber: String(row.project_number ?? ''),
      type: String(row.type),
      title: String(row.title ?? ''),
      date: String(row.date ?? ''),
      status: String(row.approval_state),
      receiptNeeded: false,
      href: `${base}/app/reports/${encodeURIComponent(String(row.id))}`,
    }));
  const expenseRows = context.repository.listExpensesForScope(context.principal) as Array<
    Record<string, unknown>
  >;
  const expenses = expenseRows
    .filter(
      (row) =>
        String(row.worker_id) === context.principal.userId &&
        (['draft', 'needs_changes'].includes(String(row.approval_state)) ||
          (Number(row.receipt_required) === 1 && !row.receipt_document_id)),
    )
    .map((row) => ({
      id: String(row.id),
      projectId: String(row.project_id),
      projectName: String(row.project_name ?? ''),
      projectNumber: String(row.project_number ?? ''),
      type: 'expense',
      title: String(row.vendor ?? row.category ?? ''),
      date: String(row.spent_on ?? ''),
      status: String(row.approval_state),
      receiptNeeded: Number(row.receipt_required) === 1 && !row.receipt_document_id,
      href: `${base}/app/expenses/${encodeURIComponent(String(row.id))}`,
    }));
  const records = [...times, ...reports, ...expenses]
    .filter((row) => row.date <= today)
    .sort((left, right) => right.date.localeCompare(left.date) || left.id.localeCompare(right.id));
  return records;
}

function assignedProjectNames(
  context: ReturnType<typeof openPortalRepository>,
  projectIds: readonly string[],
): Record<string, { number: string; name: string }> {
  if (!projectIds.length) return {};
  const rows = context.sqlite
    .prepare(
      `SELECT id,project_number,name FROM project WHERE id IN (${projectIds.map(() => '?').join(',')})`,
    )
    .all(...projectIds) as Array<Record<string, unknown>>;
  return Object.fromEntries(
    rows.map((row) => [
      String(row.id),
      { number: String(row.project_number ?? ''), name: String(row.name ?? '') },
    ]),
  );
}

function periodReviewAccess(
  context: ReturnType<typeof openPortalRepository>,
  projectId: string,
  periodStart: string,
  periodEnd: string,
): boolean {
  if (!projectId || !validDateRange(periodStart, periodEnd)) return false;
  try {
    new PeriodFollowupRepository(context.sqlite).reviewProjectPeriod(
      context.principal,
      projectId,
      periodStart,
      periodEnd,
    );
    return true;
  } catch (caught) {
    if (caught instanceof PeriodFollowupAccessDeniedError) return false;
    throw caught;
  }
}

function values(formData: FormData): Record<string, string> {
  return formValues(formData);
}

export const load: PageServerLoad = ({ locals, url }) => {
  if (!locals.user || !locals.session) redirect(303, `${base}/app/login`);
  const context = openPortalRepository(locals);
  try {
    const instant = new Date();
    const today = currentDate(instant);
    const profile = context.sqlite
      .prepare('SELECT profile FROM supplier_user_profile WHERE user_id=?')
      .get(context.principal.userId) as { profile: string } | undefined;
    const restrictedProfile = profile?.profile ?? null;
    const role = context.principal.role;
    if (restrictedProfile && role !== 'worker')
      error(403, 'Supplier profile requires worker access');
    const requestKeys = {
      openCase: randomUUID(),
      saveWorkItem: randomUUID(),
    };

    if (role === 'worker' || restrictedProfile) {
      const ownWork = role === 'worker' ? ownOperationalWork(context, today) : [];
      const supplierCoordinator = restrictedProfile === 'supplier_coordinator';
      const workerWorkspace =
        role === 'worker' && !restrictedProfile
          ? new DigitalWorkersRepository(context.sqlite).listWorkspace(context.principal)
          : { cases: [], workItems: [] };
      const projectNames = assignedProjectNames(context, [
        ...new Set(workerWorkspace.workItems.map((item) => item.projectId)),
      ]);
      const workItems = workerWorkspace.workItems.map((item) => ({
        ...item,
        projectName: projectNames[item.projectId]?.name ?? '',
        projectNumber: projectNames[item.projectId]?.number ?? '',
        requestKey: randomUUID(),
      }));
      return {
        mode: 'worker' as const,
        role,
        restrictedProfile,
        supplierCoordinator,
        ownWork,
        workItems,
        projects: [],
        approvals: [],
        cases: [],
        billingRules: [],
        sourceRegister: null,
        periodReviewAccess: false,
        today,
        requestKeys,
      };
    }

    const digital = new DigitalWorkersRepository(context.sqlite);
    if (role === 'project_manager') {
      const projects = accessibleWorkflowProjects(
        context.sqlite,
        context.principal.userId,
        instant,
      );
      const requestedProject = url.searchParams.get('project') ?? '';
      const selectedProjectId = projects.some((project) => project.id === requestedProject)
        ? requestedProject
        : '';
      const workspace = digital.listWorkspace(
        context.principal,
        selectedProjectId ? { projectId: selectedProjectId } : {},
      );
      const approvals = reviewQueue(context).filter(
        (item) => !selectedProjectId || item.projectId === selectedProjectId,
      );
      const projectNames = assignedProjectNames(context, [
        ...new Set(workspace.workItems.map((item) => item.projectId)),
      ]);
      const workItems = workspace.workItems.map((item) => ({
        ...item,
        projectName: projectNames[item.projectId]?.name ?? '',
        projectNumber: projectNames[item.projectId]?.number ?? '',
        requestKey: randomUUID(),
      }));
      const owners = workflowOwnersForProjects(context.sqlite, projects, instant);
      return {
        mode: 'manager' as const,
        role,
        restrictedProfile: null,
        supplierCoordinator: false,
        ownWork: [],
        workItems,
        projects,
        owners,
        approvals,
        cases: [],
        billingRules: [],
        sourceRegister: null,
        selectedProjectId,
        periodReviewAccess: periodReviewAccess(
          context,
          selectedProjectId,
          `${today.slice(0, 7)}-01`,
          today,
        ),
        today,
        reviewPeriodStart: `${today.slice(0, 7)}-01`,
        reviewPeriodEnd: today,
        requestKeys,
      };
    }

    if (!['owner_admin', 'finance_admin', 'auditor_read_only'].includes(role))
      error(403, 'Digital workspace access required');
    const isAuditor = role === 'auditor_read_only';
    const financeProjects = context.repository.listFinanceProjects(context.principal) as Array<
      Record<string, unknown>
    >;
    const projects = financeProjects.map(safeProject);
    const requestedProject = url.searchParams.get('project') ?? '';
    const selectedProjectId = projects.some((project) => project.id === requestedProject)
      ? requestedProject
      : '';
    const periodStart = url.searchParams.get('from') ?? `${today.slice(0, 7)}-01`;
    const periodEnd = url.searchParams.get('to') ?? today;
    const validPeriod = validDateRange(periodStart, periodEnd);
    const allRules = selectedProjectId
      ? (context.sqlite
          .prepare(
            `SELECT id,project_id,stream_type,cadence_type,effective_from,effective_to
               FROM billing_rule WHERE project_id=? AND enabled=1
                 AND stream_type IN ('labor','expense') ORDER BY stream_type,id`,
          )
          .all(selectedProjectId) as Array<{
          id: string;
          project_id: string;
          stream_type: string;
          cadence_type: string;
          effective_from: string;
          effective_to: string | null;
        }>)
      : [];
    const requestedRule = url.searchParams.get('rule') ?? '';
    const selectedRuleId = allRules.some((rule) => rule.id === requestedRule)
      ? requestedRule
      : (allRules[0]?.id ?? '');
    const workspace = digital.listWorkspace(
      context.principal,
      selectedProjectId ? { projectId: selectedProjectId } : {},
    );
    const projectNames = assignedProjectNames(context, [
      ...new Set([
        ...workspace.cases.map((item) => item.projectId),
        ...workspace.workItems.map((item) => item.projectId),
      ]),
    ]);
    const cases = workspace.cases.map((item) => ({
      ...item,
      projectName: projectNames[item.projectId]?.name ?? '',
      projectNumber: projectNames[item.projectId]?.number ?? '',
    }));
    const workItems = workspace.workItems.map((item) => ({
      ...item,
      projectName: projectNames[item.projectId]?.name ?? '',
      projectNumber: projectNames[item.projectId]?.number ?? '',
      requestKey: randomUUID(),
    }));
    const sourceRegister =
      !isAuditor && selectedProjectId && selectedRuleId && validPeriod
        ? context.repository.invoiceCompositionSources(context.principal, {
            projectId: selectedProjectId,
            billingRuleId: selectedRuleId,
            periodStart,
            periodEnd,
          })
        : null;
    const owners = workflowOwnersForProjects(context.sqlite, projects, instant);
    const ownerIds = new Set(owners.map((owner) => owner.id));
    const financeUsers = context.sqlite
      .prepare(
        "SELECT id,name,role FROM user WHERE status='active' AND role IN ('owner_admin','finance_admin') ORDER BY name,id",
      )
      .all() as Array<{ id: string; name: string | null; role: string }>;
    for (const user of financeUsers) {
      if (ownerIds.has(user.id)) continue;
      owners.push({
        id: user.id,
        name: user.name ?? user.id,
        role: user.role,
        projectIds: projects.map((project) => project.id),
      });
    }
    const reviewAccess = periodReviewAccess(context, selectedProjectId, periodStart, periodEnd);
    return {
      mode: 'finance' as const,
      role,
      isAuditor,
      restrictedProfile: null,
      supplierCoordinator: false,
      ownWork: [],
      workItems,
      projects,
      owners,
      approvals: [],
      cases,
      billingRules: allRules,
      sourceRegister,
      selectedProjectId,
      selectedRuleId,
      periodStart,
      periodEnd,
      validPeriod,
      periodReviewAccess: reviewAccess,
      today,
      requestKeys,
      rulesForCases: allRules,
      reviewPeriodStart: periodStart,
      reviewPeriodEnd: periodEnd,
    };
  } catch (caught) {
    if (caught instanceof DigitalWorkAccessDeniedError || caught instanceof AccessDeniedError)
      error(403, 'Digital workspace access required');
    throw caught;
  } finally {
    context.sqlite.close();
  }
};

export const actions: Actions = {
  openCase: async ({ request, locals }) => {
    if (!locals.user || !locals.session) redirect(303, `${base}/app/login`);
    const formData = await request.formData();
    const saved = values(formData);
    const context = openPortalRepository(locals);
    try {
      if (!['owner_admin', 'finance_admin'].includes(context.principal.role))
        return workflowActionFailure(
          new DigitalWorkAccessDeniedError('Finance case creation required'),
          'openCase',
          saved,
        );
      const scopeKind = formData.get('scopeKind');
      const projectId = String(formData.get('projectId') ?? '').trim();
      const billingRuleId = String(formData.get('billingRuleId') ?? '').trim();
      const periodStart = String(formData.get('periodStart') ?? '').trim();
      const periodEnd = String(formData.get('periodEnd') ?? '').trim();
      if (!projectId || !billingRuleId)
        return workflowInputFailure(400, 'problem.digitalWorkers.required', 'openCase', saved, {
          projectId: ['problem.digitalWorkers.required'],
          billingRuleId: ['problem.digitalWorkers.required'],
        });
      if (!validDateRange(periodStart, periodEnd))
        return workflowInputFailure(
          400,
          'problem.digitalWorkers.invalidDateRange',
          'openCase',
          saved,
        );
      if (scopeKind !== 'whole_period' && scopeKind !== 'selected_sources')
        return workflowInputFailure(
          400,
          'problem.digitalWorkers.invalidSelection',
          'openCase',
          saved,
        );
      let selectedSources;
      try {
        selectedSources = selectedSourceRefs(formData);
      } catch {
        return workflowInputFailure(
          400,
          'problem.digitalWorkers.invalidSelection',
          'openCase',
          saved,
        );
      }
      if (scopeKind === 'selected_sources' && selectedSources.length === 0)
        return workflowInputFailure(
          400,
          'problem.digitalWorkers.invalidSelection',
          'openCase',
          saved,
        );
      const caseView = new DigitalWorkersRepository(context.sqlite).openCase(context.principal, {
        projectId,
        billingRuleId,
        periodStart,
        periodEnd,
        scopeKind,
        ...(scopeKind === 'selected_sources' ? { selectedSources } : {}),
        requestKey: String(formData.get('requestKey') ?? ''),
      });
      const locale = String(formData.get('lang') ?? 'en');
      const query = new URLSearchParams();
      if (locale === 'en' || locale === 'es' || locale === 'pt') query.set('lang', locale);
      redirect(
        303,
        `${base}/app/workflow/cases/${encodeURIComponent(caseView.id)}${query.size ? `?${query}` : ''}`,
      );
    } catch (caught) {
      if (isRedirect(caught)) throw caught;
      return workflowActionFailure(caught, 'openCase', saved);
    } finally {
      context.sqlite.close();
    }
  },
  saveWorkItem: async ({ request, locals }) => {
    if (!locals.user || !locals.session) redirect(303, `${base}/app/login`);
    const formData = await request.formData();
    const saved = values(formData);
    const context = openPortalRepository(locals);
    try {
      const kind = String(formData.get('kind') ?? '') as WorkItemKind;
      const projectId = String(formData.get('projectId') ?? '').trim();
      const title = String(formData.get('title') ?? '').trim();
      const ownerId = String(formData.get('ownerId') ?? '').trim();
      if (!projectId || !title || !ownerId)
        return workflowInputFailure(400, 'problem.digitalWorkers.required', 'saveWorkItem', saved);
      if (!['scope_change', 'handover', 'evidence', 'policy_review'].includes(kind))
        return workflowInputFailure(
          400,
          'problem.digitalWorkers.invalidSelection',
          'saveWorkItem',
          saved,
        );
      if (kind === 'policy_review' && !String(formData.get('policyReference') ?? '').trim())
        return workflowInputFailure(400, 'problem.digitalWorkers.required', 'saveWorkItem', saved);
      let evidence: EvidenceInput | undefined;
      let proposedSettings: unknown;
      try {
        evidence = evidenceFromForm(formData);
        proposedSettings = parseProposedSettings(formData);
      } catch {
        return workflowInputFailure(
          400,
          'problem.digitalWorkers.invalidSelection',
          'saveWorkItem',
          saved,
        );
      }
      const dueOn = String(formData.get('dueOn') ?? '').trim();
      if (dueOn && !validDateRange(dueOn, dueOn))
        return workflowInputFailure(
          400,
          'problem.digitalWorkers.invalidDateRange',
          'saveWorkItem',
          saved,
        );
      const caseId = String(formData.get('caseId') ?? '').trim();
      const kindClassification = String(formData.get('scopeClassification') ?? '').trim();
      const classificationValues: readonly ScopeClassification[] = [
        'existing_scope',
        'rework',
        'goodwill',
        'needs_clarification',
        'potential_change',
      ];
      if (
        kindClassification &&
        !classificationValues.includes(kindClassification as ScopeClassification)
      )
        return workflowInputFailure(
          400,
          'problem.digitalWorkers.invalidSelection',
          'saveWorkItem',
          saved,
        );
      const repository = new DigitalWorkersRepository(context.sqlite);
      repository.saveWorkItem(context.principal, {
        projectId,
        kind,
        title,
        description: String(formData.get('description') ?? '').trim() || null,
        ownerId,
        dueOn: dueOn || null,
        evidenceRefs: evidence ? [evidence] : [],
        ...(kind === 'scope_change'
          ? { scopeClassification: (kindClassification || null) as ScopeClassification | null }
          : {}),
        ...(kind === 'policy_review'
          ? {
              policyReference: String(formData.get('policyReference') ?? '').trim(),
              proposedSettings,
            }
          : {}),
        ...(caseId ? { caseId } : {}),
        requestKey: String(formData.get('requestKey') ?? ''),
      });
      const locale = String(formData.get('lang') ?? 'en');
      const query = new URLSearchParams({ project: projectId });
      if (locale === 'en' || locale === 'es' || locale === 'pt') query.set('lang', locale);
      redirect(303, `${base}/app/workflow?${query.toString()}#work-items`);
    } catch (caught) {
      if (isRedirect(caught)) throw caught;
      return workflowActionFailure(caught, 'saveWorkItem', saved);
    } finally {
      context.sqlite.close();
    }
  },
  updateWorkItem: async ({ request, locals }) => {
    if (!locals.user || !locals.session) redirect(303, `${base}/app/login`);
    const formData = await request.formData();
    const saved = values(formData);
    const context = openPortalRepository(locals);
    try {
      const id = String(formData.get('id') ?? '').trim();
      const projectId = String(formData.get('projectId') ?? '').trim();
      const version = Number(formData.get('expectedVersion'));
      const reason = String(formData.get('reason') ?? '').trim();
      const status = String(formData.get('status') ?? '') as WorkItemStatus;
      if (!id || !projectId || !Number.isSafeInteger(version) || version < 1)
        return workflowInputFailure(
          400,
          'problem.digitalWorkers.invalidSelection',
          'updateWorkItem',
          saved,
        );
      if (!reason)
        return workflowInputFailure(
          400,
          'problem.digitalWorkers.reasonMissing',
          'updateWorkItem',
          saved,
        );
      if (
        !['open', 'in_progress', 'ready_for_review', 'accepted', 'waived', 'cancelled'].includes(
          status,
        )
      )
        return workflowInputFailure(
          400,
          'problem.digitalWorkers.invalidSelection',
          'updateWorkItem',
          saved,
        );
      const dueOn = String(formData.get('dueOn') ?? '').trim();
      if (dueOn && !validDateRange(dueOn, dueOn))
        return workflowInputFailure(
          400,
          'problem.digitalWorkers.invalidDateRange',
          'updateWorkItem',
          saved,
        );
      let addedEvidence: EvidenceInput | undefined;
      let proposedSettings: unknown | undefined;
      try {
        addedEvidence = evidenceFromForm(formData);
        proposedSettings = parseProposedSettings(formData);
      } catch {
        return workflowInputFailure(
          400,
          'problem.digitalWorkers.invalidSelection',
          'updateWorkItem',
          saved,
        );
      }
      const repository = new DigitalWorkersRepository(context.sqlite);
      let evidenceRefs: EvidenceInput[] | undefined;
      if (addedEvidence) {
        const current = repository
          .listWorkspace(context.principal, { projectId })
          .workItems.find((item) => item.id === id);
        if (!current)
          return workflowActionFailure(
            new DigitalWorkAccessDeniedError('Assigned work item required'),
            'updateWorkItem',
            saved,
          );
        evidenceRefs = [
          ...current.evidenceRefs.map(({ state: _state, ...ref }) => ref),
          addedEvidence,
        ];
      }
      const worker = context.principal.role === 'worker';
      repository.updateWorkItem(context.principal, {
        id,
        expectedVersion: version,
        status,
        reason,
        requestKey: String(formData.get('requestKey') ?? ''),
        ...(evidenceRefs ? { evidenceRefs } : {}),
        ...(!worker
          ? {
              ownerId: String(formData.get('ownerId') ?? '').trim(),
              dueOn: dueOn || null,
              ...(String(formData.get('scopeClassification') ?? '').trim()
                ? {
                    scopeClassification: String(
                      formData.get('scopeClassification'),
                    ) as ScopeClassification,
                  }
                : {}),
              ...(String(formData.get('policyReference') ?? '').trim()
                ? { policyReference: String(formData.get('policyReference')) }
                : {}),
              ...(proposedSettings === undefined ? {} : { proposedSettings }),
            }
          : {}),
      });
      const locale = String(formData.get('lang') ?? 'en');
      const query = new URLSearchParams({ project: projectId });
      if (locale === 'en' || locale === 'es' || locale === 'pt') query.set('lang', locale);
      redirect(303, `${base}/app/workflow?${query.toString()}#work-items`);
    } catch (caught) {
      if (isRedirect(caught)) throw caught;
      return workflowActionFailure(caught, 'updateWorkItem', saved);
    } finally {
      context.sqlite.close();
    }
  },
};
