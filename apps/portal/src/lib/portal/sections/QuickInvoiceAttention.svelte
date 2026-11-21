<script module lang="ts">
  export type AttentionRef = { type: 'time' | 'expense'; id: string; version: number };
  export type AttentionPerson = {
    workerId: string;
    name: string;
    minutes: number;
    count: number;
    projectedMinor?: string;
    states?: { draft: number; submitted: number; returned: number; financePending: number };
    returnedReason?: string | null;
    futureCount?: number;
    fromDate?: string;
    suggestedRateMinor?: string | null;
    sources?: AttentionRef[];
    expenseCount?: number;
    unclassifiedExpenseCount?: number;
  };
  export type AttentionItem = {
    kind:
      | 'approve'
      | 'unsent'
      | 'clientRate'
      | 'workerCost'
      | 'expenseTreatment'
      | 'expenseSetup'
      | 'clientDetails'
      | 'billingSetup'
      | 'issuerBank'
      | 'issuerAuthority'
      | 'purchaseOrder'
      | 'other';
    code?: string;
    blocks: 'create' | 'issue' | 'none';
    people?: AttentionPerson[];
    expenseIds?: string[];
    totalCount: number;
    minutes?: number;
    fix?: string | null;
    message?: string;
    billingSetup?: {
      legalEntities: Array<{ id: string; code: string; name: string; canIssue?: boolean }>;
      taxProfiles: Array<{ id: string; name: string; legalEntityId: string | null; basisPoints: number }>;
    };
    issuer?: {
      legalEntityId: string;
      currency: string;
      version: number;
      bankName: string;
      bankAccountNumber: string;
    };
    issuerAuthority?: {
      legalEntities: Array<{ id: string; code: string; name: string; canIssue?: boolean }>;
      current: string | null;
    };
    project?: { id: string; version: number; poNumber: string | null };
    expenseSetup?: {
      count: number;
      totals: Array<{ currency: string; amountMinor: string }>;
      effectiveFrom: string;
    };
    payMissing?: boolean;
    costMissing?: boolean;
  };
  export type ExpenseRow = {
    ref: AttentionRef;
    label: string;
    /** Canonical category code, shown through its localized label. */
    category?: string;
    date: string;
    workerName: string;
    amountMinor: string;
    currency: string;
    approvalState: string;
    classificationState: string;
    clientTreatment: string;
    billingTreatment: string;
    markupBps: number;
    locked: boolean;
    policyAvailable: boolean;
    foreign?: boolean;
    /** Confirmed conversion (Money → Currency conversions): used unless changed here. */
    conversion?: { rate: string; amountMinor: string; rateSource: string } | null;
    excluded?: boolean;
  };
  export type AttentionClient = {
    id: string;
    version: number;
    name: string;
    legalName: string;
    billingAddress: string | null;
    billingEmail: string | null;
    taxId?: string | null;
  };
  export type RunResult = {
    success?: boolean;
    result?: { approved?: AttentionRef[]; skipped?: Array<{ reason: string }>; effectiveFrom?: string; shifted?: boolean };
    code?: string;
    rateCode?: string;
    message?: string;
    detail?: string;
  };
</script>

