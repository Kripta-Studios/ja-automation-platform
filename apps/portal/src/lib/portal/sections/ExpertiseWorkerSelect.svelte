<script lang="ts">
  import type { PortalRow } from '../portal-data';
  import { workersWithExpertise } from './project-worker-expertise';

  type Props = {
    workers: readonly PortalRow[];
    expertise: readonly PortalRow[];
    workerExpertise: readonly PortalRow[];
    selectedWorkerId?: string;
    translate: (value: string) => string;
  };

  let { workers, expertise, workerExpertise, selectedWorkerId = '', translate }: Props = $props();

  let expertiseId = $state('');
  let workerSearch = $state('');
  let workerId = $derived(selectedWorkerId);
  let workerSelect: HTMLSelectElement;
  const availableWorkers = $derived(workersWithExpertise(workers, workerExpertise, expertiseId));
  const eligibleWorkers = $derived(workersWithExpertise(workers, workerExpertise, ''));
  const duplicateNames = $derived(
    eligibleWorkers.reduce((names, worker) => {
      const name = String(worker.name ?? '').trim().toLocaleLowerCase();
      if (name) names.set(name, (names.get(name) ?? 0) + 1);
      return names;
    }, new Map<string, number>()),
  );
  const searchTerm = $derived(workerSearch.trim().toLocaleLowerCase());
  const matchingWorkers = $derived(
    availableWorkers.filter((worker) =>
      `${String(worker.name ?? '')} ${String(worker.email ?? '')}`
        .toLocaleLowerCase()
        .includes(searchTerm),
    ),
  );
  // Keep an already chosen worker in the native select while searching. A
  // search narrows choices; it must not silently discard an unsaved assignment.
  const selectedAvailableWorker = $derived(
    availableWorkers.find((worker) => String(worker.id) === workerId),
  );
  const visibleWorkers = $derived(
    selectedAvailableWorker && !matchingWorkers.some((worker) => worker.id === workerId)
      ? [selectedAvailableWorker, ...matchingWorkers]
      : matchingWorkers,
  );
  const unavailableSelectedWorker = $derived(
    Boolean(workerId) && !eligibleWorkers.some((worker) => String(worker.id) === workerId),
  );
  const availableExpertise = $derived(
    expertise.filter((item) => typeof item.id === 'string' && item.id.length > 0),
  );

  function workerLabel(worker: PortalRow): string {
    const name = String(worker.name ?? '').trim();
    const email = String(worker.email ?? '').trim();
    if (name && email && name.toLocaleLowerCase() !== email.toLocaleLowerCase())
      return `${name} · ${email}`;
    if (name && (duplicateNames.get(name.toLocaleLowerCase()) ?? 0) > 1)
      return `${name} · ${String(worker.id).slice(0, 8)}`;
    return name || email || translate('Worker');
  }

  function selectExpertise(event: Event): void {
    expertiseId = (event.currentTarget as HTMLSelectElement).value;
    if (
      !workersWithExpertise(workers, workerExpertise, expertiseId).some(
        (worker) => worker.id === workerId,
      )
    ) {
      workerId = '';
    }
  }

  $effect(() => {
    workerSelect?.setCustomValidity(
      unavailableSelectedWorker ? translate('Choose an active worker.') : '',
    );
  });
</script>

<label class="expertise-worker-select__field">
  <span>{translate('Expertise')}</span>
  <select
    aria-label={translate('Filter workers by expertise')}
    value={expertiseId}
    onchange={selectExpertise}
  >
    <option value="">{translate('All expertise')}</option>
    {#each availableExpertise as item (String(item.id))}
      <option value={String(item.id)}
        >{String(item.name || item.code || translate('Expertise'))}</option
      >
    {/each}
  </select>
</label>
<label class="expertise-worker-select__field">
  <span>{translate('Search workers')}</span>
  <input
    type="search"
    bind:value={workerSearch}
    placeholder={translate('Name or email')}
    autocomplete="off"
  />
</label>
<label class="expertise-worker-select__field">
  <span>{translate('Worker')}</span>
  <select
    bind:this={workerSelect}
    name="workerId"
    required
    bind:value={workerId}
    aria-invalid={unavailableSelectedWorker}
    aria-describedby={unavailableSelectedWorker ? 'assignment-worker-unavailable' : undefined}
  >
    <option value="">{translate('Select worker')}</option>
    {#if unavailableSelectedWorker}
      <option value={workerId} disabled>
        {translate('Previously selected worker')} · {translate('Unavailable')}
      </option>
    {/if}
    {#each visibleWorkers as worker (String(worker.id))}
      <option value={String(worker.id)}
        >{workerLabel(worker)}</option
      >
    {/each}
  </select>
  {#if unavailableSelectedWorker}
    <small id="assignment-worker-unavailable" role="status"
      >{translate('Choose an active worker.')}</small
    >
  {/if}
  {#if availableWorkers.length === 0}
    <small role="status">{translate('No active workers match this expertise.')}</small>
  {:else if searchTerm && matchingWorkers.length === 0}
    <small role="status">{translate('No workers match this search.')}</small>
  {/if}
</label>

<style>
  .expertise-worker-select__field {
    display: grid;
    gap: 0.4rem;
    min-width: 0;
  }

  .expertise-worker-select__field select,
  .expertise-worker-select__field input {
    box-sizing: border-box;
    width: 100%;
    min-height: 2.75rem;
  }

  .expertise-worker-select__field select:focus-visible,
  .expertise-worker-select__field input:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }

  .expertise-worker-select__field small {
    color: var(--muted, #526278);
  }
</style>
