<script lang="ts">
  import TimeIntervalFields from './TimeIntervalFields.svelte';
  import ProblemNotice from './ProblemNotice.svelte';
  import formValidation from './form-validation';
  import type { ProblemData } from '../../problem/contract';
  import { page } from '$app/stores';
  import { normalizePortalLocale, portalText } from '../../portal-i18n';
  import { dailyCorrectionFields, technicalCorrectionFields } from '../correction-fields';
  import { base } from '$app/paths';
  import { onMount, untrack } from 'svelte';
  import { beforeNavigate } from '$app/navigation';
  import { confirmDirtyForms, dirtyFormGuard } from '../dirty-form-guard';
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

  let correctionForm: HTMLFormElement | undefined = $state();
  beforeNavigate((navigation) => {
    if (
      navigation.to?.url.pathname === navigation.from?.url.pathname &&
      navigation.to?.url.search === navigation.from?.url.search
    )
      return;
    if (
      !navigation.willUnload &&
      !confirmDirtyForms(
        correctionForm,
        translate('Discard your unsaved changes? Your entered information will be lost.'),
      )
    )
      navigation.cancel();
  });

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
  const lookupLocale = $derived(
    normalizePortalLocale($page.url.searchParams.get('lang') ?? $page.data.locale),
  );
  const correctionAction = $derived.by(() => {
    const requestedLocale = $page.url.searchParams.get('lang');
    return requestedLocale
      ? `?/createCorrectionDraft&lang=${encodeURIComponent(requestedLocale)}`
      : '?/createCorrectionDraft';
  });
  let relatedOptions = $state(untrack(() => timeOptions));
  let relatedDate = $state(fieldValue('spentOn', 'spent_on'));
  let relatedTimeId = $state(fieldValue('timeEntryId', 'time_entry_id'));
  let relatedLoading = $state(false);
  let relatedProblem = $state<ProblemData | null>(null);
  let relatedOriginalLinkValid = $state<boolean | null>(
    untrack(() =>
      timeOptions.some((option) => option.id === String(original('time_entry_id') ?? '')),
    )
      ? true
      : null,
  );
  let relatedLoadedDate = String(original('spent_on'));
  let relatedRequest: AbortController | null = null;
  const originalLinkedTimeUnchanged = $derived(
    relatedTimeId === String(original('time_entry_id') ?? '') &&
      relatedDate === String(original('spent_on') ?? ''),
  );
  const originalLinkUnverified = $derived(
    Boolean(relatedTimeId) &&
      originalLinkedTimeUnchanged &&
      relatedOriginalLinkValid === null &&
      !relatedProblem,
  );
  const originalLinkDateMismatch = $derived(
    Boolean(relatedTimeId) &&
      relatedTimeId === String(original('time_entry_id') ?? '') &&
      relatedDate !== String(original('spent_on') ?? ''),
  );
  const relatedUnavailable = $derived(
    originalLinkDateMismatch ||
      Boolean(
        relatedTimeId &&
        !relatedLoading &&
        !relatedProblem &&
        !relatedOptions.some((option) => option.id === relatedTimeId) &&
        (!originalLinkedTimeUnchanged || relatedOriginalLinkValid === false),
      ),
  );
  const lookupRemedyLinks = $derived({
    sign_in_again: {
      label: portalText(lookupLocale, 'problem.remedy.signInAgain'),
      href: `${base}/app/login`,
    },
    contact_owner: { label: portalText(lookupLocale, 'problem.remedy.contactAccessOwner') },
    review_expense_form: {
      label: portalText(lookupLocale, 'problem.expenseLookup.reviewExpenseForm'),
    },
  });
  const lookupUnavailable = (): ProblemData => ({
    code: 'EXPENSE_LOOKUP_UNAVAILABLE',
    messageKey: 'problem.expenseLookup.unavailable',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'retry_expense_options' }],
    correlationId: '',
  });
  const lookupProblem = (payload: unknown): ProblemData => {
    if (!payload || typeof payload !== 'object') return lookupUnavailable();
    const candidate = payload as Partial<ProblemData>;
    if (typeof candidate.code !== 'string' || typeof candidate.messageKey !== 'string')
      return lookupUnavailable();
    return {
      code: candidate.code,
      messageKey: candidate.messageKey as ProblemData['messageKey'],
      params: candidate.params ?? {},
      fieldErrors: candidate.fieldErrors ?? {},
      remedies: Array.isArray(candidate.remedies) ? candidate.remedies : [],
      correlationId: candidate.correlationId ?? '',
    };
  };
  const caughtLookupProblem = (caught: unknown): ProblemData =>
    caught &&
    typeof caught === 'object' &&
    typeof (caught as Partial<ProblemData>).code === 'string' &&
    typeof (caught as Partial<ProblemData>).messageKey === 'string'
      ? (caught as ProblemData)
      : lookupUnavailable();
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
    relatedRequest?.abort();
    relatedProblem = null;
    relatedOriginalLinkValid = null;
    if (date !== relatedLoadedDate) {
      relatedLoadedDate = date;
      relatedOptions = [];
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      relatedLoading = false;
      return;
    }
    const controller = new AbortController();
    relatedRequest = controller;
    relatedLoading = true;
    try {
      const params = new URLSearchParams({
        projectId: String(original('project_id')),
        workerId: String(original('worker_id')),
        date,
        originalExpenseId: String(original('id')),
      });
      const response = await fetch(`${base}/app/api/expenses/time-options?${params}`, {
        credentials: 'same-origin',
        signal: controller.signal,
      });
      if (!response.ok) throw lookupProblem(await response.json().catch(() => null));
      const payload = (await response.json()) as {
        rows?: ExpenseTimeOption[];
        originalLinkValid?: boolean;
      };
      if (!controller.signal.aborted && relatedDate === date) {
        relatedOptions = payload.rows ?? [];
        relatedOriginalLinkValid = payload.originalLinkValid === true;
      }
    } catch (caught) {
      if (!controller.signal.aborted && relatedDate === date)
        relatedProblem = caughtLookupProblem(caught);
    } finally {
      if (!controller.signal.aborted && relatedDate === date) relatedLoading = false;
    }
  }
  onMount(() => {
    if (
      recordType === 'expense' &&
      (relatedDate !== String(original('spent_on')) ||
        (Boolean(original('time_entry_id')) &&
          !relatedOptions.some((option) => option.id === String(original('time_entry_id')))))
    )
      void loadRelatedOptions(relatedDate);
    return () => relatedRequest?.abort();
  });
