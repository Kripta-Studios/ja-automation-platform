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
  let workerId = $derived(selectedWorkerId);
  const availableWorkers = $derived(workersWithExpertise(workers, workerExpertise, expertiseId));
  const availableExpertise = $derived(
    expertise.filter((item) => typeof item.id === 'string' && item.id.length > 0),
  );

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
      <option value={String(item.id)}>{String(item.name || item.code || item.id)}</option>
    {/each}
  </select>
</label>
<label class="expertise-worker-select__field">
  <span>{translate('Worker')}</span>
  <select name="workerId" required bind:value={workerId}>
    <option value="">{translate('Select worker')}</option>
    {#each availableWorkers as worker (String(worker.id))}
      <option value={String(worker.id)}>{String(worker.name || worker.id)}</option>
    {/each}
  </select>
  {#if availableWorkers.length === 0}
    <small role="status">{translate('No active workers match this expertise.')}</small>
  {/if}
</label>

<style>
  .expertise-worker-select__field {
    display: grid;
    gap: 0.4rem;
    min-width: 0;
  }

  .expertise-worker-select__field select {
    box-sizing: border-box;
    width: 100%;
    min-height: 2.75rem;
  }

  .expertise-worker-select__field select:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }

  .expertise-worker-select__field small {
    color: var(--muted, #526278);
  }
</style>
