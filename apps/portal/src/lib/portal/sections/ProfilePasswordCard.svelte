<script lang="ts">
  import { base } from '$app/paths';
  import { portalText, type PortalLocale } from '$lib/portal-i18n';
  import { onMount } from 'svelte';

  let {
    locale,
    email,
    translate,
  }: { locale: PortalLocale; email: string; translate: (value: string) => string } = $props();

  let companyMailbox = $state(false);
  onMount(() => {
    void fetch(`${base}/app/profile/password`, { headers: { accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { linkedMailbox?: unknown } | null) => {
        companyMailbox = result?.linkedMailbox === true;
      })
      .catch(() => {});
  });
  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let reveal = $state(false);
  let status = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  let messageKey = $state('');
  let errorField = $state<'currentPassword' | 'newPassword' | 'confirmPassword' | null>(null);

  const tooShort = $derived(newPassword.length > 0 && newPassword.length < 12);
  const mismatch = $derived(confirmPassword.length > 0 && confirmPassword !== newPassword);
  const ready = $derived(
    currentPassword.length > 0 &&
      newPassword.length >= 12 &&
      newPassword.length <= 128 &&
      confirmPassword === newPassword,
  );

  function edited(): void {
    if (status === 'error' || status === 'saved') status = 'idle';
    errorField = null;
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!ready || status === 'saving') return;
    status = 'saving';
    errorField = null;
    const body = new FormData();
    body.set('currentPassword', currentPassword);
    body.set('newPassword', newPassword);
    try {
      const response = await fetch(`${base}/app/profile/password`, {
        method: 'POST',
        body,
        headers: { accept: 'application/json' },
      });
      const result = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        messageKey?: string;
        linkedMailbox?: boolean;
        fieldErrors?: Record<string, string[]>;
      };
      if (response.ok && result.success) {
        status = 'saved';
        messageKey = result.messageKey ?? 'action.access.password.changedPortal';
        companyMailbox = result.linkedMailbox === true || companyMailbox;
        currentPassword = newPassword = confirmPassword = '';
        reveal = false;
        return;
      }
      status = 'error';
      messageKey =
        response.status === 429
          ? 'problem.auth.requestRateLimited'
          : (result.messageKey ?? 'problem.access.passwordMailUnavailable');
      const fields = Object.keys(result.fieldErrors ?? {});
      errorField = fields.includes('currentPassword')
        ? 'currentPassword'
        : fields.includes('password')
          ? 'newPassword'
          : null;
    } catch {
      status = 'error';
      messageKey = 'problem.access.passwordMailUnavailable';
    }
  }
</script>

<section class="entry-panel profile-password" id="account-password" data-profile-password>
  <span class="portal-kicker">{translate('PASSWORD')}</span>
  <h2>{translate('Change your password')}</h2>
  <p class="form-help">
    {companyMailbox
      ? translate('You use one password for the portal and Webmail. Changing it here changes both.')
      : translate('Changing it here signs you out on your other devices.')}
  </p>
  <form class="profile-password__form" onsubmit={submit} novalidate>
    <input type="text" name="username" value={email} autocomplete="username" hidden readonly />
    <label
      >{translate('Current password')}<input
        name="currentPassword"
        type={reveal ? 'text' : 'password'}
        autocomplete="current-password"
        maxlength="128"
        bind:value={currentPassword}
        oninput={edited}
        aria-invalid={errorField === 'currentPassword' ? 'true' : undefined}
        required
      /></label
    >
    <label
      >{translate('New password')}<input
        name="newPassword"
        type={reveal ? 'text' : 'password'}
        autocomplete="new-password"
        minlength="12"
        maxlength="128"
        bind:value={newPassword}
        oninput={edited}
        aria-invalid={tooShort || errorField === 'newPassword' ? 'true' : undefined}
        aria-describedby="profile-new-password-help"
        required
      /></label
    ><small id="profile-new-password-help" class:profile-password__warn={tooShort}
      >{translate('At least 12 characters.')}</small
    >
    <label
      >{translate('Type the new password again')}<input
        name="confirmPassword"
        type={reveal ? 'text' : 'password'}
        autocomplete="new-password"
        maxlength="128"
        bind:value={confirmPassword}
        oninput={edited}
        aria-invalid={mismatch ? 'true' : undefined}
        aria-describedby={mismatch ? 'profile-confirm-password-error' : undefined}
        required
      /></label
    >{#if mismatch}<small id="profile-confirm-password-error" class="profile-password__warn"
        >{translate('The two new passwords do not match.')}</small
      >{/if}
    <label class="profile-password__reveal"
      ><input type="checkbox" bind:checked={reveal} />{translate('Show passwords')}</label
    >
    {#if status === 'saved' || status === 'error'}
      <p
        class="profile-password__result"
        class:profile-password__result--error={status === 'error'}
        role={status === 'error' ? 'alert' : 'status'}
        data-password-result={status}
      >
        {portalText(locale, messageKey)}
      </p>
    {/if}
    <button type="submit" disabled={!ready || status === 'saving'}
      >{status === 'saving' ? translate('Saving…') : translate('Change password')}</button
    >
  </form>
</section>

<style>
  .profile-password__form {
    display: grid;
    gap: 0.85rem;
    max-width: 28rem;
  }
  .profile-password__form label {
    display: grid;
    gap: 0.3rem;
    font-weight: 600;
  }
  .profile-password__form > small {
    margin-top: -0.55rem;
  }
  .profile-password__form small {
    font-weight: 400;
    color: var(--portal-muted, #5b6573);
  }
  .profile-password__form .profile-password__warn {
    color: var(--portal-danger, #b42318);
  }
  .profile-password__reveal {
    display: flex !important;
    align-items: center;
    gap: 0.5rem;
    font-weight: 400 !important;
  }
  /* T90: a 24 px box inside a 44 px tall label (was 20x13 px on a phone). */
  .profile-password__reveal {
    min-height: 44px;
    cursor: pointer;
  }
  .profile-password__reveal input {
    flex: none;
    width: 1.5rem;
    height: 1.5rem;
    min-height: 0;
    margin: 0;
  }
  .profile-password__result {
    margin: 0;
    padding: 0.7rem 0.85rem;
    border-radius: 0.5rem;
    border: 1px solid #a6d8b8;
    background: #ecf8f0;
    color: #14532d;
  }
  .profile-password__result--error {
    border-color: #f1b7b1;
    background: #fdf0ef;
    color: #8a1c12;
  }
  .profile-password__form button {
    justify-self: start;
  }
</style>
