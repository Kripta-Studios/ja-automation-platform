<script lang="ts">
  import '../portal.css';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { resolvePortalLocalePreference } from '$lib/i18n/context';
  import { installSearchableSelects } from '$lib/portal/searchable-selects';
  let { children } = $props();
  const developmentCredit = {
    en: 'Developed by Álvaro Schwiedop Souto',
    es: 'Desarrollado por Álvaro Schwiedop Souto',
    pt: 'Desenvolvido por Álvaro Schwiedop Souto',
  } as const;
  const locale = $derived(
    resolvePortalLocalePreference($page.url.searchParams.get('lang'), $page.data.locale),
  );
  onMount(() => installSearchableSelects(document.body));
</script>

{@render children()}
<footer class="portal-development-credit">
  {developmentCredit[locale]}
</footer>

<style>
  .portal-development-credit {
    text-align: center;
    font-size: 0.75rem;
    opacity: 0.72;
    padding: 0.75rem 1rem 1rem;
  }
</style>
