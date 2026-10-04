<script lang="ts">
  import { enhance } from '$app/forms';
  import { refreshAll } from '$app/navigation';
  import { untrack } from 'svelte';
  import type { ProjectPersonDefaults } from '@ja/database';
  let {
    projectId,
    currency,
    defaults,
    revision,
    canEdit,
    form,
    t,
  }: {
    projectId: string;
    currency: string;
    defaults: ProjectPersonDefaults | null;
    revision: number;
    canEdit: boolean;
    form?: unknown;
    t: (key: string) => string;
  } = $props();
  type Feedback = {
    action?: string;
    success?: boolean;
    message?: string;
    values?: Record<string, string>;
    fields?: Record<string, string[]>;
  };
  const feedback = $derived(form as Feedback | undefined);
  const failure = $derived(
    feedback?.action === 'saveProjectPersonDefaults' && !feedback.success ? feedback : undefined,
  );
  const initial = untrack(() => {
    const values =
      (form as Feedback | undefined)?.action === 'saveProjectPersonDefaults'
        ? (form as Feedback)?.values
        : {};
    const c = defaults?.config;
    return {
      effectiveFrom:
        values?.effectiveFrom ?? defaults?.effectiveFrom ?? new Date().toISOString().slice(0, 10),
      customerHourlyRate: values?.customerHourlyRate ?? c?.customerHourlyRate ?? '',
      internalCostHourlyRate: values?.internalCostHourlyRate ?? c?.internalCostHourlyRate ?? '',
      workerPayType: values?.workerPayType ?? c?.workerPayType ?? 'Hourly',
      workerPayAmount: values?.workerPayAmount ?? c?.workerPayAmount ?? '',
      percentageBasis: values?.percentageBasis ?? c?.percentageBasis ?? 'CLIENT_LABOR_BEFORE_TAX',
      expensePayer: values?.expensePayer ?? c?.expensePayer ?? 'worker',
      workerReimbursement: values?.workerReimbursement ?? c?.workerReimbursement ?? 'at_cost',
      clientRecovery: values?.clientRecovery ?? c?.clientRecovery ?? 'at_cost',
      markupPercent: values?.markupPercent ?? c?.markupPercent ?? '',
    };
  });
  let draft = $state(initial);
  const effectiveFromError = $derived(failure?.fields?.effectiveFrom?.map(t).join(' '));
  const effectiveFromId = $derived(`project-defaults-${projectId}-effective-from`);
  function fieldLabel(field: string): string {
    const labels: Record<string, string> = {
      effectiveFrom: 'Terms effective from',
      customerHourlyRate: 'Customer hourly rate',
      internalCostHourlyRate: 'Internal hourly cost',
      workerPayType: 'Worker compensation method',
      workerPayAmount:
        draft.workerPayType === 'PercentageOfEligibleClientLabor'
          ? 'Worker compensation percentage'
          : 'Worker compensation rate',
      percentageBasis: 'Percentage basis',
      expensePayer: 'Expense payer',
      workerReimbursement: 'Reimburse worker',
      clientRecovery: 'Charge customer for expense',
      markupPercent: 'Expense markup percentage',
    };
    return t(labels[field] ?? 'Check person terms fields');
  }
</script>

<section
  class="project-surface"
  aria-labelledby="project-defaults-title"
  data-project-person-defaults
