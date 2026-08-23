<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { passkeyClient } from '@better-auth/passkey/client';
  import { createAuthClient } from 'better-auth/client';
  import { onMount } from 'svelte';
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
  const t = (key: string): string => standaloneText(locale, key);
  let loginState = $state<'idle' | 'sending' | 'error'>('idle');
  let message = $state('');
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
    const current = await authClient.getSession();
    const user = current.data?.user as { mfaRequired?: boolean; mfaEnrolled?: boolean } | undefined;
    location.assign(
      user?.mfaRequired && !user.mfaEnrolled ? `${base}/app/profile` : `${base}/app/`,
    );
  }
  async function login(event: SubmitEvent) {
    event.preventDefault();
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
        message = t('Too many sign-in attempts. Wait a few minutes before trying again.');
      } else {
        message = t('Sign-in failed. Check your credentials or contact your administrator.');
      }
    } catch {
      message = t('The secure sign-in service is unavailable. Try again shortly.');
    }
    loginState = 'error';
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
  }

  onMount(() => {
    localeOverride = resolveStandaloneLocale($page.url.searchParams.get('lang'), data.locale);
    persistStandaloneLocale(locale);
    applyStandaloneDocumentLocale(locale);
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'ja.portal.locale' || event.key === 'ja-portal-locale') {
        localeOverride = resolveStandaloneLocale(event.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  });
  $effect(() => applyStandaloneDocumentLocale(locale));
</script>

<svelte:head><title>{t('Sign in')} | J&A Employee Portal</title></svelte:head>
<main class="login-page">
  <section class="login-showcase">
    <div class="login-ambient ambient-one"></div>
    <div class="login-showcase-content">
      <a class="login-brand" href={`${base}/app/login`} aria-label="J&A Automation portal">
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
    <form class="login-card" onsubmit={login}>
      <div class="login-card-heading">
        <p class="portal-kicker">{t('EMPLOYEE PORTAL')}</p>
        <h2>{t('Sign in securely')}</h2>
        <p>{t('Use the company credentials issued for your J&A workspace.')}</p>
      </div>
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
      ><button class="login-submit" disabled={loginState === 'sending'}
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
      <p class:notice={Boolean(accessMessage) && !message} class="login-status" aria-live="polite">
        {message || accessMessage}
      </p>
      <p class="login-security">
        <span aria-hidden="true">◆</span>
        {t('Protected by secure sessions, rate limits and multi-factor authentication.')}
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
