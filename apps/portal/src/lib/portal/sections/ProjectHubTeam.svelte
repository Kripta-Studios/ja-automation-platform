<script lang="ts">
  import { SvelteDate, SvelteMap } from 'svelte/reactivity';
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
  import { assignmentText, type AssignmentEditCopyKey } from '$lib/portal/assignment-edit-copy';
  import {
    assignmentAction,
    previewRemoval,
    type RemovalPreview,
  } from '$lib/portal/assignment-requests';
  import AssignmentEndPanel from './AssignmentEndPanel.svelte';
  import AssignmentDatesPanel from './AssignmentDatesPanel.svelte';
  import AssignmentExtrasFields from './AssignmentExtrasFields.svelte';
  import {
    emptyExtras,
    extrasChosen,
    extrasFields,
    extrasSummary,
    extrasText,
    type AssignmentExtrasCopyKey,
    type ExtrasValues,
  } from '$lib/portal/assignment-extras-copy';

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
    endedAssignments = [],
    lastEndedOn = {},
    workers = [],
    ratePeople = null,
    hasPersonDefaults = false,
    projectStart = '',
    projectEnd = '',
    today,
    canSetRates = false,
    extras = null,
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
    /** Removed assignments (status inactive) that can still be re-dated or re-opened. */
    endedAssignments?: Assignment[];
    lastEndedOn?: Record<string, string>;
    workers?: Worker[];
    ratePeople?: RatePerson[] | null;
    hasPersonDefaults?: boolean;
    projectStart?: string;
    projectEnd?: string;
    today: string;
    canSetRates?: boolean;
    /** Owner/Finance: optional per-person extras by assignment id (null: not shown). */
    extras?: Record<string, ExtrasValues> | null;
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
    [
      ...assignments.filter((row) => Boolean(row.endsOn) && String(row.endsOn) < today),
      ...endedAssignments,
    ].sort((x, y) => String(y.endsOn ?? '').localeCompare(String(x.endsOn ?? ''))),
  );
  const teamCount = $derived(new Set(currentAssignments.map((row) => row.workerId)).size);

  const rateFor = (workerId: string) => ratePeople?.find((person) => person.id === workerId);
  const anyRate = $derived((ratePeople ?? []).some((person) => person.customerRate !== null));
  // People on the team with no client rate at all. The project-wide rate stays on offer
  // while anyone is missing one, even when others already have a personal rate.
  const missingRateCount = $derived(
    ratePeople
      ? currentAssignments.filter((row) => {
          // D3: PM and supplier-coordinator scopes are not billed, so no rate is missing.
          if (row.role === 'project_manager' || row.role === 'supplier_coordinator') return false;
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
  // T32: an optional last day, for people who join only for a known period.
  let endsOn = $state('');
  let payMode = $derived<'defaults' | 'existing' | 'enter'>(
    hasPersonDefaults ? 'defaults' : 'existing',
  );
  let internalCost = $state('');
  let workerPay = $state('');
  let busy = $state(false);
  let addErrors = $state<string[]>([]);
  // Owner request 2026-11-25: optional extras for the people being added.
  let addExtras = $state<ExtrasValues>(emptyExtras());
  const x = (key: AssignmentExtrasCopyKey, params: Record<string, string | number> = {}) =>
    extrasText(locale, key, params);

  // T32 (role audit 2026-11-22): new people start today, so a quick "Add"
  // never back-dates an assignment by months; a project that has not started
  // yet starts on its first day. The owner can still type an earlier date.
  // Always inside the project dates.
  const baseStart = $derived.by(() => {
    let start = projectStart && projectStart > today ? projectStart : today;
    if (projectEnd && start > projectEnd) start = projectEnd;
    return start;
  });
  // X1/Y7: once the owner types a date, that exact date is sent for every
  // selected person (the server rejects overlaps and names the dates).
  let startTouched = $state(false);
  // People that "use saved rules" could not cover: the owner sets their
  // cost and pay inline and adds them again.
  let needsTerms = $state<string[]>([]);

  const assignedIds = $derived(new Set(currentAssignments.map((row) => row.workerId)));
  // Last day each former member was on this project (W10): adding them again
  // starts the day after, so the new assignment cannot overlap the old one.
  // (Server-computed: also counts assignments that were removed.)
  function dayAfter(date: string): string {
    const value = new SvelteDate(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + 1);
    return value.toISOString().slice(0, 10);
  }
  /** Default start for a former member: never inside their earlier assignment. */
  function rejoinDefault(workerId: string): string {
    const ended = lastEndedOn[workerId];
    if (!ended || baseStart > ended) return baseStart;
    // The day after they left, or today when that is later.
    const next = dayAfter(ended);
    return next > today ? next : today;
  }
  /** Start date actually sent for one person: the typed date, else their default. */
  function startFor(workerId: string): string {
    return startTouched ? startsOn : rejoinDefault(workerId);
  }
  /** Typed date falls inside this person's earlier time on the project. */
  function overlapsEarlier(workerId: string): boolean {
    const ended = lastEndedOn[workerId];
    return Boolean(startTouched && ended && startsOn && startsOn <= ended);
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
    const counts = new SvelteMap<string, number>();
    for (const person of people) counts.set(person.name, (counts.get(person.name) ?? 0) + 1);
    return people
      .map((person) => ({
        id: person.id,
        name: person.name,
        // T32: the e-mail is always shown under the name to tell look-alike
        // names apart (for example a login and a display name of one person).
        email: person.email,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  const visible = $derived(
    available.filter((worker) =>
      `${worker.name} ${worker.email}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
    ),
  );
  const selectedIds = $derived(Object.keys(selected).filter((id) => selected[id]));
  // The field shows the date that will really be used: the project default,
  // or (when only former members are picked) the day they can start again.
  $effect(() => {
    if (startTouched) return;
    const starts = selectedIds.map(rejoinDefault);
    startsOn =
      starts.length && starts.every((date) => date !== baseStart)
        ? starts.reduce((latest, date) => (date > latest ? date : latest))
        : baseStart;
  });

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
      if (endsOn) fields.endsOn = endsOn;
      if (isOwner && payMode === 'defaults') fields.useProjectDefaults = 'on';
      if (isOwner && payMode === 'existing') fields.useExistingFinanceRules = 'on';
      if (isOwner && payMode === 'enter') {
        fields.internalCostHourlyRate = internalCost;
        fields.compensationRate = workerPay;
        fields.compensationBasis = 'hourly';
        fields.financeEffectiveFrom = personStart;
        fields.financeEffectiveTo = endsOn;
      }
      try {
        const result = await post(`${base}/app/projects?/assignWorker`, fields);
        if (result.type === 'success') {
          added++;
          selected[workerId] = false;
          if (extrasChosen(addExtras)) {
            const saved = await post(`${projectHref}?/setAssignmentExtras`, {
              ...extrasFields({ ...addExtras, version: 0 }),
              workerId,
              startsOn: personStart,
            });
            if (saved.type !== 'success') {
              const name = available.find((worker) => worker.id === workerId)?.name ?? workerId;
              const data = saved.type === 'failure' ? (saved.data as { extrasMessage?: string } | null) : null;
              addErrors.push(x('addedNoExtras', { name, message: data?.extrasMessage ?? describe(data) }));
            }
          }
        } else {
          const name = available.find((worker) => worker.id === workerId)?.name ?? workerId;
          const data = result.type === 'failure' ? result.data : null;
          const code = (data as { code?: unknown } | null)?.code;
          const params = (data as { params?: Record<string, unknown> } | null)?.params ?? {};
          if (isOwner && payMode !== 'enter' && code === 'ASSIGNMENT_FINANCE_SETUP_REQUIRED')
            missingTerms.push(name);
          else if (code === 'PROJECT_ASSIGNMENT_OVERLAP' && typeof params.ends === 'string')
            // Name the colliding dates in the owner's language (X1/Y7).
            addErrors.push(
              h('overlapFailed', {
                name,
                starts: formatDate(params.starts),
                ends: formatDate(params.ends),
              }),
            );
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
      if (!addErrors.length && !missingTerms.length) {
        addOpen = false;
        addExtras = emptyExtras();
      }
    }
  }

  // ---------- extras of one assignment (owner request 2026-11-25) ----------
  let extrasFor = $state('');
  let extrasDraft = $state<ExtrasValues>(emptyExtras());
  let extrasError = $state('');
  function openExtras(row: Assignment) {
    if (extrasFor === row.id) {
      extrasFor = '';
      return;
    }
    extrasFor = row.id;
    extrasError = '';
    extrasDraft = { ...(extras?.[row.id] ?? emptyExtras()) };
    endingId = '';
    datesId = '';
  }
  async function saveExtras(event: SubmitEvent, row: Assignment) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    extrasError = '';
    try {
      const result = await post(`${projectHref}?/setAssignmentExtras`, {
        ...extrasFields(extrasDraft),
        assignmentId: row.id,
      });
      if (result.type === 'success') {
        notify(x('saved', { name: row.name }), 'success');
        extrasFor = '';
        await invalidateAll();
      } else {
        const data = result.type === 'failure' ? (result.data as { extrasMessage?: string } | null) : null;
        extrasError = data?.extrasMessage ?? describe(data);
      }
    } catch {
      extrasError = describe(null);
    } finally {
      busy = false;
    }
  }

  // ---------- end assignment / dates (owner request 2026-11-25) ----------
  const a = (key: AssignmentEditCopyKey, params: Record<string, string | number> = {}) =>
    assignmentText(locale, key, params);
  let endingId = $state('');
  let datesId = $state('');
  // D5/T42: supplier staff assignments are the owner's (and the supplier's).
  const isSupplierStaff = (row: Assignment) =>
    row.role === 'external_technician' || row.role === 'supplier_coordinator';
  /** Same rules as the server: D5 for managers, Y5 a manager does not end their own row. */
  const canChange = (row: Assignment) =>
    canManage && (isOwner || (!isSupplierStaff(row) && row.workerId !== viewerId));
  async function finished(message: string, variant: 'success' | 'danger') {
    notify(message, variant);
    endingId = '';
    datesId = '';
    await invalidateAll();
  }

  // ---------- bulk removal ----------
  let picked = $state<Record<string, boolean>>({});
  const removable = $derived(currentAssignments.filter(canChange));
  const pickedRows = $derived(removable.filter((row) => picked[row.id]));
  let bulkOpen = $state(false);
  // svelte-ignore state_referenced_locally
  let bulkEnd = $state(today);
  let bulkReason = $state('');
  let bulkPreview = $state<Record<string, RemovalPreview | string>>({});
  let bulkChecking = $state(false);
  let bulkSequence = 0;
  $effect(() => {
    if (!bulkOpen) return;
    const rows = pickedRows.map((row) => ({ id: row.id, started: row.startsOn <= today }));
    const day = bulkEnd;
    const mine = ++bulkSequence;
    bulkChecking = true;
    void Promise.all(
      rows.map(async (row) => {
        const result = await previewRemoval(row.id, row.started ? day : '');
        return [row.id, result.preview ?? describe(result.failure)] as const;
      }),
    ).then((entries) => {
      if (mine !== bulkSequence) return;
      bulkPreview = Object.fromEntries(entries);
      bulkChecking = false;
    });
  });
  function openBulk() {
    bulkOpen = true;
    bulkEnd = today;
    bulkReason = h('reasonDefault');
    endingId = '';
    datesId = '';
  }
  async function removeSelected() {
    if (busy || !pickedRows.length) return;
    busy = true;
    const rows = [...pickedRows];
    const failed: string[] = [];
    let done = 0;
    for (const row of rows) {
      const preview = bulkPreview[row.id];
      const count = typeof preview === 'object' ? preview.resolvableLaterTime : 0;
      const result = await assignmentAction('removeAssignment', {
        assignmentId: row.id,
        version: String(row.version),
        reason: bulkReason.trim() || h('reasonDefault'),
        ...(row.startsOn <= today && bulkEnd ? { endsOn: bulkEnd } : {}),
        ...(count > 0 ? { resolveLaterTime: 'yes' } : {}),
      });
      if (result.ok) {
        done++;
        picked[row.id] = false;
      } else failed.push(`${row.name} (${describe(result.data)})`);
    }
    busy = false;
    notify(
      [
        a('bulkDone', { done, total: rows.length }),
        failed.length ? a('bulkFailed', { list: failed.join('; ') }) : '',
      ]
        .filter(Boolean)
        .join(' '),
      failed.length ? 'danger' : 'success',
    );
    if (!failed.length) bulkOpen = false;
    if (done) await invalidateAll();
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
        onclick={() => {
          addOpen = !addOpen;
          startTouched = false;
        }}>{h('addPeople')}</button
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
                >{worker.name}{#if worker.email}<small class="hub-pick-email">{worker.email}</small
                  >{/if}{#if lastEndedOn[worker.id]}{#if overlapsEarlier(worker.id)}<small
                      class="hub-pick-note hub-pick-note--warn"
                      data-hub-overlap={worker.id}
                      >{h('rejoinOverlap', { ended: formatDate(lastEndedOn[worker.id]) })}</small
                    >{:else if startTouched}<small class="hub-pick-note"
                      >{h('rejoinUntil', { ended: formatDate(lastEndedOn[worker.id]) })}</small
                    >{:else}<small class="hub-pick-note"
                      >{h('rejoinNote', {
                        ended: formatDate(lastEndedOn[worker.id]),
                        start: formatDate(startFor(worker.id)),
                      })}</small
                    >{/if}{/if}</span
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
              oninput={() => (startTouched = true)}
              data-hub-starts-on
            /><small class="surface-intro">{h('startsOnHelp')}</small></label
          >
          <label
            >{h('endsOnOptional')}<input
              type="date"
              min={startsOn || projectStart || undefined}
              max={projectEnd || undefined}
              bind:value={endsOn}
              data-hub-ends-on
            /><small class="surface-intro">{h('endsOnHelp')}</small></label
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
        {#if extras !== null}
          <details class="hub-extras" data-hub-add-extras>
            <summary>{x('extras')}{#if extrasChosen(addExtras)}<small> · {extrasSummary(locale, addExtras)}</small>{/if}</summary>
            <AssignmentExtrasFields bind:values={addExtras} {currency} {locale} idPrefix="add" />
          </details>
        {/if}
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
  {:else if canSetRates && ratePeople && currentAssignments.length > 0}
    <!-- T62: once every person has a rate, the project rate can still be changed here. -->
    <div class="hub-rate-banner hub-rate-banner--set" data-hub-project-rate-change>
      <p>{h('projectRateAllSet')}</p>
      {#if rateFormFor === ''}
        {@render rateForm(h('rateForProject', { currency }))}
      {:else}
        <button type="button" class="secondary-button" onclick={() => openRate('', today)}
          >{h('projectRateChange')}</button
        >
      {/if}
    </div>
  {/if}

  {#if currentAssignments.length === 0}
    <p class="empty-state">{h('noTeam')}</p>
  {:else}
    {#if removable.length > 1}
      <div class="hub-bulk-bar" data-hub-bulk>
        <label class="hub-check hub-check-all"
          ><input
            type="checkbox"
            checked={pickedRows.length === removable.length}
            indeterminate={pickedRows.length > 0 && pickedRows.length < removable.length}
            onchange={(event) => {
              const on = (event.currentTarget as HTMLInputElement).checked;
              for (const row of removable) picked[row.id] = on;
            }}
            data-hub-pick-all
          />{a('selectAll')}</label
        >
        <button
          type="button"
          class="secondary-button"
          disabled={pickedRows.length === 0 || busy}
          aria-expanded={bulkOpen}
          onclick={openBulk}
          data-hub-remove-selected>{a('removeSelected', { count: pickedRows.length })}</button
        >
      </div>
    {/if}
    {#if bulkOpen && pickedRows.length}
      <div class="hub-row-panel hub-bulk-panel" role="group" aria-label={a('bulkTitle', { count: pickedRows.length })} data-hub-bulk-panel>
        <strong>{a('bulkTitle', { count: pickedRows.length })}</strong>
        <p>{a('bulkHelp')}</p>
        <div class="hub-bulk-fields">
          <label
            >{a('lastDay')}<input type="date" bind:value={bulkEnd} max={today} required data-hub-bulk-date /></label
          >
          <label>{a('reasonOptional')}<input bind:value={bulkReason} maxlength="2000" placeholder={h('reasonDefault')} /></label>
        </div>
        <ul class="hub-bulk-list" role="status">
          {#each pickedRows as row (row.id)}
            {@const preview = bulkPreview[row.id]}
            <li data-hub-bulk-row={row.workerId}>
              <strong>{row.name}</strong>
              {#if bulkChecking || preview === undefined}
                <span>{a('checking')}</span>
              {:else if typeof preview === 'string'}
                <span class="hub-warn">{preview}</span>
              {:else if preview.blockedByRecords}
                <span class="hub-warn">{a('blocked')}</span>
              {:else if preview.cancelBeforeStart}
                <span>{a('notStarted')}</span>
              {:else if preview.resolvableLaterTime > 0}
                <span>{preview.resolvableLaterTime === 1 ? a('laterOne') : a('laterMany', { count: preview.resolvableLaterTime })}</span>
              {:else}
                <span>{a('nothingLater')}</span>
              {/if}
            </li>
          {/each}
        </ul>
        <div class="hub-inline-actions">
          <button type="button" class="secondary-button" onclick={() => (bulkOpen = false)}>{h('cancel')}</button>
          <button
            type="button"
            class="danger-button"
            disabled={busy || bulkChecking || !bulkEnd}
            onclick={removeSelected}
            data-hub-bulk-confirm>{busy ? a('working') : a('confirmEndCount', { count: pickedRows.length })}</button
          >
        </div>
      </div>
    {/if}
    <ul class="hub-team-list">
      {#each currentAssignments as row (row.id)}
        {@const rate = rateFor(row.workerId)}
        <li class="hub-team-row" data-hub-member={row.workerId}>
          <div class="hub-team-main">
            {#if removable.length > 1 && canChange(row)}
              <label class="hub-check hub-pick-row"
                ><input
                  type="checkbox"
                  bind:checked={picked[row.id]}
                  aria-label={a('select', { name: row.name })}
                  data-hub-pick-member={row.workerId}
                /><strong>{row.name}</strong></label
              >
            {:else}
              <strong>{row.name}</strong>
            {/if}
            <small
              >{roleLabel(row.role)} · {h('since')}
              {formatDate(row.startsOn)}{row.endsOn ? ' ' + h('until', { date: formatDate(row.endsOn) }) : ''}</small
            >
          </div>
          {#if ratePeople}
            <div class="hub-team-rate">
              <span class="hub-label">{h('clientRate')}</span>
              {#if row.role === 'project_manager' || row.role === 'supplier_coordinator'}
                <!-- D3: management and coordinator scopes record no billable client hours. -->
                <span class="hub-missing-text" data-hub-not-billed>{h('notBilledRole')}</span>
              {:else if rate?.customerRate !== null && rate}
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
          {#if extras !== null}
            <div class="hub-team-rate hub-team-extras" data-hub-extras={row.workerId}>
              <span class="hub-label">{x('extrasButton')}</span>
              <span class="hub-extras-summary">{extrasSummary(locale, extras[row.id]) || x('extrasNone')}</span>
              <button
                type="button"
                class="quiet-button"
                aria-expanded={extrasFor === row.id}
                onclick={() => openExtras(row)}
                data-hub-extras-edit={row.workerId}>{x('edit')}</button
              >
            </div>
          {/if}
          {#if canManage && !isOwner && isSupplierStaff(row)}
            <small class="surface-intro">{h('supplierStaffByOwner')}</small>
          {:else if canChange(row)}
            <!-- Y5: a project manager does not end their own membership (the owner does). -->
            <div class="hub-row-buttons">
              <button
                type="button"
                class="quiet-button hub-end"
                data-hub-dates={row.workerId}
                aria-expanded={datesId === row.id}
                onclick={() => {
                  datesId = datesId === row.id ? '' : row.id;
                  endingId = '';
                }}>{a('changeDates')}</button
              >
              <button
                type="button"
                class="quiet-button hub-end"
                data-hub-end={row.workerId}
                aria-expanded={endingId === row.id}
                onclick={() => {
                  endingId = endingId === row.id ? '' : row.id;
                  datesId = '';
                }}>{h('endAssignment')}</button
              >
            </div>
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
          {#if extrasFor === row.id}
            <div class="hub-row-panel" data-hub-extras-panel={row.workerId}>
              <form class="hub-inline-form" onsubmit={(event) => saveExtras(event, row)}>
                <strong>{x('extrasFor', { name: row.name })}</strong>
                <AssignmentExtrasFields bind:values={extrasDraft} {currency} {locale} idPrefix={row.id} />
                {#if extrasError}<p class="hub-warn" role="alert">{extrasError}</p>{/if}
                <div class="hub-inline-actions">
                  <button type="button" class="secondary-button" onclick={() => (extrasFor = '')}>{x('cancel')}</button>
                  <button type="submit" class="primary-button" disabled={busy} data-hub-extras-save
                    >{busy ? x('saving') : x('save')}</button
                  >
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
            <AssignmentEndPanel
              assignment={row}
              name={row.name}
              title={h('endAssignmentTitle', { name: row.name })}
              {locale}
              {today}
              defaultReason={h('reasonDefault')}
              allowDelete
              {describe}
              onDone={finished}
              onCancel={() => (endingId = '')}
            />
          {/if}
          {#if datesId === row.id}
            <AssignmentDatesPanel
              assignment={row}
              name={row.name}
              {locale}
              formatDate={(value) => formatDate(value)}
              {describe}
              onDone={finished}
              onCancel={() => (datesId = '')}
            />
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
            {#if canChange(row)}
              <button
                type="button"
                class="quiet-button hub-end"
                data-hub-reopen={row.workerId}
                aria-expanded={datesId === row.id}
                onclick={() => (datesId = datesId === row.id ? '' : row.id)}>{a('reopen')}</button
              >
            {/if}
            {#if datesId === row.id}
              <AssignmentDatesPanel
                assignment={row}
                name={row.name}
                {locale}
                formatDate={(value) => formatDate(value)}
                {describe}
                onDone={finished}
                onCancel={() => (datesId = '')}
              />
            {/if}
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
    grid-template-columns: minmax(0, 1fr) repeat(4, auto);
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
  .hub-pick-note--warn {
    color: var(--danger, #b3261e);
    font-weight: 600;
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
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .hub-row-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    justify-content: flex-end;
  }
  .hub-bulk-bar {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .hub-check-all,
  .hub-pick-row {
    align-items: center;
    margin: 0;
    min-height: var(--ja-target-min, 2.75rem);
    cursor: pointer;
  }
  .hub-check-all input,
  .hub-pick-row input {
    width: 1.2rem;
    height: 1.2rem;
  }
  .hub-bulk-panel {
    margin-bottom: 0.75rem;
  }
  .hub-bulk-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.75rem;
  }
  .hub-bulk-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.4rem;
  }
  .hub-bulk-list li {
    display: grid;
    gap: 0.1rem;
  }
  .hub-warn {
    color: #b42318;
    font-weight: 600;
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
  .hub-pick-email {
    display: block;
    color: var(--ja-muted, #667085);
    font-size: 0.85rem;
    overflow-wrap: anywhere;
  }
  .hub-check {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    margin: 0.5rem 0;
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
  .hub-extras-summary {
    max-width: 16rem;
    text-align: end;
    font-size: 0.9rem;
  }
  .hub-extras {
    border: 1px solid var(--project-line, #e4e4e2);
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--project-surface, #fff);
  }
  .hub-extras > summary {
    min-height: var(--ja-target-min, 2.75rem);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem;
    cursor: pointer;
    font-weight: 600;
  }
  .hub-extras > summary small {
    font-weight: 400;
    color: var(--project-muted, #77756d);
  }
  @media (max-width: 640px) {
    .hub-team-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .hub-extras-summary {
      text-align: start;
    }
    .hub-team-rate {
      justify-items: start;
    }
    .hub-end,
    .hub-row-buttons {
      grid-column: 1 / -1;
      justify-self: start;
      justify-content: flex-start;
    }
  }
</style>
