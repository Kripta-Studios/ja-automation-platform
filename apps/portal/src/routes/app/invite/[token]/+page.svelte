<script lang="ts">
  import { base } from '$app/paths';
  let { data }: { data: { token: string } } = $props();
  let name = $state('');
  let password = $state('');
  let message = $state('');
  let busy = $state(false);
  async function accept() {
    busy = true;
    message = '';
    const response = await fetch(`${base}/app/api/invitations/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: data.token, name, password }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      accepted?: boolean;
      error?: string;
    };
    busy = false;
    message = result.accepted
      ? 'Account activated. You can sign in now.'
      : (result.error ?? 'Invitation could not be activated.');
  }
</script>

<svelte:head><title>Activate J&A account</title></svelte:head>
<main class="invite-page">
  <p class="portal-kicker">J&A / INVITATION</p>
  <h1>Activate your account</h1>
  <p>Use a password of at least 12 characters. This invitation can be used once.</p>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      void accept();
    }}
  >
    <label>Full name<input bind:value={name} autocomplete="name" required /></label>
    <label
      >Password<input
        bind:value={password}
        type="password"
        minlength="12"
        autocomplete="new-password"
        required
      /></label
    >
    <button disabled={busy}>{busy ? 'Activating…' : 'Activate account'}</button>
  </form>
  {#if message}<p role="status">{message}</p>{/if}
  <a href={`${base}/app/login`}>Return to sign in</a>
</main>
