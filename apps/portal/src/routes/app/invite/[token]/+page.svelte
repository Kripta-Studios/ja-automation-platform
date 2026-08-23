<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneText,
  } from '../../standalone-locale';
  import type { PortalLocale } from '$lib/portal-i18n';
  let { data }: { data: { token: string; locale?: PortalLocale } } = $props();
  let localeOverride = $state<PortalLocale | null>(null);
  const locale = $derived(
    localeOverride ?? data.locale ?? resolveStandaloneLocale($page.url.searchParams.get('lang')),
  );
  const t = (key: string): string => standaloneText(locale, key);
  let name = $state('');
  let password = $state('');
  let message = $state('');
  let busy = $state(false);
  async function accept() {
    busy = true;
    message = '';
    const response = await fetch(`${base}/app/api/invitations/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: data.token, name, password }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      accepted?: boolean;
      error?: string;
    };
    busy = false;
    message = result.accepted
      ? t('Account activated. You can sign in now.')
      : t('Invitation could not be activated.');
  }

  onMount(() => {
    localeOverride = resolveStandaloneLocale($page.url.searchParams.get('lang'), data.locale);
    persistStandaloneLocale(locale);
    applyStandaloneDocumentLocale(locale);
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'ja.portal.locale' || event.key === 'ja-portal-locale')
        localeOverride = resolveStandaloneLocale(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  });
  $effect(() => applyStandaloneDocumentLocale(locale));
</script>

<svelte:head><title>{t('Activate J&A account')}</title></svelte:head>
<main class="invite-page">
  <p class="portal-kicker">{t('J&A / INVITATION')}</p>
  <h1>{t('Activate your account')}</h1>
  <p>{t('Use a password of at least 12 characters. This invitation can be used once.')}</p>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      void accept();
    }}
  >
    <label>{t('Full name')}<input bind:value={name} autocomplete="name" required /></label>
    <label
      >{t('Password')}<input
        bind:value={password}
        type="password"
        minlength="12"
        autocomplete="new-password"
        required
      /></label
    >
    <button disabled={busy}>{busy ? t('Activating…') : t('Activate account')}</button>
  </form>
  {#if message}<p role="status">{message}</p>{/if}
  <a href={`${base}/app/login`}>{t('Return to sign in')}</a>
</main>
