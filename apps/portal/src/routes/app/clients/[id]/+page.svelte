<script lang="ts">
  import { minorDigitsFor } from '$lib/portal/payment-money';
  import { CURRENCIES } from '$lib/portal/currencies';
  import { base } from '$app/paths';
  import { enhance } from '$app/forms';
  import type { ActionResult } from '@sveltejs/kit';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { ToastRegion, type ToastItem } from '$lib/portal/ui';
  import DirectionIcon from '$lib/portal/ui/DirectionIcon.svelte';
  import TimezoneSelect from '$lib/portal/ui/TimezoneSelect.svelte';
  import PermanentDeleteDialog from '$lib/portal/ui/PermanentDeleteDialog.svelte';
  import { hubText, type ProjectHubCopyKey } from '$lib/portal/project-hub-copy';
  import { projectPickLabel } from '$lib/portal/project-ux-round3-copy';
  import { formatDecimalHours } from '$lib/portal/sections/time-entry-actions';
  import { translateControlledValue } from '$lib/i18n/controlled-values';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneActionMessage,
    standaloneText,
  } from '../../standalone-locale';
  import type { PortalLocale } from '$lib/portal-i18n';
  import { deserialize } from '$app/forms';
  import { clientBillingIssues, clientBillingIssueText } from '$lib/portal/client-billing-issues';

  type Row = Record<string, unknown>;
  let { data } = $props();

  let localeOverride = $state<PortalLocale | null>(null);
  const locale = $derived(
    page.url.searchParams.has('lang')
      ? resolveStandaloneLocale(page.url.searchParams.get('lang'), data.locale)
      : (localeOverride ?? data.locale ?? resolveStandaloneLocale()),
  );
  const t = (key: string): string => standaloneText(locale, key);
  const h = (key: ProjectHubCopyKey, params: Record<string, string | number> = {}): string =>
    hubText(locale, key, params);
  const status = (value: unknown): string =>
    translateControlledValue(locale, 'status', value == null ? null : String(value)) ||
    String(value ?? '');
  const text = (row: Row | undefined | null, key: string): string => {
    const value = row?.[key];
    return value === null || value === undefined ? '' : String(value);
  };

  const client = $derived(data.client as Row);
  const clientId = $derived(text(client, 'id'));
  const projects = $derived(data.projects as Array<Row & { monthMinutes: number; totalMinutes: number; waitingMinutes: number }>);
  const invoices = $derived(
    (data.invoices ?? null) as Array<{
      id: string;
      number: string | null;
      projectId: string;
      projectNumber: string;
      state: string;
      currency: string;
      totalMinor: string;
      outstandingMinor: string;
      dueAt: string | null;
    }> | null,
  );
  const balances = $derived(
    (data.balances ?? null) as Array<{ currency: string; outstandingMinor: string; invoicedMinor: string }> | null,
  );
  const contacts = $derived(data.contacts as Row[]);
  const activeProjects = $derived(
    projects.filter((project) => ['active', 'planned', 'paused', 'closing'].includes(text(project, 'status'))),
  );
  const monthMinutes = $derived(projects.reduce((sum, row) => sum + row.monthMinutes, 0));

  function money(minor: unknown, currency: string): string {
    const raw = String(minor ?? '').trim();
    if (!/^-?\d+$/.test(raw)) return '—';
    const value = BigInt(raw);
    const negative = value < 0n;
    const absolute = negative ? -value : value;
    const digits = minorDigitsFor(currency);
    const scale = 10n ** BigInt(digits);
    const major = absolute / scale;
    const cents = (absolute % scale).toString().padStart(digits, '0');
    const numberLocale = locale === 'pt' ? 'pt-BR' : locale;
    const group =
      new Intl.NumberFormat(numberLocale, { useGrouping: true })
        .formatToParts(1234567)
        .find((part) => part.type === 'group')?.value ?? ',';
    const decimal = locale === 'en' ? '.' : ',';
    return `${negative ? '-' : ''}${currency} ${major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, group)}${digits ? `${decimal}${cents}` : ''}`;
  }
  const outstandingLabel = $derived(
    balances && balances.length
      ? balances.map((row) => money(row.outstandingMinor, row.currency)).join(' + ')
      : money('0', text(client, 'currency') || 'USD'),
  );
  const invoicedLabel = $derived(
    balances && balances.length
      ? balances.map((row) => money(row.invoicedMinor, row.currency)).join(' + ')
      : money('0', text(client, 'currency') || 'USD'),
  );
  const newProjectHref = $derived(
    `${base}/app/projects?action=new-project&client=${encodeURIComponent(clientId)}&lang=${locale}#new-project`,
  );

  // ---------- inline edit ----------
  let editing = $state(false);
  let saving = $state(false);
  let editError = $state('');
  let toasts = $state<ToastItem[]>([]);
  function notify(message: string, variant: 'success' | 'danger') {
    const id = `client:${Date.now()}`;
    toasts = [...toasts, { id, message, variant, title: variant === 'success' ? t('Success') : t('Error'), closeLabel: t('Dismiss notification') }];
    setTimeout(() => (toasts = toasts.filter((toast) => toast.id !== id)), 6000);
  }
  const submitEdit = () => {
    saving = true;
    editError = '';
    return async ({ result }: { result: ActionResult }) => {
      saving = false;
      if (result.type === 'success') {
        editing = false;
        notify(h('clientSaved'), 'success');
        await invalidateAll();
      } else {
        const payload = result.type === 'failure' ? (result.data as Row) : null;
        editError =
          payload?.code === 'CLIENT_VERSION_CONFLICT' || result.status === 409
            ? h('versionConflict')
            : h('saveFailed', { message: standaloneActionMessage(locale, payload ?? { success: false }) });
      }
    };
  };

  // Billing-data checks shared with the project hub and the invoice screen.
  const billingIssues = $derived(
    data.financeVisible
      ? [
          ...clientBillingIssues(client),
          ...projects
            .filter((project) => text(project, 'status') !== 'archived')
            .flatMap((project) =>
              clientBillingIssues(null, project).map((issue) => ({
                issue,
                project: projectPickLabel({
                  project_number: project.project_number,
                  name: project.name,
                }),
              })),
            ),
        ].map((entry) =>
          'code' in entry
            ? { key: entry.code, text: clientBillingIssueText(locale, entry) }
            : {
                key: `${entry.issue.code}:${entry.project}`,
                text: `${entry.project}: ${clientBillingIssueText(locale, entry.issue)}`,
              },
        )
      : [],
  );

  // ---------- archive / restore (projects ?/transitionClient, audited) ----------
  const archived = $derived(text(client, 'status') === 'archived');
  let lifeOpen = $state(false);
  let lifeReason = $state('');
  let lifeBusy = $state(false);
  async function changeLifecycle(event: SubmitEvent) {
    event.preventDefault();
    if (lifeBusy || !lifeReason.trim()) return;
    lifeBusy = true;
    const body = new FormData();
    body.set('clientId', clientId);
    body.set('version', text(client, 'version') || '1');
    body.set('status', archived ? 'restore' : 'archived');
    body.set('reason', lifeReason.trim());
    try {
      const response = await fetch(`${base}/app/projects?/transitionClient`, {
        method: 'POST',
        body,
        headers: { 'x-sveltekit-action': 'true', accept: 'application/json' },
      });
      const result = deserialize(await response.text());
      if (result.type === 'success') {
        notify(h(archived ? 'clientRestored' : 'clientArchived'), 'success');
        lifeOpen = false;
        lifeReason = '';
        await invalidateAll();
      } else
        notify(
          standaloneActionMessage(
            locale,
            (result.type === 'failure' ? result.data : null) ?? { success: false },
          ),
          'danger',
        );
    } catch {
      notify(standaloneActionMessage(locale, { success: false }), 'danger');
    } finally {
      lifeBusy = false;
    }
  }

  onMount(() => {
    localeOverride = resolveStandaloneLocale(page.url.searchParams.get('lang'), data.locale);
  });
  $effect(() => {
    persistStandaloneLocale(locale);
    applyStandaloneDocumentLocale(locale);
  });
