<script lang="ts">
  import { untrack } from 'svelte';
  import { formValidation } from '../ui';
  import { dirtyFormGuard } from '../dirty-form-guard';
  import TimezoneSelect from '../ui/TimezoneSelect.svelte';
  import CurrencySelect from '../ui/CurrencySelect.svelte';
  import ProjectSiteFields from './ProjectSiteFields.svelte';
  import ProjectCreationAssignments from './ProjectCreationAssignments.svelte';
  import ProjectBudgetInput from './ProjectBudgetInput.svelte';
  import {
    previewProjectReference,
    projectCopy,
    type ProjectCopyKey,
  } from '$lib/portal/project-ux-round3-copy';

  type Row = Record<string, unknown>;
  let {
    clients,
    contacts = [],
    workers = [],
    values = {},
    errors = {},
    initialClientId = '',
    canAssignWorkers = false,
    locale = 'en',
    translate,
    fieldLabel = (field: string) => field,
    onsubmit,
  }: {
    clients: Row[];
    contacts?: Row[];
    workers?: Row[];
    values?: Row;
    errors?: Record<string, string[] | undefined>;
    initialClientId?: string;
    canAssignWorkers?: boolean;
    locale?: string;
    translate: (text: string) => string;
    fieldLabel?: (field: string) => string;
    onsubmit?: () => void;
  } = $props();

  const c = (key: ProjectCopyKey, params: Record<string, string | number> = {}) =>
    projectCopy(locale, key, params);
  // A failed native POST re-renders the page, so the submitted values are
  // snapshotted once; later prop identity changes must not wipe typed input.
  const initialValues: Row = untrack(() => ({ ...values }));
  const value = (field: string, fallback = ''): string => {
    const entry = initialValues[field];
    return typeof entry === 'string' ? entry : fallback;
  };

  // Local form state is seeded once from a failed submission (or URL client).
  // svelte-ignore state_referenced_locally
  let clientId = $state(value('clientId', initialClientId));
  let costCenter = $state(value('costCenterCode'));
  let currencyOverride = $state<string | null>(null);
  let timezoneOverride = $state<string | null>(null);
  let submitting = $state(false);
  let projectManagerId = $state(value('projectManagerId'));
  let billingModel = $state(value('billingModel', 'tm'));
  let budgetType = $state(value('budgetType', 'none'));

  const client = $derived(clients.find((row) => String(row.id) === clientId));
  const currency = $derived(
    currencyOverride ?? value('currency', String(client?.currency ?? 'USD')),
  );
  const timezone = $derived(
    timezoneOverride ??
      (value('timezone') && value('clientId') === clientId
        ? value('timezone')
        : String(client?.timezone ?? 'America/New_York')),
  );
  const reference = $derived(
    client && costCenter.trim()
      ? previewProjectReference(
          String(client.client_code ?? ''),
          String(client.client_number ?? ''),
          costCenter,
        )
      : '',
  );
  const clientLabel = (row: Row) =>
    `${String(row.client_code ?? '').trim() || String(row.client_number ?? '')} · ${String(row.display_name ?? '')}`;
  const managers = $derived(
    workers.filter(
      (worker) => worker.role === 'project_manager' && String(worker.status ?? '') === 'active',
    ),
  );
  const essentialFields = new Set([
    'currency',
    'clientHourlyRate',
    'clientId',
    'name',
    'costCenterCode',
    'siteLocation',
    'timezone',
    'poNumber',
    'projectManagerId',
    'startDate',
  ]);
  const errorEntries = $derived(Object.entries(errors).filter(([, messages]) => messages?.length));
  const moreOpen = $derived(
    errorEntries.some(
      ([field]) =>
        !essentialFields.has(field) &&
        !/^(initial|personDefaults|assignments|workerId|startsOn|endsOn|effectiveFrom)/.test(field),
    ),
  );
  const fieldError = (field: string) => (errors[field] ?? []).map(translate).join(' · ');
</script>

