<script lang="ts">
  import { base } from '$app/paths';
  let state = $state<'idle' | 'sending' | 'error'>('idle');
  let message = $state('');
  async function login(event: SubmitEvent) {
    const submitter = event.submitter as HTMLButtonElement | null;
    if (submitter?.formAction.endsWith('/app/demo-login')) return;
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
    <p>Record field work, review controls activity and follow each project into billing.</p>
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
    <div class="demo-access">
      <span>COMPANY DEMONSTRATION</span>
      <p>Enter a populated workspace without production credentials.</p>
      <button
        type="submit"
        name="role"
        value="admin"
        formaction={`${base}/app/demo-login`}
        formmethod="post"
        formnovalidate>Open admin demo</button
      >
      <button
        type="submit"
        name="role"
        value="manager"
        formaction={`${base}/app/demo-login`}
        formmethod="post"
        formnovalidate
        class="secondary">Open PM demo</button
      >
      <button
        type="submit"
        name="role"
        value="finance"
        formaction={`${base}/app/demo-login`}
        formmethod="post"
        formnovalidate
        class="secondary">Open finance demo</button
      >
      <button
        type="submit"
        name="role"
        value="worker"
        formaction={`${base}/app/demo-login`}
        formmethod="post"
        formnovalidate
        class="secondary">Open worker demo</button
      >
    </div>
  </form>
</main>
