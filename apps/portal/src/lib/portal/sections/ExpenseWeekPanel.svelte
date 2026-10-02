<script lang="ts">
  import { page } from '$app/stores';
  import { standaloneActionMessage } from '../../../routes/app/standalone-locale';
  import { documentLanguage, normalizePortalLocale } from '../../portal-i18n';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { base } from '$app/paths';
  import { beforeNavigate, goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { SectionCard, StatusBadge } from '../ui';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import { money, shiftWeek } from '../portal-format';
  import { expenseCategories } from '../expense-categories';
  import { expenseReceiptState } from '../expense-evidence';
  import { localToday } from '../ui/time-entry-clock';
  import { monthCalendarDates, weekDates, weekStartForDate } from './time-entry-actions';

  let {
    data,
    isAuditor,
    availableProjects,
    translate,
    controlledValue,
    onCreate,
    onEdit,
  }: {
    data: PortalData;
    isAuditor: boolean;
    availableProjects: Row[];
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
    onCreate: (date: string, workerId: string) => void;
    onEdit: (row: Row) => void;
  } = $props();

  type DailyDraft = {
    spentOn: string;
    amount: string;
    category: string;
    description: string;
    vendor: string;
  };
  const nativeForm = $page.form as { values?: Record<string, unknown>; message?: string } | null;
  const restored = nativeForm?.values?.batchForm === 'expense_week_table' ? nativeForm.values : {};
  function restoredRows(): DailyDraft[] {
    try {
      const rows = JSON.parse(String(restored.entries ?? '[]'));
      return Array.isArray(rows)
        ? rows.filter((row) => row && typeof row.spentOn === 'string')
        : [];
    } catch {
      return [];
    }
  }
  const recoveredRows = restoredRows();
  let today = $state('');
  let selectedWeek = $derived(data.weekStart ?? '');
  const weekStart = $derived(data.weekStart || weekStartForDate(today) || '');
  const dates = $derived(weekDates(weekStart));
  const ownerMode = $derived(data.user.role === 'owner_admin');
  const canEnter = $derived(
    !isAuditor && ['owner_admin', 'worker', 'project_manager'].includes(String(data.user.role)),
  );
  let worker = $state(String(restored.workerId ?? $page.url.searchParams.get('worker') ?? ''));
  const workerId = $derived(ownerMode ? worker : data.user.id);
  const history = $derived(data.calendarRecords ?? data.records ?? []);
  const weekRows = $derived(
    history.filter(
      (row) => String(row.worker_id) === workerId && dates.includes(String(row.spent_on)),
    ),
  );
  const drafts = $derived(
    (data.weekDraftRecords ?? history).filter(
      (row) =>
        String(row.worker_id) === workerId &&
        row.approval_state === 'draft' &&
        dates.includes(String(row.spent_on)),
    ),
  );
  const missingReceipts = $derived(
    drafts.filter((row) => expenseReceiptState(row) === 'missing').length,
  );
  const linkedTimeDrafts = $derived(
    drafts.filter((row) => row.linked_pair_time_id && row.linked_pair_time_state === 'draft').length,
  );
  const snapshot = $derived(
    JSON.stringify(drafts.map((row) => ({ id: String(row.id), version: Number(row.version) }))),
  );
  let calendarMonth = $state('');
  let calendarDay = $state('');
  const calendarDates = $derived(monthCalendarDates(calendarMonth));
  const dayRecords = $derived(
    history.filter(
      (row) => String(row.worker_id) === workerId && String(row.spent_on) === calendarDay,
    ),
  );
  let tableOpen = $state(Boolean(restored.batchForm));
  let tableWeek = $state(String(restored.weekStart ?? ''));
  const tableWeekStart = $derived(tableWeek || weekStart);
  const tableDates = $derived(weekDates(tableWeekStart));
  let rows = $state<Record<string, DailyDraft>>(
    Object.fromEntries(recoveredRows.map((row) => [row.spentOn, row])),
  );
  let project = $state(String(restored.projectId ?? ''));
  let currency = $state(String(restored.currency ?? 'USD'));
  let whoPaid = $state(String(restored.whoPaid ?? 'worker'));
  let requestId = $state(String(restored.requestId ?? ''));
  let busy = $state<'submit' | 'table' | null>(null);
  let weekMessage = $state('');
  let weekError = $state(
    !restored.batchForm && nativeForm?.values?.weekStart ? String(nativeForm.message ?? '') : '',
  );
  let tableMessage = $state('');
  let tableError = $state(restored.batchForm ? String(nativeForm?.message ?? '') : '');
  let tableNotice = $state<HTMLDivElement>();
  let weekNotice = $state<HTMLDivElement>();
  let tableOpenButton = $state<HTMLButtonElement>();
  const calendarWeekdays = $derived(
    Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(
        documentLanguage(normalizePortalLocale($page.url.searchParams.get('lang') ?? data.locale)),
        { weekday: 'short', timeZone: 'UTC' },
      ).format(new Date(Date.UTC(2024, 0, 1 + index))),
    ),
  );
  const tableEntries = $derived(
    JSON.stringify(
      tableDates
        .map((date) => rows[date])
        .filter((row) => row && (row.amount.trim() || row.description.trim() || row.vendor.trim())),
    ),
  );
  const dirty = $derived(
    tableOpen &&
      Object.values(rows).some(
        (row) => row.amount || row.description || row.vendor || row.category !== 'meals',
      ),
  );

  onMount(() => {
    today = localToday();
    calendarMonth = today.slice(0, 7);
    calendarDay = today;
    requestId ||= crypto.randomUUID();
  });
  beforeNavigate(({ cancel }) => {
    if (busy) {
      cancel();
      return;
    }
    if (
      dirty &&
      !window.confirm(translate('You have unsaved weekly expenses. Leave without saving?'))
    ) {
      selectedWeek = weekStart;
      cancel();
    } else if (dirty) {
      resetTableDrafts();
      tableWeek = '';
    }
  });
  $effect(() => {
    for (const date of tableDates) {
      if (!rows[date])
        rows[date] = { spentOn: date, amount: '', category: 'meals', description: '', vendor: '' };
    }
  });

  function totalLabel(records: Row[]): string {
    const totals: Record<string, bigint> = Object.create(null);
    for (const row of records) {
      if (['rejected', 'void'].includes(String(row.approval_state)) || row.active_correction_id)
        continue;
      const minor = String(row.amount_minor ?? '');
      if (!/^\d+$/.test(minor)) continue;
      const code = String(row.currency ?? 'USD');
      totals[code] = (totals[code] ?? 0n) + BigInt(minor);
    }
    return (
      Object.entries(totals)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, amount]) => money(amount.toString(), code))
        .join(' · ') || '—'
    );
  }
  function approvalLabel(row: Row): string {
    if (
      row.approval_state === 'void' &&
      (row.linked_pair_time_id || Number(row.crew_recorded ?? 0) === 1)
    )
      return translate('Withdrawn');
    return controlledValue('status', row.approval_state);
  }
  function dailyStatuses(records: Row[]): { status: string; label: string }[] {
    const unique: { status: string; label: string }[] = [];
    for (const row of records) {
      const status = String(row.approval_state);
      const label = approvalLabel(row);
      if (!unique.some((item) => item.status === status && item.label === label))
        unique.push({ status, label });
    }
    return unique;
  }
  function weekHref(value: string): string {
    const params = new URLSearchParams($page.url.searchParams);
    params.set('week', value);
    params.delete('edit');
    params.delete('action');
    return `${base}/app/expenses?${params}#expense-weekly-timesheet`;
  }
  async function pickWeek(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    const monday = weekStartForDate(selectedWeek || weekStart);
    if (monday) await goto(weekHref(monday), { noScroll: true, keepFocus: true });
  }
  function resetTableDrafts() {
    rows = {};
    requestId = crypto.randomUUID();
    tableError = '';
    tableMessage = '';
  }
  function allowContextChange(
    control: HTMLInputElement | HTMLSelectElement,
    previous: string,
    next: string,
    message: string,
  ): boolean {
    if (!next && control instanceof HTMLInputElement) {
      control.value = previous;
      return false;
    }
    if (busy || (next !== previous && dirty && !window.confirm(translate(message)))) {
      control.value = previous;
      return false;
    }
    control.value = next;
    if (next !== previous) resetTableDrafts();
    return true;
  }
  function changeTableWeek(control: HTMLInputElement) {
    const next = weekStartForDate(control.value) ?? '';
    if (
      allowContextChange(
        control,
        tableWeekStart,
        next,
        'Changing the week clears unsaved daily expenses. Continue?',
      )
    )
      tableWeek = next;
  }
  function changeWorker(control: HTMLSelectElement) {
    const next = control.value;
    if (
      allowContextChange(
        control,
        worker,
        next,
        'Changing the worker clears unsaved daily expenses. Continue?',
      )
    ) {
      worker = next;
      weekError = '';
      weekMessage = '';
    }
  }
  function changeProject(control: HTMLSelectElement) {
    const next = control.value;
    if (
      allowContextChange(
        control,
        project,
        next,
        'Changing the project clears unsaved daily expenses. Continue?',
      )
    ) {
      project = next;
      currency = String(
        availableProjects.find((row) => String(row.id) === next)?.currency ?? 'USD',
      );
    }
  }
  function changeCurrency(control: HTMLSelectElement) {
    const next = control.value;
    if (
      allowContextChange(
        control,
        currency,
        next,
        'Changing the currency clears unsaved daily expenses. Continue?',
      )
    )
      currency = next;
  }
  function openTable() {
    if (busy) return;
    tableOpen = true;
    requestId ||= crypto.randomUUID();
  }
  async function closeTable() {
    if (busy || (dirty && !window.confirm(translate('Close weekly entry without saving?')))) return;
    resetTableDrafts();
    tableOpen = false;
    await tick();
    tableOpenButton?.focus();
  }
  function canEdit(row: Row): boolean {
    return (
      canEnter &&
      (ownerMode || row.worker_id === data.user.id) &&
      row.approval_state === 'draft' &&
      !row.shared_receipt_allocated &&
      Number(row.correction_linked ?? 0) !== 1 &&
      !row.invoice_id &&
      !row.billing_lock_id
    );
  }
  const submitWeek: SubmitFunction = ({ cancel }) => {
    if (busy) {
      cancel();
      return;
    }
    busy = 'submit';
    weekError = '';
    weekMessage = '';
    return async ({ result, update }) => {
      try {
        if (result.type === 'success') {
          weekMessage = standaloneActionMessage(
            normalizePortalLocale($page.url.searchParams.get('lang') ?? data.locale),
            result.data,
          );
          await update({ reset: false });
        } else {
          weekError = translate(
            String(
              (result.type === 'failure' ? result.data?.message : '') ||
                'This week could not be submitted. Review the drafts and try again.',
            ),
          );
        }
      } catch {
        weekError = translate(
          'The response could not be confirmed. Refresh to review expense status before trying again.',
        );
      } finally {
        busy = null;
        await tick();
        weekNotice?.focus({ preventScroll: true });
      }
    };
  };
  const saveTable: SubmitFunction = ({ cancel }) => {
    if (busy) {
      cancel();
      return;
    }
    busy = 'table';
    tableError = '';
    tableMessage = '';
    return async ({ result, update }) => {
      try {
        if (result.type === 'success') {
          tableMessage = standaloneActionMessage(
            normalizePortalLocale($page.url.searchParams.get('lang') ?? data.locale),
            result.data,
          );
          await update({ reset: false });
          rows = {};
          requestId = crypto.randomUUID();
        } else {
          tableError = translate(
            String(
              (result.type === 'failure' ? result.data?.message : '') ||
                'Weekly expenses could not be saved. Your entered details are retained.',
            ),
          );
        }
      } catch {
        tableError = translate(
          'The save response could not be confirmed. Retry with the same details to avoid duplicate expenses.',
        );
      } finally {
        busy = null;
        await tick();
        tableNotice?.focus({ preventScroll: true });
      }
    };
  };
