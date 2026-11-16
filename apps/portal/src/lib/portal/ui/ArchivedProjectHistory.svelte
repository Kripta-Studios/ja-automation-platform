<script lang="ts">
  import { includesArchivedProjectHistory } from '../project-visibility';
  import type { PortalLocale } from '../../portal-i18n';

  /**
   * A small "Include archived" list filter. It is not rendered at all when the
   * account has no archived projects (and the filter is not already on), so it
   * never adds a permanent banner to every page.
   */
  let {
    url,
    locale,
    context,
    archivedCount = 0,
  }: {
    url: URL;
    locale: PortalLocale;
    context?: 'client' | 'team';
    archivedCount?: number;
  } = $props();
  const copy = {
    en: {
      include: 'Include archived',
      projects: 'archived projects',
      client: 'in client history',
      team: 'in team history',
      on: 'Archived projects included',
    },
    es: {
      include: 'Incluir archivados',
      projects: 'proyectos archivados',
      client: 'en el historial de clientes',
      team: 'en el historial del equipo',
      on: 'Proyectos archivados incluidos',
    },
    pt: {
      include: 'Incluir arquivados',
      projects: 'projetos arquivados',
      client: 'no histórico de clientes',
      team: 'no histórico da equipe',
      on: 'Projetos arquivados incluídos',
    },
  };
  const t = $derived(copy[locale] ?? copy.en);
  const history = $derived(includesArchivedProjectHistory(url.searchParams));
  const href = $derived.by(() => {
    const next = new URL(url);
    if (history) next.searchParams.delete('includeArchived');
    else next.searchParams.set('includeArchived', '1');
    return `${next.pathname}${next.search}${next.hash}`;
  });
  const description = $derived(
    [`${archivedCount} ${t.projects}`, context ? t[context] : ''].filter(Boolean).join(' '),
  );
</script>

{#if history || archivedCount > 0}
  <div class="archived-filter no-print" data-archived-project-history>
    <a
      {href}
      role="switch"
      aria-checked={history}
      aria-label={history ? t.on : `${t.include} · ${description}`}
      title={description}
      data-sveltekit-noscroll
    >
      <span class="archived-box" aria-hidden="true">{history ? '✓' : ''}</span>
      <span>{t.include}</span>
      {#if archivedCount > 0}<span class="archived-count">{archivedCount}</span>{/if}
    </a>
  </div>
{/if}

<style>
  .archived-filter {
    display: flex;
    justify-content: flex-end;
    min-width: 0;
  }
  a {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    padding: 0.35rem 0.25rem;
    color: var(--ja-text-secondary, #56574f);
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
  }
  a:hover {
    color: var(--ja-ink, #24251f);
  }
  a:focus-visible {
    outline: 2px solid var(--ja-border-focus, #2349b5);
    outline-offset: 2px;
    border-radius: 0.35rem;
  }
  .archived-box {
    display: inline-grid;
    place-items: center;
    width: 1.1rem;
    height: 1.1rem;
    border: 1.5px solid currentColor;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    line-height: 1;
  }
  a[aria-checked='true'] .archived-box {
    color: #fff;
    background: var(--ja-ink, #24251f);
    border-color: var(--ja-ink, #24251f);
  }
  .archived-count {
    min-width: 1.4rem;
    padding: 0 0.35rem;
    border-radius: 999px;
    background: var(--ja-canvas, #f3f3ef);
    color: var(--ja-text-secondary, #56574f);
    font-size: 0.75rem;
    text-align: center;
  }
</style>
