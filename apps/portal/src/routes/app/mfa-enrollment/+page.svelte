<script lang="ts">
  import { base } from '$app/paths';
  import { tick } from 'svelte';
  import { createAuthClient } from 'better-auth/client';
  import ProblemNotice from '$lib/portal/ui/ProblemNotice.svelte';
  import { portalText } from '$lib/portal-i18n';
  import type { ProblemData } from '$lib/problem/contract';
  import {
    formatMfaEnrollmentCopy,
    mfaEnrollmentCopy,
    mfaProblemFromResponse,
    mfaProblemIsService,
    mfaUncertainProblem,
  } from './mfa-enrollment-copy';
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
  let problem = $state<ProblemData | null>(null);
  const mfaNeedsReview = $derived(Boolean(problem && mfaProblemIsService(problem)));
  let setupStarted = $derived(setupUri.length > 0);
  let copy = $derived(
    mfaEnrollmentCopy[data.locale === 'es' ? 'es' : data.locale === 'pt' ? 'pt' : 'en'],
  );
  let remedyLinks = $derived({
    sign_in_again: { label: copy.signInAgain, href: `${base}/app/login` },
    review_mfa_settings: {
      label: copy.reviewMfaSettings,
      href: `${base}/app/profile?lang=${data.locale}#account-mfa`,
    },
    review_mfa_code: { label: copy.reviewMfaCode, href: '#mfa-code' },
    contact_owner: { label: copy.contactOwner },
  });

  async function showProblem(next: ProblemData): Promise<void> {
    problem = next;
    await tick();
    const notice = document.querySelector<HTMLElement>(
      '[data-mfa-enrollment-problem] [data-ui="problem-notice"]',
    );
    notice?.focus({ preventScroll: true });
    notice?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }

  async function mfaRequest(action: 'enable' | 'verify'): Promise<void> {
    if (busy || mfaNeedsReview) return;
    busy = true;
    message = '';
    problem = null;
    try {
      const response = await fetch(`${base}/app/api/security/mfa`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(action === 'enable' ? { action } : { action, code }),
      });
      const result = (await response.json().catch(() => null)) as {
        totpURI?: string;
        backupCodes?: string[];
      } | null;
      if (!response.ok) {
        await showProblem(mfaProblemFromResponse(result) ?? mfaUncertainProblem());
        return;
      }
      if (action === 'enable') {
        if (!result?.totpURI || !Array.isArray(result.backupCodes) || !result.backupCodes.length) {
          await showProblem(mfaUncertainProblem());
          return;
        }
        setupUri = result.totpURI;
        recoveryCodes = result.backupCodes;
      } else {
        code = '';
        location.replace(data.continueTo);
      }
    } catch {
      await showProblem(mfaUncertainProblem());
    } finally {
      busy = false;
    }
  }

  async function signOut(): Promise<void> {
    busy = true;
    message = '';
    try {
      const result = await authClient.signOut();
      if (result.error) {
        message = copy.signOutFailed;
        busy = false;
        return;
      }
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

    {#if problem}
      <div data-mfa-enrollment-problem>
        <ProblemNotice
          {problem}
          kind={mfaProblemIsService(problem) ? 'service' : 'error'}
          {remedyLinks}
        />
        {#if problem.correlationId && !mfaProblemIsService(problem)}
          <small
            >{portalText(data.locale, 'problem.error.reference', {
              correlationId: problem.correlationId,
            })}</small
          >
        {/if}
        {#if problem.remedies.some((remedy) => remedy.id === 'review_mfa_status')}
          <a data-sveltekit-reload href={`${base}/app/profile?lang=${data.locale}#account-mfa`}
            >{copy.reviewMfaStatus}</a
          >
        {/if}
      </div>
    {/if}

    {#if !setupStarted}
      <form
        onsubmit={(event) => {
          event.preventDefault();
          void mfaRequest('enable');
        }}
      >
        <button data-testid="mfa-enable" type="submit" disabled={busy || mfaNeedsReview}
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
            aria-invalid={Boolean(problem?.fieldErrors.code?.length)}
            aria-describedby={problem?.fieldErrors.code?.length ? 'mfa-code-error' : undefined}
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern={'[0-9]{6}'}
            minlength="6"
            maxlength="6"
            required
          />
          {#if problem?.fieldErrors.code?.[0]}
            <p id="mfa-code-error" class="status">
              {portalText(data.locale, problem.fieldErrors.code[0], problem.params)}
            </p>
          {/if}
          <button data-testid="mfa-verify" type="submit" disabled={busy || mfaNeedsReview}
            >{busy ? copy.verifying : copy.verify}</button
          >
        </form>
        <p class="retry">
          {copy.retry}
        </p>
      </div>
    {/if}

    {#if message}<p class="status" role="alert">{message}</p>{/if}
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
    background: #f6f6f5;
    color: #22211f;
  }
  .mfa-card {
    width: min(100%, 42rem);
    padding: clamp(1.5rem, 5vw, 3rem);
    background: #fff;
    border: 1px solid #e0e0dd;
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
    color: #57554f;
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
    border: 1px solid #b3b1ab;
    border-radius: 0.45rem;
    font: inherit;
  }
  button {
    min-height: 2.75rem;
    padding: 0.65rem 1rem;
    border: 0;
    border-radius: 0.45rem;
    background: #4c4b45;
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
    border: 1px solid #e0e0dd;
    border-radius: 0.45rem;
    background: #fbfbfa;
    color: #2b2a27;
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
    background: #585650;
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
