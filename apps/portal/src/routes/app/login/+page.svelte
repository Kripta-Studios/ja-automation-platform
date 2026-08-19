<script lang="ts">
  import { base } from '$app/paths';
  import { passkeyClient } from '@better-auth/passkey/client';
  import { createAuthClient } from 'better-auth/client';
  let { data } = $props<{ data: { demoEnabled: boolean } }>();
  let state = $state<'idle' | 'sending' | 'error'>('idle');
  let message = $state('');
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
    const submitter = event.submitter as HTMLButtonElement | null;
    if (submitter?.formAction.endsWith('/app/demo-login')) {
      event.preventDefault();
      const response = await fetch(submitter.formAction, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: submitter.value }),
      });
      if (response.ok) location.assign(`${base}/app/`);
      else {
        state = 'error';
        message = 'The demo workspace is unavailable.';
      }
      return;
    }
    event.preventDefault();
    state = 'sending';
    const form = new FormData(event.currentTarget as HTMLFormElement);
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
    } else {
      state = 'error';
      message = 'Sign-in failed. Check your credentials or contact an administrator.';
    }
  }

  async function passkeyLogin(): Promise<void> {
    state = 'sending';
    const result = await authClient.signIn.passkey();
    if (result.data) {
      await continueAfterSignIn();
      return;
    }
    state = 'error';
    message = result.error?.message ?? 'Passkey sign-in was cancelled or unavailable.';
  }
</script>

<svelte:head><title>Sign in | J&A Employee Portal</title></svelte:head>
<main class="login-page">
  <section class="login-showcase">
    <div class="login-ambient ambient-one"></div>
    <div class="login-ambient ambient-two"></div>
    <div class="login-showcase-content">
      <a class="login-brand" href={`${base}/app/login`} aria-label="J&A Automation portal">
        <img src={`${base}/app/logo.png`} alt="J&A Automation" />
      </a>
      <div class="login-intro">
        <p class="portal-kicker">OPERATIONS WORKSPACE</p>
        <h1>Everything in the field, clearly in view.</h1>
        <p>
          Capture work, coordinate projects and keep billing-ready records together—wherever the job
          takes you.
        </p>
      </div>
      <div class="login-proof" aria-label="Portal capabilities">
        <div><strong>01</strong><span>Record actual time<br />and field activity</span></div>
        <div><strong>02</strong><span>Stay aligned with<br />your project team</span></div>
        <div><strong>03</strong><span>Keep every detail<br />ready for review</span></div>
      </div>
    </div>
  </section>
  <section class="login-panel">
    <form class="login-card" onsubmit={login}>
      <div class="login-card-heading">
        <p class="portal-kicker">SECURE SIGN IN</p>
        <h2>Welcome back</h2>
        <p>Use your company account to open your workspace.</p>
      </div>
      <label class="login-field"
        ><span>Work email</span><input
          name="email"
          type="email"
          autocomplete="username"
          placeholder="you@company.com"
          required
        /></label
      ><label class="login-field"
        ><span>Password</span><input
          name="password"
          type="password"
          autocomplete="current-password"
          placeholder="Enter your password"
          required
        /></label
      ><button class="login-submit" disabled={state === 'sending'}
        >{state === 'sending' ? 'Signing in…' : 'Continue to workspace'}
        <span aria-hidden="true">→</span></button
      >
      <button
        type="button"
        class="login-passkey"
        onclick={passkeyLogin}
        disabled={state === 'sending'}
      >
        Use a passkey
      </button>
      <p class="login-status" aria-live="polite">{message}</p>
      <p class="login-security">
        <span aria-hidden="true">◆</span> Multi-factor authentication protects company accounts.
      </p>
      {#if data.demoEnabled}<div class="demo-access">
          <div class="demo-heading">
            <span>EXPLORE THE DEMO</span>
            <p>Open a populated workspace with a role tailored to your visit.</p>
          </div>
          <div class="demo-buttons">
            <button
              type="submit"
              name="role"
              value="admin"
              formaction={`${base}/app/demo-login`}
              formmethod="post"
              formnovalidate>Owner admin · Antonny</button
            >
            <button
              type="submit"
              name="role"
              value="manager"
              formaction={`${base}/app/demo-login`}
              formmethod="post"
              formnovalidate
              class="secondary">Project manager</button
            >
            <button
              type="submit"
              name="role"
              value="finance"
              formaction={`${base}/app/demo-login`}
              formmethod="post"
              formnovalidate
              class="secondary">Finance</button
            >
            <button
              type="submit"
              name="role"
              value="worker"
              formaction={`${base}/app/demo-login`}
              formmethod="post"
              formnovalidate
              class="secondary">Field worker</button
            >
          </div>
        </div>{/if}
    </form>
    <p class="login-footer">J&A Automation · Operational visibility, made practical.</p>
  </section>
</main>
