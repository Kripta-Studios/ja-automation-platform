<script lang="ts">
  import { base } from '$app/paths';
  let state = $state<'idle' | 'sending' | 'error'>('idle');
  let message = $state('');
  async function login(event: SubmitEvent) {
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
      location.assign(result.twoFactorRedirect ? `${base}/app/login/two-factor` : `${base}/app/`);
    } else {
      state = 'error';
      message = 'Sign-in failed. Check your credentials or contact an administrator.';
    }
  }
</script>

<svelte:head><title>Sign in | J&A Employee Portal</title></svelte:head>
<main class="login-page">
  <section>
    <img src={`${base}/app/logo.png`} alt="J&A Automation" />
    <p class="portal-kicker">EMPLOYEE PORTAL / SECURE ACCESS</p>
    <h1>Field work, reports and project records.</h1>
    <p>Use the account from your single-use invitation. J&A does not offer public registration.</p>
  </section>
  <form onsubmit={login}>
    <h2>Sign in</h2>
    <label>Email<input name="email" type="email" autocomplete="username" required /></label><label
      >Password<input
        name="password"
        type="password"
        autocomplete="current-password"
        required
      /></label
    ><button disabled={state === 'sending'}
      >{state === 'sending' ? 'Signing in…' : 'Continue'}</button
    >
    <p class="login-status" aria-live="polite">{message}</p>
    <small>Production accounts require MFA. Passkeys require user verification.</small>
  </form>
</main>
