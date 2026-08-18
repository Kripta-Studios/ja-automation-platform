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
  <section>
    <p class="portal-kicker">STEP-UP AUTHENTICATION</p>
    <h1>Enter your authenticator code.</h1>
  </section>
  <form onsubmit={verify}>
    <h2>Two-factor verification</h2>
    <label
      >Six-digit code<input
        name="code"
        inputmode="numeric"
        autocomplete="one-time-code"
        minlength="6"
        maxlength="6"
        required
      /></label
    ><button>Verify</button>
    <p aria-live="polite">{error}</p>
  </form>
</main>
