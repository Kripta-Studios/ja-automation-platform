<script lang="ts">
  import { base } from '$app/paths';
  import { SvelteMap } from 'svelte/reactivity';
  import { page } from '$app/stores';
  import ActionBar from '$lib/portal/ui/ActionBar.svelte';
  import Field from '$lib/portal/ui/Field.svelte';
  import FieldGroup from '$lib/portal/ui/FieldGroup.svelte';
  import FormCard from '$lib/portal/ui/FormCard.svelte';
  import SectionCard from '$lib/portal/ui/SectionCard.svelte';
  import StatusBadge from '$lib/portal/ui/StatusBadge.svelte';
  import { billingReadinessMessageKey } from '$lib/portal/billing-readiness';
  import { normalizePortalLocale, portalText } from '$lib/portal-i18n';
  import { workflowActionCopy, workflowStatus, workflowText } from '$lib/portal/workflow/copy';
  import type { ActionData, PageData } from './$types';

  let { data, form } = $props<{ data: PageData; form: ActionData }>();
  const locale = $derived(
    normalizePortalLocale($page.url.searchParams.get('lang') ?? $page.data.locale),
  );
  const t = (key: string) => workflowText(locale, key);
  const actionMessage = $derived(workflowActionCopy(locale, form));
  const actionSucceeded = $derived((form as { success?: boolean } | null)?.success === true);
  const approvalGroups = $derived(groupApprovals(data.mode === 'manager' ? data.approvals : []));
  let chosenScope = $state('whole_period');
  let managerProjectId = $state('');
  let managerOwnerId = $state('');
  let policyProjectId = $state('');
  let policyOwnerId = $state('');
  $effect(() => {
    const submittedScope = value('scopeKind');
    if (submittedScope) chosenScope = submittedScope;
  });
  $effect(() => {
    const actionValues = (form as { values?: Record<string, string> } | null)?.values;
    const defaultProjectId =
      'selectedProjectId' in data ? data.selectedProjectId || data.projects[0]?.id || '' : '';
    if (data.mode === 'manager') {
      managerProjectId =
        actionValues && Object.hasOwn(actionValues, 'projectId')
          ? (actionValues.projectId ?? '')
          : defaultProjectId;
      managerOwnerId =
        actionValues && Object.hasOwn(actionValues, 'ownerId') ? (actionValues.ownerId ?? '') : '';
    }
    if (data.mode === 'finance' && !data.isAuditor) {
      policyProjectId =
        actionValues && Object.hasOwn(actionValues, 'projectId')
          ? (actionValues.projectId ?? '')
          : defaultProjectId;
      policyOwnerId =
        actionValues && Object.hasOwn(actionValues, 'ownerId') ? (actionValues.ownerId ?? '') : '';
    }
  });

  type Approval = {
    id: string;
    type: string;
    projectId: string;
    projectName: string;
    projectNumber: string;
    date: string;
    status: string;
    reviewStage: string;
    title: string;
    workerName: string;
    href: string;
  };
  type OwnerOption = { id: string; name: string; role: string; projectIds: string[] };
  function groupApprovals(rows: readonly Approval[]) {
    const groups = new SvelteMap<
      string,
      { projectId: string; name: string; number: string; items: Approval[] }
    >();
    for (const row of rows) {
      let group = groups.get(row.projectId);
      if (!group) {
        group = {
          projectId: row.projectId,
          name: row.projectName,
          number: row.projectNumber,
          items: [],
        };
        groups.set(row.projectId, group);
      }
      group.items.push(row);
    }
    return [...groups.values()];
  }

  function value(name: string, fallback = ''): string {
    const values = (form as { values?: Record<string, string> } | null)?.values;
    return values && Object.hasOwn(values, name) ? (values[name] ?? fallback) : fallback;
  }

  function labelType(type: string): string {
    if (type === 'time') return t('Time entry');
    if (type === 'expense') return t('Expense receipt');
    if (type === 'daily_report') return t('Daily report');
    if (type === 'technical_report') return t('Technical report');
    return t('Report');
  }

  function approvalStage(stage: string): string {
    if (stage === 'operational') return t('Operational review');
    if (stage === 'correction') return t('Correction review');
    return t('Report review');
  }

  function readiness(code: string): string {
    const direct = {
      pending_time_submission: 'A time record still needs worker submission.',
      pending_expense_submission: 'An expense still needs worker submission.',
      pending_expense_approval: 'An expense still needs approval.',
      missing_expense_classification: 'An expense needs a finance classification.',
      source_not_billable: 'This source is not billable under the current rules.',
      source_already_reserved: 'This source is already reserved by an invoice.',
      source_requires_remaining_period_billing:
        'This source has a remaining balance that needs its existing billing workflow.',
      client_daily_minimum_already_billed: 'The current daily minimum is already billed.',
      complete_client_billing_group_required: 'Select the complete billing group for this source.',
      selection_requires_whole_period_billing: 'This billing rule requires a whole-period case.',
      selected_source_not_eligible:
        'This source does not meet the current billing eligibility rules.',
    } as Record<string, string>;
    if (direct[code]) return workflowText(locale, direct[code]);
    return portalText(locale, billingReadinessMessageKey(code));
  }

  function sourceHref(type: string, id: string): string {
    const path = type === 'time' ? 'time' : type === 'expense' ? 'expenses' : 'reports';
    return `${base}/app/${path}/${encodeURIComponent(id)}`;
  }

  function ownerChoices(projectId: string): OwnerOption[] {
    if (!('owners' in data)) return [];
    return (data.owners as OwnerOption[]).filter((owner) => owner.projectIds.includes(projectId));
  }

  function policyOwners(projectId: string): OwnerOption[] {
    return ownerChoices(projectId).filter((owner) =>
      ['owner_admin', 'finance_admin'].includes(owner.role),
    );
  }

  function changeManagerProject(event: Event) {
    const projectId = (event.currentTarget as HTMLSelectElement).value;
    if (projectId !== managerProjectId) managerOwnerId = '';
    managerProjectId = projectId;
  }

  function changePolicyProject(event: Event) {
    const projectId = (event.currentTarget as HTMLSelectElement).value;
    if (projectId !== policyProjectId) policyOwnerId = '';
    policyProjectId = projectId;
  }

  function periodReviewHref(projectId: string, start: string, end: string) {
    return `${base}/app/reports/review?${new URLSearchParams({ project: projectId, from: start, to: end, lang: locale })}`;
  }

  function kindLabel(kind: string) {
    if (kind === 'scope_change') return t('Scope change');
    if (kind === 'handover') return t('Handover');
    if (kind === 'evidence') return t('Evidence');
    return t('Policy review');
  }

  function scopeLabel(scope: string) {
    if (scope === 'whole_period') return t('Whole period scope');
    return t('Selected-source scope');
  }

  function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    if (status === 'approved' || status === 'accepted') return 'success';
    if (status === 'needs_changes' || status === 'ready_for_review') return 'warning';
    if (status === 'cancelled') return 'neutral';
    if (status === 'in_progress') return 'info';
    return 'neutral';
  }

  function allowedTransitions(status: string, worker: boolean) {
    const common: Record<string, string[]> = {
      open: ['in_progress', 'ready_for_review', 'cancelled'],
      in_progress: ['ready_for_review', 'cancelled'],
      ready_for_review: ['in_progress', 'accepted', 'waived', 'cancelled'],
    };
    return [status, ...(common[status] ?? [])].filter(
      (item) => !worker || ['open', 'in_progress', 'ready_for_review'].includes(item),
    );
  }

  function sourceKey(source: { type: string; id: string; version: number }) {
    return JSON.stringify({ type: source.type, id: source.id, version: source.version });
  }

  function selectedSource(source: { type: string; id: string; version: number }) {
    try {
      const saved = JSON.parse(value('sources', '[]')) as string[];
      return saved.includes(sourceKey(source));
    } catch {
      return false;
    }
  }

  function proposalValue(settings: unknown, name: string): string {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return '';
    const values = settings as Record<string, unknown>;
    const value = values[name];
    if (
      name === 'fixedPriceMinor' &&
      value !== undefined &&
      value !== null &&
      /^\d+$/u.test(String(value))
    ) {
      const digits = BigInt(String(value)).toString().padStart(3, '0');
      return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
    }
    return value === undefined || value === null ? '' : String(value);
  }

  function proposalSummary(settings: unknown) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return [];
    const values = settings as Record<string, unknown>;
    const fields: Array<[string, string, string?]> = [
      ['billingRuleId', 'Billing rule reference'],
      ['effectiveFrom', 'Effective from'],
      ['effectiveTo', 'Effective to'],
      ['streamType', 'Stream type'],
      ['cadenceType', 'Cadence'],
      ['currency', 'Currency'],
      ['includeExpenses', 'Include expenses'],
      ['minimumMinutes', 'Minimum minutes per day'],
      ['fixedPriceMinor', 'Fixed price'],
      ['note', 'Proposal note'],
    ];
    return fields.flatMap(([name, label]) => {
      if (!Object.hasOwn(values, name)) return [];
      let text = proposalValue(settings, name === 'fixedPriceMinor' ? name : name);
      if (name === 'includeExpenses') text = values[name] === true ? t('Yes') : t('No');
      if (name === 'streamType')
        text = t(
          text === 'labor'
            ? 'Labor'
            : text === 'expense'
              ? 'Expenses'
              : text === 'milestone'
                ? 'Milestone'
                : 'Other stream',
        );
      if (name === 'cadenceType') text = cadenceLabel(text);
      if (name === 'fixedPriceMinor' && values.currency)
        text = `${text} ${String(values.currency)}`;
      return [{ label: t(label), value: text }];
    });
  }

  function cadenceLabel(value: string) {
    const labels: Record<string, string> = {
      weekly: 'Weekly',
      every_14_days: 'Every 14 days',
      semi_monthly: 'Semi-monthly',
      monthly: 'Monthly',
      custom: 'Custom',
      milestone: 'Milestone',
      manual: 'Manual',
    };
    return labels[value] ? t(labels[value]) : value;
  }

  function ruleLabel(rule: { stream_type: unknown; cadence_type: unknown }) {
    const stream = rule.stream_type === 'expense' ? t('Expenses') : t('Labor');
    return `${stream} · ${cadenceLabel(String(rule.cadence_type ?? ''))}`;
  }
