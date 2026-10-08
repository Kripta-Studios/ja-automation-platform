<script lang="ts">
  type Row = Record<string, unknown>;
  let {
    clientId,
    contacts = [],
    values = {},
    allowNew = false,
    translate = (s: string) => s,
  }: {
    clientId: string;
    contacts?: Row[];
    values?: Row;
    allowNew?: boolean;
    translate?: (s: string) => string;
  } = $props();
  let createContact = $state(false);
  const wantsNew = $derived(createContact || Boolean(values.onsiteContactName));
  const availableContacts = $derived(contacts.filter((row) => String(row.client_id) === clientId));
  const field = (key: string) => String(values[key] ?? '');
</script>

<fieldset class="wide-field site-fields">
  <legend>{translate('On-site details (optional)')}</legend>
  <p class="form-help">
    {translate(
      'The operating company and contact can differ from the client receiving the invoice.',
    )}
  </p>
  <div class="site-fields__grid">
    <label
      >{translate('On-site company / plant')}<input
        name="siteName"
        maxlength="200"
        value={field('siteName')}
      /></label
    >
    <label
      >{translate('Location (optional)')}<input
        name="siteLocation"
        maxlength="500"
        value={field('siteLocation')}
      /></label
    >
    <label
      >{translate('On-site manager (optional)')}<input
        name="onsiteManager"
        maxlength="200"
        value={field('onsiteManager')}
      /></label
    >
    {#if !wantsNew}
      <label
        >{translate('On-site contact (optional)')}<select
          name="onsiteContactId"
          value={field('onsiteContactId')}
        >
          <option value="">{translate('No on-site contact')}</option>
          {#each availableContacts as contact}<option value={String(contact.id)}
              >{contact.name}{contact.company ? ` · ${contact.company}` : ''}{contact.role
                ? ` · ${contact.role}`
                : ''}</option
            >{/each}
        </select><small>{translate('Choose a contact saved under this client.')}</small></label
      >
    {:else}
      <input type="hidden" name="onsiteContactId" value="" />
      <label
        >{translate('New on-site contact name')}<input
          name="onsiteContactName"
          maxlength="160"
          value={field('onsiteContactName')}
          required
        /></label
      >
      <label
        >{translate('Contact email (optional)')}<input
          name="onsiteContactEmail"
          type="email"
          maxlength="254"
          value={field('onsiteContactEmail')}
        /></label
      >
      <label
        >{translate('Contact phone (optional)')}<input
          name="onsiteContactPhone"
          maxlength="60"
          value={field('onsiteContactPhone')}
        /></label
      >
      <label
        >{translate('Position (optional)')}<input
          name="onsiteContactRole"
          maxlength="120"
          value={field('onsiteContactRole')}
        /></label
      >
    {/if}
  </div>
  {#if allowNew}<label class="site-fields__toggle"
      ><input
        type="checkbox"
        checked={wantsNew}
        onchange={(event) => {
          createContact = event.currentTarget.checked;
          if (!createContact) values = { ...values, onsiteContactName: '' };
        }}
      />{translate('Create a new contact under this client')}</label
    >{/if}
</fieldset>

<style>
  .site-fields {
    border: 1px solid var(--border, #d9e2ee);
    border-radius: 0.75rem;
    padding: 1rem;
    min-width: 0;
  }
  .site-fields legend {
    padding: 0 0.4rem;
    font-weight: 700;
  }
  .site-fields__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
    gap: 1rem;
  }
  .site-fields__grid label {
    display: grid;
    gap: 0.4rem;
    min-width: 0;
  }
  .site-fields__grid input,
  .site-fields__grid select {
    width: 100%;
    min-width: 0;
  }
  .site-fields__toggle {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding-top: 1rem;
  }
</style>
