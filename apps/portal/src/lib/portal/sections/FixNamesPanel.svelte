<script lang="ts">
  /**
   * Owner tool: people whose stored name is a login ("gabriel.lamoglia") get a
   * proposed name from their e-mail ("Gabriel Lamoglia"). The owner accepts all
   * or edits individually; the server saves through the audited profile update.
   */
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { SvelteSet } from 'svelte/reactivity';
  import type { SubmitFunction } from '@sveltejs/kit';
  import type { PortalRow } from '../portal-data';
  import { proposedPersonName } from '../person-name';
  import { teamCopy, type TeamCopyKey } from '../team-ux-copy';

  let {
    workers,
    locale,
    onclose,
  }: { workers: PortalRow[]; locale: string; onclose?: () => void } = $props();

  const c = (key: TeamCopyKey, params: Record<string, string | number> = {}) =>
    teamCopy(locale, key, params);

  const candidates = $derived(
    workers
      .filter(
        (worker) =>
          String(worker.status ?? 'active') === 'active' &&
          String(worker.email ?? '').toLowerCase() !== 'antonny.luty@j-aautomation.com',
      )
      .map((worker) => ({
        id: String(worker.id ?? ''),
        current: String(worker.name ?? ''),
        email: String(worker.email ?? ''),
        proposed: proposedPersonName(worker.name, worker.email),
      }))
      .filter((row) => row.id && row.proposed),
  );
  const edited = $state<Record<string, string>>({});
  const selected = new SvelteSet<string>();
  let initialized = false;
  $effect(() => {
    if (initialized || !candidates.length) return;
    initialized = true;
    for (const row of candidates) selected.add(row.id);
  });
  const allSelected = $derived(candidates.length > 0 && candidates.every((row) => selected.has(row.id)));
  let status = $state<'idle' | 'saving' | 'done' | 'error'>('idle');
  let message = $state('');

  function toggleAll(): void {
    if (allSelected) selected.clear();
    else for (const row of candidates) selected.add(row.id);
  }

  const submit: SubmitFunction = ({ formData }) => {
    status = 'saving';
    formData.delete('workerId');
    formData.delete('name');
    let count = 0;
    for (const row of candidates) {
      if (!selected.has(row.id)) continue;
      formData.append('workerId', row.id);
      formData.append('name', (edited[row.id] ?? row.proposed).trim());
      count += 1;
    }
    return async ({ result }) => {
      if (result.type === 'success') {
        status = 'done';
        message = c('fixSaved', { count });
        selected.clear();
        initialized = false;
        await invalidateAll();
      } else {
        status = 'error';
        const data = (result.type === 'failure' ? result.data : null) as { message?: string } | null;
        message = c('failed', { message: data?.message ?? '' });
      }
    };
  };
</script>

<section class="fix-names" aria-labelledby="fix-names-title" data-fix-names>
  <header>
    <div>
      <h3 id="fix-names-title">{c('fixTitle')}</h3>
      <p>{c('fixIntro')}</p>
    </div>
    {#if onclose}
      <button type="button" class="secondary-button" onclick={onclose}>{c('closeAdd')}</button>
    {/if}
  </header>
  {#if message}
    <p class="fix-names__message" class:fix-names__message--error={status === 'error'} role="status">
      {message}
    </p>
  {/if}
  {#if candidates.length === 0}
    <p class="fix-names__none">{c('fixNone')}</p>
  {:else}
    <form method="POST" action="?view=team&/fixPersonNames" use:enhance={submit}>
      <label class="fix-names__all">
        <input type="checkbox" checked={allSelected} onchange={toggleAll} />
        {c('fixSelectAll')} ({candidates.length})
      </label>
      <ul class="fix-names__list">
        {#each candidates as row (row.id)}
          <li data-fix-name-row={row.id}>
            <label class="fix-names__check">
              <input
                type="checkbox"
                checked={selected.has(row.id)}
                aria-label={`${c('fixUse')} ${row.current}`}
                onchange={(event) =>
                  event.currentTarget.checked ? selected.add(row.id) : selected.delete(row.id)}
              />
            </label>
            <span class="fix-names__current">
              <small>{c('fixCurrent')}</small>
              <code>{row.current || row.email}</code>
            </span>
            <label class="fix-names__new">
              <small>{c('fixNew')}</small>
              <input
                value={edited[row.id] ?? row.proposed}
                maxlength="160"
                minlength="2"
                oninput={(event) => {
                  edited[row.id] = event.currentTarget.value;
                  selected.add(row.id);
                }}
              />
            </label>
          </li>
        {/each}
      </ul>
      <div class="fix-names__actions">
        <button
          type="submit"
          class="primary-button"
          disabled={selected.size === 0 || status === 'saving'}
          data-fix-names-save
          >{status === 'saving' ? c('saving') : c('fixSave', { count: selected.size })}</button
        >
      </div>
    </form>
  {/if}
</section>

<style>
  .fix-names {
    border: 1px solid var(--portal-border, #d8dee4);
    border-radius: 0.75rem;
    background: var(--portal-surface, #fff);
    padding: 1rem;
    display: grid;
    gap: 0.75rem;
  }
  header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }
  h3 {
    margin: 0 0 0.25rem;
    font-size: 1.05rem;
  }
  header p,
  .fix-names__none {
    margin: 0;
    color: var(--portal-muted, #5b6670);
  }
  .fix-names__message {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border-radius: 0.5rem;
    background: #eaf6ee;
    color: #17562f;
  }
  .fix-names__message--error {
    background: #fdecec;
    color: #8a1c1c;
  }
  .fix-names__all {
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
    min-height: var(--ja-target-min, 2.75rem);
    font-weight: 600;
  }
  .fix-names__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
    max-height: 26rem;
    overflow: auto;
  }
  li {
    display: grid;
    grid-template-columns: 2.75rem minmax(0, 1fr) minmax(0, 1.3fr);
    gap: 0.5rem;
    align-items: center;
    padding: 0.35rem 0;
    border-bottom: 1px solid var(--portal-border, #eef1f4);
  }
  .fix-names__check {
    display: grid;
    place-items: center;
    min-height: var(--ja-target-min, 2.75rem);
  }
  .fix-names__current,
  .fix-names__new {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }
  small {
    color: var(--portal-muted, #5b6670);
    font-size: 0.75rem;
  }
  code {
    overflow-wrap: anywhere;
    font-size: 0.85rem;
  }
  .fix-names__new input {
    min-height: var(--ja-target-min, 2.75rem);
    width: 100%;
    box-sizing: border-box;
  }
  .fix-names__actions {
    display: flex;
    justify-content: flex-end;
  }
  @media (max-width: 640px) {
    li {
      grid-template-columns: 2.75rem minmax(0, 1fr);
    }
    .fix-names__new {
      grid-column: 2;
    }
    header {
      flex-direction: column;
    }
  }
</style>