</script>

<form
  method="POST"
  enctype={recordType === 'expense' ? 'multipart/form-data' : undefined}
  action={correctionAction}
  class="correction-form"
  data-correction-draft-form
  bind:this={correctionForm}
  use:formValidation
  use:dirtyFormGuard={{ initialDirty: String(values.originalId ?? '') === String(record.id) }}
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
        ><span>{translate('Vendor (optional)')}</span><input
          name="vendor"
          maxlength="200"
          value={fieldValue('vendor', 'vendor')}
        /></label
      >
      <label
        ><span>{translate('Date')}</span><input
          name="spentOn"
          type="date"
          required
          value={relatedDate}
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
      <select
        name="timeEntryId"
        bind:value={relatedTimeId}
        aria-invalid={relatedUnavailable}
        aria-describedby={relatedUnavailable ? 'correction-time-link-warning' : undefined}
      >
        <option value="">{translate('Expense only / no linked hours')}</option>
        {#if relatedTimeId && !relatedOptions.some((option) => option.id === relatedTimeId)}
          <option value={relatedTimeId}
            >{translate('Current linked hours')}{relatedProblem ||
            (originalLinkedTimeUnchanged && relatedOriginalLinkValid === true)
              ? ''
              : ` · ${translate('Needs review')}`}</option
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
      {#if relatedUnavailable}<small id="correction-time-link-warning" class="warning"
          >{translate(
            originalLinkDateMismatch
              ? 'problem.expenseLookup.originalTimeDateMismatch'
              : 'The selected logged hours are no longer available. Review the link before saving.',
          )}</small
        >{/if}
      {#if relatedLoading}<small>{translate('Loading logged hours…')}</small>{/if}
      {#if originalLinkUnverified && !relatedLoading}
        <small>{translate('Loading logged hours…')}</small>
      {/if}
    </label>
    <label>
      <span>{translate('Receipt (optional)')}</span>
      <input
        name="receipt"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
        aria-describedby="correction-receipt-help"
      />
      <small id="correction-receipt-help">
        {translate(
          'Attach a receipt to this corrected draft, or leave this empty to keep the current receipt. The original expense stays unchanged.',
        )}
      </small>
      {#if values.receiptNeedsReattach}
        <small class="warning">{translate('Reattach the receipt before saving again.')}</small>
      {/if}
    </label>
    {#if relatedProblem}
      <ProblemNotice problem={relatedProblem} kind="error" remedyLinks={lookupRemedyLinks} />
      {#if relatedProblem.correlationId}
        <small
          >{portalText(lookupLocale, 'problem.error.reference', {
            correlationId: relatedProblem.correlationId,
          })}</small
        >
      {/if}
      {#if relatedProblem.remedies.some((remedy) => remedy.id === 'retry_expense_options')}
        <button type="button" onclick={() => void loadRelatedOptions(relatedDate)}
          >{portalText(lookupLocale, 'problem.expenseLookup.retryOptions')}</button
        >
      {/if}
    {/if}
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
      id="correction-draft-reason"
      name="reason"
      minlength="3"
      maxlength="2000"
      required
      value={fieldValue('reason', '__reason')}
    ></textarea>
  </label>
  <button
    type="submit"
    disabled={recordType === 'expense' && (relatedUnavailable || originalLinkUnverified)}
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
