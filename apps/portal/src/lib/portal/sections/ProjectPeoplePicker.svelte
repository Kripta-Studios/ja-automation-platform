<script lang="ts">
  import type { PortalRow } from '../portal-data';
  import { eligibleProjectWorkers, workersWithExpertise } from './project-worker-expertise';

  type Props = {
    workers: readonly PortalRow[];
    expertise: readonly PortalRow[];
    workerExpertise: readonly PortalRow[];
    selectedWorkerIds?: readonly string[];
    translate: (value: string) => string;
  };

  let { workers, expertise, workerExpertise, selectedWorkerIds = [], translate }: Props = $props();

  let expertiseId = $state('');
  const eligibleWorkers = $derived(eligibleProjectWorkers(workers));
  const matchingWorkerIds = $derived(
    new Set(
      workersWithExpertise(workers, workerExpertise, expertiseId).map((worker) =>
        String(worker.id),
      ),
    ),
  );
</script>

<fieldset class="project-people-picker wide-field">
  <legend>{translate('People (optional)')}</legend>
  <p class="form-help">
    {translate(
      'Choose workers now or leave the project without assignments. Set each person’s customer rate, pay and expense policy after creation.',
    )}
  </p>
  <label class="project-people-picker__filter">
    <span>{translate('Filter workers by expertise')}</span>
    <select bind:value={expertiseId}>
      <option value="">{translate('All expertise')}</option>
      {#each expertise as item (String(item.id))}
        <option value={String(item.id)}>{String(item.name || item.code || item.id)}</option>
      {/each}
    </select>
  </label>
  <div class="project-people-picker__list">
    {#each eligibleWorkers as worker (String(worker.id))}
      <label
        class="project-people-picker__choice"
        hidden={expertiseId !== '' && !matchingWorkerIds.has(String(worker.id))}
      >
        <input
          type="checkbox"
          name="initialWorkerId"
          value={String(worker.id)}
          checked={selectedWorkerIds.includes(String(worker.id))}
        />
        <span>{String(worker.name || worker.id)}</span>
      </label>
    {/each}
    {#if eligibleWorkers.length === 0 || (expertiseId !== '' && matchingWorkerIds.size === 0)}
      <p role="status" class="form-help">{translate('No active workers match this expertise.')}</p>
    {/if}
  </div>
</fieldset>

<style>
  .project-people-picker {
    min-width: 0;
    margin: 0;
    border: 1px solid var(--ja-control-border, #d6d5d2);
    border-radius: 0.6rem;
    padding: 0.85rem;
  }

  .project-people-picker legend {
    padding: 0 0.3rem;
    font-weight: 800;
  }

  .project-people-picker__filter {
    display: grid;
    gap: 0.4rem;
    max-width: 26rem;
  }

  .project-people-picker__list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
    gap: 0.45rem;
    max-height: 17rem;
    overflow-y: auto;
    margin-top: 0.75rem;
  }

  .project-people-picker__choice {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
    min-height: 2.75rem;
    padding: 0.4rem 0.55rem;
    border: 1px solid var(--ja-control-border, #d6d5d2);
    border-radius: 0.5rem;
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: none;
    letter-spacing: normal;
  }

  .project-people-picker__choice[hidden] {
    display: none;
  }

  .project-people-picker__choice input {
    width: 1.15rem;
    min-width: 1.15rem;
    height: 1.15rem;
    min-height: 1.15rem;
    margin: 0;
    padding: 0;
  }
</style>
