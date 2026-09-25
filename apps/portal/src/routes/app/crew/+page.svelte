<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { untrack } from 'svelte';
  import { SectionCard } from '$lib/portal/ui';
  import type { PortalLocale } from '$lib/portal-i18n';
  import { translateControlledValue } from '$lib/i18n/controlled-values';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneText,
  } from '../standalone-locale';
  let { data, form } = $props();
  let localeOverride = $state<PortalLocale | null>(null);
  const locale = $derived(
    localeOverride ?? data.locale ?? resolveStandaloneLocale($page.url.searchParams.get('lang')),
  );
  const t = (key: string, params?: Record<string, string | number>) =>
    standaloneText(locale, key, params);
  const status = (value: string) => translateControlledValue(locale, 'status', value);
  const timeCategory = (value: string) => translateControlledValue(locale, 'timeCategory', value);
  const payer = (value: string) => translateControlledValue(locale, 'role', value);
  let mode = $state<'shared' | 'individual'>(
    untrack(() => (form?.values?.mode === 'individual' ? 'individual' : 'shared')),
  );
  let selected = $state<string[]>(
    untrack(() => (Array.isArray(form?.workerIds) ? form.workerIds : [])),
  );
  let allocationSelected = $state<string[]>(
    untrack(() => (Array.isArray(form?.timeEntryIds) ? form.timeEntryIds : [])),
  );
  const submittedValue = (name: string, fallback = '') =>
    form?.operation === 'createBatch' ? String(form.values?.[name] ?? fallback) : fallback;
  const expenseLink = (entry: {
    id: string;
    projectId: string;
    workerId: string;
    workDate: string;
  }) =>
    `/j-aautomation/app/expenses?${new URLSearchParams({
      project: entry.projectId,
      worker: entry.workerId,
      date: entry.workDate,
      timeEntry: entry.id,
    })}`;
  onMount(() => {
    localeOverride = resolveStandaloneLocale($page.url.searchParams.get('lang'), data.locale);
    persistStandaloneLocale(locale);
    applyStandaloneDocumentLocale(locale);
  });
  $effect(() => applyStandaloneDocumentLocale(locale));
</script>

<svelte:head>
  <title>{t('Project crew time · J&A Automation')}</title>
</svelte:head>

