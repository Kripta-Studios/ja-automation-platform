<script lang="ts">
  import { base } from '$app/paths';
  let error = $state('');
  async function verify(event: SubmitEvent) {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const response = await fetch(`${base}/app/api/auth/two-factor/verify-totp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: data.get('code'), trustDevice: false }),
    });
    if (response.ok) location.assign(`${base}/app/`);
    else error = 'The code was not accepted.';
  }
</script>

<main class="login-page">
  <section class="login-showcase">
    <div class="login-ambient ambient-one"></div>
    <div class="login-ambient ambient-two"></div>
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
        ><span>Six-digit code</span><input
          name="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          placeholder="000000"
          minlength="6"
          maxlength="6"
          required
        /></label
      ><button class="login-submit">Verify and continue <span aria-hidden="true">→</span></button>
      <p class="login-status" aria-live="polite">{error}</p>
    </form>
    <p class="login-footer">J&A Automation · Secure company access.</p>
  </section>
</main>