</script>

<svelte:head>
  <title>{text(client, 'display_name')} | J&A Automation</title>
</svelte:head>

<main class="client-page" data-client-page>
  <nav class="client-crumbs" aria-label={h('clients')}>
    <a href={`${base}/app/projects?view=clients&lang=${locale}`}
      ><DirectionIcon direction="left" /> {h('clients')}</a
    >
  </nav>

  <header class="client-head">
    <div>
      <p class="client-ref">
        {[text(client, 'client_code'), text(client, 'client_number')].filter(Boolean).join(' · ')}
      </p>
      <h1>{text(client, 'display_name')}</h1>
      {#if text(client, 'legal_name') && text(client, 'legal_name') !== text(client, 'display_name')}
        <p class="client-muted">{text(client, 'legal_name')}</p>
      {/if}
    </div>
    <div class="client-head__actions">
      <span class="client-badge" data-state={text(client, 'status')}>{status(client.status)}</span>
      {#if data.canCreateProject}
        <a class="client-primary" href={newProjectHref} data-client-new-project
          >{h('newProjectForClient')}</a
        >
      {/if}
    </div>
  </header>

  <section class="client-figures" aria-label={h('projects')}>
    <div class="client-figure">
      <span>{h('activeProjects')}</span><strong>{activeProjects.length}</strong>
      <small>{projects.length} · {h('total')}</small>
    </div>
    <div class="client-figure">
      <span>{h('figHoursMonth')}</span><strong>{formatDecimalHours(monthMinutes)}</strong>
      <small
        >{h('figHoursTotal', {
          hours: formatDecimalHours(projects.reduce((sum, row) => sum + row.totalMinutes, 0)),
        })}</small
      >
    </div>
    {#if data.financeVisible}
      <div class="client-figure" class:client-figure--attention={balances?.some((row) => row.outstandingMinor !== '0')}>
        <span>{h('outstandingBalance')}</span><strong data-client-outstanding>{outstandingLabel}</strong>
        <small>{h('invoicedTotal')}: {invoicedLabel}</small>
      </div>
    {/if}
  </section>

  {#if billingIssues.length}
    <section class="client-card client-checks" aria-labelledby="client-checks-title" data-client-billing-issues>
      <div class="client-card__head">
        <h2 id="client-checks-title">{h('billingChecksTitle')}</h2>
        {#if data.canEdit && !editing}
          <button type="button" class="client-secondary" onclick={() => (editing = true)}
            >{h('fixClient')}</button
          >
        {/if}
      </div>
      <ul class="client-checks__list">
        {#each billingIssues as issue (issue.key)}
          <li data-client-billing-issue={issue.key}>{issue.text}</li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="client-card" aria-labelledby="client-projects-title" data-client-projects>
    <div class="client-card__head">
      <h2 id="client-projects-title">{h('projects')} · {projects.length}</h2>
    </div>
    {#if projects.length === 0}
      <p class="client-muted">{h('noProjects')}</p>
    {:else}
      <ul class="client-list">
        {#each projects as project (text(project, 'id'))}
          <li>
            <a href={`${base}/app/projects/${encodeURIComponent(text(project, 'id'))}?lang=${locale}`}
              ><strong>{projectPickLabel({ project_number: project.project_number, name: project.name })}</strong></a
            >
            <span class="client-muted"
              >{text(project, 'site_name') || h('noSite')} · {h('hoursMonthShort', {
                hours: formatDecimalHours(project.monthMinutes),
              })} · {formatDecimalHours(project.totalMinutes)} {h('total').toLowerCase()}{project.waitingMinutes
                ? ` · ${h('waiting')}: ${formatDecimalHours(project.waitingMinutes)}`
                : ''}</span
            >
            <span class="client-badge" data-state={text(project, 'status')}>{status(project.status)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if invoices}
    <section class="client-card" aria-labelledby="client-invoices-title" data-client-invoices>
      <div class="client-card__head">
        <h2 id="client-invoices-title">{h('tabInvoices')} · {invoices.length}</h2>
      </div>
      {#if invoices.length === 0}
        <p class="client-muted">{h('noInvoicesClient')}</p>
      {:else}
        <ul class="client-list">
          {#each invoices as invoice (invoice.id)}
            <li>
              <a href={`${base}/app/billing/invoices/${encodeURIComponent(invoice.id)}?lang=${locale}`}
                ><strong>{invoice.number ?? h('draft')}</strong></a
              >
              <span class="client-muted"
                >{invoice.projectNumber} · {money(invoice.totalMinor, invoice.currency)}{invoice.outstandingMinor !== '0'
                  ? ` · ${h('outstanding')}: ${money(invoice.outstandingMinor, invoice.currency)}`
                  : ''}</span
              >
              <span class="client-badge" data-state={invoice.state}>{status(invoice.state)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  <section class="client-card" aria-labelledby="client-contacts-title" data-client-contacts>
    <div class="client-card__head">
      <h2 id="client-contacts-title">{h('contacts')} · {contacts.length}</h2>
      {#if data.canEdit}
        <a
          class="client-secondary"
          href={`${base}/app/projects?view=clients&client=${encodeURIComponent(clientId)}&lang=${locale}#client-contacts-${encodeURIComponent(clientId)}`}
          >{h('manageContacts')}</a
        >
      {/if}
    </div>
    {#if contacts.length === 0}
      <p class="client-muted">{h('noContacts')}</p>
    {:else}
      <ul class="client-list">
        {#each contacts as contact (text(contact, 'id'))}
          <li>
            <strong>{text(contact, 'name')}</strong>
            <span class="client-muted"
              >{[text(contact, 'role'), text(contact, 'company')].filter(Boolean).join(' · ')}
              {#if text(contact, 'email')}<a href={`mailto:${text(contact, 'email')}`}>{text(contact, 'email')}</a>{/if}
              {#if text(contact, 'phone')}<a href={`tel:${text(contact, 'phone')}`}>{text(contact, 'phone')}</a>{/if}</span
            >
            <span class="client-tags">
              {#if Number(contact.is_primary) === 1}<span>{h('primary')}</span>{/if}
              {#if Number(contact.is_billing_contact) === 1}<span>{h('billingContact')}</span>{/if}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="client-card" aria-labelledby="client-settings-title" data-client-settings>
    <div class="client-card__head">
      <h2 id="client-settings-title">{h('tabSettings')}</h2>
      {#if data.canEdit && !editing}
        <button type="button" class="client-secondary" data-client-edit onclick={() => (editing = true)}
          >{h('editClient')}</button
        >
      {/if}
    </div>
    {#if !editing}
      <dl class="client-facts">
        <div><dt>{h('clientCode')}</dt><dd>{text(client, 'client_code') || h('notSet')}</dd></div>
        <div><dt>{h('timezone')}</dt><dd>{text(client, 'timezone') || h('notSet')}</dd></div>
        {#if data.financeVisible}
          <div><dt>{h('currency')}</dt><dd>{text(client, 'currency') || h('notSet')}</dd></div>
          <div>
            <dt>{h('billingEmail')}</dt>
            <dd>
              {#if text(client, 'billing_email')}<a href={`mailto:${text(client, 'billing_email')}`}
                  >{text(client, 'billing_email')}</a
                >{:else}{h('notSet')}{/if}
            </dd>
          </div>
          <div class="client-facts__wide">
            <dt>{h('billingAddress')}</dt>
            <dd class="client-pre">{text(client, 'billing_address') || h('notSet')}</dd>
          </div>
          <div>
            <dt>{h('paymentTerms')}</dt>
            <dd>{h('paymentTermsDays', { days: text(client, 'payment_terms_days') || '30' })}</dd>
          </div>
          <div><dt>{h('defaultPo')}</dt><dd>{text(client, 'po_reference') || h('notSet')}</dd></div>
          <div><dt>{h('taxId')}</dt><dd data-client-tax-id>{text(client, 'tax_id') || h('notSet')}</dd></div>
          {#if text(client, 'notes')}
            <div class="client-facts__wide"><dt>{h('notes')}</dt><dd class="client-pre">{text(client, 'notes')}</dd></div>
          {/if}
        {/if}
      </dl>
    {:else}
      <form
        method="POST"
        action={`${base}/app/projects?/updateClient`}
        class="client-form"
        use:enhance={submitEdit}
        data-client-edit-form
      >
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="version" value={text(client, 'version') || '1'} />
        <label>{h('displayName')}<input name="displayName" required minlength="2" value={text(client, 'display_name')} /></label>
        <label>{h('legalName')}<input name="legalName" required minlength="2" value={text(client, 'legal_name')} /></label>
        <label>{h('clientCode')}<input name="clientCode" maxlength="40" value={text(client, 'client_code')} /></label>
        <label
          >{h('currency')}<select name="currency" value={text(client, 'currency') || 'USD'}>
            {#each CURRENCIES as code (code)}<option value={code}>{code}</option>{/each}
          </select></label
        >
        <TimezoneSelect name="timezone" label={h('timezone')} value={text(client, 'timezone')} {locale} />
        <label>{h('billingEmail')}<input name="billingEmail" type="email" value={text(client, 'billing_email')} /></label>
        <label class="client-form__wide"
          >{h('billingAddress')}<textarea name="billingAddress" rows="3" required minlength="5"
            >{text(client, 'billing_address')}</textarea
          ></label
        >
        <label
          >{h('paymentTerms')}<input
            name="paymentTermsDays"
            type="number"
            min="0"
            max="365"
            required
            value={text(client, 'payment_terms_days') || '30'}
          /></label
        >
        <label>{h('defaultPo')}<input name="poReference" maxlength="200" value={text(client, 'po_reference')} /></label>
        <label>{h('taxId')}<input name="taxId" maxlength="64" autocomplete="off" value={text(client, 'tax_id')} placeholder="B12345678" /></label>
        <label class="client-form__wide"
          >{h('notes')}<textarea name="notes" rows="2">{text(client, 'notes')}</textarea></label
        >
        {#if editError}<p class="client-error client-form__wide" role="alert">{editError}</p>{/if}
        <div class="client-form__actions client-form__wide">
          <button type="button" class="client-secondary" onclick={() => (editing = false)}>{h('cancel')}</button>
          <button type="submit" class="client-primary" disabled={saving} data-client-save
            >{saving ? h('saving') : h('saveClient')}</button
          >
        </div>
      </form>
    {/if}
  </section>

  {#if data.canEdit}
    <section class="client-card" aria-labelledby="client-life-title" data-client-lifecycle>
      <div class="client-card__head">
        <h2 id="client-life-title">{archived ? h('restoreClient') : h('archiveClient')}</h2>
        {#if !lifeOpen}
          <button
            type="button"
            class="client-secondary"
            data-client-life-open
            onclick={() => {
              lifeOpen = true;
              lifeReason = '';
            }}>{archived ? h('restoreClient') : h('archiveClient')}</button
          >
        {/if}
      </div>
      {#if lifeOpen}
        <form class="client-life" onsubmit={changeLifecycle} data-client-life-form>
          <strong
            >{h(archived ? 'restoreClientTitle' : 'archiveClientTitle', {
              name: text(client, 'display_name'),
            })}</strong
          >
          <p>{h(archived ? 'restoreClientHelp' : 'archiveClientHelp')}</p>
          <label
            >{h('reason')}<input
              required
              maxlength="2000"
              bind:value={lifeReason}
              data-client-life-reason
            /></label
          >
          <div class="client-form__actions">
            <button type="button" class="client-secondary" onclick={() => (lifeOpen = false)}
              >{h('cancel')}</button
            >
            <button
              type="submit"
              class="client-primary"
              disabled={lifeBusy || !lifeReason.trim()}
              data-client-life-confirm
              >{archived ? h('restoreClient') : h('archiveClient')}</button
            >
          </div>
        </form>
      {/if}
    </section>
  {/if}

  {#if data.canDelete}
    <section class="client-danger" aria-label={h('dangerZone')}>
      <h2>{h('dangerZone')}</h2>
      <PermanentDeleteDialog
        kind="client"
        recordId={clientId}
        action={`${base}/app/projects?view=clients&/deleteClient`}
        {base}
        {locale}
      />
    </section>
  {/if}
</main>

<ToastRegion {toasts} label={t('Notifications')} ondismiss={(id: string) => (toasts = toasts.filter((toast) => toast.id !== id))} />

<style>
  .client-checks {
    border-color: #f5c26b;
    background: #fffaeb;
  }
  .client-checks__list {
    margin: 0;
    padding-left: 1.2rem;
    display: grid;
    gap: 0.35rem;
    color: #7a2e0e;
    font-weight: 600;
  }
  .client-life {
    display: grid;
    gap: 0.6rem;
  }
  .client-life p {
    margin: 0;
  }
  .client-life label {
    display: grid;
    gap: 0.25rem;
    font-weight: 600;
  }
  .client-life input {
    min-height: 2.75rem;
  }
  .client-page {
    --c-ink: var(--ja-ink, #1f1f1c);
    --c-muted: var(--ja-steel, #77756d);
    --c-line: var(--ja-line, #e4e4e2);
    max-width: 64rem;
    margin: 0 auto;
    padding: clamp(1rem, 2.5vw, 2.25rem);
    color: var(--c-ink);
    display: grid;
    gap: 1rem;
  }
  .client-crumbs a {
    color: var(--c-muted);
    font-weight: 700;
    text-decoration: none;
  }
  .client-head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }
  .client-head h1 {
    margin: 0;
    font-size: clamp(1.55rem, 3vw, 2.1rem);
  }
  .client-ref {
    margin: 0 0 0.25rem;
    font-weight: 600;
    color: var(--c-muted);
  }
  .client-head__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
  }
  .client-muted {
    color: var(--c-muted);
    margin: 0;
  }
  .client-figures {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.75rem;
  }
  .client-figure {
    display: grid;
    gap: 0.2rem;
    padding: 0.85rem 1rem;
    border: 1px solid var(--c-line);
    border-radius: 0.75rem;
    background: #fff;
  }
  .client-figure span,
  .client-figure small {
    color: var(--c-muted);
    font-size: 0.85rem;
  }
  .client-figure strong {
    font-size: 1.35rem;
    overflow-wrap: anywhere;
  }
  .client-figure--attention {
    border-color: #f59e0b;
    background: #fffbeb;
  }
  .client-card {
    border: 1px solid var(--c-line);
    border-radius: 0.75rem;
    background: #fff;
    padding: clamp(1rem, 2vw, 1.4rem);
  }
  .client-card__head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .client-card h2,
  .client-danger h2 {
    margin: 0;
    font-size: 1.15rem;
  }
  .client-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .client-list li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.2rem 1rem;
    padding: 0.65rem 0;
    border-top: 1px solid var(--c-line);
    align-items: center;
  }
  .client-list li > :first-child {
    grid-column: 1;
  }
  .client-list li > .client-muted {
    grid-column: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
  }
  .client-list li > .client-badge,
  .client-list li > .client-tags {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
  .client-list a {
    color: inherit;
  }
  .client-badge {
    display: inline-block;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    border: 1px solid var(--c-line);
    font-size: 0.8rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .client-badge[data-state='active'] {
    border-color: #86efac;
    background: #f0fdf4;
    color: #166534;
  }
  .client-badge[data-state='overdue'] {
    border-color: #fca5a5;
    background: #fef2f2;
    color: #991b1b;
  }
  .client-tags {
    display: flex;
    gap: 0.25rem;
  }
  .client-tags span {
    font-size: 0.75rem;
    padding: 0.1rem 0.45rem;
    border-radius: 0.3rem;
    background: #f1f5f9;
  }
  .client-facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.75rem 1.5rem;
    margin: 0;
  }
  .client-facts dt {
    color: var(--c-muted);
    font-size: 0.85rem;
  }
  .client-facts dd {
    margin: 0.15rem 0 0;
    font-weight: 600;
  }
  .client-facts__wide,
  .client-form__wide {
    grid-column: 1 / -1;
  }
  .client-pre {
    white-space: pre-line;
  }
  .client-form {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 0.85rem;
  }
  .client-form label {
    display: grid;
    gap: 0.3rem;
    font-weight: 600;
  }
  .client-form input,
  .client-form select,
  .client-form textarea {
    min-height: var(--ja-target-min, 2.75rem);
    padding: 0.5rem 0.65rem;
    border: 1px solid #c9c8c3;
    border-radius: 0.45rem;
    font: inherit;
    font-weight: 400;
  }
  .client-form__actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .client-error {
    color: #b42318;
    margin: 0;
  }
  .client-primary,
  .client-secondary {
    display: inline-flex;
    align-items: center;
    min-height: var(--ja-target-min, 2.75rem);
    padding: 0.55rem 1rem;
    border-radius: 0.5rem;
    font: inherit;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
  }
  .client-primary {
    background: var(--ja-primary, #1f1f1c);
    border: 1px solid var(--ja-primary, #1f1f1c);
    color: #fff;
  }
  .client-primary:disabled {
    opacity: 0.6;
  }
  .client-secondary {
    background: #fff;
    border: 1px solid var(--c-line);
    color: var(--c-ink);
  }
  .client-danger {
    padding: 1rem 1.25rem;
    border: 1px solid #fecaca;
    border-radius: 0.75rem;
    background: #fef2f2;
    display: grid;
    gap: 0.5rem;
  }
  .client-danger h2 {
    color: #b42318;
  }
  :focus-visible {
    outline: 3px solid var(--ja-focus, #2563eb);
    outline-offset: 2px;
  }
  @media (max-width: 640px) {
    .client-figures {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .client-head__actions {
      width: 100%;
    }
    .client-primary {
      flex: 1 1 auto;
      justify-content: center;
    }
  }
</style>
