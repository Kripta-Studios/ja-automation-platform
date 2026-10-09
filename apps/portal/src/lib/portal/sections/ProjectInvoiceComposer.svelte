<script lang="ts">
  import { base } from '$app/paths';
  import { deserialize } from '$app/forms';
  import { onDestroy, onMount } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { SectionCard } from '../ui';
  import ProblemNotice from '../ui/ProblemNotice.svelte';
  import type { ProblemData } from '$lib/problem/contract';
  import { portalText, type PortalLocale } from '$lib/portal-i18n';
  import { billingReadinessMessageKey, billingReadinessReviewPath } from '../billing-readiness';
  import { compatibleBillingPeriod, type BillingPeriodStream } from '../billing-period-recovery';
  import { journeyText, journeyReason, journeyMoney } from '../project-invoice-journey';
  import type { InvoiceCompositionSource, InvoiceCompositionSourceRef } from '@ja/database';

  type Rule = Record<string, unknown>;
  type Reason = { code: string; sourceId?: string };
  type Issuing = {
    issues: string[];
    legalEntityId: string;
    revisions: Array<{
      revisionId: string;
      legalName: string;
      effectiveFrom: string;
      effectiveTo: string | null;
    }>;
    assignmentRequestKey: string;
    canManageNumbering: boolean;
  };
  type Inventory = {
    sources: InvoiceCompositionSource[];
    expensePolicies?: Array<{
      sourceId: string;
      available: boolean;
      clientRecoveryMinor: string | null;
      currency: string | null;
    }>;
    reasons: Reason[];
    currency: string;
    mode: string;
    issuing: Issuing;
  };
  type Preview = {
    state: string;
    reasons: Reason[];
    lines: Array<{ description: string; subtotalMinor: string }>;
    subtotalMinor: string;
    taxMinor: string;
    totalMinor: string;
    currency: string;
  };
  type Invoice = {
    id: string;
    state: string;
    number: string | null;
    pdfStatus: string;
    version: number;
    currency: string;
    totalMinor: string;
  };
  type Feedback = Partial<ProblemData> & {
    success?: boolean;
    message?: string;
    reasons?: Reason[];
  };
  let {
    projectId,
    rules,
    locale = 'en',
    role,
    userId,
    initialRuleId = '',
    initialDate = '',
  }: {
    projectId?: string;
    rules: readonly Rule[];
    locale?: PortalLocale;
    role: string;
    userId: string;
    initialRuleId?: string;
    initialDate?: string;
  } = $props();
  const text = (key: Parameters<typeof journeyText>[1]) => journeyText(locale, key);
  const supportedRules = $derived(
    rules.filter(
      (rule) =>
        String(rule.enabled) === '1' &&
        ['labor', 'expense'].includes(String(rule.stream_type)) &&
        (!projectId || String(rule.project_id) === projectId),
    ),
  );
  let ruleId = $state('');
  let start = $state('');
  let end = $state('');
  const rule = $derived(supportedRules.find((candidate) => String(candidate.id) === ruleId));
  const currentProjectId = $derived(projectId ?? String(rule?.project_id ?? ''));
  let inventory = $state<Inventory | null>(null);
  let selected = $state<string[]>([]);
  let preview = $state<Preview | null>(null);
  let invoice = $state<Invoice | null>(null);
  let typeFilter = $state('');
  let previewIdentity = $state('');
  let frozenCreate = $state<Record<string, unknown> | null>(null);
  let responseUncertain = false;
  let busy = $state(false);
  let worker = $state('');
  let stateFilter = $state('all');
  let feedback = $state<Feedback | null>(null);
  let notice = $state('');
  let requestKey = $state('');
  let uncertainCreate = $state(false);
  let loadedScope = $state('');
  let mounted = $state(false);
  let revision = $state('');
  let assignmentFrom = $state('');
  let assignmentTo = $state('');
  let assignmentReason = $state('');
  let numberingPrefix = $state('');
  let numberingDigits = $state('6');
  let numberingFrom = $state('');
  let accountantDate = $state('');
  let formBusy = $state(false);
  let polling: ReturnType<typeof setTimeout> | undefined;
  const endpoint = `${base}/app/api/billing/composer`;
  const key = (source: InvoiceCompositionSourceRef) => `${source.type}:${source.id}`;
  const selectedSources = $derived(
    (inventory?.sources ?? []).filter((source) => selected.includes(key(source))),
  );
  const workers = $derived([
    ...new Map(
      (inventory?.sources ?? []).map((source) => [source.workerId, source.workerName]),
    ).entries(),
  ]);
  const containingInvoices = $derived([
    ...new Map(
      (inventory?.sources ?? []).flatMap((source) =>
        source.containingInvoice
          ? [[source.containingInvoice.id, source.containingInvoice] as const]
          : [],
      ),
    ).values(),
  ]);
  const containingInvoiceHref = (id: string, edit = false) =>
    `${base}/app/billing/invoices/${encodeURIComponent(id)}?lang=${locale}${edit ? '&edit=1#invoice-draft-details' : ''}`;
  const reserved = (source: InvoiceCompositionSource) =>
    !['unlocked', 'locked'].includes(source.billingState);
  const needsApproval = (source: InvoiceCompositionSource) =>
    !source.financeAccepted || source.approvalState !== 'approved';
  const canApprove = (source: InvoiceCompositionSource) =>
    !reserved(source) &&
    ((role === 'owner_admin' && ['submitted', 'approved'].includes(source.approvalState)) ||
      (role === 'finance_admin' && source.approvalState === 'approved')) &&
    needsApproval(source);
  const pendingSelected = $derived(selectedSources.filter(canApprove));
  const visible = $derived(
    (inventory?.sources ?? []).filter(
      (source) =>
        (!typeFilter || source.type === typeFilter) &&
        (!worker || source.workerId === worker) &&
        (stateFilter === 'all' ||
          (stateFilter === 'pending' && needsApproval(source) && !reserved(source)) ||
          (stateFilter === 'ready' && !needsApproval(source) && source.blockers.length === 0) ||
          (stateFilter === 'billed' && reserved(source))),
    ),
  );
  const currentScope = $derived(
    JSON.stringify({
      projectId: currentProjectId,
      billingRuleId: ruleId,
      periodStart: start,
      periodEnd: end,
    }),
  );
  const selectionCurrent = $derived(loadedScope === currentScope && !invoice);
  const shownProblem = $derived(
    feedback?.code && feedback.messageKey && feedback.correlationId
      ? (feedback as ProblemData)
      : null,
  );
  const reasonText = (code: string) =>
    journeyReason(locale, code) ?? portalText(locale, billingReadinessMessageKey(code));
  const setupHref = $derived(
    `${base}/app/projects/${encodeURIComponent(currentProjectId)}?tab=billing&billingStep=people&lang=${locale}`,
  );
  const blockerHref = (reason: Reason) =>
    reason.code === 'source_requires_remaining_period_billing'
      ? `${base}/app/billing?project=${encodeURIComponent(currentProjectId)}&assistantSurface=invoice-create&mode=whole-period&billingRuleId=${encodeURIComponent(ruleId)}&periodStart=${start}&periodEnd=${end}&lang=${locale}`
      : ['missing_client_rate', 'missing_internal_cost', 'missing_compensation_rule'].includes(
            reason.code,
          )
        ? setupHref
        : `${base}/app${billingReadinessReviewPath([reason.code], currentProjectId, { start, end }, reason.sourceId)}`;
  const selectionIdentity = () => JSON.stringify({ scope: currentScope, refs: refs() });
  const hiddenSelected = $derived(
    selectedSources.filter((source) => !visible.some((row) => key(row) === key(source))).length,
  );
  const refs = () => selectedSources.map(({ type, id, version }) => ({ type, id, version }));
  function invalidateSelection() {
    preview = null;
    feedback = null;
    notice = '';
    requestKey = crypto.randomUUID();
  }
  function toggle(source: InvoiceCompositionSource, checked: boolean) {
    if (busy || invoice || uncertainCreate) return;
    const grouped =
      source.type === 'time'
        ? (inventory?.sources ?? []).filter(
            (row) => row.type === 'time' && source.selectedDependencies.includes(row.id),
          )
        : [source];
    const keys = grouped.filter((row) => !reserved(row)).map(key);
    selected = checked
      ? [...new Set([...selected, ...keys])]
      : selected.filter((item) => !keys.includes(item));
    invalidateSelection();
  }
  function selectVisible() {
    const next = new SvelteSet(selected);
    for (const source of visible.filter((row) => !reserved(row))) {
      if (source.type === 'time') {
        for (const row of inventory?.sources ?? [])
          if (row.type === 'time' && source.selectedDependencies.includes(row.id) && !reserved(row))
            next.add(key(row));
      } else next.add(key(source));
    }
    selected = [...next];
    invalidateSelection();
  }
  function scopeInput() {
    return {
      projectId: currentProjectId,
      billingRuleId: ruleId,
      periodStart: start,
      periodEnd: end,
    };
  }
  function periodStream(selectedRule: Rule): BillingPeriodStream {
    return {
      cadence: String(selectedRule.cadence_type) as BillingPeriodStream['cadence'],
      effectiveFrom: String(selectedRule.effective_from),
      effectiveTo: selectedRule.effective_to ? String(selectedRule.effective_to) : undefined,
      anchorDate: selectedRule.anchor_date ? String(selectedRule.anchor_date) : undefined,
      monthlyCutoffDay:
        selectedRule.monthly_cutoff_day == null
          ? undefined
          : Number(selectedRule.monthly_cutoff_day),
    };
  }
  async function readResponse(response: Response) {
    responseUncertain = false;
    const result = await response.json().catch(() => {
      responseUncertain = true;
      return { success: false, code: 'INVOICE_COMPOSER_UNAVAILABLE' };
    });
    if (response.status >= 500) responseUncertain = true;
    if (!response.ok || result.success === false) {
      feedback = result;
      return null;
    }
    return result;
  }
  async function loadRecords(preserve = false, align = true) {
    if (!rule || busy || uncertainCreate) return;
    if (align) {
      const adjusted = compatibleBillingPeriod(periodStream(rule), { start, end });
      if (!adjusted) {
        feedback = { code: 'INVOICE_COMPOSER_SELECTION_INVALID' };
        return;
      }
      if (adjusted.start !== start || adjusted.end !== end)
        notice = `${text('changed')} ${adjusted.start} → ${adjusted.end}`;
      start = adjusted.start;
      end = adjusted.end;
    }
    busy = true;
    feedback = null;
    preview = null;
    try {
      const result = await readResponse(
        await fetch(`${endpoint}?${new URLSearchParams(scopeInput())}`),
      );
      if (result) {
        inventory = result as Inventory;
        loadedScope = currentScope;
        selected = preserve
          ? selected.filter((value) =>
              inventory!.sources.some((source) => key(source) === value && !reserved(source)),
            )
          : [];
        if (!preserve) {
          assignmentFrom = start;
          assignmentTo = '';
          assignmentReason = '';
          numberingPrefix = '';
          accountantDate = '';
          numberingFrom = '';
        } else {
          assignmentFrom ||= start;
        }
        revision =
          inventory.issuing.revisions.find(
            (item) => item.effectiveFrom <= start && (!item.effectiveTo || item.effectiveTo >= end),
          )?.revisionId ?? '';
      }
    } catch {
      feedback = { code: 'INVOICE_COMPOSER_UNAVAILABLE' };
    } finally {
      busy = false;
    }
  }
  async function command(operation: string) {
    if (busy || formBusy) return;
    if (!invoice && selectedSources.length === 0 && !(operation === 'create' && frozenCreate)) {
      notice = text('none');
      return;
    }
    busy = true;
    feedback = null;
    notice = '';
    let input =
      operation === 'approveSources'
        ? {
            operation,
            projectId: currentProjectId,
            sources: pendingSelected.map(({ type, id, version }) => ({ type, id, version })),
          }
        : invoice
          ? {
              operation,
              projectId: currentProjectId,
              invoiceId: invoice.id,
              ...(operation === 'refreshInvoice'
                ? { expectedVersion: invoice.version }
                : { locale }),
            }
          : {
              operation,
              ...scopeInput(),
              sources: refs(),
              ...(operation === 'create' ? { requestKey } : {}),
            };
    if (operation === 'create') {
      frozenCreate ??= input;
      input = frozenCreate as typeof input;
    }
    try {
      const result = await readResponse(
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        }),
      );
      if (result) {
        if (operation === 'preview') {
          preview = result as Preview;
          previewIdentity = selectionIdentity();
        } else if (result.invoice) {
          invoice = result.invoice;
          uncertainCreate = false;
          frozenCreate = null;
          preview = null;
          schedulePoll();
        } else if (operation === 'approveSources') {
          busy = false;
          await loadRecords(true, false);
          notice = text('done');
          return;
        }
      } else {
        if (operation === 'create') {
          uncertainCreate = responseUncertain;
          if (!uncertainCreate) frozenCreate = null;
        }
        if (invoice) await refreshInvoice();
      }
    } catch {
      feedback = { code: 'INVOICE_COMPOSER_UNAVAILABLE' };
      if (operation === 'create') uncertainCreate = true;
    } finally {
      busy = false;
    }
  }
  const expenseKeys = new SvelteMap<string, string>();
  async function applyExpense(source: InvoiceCompositionSource) {
    if (busy || formBusy || uncertainCreate || loadedScope !== currentScope) return;
    const identity = `${source.id}:${source.version}`;
    const requestKey = expenseKeys.get(identity) ?? crypto.randomUUID();
    expenseKeys.set(identity, requestKey);
    busy = true;
    feedback = null;
    try {
      const result = await readResponse(
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            operation: 'applyExpenseConditions',
            projectId: currentProjectId,
            source: { type: 'expense', id: source.id, version: source.version },
            requestKey,
          }),
        }),
      );
      if (result) {
        busy = false;
        await loadRecords(true, false);
        notice = text('done');
      }
    } catch {
      feedback = { code: 'INVOICE_COMPOSER_UNAVAILABLE' };
    } finally {
      busy = false;
    }
  }
  async function refreshInvoice() {
    if (!invoice) return;
    try {
      const result = await readResponse(
        await fetch(
          `${endpoint}?${new URLSearchParams({ projectId: currentProjectId, invoiceId: invoice.id })}`,
        ),
      );
      if (result) invoice = result.invoice;
    } catch {
      feedback = { code: 'INVOICE_COMPOSER_UNAVAILABLE' };
    }
  }
  function schedulePoll() {
    if (polling) clearTimeout(polling);
    if (
      invoice &&
      ['issued', 'sent', 'partially_paid', 'paid'].includes(invoice.state) &&
      !['ready', 'failed'].includes(invoice.pdfStatus)
    )
      polling = setTimeout(async () => {
        await refreshInvoice();
        schedulePoll();
      }, 2500);
  }
  async function saveRequirement(
    event: SubmitEvent,
    action: string,
    successMessage = text('done'),
  ) {
    event.preventDefault();
    if (busy || formBusy || loadedScope !== currentScope) return;
    const element = event.currentTarget as HTMLFormElement;
    if (!element.reportValidity()) return;
    formBusy = true;
    feedback = null;
    try {
      const response = await fetch(action, {
        method: 'POST',
        headers: { 'x-sveltekit-action': 'true' },
        body: new FormData(element),
      });
      const result = deserialize(await response.text());
      if (result.type === 'success') {
        await loadRecords(true, false);
        notice = successMessage;
      } else if (result.type === 'failure') feedback = result.data as Feedback;
      else feedback = { code: 'INVOICE_COMPOSER_UNAVAILABLE' };
    } catch {
      feedback = { code: 'INVOICE_COMPOSER_UNAVAILABLE' };
    } finally {
      formBusy = false;
    }
  }
  onMount(() => {
    try {
      const value = sessionStorage.getItem(storageKey);
      if (value) restored = JSON.parse(value);
    } catch {
      restored = null;
    }
    requestKey = restored?.requestKey || crypto.randomUUID();
    mounted = true;
  });
  $effect(() => {
    if (!mounted || !initialized) return;
    const value = {
      ruleId,
      start,
      end,
      selected,
      requestKey,
      frozenCreate,
      uncertainCreate,
      invoice: invoice ? { id: invoice.id } : null,
    };
    // Retain source IDs and scope, never source summaries, worker pay or customer rates.
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* Storage can be disabled. */
    }
  });
  onDestroy(() => {
    if (polling) clearTimeout(polling);
  });
  let initialized = '';
  const storageKey = $derived(`ja-invoice-composer:${userId}:${projectId ?? 'standalone'}`);
  let restored: {
    ruleId: string;
    start: string;
    end: string;
    selected: string[];
    requestKey: string;
    invoice: Invoice | null;
    frozenCreate: Record<string, unknown> | null;
    uncertainCreate: boolean;
  } | null = null;
  $effect(() => {
    if (!mounted || supportedRules.length === 0) return;
    const identity = projectId ?? 'standalone';
    if (initialized === identity) return;
    initialized = identity;
    ruleId = supportedRules.some((item) => String(item.id) === restored?.ruleId)
      ? restored!.ruleId
      : supportedRules.some((item) => String(item.id) === initialRuleId)
        ? initialRuleId
        : String(supportedRules[0]!.id);
    const defaultDate = initialDate || new Date().toISOString().slice(0, 10);
    const selectedRule = supportedRules.find((item) => String(item.id) === ruleId)!;
    const period = compatibleBillingPeriod(periodStream(selectedRule), {
      start: defaultDate,
      end: defaultDate,
    });
    start = restored?.start || period?.start || defaultDate;
    end = restored?.end || period?.end || defaultDate;
    frozenCreate = restored?.frozenCreate ?? null;
    uncertainCreate = restored?.uncertainCreate ?? false;
    selected = Array.isArray(restored?.selected)
      ? restored!.selected.filter((value) => typeof value === 'string')
      : [];
    if (restored?.invoice?.id) {
      invoice = { ...restored.invoice, state: 'loading' };
      void refreshInvoice().then(schedulePoll);
    }
    void loadRecords(!!restored);
    restored = null;
  });
