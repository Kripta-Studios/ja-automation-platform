<script lang="ts">
  import type { Copy } from './content';
  let {
    content,
    kind = 'contact',
  }: { content: Copy; kind?: 'contact' | 'support' | 'aquarex' | 'career-interest' } = $props();
  let state = $state<'idle' | 'sending' | 'success' | 'error'>('idle');

  async function submit(event: SubmitEvent) {
    const form = event.currentTarget as HTMLFormElement;
    state = 'sending';
    const payload = Object.fromEntries(new FormData(form));
    const endpoint = kind === 'support' ? 'contact' : kind;
    const response = await fetch(`/j-aautomation/api/public/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, kind }),
    }).catch(() => null);
    state = response?.ok ? 'success' : 'error';
    if (response?.ok) form.reset();
  }
</script>

<form
  class="inquiry-form"
  onsubmit={(event) => {
    event.preventDefault();
    void submit(event);
  }}
>
  <input class="honeypot" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
  <input type="hidden" name="kind" value={kind} />
  <label
    >{content.form.name}<input name="name" required maxlength="160" autocomplete="name" /></label
  >
  {#if kind !== 'career-interest'}<label
      >{content.form.company}<input
        name="company"
        required
        maxlength="160"
        autocomplete="organization"
      /></label
    >{/if}
  <label
    >{content.form.email}<input
      name="email"
      type="email"
      required
      maxlength="254"
      autocomplete="email"
    /></label
  >
  {#if kind !== 'career-interest'}<label
      >{content.form.phone}<input
        name="phone"
        required={kind === 'support'}
        maxlength="40"
        autocomplete="tel"
      /></label
    >{/if}
  {#if kind === 'career-interest'}
    <label>Location<input name="location" required maxlength="160" /></label><label
      >Profile<input name="profile" required maxlength="160" /></label
    ><label>Platforms<input name="platforms" maxlength="500" /></label><label
      >Travel availability<select name="travel"
        ><option value="yes">Yes</option><option value="limited">Limited</option><option value="no"
          >No</option
        ></select
      ></label
    >
  {:else}
    <label>{content.form.site}<input name="site" required maxlength="160" /></label>
    {#if kind === 'contact'}<label
        >{content.form.industry}<input name="industry" required maxlength="160" /></label
      ><label>{content.form.type}<input name="projectType" required maxlength="160" /></label>{/if}
    {#if kind === 'support'}<label
        >Urgency<select name="urgency"
          ><option value="production_stopped">Production stopped</option><option value="degraded"
            >Production degraded</option
          ><option value="planned">Planned support</option></select
        ></label
      >{/if}
    <label
      >{content.form.platform}<input
        name="platform"
        required={kind === 'support'}
        maxlength="160"
      /></label
    >
    {#if kind === 'contact'}<label
        >{content.form.preference}<select name="preferredContact"
          ><option value="email">Email</option><option value="phone">Phone</option></select
        ></label
      >{/if}
  {/if}
  <label class="wide"
    >{content.form.message}<textarea
      name="message"
      required
      minlength="20"
      maxlength="5000"
      rows="6"
    ></textarea></label
  >
  <div class="wide form-end">
    <p class="form-note">Do not include passwords, access tokens or confidential credentials.</p>
    <button class="button red" disabled={state === 'sending'}
      >{state === 'sending' ? 'Sending…' : content.form.send}</button
    >
  </div>
  <p class="wide status" aria-live="polite" class:error={state === 'error'}>
    {state === 'success' ? content.form.success : state === 'error' ? content.form.error : ''}
  </p>
</form>
