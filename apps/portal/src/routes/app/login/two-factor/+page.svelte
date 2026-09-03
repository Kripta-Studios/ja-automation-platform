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
  let { data } = $props<{ data: { locale?: PortalLocale } }>();
  let localeOverride = $state<PortalLocale | null>(null);
  const locale = $derived(
    localeOverride ?? data.locale ?? resolveStandaloneLocale($page.url.searchParams.get('lang')),
  );
  const t = (key: string): string => standaloneText(locale, key);
  let error = $state('');
  let backupCode = $state(false);
  async function verify(event: SubmitEvent) {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const response = await fetch(
      base + '/app/api/auth/two-factor/' + (backupCode ? 'verify-backup-code' : 'verify-totp'),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          backupCode ? { code: data.get('code') } : { code: data.get('code'), trustDevice: false },
        ),
      },
    );
    if (response.ok) location.assign(`${base}/app/`);
    else error = t('The code was not accepted.');
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

<svelte:head><title>{t('Verify your identity')} | J&A Employee Portal</title></svelte:head>
<main class="login-page">
  <section class="login-showcase">
    <div class="login-ambient ambient-one"></div>
    <div class="login-showcase-content">
      <a class="login-brand" href={`${base}/app/login`} aria-label="J&A Automation portal">
        <img src={`${base}/app/logo.png`} alt="J&A Automation" />
      </a>
      <div class="login-intro">
        <p class="portal-kicker">{t('ACCOUNT MFA')}</p>
        <h1>{t('A quick check keeps your workspace secure.')}</h1>
        <p>{t('Enter the current code from your authenticator app to continue.')}</p>
      </div>
    </div>
  </section>
  <section class="login-panel">
    <div class="login-panel-tools">
      <a
        href="https://webmail.j-aautomation.com/"
        target="_blank"
        rel="noopener noreferrer"
        class="login-top-webmail"
        title={t('Open corporate webmail in a new tab')}
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect width="20" height="16" x="2" y="4" rx="2"></rect>
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
        </svg>
        <span>{t('Webmail')}</span>
        <span class="webmail-btn-arrow" aria-hidden="true">↗</span>
      </a>
    </div>
    <form class="login-card" onsubmit={verify}>
      <div class="login-brand mobile-brand" aria-hidden="true">
        <img src={`${base}/app/logo.png`} alt="J&A Automation" />
      </div>
      <div class="login-card-heading">
        <p class="portal-kicker">{t('ONE MORE STEP')}</p>
        <h2>{t('Verify your identity')}</h2>
        <p>{t('Your organization requires an authenticator code for this sign-in.')}</p>
      </div>
      <label class="login-field"
        ><span>{backupCode ? t('Recovery code') : t('Six-digit code')}</span><input
          name="code"
          inputmode={backupCode ? 'text' : 'numeric'}
          autocomplete={backupCode ? 'off' : 'one-time-code'}
          placeholder={backupCode ? t('Enter a recovery code') : '000000'}
          minlength={backupCode ? 8 : 6}
          maxlength={backupCode ? 64 : 6}
          required
        /></label
      ><button class="login-submit"
        >{t('Verify and continue')} <span aria-hidden="true">→</span></button
      >
      <button type="button" class="login-passkey" onclick={() => (backupCode = !backupCode)}>
        {backupCode ? t('Use authenticator code') : t('Use a recovery code')}
      </button>
      <a
        href="https://webmail.j-aautomation.com/"
        target="_blank"
        rel="noopener noreferrer"
        class="login-webmail-btn"
        title={t('Open corporate webmail in a new tab')}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect width="20" height="16" x="2" y="4" rx="2"></rect>
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
        </svg>
        <span>{t('Access Company Webmail')}</span>
        <span class="webmail-btn-arrow" aria-hidden="true">↗</span>
      </a>
      <p class="login-status" aria-live="polite">{error}</p>
    </form>
    <p class="login-footer">J&A Automation · {t('Secure company access.')}</p>
  </section>
</main>
