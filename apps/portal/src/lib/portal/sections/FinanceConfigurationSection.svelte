<script lang="ts">
  import DirectionIcon from '../ui/DirectionIcon.svelte';
  import TimeCategorySelect from '../ui/TimeCategorySelect.svelte';
  import UnusedIssuingAuthorityReplacementForm from './UnusedIssuingAuthorityReplacementForm.svelte';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { FormCard, FormSection, FieldGroup, Field, ProblemNotice, formValidation } from '../ui';
  import type { ProblemData } from '../../problem/contract';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import { documentLanguage, portalText, type PortalLocale } from '../../portal-i18n';
  import { paymentMoney } from '../payment-money';
  import { expenseCategories } from '../expense-categories';
  import { confirmDirtyForms, dirtyFormGuard } from '../dirty-form-guard';

  let {
    data,
    availableProjects,
    isAuditor,
    translate,
    controlledValue,
    locale = 'en',
    reimbursementProblem = null,
    reimbursementRemedyLinks = {},
    policyProblem = null,
    policyRemedyLinks = {},
    commercialAssignmentProblem = null,
    commercialAssignmentRemedyLinks = {},
  }: {
    data: PortalData;
    locale?: PortalLocale;
    availableProjects: Row[];
    isAuditor: boolean;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
    reimbursementProblem?: ProblemData | null;
    reimbursementRemedyLinks?: Readonly<
      Record<string, { label: string; href?: string; reload?: boolean }>
    >;
    policyProblem?: ProblemData | null;
    policyRemedyLinks?: Readonly<
      Record<string, { label: string; href?: string; reload?: boolean }>
    >;
    commercialAssignmentProblem?: ProblemData | null;
    commercialAssignmentRemedyLinks?: Readonly<
      Record<string, { label: string; href?: string; reload?: boolean }>
    >;
  } = $props();

  let compensationRuleType = $state('Hourly');

  function compensationRuleLabel(ruleType: string): string {
    const labels: Record<string, string> = {
      Hourly: 'Hourly',
      Daily: 'Daily',
      FixedPerBillingPeriod: 'Fixed per billing period',
      FixedProjectAmount: 'Fixed project amount',
      PercentageOfEligibleClientLabor: 'Percentage of eligible client labor',
      CustomApprovedAdjustment: 'Custom approved adjustment',
    };
    return translate(labels[ruleType] ?? ruleType);
  }

  const rowValue = (row: Row, ...keys: string[]): string => {
    for (const key of keys) {
      const value = row[key];
      if (value !== null && value !== undefined && value !== '') return String(value);
    }
    return '';
  };
  const selectedProjectCurrency = $derived(
    rowValue(
      availableProjects.find((project) => String(project.id) === String(data.selectedProjectId)) ??
        {},
      'currency',
    ) || 'USD',
  );

  function expenseRecoveryLabel(value: string): string {
    const labels: Record<string, string> = {
      at_cost: 'Bill at cost',
      markup: 'Bill with markup',
      included: 'Included in labor price',
      non_billable: 'Non-billable',
      client_direct: 'Customer paid directly',
    };
    return translate(labels[value] ?? value);
  }

  function workerReimbursementLabel(value: string): string {
    return translate(
      value === 'at_cost' ? 'Reimburse at cost' : value === 'none' ? 'Do not reimburse' : value,
    );
  }
  const reimbursementReview = $derived(data.reimbursementReview);
  const reimbursementReviewHasPeople = $derived(Boolean(data.commercialTermsSummary?.length));
  const reviewPayers = [
    ['worker', 'Worker'],
    ['company_card', 'Company card'],
    ['company_direct', 'Company'],
    ['client', 'Client'],
    ['third_party', 'Third party'],
  ] as const;
  function reimbursementReviewIssue(issue: string): string {
    const labels: Record<string, string> = {
      invalid_date: 'Choose a valid work date to review reimbursement.',
      invalid_payer: 'Choose who paid the expense to review reimbursement.',
      invalid_category: 'Choose an expense category to review reimbursement.',
      person_required: 'Choose a person to review reimbursement.',
      person_unavailable:
        'The selected person is unavailable for this project and date. Choose a person again.',
      missing_assignment: 'No assignment covers this person and work date.',
      ambiguous_assignment:
        'More than one assignment covers this person and work date. Ask the owner to review the assignments.',
      missing_policy: 'No expense policy matches this person, date, payer and category.',
      context_changed: 'The assignment context changed. Review the person and date again.',
    };
    return translate(labels[issue] ?? 'Choose a person to review reimbursement.');
  }
  function reimbursementReviewSource(source: string): string {
    const labels: Record<string, string> = {
      assignment_override: 'Person reimbursement override',
      project_default: 'Project reimbursement default',
      person_policy: 'Person expense policy fallback',
      non_worker_payer: 'The expense was not paid by the worker',
    };
    return translate(labels[source] ?? 'Person expense policy fallback');
  }

  const projectLabel = (project: Row): string => {
    const number = rowValue(project, 'projectNumber', 'project_number');
    const name = rowValue(project, 'name', 'projectName', 'project_name');
    if (number && name && number !== name) return `${number} — ${name}`;
    return number || name || translate('Unnamed project');
  };

  function ruleWorkerLabel(rule: Row): string {
    const workerId = rowValue(rule, 'workerId', 'worker_id');
    const worker = (data.workers ?? []).find((candidate) => String(candidate.id) === workerId);
    return (
      rowValue(rule, 'workerName', 'worker_name') ||
      (worker ? rowValue(worker, 'name') : '') ||
      translate('Assigned person')
    );
  }

  function ruleProjectLabel(rule: Row): string {
    const projectId = rowValue(rule, 'projectId', 'project_id');
    const project = availableProjects.find((candidate) => String(candidate.id) === projectId);
    return project
      ? projectLabel(project)
      : rowValue(rule, 'projectName', 'project_name', 'projectNumber', 'project_number') ||
          translate('Unnamed project');
  }

  function minorToDecimal(value: unknown): string {
    const raw = String(value ?? '').trim();
    if (!/^\d+$/.test(raw)) return '0.00';
    const normalized = raw.replace(/^0+(?=\d)/, '').padStart(3, '0');
    return `${normalized.slice(0, -2)}.${normalized.slice(-2)}`;
  }

  function decimalToMinor(raw: string): string | null {
    const value = raw.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
    const [whole, fraction = ''] = value.split('.');
    const paddedFraction = `${fraction}00`.slice(0, 2);
    return `${whole}${paddedFraction}`.replace(/^0+(?=\d)/, '') || '0';
  }

  function percentToBps(raw: string): string | null {
    const value = raw.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) > 100) return null;
    const [whole, fraction = ''] = value.split('.');
    const paddedFraction = `${fraction}00`.slice(0, 2);
    return `${whole}${paddedFraction}`.replace(/^0+(?=\d)/, '') || '0';
  }

  function multiplierToBps(raw: string): string | null {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 10) return null;
    return String(Math.round(value * 10_000));
  }

  function syncCanonicalInput(
    input: HTMLInputElement,
    targetName: string,
    parsed: string | null,
    message: string,
  ): void {
    const hidden = input.form?.elements.namedItem(targetName) as HTMLInputElement | null;
    if (parsed === null) {
      input.setCustomValidity(translate(message));
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    input.setCustomValidity('');
    input.removeAttribute('aria-invalid');
    if (hidden) hidden.value = parsed;
  }

  function syncDecimalToMinor(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    syncCanonicalInput(
      input,
      input.dataset.minorTarget ?? '',
      decimalToMinor(input.value),
      'Enter a valid amount with no more than two decimal places.',
    );
  }

  function syncPercentToBps(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    syncCanonicalInput(
      input,
      input.dataset.bpsTarget ?? '',
      percentToBps(input.value),
      'Enter a valid percentage from 0 to 100.',
    );
  }

  function syncMultiplierToBps(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    syncCanonicalInput(
      input,
      input.dataset.bpsTarget ?? '',
      multiplierToBps(input.value),
      'Enter a valid multiplier from 0 to 10.',
    );
  }

  const moneyLabel = (row: Row, ...keys: string[]): string => {
    const value = rowValue(row, ...keys);
    const currency = rowValue(row, 'currency');
    return value ? paymentMoney(value, currency || 'USD', documentLanguage(locale)) : '—';
  };

  const booleanValue = (row: Row, ...keys: string[]): boolean =>
    ['true', '1', 'yes', 'on'].includes(rowValue(row, ...keys).toLowerCase());

  const policyDecision = (row: Row, ...keys: string[]): string =>
    booleanValue(row, ...keys) ? translate('Yes') : translate('No');

  const termIssueLabel = (code: string): string => {
    const labels: Record<string, string> = {
      missing_assignment: 'No active assignment for this date',
      ambiguous_assignment: 'Overlapping active assignments',
      missing_client_rate: 'Customer hourly rate required',
      missing_compensation_rule: 'Worker compensation rule required',
      missing_internal_cost_rule: 'Internal cost rule required',
      ambiguous_client_rate: 'Overlapping customer rates',
      ambiguous_compensation_rule: 'Overlapping worker compensation rules',
      ambiguous_internal_cost_rule: 'Overlapping internal cost rules',
      unavailable_client_override: 'Customer-rate override does not apply',
      unavailable_compensation_override: 'Compensation override does not apply',
      unavailable_internal_cost_override: 'Internal-cost override does not apply',
    };
    return translate(labels[code] ?? code);
  };

  const ruleMoney = (row: Row, amountKey: string, currencyKey: string): string => {
    const amount = row[amountKey];
    const currency = row[currencyKey];
    return amount !== null && amount !== undefined && currency
      ? paymentMoney(amount, String(currency), documentLanguage(locale))
      : '—';
  };

  const termsSourceLabel = (source: string): string => {
    const labels: Record<string, string> = {
      assignment_override: 'Assignment override',
      assignment_rule: 'Selected for this person',
      worker_project: 'Person on this project',
      project_default: 'Project default',
      worker_global: 'Person global fallback',
    };
    return source ? translate(labels[source] ?? source) : '—';
  };

  const assignmentRuleOptions = (rules: Row[] | undefined, terms: Row, kind: 'client' | 'worker') =>
    (rules ?? []).filter((rule) => {
      const projectId = rowValue(rule, 'projectId', 'project_id');
      const workerId = rowValue(rule, 'workerId', 'worker_id');
      const effectiveFrom = rowValue(rule, 'effectiveFrom', 'effective_from');
      const effectiveTo = rowValue(rule, 'effectiveTo', 'effective_to');
      const assignmentStart = rowValue(terms, 'assignmentStartsOn');
      const assignmentEnd = rowValue(terms, 'assignmentEndsOn');
      if (
        effectiveFrom > assignmentStart ||
        (effectiveTo && (!assignmentEnd || effectiveTo < assignmentEnd)) ||
        rowValue(rule, 'currency') !== rowValue(terms, 'projectCurrency')
      )
        return false;
      return kind === 'client'
        ? projectId === String(data.selectedProjectId ?? '') &&
            (!workerId || workerId === rowValue(terms, 'workerId')) &&
            !rowValue(rule, 'category')
        : workerId === rowValue(terms, 'workerId') &&
            (!projectId || projectId === String(data.selectedProjectId ?? ''));
    });

  const assignmentRuleLabel = (rule: Row, moneyKey: string): string =>
    `${ruleMoney(rule, moneyKey === 'hourly_rate_minor' && ['daily', 'weekly'].includes(rowValue(rule, 'rateBasis', 'rate_basis')) ? 'unit_rate_minor' : moneyKey, 'currency')}${moneyKey === 'hourly_rate_minor' ? ` / ${translate(rowValue(rule, 'rateBasis', 'rate_basis') === 'daily' ? 'Daily' : rowValue(rule, 'rateBasis', 'rate_basis') === 'weekly' ? 'Weekly' : 'Hourly')}` : ''} · ${rowValue(rule, 'effectiveFrom', 'effective_from')} → ${rowValue(rule, 'effectiveTo', 'effective_to') || translate('open-ended')}`;

  function failedAssignmentRuleUnavailable(
    terms: Row,
    field: string,
    rules: Row[] | undefined,
    kind: 'client' | 'worker',
  ): string {
    const value = failedAssignmentValue(terms, 'setAssignmentCommercialRuleReferences', field);
    return value &&
      !assignmentRuleOptions(rules, terms, kind).some((rule) => rowValue(rule, 'id') === value)
      ? value
      : '';
  }

  const policyWriteRoles = ['owner_admin', 'finance_admin'];
  const canWritePolicy = $derived(!isAuditor && policyWriteRoles.includes(String(data.user.role)));
  const configurableCommercialTerms = $derived(
    (data.commercialTermsSummary ?? []).filter((terms) => terms.canConfigure === true),
  );
  const canManageCanonicalAuthority = $derived(
    !isAuditor && policyWriteRoles.includes(String(data.user.role)),
  );
  const failedCanonicalRevision = $derived.by(() => {
    const result = $page.form as
      | { success?: boolean; actionName?: string; values?: Record<string, unknown> }
      | null
      | undefined;
    return result?.success === false && result.actionName === 'createCanonicalLegalEntityRevision'
      ? result
      : null;
  });
  function canonicalRevisionValue(field: string, fallback = ''): string {
    const value = failedCanonicalRevision?.values?.[field];
    return typeof value === 'string' ? value : fallback;
  }
  const failedConfigurationAction = $derived.by(() => {
    const result = $page.form as
      | { success?: boolean; actionName?: string; values?: Record<string, unknown> }
      | null
      | undefined;
    return result?.success === false ? result : null;
  });
  function failedValue(actionName: string, field: string): string | undefined {
    if (failedConfigurationAction?.actionName !== actionName) return undefined;
    const value = failedConfigurationAction.values?.[field];
    return typeof value === 'string' ? value : undefined;
  }
  function failedAssignmentValue(
    terms: Row,
    actionName: string,
    field: string,
  ): string | undefined {
    return failedValue(actionName, 'projectMemberId') === rowValue(terms, 'assignmentId')
      ? failedValue(actionName, field)
      : undefined;
  }
  function failedPolicyFormIsDirty(actionName: string, memberId?: string): boolean {
    if (failedConfigurationAction?.actionName !== actionName) return false;
    if (
      actionName === 'setProjectReimbursementDefault' &&
      failedValue(actionName, 'projectId') !== String(data.selectedProjectId)
    )
      return false;
    if (memberId && failedValue(actionName, 'projectMemberId') !== memberId) return false;
    if (
      actionName === 'createAssignmentExpensePolicy' &&
      policyCurrent &&
      policyCurrent.projectId !== data.selectedProjectId
    )
      return false;
    const fields =
      actionName === 'createAssignmentExpensePolicy'
        ? [
            'projectMemberId',
            'payer',
            'category',
            'effectiveFrom',
            'effectiveTo',
            'workerReimbursement',
            'clientRecovery',
          ]
        : ['mode', 'effectiveFrom', 'reason'];
    return fields.some((field) => failedValue(actionName, field) !== undefined);
  }
  function confirmReimbursementReview(event: SubmitEvent): void {
    const form = event.currentTarget as HTMLFormElement;
    const region = form.closest<HTMLElement>('[data-assignment-expense-policies]');
    if (!confirmDirtyForms(region, translate('finance.reimbursement.review.confirm')))
      event.preventDefault();
  }
  function reimbursementFieldError(
    actionName: string,
    field: string,
    memberId?: string,
  ): string | undefined {
    if (failedConfigurationAction?.actionName !== actionName) return undefined;
    if (memberId && failedValue(actionName, 'projectMemberId') !== memberId) return undefined;
    if (!memberId && failedValue(actionName, 'projectId') !== String(data.selectedProjectId))
      return undefined;
    const errors = reimbursementProblem?.fieldErrors?.[field];
    return errors?.[0] ? translate(errors[0]) : undefined;
  }
  function reimbursementPreferenceStatus(row: Row): string {
    const asOf = data.reimbursementPreferenceAsOf ?? data.financeToday ?? '';
    if (rowValue(row, 'effectiveFrom') > asOf) return translate('Scheduled');
    const active = data.reimbursementPreferenceHistory?.find(
      (candidate) =>
        rowValue(candidate, 'projectMemberId') === rowValue(row, 'projectMemberId') &&
        rowValue(candidate, 'effectiveFrom') <= asOf,
    );
    return translate(active?.id === row.id ? 'Effective on selected date' : 'Historical');
  }
  function configurationActionUrl(actionName: string, hash = ''): string {
    const query = new URLSearchParams($page.url.searchParams);
    // URLSearchParams decodes percent-encoded named-action keys before iteration.
    for (const key of [...query.keys()]) {
      if (key.startsWith('/')) query.delete(key);
    }
    query.set('view', 'commercial');
    query.set('project', String(data.selectedProjectId ?? ''));
    query.set('lang', locale);
    query.set('task', selectedAction);
    return `?/${actionName}&${query.toString()}${hash ? `#${hash}` : ''}`;
  }
  function reimbursementActionUrl(actionName: string): string {
    const url = new URL(configurationActionUrl(actionName, 'person-expense-policies'), $page.url);
    url.searchParams.set('asOf', data.reimbursementPreferenceAsOf ?? data.financeToday ?? '');
    url.searchParams.set('category', data.commercialCategory ?? 'regular');
    return `${url.search}${url.hash}`;
  }
  function assignmentRuleChoiceLabel(
    terms: Row,
    ruleId: string,
    rules: Row[] | undefined,
    kind: 'client' | 'worker',
    moneyKey: string,
  ): string {
    if (!ruleId) return translate('Resolve by project and date');
    const rule = assignmentRuleOptions(rules, terms, kind).find(
      (candidate) => rowValue(candidate, 'id') === ruleId,
    );
    return rule
      ? assignmentRuleLabel(rule, moneyKey)
      : translate('problem.finance.assignmentCommercialUnavailableOption');
  }

  function assignmentChoiceComparison(
    terms: Row,
    actionName: 'setAssignmentCommercialFallback' | 'setAssignmentCommercialRuleReferences',
  ): Array<{ label: string; current: string; attempted: string; changed: boolean }> {
    if (actionName === 'setAssignmentCommercialFallback')
      return [
        {
          field: 'allowGlobalCompensation',
          label: translate('Global worker pay fallback'),
          current: terms.allowGlobalCompensation ? 'yes' : 'no',
        },
        {
          field: 'allowGlobalInternalCost',
          label: translate('Global internal cost fallback'),
          current: terms.allowGlobalInternalCost ? 'yes' : 'no',
        },
      ].flatMap(({ field, label, current }) => {
        const attempted = failedAssignmentValue(terms, actionName, field);
        return attempted === undefined
          ? []
          : [
              {
                label,
                current: translate(current === 'yes' ? 'On' : 'Off'),
                attempted: translate(attempted === 'yes' ? 'On' : 'Off'),
                changed: current !== attempted,
              },
            ];
      });

    return [
      {
        field: 'clientBillRuleId',
        label: translate('Customer hourly rule'),
        rules: data.clientLaborRates,
        kind: 'client' as const,
        moneyKey: 'hourly_rate_minor',
        current: rowValue(terms, 'clientBillRuleId'),
      },
      {
        field: 'workerCompensationRuleId',
        label: translate('Worker compensation rule'),
        rules: data.compensationRules,
        kind: 'worker' as const,
        moneyKey: 'rate_minor',
        current: rowValue(terms, 'workerCompensationRuleId'),
      },
      {
        field: 'internalCostRuleId',
        label: translate('Internal cost rule'),
        rules: data.internalCostRules,
        kind: 'worker' as const,
        moneyKey: 'hourly_rate_minor',
        current: rowValue(terms, 'internalCostRuleId'),
      },
    ].flatMap(({ field, label, rules, kind, moneyKey, current }) => {
      const attempted = failedAssignmentValue(terms, actionName, field);
      return attempted === undefined
        ? []
        : [
            {
              label,
              current: assignmentRuleChoiceLabel(terms, current, rules, kind, moneyKey),
              attempted: assignmentRuleChoiceLabel(terms, attempted, rules, kind, moneyKey),
              changed: current !== attempted,
            },
          ];
    });
  }
  function unavailableWorker(actionName: string): string | null {
    const workerId = failedValue(actionName, 'workerId');
    return workerId && !(data.workers ?? []).some((worker) => String(worker.id) === workerId)
      ? workerId
      : null;
  }
  function failedMinor(actionName: string, field: string, fallback: string): string {
    const value = failedValue(actionName, field);
    return value === undefined ? fallback : minorToDecimal(value);
  }
  function failedBps(actionName: string, field: string, fallback: string): string {
    const value = failedValue(actionName, field);
    if (value === undefined || !/^\d+$/.test(value)) return fallback;
    const decimal = Number(value) / 100;
    return Number.isFinite(decimal) ? String(decimal) : fallback;
  }
  function failedMultiplier(actionName: string, field: string, fallback: string): string {
    const value = failedValue(actionName, field);
    if (value === undefined || !/^\d+$/.test(value)) return fallback;
    const decimal = Number(value) / 10_000;
    return Number.isFinite(decimal) ? String(decimal) : fallback;
  }
  let overtimeEnabled = $state(true);
  let compensationOvertimeMethod = $state('NONE');
  let compensationRateBasis = $state('hourly');
  let clientOvertimeMethod = $state('BASE_RATE_MULTIPLIER');
  let internalOvertimeMethod = $state('BASE_RATE_MULTIPLIER');
  let expensePolicyPayer = $state('worker');
  let expensePolicyWorkerReimbursement = $state('at_cost');
  let expensePolicyClientRecovery = $state('at_cost');
  let selectedPolicyMemberId = $state('');
  type PolicyAssignmentCurrent = {
    projectId: string;
    workerName: string;
    startsOn: string;
    endsOn: string | null;
    status: string;
  };
  const policyCurrent = $derived(
    failedConfigurationAction?.actionName === 'createAssignmentExpensePolicy' &&
      'assignmentCurrent' in failedConfigurationAction
      ? (failedConfigurationAction.assignmentCurrent as PolicyAssignmentCurrent | undefined)
      : undefined,
  );
  const selectedPolicyAssignment = $derived(
    configurableCommercialTerms.find(
      (person) => rowValue(person, 'assignmentId') === selectedPolicyMemberId,
    ),
  );
  const unavailablePolicyMember = $derived(
    selectedPolicyMemberId && !selectedPolicyAssignment ? selectedPolicyMemberId : '',
  );
  const policyCategoryOptions = $derived.by(() => {
    // Preserve exact custom categories already used by operational records.
    // Historical policies do not define new operational category aliases.
    const categories: Array<readonly [string, string]> = [...expenseCategories];
    for (const expense of data.financeExpenses ?? []) {
      const category = rowValue(expense, 'category');
      if (category && !categories.some(([value]) => value === category))
        categories.push([category, category]);
    }
    const attempted = failedValue('createAssignmentExpensePolicy', 'category');
    if (attempted && !categories.some(([value]) => value === attempted))
      categories.push([attempted, attempted]);
    return categories;
  });
  const policyAssignmentStart = $derived(
    selectedPolicyAssignment ? rowValue(selectedPolicyAssignment, 'assignmentStartsOn') : '',
  );
  const policyAssignmentEnd = $derived(
    selectedPolicyAssignment ? rowValue(selectedPolicyAssignment, 'assignmentEndsOn') : '',
  );
  const configurationActions = [
    'Project issuing authority',
    'Project commercial and time policy',
    'Person expense policies',
    'Compensation statement rules',
    'Client labor rates',
    'Assignment budget context / internal loaded cost',
    'Settlement status',
    'Worker compensation',
    'Client labor rate',
    'Internal loaded cost',
  ];
  const actionTask: Record<string, string> = {
    createCanonicalLegalEntityRevision: 'Project issuing authority',
    assignProjectLegalEntity: 'Project issuing authority',
    replaceUnusedProjectIssuingAuthority: 'Project issuing authority',
    createProjectCommercialPolicy: 'Project commercial and time policy',
    setProjectReimbursementDefault: 'Person expense policies',
    setWorkerReimbursementOverride: 'Person expense policies',
    createAssignmentExpensePolicy: 'Person expense policies',
    settleCompensation: 'Settlement status',
    supersedeCompensationRule: 'Compensation statement rules',
    deactivateCompensationRule: 'Compensation statement rules',
    supersedeClientLaborRate: 'Client labor rates',
    deactivateClientLaborRate: 'Client labor rates',
    supersedeInternalCostRule: 'Assignment budget context / internal loaded cost',
    deactivateInternalCostRule: 'Assignment budget context / internal loaded cost',
    createCompensationRule: 'Worker compensation',
    createClientLaborRate: 'Client labor rate',
    createInternalCostRule: 'Internal loaded cost',
  };
  let selectedAction = $state(configurationActions[0]);
  const linkedProjectionSource = $derived.by(() => {
    const task = $page.url.searchParams.get('task');
    const sourceId = $page.url.searchParams.get('sourceRecord');
    const projectId = $page.url.searchParams.get('project');
    if (
      !sourceId ||
      !projectId ||
      projectId !== data.selectedProjectId ||
      !['Worker compensation', 'Internal loaded cost', 'Client labor rate'].includes(task ?? '')
    )
      return null;
    return data.finance?.timeEconomics?.find((row) => String(row.id ?? '') === sourceId) ?? null;
  });
  const linkedProjectionWorkerId = $derived.by(() => {
    const workerId = String(linkedProjectionSource?.workerId ?? '').trim();
    return data.workers?.some((worker) => String(worker.id) === workerId) ? workerId : '';
  });
  const linkedProjectionDate = $derived.by(() => {
    const workDate = String(linkedProjectionSource?.workDate ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/u.test(workDate) ? workDate : '';
  });
  $effect(() => {
    const failed = failedConfigurationAction;
    if (failed?.success === false && failed.actionName && actionTask[failed.actionName]) {
      selectedAction = actionTask[failed.actionName];
      return;
    }
    const linkedTask = $page.url.searchParams.get('task');
    if (linkedTask && configurationActions.includes(linkedTask)) {
      selectedAction = linkedTask;
      return;
    }
    if ($page.url.hash === '#project-commercial-policy')
      selectedAction = 'Project commercial and time policy';
    if ($page.url.hash === '#project-issuing-authority')
      selectedAction = 'Project issuing authority';
    if ($page.url.hash === '#person-expense-policies') selectedAction = 'Person expense policies';
  });
  $effect(() => {
    const action = failedConfigurationAction?.actionName;
    if (!action) return;
    const value = (field: string) => failedValue(action, field);
    if (action === 'createProjectCommercialPolicy')
      overtimeEnabled = value('overtimeEnabled') === 'true';
    if (action === 'createCompensationRule') {
      compensationRuleType = value('ruleType') ?? compensationRuleType;
      compensationOvertimeMethod = value('overtimeMethod') ?? compensationOvertimeMethod;
      compensationRateBasis = value('rateBasis') ?? compensationRateBasis;
    }
    if (action === 'createClientLaborRate')
      clientOvertimeMethod = value('overtimeMethod') ?? clientOvertimeMethod;
    if (action === 'createInternalCostRule')
      internalOvertimeMethod = value('overtimeMethod') ?? internalOvertimeMethod;
    if (action === 'createAssignmentExpensePolicy') {
      selectedPolicyMemberId = value('projectMemberId') ?? selectedPolicyMemberId;
      expensePolicyPayer = value('payer') ?? expensePolicyPayer;
      expensePolicyWorkerReimbursement =
        value('workerReimbursement') ?? expensePolicyWorkerReimbursement;
      expensePolicyClientRecovery = value('clientRecovery') ?? expensePolicyClientRecovery;
    }
  });
</script>

<FormCard title={translate('Finance configuration')} class="finance-config-panel">
  <div class="workspace-task-switcher">
    <label for="finance-configuration-task">{translate('Commercial policies')}</label>
    <select id="finance-configuration-task" bind:value={selectedAction} data-searchable="false">
      {#each configurationActions as action}<option value={action}>{translate(action)}</option
        >{/each}
    </select>
  </div>
  <div class="finance-config-intro">
    <div>
      <p class="portal-kicker">{translate('Commercial policies')}</p>
      <p class="finance-config-description">
        {translate(
          'Rates are effective-dated and resolved by assignment, category, activity, and project scope.',
        )}
      </p>
    </div>
    <a
      class="secondary-button finance-config-preview"
      href={`${base}/app/finance/preview?project=${encodeURIComponent(data.selectedProjectId ?? '')}`}
      >{translate('Commercial agreement and example')} <DirectionIcon direction="up-right" /></a
    >
  </div>
  <FormSection
    id="commercial-terms-summary"
    title={translate('How labor terms are selected')}
    description={translate(
      'Review each assigned person on a work date. These are selected rules, not a forecast or an invoice total.',
    )}
    data-commercial-terms-summary
  >
    <form method="GET" action={`${base}/app/finance`} class="admin-form-grid">
      <input type="hidden" name="view" value="commercial" />
      <input type="hidden" name="project" value={data.selectedProjectId ?? ''} />
      <FieldGroup columns="2">
        <Field id="commercial-summary-date" label={translate('Work date')}>
          <input
            id="commercial-summary-date"
            name="asOf"
            type="date"
            value={data.commercialAsOf ?? data.financeToday ?? ''}
            required
          />
        </Field>
        <Field id="commercial-summary-category" label={translate('Time category')}>
          <TimeCategorySelect
            id="commercial-summary-category"
            value={data.commercialCategory ?? 'regular'}
            required
            {translate}
          />
        </Field>
      </FieldGroup>
      <div class="form-actions"><button type="submit">{translate('Review terms')}</button></div>
    </form>
    {#if data.commercialTermsSummary?.length}
      <div class="record-list" aria-label={translate('Person-specific labor terms')}>
        {#each data.commercialTermsSummary as terms}
          <article
            class="record-list-item"
            id={`commercial-person-${rowValue(terms, 'assignmentId')}`}
            data-commercial-person={rowValue(terms, 'workerId')}
          >
            <div>
              <strong>{rowValue(terms, 'workerName')}</strong>
              <small>
                {translate('Current status')}: {controlledValue(
                  'status',
                  rowValue(terms, 'assignmentStatus'),
                )} · {translate('finance.commercialTerms.assignmentDates')}:
                {rowValue(terms, 'assignmentStartsOn')} → {rowValue(terms, 'assignmentEndsOn') ||
                  translate('Open assignment')}
              </small>
              {#if terms.historicalReadOnly === true}
                <small
                  ><strong>{translate('finance.commercialTerms.historicalReadOnly')}</strong></small
                >
                <small>{translate('finance.commercialTerms.historicalReadOnlyHelp')}</small>
              {/if}
              <small>
                {translate('Customer charge')}: {ruleMoney(
                  terms,
                  'clientRateMinor',
                  'clientCurrency',
                )}
                / {translate(
                  rowValue(terms, 'clientRateBasis') === 'daily'
                    ? 'Daily'
                    : rowValue(terms, 'clientRateBasis') === 'weekly'
                      ? 'Weekly'
                      : 'Hourly',
                )} · {translate('Source')}: {termsSourceLabel(rowValue(terms, 'clientSource'))}
              </small>
              <small>
                {translate('Worker pay')}: {ruleMoney(terms, 'payRateMinor', 'payCurrency')}
                · {translate('Method')}: {compensationRuleLabel(rowValue(terms, 'payMethod')) ||
                  '—'}
                · {translate('Source')}: {termsSourceLabel(rowValue(terms, 'paySource'))}
              </small>
              <small>
                {translate('Internal cost rate')}: {ruleMoney(
                  terms,
                  'internalRateMinor',
                  'internalCurrency',
                )}
              </small>
              {#if Array.isArray(terms.issueCodes) && terms.issueCodes.length}
                <small role="status">
                  {translate(
                    terms.historicalReadOnly === true
                      ? 'finance.commercialTerms.historicalIssues'
                      : 'Configuration required',
                  )}: {terms.issueCodes.map(termIssueLabel).join('; ')}
                </small>
              {/if}
              {#if canWritePolicy && terms.canConfigure === true}
                <details
                  class="assignment-commercial-editor"
                  open={Boolean(
                    commercialAssignmentProblem &&
                    failedAssignmentValue(
                      terms,
                      failedConfigurationAction?.actionName ?? '',
                      'projectMemberId',
                    ),
                  )}
                >
                  <summary>{translate('Configure this person')}</summary>
                  <form
                    method="POST"
                    action={configurationActionUrl('setAssignmentCommercialRuleReferences')}
                    class="admin-form-grid"
                    use:formValidation
                  >
                    {#if commercialAssignmentProblem && failedConfigurationAction?.actionName === 'setAssignmentCommercialRuleReferences' && failedValue('setAssignmentCommercialRuleReferences', 'projectMemberId') === rowValue(terms, 'assignmentId')}
                      <div data-finance-problem tabindex="-1">
                        <ProblemNotice
                          problem={commercialAssignmentProblem}
                          {locale}
                          status={commercialAssignmentProblem.code ===
                          'FINANCE_ASSIGNMENT_COMMERCIAL_LOCKED_BY_TIME'
                            ? translate('problem.finance.assignmentCommercialRecordedTime')
                            : commercialAssignmentProblem.code ===
                                'FINANCE_ASSIGNMENT_COMMERCIAL_VERSION_CHANGED'
                              ? translate('problem.finance.assignmentCommercialReviewStatus')
                              : undefined}
                          remedyLinks={commercialAssignmentRemedyLinks}
                        />
                        {#if commercialAssignmentProblem.code === 'FINANCE_ASSIGNMENT_COMMERCIAL_VERSION_CHANGED'}
                          <dl class="assignment-commercial-comparison">
                            {#each assignmentChoiceComparison(terms, 'setAssignmentCommercialRuleReferences') as choice}
                              <div>
                                <dt>{choice.label}</dt>
                                <dd>
                                  <span
                                    >{translate(
                                      'problem.finance.assignmentCommercialCurrentChoices',
                                    )}:</span
                                  >
                                  {choice.current}
                                </dd>
                                <dd>
                                  <span
                                    >{translate(
                                      'problem.finance.assignmentCommercialYourChoices',
                                    )}:</span
                                  >
                                  {choice.attempted}
                                </dd>
                                <dd class="assignment-commercial-comparison__result">
                                  {translate(
                                    choice.changed
                                      ? 'problem.finance.assignmentCommercialChoiceChanged'
                                      : 'problem.finance.assignmentCommercialChoiceSame',
                                  )}
                                </dd>
                              </div>
                            {/each}
                          </dl>
                        {/if}
                      </div>
                    {/if}
                    <input
                      type="hidden"
                      name="projectMemberId"
                      value={rowValue(terms, 'assignmentId')}
                    />
                    <input
                      type="hidden"
                      name="expectedVersion"
                      value={rowValue(terms, 'assignmentVersion')}
                    />
                    <FieldGroup columns="2">
                      <Field
                        id={`assignment-client-${rowValue(terms, 'assignmentId')}`}
                        label={translate('Customer hourly rule')}
                      >
                        <select
                          id={`assignment-client-${rowValue(terms, 'assignmentId')}`}
                          name="clientBillRuleId"
                          value={failedAssignmentValue(
                            terms,
                            'setAssignmentCommercialRuleReferences',
                            'clientBillRuleId',
                          ) ?? rowValue(terms, 'clientBillRuleId')}
                        >
                          <option value="">{translate('Resolve by project and date')}</option>
                          {#if failedAssignmentRuleUnavailable(terms, 'clientBillRuleId', data.clientLaborRates, 'client')}
                            <option
                              value={failedAssignmentRuleUnavailable(
                                terms,
                                'clientBillRuleId',
                                data.clientLaborRates,
                                'client',
                              )}
                              >{translate(
                                'problem.finance.assignmentCommercialUnavailableOption',
                              )}</option
                            >
                          {/if}
                          {#each assignmentRuleOptions(data.clientLaborRates, terms, 'client') as rule}
                            <option value={rowValue(rule, 'id')}
                              >{assignmentRuleLabel(rule, 'hourly_rate_minor')}</option
                            >
                          {/each}
                        </select>
                      </Field>
                      <Field
                        id={`assignment-pay-${rowValue(terms, 'assignmentId')}`}
                        label={translate('Worker compensation rule')}
                      >
                        <select
                          id={`assignment-pay-${rowValue(terms, 'assignmentId')}`}
                          name="workerCompensationRuleId"
                          value={failedAssignmentValue(
                            terms,
                            'setAssignmentCommercialRuleReferences',
                            'workerCompensationRuleId',
                          ) ?? rowValue(terms, 'workerCompensationRuleId')}
                        >
                          <option value="">{translate('Resolve by project and date')}</option>
                          {#if failedAssignmentRuleUnavailable(terms, 'workerCompensationRuleId', data.compensationRules, 'worker')}
                            <option
                              value={failedAssignmentRuleUnavailable(
                                terms,
                                'workerCompensationRuleId',
                                data.compensationRules,
                                'worker',
                              )}
                              >{translate(
                                'problem.finance.assignmentCommercialUnavailableOption',
                              )}</option
                            >
                          {/if}
                          {#each assignmentRuleOptions(data.compensationRules, terms, 'worker') as rule}
                            <option value={rowValue(rule, 'id')}
                              >{assignmentRuleLabel(rule, 'rate_minor')}</option
                            >
                          {/each}
                        </select>
                      </Field>
                      <Field
                        id={`assignment-cost-${rowValue(terms, 'assignmentId')}`}
                        label={translate('Internal cost rule')}
                      >
                        <select
                          id={`assignment-cost-${rowValue(terms, 'assignmentId')}`}
                          name="internalCostRuleId"
                          value={failedAssignmentValue(
                            terms,
                            'setAssignmentCommercialRuleReferences',
                            'internalCostRuleId',
                          ) ?? rowValue(terms, 'internalCostRuleId')}
                        >
                          <option value="">{translate('Resolve by project and date')}</option>
                          {#if failedAssignmentRuleUnavailable(terms, 'internalCostRuleId', data.internalCostRules, 'worker')}
                            <option
                              value={failedAssignmentRuleUnavailable(
                                terms,
                                'internalCostRuleId',
                                data.internalCostRules,
                                'worker',
                              )}
                              >{translate(
                                'problem.finance.assignmentCommercialUnavailableOption',
                              )}</option
                            >
                          {/if}
                          {#each assignmentRuleOptions(data.internalCostRules, terms, 'worker') as rule}
                            <option value={rowValue(rule, 'id')}
                              >{assignmentRuleLabel(rule, 'hourly_rate_minor')}</option
                            >
                          {/each}
                        </select>
                      </Field>
                    </FieldGroup>
                    <div class="form-actions">
                      <button
                        type="submit"
                        disabled={commercialAssignmentProblem?.code ===
                          'FINANCE_ASSIGNMENT_COMMERCIAL_VERSION_CHANGED' &&
                          failedValue(
                            'setAssignmentCommercialRuleReferences',
                            'projectMemberId',
                          ) === rowValue(terms, 'assignmentId')}
                        >{translate('Save person rules')}</button
                      >
                    </div>
                  </form>
                  <form
                    method="POST"
                    action={configurationActionUrl('setAssignmentCommercialFallback')}
                    class="admin-form-grid"
                    use:formValidation
                  >
                    {#if commercialAssignmentProblem && failedConfigurationAction?.actionName === 'setAssignmentCommercialFallback' && failedValue('setAssignmentCommercialFallback', 'projectMemberId') === rowValue(terms, 'assignmentId')}
                      <div data-finance-problem tabindex="-1">
                        <ProblemNotice
                          problem={commercialAssignmentProblem}
                          {locale}
                          status={commercialAssignmentProblem.code ===
                          'FINANCE_ASSIGNMENT_COMMERCIAL_LOCKED_BY_TIME'
                            ? translate('problem.finance.assignmentCommercialRecordedTime')
                            : commercialAssignmentProblem.code ===
                                'FINANCE_ASSIGNMENT_COMMERCIAL_VERSION_CHANGED'
                              ? translate('problem.finance.assignmentCommercialReviewStatus')
                              : undefined}
                          remedyLinks={commercialAssignmentRemedyLinks}
                        />
                        {#if commercialAssignmentProblem.code === 'FINANCE_ASSIGNMENT_COMMERCIAL_VERSION_CHANGED'}
                          <dl class="assignment-commercial-comparison">
                            {#each assignmentChoiceComparison(terms, 'setAssignmentCommercialFallback') as choice}
                              <div>
                                <dt>{choice.label}</dt>
                                <dd>
                                  <span
                                    >{translate(
                                      'problem.finance.assignmentCommercialCurrentChoices',
                                    )}:</span
                                  >
                                  {choice.current}
                                </dd>
                                <dd>
                                  <span
                                    >{translate(
                                      'problem.finance.assignmentCommercialYourChoices',
                                    )}:</span
                                  >
                                  {choice.attempted}
                                </dd>
                                <dd class="assignment-commercial-comparison__result">
                                  {translate(
                                    choice.changed
                                      ? 'problem.finance.assignmentCommercialChoiceChanged'
                                      : 'problem.finance.assignmentCommercialChoiceSame',
                                  )}
                                </dd>
                              </div>
                            {/each}
                          </dl>
                        {/if}
                      </div>
                    {/if}
                    <input
                      type="hidden"
                      name="projectMemberId"
                      value={rowValue(terms, 'assignmentId')}
                    />
                    <input
                      type="hidden"
                      name="expectedVersion"
                      value={rowValue(terms, 'assignmentVersion')}
                    />
                    <FieldGroup columns="2">
                      <Field
                        id={`assignment-pay-fallback-${rowValue(terms, 'assignmentId')}`}
                        label={translate('Global worker pay fallback')}
                      >
                        <select
                          id={`assignment-pay-fallback-${rowValue(terms, 'assignmentId')}`}
                          name="allowGlobalCompensation"
                          value={failedAssignmentValue(
                            terms,
                            'setAssignmentCommercialFallback',
                            'allowGlobalCompensation',
                          ) ?? (terms.allowGlobalCompensation ? 'yes' : 'no')}
                        >
                          <option value="no">{translate('Off')}</option><option value="yes"
                            >{translate('On')}</option
                          >
                        </select>
                      </Field>
                      <Field
                        id={`assignment-cost-fallback-${rowValue(terms, 'assignmentId')}`}
                        label={translate('Global internal cost fallback')}
                      >
                        <select
                          id={`assignment-cost-fallback-${rowValue(terms, 'assignmentId')}`}
                          name="allowGlobalInternalCost"
                          value={failedAssignmentValue(
                            terms,
                            'setAssignmentCommercialFallback',
                            'allowGlobalInternalCost',
                          ) ?? (terms.allowGlobalInternalCost ? 'yes' : 'no')}
                        >
                          <option value="no">{translate('Off')}</option><option value="yes"
                            >{translate('On')}</option
                          >
                        </select>
                      </Field>
                    </FieldGroup>
                    <div class="form-actions">
                      <button
                        type="submit"
                        disabled={commercialAssignmentProblem?.code ===
                          'FINANCE_ASSIGNMENT_COMMERCIAL_VERSION_CHANGED' &&
                          failedValue('setAssignmentCommercialFallback', 'projectMemberId') ===
                            rowValue(terms, 'assignmentId')}
                        >{translate('Save fallback options')}</button
                      >
                    </div>
                  </form>
                </details>
              {/if}
            </div>
          </article>
        {/each}
      </div>
      <p class="muted">
        {translate(
          'Customer labor uses approved billable time and the selected customer rule. Worker pay follows its separate method; expense reimbursement and customer recovery are calculated independently. Invoice totals also apply the configured minimums, caps, tax, and rounding.',
        )}
      </p>
    {:else}
      <p class="muted">{translate('No active project people on this date.')}</p>
    {/if}
  </FormSection>
  {#if selectedAction === 'Person expense policies'}
    <FormSection
      id="person-expense-policies"
      title={translate('Person expense policies')}
      description={translate(
        'Worker reimbursement follows the project default unless this person has an override. Customer billing is a separate expense policy. “Do not bill customer” excludes the expense from the invoice; it does not cancel worker reimbursement.',
      )}
      data-assignment-expense-policies
    >
      <p class="muted">
        {translate(
          'Reimbursement preferences apply from their effective date. Earlier claims keep their date-specific terms; classified amounts and paid history remain unchanged.',
        )}
      </p>
      {#if canManageCanonicalAuthority && data.selectedProjectId && reimbursementReview}
        <FormSection
          title={translate('Review reimbursement by date')}
          description={translate(
            'Review configured behavior for one person, payer and expense category. This does not approve an expense, calculate an amount or record a payment.',
          )}
          data-reimbursement-review
        >
          <form
            method="GET"
            action={`${base}/app/finance`}
            class="admin-form-grid"
            onsubmit={confirmReimbursementReview}
          >
            <input type="hidden" name="view" value="commercial" />
            <input type="hidden" name="project" value={data.selectedProjectId} />
            <input type="hidden" name="task" value="Person expense policies" />
            <input type="hidden" name="lang" value={locale} />
            <input type="hidden" name="category" value={data.commercialCategory ?? 'regular'} />
            <FieldGroup columns="2">
              <Field
                id="reimbursement-review-person"
                label={translate('Assigned person')}
                required={reimbursementReviewHasPeople}
                help={reimbursementReviewHasPeople
                  ? undefined
                  : translate(
                      'No people are listed for the reviewed date. Change the work date and select Review reimbursement to refresh the list, then choose a person.',
                    )}
              >
                <select
                  id="reimbursement-review-person"
                  name="policyPerson"
                  value={reimbursementReview.inputs.assignmentId}
                  required={reimbursementReviewHasPeople}
                >
                  <option value="">{translate('Select person')}</option>
                  {#each data.commercialTermsSummary ?? [] as person}
                    <option value={rowValue(person, 'assignmentId')}
                      >{rowValue(person, 'workerName')} · {rowValue(person, 'assignmentStartsOn')} →
                      {rowValue(person, 'assignmentEndsOn') || translate('Open assignment')}</option
                    >
                  {/each}
                </select>
              </Field>
              <Field id="reimbursement-review-date" label={translate('Work date')} required>
                <input
                  id="reimbursement-review-date"
                  name="asOf"
                  type="date"
                  value={reimbursementReview.inputs.date}
                  required
                />
              </Field>
              <Field id="reimbursement-review-payer" label={translate('Who paid')} required>
                <select
                  id="reimbursement-review-payer"
                  name="policyPayer"
                  value={reimbursementReview.inputs.payer}
                  required
                >
                  <option value="">{translate('Choose who paid')}</option>
                  {#each reviewPayers as [value, label]}<option {value}>{translate(label)}</option
                    >{/each}
                </select>
              </Field>
              <Field
                id="reimbursement-review-category"
                label={translate('Expense category')}
                required
              >
                <select
                  id="reimbursement-review-category"
                  name="policyCategory"
                  value={reimbursementReview.inputs.category}
                  required
                >
                  <option value="">{translate('Choose expense category')}</option>
                  {#each expenseCategories as [value, label]}<option {value}
                      >{translate(label)}</option
                    >{/each}
                </select>
              </Field>
            </FieldGroup>
            <div class="form-actions">
              <button type="submit">{translate('Review reimbursement')}</button>
            </div>
          </form>
          {#if reimbursementReview.status === 'resolved'}
            <article class="record-list-item" data-reimbursement-review-result>
              <div>
                <strong>{reimbursementReview.person.workerName}</strong>
                <small
                  >{translate('Work date')}: {reimbursementReview.inputs.date} · {translate(
                    'Who paid',
                  )}: {translate(
                    reviewPayers.find(
                      ([value]) => value === reimbursementReview.inputs.payer,
                    )?.[1] ?? '',
                  )} · {translate('Expense category')}: {translate(
                    expenseCategories.find(
                      ([value]) => value === reimbursementReview.inputs.category,
                    )?.[1] ?? '',
                  )}</small
                >
                <small
                  >{translate('Assignment dates')}: {reimbursementReview.person.startsOn} →
                  {reimbursementReview.person.endsOn || translate('Open assignment')}</small
                >
                <p>
                  <strong>{translate('Configured reimbursement')}:</strong>
                  {workerReimbursementLabel(reimbursementReview.behavior)}
                </p>
                <small
                  >{translate('Reimbursement source')}: {reimbursementReviewSource(
                    reimbursementReview.source,
                  )}{#if reimbursementReview.sourceEffectiveFrom}
                    · {translate('Effective from')}: {reimbursementReview.sourceEffectiveFrom}{/if}
                </small>
                <small
                  >{translate('Selected expense policy')}: {reimbursementReview.policy.id} ·
                  {translate('Version')}: {reimbursementReview.policy.version}</small
                >
                <small
                  >{translate('Policy category')}: {reimbursementReview.policy.category
                    ? translate(
                        expenseCategories.find(
                          ([value]) => value === reimbursementReview.policy.category,
                        )?.[1] ?? reimbursementReview.policy.category,
                      )
                    : translate('All categories')} · {reimbursementReview.policy.effectiveFrom} →
                  {reimbursementReview.policy.effectiveTo || translate('open-ended')}</small
                >
              </div>
            </article>
          {:else if reimbursementReview.status === 'invalid' || reimbursementReview.status === 'unavailable'}
            <p class="muted" data-reimbursement-review-unavailable>
              {reimbursementReviewIssue(reimbursementReview.issue)}
            </p>
          {:else}
            <p class="muted">{translate('Choose a person to review reimbursement.')}</p>
          {/if}
        </FormSection>
      {/if}
      {#if canWritePolicy && data.selectedProjectId && data.projectExpenseReimbursement}
        <form
          method="POST"
          action={reimbursementActionUrl('setProjectReimbursementDefault')}
          class="admin-form-grid"
          data-project-reimbursement-form
          use:formValidation
          use:dirtyFormGuard={{
            initialDirty: failedPolicyFormIsDirty('setProjectReimbursementDefault'),
          }}
        >
          <input type="hidden" name="projectId" value={data.selectedProjectId} />
          <input
            type="hidden"
            name="expectedVersion"
            value={rowValue(data.projectExpenseReimbursement, 'version')}
          />
          <Field
            id="project-reimbursement-default"
            label={translate('Project worker reimbursement default')}
            required
          >
            <select
              id="project-reimbursement-default"
              name="mode"
              value={failedValue('setProjectReimbursementDefault', 'mode') ??
                (rowValue(data.projectExpenseReimbursement, 'mode') || 'inherit')}
              required
            >
              <option value="inherit">{translate('Use existing person policies')}</option>
              <option value="at_cost">{translate('Reimburse worker at cost')}</option>
              <option value="none">{translate('Do not reimburse worker')}</option>
            </select>
          </Field>
          <Field
            id="project-reimbursement-from"
            label={translate('Effective from')}
            required
            error={reimbursementFieldError('setProjectReimbursementDefault', 'effectiveFrom')}
          >
            <input
              id="project-reimbursement-from"
              name="effectiveFrom"
              type="date"
              required
              value={failedValue('setProjectReimbursementDefault', 'effectiveFrom') ??
                data.reimbursementPreferenceAsOf ??
                data.financeToday ??
                ''}
              aria-invalid={Boolean(
                reimbursementFieldError('setProjectReimbursementDefault', 'effectiveFrom'),
              )}
              aria-describedby={reimbursementFieldError(
                'setProjectReimbursementDefault',
                'effectiveFrom',
              )
                ? 'project-reimbursement-from-error'
                : undefined}
            />
          </Field>
          <Field id="project-reimbursement-reason" label={translate('Reason')} required>
            <input
              id="project-reimbursement-reason"
              name="reason"
              value={failedValue('setProjectReimbursementDefault', 'reason') ?? ''}
              minlength="3"
              maxlength="2000"
              required
            />
          </Field>
          {#if reimbursementProblem && failedConfigurationAction?.actionName === 'setProjectReimbursementDefault' && failedValue('setProjectReimbursementDefault', 'projectId') === String(data.selectedProjectId)}
            <div class="finance-config__policy-problem" data-finance-problem tabindex="-1">
              <ProblemNotice
                problem={reimbursementProblem}
                remedyLinks={reimbursementRemedyLinks}
              />
            </div>
          {/if}
          <div class="form-actions">
            <button type="submit">{translate('Save project reimbursement default')}</button>
          </div>
        </form>
      {/if}
      {#if canWritePolicy && data.selectedProjectId && configurableCommercialTerms.length}
        <div class="record-list" aria-label={translate('Worker reimbursement overrides')}>
          {#each configurableCommercialTerms as person}
            <form
              method="POST"
              action={reimbursementActionUrl('setWorkerReimbursementOverride')}
              class="admin-form-grid"
              data-worker-reimbursement-form
              use:formValidation
              use:dirtyFormGuard={{
                initialDirty: failedPolicyFormIsDirty(
                  'setWorkerReimbursementOverride',
                  rowValue(person, 'assignmentId'),
                ),
              }}
            >
              <strong>{rowValue(person, 'workerName')}</strong>
              <input
                type="hidden"
                name="projectMemberId"
                value={rowValue(person, 'assignmentId')}
              />
              <input
                type="hidden"
                name="expectedVersion"
                value={rowValue(person, 'assignmentVersion')}
              />
              <Field
                id={`worker-reimbursement-${rowValue(person, 'assignmentId')}`}
                label={translate('Worker reimbursement override')}
                required
              >
                <select
                  id={`worker-reimbursement-${rowValue(person, 'assignmentId')}`}
                  name="mode"
                  value={failedAssignmentValue(person, 'setWorkerReimbursementOverride', 'mode') ??
                    (rowValue(person, 'workerExpenseReimbursementOverride') || 'inherit')}
                  required
                >
                  <option value="inherit">{translate('Use project default')}</option>
                  <option value="at_cost">{translate('Reimburse this worker at cost')}</option>
                  <option value="none">{translate('Do not reimburse this worker')}</option>
                </select>
              </Field>
              <Field
                id={`worker-reimbursement-from-${rowValue(person, 'assignmentId')}`}
                label={translate('Effective from')}
                required
                error={reimbursementFieldError(
                  'setWorkerReimbursementOverride',
                  'effectiveFrom',
                  rowValue(person, 'assignmentId'),
                )}
              >
                <input
                  id={`worker-reimbursement-from-${rowValue(person, 'assignmentId')}`}
                  name="effectiveFrom"
                  type="date"
                  required
                  min={rowValue(person, 'assignmentStartsOn') || undefined}
                  max={rowValue(person, 'assignmentEndsOn') || undefined}
                  value={failedAssignmentValue(
                    person,
                    'setWorkerReimbursementOverride',
                    'effectiveFrom',
                  ) ??
                    data.reimbursementPreferenceAsOf ??
                    data.financeToday ??
                    ''}
                  aria-invalid={Boolean(
                    reimbursementFieldError(
                      'setWorkerReimbursementOverride',
                      'effectiveFrom',
                      rowValue(person, 'assignmentId'),
                    ),
                  )}
                  aria-describedby={reimbursementFieldError(
                    'setWorkerReimbursementOverride',
                    'effectiveFrom',
                    rowValue(person, 'assignmentId'),
                  )
                    ? `worker-reimbursement-from-${rowValue(person, 'assignmentId')}-error`
                    : undefined}
                />
              </Field>
              <Field
                id={`worker-reimbursement-reason-${rowValue(person, 'assignmentId')}`}
                label={translate('Reason')}
                required
              >
                <input
                  id={`worker-reimbursement-reason-${rowValue(person, 'assignmentId')}`}
                  name="reason"
                  value={failedAssignmentValue(
                    person,
                    'setWorkerReimbursementOverride',
                    'reason',
                  ) ?? ''}
                  minlength="3"
                  maxlength="2000"
                  required
                />
              </Field>
              {#if reimbursementProblem && failedConfigurationAction?.actionName === 'setWorkerReimbursementOverride' && failedValue('setWorkerReimbursementOverride', 'projectMemberId') === rowValue(person, 'assignmentId')}
                <div class="finance-config__policy-problem" data-finance-problem tabindex="-1">
                  <ProblemNotice
                    problem={reimbursementProblem}
                    remedyLinks={reimbursementRemedyLinks}
                  />
                </div>
              {/if}
              <div class="form-actions">
                <button type="submit">{translate('Save worker override')}</button>
              </div>
            </form>
          {/each}
        </div>
      {/if}
      {#if data.reimbursementPreferenceHistory?.length}
        <div class="record-list" aria-label={translate('Dated reimbursement preferences')}>
          <p class="muted">
            {translate('Preferences shown for date')}: {data.reimbursementPreferenceAsOf}
          </p>
          {#each data.reimbursementPreferenceHistory as preference}
            <article class="record-card">
              <strong
                >{rowValue(preference, 'workerName') ||
                  translate('Project worker reimbursement default')}</strong
              >
              <span class="badge">{reimbursementPreferenceStatus(preference)}</span>
              <p>
                {rowValue(preference, 'mode')
                  ? workerReimbursementLabel(rowValue(preference, 'mode'))
                  : translate(
                      rowValue(preference, 'projectMemberId')
                        ? 'Use project default'
                        : 'Use existing person policies',
                    )}
              </p>
              <p class="muted">
                {translate('Effective from')}: {rowValue(preference, 'effectiveFrom') ===
                '0001-01-01'
                  ? translate('Existing terms before dated changes')
                  : rowValue(preference, 'effectiveFrom')}
              </p>
            </article>
          {/each}
        </div>
      {/if}
      {#if canWritePolicy && data.selectedProjectId && (configurableCommercialTerms.length || failedConfigurationAction?.actionName === 'createAssignmentExpensePolicy')}
        <form
          method="POST"
          action={reimbursementActionUrl('createAssignmentExpensePolicy')}
          class="admin-form-grid"
          data-assignment-expense-policy-form
          use:formValidation
          use:dirtyFormGuard={{
            initialDirty: failedPolicyFormIsDirty('createAssignmentExpensePolicy'),
          }}
        >
          {#if policyProblem}
            <div class="finance-config__policy-problem" data-finance-problem tabindex="-1">
              <ProblemNotice
                problem={policyProblem}
                kind={policyProblem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
                status={[
                  'FINANCE_POLICY_ASSIGNMENT_UNAVAILABLE',
                  'FINANCE_POLICY_OUTSIDE_ASSIGNMENT',
                  'FINANCE_POLICY_END_REQUIRED',
                ].includes(policyProblem.code)
                  ? policyCurrent
                    ? portalText(locale, 'problem.finance.policyCurrentAssignment', {
                        workerName: policyCurrent.workerName,
                        status: controlledValue('status', policyCurrent.status),
                        startsOn: policyCurrent.startsOn,
                        endsOn: policyCurrent.endsOn ?? translate('Open assignment'),
                      })
                    : portalText(locale, 'problem.finance.policySelectionUnavailable', {
                        workerName: translate('Assigned person'),
                      })
                  : undefined}
                remedyLinks={policyRemedyLinks}
              />
            </div>
          {/if}
          <Field id="expense-policy-person" label={translate('Assigned person')} required>
            <select
              id="expense-policy-person"
              name="projectMemberId"
              bind:value={selectedPolicyMemberId}
              required
            >
              <option value="">{translate('Select person')}</option>
              {#if unavailablePolicyMember}
                <option value={unavailablePolicyMember} disabled
                  >{portalText(locale, 'problem.finance.policySelectionUnavailable', {
                    workerName: policyCurrent?.workerName ?? translate('Assigned person'),
                  })}</option
                >
              {/if}
              {#each configurableCommercialTerms as person}
                <option value={rowValue(person, 'assignmentId')}
                  >{rowValue(person, 'workerName')}</option
                >
              {/each}
            </select>
          </Field>
          {#if selectedPolicyAssignment}
            <ProblemNotice
              kind="warning"
              problem={{
                code: 'WARNING_FINANCE_POLICY_ASSIGNMENT_WINDOW',
                messageKey: 'problem.warning.financePolicyAssignmentWindow',
                params: {
                  workerName: rowValue(selectedPolicyAssignment, 'workerName'),
                  startsOn: rowValue(selectedPolicyAssignment, 'assignmentStartsOn'),
                  endsOn:
                    rowValue(selectedPolicyAssignment, 'assignmentEndsOn') ||
                    translate('Open assignment'),
                },
                fieldErrors: {},
                remedies: [],
                correlationId: '',
              }}
            />
          {/if}
          <FieldGroup columns="2">
            <Field id="expense-policy-payer" label={translate('Who paid')} required>
              <select
                id="expense-policy-payer"
                name="payer"
                bind:value={expensePolicyPayer}
                onchange={() => {
                  if (expensePolicyPayer !== 'worker') expensePolicyWorkerReimbursement = 'none';
                  if (expensePolicyPayer === 'client')
                    expensePolicyClientRecovery = 'client_direct';
                  else if (expensePolicyClientRecovery === 'client_direct')
                    expensePolicyClientRecovery = 'at_cost';
                }}
                required
              >
                <option value="worker">{translate('Worker')}</option>
                <option value="company_card">{translate('Company card')}</option>
                <option value="company_direct">{translate('Company direct')}</option>
                <option value="client">{translate('Client')}</option>
                <option value="third_party">{translate('Third party')}</option>
              </select>
            </Field>
            <Field id="expense-policy-category" label={translate('Expense category')}>
              <select
                id="expense-policy-category"
                name="category"
                value={failedValue('createAssignmentExpensePolicy', 'category') ?? ''}
              >
                <option value="">{translate('All categories')}</option>
                {#each policyCategoryOptions as [value, label]}
                  <option {value}>{translate(label)}</option>
                {/each}
              </select>
            </Field>
            <Field id="expense-policy-from" label={translate('Effective from')} required>
              <input
                id="expense-policy-from"
                name="effectiveFrom"
                type="date"
                value={failedValue('createAssignmentExpensePolicy', 'effectiveFrom') ??
                  data.financeToday ??
                  ''}
                min={policyAssignmentStart || undefined}
                max={policyAssignmentEnd || undefined}
                required
              />
            </Field>
            <Field
              id="expense-policy-to"
              label={translate('Effective to')}
              required={Boolean(policyAssignmentEnd)}
            >
              <input
                id="expense-policy-to"
                name="effectiveTo"
                type="date"
                value={failedValue('createAssignmentExpensePolicy', 'effectiveTo') ?? ''}
                min={policyAssignmentStart || undefined}
                max={policyAssignmentEnd || undefined}
                required={Boolean(policyAssignmentEnd)}
              />
            </Field>
            <Field
              id="expense-policy-worker"
              label={translate('Worker reimbursement if no project default')}
              required
            >
              <select
                id="expense-policy-worker"
                name="workerReimbursement"
                bind:value={expensePolicyWorkerReimbursement}
                disabled={expensePolicyPayer !== 'worker'}
                required
              >
                <option value="at_cost">{translate('Reimburse at cost')}</option>
                <option value="none">{translate('Do not reimburse')}</option>
              </select>
              {#if expensePolicyPayer !== 'worker'}
                <input type="hidden" name="workerReimbursement" value="none" />
              {/if}
            </Field>
            <Field
              id="expense-policy-customer"
              label={translate('Customer expense recovery')}
              help={translate(
                'Non-billable means the expense is not charged to the customer. Worker reimbursement is separate: J&A can reimburse a worker for a $100 expense while charging the customer $0.',
              )}
              required
            >
              <select
                id="expense-policy-customer"
                name="clientRecovery"
                bind:value={expensePolicyClientRecovery}
                disabled={expensePolicyPayer === 'client'}
                required
              >
                <option value="at_cost">{translate('Bill at cost')}</option>
                <option value="markup">{translate('Bill with markup')}</option>
                <option value="included">{translate('Included in labor price')}</option>
                <option value="non_billable"
                  >{translate('Do not bill customer (worker may still be reimbursed)')}</option
                >
                <option value="client_direct">{translate('Customer paid directly')}</option>
              </select>
              {#if expensePolicyPayer === 'client'}
                <input type="hidden" name="clientRecovery" value="client_direct" />
              {/if}
            </Field>
            <Field
              id="expense-policy-markup"
              label={translate('Markup (basis points)')}
              help={translate('Required only for bill with markup; 1000 means 10%.')}
            >
              <input
                id="expense-policy-markup"
                name="markupBps"
                type="number"
                min="1"
                max="10000"
                step="1"
                required={expensePolicyClientRecovery === 'markup'}
                disabled={expensePolicyClientRecovery !== 'markup'}
              />
            </Field>
          </FieldGroup>
          <Field id="expense-policy-reason" label={translate('Reason')} required>
            <textarea
              id="expense-policy-reason"
              name="reason"
              required
              minlength="3"
              maxlength="2000"
            ></textarea>
          </Field>
          <div class="form-actions">
            <button
              type="submit"
              disabled={Boolean(unavailablePolicyMember) ||
                policyProblem?.code === 'UNEXPECTED_ERROR'}
              >{translate('Save person expense policy')}</button
            >
          </div>
        </form>
      {:else}
        <p class="muted">
          {translate('Select a project with an assigned person to configure expense policy.')}
        </p>
      {/if}
      {#if data.assignmentExpensePolicies?.length}
        <div class="record-list" aria-label={translate('Person expense policy history')}>
          {#each data.assignmentExpensePolicies as policy}
            <article class="record-list-item">
              <div>
                <strong>{rowValue(policy, 'workerName')}</strong>
                <small
                  >{translate('Payer')}: {translate(rowValue(policy, 'payer'))} · {translate(
                    'Category',
                  )}: {rowValue(policy, 'category') || translate('All categories')}</small
                >
                <small
                  >{translate('Policy fallback reimbursement')}: {workerReimbursementLabel(
                    rowValue(policy, 'workerReimbursement'),
                  )} · {translate('Customer expense recovery')}: {expenseRecoveryLabel(
                    rowValue(policy, 'clientRecovery'),
                  )}</small
                >
                {#if rowValue(policy, 'clientRecovery') === 'non_billable'}
                  <small data-expense-billability-help>
                    {translate(
                      'Non-billable means the expense is not charged to the customer. Worker reimbursement is separate: J&A can reimburse a worker for a $100 expense while charging the customer $0.',
                    )}
                  </small>
                {/if}
                <small
                  >{rowValue(policy, 'effectiveFrom')} → {rowValue(policy, 'effectiveTo') ||
                    translate('open-ended')}</small
                >
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <p class="muted">
          {translate('No person expense policies are configured for this project.')}
        </p>
      {/if}
    </FormSection>
  {/if}
  {#if selectedAction === 'Project issuing authority'}
    <FormSection
      id="project-issuing-authority"
      title={translate('Project issuing authority')}
      description={translate(
        'Choose the reviewed legal-entity revision that will issue invoices for this project. Previous assignments remain visible as immutable history.',
      )}
      data-project-legal-entity
    >
      {#if canManageCanonicalAuthority}
        <details class="finance-authority-revision" open={Boolean(failedCanonicalRevision)}>
          <summary>{translate('Create issuing legal entity revision')}</summary>
          <p class="muted">
            {translate(
              'Use verified legal and tax details. A revision is permanent evidence for later invoices.',
            )}
          </p>
          <form
            method="POST"
            action={configurationActionUrl('createCanonicalLegalEntityRevision')}
            class="admin-form-grid"
            data-canonical-revision-form
            data-finance-action="createCanonicalLegalEntityRevision"
            use:formValidation
          >
            <input
              type="hidden"
              name="idempotencyKey"
              value={data.canonicalRevisionCommandToken ?? ''}
            />
            <Field
              id="authority-legacy-entity"
              label={translate('Legal entity')}
              required
              data-field="legacyLegalEntityId"
            >
              <select id="authority-legacy-entity" name="legacyLegalEntityId" required>
                <option value="">{translate('Select legal entity')}</option>
                {#if canonicalRevisionValue('legacyLegalEntityId') && !(data.legalEntities ?? []).some((entity) => rowValue(entity, 'id') === canonicalRevisionValue('legacyLegalEntityId'))}
                  <option value={canonicalRevisionValue('legacyLegalEntityId')} selected disabled
                    >{translate('problem.finance.legalEntityUnavailableOption')}</option
                  >
                {/if}
                {#each data.legalEntities ?? [] as entity}
                  <option
                    value={rowValue(entity, 'id')}
                    selected={rowValue(entity, 'id') ===
                      canonicalRevisionValue('legacyLegalEntityId')}
                  >
                    {rowValue(entity, 'code')} · {rowValue(entity, 'legalName', 'legal_name')} · {rowValue(
                      entity,
                      'currency',
                    )}
                  </option>
                {/each}
              </select>
            </Field>
            <FieldGroup columns="2">
              <Field
                id="authority-effective-from"
                label={translate('Effective from')}
                required
                data-field="effectiveFrom"
              >
                <input
                  id="authority-effective-from"
                  name="effectiveFrom"
                  type="date"
                  value={canonicalRevisionValue('effectiveFrom', data.canonicalAuthorityAsOf ?? '')}
                  required
                />
              </Field>
              <Field
                id="authority-effective-to"
                label={translate('Effective to')}
                data-field="effectiveTo"
              >
                <input
                  id="authority-effective-to"
                  name="effectiveTo"
                  type="date"
                  value={canonicalRevisionValue('effectiveTo')}
                />
              </Field>
              <Field
                id="authority-legal-name"
                label={translate('Registered legal name')}
                required
                data-field="legalName"
              >
                <input
                  id="authority-legal-name"
                  name="legalName"
                  value={canonicalRevisionValue('legalName')}
                  required
                  maxlength="300"
                />
              </Field>
              <Field
                id="authority-tax-identifier"
                label={translate('Tax identifier')}
                data-field="taxIdentifier"
              >
                <input
                  id="authority-tax-identifier"
                  name="taxIdentifier"
                  value={canonicalRevisionValue('taxIdentifier')}
                  maxlength="100"
                />
              </Field>
              <Field
                id="authority-registration-identifier"
                label={translate('Registration identifier')}
                data-field="registrationIdentifier"
              >
                <input
                  id="authority-registration-identifier"
                  name="registrationIdentifier"
                  value={canonicalRevisionValue('registrationIdentifier')}
                  maxlength="100"
                />
              </Field>
              <Field
                id="authority-address-line1"
                label={translate('Address line 1')}
                required
                data-field="addressLine1"
              >
                <input
                  id="authority-address-line1"
                  name="addressLine1"
                  value={canonicalRevisionValue('addressLine1')}
                  required
                  maxlength="300"
                />
              </Field>
              <Field
                id="authority-address-line2"
                label={translate('Address line 2')}
                data-field="addressLine2"
              >
                <input
                  id="authority-address-line2"
                  name="addressLine2"
                  value={canonicalRevisionValue('addressLine2')}
                  maxlength="300"
                />
              </Field>
              <Field
                id="authority-locality"
                label={translate('City / locality')}
                required
                data-field="locality"
              >
                <input
                  id="authority-locality"
                  name="locality"
                  value={canonicalRevisionValue('locality')}
                  required
                  maxlength="160"
                />
              </Field>
              <Field id="authority-region" label={translate('Region')} data-field="region">
                <input
                  id="authority-region"
                  name="region"
                  value={canonicalRevisionValue('region')}
                  maxlength="160"
                />
              </Field>
              <Field
                id="authority-postal-code"
                label={translate('Postal code')}
                required
                data-field="postalCode"
              >
                <input
                  id="authority-postal-code"
                  name="postalCode"
                  value={canonicalRevisionValue('postalCode')}
                  required
                  maxlength="80"
                />
              </Field>
              <Field
                id="authority-country-code"
                label={translate('Country code (2 letters)')}
                required
                data-field="countryCode"
              >
                <input
                  id="authority-country-code"
                  name="countryCode"
                  value={canonicalRevisionValue('countryCode')}
                  required
                  maxlength="2"
                  minlength="2"
                  pattern="[A-Za-z][A-Za-z]"
                />
              </Field>
              <Field
                id="authority-currency"
                label={translate('Base currency')}
                help={translate('Must match the selected legal entity.')}
                required
                data-field="baseCurrency"
              >
                <input
                  id="authority-currency"
                  name="baseCurrency"
                  value={canonicalRevisionValue('baseCurrency')}
                  required
                  maxlength="3"
                  minlength="3"
                  pattern="[A-Za-z][A-Za-z][A-Za-z]"
                />
              </Field>
              <Field
                id="authority-timezone"
                label={translate('Timezone')}
                required
                data-field="timezone"
              >
                <input
                  id="authority-timezone"
                  name="timezone"
                  value={canonicalRevisionValue('timezone')}
                  required
                  placeholder={translate('Europe/Madrid')}
                  maxlength="100"
                />
              </Field>
            </FieldGroup>
            <Field
              id="authority-reason"
              label={translate('Reason for this revision')}
              required
              data-field="reason"
            >
              <textarea id="authority-reason" name="reason" required minlength="5" maxlength="2000"
                >{canonicalRevisionValue('reason')}</textarea
              >
            </Field>
            <div class="form-actions">
              <button type="submit">{translate('Save legal entity revision')}</button>
            </div>
          </form>
        </details>
        <form
          method="POST"
          action={configurationActionUrl('assignProjectLegalEntity')}
          class="admin-form-grid"
          data-project-legal-entity-form
          use:formValidation
        >
          <input
            type="hidden"
            name="idempotencyKey"
            value={data.canonicalAssignmentCommandToken ?? ''}
          />
          <Field
            id="finance-legal-entity-project"
            label={translate('Project')}
            help={translate('The assignment applies from the selected effective date.')}
            required
          >
            <select id="finance-legal-entity-project" name="projectId" required>
              <option value="">{translate('Select project')}</option>
              {#each availableProjects as project}
                <option
                  value={project.id}
                  selected={String(project.id) ===
                    String(
                      failedValue('assignProjectLegalEntity', 'projectId') ??
                        data.selectedProjectId,
                    )}
                >
                  {projectLabel(project)}
                </option>
              {/each}
            </select>
          </Field>
          <Field
            id="finance-legal-entity-revision"
            label={translate('Issuing legal entity revision')}
            help={translate('Only reviewed canonical revisions are available for assignment.')}
            required
          >
            <select id="finance-legal-entity-revision" name="legalEntityRevisionId" required>
              <option value="">{translate('Select issuing authority')}</option>
              {#if failedValue('assignProjectLegalEntity', 'legalEntityRevisionId') && !(data.canonicalLegalEntityOptions ?? []).some((option) => rowValue(option, 'revisionId', 'revision_id') === failedValue('assignProjectLegalEntity', 'legalEntityRevisionId'))}
                <option
                  value={failedValue('assignProjectLegalEntity', 'legalEntityRevisionId') ?? ''}
                  selected
                  disabled>{translate('problem.finance.revisionUnavailableOption')}</option
                >
              {/if}
              {#each data.canonicalLegalEntityOptions ?? [] as option}
                <option
                  value={rowValue(option, 'revisionId', 'revision_id')}
                  selected={rowValue(option, 'revisionId', 'revision_id') ===
                    failedValue('assignProjectLegalEntity', 'legalEntityRevisionId')}
                >
                  {rowValue(option, 'legalName', 'legal_name')} ·
                  {rowValue(option, 'legalEntityCode', 'legal_entity_code')} ·
                  {rowValue(option, 'baseCurrency', 'base_currency')} ·
                  {translate('from')}
                  {rowValue(option, 'effectiveFrom', 'effective_from')}
                </option>
              {/each}
            </select>
          </Field>
          <Field
            id="finance-legal-entity-effective-from"
            label={translate('Effective from')}
            required
          >
            <input
              id="finance-legal-entity-effective-from"
              name="effectiveFrom"
              type="date"
              value={failedValue('assignProjectLegalEntity', 'effectiveFrom') ?? ''}
              required
            />
          </Field>
          <Field
            id="finance-legal-entity-effective-to"
            label={translate('Effective to')}
            help={translate('Leave blank when this authority remains current.')}
          >
            <input
              id="finance-legal-entity-effective-to"
              name="effectiveTo"
              type="date"
              value={failedValue('assignProjectLegalEntity', 'effectiveTo') ?? ''}
            />
          </Field>
          <Field
            id="finance-legal-entity-reason"
            label={translate('Reason')}
            help={translate('Record why this project issuing authority was assigned.')}
            required
          >
            <textarea id="finance-legal-entity-reason" name="reason" minlength="5" required
              >{failedValue('assignProjectLegalEntity', 'reason') ?? ''}</textarea
            >
          </Field>
          <div class="form-actions">
            <button type="submit">{translate('Save issuing authority')}</button>
          </div>
        </form>
      {:else}
        <p class="muted" data-project-legal-entity-readonly>
          {translate(
            'Issuing authority assignment is restricted to an authorized Finance or Owner administrator.',
          )}
        </p>
      {/if}

      {#if data.projectLegalEntityAssignments?.length}
        <div
          class="record-list"
          aria-label={translate('Project issuing authority history')}
          data-project-legal-entity-history
        >
          {#each data.projectLegalEntityAssignments as assignment}
            <article class="record-list-item" data-project-legal-entity-row>
              <div>
                <strong>
                  {rowValue(assignment, 'legalName', 'legal_name')} ·
                  {rowValue(assignment, 'legalEntityCode', 'legal_entity_code')}
                </strong>
                <small>
                  {translate('Revision')}
                  {rowValue(assignment, 'revisionNumber', 'revision_number')} ·
                  {translate('Effective from')}
                  {rowValue(assignment, 'effectiveFrom', 'effective_from')} →
                  {rowValue(assignment, 'effectiveTo', 'effective_to') || translate('current')} ·
                  {rowValue(assignment, 'baseCurrency', 'base_currency')}
                </small>
                {#if rowValue(assignment, 'replacedByAssignmentId')}
                  <p>{portalText(locale, 'finance.issuerReplacement.replaced')}</p>
                {:else if rowValue(assignment, 'replacesAssignmentId')}
                  <p>{portalText(locale, 'finance.issuerReplacement.corrected')}</p>
                {/if}
                {#if rowValue(assignment, 'replacementReason')}
                  <p>{translate('Reason')}: {rowValue(assignment, 'replacementReason')}</p>
                {/if}
                {#if canManageCanonicalAuthority && !rowValue(assignment, 'replacedByAssignmentId')}
                  <UnusedIssuingAuthorityReplacementForm
                    {assignment}
                    options={data.canonicalLegalEntityOptions ?? []}
                    projectCurrency={selectedProjectCurrency}
                    commandToken={data.canonicalAssignmentCommandToken ?? ''}
                    {locale}
                  />
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <p class="muted" data-project-legal-entity-empty>
          {translate(
            'No project issuing authority assignment is recorded for the selected project.',
          )}
        </p>
      {/if}
    </FormSection>
  {/if}
  <!-- project-commercial-policy-start -->
  {#if selectedAction === 'Project commercial and time policy'}
    <FormSection
      id="project-commercial-policy"
      title={translate('Project commercial and time policy')}
      description={translate(
        'Configure effective-dated interpretation for eligible time and billing readiness. This is project configuration, not worker data entry.',
      )}
      data-project-commercial-policy
    >
      {#if canWritePolicy}
        <form
          method="POST"
          action={configurationActionUrl('createProjectCommercialPolicy')}
          class="admin-form-grid"
          data-project-commercial-policy-form
          use:formValidation
        >
          <Field
            id="finance-policy-project"
            label={translate('Project')}
            help={translate(
              'The policy applies to the selected project and supersedes its prior effective policy.',
            )}
            required
          >
            <select id="finance-policy-project" name="projectId" required>
              <option value="">{translate('Select project')}</option>
              {#each availableProjects as project}
                <option
                  value={project.id}
                  selected={String(project.id) ===
                    String(
                      failedValue('createProjectCommercialPolicy', 'projectId') ??
                        data.selectedProjectId,
                    )}
                >
                  {projectLabel(project)}
                </option>
              {/each}
            </select>
          </Field>
          <Field
            id="finance-policy-effective"
            label={translate('Effective from')}
            help={translate(
              'Future changes are recorded as successors; historical policy versions remain immutable.',
            )}
            required
          >
            <input
              id="finance-policy-effective"
              name="effectiveFrom"
              type="date"
              value={failedValue('createProjectCommercialPolicy', 'effectiveFrom') ?? ''}
              required
            />
          </Field>
          <Field
            id="finance-policy-overtime"
            label={translate('Overtime derivation')}
            help={translate(
              'Eligible Work and Commissioning minutes use this configured threshold; Travel and Standby keep their own rules.',
            )}
          >
            <input type="hidden" name="overtimeEnabled" value="false" />
            <div class="check">
              <input
                id="finance-policy-overtime"
                name="overtimeEnabled"
                type="checkbox"
                value="true"
                bind:checked={overtimeEnabled}
              />
              <span>{translate('Derive overtime after the threshold')}</span>
            </div>
          </Field>
          {#if overtimeEnabled}
            <Field
              id="finance-policy-threshold"
              label={translate('Overtime threshold (minutes)')}
              help={translate(
                'Use the effective project schedule and enter the threshold in actual minutes.',
              )}
              required
            >
              <input
                id="finance-policy-threshold"
                name="overtimeThresholdMinutes"
                type="number"
                min="1"
                max="1440"
                inputmode="numeric"
                value={failedValue('createProjectCommercialPolicy', 'overtimeThresholdMinutes') ??
                  ''}
                required
              />
            </Field>
          {:else}
            <input type="hidden" name="overtimeThresholdMinutes" value="" />
          {/if}
          <Field
            id="finance-policy-travel"
            label={translate('Travel client billability')}
            help={translate(
              'Not client billable travel time is excluded from the customer labor charge. Worker pay follows separate labor terms; workers still record their actual travel time.',
            )}
            required
          >
            <select id="finance-policy-travel" name="travelClientBillable" required>
              <option
                value="true"
                selected={failedValue('createProjectCommercialPolicy', 'travelClientBillable') !==
                  'false'}>{translate('Client billable')}</option
              >
              <option
                value="false"
                selected={failedValue('createProjectCommercialPolicy', 'travelClientBillable') ===
                  'false'}>{translate('Not client billable')}</option
              >
            </select>
          </Field>
          <Field
            id="finance-policy-signoff"
            label={translate('Customer sign-off before billing')}
            help={translate(
              'When enabled, invoice issue remains blocked until the exact report version is signed.',
            )}
            required
          >
            <select id="finance-policy-signoff" name="customerSignoffRequired" required>
              <option
                value="true"
                selected={failedValue(
                  'createProjectCommercialPolicy',
                  'customerSignoffRequired',
                ) !== 'false'}>{translate('Required')}</option
              >
              <option
                value="false"
                selected={failedValue(
                  'createProjectCommercialPolicy',
                  'customerSignoffRequired',
                ) === 'false'}>{translate('Not required')}</option
              >
            </select>
          </Field>
          <div class="form-actions">
            <button type="submit">{translate('Save project policy')}</button>
          </div>
        </form>
      {:else}
        <p class="muted" data-project-commercial-policy-readonly>
          {translate(
            'Auditor view is read-only. Policy changes require an authorized Finance or Owner administrator.',
          )}
        </p>
      {/if}

      {#if data.commercialPolicies?.length}
        <div
          class="record-list"
          aria-label={translate('Project commercial policy history')}
          data-project-commercial-policy-history
        >
          {#each data.commercialPolicies as policy}
            <article class="record-list-item" data-project-commercial-policy-row>
              <div>
                <strong>
                  {translate('Version')}
                  {rowValue(policy, 'version') || '—'} ·
                  {rowValue(policy, 'effectiveFrom', 'effective_from') || '—'}
                </strong>
                <small>
                  {rowValue(policy, 'effectiveTo', 'effective_to') || translate('open-ended')} ·
                  {translate('Overtime')}:
                  {#if booleanValue(policy, 'overtimeEnabled', 'overtime_enabled')}
                    {translate('after')}
                    {rowValue(policy, 'overtimeThresholdMinutes', 'overtime_threshold_minutes')}
                    {translate('minutes')}
                  {:else}
                    {translate('disabled')}
                  {/if}
                  · {translate('Travel client billable')}:
                  {policyDecision(policy, 'travelClientBillable', 'travel_client_billable')} ·
                  {translate('Customer sign-off')}:
                  {policyDecision(policy, 'customerSignoffRequired', 'customer_signoff_required')}
                </small>
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <p class="muted" data-project-commercial-policy-empty>
          {translate('No project commercial policy is configured for the selected project.')}
        </p>
      {/if}
    </FormSection>
  {/if}
  <!-- project-commercial-policy-end -->
  {#if !isAuditor}
    <div id="finance-rule-registers" class="management-stack compact-stack finance-rule-registers">
      {#if selectedAction === 'Compensation statement rules'}
        <FormSection title={translate('Compensation statement rules')}>
          <p class="muted">
            {translate(
              'Existing rules are historical records. Edit by superseding the selected record; deactivate only ends its future applicability.',
            )}
          </p>
          {#if data.compensationRules?.length}
            <div class="record-list" aria-label={translate('Compensation rules')}>
              {#each data.compensationRules as rule}
                <article class="record-list-item">
                  <div>
                    <strong>{ruleWorkerLabel(rule)}</strong>
                    <small>
                      {compensationRuleLabel(rowValue(rule, 'ruleType', 'rule_type'))} · {moneyLabel(
                        rule,
                        'rateMinor',
                        'rate_minor',
                      )}
                      · {rowValue(rule, 'effectiveFrom', 'effective_from')} →
                      {rowValue(rule, 'effectiveTo', 'effective_to') || translate('open-ended')}
                    </small>
                  </div>
                  <div class="form-actions">
                    <details
                      open={failedValue('supersedeCompensationRule', 'supersedesId') ===
                        rowValue(rule, 'id')}
                    >
                      <summary>{translate('Edit / supersede')}</summary>
                      <form
                        method="POST"
                        action={configurationActionUrl('supersedeCompensationRule')}
                        class="admin-form-grid"
                        use:formValidation
                      >
                        <input type="hidden" name="supersedesId" value={rowValue(rule, 'id')} />
                        <input
                          type="hidden"
                          name="workerId"
                          value={rowValue(rule, 'workerId', 'worker_id')}
                        />
                        <input
                          type="hidden"
                          name="projectId"
                          value={rowValue(rule, 'projectId', 'project_id')}
                        />
                        <input
                          type="hidden"
                          name="currency"
                          value={rowValue(rule, 'currency') || 'USD'}
                        />
                        <input
                          type="hidden"
                          name="ruleType"
                          value={rowValue(rule, 'ruleType', 'rule_type') || 'Hourly'}
                        />
                        <input
                          type="hidden"
                          name="rateBasis"
                          value={rowValue(rule, 'rateBasis', 'rate_basis') || 'hourly'}
                        />
                        <input
                          type="hidden"
                          name="settlementTrigger"
                          value={rowValue(rule, 'settlementTrigger', 'settlement_trigger') ||
                            'ON_APPROVED_BILLABLE_LABOR'}
                        />
                        <input
                          type="hidden"
                          name="overtimeMethod"
                          value={rowValue(rule, 'overtimeMethod', 'overtime_method') || 'NONE'}
                        />
                        <input
                          type="hidden"
                          name="overtimeMultiplierBps"
                          value={rowValue(rule, 'overtimeMultiplierBps', 'overtime_multiplier_bps')}
                        />
                        <input
                          type="hidden"
                          name="overtimeRateMinor"
                          value={rowValue(rule, 'overtimeRateMinor', 'overtime_rate_minor')}
                        />
                        <input
                          type="hidden"
                          name="dailyGuaranteeMinutes"
                          value={rowValue(rule, 'dailyGuaranteeMinutes', 'daily_guarantee_minutes')}
                        />
                        <input
                          type="hidden"
                          name="weekendMethod"
                          value={rowValue(rule, 'weekendMethod', 'weekend_method') || 'BASE'}
                        />
                        <input
                          type="hidden"
                          name="travelMethod"
                          value={rowValue(rule, 'travelMethod', 'travel_method') || 'BASE'}
                        />
                        <input
                          type="hidden"
                          name="standbyMethod"
                          value={rowValue(rule, 'standbyMethod', 'standby_method') || 'BASE'}
                        />
                        <Field
                          id={`finance-comp-edit-rate-${rowValue(rule, 'id')}`}
                          label={translate('Hourly rate')}
                          required
                        >
                          <input
                            type="hidden"
                            name="rateMinor"
                            value={failedValue('supersedeCompensationRule', 'rateMinor') ??
                              rowValue(rule, 'rateMinor', 'rate_minor') ??
                              '0'}
                          />
                          <input
                            type="text"
                            inputmode="decimal"
                            value={minorToDecimal(
                              failedValue('supersedeCompensationRule', 'rateMinor') ??
                                rowValue(rule, 'rateMinor', 'rate_minor'),
                            )}
                            data-minor-target="rateMinor"
                            oninput={syncDecimalToMinor}
                            required
                          />
                        </Field>
                        <Field
                          id={`finance-comp-edit-effective-${rowValue(rule, 'id')}`}
                          label={translate('Effective from')}
                          required
                        >
                          <input
                            name="effectiveFrom"
                            type="date"
                            value={failedValue('supersedeCompensationRule', 'effectiveFrom') ??
                              rowValue(rule, 'effectiveFrom', 'effective_from')}
                            required
                          />
                        </Field>
                        {#if rowValue(rule, 'ruleType', 'rule_type') === 'PercentageOfEligibleClientLabor'}
                          <input
                            type="hidden"
                            name="percentageBps"
                            value={rowValue(rule, 'percentageBps', 'percentage_bps') || '0'}
                          />
                          <input
                            type="hidden"
                            name="percentageBasis"
                            value={rowValue(rule, 'percentageBasis', 'percentage_basis') ||
                              'CLIENT_LABOR_BEFORE_TAX'}
                          />
                        {/if}
                        <div class="form-actions">
                          <button>{translate('Save superseding rule')}</button>
                        </div>
                      </form>
                    </details>
                    <form
                      method="POST"
                      action={configurationActionUrl('deactivateCompensationRule')}
                    >
                      <input type="hidden" name="ruleId" value={rowValue(rule, 'id')} />
                      <button type="submit" class="danger">{translate('Deactivate')}</button>
                    </form>
                  </div>
                </article>
              {/each}
            </div>
          {:else}
            <p class="muted">
              {translate('No compensation rules are configured for this project.')}
            </p>
          {/if}
        </FormSection>
      {/if}

      {#if selectedAction === 'Client labor rates'}
        <FormSection title={translate('Client labor rates')}>
          <p class="muted">
            {translate('Rates are resolved by project, worker, category, and effective date.')}
          </p>
          {#if data.clientLaborRates?.length}
            <div class="record-list" aria-label={translate('Client labor rates')}>
              {#each data.clientLaborRates as rule}
                <article class="record-list-item">
                  <div>
                    <strong>{ruleProjectLabel(rule)}</strong>
                    <small>
                      {controlledValue('category', rowValue(rule, 'category')) ||
                        translate('All categories')} · {moneyLabel(
                        rule,
                        rowValue(rule, 'rateBasis', 'rate_basis') === 'hourly'
                          ? 'hourlyRateMinor'
                          : 'unitRateMinor',
                        rowValue(rule, 'rateBasis', 'rate_basis') === 'hourly'
                          ? 'hourly_rate_minor'
                          : 'unit_rate_minor',
                      )}
                      · {translate(
                        rowValue(rule, 'rateBasis', 'rate_basis') === 'daily'
                          ? 'Daily'
                          : rowValue(rule, 'rateBasis', 'rate_basis') === 'weekly'
                            ? 'Weekly'
                            : 'Hourly',
                      )}
                      · {rowValue(rule, 'effectiveFrom', 'effective_from')} →
                      {rowValue(rule, 'effectiveTo', 'effective_to') || translate('open-ended')}
                    </small>
                  </div>
                  <div class="form-actions">
                    <details
                      open={failedValue('supersedeClientLaborRate', 'supersedesId') ===
                        rowValue(rule, 'id')}
                    >
                      <summary>{translate('Edit / supersede')}</summary>
                      <form
                        method="POST"
                        action={configurationActionUrl('supersedeClientLaborRate')}
                        class="admin-form-grid"
                        use:formValidation
                      >
                        <input
                          type="hidden"
                          name="rateBasis"
                          value={rowValue(rule, 'rateBasis', 'rate_basis') || 'hourly'}
                        />
                        {#if rowValue(rule, 'rateBasis', 'rate_basis') !== 'hourly'}<input
                            type="hidden"
                            name="hourlyRateMinor"
                            value="0"
                          />{/if}
                        <input type="hidden" name="supersedesId" value={rowValue(rule, 'id')} />
                        <input
                          type="hidden"
                          name="projectId"
                          value={rowValue(rule, 'projectId', 'project_id', 'selectedProjectId')}
                        />
                        <input
                          type="hidden"
                          name="workerId"
                          value={rowValue(rule, 'workerId', 'worker_id')}
                        />
                        <input
                          type="hidden"
                          name="currency"
                          value={rowValue(rule, 'currency') || 'USD'}
                        />
                        <input
                          type="hidden"
                          name="overtimeMethod"
                          value={rowValue(rule, 'overtimeMethod', 'overtime_method') ||
                            'BASE_RATE_MULTIPLIER'}
                        />
                        <input
                          type="hidden"
                          name="overtimeMultiplierBps"
                          value={rowValue(
                            rule,
                            'overtimeMultiplierBps',
                            'overtime_multiplier_bps',
                          ) || '10000'}
                        />
                        <input
                          type="hidden"
                          name="overtimeRateMinor"
                          value={rowValue(rule, 'overtimeRateMinor', 'overtime_rate_minor')}
                        />
                        <input
                          type="hidden"
                          name="eligibleForPercentage"
                          value={rowValue(
                            rule,
                            'eligibleForPercentage',
                            'eligible_for_percentage',
                          ) || 'true'}
                        />
                        <Field
                          id={`finance-client-edit-rate-${rowValue(rule, 'id')}`}
                          label={translate(
                            rowValue(rule, 'rateBasis', 'rate_basis') === 'daily'
                              ? 'Customer daily rate'
                              : rowValue(rule, 'rateBasis', 'rate_basis') === 'weekly'
                                ? 'Customer weekly rate'
                                : 'Hourly rate',
                          )}
                          required
                        >
                          <input
                            type="hidden"
                            name={rowValue(rule, 'rateBasis', 'rate_basis') === 'hourly'
                              ? 'hourlyRateMinor'
                              : 'unitRateMinor'}
                            value={failedValue(
                              'supersedeClientLaborRate',
                              rowValue(rule, 'rateBasis', 'rate_basis') === 'hourly'
                                ? 'hourlyRateMinor'
                                : 'unitRateMinor',
                            ) ??
                              rowValue(
                                rule,
                                rowValue(rule, 'rateBasis', 'rate_basis') === 'hourly'
                                  ? 'hourlyRateMinor'
                                  : 'unitRateMinor',
                                rowValue(rule, 'rateBasis', 'rate_basis') === 'hourly'
                                  ? 'hourly_rate_minor'
                                  : 'unit_rate_minor',
                              ) ??
                              '0'}
                          />
                          <input
                            type="text"
                            inputmode="decimal"
                            value={minorToDecimal(
                              failedValue(
                                'supersedeClientLaborRate',
                                rowValue(rule, 'rateBasis', 'rate_basis') === 'hourly'
                                  ? 'hourlyRateMinor'
                                  : 'unitRateMinor',
                              ) ??
                                rowValue(
                                  rule,
                                  rowValue(rule, 'rateBasis', 'rate_basis') === 'hourly'
                                    ? 'hourlyRateMinor'
                                    : 'unitRateMinor',
                                  rowValue(rule, 'rateBasis', 'rate_basis') === 'hourly'
                                    ? 'hourly_rate_minor'
                                    : 'unit_rate_minor',
                                ),
                            )}
                            data-minor-target={rowValue(rule, 'rateBasis', 'rate_basis') ===
                            'hourly'
                              ? 'hourlyRateMinor'
                              : 'unitRateMinor'}
                            oninput={syncDecimalToMinor}
                            required
                          />
                        </Field>
                        <Field
                          id={`finance-client-edit-effective-${rowValue(rule, 'id')}`}
                          label={translate('Effective from')}
                          required
                        >
                          <input
                            name="effectiveFrom"
                            type="date"
                            value={failedValue('supersedeClientLaborRate', 'effectiveFrom') ??
                              rowValue(rule, 'effectiveFrom', 'effective_from')}
                            required
                          />
                        </Field>
                        <input type="hidden" name="category" value={rowValue(rule, 'category')} />
                        <div class="form-actions">
                          <button>{translate('Save superseding rate')}</button>
                        </div>
                      </form>
                    </details>
                    <form
                      method="POST"
                      action={configurationActionUrl('deactivateClientLaborRate')}
                    >
                      <input type="hidden" name="ruleId" value={rowValue(rule, 'id')} />
                      <button type="submit" class="danger">{translate('Deactivate')}</button>
                    </form>
                  </div>
                </article>
              {/each}
            </div>
          {:else}
            <p class="muted">
              {translate('No client labor rates are configured for this project.')}
            </p>
          {/if}
        </FormSection>
      {/if}

      {#if selectedAction === 'Assignment budget context / internal loaded cost'}
        <FormSection title={translate('Assignment budget context / internal loaded cost')}>
          <p class="muted">
            {translate('Worker cost rules remain effective-dated and auditable.')}
          </p>
          {#if data.internalCostRules?.length}
            <div class="record-list" aria-label={translate('Internal cost rules')}>
              {#each data.internalCostRules as rule}
                <article class="record-list-item">
                  <div>
                    <strong>{ruleWorkerLabel(rule)}</strong>
                    <small>
                      {moneyLabel(rule, 'hourlyRateMinor', 'hourly_rate_minor')} ·
                      {rowValue(rule, 'effectiveFrom', 'effective_from')} →
                      {rowValue(rule, 'effectiveTo', 'effective_to') || translate('open-ended')}
                    </small>
                  </div>
                  <div class="form-actions">
                    <details
                      open={failedValue('supersedeInternalCostRule', 'supersedesId') ===
                        rowValue(rule, 'id')}
                    >
                      <summary>{translate('Edit / supersede')}</summary>
                      <form
                        method="POST"
                        action={configurationActionUrl('supersedeInternalCostRule')}
                        class="admin-form-grid"
                        use:formValidation
                      >
                        <input type="hidden" name="supersedesId" value={rowValue(rule, 'id')} />
                        <input
                          type="hidden"
                          name="workerId"
                          value={rowValue(rule, 'workerId', 'worker_id')}
                        />
                        <input
                          type="hidden"
                          name="projectId"
                          value={rowValue(rule, 'projectId', 'project_id')}
                        />
                        <input
                          type="hidden"
                          name="currency"
                          value={rowValue(rule, 'currency') || 'USD'}
                        />
                        <input
                          type="hidden"
                          name="costMethod"
                          value={rowValue(rule, 'costMethod', 'cost_method') || 'loaded_cost'}
                        />
                        <input
                          type="hidden"
                          name="overtimeMethod"
                          value={rowValue(rule, 'overtimeMethod', 'overtime_method') ||
                            'BASE_RATE_MULTIPLIER'}
                        />
                        <input
                          type="hidden"
                          name="overtimeMultiplierBps"
                          value={rowValue(
                            rule,
                            'overtimeMultiplierBps',
                            'overtime_multiplier_bps',
                          ) || '10000'}
                        />
                        <input
                          type="hidden"
                          name="overtimeRateMinor"
                          value={rowValue(rule, 'overtimeRateMinor', 'overtime_rate_minor')}
                        />
                        <Field
                          id={`finance-internal-edit-rate-${rowValue(rule, 'id')}`}
                          label={translate('Hourly cost')}
                          required
                        >
                          <input
                            type="hidden"
                            name="hourlyRateMinor"
                            value={failedValue('supersedeInternalCostRule', 'hourlyRateMinor') ??
                              rowValue(rule, 'hourlyRateMinor', 'hourly_rate_minor') ??
                              '0'}
                          />
                          <input
                            type="text"
                            inputmode="decimal"
                            value={minorToDecimal(
                              failedValue('supersedeInternalCostRule', 'hourlyRateMinor') ??
                                rowValue(rule, 'hourlyRateMinor', 'hourly_rate_minor'),
                            )}
                            data-minor-target="hourlyRateMinor"
                            oninput={syncDecimalToMinor}
                            required
                          />
                        </Field>
                        <Field
                          id={`finance-internal-edit-effective-${rowValue(rule, 'id')}`}
                          label={translate('Effective from')}
                          required
                        >
                          <input
                            name="effectiveFrom"
                            type="date"
                            value={failedValue('supersedeInternalCostRule', 'effectiveFrom') ??
                              rowValue(rule, 'effectiveFrom', 'effective_from')}
                            required
                          />
                        </Field>
                        <div class="form-actions">
                          <button>{translate('Save superseding cost')}</button>
                        </div>
                      </form>
                    </details>
                    <form
                      method="POST"
                      action={configurationActionUrl('deactivateInternalCostRule')}
                    >
                      <input type="hidden" name="ruleId" value={rowValue(rule, 'id')} />
                      <button type="submit" class="danger">{translate('Deactivate')}</button>
                    </form>
                  </div>
                </article>
              {/each}
            </div>
          {:else}
            <p class="muted">
              {translate('No internal cost rules are configured for this project.')}
            </p>
          {/if}
        </FormSection>
      {/if}
    </div>
    {#if selectedAction === 'Settlement status'}
      <FormSection title={translate('Settlement status')}>
        <p class="muted">
          {translate(
            'Settlements are immutable financial snapshots. Correct a period by creating a new effective rule or reconciliation record; finalized settlements are never deleted.',
          )}
        </p>
        {#if data.settlements?.length}
          <div class="record-list" aria-label={translate('Compensation settlement status')}>
            {#each data.settlements as settlement}
              <article class="record-list-item">
                <div>
                  <strong
                    >{rowValue(
                      settlement,
                      'workerName',
                      'worker_name',
                      'workerId',
                      'worker_id',
                    )}</strong
                  >
                  <small>
                    {rowValue(
                      settlement,
                      'projectNumber',
                      'project_number',
                      'projectId',
                      'project_id',
                    )} ·
                    {rowValue(settlement, 'periodStart', 'period_start')} →
                    {rowValue(settlement, 'periodEnd', 'period_end')} ·
                    {moneyLabel(settlement, 'amountMinor', 'amount_minor')}
                  </small>
                </div>
                <span class="status-badge"
                  >{controlledValue('status', rowValue(settlement, 'state', 'status')) ||
                    translate('Pending')}</span
                >
              </article>
            {/each}
          </div>
        {:else}
          <p class="muted">{translate('No settlements exist for the selected project yet.')}</p>
        {/if}
        <form
          method="POST"
          action={configurationActionUrl('settleCompensation')}
          class="admin-form-grid"
          use:formValidation
        >
          <FieldGroup columns="2">
            <Field
              id="finance-settle-worker"
              label={translate('Worker')}
              required
              data-field="workerId"
            >
              <select id="finance-settle-worker" name="workerId" required>
                <option value="">{translate('Select worker')}</option>
                {#if unavailableWorker('settleCompensation')}
                  <option value={unavailableWorker('settleCompensation') ?? ''} selected disabled
                    >{translate('Choose an active worker.')}</option
                  >
                {/if}
                {#each data.workers ?? [] as worker}
                  <option
                    value={worker.id}
                    selected={String(worker.id) === failedValue('settleCompensation', 'workerId')}
                    >{worker.name}</option
                  >
                {/each}
              </select>
            </Field>
            <Field
              id="finance-settle-project"
              label={translate('Project')}
              required
              data-field="projectId"
            >
              <select id="finance-settle-project" name="projectId" required>
                <option value="">{translate('Select project')}</option>
                {#each availableProjects as project}
                  <option
                    value={project.id}
                    selected={String(project.id) ===
                      String(
                        failedValue('settleCompensation', 'projectId') ?? data.selectedProjectId,
                      )}>{projectLabel(project)}</option
                  >
                {/each}
              </select>
            </Field>
            <Field
              id="finance-settle-start"
              label={translate('Period start')}
              required
              data-field="periodStart"
            >
              <input
                id="finance-settle-start"
                name="periodStart"
                type="date"
                value={failedValue('settleCompensation', 'periodStart') ?? ''}
                required
              />
            </Field>
            <Field
              id="finance-settle-end"
              label={translate('Period end')}
              required
              data-field="periodEnd"
            >
              <input
                id="finance-settle-end"
                name="periodEnd"
                type="date"
                value={failedValue('settleCompensation', 'periodEnd') ?? ''}
                required
              />
            </Field>
          </FieldGroup>
          <div class="form-actions">
            <button>{translate('Generate settlement snapshot')}</button>
          </div>
        </form>
      </FormSection>
    {/if}
  {/if}
  {#if !isAuditor}
    <div class="management-stack compact-stack">
      {#if selectedAction === 'Worker compensation'}
        <FormSection title={translate('Worker compensation')}>
          <form
            method="POST"
            action={configurationActionUrl('createCompensationRule')}
            class="admin-form-grid"
            use:formValidation
          >
            <FieldGroup columns="2">
              <Field
                id="finance-comp-worker"
                label={translate('Worker')}
                required
                data-field="workerId"
              >
                <select id="finance-comp-worker" name="workerId" required>
                  <option value="">{translate('Select worker')}</option>
                  {#if unavailableWorker('createCompensationRule')}
                    <option
                      value={unavailableWorker('createCompensationRule') ?? ''}
                      selected
                      disabled>{translate('Choose an active worker.')}</option
                    >
                  {/if}
                  {#each data.workers ?? [] as worker}
                    <option
                      value={worker.id}
                      selected={String(worker.id) ===
                        (failedValue('createCompensationRule', 'workerId') ??
                          linkedProjectionWorkerId)}
                      >{worker.name} · {controlledValue('role', worker.role)}</option
                    >
                  {/each}
                </select>
              </Field>
              <Field
                id="finance-comp-project"
                label={translate('Project scope')}
                data-field="projectId"
              >
                <select id="finance-comp-project" name="projectId">
                  <option
                    value=""
                    selected={failedValue('createCompensationRule', 'projectId') === ''}
                    >{translate('Global')}</option
                  >
                  {#each availableProjects as project}
                    <option
                      value={project.id}
                      selected={String(project.id) ===
                        String(
                          failedValue('createCompensationRule', 'projectId') ??
                            data.selectedProjectId,
                        )}>{projectLabel(project)}</option
                    >
                  {/each}
                </select>
              </Field>
              <Field id="finance-comp-currency" label={translate('Currency')} data-field="currency">
                <select id="finance-comp-currency" name="currency">
                  {#each ['USD', 'BRL', 'EUR'] as currency}
                    <option
                      value={currency}
                      selected={currency ===
                        (failedValue('createCompensationRule', 'currency') ??
                          selectedProjectCurrency)}>{currency}</option
                    >
                  {/each}
                </select>
              </Field>
              <Field
                id="finance-comp-ruletype"
                label={translate('Rule type')}
                data-field="ruleType"
              >
                <select
                  id="finance-comp-ruletype"
                  name="ruleType"
                  bind:value={compensationRuleType}
                  onchange={(event) => {
                    if (event.currentTarget.value === 'Daily') compensationRateBasis = 'daily';
                    if (event.currentTarget.value === 'Hourly') compensationRateBasis = 'hourly';
                  }}
                >
                  <option value="Hourly">{translate('Hourly')}</option>
                  <option value="Daily">{translate('Daily')}</option>
                  <option value="FixedPerBillingPeriod"
                    >{translate('Fixed per billing period')}</option
                  >
                  <option value="FixedProjectAmount">{translate('Fixed project amount')}</option>
                  <option value="PercentageOfEligibleClientLabor"
                    >{translate('Percentage of eligible client labor')}</option
                  >
                  <option value="CustomApprovedAdjustment"
                    >{translate('Custom approved adjustment')}</option
                  >
                </select>
              </Field>
              {#if compensationRuleType !== 'PercentageOfEligibleClientLabor'}
                <Field
                  id="finance-comp-rate"
                  label={translate(
                    compensationRuleType === 'Daily'
                      ? 'Daily rate'
                      : compensationRuleType === 'FixedPerBillingPeriod'
                        ? 'Fixed period amount'
                        : compensationRuleType === 'FixedProjectAmount'
                          ? 'Fixed project amount'
                          : compensationRuleType === 'CustomApprovedAdjustment'
                            ? 'Approved adjustment amount'
                            : 'Hourly rate',
                  )}
                  required
                  data-field="rateMinor"
                >
                  <input
                    type="hidden"
                    name="rateMinor"
                    value={failedValue('createCompensationRule', 'rateMinor') ?? '0'}
                  />
                  <input
                    id="finance-comp-rate"
                    type="text"
                    inputmode="decimal"
                    value={failedMinor('createCompensationRule', 'rateMinor', '0.00')}
                    data-minor-target="rateMinor"
                    oninput={syncDecimalToMinor}
                    required
                  />
                </Field>
              {/if}
              {#if ['Hourly', 'Daily'].includes(compensationRuleType)}
                <Field
                  id="finance-comp-ratebasis"
                  label={translate('Rate basis')}
                  data-field="rateBasis"
                >
                  <select
                    id="finance-comp-ratebasis"
                    name="rateBasis"
                    bind:value={compensationRateBasis}
                  >
                    <option value="hourly">{translate('Hourly')}</option>
                    <option value="daily">{translate('Daily')}</option>
                  </select>
                </Field>
              {:else}
                <input type="hidden" name="rateBasis" value="hourly" />
              {/if}
              {#if compensationRuleType === 'PercentageOfEligibleClientLabor'}
                <p class="muted finance-config-wide">
                  {translate(
                    'The percentage applies only to the selected eligible client-labor basis. Non-billable work, excluded categories and uncollected amounts are excluded according to that basis; partial client collection produces only the collected eligible share.',
                  )}
                </p>
                <Field
                  id="finance-comp-percentagebasis"
                  label={translate('Percentage basis')}
                  data-field="percentageBasis"
                >
                  <select id="finance-comp-percentagebasis" name="percentageBasis">
                    <option
                      value="CLIENT_LABOR_BEFORE_TAX"
                      selected={failedValue('createCompensationRule', 'percentageBasis') ===
                        'CLIENT_LABOR_BEFORE_TAX'}>{translate('Client labor before tax')}</option
                    >
                    <option
                      value="CLIENT_LABOR_AFTER_APPROVED_DISCOUNT"
                      selected={failedValue('createCompensationRule', 'percentageBasis') ===
                        'CLIENT_LABOR_AFTER_APPROVED_DISCOUNT'}
                      >{translate('Client labor after approved discount')}</option
                    >
                    <option
                      value="ISSUED_ELIGIBLE_LABOR"
                      selected={failedValue('createCompensationRule', 'percentageBasis') ===
                        'ISSUED_ELIGIBLE_LABOR'}>{translate('Issued eligible labor')}</option
                    >
                    <option
                      value="COLLECTED_ELIGIBLE_LABOR"
                      selected={failedValue('createCompensationRule', 'percentageBasis') ===
                        'COLLECTED_ELIGIBLE_LABOR'}>{translate('Collected eligible labor')}</option
                    >
                  </select>
                </Field>
              {/if}
              <Field
                id="finance-comp-trigger"
                label={translate('Settlement trigger')}
                data-field="settlementTrigger"
              >
                <select id="finance-comp-trigger" name="settlementTrigger">
                  <option
                    value="ON_APPROVED_BILLABLE_LABOR"
                    selected={failedValue('createCompensationRule', 'settlementTrigger') ===
                      'ON_APPROVED_BILLABLE_LABOR'}>{translate('Approved billable labor')}</option
                  >
                  <option
                    value="ON_INVOICE_ISSUE"
                    selected={failedValue('createCompensationRule', 'settlementTrigger') ===
                      'ON_INVOICE_ISSUE'}>{translate('Invoice issue')}</option
                  >
                  <option
                    value="ON_CLIENT_PAYMENT"
                    selected={failedValue('createCompensationRule', 'settlementTrigger') ===
                      'ON_CLIENT_PAYMENT'}>{translate('Client payment')}</option
                  >
                </select>
              </Field>
              {#if compensationRuleType === 'PercentageOfEligibleClientLabor' || compensationOvertimeMethod === 'PERCENTAGE_OF_ELIGIBLE_CLIENT_OVERTIME'}
                <Field
                  id="finance-comp-percentage"
                  label={translate(
                    compensationRuleType === 'PercentageOfEligibleClientLabor'
                      ? 'Percentage'
                      : 'Overtime percentage',
                  )}
                  data-field="percentageBps"
                >
                  <input
                    type="hidden"
                    name="percentageBps"
                    value={failedValue('createCompensationRule', 'percentageBps') ?? '0'}
                  />
                  <input
                    id="finance-comp-percentage"
                    type="text"
                    inputmode="decimal"
                    value={failedBps('createCompensationRule', 'percentageBps', '0')}
                    data-bps-target="percentageBps"
                    oninput={syncPercentToBps}
                    placeholder={translate('e.g. 55')}
                    required
                  />
                </Field>
              {/if}
              <Field
                id="finance-comp-daily"
                label={translate('Daily guarantee (minutes)')}
                data-field="dailyGuaranteeMinutes"
              >
                <input
                  id="finance-comp-daily"
                  name="dailyGuaranteeMinutes"
                  type="number"
                  value={failedValue('createCompensationRule', 'dailyGuaranteeMinutes') ?? ''}
                  min="0"
                  max="1440"
                />
              </Field>
              <Field
                id="finance-comp-overtime-method"
                label={translate('Worker overtime method')}
                data-field="overtimeMethod"
              >
                <select
                  id="finance-comp-overtime-method"
                  name="overtimeMethod"
                  bind:value={compensationOvertimeMethod}
                >
                  <option value="NONE">{translate('None')}</option>
                  <option value="BASE_RATE_MULTIPLIER">{translate('Base rate multiplier')}</option>
                  <option value="FIXED_RATE">{translate('Fixed rate')}</option>
                  <option value="FIXED_ADDITION_PER_HOUR"
                    >{translate('Fixed addition per hour')}</option
                  >
                  <option value="PERCENTAGE_OF_ELIGIBLE_CLIENT_OVERTIME"
                    >{translate('Percentage of eligible overtime')}</option
                  >
                </select>
              </Field>
              {#if compensationOvertimeMethod === 'BASE_RATE_MULTIPLIER'}
                <Field
                  id="finance-comp-overtime-multiplier"
                  label={translate('Worker overtime multiplier')}
                  data-field="overtimeMultiplierBps"
                >
                  <input
                    type="hidden"
                    name="overtimeMultiplierBps"
                    value={failedValue('createCompensationRule', 'overtimeMultiplierBps') ??
                      '15000'}
                  />
                  <input
                    id="finance-comp-overtime-multiplier"
                    type="number"
                    min="0"
                    max="10"
                    step="0.01"
                    value={failedMultiplier(
                      'createCompensationRule',
                      'overtimeMultiplierBps',
                      '1.50',
                    )}
                    data-bps-target="overtimeMultiplierBps"
                    oninput={syncMultiplierToBps}
                    required
                  />
                </Field>
              {:else if ['FIXED_RATE', 'FIXED_ADDITION_PER_HOUR'].includes(compensationOvertimeMethod)}
                <Field
                  id="finance-comp-overtime-rate"
                  label={translate(
                    compensationOvertimeMethod === 'FIXED_RATE'
                      ? 'Fixed overtime rate'
                      : 'Fixed addition per hour',
                  )}
                  data-field="overtimeRateMinor"
                >
                  <input
                    type="hidden"
                    name="overtimeRateMinor"
                    value={failedValue('createCompensationRule', 'overtimeRateMinor') ?? '0'}
                  />
                  <input
                    id="finance-comp-overtime-rate"
                    type="text"
                    inputmode="decimal"
                    value={failedMinor('createCompensationRule', 'overtimeRateMinor', '0.00')}
                    data-minor-target="overtimeRateMinor"
                    oninput={syncDecimalToMinor}
                    required
                  />
                </Field>
              {/if}
              <Field
                id="finance-comp-effective"
                label={translate('Effective from')}
                required
                data-field="effectiveFrom"
              >
                <input
                  id="finance-comp-effective"
                  name="effectiveFrom"
                  type="date"
                  value={failedValue('createCompensationRule', 'effectiveFrom') ??
                    linkedProjectionDate}
                  required
                />
              </Field>
              <Field
                id="finance-comp-effective-to"
                label={translate('Effective to')}
                data-field="effectiveTo"
              >
                <input
                  id="finance-comp-effective-to"
                  name="effectiveTo"
                  type="date"
                  value={failedValue('createCompensationRule', 'effectiveTo') ?? ''}
                />
              </Field>
              <Field id="finance-comp-notes" label={translate('Notes')} data-field="notes">
                <textarea id="finance-comp-notes" name="notes" maxlength="2000" rows="3"
                  >{failedValue('createCompensationRule', 'notes') ?? ''}</textarea
                >
              </Field>
            </FieldGroup>
            <div class="form-actions">
              <button>{translate('Save compensation rule')}</button>
            </div>
          </form>
        </FormSection>
      {/if}

      {#if selectedAction === 'Client labor rate'}
        <FormSection title={translate('Client labor rate')}>
          <form
            method="POST"
            action={configurationActionUrl('createClientLaborRate')}
            class="admin-form-grid"
            use:formValidation
          >
            <input
              type="hidden"
              name="projectId"
              value={failedValue('createClientLaborRate', 'projectId') ?? data.selectedProjectId}
            />
            <FieldGroup columns="2">
              <Field
                id="finance-client-worker"
                label={translate('Worker scope')}
                data-field="workerId"
              >
                <select id="finance-client-worker" name="workerId">
                  <option
                    value=""
                    selected={failedValue('createClientLaborRate', 'workerId') === ''}
                    >{translate('All assigned workers')}</option
                  >
                  {#if unavailableWorker('createClientLaborRate')}
                    <option
                      value={unavailableWorker('createClientLaborRate') ?? ''}
                      selected
                      disabled>{translate('Choose an active worker.')}</option
                    >
                  {/if}
                  {#each data.workers ?? [] as worker}
                    <option
                      value={worker.id}
                      selected={String(worker.id) ===
                        (failedValue('createClientLaborRate', 'workerId') ??
                          linkedProjectionWorkerId)}>{worker.name}</option
                    >
                  {/each}
                </select>
              </Field>
              <Field
                id="finance-client-category"
                label={translate('Time category')}
                data-field="category"
              >
                <TimeCategorySelect
                  id="finance-client-category"
                  value={failedValue('createClientLaborRate', 'category') ?? ''}
                  {translate}
                />
              </Field>
              <Field
                id="finance-client-currency"
                label={translate('Currency')}
                data-field="currency"
              >
                <select id="finance-client-currency" name="currency">
                  {#each ['USD', 'BRL', 'EUR'] as currency}
                    <option
                      value={currency}
                      selected={currency ===
                        (failedValue('createClientLaborRate', 'currency') ??
                          selectedProjectCurrency)}>{currency}</option
                    >
                  {/each}
                </select>
              </Field>
              <Field
                id="finance-client-rate"
                label={translate('Hourly rate')}
                required
                data-field="hourlyRateMinor"
              >
                <input
                  type="hidden"
                  name="hourlyRateMinor"
                  value={failedValue('createClientLaborRate', 'hourlyRateMinor') ?? '0'}
                />
                <input
                  id="finance-client-rate"
                  type="text"
                  inputmode="decimal"
                  value={failedMinor('createClientLaborRate', 'hourlyRateMinor', '0.00')}
                  data-minor-target="hourlyRateMinor"
                  oninput={syncDecimalToMinor}
                  required
                />
              </Field>
              <Field
                id="finance-client-overtime"
                label={translate('Overtime method')}
                data-field="overtimeMethod"
              >
                <select
                  id="finance-client-overtime"
                  name="overtimeMethod"
                  bind:value={clientOvertimeMethod}
                >
                  <option value="BASE_RATE_MULTIPLIER">{translate('Base rate multiplier')}</option>
                  <option value="NONE">{translate('None')}</option>
                  <option value="FIXED_RATE">{translate('Fixed rate')}</option>
                  <option value="FIXED_ADDITION_PER_HOUR"
                    >{translate('Fixed addition per hour')}</option
                  >
                </select>
              </Field>
              {#if clientOvertimeMethod === 'BASE_RATE_MULTIPLIER'}
                <Field
                  id="finance-client-overtimemult"
                  label={translate('Overtime multiplier')}
                  data-field="overtimeMultiplierBps"
                >
                  <input
                    type="hidden"
                    name="overtimeMultiplierBps"
                    value={failedValue('createClientLaborRate', 'overtimeMultiplierBps') ?? '15000'}
                  />
                  <input
                    id="finance-client-overtimemult"
                    type="number"
                    min="0"
                    max="10"
                    step="0.01"
                    value={failedMultiplier(
                      'createClientLaborRate',
                      'overtimeMultiplierBps',
                      '1.50',
                    )}
                    data-bps-target="overtimeMultiplierBps"
                    oninput={syncMultiplierToBps}
                    required
                  />
                </Field>
              {:else if ['FIXED_RATE', 'FIXED_ADDITION_PER_HOUR'].includes(clientOvertimeMethod)}
                <Field
                  id="finance-client-overtime-rate"
                  label={translate(
                    clientOvertimeMethod === 'FIXED_RATE'
                      ? 'Fixed overtime rate'
                      : 'Fixed addition per hour',
                  )}
                  data-field="overtimeRateMinor"
                >
                  <input
                    type="hidden"
                    name="overtimeRateMinor"
                    value={failedValue('createClientLaborRate', 'overtimeRateMinor') ?? '0'}
                  />
                  <input
                    id="finance-client-overtime-rate"
                    type="text"
                    inputmode="decimal"
                    value={failedMinor('createClientLaborRate', 'overtimeRateMinor', '0.00')}
                    data-minor-target="overtimeRateMinor"
                    oninput={syncDecimalToMinor}
                    required
                  />
                </Field>
              {/if}
              <Field
                id="finance-client-effective"
                label={translate('Effective from')}
                required
                data-field="effectiveFrom"
              >
                <input
                  id="finance-client-effective"
                  name="effectiveFrom"
                  type="date"
                  value={failedValue('createClientLaborRate', 'effectiveFrom') ??
                    linkedProjectionDate}
                  required
                />
              </Field>
              <Field
                id="finance-client-eligible"
                label={translate('Percentage compensation')}
                data-field="eligibleForPercentage"
              >
                <label class="check">
                  <input
                    id="finance-client-eligible"
                    name="eligibleForPercentage"
                    type="checkbox"
                    checked={failedValue('createClientLaborRate', 'eligibleForPercentage') ===
                    undefined
                      ? true
                      : failedValue('createClientLaborRate', 'eligibleForPercentage') === 'on'}
                  />
                  {translate('Eligible for percentage compensation')}
                </label>
              </Field>
            </FieldGroup>
            <div class="form-actions">
              <button>{translate('Save client rate')}</button>
            </div>
          </form>
        </FormSection>
      {/if}

      {#if selectedAction === 'Internal loaded cost'}
        <FormSection title={translate('Internal loaded cost')}>
          <form
            method="POST"
            action={configurationActionUrl('createInternalCostRule')}
            class="admin-form-grid"
            use:formValidation
          >
            <FieldGroup columns="2">
              <Field
                id="finance-internal-project"
                label={translate('Project scope')}
                data-field="projectId"
              >
                <select id="finance-internal-project" name="projectId">
                  <option
                    value=""
                    selected={failedValue('createInternalCostRule', 'projectId') === ''}
                    >{translate('Global')}</option
                  >
                  {#each availableProjects as project}
                    <option
                      value={project.id}
                      selected={String(project.id) ===
                        String(
                          failedValue('createInternalCostRule', 'projectId') ??
                            data.selectedProjectId,
                        )}>{projectLabel(project)}</option
                    >
                  {/each}
                </select>
              </Field>
              <Field
                id="finance-internal-worker"
                label={translate('Worker')}
                required
                data-field="workerId"
              >
                <select id="finance-internal-worker" name="workerId" required>
                  <option value="">{translate('Select worker')}</option>
                  {#if unavailableWorker('createInternalCostRule')}
                    <option
                      value={unavailableWorker('createInternalCostRule') ?? ''}
                      selected
                      disabled>{translate('Choose an active worker.')}</option
                    >
                  {/if}
                  {#each data.workers ?? [] as worker}
                    <option
                      value={worker.id}
                      selected={String(worker.id) ===
                        (failedValue('createInternalCostRule', 'workerId') ??
                          linkedProjectionWorkerId)}>{worker.name}</option
                    >
                  {/each}
                </select>
              </Field>
              <Field
                id="finance-internal-currency"
                label={translate('Currency')}
                data-field="currency"
              >
                <select id="finance-internal-currency" name="currency">
                  {#each ['USD', 'BRL', 'EUR'] as currency}
                    <option
                      value={currency}
                      selected={currency ===
                        (failedValue('createInternalCostRule', 'currency') ??
                          selectedProjectCurrency)}>{currency}</option
                    >
                  {/each}
                </select>
              </Field>
              <Field
                id="finance-internal-cost"
                label={translate('Hourly cost')}
                required
                data-field="hourlyRateMinor"
              >
                <input
                  type="hidden"
                  name="hourlyRateMinor"
                  value={failedValue('createInternalCostRule', 'hourlyRateMinor') ?? '0'}
                />
                <input
                  id="finance-internal-cost"
                  type="text"
                  inputmode="decimal"
                  value={failedMinor('createInternalCostRule', 'hourlyRateMinor', '0.00')}
                  data-minor-target="hourlyRateMinor"
                  oninput={syncDecimalToMinor}
                  required
                />
              </Field>
              <Field
                id="finance-internal-method"
                label={translate('Cost method')}
                required
                data-field="costMethod"
              >
                <input
                  id="finance-internal-method"
                  name="costMethod"
                  value={failedValue('createInternalCostRule', 'costMethod') ?? 'loaded_cost'}
                  required
                />
              </Field>
              <Field
                id="finance-internal-overtime"
                label={translate('Overtime method')}
                data-field="overtimeMethod"
              >
                <select
                  id="finance-internal-overtime"
                  name="overtimeMethod"
                  bind:value={internalOvertimeMethod}
                >
                  <option value="BASE_RATE_MULTIPLIER">{translate('Base rate multiplier')}</option>
                  <option value="NONE">{translate('None')}</option>
                  <option value="FIXED_RATE">{translate('Fixed rate')}</option>
                  <option value="FIXED_ADDITION_PER_HOUR"
                    >{translate('Fixed addition per hour')}</option
                  >
                </select>
              </Field>
              {#if internalOvertimeMethod === 'BASE_RATE_MULTIPLIER'}
                <Field
                  id="finance-internal-overtimemult"
                  label={translate('Overtime multiplier')}
                  data-field="overtimeMultiplierBps"
                >
                  <input
                    type="hidden"
                    name="overtimeMultiplierBps"
                    value={failedValue('createInternalCostRule', 'overtimeMultiplierBps') ??
                      '15000'}
                  />
                  <input
                    id="finance-internal-overtimemult"
                    type="number"
                    min="0"
                    max="10"
                    step="0.01"
                    value={failedMultiplier(
                      'createInternalCostRule',
                      'overtimeMultiplierBps',
                      '1.50',
                    )}
                    data-bps-target="overtimeMultiplierBps"
                    oninput={syncMultiplierToBps}
                    required
                  />
                </Field>
              {:else if ['FIXED_RATE', 'FIXED_ADDITION_PER_HOUR'].includes(internalOvertimeMethod)}
                <Field
                  id="finance-internal-overtime-rate"
                  label={translate(
                    internalOvertimeMethod === 'FIXED_RATE'
                      ? 'Fixed overtime rate'
                      : 'Fixed addition per hour',
                  )}
                  data-field="overtimeRateMinor"
                >
                  <input
                    type="hidden"
                    name="overtimeRateMinor"
                    value={failedValue('createInternalCostRule', 'overtimeRateMinor') ?? '0'}
                  />
                  <input
                    id="finance-internal-overtime-rate"
                    type="text"
                    inputmode="decimal"
                    value={failedMinor('createInternalCostRule', 'overtimeRateMinor', '0.00')}
                    data-minor-target="overtimeRateMinor"
                    oninput={syncDecimalToMinor}
                    required
                  />
                </Field>
              {/if}
              <Field
                id="finance-internal-effective"
                label={translate('Effective from')}
                required
                data-field="effectiveFrom"
              >
                <input
                  id="finance-internal-effective"
                  name="effectiveFrom"
                  type="date"
                  value={failedValue('createInternalCostRule', 'effectiveFrom') ??
                    linkedProjectionDate}
                  required
                />
              </Field>
              <Field
                id="finance-internal-effective-to"
                label={translate('Effective to')}
                data-field="effectiveTo"
              >
                <input
                  id="finance-internal-effective-to"
                  name="effectiveTo"
                  type="date"
                  value={failedValue('createInternalCostRule', 'effectiveTo') ?? ''}
                />
              </Field>
              <Field id="finance-internal-notes" label={translate('Notes')} data-field="notes">
                <textarea id="finance-internal-notes" name="notes" maxlength="2000" rows="3"
                  >{failedValue('createInternalCostRule', 'notes') ?? ''}</textarea
                >
              </Field>
            </FieldGroup>
            <div class="form-actions">
              <button>{translate('Save internal cost')}</button>
            </div>
          </form>
        </FormSection>
      {/if}
    </div>
  {/if}
</FormCard>

<style>
  .finance-config__policy-problem {
    grid-column: 1 / -1;
    min-width: 0;
  }
  .assignment-commercial-comparison {
    display: grid;
    gap: 0.65rem;
    margin: 0 0 1rem;
    min-width: 0;
  }
  .assignment-commercial-comparison > div {
    padding: 0.65rem 0.8rem;
    border: 1px solid var(--ja-border-subdued, #d6d5d2);
    border-radius: var(--ja-control-radius, 0.5rem);
    min-width: 0;
  }
  .assignment-commercial-comparison dt {
    font-weight: 600;
  }
  .assignment-commercial-comparison dd {
    margin: 0.2rem 0 0;
    overflow-wrap: anywhere;
  }
  .assignment-commercial-comparison dd span {
    font-weight: 600;
  }
  .assignment-commercial-comparison__result {
    color: var(--ja-text-secondary, #54504a);
  }
  [id^='commercial-person-'] {
    scroll-margin-block-start: 6rem;
  }
</style>
