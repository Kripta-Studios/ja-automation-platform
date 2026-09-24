<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { FormCard, FormSection, FieldGroup, Field, formValidation } from '../ui';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import { documentLanguage, type PortalLocale } from '../../portal-i18n';
  import { paymentMoney } from '../payment-money';

  let {
    data,
    availableProjects,
    isAuditor,
    translate,
    controlledValue,
    locale = 'en',
  }: {
    data: PortalData;
    locale?: PortalLocale;
    availableProjects: Row[];
    isAuditor: boolean;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
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

  const projectLabel = (project: Row): string => {
    const number = rowValue(project, 'projectNumber', 'project_number');
    const name = rowValue(project, 'name', 'projectName', 'project_name');
    if (number && name && number !== name) return `${number} — ${name}`;
    return number || name || rowValue(project, 'id');
  };

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
    `${ruleMoney(rule, moneyKey, 'currency')} · ${rowValue(rule, 'effectiveFrom', 'effective_from')} → ${rowValue(rule, 'effectiveTo', 'effective_to') || translate('open-ended')}`;

  const policyWriteRoles = ['owner_admin', 'finance_admin'];
  const canWritePolicy = $derived(!isAuditor && policyWriteRoles.includes(String(data.user.role)));
  const canManageCanonicalAuthority = $derived(
    !isAuditor && policyWriteRoles.includes(String(data.user.role)),
  );
  let overtimeEnabled = $state(true);
  let compensationOvertimeMethod = $state('NONE');
  let compensationRateBasis = $state('hourly');
  let clientOvertimeMethod = $state('BASE_RATE_MULTIPLIER');
  let internalOvertimeMethod = $state('BASE_RATE_MULTIPLIER');
  let expensePolicyPayer = $state('worker');
  let expensePolicyWorkerReimbursement = $state('at_cost');
  let expensePolicyClientRecovery = $state('at_cost');
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
  let selectedAction = $state(configurationActions[0]);
  $effect(() => {
    if ($page.url.hash === '#project-issuing-authority')
      selectedAction = 'Project issuing authority';
    if ($page.url.hash === '#person-expense-policies') selectedAction = 'Person expense policies';
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
      >{translate('Commercial agreement and example')} <span aria-hidden="true">↗</span></a
    >
  </div>
  <FormSection
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
          <input
            id="commercial-summary-category"
            name="category"
            value={data.commercialCategory ?? 'regular'}
            required
          />
        </Field>
      </FieldGroup>
      <div class="form-actions"><button type="submit">{translate('Review terms')}</button></div>
    </form>
    {#if data.commercialTermsSummary?.length}
      <div class="record-list" aria-label={translate('Person-specific labor terms')}>
        {#each data.commercialTermsSummary as terms}
          <article class="record-list-item" data-commercial-person={rowValue(terms, 'workerId')}>
            <div>
              <strong>{rowValue(terms, 'workerName')}</strong>
              <small>
                {translate('Customer charge')}: {ruleMoney(
                  terms,
                  'clientRateMinor',
                  'clientCurrency',
                )}
                {translate('per hour')} · {translate('Source')}: {termsSourceLabel(
                  rowValue(terms, 'clientSource'),
                )}
              </small>
              <small>
                {translate('Worker pay')}: {ruleMoney(terms, 'payRateMinor', 'payCurrency')}
                · {translate('Method')}: {rowValue(terms, 'payMethod') || '—'}
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
                  {translate('Configuration required')}: {terms.issueCodes
                    .map(termIssueLabel)
                    .join('; ')}
                </small>
              {/if}
              {#if canWritePolicy}
                <details class="assignment-commercial-editor">
                  <summary>{translate('Configure this person')}</summary>
                  <form
                    method="POST"
                    action={`?/setAssignmentCommercialRuleReferences&view=commercial&project=${encodeURIComponent(String(data.selectedProjectId ?? ''))}`}
                    class="admin-form-grid"
                    use:formValidation
                  >
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
                          value={rowValue(terms, 'clientBillRuleId')}
                        >
                          <option value="">{translate('Resolve by project and date')}</option>
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
                          value={rowValue(terms, 'workerCompensationRuleId')}
                        >
                          <option value="">{translate('Resolve by project and date')}</option>
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
                          value={rowValue(terms, 'internalCostRuleId')}
                        >
                          <option value="">{translate('Resolve by project and date')}</option>
                          {#each assignmentRuleOptions(data.internalCostRules, terms, 'worker') as rule}
                            <option value={rowValue(rule, 'id')}
                              >{assignmentRuleLabel(rule, 'hourly_rate_minor')}</option
                            >
                          {/each}
                        </select>
                      </Field>
                    </FieldGroup>
                    <div class="form-actions">
                      <button type="submit">{translate('Save person rules')}</button>
                    </div>
                  </form>
                  <form
                    method="POST"
                    action={`?/setAssignmentCommercialFallback&view=commercial&project=${encodeURIComponent(String(data.selectedProjectId ?? ''))}`}
                    class="admin-form-grid"
                    use:formValidation
                  >
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
                          value={terms.allowGlobalCompensation ? 'yes' : 'no'}
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
                          value={terms.allowGlobalInternalCost ? 'yes' : 'no'}
                        >
                          <option value="no">{translate('Off')}</option><option value="yes"
                            >{translate('On')}</option
                          >
                        </select>
                      </Field>
                    </FieldGroup>
                    <div class="form-actions">
                      <button type="submit">{translate('Save fallback options')}</button>
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
        'Choose separately whether the worker is reimbursed and whether the customer pays. Rules apply by person, payer, category, and expense date.',
      )}
      data-assignment-expense-policies
    >
      {#if canWritePolicy && data.selectedProjectId && data.commercialTermsSummary?.length}
        <form
          method="POST"
          action={`?/createAssignmentExpensePolicy&view=commercial&project=${encodeURIComponent(String(data.selectedProjectId))}`}
          class="admin-form-grid"
          data-assignment-expense-policy-form
          use:formValidation
        >
          <Field id="expense-policy-person" label={translate('Assigned person')} required>
            <select id="expense-policy-person" name="projectMemberId" required>
              <option value="">{translate('Select person')}</option>
              {#each data.commercialTermsSummary as person}
                <option value={rowValue(person, 'assignmentId')}
                  >{rowValue(person, 'workerName')}</option
                >
              {/each}
            </select>
          </Field>
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
            <Field
              id="expense-policy-category"
              label={translate('Expense category')}
              help={translate('Leave blank for all categories.')}
            >
              <input id="expense-policy-category" name="category" maxlength="80" />
            </Field>
            <Field id="expense-policy-from" label={translate('Effective from')} required>
              <input
                id="expense-policy-from"
                name="effectiveFrom"
                type="date"
                value={data.financeToday ?? ''}
                required
              />
            </Field>
            <Field id="expense-policy-to" label={translate('Effective to')}>
              <input id="expense-policy-to" name="effectiveTo" type="date" />
            </Field>
            <Field id="expense-policy-worker" label={translate('Worker reimbursement')} required>
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
                <option value="non_billable">{translate('Do not bill customer')}</option>
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
            <button type="submit">{translate('Save person expense policy')}</button>
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
                  >{translate('Worker reimbursement')}: {translate(
                    rowValue(policy, 'workerReimbursement'),
                  )} · {translate('Customer expense recovery')}: {translate(
                    rowValue(policy, 'clientRecovery'),
                  )}</small
                >
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
        <details class="finance-authority-revision">
          <summary>{translate('Create issuing legal entity revision')}</summary>
          <p class="muted">
            {translate(
              'Use verified legal and tax details. A revision is permanent evidence for later invoices.',
            )}
          </p>
          <form
            method="POST"
            action={`?/createCanonicalLegalEntityRevision&view=commercial&project=${encodeURIComponent(String(data.selectedProjectId ?? ''))}`}
            class="admin-form-grid"
            data-canonical-revision-form
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
                {#each data.legalEntities ?? [] as entity}
                  <option value={rowValue(entity, 'id')}>
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
                  value={data.canonicalAuthorityAsOf ?? ''}
                  required
                />
              </Field>
              <Field
                id="authority-effective-to"
                label={translate('Effective to')}
                data-field="effectiveTo"
              >
                <input id="authority-effective-to" name="effectiveTo" type="date" />
              </Field>
              <Field
                id="authority-legal-name"
                label={translate('Registered legal name')}
                required
                data-field="legalName"
              >
                <input id="authority-legal-name" name="legalName" required maxlength="300" />
              </Field>
              <Field
                id="authority-tax-identifier"
                label={translate('Tax identifier')}
                required
                data-field="taxIdentifier"
              >
                <input
                  id="authority-tax-identifier"
                  name="taxIdentifier"
                  required
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
                  maxlength="100"
                />
              </Field>
              <Field
                id="authority-address-line1"
                label={translate('Address line 1')}
                required
                data-field="addressLine1"
              >
                <input id="authority-address-line1" name="addressLine1" required maxlength="300" />
              </Field>
              <Field
                id="authority-address-line2"
                label={translate('Address line 2')}
                data-field="addressLine2"
              >
                <input id="authority-address-line2" name="addressLine2" maxlength="300" />
              </Field>
              <Field
                id="authority-locality"
                label={translate('City / locality')}
                required
                data-field="locality"
              >
                <input id="authority-locality" name="locality" required maxlength="160" />
              </Field>
              <Field id="authority-region" label={translate('Region')} data-field="region">
                <input id="authority-region" name="region" maxlength="160" />
              </Field>
              <Field
                id="authority-postal-code"
                label={translate('Postal code')}
                required
                data-field="postalCode"
              >
                <input id="authority-postal-code" name="postalCode" required maxlength="80" />
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
              ></textarea>
            </Field>
            <div class="form-actions">
              <button type="submit">{translate('Save legal entity revision')}</button>
            </div>
          </form>
        </details>
        <form
          method="POST"
          action={`?/assignProjectLegalEntity&view=commercial&project=${encodeURIComponent(String(data.selectedProjectId ?? ''))}`}
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
                  selected={String(project.id) === String(data.selectedProjectId)}
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
              {#each data.canonicalLegalEntityOptions ?? [] as option}
                <option value={rowValue(option, 'revisionId', 'revision_id')}>
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
              required
            />
          </Field>
          <Field
            id="finance-legal-entity-effective-to"
            label={translate('Effective to')}
            help={translate('Leave blank when this authority remains current.')}
          >
            <input id="finance-legal-entity-effective-to" name="effectiveTo" type="date" />
          </Field>
          <Field
            id="finance-legal-entity-reason"
            label={translate('Reason')}
            help={translate('Record why this project issuing authority was assigned.')}
            required
          >
            <textarea id="finance-legal-entity-reason" name="reason" minlength="5" required
            ></textarea>
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
      title={translate('Project commercial and time policy')}
      description={translate(
        'Configure effective-dated interpretation for eligible time and billing readiness. This is project configuration, not worker data entry.',
      )}
      data-project-commercial-policy
    >
      {#if canWritePolicy}
        <form
          method="POST"
          action="?/createProjectCommercialPolicy"
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
                  selected={String(project.id) === String(data.selectedProjectId)}
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
            <input id="finance-policy-effective" name="effectiveFrom" type="date" required />
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
              'This project policy controls client treatment; workers only record operational Travel truth.',
            )}
            required
          >
            <select id="finance-policy-travel" name="travelClientBillable" required>
              <option value="true">{translate('Client billable')}</option>
              <option value="false">{translate('Not client billable')}</option>
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
              <option value="true">{translate('Required')}</option>
              <option value="false">{translate('Not required')}</option>
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
    <div class="management-stack compact-stack finance-rule-registers">
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
                    <strong
                      >{rowValue(
                        rule,
                        'workerName',
                        'worker_name',
                        'workerId',
                        'worker_id',
                      )}</strong
                    >
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
                    <details>
                      <summary>{translate('Edit / supersede')}</summary>
                      <form
                        method="POST"
                        action="?/supersedeCompensationRule"
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
                            value={rowValue(rule, 'rateMinor', 'rate_minor') || '0'}
                          />
                          <input
                            type="text"
                            inputmode="decimal"
                            value={minorToDecimal(rowValue(rule, 'rateMinor', 'rate_minor'))}
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
                            value={rowValue(rule, 'effectiveFrom', 'effective_from')}
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
                    <form method="POST" action="?/deactivateCompensationRule">
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
                    <strong
                      >{rowValue(
                        rule,
                        'projectNumber',
                        'project_number',
                        'projectId',
                        'project_id',
                      )}</strong
                    >
                    <small>
                      {controlledValue('category', rowValue(rule, 'category')) ||
                        translate('All categories')} · {moneyLabel(
                        rule,
                        'hourlyRateMinor',
                        'hourly_rate_minor',
                      )}
                      · {rowValue(rule, 'effectiveFrom', 'effective_from')} →
                      {rowValue(rule, 'effectiveTo', 'effective_to') || translate('open-ended')}
                    </small>
                  </div>
                  <div class="form-actions">
                    <details>
                      <summary>{translate('Edit / supersede')}</summary>
                      <form
                        method="POST"
                        action="?/supersedeClientLaborRate"
                        class="admin-form-grid"
                        use:formValidation
                      >
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
                          label={translate('Hourly rate')}
                          required
                        >
                          <input
                            type="hidden"
                            name="hourlyRateMinor"
                            value={rowValue(rule, 'hourlyRateMinor', 'hourly_rate_minor') || '0'}
                          />
                          <input
                            type="text"
                            inputmode="decimal"
                            value={minorToDecimal(
                              rowValue(rule, 'hourlyRateMinor', 'hourly_rate_minor'),
                            )}
                            data-minor-target="hourlyRateMinor"
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
                            value={rowValue(rule, 'effectiveFrom', 'effective_from')}
                            required
                          />
                        </Field>
                        <input type="hidden" name="category" value={rowValue(rule, 'category')} />
                        <div class="form-actions">
                          <button>{translate('Save superseding rate')}</button>
                        </div>
                      </form>
                    </details>
                    <form method="POST" action="?/deactivateClientLaborRate">
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
                    <strong
                      >{rowValue(
                        rule,
                        'workerName',
                        'worker_name',
                        'workerId',
                        'worker_id',
                      )}</strong
                    >
                    <small>
                      {moneyLabel(rule, 'hourlyRateMinor', 'hourly_rate_minor')} ·
                      {rowValue(rule, 'effectiveFrom', 'effective_from')} →
                      {rowValue(rule, 'effectiveTo', 'effective_to') || translate('open-ended')}
                    </small>
                  </div>
                  <div class="form-actions">
                    <details>
                      <summary>{translate('Edit / supersede')}</summary>
                      <form
                        method="POST"
                        action="?/supersedeInternalCostRule"
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
                            value={rowValue(rule, 'hourlyRateMinor', 'hourly_rate_minor') || '0'}
                          />
                          <input
                            type="text"
                            inputmode="decimal"
                            value={minorToDecimal(
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
                            value={rowValue(rule, 'effectiveFrom', 'effective_from')}
                            required
                          />
                        </Field>
                        <div class="form-actions">
                          <button>{translate('Save superseding cost')}</button>
                        </div>
                      </form>
                    </details>
                    <form method="POST" action="?/deactivateInternalCostRule">
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
          action="?/settleCompensation"
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
                {#each data.workers ?? [] as worker}
                  <option value={worker.id}>{worker.name}</option>
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
                  <option value={project.id} selected={project.id === data.selectedProjectId}
                    >{projectLabel(project)}</option
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
              <input id="finance-settle-start" name="periodStart" type="date" required />
            </Field>
            <Field
              id="finance-settle-end"
              label={translate('Period end')}
              required
              data-field="periodEnd"
            >
              <input id="finance-settle-end" name="periodEnd" type="date" required />
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
            action="?/createCompensationRule"
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
                  {#each data.workers ?? [] as worker}
                    <option value={worker.id}
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
                  <option value="">{translate('Global')}</option>
                  {#each availableProjects as project}
                    <option value={project.id} selected={project.id === data.selectedProjectId}
                      >{projectLabel(project)}</option
                    >
                  {/each}
                </select>
              </Field>
              <Field id="finance-comp-currency" label={translate('Currency')} data-field="currency">
                <select id="finance-comp-currency" name="currency">
                  <option>USD</option><option>BRL</option><option>EUR</option>
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
                  <input type="hidden" name="rateMinor" value="0" />
                  <input
                    id="finance-comp-rate"
                    type="text"
                    inputmode="decimal"
                    value="0.00"
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
                    <option value="CLIENT_LABOR_BEFORE_TAX"
                      >{translate('Client labor before tax')}</option
                    >
                    <option value="CLIENT_LABOR_AFTER_APPROVED_DISCOUNT"
                      >{translate('Client labor after approved discount')}</option
                    >
                    <option value="ISSUED_ELIGIBLE_LABOR"
                      >{translate('Issued eligible labor')}</option
                    >
                    <option value="COLLECTED_ELIGIBLE_LABOR"
                      >{translate('Collected eligible labor')}</option
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
                  <option value="ON_APPROVED_BILLABLE_LABOR"
                    >{translate('Approved billable labor')}</option
                  >
                  <option value="ON_INVOICE_ISSUE">{translate('Invoice issue')}</option>
                  <option value="ON_CLIENT_PAYMENT">{translate('Client payment')}</option>
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
                  <input type="hidden" name="percentageBps" value="0" />
                  <input
                    id="finance-comp-percentage"
                    type="text"
                    inputmode="decimal"
                    value="0"
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
                  <input type="hidden" name="overtimeMultiplierBps" value="15000" />
                  <input
                    id="finance-comp-overtime-multiplier"
                    type="number"
                    min="0"
                    max="10"
                    step="0.01"
                    value="1.50"
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
                  <input type="hidden" name="overtimeRateMinor" value="0" />
                  <input
                    id="finance-comp-overtime-rate"
                    type="text"
                    inputmode="decimal"
                    value="0.00"
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
                <input id="finance-comp-effective" name="effectiveFrom" type="date" required />
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
            action="?/createClientLaborRate"
            class="admin-form-grid"
            use:formValidation
          >
            <input type="hidden" name="projectId" value={data.selectedProjectId} />
            <FieldGroup columns="2">
              <Field
                id="finance-client-worker"
                label={translate('Worker scope')}
                data-field="workerId"
              >
                <select id="finance-client-worker" name="workerId">
                  <option value="">{translate('All assigned workers')}</option>
                  {#each data.workers ?? [] as worker}
                    <option value={worker.id}>{worker.name}</option>
                  {/each}
                </select>
              </Field>
              <Field
                id="finance-client-category"
                label={translate('Time category')}
                data-field="category"
              >
                <input
                  id="finance-client-category"
                  name="category"
                  placeholder={translate('regular, overtime, travel')}
                />
              </Field>
              <Field
                id="finance-client-currency"
                label={translate('Currency')}
                data-field="currency"
              >
                <select id="finance-client-currency" name="currency">
                  <option>USD</option><option>BRL</option><option>EUR</option>
                </select>
              </Field>
              <Field
                id="finance-client-rate"
                label={translate('Hourly rate')}
                required
                data-field="hourlyRateMinor"
              >
                <input type="hidden" name="hourlyRateMinor" value="0" />
                <input
                  id="finance-client-rate"
                  type="text"
                  inputmode="decimal"
                  value="0.00"
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
                  <input type="hidden" name="overtimeMultiplierBps" value="15000" />
                  <input
                    id="finance-client-overtimemult"
                    type="number"
                    min="0"
                    max="10"
                    step="0.01"
                    value="1.50"
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
                  <input type="hidden" name="overtimeRateMinor" value="0" />
                  <input
                    id="finance-client-overtime-rate"
                    type="text"
                    inputmode="decimal"
                    value="0.00"
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
                <input id="finance-client-effective" name="effectiveFrom" type="date" required />
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
                    checked
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
            action="?/createInternalCostRule"
            class="admin-form-grid"
            use:formValidation
          >
            <input type="hidden" name="projectId" value={data.selectedProjectId} />
            <FieldGroup columns="2">
              <Field
                id="finance-internal-worker"
                label={translate('Worker')}
                required
                data-field="workerId"
              >
                <select id="finance-internal-worker" name="workerId" required>
                  <option value="">{translate('Select worker')}</option>
                  {#each data.workers ?? [] as worker}
                    <option value={worker.id}>{worker.name}</option>
                  {/each}
                </select>
              </Field>
              <Field
                id="finance-internal-currency"
                label={translate('Currency')}
                data-field="currency"
              >
                <select id="finance-internal-currency" name="currency">
                  <option>USD</option><option>BRL</option><option>EUR</option>
                </select>
              </Field>
              <Field
                id="finance-internal-cost"
                label={translate('Hourly cost')}
                required
                data-field="hourlyRateMinor"
              >
                <input type="hidden" name="hourlyRateMinor" value="0" />
                <input
                  id="finance-internal-cost"
                  type="text"
                  inputmode="decimal"
                  value="0.00"
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
                  value="loaded_cost"
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
                  <input type="hidden" name="overtimeMultiplierBps" value="15000" />
                  <input
                    id="finance-internal-overtimemult"
                    type="number"
                    min="0"
                    max="10"
                    step="0.01"
                    value="1.50"
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
                  <input type="hidden" name="overtimeRateMinor" value="0" />
                  <input
                    id="finance-internal-overtime-rate"
                    type="text"
                    inputmode="decimal"
                    value="0.00"
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
                <input id="finance-internal-effective" name="effectiveFrom" type="date" required />
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
