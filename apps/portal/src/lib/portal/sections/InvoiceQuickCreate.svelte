<script module lang="ts">
  export type AdvancedScope = {
    projectId: string;
    billingRuleId: string;
    periodStart: string;
    periodEnd: string;
  };
</script>

<script lang="ts">
  /**
   * One screen to create an invoice: project → dates → amount → Create invoice.
   * The amount is the canonical draft engine's dry run (server); this component never
   * calculates money, it only formats the minor units it receives.
   */
  import { onDestroy, onMount } from 'svelte';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import {
    lastCompletePeriodForCadence,
    periodForCadence,
    type BillingCadence,
  } from '@ja/billing-engine';
  import type { PortalLocale } from '../../portal-i18n';
  import { journeyMoney } from '../project-invoice-journey';
  import { billingReadinessMessageKey, billingReadinessReviewPath } from '../billing-readiness';
  import {
    quickInvoiceText,
    quickInvoiceWarningText,
    type QuickInvoiceCopyKey,
  } from '../billing-quick-invoice-copy';

  type Stream = {
    id: string;
    streamType: string;
    cadence: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    anchorDate: string | null;
    monthlyCutoffDay: number | null;
    includeExpenses: boolean;
    currency: string;
    taxProfileName: string | null;
  };
  type Project = {
    id: string;
    number: string;
    name: string;
    status: string;
    client: string;
    currency: string;
    streams: Stream[];
    unbilledMinutes: number;
    unbilledFrom: string | null;
    lastInvoicedThrough: string | null;
  };
  type Warning = {
    code: string;
    severity: 'blocker' | 'excluded' | 'issue' | 'info';
    count: number;
    minutes: number;
    fix: string | null;
    message?: string;
  };
  type Group = {
    kind: 'labor' | 'expense' | 'fee';
    label: string;
    detail: string;
    minutes: number;
    unitPriceMinor: string | null;
    amountMinor: string;
    count: number;
  };
  type Preview = {
    state: 'ready' | 'blocked' | 'empty' | 'existing';
    stream: Stream | null;
    alternatives: Stream[];
    periodStart: string;
    periodEnd: string;
    mode: 'period' | 'selection';
    currency: string;
    groups: Group[];
    subtotalMinor: string;
    taxMinor: string;
    totalMinor: string;
    taxProfileName: string | null;
    taxes: Array<{ name: string; basisPoints: number }>;
    purchaseNo: string | null;
    dueDate: string | null;
    paymentTermsDays: number | null;
    provisionalNumber: string | null;
    warnings: Warning[];
    existingInvoice: { id: string; state: string; number: string | null } | null;
    suggestedPeriod: { start: string; end: string } | null;
    issuerLegalEntityId: string | null;
    openDrafts: Array<{
      id: string;
      state: string;
      periodStart: string;
      periodEnd: string;
      totalMinor: string;
    }>;
  };
  type PeriodChoice = { id: string; label: string; start: string; end: string };

  let {
    locale = 'en',
    role = '',
    initialProjectId = '',
    translate,
    onAdvancedRecords,
  }: {
    locale?: PortalLocale;
    role?: string;
    initialProjectId?: string;
    translate: (value: string) => string;
    onAdvancedRecords?: (scope: AdvancedScope) => void;
  } = $props();

  const t = (key: QuickInvoiceCopyKey) => quickInvoiceText(locale, key);
  const api = `${base}/app/api/billing/quick-invoice`;

  let projects = $state<Project[]>([]);
  let projectsLoading = $state(true);
  let projectsFailed = $state(false);
  let query = $state('');
  let projectId = $state('');
  let choosingProject = $state(true);
  let choiceId = $state('');
  let periodStart = $state('');
  let periodEnd = $state('');
  let streamOverride = $state('');
  let preview = $state<Preview | null>(null);
  let previewLoading = $state(false);
  let previewFailed = $state(false);
  let creating = $state(false);
  let createMessage = $state('');
  let requestKey = $state(newKey());
  let controller: AbortController | null = null;
  // Opening a project tries its default dates; when nothing is billable there but approved,
  // unbilled work exists elsewhere, jump to the suggested dates (at most a few times).
  let autoPeriod = false;
  let autoVisited: string[] = [];
  let autoAdjusted = $state(false);
  let debounce: ReturnType<typeof setTimeout> | undefined;

  function newKey(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  const today = new Date().toISOString().slice(0, 10);
  const project = $derived(projects.find((candidate) => candidate.id === projectId) ?? null);
  const filteredProjects = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? projects.filter((candidate) =>
          `${candidate.number} ${candidate.name} ${candidate.client}`
            .toLowerCase()
            .includes(needle),
        )
      : projects;
    return list.slice(0, 12);
  });

  /** The stream whose terms apply today (or the newest one); used for period choices only. */
  function currentStream(candidate: Project | null): Stream | null {
    if (!candidate?.streams.length) return null;
    const order: Record<string, number> = { labor: 0, milestone: 1, expense: 2 };
    return (
      [...candidate.streams].sort(
        (a, b) =>
          Number(b.effectiveFrom <= today && (!b.effectiveTo || b.effectiveTo >= today)) -
            Number(a.effectiveFrom <= today && (!a.effectiveTo || a.effectiveTo >= today)) ||
          (order[a.streamType] ?? 9) - (order[b.streamType] ?? 9) ||
          b.effectiveFrom.localeCompare(a.effectiveFrom),
      )[0] ?? null
    );
  }

  function shiftDate(date: string, days: number): string {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }
  function monthRange(offset: number): { start: string; end: string } {
    const now = new Date(`${today}T00:00:00Z`);
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0));
    return { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) };
  }

  const periodChoices = $derived.by((): PeriodChoice[] => {
    const stream = currentStream(project);
    const cadence = (stream?.cadence ?? 'manual') as BillingCadence;
    const options = {
      anchorDate: stream?.anchorDate ?? undefined,
      monthlyCutoffDay: stream?.monthlyCutoffDay ?? undefined,
    };
    const choices: PeriodChoice[] = [];
    try {
      if (cadence === 'weekly') {
        const current = periodForCadence('weekly', today, options)!;
        const last = periodForCadence('weekly', shiftDate(current.start, -1), options)!;
        choices.push({ id: 'last', label: t('lastWeek'), ...last });
        choices.push({ id: 'current', label: t('thisWeek'), ...current });
      } else if (['every_14_days', 'semi_monthly'].includes(cadence)) {
        const last = lastCompletePeriodForCadence(cadence, today, options);
        const current = periodForCadence(cadence, today, options);
        if (last) choices.push({ id: 'last', label: t('lastPeriod'), ...last });
        if (current) choices.push({ id: 'current', label: t('currentPeriod'), ...current });
      } else if (cadence === 'monthly') {
        const last = lastCompletePeriodForCadence(cadence, today, options);
        const current = periodForCadence(cadence, today, options);
        if (last) choices.push({ id: 'last', label: t('lastMonth'), ...last });
        if (current) choices.push({ id: 'current', label: t('thisMonth'), ...current });
      } else {
        // On-demand billing: everything since the last invoice, through today.
        const effectiveFrom = stream?.effectiveFrom ?? project?.unbilledFrom ?? today;
        const sinceStart = project?.lastInvoicedThrough
          ? shiftDate(project.lastInvoicedThrough, 1)
          : effectiveFrom;
        const start = sinceStart < effectiveFrom ? effectiveFrom : sinceStart;
        if (start <= today) choices.push({ id: 'since', label: t('sinceLast'), start, end: today });
        choices.push({ id: 'last', label: t('lastMonth'), ...monthRange(-1) });
        choices.push({ id: 'current', label: t('thisMonth'), ...monthRange(0) });
      }
    } catch {
      choices.push({ id: 'last', label: t('lastMonth'), ...monthRange(-1) });
      choices.push({ id: 'current', label: t('thisMonth'), ...monthRange(0) });
    }
    return choices;
  });

  function chooseProject(id: string): void {
    projectId = id;
    choosingProject = false;
    query = '';
    streamOverride = '';
    createMessage = '';
    const choice = periodChoices[0];
    if (choice) applyChoice(choice);
    else schedulePreview(0);
    autoPeriod = true;
    autoVisited = [];
  }

  function applyChoice(choice: PeriodChoice): void {
    autoPeriod = false;
    autoAdjusted = false;
    choiceId = choice.id;
    periodStart = choice.start;
    periodEnd = choice.end;
    schedulePreview(0);
  }

  function applyCustom(): void {
    autoPeriod = false;
    autoAdjusted = false;
    choiceId = 'custom';
    schedulePreview(400);
  }

  function useSuggested(range: { start: string; end: string }): void {
    autoPeriod = false;
    choiceId = 'custom';
    periodStart = range.start;
    periodEnd = range.end;
    schedulePreview(0);
  }

  function schedulePreview(delay: number): void {
    clearTimeout(debounce);
    debounce = setTimeout(() => void loadPreview(), delay);
  }

  async function loadPreview(): Promise<void> {
    if (!projectId || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd))
      return;
    if (periodEnd < periodStart) return;
    controller?.abort();
    const current = new AbortController();
    controller = current;
    previewLoading = true;
    previewFailed = false;
    const params = new URLSearchParams({ projectId, periodStart, periodEnd });
    if (streamOverride) params.set('billingRuleId', streamOverride);
    try {
      const response = await fetch(`${api}?${params}`, {
        signal: current.signal,
        headers: { accept: 'application/json' },
      });
      const body = (await response.json()) as { success?: boolean; preview?: Preview };
      if (controller !== current) return;
      if (!response.ok || !body.preview) throw new Error('preview failed');
      const suggested = body.preview.suggestedPeriod;
      if (autoPeriod && body.preview.state === 'empty' && suggested) {
        autoVisited.push(`${periodStart}:${periodEnd}`);
        const key = `${suggested.start}:${suggested.end}`;
        if (!autoVisited.includes(key) && autoVisited.length <= 3) {
          choiceId = 'custom';
          periodStart = suggested.start;
          periodEnd = suggested.end;
          autoAdjusted = true;
          controller = null;
          previewLoading = false;
          void loadPreview();
          return;
        }
      }
      if (body.preview.state !== 'empty') autoPeriod = false;
      preview = body.preview;
      requestKey = newKey();
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      if (controller === current) {
        previewFailed = true;
        preview = null;
      }
    } finally {
      if (controller === current) previewLoading = false;
    }
  }

  async function createInvoice(): Promise<void> {
    if (!preview || preview.state !== 'ready' || creating) return;
    creating = true;
    createMessage = '';
    try {
      const response = await fetch(api, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          projectId,
          periodStart,
          periodEnd,
          ...(streamOverride ? { billingRuleId: streamOverride } : {}),
          expectedTotalMinor: preview.totalMinor,
          requestKey,
        }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        invoiceId?: string;
        reason?: string;
        preview?: Preview;
      };
      if (body.ok && body.invoiceId) {
        await goto(
          `${base}/app/billing/invoices/${encodeURIComponent(body.invoiceId)}?lang=${locale}&created=1`,
        );
        return;
      }
      if (body.preview) {
        preview = body.preview;
        requestKey = newKey();
      }
      createMessage = body.reason === 'amount_changed' ? t('amountChanged') : t('createFailed');
    } catch {
      createMessage = t('createFailed');
    } finally {
      creating = false;
    }
  }

  const money = (minor: string | null | undefined) =>
    minor === null || minor === undefined ? '—' : journeyMoney(minor, preview?.currency ?? '', locale);
  const hours = (minutes: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(minutes / 60);
  const dateText = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
  };
  const rangeText = (start: string, end: string) => `${dateText(start)} – ${dateText(end)}`;
  const cadenceText = (cadence: string) =>
    (
      {
        weekly: t('cadence_weekly'),
        every_14_days: t('cadence_every_14_days'),
        semi_monthly: t('cadence_semi_monthly'),
        monthly: t('cadence_monthly'),
        milestone: t('cadence_milestone'),
      } as Record<string, string>
    )[cadence] ?? t('cadence_manual');
  const streamLabel = (stream: Stream) =>
    `${t(`stream_${stream.streamType}` as QuickInvoiceCopyKey) ?? stream.streamType} · ${cadenceText(stream.cadence)} · ${dateText(stream.effectiveFrom)} → ${stream.effectiveTo ? dateText(stream.effectiveTo) : '…'}`;

  function warningText(warning: Warning): string {
    return (
      quickInvoiceWarningText(locale, warning) ??
      warning.message ??
      translate(billingReadinessMessageKey(warning.code))
    );
  }

  function fixHref(warning: Warning): string | null {
    const portal = `${base}/app`;
    const project = encodeURIComponent(projectId);
    const period = preview ? { start: preview.periodStart, end: preview.periodEnd } : undefined;
    const lang = `lang=${locale}`;
    switch (warning.fix) {
      case 'time':
        return `${portal}${billingReadinessReviewPath(['pending_time_submission'], projectId, period)}&${lang}`;
      case 'approvals':
        return `${portal}${billingReadinessReviewPath(['pending_time_approval'], projectId, period)}&${lang}`;
      case 'finance_approvals':
        return `${portal}${billingReadinessReviewPath(['pending_time_finance_review'], projectId, period)}`;
      case 'expenses':
        return `${portal}${billingReadinessReviewPath(['pending_expense_approval'], projectId, period)}&${lang}`;
      case 'expense_classification':
        return `${portal}${billingReadinessReviewPath(['missing_expense_classification'], projectId, period)}`;
      case 'rates':
        return `${portal}/projects/${project}?tab=billing&billingStep=people&${lang}#project-person-conditions`;
      case 'finance':
        return `${portal}/finance?view=commercial&project=${project}&${lang}`;
      case 'issuer_authority':
        return `${portal}/finance?view=commercial&project=${project}&${lang}#project-issuing-authority`;
      case 'numbering':
        return role === 'owner_admin' && preview?.issuerLegalEntityId
          ? `${portal}/billing?view=setup&setup=numbering&numberingEntity=${encodeURIComponent(preview.issuerLegalEntityId)}&${lang}#billing-numbering-policy`
          : null;
      case 'issuer_settings':
        return preview?.issuerLegalEntityId
          ? `${portal}/billing?view=setup&issuerSettings=${encodeURIComponent(preview.issuerLegalEntityId)}&${lang}#issuer-document-settings`
          : null;
      case 'project_po':
        return `${portal}/projects/${project}?tab=overview&${lang}`;
      case 'signoff':
        return `${portal}/projects/${project}?tab=reports&${lang}#project-reports`;
      case 'billing_setup':
        return `${portal}/projects/${project}?tab=billing&${lang}#project-panel-billing`;
      case 'invoice':
        return preview?.openDrafts[0]
          ? `${portal}/billing/invoices/${encodeURIComponent(preview.openDrafts[0].id)}?${lang}`
          : null;
      default:
        return null;
    }
  }

  const blockers = $derived(preview?.warnings.filter((w) => w.severity === 'blocker') ?? []);
  const excluded = $derived(preview?.warnings.filter((w) => w.severity === 'excluded') ?? []);
  const issues = $derived(preview?.warnings.filter((w) => w.severity === 'issue') ?? []);
  const notes = $derived(preview?.warnings.filter((w) => w.severity === 'info') ?? []);
  const labor = $derived(preview?.groups.filter((g) => g.kind === 'labor') ?? []);
  const fees = $derived(preview?.groups.filter((g) => g.kind === 'fee') ?? []);
  const expenses = $derived(preview?.groups.filter((g) => g.kind === 'expense') ?? []);
  const datesAdjusted = $derived(
    Boolean(preview && (preview.periodStart !== periodStart || preview.periodEnd !== periodEnd)),
  );

  onMount(async () => {
    try {
      const response = await fetch(api, { headers: { accept: 'application/json' } });
      const body = (await response.json()) as { projects?: Project[] };
      if (!response.ok || !body.projects) throw new Error('projects failed');
      projects = body.projects;
      if (initialProjectId && projects.some((candidate) => candidate.id === initialProjectId))
        chooseProject(initialProjectId);
    } catch {
      projectsFailed = true;
    } finally {
      projectsLoading = false;
    }
  });
  onDestroy(() => {
    controller?.abort();
    clearTimeout(debounce);
  });