<main class="crew-page">
  <header>
    <p class="eyebrow">{t('Project workforce')}</p>
    <h1>{t('Project crew time')}</h1>
    <p>
      {t(
        'Record actual hours for each delegated person. Each row stays tied to its worker and follows the normal approval process.',
      )}
    </p>
  </header>

  {#if form?.message}
    <div class="notice error" role="alert">{form.message}</div>
  {/if}

  <form method="GET" action={data.owner ? '#crew-assign' : '#crew-hours'} class="context-form">
    <label for="crew-project">{t('Project')}</label>
    <select id="crew-project" name="project" value={data.projectId} required>
      {#each data.projects as project}
        <option value={project.id}>{project.name}</option>
      {/each}
    </select>
    <label for="crew-date">{t('Work date')}</label>
    <input id="crew-date" type="date" name="date" value={data.workDate} required />
    <button type="submit">{t('Show project')}</button>
  </form>

  {#if data.owner}
    <SectionCard title={t('Assign a crew chief')} id="crew-assign">
      <p>
        {t(
          'Choose two workers already assigned to the project. The chief can enter their colleague’s hours only while this delegation and both project assignments are active.',
        )}
      </p>
      {#if data.projectId && data.candidates.length > 1}
        <form method="POST" action="?/grant" use:enhance class="form-grid">
          <input type="hidden" name="projectId" value={data.projectId} />
          <label
            >{t('Chief')}
            <select
              name="chiefUserId"
              required
              value={form?.operation === 'grant' ? form.values?.chiefUserId : ''}
            >
              <option value="">{t('Choose chief')}</option>
              {#each data.candidates as person}<option value={person.id}>{person.name}</option
                >{/each}
            </select>
          </label>
          <label
            >{t('Team member')}
            <select
              name="workerUserId"
              required
              value={form?.operation === 'grant' ? form.values?.workerUserId : ''}
            >
              <option value="">{t('Choose worker')}</option>
              {#each data.candidates as person}<option value={person.id}>{person.name}</option
                >{/each}
            </select>
          </label>
          <label
            >{t('Effective from')}
            <input
              type="date"
              name="startsOn"
              value={form?.operation === 'grant' ? form.values?.startsOn : data.workDate}
              required
            />
          </label>
          <label
            >{t('Effective until (optional)')}
            <input
              type="date"
              name="endsOn"
              value={form?.operation === 'grant' ? form.values?.endsOn : ''}
            />
          </label>
          <button type="submit">{t('Assign chief')}</button>
        </form>
      {:else}
        <p class="empty">
          {t('Assign at least two active workers to this project before choosing a chief.')}
        </p>
      {/if}
    </SectionCard>
    <SectionCard title={t('Crew delegations')} id="crew-delegations">
      {#if data.grants.length}
        <ul class="grant-list">
          {#each data.grants as grant}
            <li>
              <div>
                <strong>{grant.chiefName}</strong>
                {t('can record for')}
                <strong>{grant.workerName}</strong><br />
                <small
                  >{grant.startsOn} → {grant.endsOn ?? t('open ended')} · {status(
                    grant.status,
                  )}</small
                >
              </div>
              {#if grant.status === 'active'}
                <form method="POST" action="?/revoke" use:enhance>
                  <input type="hidden" name="id" value={grant.id} />
                  <input type="hidden" name="projectId" value={data.projectId} />
                  <button type="submit" class="secondary">{t('Revoke')}</button>
                </form>
              {/if}
            </li>
          {/each}
        </ul>
      {:else}<p class="empty">{t('No crew delegations for this project.')}</p>{/if}
    </SectionCard>
  {:else}
    <SectionCard title={t('Log team hours')} id="crew-hours">
      <p>
        {t('Use one worker for a single entry, or select several. Shared hours apply')}
        <strong>{t('to each selected worker')}</strong>{t(
          '; individual hours let you enter a different amount per person.',
        )}
      </p>
      {#if data.assigned.length}
        <form method="POST" action="?/createBatch" use:enhance class="entry-form">
          <input
            type="hidden"
            name="requestId"
            value={submittedValue('requestId', data.requestId)}
          />
          <input type="hidden" name="projectId" value={data.projectId} />
          <input type="hidden" name="workDate" value={data.workDate} />
          <fieldset>
            <legend>{t('Team members')}</legend>
            <div class="member-grid">
              {#each data.assigned as person}
                <div class="member-row">
                  <label class="member-name">
                    <input
                      type="checkbox"
                      name="workerIds"
                      value={person.id}
                      bind:group={selected}
                    />
                    <span>{person.name}</span>
                  </label>
                  {#if mode === 'individual'}
                    <label
                      >{t('Hours for')}
                      {person.name}
                      <input
                        type="text"
                        inputmode="decimal"
                        name="hours_{person.id}"
                        value={submittedValue(`hours_${person.id}`)}
                        placeholder="7.5"
                        disabled={!selected.includes(person.id)}
                      />
                    </label>
                  {/if}
                </div>
              {/each}
            </div>
          </fieldset>
          <fieldset>
            <legend>{t('How to enter hours')}</legend>
            <label class="radio"
              ><input type="radio" name="mode" value="shared" bind:group={mode} />{t(
                'Same hours for each selected member',
              )}</label
            >
            <label class="radio"
              ><input type="radio" name="mode" value="individual" bind:group={mode} />{t(
                'Different hours for each member',
              )}</label
            >
          </fieldset>
          {#if mode === 'shared'}
            <label
              >{t('Hours per member')}
              <input
                type="text"
                inputmode="decimal"
                name="sharedHours"
                value={submittedValue('sharedHours')}
                placeholder="7.5"
                aria-describedby="crew-shared-hours-help"
                required
              />
              <small id="crew-shared-hours-help"
                >{t('Use exact one-minute increments: 0.1 hours = 6 minutes.')}</small
              >
            </label>
          {/if}
          <label
            >{t('Time category')}
            <select name="category" value={submittedValue('category', 'regular')}>
              <option value="regular">{t('Regular')}</option><option value="overtime"
                >{t('Overtime')}</option
              >
              <option value="travel">{t('Travel')}</option><option value="standby"
                >{t('Standby')}</option
              >
            </select>
          </label>
          <label
            >{t('Work performed')}
            <textarea name="summary" rows="3" maxlength="5000" required
              >{submittedValue('summary')}</textarea
            >
          </label>
          <label class="check"
            ><input
              type="checkbox"
              name="submit"
              value="yes"
              checked={submittedValue('submit') === 'yes'}
            />{t('Submit for approval now')}</label
          >
          <p class="hint">
            {t(
              'Entries saved as drafts can be submitted later. Submission does not approve your own crew hours.',
            )}
          </p>
          <button type="submit" disabled={selected.length === 0}
            >{t('Save')}
            {selected.length}
            {selected.length === 1 ? t('person') : t('people')}</button
          >
        </form>
      {:else}
        <p class="empty">
          {t(
            'No active delegated workers are available for this project and date. Ask the owner to assign your crew.',
          )}
        </p>
      {/if}
    </SectionCard>
    <SectionCard title={t('Entries recorded on {dia}', { dia: data.workDate })} id="crew-entries">
      {#if data.entries.length}
        <ul class="entry-list">
          {#each data.entries as entry}
            <li>
              <div>
                <strong>{entry.workerName}</strong> · {entry.minutes}
                {t('minutes ·')}
                {timeCategory(entry.category)}<br />
                <small>{entry.summary} · {status(entry.approvalState)}</small>
              </div>
              <a class="secondary-link" href={`/j-aautomation/app/crew/time/${entry.id}`}
                >{entry.editable
                  ? t('Edit draft')
                  : entry.approvalState === 'needs_changes'
                    ? t('Review outcome')
                    : t('View time')}</a
              >
              {#if !['needs_changes', 'rejected'].includes(entry.approvalState)}
                <a class="secondary-link" href={expenseLink(entry)}
                  >{t('Add expense for')} {entry.workerName}</a
                >
              {/if}
              {#if entry.approvalState === 'draft'}
                <form method="POST" action="?/submit" use:enhance>
                  <input type="hidden" name="id" value={entry.id} />
                  <input type="hidden" name="version" value={entry.version} />
                  <input type="hidden" name="projectId" value={data.projectId} />
                  <input type="hidden" name="workDate" value={data.workDate} />
                  <button type="submit" class="secondary">{t('Submit')}</button>
                </form>
              {/if}
            </li>
          {/each}
        </ul>
      {:else}<p class="empty">{t('No crew hours recorded for this date.')}</p>{/if}
    </SectionCard>
    <SectionCard title={t('Allocate one crew receipt')} id="crew-receipts">
      <p>
        {t(
          'First save a receipt expense for one delegated worker using the “Add expense” link above. Select that expense here and split its amount across at least two crew time rows. The receipt stays',
        )} <strong>{t('one expense')}</strong>
        {t(
          'for billing and reimbursement; the split only records which workers and shifts it covered. Worker reimbursement and customer billing follow the selected expense’s payer and worker policy.',
        )}
      </p>
      {#if data.receipts.length && data.entries.length > 1}
        <form method="POST" action="?/allocateReceipt" use:enhance class="entry-form">
          <input
            type="hidden"
            name="requestId"
            value={form?.operation === 'allocateReceipt'
              ? form.values?.requestId
              : data.allocationRequestId}
          />
          <input type="hidden" name="projectId" value={data.projectId} />
          <input type="hidden" name="workDate" value={data.workDate} />
          <label
            >{t('Receipt expense')}
            <select
              name="expenseId"
              required
              value={form?.operation === 'allocateReceipt' ? form.values?.expenseId : ''}
            >
              <option value="">{t('Choose a saved receipt')}</option>
              {#each data.receipts as receipt}
                <option value={receipt.id}>
                  {receipt.vendor || t('Receipt')} · {(receipt.amountMinor / 100).toFixed(2)}
                  {receipt.currency} ·
                  {data.assigned.find(
                    (person: { id: string; name: string }) => person.id === receipt.workerId,
                  )?.name || t('Worker')}
                  ({payer(receipt.whoPaid)})
                </option>
              {/each}
            </select>
          </label>
          <fieldset>
            <legend>{t('Allocate exact amount by worker and shift')}</legend>
            <div class="member-grid">
              {#each data.entries as entry}
                <div class="member-row">
                  <label class="member-name">
                    <input
                      type="checkbox"
                      name="timeEntryIds"
                      value={entry.id}
                      bind:group={allocationSelected}
                    />
                    <span
                      >{entry.workerName} · {entry.minutes} {t('minutes ·')} {entry.summary}</span
                    >
                  </label>
                  <label
                    >{t('Amount for')}
                    {entry.workerName}
                    <input
                      type="text"
                      inputmode="decimal"
                      name="amount_{entry.id}"
                      value={form?.operation === 'allocateReceipt'
                        ? String(form.values?.[`amount_${entry.id}`] ?? '')
                        : ''}
                      placeholder="6.50"
                      disabled={!allocationSelected.includes(entry.id)}
                    />
                  </label>
                </div>
              {/each}
            </div>
          </fieldset>
          <p class="hint">
            {t(
              'The amounts must add up exactly to the selected receipt. Include the worker and shift already linked to it.',
            )}
          </p>
          <button type="submit" disabled={allocationSelected.length < 2}
            >{t('Save receipt allocation')}</button
          >
        </form>
      {:else}
        <p class="empty">
          {t(
            'Save a receipt expense and at least two crew time rows for this project and date to allocate a shared receipt.',
          )}
        </p>
      {/if}
      {#if data.allocatedReceipts.length}
        <h3>{t('Saved receipt allocations')}</h3>
        <ul class="grant-list">
          {#each data.allocatedReceipts as receipt}
            <li>
              <div>
                <strong>{receipt.vendor || t('Receipt')}</strong> ·
                {(receipt.totalMinor / 100).toFixed(2)}
                {receipt.currency}
                {t('· one expense')}
                <ul>
                  {#each receipt.allocations as allocation}
                    <li>
                      {allocation.workerName}: {(allocation.amountMinor / 100).toFixed(2)}
                      {receipt.currency}
                    </li>
                  {/each}
                </ul>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </SectionCard>
  {/if}
</main>

<style>
  .crew-page {
    max-width: 72rem;
    margin: 0 auto;
    padding: 1rem 1rem 4rem;
    display: grid;
    gap: 1.25rem;
  }
  :global(.crew-page [data-ui='section-card'][id]) {
    scroll-margin-top: 5rem;
  }
  header h1 {
    margin: 0.2rem 0;
  }
  .eyebrow {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #52718c;
  }
  .context-form,
  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.8rem;
    align-items: end;
  }
  .entry-form {
    display: grid;
    gap: 1rem;
    max-width: 46rem;
  }
  label {
    display: grid;
    gap: 0.35rem;
    font-weight: 600;
  }
  input,
  select,
  textarea,
  button {
    font: inherit;
  }
  input:not([type='checkbox']):not([type='radio']),
  select,
  textarea {
    width: 100%;
    min-height: 2.75rem;
    padding: 0.55rem;
    border: 1px solid #9baebd;
    border-radius: 0.45rem;
    background: #fff;
    color: #152b3a;
  }
  button {
    min-height: 2.75rem;
    padding: 0.55rem 1rem;
    border: 0;
    border-radius: 0.45rem;
    background: #145478;
    color: #fff;
    cursor: pointer;
    font-weight: 700;
  }
  button.secondary {
    background: #eaf1f5;
    color: #164c68;
  }
  button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  button:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 3px solid #e6a23c;
    outline-offset: 2px;
  }
  .secondary-link {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    padding: 0.55rem 1rem;
    border-radius: 0.45rem;
    background: #eaf1f5;
    color: #164c68;
    font-weight: 700;
    text-decoration: none;
  }
  .secondary-link:focus-visible {
    outline: 3px solid #e6a23c;
    outline-offset: 2px;
  }
  fieldset {
    border: 1px solid #c5d0d9;
    border-radius: 0.5rem;
    padding: 1rem;
  }
  legend {
    font-weight: 700;
  }
  .member-grid {
    display: grid;
    gap: 0.65rem;
  }
  .member-row {
    display: grid;
    grid-template-columns: minmax(10rem, 1fr) minmax(10rem, 1fr);
    gap: 1rem;
    align-items: center;
    padding: 0.5rem;
    border-bottom: 1px solid #e5eaef;
  }
  .member-name,
  .radio,
  .check {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-height: 2.75rem;
  }
  .radio + .radio {
    margin-top: 0.6rem;
  }
  .member-name input,
  .radio input,
  .check input {
    width: 1.2rem;
    height: 1.2rem;
  }
  .grant-list,
  .entry-list {
    padding: 0;
    list-style: none;
  }
  .grant-list li,
  .entry-list li {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: center;
    padding: 0.8rem 0;
    border-top: 1px solid #e5eaef;
  }
  .hint,
  .empty,
  small {
    color: #506576;
  }
  .notice {
    padding: 0.8rem;
    border-radius: 0.5rem;
  }
  .error {
    background: #fce8e8;
    color: #7b1a1a;
  }
  @media (max-width: 600px) {
    .member-row {
      grid-template-columns: 1fr;
    }
    .grant-list li,
    .entry-list li {
      align-items: flex-start;
      flex-direction: column;
    }
    .crew-page {
      padding: 0.8rem;
    }
  }
</style>
