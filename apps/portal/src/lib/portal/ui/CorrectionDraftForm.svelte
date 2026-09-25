<script lang="ts">
  import TimeIntervalFields from './TimeIntervalFields.svelte';
  import { dailyCorrectionFields, technicalCorrectionFields } from '../correction-fields';
  import { base } from '$app/paths';
  import { onMount, untrack } from 'svelte';
  type ExpenseTimeOption = {
    id: string;
    workerName: string;
    minutes: number;
    summary: string;
    approvalState: string;
    correctionLinked: number;
  };

  type RecordType = 'time_entry' | 'expense' | 'daily_report' | 'technical_report';
  let {
    recordType,
    record,
    translate,
    ownerOverride = false,
    values = {},
    timeOptions = [],
    requestId,
  }: {
    recordType: RecordType;
    record: Record<string, unknown>;
    translate: (value: string) => string;
    ownerOverride?: boolean;
    values?: Record<string, unknown>;
    timeOptions?: ExpenseTimeOption[];
    requestId: string;
  } = $props();

  const original = (column: string): unknown => record[column];
  const decimalHours = (minutes: number): string => String(Number((minutes / 60).toFixed(4)));
  const fieldValue = (name: string, column: string): string => {
    const value = values[name] ?? original(column);
    return value === null || value === undefined ? '' : String(value);
  };
  const checked = (name: string, column: string): boolean => {
    const value = values[name] ?? original(column);
    return value === true || value === 'on' || value === 1 || value === '1';
  };
  const amount = (): string => {
    if (typeof values.amount === 'string') return values.amount;
    const minor = String(original('amount_minor') ?? '0').padStart(3, '0');
    return `${minor.slice(0, -2)}.${minor.slice(-2)}`;
  };
  const reportFields = $derived(
    recordType === 'daily_report' ? dailyCorrectionFields : technicalCorrectionFields,
  );
  let relatedOptions = $state(untrack(() => timeOptions));
  let relatedDate = $state(fieldValue('spentOn', 'spent_on'));
  let relatedTimeId = $state(fieldValue('timeEntryId', 'time_entry_id'));
  let relatedLoading = $state(false);
  let relatedError = $state(false);
  const statusLabel = (state: string): string =>
    (
      ({
        draft: 'Draft',
        submitted: 'Submitted',
        approved: 'Approved',
        needs_changes: 'Needs changes',
        locked: 'Locked',
      }) as Record<string, string>
    )[state] ?? state;
  async function loadRelatedOptions(date: string): Promise<void> {
    relatedDate = date;
    relatedTimeId = '';
    relatedOptions = [];
    relatedError = false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    relatedLoading = true;
    try {
      const params = new URLSearchParams({
        projectId: String(original('project_id')),
        workerId: String(original('worker_id')),
        date,
      });
      const response = await fetch(`${base}/app/api/expenses/time-options?${params}`, {
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Time options unavailable');
      const payload = (await response.json()) as { rows?: ExpenseTimeOption[] };
      if (relatedDate === date) relatedOptions = payload.rows ?? [];
    } catch {
      if (relatedDate === date) relatedError = true;
    } finally {
      if (relatedDate === date) relatedLoading = false;
    }
  }
  onMount(() => {
    if (recordType === 'expense' && relatedDate !== String(original('spent_on')))
      void loadRelatedOptions(relatedDate);
  });
</script>

<form
  method="POST"
  action="?/createCorrectionDraft"
  class="correction-form"
  data-correction-draft-form
>
  <input type="hidden" name="recordType" value={recordType} />
  <input type="hidden" name="correctionFields" value={recordType} />
  <input type="hidden" name="originalId" value={String(record.id)} />
  <input type="hidden" name="requestId" value={String(values.requestId ?? requestId)} />
  {#if ownerOverride}<input type="hidden" name="ownerOverride" value="yes" />{/if}
  <p class="correction-form__help">
    {translate(
      'Change the requested operational fields before creating this draft. Review every value: a linked correction cannot be edited after creation. You can withdraw an unsubmitted draft and start again.',
    )}
  </p>

  {#if recordType === 'time_entry'}
    <label>
      <span>{translate('Activity summary')}</span>
      <textarea
        name="activitySummary"
        minlength="3"
        maxlength="5000"
        required
        value={fieldValue('activitySummary', 'activity_summary')}
      ></textarea>
    </label>
    <div class="correction-form__grid">
      <label
        ><span>{translate('Date')}</span><input
          name="workDate"
          type="date"
          required
          value={fieldValue('workDate', 'work_date')}
        /></label
      >
      <label>
        <span>{translate('Operational category')}</span>
        <select name="category" required value={fieldValue('category', 'category')}>
          <option value="regular">{translate('Work')}</option>
          <option value="overtime">{translate('Overtime')}</option>
          <option value="travel">{translate('Travel')}</option>
          <option value="standby">{translate('Standby')}</option>
          <option value="commissioning">{translate('Commissioning')}</option>
          <option value="weekend_holiday">{translate('Weekend / holiday')}</option>
          <option value="remote_support">{translate('Remote support')}</option>
          <option value="training">{translate('Training')}</option>
          <option value="internal">{translate('Internal')}</option>
        </select>
      </label>
    </div>
    <TimeIntervalFields
      {translate}
      initialStart={fieldValue('startTime', 'start_time')}
      initialEnd={fieldValue('endTime', 'end_time')}
      initialBreak={Number(values.breakMinutes ?? original('break_minutes') ?? 0)}
      legacyMinutes={Number(values.minutes ?? original('minutes') ?? 0)}
    />
    <div class="correction-form__grid">
      <label
        ><span>{translate('Site')}</span><input
          name="site"
          value={fieldValue('site', 'site')}
          maxlength="200"
        /></label
      >
      <label
        ><span>{translate('Operational detail')}</span><input
          name="activityCode"
          value={fieldValue('activityCode', 'activity_code')}
          maxlength="100"
        /></label
      >
    </div>
  {:else if recordType === 'expense'}
    <div class="correction-form__grid">
      <label
        ><span>{translate('Vendor')}</span><input
          name="vendor"
          required
          maxlength="200"
          value={fieldValue('vendor', 'vendor')}
        /></label
      >
      <label
        ><span>{translate('Date')}</span><input
          name="spentOn"
          type="date"
          required
          value={fieldValue('spentOn', 'spent_on')}
          onchange={(event) => void loadRelatedOptions(event.currentTarget.value)}
        /></label
      >
    </div>
    <label
      ><span>{translate('Description')}</span><textarea
        name="description"
        required
        minlength="3"
        maxlength="5000"
        value={fieldValue('description', 'description')}
      ></textarea></label
    >
    <div class="correction-form__grid">
      <label>
        <span>{translate('Category')}</span>
        <select name="category" required value={fieldValue('category', 'category')}>
          {#each ['hotel', 'rental_car', 'fuel', 'tolls', 'parking', 'airfare', 'ground_transport', 'meals', 'per_diem', 'materials', 'tools', 'shipping', 'phone_data', 'visa_permit', 'other'] as category}
            <option value={category}>{translate(category.replaceAll('_', ' '))}</option>
          {/each}
        </select>
      </label>
      <label
        ><span>{translate('Amount')} ({String(original('currency'))})</span><input
          name="amount"
          required
          inputmode="decimal"
          pattern="[0-9]+([.][0-9][0-9]?)?"
          value={amount()}
        /></label
      >
      <label
        ><span>{translate('Time expense occurred (optional)')}</span><input
          name="occurredTimeLocal"
          type="time"
          step="60"
          value={fieldValue('occurredTimeLocal', 'occurred_time_local')}
        /></label
      >
      <label
        ><span>{translate('Payment method (optional)')}</span><input
          name="paymentMethod"
          maxlength="80"
          value={fieldValue('paymentMethod', 'payment_method')}
        /></label
      >
    </div>
    <label>
      <span>{translate('Related logged hours (optional)')}</span>
      <select name="timeEntryId" bind:value={relatedTimeId}>
        <option value="">{translate('Expense only / no linked hours')}</option>
        {#if relatedDate === String(original('spent_on')) && relatedTimeId && !relatedOptions.some((option) => option.id === relatedTimeId)}
          <option value={relatedTimeId}
            >{translate('Current linked hours')} · {translate('Needs review')}</option
          >
        {/if}
        {#each relatedOptions as option (option.id)}
          <option value={option.id}>
            {option.workerName} · {decimalHours(option.minutes)} h · {translate(
              statusLabel(option.approvalState),
            )}{option.correctionLinked ? ` · ${translate('Correction')}` : ''} · {option.summary}
          </option>
        {/each}
      </select>
      {#if relatedLoading}<small>{translate('Loading logged hours…')}</small>{/if}
      {#if relatedError}<small
          >{translate(
            'Logged hours could not be loaded. You can still save an expense without a link.',
          )}</small
        >{/if}
    </label>
  {:else}
    <div class="correction-form__grid">
      {#each reportFields as field (field.name)}
        <label class:correction-form__wide={field.kind === 'textarea'}>
          <span>{translate(field.label)}</span>
          {#if field.kind === 'textarea'}
            <textarea
              name={field.name}
              required={field.required ?? false}
              maxlength="5000"
              value={fieldValue(field.name, field.column)}
            ></textarea>
          {:else if field.kind === 'checkbox'}
            <input name={field.name} type="checkbox" checked={checked(field.name, field.column)} />
          {:else if field.kind === 'number'}
            <input
              name={field.name}
              type="number"
              min="0"
              max="1440"
              step="1"
              required
              value={fieldValue(field.name, field.column) || '0'}
            />
          {:else}
            <input
              name={field.name}
              type={field.kind}
              required={field.required ?? false}
              maxlength={field.kind === 'date' ? undefined : 5000}
              value={fieldValue(field.name, field.column)}
            />
          {/if}
        </label>
      {/each}
    </div>
  {/if}

  <label>
    <span>{translate('Correction reason')}</span>
    <textarea
      name="reason"
      minlength="3"
      maxlength="2000"
      required
      value={fieldValue('reason', '__reason')}
    ></textarea>
  </label>
  <button type="submit"
    >{translate(ownerOverride ? 'Create owner override draft' : 'Create corrected draft')}</button
  >
</form>

<style>
  .correction-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    min-width: 0;
  }
  .correction-form__help {
    margin: 0;
  }
  .correction-form__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    min-width: 0;
  }
  .correction-form__wide {
    grid-column: 1 / -1;
  }
  .correction-form label {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }
  .correction-form :is(input, select, textarea) {
    width: 100%;
    min-width: 0;
  }
  .correction-form input[type='checkbox'] {
    width: auto;
  }
  .correction-form textarea {
    min-height: 5rem;
  }
  .correction-form button {
    justify-self: start;
    min-height: 2.75rem;
  }
  @media (max-width: 600px) {
    .correction-form__grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
