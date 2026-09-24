<script lang="ts">
  let {
    base,
    projectId,
    projectNumber,
    canAssignWorkers,
    translate,
  }: {
    base: string;
    projectId: string;
    projectNumber: string;
    canAssignWorkers: boolean;
    translate: (value: string) => string;
  } = $props();

  const projectPath = $derived(`${base}/app/projects/${encodeURIComponent(projectId)}`);
</script>

<section
  class="project-setup-next"
  aria-label={translate('Continue project setup')}
  data-project-setup-next
>
  <h2>{translate('Project created')} · {projectNumber}</h2>
  <p>{translate('Now add people and configure how their work and expenses are calculated.')}</p>
  <ol>
    <li>
      <strong>{translate('Basics')}</strong>
      <span>{translate('Saved')}</span>
    </li>
    <li>
      <strong>{translate('People')}</strong>
      {#if canAssignWorkers}
        <a
          href={`${base}/app/projects?action=assign-worker&project=${encodeURIComponent(projectId)}`}
          >{translate('Assign workers by expertise')}</a
        >
      {:else}
        <a href={`${projectPath}?tab=team`}>{translate('Review assigned people')}</a>
      {/if}
    </li>
    <li>
      <strong>{translate('Commercial terms')}</strong>
      <a href={`${base}/app/finance?view=commercial&project=${encodeURIComponent(projectId)}`}
        >{translate('Configure per-person rates and expenses')}</a
      >
    </li>
    <li>
      <strong>{translate('Review')}</strong>
      <a href={`${projectPath}?tab=commercial`}>{translate('Review project configuration')}</a>
    </li>
  </ol>
  <p class="form-help">
    {translate(
      'Time can be recorded while commercial terms are incomplete. Billing waits for the required rates and policies.',
    )}
  </p>
</section>

<style>
  .project-setup-next {
    padding: 1rem;
    margin-bottom: 1rem;
    border: 1px solid var(--ja-border-strong, #d6d5d2);
    border-radius: var(--ja-radius, 1rem);
    background: var(--ja-surface-raised, #f5f5f4);
  }

  h2,
  p {
    margin-top: 0;
  }

  ol {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
    gap: 0.75rem;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px solid var(--ja-border-subdued, #e7e7e5);
    border-radius: 0.65rem;
    background: white;
  }

  a {
    display: flex;
    align-items: center;
    min-height: 2.75rem;
    font-weight: 700;
  }
</style>