</script>

<svelte:head>
  <title>{t('Digital workers')}</title>
  <meta name="description" content={t('Digital workers description')} />
</svelte:head>

<main class="workflow-page">
  <header class="page-heading">
    <div>
      <p class="eyebrow">{t('Digital workers')}</p>
      <h1>{t('Digital workers')}</h1>
      <p class="intro">{t('Digital workers description')}</p>
    </div>
  </header>

  {#if actionMessage}
    <p class:success={actionSucceeded} class="notice" role={actionSucceeded ? 'status' : 'alert'}>
      {actionMessage}
    </p>
  {/if}

  {#if data.mode === 'worker'}
    {#if data.supplierCoordinator}
      <SectionCard title={t('Capture handoff')} description={t('Capture handoff description')}>
        <a class="button-link" href={`${base}/app/supplier`}
          >{t('Continue to supplier workspace')}</a
        >
      </SectionCard>
    {:else}
      <SectionCard title={t('Finish your work')} description={t('Finish your work description')}>
        {#if !data.restrictedProfile || data.restrictedProfile === 'external_technician'}
          <ActionBar>
            <a class="button-link" href={`${base}/app/workflow/capture?lang=${locale}`}
              >{t('Open capture')}</a
            >
          </ActionBar>
        {/if}
        {#if data.ownWork.length === 0}
          <p class="empty">{t('No records need attention')}</p>
        {:else}
          <ul class="card-list">
            {#each data.ownWork as item (item.id)}
              <li class="record-card">
                <div class="record-topline">
                  <div>
                    <h3>{labelType(item.type)}</h3>
                    <p class="record-title">{item.title || item.projectName || t('Open record')}</p>
                  </div>
                  <StatusBadge
                    variant={item.receiptNeeded ? 'warning' : statusVariant(item.status)}
                    text={item.receiptNeeded
                      ? t('Receipt needed')
                      : workflowStatus(locale, item.status)}
                  />
                </div>
                <p class="record-meta">{item.projectNumber} · {item.projectName} · {item.date}</p>
                {#if item.receiptNeeded}<p class="subtle">{t('Receipt needed')}</p>{/if}
                <a class="text-link" href={item.href}>{t('Open record')}</a>
              </li>
            {/each}
          </ul>
        {/if}
      </SectionCard>

      {#if !data.restrictedProfile && data.workItems.length}
        <SectionCard
          title={t('Assigned work')}
          description={t(
            'This work item tracks a next step only; it does not complete or approve domain records.',
          )}
        >
          <ul class="card-list">
            {#each data.workItems as item (item.id)}
              <li class="record-card" id={`item-${item.id}`}>
                <div class="record-topline">
                  <div>
                    <h3>{item.title}</h3>
                    <p class="record-meta">
                      {item.projectNumber} · {item.projectName} · {kindLabel(item.kind)}
                    </p>
                  </div>
                  <StatusBadge
                    variant={statusVariant(item.status)}
                    text={workflowStatus(locale, item.status)}
                  />
                </div>
                {#if item.description}<p>{item.description}</p>{/if}
                <p class="record-meta">{t('Due date')}: {item.dueOn ?? t('Not available')}</p>
                {#if item.evidenceRefs.length}
                  <ul class="evidence-list">
                    {#each item.evidenceRefs as evidence}
                      <li>
                        {t('Evidence')}: {evidence.note || evidence.id}
                        <StatusBadge
                          variant={evidence.state === 'current'
                            ? 'success'
                            : evidence.state === 'stale' || evidence.state === 'missing'
                              ? 'warning'
                              : 'neutral'}
                          text={workflowText(
                            locale,
                            evidence.state === 'current'
                              ? 'Current record reference'
                              : evidence.state === 'stale'
                                ? 'Evidence may be outdated'
                                : evidence.state === 'missing'
                                  ? 'Evidence record not found'
                                  : 'Evidence reference recorded',
                          )}
                        />
                      </li>
                    {/each}
                  </ul>
                {/if}
                <form method="POST" action="?/updateWorkItem" class="item-form">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="projectId" value={item.projectId} />
                  <input type="hidden" name="expectedVersion" value={item.version} />
                  <input type="hidden" name="requestKey" value={item.requestKey} />
                  <input type="hidden" name="lang" value={locale} />
                  <FieldGroup columns="2">
                    <Field id={`worker-status-${item.id}`} label={t('Status')}>
                      <select id={`worker-status-${item.id}`} name="status" value={item.status}>
                        {#each allowedTransitions(item.status, true) as status}
                          <option value={status}>{workflowStatus(locale, status)}</option>
                        {/each}
                      </select>
                    </Field>
                    <Field id={`worker-reason-${item.id}`} label={t('Review reason')} required>
                      <input
                        id={`worker-reason-${item.id}`}
                        name="reason"
                        required
                        maxlength="2000"
                        placeholder={t('Explain the evidence or reason for this status change.')}
                      />
                    </Field>
                  </FieldGroup>
                  <details class="evidence-editor">
                    <summary>{t('Add evidence reference')}</summary>
                    <FieldGroup columns="2">
                      <Field id={`worker-evidence-type-${item.id}`} label={t('Evidence type')}>
                        <select id={`worker-evidence-type-${item.id}`} name="evidenceType">
                          <option value="time">{t('Time entry')}</option><option value="expense"
                            >{t('Expense receipt')}</option
                          ><option value="daily_report">{t('Daily report')}</option><option
                            value="technical_report">{t('Technical report')}</option
                          ><option value="period_report">{t('Period report')}</option><option
                            value="customer_conformity">{t('Customer conformity')}</option
                          ><option value="document">{t('Document')}</option><option value="external"
                            >{t('External reference')}</option
                          >
                        </select>
                      </Field>
                      <Field
                        id={`worker-evidence-id-${item.id}`}
                        label={t('Evidence reference ID')}
                      >
                        <input
                          id={`worker-evidence-id-${item.id}`}
                          name="evidenceId"
                          maxlength="200"
                        />
                      </Field>
                      <Field
                        id={`worker-evidence-version-${item.id}`}
                        label={t('Evidence version')}
                      >
                        <input
                          id={`worker-evidence-version-${item.id}`}
                          name="evidenceVersion"
                          inputmode="numeric"
                          pattern="[0-9]*"
                        />
                      </Field>
                      <Field id={`worker-evidence-note-${item.id}`} label={t('Evidence note')}>
                        <input
                          id={`worker-evidence-note-${item.id}`}
                          name="evidenceNote"
                          maxlength="1000"
                        />
                      </Field>
                    </FieldGroup>
                  </details>
                  <ActionBar><button type="submit">{t('Update follow-up')}</button></ActionBar>
                </form>
              </li>
            {/each}
          </ul>
        </SectionCard>
      {/if}
    {/if}
  {:else if data.mode === 'manager'}
    <SectionCard
      title={t('Needs your decision')}
      description={t('Needs your decision description')}
    >
      {#if data.projects.length > 1}
        <form method="GET" action={`${base}/app/workflow`} class="filter-form">
          <input type="hidden" name="lang" value={locale} />
          <Field id="manager-project-filter" label={t('Project')}>
            <select id="manager-project-filter" name="project" value={data.selectedProjectId}>
              <option value="">{t('All projects with review access')}</option>
              {#each data.projects as project}<option value={project.id}
                  >{project.number} · {project.name}</option
                >{/each}
            </select>
          </Field>
          <button type="submit">{t('Apply filters')}</button>
        </form>
      {/if}
      {#if data.approvals.length === 0}
        <p class="empty">{t('No current decisions')}</p>
      {:else}
        <div class="project-groups">
          {#each approvalGroups as group (group.projectId)}
            <section class="project-group" aria-label={`${group.number} ${group.name}`}>
              <h3>{group.number} · {group.name}</h3>
              <ul class="card-list compact-list">
                {#each group.items as item (item.type + ':' + item.id)}
                  <li class="record-card approval-card">
                    <div class="record-topline">
                      <div>
                        <h4>{labelType(item.type)}<span class="sr-only"> — {item.id}</span></h4>
                        <p class="record-meta">{item.workerName} · {item.date}</p>
                      </div>
                      <StatusBadge
                        variant={statusVariant(item.status)}
                        text={workflowStatus(locale, item.status)}
                      />
                    </div>
                    <p class="record-meta">{approvalStage(item.reviewStage)}</p>
                    <a class="text-link" href={item.href}>{t('Review source')}</a>
                  </li>
                {/each}
              </ul>
            </section>
          {/each}
        </div>
      {/if}
      {#if data.periodReviewAccess && data.selectedProjectId}
        <p class="report-review-link">
          <a
            class="text-link"
            href={periodReviewHref(
              data.selectedProjectId,
              data.reviewPeriodStart,
              data.reviewPeriodEnd,
            )}>{t('Review current period report')}</a
          >
        </p>
      {/if}
    </SectionCard>

    <SectionCard title={t('Team follow-up')} description={t('Team follow-up description')}>
      <div id="work-items" class="workspace-grid">
        <FormCard title={t('Create a follow-up')}>
          <form method="POST" action="?/saveWorkItem" class="item-form">
            <input type="hidden" name="requestKey" value={data.requestKeys.saveWorkItem} />
            <input type="hidden" name="lang" value={locale} />
            <FieldGroup columns="2">
              <Field id="new-project" label={t('Project')} required>
                <select
                  id="new-project"
                  name="projectId"
                  required
                  value={managerProjectId}
                  onchange={changeManagerProject}
                >
                  <option value="">{t('Select a project')}</option
                  >{#each data.projects as project}<option value={project.id}
                      >{project.number} · {project.name}</option
                    >{/each}
                </select>
              </Field>
              <Field id="new-kind" label={t('Work type')} required>
                <select id="new-kind" name="kind" required value={value('kind', 'scope_change')}>
                  <option value="scope_change">{t('Scope change')}</option><option value="handover"
                    >{t('Handover')}</option
                  ><option value="evidence">{t('Evidence')}</option>
                </select>
              </Field>
              <Field id="new-title" label={t('Factual title')} required>
                <input
                  id="new-title"
                  name="title"
                  required
                  maxlength="300"
                  value={value('title')}
                />
              </Field>
              <Field id="new-owner" label={t('Owner')} required>
                <select id="new-owner" name="ownerId" required bind:value={managerOwnerId}>
                  <option value="">{t('Choose an owner')}</option>
                  {#each ownerChoices(managerProjectId) as owner}<option value={owner.id}
                      >{owner.name} · {workflowText(locale, owner.role)}</option
                    >{/each}
                </select>
              </Field>
              <Field id="new-due" label={t('Due date')}>
                <input id="new-due" name="dueOn" type="date" value={value('dueOn')} />
              </Field>
              <Field id="new-classification" label={t('Scope classification')}>
                <select
                  id="new-classification"
                  name="scopeClassification"
                  value={value('scopeClassification')}
                >
                  <option value="">{t('Choose a classification')}</option><option
                    value="existing_scope">{t('Existing scope')}</option
                  ><option value="rework">{t('Rework')}</option><option value="goodwill"
                    >{t('Goodwill')}</option
                  ><option value="needs_clarification">{t('Needs clarification')}</option><option
                    value="potential_change">{t('Potential change')}</option
                  >
                </select>
              </Field>
            </FieldGroup>
            <Field
              id="new-description"
              label={t('Description or source quote')}
              help={t('Describe the observed fact or quote the source.')}
            >
              <textarea id="new-description" name="description" rows="3" maxlength="4000"
                >{value('description')}</textarea
              >
            </Field>
            <details class="evidence-editor">
              <summary>{t('Evidence references')}</summary>
              <p class="subtle">{t('Evidence references help')}</p>
              <FieldGroup columns="2">
                <Field id="new-evidence-type" label={t('Evidence type')}
                  ><select id="new-evidence-type" name="evidenceType"
                    ><option value="time">{t('Time entry')}</option><option value="expense"
                      >{t('Expense receipt')}</option
                    ><option value="daily_report">{t('Daily report')}</option><option
                      value="technical_report">{t('Technical report')}</option
                    ><option value="period_report">{t('Period report')}</option><option
                      value="customer_conformity">{t('Customer conformity')}</option
                    ><option value="document">{t('Document')}</option><option value="external"
                      >{t('External reference')}</option
                    ></select
                  ></Field
                >
                <Field id="new-evidence-id" label={t('Evidence reference ID')}
                  ><input id="new-evidence-id" name="evidenceId" maxlength="200" /></Field
                >
                <Field id="new-evidence-version" label={t('Evidence version')}
                  ><input
                    id="new-evidence-version"
                    name="evidenceVersion"
                    inputmode="numeric"
                    pattern="[0-9]*"
                  /></Field
                >
                <Field id="new-evidence-note" label={t('Evidence note')}
                  ><input id="new-evidence-note" name="evidenceNote" maxlength="1000" /></Field
                >
              </FieldGroup>
            </details>
            <ActionBar><button type="submit">{t('Save follow-up')}</button></ActionBar>
          </form>
        </FormCard>

        <div class="work-item-list">
          {#if data.workItems.length === 0}<p class="empty">
              {t('No authorized operational work is currently listed here.')}
            </p>{/if}
          {#each data.workItems as item (item.id)}
            <article class="record-card" id={`item-${item.id}`}>
              <div class="record-topline">
                <div>
                  <h3>{item.title}</h3>
                  <p class="record-meta">
                    {item.projectNumber} · {item.projectName} · {kindLabel(item.kind)}
                  </p>
                </div>
                <StatusBadge
                  variant={statusVariant(item.status)}
                  text={workflowStatus(locale, item.status)}
                />
              </div>
              {#if item.description}<p>{item.description}</p>{/if}
              {#if item.scopeClassification}<p class="record-meta">
                  {t('Scope classification')}: {workflowText(locale, item.scopeClassification)}
                </p>{/if}
              <p class="record-meta">
                {t('Owner')}: {ownerChoices(item.projectId).find(
                  (owner) => owner.id === item.ownerId,
                )?.name ?? t('Unknown owner')} · {t('Due date')}: {item.dueOn ?? t('Not available')}
              </p>
              {#if item.evidenceRefs.length}<ul class="evidence-list">
                  {#each item.evidenceRefs as evidence}<li>
                      {evidence.note || evidence.id}
                      <StatusBadge
                        variant={evidence.state === 'current'
                          ? 'success'
                          : evidence.state === 'stale' || evidence.state === 'missing'
                            ? 'warning'
                            : 'neutral'}
                        text={workflowText(
                          locale,
                          evidence.state === 'current'
                            ? 'Current record reference'
                            : evidence.state === 'stale'
                              ? 'Evidence may be outdated'
                              : evidence.state === 'missing'
                                ? 'Evidence record not found'
                                : 'Evidence reference recorded',
                        )}
                      />
                    </li>{/each}
                </ul>{/if}
              <form method="POST" action="?/updateWorkItem" class="item-form">
                <input type="hidden" name="id" value={item.id} /><input
                  type="hidden"
                  name="projectId"
                  value={item.projectId}
                /><input type="hidden" name="expectedVersion" value={item.version} /><input
                  type="hidden"
                  name="requestKey"
                  value={item.requestKey}
                /><input type="hidden" name="lang" value={locale} />
                <FieldGroup columns="2">
                  <Field id={`manager-status-${item.id}`} label={t('Status')}
                    ><select id={`manager-status-${item.id}`} name="status" value={item.status}
                      >{#each allowedTransitions(item.status, false) as status}<option
                          value={status}>{workflowStatus(locale, status)}</option
                        >{/each}</select
                    ></Field
                  >
                  <Field id={`manager-owner-${item.id}`} label={t('Owner')}
                    ><select id={`manager-owner-${item.id}`} name="ownerId" value={item.ownerId}
                      >{#each item.kind === 'policy_review' ? policyOwners(item.projectId) : ownerChoices(item.projectId) as owner}<option
                          value={owner.id}>{owner.name}</option
                        >{/each}</select
                    ></Field
                  >
                  <Field id={`manager-due-${item.id}`} label={t('Due date')}
                    ><input
                      id={`manager-due-${item.id}`}
                      type="date"
                      name="dueOn"
                      value={item.dueOn ?? ''}
                    /></Field
                  >
                  {#if item.kind === 'scope_change'}
                    <Field
                      id={`manager-classification-${item.id}`}
                      label={t('Scope classification')}
                      ><select
                        id={`manager-classification-${item.id}`}
                        name="scopeClassification"
                        value={item.scopeClassification ?? ''}
                        ><option value="">{t('Choose a classification')}</option><option
                          value="existing_scope">{t('Existing scope')}</option
                        ><option value="rework">{t('Rework')}</option><option value="goodwill"
                          >{t('Goodwill')}</option
                        ><option value="needs_clarification">{t('Needs clarification')}</option
                        ><option value="potential_change">{t('Potential change')}</option></select
                      ></Field
                    >
                  {/if}
                  <Field id={`manager-reason-${item.id}`} label={t('Review reason')} required
                    ><input
                      id={`manager-reason-${item.id}`}
                      name="reason"
                      required
                      maxlength="2000"
                      placeholder={t('Explain the evidence or reason for this status change.')}
                    /></Field
                  >
                </FieldGroup>
                <details class="evidence-editor">
                  <summary>{t('Add evidence reference')}</summary><FieldGroup columns="2"
                    ><Field id={`manager-evidence-type-${item.id}`} label={t('Evidence type')}
                      ><select id={`manager-evidence-type-${item.id}`} name="evidenceType"
                        ><option value="time">{t('Time entry')}</option><option value="expense"
                          >{t('Expense receipt')}</option
                        ><option value="daily_report">{t('Daily report')}</option><option
                          value="technical_report">{t('Technical report')}</option
                        ><option value="period_report">{t('Period report')}</option><option
                          value="customer_conformity">{t('Customer conformity')}</option
                        ><option value="document">{t('Document')}</option><option value="external"
                          >{t('External reference')}</option
                        ></select
                      ></Field
                    ><Field id={`manager-evidence-id-${item.id}`} label={t('Evidence reference ID')}
                      ><input
                        id={`manager-evidence-id-${item.id}`}
                        name="evidenceId"
                        maxlength="200"
                      /></Field
                    ><Field id={`manager-evidence-version-${item.id}`} label={t('Evidence version')}
                      ><input
                        id={`manager-evidence-version-${item.id}`}
                        name="evidenceVersion"
                        inputmode="numeric"
                        pattern="[0-9]*"
                      /></Field
                    ><Field id={`manager-evidence-note-${item.id}`} label={t('Evidence note')}
                      ><input
                        id={`manager-evidence-note-${item.id}`}
                        name="evidenceNote"
                        maxlength="1000"
                      /></Field
                    ></FieldGroup
                  >
                </details>
                <ActionBar><button type="submit">{t('Update follow-up')}</button></ActionBar>
              </form>
            </article>
          {/each}
        </div>
      </div>
    </SectionCard>
  {:else}
    {#if data.isAuditor}
      <p class="read-only-note">
        <StatusBadge variant="info" text={t('Read-only view')} />
        {t('Auditor view description')}
      </p>
    {/if}
    <SectionCard title={t('Ready to invoice')} description={t('Ready to invoice description')}>
      {#if !data.isAuditor}
        <FormCard title={t('Open a finance case')}>
          <form method="GET" action={`${base}/app/workflow`} class="filter-form">
            <input type="hidden" name="lang" value={locale} />
            <FieldGroup columns="2">
              <Field id="finance-project-filter" label={t('Project')} required>
                <select
                  id="finance-project-filter"
                  name="project"
                  required
                  value={data.selectedProjectId}
                  ><option value="">{t('Select a project')}</option
                  >{#each data.projects as project}<option value={project.id}
                      >{project.number} · {project.name}</option
                    >{/each}</select
                >
              </Field>
              <Field id="finance-rule-filter" label={t('Billing stream')}>
                <select id="finance-rule-filter" name="rule" value={data.selectedRuleId}
                  ><option value="">{t('Select a stream')}</option
                  >{#each data.billingRules as rule}<option value={rule.id}
                      >{ruleLabel(rule)}</option
                    >{/each}</select
                >
              </Field>
              <Field id="finance-from-filter" label={t('Period start')} required
                ><input
                  id="finance-from-filter"
                  name="from"
                  type="date"
                  required
                  value={data.periodStart}
                /></Field
              >
              <Field id="finance-to-filter" label={t('Period end')} required
                ><input
                  id="finance-to-filter"
                  name="to"
                  type="date"
                  required
                  value={data.periodEnd}
                /></Field
              >
            </FieldGroup>
            <button type="submit">{t('Apply filters')}</button>
          </form>
          {#if data.sourceRegister}
            <SectionCard title={t('Current source register')}>
              {#if !data.validPeriod}<p class="notice" role="alert">
                  {t('Invalid date range')}
                </p>{/if}
              {#if data.sourceRegister.reasons.length}<ul class="reason-list">
                  {#each data.sourceRegister.reasons as reason}<li>
                      {readiness(reason.code)}
                    </li>{/each}
                </ul>{/if}
              {#if data.sourceRegister.sources.length === 0}
                <p class="empty">{t('No eligible source records were found for these dates.')}</p>
              {:else}
                <ul class="card-list">
                  {#each data.sourceRegister.sources as source (source.type + ':' + source.id)}
                    <li class="record-card source-card">
                      <div class="record-topline">
                        <div>
                          <h3>{labelType(source.type)}</h3>
                          <p class="record-title">{source.summary || t('Current source')}</p>
                        </div>
                        <StatusBadge
                          variant={source.blockers.length ? 'warning' : 'success'}
                          text={source.blockers.length ? t('Needs attention') : t('Ready')}
                        />
                      </div>
                      <p class="record-meta">
                        {t('Source owner')}: {source.workerName} · {t('Source date')}: {source.date} ·
                        {t('Source status')}: {workflowStatus(locale, source.approvalState)}
                      </p>
                      <p class="record-meta">
                        {t('Billing state')}: {workflowText(locale, source.billingState)}
                      </p>
                      {#if source.blockers.length}<ul class="reason-list">
                          {#each source.blockers as reason}<li>{readiness(reason.code)}</li>{/each}
                        </ul>{/if}
                      <a class="text-link" href={sourceHref(source.type, source.id)}
                        >{t('View source record')}</a
                      >
                      <label class="source-choice"
                        ><input
                          type="checkbox"
                          name="source"
                          form="open-finance-case"
                          value={sourceKey(source)}
                          checked={selectedSource(source)}
                        /> <span>{t('Include this source')}</span></label
                      >
                    </li>
                  {/each}
                </ul>
              {/if}
            </SectionCard>
          {:else if data.selectedProjectId && !data.isAuditor}
            <p class="empty">{t('No current source snapshot')}</p>
          {/if}
          <form id="open-finance-case" method="POST" action="?/openCase" class="item-form">
            <input type="hidden" name="requestKey" value={data.requestKeys.openCase} /><input
              type="hidden"
              name="lang"
              value={locale}
            />
            <input
              type="hidden"
              name="projectId"
              value={value('projectId', data.selectedProjectId)}
            />
            <input
              type="hidden"
              name="billingRuleId"
              value={value('billingRuleId', data.selectedRuleId)}
            />
            <input
              type="hidden"
              name="periodStart"
              value={value('periodStart', data.periodStart)}
            />
            <input type="hidden" name="periodEnd" value={value('periodEnd', data.periodEnd)} />
            <Field id="case-scope" label={t('Case scope')}>
              <select id="case-scope" name="scopeKind" bind:value={chosenScope}
                ><option value="whole_period">{t('Whole period')}</option><option
                  value="selected_sources">{t('Selected sources')}</option
                ></select
              >
            </Field>
            {#if chosenScope === 'selected_sources' && data.sourceRegister?.sources.length === 0}<p
                class="subtle"
              >
                {t('Select at least one source for a selected-source case.')}
              </p>{/if}
            <ActionBar
              ><button
                type="submit"
                disabled={!data.selectedProjectId || !data.selectedRuleId || data.isAuditor}
                >{t('Open case')}</button
              ></ActionBar
            >
          </form>
        </FormCard>
      {/if}
      <SectionCard title={t('Finance cases')}>
        {#if data.cases.length === 0}<p class="empty">{t('No finance cases yet')}</p>{:else}
          <ul class="card-list">
            {#each data.cases as item (item.id)}
              <li class="record-card">
                <div class="record-topline">
                  <div>
                    <h3>{item.projectNumber} · {item.projectName}</h3>
                    <p class="record-meta">
                      {scopeLabel(item.scopeKind)} · {item.periodStart} – {item.periodEnd}
                    </p>
                  </div>
                  <StatusBadge
                    variant={item.phase === 'invoice_prepared'
                      ? 'info'
                      : item.reviewCurrent
                        ? 'success'
                        : 'warning'}
                    text={item.phase === 'invoice_prepared'
                      ? t('Invoice draft prepared')
                      : item.reviewCurrent
                        ? t('Snapshot current')
                        : item.reviewedManifestSha256
                          ? t('Snapshot stale')
                          : t('Review not recorded')}
                  />
                </div>
                <p class="record-meta">
                  {t('Billing rule')}: {ruleLabel(item.manifest.rule)} · {t('Period')}: {item.periodStart}
                  – {item.periodEnd}
                </p>
                {#if item.draftInvoiceId}<p class="record-meta">
                    {t('Current invoice draft')}:
                    <a
                      class="text-link"
                      href={`${base}/app/billing/invoices/${encodeURIComponent(item.draftInvoiceId)}`}
                      >{t('Open invoice draft')}</a
                    >
                  </p>{/if}
                <a
                  class="text-link"
                  href={`${base}/app/workflow/cases/${encodeURIComponent(item.id)}?lang=${locale}`}
                  >{t('Open case details')}</a
                >
              </li>
            {/each}
          </ul>
        {/if}
      </SectionCard>
    </SectionCard>

    {#if data.isAuditor}
      <SectionCard title={t('Assigned work')}>
        {#if data.workItems.length === 0}<p class="empty">
            {t('No authorized operational work is currently listed here.')}
          </p>{:else}<ul class="card-list">
            {#each data.workItems as item (item.id)}<li class="record-card">
                <div class="record-topline">
                  <div>
                    <h3>{item.title}</h3>
                    <p class="record-meta">
                      {item.projectNumber} · {item.projectName} · {kindLabel(item.kind)}
                    </p>
                  </div>
                  <StatusBadge text={workflowStatus(locale, item.status)} />
                </div>
                {#if item.description}<p>{item.description}</p>{/if}
              </li>{/each}
          </ul>{/if}
      </SectionCard>
    {:else}
      <SectionCard title={t('Policy review')} description={t('Policy review description')}>
        <div id="work-items" class="workspace-grid">
          <FormCard title={t('Create a policy review')}>
            <form method="POST" action="?/saveWorkItem" class="item-form">
              <input type="hidden" name="kind" value="policy_review" /><input
                type="hidden"
                name="requestKey"
                value={data.requestKeys.saveWorkItem}
              /><input type="hidden" name="lang" value={locale} />
              <FieldGroup columns="2">
                <Field id="policy-project" label={t('Project')} required
                  ><select
                    id="policy-project"
                    name="projectId"
                    required
                    value={policyProjectId}
                    onchange={changePolicyProject}
                    ><option value="">{t('Select a project')}</option
                    >{#each data.projects as project}<option value={project.id}
                        >{project.number} · {project.name}</option
                      >{/each}</select
                  ></Field
                >
                <Field id="policy-owner" label={t('Owner')} required
                  ><select id="policy-owner" name="ownerId" required bind:value={policyOwnerId}
                    ><option value="">{t('Choose an owner')}</option
                    >{#each policyOwners(policyProjectId) as owner}<option value={owner.id}
                        >{owner.name} · {workflowText(locale, owner.role)}</option
                      >{/each}</select
                  ></Field
                >
                <Field id="policy-title" label={t('Factual title')} required
                  ><input
                    id="policy-title"
                    name="title"
                    required
                    maxlength="300"
                    value={value('title')}
                  /></Field
                >
                <Field id="policy-reference" label={t('Policy reference')} required
                  ><input
                    id="policy-reference"
                    name="policyReference"
                    required
                    maxlength="1000"
                    value={value('policyReference')}
                  /></Field
                >
                <Field id="policy-due" label={t('Due date')}
                  ><input id="policy-due" name="dueOn" type="date" value={value('dueOn')} /></Field
                >
              </FieldGroup>
              <Field id="policy-description" label={t('Description or source quote')}
                ><textarea id="policy-description" name="description" rows="3" maxlength="4000"
                  >{value('description')}</textarea
                ></Field
              >
              <details class="evidence-editor">
                <summary>{t('Proposed billing settings')}</summary>
                <p class="subtle">{t('Proposed settings help')}</p>
                <FieldGroup columns="2">
                  <Field id="policy-billing-rule" label={t('Billing rule reference')}
                    ><input
                      id="policy-billing-rule"
                      name="billingRuleId"
                      maxlength="200"
                      value={value('billingRuleId')}
                    /></Field
                  >
                  <Field id="policy-effective-from" label={t('Effective from')}
                    ><input
                      id="policy-effective-from"
                      name="effectiveFrom"
                      type="date"
                      value={value('effectiveFrom')}
                    /></Field
                  >
                  <Field id="policy-effective-to" label={t('Effective to')}
                    ><input
                      id="policy-effective-to"
                      name="effectiveTo"
                      type="date"
                      value={value('effectiveTo')}
                    /></Field
                  >
                  <Field id="policy-stream-type" label={t('Stream type')}
                    ><select id="policy-stream-type" name="streamType" value={value('streamType')}
                      ><option value="">{t('No change')}</option><option value="labor"
                        >{t('Labor')}</option
                      ><option value="expense">{t('Expenses')}</option><option value="milestone"
                        >{t('Milestone')}</option
                      ><option value="other">{t('Other stream')}</option></select
                    ></Field
                  >
                  <Field id="policy-cadence" label={t('Cadence')}
                    ><select id="policy-cadence" name="cadenceType" value={value('cadenceType')}
                      ><option value="">{t('No change')}</option><option value="weekly"
                        >{t('Weekly')}</option
                      ><option value="every_14_days">{t('Every 14 days')}</option><option
                        value="semi_monthly">{t('Semi-monthly')}</option
                      ><option value="monthly">{t('Monthly')}</option><option value="custom"
                        >{t('Custom')}</option
                      ><option value="milestone">{t('Milestone')}</option><option value="manual"
                        >{t('Manual')}</option
                      ></select
                    ></Field
                  >
                  <Field id="policy-currency" label={t('Currency')}
                    ><input
                      id="policy-currency"
                      name="proposalCurrency"
                      maxlength="3"
                      pattern="[A-Za-z]{3}"
                      autocapitalize="characters"
                      value={value('proposalCurrency')}
                    /></Field
                  >
                  <Field id="policy-expenses" label={t('Include expenses')}
                    ><select
                      id="policy-expenses"
                      name="includeExpenses"
                      value={value('includeExpenses')}
                      ><option value="">{t('No change')}</option><option value="true"
                        >{t('Yes')}</option
                      ><option value="false">{t('No')}</option></select
                    ></Field
                  >
                  <Field id="policy-minimum" label={t('Minimum minutes per day')}
                    ><input
                      id="policy-minimum"
                      name="minimumMinutes"
                      type="number"
                      min="0"
                      max="1440"
                      step="1"
                      value={value('minimumMinutes')}
                    /></Field
                  >
                  <Field
                    id="policy-fixed-price"
                    label={t('Fixed price')}
                    help={t('Fixed price help')}
                    ><input
                      id="policy-fixed-price"
                      name="fixedPrice"
                      inputmode="decimal"
                      pattern={'[0-9]{1,16}(\\.[0-9]{1,2})?'}
                      value={value('fixedPrice')}
                    /></Field
                  >
                  <Field id="policy-proposal-note" label={t('Proposal note')}
                    ><input
                      id="policy-proposal-note"
                      name="proposalNote"
                      maxlength="2000"
                      value={value('proposalNote')}
                    /></Field
                  >
                </FieldGroup>
              </details>
              <ActionBar><button type="submit">{t('Save follow-up')}</button></ActionBar>
            </form>
          </FormCard>
          <div class="work-item-list">
            {#if data.workItems.length === 0}<p class="empty">
                {t('No authorized operational work is currently listed here.')}
              </p>{/if}
            {#each data.workItems as item (item.id)}
              <article class="record-card" id={`item-${item.id}`}>
                <div class="record-topline">
                  <div>
                    <h3>{item.title}</h3>
                    <p class="record-meta">
                      {item.projectNumber} · {item.projectName} · {kindLabel(item.kind)}
                    </p>
                  </div>
                  <StatusBadge
                    variant={statusVariant(item.status)}
                    text={workflowStatus(locale, item.status)}
                  />
                </div>
                {#if item.description}<p>{item.description}</p>{/if}
                {#if item.policyReference}<p class="record-meta">
                    {t('Policy reference')}: {item.policyReference}
                  </p>{/if}
                {#if item.proposedSettings}<details class="evidence-editor">
                    <summary>{t('Proposed billing settings')}</summary>
                    <dl>
                      {#each proposalSummary(item.proposedSettings) as setting}<dt>
                          {setting.label}
                        </dt>
                        <dd>{setting.value}</dd>{/each}
                    </dl>
                  </details>{/if}
                <p class="record-meta">
                  {t('Owner')}: {ownerChoices(item.projectId).find(
                    (owner) => owner.id === item.ownerId,
                  )?.name ?? t('Unknown owner')} · {t('Due date')}: {item.dueOn ??
                    t('Not available')}
                </p>
                <form method="POST" action="?/updateWorkItem" class="item-form">
                  <input type="hidden" name="id" value={item.id} /><input
                    type="hidden"
                    name="projectId"
                    value={item.projectId}
                  /><input type="hidden" name="expectedVersion" value={item.version} /><input
                    type="hidden"
                    name="requestKey"
                    value={item.requestKey}
                  /><input type="hidden" name="lang" value={locale} />
                  <FieldGroup columns="2"
                    ><Field id={`finance-status-${item.id}`} label={t('Status')}
                      ><select id={`finance-status-${item.id}`} name="status" value={item.status}
                        >{#each allowedTransitions(item.status, false) as status}<option
                            value={status}>{workflowStatus(locale, status)}</option
                          >{/each}</select
                      ></Field
                    ><Field id={`finance-owner-${item.id}`} label={t('Owner')}
                      ><select id={`finance-owner-${item.id}`} name="ownerId" value={item.ownerId}
                        >{#each item.kind === 'policy_review' ? policyOwners(item.projectId) : ownerChoices(item.projectId) as owner}<option
                            value={owner.id}>{owner.name}</option
                          >{/each}</select
                      ></Field
                    ><Field id={`finance-due-${item.id}`} label={t('Due date')}
                      ><input
                        id={`finance-due-${item.id}`}
                        type="date"
                        name="dueOn"
                        value={item.dueOn ?? ''}
                      /></Field
                    >{#if item.kind === 'policy_review'}<Field
                        id={`finance-policy-reference-${item.id}`}
                        label={t('Policy reference')}
                        ><input
                          id={`finance-policy-reference-${item.id}`}
                          name="policyReference"
                          value={item.policyReference ?? ''}
                          maxlength="1000"
                        /></Field
                      >{/if}<Field
                      id={`finance-reason-${item.id}`}
                      label={t('Review reason')}
                      required
                      ><input
                        id={`finance-reason-${item.id}`}
                        name="reason"
                        required
                        maxlength="2000"
                        placeholder={t('Explain the evidence or reason for this status change.')}
                      /></Field
                    ></FieldGroup
                  >
                  {#if item.kind === 'policy_review'}
                    <details class="evidence-editor">
                      <summary>{t('Edit proposed billing settings')}</summary><FieldGroup
                        columns="2"
                      >
                        <Field
                          id={`finance-billing-rule-${item.id}`}
                          label={t('Billing rule reference')}
                          ><input
                            id={`finance-billing-rule-${item.id}`}
                            name="billingRuleId"
                            maxlength="200"
                            value={proposalValue(item.proposedSettings, 'billingRuleId')}
                          /></Field
                        >
                        <Field id={`finance-effective-from-${item.id}`} label={t('Effective from')}
                          ><input
                            id={`finance-effective-from-${item.id}`}
                            name="effectiveFrom"
                            type="date"
                            value={proposalValue(item.proposedSettings, 'effectiveFrom')}
                          /></Field
                        >
                        <Field id={`finance-effective-to-${item.id}`} label={t('Effective to')}
                          ><input
                            id={`finance-effective-to-${item.id}`}
                            name="effectiveTo"
                            type="date"
                            value={proposalValue(item.proposedSettings, 'effectiveTo')}
                          /></Field
                        >
                        <Field id={`finance-stream-type-${item.id}`} label={t('Stream type')}
                          ><select
                            id={`finance-stream-type-${item.id}`}
                            name="streamType"
                            value={proposalValue(item.proposedSettings, 'streamType')}
                            ><option value="">{t('No change')}</option><option value="labor"
                              >{t('Labor')}</option
                            ><option value="expense">{t('Expenses')}</option><option
                              value="milestone">{t('Milestone')}</option
                            ><option value="other">{t('Other stream')}</option></select
                          ></Field
                        >
                        <Field id={`finance-cadence-${item.id}`} label={t('Cadence')}
                          ><select
                            id={`finance-cadence-${item.id}`}
                            name="cadenceType"
                            value={proposalValue(item.proposedSettings, 'cadenceType')}
                            ><option value="">{t('No change')}</option><option value="weekly"
                              >{t('Weekly')}</option
                            ><option value="every_14_days">{t('Every 14 days')}</option><option
                              value="semi_monthly">{t('Semi-monthly')}</option
                            ><option value="monthly">{t('Monthly')}</option><option value="custom"
                              >{t('Custom')}</option
                            ><option value="milestone">{t('Milestone')}</option><option
                              value="manual">{t('Manual')}</option
                            ></select
                          ></Field
                        >
                        <Field id={`finance-currency-${item.id}`} label={t('Currency')}
                          ><input
                            id={`finance-currency-${item.id}`}
                            name="proposalCurrency"
                            maxlength="3"
                            pattern="[A-Za-z]{3}"
                            autocapitalize="characters"
                            value={proposalValue(item.proposedSettings, 'currency')}
                          /></Field
                        >
                        <Field id={`finance-expenses-${item.id}`} label={t('Include expenses')}
                          ><select
                            id={`finance-expenses-${item.id}`}
                            name="includeExpenses"
                            value={proposalValue(item.proposedSettings, 'includeExpenses')}
                            ><option value="">{t('No change')}</option><option value="true"
                              >{t('Yes')}</option
                            ><option value="false">{t('No')}</option></select
                          ></Field
                        >
                        <Field
                          id={`finance-minimum-${item.id}`}
                          label={t('Minimum minutes per day')}
                          ><input
                            id={`finance-minimum-${item.id}`}
                            name="minimumMinutes"
                            type="number"
                            min="0"
                            max="1440"
                            step="1"
                            value={proposalValue(item.proposedSettings, 'minimumMinutes')}
                          /></Field
                        >
                        <Field
                          id={`finance-fixed-price-${item.id}`}
                          label={t('Fixed price')}
                          help={t('Fixed price help')}
                          ><input
                            id={`finance-fixed-price-${item.id}`}
                            name="fixedPrice"
                            inputmode="decimal"
                            pattern={'[0-9]{1,16}(\\.[0-9]{1,2})?'}
                            value={proposalValue(item.proposedSettings, 'fixedPriceMinor')}
                          /></Field
                        >
                        <Field id={`finance-proposal-note-${item.id}`} label={t('Proposal note')}
                          ><input
                            id={`finance-proposal-note-${item.id}`}
                            name="proposalNote"
                            maxlength="2000"
                            value={proposalValue(item.proposedSettings, 'note')}
                          /></Field
                        >
                      </FieldGroup>
                    </details>
                  {/if}
                  <ActionBar><button type="submit">{t('Update follow-up')}</button></ActionBar>
                </form>
              </article>
            {/each}
          </div>
        </div>
      </SectionCard>
    {/if}
  {/if}
</main>

<style>
  .workflow-page {
    display: grid;
    gap: 1.25rem;
    max-width: 78rem;
    margin: 0 auto;
    padding: clamp(1rem, 3vw, 2rem);
  }
  .page-heading {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }
  .page-heading h1 {
    margin: 0;
    font-size: clamp(1.65rem, 4vw, 2.35rem);
    line-height: 1.15;
  }
  .eyebrow {
    margin: 0 0 0.35rem;
    color: var(--color-text-muted, #475569);
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .intro {
    max-width: 52rem;
    margin: 0.6rem 0 0;
    color: var(--color-text-muted, #475569);
  }
  .workspace-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(18rem, 1.15fr);
    gap: 1rem;
    align-items: start;
  }
  .workspace-grid :global(.ui-field-group) {
    grid-template-columns: minmax(0, 1fr);
  }
  .workspace-grid :global(.ui-field),
  .workspace-grid :global(.ui-field-control) {
    min-width: 0;
  }
  .project-groups,
  .work-item-list {
    display: grid;
    gap: 0.85rem;
  }
  .project-group {
    border-top: 1px solid var(--color-border, #d7dee8);
    padding-top: 0.9rem;
  }
  .project-group h3 {
    margin: 0 0 0.6rem;
  }
  .card-list,
  .evidence-list,
  .reason-list {
    display: grid;
    gap: 0.7rem;
    margin: 0.75rem 0 0;
    padding: 0;
    list-style: none;
  }
  .compact-list {
    margin-top: 0;
  }
  .record-card {
    min-width: 0;
    padding: 0.9rem;
    border: 1px solid var(--color-border, #d7dee8);
    border-radius: 0.8rem;
    background: var(--color-surface, #fff);
  }
  .record-card h3,
  .record-card h4 {
    margin: 0;
    font-size: 1rem;
  }
  .record-topline {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem;
  }
  .record-topline > * {
    min-width: 0;
  }
  .record-title {
    overflow-wrap: anywhere;
    margin: 0.25rem 0 0;
  }
  .record-meta,
  .subtle {
    color: var(--color-text-muted, #475569);
    font-size: 0.9rem;
  }
  .record-meta {
    margin: 0.35rem 0;
    overflow-wrap: anywhere;
  }
  .text-link {
    display: inline-block;
    margin-top: 0.45rem;
    font-weight: 650;
  }
  .empty {
    padding: 0.8rem 0;
    color: var(--color-text-muted, #475569);
  }
  .notice,
  .read-only-note {
    padding: 0.8rem 1rem;
    border-radius: 0.65rem;
    background: #fff7ed;
    color: #7c2d12;
  }
  .notice.success {
    background: #ecfdf5;
    color: #14532d;
  }
  .read-only-note {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    background: #eff6ff;
    color: #1e3a8a;
  }
  .filter-form,
  .item-form {
    display: grid;
    gap: 0.9rem;
  }
  .filter-form {
    margin-bottom: 1rem;
  }
  .source-choice {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding-top: 0.7rem;
    font-weight: 650;
  }
  .source-choice input {
    width: 1.1rem;
    height: 1.1rem;
  }
  .evidence-editor {
    margin-top: 0.65rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--color-border, #d7dee8);
    border-radius: 0.6rem;
  }
  .evidence-editor summary,
  details summary {
    cursor: pointer;
    font-weight: 650;
  }
  .evidence-list {
    padding-left: 1rem;
    list-style: disc;
  }
  .reason-list {
    padding-left: 1.1rem;
    list-style: disc;
  }
  .reason-list li {
    margin: 0.3rem 0;
  }
  .report-review-link {
    margin-top: 1rem;
  }
  .button-link,
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.65rem;
    padding: 0.55rem 0.9rem;
    border: 1px solid var(--color-border-strong, #64748b);
    border-radius: 0.55rem;
    background: var(--color-primary, #164e63);
    color: white;
    text-decoration: none;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  :global(.ui-field-control input),
  :global(.ui-field-control select),
  :global(.ui-field-control textarea) {
    max-width: 100%;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  @media (max-width: 48rem) {
    .workflow-page {
      padding: 1rem 0.75rem;
    }
    .workspace-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .record-topline {
      flex-direction: column;
    }
    .record-topline :global([data-ui='status-badge']) {
      align-self: flex-start;
    }
    .filter-form :global(.ui-field-group),
    .item-form :global(.ui-field-group) {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