</script>

<div class="quick-invoice" data-quick-invoice>
  <p class="quick-invoice__intro">{t('intro')}</p>
  <div class="quick-invoice__layout">
    <div class="quick-invoice__inputs">
      <section class="quick-invoice__step" aria-labelledby="quick-invoice-project">
        <h3 id="quick-invoice-project">{t('stepProject')}</h3>
        {#if project && !choosingProject}
          <div class="quick-invoice__chosen" data-quick-invoice-project={project.id}>
            <div>
              <strong>{project.number} · {project.name}</strong>
              <span>{project.client} · {project.currency}</span>
            </div>
            <button
              type="button"
              class="secondary-button"
              onclick={() => {
                choosingProject = true;
              }}>{t('change')}</button
            >
          </div>
        {:else}
          <label class="quick-invoice__field">
            <span>{t('searchProject')}</span>
            <input
              type="search"
              bind:value={query}
              placeholder={t('searchPlaceholder')}
              autocomplete="off"
              data-quick-invoice-search
            />
          </label>
          {#if projectsLoading}
            <p class="quick-invoice__muted" role="status">{t('calculating')}</p>
          {:else if projectsFailed}
            <p role="alert">{t('previewFailed')}</p>
          {:else if filteredProjects.length === 0}
            <p class="quick-invoice__muted">{t('noProjects')}</p>
          {:else}
            <ul class="quick-invoice__projects" aria-label={t('searchProject')}>
              {#each filteredProjects as candidate (candidate.id)}
                <li>
                  <button
                    type="button"
                    class="quick-invoice__project"
                    aria-pressed={candidate.id === projectId}
                    onclick={() => chooseProject(candidate.id)}
                  >
                    <strong>{candidate.number} · {candidate.name}</strong>
                    <span
                      >{candidate.client} · {candidate.currency}{#if candidate.unbilledMinutes > 0}
                        · <b class="quick-invoice__unbilled"
                          >{hours(candidate.unbilledMinutes)} h {t('unbilled')}</b
                        >{/if}{#if !candidate.streams.length}
                        · <em>{t('noBillingSetup')}</em>{/if}</span
                    >
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      </section>

      {#if project && !choosingProject}
        <section class="quick-invoice__step" aria-labelledby="quick-invoice-period">
          <h3 id="quick-invoice-period">{t('stepPeriod')}</h3>
          <div class="quick-invoice__choices" role="group" aria-label={t('stepPeriod')}>
            {#each periodChoices as choice (choice.id)}
              <button
                type="button"
                class="quick-invoice__choice"
                aria-pressed={choiceId === choice.id}
                onclick={() => applyChoice(choice)}
              >
                <strong>{choice.label}</strong>
                <span>{rangeText(choice.start, choice.end)}</span>
              </button>
            {/each}
            <button
              type="button"
              class="quick-invoice__choice"
              aria-pressed={choiceId === 'custom'}
              onclick={() => (choiceId = 'custom')}
            >
              <strong>{t('custom')}</strong>
              <span>{choiceId === 'custom' ? rangeText(periodStart, periodEnd) : t('from') + ' / ' + t('to')}</span>
            </button>
          </div>
          {#if choiceId === 'custom'}
            <div class="quick-invoice__dates">
              <label class="quick-invoice__field">
                <span>{t('from')}</span>
                <input
                  type="date"
                  bind:value={periodStart}
                  oninput={applyCustom}
                  data-quick-invoice-from
                />
              </label>
              <label class="quick-invoice__field">
                <span>{t('to')}</span>
                <input
                  type="date"
                  bind:value={periodEnd}
                  min={periodStart}
                  oninput={applyCustom}
                  data-quick-invoice-to
                />
              </label>
            </div>
          {/if}
          {#if autoAdjusted && choiceId === 'custom'}
            <p class="quick-invoice__muted" data-quick-invoice-auto-dates>{t('autoDates')}</p>
          {/if}
          {#if currentStream(project)}
            <p class="quick-invoice__muted">{cadenceText(currentStream(project)!.cadence)}</p>
          {/if}
        </section>
      {/if}
    </div>

    {#if project && !choosingProject}
      <section
        class="quick-invoice__amount"
        aria-labelledby="quick-invoice-amount"
        aria-busy={previewLoading}
        data-quick-invoice-state={preview?.state ?? (previewLoading ? 'loading' : 'idle')}
      >
        <h3 id="quick-invoice-amount">{t('stepAmount')}</h3>
        {#if previewLoading && !preview}
          <p class="quick-invoice__muted" role="status">{t('calculating')}</p>
        {:else if previewFailed}
          <p role="alert">{t('previewFailed')}</p>
          <button type="button" class="secondary-button" onclick={() => schedulePreview(0)}
            >{t('retry')}</button
          >
        {:else if preview}
          <div class:quick-invoice__stale={previewLoading}>
            {#if datesAdjusted}
              <p class="quick-invoice__muted" data-quick-invoice-dates-used>
                {t('datesUsed')}: {rangeText(preview.periodStart, preview.periodEnd)}
              </p>
            {/if}

            {#if preview.state === 'ready'}
              <div class="quick-invoice__total" data-quick-invoice-total={preview.totalMinor}>
                <span>{t('amountHeading')}</span>
                <strong>{money(preview.totalMinor)}</strong>
              </div>
              <table class="quick-invoice__lines">
                <tbody>
                  {#if labor.length}
                    <tr class="quick-invoice__group-row"><th colspan="2">{t('hours')}</th></tr>
                    {#each labor as group, index (index)}
                      <tr>
                        <td>
                          <span class="quick-invoice__line-label">{group.label}</span>
                          <small
                            >{group.detail} · {hours(group.minutes)} h{#if group.unitPriceMinor}{' '}×
                              {money(group.unitPriceMinor)}{/if}</small
                          >
                        </td>
                        <td class="quick-invoice__money">{money(group.amountMinor)}</td>
                      </tr>
                    {/each}
                  {/if}
                  {#if fees.length}
                    <tr class="quick-invoice__group-row"><th colspan="2">{t('fees')}</th></tr>
                    {#each fees as group, index (index)}
                      <tr>
                        <td>
                          <span class="quick-invoice__line-label">{group.label}</span>
                          {#if group.count > 1 || group.minutes}<small
                              >{group.count}×{#if group.minutes}
                                · {hours(group.minutes)} h{/if}</small
                            >{/if}
                        </td>
                        <td class="quick-invoice__money">{money(group.amountMinor)}</td>
                      </tr>
                    {/each}
                  {/if}
                  {#if expenses.length}
                    <tr class="quick-invoice__group-row"><th colspan="2">{t('expenses')}</th></tr>
                    {#each expenses as group, index (index)}
                      <tr>
                        <td><span class="quick-invoice__line-label">{group.label}</span></td>
                        <td class="quick-invoice__money">{money(group.amountMinor)}</td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">{t('subtotal')}</th>
                    <td class="quick-invoice__money">{money(preview.subtotalMinor)}</td>
                  </tr>
                  <tr>
                    <th scope="row">{t('tax')} · {preview.taxProfileName ?? t('noTax')}</th
                    >
                    <td class="quick-invoice__money">{money(preview.taxMinor)}</td>
                  </tr>
                  <tr class="quick-invoice__grand">
                    <th scope="row">{t('total')}</th>
                    <td class="quick-invoice__money">{money(preview.totalMinor)}</td>
                  </tr>
                </tfoot>
              </table>
              <dl class="quick-invoice__facts">
                {#if preview.dueDate}
                  <div>
                    <dt>{t('due')}</dt>
                    <dd>
                      {dateText(preview.dueDate)}{#if preview.paymentTermsDays !== null}{' '}({preview.paymentTermsDays}
                        {t('days')}){/if}
                    </dd>
                  </div>
                {/if}
                <div>
                  <dt>{t('po')}</dt>
                  <dd>{preview.purchaseNo ?? '—'}</dd>
                </div>
                {#if preview.provisionalNumber}
                  <div>
                    <dt>{t('numberOnIssue')}</dt>
                    <dd>{preview.provisionalNumber}</dd>
                  </div>
                {/if}
              </dl>
            {:else if preview.state === 'existing' && preview.existingInvoice}
              <p class="quick-invoice__plain" role="status">{t('existing')}</p>
              <a
                class="primary-button"
                href={`${base}/app/billing/invoices/${encodeURIComponent(preview.existingInvoice.id)}?lang=${locale}`}
                >{t('openInvoice')}{#if preview.existingInvoice.number}
                  · {preview.existingInvoice.number}{/if}</a
              >
            {:else if preview.state === 'empty'}
              <p class="quick-invoice__plain" role="status" data-quick-invoice-nothing>
                {t('nothing')}
              </p>
              {#if preview.suggestedPeriod}
                <div class="quick-invoice__suggestion">
                  <span
                    >{t('suggested')}: {rangeText(
                      preview.suggestedPeriod.start,
                      preview.suggestedPeriod.end,
                    )}</span
                  >
                  <button
                    type="button"
                    class="secondary-button"
                    onclick={() => useSuggested(preview!.suggestedPeriod!)}
                    >{t('useDates')}</button
                  >
                </div>
              {/if}
            {:else if preview.state === 'blocked'}
              <p class="quick-invoice__plain" role="alert">{t('blocked')}</p>
            {/if}

            {#snippet warningList(list: Warning[], title: string, tone: string)}
              {#if list.length}
                <div class="quick-invoice__warnings quick-invoice__warnings--{tone}">
                  <h4>{title}</h4>
                  <ul>
                    {#each list as warning (warning.code)}
                      {@const href = fixHref(warning)}
                      <li data-quick-invoice-warning={warning.code}>
                        <span>{warningText(warning)}</span>
                        {#if href}
                          <a class="secondary-button" {href}
                            >{t(`fix_${warning.fix}` as QuickInvoiceCopyKey)}</a
                          >
                        {/if}
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
            {/snippet}
            {@render warningList(blockers, t('blocked'), 'danger')}
            {#if preview.mode === 'selection' && preview.state === 'ready' && excluded.length}
              <p class="quick-invoice__muted">{t('selectionNote')}</p>
            {/if}
            {@render warningList(excluded, t('leftOut'), 'warning')}
            {@render warningList(issues, t('beforeIssue'), 'warning')}
            {@render warningList(notes, t('notes'), 'info')}

            {#if preview.openDrafts.length}
              <div class="quick-invoice__warnings quick-invoice__warnings--info">
                <h4>{t('openDrafts')}</h4>
                <ul>
                  {#each preview.openDrafts as draft (draft.id)}
                    <li>
                      <span
                        >{t(draft.state === 'approved' ? 'approved' : 'draft')} · {rangeText(
                          draft.periodStart,
                          draft.periodEnd,
                        )} · {money(draft.totalMinor)}</span
                      >
                      <a
                        class="secondary-button"
                        href={`${base}/app/billing/invoices/${encodeURIComponent(draft.id)}?lang=${locale}`}
                        >{t('openInvoice')}</a
                      >
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        {/if}

        <details class="quick-invoice__advanced" data-quick-invoice-advanced>
          <summary>{t('advanced')}</summary>
          <p class="quick-invoice__muted">{t('advancedHelp')}</p>
          {#if project.streams.length > 1}
            <label class="quick-invoice__field">
              <span>{t('stream')}</span>
              <select bind:value={streamOverride} onchange={() => schedulePreview(0)}>
                <option value="">{t('streamAuto')}</option>
                {#each project.streams as stream (stream.id)}
                  <option value={stream.id}>{streamLabel(stream)}</option>
                {/each}
              </select>
            </label>
          {/if}
          <div class="quick-invoice__advanced-actions">
            {#if onAdvancedRecords && preview?.stream && ['labor', 'expense'].includes(preview.stream.streamType)}
              <button
                type="button"
                class="secondary-button"
                onclick={() =>
                  onAdvancedRecords?.({
                    projectId,
                    billingRuleId: preview!.stream!.id,
                    periodStart: preview!.periodStart,
                    periodEnd: preview!.periodEnd,
                  })}>{t('pickRecords')}</button
              >
            {/if}
            <a
              class="secondary-button"
              href={`${base}/app/projects/${encodeURIComponent(projectId)}?tab=billing&lang=${locale}#project-panel-billing`}
              >{t('streamSettings')}</a
            >
          </div>
        </details>
      </section>
    {/if}
  </div>

  {#if project && !choosingProject}
    <div class="quick-invoice__actionbar">
      {#if createMessage}
        <p class="quick-invoice__create-message" role="alert">{createMessage}</p>
      {/if}
      <div class="quick-invoice__actionbar-row">
        <div class="quick-invoice__actionbar-total">
          {#if preview?.state === 'ready'}
            <span>{t('total')}</span>
            <strong>{money(preview.totalMinor)}</strong>
          {:else}
            <span>{t('createHelp')}</span>
          {/if}
        </div>
        <button
          type="button"
          class="primary-button quick-invoice__create"
          disabled={!preview || preview.state !== 'ready' || previewLoading || creating}
          onclick={createInvoice}
          data-quick-invoice-create>{creating ? t('creating') : t('create')}</button
        >
      </div>
      {#if preview?.state === 'ready'}<p class="quick-invoice__muted">{t('createHelp')}</p>{/if}
    </div>
  {/if}
</div>

<style>
  .quick-invoice {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }
  .quick-invoice__intro {
    margin: 0;
    color: var(--ja-text-secondary, #57574f);
  }
  .quick-invoice__layout {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }
  @media (min-width: 900px) {
    .quick-invoice__layout {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
    }
  }
  .quick-invoice__inputs {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }
  .quick-invoice__step,
  .quick-invoice__amount {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
    padding: 1rem;
    border: 1px solid var(--ja-border-subdued, #e4e4df);
    border-radius: var(--ja-radius, 1rem);
    background: var(--ja-surface, #fff);
  }
  .quick-invoice h3 {
    margin: 0;
    font-size: 1rem;
  }
  .quick-invoice h4 {
    margin: 0 0 0.4rem;
    font-size: 0.85rem;
  }
  .quick-invoice__field {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }
  .quick-invoice__field span {
    font-weight: 700;
    font-size: 0.85rem;
  }
  .quick-invoice__field input,
  .quick-invoice__field select {
    width: 100%;
    min-height: 2.75rem;
    min-width: 0;
  }
  .quick-invoice__muted {
    margin: 0;
    color: var(--ja-text-muted, #6b6b62);
    font-size: 0.85rem;
  }
  .quick-invoice__plain {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
  }
  .quick-invoice__projects {
    display: grid;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 22rem;
    overflow-y: auto;
  }
  .quick-invoice__project,
  .quick-invoice__choice {
    display: grid !important;
    justify-items: start;
    gap: 0.15rem;
    width: 100%;
    padding: 0.65rem 0.8rem !important;
    border: 1px solid var(--ja-border-strong, #d1d1c9) !important;
    border-radius: 0.6rem !important;
    color: var(--ja-text-primary, #20201d) !important;
    background: var(--ja-surface, #fff) !important;
    box-shadow: none !important;
    text-align: left;
    font-size: 0.85rem !important;
    font-weight: 400 !important;
  }
  .quick-invoice__unbilled {
    color: var(--ja-text-primary, #20201d);
    font-weight: 700;
  }
  .quick-invoice__project span,
  .quick-invoice__choice span {
    color: var(--ja-text-secondary, #57574f);
    font-size: 0.8rem;
  }
  .quick-invoice__project[aria-pressed='true'],
  .quick-invoice__choice[aria-pressed='true'] {
    border-color: var(--ja-primary, #292925) !important;
    box-shadow: inset 0 0 0 1px var(--ja-primary, #292925) !important;
    background: var(--ja-surface-raised, #eeeee9) !important;
  }
  .quick-invoice__chosen {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .quick-invoice__chosen div {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .quick-invoice__chosen span {
    color: var(--ja-text-secondary, #57574f);
    font-size: 0.85rem;
  }
  .quick-invoice__choices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
    gap: 0.5rem;
  }
  .quick-invoice__dates {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.75rem;
  }
  .quick-invoice__stale {
    opacity: 0.55;
    transition: opacity 0.2s;
  }
  .quick-invoice__stale,
  .quick-invoice__amount > div {
    display: grid;
    gap: 0.85rem;
  }
  .quick-invoice__total {
    display: grid;
    gap: 0.1rem;
  }
  .quick-invoice__total span {
    color: var(--ja-text-secondary, #57574f);
    font-size: 0.85rem;
  }
  .quick-invoice__total strong {
    font-size: clamp(1.6rem, 5vw, 2.1rem);
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .quick-invoice__lines {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  .quick-invoice__lines td,
  .quick-invoice__lines th {
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--ja-border-subdued, #e4e4df);
    text-align: left;
    vertical-align: top;
  }
  .quick-invoice__lines td:first-child {
    display: grid;
    gap: 0.1rem;
    padding-right: 0.75rem;
  }
  .quick-invoice__lines small {
    color: var(--ja-text-muted, #6b6b62);
  }
  .quick-invoice__group-row th {
    padding-top: 0.75rem;
    color: var(--ja-text-secondary, #57574f);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .quick-invoice__line-label {
    overflow-wrap: anywhere;
  }
  .quick-invoice__money {
    text-align: right !important;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .quick-invoice__lines tfoot th {
    font-weight: 600;
  }
  .quick-invoice__grand th,
  .quick-invoice__grand td {
    border-bottom: 0;
    font-size: 1rem;
    font-weight: 800;
  }
  .quick-invoice__facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    margin: 0;
    font-size: 0.85rem;
  }
  .quick-invoice__facts dt {
    color: var(--ja-text-muted, #6b6b62);
  }
  .quick-invoice__facts dd {
    margin: 0;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .quick-invoice__warnings {
    padding: 0.75rem;
    border-radius: 0.6rem;
    border: 1px solid var(--ja-border-subdued, #e4e4df);
    background: var(--ja-canvas, #f4f4f2);
  }
  .quick-invoice__warnings--danger {
    border-color: color-mix(in srgb, var(--ja-status-danger, #dc2626) 45%, white);
    background: color-mix(in srgb, var(--ja-status-danger, #dc2626) 7%, white);
  }
  .quick-invoice__warnings--warning {
    border-color: color-mix(in srgb, var(--ja-status-warning, #d97706) 45%, white);
    background: color-mix(in srgb, var(--ja-status-warning, #d97706) 8%, white);
  }
  .quick-invoice__warnings ul {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .quick-invoice__warnings li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem 0.75rem;
    font-size: 0.85rem;
  }
  .quick-invoice__warnings li span {
    flex: 1 1 14rem;
    min-width: 0;
  }
  .quick-invoice__suggestion {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
  }
  .quick-invoice__advanced {
    border-top: 1px solid var(--ja-border-subdued, #e4e4df);
    padding-top: 0.6rem;
  }
  .quick-invoice__advanced summary {
    cursor: pointer;
    min-height: 2.75rem;
    display: flex;
    align-items: center;
    font-weight: 700;
    font-size: 0.85rem;
  }
  .quick-invoice__advanced[open] {
    display: grid;
    gap: 0.75rem;
  }
  .quick-invoice__advanced-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .quick-invoice__actionbar {
    position: sticky;
    bottom: 0;
    z-index: 2;
    display: grid;
    gap: 0.4rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--ja-border-strong, #d1d1c9);
    border-radius: var(--ja-radius, 1rem);
    background: var(--ja-surface, #fff);
    box-shadow: 0 -0.4rem 1.2rem rgb(25 25 20 / 0.08);
  }
  .quick-invoice__actionbar-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .quick-invoice__actionbar-total {
    display: grid;
    min-width: 0;
  }
  .quick-invoice__actionbar-total span {
    color: var(--ja-text-secondary, #57574f);
    font-size: 0.8rem;
  }
  .quick-invoice__actionbar-total strong {
    font-size: 1.25rem;
    font-variant-numeric: tabular-nums;
  }
  .quick-invoice__create {
    min-width: 12rem;
    font-size: 0.95rem !important;
  }
  .quick-invoice__create:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .quick-invoice__create-message {
    margin: 0;
    color: var(--ja-red, #b42318);
    font-weight: 700;
  }
  @media (max-width: 600px) {
    .quick-invoice__create {
      width: 100%;
    }
  }
</style>
