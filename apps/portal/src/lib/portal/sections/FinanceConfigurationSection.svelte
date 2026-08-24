<script lang="ts">
  import { FormCard, FormSection, FieldGroup, Field, formValidation } from '../ui';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';

  let {
    data,
    availableProjects,
    isAuditor,
    translate,
    controlledValue,
  }: {
    data: PortalData;
    availableProjects: Row[];
    isAuditor: boolean;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
  } = $props();

  const rowValue = (row: Row, ...keys: string[]): string => {
    for (const key of keys) {
      const value = row[key];
      if (value !== null && value !== undefined && value !== '') return String(value);
    }
    return '';
  };

  const moneyLabel = (row: Row, ...keys: string[]): string => {
    const value = rowValue(row, ...keys);
    return value ? `${value} ${rowValue(row, 'currency')}`.trim() : '—';
  };

  const booleanValue = (row: Row, ...keys: string[]): boolean =>
    ['true', '1', 'yes', 'on'].includes(rowValue(row, ...keys).toLowerCase());

  const policyDecision = (row: Row, ...keys: string[]): string =>
    booleanValue(row, ...keys) ? translate('Yes') : translate('No');

  const policyWriteRoles = ['owner_admin', 'finance_admin'];
  const canWritePolicy = $derived(!isAuditor && policyWriteRoles.includes(String(data.user.role)));
  let overtimeEnabled = $state(true);
</script>

