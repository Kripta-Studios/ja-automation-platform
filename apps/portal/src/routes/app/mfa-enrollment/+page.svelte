<script lang="ts">
  import { base } from '$app/paths';
  import { createAuthClient } from 'better-auth/client';
  import { formatMfaEnrollmentCopy, mfaEnrollmentCopy } from './mfa-enrollment-copy';
  import type { PortalLocale } from '$lib/portal-i18n';

  let { data } = $props<{
    data: {
      user: { name: string; email: string; role?: string };
      continueTo: string;
      locale: PortalLocale;
    };
  }>();
  const authClient = createAuthClient({ basePath: `${base}/app/api/auth` });
  let code = $state('');
  let setupUri = $state('');
  let recoveryCodes = $state<string[]>([]);
  let busy = $state(false);
  let message = $state('');
  let setupStarted = $derived(setupUri.length > 0);
  let copy = $derived(
    mfaEnrollmentCopy[data.locale === 'es' ? 'es' : data.locale === 'pt' ? 'pt' : 'en'],
  );

  async function mfaRequest(action: 'enable' | 'verify'): Promise<void> {
    busy = true;
    message = '';
    try {
      const response = await fetch(`${base}/app/api/security/mfa`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(action === 'enable' ? { action } : { action, code }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        totpURI?: string;
        backupCodes?: string[];
      };
      if (!response.ok) {
        message =
          result.error === 'MFA_ENROLLMENT_REQUIRED' ? copy.enrollmentRequired : copy.setupRejected;
        return;
      }
      if (action === 'enable') {
        setupUri = result.totpURI ?? '';
        recoveryCodes = result.backupCodes ?? [];
        if (!setupUri || recoveryCodes.length === 0) {
          message = copy.setupIncomplete;
          setupUri = '';
          recoveryCodes = [];
        }
      } else {
        code = '';
        location.replace(data.continueTo);
      }
    } catch {
      message = copy.setupRejected;
    } finally {
      busy = false;
    }
  }

  async function signOut(): Promise<void> {
    busy = true;
    message = '';
    try {
      await authClient.signOut();
      location.assign(`${base}/app/login`);
    } catch {
      message = copy.signOutFailed;
      busy = false;
    }
  }
</script>

<svelte:head><title>{copy.title}</title></svelte:head>

<main class="mfa-enrollment" aria-labelledby="mfa-title">
  <section class="mfa-card">
    <p class="eyebrow">{copy.eyebrow}</p>
    <h1 id="mfa-title">{copy.heading}</h1>
    <p class="intro">
      {formatMfaEnrollmentCopy(copy.intro, data.user.name)}
    </p>

    {#if !setupStarted}
      <form
        onsubmit={(event) => {
          event.preventDefault();
          void mfaRequest('enable');
        }}
      >
        <button data-testid="mfa-enable" type="submit" disabled={busy}
          >{busy ? copy.starting : copy.enable}</button
        >
      </form>
    {:else}
      <div class="setup" aria-live="polite">
        <h2>{copy.finishHeading}</h2>
        <p>{copy.finishIntro}</p>
        <code class="secret" aria-label={copy.setupUriLabel}>{setupUri}</code>
        <h3>{copy.recoveryHeading}</h3>
        <p class="warning">{copy.recoveryWarning}</p>
        <pre class="secret recovery" aria-label={copy.recoveryCodesLabel}>{recoveryCodes.join(
            '\n',
          )}</pre>
        <form
          onsubmit={(event) => {
            event.preventDefault();
            void mfaRequest('verify');
          }}
        >
          <label for="mfa-code">{copy.codeLabel}</label>
          <input
            id="mfa-code"
            bind:value={code}
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="[0-9]{6}"
            minlength="6"
            maxlength="6"
            required
          />
          <button data-testid="mfa-verify" type="submit" disabled={busy}
            >{busy ? copy.verifying : copy.verify}</button
          >
        </form>
        <p class="retry">
          {copy.retry}
        </p>
      </div>
    {/if}

    {#if message}<p class="status" role="status">{message}</p>{/if}
    <a data-testid="mfa-continue" class="continue" href={data.continueTo}>{copy.continueWithout}</a>
    <button
      data-testid="mfa-sign-out"
      class="signout"
      type="button"
      onclick={() => void signOut()}
      disabled={busy}>{copy.signOut}</button
    >
  </section>
</main>

<style>
  .mfa-enrollment {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 2rem;
    background: #f3f6fb;
    color: #14213d;
  }
  .mfa-card {
    width: min(100%, 42rem);
    padding: clamp(1.5rem, 5vw, 3rem);
    background: #fff;
    border: 1px solid #d6e0ee;
    border-radius: 1rem;
    box-shadow: 0 1rem 3rem rgb(19 41 75 / 12%);
  }

  .continue {
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    justify-content: center;
    margin-top: 1rem;
    color: inherit;
    font-weight: 700;
  }
  .eyebrow {
    margin: 0 0 0.5rem;
    color: #2857a7;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.08em;
  }
  h1,
  h2,
  h3 {
    margin: 0 0 0.75rem;
  }
  .intro,
  .setup > p {
    line-height: 1.55;
  }
  form {
    display: grid;
    gap: 0.65rem;
    margin-top: 1.5rem;
  }
  label {
    font-weight: 650;
  }
  input {
    min-height: 2.75rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid #9eb1cc;
    border-radius: 0.45rem;
    font: inherit;
  }
  button {
    min-height: 2.75rem;
    padding: 0.65rem 1rem;
    border: 0;
    border-radius: 0.45rem;
    background: #174ea6;
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }
  button:disabled {
    opacity: 0.65;
    cursor: wait;
  }
  .secret {
    display: block;
    overflow-wrap: anywhere;
    padding: 0.8rem;
    border: 1px solid #d6e0ee;
    border-radius: 0.45rem;
    background: #f8fbff;
    color: #172b4d;
    white-space: pre-wrap;
  }
  .recovery {
    margin: 0.5rem 0 0;
    font:
      0.9rem/1.55 ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
  }
  .warning {
    color: #7a3e00;
    font-weight: 650;
  }
  .retry,
  .status {
    margin-top: 1rem;
  }
  .status {
    color: #9e1c1c;
  }
  .signout {
    margin-top: 1.5rem;
    background: #4b5563;
  }
  @media (max-width: 32rem) {
    .mfa-enrollment {
      padding: 1rem;
    }
    .mfa-card {
      padding: 1.5rem;
    }
  }
</style>