<form
  use:dirtyFormGuard
  use:formValidation
  method="POST"
  action="?/createProject"
  class="project-create-simple"
  data-project-create-form
  onsubmit={() => {
    submitting = true;
    onsubmit?.();
  }}
>
  <header class="project-create-simple__header">
    <h2>{c('createTitle')}</h2>
    <p>{c('createIntro')}</p>
  </header>

  {#if errorEntries.length > 0}
    <div class="project-create-errors" role="alert" data-project-field-errors>
      <strong>{c('reviewErrors', { count: errorEntries.length })}</strong>
      <ul>
        {#each errorEntries as [field, messages] (field)}
          <li>{fieldLabel(field)}: {(messages ?? []).map(translate).join(' · ')}</li>
        {/each}
      </ul>
    </div>
  {/if}

  <div class="project-create-simple__grid">
    <label
      >{c('client')} *
      <select
        name="clientId"
        required
        bind:value={clientId}
        onchange={() => {
          currencyOverride = null;
          timezoneOverride = null;
        }}
        aria-invalid={Boolean(errors.clientId?.length)}
      >
        <option value="" disabled>{c('chooseClient')}</option>
        {#each clients as row (row.id)}<option value={String(row.id)}>{clientLabel(row)}</option
          >{/each}
      </select>
      {#if errors.clientId?.length}<small class="field-error">{fieldError('clientId')}</small>{/if}
    </label>
    <label
      >{c('name')} *
      <input
        name="name"
        required
        minlength="2"
        maxlength="200"
        defaultValue={value('name')}
        aria-invalid={Boolean(errors.name?.length)}
      />
      {#if errors.name?.length}<small class="field-error">{fieldError('name')}</small>{/if}
    </label>
    <label
      >{c('costCenter')}
      <input
        name="costCenterCode"
        maxlength="120"
        bind:value={costCenter}
        aria-invalid={Boolean(errors.costCenterCode?.length)}
        aria-describedby="project-create-reference"
      />
      <small id="project-create-reference">
        {#if reference}<strong data-project-reference-preview
            >{c('referencePreview', { reference })}</strong
          >
          · {c('referencePreviewSuffix')}{:else}{c('costCenterHint')} {c('costCenterAuto')}{/if}
      </small>
      {#if errors.costCenterCode?.length}<small class="field-error"
          >{fieldError('costCenterCode')}</small
        >{/if}
    </label>
    <label
      >{c('siteLocation')}
      <input name="siteLocation" maxlength="500" defaultValue={value('siteLocation')} />
      <small>{c('siteLocationHint')}</small>
    </label>
    {#key clientId}
      <TimezoneSelect
        name="timezone"
        label={`${c('timezone')} *`}
        value={timezone}
        {locale}
        hint={c('timezoneHint')}
        onchange={(zone) => (timezoneOverride = zone)}
      />
    {/key}
    <label
      >{c('poLabel')}
      <input name="poNumber" maxlength="100" defaultValue={value('poNumber')} />
      <small>{c('poHint')}</small>
    </label>
    <div class="project-create-simple__rate">
      <label
          >{translate('Currency')}
          <CurrencySelect
            value={currency}
            {locale}
            onchange={(code) => (currencyOverride = code)}
          />
        </label>
      <label
        >{c('clientRate', { currency })}
        <input
          name="clientHourlyRate"
          inputmode="decimal"
          autocomplete="off"
          pattern={'[0-9]+([.,][0-9]{1,2})?'}
          placeholder="85.00"
          defaultValue={value('clientHourlyRate')}
          aria-invalid={Boolean(errors.clientHourlyRate?.length)}
        />
      </label>
      <small>{c('clientRateHint')}</small>
    </div>
    <label
      >{c('projectManager')}
      <select name="projectManagerId" bind:value={projectManagerId}>
        <option value="">{c('unassigned')}</option>
        {#each managers as worker (worker.id)}<option value={String(worker.id)}
            >{String(worker.name ?? worker.email)}</option
          >{/each}
      </select>
    </label>
    <label
      >{c('startDate')}
      <input name="startDate" type="date" defaultValue={value('startDate')} />
      <small>{c('startDateHint')}</small>
    </label>
  </div>

  {#if canAssignWorkers}
    <section class="project-create-simple__workers" id="project-create-people">
      <h3>{c('workers')}</h3>
      <ProjectCreationAssignments
        {workers}
        {currency}
        {canAssignWorkers}
        values={initialValues}
        {errors}
        t={translate}
      />
    </section>
  {/if}

  <details
    class="project-create-simple__more"
    id="project-create-optional"
    data-project-optional-settings
    open={moreOpen}
  >
    <summary>
      <span>{c('moreSettings')}</span>
      <small>{c('moreSettingsHint')}</small>
    </summary>
    <div class="project-create-simple__grid">

      <label
        >{translate('Planned end date (optional)')}
        <input name="plannedEndDate" type="date" defaultValue={value('plannedEndDate')} />
      </label>
      <label
        >{translate('Billing model')}
        <select name="billingModel" bind:value={billingModel}>
          <option value="tm">{translate('Time & materials')}</option
          >
          <option value="tm_daily_minimum">{translate('T&M · daily minimum')}</option
          >
          <option value="all_in">{translate('Hourly labor with included expenses (all-in)')}</option
          >
          <option value="capped_tm">{translate('Capped T&M')}</option
          >
        </select>
      </label>
      <label
        >{c('expectedHours')}
        <input
          name="expectedHoursPerDay"
          type="number"
          step="0.25"
          min="0"
          max="24"
          inputmode="decimal"
          defaultValue={value('expectedHoursPerDay')}
        />
        <small>{c('expectedHint')}</small>
      </label>
      <label
        >{translate('Client daily minimum hours')}
        <input
          name="clientDailyMinimumHours"
          type="number"
          step="0.25"
          min="0"
          max="24"
          inputmode="decimal"
          defaultValue={value('clientDailyMinimumHours')}
        />
      </label>
      <label
        >{c('referenceLabel')}
        <input name="projectNumber" maxlength="120" defaultValue={value('projectNumber')} />
        <small>{c('referenceHint')}</small>
      </label>
      <label class="wide"
        >{translate('Description')}
        <textarea name="description" rows="2" defaultValue={value('description')}></textarea>
      </label>
      <label
        >{translate('Project alias')}
        <input name="projectAlias" maxlength="120" defaultValue={value('projectAlias')} />
      </label>
      <div class="wide">
        <ProjectSiteFields
          {clientId}
          {contacts}
          values={initialValues}
          allowNew
          hideLocation
          {translate}
        />
      </div>
      <label
        >{translate('Budget type')}
        <select name="budgetType" bind:value={budgetType}>
          {#each ([['none', 'No budget'], ['revenue', 'Revenue'], ['purchase_order', 'Purchase order'], ['labor', 'Labor'], ['travel', 'Travel'], ['expense', 'Expenses'], ['combined', 'Combined']] as const) as [option, text] (option)}
            <option value={option}>{translate(text)}</option>
          {/each}
        </select>
      </label>
      <ProjectBudgetInput
        name="revenueBudgetMinor"
        label={translate('Revenue budget')}
        value={value('revenueBudgetMinor')}
        {currency}
      />
      <ProjectBudgetInput
        name="poCapMinor"
        label={translate('PO cap')}
        value={value('poCapMinor')}
        {currency}
      />
      <ProjectBudgetInput
        name="laborBudgetMinutes"
        label={translate('Planned labor hours')}
        value={value('laborBudgetMinutes')}
        kind="hours"
      />
      <ProjectBudgetInput
        name="expenseBudgetMinor"
        label={translate('Expense budget')}
        value={value('expenseBudgetMinor')}
        {currency}
      />
      <ProjectBudgetInput
        name="travelBudgetMinor"
        label={translate('Travel budget')}
        value={value('travelBudgetMinor')}
        {currency}
      />
      <div class="wide project-create-simple__checks">
        <label class="check"
          ><input
            name="weeklyCloseEnabled"
            type="checkbox"
            defaultChecked={value('weeklyCloseEnabled') === 'on'}
          />
          {translate('Weekly close required')}</label
        >
        <label class="check"
          ><input
            name="dailyReportRequired"
            type="checkbox"
            defaultChecked={value('dailyReportRequired') === 'on'}
          />
          {translate('Daily report required')}</label
        >
        <label class="check"
          ><input
            name="technicalReportingRequired"
            type="checkbox"
            defaultChecked={value('technicalReportingRequired') === 'on'}
          />
          {translate('Technical reporting required')}</label
        >
      </div>
      <label class="wide"
        >{translate('Notes')}
        <textarea name="notes" rows="2" defaultValue={value('notes')}></textarea>
      </label>
    </div>
  </details>

  <div class="project-create-simple__actions">
    <button type="submit" class="primary-button" disabled={submitting}
      >{submitting ? c('saving') : c('create')}</button
    >
  </div>
</form>

<style>
  .project-create-simple {
    display: grid;
    gap: 1.25rem;
  }
  .project-create-simple__header h2 {
    margin: 0 0 0.25rem;
  }
  .project-create-simple__header p {
    margin: 0;
    color: var(--muted, #5f5b55);
  }
  .project-create-simple__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
    gap: 1rem 1.25rem;
    align-items: start;
  }
  .project-create-simple__grid > label,
  .project-create-simple__grid > :global(.timezone-select) {
    display: grid;
    gap: 0.35rem;
    font-weight: 600;
    min-width: 0;
  }
  .project-create-simple__grid label :global(input),
  .project-create-simple__grid label :global(select),
  .project-create-simple__grid label :global(textarea) {
    font-weight: 400;
    width: 100%;
    min-width: 0;
  }
  .project-create-simple__grid small {
    font-weight: 400;
    color: var(--muted, #5f5b55);
    overflow-wrap: anywhere;
  }
  .project-create-simple__grid small strong {
    color: var(--text, #1f1d1a);
  }
  .project-create-simple__rate {
    display: grid;
    grid-template-columns: minmax(5.5rem, 7rem) minmax(0, 1fr);
    gap: 0.35rem 0.75rem;
    align-items: start;
  }
  .project-create-simple__rate label {
    display: grid;
    gap: 0.35rem;
    font-weight: 600;
    min-width: 0;
  }
  .project-create-simple__rate :global(select[data-currency-select]),
  .project-create-simple__rate input {
    width: 100%;
    min-width: 0;
    font-weight: 400;
  }
  .project-create-simple__rate small {
    grid-column: 1 / -1;
    color: var(--muted, #5f5b55);
  }
  .project-create-simple__grid .wide {
    grid-column: 1 / -1;
  }
  .project-create-simple__grid .check {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-weight: 400;
  }
  .project-create-simple__checks {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
  }
  .project-create-simple__workers h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }
  .project-create-simple__more {
    border: 1px solid var(--line, #e6e3dd);
    border-radius: 12px;
    padding: 0.75rem 1rem;
  }
  .project-create-simple__more > summary {
    cursor: pointer;
    display: grid;
    gap: 0.15rem;
    font-weight: 600;
    min-height: 2.75rem;
    align-content: center;
  }
  .project-create-simple__more > summary small {
    font-weight: 400;
    color: var(--muted, #5f5b55);
  }
  .project-create-simple__more[open] > summary {
    margin-bottom: 1rem;
  }
  .project-create-simple__actions {
    display: flex;
    justify-content: flex-end;
  }
  .project-create-simple__actions button {
    min-width: 12rem;
  }
  .field-error {
    color: var(--ja-status-danger, #a40f18) !important;
  }
  .project-create-errors {
    border: 1px solid var(--ja-status-danger, #a40f18);
    border-radius: 10px;
    padding: 0.75rem 1rem;
  }
  .project-create-errors ul {
    margin: 0.35rem 0 0;
    padding-left: 1.1rem;
  }
  @media (max-width: 640px) {
    .project-create-simple__actions button {
      width: 100%;
    }
  }
</style>
