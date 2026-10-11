<script lang="ts">
  import { includesArchivedProjectHistory } from '../project-visibility';
  import type { PortalLocale } from '../../portal-i18n';

  let { url, locale, context }: { url: URL; locale: PortalLocale; context?: 'client' | 'team' } =
    $props();
  const copy = {
    en: {
      current: 'Archived projects are hidden.',
      history: 'Archived project history is included.',
      show: 'Include archived projects',
      hide: 'Hide archived projects',
      client: 'Client project history',
      team: 'Team project history',
    },
    es: {
      current: 'Los proyectos archivados están ocultos.',
      history: 'Se incluye el historial de proyectos archivados.',
      show: 'Incluir proyectos archivados',
      hide: 'Ocultar proyectos archivados',
      client: 'Historial de proyectos del cliente',
      team: 'Historial de proyectos del equipo',
    },
    pt: {
      current: 'Os projetos arquivados estão ocultos.',
      history: 'O histórico de projetos arquivados está incluído.',
      show: 'Incluir projetos arquivados',
      hide: 'Ocultar projetos arquivados',
      client: 'Histórico de projetos do cliente',
      team: 'Histórico de projetos da equipe',
    },
  };
  const history = $derived(includesArchivedProjectHistory(url.searchParams));
  const href = $derived.by(() => {
    const next = new URL(url);
    if (history) {
      next.searchParams.delete('includeArchived');
    } else next.searchParams.set('includeArchived', '1');
    return `${next.pathname}${next.search}${next.hash}`;
  });
</script>

{#snippet controls()}
  <span>{history ? copy[locale].history : copy[locale].current}</span>
  <a class="secondary-button" {href}>{history ? copy[locale].hide : copy[locale].show}</a>
{/snippet}

{#if context}
  <details class="project-history-mode contextual-history" data-archived-project-history>
    <summary
      >{copy[locale][context]}{#if history}
        · {copy[locale].history}{/if}</summary
    >
    <div class="history-controls">{@render controls()}</div>
  </details>
{:else}
  <div class="project-history-mode" data-archived-project-history>{@render controls()}</div>
{/if}

<style>
  .project-history-mode {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-width: 0;
    margin-bottom: 1rem;
    padding: 0.85rem 1rem;
    border: 1px solid var(--ja-border-strong, #d1d1c9);
    border-radius: var(--ja-control-radius, 0.625rem);
    background: var(--ja-surface, white);
  }
  span,
  a {
    max-width: 100%;
    overflow-wrap: anywhere;
  }
  .contextual-history {
    display: block;
    padding-block: 0.35rem;
  }
  summary {
    padding-block: 0.65rem;
    min-height: 44px;
    cursor: pointer;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .history-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding-block: 0.5rem;
  }
</style>