<script lang="ts">
  /**
   * "Needs attention": the grouped checklist of the one-screen invoice. One item per
   * (fix × person), each with its fix in place. The server returns the recalculated
   * preview after every fix; this component never computes money.
   */
  import { tick } from 'svelte';
  import type { PortalLocale } from '../../portal-i18n';
  import { journeyMoney } from '../project-invoice-journey';
  import { clockHoursFromMinutes } from '../minute-hours';
  import { clientBillingIssueText, clientBillingIssues } from '../client-billing-issues';
  import { translateControlledValue } from '../../i18n/controlled-values';
  import {
    quickInvoiceFormat,
    quickInvoiceText,
    type QuickInvoiceCopyKey,
  } from '../billing-quick-invoice-copy';

  let {
    locale = 'en',
    role = '',
    currency,
    attention,
    expenseRows = [],
    client = null,
    disabled = false,
    purchaseNo = $bindable(''),
    run,
    newKey,
    fixHref,
    otherText,
    recordHref,
    onInvoiceRate,
    onExclude,
  }: {
    locale?: PortalLocale;
    role?: string;
    currency: string;
    attention: AttentionItem[];
    expenseRows?: ExpenseRow[];
    client?: AttentionClient | null;
    disabled?: boolean;
    purchaseNo?: string;
    run: (operation: string, payload: Record<string, unknown>) => Promise<RunResult>;
    newKey: () => string;
    fixHref: (fix: string | null | undefined) => string | null;
    otherText: (item: AttentionItem) => string;
    /** Where the worker's records are fixed with the existing audited correction flow. */
    recordHref: (workerId: string) => string;
    /** "Save as project rate" unticked: the rate applies to this invoice only (override). */
    onInvoiceRate?: (workerId: string, amount: string) => Promise<boolean>;
    /** "Leave out of this invoice" for an unclassified expense (true) and its undo (false). */
    onExclude?: (expenseId: string, excluded: boolean) => void;
  } = $props();

  const t = (key: QuickInvoiceCopyKey) => quickInvoiceText(locale, key);
  const f = (key: QuickInvoiceCopyKey, params: Record<string, string | number>) =>
    quickInvoiceFormat(locale, key, params);
  const money = (minor: string | null | undefined) =>
    minor === null || minor === undefined ? '—' : journeyMoney(minor, currency, locale);
  const hours = (minutes: number) => clockHoursFromMinutes(minutes);
  const dateText = (value: string | undefined) =>
    value && /^\d{4}-\d{2}-\d{2}/.test(value)
      ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
          new Date(`${value.slice(0, 10)}T00:00:00Z`),
        )
      : '';
  const decimal = (minor: string | null | undefined) =>
    minor ? new Intl.NumberFormat(locale, { minimumFractionDigits: 2, useGrouping: false }).format(Number(minor) / 100) : '';

  /** "Taxi · Train / bus / taxi / rideshare": what was bought, then the category in words. */
  const rowTitle = (row: ExpenseRow) =>
    [row.label, row.category ? translateControlledValue(locale, 'expenseCategory', row.category) : '']
      .filter(Boolean)
      .join(' · ') || '—';

  const zeroAmount = $derived(new Intl.NumberFormat(locale, { minimumFractionDigits: 2 }).format(0));
  let busy = $state('');
  let saved = $state('');
  let errors = $state<Record<string, string>>({});
  let notes = $state<Record<string, string>>({});
  let openPop = $state('');
  let rates = $state<Record<string, string>>({});
  let saveAsProject = $state<Record<string, boolean>>({});
  let treatments = $state<Record<string, { treatment: string; markup: string }>>({});
  /** Foreign-currency expenses: the exact rate or converted amount typed by the owner. */
  let conversions = $state<Record<string, { rate: string; amount: string }>>({});
  /** Foreign expenses with a confirmed conversion whose inputs the owner opened to change it. */
  let changingConversion = $state<Record<string, boolean>>({});
  let clientForm = $state({ billingAddress: '', billingEmail: '', legalName: '', taxId: '' });
  let clientFormFor = $state('');
  let setup = $state({ legalEntityId: '', tax: 'none', taxName: '', taxPercent: '', cadence: 'manual' });
  let bank = $state({ bankName: '', bankAccountNumber: '' });
  let issuerPick = $state('');
  let poScope = $state<'invoice' | 'project'>('invoice');
  let poDraft = $state('');
  let showAllPeople = $state<Record<string, boolean>>({});
  let root: HTMLDivElement | undefined = $state();

  const roleText = $derived(role === 'finance_admin' ? t('roleFinance') : t('roleOwner'));
  /** What stops this invoice vs. what is only good to do; "not sent yet" is information only. */
  const blockingCount = $derived(attention.filter((item) => item.blocks !== 'none').length);
  const optionalCount = $derived(
    attention.filter((item) => item.blocks === 'none' && !['purchaseOrder', 'unsent'].includes(item.kind)).length,
  );
  const count = $derived(blockingCount + optionalCount);

  $effect(() => {
    if (client && clientFormFor !== `${client.id}:${client.version}`) {
      clientFormFor = `${client.id}:${client.version}`;
      clientForm = {
        billingAddress: client.billingAddress ?? '',
        billingEmail: client.billingEmail ?? '',
        legalName: client.legalName ?? '',
        taxId: client.taxId ?? '',
      };
    }
  });
  $effect(() => {
    const setupItem = attention.find((item) => item.kind === 'billingSetup');
    if (setupItem?.billingSetup && !setup.legalEntityId && setupItem.billingSetup.legalEntities[0])
      setup.legalEntityId = setupItem.billingSetup.legalEntities[0].id;
    const authority = attention.find((item) => item.kind === 'issuerAuthority')?.issuerAuthority;
    if (authority && !issuerPick) {
      const usable = authority.legalEntities.filter((entity) => entity.canIssue !== false);
      issuerPick = usable.find((entity) => entity.id === authority.current)?.id ?? usable[0]?.id ?? '';
    }
  });

  function failText(result: RunResult): string {
    if (result.rateCode === 'already_invoiced' || result.code === 'RATE_ALREADY_INVOICED')
      return t('rateAfterIssued').replace('{date}', '—');
    const detail = result.detail ?? '';
    if (/already invoiced or reimbursed|overlaps invoice/i.test(detail)) return t('expenseTermsLocked');
    // Only a real concurrent edit is "a record changed"; any other conflict says what is wrong.
    if (detail && !/changed|stale|version|reload/i.test(detail)) return f('fixFailed', { reason: detail });
    if (result.code?.includes('CONFLICT') || /changed/i.test(result.message ?? '')) return t('staleSource');
    return f('fixFailed', { reason: result.detail || result.message || result.rateCode || result.code || '—' });
  }

  async function act(key: string, operation: string, payload: Record<string, unknown>): Promise<RunResult | null> {
    if (busy) return null;
    busy = key;
    errors = { ...errors, [key]: '' };
    try {
      const result = await run(operation, payload);
      if (!result.success) {
        errors = { ...errors, [key]: failText(result) };
        return result;
      }
      saved = key;
      setTimeout(() => {
        if (saved === key) saved = '';
      }, 3000);
      return result;
    } catch {
      errors = { ...errors, [key]: f('fixFailed', { reason: '—' }) };
      return null;
    } finally {
      busy = '';
    }
  }

  async function approve(item: AttentionItem, people: AttentionPerson[], key: string) {
    const sources = people.flatMap((person) => person.sources ?? []);
    if (!sources.length) return;
    const result = await act(key, 'includePending', { sources, requestKey: newKey() });
    openPop = '';
    if (result?.success && !(result.result?.approved?.length ?? 0)) saved = '';
    if (result?.success) {
      const skipped = result.result?.skipped ?? [];
      if (skipped.length)
        notes = {
          ...notes,
          approve: f('approveSkipped', {
            count: skipped.length,
            reasons: [...new Set(skipped.map((entry) => entry.reason.replace(/_/g, ' ')))].join(', '),
          }),
        };
      // Next likely fix: the first rate field.
      await tick();
      root?.querySelector<HTMLInputElement>('[data-attention-rate-input]')?.focus();
    }
    void item;
  }

  async function saveRate(kind: 'client' | 'cost' | 'pay', person: AttentionPerson, alsoCost = false, item?: AttentionItem) {
    const key = `${kind}:${person.workerId}`;
    const amount = (rates[key] ?? '').trim();
    if (!/^\d{1,10}(?:[.,]\d{1,2})?$/u.test(amount) || Number(amount.replace(',', '.')) <= 0) {
      errors = { ...errors, [key]: t('rateZero') };
      return;
    }
    if (kind === 'client' && saveAsProject[person.workerId] === false && onInvoiceRate) {
      busy = key;
      errors = { ...errors, [key]: '' };
      try {
        if (await onInvoiceRate(person.workerId, amount)) {
          saved = key;
          setTimeout(() => {
            if (saved === key) saved = '';
          }, 3000);
        } else errors = { ...errors, [key]: f('fixFailed', { reason: '—' }) };
      } finally {
        busy = '';
      }
      return;
    }
    // "Save as this project's rate": the project rate (everyone without a personal rate), from
    // the earliest work still waiting for a rate, so every un-invoiced hour is priced.
    const projectRate = kind === 'client' && saveAsProject[person.workerId] !== false;
    const fromDates = (projectRate ? (item?.people ?? [person]) : [person])
      .map((candidate) => candidate.fromDate)
      .filter((date): date is string => Boolean(date))
      .sort();
    const result = await act(key, 'setRate', {
      kind,
      workerId: person.workerId,
      amount,
      effectiveFrom: fromDates[0] ?? person.fromDate,
      scope: 'project',
      ...(kind === 'client' ? { appliesTo: projectRate ? 'project' : 'person' } : {}),
      ...(kind === 'pay' ? { alsoCost } : {}),
    });
    if (result?.success && result.result?.shifted && result.result.effectiveFrom)
      notes = { ...notes, rates: f('rateAfterIssued', { date: dateText(result.result.effectiveFrom) }) };
    else if (result?.success && projectRate && result.result?.effectiveFrom)
      notes = { ...notes, rates: f('rateSavedProject', { date: dateText(result.result.effectiveFrom) }) };
    if (result?.success) {
      await tick();
      root?.querySelector<HTMLInputElement>('[data-attention-rate-input]')?.focus();
    }
  }

  async function saveTreatment(row: ExpenseRow) {
    const choice = treatmentOf(row);
    const markup = Math.round(Number((choice.markup || '0').replace(',', '.')) * 100);
    const key = `expense:${row.ref.id}`;
    const conversion = conversions[row.ref.id] ?? { rate: '', amount: '' };
    if (row.foreign && !row.conversion && !conversion.rate.trim() && !conversion.amount.trim()) {
      errors = { ...errors, [key]: f('convertNeeded', { from: row.currency, to: currency }) };
      return;
    }
    const result = await act(key, 'setExpenseTreatment', {
      source: row.ref,
      treatment: choice.treatment,
      markupBps: Number.isFinite(markup) ? Math.max(0, Math.min(10000, markup)) : 0,
      requestKey: newKey(),
      ...(row.foreign && (conversion.rate.trim() || conversion.amount.trim())
        ? {
            conversion: conversion.amount.trim()
              ? { convertedAmount: conversion.amount.trim() }
              : { rate: conversion.rate.trim() },
          }
        : {}),
    });
    if (result?.success) closeConversion(row);
  }
  /** After a save (or Cancel) the confirmed conversion line shows again; the typed values are cleared. */
  function closeConversion(row: ExpenseRow) {
    const { [row.ref.id]: _typed, ...restTyped } = conversions;
    conversions = restTyped;
    const { [row.ref.id]: _open, ...restOpen } = changingConversion;
    changingConversion = restOpen;
  }
  function setConversion(row: ExpenseRow, patch: Partial<{ rate: string; amount: string }>) {
    conversions = { ...conversions, [row.ref.id]: { rate: '', amount: '', ...conversions[row.ref.id], ...patch } };
  }

  async function applyConditions(rows: ExpenseRow[]) {
    for (const row of rows.filter((candidate) => candidate.policyAvailable)) {
      const result = await act(`conditions`, 'applyExpenseConditions', { source: row.ref, requestKey: newKey() });
      if (!result?.success) break;
    }
  }

  const initialTreatment = (row: ExpenseRow) => ({
    treatment:
      ['reimbursable', 'all_in', 'non_billable'].includes(row.clientTreatment) &&
      row.classificationState !== 'unclassified'
        ? row.clientTreatment
        : 'reimbursable',
    markup: row.markupBps ? String(row.markupBps / 100) : '',
  });
  $effect(() => {
    const missing = expenseRows.filter((row) => !treatments[row.ref.id]);
    if (missing.length)
      treatments = {
        ...treatments,
        ...Object.fromEntries(missing.map((row) => [row.ref.id, initialTreatment(row)])),
      };
  });
  function setTreatment(row: ExpenseRow, patch: Partial<{ treatment: string; markup: string }>) {
    treatments = { ...treatments, [row.ref.id]: { ...treatmentOf(row), ...patch } };
  }
  function treatmentOf(row: ExpenseRow) {
    return treatments[row.ref.id] ?? initialTreatment(row);
  }

  function onRateKey(event: KeyboardEvent, kind: 'client' | 'cost' | 'pay', person: AttentionPerson, alsoCost = false) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void saveRate(kind, person, alsoCost, rateItem);
    }
  }
  let rateItem: AttentionItem | undefined;

  const peopleOf = (item: AttentionItem) =>
    showAllPeople[item.kind] ? (item.people ?? []) : (item.people ?? []).slice(0, 3);
  const unclassifiedRows = (item: AttentionItem) =>
    expenseRows.filter((row) => item.expenseIds?.includes(row.ref.id));
  const statesText = (person: AttentionPerson) => {
    const states = person.states;
    if (!states) return '';
    const parts: string[] = [];
    // Plural words agree with the number ("6 borradores · 2 enviadas").
    const word = (count: number, one: QuickInvoiceCopyKey, many: QuickInvoiceCopyKey) =>
      `${count} ${t(count === 1 ? one : many)}`;
    if (states.draft) parts.push(word(states.draft, 'stateDraft', 'stateDraftMany'));
    if (states.submitted) parts.push(word(states.submitted, 'stateSubmitted', 'stateSubmittedMany'));
    if (states.returned) parts.push(word(states.returned, 'stateReturned', 'stateReturnedMany'));
    if (states.financePending) parts.push(`${states.financePending} ${t('stateFinance')}`);
    return parts.join(' · ');
  };
  const timeHref = (person: AttentionPerson) => recordHref(person.workerId);
  /** Only expenses (no hours): expense wording, no "Change hours". */
  const expenseOnly = (person: AttentionPerson) => Boolean(person.expenseCount) && person.expenseCount === person.count;
  /** Approving would include nothing: every record is an expense without a client decision. */
  const blockedByTreatment = (person: AttentionPerson) =>
    Boolean(person.unclassifiedExpenseCount) && person.unclassifiedExpenseCount === person.count;
  const excludedRows = $derived(expenseRows.filter((row) => row.excluded && row.classificationState === 'unclassified'));
