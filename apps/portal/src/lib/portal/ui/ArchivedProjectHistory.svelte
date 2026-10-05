<script lang="ts">
  import { includesArchivedProjectHistory } from '../project-visibility';
  import type { PortalLocale } from '../../portal-i18n';

  let { url, locale }: { url: URL; locale: PortalLocale } = $props();
  const copy = {
    en: {
      current: 'Archived projects are hidden.',
      history: 'Archived project history is included.',
      show: 'Include archived projects',
      hide: 'Hide archived projects',
    },
    es: {
      current: 'Los proyectos archivados están ocultos.',
      history: 'Se incluye el historial de proyectos archivados.',
      show: 'Incluir proyectos archivados',
      hide: 'Ocultar proyectos archivados',
    },
    pt: {
      current: 'Os projetos arquivados estão ocultos.',
      history: 'O histórico de projetos arquivados está incluído.',
      show: 'Incluir projetos arquivados',
      hide: 'Ocultar projetos arquivados',
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

<div class="project-history-mode" data-archived-project-history>
  <span>{history ? copy[locale].history : copy[locale].current}</span>
  <a class="secondary-button" {href}>{history ? copy[locale].hide : copy[locale].show}</a>
</div>

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
</style>
