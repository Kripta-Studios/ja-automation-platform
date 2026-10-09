<script lang="ts">
  let {
    base,
    projectId,
    projectNumber,
    initialAssignmentCount = 0,
    translate,
  }: {
    base: string;
    projectId: string;
    projectNumber: string;
    initialAssignmentCount?: number;
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
  <p>
    {translate(
      initialAssignmentCount > 0
        ? 'Worker assignments and their terms were saved with this project. Review them or add more people.'
        : 'Now add people and configure how their work and expenses are calculated.',
    )}
  </p>
  <a class="primary-button" href={`${projectPath}?tab=work`}>{translate('Open project')}</a>
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

  a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.75rem;
    font-weight: 700;
  }
</style>