</script>

{#snippet status(key: string)}
  {#if busy === key}<span class="qa__status" role="status">{t('saving')}</span>
  {:else if saved === key}<span class="qa__status qa__status--ok" role="status">{t('saved')}</span>{/if}
  {#if errors[key]}<span class="qa__error" role="alert" id={`qa-error-${key.replace(/[^a-z0-9]/giu, '-')}`}>{errors[key]}</span>{/if}
{/snippet}

<div class="qa" bind:this={root} data-quick-invoice-attention={count}>
  <h3 class="qa__title">
    {#if blockingCount}{f('attentionToFix', { count: blockingCount })}{:else}{t('attentionNone')} ✓{/if}{#if optionalCount}<span
        class="qa__title-optional"
        data-attention-optional={optionalCount}>&nbsp;· {f('attentionOptional', { count: optionalCount })}</span
      >{/if}
  </h3>
  {#each attention as item, index (item.kind + (item.code ?? '') + index)}
    <section
      class="qa__item"
      class:qa__item--info={item.blocks === 'none'}
      role="group"
      aria-labelledby={`qa-title-${index}`}
      data-attention-kind={item.kind}
      data-attention-blocks={item.blocks}
    >
      {#if item.kind === 'approve'}
        {@const people = item.people ?? []}
        {@const collapsed = item.totalCount > 3}
        <h4 id={`qa-title-${index}`}>
          <span class="qa__dot" aria-hidden="true"></span>
          {collapsed
            ? f('approveGroupMany', { people: item.totalCount, hours: hours(item.minutes ?? 0) })
            : people.every((person) => expenseOnly(person))
              ? people.reduce((total, person) => total + person.count, 0) === 1
                ? t('approveExpenseOne')
                : f('approveExpenses', { count: people.reduce((total, person) => total + person.count, 0) })
              : people.reduce((total, person) => total + person.count, 0) === 1
                ? t('approveGroupOne')
                : f('approveGroup', { count: people.reduce((total, person) => total + person.count, 0) })}
        </h4>
        <ul class="qa__people">
          {#each peopleOf(item) as person (person.workerId)}
            {@const key = `approve:${person.workerId}`}
            <li class="qa__person" data-attention-person={person.workerId}>
              <div class="qa__person-main">
                <strong>{person.name}</strong>
                <span>
                  {#if person.minutes}{hours(person.minutes)} h{:else if person.expenseCount}{person.expenseCount === 1
                      ? t('expenseOne')
                      : f('expenseMany', { count: person.expenseCount })}{/if}{#if person.projectedMinor}{person.minutes || person.expenseCount ? ' · ' : ''}+{money(person.projectedMinor)}{/if}
                  <small>· {statesText(person)}</small>
                </span>
                {#if blockedByTreatment(person)}<small class="qa__amber" data-attention-approve-blocked>{t('approveExpenseFirst')}</small>{/if}
                {#if person.returnedReason}<small class="qa__amber">{f('approveReturnedNote', { reason: person.returnedReason })}</small>{/if}
              </div>
              {#if !collapsed}
                <div class="qa__actions">
                  <button
                    type="button"
                    class="primary-button qa__btn"
                    aria-expanded={openPop === key}
                    disabled={disabled || Boolean(busy) || blockedByTreatment(person)}
                    onclick={() => (openPop = openPop === key ? '' : key)}
                    data-attention-approve>{t('approveInclude')}</button
                  >
                  {#if !expenseOnly(person)}
                    <button
                      type="button"
                      class="qa__link"
                      aria-expanded={openPop === `fix:${person.workerId}`}
                      onclick={() => (openPop = openPop === `fix:${person.workerId}` ? '' : `fix:${person.workerId}`)}
                      >{t('fixRecord')}</button
                    >
                  {/if}
                </div>
              {/if}
              {#if openPop === key}
                <div class="qa__pop" role="dialog" aria-modal="false" aria-labelledby={`qa-pop-${person.workerId}`}>
                  <strong id={`qa-pop-${person.workerId}`}
                    >{expenseOnly(person)
                      ? f('approveConfirmExpenses', { count: person.count, name: person.name })
                      : f('approveConfirmTitle', { count: person.count, name: person.name, hours: hours(person.minutes) })}</strong
                  >
                  <p>{f('approveConfirmBody', { role: roleText })}</p>
                  {#if person.futureCount}<p class="qa__amber">{f('approveFutureNote', { count: person.futureCount })}</p>{/if}
                  {#if person.returnedReason}<p class="qa__amber">{f('approveReturnedNote', { reason: person.returnedReason })}</p>{/if}
                  <div class="qa__pop-actions">
                    <button
                      type="button"
                      class="primary-button qa__btn"
                      disabled={Boolean(busy)}
                      onclick={() => approve(item, [person], key)}
                      data-attention-approve-confirm>{busy === key ? t('saving') : t('approveConfirm')}</button
                    >
                    <button type="button" class="secondary-button qa__btn" onclick={() => (openPop = '')}>{t('cancel')}</button>
                  </div>
                </div>
              {/if}
              {#if openPop === `fix:${person.workerId}`}
                <div class="qa__pop" role="dialog" aria-modal="false" aria-label={t('fixRecord')}>
                  <p>{t('fixRecordHelp')}</p>
                  <div class="qa__pop-actions">
                    <a class="secondary-button qa__btn" href={timeHref(person)}>{t('fixRecordOpen')}</a>
                    <button type="button" class="secondary-button qa__btn" onclick={() => (openPop = '')}>{t('close')}</button>
                  </div>
                </div>
              {/if}
              {@render status(key)}
            </li>
          {/each}
        </ul>
        {#if collapsed}
          {@const key = 'approve:all'}
          {#if (item.people?.length ?? 0) > 3 && !showAllPeople.approve}
            <button type="button" class="qa__link" onclick={() => (showAllPeople = { ...showAllPeople, approve: true })}
              >{f('showMore', { count: (item.people?.length ?? 0) - 3 })}</button
            >
          {/if}
          <div class="qa__actions">
            <button
              type="button"
              class="primary-button qa__btn"
              aria-expanded={openPop === key}
              disabled={disabled || Boolean(busy)}
              onclick={() => (openPop = openPop === key ? '' : key)}
              data-attention-approve>{t('approveInclude')}</button
            >
          </div>
          {#if openPop === key}
            <div class="qa__pop" role="dialog" aria-modal="false" aria-label={t('approveInclude')}>
              <strong
                >{f('approveConfirmAll', {
                  count: people.reduce((total, person) => total + person.count, 0),
                  people: item.totalCount,
                  hours: hours(item.minutes ?? 0),
                })}</strong
              >
              <p>{f('approveConfirmBody', { role: roleText })}</p>
              <div class="qa__pop-actions">
                <button
                  type="button"
                  class="primary-button qa__btn"
                  disabled={Boolean(busy)}
                  onclick={() => approve(item, people, key)}
                  data-attention-approve-confirm>{t('approveConfirm')}</button
                >
                <button type="button" class="secondary-button qa__btn" onclick={() => (openPop = '')}>{t('cancel')}</button>
              </div>
            </div>
          {/if}
          {@render status(key)}
        {/if}
        {#if notes.approve}<p class="qa__muted" role="status">{notes.approve}</p>{/if}
      {:else if item.kind === 'unsent'}
        <h4 id={`qa-title-${index}`}>
          <span class="qa__dot qa__dot--hollow" aria-hidden="true"></span>
          {item.minutes ? f('unsentTitle', { hours: hours(item.minutes) }) : t('unsentTitleExpenses')}
        </h4>
        <p class="qa__muted">{t('unsentHelp')}</p>
        <ul class="qa__people">
          {#each peopleOf(item) as person (person.workerId)}
            <li class="qa__person" data-attention-unsent-person={person.workerId}>
              <div class="qa__person-main">
                <strong>{person.name}</strong>
                <span>
                  {#if person.minutes}{hours(person.minutes)} h{:else if person.expenseCount}{person.expenseCount === 1
                      ? t('expenseOne')
                      : f('expenseMany', { count: person.expenseCount })}{/if}
                  <small>· {statesText(person)}</small>
                </span>
              </div>
              <div class="qa__actions">
                <a class="qa__link" href={timeHref(person)}>{t('unsentOpen')}</a>
              </div>
            </li>
          {/each}
        </ul>
        {#if (item.people?.length ?? 0) > 3 && !showAllPeople.unsent}
          <button type="button" class="qa__link" onclick={() => (showAllPeople = { ...showAllPeople, unsent: true })}
            >{f('showMore', { count: (item.people?.length ?? 0) - 3 })}</button
          >
        {/if}
      {:else if item.kind === 'clientRate' || item.kind === 'workerCost'}
        {@const kind = item.kind === 'clientRate' ? 'client' : item.payMissing ? 'pay' : 'cost'}
        {@const alsoCost = Boolean(item.costMissing)}
        <h4 id={`qa-title-${index}`}>
          <span class="qa__dot" aria-hidden="true"></span>
          {item.kind === 'clientRate'
            ? item.totalCount === 1
              ? t('rateGroupOne')
              : f('rateGroup', { count: item.totalCount })
            : item.totalCount === 1
              ? t('costGroupOne')
              : f('costGroup', { count: item.totalCount })}
        </h4>
        <ul class="qa__people">
          {#each peopleOf(item) as person (person.workerId)}
            {@const key = `${kind}:${person.workerId}`}
            <li class="qa__person qa__person--rate">
              <label class="qa__rate">
                <span class="qa__rate-name"
                  >{person.name} · {hours(person.minutes)} h
                  {#if kind !== 'client'}<small>({kind === 'pay' ? t('payLabel') : t('costLabel')})</small>{/if}</span
                >
                <span class="qa__rate-row">
                  <input
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    placeholder={person.suggestedRateMinor ? decimal(person.suggestedRateMinor) : zeroAmount}
                    aria-label={kind === 'client' ? f('rateLabel', { name: person.name }) : `${kind === 'pay' ? t('payLabel') : t('costLabel')} · ${person.name}`}
                    aria-describedby={errors[key] ? `qa-error-${key.replace(/[^a-z0-9]/giu, '-')}` : undefined}
                    bind:value={rates[key]}
                    onkeydown={(event) => {
                      rateItem = item;
                      onRateKey(event, kind, person, alsoCost);
                    }}
                    disabled={disabled || busy === key}
                    data-attention-rate-input={kind}
                  />
                  <span class="qa__suffix">{currency}{t('perHour')}</span>
                  <button
                    type="button"
                    class="secondary-button qa__btn"
                    disabled={disabled || Boolean(busy)}
                    onclick={() => saveRate(kind, person, alsoCost, item)}>{t('save')}</button
                  >
                </span>
              </label>
              {#if kind === 'client'}
                <label class="qa__check">
                  <input
                    type="checkbox"
                    checked={saveAsProject[person.workerId] !== false}
                    onchange={(event) =>
                      (saveAsProject = { ...saveAsProject, [person.workerId]: (event.currentTarget as HTMLInputElement).checked })}
                  />
                  <span>{t('rateSaveDefault')}</span>
                </label>
                {#if saveAsProject[person.workerId] === false}<small class="qa__muted">{t('rateOnlyLater')}</small>
                {:else if (item.people?.length ?? 0) > 1}<small class="qa__muted" data-attention-rate-applies
                    >{f('rateAppliesToAll', {
                      count: item.totalCount,
                      names: item.people!.map((candidate) => candidate.name).join(', '),
                    })}</small
                  >{/if}
                {#if person.suggestedRateMinor}
                  <button
                    type="button"
                    class="qa__link"
                    onclick={() => (rates = { ...rates, [key]: decimal(person.suggestedRateMinor) })}
                    >{f('rateSuggested', { amount: money(person.suggestedRateMinor) })}</button
                  >
                {/if}
              {/if}
              {#if person.fromDate}<small class="qa__muted">{f('rateFrom', { date: dateText(person.fromDate) })}</small>{/if}
              {@render status(key)}
            </li>
          {/each}
        </ul>
        {#if (item.people?.length ?? 0) > 3 && !showAllPeople[item.kind]}
          <button type="button" class="qa__link" onclick={() => (showAllPeople = { ...showAllPeople, [item.kind]: true })}
            >{f('showMore', { count: (item.people?.length ?? 0) - 3 })}</button
          >
        {/if}
        {#if notes.rates && item.kind === 'clientRate'}<p class="qa__muted" role="status">{notes.rates}</p>{/if}
      {:else if item.kind === 'expenseTreatment'}
        {@const rows = unclassifiedRows(item)}
        <h4 id={`qa-title-${index}`}><span class="qa__dot" aria-hidden="true"></span>{item.totalCount === 1 ? t('expenseGroupOne') : f('expenseGroup', { count: item.totalCount })}</h4>
        {#if rows.some((row) => row.policyAvailable)}
          <div class="qa__actions">
            <button type="button" class="primary-button qa__btn" disabled={disabled || Boolean(busy)} onclick={() => applyConditions(rows)}
              >{t('applyConditions')}</button
            >
            {@render status('conditions')}
          </div>
        {/if}
        <ul class="qa__people">
          {#each rows.slice(0, showAllPeople.expenses ? 50 : 5) as row (row.ref.id)}
            {@render expenseRow(row)}
          {/each}
        </ul>
        {#if rows.length > 5 && !showAllPeople.expenses}
          <button type="button" class="qa__link" onclick={() => (showAllPeople = { ...showAllPeople, expenses: true })}
            >{f('showMore', { count: rows.length - 5 })}</button
          >
        {/if}
      {:else if item.kind === 'expenseSetup' && item.expenseSetup}
        {@const gap = item.expenseSetup}
        <h4 id={`qa-title-${index}`} data-attention-expense-setup={gap.count}>
          <span class="qa__dot" aria-hidden="true"></span>
          {f(gap.count === 1 ? 'expenseSetupOne' : 'expenseSetupMany', {
            count: gap.count,
            amounts: gap.totals.map((total) => journeyMoney(total.amountMinor, total.currency, locale)).join(' + '),
          })}
        </h4>
        <p class="qa__muted">{f('expenseSetupHelp', { date: dateText(gap.effectiveFrom) })}</p>
        <div class="qa__actions">
          <button
            type="button"
            class="primary-button qa__btn"
            disabled={disabled || Boolean(busy)}
            onclick={() => act('expenseSetup', 'setupExpenseBilling', {})}
            data-attention-expense-setup-button>{t('expenseSetupAction')}</button
          >
          {@render status('expenseSetup')}
        </div>
      {:else if item.kind === 'clientDetails' && client}
        <h4 id={`qa-title-${index}`}><span class="qa__dot" aria-hidden="true"></span>{f('clientDetails', { client: client.name })}</h4>
        {#each clientBillingIssues(client) as issue, issueIndex (issueIndex)}
          <p class="qa__muted" data-attention-client-issue={issue.code}>{clientBillingIssueText(locale, issue)}</p>
        {/each}
        {@render clientFields()}
      {:else if item.kind === 'billingSetup' && item.billingSetup}
        {@const options = item.billingSetup}
        <h4 id={`qa-title-${index}`}><span class="qa__dot" aria-hidden="true"></span>{t('setupBilling')}</h4>
        {#if !options.legalEntities.length}
          <p class="qa__muted">{t('noIssuer')}</p>
        {:else}
          <div class="qa__grid">
            {#if options.legalEntities.length === 1}
              {@const only = options.legalEntities[0]!}
              <p class="qa__field" data-setup-issuer={only.id}>
                <span>{t('issuer')}</span>
                <strong>{only.code} · {only.name}</strong>{#if only.canIssue === false}<small class="qa__muted"> · {t('issuerIncomplete')}</small>{/if}
              </p>
            {:else}
              <label class="qa__field">
                <span>{t('issuer')}</span>
                <select bind:value={setup.legalEntityId} data-setup-issuer-select>
                  {#each options.legalEntities as entity (entity.id)}<option value={entity.id}
                      >{entity.code} · {entity.name}{entity.canIssue === false ? ` (${t('issuerIncomplete')})` : ''}</option
                    >{/each}
                </select>
              </label>
            {/if}
            <label class="qa__field">
              <span>{t('taxPick')}</span>
              <select bind:value={setup.tax}>
                <option value="none">{t('taxNone')}</option>
                {#each options.taxProfiles.filter((profile) => !profile.legalEntityId || profile.legalEntityId === setup.legalEntityId) as profile (profile.id)}
                  <option value={profile.id}>{profile.name} · {profile.basisPoints / 100}%</option>
                {/each}
                <option value="new">{t('taxNew')}</option>
              </select>
            </label>
            {#if setup.tax === 'new'}
              <label class="qa__field"><span>{t('taxName')}</span><input bind:value={setup.taxName} maxlength="160" /></label>
              <label class="qa__field"
                ><span>{t('taxPercent')}</span><input bind:value={setup.taxPercent} inputmode="decimal" placeholder="21" /></label
              >
            {/if}
            <label class="qa__field">
              <span>{t('cadence')}</span>
              <select bind:value={setup.cadence}>
                <option value="manual">{t('cadence_manual')}</option>
                <option value="weekly">{t('cadence_weekly')}</option>
                <option value="monthly">{t('cadence_monthly')}</option>
              </select>
            </label>
          </div>
          <div class="qa__actions">
            <button
              type="button"
              class="primary-button qa__btn"
              disabled={disabled || Boolean(busy) || !setup.legalEntityId}
              onclick={() =>
                act('setup', 'setupBilling', {
                  legalEntityId: setup.legalEntityId,
                  tax:
                    setup.tax === 'none'
                      ? { none: true }
                      : setup.tax === 'new'
                        ? { name: setup.taxName.trim(), basisPoints: Math.round(Number(setup.taxPercent.replace(',', '.')) * 100) }
                        : { profileId: setup.tax },
                  cadence: setup.cadence,
                })}>{t('createSetup')}</button
            >
            {@render status('setup')}
          </div>
        {/if}
      {:else if item.kind === 'issuerAuthority' && item.issuerAuthority}
        {@const authority = item.issuerAuthority}
        {@const usable = authority.legalEntities.filter((entity) => entity.canIssue !== false)}
        <h4 id={`qa-title-${index}`}><span class="qa__dot" aria-hidden="true"></span>{t('issuerAuthorityTitle')}</h4>
        {#if !usable.length}
          {@const href = fixHref('issuer_authority')}
          <p class="qa__muted">{t('noIssuer')}</p>
          {#if href}<a class="qa__link" {href}>{t('advancedLink')} ↗</a>{/if}
        {:else}
          <p class="qa__muted">{t('issuerAuthorityHint')}</p>
          <div class="qa__actions" data-attention-issuer>
            {#if usable.length > 1}
              <label class="qa__field">
                <span>{t('issuer')}</span>
                <select bind:value={issuerPick}>
                  {#each usable as entity (entity.id)}<option value={entity.id}>{entity.code} · {entity.name}</option>{/each}
                </select>
              </label>
            {:else}
              <strong>{usable[0]!.code} · {usable[0]!.name}</strong>
            {/if}
            <button
              type="button"
              class="primary-button qa__btn"
              disabled={disabled || Boolean(busy) || !issuerPick}
              onclick={() => act('issuer', 'setIssuer', { legalEntityId: issuerPick })}>{t('issuerUse')}</button
            >
            {@render status('issuer')}
          </div>
        {/if}
      {:else if item.kind === 'issuerBank' && item.issuer}
        {@const issuer = item.issuer}
        <h4 id={`qa-title-${index}`}><span class="qa__dot qa__dot--hollow" aria-hidden="true"></span>{t('issuerBank')}</h4>
        <div class="qa__grid">
          <label class="qa__field"><span>{t('bankName')}</span><input bind:value={bank.bankName} placeholder={issuer.bankName} maxlength="300" /></label>
          <label class="qa__field"
            ><span>{t('bankAccount')}</span><input bind:value={bank.bankAccountNumber} placeholder={issuer.bankAccountNumber} maxlength="160" /></label
          >
        </div>
        <div class="qa__actions">
          <button
            type="button"
            class="secondary-button qa__btn"
            disabled={disabled || Boolean(busy) || !bank.bankName.trim() || !bank.bankAccountNumber.trim()}
            onclick={() =>
              act('bank', 'setIssuerBank', {
                legalEntityId: issuer.legalEntityId,
                currency: issuer.currency,
                expectedVersion: issuer.version,
                bankName: bank.bankName.trim(),
                bankAccountNumber: bank.bankAccountNumber.trim(),
              })}>{t('save')}</button
          >
          {@render status('bank')}
        </div>
      {:else if item.kind === 'purchaseOrder' && item.project}
        {@const project = item.project}
        <h4 id={`qa-title-${index}`}><span class="qa__dot qa__dot--hollow" aria-hidden="true"></span>{t('poTitle')}</h4>
        <div class="qa__po">
          <input bind:value={poDraft} maxlength="200" aria-label={t('po')} placeholder="4500012345" />
          <fieldset class="qa__radios">
            <legend class="qa__sr">{t('po')}</legend>
            <label><input type="radio" bind:group={poScope} value="invoice" /> {t('poThisInvoice')}</label>
            <label><input type="radio" bind:group={poScope} value="project" /> {t('poProject')}</label>
          </fieldset>
          <button
            type="button"
            class="secondary-button qa__btn"
            disabled={disabled || Boolean(busy) || !poDraft.trim()}
            onclick={async () => {
              if (poScope === 'invoice') {
                purchaseNo = poDraft.trim();
                saved = 'po';
                return;
              }
              const result = await act('po', 'setProjectPurchaseOrder', { expectedVersion: project.version, value: poDraft.trim() });
              if (result?.success) purchaseNo = '';
            }}>{t('save')}</button
          >
        </div>
        {#if purchaseNo}<p class="qa__muted" role="status">{f('poPending', { po: purchaseNo })}</p>{/if}
        {@render status('po')}
      {:else}
        {@const href = fixHref(item.fix)}
        <h4 id={`qa-title-${index}`}>
          <span class="qa__dot" class:qa__dot--hollow={item.blocks === 'none'} aria-hidden="true"></span>{otherText(item)}
        </h4>
        {#if href}<a class="qa__link" {href}>{t('advancedLink')} ↗</a>{/if}
      {/if}
    </section>
  {/each}
  {#if excludedRows.length && onExclude}
    <section class="qa__item qa__item--info" data-attention-excluded={excludedRows.length}>
      <h4><span class="qa__dot qa__dot--hollow" aria-hidden="true"></span>{f('expenseLeftOut', { count: excludedRows.length })}</h4>
      <ul class="qa__people">
        {#each excludedRows as row (row.ref.id)}
          <li class="qa__person">
            <span>{rowTitle(row)} · {dateText(row.date)} · {journeyMoney(row.amountMinor, row.currency, locale)}</span>
            <button type="button" class="qa__link" disabled={disabled} onclick={() => onExclude?.(row.ref.id, false)}>{t('expenseInclude')}</button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
  {#if expenseRows.some((row) => row.classificationState !== 'unclassified')}
    <details class="qa__expenses" data-attention-expense-list>
      <summary>{t('expenseList')} ({expenseRows.length})</summary>
      <ul class="qa__people">
        {#each expenseRows.filter((row) => row.classificationState !== 'unclassified') as row (row.ref.id)}
          {@render expenseRow(row)}
        {/each}
      </ul>
    </details>
  {/if}
</div>

{#snippet expenseRow(row: ExpenseRow)}
  {@const key = `expense:${row.ref.id}`}
  {@const choice = treatmentOf(row)}
  <li class="qa__person qa__expense" data-attention-expense={row.ref.id}>
    <div class="qa__person-main">
      <strong>{rowTitle(row)}</strong>
      <span>{dateText(row.date)} · {row.workerName} · {journeyMoney(row.amountMinor, row.currency, locale)}</span>
    </div>
    {#if row.locked}
      <small class="qa__muted">{t('expenseLocked')}</small>
    {:else}
      {#if row.foreign && row.conversion && !changingConversion[row.ref.id]}
        <div class="qa__convert" data-attention-convert-confirmed={row.ref.id}>
          <small class="qa__muted"
            >{f('convertConfirmed', {
              amount: money(row.conversion.amountMinor),
              from: row.currency,
              to: currency,
              rate: row.conversion.rate,
              source: row.conversion.rateSource === 'ECB' ? t('convertSourceEcb') : t('convertSourceManual'),
            })}</small
          >
          <button
            type="button"
            class="qa__link"
            disabled={disabled}
            onclick={() => (changingConversion = { ...changingConversion, [row.ref.id]: true })}>{t('convertChange')}</button
          >
        </div>
      {:else if row.foreign}
        {@const conversion = conversions[row.ref.id] ?? { rate: '', amount: '' }}
        <div class="qa__convert" data-attention-convert={row.ref.id}>
          <small class="qa__muted">{f('convertHelp', { from: row.currency, to: currency })}</small>
          <label class="qa__field"
            ><span>{f('convertAmount', { to: currency })}</span><input
              value={conversion.amount}
              oninput={(event) => setConversion(row, { amount: (event.currentTarget as HTMLInputElement).value })}
              inputmode="decimal"
              autocomplete="off"
              placeholder={row.conversion ? decimal(row.conversion.amountMinor) : zeroAmount}
              data-attention-convert-amount
            /></label
          >
          <label class="qa__field"
            ><span>{f('convertRate', { from: row.currency, to: currency })}</span><input
              value={conversion.rate}
              oninput={(event) => setConversion(row, { rate: (event.currentTarget as HTMLInputElement).value })}
              inputmode="decimal"
              autocomplete="off"
              placeholder={row.conversion?.rate ?? ''}
              disabled={Boolean(conversion.amount.trim())}
              data-attention-convert-rate
            /></label
          >
          {#if row.conversion && changingConversion[row.ref.id]}
            <button type="button" class="qa__link" disabled={disabled || Boolean(busy)} onclick={() => closeConversion(row)}
              >{t('cancel')}</button
            >
          {/if}
        </div>
      {/if}
      <div class="qa__treatment">
        <select
          value={choice.treatment}
          onchange={(event) => setTreatment(row, { treatment: (event.currentTarget as HTMLSelectElement).value })}
          aria-label={`${t('treatmentLabel')} · ${rowTitle(row)}`} disabled={disabled || busy === key}>
          <option value="reimbursable">{t('treatment_reimbursable')}</option>
          <option value="all_in">{t('treatment_all_in')}</option>
          <option value="non_billable">{t('treatment_non_billable')}</option>
        </select>
        {#if choice.treatment === 'reimbursable'}
          <label class="qa__markup"
            ><span>{t('markup')}</span><input
              value={choice.markup}
              oninput={(event) => setTreatment(row, { markup: (event.currentTarget as HTMLInputElement).value })}
              inputmode="decimal" placeholder="0" aria-label={t('markup')} /></label
          >
        {/if}
        <button type="button" class="secondary-button qa__btn" disabled={disabled || Boolean(busy)} onclick={() => saveTreatment(row)}
          >{t('save')}</button
        >
      </div>
      {#if row.classificationState === 'unclassified' && onExclude}
        <button type="button" class="qa__link" disabled={disabled || Boolean(busy)} onclick={() => onExclude?.(row.ref.id, true)} data-attention-exclude
          >{t('expenseLeaveOut')}</button
        >
      {/if}
    {/if}
    {@render status(key)}
  </li>
{/snippet}

{#snippet clientFields()}
  {#if client}
    <div class="qa__grid">
      <label class="qa__field qa__field--wide"
        ><span>{t('billingAddress')}</span><textarea rows="3" maxlength="500" bind:value={clientForm.billingAddress}></textarea></label
      >
      <label class="qa__field"><span>{t('billingEmail')}</span><input type="email" maxlength="254" bind:value={clientForm.billingEmail} /></label>
      <label class="qa__field"><span>{t('legalName')}</span><input maxlength="300" bind:value={clientForm.legalName} /></label>
      <label class="qa__field"
        ><span>{t('taxId')}</span><input
          maxlength="64"
          autocomplete="off"
          placeholder="B12345678"
          bind:value={clientForm.taxId}
          aria-describedby="qa-taxid-help"
          data-attention-client-taxid
        /><small id="qa-taxid-help" class="qa__muted">{t('taxIdHelp')}</small></label
      >
    </div>
    <p class="qa__muted">{f('clientSavedFuture', { client: client.name })}</p>
    <div class="qa__actions">
      <button
        type="button"
        class="secondary-button qa__btn"
        disabled={disabled || Boolean(busy) || (!clientForm.billingAddress.trim() && !client.billingAddress)}
        onclick={() =>
          act('client', 'updateClient', {
            clientId: client.id,
            expectedVersion: client.version,
            ...(clientForm.billingAddress.trim() ? { billingAddress: clientForm.billingAddress.trim() } : {}),
            billingEmail: clientForm.billingEmail.trim(),
            ...(clientForm.legalName.trim() ? { legalName: clientForm.legalName.trim() } : {}),
            taxId: clientForm.taxId.trim(),
          })}
        data-attention-client-save>{t('save')}</button
      >
      {@render status('client')}
    </div>
  {/if}
{/snippet}

<style>
  .qa {
    display: grid;
    gap: 0.6rem;
    min-width: 0;
  }
  .qa__title {
    margin: 0;
    font-size: 1rem;
  }
  .qa__title-optional {
    font-weight: 500;
    color: var(--ja-text-muted, #6b6b62);
  }
  .qa__item {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
    padding: 0.75rem;
    border: 1px solid color-mix(in srgb, var(--ja-status-warning, #d97706) 45%, white);
    border-radius: 0.6rem;
    background: color-mix(in srgb, var(--ja-status-warning, #d97706) 6%, white);
  }
  .qa__item--info {
    border-color: var(--ja-border-subdued, #e4e4df);
    background: var(--ja-canvas, #f4f4f2);
  }
  .qa__item h4 {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
    margin: 0;
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }
  .qa__dot {
    flex: none;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--ja-status-warning, #d97706);
  }
  .qa__dot--hollow {
    background: transparent;
    border: 2px solid var(--ja-text-muted, #6b6b62);
  }
  .qa__people {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .qa__person {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem 0.75rem;
    min-width: 0;
    font-size: 0.85rem;
  }
  .qa__person--rate {
    display: grid;
    justify-content: stretch;
  }
  .qa__person-main {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
    flex: 1 1 12rem;
    overflow-wrap: anywhere;
  }
  .qa__person-main small,
  .qa__muted {
    color: var(--ja-text-muted, #6b6b62);
    font-size: 0.8rem;
    margin: 0;
  }
  .qa__amber {
    color: #92400e;
    font-size: 0.8rem;
    margin: 0;
  }
  .qa__actions,
  .qa__pop-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .qa__btn {
    min-height: 2.75rem;
  }
  .qa__link {
    min-height: 2.75rem;
    padding: 0 0.25rem !important;
    border: 0 !important;
    background: none !important;
    box-shadow: none !important;
    color: var(--ja-text-primary, #20201d) !important;
    text-decoration: underline;
    font-size: 0.85rem !important;
    font-weight: 600 !important;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-self: start;
  }
  .qa__pop {
    flex: 1 1 100%;
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px solid var(--ja-border-strong, #d1d1c9);
    border-radius: 0.6rem;
    background: var(--ja-surface, #fff);
    box-shadow: 0 0.5rem 1.4rem rgb(25 25 20 / 0.12);
  }
  .qa__pop p {
    margin: 0;
    font-size: 0.85rem;
  }
  .qa__rate {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
  }
  .qa__rate-name {
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .qa__rate-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }
  .qa__rate-row input {
    width: 8rem;
    min-height: 2.75rem;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
  }
  .qa__suffix {
    color: var(--ja-text-secondary, #57574f);
    font-size: 0.85rem;
  }
  .qa__check {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.75rem;
    font-size: 0.85rem;
  }
  .qa__check input {
    width: 1.2rem;
    height: 1.2rem;
  }
  .qa__status {
    font-size: 0.8rem;
    color: var(--ja-text-muted, #6b6b62);
  }
  .qa__status--ok {
    color: #166534;
    font-weight: 700;
  }
  .qa__error {
    flex: 1 1 100%;
    color: var(--ja-red, #b42318);
    font-size: 0.8rem;
    font-weight: 700;
  }
  .qa__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.6rem;
  }
  .qa__field {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
    font-size: 0.85rem;
  }
  .qa__field span {
    font-weight: 700;
  }
  .qa__field input,
  .qa__field select,
  .qa__field textarea {
    width: 100%;
    min-height: 2.75rem;
    min-width: 0;
  }
  .qa__field--wide {
    grid-column: 1 / -1;
  }
  .qa__treatment {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }
  .qa__treatment select {
    min-height: 2.75rem;
  }
  .qa__convert {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.4rem 0.6rem;
    align-items: end;
  }
  .qa__convert small {
    grid-column: 1 / -1;
  }
  .qa__markup {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.8rem;
  }
  .qa__markup input {
    width: 4.5rem;
    min-height: 2.75rem;
  }
  .qa__expenses summary {
    min-height: 2.75rem;
    display: flex;
    align-items: center;
    cursor: pointer;
    font-weight: 700;
    font-size: 0.85rem;
  }
  .qa__po {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .qa__po input {
    min-height: 2.75rem;
    flex: 1 1 10rem;
    min-width: 0;
  }
  .qa__radios {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    margin: 0;
    padding: 0;
    border: 0;
    font-size: 0.85rem;
  }
  .qa__radios label {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 2.75rem;
  }
  .qa__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  @media (max-width: 600px) {
    /* Popovers become bottom sheets on phones. */
    .qa__pop {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 30;
      max-height: 70vh;
      overflow-y: auto;
      border-radius: 1rem 1rem 0 0;
      padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom));
    }
    .qa__pop-actions .qa__btn {
      flex: 1 1 100%;
    }
    .qa__actions .primary-button {
      flex: 1 1 100%;
    }
  }
</style>
