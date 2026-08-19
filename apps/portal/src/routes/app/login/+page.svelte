<script lang="ts">
  import { base } from '$app/paths';
  import { passkeyClient } from '@better-auth/passkey/client';
  import { createAuthClient } from 'better-auth/client';
  let { data } = $props<{ data: { reason?: string | null } }>();
  let state = $state<'idle' | 'sending' | 'error'>('idle');
  let message = $state('');
  const accessMessage = $derived(
    data.reason === 'access-revoked'
      ? 'This account no longer has access to the workspace. Contact your administrator.'
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
    state = 'sending';
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
        message = 'Too many sign-in attempts. Wait a few minutes before trying again.';
      } else {
        message = 'Sign-in failed. Check your credentials or contact your administrator.';
      }
    } catch {
      message = 'The secure sign-in service is unavailable. Try again shortly.';
    }
    state = 'error';
  }

  async function passkeyLogin(): Promise<void> {
    state = 'sending';
    message = '';
    try {
      const result = await authClient.signIn.passkey();
      if (result.data) {
        await continueAfterSignIn();
        return;
      }
      message = result.error?.message ?? 'Passkey sign-in was cancelled or unavailable.';
    } catch {
      message = 'Passkey sign-in was cancelled or is not available on this device.';
    }
    state = 'error';
  }
</script>

<svelte:head><title>Sign in | J&A Employee Portal</title></svelte:head>
<main class="login-page">
  <section class="login-showcase">
    <div class="login-ambient ambient-one"></div>
    <div class="login-showcase-content">
      <a class="login-brand" href={`${base}/app/login`} aria-label="J&A Automation portal">
        <img src={`${base}/app/logo.png`} alt="J&A Automation" />
      </a>
      <div class="login-intro">
        <p class="portal-kicker">PRIVATE OPERATIONS PLATFORM</p>
        <h1>Run every project with confidence.</h1>
        <p>
          One secure workspace for field operations, project delivery, technical records and
          finance. Built around the way J&A Automation works.
        </p>
      </div>
      <div class="login-proof" aria-label="Workspace capabilities">
        <div><strong>01</strong><span>Field work, time and expenses</span></div>
        <div><strong>02</strong><span>Projects, reports and approvals</span></div>
        <div><strong>03</strong><span>Billing-ready financial control</span></div>
      </div>
    </div>
  </section>
  <section class="login-panel">
    <form class="login-card" onsubmit={login}>
      <div class="login-card-heading">
        <p class="portal-kicker">EMPLOYEE PORTAL</p>
        <h2>Sign in securely</h2>
        <p>Use the company credentials issued for your J&A workspace.</p>
      </div>
      <label class="login-field"
        ><span>Work email</span><input
          name="email"
          type="email"
          autocomplete="username"
          placeholder="you@company.com"
          aria-label="Work email"
          required
        /></label
      ><label class="login-field"
        ><span>Password</span><input
          name="password"
          type="password"
          autocomplete="current-password"
          placeholder="Enter your password"
          aria-label="Password"
          required
        /></label
      ><button class="login-submit" disabled={state === 'sending'}
        >{state === 'sending' ? 'Verifying access…' : 'Continue to workspace'}
        <span aria-hidden="true">→</span></button
      >
      <button
        type="button"
        class="login-passkey"
        onclick={passkeyLogin}
        disabled={state === 'sending'}
      >
        Sign in with a passkey
      </button>
      <p class:notice={Boolean(accessMessage) && !message} class="login-status" aria-live="polite">
        {message || accessMessage}
      </p>
      <p class="login-security">
        <span aria-hidden="true">◆</span> Protected by secure sessions, rate limits and multi-factor authentication.
      </p>
      <p class="login-access-note">
        Access is invitation-only. If you need access, contact your J&A workspace administrator.
      </p>
    </form>
    <p class="login-footer">J&A Automation · Secure operational visibility for every project.</p>
  </section>
</main>