</script>

<div data-invoice-composer>
  <SectionCard title={text('records')} description={text('intro')}>
    {#if supportedRules.length === 0}
      <p>{text('noStream')}</p>
      <a class="secondary-button" href={setupHref}>{text('setup')}</a>
    {:else}
      <form
        class="composer-fields"
        onsubmit={(event) => {
          event.preventDefault();
          void loadRecords();
        }}
      >
        <label
          >{text('stream')}<select
            bind:value={ruleId}
            onchange={() => {
              preview = null;
            }}
            disabled={busy || formBusy || !!invoice || uncertainCreate}
            required
          >
            {#each supportedRules as item}<option value={String(item.id)}
                >{projectId
                  ? ''
                  : `${String(item.project_number ?? item.project_name ?? '')} · `}{text(
                  item.stream_type === 'expense'
                    ? 'expense'
                    : Number(item.include_expenses) === 1
                      ? 'combined'
                      : 'labor',
                )} · {String(item.currency)} · {String(item.cadence_type)}</option
              >{/each}
          </select></label
        >
        <label
          >{text('start')}<input
            type="date"
            bind:value={start}
            onchange={() => {
              preview = null;
            }}
            required
            disabled={busy || formBusy || !!invoice || uncertainCreate}
          /></label
        >
        <label
          >{text('end')}<input
            type="date"
            bind:value={end}
            onchange={() => {
              preview = null;
            }}
            required
            disabled={busy || formBusy || !!invoice || uncertainCreate}
          /></label
        >
        <button
          type="submit"
          class="secondary-button"
          disabled={busy || formBusy || !!invoice || uncertainCreate}
          >{busy ? text('loading') : text('load')}</button
        >
      </form>
      {#if notice}<p role="status" class="composer-notice">{notice}</p>{/if}
      {#if feedback}
        {#if shownProblem}<ProblemNotice problem={shownProblem} />{:else}<div
            role="alert"
            class="composer-notice"
          >
            <p>
              {['INVOICE_COMPOSER_SIGN_IN', 'INVOICE_COMPOSER_ORIGIN'].includes(feedback.code ?? '')
                ? text('forbidden')
                : text('error')}
            </p>
            {#if feedback.correlationId}<small>{text('reference')}: {feedback.correlationId}</small
              >{/if}
          </div>{/if}
        {#if feedback.reasons}<ul>
            {#each feedback.reasons as reason}<li>
                {reasonText(reason.code)} <a href={blockerHref(reason)}>{text('solve')}</a>
              </li>{/each}
          </ul>{/if}
      {/if}
      {#if uncertainCreate}<div role="alert" class="composer-notice">
          <p>{text('uncertain')}</p>
          <button
            type="button"
            class="primary-button"
            disabled={busy || formBusy}
            onclick={() => command('create')}>{text('retry')}</button
          >
        </div>{/if}
      {#if inventory && !invoice}
        {#if containingInvoices.length}
          <section class="composer-linked-invoices" aria-label={text('linkedInvoices')}>
            <h3>{text('linkedInvoices')}</h3>
            {#each containingInvoices as linked (linked.id)}
              <article class="composer-record" data-containing-invoice={linked.id}>
                <strong
                  >{linked.number ??
                    `${text(['draft', 'approved'].includes(linked.state) ? 'draftLabel' : 'invoiceLabel')} · ${linked.id.slice(0, 8)}`}</strong
                >
                <p>
                  {text(
                    linked.state === 'draft'
                      ? 'linkedDraft'
                      : linked.state === 'approved'
                        ? 'linkedApproved'
                        : 'linkedIssued',
                  )}
                </p>
                <div class="composer-actions">
                  <a class="secondary-button" href={containingInvoiceHref(linked.id)}
                    >{text(
                      ['draft', 'approved'].includes(linked.state) ? 'viewDraft' : 'viewInvoice',
                    )}</a
                  >
                  {#if linked.state === 'draft'}
                    <a class="secondary-button" href={containingInvoiceHref(linked.id, true)}
                      >{text('editDraft')}</a
                    >
                  {/if}
                </div>
                {#if role === 'owner_admin' && ['draft', 'approved'].includes(linked.state)}
                  <details>
                    <summary>{text('discardDraft')}</summary>
                    <p>{text('discardExplanation')}</p>
                    <form
                      method="POST"
                      action={`${base}/app/billing?/deleteInvoice`}
                      onsubmit={(event) =>
                        saveRequirement(
                          event,
                          `${base}/app/billing?/deleteInvoice`,
                          text('draftDiscarded'),
                        )}
                    >
                      <input type="hidden" name="invoiceId" value={linked.id} />
                      <input type="hidden" name="version" value={linked.version} />
                      <label
                        >{text('discardReason')}<input
                          name="reason"
                          minlength="3"
                          maxlength="2000"
                          required
                          disabled={busy || formBusy || uncertainCreate}
                        /></label
                      >
                      <button
                        type="submit"
                        class="secondary-button"
                        disabled={busy || formBusy || uncertainCreate || !selectionCurrent}
                        >{text('discardConfirm')}</button
                      >
                    </form>
                  </details>
                {/if}
              </article>
            {/each}
          </section>
        {/if}
        <div class="composer-fields composer-filters">
          <label
            >{text('worker')}<select bind:value={worker} disabled={busy || formBusy}
              ><option value="">{text('allWorkers')}</option>{#each workers as [id, name]}<option
                  value={id}>{name}</option
                >{/each}</select
            ></label
          >
          <label
            >{text('state')}<select bind:value={stateFilter} disabled={busy || formBusy}
              >{#each ['all', 'pending', 'ready', 'billed'] as value}<option {value}
                  >{text(value as 'all' | 'pending' | 'ready' | 'billed')}</option
                >{/each}</select
            ></label
          >
        </div>
        <label
          >{text('type')}<select bind:value={typeFilter} disabled={busy || formBusy}
            ><option value="">{text('allTypes')}</option><option value="time"
              >{text('labor')}</option
            ><option value="expense">{text('expense')}</option></select
          ></label
        >
        <div class="composer-actions">
          <button
            type="button"
            class="secondary-button"
            onclick={selectVisible}
            disabled={busy || formBusy || !selectionCurrent || uncertainCreate}
            >{text('select')}</button
          ><button
            type="button"
            class="secondary-button"
            onclick={() => {
              selected = [];
              invalidateSelection();
            }}
            disabled={busy || formBusy || uncertainCreate}>{text('clear')}</button
          >
        </div>
        {#if loadedScope !== currentScope}<p role="status">{text('load')}</p>{/if}
        <div class="composer-records" aria-label={text('records')}>
          {#each visible as source (key(source))}
            <article class="composer-record" class:selected={selected.includes(key(source))}>
              <label class="composer-select"
                ><input
                  type="checkbox"
                  checked={selected.includes(key(source))}
                  onchange={(event) => toggle(source, event.currentTarget.checked)}
                  disabled={busy ||
                    formBusy ||
                    !selectionCurrent ||
                    reserved(source) ||
                    uncertainCreate}
                /><span
                  ><strong>{source.workerName}</strong><span
                    >{source.date} · {text(
                      source.type === 'time' ? 'labor' : 'expense',
                    )}{source.minutes != null
                      ? ` · ${Math.floor(source.minutes / 60)}h ${source.minutes % 60}min`
                      : ` · ${journeyMoney(source.amountMinor ?? '0', source.currency, locale)}`}</span
                  ><span>{source.summary}</span></span
                ></label
              >
              {#if source.selectedDependencies.length > 1}<small>{text('group')}</small>{/if}
              {#if source.type === 'time' && source.selectedDependencies.some((id) => !inventory!.sources.some((row) => row.type === 'time' && row.id === id))}<p
                  class="composer-blocker"
                >
                  {text('groupMissing')}
                </p>{/if}
              {#each source.blockers as reason}<p class="composer-blocker">
                  {reasonText(
                    reason.code,
                  )}{#if reason.code === 'source_already_reserved' && source.containingInvoice}
                    <a href={containingInvoiceHref(source.containingInvoice.id)}
                      >{text(
                        ['draft', 'approved'].includes(source.containingInvoice.state)
                          ? 'viewDraft'
                          : 'viewInvoice',
                      )}</a
                    >
                  {:else if !['pending_time_approval', 'pending_time_finance_review', 'pending_expense_approval', 'pending_expense_finance_review'].includes(reason.code)}
                    <a href={blockerHref(reason)}>{text('solve')}</a>{/if}
                </p>{/each}
              {#if source.type === 'expense' && source.classificationState === 'unclassified' && inventory.expensePolicies?.some((policy) => policy.sourceId === source.id && policy.available)}
                <p>
                  {text('clientExpense')}: {journeyMoney(
                    inventory.expensePolicies.find((policy) => policy.sourceId === source.id)
                      ?.clientRecoveryMinor ?? '0',
                    inventory.currency,
                    locale,
                  )}
                </p>
                <button
                  type="button"
                  class="secondary-button"
                  disabled={busy ||
                    formBusy ||
                    uncertainCreate ||
                    !selectionCurrent ||
                    inventory.issuing.issues.includes('canonical_legal_entity_revision_required')}
                  onclick={() => applyExpense(source)}>{text('applyExpense')}</button
                >
                {#if inventory.issuing.issues.includes('canonical_legal_entity_revision_required')}<p
                  >
                    {text('expenseIssuer')}
                  </p>{/if}
              {/if}
              {#if source.billingState === 'partially_billed'}<small
                  >{text('remaining')}: {journeyMoney(
                    source.remainingAmountMinor ?? '0',
                    source.remainingCurrency ?? source.currency,
                    locale,
                  )}</small
                >{:else if reserved(source)}<small
                  >{source.containingInvoice
                    ? text(
                        source.containingInvoice.state === 'draft'
                          ? 'linkedDraft'
                          : source.containingInvoice.state === 'approved'
                            ? 'linkedApproved'
                            : 'linkedIssued',
                      )
                    : text('billed')}</small
                >{:else if needsApproval(source)}<small>{text('pending')}</small
                >{:else if source.blockers.length === 0}<small>{text('ready')}</small>{/if}
            </article>
          {:else}<p>{inventory.sources.length ? text('filteredEmpty') : text('empty')}</p>
            {#if inventory.sources.length}<button
                type="button"
                class="secondary-button"
                onclick={() => {
                  worker = '';
                  stateFilter = 'all';
                  typeFilter = '';
                }}>{text('resetFilters')}</button
              >{/if}{/each}
        </div>
        <div class="composer-summary">
          <strong>{text('selected')}: {selectedSources.length}</strong>
          {#if hiddenSelected}<p>{text('hidden')}: {hiddenSelected}</p>{/if}
          {#if selectedSources.some((source) => source.selectedDependencies.length > 1)}<p>
              {text('selectionIncludes')}
            </p>{/if}
          {#each [...new Set(selectedSources.map((source) => source.workerId))] as workerId}<p>
              {selectedSources.find((source) => source.workerId === workerId)?.workerName} · {text(
                'labor',
              )}: {selectedSources
                .filter((source) => source.workerId === workerId && source.type === 'time')
                .reduce((sum, source) => sum + (source.minutes ?? 0), 0)} min · {text('expense')}: {selectedSources.filter(
                (source) => source.workerId === workerId && source.type === 'expense',
              ).length}
            </p>{/each}
          {#if pendingSelected.length}<p>{text('approveHelp')}</p>
            <button
              type="button"
              class="primary-button"
              onclick={() => command('approveSources')}
              disabled={busy || formBusy || !selectionCurrent || uncertainCreate}
              >{text('approve')} ({pendingSelected.length})</button
            >{/if}
          <button
            type="button"
            class="primary-button"
            onclick={() => command('preview')}
            disabled={busy ||
              formBusy ||
              !selectionCurrent ||
              selectedSources.length === 0 ||
              uncertainCreate}>{busy ? text('loading') : text('preview')}</button
          >
        </div>
        {#if preview}
          {#if preview.reasons.length}<div role="alert">
              <ul>
                {#each preview.reasons as reason}<li>
                    {reasonText(reason.code)} <a href={blockerHref(reason)}>{text('solve')}</a>
                  </li>{/each}
              </ul>
            </div>{/if}
          {#if preview.state === 'ready'}
            <SectionCard title={text('preview')} description={text('previewHelp')}>
              {#each preview.lines as line}<div class="composer-line">
                  <span>{line.description}</span><strong
                    >{journeyMoney(line.subtotalMinor, preview.currency, locale)}</strong
                  >
                </div>{/each}
              <dl>
                <div>
                  <dt>{text('subtotal')}</dt>
                  <dd>{journeyMoney(preview.subtotalMinor, preview.currency, locale)}</dd>
                </div>
                <div>
                  <dt>{text('tax')}</dt>
                  <dd>{journeyMoney(preview.taxMinor, preview.currency, locale)}</dd>
                </div>
                <div>
                  <dt>{text('total')}</dt>
                  <dd>{journeyMoney(preview.totalMinor, preview.currency, locale)}</dd>
                </div>
              </dl>
              <button
                type="button"
                class="primary-button"
                onclick={() => command('create')}
                disabled={busy ||
                  formBusy ||
                  !selectionCurrent ||
                  previewIdentity !== selectionIdentity() ||
                  uncertainCreate}>{busy ? text('loading') : text('save')}</button
              >
            </SectionCard>
          {/if}
        {/if}
      {/if}
      {#if invoice}
        <SectionCard
          title={invoice.state === 'loading'
            ? text('loading')
            : invoice.state === 'draft'
              ? text('draft')
              : invoice.state === 'approved'
                ? text('approved')
                : text('issued')}
        >
          <p>
            <strong>{invoice.number ?? invoice.id}</strong> · {journeyMoney(
              invoice.totalMinor,
              invoice.currency,
              locale,
            )}
          </p>
          <div class="composer-actions">
            <a
              class="secondary-button"
              href={`${base}/app/billing/invoices/${encodeURIComponent(invoice.id)}?lang=${locale}`}
              >{['draft', 'approved'].includes(invoice.state)
                ? text('open')
                : text('openIssued')}</a
            >
            {#if ['draft', 'approved'].includes(invoice.state)}<button
                type="button"
                class="primary-button"
                disabled={busy || formBusy || !!inventory?.issuing.issues.length}
                onclick={() => command('issueInvoice')}>{text('issue')}</button
              >
            {:else if invoice.state === 'loading'}<p role="status">{text('loading')}</p>
            {:else if invoice.pdfStatus === 'ready'}<a
                class="primary-button"
                href={`${base}/app/api/invoices/${encodeURIComponent(invoice.id)}/pdf`}
                download>{text('pdf')}</a
              >
            {:else}<p role="status">
                {invoice.pdfStatus === 'failed' ? text('pdfFailed') : text('pdfPending')}
              </p>{/if}
          </div>
          {#if invoice.state === 'draft'}<button
              type="button"
              class="secondary-button"
              disabled={busy || formBusy}
              onclick={() => command('refreshInvoice')}>{text('refresh')}</button
            >{/if}
          {#if !['draft', 'approved', 'loading'].includes(invoice.state)}<a
              class="secondary-button"
              href={`${base}/app/billing?project=${encodeURIComponent(currentProjectId)}&invoice=${encodeURIComponent(invoice.id)}&lang=${locale}#invoice-collections`}
              >{text('payments')}</a
            >{/if}
          <p>{text('issueHelp')}</p>
          <button
            type="button"
            class="secondary-button"
            disabled={busy || formBusy}
            onclick={() => {
              invoice = null;
              selected = [];
              uncertainCreate = false;
              invalidateSelection();
              void loadRecords();
            }}>{text('another')}</button
          >
        </SectionCard>
      {/if}
      {#if inventory?.issuing.issues.length && loadedScope === currentScope}
        <SectionCard title={text('missingIssue')} description={text('missingIssueHelp')}>
          {#if inventory.issuing.issues.includes('canonical_legal_entity_revision_required')}
            {#if inventory.issuing.revisions.length}
              <form
                class="composer-fields"
                onsubmit={(event) =>
                  saveRequirement(event, `${base}/app/finance?/assignProjectLegalEntity`)}
              >
                <fieldset disabled={busy || formBusy} class="composer-fields">
                  <h3>{text('issuer')}</h3>
                  <input type="hidden" name="projectId" value={currentProjectId} /><input
                    type="hidden"
                    name="idempotencyKey"
                    value={inventory.issuing.assignmentRequestKey}
                  />
                  <label
                    >{text('revision')}<select
                      name="legalEntityRevisionId"
                      bind:value={revision}
                      required
                      ><option value="">—</option
                      >{#each inventory.issuing.revisions as option}<option
                          value={option.revisionId}
                          >{option.legalName} · {option.effectiveFrom}{option.effectiveTo
                            ? ` → ${option.effectiveTo}`
                            : ''}</option
                        >{/each}</select
                    ></label
                  >
                  <label
                    >{text('start')}<input
                      name="effectiveFrom"
                      type="date"
                      bind:value={assignmentFrom}
                      required
                    /></label
                  ><label
                    >{text('issuerUntil')}<input
                      name="effectiveTo"
                      type="date"
                      bind:value={assignmentTo}
                    /></label
                  ><label
                    >{text('reason')}<input
                      name="reason"
                      minlength="5"
                      maxlength="500"
                      bind:value={assignmentReason}
                      required
                    /></label
                  >
                  <button type="submit" class="secondary-button" disabled={formBusy || busy}
                    >{text('assign')}</button
                  >
                </fieldset>
              </form>
            {:else}<p>{text('noRevision')}</p>
              <a
                class="secondary-button"
                href={`${base}/app/finance?view=commercial&project=${encodeURIComponent(currentProjectId)}&task=Project%20issuing%20authority&lang=${locale}#project-issuing-authority`}
                >{text('registerIssuer')}</a
              >{/if}
          {/if}
          {#if inventory.issuing.issues.includes('missing_accountant_approved_number_policy')}
            {#if inventory.issuing.canManageNumbering}
              <form
                class="composer-fields"
                onsubmit={(event) =>
                  saveRequirement(event, `${base}/app/billing?/createInvoiceNumberPolicy`)}
              >
                <fieldset disabled={busy || formBusy} class="composer-fields">
                  <h3>{text('numbering')}</h3>
                  <p>{text('numberingHelp')}</p>
                  <input
                    type="hidden"
                    name="legalEntityId"
                    value={inventory.issuing.legalEntityId}
                  />
                  <label
                    >{text('prefix')}<input
                      name="prefix"
                      maxlength="30"
                      bind:value={numberingPrefix}
                      required
                    /></label
                  ><label
                    >{text('digits')}<input
                      name="digits"
                      type="number"
                      min="4"
                      max="10"
                      bind:value={numberingDigits}
                      required
                    /></label
                  ><label
                    >{text('effective')}<input
                      name="effectiveFrom"
                      type="date"
                      bind:value={numberingFrom}
                      required
                    /></label
                  ><label
                    >{text('accountantDate')}<input
                      name="accountantApprovedAt"
                      type="datetime-local"
                      bind:value={accountantDate}
                      required
                    /></label
                  >
                  <button type="submit" class="secondary-button" disabled={formBusy || busy}
                    >{text('saveNumber')}</button
                  >
                </fieldset>
              </form>
            {:else}<p>{text('ownerNumber')}</p>{/if}
          {/if}
          {#each inventory.issuing.issues.filter((issue) => !['canonical_legal_entity_revision_required', 'missing_accountant_approved_number_policy'].includes(issue)) as issue}<p
            >
              {reasonText(issue)}
            </p>
            <a href={setupHref}>{text('setup')}</a>{/each}
        </SectionCard>
      {/if}
    {/if}
  </SectionCard>
</div>

<style>
  [data-invoice-composer] {
    min-width: 0;
  }
  .composer-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
    gap: 1rem;
    align-items: end;
    margin: 1rem 0;
  }
  fieldset.composer-fields {
    grid-column: 1 / -1;
    border: 0;
    padding: 0;
    min-width: 0;
  }
  .composer-fields > h3,
  .composer-fields > p {
    grid-column: 1 / -1;
    margin: 0;
  }
  label {
    display: grid;
    gap: 0.4rem;
    min-width: 0;
    font-weight: 600;
  }
  input,
  select {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 0.6rem;
    border: 1px solid var(--ja-line, #d8d8d2);
    border-radius: 0.5rem;
    background: var(--ja-white, #fff);
    color: var(--ja-ink, #222);
  }
  button,
  a.primary-button,
  a.secondary-button {
    min-height: 44px;
    white-space: normal;
    max-width: 100%;
    overflow-wrap: anywhere;
  }
  button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .composer-actions,
  .composer-summary {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 1rem 0;
  }
  .composer-summary p {
    width: 100%;
    margin: 0;
  }
  .composer-records {
    display: grid;
    gap: 0.7rem;
    margin: 1rem 0;
  }
  .composer-record {
    border: 1px solid var(--ja-line, #deded8);
    border-radius: 0.7rem;
    padding: 1rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .composer-record.selected {
    border-color: var(--ja-ink, #333);
    background: var(--ja-soft, #f6f6f0);
  }
  .composer-select {
    display: flex;
    align-items: flex-start;
    gap: 0.8rem;
    min-height: 44px;
    font-weight: 400;
  }
  .composer-select input {
    width: 22px;
    height: 22px;
    min-height: 22px;
    flex-shrink: 0;
    margin-top: 0.2rem;
  }
  .composer-select span {
    display: grid;
    gap: 0.2rem;
  }
  .composer-blocker {
    font-size: 0.9rem;
    padding-left: 1.9rem;
  }
  .composer-notice {
    padding: 0.8rem;
    border: 1px solid var(--ja-line, #deded8);
    border-radius: 0.5rem;
  }
  .composer-line,
  dl > div {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.7rem 0;
  }
  .composer-line strong,
  dd {
    margin: 0;
    white-space: nowrap;
  }
  @media (max-width: 600px) {
    .composer-fields {
      grid-template-columns: 1fr;
    }
    .composer-actions > a,
    .composer-actions > button,
    .composer-summary > button {
      width: 100%;
    }
    .composer-record {
      padding: 0.8rem;
    }
  }
</style>
