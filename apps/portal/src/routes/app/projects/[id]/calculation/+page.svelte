<script lang="ts">
  import { minorDigitsFor } from '$lib/portal/payment-money';
  import DirectionIcon from '$lib/portal/ui/DirectionIcon.svelte';
  import { base } from '$app/paths';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount, tick } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import ProblemNotice from '$lib/portal/ui/ProblemNotice.svelte';
  import type { ProblemData } from '$lib/problem/contract';
  import type { PortalLocale } from '$lib/portal-i18n';
  import { decimalHoursFromMinutes } from '$lib/portal/minute-hours';
  import { translateControlledValue } from '$lib/i18n/controlled-values';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneText,
  } from '../../../standalone-locale';

  type Source = Record<string, unknown>;
  type Person = {
    workerId: string;
    workerName: string;
    actualMinutes: number;
    approvedMinutes: number;
    billableMinutes: number;
    customerRevenueMinor: string;
    workerCompensationMinor: string;
    internalCostMinor: string;
    expenseCostMinor: string;
    expenseRevenueMinor: string;
    approvedOperationalSources: number;
    invoicedSources: number;
    excludedSources: number;
    pendingSources: number;
    timeCount: number;
    expenseCount: number;
    timeByCategory: CategorySubtotal[];
    expensesByCategory: CategorySubtotal[];
    /** Source rows: only for the person opened on demand, a page at a time. */
    time: Source[];
    expenses: Source[];
  };
  type CategorySubtotal = {
    category: string;
    count: number;
    actualMinutes: number;
    billableMinutes: number;
    revenueMinor: string;
    costMinor: string;
  };
  type Issue = {
    code: string;
    sourceId: string | null;
    workerName: string | null;
    sourceKind: 'time' | 'expense' | 'person' | null;
    workDate: string | null;
    spentOn: string | null;
    description: string | null;
  };
  type Explanation = {
    project: { id: string; number: string; name: string; currency: string; billingModel: string };
    period: { start: string; end: string };
    billingRules: Array<{
      id: string;
      streamType: string;
      includeExpenses: boolean;
      cadenceType: string;
      effectiveFrom: string;
      effectiveTo: string | null;
      currency: string;
    }>;
    totals: Record<string, string | number | boolean>;
    dailyMinimumAdjustments: Source[];
    milestones: Source[];
    people: Person[];
    issues: Issue[];
    categories: CategorySubtotal[];
    selectedPersonId: string | null;
    sourceRowLimit: number;
  };

  let { data } = $props<{
    data: {
      explanation: Explanation | null;
      project: { id: string; number: string; name: string; currency: string };
      periodValues: { periodStart: string; periodEnd: string };
      periodProblem: ProblemData | null;
      user: { role?: string };
    };
  }>();
  const explanation = $derived(data.explanation);
  const project = $derived(data.project);
  const periodValues = $derived(data.periodValues);
  const periodProblem = $derived(data.periodProblem);
  let periodProblemContainer = $state<HTMLElement | undefined>(undefined);
  let localeOverride = $state<PortalLocale | null>(null);
  const locale = $derived(
    localeOverride ?? resolveStandaloneLocale($page.url.searchParams.get('lang')),
  );
  const t = (key: string, params?: Record<string, string | number>) =>
    standaloneText(locale, key, params);
  const category = (value: string) => translateControlledValue(locale, 'category', value);
  const issueMessages: Record<string, string> = {
    missing_client_rate: 'Client rate is missing for a source record.',
    missing_internal_cost: 'Internal cost is missing for a source record.',
    missing_compensation_rule: 'Worker compensation rule is missing for a source record.',
    missing_expense_finance_projection:
      'Expense finance projection is missing for a source record.',
    missing_expense_currency_conversion:
      'Expense currency conversion is missing for a source record.',
    missing_person_forecast_rate: 'A planned worker needs a rate before the forecast is complete.',
  };
  function issueDisplay(issue: Issue): string {
    return issue.sourceKind === 'time'
      ? `${issue.workerName ?? ''} · ${issue.workDate ?? ''}`
      : issue.sourceKind === 'expense'
        ? [issue.description, issue.workerName, issue.spentOn].filter(Boolean).join(' · ')
        : (issue.workerName ?? project.name);
  }
  function issueRemedy(issue: Issue): { label: string; href?: string } {
    if (data.user.role === 'auditor_read_only') return { label: t('Contact Finance or an owner') };
    const sourceId = String(issue.sourceId ?? '');
    if (
      issue.code === 'missing_expense_finance_projection' ||
      issue.code === 'missing_expense_currency_conversion'
    ) {
      if (issue.code === 'missing_expense_currency_conversion' && issue.sourceKind === 'expense')
        return {
          label: t('Review source expense'),
          href: `${base}/app/expenses/${encodeURIComponent(sourceId)}`,
        };
      return {
        label: t('Review expense classification'),
        href: `${base}/app/finance?view=economic&project=${encodeURIComponent(project.id)}&source=expenses#expense-classification`,
      };
    }
    const tasks: Record<string, string> = {
      missing_client_rate: 'Client labor rate',
      missing_internal_cost: 'Internal loaded cost',
      missing_compensation_rule: 'Worker compensation',
      missing_person_forecast_rate: 'Client labor rate',
    };
    const task = tasks[issue.code];
    if (!task) return { label: t('Contact Finance or an owner') };
    const query = new URLSearchParams({
      view: 'commercial',
      project: project.id,
      task,
      lang: locale,
    });
    if (sourceId && issue.sourceKind === 'time') query.set('sourceRecord', sourceId);
    return {
      label: `${t('Open finance configuration')}: ${t(task)}`,
      href: `${base}/app/finance?${query.toString()}#finance-configuration-task`,
    };
  }
  /** Configuration gaps grouped by kind: one collapsed line per kind. */
  const issueGroups = $derived.by(() => {
    const groups = new SvelteMap<string, Issue[]>();
    for (const issue of explanation?.issues ?? [])
      groups.set(issue.code, [...(groups.get(issue.code) ?? []), issue]);
    return [...groups.entries()].map(([code, issues]) => ({ code, issues }));
  });
  const ISSUES_SHOWN = 10;
  const PEOPLE_SHOWN = 10;
  let showAllPeople = $state(false);
  /** Ten people at a time (the opened person always stays visible). */
  const visiblePeople = $derived.by(() => {
    const people: Person[] = explanation?.people ?? [];
    return showAllPeople
      ? people
      : people.filter(
          (person, index) => index < PEOPLE_SHOWN || person.workerId === explanation?.selectedPersonId,
        );
  });
  let expandedIssueGroups = $state<Record<string, boolean>>({});
  const issueMessage = (code: string) => t(issueMessages[code] ?? code.replaceAll('_', ' '));
  /** Link that opens (or pages) one person's source rows; keeps period and language. */
  function personHref(workerId: string | null, rows?: number): string {
    const query = new URLSearchParams($page.url.searchParams);
    query.delete('person');
    query.delete('rows');
    if (workerId) query.set('person', workerId);
    if (workerId && rows) query.set('rows', String(rows));
    const anchor = workerId ? `#person-${encodeURIComponent(workerId)}` : '#people-calculation-title';
    return `${base}/app/projects/${encodeURIComponent(project.id)}/calculation?${query.toString()}${anchor}`;
  }
  onMount(() => {
    localeOverride = resolveStandaloneLocale($page.url.searchParams.get('lang'));
    persistStandaloneLocale(locale);
    applyStandaloneDocumentLocale(locale);
    if (periodProblem) recoverPeriodProblem();
  });
  $effect(() => applyStandaloneDocumentLocale(locale));

  function periodScrollKey(): string {
    return `ja.projectCalculation.periodScroll.${project.id}`;
  }

  function rememberPeriodScroll(): void {
    try {
      sessionStorage.setItem(
        periodScrollKey(),
        JSON.stringify({ top: window.scrollY, at: Date.now() }),
      );
    } catch {
      // Correction remains usable when session storage is unavailable.
    }
  }

  function restorePeriodScroll(): void {
    try {
      const key = periodScrollKey();
      const saved = sessionStorage.getItem(key);
      sessionStorage.removeItem(key);
      if (!saved) return;
      const position = JSON.parse(saved) as { top?: unknown; at?: unknown };
      if (
        typeof position.top === 'number' &&
        Number.isFinite(position.top) &&
        typeof position.at === 'number' &&
        Date.now() - position.at < 300_000
      )
        window.scrollTo({ top: Math.max(0, position.top), behavior: 'instant' });
    } catch {
      // Invalid browser state must not interrupt the correction form.
    }
  }

  let periodRecoveryGeneration = 0;
  function recoverPeriodProblem(): void {
    const container = periodProblemContainer;
    if (!periodProblem || !container) return;
    const generation = ++periodRecoveryGeneration;
    void tick().then(() =>
      setTimeout(
        () =>
          requestAnimationFrame(() => {
            if (generation !== periodRecoveryGeneration || !container.isConnected || !periodProblem)
              return;
            restorePeriodScroll();
            requestAnimationFrame(() => {
              if (
                generation !== periodRecoveryGeneration ||
                !container.isConnected ||
                !periodProblem
              )
                return;
              const notice = container.querySelector<HTMLElement>('[data-ui="problem-notice"]');
              if (!notice) return;
              notice.focus({ preventScroll: true });
              const bounds = notice.getBoundingClientRect();
              if (bounds.top < 80) window.scrollBy({ top: bounds.top - 80, behavior: 'instant' });
              else if (bounds.bottom > window.innerHeight - 24)
                window.scrollBy({
                  top: bounds.bottom - window.innerHeight + 24,
                  behavior: 'instant',
                });
            });
          }),
        0,
      ),
    );
  }
  $effect(() => {
    if (periodProblem && periodProblemContainer) recoverPeriodProblem();
  });
  afterNavigate(() => {
    if (periodProblem) recoverPeriodProblem();
  });

  function money(minor: unknown): string {
    const raw = String(minor ?? '').trim();
    if (!/^-?\d+$/u.test(raw)) return t('Unknown');
    const value = BigInt(raw);
    const negative = value < 0n;
    const absolute = negative ? -value : value;
    const digits = minorDigitsFor(String(project.currency));
    const scale = 10n ** BigInt(digits);
    const whole = absolute / scale;
    const fraction = (absolute % scale).toString().padStart(digits, '0');
    const regional = locale === 'es' ? 'es-ES' : locale === 'pt' ? 'pt-BR' : 'en-US';
    const separator = locale === 'en' ? '.' : ',';
    return `${negative ? '-' : ''}${project.currency} ${whole.toLocaleString(regional)}${digits ? `${separator}${fraction}` : ''}`;
  }

  function hours(minutes: unknown): string {
    const amount = decimalHoursFromMinutes(minutes);
    if (amount === '—') return t('Unknown');
    return `${amount.replace('.', locale === 'en' ? '.' : ',')} h`;
  }

  function stateLabel(value: unknown): string {
    const state = String(value ?? 'unknown');
    return state === 'approved_operational'
      ? t('Approved operational source')
      : state === 'invoiced'
        ? t('Already invoiced')
        : state === 'pending'
          ? t('Pending approval')
          : t('Excluded');
  }

  function sourceText(row: Source, key: string): string {
    const value = row[key];
    return value === null || value === undefined || String(value).trim() === ''
      ? '—'
      : String(value);
  }

  function sourceCalculationSummary(row: Source): string {
    const clientRate = sourceText(row, 'clientRateStatus');
    const payMethod = sourceText(row, 'compensationRuleType');
    const cost = sourceText(row, 'internalCostStatus');
    return t('Customer rate {clientRate} · worker pay {payMethod} · internal cost {cost}', {
      clientRate,
      payMethod: payMethod === '—' ? t('unavailable') : payMethod,
      cost,
    });
  }

  function expensePolicySummary(row: Source): string {
    const policy = row.expensePolicy;
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
      return row.expensePolicyRequired === true
        ? t('Required expense policy is unavailable')
        : t('No assignment expense policy selected');
    }
    const values = policy as Source;
    const workerReimbursement = sourceText(values, 'workerReimbursement');
    const clientRecovery = sourceText(values, 'clientRecovery');
    const markupBps = Number(values.markupBps);
    const markup = Number.isFinite(markupBps)
      ? t(' · customer markup {percent}%', {
          percent: (markupBps / 100).toLocaleString(
            locale === 'es' ? 'es-ES' : locale === 'pt' ? 'pt-BR' : 'en-US',
            { maximumFractionDigits: 2 },
          ),
        })
      : '';
    const effectiveFrom = sourceText(values, 'effectiveFrom');
    const effectiveTo = sourceText(values, 'effectiveTo');
    const version = sourceText(values, 'version');
    return t(
      'Policy v{version}: worker reimbursement {workerReimbursement} · customer recovery {clientRecovery}{markup} · effective {effectiveFrom}{ending}',
      {
        version,
        workerReimbursement,
        clientRecovery,
        markup,
        effectiveFrom,
        ending: effectiveTo === '—' ? t(' onward') : t(' to {dia}', { dia: effectiveTo }),
      },
    );
  }