>
  <h2 id="project-defaults-title">{t('Project defaults for people')}</h2>
  <p>
    {t(
      'New assignments can start from these defaults. Each saved person agreement is independent. Changing project settings or defaults does not change or erase worker overrides.',
    )}
  </p>
  {#if defaults}<p class="hint">
      {t('Latest saved defaults effective from')}: <strong>{defaults.effectiveFrom}</strong> · {t(
        'Revision',
      )}: {defaults.revision}
    </p>{:else}<p class="hint">
      {t('No project defaults saved. Enter individual terms when assigning a worker.')}
    </p>{/if}
  {#if canEdit}
    <details open={Boolean(failure) || !defaults}>
      <summary class="secondary-button">{t('Configure project defaults')}</summary>
      <form
        method="POST"
        action="?/saveProjectPersonDefaults&tab=billing"
        use:enhance={() =>
          async ({ result, update }) => {
            // Apply feedback before the revised defaults remount with their saved values.
            await update({ reset: false, invalidateAll: false });
            if (result.type === 'success') await refreshAll();
          }}
        class="defaults-form"
        data-defaults-form
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="expectedRevision" value={revision} />
        {#if failure}<div role="alert" class="warning">
            <strong>{t('Check person terms fields')}</strong>
            <p>{t(failure.message ?? '')}</p>
            {#each Object.entries(failure.fields ?? {}) as [field, messages]}<p>
                {fieldLabel(field)}: {messages.map(t).join(' ')}
              </p>{/each}
          </div>{/if}
        <div class="defaults-fields">
          <label
            >{t('Terms effective from')}<input
              id={effectiveFromId}
              name="effectiveFrom"
              type="date"
              bind:value={draft.effectiveFrom}
              required
              aria-invalid={Boolean(failure?.fields?.effectiveFrom)}
              aria-describedby={effectiveFromError ? `${effectiveFromId}-error` : undefined}
            />{#if effectiveFromError}<span id={`${effectiveFromId}-error`} class="hint">
                {effectiveFromError}
              </span>{/if}</label
          >
          <label
            >{t('Customer hourly rate')} ({currency})<input
              name="customerHourlyRate"
              inputmode="decimal"
              bind:value={draft.customerHourlyRate}
              required
              aria-invalid={Boolean(failure?.fields?.customerHourlyRate)}
            /></label
          >
          <label
            >{t('Internal hourly cost')} ({currency})<input
              name="internalCostHourlyRate"
              inputmode="decimal"
              bind:value={draft.internalCostHourlyRate}
              required
              aria-invalid={Boolean(failure?.fields?.internalCostHourlyRate)}
            /></label
          >
          <label
            >{t('Worker compensation method')}<select
              name="workerPayType"
              bind:value={draft.workerPayType}
              ><option value="Hourly">{t('Hourly')}</option><option value="Daily"
                >{t('Daily')}</option
              ><option value="FixedPerBillingPeriod">{t('Fixed per billing period')}</option><option
                value="FixedProjectAmount">{t('Fixed project amount')}</option
              ><option value="PercentageOfEligibleClientLabor"
                >{t('Percentage of eligible client labor')}</option
              ></select
            ></label
          >
          <label
            >{draft.workerPayType === 'PercentageOfEligibleClientLabor'
              ? t('Worker compensation percentage')
              : `${t('Worker compensation rate')} (${currency})`}<input
              name="workerPayAmount"
              inputmode="decimal"
              bind:value={draft.workerPayAmount}
              required
              aria-invalid={Boolean(failure?.fields?.workerPayAmount)}
            /></label
          >
          {#if draft.workerPayType === 'PercentageOfEligibleClientLabor'}<label
              >{t('Percentage basis')}<select
                name="percentageBasis"
                bind:value={draft.percentageBasis}
                ><option value="CLIENT_LABOR_BEFORE_TAX">{t('Client labor before tax')}</option
                ><option value="CLIENT_LABOR_AFTER_APPROVED_DISCOUNT"
                  >{t('Client labor after approved discount')}</option
                ><option value="ISSUED_ELIGIBLE_LABOR">{t('Issued eligible labor')}</option><option
                  value="COLLECTED_ELIGIBLE_LABOR">{t('Collected eligible labor')}</option
                ></select
              ></label
            >{:else}<input
              type="hidden"
              name="percentageBasis"
              value={draft.percentageBasis}
            />{/if}
          <label
            >{t('Expense payer')}<select
              name="expensePayer"
              bind:value={draft.expensePayer}
              onchange={() => {
                if (draft.expensePayer !== 'worker') draft.workerReimbursement = 'none';
                if (draft.expensePayer === 'client') draft.clientRecovery = 'client_direct';
                else if (draft.clientRecovery === 'client_direct') draft.clientRecovery = 'at_cost';
              }}
              ><option value="worker">{t('Worker')}</option><option value="company_card"
                >{t('Company card')}</option
              ><option value="company_direct">{t('Company direct')}</option><option value="client"
                >{t('Client')}</option
              ><option value="third_party">{t('Third party')}</option></select
            ></label
          >
          <label
            >{t('Reimburse worker')}<select
              name="workerReimbursement"
              bind:value={draft.workerReimbursement}
              ><option value="none">{t('No reimbursement')}</option
              >{#if draft.expensePayer === 'worker'}<option value="at_cost">{t('At cost')}</option
                >{/if}</select
            ></label
          >
          <label
            >{t('Charge customer for expense')}<select
              name="clientRecovery"
              bind:value={draft.clientRecovery}
              >{#if draft.expensePayer === 'client'}<option value="client_direct"
                  >{t('Client pays directly')}</option
                >{:else}<option value="at_cost">{t('At cost')}</option><option value="markup"
                  >{t('Cost plus markup')}</option
                ><option value="included">{t('Included in labor price')}</option><option
                  value="non_billable">{t('Do not charge customer')}</option
                >{/if}</select
            ></label
          >
          {#if draft.clientRecovery === 'markup'}<label
              >{t('Expense markup percentage')}<input
                name="markupPercent"
                inputmode="decimal"
                bind:value={draft.markupPercent}
                required
                aria-invalid={Boolean(failure?.fields?.markupPercent)}
              /></label
            >{:else}<input type="hidden" name="markupPercent" value="" />{/if}
        </div>
        <p class="hint">
          {t(
            'Choose a later effective date for a new revision. Existing worker agreements and historical calculations are preserved.',
          )}
        </p>
        <button type="submit" class="primary-button">{t('Save project defaults')}</button>
      </form>
    </details>
  {/if}
</section>

<style>
  .defaults-form {
    display: grid;
    gap: 1rem;
    padding-top: 1rem;
  }
  .defaults-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
    gap: 1rem;
  }
  label {
    display: grid;
    gap: 0.4rem;
    min-width: 0;
  }
  input,
  select {
    min-height: 44px;
    width: 100%;
    box-sizing: border-box;
  }
  summary,
  button {
    min-height: 44px;
  }
</style>
