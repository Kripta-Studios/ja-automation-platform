<script lang="ts">
  import { untrack } from 'svelte';
  import ProjectPersonTermsFields from './ProjectPersonTermsFields.svelte';
  let {
    workers,
    currency,
    canAssignWorkers,
    values,
    errors = {},
    t,
  }: {
    workers: Record<string, unknown>[];
    currency: string;
    canAssignWorkers: boolean;
    values?: Record<string, unknown>;
    errors?: Record<string, string[] | undefined>;
    t: (key: string) => string;
  } = $props();
  type Row = {
    workerId: string;
    startsOn: string;
    endsOn: string;
    mode: 'defaults' | 'override';
    config: Record<string, string>;
  };
  const empty = (): Record<string, string> => ({
    customerHourlyRate: '',
    internalCostHourlyRate: '',
    workerPayType: 'Hourly',
    workerPayAmount: '',
    percentageBasis: 'CLIENT_LABOR_BEFORE_TAX',
    expensePayer: 'worker',
    workerReimbursement: 'at_cost',
    clientRecovery: 'at_cost',
    markupPercent: '',
  });
  const initial = untrack(() => {
    let defaults: { effectiveFrom: string; config: Record<string, string> } | null = null;
    let rows: Row[] = [];
    try {
      defaults = JSON.parse(String(values?.personDefaultsJson ?? 'null'));
    } catch {
      /* Retain valid drafts only. */
    }
    try {
      rows = JSON.parse(String(values?.initialAssignmentsJson ?? '[]'));
    } catch {
      /* The server displays invalid structured input. */
    }
    return {
      enabled: Boolean(defaults),
      effectiveFrom:
        defaults?.effectiveFrom ??
        String(values?.startDate ?? new Date().toISOString().slice(0, 10)),
      config: defaults?.config ?? empty(),
      rows: (Array.isArray(rows) ? rows : [])
        .filter((row) => row && typeof row === 'object')
        .map((row) => ({ ...row, config: row.config ?? empty() })),
    };
  });
  let enabled = $state(initial.enabled);
  let defaultsOpen = $state(initial.enabled);
  let effectiveFrom = $state(initial.effectiveFrom);
  let config = $state(initial.config);
  let rows = $state(initial.rows);
  const eligible = $derived(
    workers.filter((worker) => worker.status === 'active' && worker.role === 'worker'),
  );
  const payload = $derived(
    rows.map((row) => ({
      workerId: row.workerId,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      mode: row.mode,
      ...(row.mode === 'override' ? { config: row.config } : {}),
    })),
  );
  function assignmentFieldLabel(field: string): string {
    const labels: Record<string, string> = {
      workerId: 'Worker',
      startsOn: 'Starts on',
      endsOn: 'Ends on (optional)',
      mode: 'Terms source',
      config: 'Rates, pay and expenses',
    };
    return t(labels[field] ?? 'Check person terms fields');
  }
  const draftChoiceLabels: Record<string, Record<string, string>> = {
    workerPayType: {
      Hourly: 'Hourly',
      Daily: 'Daily',
      FixedPerBillingPeriod: 'Fixed per billing period',
      FixedProjectAmount: 'Fixed project amount',
      PercentageOfEligibleClientLabor: 'Percentage of eligible client labor',
    },
    percentageBasis: {
      CLIENT_LABOR_BEFORE_TAX: 'Client labor before tax',
      CLIENT_LABOR_AFTER_APPROVED_DISCOUNT: 'Client labor after approved discount',
      ISSUED_ELIGIBLE_LABOR: 'Issued eligible labor',
      COLLECTED_ELIGIBLE_LABOR: 'Collected eligible labor',
    },
    expensePayer: {
      worker: 'Worker',
      company_card: 'Company card',
      company_direct: 'Company direct',
      client: 'Client',
      third_party: 'Third party',
    },
    workerReimbursement: {
      none: 'No reimbursement',
      at_cost: 'At cost',
    },
    clientRecovery: {
      at_cost: 'At cost',
      markup: 'Cost plus markup',
      included: 'Included in labor price',
      non_billable: 'Do not charge customer',
      client_direct: 'Client pays directly',
    },
  };
  function draftValue(value: string | undefined, suffix = ''): string {
    return value === undefined || value === '' ? '—' : `${value}${suffix}`;
  }
  function draftChoice(field: string): string {
    const value = config[field];
    if (value === undefined || value === '') return '—';
    const labels = draftChoiceLabels[field];
    return labels && Object.hasOwn(labels, value) ? t(labels[value]) : value;
  }
</script>