</script>

<div class="expense-week-tools">
  <SectionCard title={translate('Weekly expense timesheet')} headingId="expense-weekly-timesheet">
    <div class="week-toolbar">
      <nav aria-label={translate('Expense week')}>
        <a class="secondary-button" href={weekHref(shiftWeek(weekStart || '2000-01-03', -7))}
          >{translate('Previous week')}</a
        >
        <a class="secondary-button" href={weekHref(shiftWeek(weekStart || '2000-01-03', 7))}
          >{translate('Next week')}</a
        >
        {#if today}<a class="secondary-button" href={weekHref(weekStartForDate(today) || '')}
            >{translate('This week')}</a
          >{/if}
      </nav>
      <form onsubmit={pickWeek}>
        <label
          ><span>{translate('Week containing')}</span><input
            type="date"
            value={selectedWeek || weekStart}
            onchange={(event) => (selectedWeek = event.currentTarget.value)}
            disabled={Boolean(busy)}
            required
          /></label
        >
        <button type="submit" disabled={Boolean(busy)}>{translate('Show week')}</button>
      </form>
      {#if ownerMode}
        <label
          ><span>{translate('Worker')}</span><select
            value={worker}
            onchange={(event) => changeWorker(event.currentTarget)}
            disabled={Boolean(busy)}
            ><option value="">{translate('Select worker')}</option
            >{#each data.workers ?? [] as person}<option value={String(person.id)}
                >{person.name}</option
              >{/each}</select
          ></label
        >
      {:else}<p>{data.user.name}</p>{/if}
    </div>
    <p>{weekStart} → {dates[6] ?? ''} · {totalLabel(weekRows)}</p>
    {#if !workerId}<p>{translate('Choose a worker to review weekly expenses.')}</p>{/if}
    <div class="week-table-wrap">
      <table class="expense-week-summary">
        <caption>{translate('Daily expenses by currency and approval status')}</caption>
        <thead
          ><tr
            ><th>{translate('Day')}</th><th>{translate('Expenses')}</th><th>{translate('Total')}</th
            ><th>{translate('Status')}</th></tr
          ></thead
        >
        <tbody
          >{#each dates as date}{@const daily = weekRows.filter(
              (row) => String(row.spent_on) === date,
            )}
            <tr
              ><th scope="row"
                ><button
                  class="day-link"
                  type="button"
                  onclick={() => {
                    calendarDay = date;
                    calendarMonth = date.slice(0, 7);
                  }}>{date}</button
                ></th
              ><td>{daily.length}</td><td>{totalLabel(daily)}</td><td
                >{#each dailyStatuses(daily) as { status, label }}<StatusBadge
                    variant={status === 'approved'
                      ? 'success'
                      : status === 'submitted'
                        ? 'info'
                        : status === 'needs_changes'
                          ? 'warning'
                          : status === 'rejected'
                            ? 'danger'
                            : 'neutral'}
                    text={label}
                  />{/each}{#if !daily.length}—{/if}</td
              ></tr
            >
          {/each}</tbody
        >
      </table>
    </div>
  </SectionCard>

  {#if canEnter}
    <SectionCard title={translate('Submit this week')} headingId="expense-week-submit-title">
      <p>
        {translate(
          'Submit all draft expenses for one worker in the displayed week. Every draft is checked together; if any draft changed or requires a receipt, none are submitted.',
        )}
      </p>
      <form method="POST" action="?/submitExpenseWeek" use:enhance={submitWeek}>
        <input type="hidden" name="workerId" value={workerId} /><input
          type="hidden"
          name="weekStart"
          value={weekStart}
        /><input type="hidden" name="entries" value={snapshot} />
        <p>{drafts.length} {translate('draft expenses')} · {totalLabel(drafts)}</p>
        {#if missingReceipts}<p class="expense-week-error" role="alert">
            {missingReceipts}
            {translate(
              'draft expenses require a receipt. Review those expenses before submitting the week.',
            )}
          </p>{/if}
        {#if linkedTimeDrafts}<p class="expense-week-error" role="alert">
            {linkedTimeDrafts} {translate('linked meal drafts have draft hours. Submit their time week first.')}
            <a href={`${base}/app/time?week=${encodeURIComponent(weekStart)}&worker=${encodeURIComponent(workerId)}#time-week-submit-title`}>{translate('Open time week')}</a>
          </p>{/if}
        <div bind:this={weekNotice} tabindex="-1" role={weekError ? 'alert' : 'status'}>
          {weekError || weekMessage}
        </div>
        <button
          type="submit"
          disabled={Boolean(busy) || !workerId || !drafts.length || Boolean(missingReceipts) || Boolean(linkedTimeDrafts)}
          >{translate(busy === 'submit' ? 'Submitting…' : 'Submit this week')}</button
        >
      </form>
    </SectionCard>
  {/if}

  <SectionCard title={translate('Expense calendar')} headingId="expense-calendar-title">
    <div class="week-toolbar">
      <label
        ><span>{translate('Month')}</span><input
          type="month"
          bind:value={calendarMonth}
          onchange={() => (calendarDay = `${calendarMonth}-01`)}
        /></label
      >
      <p>{translate('Choose a day to review expenses and editable drafts.')}</p>
    </div>
    <div class="expense-calendar" aria-label={translate('Expense calendar')}>
      {#each calendarWeekdays as day}<strong>{day}</strong>{/each}
      {#each calendarDates as date}{@const daily = history.filter(
          (row) => String(row.worker_id) === workerId && String(row.spent_on) === date,
        )}
        <button
          type="button"
          class:outside={date.slice(0, 7) !== calendarMonth}
          class:selected={date === calendarDay}
          aria-pressed={date === calendarDay}
          aria-label={`${date}: ${daily.length} ${translate('Expenses')}`}
          onclick={() => {
            calendarDay = date;
          }}
          ><span>{Number(date.slice(-2))}</span>{#if daily.length}<small>{daily.length}</small
            >{/if}</button
        >
      {/each}
    </div>
    <div class="calendar-day">
      <div class="week-toolbar">
        <h3>{calendarDay}</h3>
        {#if canEnter}<button
            type="button"
            disabled={Boolean(busy) || !workerId || !calendarDay}
            onclick={() => onCreate(calendarDay, workerId)}
            >{translate('Record expense on this day')}</button
          >{/if}
      </div>
      {#if !workerId}<p>
          {translate('Select a worker to review this day.')}
        </p>{:else if !dayRecords.length}<p>
          {translate('No expenses recorded for this day.')}
        </p>{:else}
        <ul>
          {#each dayRecords as row}<li>
              <span
                ><strong>{row.project_number ?? row.project_name}</strong> · {money(
                  row.amount_minor,
                  String(row.currency),
                )} · {approvalLabel(row)}<br />{row.description}</span
              ><span
                >{#if canEdit(row)}<button
                    type="button"
                    class="secondary-button"
                    disabled={Boolean(busy)}
                    onclick={() => onEdit(row)}>{translate('Edit draft')}</button
                  >{/if}<a href={`${base}/app/expenses/${encodeURIComponent(String(row.id))}`}
                  >{translate('View expense')}</a
                ></span
              >
            </li>{/each}
        </ul>
      {/if}
    </div>
  </SectionCard>

  {#if canEnter}
    <SectionCard title={translate('Enter a week in a table')} headingId="expense-week-table-title">
      <p>
        {translate(
          'Save up to one expense per day for a single project and worker. Amounts remain in the selected currency. Attach receipts later by editing the draft; use Record expense to link hours.',
        )}
      </p>
      {#if !tableOpen}<button
          bind:this={tableOpenButton}
          type="button"
          onclick={openTable}
          disabled={Boolean(busy)}>{translate('Enter a week in a table')}</button
        >{:else}
        <div class="week-toolbar">
          <p>
            {translate('Worker')}: {ownerMode
              ? String(
                  data.workers?.find((person) => String(person.id) === workerId)?.name ??
                    translate('Select worker'),
                )
              : data.user.name}
          </p>
          <button
            type="button"
            class="secondary-button"
            onclick={closeTable}
            disabled={Boolean(busy)}>{translate('Close weekly entry')}</button
          >
        </div>
        <form method="POST" action="?/createExpenseWeek" use:enhance={saveTable}>
          <input type="hidden" name="batchForm" value="expense_week_table" /><input
            type="hidden"
            name="weekStart"
            value={tableWeekStart}
          /><input type="hidden" name="workerId" value={workerId} /><input
            type="hidden"
            name="entries"
            value={tableEntries}
          /><input type="hidden" name="requestId" value={requestId} />
          <fieldset
            class="weekly-entry-fields"
            disabled={Boolean(busy)}
            aria-label={translate('Weekly expense timesheet')}
          >
            <div class="weekly-fields">
              <label
                ><span>{translate('Week containing')}</span><input
                  type="date"
                  value={tableWeekStart}
                  onchange={(event) => changeTableWeek(event.currentTarget)}
                  required
                /></label
              >
              <label
                ><span>{translate('Project')}</span><select
                  name="projectId"
                  required
                  value={project}
                  onchange={(event) => changeProject(event.currentTarget)}
                  ><option value="">{translate('Select project')}</option
                  >{#each availableProjects as row}<option value={String(row.id)}
                      >{row.project_number} · {row.name}</option
                    >{/each}</select
                ></label
              >
              <label
                ><span>{translate('Currency')}</span><select
                  name="currency"
                  value={currency}
                  onchange={(event) => changeCurrency(event.currentTarget)}
                  >{#each ['USD', 'EUR', 'BRL'] as code}<option value={code}>{code}</option
                    >{/each}</select
                ></label
              >
              <label
                ><span>{translate('Who paid')}</span><select name="whoPaid" bind:value={whoPaid}
                  >{#each [['worker', 'Worker'], ['company_card', 'Company card'], ['company_direct', 'Company'], ['client', 'Client'], ['third_party', 'Third party']] as option}<option
                      value={option[0]}>{translate(option[1] ?? '')}</option
                    >{/each}</select
                ></label
              >
            </div>
            <div class="week-table-wrap">
              <table class="expense-week-entry">
                <caption
                  >{translate(
                    'Leave unused days blank. All completed daily rows save together as drafts.',
                  )}</caption
                ><thead
                  ><tr
                    ><th>{translate('Day')}</th><th>{translate('Category')}</th><th
                      >{translate('Amount')}</th
                    ><th>{translate('Vendor')}</th><th>{translate('Description')}</th></tr
                  ></thead
                ><tbody>
                  {#each tableDates as date}{#if rows[date]}<tr
                        ><th scope="row">{date}</th><td
                          ><label
                            ><span class="mobile-label">{translate('Category')}</span><select
                              aria-label={`${date} ${translate('Category')}`}
                              bind:value={rows[date].category}
                              >{#each expenseCategories as [value, label]}<option {value}
                                  >{translate(label)}</option
                                >{/each}</select
                            ></label
                          ></td
                        ><td
                          ><label
                            ><span class="mobile-label">{translate('Amount')}</span><input
                              aria-label={`${date} ${translate('Amount')}`}
                              inputmode="decimal"
                              pattern="[0-9]+([.][0-9][0-9]?)?"
                              bind:value={rows[date].amount}
                            /></label
                          ></td
                        ><td
                          ><label
                            ><span class="mobile-label">{translate('Vendor')}</span><input
                              aria-label={`${date} ${translate('Vendor')}`}
                              maxlength="200"
                              bind:value={rows[date].vendor}
                            /></label
                          ></td
                        ><td
                          ><label
                            ><span class="mobile-label">{translate('Description')}</span><input
                              aria-label={`${date} ${translate('Description')}`}
                              maxlength="5000"
                              bind:value={rows[date].description}
                            /></label
                          ></td
                        ></tr
                      >{/if}{/each}
                </tbody>
              </table>
            </div>
          </fieldset>
          <div
            bind:this={tableNotice}
            tabindex="-1"
            class:expense-week-error={Boolean(tableError)}
            role={tableError ? 'alert' : 'status'}
          >
            {tableError || tableMessage}
          </div>
          <div class="week-toolbar">
            <button
              type="submit"
              disabled={Boolean(busy) ||
                !workerId ||
                !project ||
                !requestId ||
                tableEntries === '[]'}
              >{translate(busy === 'table' ? 'Saving…' : 'Save weekly expense drafts')}</button
            >
            <button
              type="button"
              class="secondary-button"
              onclick={closeTable}
              disabled={Boolean(busy)}>{translate('Close weekly entry')}</button
            >
          </div>
        </form>
      {/if}
    </SectionCard>
  {/if}
</div>

<style>
  .expense-week-tools {
    display: grid;
    gap: 1rem;
    margin: 1.2rem 0;
    min-width: 0;
  }
  .week-toolbar,
  .week-toolbar nav,
  .week-toolbar form {
    display: flex;
    align-items: end;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .week-toolbar {
    justify-content: space-between;
    margin-bottom: 1rem;
  }
  label {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }
  select,
  input {
    min-width: 0;
    max-width: 100%;
    width: 100%;
  }
  .week-table-wrap {
    overflow-x: auto;
    margin: 1rem 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }
  caption {
    text-align: left;
    padding-bottom: 0.65rem;
    font-size: 0.9rem;
  }
  th,
  td {
    padding: 0.6rem;
    border-bottom: 1px solid var(--portal-border, #dedede);
    vertical-align: top;
  }
  .day-link {
    background: transparent;
    color: inherit;
    border: 0;
    padding: 0;
    min-height: 44px;
    text-decoration: underline;
  }
  .weekly-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
    gap: 0.8rem;
  }
  .weekly-entry-fields {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
  .expense-calendar {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 0.35rem;
  }
  .expense-calendar strong {
    text-align: center;
    font-size: 0.85rem;
  }
  .expense-calendar button {
    min-height: 64px;
    display: grid;
    gap: 0.2rem;
    padding: 0.4rem;
    background: var(--portal-surface-soft, #fbfbfa);
    color: inherit;
    border: 1px solid var(--portal-border, #dedede);
  }
  .expense-calendar button.selected {
    border: 2px solid var(--ja-red, #ae281b);
    background: #fff1ef;
  }
  .expense-calendar button.outside {
    opacity: 0.55;
  }
  .expense-calendar small {
    font-size: 0.8rem;
  }
  .calendar-day {
    margin-top: 1rem;
  }
  .calendar-day ul {
    list-style: none;
    padding: 0;
  }
  .calendar-day li {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--portal-border, #dedede);
  }
  .calendar-day li > span:last-child {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .expense-week-error {
    color: var(--ja-red-dark, #8f1d14);
  }
  [role='alert'],
  [role='status'] {
    scroll-margin-top: 5rem;
    margin: 0.65rem 0;
  }
  .mobile-label {
    display: none;
  }
  .expense-week-entry input {
    min-width: 90px;
  }
  @media (max-width: 640px) {
    .expense-week-entry,
    .expense-week-entry tbody,
    .expense-week-entry tr,
    .expense-week-entry td,
    .expense-week-entry th {
      display: block;
      width: 100%;
      box-sizing: border-box;
    }
    .expense-week-entry thead {
      display: none;
    }
    .expense-week-entry tr {
      padding: 0.65rem;
      border: 1px solid var(--portal-border, #dedede);
      border-radius: 0.6rem;
      margin-bottom: 0.75rem;
    }
    .expense-week-entry td,
    .expense-week-entry th {
      border: 0;
      padding: 0.35rem;
    }
    .mobile-label {
      display: inline;
    }
    .expense-calendar {
      gap: 0.2rem;
    }
    .expense-calendar button {
      min-height: 48px;
    }
    .calendar-day li {
      flex-direction: column;
    }
    .expense-week-summary th,
    .expense-week-summary td {
      padding: 0.5rem 0.25rem;
      overflow-wrap: anywhere;
    }
  }
</style>
