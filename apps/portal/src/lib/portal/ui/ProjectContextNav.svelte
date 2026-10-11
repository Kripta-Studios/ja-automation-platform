<script lang="ts">
  import { base } from '$app/paths';
  import type { PortalLocale } from '$lib/portal-i18n';
  import type { PortalRow } from '../portal-data';
  import { uxText } from '../ux-refresh-copy';

  let {
    project,
    current,
    locale = 'en',
  }: {
    project?: PortalRow;
    current: 'time' | 'expenses' | 'reports';
    locale?: PortalLocale;
  } = $props();
  const sections = ['time', 'expenses', 'reports'] as const;
</script>

{#if project?.id}
  <nav class="project-context-nav no-print" aria-label={uxText(locale, 'relatedWork')}>
    <a
      class="project-context-nav__identity"
      href={`${base}/app/projects/${encodeURIComponent(String(project.id))}?lang=${locale}`}
    >
      <small>{uxText(locale, 'projectWorkspace')}</small>
      <strong>{[project.project_number, project.name].filter(Boolean).join(' · ')}</strong>
    </a>
    <div>
      {#each sections.filter((section) => section !== current) as section}
        <a
          class="secondary-button"
          href={`${base}/app/${section}?project=${encodeURIComponent(String(project.id))}&lang=${locale}`}
          >{uxText(locale, section)} <span aria-hidden="true">↗</span></a
        >
      {/each}
    </div>
  </nav>
{/if}

<style>
  .project-context-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.75rem;
    padding: 1rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.85rem;
    background: var(--portal-surface, #fff);
  }
  .project-context-nav__identity {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    min-height: 44px;
    color: inherit;
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .project-context-nav__identity small {
    color: var(--portal-muted, #67675f);
  }
  .project-context-nav__identity:hover strong {
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  .project-context-nav > div {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .project-context-nav a:focus-visible {
    outline: 3px solid var(--portal-accent, #53524c);
    outline-offset: 3px;
  }
  @media (max-width: 480px) {
    .project-context-nav > div {
      width: 100%;
    }
    .project-context-nav > div a {
      flex: 1;
    }
  }
</style>