<div class="creation-people wide-field" data-project-creation-people>
  <details bind:open={defaultsOpen}>
    <summary>{t('Project defaults for people (optional)')}</summary>
    <label class="check"
      ><input
        type="checkbox"
        bind:checked={enabled}
        onchange={() => {
          if (!enabled)
            rows.forEach((row) => {
              if (row.mode === 'defaults') {
                row.mode = 'override';
                row.config = { ...config };
              }
            });
        }}
      />{t('Save default rates, pay and expense terms for this project')}</label
    >
    {#if enabled}<label
        >{t('Terms effective from')}<input
          type="date"
          bind:value={effectiveFrom}
          aria-invalid={Boolean(errors['personDefaults.effectiveFrom'])}
          required
        /></label
      >{#if errors['personDefaults.effectiveFrom']}<p class="warning" role="alert">
          {t('Terms effective from')}: {errors['personDefaults.effectiveFrom']?.map(t).join(' ')}
        </p>{/if}<ProjectPersonTermsFields
        bind:config
        {currency}
        {t}
        errorContext={t('Project defaults for people')}
        errors={Object.fromEntries(
          Object.entries(errors)
            .filter(([key]) => key.startsWith('personDefaults.config.'))
            .map(([key, messages]) => [key.slice(22), messages]),
        )}
      />{/if}
    <p class="form-help">
      {t(
        'New assignments can start from these defaults. Each saved person agreement is independent. Changing project settings or defaults does not change or erase worker overrides.',
      )}
    </p>
  </details>
  {#if canAssignWorkers}<details open={rows.length > 0}>
      <summary>{t('Worker assignments (optional)')}</summary>
      <p class="form-help">
        {t(
          'Add workers now, use project defaults or enter individual terms. You can also assign workers after creating the project.',
        )}
      </p>
      <table>
        <caption>{t('Worker assignment configuration')}</caption>
        <thead
          ><tr
            ><th>{t('Worker')}</th><th>{t('Assignment dates')}</th><th
              >{t('Rates, pay and expenses')}</th
            ><th>{t('Actions')}</th></tr
          ></thead
        >
        <tbody
          >{#each rows as row, i}<tr>
              <td
                ><label
                  >{t('Worker')}<select
                    bind:value={row.workerId}
                    aria-invalid={Boolean(errors[`assignments.${i}.workerId`])}
                    required
                    ><option value="">{t('Select worker')}</option>{#each eligible as worker}<option
                        value={String(worker.id)}
                        disabled={rows.some(
                          (other, index) => index !== i && other.workerId === String(worker.id),
                        )}>{String(worker.name)} · {String(worker.email)}</option
                      >{/each}</select
                  ></label
                ></td
              >
              <td
                ><label
                  >{t('Starts on')}<input
                    type="date"
                    bind:value={row.startsOn}
                    aria-invalid={Boolean(errors[`assignments.${i}.startsOn`])}
                    required
                  /></label
                ><label
                  >{t('Ends on (optional)')}<input
                    type="date"
                    bind:value={row.endsOn}
                    aria-invalid={Boolean(errors[`assignments.${i}.endsOn`])}
                  /></label
                ></td
              >
              <td
                ><label
                  >{t('Terms source')}<select bind:value={row.mode}
                    ><option value="defaults" disabled={!enabled}
                      >{t('Use project defaults')}</option
                    ><option value="override">{t('Override for this person')}</option></select
                  ></label
                >
                {#if row.mode === 'override'}<ProjectPersonTermsFields
                    config={row.config}
                    {currency}
                    {t}
                    errorContext={`${t('Assignment')} ${i + 1}`}
                    errors={Object.fromEntries(
                      Object.entries(errors)
                        .filter(([key]) => key.startsWith(`assignments.${i}.config.`))
                        .map(([key, messages]) => [
                          key.slice(`assignments.${i}.config.`.length),
                          messages,
                        ]),
                    )}
                  />{:else}<p class="form-help">
                    {t(
                      'The saved project defaults will be copied into this assignment. Future project changes preserve this agreement.',
                    )}
                  </p>
                  {#if enabled && row.mode === 'defaults'}
                    <div class="creation-defaults-recap">
                      <h4>{t('Current draft project defaults')}</h4>
                      <dl>
                        <div>
                          <dt>{t('Terms effective from')}</dt>
                          <dd>{draftValue(effectiveFrom)}</dd>
                        </div>
                        <div>
                          <dt>{t('Starts on')}</dt>
                          <dd>{draftValue(row.startsOn)}</dd>
                        </div>
                        <div>
                          <dt>{t('Ends on (optional)')}</dt>
                          <dd>{draftValue(row.endsOn)}</dd>
                        </div>
                        <div>
                          <dt>{t('Customer hourly rate')} ({currency})</dt>
                          <dd>{draftValue(config.customerHourlyRate)}</dd>
                        </div>
                        <div>
                          <dt>{t('Internal hourly cost')} ({currency})</dt>
                          <dd>{draftValue(config.internalCostHourlyRate)}</dd>
                        </div>
                        <div>
                          <dt>{t('Worker compensation method')}</dt>
                          <dd>{draftChoice('workerPayType')}</dd>
                        </div>
                        <div>
                          <dt>
                            {config.workerPayType === 'PercentageOfEligibleClientLabor'
                              ? t('Worker compensation percentage')
                              : `${t('Worker compensation rate')} (${currency})`}
                          </dt>
                          <dd>
                            {draftValue(
                              config.workerPayAmount,
                              config.workerPayType === 'PercentageOfEligibleClientLabor' ? '%' : '',
                            )}
                          </dd>
                        </div>
                        {#if config.workerPayType === 'PercentageOfEligibleClientLabor'}
                          <div>
                            <dt>{t('Percentage basis')}</dt>
                            <dd>{draftChoice('percentageBasis')}</dd>
                          </div>
                        {/if}
                        <div>
                          <dt>{t('Expense payer')}</dt>
                          <dd>{draftChoice('expensePayer')}</dd>
                        </div>
                        <div>
                          <dt>{t('Reimburse worker')}</dt>
                          <dd>{draftChoice('workerReimbursement')}</dd>
                        </div>
                        <div>
                          <dt>{t('Charge customer for expense')}</dt>
                          <dd>{draftChoice('clientRecovery')}</dd>
                        </div>
                        {#if config.clientRecovery === 'markup'}
                          <div>
                            <dt>{t('Expense markup percentage')}</dt>
                            <dd>{draftValue(config.markupPercent, '%')}</dd>
                          </div>
                        {/if}
                      </dl>
                    </div>
                  {/if}
                {/if}
              </td>
              <td>
                {#each Object.entries(errors).filter(([key]) => key.startsWith(`assignments.${i}.`) && !key.includes('.config.')) as [key, messages]}<p
                    class="warning"
                    role="alert"
                  >
                    {t('Assignment')}
                    {i + 1} · {assignmentFieldLabel(key.split('.').at(-1) ?? '')}: {messages
                      ?.map(t)
                      .join(' ')}
                  </p>{/each}
                <button
                  type="button"
                  class="secondary-button"
                  onclick={() => {
                    rows = rows.filter((_, index) => index !== i);
                  }}
                  aria-label={`${t('Remove worker assignment')} ${i + 1}`}>{t('Remove')}</button
                ></td
              >
            </tr>{/each}</tbody
        >
      </table>
      <button
        type="button"
        class="secondary-button"
        disabled={rows.length >= 100 || eligible.length === 0}
        onclick={() => {
          rows.push({
            workerId: '',
            startsOn: effectiveFrom,
            endsOn: '',
            mode: enabled ? 'defaults' : 'override',
            config: { ...config },
          });
        }}>{t('Add worker assignment')}</button
      >
    </details>
  {/if}
  <input
    type="hidden"
    name="personDefaultsJson"
    value={JSON.stringify(enabled ? { effectiveFrom, config } : null)}
  />
  <input
    type="hidden"
    name="initialAssignmentsJson"
    value={JSON.stringify(canAssignWorkers ? payload : [])}
  />
</div>

<style>
  .creation-people {
    display: grid;
    gap: 1rem;
    grid-column: 1/-1;
    min-width: 0;
  }
  details {
    border: 1px solid var(--line, #d9e0e7);
    border-radius: 0.75rem;
    padding: 1rem;
    min-width: 0;
  }
  summary {
    cursor: pointer;
    min-height: 44px;
    align-content: center;
    font-weight: 600;
  }
  label {
    display: grid;
    gap: 0.4rem;
    margin-bottom: 0.75rem;
    min-width: 0;
  }
  .check {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    min-height: 2.75rem;
    overflow-wrap: anywhere;
    cursor: pointer;
  }
  .check input[type='checkbox'] {
    box-sizing: border-box;
    flex: 0 0 1.2rem;
    width: 1.2rem;
    height: 1.2rem;
    min-width: 1.2rem;
    min-height: 1.2rem;
    max-width: 1.2rem;
    margin: 0;
    padding: 0;
  }
  input,
  select {
    min-height: 44px;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }
  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    margin: 1rem 0;
  }
  caption {
    text-align: left;
    font-weight: 600;
    padding: 0.75rem 0;
  }
  th,
  td {
    padding: 0.75rem;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid var(--line, #d9e0e7);
    overflow-wrap: anywhere;
  }
  th:nth-child(3) {
    width: 45%;
  }
  td select,
  td input {
    width: 100%;
  }
  .creation-defaults-recap,
  .creation-defaults-recap dl,
  .creation-defaults-recap dl > div {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }
  .creation-defaults-recap {
    margin-top: 0.75rem;
  }
  .creation-defaults-recap h4,
  .creation-defaults-recap dl,
  .creation-defaults-recap dd {
    margin: 0;
  }
  .creation-defaults-recap h4,
  .creation-defaults-recap dt,
  .creation-defaults-recap dd {
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  @media (max-width: 900px) {
    table,
    tbody,
    tr,
    td {
      display: block;
      width: 100%;
      box-sizing: border-box;
    }
    thead {
      display: none;
    }
    tr {
      border: 1px solid var(--line, #d9e0e7);
      border-radius: 0.75rem;
      margin-bottom: 1rem;
      padding: 0.25rem;
    }
    td {
      border-bottom: 0;
    }
  }
</style>
