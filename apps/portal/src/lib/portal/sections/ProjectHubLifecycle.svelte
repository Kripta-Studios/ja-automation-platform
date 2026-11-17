<script lang="ts">
  /**
   * Project hub Settings › "Close the project": the lifecycle step that fits the
   * current status (Begin close → Close project with a close date → Reactivate).
   * Owner decision 2026-11-17: finance_admin may also begin close and close a
   * project (the server's transitionProject already accepts finance), with the
   * same reason + confirmation and the same audit. Reactivation stays owner-only:
   * the repository rejects it for every other role, so it is only shown to the owner.
   * Writes go through the existing projects ?/transitionProject action.
   */
  import { base } from '$app/paths';
  import { deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { hubText, type ProjectHubCopyKey } from '$lib/portal/project-hub-copy';

  let {
    projectId,
    projectName,
    status,
    version,
    locale,
    role,
    today,
    describe,
    notify,
  }: {
    projectId: string;
    projectName: string;
    status: string;
    version: number;
    locale: string;
    role: string;
    today: string;
    describe: (result: unknown) => string;
    notify: (message: string, variant: 'success' | 'danger') => void;
  } = $props();

  const h = (key: ProjectHubCopyKey, params: Record<string, string | number> = {}) =>
    hubText(locale, key, params);
  const isOwner = $derived(role === 'owner_admin');
  const canClose = $derived(role === 'owner_admin' || role === 'finance_admin');

  type Step = 'closing' | 'closed' | 'active';
  const next = $derived<Step | null>(
    !canClose
      ? null
      : status === 'active' || status === 'paused'
        ? 'closing'
        : status === 'closing'
          ? 'closed'
          : null,
  );
  const canReactivate = $derived(isOwner && (status === 'closing' || status === 'closed'));

  let open = $state<Step | null>(null);
  let reason = $state('');
  let closeDate = $state('');
  let busy = $state(false);

  function start(step: Step) {
    open = open === step ? null : step;
    reason = '';
    closeDate = today;
  }

  async function confirm(event: SubmitEvent) {
    event.preventDefault();
    if (!open || busy || !reason.trim()) return;
    busy = true;
    const body = new FormData();
    body.set('projectId', projectId);
    body.set('version', String(version));
    body.set('status', open);
    body.set('reason', reason.trim());
    if (open === 'closed') body.set('closeDate', closeDate);
    try {
      const response = await fetch(`${base}/app/projects?/transitionProject`, {
        method: 'POST',
        body,
        headers: { 'x-sveltekit-action': 'true', accept: 'application/json' },
      });
      const result = deserialize(await response.text());
      if (result.type === 'success') {
        notify(
          h(open === 'closing' ? 'lifeClosingDone' : open === 'closed' ? 'lifeClosedDone' : 'lifeReactivated'),
          'success',
        );
        open = null;
        await invalidateAll();
      } else notify(describe(result.type === 'failure' ? result.data : null), 'danger');
    } catch {
      notify(describe(null), 'danger');
    } finally {
      busy = false;
    }
  }
</script>

{#if next || canReactivate}
  <div class="hub-lifecycle" data-hub-lifecycle>
    <div class="hub-lifecycle__actions">
      {#if next === 'closing'}
        <button
          type="button"
          class="secondary-button"
          aria-expanded={open === 'closing'}
          data-hub-life="closing"
          onclick={() => start('closing')}>{h('lifeBeginClose')}</button
        >
      {:else if next === 'closed'}
        <button
          type="button"
          class="secondary-button"
          aria-expanded={open === 'closed'}
          data-hub-life="closed"
          onclick={() => start('closed')}>{h('lifeClose')}</button
        >
      {/if}
      {#if canReactivate}
        <button
          type="button"
          class="quiet-button"
          aria-expanded={open === 'active'}
          data-hub-life="active"
          onclick={() => start('active')}>{h('lifeReactivate')}</button
        >
      {/if}
    </div>
    {#if open}
      <form class="hub-lifecycle__confirm" onsubmit={confirm} data-hub-life-form={open}>
        <strong>
          {h(
            open === 'closing'
              ? 'lifeBeginCloseTitle'
              : open === 'closed'
                ? 'lifeCloseTitle'
                : 'lifeReactivateTitle',
            { name: projectName },
          )}
        </strong>
        <p>{h(open === 'active' ? 'lifeReactivateHelp' : 'lifeCloseHelp')}</p>
        {#if open === 'closed'}
          <label
            >{h('lifeCloseDate')}<input
              type="date"
              required
              max={today}
              bind:value={closeDate}
              data-hub-life-date
            /></label
          >
        {/if}
        <label
          >{h('reason')}<input
            required
            maxlength="2000"
            bind:value={reason}
            data-hub-life-reason
          /></label
        >
        <div class="hub-lifecycle__buttons">
          <button type="button" class="secondary-button" onclick={() => (open = null)}
            >{h('cancel')}</button
          >
          <button
            type="submit"
            class="primary-button"
            disabled={busy || !reason.trim()}
            data-hub-life-confirm
            >{h(
              open === 'closing' ? 'lifeBeginClose' : open === 'closed' ? 'lifeClose' : 'lifeReactivate',
            )}</button
          >
        </div>
      </form>
    {/if}
  </div>
{/if}

<style>
  .hub-lifecycle {
    display: grid;
    gap: 0.75rem;
  }
  .hub-lifecycle__actions,
  .hub-lifecycle__buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .hub-lifecycle__confirm {
    display: grid;
    gap: 0.6rem;
    padding: 0.9rem 1rem;
    border: 1px solid #f5c26b;
    border-radius: 0.6rem;
    background: #fffaeb;
  }
  .hub-lifecycle__confirm p {
    margin: 0;
  }
  .hub-lifecycle__confirm label {
    display: grid;
    gap: 0.25rem;
    font-weight: 600;
  }
  .hub-lifecycle__confirm input {
    min-height: 2.75rem;
  }
</style>
