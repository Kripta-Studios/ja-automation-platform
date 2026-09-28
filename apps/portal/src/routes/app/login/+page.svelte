<script lang="ts">
  import { base } from '$app/paths';
  import { replaceState } from '$app/navigation';
  import { normalizePortalLocale } from '$lib/portal-i18n';
  import { page } from '$app/stores';
  import { passkeyClient } from '@better-auth/passkey/client';
  import { createAuthClient } from 'better-auth/client';
  import { onMount, tick } from 'svelte';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneText,
  } from '../standalone-locale';
  import type { PortalLocale } from '$lib/portal-i18n';
  let { data } = $props<{ data: { reason?: string | null; locale?: PortalLocale } }>();
  let localeOverride = $state<PortalLocale | null>(null);
  const locale = $derived(
    localeOverride ?? data.locale ?? resolveStandaloneLocale($page.url.searchParams.get('lang')),
  );
  const t = (key: string, params?: Readonly<Record<string, string | number>>): string =>
    standaloneText(locale, key, params);
  let loginState = $state<'idle' | 'sending' | 'error'>('idle');
  let message = $state('');
  let retryDeadline = $state<number | null>(null);
  let retrySeconds = $state(0);
  let statusElement: HTMLParagraphElement;
  const rateLimited = $derived(retryDeadline !== null && retrySeconds > 0);
  const rateLimitMessage = $derived(
    rateLimited
      ? t('Too many sign-in attempts. Try again in {time}.', {
          time: `${Math.floor(retrySeconds / 60)}:${String(retrySeconds % 60).padStart(2, '0')}`,
        })
      : '',
  );
  const accessMessage = $derived(
    data.reason === 'access-revoked'
      ? t('This account no longer has access to the workspace. Contact your administrator.')
      : '',
  );
  const authClient = createAuthClient({
    basePath: base + '/app/api/auth',
    plugins: [passkeyClient()],
  });
  async function continueAfterSignIn(twoFactorRedirect = false): Promise<void> {
    if (twoFactorRedirect) {
      location.assign(`${base}/app/login/two-factor`);
      return;
    }
    location.assign(`${base}/app/`);
  }
  function retryAfterDeadline(header: string | null): number | null {
    if (!header) return null;
    const trimmed = header.trim();
    const seconds = /^\d+$/.test(trimmed)
      ? Number(trimmed)
      : (Date.parse(trimmed) - Date.now()) / 1000;
    // A missing, expired, or implausibly distant value must not promise a false wait.
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 24 * 60 * 60) return null;
    return Date.now() + Math.ceil(seconds * 1000);
  }
  function updateRetryCountdown(): void {
    if (retryDeadline === null) return;
    retrySeconds = Math.max(0, Math.ceil((retryDeadline - Date.now()) / 1000));
    if (retrySeconds === 0) retryDeadline = null;
  }
  async function revealStatus(): Promise<void> {
    await tick();
    statusElement?.focus({ preventScroll: true });
    statusElement?.scrollIntoView({ block: 'center' });
  }
  async function login(event: SubmitEvent) {
    event.preventDefault();
    if (rateLimited || loginState === 'sending') return;
    loginState = 'sending';
    message = '';
    const form = new FormData(event.currentTarget as HTMLFormElement);
    try {
      const response = await fetch(`${base}/app/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
          callbackURL: `${base}/app/`,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        await continueAfterSignIn(Boolean(result.twoFactorRedirect));
        return;
      }
      if (response.status === 429) {
        retryDeadline = retryAfterDeadline(response.headers.get('retry-after'));
        updateRetryCountdown();
        message = retryDeadline
          ? ''
          : t('Too many sign-in attempts. Wait a few minutes before trying again.');
      } else {
        message = t('Sign-in failed. Check your credentials or contact your administrator.');
      }
    } catch {
      message = t('The secure sign-in service is unavailable. Try again shortly.');
    }
    loginState = 'error';
    await revealStatus();
  }

  async function passkeyLogin(): Promise<void> {
    loginState = 'sending';
    message = '';
    try {
      const result = await authClient.signIn.passkey();
      if (result.data) {
        await continueAfterSignIn();
        return;
      }
      message = t('Passkey sign-in was cancelled or unavailable.');
    } catch {
      message = t('Passkey sign-in was cancelled or is not available on this device.');
    }
    loginState = 'error';
    await revealStatus();
  }

  function changeLocale(event: Event): void {
    const selected = normalizePortalLocale((event.currentTarget as HTMLSelectElement).value);
    localeOverride = selected;
    persistStandaloneLocale(selected);
    const url = new URL(location.href);
    url.searchParams.set('lang', selected);
    replaceState(url, {});
  }

  onMount(() => {
    const retryTimer = window.setInterval(updateRetryCountdown, 250);
    localeOverride = resolveStandaloneLocale($page.url.searchParams.get('lang'), data.locale);
    persistStandaloneLocale(locale);
    applyStandaloneDocumentLocale(locale);
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'ja.portal.locale' || event.key === 'ja-portal-locale') {
        localeOverride = resolveStandaloneLocale(event.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.clearInterval(retryTimer);
      window.removeEventListener('storage', onStorage);
    };
  });
  $effect(() => applyStandaloneDocumentLocale(locale));
</script>

<svelte:head><title>{t('Sign in')} | {t('Employee portal')}</title></svelte:head>
<main class="login-page">
  <section class="login-showcase">
    <div class="login-ambient ambient-one"></div>
    <div class="login-showcase-content">
      <a class="login-brand" href={`${base}/app/login`} aria-label={t('J&A Automation portal')}>
        <img src={`${base}/app/logo.png`} alt="J&A Automation" />
      </a>
      <div class="login-intro">
        <p class="portal-kicker">{t('PRIVATE OPERATIONS PLATFORM')}</p>
        <h1>{t('Run every project with confidence.')}</h1>
        <p>
          {t(
            'One secure workspace for field operations, project delivery, technical records and finance. Built around the way J&A Automation works.',
          )}
        </p>
      </div>
      <div class="login-proof" aria-label={t('Workspace capabilities')}>
        <div><strong>01</strong><span>{t('Field work, time and expenses')}</span></div>
        <div><strong>02</strong><span>{t('Projects, reports and approvals')}</span></div>
        <div><strong>03</strong><span>{t('Billing-ready financial control')}</span></div>
      </div>
    </div>
  </section>
  <section class="login-panel">
    <div class="login-panel-tools">
      <label class="login-language-selector">
        <span>{t('Language')}</span>
        <select value={locale} onchange={changeLocale}>
          <option value="en">English</option>
          <option value="es">Español</option>
          <option value="pt">Português (Brasil)</option>
        </select>
      </label>
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
    <form class="login-card" onsubmit={login}>
      <div class="login-brand mobile-brand" aria-hidden="true">
        <img src={`${base}/app/logo.png`} alt="J&A Automation" />
      </div>
      <div class="login-card-heading">
        <p class="portal-kicker">{t('EMPLOYEE PORTAL')}</p>
        <h2>{t('Sign in securely')}</h2>
        <p>{t('Use the company credentials issued for your J&A workspace.')}</p>
      </div>
      <p
        bind:this={statusElement}
        tabindex="-1"
        class:notice={Boolean(accessMessage) && !message && !rateLimitMessage}
        class="login-status"
        aria-live={rateLimited ? 'off' : 'polite'}
      >
        {rateLimitMessage || message || accessMessage}
      </p>
      <label class="login-field"
        ><span>{t('Work email')}</span><input
          name="email"
          type="email"
          autocomplete="username"
          placeholder={t('you@company.com')}
          aria-label={t('Work email')}
          required
        /></label
      ><label class="login-field"
        ><span>{t('Password')}</span><input
          name="password"
          type="password"
          autocomplete="current-password"
          placeholder={t('Enter your password')}
          aria-label={t('Password')}
          required
        /></label
      ><button class="login-submit" disabled={loginState === 'sending' || rateLimited}
        >{loginState === 'sending' ? t('Verifying access…') : t('Continue to workspace')}
        <span aria-hidden="true">→</span></button
      >
      <button
        type="button"
        class="login-passkey"
        onclick={passkeyLogin}
        disabled={loginState === 'sending'}
      >
        {t('Sign in with a passkey')}
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
      <p class="login-security">
        <span aria-hidden="true">◆</span>
        {t(
          'Protected by secure sessions and rate limits. Optional MFA is available in your profile.',
        )}
      </p>
      <p class="login-access-note">
        {t(
          'Access is invitation-only. If you need access, contact your J&A workspace administrator.',
        )}
      </p>
    </form>
    <p class="login-footer">
      J&A Automation · {t('Secure operational visibility for every project.')}
    </p>
  </section>
</main>

<style>
  .login-status {
    scroll-margin-block: 1.5rem;
  }
  .login-status:focus {
    outline: 2px solid var(--ja-red);
    outline-offset: 4px;
    border-radius: 0.2rem;
  }
  .login-panel-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
  }
  .login-language-selector {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
    max-width: 100%;
  }
  .login-language-selector select {
    min-height: 44px;
    max-width: 100%;
    padding: 0.5rem;
  }
</style>
