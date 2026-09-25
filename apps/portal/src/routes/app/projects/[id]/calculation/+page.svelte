<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import type { PortalLocale } from '$lib/portal-i18n';
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
    time: Source[];
    expenses: Source[];
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
    issues: Array<{ code: string; sourceId: string | null }>;
  };

  let { data } = $props<{ data: { explanation: Explanation; user: { role?: string } } }>();
  const explanation = $derived(data.explanation);
  let localeOverride = $state<PortalLocale | null>(null);
  const locale = $derived(
    localeOverride ?? resolveStandaloneLocale($page.url.searchParams.get('lang')),
  );
  const t = (key: string, params?: Record<string, string | number>) =>
    standaloneText(locale, key, params);
  const category = (value: string) => translateControlledValue(locale, 'category', value);
  onMount(() => {
    localeOverride = resolveStandaloneLocale($page.url.searchParams.get('lang'));
    persistStandaloneLocale(locale);
    applyStandaloneDocumentLocale(locale);
  });
  $effect(() => applyStandaloneDocumentLocale(locale));

  function money(minor: unknown): string {
    const raw = String(minor ?? '').trim();
    if (!/^-?\d+$/u.test(raw)) return t('Unknown');
    const value = BigInt(raw);
    const negative = value < 0n;
    const absolute = negative ? -value : value;
    const whole = absolute / 100n;
    const fraction = (absolute % 100n).toString().padStart(2, '0');
    const regional = locale === 'es' ? 'es-ES' : locale === 'pt' ? 'pt-BR' : 'en-US';
    const separator = locale === 'en' ? '.' : ',';
    return `${negative ? '-' : ''}${explanation.project.currency} ${whole.toLocaleString(regional)}${separator}${fraction}`;
  }

  function hours(minutes: unknown): string {
    const amount = Number(minutes);
    if (!Number.isFinite(amount)) return t('Unknown');
    return `${(amount / 60)
      .toFixed(2)
      .replace(/\.00$/u, '')
      .replace('.', locale === 'en' ? '.' : ',')} h`;
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

<main class="calculation-page" data-project-calculation-page>
  <a
    class="back-link"
    href={`${base}/app/finance?project=${encodeURIComponent(explanation.project.id)}&view=economic`}
  >
    {t('← Back to project finance')}
  </a>
  <header class="page-header">
    <p>{t('PROJECT FINANCE EXPLANATION')}</p>
    <h1>{t('How this project is calculated')}</h1>
    <span>{explanation.project.number} · {explanation.project.name}</span>
    <p class="period">{explanation.period.start} {t('to')} {explanation.period.end}</p>
  </header>

  <section class="notice" data-calculation-canonical-note>
    <strong>{t('These are the canonical project-finance results.')}</strong>
    <p>
      {t(
        'Amounts come from the same saved finance projection used by the project finance workspace. This screen explains its source rows and effective terms; it does not recalculate invoice amounts.',
      )}
    </p>
  </section>

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
      <span>{t('Direct cost')}</span><strong>{money(explanation.totals.approvedCostMinor)}</strong>
    </article>
    <article data-calculation-total="approved-unbilled">
      <span>{t('Approved, unbilled')}</span><strong
        >{money(explanation.totals.approvedUnbilledWipMinor)}</strong
      >
    </article>
    <article data-calculation-total="pending-wip">
      <span>{t('Pending WIP')}</span><strong>{money(explanation.totals.unapprovedWipMinor)}</strong>
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

  {#if explanation.issues.length}
    <section class="issues" aria-label={t('Configuration issues')}>
      <h2>{t('Configuration that still needs attention')}</h2>
      <ul>
        {#each explanation.issues as issue}<li>
            {t(issue.code.replaceAll('_', ' '))}{issue.sourceId
              ? t(' · source {id}', { id: issue.sourceId })
              : ''}
          </li>{/each}
      </ul>
    </section>
  {/if}

  <section class="people-section" aria-labelledby="people-calculation-title">
    <div class="section-heading">
      <div>
        <p>{t('BY PERSON')}</p>
        <h2 id="people-calculation-title">{t('Recorded work and finance treatment')}</h2>
      </div>
      <span>{explanation.people.length} {t('people')}</span>
    </div>
    {#each explanation.people as person}
      <article class="person" data-calculation-person={person.workerId}>
        <header>
          <div>
            <h3>{person.workerName}</h3>
            <span
              >{hours(person.actualMinutes)}
              {t('actual ·')}
              {hours(person.approvedMinutes)}
              {t('approved ·')}
              {hours(person.billableMinutes)}
              {t('billable')}</span
            >
          </div>
          <span class="person-revenue"
            >{money(person.customerRevenueMinor)} {t('customer revenue')}</span
          >
        </header>
        <div class="person-totals">
          <span
            >{t('Worker compensation')}
            <strong>{money(person.workerCompensationMinor)}</strong></span
          >
          <span>{t('Internal labor cost')} <strong>{money(person.internalCostMinor)}</strong></span>
          <span>{t('Expense recovery')} <strong>{money(person.expenseRevenueMinor)}</strong></span>
          <span>{t('Expense cost')} <strong>{money(person.expenseCostMinor)}</strong></span>
        </div>
        <div class="source-counts" aria-label={`Source state for ${person.workerName}`}>
          <span>{person.approvedOperationalSources} {t('approved operational')}</span><span
            >{person.invoicedSources} {t('invoiced')}</span
          ><span>{person.pendingSources} {t('pending')}</span><span
            >{person.excludedSources} {t('excluded')}</span
          >
        </div>
        <p class="provenance-unavailable">
          {t(
            'Rate-rule IDs and versions are not included in the canonical finance projection yet. Source rows below show the canonical configured/unavailable statuses and pay method; use Project billing setup to review or change future terms.',
          )}
        </p>
        <details>
          <summary>{t('Recorded time and calculation sources (')}{person.time.length})</summary>
          <div class="source-list">
            {#each person.time as row}
              <article>
                <div>
                  <strong
                    >{sourceText(row, 'workDate')} · {category(sourceText(row, 'category'))}</strong
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
                  <strong>{money(row.clientRevenueMinor)}</strong><span
                    >{sourceText(row, 'formula')}</span
                  >
                </div>
              </article>
            {:else}<p>{t('No time source in this period.')}</p>{/each}
          </div>
        </details>
        <details>
          <summary>{t('Expenses and recovery sources (')}{person.expenses.length})</summary>
          <div class="source-list">
            {#each person.expenses as row}
              <article>
                <div>
                  <strong
                    >{sourceText(row, 'spentOn')} · {category(sourceText(row, 'category'))}</strong
                  ><span>{t(sourceText(row, 'treatment'))} · {stateLabel(row.sourceState)}</span>
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
                  <span>{expensePolicySummary(row)}</span>
                </div>
              </article>
            {:else}<p>{t('No expense source in this period.')}</p>{/each}
          </div>
        </details>
      </article>
    {:else}<p class="empty">{t('No time or expense source exists in this period.')}</p>{/each}
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
  h3,
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
  .person {
    margin-top: 1rem;
  }
  .person header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: start;
  }
  .person h3 {
    margin-bottom: 0.25rem;
  }
  .person header span {
    color: #526379;
  }
  .person-revenue {
    color: #172033 !important;
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
    .person header,
    .source-list article {
      display: block;
    }
    .person-revenue {
      display: block;
      margin-top: 0.6rem;
    }
    .source-list article div:last-child {
      text-align: left;
      margin-top: 0.45rem;
    }
  }
</style>
