<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneText,
  } from './standalone-locale';
  import type { PortalLocale } from '$lib/portal-i18n';

  const locale = $derived(
    resolveStandaloneLocale(
      $page.url.searchParams.get('lang'),
      ($page.data as { locale?: PortalLocale }).locale,
    ),
  );
  const status = $derived($page.status);
  const translate = (key: string): string => standaloneText(locale, key);
  const title = $derived(
    status === 404 ? standaloneText(locale, 'No results') : standaloneText(locale, 'Error'),
  );
  const genericFailure = $derived(standaloneText(locale, 'action.error.unavailable'));
  const description = $derived(
    status === 404
      ? translate('No records match that search in your access scope.')
      : genericFailure,
  );
  const sectionLabel = $derived.by(() => {
    const code = String($page.error?.message ?? '');
    if (code.includes('project')) return translate('Projects');
    if (code.includes('report')) return translate('Reports');
    if (code.includes('timeEntry')) return translate('Time');
    if (code.includes('expense')) return translate('Expenses');
    if (code.includes('invoice')) return translate('Invoices');
    if (code.includes('notification')) return translate('Notifications');
    return translate('Portal');
  });

  onMount(() => {
    persistStandaloneLocale(locale);
    applyStandaloneDocumentLocale(locale);
  });
  $effect(() => applyStandaloneDocumentLocale(locale));
</script>

<svelte:head><title>{title} · J&A Automation</title></svelte:head>

<main class="record-detail-page error-page">
  <nav class="detail-nav no-print" aria-label={translate('Portal navigation')}>
    <a href={`${base}/app/`}>← {standaloneText(locale, 'Dashboard')}</a>
    <span>{sectionLabel}</span>
  </nav>
  <section class="detail-panel" role="alert">
    <p class="portal-kicker">{sectionLabel}</p>
    <h1>{title}</h1>
    <p>{description}</p>
    <a class="secondary-button" href={`${base}/app/`}>{standaloneText(locale, 'Back')}</a>
  </section>
</main>
