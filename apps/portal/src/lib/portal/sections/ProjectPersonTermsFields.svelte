<script lang="ts">
  let {
    config = $bindable(),
    currency,
    errors = {},
    t,
  }: {
    config: Record<string, string>;
    currency: string;
    errors?: Record<string, string[] | undefined>;
    t: (key: string) => string;
  } = $props();
</script>

<div class="terms-fields">
  <label
    >{t('Customer hourly rate')} ({currency})<input
      inputmode="decimal"
      bind:value={config.customerHourlyRate}
      aria-invalid={Boolean(errors.customerHourlyRate)}
      required
    /></label
  >
  <label
    >{t('Internal hourly cost')} ({currency})<input
      inputmode="decimal"
      bind:value={config.internalCostHourlyRate}
      aria-invalid={Boolean(errors.internalCostHourlyRate)}
      required
    /></label
  >
  <label
    >{t('Worker compensation method')}<select
      bind:value={config.workerPayType}
      aria-invalid={Boolean(errors.workerPayType)}
      ><option value="Hourly">{t('Hourly')}</option><option value="Daily">{t('Daily')}</option
      ><option value="FixedPerBillingPeriod">{t('Fixed per billing period')}</option><option
        value="FixedProjectAmount">{t('Fixed project amount')}</option
      ><option value="PercentageOfEligibleClientLabor"
        >{t('Percentage of eligible client labor')}</option
      ></select
    ></label
  >
  <label
    >{config.workerPayType === 'PercentageOfEligibleClientLabor'
      ? t('Worker compensation percentage')
      : `${t('Worker compensation rate')} (${currency})`}<input
      inputmode="decimal"
      bind:value={config.workerPayAmount}
      aria-invalid={Boolean(errors.workerPayAmount)}
      required
    /></label
  >
  {#if config.workerPayType === 'PercentageOfEligibleClientLabor'}<label
      >{t('Percentage basis')}<select
        bind:value={config.percentageBasis}
        aria-invalid={Boolean(errors.percentageBasis)}
        ><option value="CLIENT_LABOR_BEFORE_TAX">{t('Client labor before tax')}</option><option
          value="CLIENT_LABOR_AFTER_APPROVED_DISCOUNT"
          >{t('Client labor after approved discount')}</option
        ><option value="ISSUED_ELIGIBLE_LABOR">{t('Issued eligible labor')}</option><option
          value="COLLECTED_ELIGIBLE_LABOR">{t('Collected eligible labor')}</option
        ></select
      ></label
    >{/if}
  <label
    >{t('Expense payer')}<select
      bind:value={config.expensePayer}
      aria-invalid={Boolean(errors.expensePayer)}
      onchange={() => {
        if (config.expensePayer !== 'worker') config.workerReimbursement = 'none';
        if (config.expensePayer === 'client') config.clientRecovery = 'client_direct';
        else if (config.clientRecovery === 'client_direct') config.clientRecovery = 'at_cost';
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
      bind:value={config.workerReimbursement}
      aria-invalid={Boolean(errors.workerReimbursement)}
      ><option value="none">{t('No reimbursement')}</option
      >{#if config.expensePayer === 'worker'}<option value="at_cost">{t('At cost')}</option
        >{/if}</select
    ></label
  >
  <label
    >{t('Charge customer for expense')}<select
      bind:value={config.clientRecovery}
      aria-invalid={Boolean(errors.clientRecovery)}
      onchange={() => {
        if (config.clientRecovery !== 'markup') config.markupPercent = '';
      }}
      >{#if config.expensePayer === 'client'}<option value="client_direct"
          >{t('Client pays directly')}</option
        >{:else}<option value="at_cost">{t('At cost')}</option><option value="markup"
          >{t('Cost plus markup')}</option
        ><option value="included">{t('Included in labor price')}</option><option
          value="non_billable">{t('Do not charge customer')}</option
        >{/if}</select
    ></label
  >
  {#if config.clientRecovery === 'markup'}<label
      >{t('Expense markup percentage')}<input
        inputmode="decimal"
        bind:value={config.markupPercent}
        aria-invalid={Boolean(errors.markupPercent)}
        required
      /></label
    >{/if}
  {#each Object.entries(errors) as [field, messages]}<p class="warning" role="alert">
      {field}: {messages?.map(t).join(' ')}
    </p>{/each}
</div>

<style>
  .terms-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
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
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
  }
</style>
