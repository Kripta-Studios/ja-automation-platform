<script lang="ts">
  /**
   * Optional per-person extras (owner request 2026-11-25): expenses, per diem, overtime and a
   * safety / hazard allowance, each with what the client pays and what the worker gets.
   * Every box may stay empty: empty means "not used". Amounts are typed in the project
   * currency; the server converts them to exact minor units.
   */
  import {
    extrasText,
    type AssignmentExtrasCopyKey,
    type ExtrasValues,
  } from '$lib/portal/assignment-extras-copy';

  let {
    values = $bindable(),
    currency,
    locale,
    idPrefix,
    showExpenses = true,
  }: {
    values: ExtrasValues;
    currency: string;
    locale: string;
    idPrefix: string;
    showExpenses?: boolean;
  } = $props();

  const t = (key: AssignmentExtrasCopyKey, params: Record<string, string | number> = {}) =>
    extrasText(locale, key, params);
  // One overtime choice for both sides keeps the block simple.
  let overtimeMethod = $state<'' | 'multiplier' | 'rate'>(
    values.overtimeClientMethod || values.overtimeWorkerMethod,
  );
  $effect(() => {
    values.overtimeClientMethod = overtimeMethod;
    values.overtimeWorkerMethod = overtimeMethod;
    if (!overtimeMethod) {
      values.overtimeClient = '';
      values.overtimeWorker = '';
    }
  });
  const multiplier = $derived(overtimeMethod === 'multiplier');
</script>

<div class="extras-fields" data-extras-fields={idPrefix}>
  <p class="extras-help">{t('extrasHelp')}</p>

  {#if showExpenses}
    <fieldset class="extras-group">
      <legend>{t('expenses')}</legend>
      <label class="extras-wide"
        ><span class="sr-only">{t('expenses')}</span>
        <select bind:value={values.expenses} data-extras-expenses>
          <option value="">{t('expensesProject')}</option>
          <option value="none">{t('expensesNone')}</option>
          <option value="worker">{t('expensesWorker')}</option>
          <option value="client">{t('expensesClient')}</option>
          <option value="both">{t('expensesBoth')}</option>
        </select></label
      >
      <small>{t('expensesHelp')}</small>
    </fieldset>
  {/if}

  <fieldset class="extras-group">
    <legend>{t('perDiem')}</legend>
    <div class="extras-pair">
      <label
        >{t('clientSide', { currency })}<input
          inputmode="decimal"
          autocomplete="off"
          placeholder="0.00"
          bind:value={values.perDiemClient}
          data-extras-per-diem-client
        /></label
      >
      <label
        >{t('workerSide', { currency })}<input
          inputmode="decimal"
          autocomplete="off"
          placeholder="0.00"
          bind:value={values.perDiemWorker}
          data-extras-per-diem-worker
        /></label
      >
    </div>
    <small>{t('perDiemHelp')}</small>
  </fieldset>

  <fieldset class="extras-group">
    <legend>{t('overtime')}</legend>
    <label class="extras-wide"
      >{t('overtimeHow')}
      <select bind:value={overtimeMethod} data-extras-overtime-method>
        <option value="">{t('overtimeProject')}</option>
        <option value="multiplier">{t('overtimeMultiplier')}</option>
        <option value="rate">{t('overtimeRate')}</option>
      </select></label
    >
    {#if overtimeMethod}
      <div class="extras-pair">
        <label
          >{multiplier ? t('clientMultiplier') : t('clientSide', { currency })}<input
            inputmode="decimal"
            autocomplete="off"
            placeholder={multiplier ? '1.5' : '0.00'}
            bind:value={values.overtimeClient}
            data-extras-overtime-client
          /></label
        >
        <label
          >{multiplier ? t('workerMultiplier') : t('workerSide', { currency })}<input
            inputmode="decimal"
            autocomplete="off"
            placeholder={multiplier ? '1.5' : '0.00'}
            bind:value={values.overtimeWorker}
            data-extras-overtime-worker
          /></label
        >
      </div>
    {/if}
    <small>{t('overtimeHelp')}</small>
  </fieldset>

  <fieldset class="extras-group">
    <legend>{t('allowance')}</legend>
    <div class="extras-basis" role="radiogroup" aria-label={t('allowance')}>
      <label class="extras-radio"
        ><input
          type="radio"
          value="day"
          bind:group={values.allowanceBasis}
          data-extras-allowance-day
        />{t('perDay')}</label
      >
      <label class="extras-radio"
        ><input
          type="radio"
          value="month"
          bind:group={values.allowanceBasis}
          data-extras-allowance-month
        />{t('perMonth')}</label
      >
    </div>
    <div class="extras-pair">
      <label
        >{t('clientSide', { currency })}<input
          inputmode="decimal"
          autocomplete="off"
          placeholder="0.00"
          bind:value={values.allowanceClient}
          oninput={() => {
            if (!values.allowanceBasis) values.allowanceBasis = 'day';
          }}
          data-extras-allowance-client
        /></label
      >
      <label
        >{t('workerSide', { currency })}<input
          inputmode="decimal"
          autocomplete="off"
          placeholder="0.00"
          bind:value={values.allowanceWorker}
          oninput={() => {
            if (!values.allowanceBasis) values.allowanceBasis = 'day';
          }}
          data-extras-allowance-worker
        /></label
      >
    </div>
    <small>{t('allowanceHelp')}</small>
  </fieldset>
  <p class="extras-help">{t('changesNote')}</p>
</div>

<style>
  .extras-fields {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }
  .extras-help {
    margin: 0;
    color: var(--project-muted, #77756d);
    font-size: 0.9rem;
  }
  .extras-group {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
    margin: 0;
    padding: 0.75rem;
    border: 1px solid var(--project-line, #e4e4e2);
    border-radius: 0.5rem;
    background: var(--project-surface, #fff);
  }
  .extras-group legend {
    padding: 0 0.25rem;
    font-weight: 600;
  }
  .extras-group small {
    color: var(--project-muted, #77756d);
  }
  .extras-pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem 0.75rem;
  }
  .extras-pair label,
  .extras-wide {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
    font-size: 0.9rem;
  }
  .extras-pair input,
  .extras-wide select {
    min-height: var(--ja-target-min, 2.75rem);
    width: 100%;
    min-width: 0;
  }
  .extras-basis {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.25rem;
  }
  .extras-radio {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: var(--ja-target-min, 2.75rem);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  @media (max-width: 520px) {
    .extras-pair {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