<FormCard title={translate('Finance configuration')} class="finance-config-panel">
  <div class="panel-title">
    <div>
      <h2>{translate('Finance configuration')}</h2>
      <p>
        {translate(
          'Rates are effective-dated and resolved by assignment, category, activity, and project scope.',
        )}
      </p>
    </div>
    <span>{translate('Exact minor units')}</span>
  </div>
  <!-- project-commercial-policy-start -->
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
                {rowValue(project, 'projectNumber', 'project_number', 'name', 'id')}
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
  <!-- project-commercial-policy-end -->
  {#if !isAuditor}
    <div class="management-stack compact-stack finance-rule-registers">
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
                    >{rowValue(rule, 'workerName', 'worker_name', 'workerId', 'worker_id')}</strong
                  >
                  <small>
                    {rowValue(rule, 'ruleType', 'rule_type')} · {moneyLabel(
                      rule,
                      'rateMinor',
                      'rate_minor',
                    )}
                    · {rowValue(rule, 'effectiveFrom', 'effective_from')} →
                    {rowValue(rule, 'effectiveTo', 'effective_to') || 'open'}
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
                        label={translate('Rate (minor units)')}
                        required
                      >
                        <input
                          name="rateMinor"
                          type="number"
                          min="0"
                          value={rowValue(rule, 'rateMinor', 'rate_minor') || '0'}
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
          <p class="muted">{translate('No compensation rules are configured for this project.')}</p>
        {/if}
      </FormSection>

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
                    {rowValue(rule, 'effectiveTo', 'effective_to') || 'open'}
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
                        value={rowValue(rule, 'overtimeMultiplierBps', 'overtime_multiplier_bps') ||
                          '10000'}
                      />
                      <input
                        type="hidden"
                        name="overtimeRateMinor"
                        value={rowValue(rule, 'overtimeRateMinor', 'overtime_rate_minor')}
                      />
                      <input
                        type="hidden"
                        name="eligibleForPercentage"
                        value={rowValue(rule, 'eligibleForPercentage', 'eligible_for_percentage') ||
                          'true'}
                      />
                      <Field
                        id={`finance-client-edit-rate-${rowValue(rule, 'id')}`}
                        label={translate('Hourly rate (minor units)')}
                        required
                      >
                        <input
                          name="hourlyRateMinor"
                          type="number"
                          min="0"
                          value={rowValue(rule, 'hourlyRateMinor', 'hourly_rate_minor') || '0'}
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
          <p class="muted">{translate('No client labor rates are configured for this project.')}</p>
        {/if}
      </FormSection>

      <FormSection title={translate('Assignment budget context / internal loaded cost')}>
        <p class="muted">{translate('Worker cost rules remain effective-dated and auditable.')}</p>
        {#if data.internalCostRules?.length}
          <div class="record-list" aria-label={translate('Internal cost rules')}>
            {#each data.internalCostRules as rule}
              <article class="record-list-item">
                <div>
                  <strong
                    >{rowValue(rule, 'workerName', 'worker_name', 'workerId', 'worker_id')}</strong
                  >
                  <small>
                    {moneyLabel(rule, 'hourlyRateMinor', 'hourly_rate_minor')} ·
                    {rowValue(rule, 'effectiveFrom', 'effective_from')} →
                    {rowValue(rule, 'effectiveTo', 'effective_to') || 'open'}
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
                        value={rowValue(rule, 'overtimeMultiplierBps', 'overtime_multiplier_bps') ||
                          '10000'}
                      />
                      <input
                        type="hidden"
                        name="overtimeRateMinor"
                        value={rowValue(rule, 'overtimeRateMinor', 'overtime_rate_minor')}
                      />
                      <Field
                        id={`finance-internal-edit-rate-${rowValue(rule, 'id')}`}
                        label={translate('Hourly cost (minor units)')}
                        required
                      >
                        <input
                          name="hourlyRateMinor"
                          type="number"
                          min="0"
                          value={rowValue(rule, 'hourlyRateMinor', 'hourly_rate_minor') || '0'}
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
    </div>
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
      <form method="POST" action="?/settleCompensation" class="admin-form-grid" use:formValidation>
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
                  >{project.project_number}</option
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
        <div class="form-actions"><button>{translate('Generate settlement snapshot')}</button></div>
      </form>
    </FormSection>
  {/if}
  {#if !isAuditor}
    <div class="management-stack compact-stack">
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
                    >{project.project_number}</option
                  >
                {/each}
              </select>
            </Field>
            <Field id="finance-comp-currency" label={translate('Currency')} data-field="currency">
              <select id="finance-comp-currency" name="currency">
                <option>USD</option><option>BRL</option><option>EUR</option>
              </select>
            </Field>
            <Field id="finance-comp-ruletype" label={translate('Rule type')} data-field="ruleType">
              <select id="finance-comp-ruletype" name="ruleType">
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
            <Field
              id="finance-comp-rate"
              label={translate('Rate (minor units)')}
              required
              data-field="rateMinor"
            >
              <input
                id="finance-comp-rate"
                name="rateMinor"
                type="number"
                min="0"
                value="0"
                required
              />
            </Field>
            <Field
              id="finance-comp-ratebasis"
              label={translate('Rate basis')}
              data-field="rateBasis"
            >
              <select id="finance-comp-ratebasis" name="rateBasis">
                <option value="hourly">{translate('Hourly')}</option>
                <option value="daily">{translate('Daily')}</option>
              </select>
            </Field>
            <Field
              id="finance-comp-percentage"
              label={translate('Percentage (basis points)')}
              data-field="percentageBps"
            >
              <input
                id="finance-comp-percentage"
                name="percentageBps"
                type="number"
                min="0"
                max="10000"
                placeholder={translate('e.g. 5500 = 55%')}
              />
            </Field>
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
                <option value="ISSUED_ELIGIBLE_LABOR">{translate('Issued eligible labor')}</option>
                <option value="COLLECTED_ELIGIBLE_LABOR"
                  >{translate('Collected eligible labor')}</option
                >
              </select>
            </Field>
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
            <Field id="finance-client-currency" label={translate('Currency')} data-field="currency">
              <select id="finance-client-currency" name="currency">
                <option>USD</option><option>BRL</option><option>EUR</option>
              </select>
            </Field>
            <Field
              id="finance-client-rate"
              label={translate('Hourly rate (minor units)')}
              required
              data-field="hourlyRateMinor"
            >
              <input
                id="finance-client-rate"
                name="hourlyRateMinor"
                type="number"
                min="0"
                required
              />
            </Field>
            <Field
              id="finance-client-overtime"
              label={translate('Overtime method')}
              data-field="overtimeMethod"
            >
              <select id="finance-client-overtime" name="overtimeMethod">
                <option value="BASE_RATE_MULTIPLIER">{translate('Base rate multiplier')}</option>
                <option value="NONE">{translate('None')}</option>
                <option value="FIXED_RATE">{translate('Fixed rate')}</option>
                <option value="FIXED_ADDITION_PER_HOUR"
                  >{translate('Fixed addition per hour')}</option
                >
                <option value="PERCENTAGE_OF_ELIGIBLE_CLIENT_OVERTIME"
                  >{translate('Percentage of eligible overtime')}</option
                >
              </select>
            </Field>
            <Field
              id="finance-client-overtimemult"
              label={translate('Overtime multiplier (bps)')}
              data-field="overtimeMultiplierBps"
            >
              <input
                id="finance-client-overtimemult"
                name="overtimeMultiplierBps"
                type="number"
                min="0"
                value="15000"
              />
            </Field>
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
              label={translate('Hourly cost (minor units)')}
              required
              data-field="hourlyRateMinor"
            >
              <input
                id="finance-internal-cost"
                name="hourlyRateMinor"
                type="number"
                min="0"
                required
              />
            </Field>
            <Field
              id="finance-internal-method"
              label={translate('Cost method')}
              required
              data-field="costMethod"
            >
              <input id="finance-internal-method" name="costMethod" value="loaded_cost" required />
            </Field>
            <Field
              id="finance-internal-overtime"
              label={translate('Overtime method')}
              data-field="overtimeMethod"
            >
              <select id="finance-internal-overtime" name="overtimeMethod">
                <option value="BASE_RATE_MULTIPLIER">{translate('Base rate multiplier')}</option>
                <option value="NONE">{translate('None')}</option>
                <option value="FIXED_RATE">{translate('Fixed rate')}</option>
                <option value="FIXED_ADDITION_PER_HOUR"
                  >{translate('Fixed addition per hour')}</option
                >
              </select>
            </Field>
            <Field
              id="finance-internal-overtimemult"
              label={translate('Overtime multiplier (bps)')}
              data-field="overtimeMultiplierBps"
            >
              <input
                id="finance-internal-overtimemult"
                name="overtimeMultiplierBps"
                type="number"
                min="0"
                value="15000"
              />
            </Field>
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
    </div>
  {/if}
</FormCard>
