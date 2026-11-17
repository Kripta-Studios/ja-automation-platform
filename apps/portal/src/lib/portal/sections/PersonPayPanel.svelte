<script lang="ts">
  import { CURRENCIES } from '$lib/portal/currencies';
  /**
   * Person page → Pay (Owner only; the server sends pay rules only to the
   * Owner for the viewed person). Default rates are set once for all projects
   * and inherited by new assignments; project rules are listed read-only.
   */
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { base } from '$app/paths';
  import type { SubmitFunction } from '@sveltejs/kit';
  import type { PortalRow } from '../portal-data';
  import { paymentMoney } from '../payment-money';
  import { projectPickLabel } from '../project-ux-round3-copy';
  import { teamCopy, type TeamCopyKey } from '../team-ux-copy';

  let {
    personId,
    rules,
    locale,
    today,
  }: { personId: string; rules: PortalRow[]; locale: string; today: string } = $props();

  const c = (key: TeamCopyKey, params: Record<string, string | number> = {}) =>
    teamCopy(locale, key, params);
  const text = (row: PortalRow, key: string) => String(row[key] ?? '').trim();
  const lang = $derived(locale.startsWith('es') ? 'es-ES' : locale.startsWith('pt') ? 'pt-BR' : 'en-US');
  const money = (row: PortalRow) => paymentMoney(row.rate_minor, text(row, 'currency') || 'USD', lang);
  const isCurrent = (row: PortalRow) => !text(row, 'effective_to') || text(row, 'effective_to') >= today;
  const basisLabel = (row: PortalRow) => (text(row, 'rate_basis') === 'daily' ? c('perDay') : c('perHour'));

  const defaults = $derived(rules.filter((row) => !text(row, 'project_id') && isCurrent(row)));
  const projectRules = $derived(rules.filter((row) => text(row, 'project_id') && isCurrent(row)));

  let editing = $state(false);
  let currency = $state('USD');
  let cost = $state('');
  let pay = $state('');
  let basis = $state<'hourly' | 'daily'>('hourly');
  let effectiveFrom = $state('');
  $effect(() => {
    if (!effectiveFrom) effectiveFrom = today;
  });
  let status = $state<'idle' | 'saving' | 'done' | 'error'>('idle');
  let message = $state('');

  const submit: SubmitFunction = () => {
    status = 'saving';
    return async ({ result }) => {
      if (result.type === 'success') {
        status = 'done';
        message = c('paySaved');
        editing = false;
        cost = '';
        pay = '';
        await invalidateAll();
      } else {
        status = 'error';
        const data = (result.type === 'failure' ? result.data : null) as { message?: string } | null;
        message = c('failed', { message: data?.message ?? '' });
      }
    };
  };
</script>

<div class="person-pay" data-person-pay>
  <p class="pay-muted">{c('payIntro')}</p>
  {#if message}
    <p class="pay-message" class:pay-message--error={status === 'error'} role="status">{message}</p>
  {/if}

  <section aria-labelledby="pay-defaults">
    <h3 id="pay-defaults">{c('payDefaults')}</h3>
    {#if defaults.length === 0}
      <p class="pay-muted">{c('payNoDefaults')}</p>
    {:else}
      <ul class="pay-list">
        {#each defaults as row (text(row, 'id'))}
          <li>
            <strong>{money(row)} {basisLabel(row)}</strong>
            <small>{c('payAllProjects')} · {c('payFrom', { date: text(row, 'effective_from') })}</small>
          </li>
        {/each}
      </ul>
    {/if}
    {#if !editing}
      <button type="button" class="secondary-button" onclick={() => (editing = true)} data-pay-edit
        >{defaults.length ? c('payEdit') : c('paySet')}</button
      >
    {:else}
      <form method="POST" action="?view=team&/setPersonDefaultRates" use:enhance={submit} class="pay-form">
        <input type="hidden" name="workerId" value={personId} />
        <label
          >{c('payCurrency')}<select name="currency" bind:value={currency}>
            {#each CURRENCIES as code (code)}<option value={code}>{code}</option>{/each}
          </select></label
        >
        <label
          >{c('internalCost')}<input
            name="internalCostHourlyRate"
            inputmode="decimal"
            placeholder="0.00"
            bind:value={cost}
            required
          /></label
        >
        <label
          >{c('payRate')}<input name="compensationRate" inputmode="decimal" placeholder="0.00" bind:value={pay} required /></label
        >
        <label
          >{c('payBasis')}<select name="compensationBasis" bind:value={basis}>
            <option value="hourly">{c('perHour')}</option>
            <option value="daily">{c('perDay')}</option>
          </select></label
        >
        <label>{c('payEffective')}<input type="date" name="effectiveFrom" bind:value={effectiveFrom} required /></label>
        <div class="pay-actions">
          <button type="button" class="secondary-button" onclick={() => (editing = false)}>{c('cancel')}</button>
          <button type="submit" class="primary-button" disabled={status === 'saving'}>{c('paySave')}</button>
        </div>
      </form>
    {/if}
  </section>

  {#if projectRules.length}
    <section aria-labelledby="pay-projects">
      <h3 id="pay-projects">{c('payProjectRates')}</h3>
      <ul class="pay-list">
        {#each projectRules as row (text(row, 'id'))}
          <li>
            <span>{projectPickLabel({ project_number: row.project_number, name: row.project_name })}</span>
            <strong>{money(row)} {basisLabel(row)}</strong>
            <small
              >{c('payFrom', { date: text(row, 'effective_from') })}{text(row, 'effective_to')
                ? ` · ${c('payUntil', { date: text(row, 'effective_to') })}`
                : ''}</small
            >
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <div class="pay-links">
    <a class="primary-button" href={`${base}/app/manage/worker-pay?worker=${encodeURIComponent(personId)}`}
      >{c('payStatement')}</a
    >
    <a href={`${base}/app/finance?view=commercial`}>{c('payAdvanced')}</a>
  </div>
</div>

<style>
  .person-pay {
    display: grid;
    gap: 1rem;
  }
  h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }
  .pay-muted {
    margin: 0;
    color: var(--portal-muted, #5b6670);
  }
  .pay-message {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border-radius: 0.5rem;
    background: #eaf6ee;
    color: #17562f;
  }
  .pay-message--error {
    background: #fdecec;
    color: #8a1c1c;
  }
  .pay-list {
    list-style: none;
    padding: 0;
    margin: 0 0 0.75rem;
    display: grid;
    gap: 0.5rem;
  }
  .pay-list li {
    display: grid;
    gap: 0.15rem;
    border: 1px solid var(--portal-border, #e3e8ec);
    border-radius: 0.6rem;
    padding: 0.6rem 0.75rem;
  }
  .pay-list small {
    color: var(--portal-muted, #5b6670);
  }
  .pay-form {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: 0.75rem;
    border: 1px solid var(--portal-border, #e3e8ec);
    border-radius: 0.75rem;
    padding: 1rem;
  }
  label {
    display: grid;
    gap: 0.3rem;
    font-weight: 600;
    font-size: 0.9rem;
  }
  input,
  select {
    min-height: var(--ja-target-min, 2.75rem);
    width: 100%;
    box-sizing: border-box;
    font-weight: 400;
  }
  .pay-actions {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .pay-links {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .pay-links a:not(.primary-button) {
    min-height: var(--ja-target-min, 2.75rem);
    display: inline-flex;
    align-items: center;
  }
</style>
