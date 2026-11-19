<script lang="ts">
  /**
   * Project hub Team tab (owner round 2026-11-16): who is on the project, their
   * role and client rate, "Add people" (multi-select) and "End assignment".
   * Writes reuse the existing server actions (projects ?/assignWorker,
   * ?/removeAssignment and this project's ?/setClientRate); every one of them
   * re-checks authorization on the server.
   */
  import { base } from '$app/paths';
  import { deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { hubText, type ProjectHubCopyKey } from '$lib/portal/project-hub-copy';
  import { personDisplayName } from '$lib/portal/display-name';
  import { isSystemAccount } from '$lib/portal/system-accounts';

  type Assignment = {
    id: string;
    version: number;
    workerId: string;
    name: string;
    role: string | null;
    startsOn: string;
    endsOn: string | null;
    poNumber?: string | null;
  };
  type RatePerson = { id: string; customerRate: string | null; customerRateAmount: string; customerRateBasis: string };
  type Worker = Record<string, unknown>;

  let {
    projectId,
    currency,
    locale,
    role,
    assignments,
    lastEndedOn = {},
    workers = [],
    ratePeople = null,
    hasPersonDefaults = false,
    projectStart = '',
    projectEnd = '',
    today,
    canSetRates = false,
    viewerId = '',
    roleLabel,
    formatDate,
    describe,
    notify,
  }: {
    projectId: string;
    currency: string;
    locale: string;
    role: string;
    assignments: Assignment[];
    lastEndedOn?: Record<string, string>;
    workers?: Worker[];
    ratePeople?: RatePerson[] | null;
    hasPersonDefaults?: boolean;
    projectStart?: string;
    projectEnd?: string;
    today: string;
    canSetRates?: boolean;
    /** Signed-in user id (hides "End assignment" on a manager's own row). */
    viewerId?: string;
    roleLabel: (value: unknown) => string;
    formatDate: (value: unknown) => string;
    describe: (result: unknown) => string;
    notify: (message: string, variant: 'success' | 'danger') => void;
  } = $props();

  const h = (key: ProjectHubCopyKey, params: Record<string, string | number> = {}) =>
    hubText(locale, key, params);
  const isOwner = $derived(role === 'owner_admin');
  const canManage = $derived(role === 'owner_admin' || role === 'project_manager');
  const projectHref = $derived(`${base}/app/projects/${encodeURIComponent(projectId)}`);

  // Assignments whose end date has passed are history: they are not counted
  // as the current team and cannot be ended again.
  const currentAssignments = $derived(
    assignments.filter((row) => !row.endsOn || row.endsOn >= today),
  );
  const pastAssignments = $derived(
    assignments.filter((row) => Boolean(row.endsOn) && String(row.endsOn) < today),
  );
  const teamCount = $derived(new Set(currentAssignments.map((row) => row.workerId)).size);

  const rateFor = (workerId: string) => ratePeople?.find((person) => person.id === workerId);
  const anyRate = $derived((ratePeople ?? []).some((person) => person.customerRate !== null));
  // People on the team with no client rate at all. The project-wide rate stays on offer
  // while anyone is missing one, even when others already have a personal rate.
  const missingRateCount = $derived(
    ratePeople
      ? currentAssignments.filter((row) => {
          const rate = rateFor(row.workerId);
          return !rate || rate.customerRate === null;
        }).length
      : 0,
  );

  // ---------- add people ----------
  let addOpen = $state(false);
  let search = $state('');
  let selected = $state<Record<string, boolean>>({});
  let startsOn = $state('');
  let payMode = $state<'defaults' | 'existing' | 'enter'>('existing');
  let internalCost = $state('');
  let workerPay = $state('');
  let busy = $state(false);
  let addErrors = $state<string[]>([]);

  function mondayOf(date: string): string {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
    return value.toISOString().slice(0, 10);
  }
  $effect(() => {
    // New people can log hours from the project start (owner decision
    // 2026-11-19); without a project start, from this week's Monday.
    // Always inside the project dates.
    if (!startsOn) {
      let start = projectStart || mondayOf(today);
      if (projectEnd && start > projectEnd) start = projectEnd;
      startsOn = start;
    }
  });
  // People that "use saved rules" could not cover: the owner sets their
  // cost and pay inline and adds them again.
  let needsTerms = $state<string[]>([]);
  $effect(() => {
    payMode = hasPersonDefaults ? 'defaults' : 'existing';
  });

  const assignedIds = $derived(new Set(currentAssignments.map((row) => row.workerId)));
  // Last day each former member was on this project (W10): adding them again
  // starts the day after, so the new assignment cannot overlap the old one.
  // (Server-computed: also counts assignments that were removed.)
  function dayAfter(date: string): string {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + 1);
    return value.toISOString().slice(0, 10);
  }
  /** Start date actually sent for one person: never inside their earlier assignment. */
  function startFor(workerId: string): string {
    const ended = lastEndedOn[workerId];
    if (!ended || startsOn > ended) return startsOn;
    // The day after they left, or today when that is later.
    const next = dayAfter(ended);
    return next > today ? next : today;
  }
  // People only (P3): active, eligible, no shared/system mailboxes; display
  // names, with the e-mail added when two people share the same name (P2).
  const available = $derived.by(() => {
    const people = workers
      .filter(
        (worker) =>
          String(worker.status ?? 'active') === 'active' &&
          ['worker', 'project_manager'].includes(String(worker.role ?? 'worker')) &&
          !isSystemAccount(worker) &&
          !assignedIds.has(String(worker.id)),
      )
      .map((worker) => ({
        id: String(worker.id),
        name: personDisplayName(worker.name, worker.email),
        email: String(worker.email ?? ''),
      }));
    const counts = new Map<string, number>();
    for (const person of people) counts.set(person.name, (counts.get(person.name) ?? 0) + 1);
    return people
      .map((person) => ({
        id: person.id,
        name: (counts.get(person.name) ?? 0) > 1 && person.email ? `${person.name} (${person.email})` : person.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  const visible = $derived(
    available.filter((worker) =>
      worker.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
    ),
  );
  const selectedIds = $derived(Object.keys(selected).filter((id) => selected[id]));

  async function post(url: string, fields: Record<string, string>) {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.set(key, value);
    const response = await fetch(url, {
      method: 'POST',
      body,
      headers: { 'x-sveltekit-action': 'true', accept: 'application/json' },
    });
    return deserialize(await response.text());
  }

  async function addPeople(event: SubmitEvent) {
    event.preventDefault();
    if (!selectedIds.length || busy) return;
    busy = true;
    addErrors = [];
    const missingTerms: string[] = [];
    let added = 0;
    for (const workerId of selectedIds) {
      const personStart = startFor(workerId);
      const fields: Record<string, string> = { projectId, workerId, startsOn: personStart };
      if (isOwner && payMode === 'defaults') fields.useProjectDefaults = 'on';
      if (isOwner && payMode === 'existing') fields.useExistingFinanceRules = 'on';
      if (isOwner && payMode === 'enter') {
        fields.internalCostHourlyRate = internalCost;
        fields.compensationRate = workerPay;
        fields.compensationBasis = 'hourly';
        fields.financeEffectiveFrom = personStart;
        fields.financeEffectiveTo = '';
      }
      try {
        const result = await post(`${base}/app/projects?/assignWorker`, fields);
        if (result.type === 'success') {
          added++;
          selected[workerId] = false;
        } else {
          const name = available.find((worker) => worker.id === workerId)?.name ?? workerId;
          const data = result.type === 'failure' ? result.data : null;
          const code = (data as { code?: unknown } | null)?.code;
          if (isOwner && payMode !== 'enter' && code === 'ASSIGNMENT_FINANCE_SETUP_REQUIRED')
            missingTerms.push(name);
          else addErrors.push(h('addFailed', { name, message: describe(data) }));
        }
      } catch {
        addErrors.push(h('addFailed', { name: workerId, message: describe(null) }));
      }
    }
    busy = false;
    needsTerms = missingTerms;
    if (missingTerms.length) payMode = 'enter';
    if (added) {
      notify(h('added', { count: added }), 'success');
      await invalidateAll();
      if (!addErrors.length && !missingTerms.length) addOpen = false;
    }
  }

  // ---------- end assignment ----------
  let endingId = $state('');
  let endReason = $state('');
  async function endAssignment(row: Assignment) {
    if (busy) return;
    busy = true;
    try {
      const result = await post(`${base}/app/projects?/removeAssignment`, {
        assignmentId: row.id,
        version: String(row.version),
        reason: endReason.trim() || h('reasonDefault'),
      });
      if (result.type === 'success') {
        notify(h('ended', { name: row.name }), 'success');
        endingId = '';
        await invalidateAll();
      } else notify(describe(result.type === 'failure' ? result.data : null), 'danger');
    } catch {
      notify(describe(null), 'danger');
    } finally {
      busy = false;
    }
  }

  // ---------- PO per assignment (owner decision 2026-11-17) ----------
  let poFor = $state('');
  let poValue = $state('');
  async function savePo(event: SubmitEvent, row: Assignment) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    try {
      const result = await post(`${projectHref}?/setAssignmentPo`, {
        assignmentId: row.id,
        version: String(row.version),
        poNumber: poValue.trim(),
      });
      if (result.type === 'success') {
        notify(h('poSaved'), 'success');
        poFor = '';
        await invalidateAll();
      } else notify(describe(result.type === 'failure' ? result.data : null), 'danger');
    } catch {
      notify(describe(null), 'danger');
    } finally {
      busy = false;
    }
  }

  // ---------- inline client rate ----------
  let rateFormFor = $state<string | null>(null); // workerId, or '' for the whole project
  let rateValue = $state('');
  let rateFrom = $state('');
  function openRate(workerId: string, from: string) {
    rateFormFor = workerId;
    rateValue = '';
    rateFrom = from || projectStart || today;
  }
  async function saveRate(event: SubmitEvent) {
    event.preventDefault();
    if (busy || rateFormFor === null) return;
    busy = true;
    try {
      const result = await post(`${projectHref}?/setClientRate`, {
        workerId: rateFormFor,
        rate: rateValue,
        effectiveFrom: rateFrom,
      });
      if (result.type === 'success') {
        notify(h('rateSaved'), 'success');
        rateFormFor = null;
        await invalidateAll();
      } else notify(describe(result.type === 'failure' ? result.data : null), 'danger');
    } catch {
      notify(describe(null), 'danger');
    } finally {
      busy = false;
    }
  }
</script>

{#snippet rateForm(label: string)}
  <form class="hub-inline-form" onsubmit={saveRate} data-hub-rate-form>
    <label
      >{label}<input
        name="rate"
        inputmode="decimal"
        autocomplete="off"
        placeholder="85.00"
        required
        bind:value={rateValue}
      /></label
    >
    <label>{h('rateFrom')}<input type="date" required bind:value={rateFrom} /></label>
    <div class="hub-inline-actions">
      <button type="button" class="secondary-button" onclick={() => (rateFormFor = null)}
        >{h('cancel')}</button
      >
      <button type="submit" class="primary-button" disabled={busy}>{h('rateSave')}</button>
    </div>
  </form>
{/snippet}

<section class="project-surface hub-team" aria-labelledby="hub-team-title" data-hub-team>
  <div class="surface-heading">
    <div>
      <h2 id="hub-team-title">{h('tabTeam')} · {teamCount}</h2>
      <p class="surface-intro">{h('teamIntro')}</p>
    </div>
    {#if isOwner}
      <button
        type="button"
        class="primary-button"
        data-hub-add-people
        aria-expanded={addOpen}
        onclick={() => (addOpen = !addOpen)}>{h('addPeople')}</button
      >
    {:else if canManage}
      <a
        class="primary-button"
        href={`${base}/app/projects?action=assign-worker&project=${encodeURIComponent(projectId)}#project-assignment`}
        >{h('addPeople')}</a
      >
    {/if}
  </div>

  {#if addOpen && isOwner}
    <form class="hub-add-people" onsubmit={addPeople} data-hub-add-form>
      <h3>{h('addPeopleTitle')}</h3>
      {#if available.length === 0}
        <p class="surface-intro">{h('noneAvailable')}</p>
      {:else}
        <label class="hub-search"
          >{h('searchPeople')}<input type="search" bind:value={search} autocomplete="off" /></label
        >
        <div class="hub-people-pick" role="group" aria-label={h('addPeopleTitle')}>
          {#each visible as worker (worker.id)}
            <label class="hub-pick"
              ><input type="checkbox" bind:checked={selected[worker.id]} data-hub-pick={worker.id} />
              <span
                >{worker.name}{#if lastEndedOn[worker.id]}<small class="hub-pick-note"
                    >{h('rejoinNote', {
                      ended: formatDate(lastEndedOn[worker.id]),
                      start: formatDate(startFor(worker.id)),
                    })}</small
                  >{/if}</span
              ></label
            >
          {/each}
        </div>
        <div class="hub-add-fields">
          <label
            >{h('startsOn')}<input
              type="date"
              required
              min={projectStart || undefined}
              max={projectEnd || undefined}
              bind:value={startsOn}
            /><small class="surface-intro">{h('startsOnHelp')}</small></label
          >
          <fieldset>
            <legend>{h('payTerms')}</legend>
            {#if hasPersonDefaults}
              <label class="hub-radio"
                ><input type="radio" value="defaults" bind:group={payMode} />{h('payDefaults')}</label
              >
            {/if}
            <label class="hub-radio"
              ><input type="radio" value="existing" bind:group={payMode} />{h('payExisting')}</label
            >
            <label class="hub-radio"
              ><input type="radio" value="enter" bind:group={payMode} />{h('payEnter')}</label
            >
          </fieldset>
          {#if needsTerms.length}
            <div class="hub-needs-terms" role="status" data-hub-needs-terms>
              <strong>{h('needsTermsTitle', { names: needsTerms.join(', ') })}</strong>
              <p>{h('needsTermsHelp')}</p>
            </div>
          {/if}
          {#if payMode === 'enter'}
            <label
              >{h('internalCost', { currency })}<input
                inputmode="decimal"
                required
                bind:value={internalCost}
              /></label
            >
            <label
              >{h('workerPay', { currency })}<input
                inputmode="decimal"
                required
                bind:value={workerPay}
              /></label
            >
          {/if}
        </div>
        {#if addErrors.length}
          <ul class="hub-errors" role="alert">
            {#each addErrors as message}<li>{message}</li>{/each}
          </ul>
        {/if}
        <div class="hub-inline-actions">
          <button type="button" class="secondary-button" onclick={() => (addOpen = false)}
            >{h('cancel')}</button
          >
          <button
            type="submit"
            class="primary-button"
            disabled={busy || selectedIds.length === 0}
            data-hub-add-submit
            >{busy
              ? h('adding')
              : selectedIds.length === 1
                ? h('addOne')
                : h('addSelected', { count: selectedIds.length })}</button
          >
        </div>
      {/if}
    </form>
  {/if}

  {#if canSetRates && ratePeople && currentAssignments.length > 0 && (!anyRate || missingRateCount > 0)}
    <div class="hub-rate-banner" data-hub-project-rate>
      <p>
        {anyRate ? h('projectRateSome', { count: missingRateCount }) : h('attMissingRate')}
      </p>
      {#if rateFormFor === ''}
        {@render rateForm(h('rateForProject', { currency }))}
      {:else}
        <button type="button" class="primary-button" onclick={() => openRate('', projectStart)}
          >{h('attMissingRateAction')}</button
        >
      {/if}
    </div>
  {/if}

  {#if currentAssignments.length === 0}
    <p class="empty-state">{h('noTeam')}</p>
  {:else}
    <ul class="hub-team-list">
      {#each currentAssignments as row (row.id)}
        {@const rate = rateFor(row.workerId)}
        <li class="hub-team-row" data-hub-member={row.workerId}>
          <div class="hub-team-main">
            <strong>{row.name}</strong>
            <small
              >{roleLabel(row.role)} · {h('since')}
              {formatDate(row.startsOn)}{row.endsOn ? ' ' + h('until', { date: formatDate(row.endsOn) }) : ''}</small
            >
          </div>
          {#if ratePeople}
            <div class="hub-team-rate">
              <span class="hub-label">{h('clientRate')}</span>
              {#if rate?.customerRate !== null && rate}
                <strong>{currency} {rate.customerRateAmount}/{rate.customerRateBasis === 'hourly' ? 'h' : rate.customerRateBasis}</strong>
              {:else if canSetRates}
                <button
                  type="button"
                  class="hub-missing"
                  data-hub-set-rate={row.workerId}
                  onclick={() => openRate(row.workerId, row.startsOn)}
                  >{h('rateMissing')} · {h('rateSet')}</button
                >
              {:else}
                <span class="hub-missing-text">{h('rateMissing')}</span>
              {/if}
            </div>
          {/if}
          {#if canSetRates || row.poNumber}
            <div class="hub-team-rate" data-hub-po={row.workerId}>
              <span class="hub-label">{h('poLabel')}</span>
              {#if row.poNumber}<strong>{row.poNumber}</strong>{:else}<span class="hub-missing-text">{h('poProjectDefault')}</span>{/if}
              {#if canSetRates}
                <button
                  type="button"
                  class="quiet-button"
                  data-hub-po-edit={row.workerId}
                  aria-expanded={poFor === row.id}
                  onclick={() => {
                    poFor = poFor === row.id ? '' : row.id;
                    poValue = row.poNumber ?? '';
                  }}>{row.poNumber ? h('poChange') : h('poEdit')}</button
                >
              {/if}
            </div>
          {/if}
          {#if canManage && (isOwner || row.workerId !== viewerId)}
            <!-- Y5: a project manager does not end their own membership (the owner does). -->
            <button
              type="button"
              class="quiet-button hub-end"
              data-hub-end={row.workerId}
              onclick={() => {
                endingId = endingId === row.id ? '' : row.id;
                endReason = h('reasonDefault');
              }}>{h('endAssignment')}</button
            >
          {/if}
          {#if poFor === row.id}
            <div class="hub-row-panel">
              <form class="hub-inline-form" onsubmit={(event) => savePo(event, row)} data-hub-po-form>
                <label
                  >{h('poFor', { name: row.name })}<input
                    name="poNumber"
                    maxlength="200"
                    autocomplete="off"
                    placeholder="1722812"
                    bind:value={poValue}
                    data-hub-po-input
                  /></label
                >
                <small class="surface-intro">{h('poHelp')}</small>
                <div class="hub-inline-actions">
                  <button type="button" class="secondary-button" onclick={() => (poFor = '')}>{h('cancel')}</button>
                  <button type="submit" class="primary-button" disabled={busy} data-hub-po-save>{h('poSave')}</button>
                </div>
              </form>
            </div>
          {/if}
          {#if rateFormFor === row.workerId}
            <div class="hub-row-panel">
              {@render rateForm(h('rateForPerson', { name: row.name, currency }))}
            </div>
          {/if}
          {#if endingId === row.id}
            <div class="hub-row-panel" role="group" aria-label={h('endAssignmentTitle', { name: row.name })}>
              <strong>{h('endAssignmentTitle', { name: row.name })}</strong>
              <p>{h('endAssignmentHelp')}</p>
              <label>{h('reason')}<input bind:value={endReason} maxlength="2000" /></label>
              <div class="hub-inline-actions">
                <button type="button" class="secondary-button" onclick={() => (endingId = '')}
                  >{h('cancel')}</button
                >
                <button
                  type="button"
                  class="danger-button"
                  disabled={busy}
                  data-hub-end-confirm
                  onclick={() => endAssignment(row)}>{h('endAssignment')}</button
                >
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if pastAssignments.length}
    <details class="hub-past-team" data-hub-past-team>
      <summary>{h('pastTeam', { count: pastAssignments.length })}</summary>
      <ul class="hub-team-list">
        {#each pastAssignments as row (row.id)}
          <li class="hub-team-row hub-team-row-past" data-hub-past-member={row.workerId}>
            <div class="hub-team-main">
              <strong>{row.name}</strong>
              <small
                >{roleLabel(row.role)} · {formatDate(row.startsOn)} – {h('endedOn', {
                  date: formatDate(row.endsOn),
                })}</small
              >
            </div>
          </li>
        {/each}
      </ul>
    </details>
  {/if}

  {#if canSetRates && ratePeople && anyRate}
    <p class="surface-intro">{h('rateInherited')}</p>
  {/if}
  <p class="hub-links">
    {#if canSetRates}
      <a href={`${projectHref}?tab=settings&group=billing#project-person-conditions`}>{h('allRates')} →</a>
    {/if}
    {#if isOwner}
      <!-- Crew hours is an owner screen (a project manager gets 403 there, Y5). -->
      <a href={`${base}/app/crew?project=${encodeURIComponent(projectId)}`}>{h('crewHours')} →</a>
    {/if}
    {#if canManage}
      <a
        href={`${base}/app/projects?action=update-assignment&project=${encodeURIComponent(projectId)}#project-assignment-list`}
        >{h('advancedAssignments')} →</a
      >
    {/if}
  </p>
</section>

<style>
  .hub-team {
    min-width: 0;
    padding: clamp(1rem, 2vw, 1.4rem);
    border: 1px solid var(--project-line, #e4e4e2);
    background: var(--project-surface, #fff);
  }
  .hub-team .surface-heading {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .hub-team h2 {
    margin: 0 0 0.25rem;
    font-size: 1.15rem;
  }
  .surface-intro {
    margin: 0;
    color: var(--project-muted, #77756d);
  }
  .empty-state {
    color: var(--project-muted, #77756d);
  }
  .hub-team-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0;
  }
  .hub-team-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto auto;
    gap: 0.5rem 1rem;
    align-items: center;
    padding: 0.75rem 0;
    border-top: 1px solid var(--project-line, #e4e4e2);
  }
  .hub-team-main {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }
  .hub-team-main small,
  .hub-label {
    color: var(--project-muted, #77756d);
    font-size: 0.85rem;
  }
  .hub-team-rate {
    display: grid;
    justify-items: end;
    gap: 0.1rem;
  }
  .hub-missing {
    min-height: var(--ja-target-min, 2.75rem);
    border: 1px solid #d97706;
    background: #fff7ed;
    color: #9a3412;
    border-radius: 0.5rem;
    padding: 0.25rem 0.75rem;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .hub-missing-text {
    color: #9a3412;
    font-weight: 600;
  }
  .hub-end {
    min-height: var(--ja-target-min, 2.75rem);
  }
  .hub-row-panel {
    grid-column: 1 / -1;
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem;
    border-radius: 0.5rem;
    background: var(--project-soft, #f8f8f7);
  }
  .hub-row-panel p {
    margin: 0;
  }
  .hub-add-people,
  .hub-rate-banner {
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
    margin-bottom: 1rem;
    border: 1px solid var(--project-line, #e4e4e2);
    border-radius: 0.75rem;
    background: var(--project-soft, #f8f8f7);
  }
  .hub-rate-banner {
    border-color: #fdba74;
    background: #fff7ed;
  }
  .hub-rate-banner p,
  .hub-add-people h3 {
    margin: 0;
  }
  .hub-people-pick {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
    gap: 0.25rem 0.75rem;
    max-height: 16rem;
    overflow: auto;
  }
  .hub-pick,
  .hub-radio {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: var(--ja-target-min, 2.75rem);
    cursor: pointer;
  }
  .hub-pick-note {
    display: block;
    color: var(--muted, #5f6368);
    font-weight: 400;
  }
  .hub-pick input,
  .hub-radio input {
    width: 1.2rem;
    height: 1.2rem;
  }
  .hub-add-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.75rem;
    align-items: start;
  }
  .hub-add-fields fieldset {
    border: 0;
    margin: 0;
    padding: 0;
  }
  .hub-add-fields legend {
    font-weight: 600;
    margin-bottom: 0.25rem;
  }
  .hub-inline-form {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.75rem;
    align-items: end;
  }
  .hub-inline-form label,
  .hub-add-fields > label,
  .hub-search,
  .hub-row-panel label {
    display: grid;
    gap: 0.3rem;
    font-weight: 600;
  }
  .hub-inline-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  .hub-needs-terms {
    grid-column: 1 / -1;
    padding: 0.75rem;
    border: 1px solid #fdba74;
    border-radius: 0.5rem;
    background: #fff7ed;
    color: #7c2d12;
  }
  .hub-needs-terms p {
    margin: 0.25rem 0 0;
  }
  .hub-add-fields > label small {
    font-weight: 400;
  }
  .hub-past-team {
    margin-top: 1rem;
  }
  .hub-past-team summary {
    cursor: pointer;
    min-height: var(--ja-target-min, 2.75rem);
    display: flex;
    align-items: center;
    font-weight: 600;
    color: var(--project-muted, #77756d);
  }
  .hub-team-row-past {
    grid-template-columns: minmax(0, 1fr);
    opacity: 0.8;
  }
  .hub-errors {
    margin: 0;
    color: #b42318;
  }
  .hub-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.25rem;
    margin: 1rem 0 0;
  }
  .danger-button {
    min-height: var(--ja-target-min, 2.75rem);
    border: 1px solid #b42318;
    background: #b42318;
    color: #fff;
    border-radius: 0.5rem;
    padding: 0.5rem 1rem;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  :focus-visible {
    outline: 3px solid var(--ja-focus, #2563eb);
    outline-offset: 2px;
  }
  @media (max-width: 640px) {
    .hub-team-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .hub-team-rate {
      justify-items: start;
    }
    .hub-end {
      grid-column: 1 / -1;
      justify-self: start;
    }
  }
</style>
