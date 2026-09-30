<script lang="ts">
  import DirectionIcon from '$lib/portal/ui/DirectionIcon.svelte';
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
  let { data } = $props<{ data: { locale?: PortalLocale } }>();
  let localeOverride = $state<PortalLocale | null>(null);
  const locale = $derived(
    localeOverride ?? data.locale ?? resolveStandaloneLocale($page.url.searchParams.get('lang')),
  );
  const t = (key: string): string => standaloneText(locale, key);
  let error = $state('');
  let busy = $state(false);
  let retrySeconds = $state(0);
  let retryTimer: ReturnType<typeof setInterval> | undefined;
  let statusElement: HTMLParagraphElement;
  let backupCode = $state(false);
  async function verify(event: SubmitEvent) {
    event.preventDefault();
    if (busy || retrySeconds > 0) return;
    const data = new FormData(event.currentTarget as HTMLFormElement);
    busy = true;
    error = '';
    try {
      const response = await fetch(
        base + '/app/api/auth/two-factor/' + (backupCode ? 'verify-backup-code' : 'verify-totp'),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            backupCode
              ? { code: data.get('code') }
              : { code: data.get('code'), trustDevice: false },
          ),
        },
      );
      if (response.ok) location.assign(`${base}/app/`);
      else if (response.status === 429) {
        error = t(
          'Too many verification attempts. Wait before trying again. Your code is still in the form.',
        );
        const retryAfter = response.headers.get('retry-after')?.trim() ?? '';
        const milliseconds = /^\d+$/u.test(retryAfter)
          ? Number(retryAfter) * 1000
          : Math.max(0, Date.parse(retryAfter) - Date.now());
        if (Number.isFinite(milliseconds) && milliseconds > 0) {
          const deadline = Date.now() + milliseconds;
          retrySeconds = Math.ceil(milliseconds / 1000);
          if (retryTimer) clearInterval(retryTimer);
          retryTimer = setInterval(() => {
            retrySeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            if (!retrySeconds) clearInterval(retryTimer);
          }, 250);
        }
      } else if (response.status === 400 || response.status === 401)
        error = t('The code was not accepted.');
      else
        error = t(
          'We could not confirm verification. Check your connection and try again. Your code is still in the form.',
        );
    } catch {
      error = t(
        'We could not confirm verification. Check your connection and try again. Your code is still in the form.',
      );
    } finally {
      busy = false;
      if (error) {
        await tick();
        statusElement?.focus();
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

<svelte:head><title>{t('Verify your identity')} | {t('Employee portal')}</title></svelte:head>
<main class="login-page">
  <section class="login-showcase">
    <div class="login-ambient ambient-one"></div>
    <div class="login-showcase-content">
      <a class="login-brand" href={`${base}/app/login`} aria-label={t('J&A Automation portal')}>
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
        <DirectionIcon direction="up-right" class="webmail-btn-arrow" />
      </a>
    </div>
    <form class="login-card" onsubmit={verify}>
      <div class="login-brand mobile-brand" aria-hidden="true">
        <img src={`${base}/app/logo.png`} alt="J&A Automation" />
      </div>
      <div class="login-card-heading">
        <p class="portal-kicker">{t('ONE MORE STEP')}</p>
        <h2>{t('Verify your identity')}</h2>
        <p>{t('You enabled MFA for this account. Enter your authenticator code to sign in.')}</p>
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
      ><button class="login-submit" disabled={busy || retrySeconds > 0}
        >{t('Verify and continue')} <DirectionIcon /></button
      >
      {#if retrySeconds > 0}<p>
          {standaloneText(locale, 'Try again in {seconds} seconds.', { seconds: retrySeconds })}
        </p>{/if}
      <button
        type="button"
        class="login-passkey"
        disabled={busy || retrySeconds > 0}
        onclick={() => (backupCode = !backupCode)}
      >
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
        <DirectionIcon direction="up-right" class="webmail-btn-arrow" />
      </a>
      <p
        class="login-status"
        bind:this={statusElement}
        role={error ? 'alert' : 'status'}
        tabindex="-1"
      >
        {error}
      </p>
    </form>
    <p class="login-footer">J&A Automation · {t('Secure company access.')}</p>
  </section>
</main>
