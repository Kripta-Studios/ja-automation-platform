<script lang="ts">
  /**
   * Owner "Rates": what we charge clients and what we pay people, in one place.
   * The "which rate applies" table is the server's commercial resolver output for
   * today. Saving creates a new dated rate through the audited finance commands;
   * old rates stay for history and are never edited or deleted.
   */
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import type { SubmitFunction } from '@sveltejs/kit';
  import type { Snippet } from 'svelte';
  import type { PortalLocale } from '../../portal-i18n';
  import type { RatePersonRow, RatesOverview } from '../money-overview-types';
  import { moneyText, type MoneyCopyKey } from '../money-copy';

  let {
    rates,
    locale = 'en',
    money,
    canEdit,
    advanced,
  }: {
    rates: RatesOverview;
    locale?: PortalLocale;
    money: (minor: unknown, currency?: string) => string;
    canEdit: boolean;
    advanced?: Snippet;
  } = $props();

  const t = (key: MoneyCopyKey, params: Record<string, string | number> = {}) =>
    moneyText(locale, key, params);

  let projectFilter = $state(
    (() => {
      const requested = $page.url.searchParams.get('project') ?? '';
      return rates.projects.some((project) => project.id === requested) ? requested : '';
    })(),
  );
  const people = $derived(
    rates.people.filter((row) => !projectFilter || row.projectId === projectFilter),
  );
  const projects = $derived(
    rates.projects.filter((project) => !projectFilter || project.id === projectFilter),
  );
  const history = $derived(
    rates.rules.filter(
      (rule) => !projectFilter || rule.projectId === projectFilter || !rule.projectId,
    ),
  );
  // Deep links into the detailed configuration (sub-navigation, problem remedies) open it.
  const advancedOpen =
    ($page.url.hash !== '' && $page.url.hash !== '#rates-people') ||
    ['task', 'asOf', 'category', 'policyPerson'].some((key) => $page.url.searchParams.has(key)) ||
    Boolean($page.form && ($page.form as { success?: boolean; rateSave?: unknown }).success === false && !($page.form as { rateSave?: unknown }).rateSave);
  const missingCount = $derived(people.filter((row) => !row.clientRateMinor).length);

  const unit = (basis: string | null) =>
    basis === 'daily' ? t('perDay') : basis === 'weekly' ? t('perWeek') : t('perHour');
  const sourceLabel = (source: string | null) =>
    source ? t(`src_${source}` as MoneyCopyKey) : '';
  const decimal = (minor: string | null) => {
    if (!minor) return '';
    const value = BigInt(minor);
    return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
  };
  const shortDate = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${value}T00:00:00Z`));

  /** Which inline form is open: `${kind}:${projectId}:${workerId}` */
  let editing = $state('');
  let busy = $state(false);
  let feedback = $state<{ key: string; ok: boolean; text: string } | null>(null);
  const formKey = (kind: 'client' | 'pay', projectId: string, workerId: string) =>
    `${kind}:${projectId}:${workerId}`;
  function open(kind: 'client' | 'pay', projectId: string, workerId: string) {
    const key = formKey(kind, projectId, workerId);
    editing = editing === key ? '' : key;
    feedback = null;
  }
  const personalCount = (projectId: string) =>
    rates.people.filter(
      (row) => row.projectId === projectId && row.clientSource && row.clientSource !== 'project_default',
    ).length;

  const submit =
    (key: string): SubmitFunction =>
    ({ formData }) => {
      busy = true;
      const date = String(formData.get('effectiveFrom') ?? '');
      return async ({ result, update }) => {
        busy = false;
        const data = (result.type === 'success' || result.type === 'failure' ? result.data : null) as
          | { rateSave?: { code: string; changed?: number } }
          | null;
        const save = data?.rateSave;
        if (result.type === 'success' && save?.code === 'saved') {
          await update({ reset: false });
          feedback = {
            key,
            ok: true,
            text: save.changed ? t('rateSaved', { date: shortDate(date) }) : t('rateUnchanged', { date: shortDate(date) }),
          };
          editing = '';
        } else {
          feedback = {
            key,
            ok: false,
            text: t((save ? `err_${save.code}` : 'err_failed') as MoneyCopyKey),
          };
        }
      };
    };
</script>

{#snippet rateForm(
  kind: 'client' | 'pay',
  projectId: string,
  workerId: string,
  currency: string,
  currentMinor: string | null,
  currentBasis: string | null,
  title: string,
)}
  {@const key = formKey(kind, projectId, workerId)}
  <form
    method="POST"
    action={kind === 'client' ? '?/saveClientRate' : '?/saveWorkerPay'}
    class="rates__form"
    use:enhance={submit(key)}
    data-rate-form={key}
  >
    <p class="rates__form-title">{title}</p>
    <input type="hidden" name="projectId" value={projectId} />
    <input type="hidden" name="workerId" value={workerId} />
    <div class="rates__fields">
      <label
        >{t('rateAmount')} ({currency})
        <input
          name="amount"
          inputmode="decimal"
          autocomplete="off"
          required
          value={decimal(currentMinor)}
          data-rate-amount
        /></label
      >
      <label
        >{t('unit')}
        <select name="basis" value={currentBasis === 'daily' ? 'daily' : 'hourly'}>
          <option value="hourly">{t('hour')}</option>
          <option value="daily">{t('day')}</option>
        </select></label
      >
      <label
        >{t('startsOn')}
        <input type="date" name="effectiveFrom" required value={rates.today} /></label
      >
    </div>
    {#if kind === 'client' && !workerId && personalCount(projectId) > 0}
      <label class="rates__check"
        ><input type="checkbox" name="applyToEveryone" checked />
        {t('applyEveryone', { count: personalCount(projectId) })}</label
      >
    {/if}
    {#if kind === 'pay'}
      <label class="rates__check"
        ><input type="checkbox" name="alsoCost" checked /> {t('alsoCost')}</label
      >
    {/if}
    {#if feedback && feedback.key === key && !feedback.ok}
      <p class="rates__error" role="alert">{feedback.text}</p>
    {/if}
    <div class="rates__form-actions">
      <button type="button" class="secondary-button" onclick={() => (editing = '')}
        >{t('cancel')}</button
      >
      <button type="submit" class="primary-button" disabled={busy} data-rate-save
        >{busy ? t('saving') : t('saveRate')}</button
      >
    </div>
  </form>
{/snippet}

<section class="rates" aria-labelledby="rates-title" data-rates>
  <header>
    <h2 id="rates-title" class="page-title-hidden">{t('ratesTitle')}</h2>
    <p class="rates__muted">{t('ratesIntro')}</p>
    {#if !canEdit}<p class="rates__note" data-rates-read-only>{t('readOnly')}</p>{/if}
  </header>

  <aside class="rates__explain" aria-label={t('whichRate')}>
    <strong>{t('whichRate')}</strong>
    <ol>
      <li><span class="rates__chip rates__chip--personal">{t('src_worker_project')}</span></li>
      <li><span class="rates__chip">{t('src_project_default')}</span></li>
    </ol>
    <p>{t('whichRateHelp')}</p>
  </aside>

  {#if feedback?.ok}
    <p class="rates__ok" role="status" data-rate-feedback>{feedback.text}</p>
  {/if}

  <label class="rates__filter"
    >{t('filterProject')}
    <select bind:value={projectFilter} data-rates-project-filter>
      <option value="">{t('allProjectsFilter')}</option>
      {#each rates.projects as project (project.id)}
        <option value={project.id}>{project.label}</option>
      {/each}
    </select></label
  >

  <section id="rates-people" aria-labelledby="rates-people-title" tabindex="-1">
    <h3 id="rates-people-title">
      {t('whichRate')}
      {#if missingCount > 0}<span class="rates__missing-count">{t('missingCount', { count: missingCount })}</span>{/if}
    </h3>
    {#each projects as project (project.id)}
      {@const members = people.filter((row) => row.projectId === project.id)}
      <article class="rates__project" data-rates-project={project.id}>
        <div class="rates__project-line">
          <div>
            <strong>{project.label}</strong>
            <small class="rates__muted">{project.clientName}</small>
          </div>
          <div class="rates__project-rate">
            <small class="rates__muted">{t('src_project_default')}:</small>
            {#if project.defaultRateMinor}
              <span
                >{money(project.defaultRateMinor, project.currency)}{unit(project.defaultRateBasis)}</span
              >
            {:else}
              <span class="rates__muted">{t('noProjectRate')}</span>
            {/if}
            {#if canEdit}
              <button
                type="button"
                class="secondary-button"
                onclick={() => open('client', project.id, '')}
                aria-expanded={editing === formKey('client', project.id, '')}
                data-rate-edit-project={project.id}
                >{project.defaultRateMinor ? t('edit') : t('setProjectRate')}</button
              >
            {/if}
          </div>
        </div>
        {#if editing === formKey('client', project.id, '')}
          {@render rateForm(
            'client',
            project.id,
            '',
            project.currency,
            project.defaultRateMinor,
            project.defaultRateBasis,
            `${t('chargeForm')} · ${t('everyone')}`,
          )}
        {/if}
        {#if members.length}
          <div class="rates__table-wrap">
            <table class="rates__table" data-rates-people>
              <thead>
                <tr>
                  <th scope="col">{t('person')}</th>
                  <th scope="col">{t('weCharge')}</th>
                  <th scope="col">{t('wePay')}</th>
                  <th scope="col">{t('laborCost')}</th>
                </tr>
              </thead>
              <tbody>
                {#each members as row (row.assignmentId)}
                  {@render personRow(row)}
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <p class="rates__muted">{t('noPeople')}</p>
        {/if}
      </article>
    {/each}
  </section>

  <details class="rates__history">
    <summary>{t('history')}</summary>
    <p class="rates__muted">{t('historyHelp')}</p>
    <div class="rates__table-wrap">
      <table class="rates__table rates__table--history" data-rates-history>
        <thead>
          <tr>
            <th scope="col">{t('kind')}</th>
            <th scope="col">{t('scope')}</th>
            <th scope="col">{t('rateAmount')}</th>
            <th scope="col">{t('startsOn')}</th>
            <th scope="col">{t('ends')}</th>
            <th scope="col">{t('status')}</th>
          </tr>
        </thead>
        <tbody>
          {#each history as rule (rule.kind + rule.id)}
            <tr class:rates__ended={rule.status === 'ended'}>
              <td data-label={t('kind')}>{t(`kind_${rule.kind}` as MoneyCopyKey)}</td>
              <td data-label={t('scope')}
                >{rule.workerName || t('allPeople')} · {rule.projectLabel || t('allProjects')}{rule.category
                  ? ` · ${rule.category}`
                  : ''}</td
              >
              <td data-label={t('rateAmount')}>{money(rule.rateMinor, rule.currency)}{unit(rule.basis)}</td>
              <td data-label={t('startsOn')}>{shortDate(rule.effectiveFrom)}</td>
              <td data-label={t('ends')}>{rule.effectiveTo ? shortDate(rule.effectiveTo) : '—'}</td>
              <td data-label={t('status')}>{t(rule.status)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </details>

  {#if advanced}
    <details class="rates__advanced" data-rates-advanced open={advancedOpen}>
      <summary
        ><strong>{t('advanced')}</strong>
        <small class="rates__muted">{t('advancedHelp')}</small></summary
      >
      {@render advanced()}
    </details>
  {/if}
</section>

{#snippet personRow(row: RatePersonRow)}
  <tr data-rate-person={row.assignmentId}>
    <th scope="row">
      <strong>{row.workerName}</strong>
          </th>
    <td data-label={t('weCharge')}>
      {#if row.clientRateMinor}
        <span class="rates__amount">{money(row.clientRateMinor, row.currency)}{unit(row.clientRateBasis)}</span>
        <span
          class="rates__chip"
          class:rates__chip--personal={row.clientSource !== 'project_default'}
          >{sourceLabel(row.clientSource)}</span
        >
      {:else}
        <span class="rates__chip rates__chip--missing" data-rate-missing>{t('missing')}</span>
      {/if}
      {#if canEdit}
        <button
          type="button"
          class={row.clientRateMinor ? 'link-button' : 'primary-button rates__set'}
          onclick={() => open('client', row.projectId, row.workerId)}
          aria-expanded={editing === formKey('client', row.projectId, row.workerId)}
          data-rate-edit-client={row.assignmentId}
          >{row.clientRateMinor ? t('edit') : t('setRate')}</button
        >
      {/if}
    </td>
    <td data-label={t('wePay')}>
      {#if row.payRateMinor || row.payType}
        {#if row.payType === 'PercentageOfEligibleClientLabor'}
          <span class="rates__amount">{t('payPercent')}</span>
        {:else}
          <span class="rates__amount"
            >{money(row.payRateMinor, row.currency)}{row.payType === 'FixedPerBillingPeriod'
              ? t('perPeriod')
              : row.payType === 'FixedProjectAmount'
                ? t('fixedProject')
                : unit(row.payType === 'Daily' ? 'daily' : 'hourly')}</span
          >
        {/if}
        <span class="rates__chip" class:rates__chip--personal={row.paySource !== 'worker_global'}
          >{sourceLabel(row.paySource)}</span
        >
      {:else}
        <span class="rates__chip rates__chip--missing">{t('missing')}</span>
      {/if}
      {#if canEdit}
        <button
          type="button"
          class={row.payRateMinor ? 'link-button' : 'primary-button rates__set'}
          onclick={() => open('pay', row.projectId, row.workerId)}
          aria-expanded={editing === formKey('pay', row.projectId, row.workerId)}
          data-rate-edit-pay={row.assignmentId}
          >{row.payRateMinor ? t('edit') : t('setRate')}</button
        >
      {/if}
    </td>
    <td data-label={t('laborCost')}>
      {row.costRateMinor ? `${money(row.costRateMinor, row.currency)}${t('perHour')}` : '—'}
    </td>
  </tr>
  {#if editing === formKey('client', row.projectId, row.workerId) || editing === formKey('pay', row.projectId, row.workerId)}
    {@const kind = editing.startsWith('client') ? 'client' : 'pay'}
    <tr class="rates__form-row">
      <td colspan="4">
        {@render rateForm(
          kind,
          row.projectId,
          row.workerId,
          row.currency,
          kind === 'client' ? row.clientRateMinor : row.payRateMinor,
          kind === 'client' ? row.clientRateBasis : row.payBasis,
          `${kind === 'client' ? t('chargeForm') : t('payForm')} · ${row.workerName} · ${row.projectName}`,
        )}
      </td>
    </tr>
  {/if}
{/snippet}

<style>
  /* The portal header already shows the page title. */
  .page-title-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .rates {
    display: grid;
    gap: 1.25rem;
    max-width: 82rem;
  }
  .rates h2 {
    margin: 0;
    font-size: clamp(1.6rem, 3vw, 2.1rem);
  }
  .rates h3 {
    margin: 0 0 0.6rem;
    font-size: 1.15rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
  }
  .rates__muted {
    color: var(--ja-steel, #5b6573);
    margin: 0.2rem 0 0;
    font-weight: 400;
  }
  .rates__note {
    margin: 0.5rem 0 0;
    font-weight: 600;
  }
  .rates__explain {
    border: 1px solid var(--ja-line, #d9dee5);
    border-radius: 12px;
    padding: 0.9rem 1.1rem;
    background: var(--ja-paper, #f7f8fa);
  }
  .rates__explain ol {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.6rem;
    margin: 0.6rem 0;
    padding-left: 1.2rem;
  }
  .rates__explain p {
    margin: 0;
    color: var(--ja-steel, #5b6573);
  }
  .rates__ok {
    margin: 0;
    padding: 0.7rem 1rem;
    border-radius: 10px;
    background: #ecfdf3;
    border: 1px solid #a6e2bf;
    font-weight: 600;
  }
  .rates__error {
    margin: 0;
    color: #b42318;
    font-weight: 600;
  }
  .rates__filter {
    display: grid;
    gap: 0.25rem;
    max-width: 28rem;
    font-weight: 600;
  }
  .rates__filter select,
  .rates__fields input,
  .rates__fields select {
    min-height: 44px;
    border: 1px solid var(--ja-control-border, #b8c0cc);
    border-radius: 8px;
    padding: 0 0.7rem;
    font: inherit;
    background: var(--ja-white, #fff);
  }
  .rates__missing-count {
    font-size: 0.85rem;
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    background: #fff4e5;
    color: #8a4b00;
  }
  .rates__table-wrap {
    overflow-x: auto;
  }
  .rates__table {
    width: 100%;
    border-collapse: collapse;
    background: var(--ja-white, #fff);
    border: 1px solid var(--ja-line, #d9dee5);
  }
  .rates__table th,
  .rates__table td {
    text-align: left;
    padding: 0.65rem 0.8rem;
    border-bottom: 1px solid var(--ja-line, #e5e8ee);
    vertical-align: top;
  }
  .rates__table thead th {
    font-size: 0.85rem;
    color: var(--ja-steel, #5b6573);
    font-weight: 600;
  }
  .rates__table tbody th {
    display: grid;
  }
  .rates__table td {
    font-variant-numeric: tabular-nums;
  }
  .rates__amount {
    font-weight: 700;
    margin-right: 0.35rem;
  }
  .rates__chip {
    display: inline-block;
    padding: 0.1rem 0.55rem;
    border-radius: 999px;
    font-size: 0.8rem;
    background: #eef1f5;
    color: #384150;
    margin-right: 0.35rem;
  }
  .rates__chip--personal {
    background: #e8f1fb;
    color: #0b4a8b;
  }
  .rates__chip--missing {
    background: #fdecea;
    color: #b42318;
    font-weight: 700;
  }
  .rates__table :global(.link-button) {
    background: none;
    border: 0;
    padding: 0.4rem 0.2rem;
    min-height: 36px;
    color: var(--ja-link, #0b5cad);
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
  }
  .rates__set {
    min-height: 40px;
    margin-top: 0.25rem;
  }
  .rates__form-row td {
    background: var(--ja-paper, #f7f8fa);
  }
  .rates__form {
    display: grid;
    gap: 0.7rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--ja-line, #d9dee5);
    border-radius: 12px;
    background: var(--ja-white, #fff);
    margin-top: 0.6rem;
  }
  .rates__form-title {
    margin: 0;
    font-weight: 700;
  }
  .rates__fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.6rem;
  }
  .rates__fields label {
    display: grid;
    gap: 0.25rem;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .rates__check {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    font-size: 0.92rem;
  }
  .rates__check input {
    width: 20px;
    height: 20px;
    margin-top: 0.1rem;
  }
  .rates__form-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  #rates-people {
    display: grid;
    gap: 0.9rem;
  }
  .rates__project {
    display: grid;
    gap: 0.7rem;
    border: 1px solid var(--ja-line, #d9dee5);
    border-radius: 12px;
    padding: 0.7rem 1rem;
    background: var(--ja-white, #fff);
  }
  .rates__project-line {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    justify-content: space-between;
    align-items: center;
  }
  .rates__project-line > div:first-child {
    display: grid;
  }
  .rates__project-rate {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .rates__project-rate > span {
    font-weight: 700;
  }
  .rates__history,
  .rates__advanced {
    border: 1px solid var(--ja-line, #d9dee5);
    border-radius: 12px;
    padding: 0.8rem 1rem;
    background: var(--ja-white, #fff);
  }
  .rates__history summary,
  .rates__advanced summary {
    cursor: pointer;
    min-height: 44px;
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.8rem;
    align-items: center;
    font-weight: 700;
  }
  .rates__ended td {
    color: var(--ja-steel, #5b6573);
  }
  @media (max-width: 760px) {
    .rates__table,
    .rates__table tbody,
    .rates__table tr,
    .rates__table th,
    .rates__table td {
      display: block;
      width: 100%;
      box-sizing: border-box;
    }
    .rates__table thead {
      display: none;
    }
    .rates__table {
      border: 0;
      background: none;
    }
    .rates__table tbody tr {
      border: 1px solid var(--ja-line, #d9dee5);
      border-radius: 12px;
      background: var(--ja-white, #fff);
      margin-bottom: 0.6rem;
      padding: 0.3rem 0;
    }
    .rates__table td,
    .rates__table th {
      border: 0;
      padding: 0.35rem 0.9rem;
    }
    .rates__table td::before {
      content: attr(data-label);
      display: block;
      font-size: 0.8rem;
      color: var(--ja-steel, #5b6573);
    }
    .rates__form-row td::before {
      content: none;
    }
    .rates__form-actions > * {
      flex: 1;
    }
  }
</style>
