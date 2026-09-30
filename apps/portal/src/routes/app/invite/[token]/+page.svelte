<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount, tick } from 'svelte';
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
  let messageKey = $state('');
  let activated = $state(false);
  let busy = $state(false);
  let retrySeconds = $state(0);
  let retryTimer: ReturnType<typeof setInterval> | undefined;
  let feedbackElement = $state<HTMLParagraphElement>();
  const activationUnconfirmed =
    'We could not confirm activation. Check your connection and try again. If you already activated the account, return to sign in.';
  async function accept() {
    if (busy || activated || retrySeconds > 0) return;
    busy = true;
    messageKey = '';
    try {
      if (!navigator.onLine) {
        messageKey =
          'You are offline. Reconnect and try again. Your name and password are still in the form.';
        return;
      }
      const response = await fetch(`${base}/app/api/invitations/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: data.token, name, password }),
      });
      const result = (await response.json().catch(() => null)) as {
        accepted?: boolean;
        error?: string;
      } | null;
      if (response.ok && result?.accepted === true) {
        activated = true;
        messageKey = 'Account activated. You can sign in now.';
      } else if (response.status === 429) {
        messageKey =
          'Too many activation attempts. Wait before trying again. Your name and password are still in the form.';
        const retryAfter = response.headers.get('retry-after')?.trim() ?? '';
        const waitMs = /^\d+$/u.test(retryAfter)
          ? Number(retryAfter) * 1000
          : Math.max(0, Date.parse(retryAfter) - Date.now());
        if (Number.isFinite(waitMs) && waitMs > 0) {
          const retryAt = Date.now() + waitMs;
          retrySeconds = Math.ceil(waitMs / 1000);
          if (retryTimer) clearInterval(retryTimer);
          retryTimer = setInterval(() => {
            retrySeconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
            if (retrySeconds === 0) clearInterval(retryTimer);
          }, 250);
        }
      } else if (
        response.status === 503 &&
        result?.error === 'Activation temporarily unavailable'
      ) {
        messageKey =
          'Activation is temporarily unavailable. Please try again. Your name and password are still in the form.';
      } else if (response.status === 400 && result?.error === 'Invitation details are invalid') {
        messageKey = 'Check your full name and password, then try again.';
      } else if (response.status === 400 && result?.error === 'Invitation could not be activated') {
        messageKey =
          'This invitation could not be activated. It may have expired or already been used. Return to sign in if you activated it, or ask an owner for a new invitation.';
      } else {
        messageKey = activationUnconfirmed;
      }
    } catch {
      messageKey = activationUnconfirmed;
    } finally {
      busy = false;
      if (messageKey && !activated) {
        await tick();
        feedbackElement?.focus();
      }
    }
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
    return () => {
      window.removeEventListener('storage', onStorage);
      if (retryTimer) clearInterval(retryTimer);
    };
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
    <button disabled={busy || activated || retrySeconds > 0}
      >{busy ? t('Activating…') : t('Activate account')}</button
    >
    {#if retrySeconds > 0}<p>
        {standaloneText(locale, 'Try again in {seconds} seconds.', { seconds: retrySeconds })}
      </p>{/if}
  </form>
  {#if messageKey}<p
      bind:this={feedbackElement}
      role={activated ? 'status' : 'alert'}
      tabindex="-1"
    >
      {t(messageKey)}
    </p>{/if}
  <a href={`${base}/app/login`}>{t('Return to sign in')}</a>
</main>
