<script lang="ts">
  /**
   * Person page → Projects: current/past assignments, "Add to a project" and
   * "End assignment". Reuses the Projects actions (assignWorker, removeAssignment)
   * with their server-side authorization, finance coverage checks and audit.
   *
   * Rates are inherited: project defaults → the person's saved rates → (only if
   * neither exists) the owner types them once here. The server decides again.
   */
  import { deserialize, enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { base } from '$app/paths';
  import type { SubmitFunction } from '@sveltejs/kit';
  import type { PortalRow } from '../portal-data';
  import { teamCopy, type TeamCopyKey } from '../team-ux-copy';
  import { projectPickLabel } from '../project-ux-round3-copy';
  import { portalText, normalizePortalLocale } from '$lib/portal-i18n';

  let {
    personId,
    assignments,
    projects,
    modes = {},
    canManage = false,
    isOwner = false,
    locale,
    today,
  }: {
    personId: string;
    assignments: PortalRow[];
    projects: PortalRow[];
    modes?: Record<string, 'defaults' | 'existing' | 'rates'>;
    canManage?: boolean;
    isOwner?: boolean;
    locale: string;
    today: string;
  } = $props();

  const c = (key: TeamCopyKey, params: Record<string, string | number> = {}) =>
    teamCopy(locale, key, params);
  const text = (row: PortalRow, key: string) => String(row[key] ?? '').trim();

  const current = $derived(
    assignments.filter(
      (row) => text(row, 'status') === 'active' && (!text(row, 'ends_on') || text(row, 'ends_on') >= today),
    ),
  );
  const past = $derived(assignments.filter((row) => !current.includes(row)));
  const currentProjectIds = $derived(new Set(current.map((row) => text(row, 'project_id'))));
  const assignable = $derived(
    projects.filter(
      (project) =>
        ['active', 'planned', 'paused'].includes(text(project, 'status')) &&
        !currentProjectIds.has(text(project, 'id')),
    ),
  );

  let projectId = $state('');
  let startsOn = $state('');
  let endsOn = $state('');
  let cost = $state('');
  let pay = $state('');
  let basis = $state<'hourly' | 'daily'>('hourly');
  const selectedProject = $derived(assignable.find((project) => text(project, 'id') === projectId));
  const mode = $derived(projectId ? (modes[projectId] ?? (isOwner ? 'rates' : 'existing')) : null);
  $effect(() => {
    // Default start: today, or the project start when it begins later.
    const start = selectedProject ? text(selectedProject, 'start_date') : '';
    startsOn = start && start > today ? start : today;
  });

  let endingId = $state<string | null>(null);
  let endDate = $state('');
  let endReason = $state('');
  let status = $state<'idle' | 'saving' | 'done' | 'error'>('idle');
  let message = $state('');

  function failureMessage(data: unknown): string {
    const payload = (data ?? {}) as { messageKey?: string; message?: string };
    const loc = normalizePortalLocale(locale);
    const translated = payload.messageKey ? portalText(loc, payload.messageKey) : '';
    return translated && translated !== payload.messageKey ? translated : (payload.message ?? '');
  }

  function submitWith(done: TeamCopyKey, after?: () => void): SubmitFunction {
    return () => {
      status = 'saving';
      message = '';
      return async ({ result }) => {
        if (result.type === 'success') {
          after?.();
          await invalidateAll();
          status = 'done';
          message = c(done);
        } else {
          status = 'error';
          message = c('failed', {
            message: result.type === 'failure' ? failureMessage(result.data) : '',
          });
        }
      };
    };
  }

  function openEnd(row: PortalRow): void {
    endingId = text(row, 'id');
    endDate = today;
    endReason = c('reasonDefault');
  }
  const currency = $derived(selectedProject ? text(selectedProject, 'currency') : '');

  // PO per assignment (owner decision 2026-11-17): saved through the project's action.
  let poFor = $state<string | null>(null);
  let poValue = $state('');
  async function savePo(event: SubmitEvent, row: PortalRow): Promise<void> {
    event.preventDefault();
    if (status === 'saving') return;
    status = 'saving';
    message = '';
    const body = new FormData();
    body.set('assignmentId', text(row, 'id'));
    body.set('version', text(row, 'version') || '1');
    body.set('poNumber', poValue.trim());
    try {
      const response = await fetch(`${base}/app/projects/${encodeURIComponent(text(row, 'project_id'))}?/setAssignmentPo`, {
        method: 'POST',
        body,
        headers: { 'x-sveltekit-action': 'true', accept: 'application/json' },
      });
      const result = deserialize(await response.text());
      if (result.type === 'success') {
        poFor = null;
        await invalidateAll();
        status = 'done';
        message = c('poSaved');
      } else {
        status = 'error';
        message = c('failed', { message: result.type === 'failure' ? failureMessage(result.data) : '' });
      }
    } catch {
      status = 'error';
      message = c('failed', { message: '' });
    }
  }
</script>

<div class="person-projects" data-person-projects>
  {#if message}
    <p class="pp-message" class:pp-message--error={status === 'error'} role="status" data-person-projects-message>
      {message}
    </p>
  {/if}

  <section aria-labelledby="pp-current">
    <h3 id="pp-current">{c('assignmentsTitle')}</h3>
    {#if current.length === 0}
      <p class="pp-muted">{c('noAssignments')}</p>
    {:else}
      <ul class="pp-list">
        {#each current as row (text(row, 'id'))}
          <li data-assignment-id={text(row, 'id')}>
            <div class="pp-row">
              <span class="pp-name">
                <a href={`${base}/app/projects/${text(row, 'project_id')}`}
                  >{projectPickLabel({ project_number: row.project_number, name: row.project_name })}</a
                >
                <small
                  >{c('since', {
                    from: text(row, 'starts_on') || '—',
                    to: text(row, 'ends_on') || c('openEnded'),
                  })} · {text(row, 'po_number') ? c('poShort', { po: text(row, 'po_number') }) : c('poProject')}</small
                >
              </span>
              {#if isOwner && poFor !== text(row, 'id')}
                <button
                  type="button"
                  class="secondary-button"
                  data-person-po-edit={text(row, 'project_id')}
                  onclick={() => {
                    poFor = text(row, 'id');
                    poValue = text(row, 'po_number');
                  }}>{c(text(row, 'po_number') ? 'poChange' : 'poEdit')}</button
                >
              {/if}
              {#if canManage && endingId !== text(row, 'id')}
                <button type="button" class="secondary-button" onclick={() => openEnd(row)}
                  >{c('endAssignment')}</button
                >
              {/if}
            </div>
            {#if isOwner && poFor === text(row, 'id')}
              <form class="pp-end" onsubmit={(event) => savePo(event, row)} data-person-po-form>
                <div class="pp-fields">
                  <label
                    >{c('poLabel')}<input
                      name="poNumber"
                      maxlength="200"
                      autocomplete="off"
                      placeholder="1722812"
                      bind:value={poValue}
                      data-person-po-input
                    /></label
                  >
                </div>
                <p class="pp-muted">{c('poHelp')}</p>
                <div class="pp-actions">
                  <button type="button" class="secondary-button" onclick={() => (poFor = null)}>{c('cancel')}</button>
                  <button type="submit" class="primary-button" disabled={status === 'saving'} data-person-po-save
                    >{c('poSave')}</button
                  >
                </div>
              </form>
            {/if}
            {#if canManage && endingId === text(row, 'id')}
              <form
                method="POST"
                action="?view=team&/removeAssignment"
                class="pp-end"
                use:enhance={submitWith('ended', () => (endingId = null))}
                data-end-assignment-form
              >
                <strong>{c('endTitle', { project: text(row, 'project_name') })}</strong>
                <p class="pp-muted">{c('endHelp')}</p>
                <input type="hidden" name="assignmentId" value={text(row, 'id')} />
                <input type="hidden" name="version" value={text(row, 'version') || '1'} />
                <div class="pp-fields">
                  <label
                    >{c('lastDay')}<input
                      type="date"
                      name="endsOn"
                      bind:value={endDate}
                      min={text(row, 'starts_on')}
                      required
                    /></label
                  >
                  <label
                    >{c('reason')}<input name="reason" bind:value={endReason} maxlength="500" required /></label
                  >
                </div>
                <div class="pp-actions">
                  <button type="button" class="secondary-button" onclick={() => (endingId = null)}
                    >{c('cancel')}</button
                  >
                  <button type="submit" class="primary-button" disabled={status === 'saving'}
                    >{c('confirmEnd')}</button
                  >
                </div>
              </form>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    {#if past.length}
      <details class="pp-past">
        <summary>{c('pastAssignments', { count: past.length })}</summary>
        <ul class="pp-list">
          {#each past as row (text(row, 'id'))}
            <li>
              <span class="pp-name">
                <span>{projectPickLabel({ project_number: row.project_number, name: row.project_name })}</span>
                <small>{c('since', { from: text(row, 'starts_on') || '—', to: text(row, 'ends_on') || '—' })}</small>
              </span>
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  </section>

  {#if canManage}
    <section class="pp-assign" aria-labelledby="pp-assign-title">
      <h3 id="pp-assign-title">{c('assignTitle')}</h3>
      <form
        method="POST"
        action="?view=team&/assignWorker"
        use:enhance={submitWith('assigned', () => (projectId = ''))}
        data-assign-form
      >
        <input type="hidden" name="workerId" value={personId} />
        <input type="hidden" name="assignmentRole" value="worker" />
        <div class="pp-fields">
          <label class="pp-wide"
            >{c('project')}<select name="projectId" bind:value={projectId} required data-assign-project>
              <option value="">{c('chooseProject')}</option>
              {#each assignable as project (text(project, 'id'))}
                <option value={text(project, 'id')}>{projectPickLabel(project)}</option>
              {/each}
            </select></label
          >
          {#if projectId}
            <label>{c('startsOn')}<input type="date" name="startsOn" bind:value={startsOn} required /></label>
            <label>{c('endsOnOptional')}<input type="date" name="endsOn" bind:value={endsOn} min={startsOn} /></label>
          {/if}
        </div>
        {#if projectId}
          <p class="pp-mode" data-assign-mode={mode}>
            {isOwner
              ? mode === 'defaults'
                ? c('modeDefaults')
                : mode === 'existing'
                  ? c('modeExisting')
                  : c('modeRates')
              : c('modeManager')}
          </p>
          {#if isOwner && mode === 'defaults'}
            <input type="hidden" name="useProjectDefaults" value="on" />
          {:else if isOwner && mode === 'existing'}
            <input type="hidden" name="useExistingFinanceRules" value="on" />
          {:else if isOwner}
            <div class="pp-fields">
              <label
                >{c('internalCost')} ({currency})<input
                  name="internalCostHourlyRate"
                  inputmode="decimal"
                  autocomplete="off"
                  placeholder="0.00"
                  bind:value={cost}
                  required
                /></label
              >
              <label
                >{c('payRate')} ({currency})<input
                  name="compensationRate"
                  inputmode="decimal"
                  autocomplete="off"
                  placeholder="0.00"
                  bind:value={pay}
                  required
                /></label
              >
              <label
                >{c('payBasis')}<select name="compensationBasis" bind:value={basis}>
                  <option value="hourly">{c('perHour')}</option>
                  <option value="daily">{c('perDay')}</option>
                </select></label
              >
            </div>
            <input type="hidden" name="financeEffectiveFrom" value={startsOn} />
            <input type="hidden" name="financeEffectiveTo" value={endsOn} />
          {/if}
        {/if}
        <div class="pp-actions">
          <button
            type="submit"
            class="primary-button"
            disabled={!projectId || status === 'saving'}
            data-assign-submit>{status === 'saving' ? c('saving') : c('assignButton')}</button
          >
        </div>
      </form>
    </section>
  {/if}
</div>

<style>
  .person-projects {
    display: grid;
    gap: 1.25rem;
  }
  h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }
  .pp-muted {
    margin: 0;
    color: var(--portal-muted, #5b6670);
  }
  .pp-message {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border-radius: 0.5rem;
    background: #eaf6ee;
    color: #17562f;
  }
  .pp-message--error {
    background: #fdecec;
    color: #8a1c1c;
  }
  .pp-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  .pp-list li {
    border: 1px solid var(--portal-border, #e3e8ec);
    border-radius: 0.6rem;
    padding: 0.6rem 0.75rem;
  }
  .pp-row {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .pp-name {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
  }
  .pp-name small {
    color: var(--portal-muted, #5b6670);
  }
  .pp-end {
    margin-top: 0.75rem;
    display: grid;
    gap: 0.5rem;
    border-top: 1px solid var(--portal-border, #e3e8ec);
    padding-top: 0.75rem;
  }
  .pp-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.75rem;
  }
  .pp-wide {
    grid-column: 1 / -1;
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
    box-sizing: border-box;
    width: 100%;
    font-weight: 400;
  }
  .pp-assign {
    border: 1px solid var(--portal-border, #e3e8ec);
    border-radius: 0.75rem;
    padding: 1rem;
    background: var(--portal-surface-subtle, #f8fafb);
  }
  .pp-assign form {
    display: grid;
    gap: 0.75rem;
  }
  .pp-mode {
    margin: 0;
    font-size: 0.9rem;
    color: var(--portal-muted, #5b6670);
  }
  .pp-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .pp-past summary {
    cursor: pointer;
    min-height: var(--ja-target-min, 2.75rem);
    display: flex;
    align-items: center;
  }
  @media (max-width: 640px) {
    .pp-actions > :global(button) {
      flex: 1 1 auto;
    }
  }
</style>
