<script lang="ts">
  import { base } from '$app/paths';
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
    else error = 'The code was not accepted.';
  }
</script>

<main class="login-page">
  <section class="login-showcase">
    <div class="login-ambient ambient-one"></div>
    <div class="login-showcase-content">
      <a class="login-brand" href={`${base}/app/login`} aria-label="J&A Automation portal">
        <img src={`${base}/app/logo.png`} alt="J&A Automation" />
      </a>
      <div class="login-intro">
        <p class="portal-kicker">STEP-UP AUTHENTICATION</p>
        <h1>A quick check keeps your workspace secure.</h1>
        <p>Enter the current code from your authenticator app to continue.</p>
      </div>
    </div>
  </section>
  <section class="login-panel">
    <form class="login-card" onsubmit={verify}>
      <div class="login-card-heading">
        <p class="portal-kicker">ONE MORE STEP</p>
        <h2>Verify your identity</h2>
        <p>Your organization requires an authenticator code for this sign-in.</p>
      </div>
      <label class="login-field"
        ><span>{backupCode ? 'Recovery code' : 'Six-digit code'}</span><input
          name="code"
          inputmode={backupCode ? 'text' : 'numeric'}
          autocomplete={backupCode ? 'off' : 'one-time-code'}
          placeholder={backupCode ? 'Enter a recovery code' : '000000'}
          minlength={backupCode ? 8 : 6}
          maxlength={backupCode ? 64 : 6}
          required
        /></label
      ><button class="login-submit">Verify and continue <span aria-hidden="true">→</span></button>
      <button type="button" class="login-passkey" onclick={() => (backupCode = !backupCode)}>
        {backupCode ? 'Use authenticator code' : 'Use a recovery code'}
      </button>
      <p class="login-status" aria-live="polite">{error}</p>
    </form>
    <p class="login-footer">J&A Automation · Secure company access.</p>
  </section>
</main>
