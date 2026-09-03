<script lang="ts">
  import { SectionCard, StatusBadge } from '../ui';
  import type { PortalRow } from '../portal-data';

  /**
   * A read-only directory projection.  The route owns authorization and only
   * passes rows that the current principal may inspect; this component never
   * fetches a broader CRM projection or invents contact/site data.
   */
  export type ClientDirectoryProps = {
    clients: PortalRow[];
    contacts?: PortalRow[];
    projects?: PortalRow[];
    canManageContacts?: boolean;
    translate: (value: string) => string;
    controlledValue?: (domain: 'status', value: unknown) => string;
  };

  let {
    clients,
    contacts = [],
    projects = [],
    canManageContacts = false,
    translate,
    controlledValue,
  }: ClientDirectoryProps = $props();

  let search = $state('');
  let addingForClientId = $state<string | null>(null);
  let editingContactId = $state<string | null>(null);
  const normalizedSearch = $derived(search.trim().toLowerCase());

  function value(row: PortalRow, ...keys: string[]): string {
    for (const key of keys) {
      const candidate = row[key];
      if (candidate !== null && candidate !== undefined && String(candidate).trim())
        return String(candidate);
    }
    return '';
  }

  function id(row: PortalRow): string {
    return value(row, 'id', 'client_id');
  }

  function clientName(row: PortalRow): string {
    return value(row, 'display_name', 'legal_name', 'name') || translate('Unnamed client');
  }

  function statusLabel(row: PortalRow): string {
    const status = value(row, 'status') || 'active';
    return controlledValue?.('status', status) || translate(status);
  }

  function projectStatusLabel(project: PortalRow): string {
    const status = value(project, 'status');
    return status
      ? controlledValue?.('status', status) || translate(status)
      : translate('Status unavailable');
  }

  function clientStatus(row: PortalRow): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    switch (value(row, 'status')) {
      case 'active':
        return 'success';
      case 'archived':
        return 'neutral';
      case 'suspended':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  function belongsTo(row: PortalRow, client: PortalRow): boolean {
    const clientId = id(client);
    if (!clientId) return false;
    return value(row, 'client_id', 'clientId') === clientId;
  }

  function clientContacts(client: PortalRow): PortalRow[] {
    return contacts.filter((contact) => belongsTo(contact, client));
  }

  function clientProjects(client: PortalRow): PortalRow[] {
    return projects.filter((project) => belongsTo(project, client));
  }

  function projectLabel(project: PortalRow): string {
    const number = value(project, 'project_number', 'projectNumber');
    const name = value(project, 'name', 'project_name');
    return [number, name].filter(Boolean).join(' · ') || translate('Authorized project');
  }

  function projectSite(project: PortalRow): string {
    return value(project, 'site_name', 'site', 'plant_site');
  }

  function matches(client: PortalRow): boolean {
    if (!normalizedSearch) return true;
    const related = [...clientContacts(client), ...clientProjects(client)];
    const haystack = [
      clientName(client),
      value(client, 'client_number', 'client_code', 'billing_email', 'billing_address'),
      ...related.flatMap((row) => [
        value(row, 'name', 'project_name', 'project_number'),
        value(row, 'email', 'phone', 'site_name', 'site', 'plant_site'),
      ]),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedSearch);
  }

  const visibleClients = $derived((clients ?? []).filter(matches));
</script>

<div class="client-directory" data-client-directory>
  <header class="client-directory__header">
    <div>
      <p class="client-directory__eyebrow">{translate('AUTHORIZED DIRECTORY')}</p>
      <h2>{translate('Clients')}</h2>
      <p>{translate('Authorized client contacts, sites and project context.')}</p>
    </div>
    <span class="client-directory__count" aria-live="polite">{visibleClients.length}</span>
  </header>

  <form
    class="client-directory__filter"
    aria-label={translate('Filter clients')}
    onsubmit={(event) => event.preventDefault()}
  >
    <label>
      <span>{translate('Search clients')}</span>
      <input
        bind:value={search}
        type="search"
        placeholder={translate('Company, contact, phone or site')}
      />
    </label>
  </form>

  <div class="client-directory__list">
    {#each visibleClients as client}
      {@const clientId = id(client)}
      {@const relatedContacts = clientContacts(client)}
      {@const relatedProjects = clientProjects(client)}
      {@const sites = [...new Set(relatedProjects.map(projectSite).filter(Boolean))]}
      <SectionCard
        title={clientName(client)}
        class="client-directory__card"
        data-client-id={clientId || undefined}
      >
        <div class="client-directory__identity">
          <div>
            <span class="client-directory__number"
              >{value(client, 'client_number', 'client_code') ||
                translate('No client number')}</span
            >
            {#if value(client, 'legal_name') && value(client, 'legal_name') !== clientName(client)}
              <span class="client-directory__legal">{value(client, 'legal_name')}</span>
            {/if}
          </div>
          <StatusBadge variant={clientStatus(client)} text={statusLabel(client)} />
        </div>

        <dl class="client-directory__facts">
          {#if value(client, 'billing_address')}
            <div>
              <dt>{translate('Address')}</dt>
              <dd>{value(client, 'billing_address')}</dd>
            </div>
          {/if}
          {#if value(client, 'billing_email')}
            <div>
              <dt>{translate('Billing contact')}</dt>
              <dd>{value(client, 'billing_email')}</dd>
            </div>
          {/if}
          {#if value(client, 'currency')}
            <div>
              <dt>{translate('Currency')}</dt>
              <dd>{value(client, 'currency')}</dd>
            </div>
          {/if}
        </dl>

        <div class="client-directory__groups">
          <section aria-labelledby={`client-contacts-${clientId}`}>
            <div class="client-directory__group-heading">
              <h3 id={`client-contacts-${clientId}`}>{translate('Contacts')}</h3>
              {#if canManageContacts}
                <button
                  type="button"
                  class="client-directory__action primary-button"
                  aria-expanded={addingForClientId === clientId}
                  aria-controls={`client-contact-new-${clientId}`}
                  onclick={() =>
                    (addingForClientId = addingForClientId === clientId ? null : clientId)}
                  >{translate('Add contact')}</button
                >
              {/if}
            </div>
            {#if canManageContacts && addingForClientId === clientId}
              <form
                id={`client-contact-new-${clientId}`}
                method="POST"
                action="?view=clients&/createClientContact"
                class="client-directory__contact-form"
              >
                <input type="hidden" name="clientId" value={clientId} />
                <label><span>{translate('Name')}</span><input name="name" required /></label>
                <label><span>{translate('Email')}</span><input name="email" type="email" /></label>
                <label><span>{translate('Phone')}</span><input name="phone" /></label>
                <label><span>{translate('Role')}</span><input name="role" /></label>
                <label class="client-directory__check"
                  ><input name="isPrimary" type="checkbox" /><span
                    >{translate('Primary contact')}</span
                  ></label
                >
                <label class="client-directory__check"
                  ><input name="isBillingContact" type="checkbox" /><span
                    >{translate('Billing contact')}</span
                  ></label
                >
                <div class="client-directory__form-actions">
                  <button type="submit" class="client-directory__action primary-button"
                    >{translate('Save contact')}</button
                  >
                  <button
                    type="button"
                    class="client-directory__action client-directory__action--quiet secondary-button"
                    onclick={() => (addingForClientId = null)}>{translate('Cancel')}</button
                  >
                </div>
              </form>
            {/if}
            <div class="client-directory__contact-list">
              {#each relatedContacts as contact}
                <article class="client-directory__contact">
                  <strong>{value(contact, 'name') || translate('Unnamed contact')}</strong>
                  <span>{value(contact, 'role') || translate('Contact')}</span>
                  {#if value(contact, 'email')}
                    <a href={`mailto:${value(contact, 'email')}`}>{value(contact, 'email')}</a>
                  {:else}<span>{translate('No email')}</span>{/if}
                  {#if value(contact, 'phone')}<span>{value(contact, 'phone')}</span>{/if}
                  {#if canManageContacts}
                    <div class="client-directory__contact-actions" data-contact-actions>
                      <button
                        type="button"
                        class="client-directory__action primary-button"
                        aria-expanded={editingContactId === value(contact, 'id')}
                        aria-controls={`client-contact-edit-${value(contact, 'id')}`}
                        onclick={() =>
                          (editingContactId =
                            editingContactId === value(contact, 'id')
                              ? null
                              : value(contact, 'id'))}>{translate('Edit contact')}</button
                      >
                      <form
                        method="POST"
                        action="?view=clients&/deleteClientContact"
                        onsubmit={(event) => {
                          if (!confirm(translate('Delete this contact?'))) event.preventDefault();
                        }}
                      >
                        <input type="hidden" name="contactId" value={value(contact, 'id')} />
                        <button
                          type="submit"
                          class="client-directory__action client-directory__action--danger danger-button"
                          >{translate('Delete contact')}</button
                        >
                      </form>
                    </div>
                    {#if editingContactId === value(contact, 'id')}
                      <form
                        id={`client-contact-edit-${value(contact, 'id')}`}
                        method="POST"
                        action="?view=clients&/updateClientContact"
                        class="client-directory__contact-form"
                      >
                        <input type="hidden" name="contactId" value={value(contact, 'id')} />
                        <label
                          ><span>{translate('Name')}</span><input
                            name="name"
                            value={value(contact, 'name')}
                            required
                          /></label
                        >
                        <label
                          ><span>{translate('Email')}</span><input
                            name="email"
                            type="email"
                            value={value(contact, 'email')}
                          /></label
                        >
                        <label
                          ><span>{translate('Phone')}</span><input
                            name="phone"
                            value={value(contact, 'phone')}
                          /></label
                        >
                        <label
                          ><span>{translate('Role')}</span><input
                            name="role"
                            value={value(contact, 'role')}
                          /></label
                        >
                        <label class="client-directory__check"
                          ><input
                            name="isPrimary"
                            type="checkbox"
                            checked={Boolean(contact.is_primary)}
                          /><span>{translate('Primary contact')}</span></label
                        >
                        <label class="client-directory__check"
                          ><input
                            name="isBillingContact"
                            type="checkbox"
                            checked={Boolean(contact.is_billing_contact)}
                          /><span>{translate('Billing contact')}</span></label
                        >
                        <div class="client-directory__form-actions">
                          <button type="submit" class="client-directory__action primary-button"
                            >{translate('Update contact')}</button
                          >
                          <button
                            type="button"
                            class="client-directory__action client-directory__action--quiet secondary-button"
                            onclick={() => (editingContactId = null)}>{translate('Cancel')}</button
                          >
                        </div>
                      </form>
                    {/if}
                  {/if}
                </article>
              {:else}
                <p class="client-directory__empty">{translate('No contacts recorded.')}</p>
              {/each}
            </div>
          </section>

          <section aria-labelledby={`client-projects-${clientId}`}>
            <h3 id={`client-projects-${clientId}`}>{translate('Projects and sites')}</h3>
            <div class="client-directory__project-list">
              {#each relatedProjects as project}
                <article class="client-directory__project">
                  <strong>{projectLabel(project)}</strong>
                  <span>{projectStatusLabel(project)}</span>
                  {#if projectSite(project)}<small>{projectSite(project)}</small>{/if}
                </article>
              {:else}
                <p class="client-directory__empty">
                  {translate('No associated projects recorded.')}
                </p>
              {/each}
            </div>
            {#if sites.length > 0}
              <p class="client-directory__sites">
                <span>{translate('Sites / plants')}</span>
                {sites.join(' · ')}
              </p>
            {/if}
          </section>
        </div>
      </SectionCard>
    {:else}
      <p class="client-directory__empty client-directory__empty--large">
        {translate('No authorized clients found.')}
      </p>
    {/each}
  </div>
</div>

<style>
  .client-directory {
    display: grid;
    gap: 1rem;
  }

  .client-directory__header,
  .client-directory__identity {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .client-directory__eyebrow {
    margin: 0 0 0.35rem;
    color: var(--portal-muted, #64748b);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.12em;
  }

  .client-directory h2,
  .client-directory h3 {
    margin: 0;
    color: var(--portal-ink, #16202a);
  }

  .client-directory__header p:last-child {
    margin: 0.35rem 0 0;
    color: var(--portal-muted, #64748b);
  }

  .client-directory__count {
    display: grid;
    min-width: 2.75rem;
    min-height: 2.75rem;
    place-items: center;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 999px;
    color: var(--portal-ink, #16202a);
    font-weight: 800;
  }

  .client-directory__filter {
    padding: 0.9rem 1rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.75rem;
    background: var(--portal-surface, #fff);
  }

  .client-directory__filter label {
    display: grid;
    gap: 0.35rem;
    color: var(--portal-muted, #64748b);
    font-size: 0.8rem;
    font-weight: 700;
  }

  .client-directory input {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: var(--ja-target-min, 2.75rem);
    border: 1px solid var(--ja-control-border, #64748b);
    border-radius: 0.5rem;
    padding: 0.55rem 0.7rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #16202a);
    font: inherit;
  }

  .client-directory input:focus-visible,
  .client-directory button:focus-visible,
  .client-directory a:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--portal-accent, #0f5f73) 32%, transparent);
    outline-offset: 2px;
  }

  .client-directory__list {
    display: grid;
    gap: 1rem;
  }

  :global(.client-directory__card) {
    display: grid;
    gap: 1rem;
  }

  .client-directory__identity {
    align-items: center;
  }

  .client-directory__identity > div,
  .client-directory__contact,
  .client-directory__project {
    display: grid;
    gap: 0.2rem;
  }

  .client-directory__number,
  .client-directory__legal,
  .client-directory__contact span,
  .client-directory__project span,
  .client-directory__project small,
  .client-directory__empty,
  .client-directory__sites {
    color: var(--portal-muted, #526174);
  }

  .client-directory__number {
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .client-directory__legal {
    font-size: 0.82rem;
  }

  .client-directory__facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.75rem;
    margin: 0;
  }

  .client-directory__facts div {
    min-width: 0;
    padding: 0.7rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--portal-surface, #fff) 92%, var(--portal-wash, #eef2f5));
  }

  .client-directory__facts dt {
    color: var(--portal-muted, #64748b);
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .client-directory__facts dd {
    margin: 0.2rem 0 0;
    overflow-wrap: anywhere;
    font-weight: 700;
  }

  .client-directory__groups {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .client-directory__groups section {
    min-width: 0;
  }

  .client-directory h3 {
    margin-bottom: 0.55rem;
    font-size: 0.95rem;
  }

  .client-directory__group-heading,
  .client-directory__contact-actions,
  .client-directory__form-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.55rem;
  }

  .client-directory__contact-actions {
    justify-content: flex-start;
    margin-top: 0.55rem;
    position: relative;
    z-index: 2;
  }

  .client-directory__contact-actions form {
    margin: 0;
  }

  .client-directory__action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--ja-target-min, 2.75rem);
    border: 1px solid var(--ja-primary, #0f766e);
    border-radius: 0.6rem;
    padding: 0.58rem 0.9rem;
    background: var(--ja-primary, #0f766e);
    color: #fff;
    box-shadow: 0 0.3rem 0.8rem rgb(16 32 47 / 0.12);
    font: inherit;
    font-size: 0.75rem;
    font-weight: 800;
    line-height: 1.1;
    cursor: pointer;
  }

  .client-directory__action--danger {
    border-color: var(--ja-status-danger, #dc2626);
    background: var(--ja-status-danger, #dc2626);
  }

  .client-directory__action--quiet {
    color: var(--ja-primary-hover, #115e59);
    background: var(--ja-surface, #fff);
    box-shadow: none;
  }

  .client-directory__contact-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
    margin: 0 0 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.55rem;
    background: var(--portal-surface, #fff);
  }

  .client-directory__contact-form label:not(.client-directory__check) {
    display: grid;
    gap: 0.3rem;
    color: var(--portal-muted, #526174);
    font-size: 0.8rem;
    font-weight: 800;
  }

  .client-directory__check {
    display: flex;
    min-height: var(--ja-target-min, 2.75rem);
    align-items: center;
    gap: 0.5rem;
    font-size: 0.82rem;
    font-weight: 750;
  }

  .client-directory__check input {
    width: 1.1rem;
    min-height: 1.1rem;
  }

  .client-directory__form-actions {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }

  .client-directory__contact-list,
  .client-directory__project-list {
    display: grid;
    gap: 0.5rem;
  }

  .client-directory__contact,
  .client-directory__project {
    min-width: 0;
    padding: 0.7rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.5rem;
    background: var(--portal-wash, #f5f8fa);
  }

  .client-directory__contact a {
    display: inline-flex;
    min-height: var(--ja-target-min, 2.75rem);
    align-items: center;
    overflow-wrap: anywhere;
    color: var(--portal-accent, #0f5f73);
    font-size: 0.82rem;
    font-weight: 700;
  }

  .client-directory__sites {
    margin: 0.6rem 0 0;
    font-size: 0.82rem;
  }

  .client-directory__sites span {
    display: block;
    margin-bottom: 0.15rem;
    color: var(--portal-ink, #16202a);
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .client-directory__empty {
    margin: 0;
    padding: 0.6rem;
    border: 1px dashed var(--portal-border, #d7dee8);
    font-size: 0.82rem;
  }

  .client-directory__empty--large {
    padding: 1.25rem;
    text-align: center;
  }

  @media (max-width: 640px) {
    .client-directory__header,
    .client-directory__identity {
      align-items: stretch;
      flex-direction: column;
    }

    .client-directory__count {
      width: fit-content;
    }

    .client-directory__groups,
    .client-directory__contact-form {
      grid-template-columns: 1fr;
    }

    .client-directory__contact-actions,
    .client-directory__contact-actions form,
    .client-directory__contact-actions button,
    .client-directory__form-actions,
    .client-directory__form-actions button {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .client-directory * {
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
    }
  }
</style>