</script>

<svelte:head><title>{t('How this project is calculated')}</title></svelte:head>

{#snippet categoryTable(rows: CategorySubtotal[], kind: 'time' | 'expense')}
  <table class="category-table">
    <thead>
      <tr>
        <th scope="col">{t('Category')}</th>
        <th scope="col">{t('Entries')}</th>
        {#if kind === 'time'}
          <th scope="col">{t('Recorded')}</th>
          <th scope="col">{t('Billable')}</th>
          <th scope="col">{t('Revenue')}</th>
        {:else}
          <th scope="col">{t('Revenue')}</th>
          <th scope="col">{t('Cost')}</th>
        {/if}
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.category)}
        <tr>
          <th scope="row">{category(row.category)}</th>
          <td>{row.count}</td>
          {#if kind === 'time'}
            <td>{hours(row.actualMinutes)}</td>
            <td>{hours(row.billableMinutes)}</td>
            <td>{money(row.revenueMinor)}</td>
          {:else}
            <td>{money(row.revenueMinor)}</td>
            <td>{money(row.costMinor)}</td>
          {/if}
        </tr>
      {/each}
    </tbody>
  </table>
{/snippet}

<main class="calculation-page" data-project-calculation-page>
  <a
    class="back-link"
    href={`${base}/app/finance?project=${encodeURIComponent(project.id)}&view=economic`}
  >
    <DirectionIcon direction="left" />
    {t('← Back to project finance').replace(/^←\s*/u, '')}
  </a>
  <header class="page-header">
    <p>{t('PROJECT FINANCE EXPLANATION')}</p>
    <h1>{t('How this project is calculated')}</h1>
    <span>{project.number} · {project.name}</span>
    {#if explanation}
      <p class="period">{explanation.period.start} {t('to')} {explanation.period.end}</p>
    {/if}
  </header>

  <section
    class="period-correction"
    data-project-calculation-period-problem={periodProblem ? '' : undefined}
    bind:this={periodProblemContainer}
    aria-label={t('problem.projectCalculation.periodFilter')}
  >
    {#if periodProblem}
      <ProblemNotice
        problem={periodProblem}
        remedyLinks={{ correct_field: { label: t('problem.remedy.correctField') } }}
      />
      <p>{t('problem.projectCalculation.periodNotApplied')}</p>
      {#if Object.keys(periodProblem.fieldErrors).length > 1}
        <ul class="period-error-links">
          {#each Object.keys(periodProblem.fieldErrors) as field}
            <li>
              <a href={'#calculation-' + field}
                >{t(field === 'periodStart' ? 'Period start' : 'Period end')}</a
              >
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
    <form
      method="GET"
      action={`${base}/app/projects/${encodeURIComponent(project.id)}/calculation`}
      class="period-form"
      data-project-calculation-period-form
      onsubmit={rememberPeriodScroll}
    >
      <input type="hidden" name="lang" value={locale} />
      <label for="calculation-periodStart">
        {t('Period start')}
        <input
          id="calculation-periodStart"
          name="periodStart"
          type={periodProblem ? 'text' : 'date'}
          inputmode={periodProblem ? 'numeric' : undefined}
          autocomplete="off"
          value={periodValues.periodStart}
          aria-invalid={Boolean(periodProblem?.fieldErrors.periodStart)}
          aria-describedby={periodProblem?.fieldErrors.periodStart
            ? 'calculation-periodStart-error'
            : undefined}
        />
        {#if periodProblem?.fieldErrors.periodStart}
          <small id="calculation-periodStart-error" class="field-error"
            >{t(periodProblem?.fieldErrors.periodStart[0])}</small
          >
        {/if}
      </label>
      <label for="calculation-periodEnd">
        {t('Period end')}
        <input
          id="calculation-periodEnd"
          name="periodEnd"
          type={periodProblem ? 'text' : 'date'}
          inputmode={periodProblem ? 'numeric' : undefined}
          autocomplete="off"
          value={periodValues.periodEnd}
          aria-invalid={Boolean(periodProblem?.fieldErrors.periodEnd)}
          aria-describedby={periodProblem?.fieldErrors.periodEnd
            ? 'calculation-periodEnd-error'
            : undefined}
        />
        {#if periodProblem?.fieldErrors.periodEnd}
          <small id="calculation-periodEnd-error" class="field-error"
            >{t(periodProblem?.fieldErrors.periodEnd[0])}</small
          >
        {/if}
      </label>
      <button type="submit">{t('problem.projectCalculation.reviewPeriod')}</button>
    </form>
  </section>
  {#if !periodProblem && explanation}

    <section class="totals" aria-label={t('Period totals')}>
      <article data-calculation-total="recorded">
        <span>{t('Recorded')}</span><strong>{hours(explanation.totals.actualMinutes)}</strong>
      </article>
      <article data-calculation-total="approved">
        <span>{t('Approved')}</span><strong>{hours(explanation.totals.approvedMinutes)}</strong>
      </article>
      <article data-calculation-total="billable">
        <span>{t('Billable')}</span><strong>{hours(explanation.totals.billableMinutes)}</strong>
      </article>
      <article data-calculation-total="operational-source-revenue">
        <span>{t('Operational source revenue')}</span><strong
          >{money(explanation.totals.operationalRevenueCandidateMinor)}</strong
        >
      </article>
      <article data-calculation-total="worker-compensation">
        <span>{t('Worker pay basis')}</span><strong
          >{money(explanation.totals.workerCompensationMinor)}</strong
        >
      </article>
      <article data-calculation-total="direct-cost">
        <span>{t('Direct cost')}</span><strong>{money(explanation.totals.approvedCostMinor)}</strong
        >
      </article>
      <article data-calculation-total="approved-unbilled">
        <span>{t('Approved, unbilled')}</span><strong
          >{money(explanation.totals.approvedUnbilledWipMinor)}</strong
        >
      </article>
      <article data-calculation-total="pending-wip">
        <span>{t('Pending WIP')}</span><strong
          >{money(explanation.totals.unapprovedWipMinor)}</strong
        >
      </article>
      <article data-calculation-total="invoiced">
        <span>{t('Invoiced')}</span><strong>{money(explanation.totals.invoicedMinor)}</strong>
      </article>
      <article data-calculation-total="paid">
        <span>{t('Paid')}</span><strong>{money(explanation.totals.paidMinor)}</strong>
      </article>
    </section>

    <section class="reconciliation" data-calculation-reconciliation>
      <div>
        <p>{t('Approved operational sources')}</p>
        <strong>{money(explanation.totals.sourceRevenueMinor)}</strong>
      </div>
      <div>
        <p>{t('Canonical operational revenue')}</p>
        <strong>{money(explanation.totals.operationalRevenueCandidateMinor)}</strong>
      </div>
      <div>
        <p>{t('Reconciliation')}</p>
        {#if explanation.totals.sourceRevenueReconcilesToOperationalCandidate}
          <strong class="ok">{t('Source rows reconcile exactly')}</strong>
        {:else}
          <strong class="warning"
            >{t('Needs review:')} {money(explanation.totals.candidateRevenueDiffMinor)}</strong
          >
        {/if}
      </div>
    </section>
    {#if explanation.totals.canonicalCandidateDiffFromOperationalMinor !== '0'}
      <p class="fixed-note">
        {t(
          'The project billing model changes the customer candidate from operational source revenue by',
        )}
        {money(explanation.totals.canonicalCandidateDiffFromOperationalMinor)}{t(
          '. This is expected for a configured fixed or all-in commercial model.',
        )}
      </p>
    {/if}

    <section class="notice" data-calculation-canonical-note>
      <strong>{t('These are the canonical project-finance results.')}</strong>
      <p>
        {t(
          'Amounts come from the same saved finance projection used by the project finance workspace. This screen explains its source rows and effective terms; it does not recalculate invoice amounts.',
        )}
      </p>
    </section>

    <section class="section-card" aria-labelledby="billing-configuration-title">
      <h2 id="billing-configuration-title">{t('Billing configuration in this period')}</h2>
      {#if explanation.billingRules.length}
        <ul class="rules">
          {#each explanation.billingRules as rule}
            <li>
              <strong
                >{rule.streamType === 'labor' && rule.includeExpenses
                  ? t('Time and expenses together')
                  : translateControlledValue(locale, 'billingStream', rule.streamType)}</strong
              >
              <span
                >{t(rule.cadenceType.replaceAll('_', ' '))} · {rule.currency}
                {t('· effective')}
                {rule.effectiveFrom}{rule.effectiveTo
                  ? t(' to {dia}', { dia: rule.effectiveTo })
                  : ''}</span
              >
            </li>
          {/each}
        </ul>
      {:else}
        <p class="unknown">{t('No active billing configuration covers this period.')}</p>
      {/if}
    </section>

    {#if issueGroups.length}
      <section class="issues" aria-label={t('Configuration issues')} data-calculation-issues>
        <h2>{t('Configuration that still needs attention')}</h2>
        {#each issueGroups as group (group.code)}
          {@const shown = expandedIssueGroups[group.code]
            ? group.issues
            : group.issues.slice(0, ISSUES_SHOWN)}
          <details class="group" data-calculation-issue-group={group.code}>
            <summary
              ><span>{issueMessage(group.code)}</span><span class="count">{group.issues.length}</span
              ></summary
            >
            <ul>
              {#each shown as issue, index (`${issue.sourceId ?? ''}-${index}`)}
                {@const remedy = issueRemedy(issue)}
                <li>
                  <span>{issueDisplay(issue)}</span>
                  {#if remedy.href}<a href={remedy.href}>{remedy.label}</a>
                  {:else}<span class="muted">{remedy.label}</span>{/if}
                </li>
              {/each}
            </ul>
            {#if group.issues.length > shown.length}
              <button
                type="button"
                class="link-button"
                onclick={() => (expandedIssueGroups[group.code] = true)}
                >{t('Show all ({n})', { n: group.issues.length })}</button
              >
            {/if}
          </details>
        {/each}
      </section>
    {/if}

    {#if explanation.categories?.length}
      <details class="section-card group" data-calculation-categories>
        <summary
          ><span>{t('Hours by category')}</span><span class="count"
            >{explanation.categories.length}</span
          ></summary
        >
        {@render categoryTable(explanation.categories, 'time')}
      </details>
    {/if}

    <section class="people-section" aria-labelledby="people-calculation-title">
      <div class="section-heading">
        <div>
          <p>{t('BY PERSON')}</p>
          <h2 id="people-calculation-title">{t('Recorded work and finance treatment')}</h2>
        </div>
        <span>{explanation.people.length} {t('people')}</span>
      </div>
      <p class="provenance-unavailable">
        {t(
          data.user.role === 'auditor_read_only'
            ? 'Rate-rule IDs and versions are not included in the canonical finance projection yet. Source rows below show the canonical configured/unavailable statuses and pay method; ask Finance or an owner to review future terms in Project billing setup.'
            : 'Rate-rule IDs and versions are not included in the canonical finance projection yet. Source rows below show the canonical configured/unavailable statuses and pay method; use Project billing setup to review or change future terms.',
        )}
      </p>
      <div class="people-list">
        {#each visiblePeople as person (person.workerId)}
          {@const isOpen = explanation.selectedPersonId === person.workerId}
          <details
            class="person"
            id={`person-${person.workerId}`}
            data-calculation-person={person.workerId}
            open={isOpen}
          >
            <summary class="person-row">
              <strong class="person-name">{person.workerName}</strong>
              <span class="person-hours"
                >{hours(person.actualMinutes)}
                {t('actual ·')}
                {hours(person.approvedMinutes)}
                {t('approved ·')}
                {hours(person.billableMinutes)}
                {t('billable')}</span
              >
              {#if person.pendingSources}<span class="pill warn"
                  >{person.pendingSources} {t('pending')}</span
                >{/if}
              <span class="person-revenue"
                >{money(person.customerRevenueMinor)} {t('customer revenue')}</span
              >
            </summary>
            <div class="person-body">
              <div class="person-totals">
                <span
                  >{t('Worker compensation')}
                  <strong>{money(person.workerCompensationMinor)}</strong></span
                >
                <span
                  >{t('Internal labor cost')}
                  <strong>{money(person.internalCostMinor)}</strong></span
                >
                <span
                  >{t('Expense recovery')} <strong>{money(person.expenseRevenueMinor)}</strong></span
                >
                <span>{t('Expense cost')} <strong>{money(person.expenseCostMinor)}</strong></span>
              </div>
              <div class="source-counts" aria-label={`Source state for ${person.workerName}`}>
                <span>{person.approvedOperationalSources} {t('approved operational')}</span><span
                  >{person.invoicedSources} {t('invoiced')}</span
                ><span>{person.pendingSources} {t('pending')}</span><span
                  >{person.excludedSources} {t('excluded')}</span
                >
              </div>
              {#if person.timeByCategory?.length}
                <h4>{t('Recorded time and calculation sources (')}{person.timeCount})</h4>
                {@render categoryTable(person.timeByCategory, 'time')}
              {/if}
              {#if person.expensesByCategory?.length}
                <h4>{t('Expenses and recovery sources (')}{person.expenseCount})</h4>
                {@render categoryTable(person.expensesByCategory, 'expense')}
              {/if}
              {#if !isOpen}
                {#if person.timeCount + person.expenseCount > 0}
                  <a class="source-link" href={personHref(person.workerId)} data-sveltekit-noscroll
                    >{t('Show source rows ({n})', {
                      n: person.timeCount + person.expenseCount,
                    })}</a
                  >
                {:else}
                  <p class="muted">{t('No time or expense source exists in this period.')}</p>
                {/if}
              {:else}
                {#if person.timeCount}
                  <h4>{t('Recorded time')} · {person.time.length} / {person.timeCount}</h4>
                  <div class="source-list" data-calculation-time-rows>
                    {#each person.time as row (String(row.id))}
                      <article>
                        <div>
                          <strong
                            >{sourceText(row, 'workDate')} · {category(
                              sourceText(row, 'category'),
                            )}</strong
                          ><span
                            >{hours(row.actualMinutes)}
                            {t('actual ·')}
                            {hours(row.billableMinutes)}
                            {t('billable ·')}
                            {stateLabel(row.sourceState)}</span
                          >
                          <span>{sourceCalculationSummary(row)}</span>
                        </div>
                        <div>
                          <strong>{money(row.clientRevenueMinor)}</strong>
                        </div>
                      </article>
                    {/each}
                  </div>
                {/if}
                {#if person.expenseCount}
                  <h4>{t('Expenses')} · {person.expenses.length} / {person.expenseCount}</h4>
                  <div class="source-list" data-calculation-expense-rows>
                    {#each person.expenses as row (String(row.id))}
                      <article>
                        <div>
                          <strong
                            >{sourceText(row, 'spentOn')} · {category(
                              sourceText(row, 'category'),
                            )}</strong
                          ><span>{t(sourceText(row, 'treatment'))} · {stateLabel(row.sourceState)}</span>
                          <span>{expensePolicySummary(row)}</span>
                        </div>
                        <div>
                          <strong>{money(row.revenueMinor)}</strong><span
                            >{t('Cost')} {money(row.costMinor)}</span
                          >
                          <span
                            >{t('Worker reimbursement')}
                            {money(row.reimbursementAmountMinor)} · {sourceText(
                              row,
                              'reimbursementState',
                            )}</span
                          >
                        </div>
                      </article>
                    {/each}
                  </div>
                {/if}
                <div class="source-actions">
                  {#if person.time.length < person.timeCount || person.expenses.length < person.expenseCount}
                    <a
                      class="source-link"
                      href={personHref(person.workerId, explanation.sourceRowLimit + 25)}
                      data-sveltekit-noscroll
                      data-calculation-show-more>{t('Show more')}</a
                    >
                  {/if}
                  <a class="source-link secondary" href={personHref(null)} data-sveltekit-noscroll
                    >{t('Hide source rows')}</a
                  >
                </div>
              {/if}
            </div>
          </details>
        {:else}<p class="empty">{t('No time or expense source exists in this period.')}</p>{/each}
      </div>
      {#if visiblePeople.length < explanation.people.length}
        <button
          type="button"
          class="link-button"
          data-calculation-show-all-people
          onclick={() => (showAllPeople = true)}
          >{t('Show all ({n})', { n: explanation.people.length })}</button
        >
      {/if}
    </section>

    {#if explanation.milestones.length}
      <section class="section-card" data-calculation-milestones>
        <h2>{t('Milestone sources')}</h2>
        <p>{t('Approved milestones are included only while they remain un-invoiced.')}</p>
        <div class="source-list">
          {#each explanation.milestones as milestone}
            <article>
              <div>
                <strong>{sourceText(milestone, 'dueOn')} {t('· milestone')}</strong>
                <span>{stateLabel(milestone.sourceState)}</span>
              </div>
              <div>
                <strong>{money(milestone.revenueMinor)}</strong>
                <span>{sourceText(milestone, 'formula')}</span>
              </div>
            </article>
          {/each}
        </div>
      </section>
    {/if}

    {#if explanation.dailyMinimumAdjustments.length}
      <section class="section-card" data-daily-minimum-adjustments>
        <h2>{t('Daily minimum adjustments')}</h2>
        <p>
          {t(
            'Each adjustment applies once per person and project day. It raises billable quantity only; it does not invent actual time.',
          )}
        </p>
        <ul class="rules">
          {#each explanation.dailyMinimumAdjustments as adjustment}<li>
              <strong
                >{sourceText(adjustment, 'workDate')} · {hours(adjustment.adjustmentMinutes)}
                {t('top-up')}</strong
              ><span>{money(adjustment.revenueMinor)} · {sourceText(adjustment, 'formula')}</span>
            </li>{/each}
        </ul>
      </section>
    {/if}
  {/if}
</main>

<style>
  .calculation-page {
    max-width: 1160px;
    margin: 0 auto;
    padding: clamp(1rem, 3vw, 2.5rem);
    color: #172033;
  }
  .back-link {
    color: #1c5d99;
    font-weight: 700;
    text-decoration: none;
  }
  .page-header {
    margin: 1.5rem 0;
  }
  .page-header p:first-child,
  .section-heading p {
    color: #56718f;
    font-size: 0.76rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    margin: 0 0 0.4rem;
  }
  h1,
  h2,
  p {
    margin-top: 0;
  }
  h1 {
    font-size: clamp(1.7rem, 4vw, 2.6rem);
    margin-bottom: 0.35rem;
  }
  h2 {
    font-size: clamp(1.2rem, 2.5vw, 1.6rem);
  }
  .period {
    color: #526379;
    margin-top: 0.35rem;
  }
  .period-correction {
    border: 1px solid #cdd9e6;
    border-radius: 14px;
    background: white;
    padding: clamp(1rem, 2vw, 1.4rem);
    box-shadow: 0 1px 3px rgb(18 43 70 / 7%);
  }
  .period-correction p {
    color: #40536c;
  }
  .period-error-links {
    margin: 0 0 1rem;
  }
  .period-error-links a {
    color: #1c5d99;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }
  .period-form {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    align-items: end;
  }
  .period-form label {
    display: grid;
    gap: 0.3rem;
    min-width: min(100%, 190px);
    flex: 1 1 190px;
    font-weight: 700;
  }
  .period-form input {
    width: 100%;
    min-height: 44px;
    padding: 0.5rem 0.65rem;
    border: 1px solid #8496aa;
    border-radius: 7px;
    font: inherit;
  }
  .period-form input[aria-invalid='true'] {
    border-color: #a40f18;
  }
  .period-form button {
    min-height: 44px;
    padding: 0.5rem 0.9rem;
    border: 0;
    border-radius: 7px;
    background: #1c5d99;
    color: white;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .field-error {
    color: #a40f18;
    font-weight: 600;
  }
  .notice,
  .section-card,
  .person,
  .issues,
  .reconciliation {
    border: 1px solid #cdd9e6;
    border-radius: 14px;
    background: white;
    padding: clamp(1rem, 2vw, 1.4rem);
    box-shadow: 0 1px 3px rgb(18 43 70 / 7%);
  }
  .notice {
    border-left: 5px solid #1c75bc;
    margin-bottom: 1rem;
  }
  .notice p {
    margin-bottom: 0;
    color: #40536c;
  }
  .totals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.8rem;
    margin: 1rem 0;
  }
  .totals article {
    padding: 1rem;
    border-radius: 12px;
    background: #eff6fc;
    min-height: 76px;
  }
  .totals span,
  .person-totals span {
    display: block;
    color: #526379;
    font-size: 0.86rem;
  }
  .totals strong {
    display: block;
    margin-top: 0.3rem;
    font-size: 1.12rem;
  }
  .reconciliation {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
    margin-bottom: 0.7rem;
  }
  .reconciliation p {
    color: #526379;
    font-size: 0.86rem;
    margin-bottom: 0.25rem;
  }
  .ok {
    color: #177047;
  }
  .warning,
  .unknown {
    color: #9a5700;
  }
  .fixed-note {
    color: #526379;
    margin: 0 0 1.3rem;
  }
  .section-card,
  .issues {
    margin: 1rem 0;
  }
  .rules {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.7rem;
  }
  .rules li {
    padding: 0.8rem;
    border-radius: 9px;
    background: #f6f8fa;
  }
  .rules strong,
  .rules span {
    display: block;
  }
  .rules span {
    color: #526379;
    font-size: 0.9rem;
    margin-top: 0.2rem;
  }
  .issues {
    background: #fff8eb;
    border-color: #e9c77f;
  }
  .issues ul {
    margin-bottom: 0;
  }
  .people-section {
    margin-top: 1.5rem;
  }
  .section-heading {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: end;
  }
  .section-heading > span {
    color: #526379;
  }
  .people-list {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.8rem;
  }
  details.person {
    margin: 0;
    padding: 0;
    border-top: 1px solid #cdd9e6;
  }
  .person-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 1rem;
    align-items: center;
    padding: 0.7rem 1rem;
    min-height: 52px;
  }
  .person-name {
    flex: 1 1 12rem;
  }
  .person-hours {
    color: #526379;
    font-weight: 400;
    font-size: 0.9rem;
  }
  .person-body {
    padding: 0 1rem 1rem;
  }
  .person-body h4 {
    margin: 1rem 0 0.4rem;
    font-size: 0.95rem;
  }
  .pill {
    border-radius: 999px;
    padding: 0.15rem 0.55rem;
    font-size: 0.8rem;
    font-weight: 700;
  }
  .pill.warn {
    background: #fff1d6;
    color: #8a4b00;
  }
  details.group > summary {
    justify-content: space-between;
    gap: 1rem;
  }
  .count {
    background: #edf1f5;
    border-radius: 999px;
    padding: 0.1rem 0.6rem;
    font-size: 0.85rem;
  }
  .issues details.group {
    border-top-color: #e9c77f;
  }
  .issues li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.8rem;
    padding: 0.25rem 0;
  }
  .muted {
    color: #526379;
  }
  .link-button {
    background: none;
    border: 0;
    color: #1c5d99;
    font: inherit;
    font-weight: 700;
    min-height: 44px;
    cursor: pointer;
    padding: 0;
  }
  .category-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  .category-table th,
  .category-table td {
    text-align: right;
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid #e4eaf0;
    white-space: nowrap;
  }
  .category-table th:first-child {
    text-align: left;
    white-space: normal;
  }
  .category-table thead th {
    color: #526379;
    font-weight: 700;
  }
  .source-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-top: 0.8rem;
  }
  .source-link {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    margin-top: 0.6rem;
    padding: 0 1rem;
    border-radius: 8px;
    background: #1c5d99;
    color: #fff;
    font-weight: 700;
    text-decoration: none;
  }
  .source-link.secondary {
    background: #fff;
    color: #1c5d99;
    border: 1px solid #b8c7d6;
  }
  .person-revenue {
    color: #172033;
    font-weight: 800;
    white-space: nowrap;
  }
  .person-totals {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.65rem;
    margin: 1rem 0;
  }
  .person-totals span {
    background: #f6f8fa;
    padding: 0.7rem;
    border-radius: 8px;
  }
  .person-totals strong {
    display: block;
    color: #172033;
    margin-top: 0.2rem;
  }
  .source-counts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .source-counts span {
    background: #edf1f5;
    border-radius: 999px;
    padding: 0.25rem 0.55rem;
    font-size: 0.8rem;
  }
  .provenance-unavailable {
    color: #526379;
    font-size: 0.88rem;
    line-height: 1.45;
    border-top: 1px solid #dce5ee;
    margin: 1rem 0 0;
    padding-top: 0.8rem;
  }
  details {
    margin-top: 0.8rem;
    border-top: 1px solid #dce5ee;
    padding-top: 0.8rem;
  }
  summary {
    cursor: pointer;
    font-weight: 700;
    min-height: 40px;
    display: flex;
    align-items: center;
  }
  .source-list {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.7rem;
  }
  .source-list article {
    background: #f7f9fb;
    border-radius: 8px;
    padding: 0.7rem;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }
  .source-list article div:last-child {
    text-align: right;
  }
  .source-list strong,
  .source-list span {
    display: block;
  }
  .source-list span {
    color: #526379;
    font-size: 0.86rem;
  }
  .empty {
    padding: 1rem;
    border: 1px dashed #aab9c8;
    border-radius: 10px;
    color: #526379;
  }
  @media (max-width: 768px) {
    .reconciliation {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .person-totals {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 480px) {
    .calculation-page {
      padding: 1rem;
    }
    .reconciliation,
    .person-totals {
      grid-template-columns: 1fr;
    }
    .source-list article {
      display: block;
    }
    .person-revenue {
      white-space: normal;
    }
    .category-table th,
    .category-table td {
      padding: 0.35rem 0.3rem;
      font-size: 0.82rem;
    }
    .source-list article div:last-child {
      text-align: left;
      margin-top: 0.45rem;
    }
  }
</style>
