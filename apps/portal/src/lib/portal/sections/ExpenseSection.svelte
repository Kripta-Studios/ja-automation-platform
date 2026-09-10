<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import { ResponsiveSheet, SectionCard, StatusBadge } from '../ui';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import { money } from '../portal-format';
  import {
    operationalMatches,
    operationalNewestFirst,
    operationalPage,
    readOperationalRegisterState,
    writeOperationalRegisterState,
  } from './operational-register';

  let {
    data,
    isAuditor,
    availableProjects,
    saveOfflineDraft,
    translate,
    controlledValue,
  }: {
    data: PortalData;
    isAuditor: boolean;
    availableProjects: Row[];
    saveOfflineDraft: (
      event: SubmitEvent,
      entityType: 'time' | 'daily_report' | 'technical_report' | 'expense',
    ) => Promise<void>;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
  } = $props();

  type Surface = 'create' | 'edit';

  let surface = $state<Surface | null>(null);
  let editExpenseId = $state<string | null>(null);
  $effect(() => {
    const id = $page.url.searchParams.get('edit');
    if (id && records.some((row) => String(row.id) === id && row.approval_state === 'draft')) {
      editExpenseId = id;
      surface = 'edit';
    }
  });
  let search = $state('');
  let projectFilter = $state('');
  let statusFilter = $state('');
  let receiptPreviewUrl = $state<string | null>(null);
  let receiptPreviewName = $state('');
  let receiptPreviewMime = $state('');
  let registerPage = $state(1);
  let registerStateHydrated = $state(false);
  let exportFrom = $state(`${new Date().toISOString().slice(0, 8)}01`);
  let exportTo = $state(new Date().toISOString().slice(0, 10));
  let exportProject = $state('');
  let exportWorker = $state('');
  const registerStateKey = (): string => `ja-operational-register:expenses:${data.user.id}`;

  onMount(() => {
    const saved = readOperationalRegisterState<{ search?: string; page?: number }>(
      registerStateKey(),
    );
    if (typeof saved?.search === 'string') search = saved.search;
    if (typeof saved?.page === 'number') registerPage = saved.page;
    registerStateHydrated = true;
  });
  $effect(() => {
    if (registerStateHydrated)
      writeOperationalRegisterState(registerStateKey(), { search, page: registerPage });
  });

  const expenseCategories = [
    ['hotel', 'Hotel'],
    ['rental_car', 'Rental car'],
    ['fuel', 'Fuel'],
    ['tolls', 'Tolls'],
    ['parking', 'Parking'],
    ['airfare', 'Airfare'],
    ['ground_transport', 'Train / bus / taxi / rideshare'],
    ['meals', 'Meals'],
    ['per_diem', 'Per diem'],
    ['materials', 'Project materials'],
    ['tools', 'Tools / consumables'],
    ['shipping', 'Shipping'],
    ['phone_data', 'Phone / data'],
    ['visa_permit', 'Visa / permit'],
    ['other', 'Other'],
  ] as const;

  const records = $derived(data.records ?? []);
  $effect(() => {
    projectFilter = $page.url.searchParams.get('project')?.trim() ?? '';
    statusFilter = $page.url.searchParams.get('status')?.trim() ?? '';
    registerPage = 1;
  });
  const editRow = $derived.by(
    () => records.find((row) => String(row.id) === editExpenseId) as Row | undefined,
  );
  const visibleRecords = $derived.by(() => {
    return operationalNewestFirst(
      records.filter((row) => {
        const matchesSearch = operationalMatches(row, search, [
          'vendor',
          'project_number',
          'project_name',
          'client_name',
          'description',
          'spent_on',
          'worker_name',
        ]);
        const matchesProject = !projectFilter || String(row.project_id ?? '') === projectFilter;
        const matchesStatus = !statusFilter || String(row.approval_state ?? '') === statusFilter;
        return matchesSearch && matchesProject && matchesStatus;
      }),
      ['spent_on'],
    );
  });
  const pagedRecords = $derived(operationalPage(visibleRecords, registerPage));

  const pendingReviewCount = $derived(
    records.filter((row) =>
      ['draft', 'needs_changes', 'submitted'].includes(String(row.approval_state)),
    ).length,
  );
  const reimbursementCount = $derived(
    records.filter((row) => ['pending', 'scheduled'].includes(String(row.reimbursement_state)))
      .length,
  );

  function rowText(row: Row, key: string): string {
    const value = row[key];
    return value === null || value === undefined ? '' : String(value);
  }

  // Keep minor-unit formatting string based so edit forms never round through
  // binary floating point.
  function minorToDecimal(value: unknown): string {
    const raw = String(value ?? '');
    if (!/^\d+$/.test(raw)) return '';
    const padded = raw.padStart(3, '0');
    return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
  }

  function statusVariant(value: unknown): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    switch (String(value ?? '')) {
      case 'approved':
      case 'paid':
        return 'success';
      case 'rejected':
      case 'void':
        return 'danger';
      case 'submitted':
      case 'needs_changes':
      case 'pending':
      case 'scheduled':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  function openCreate(): void {
    surface = 'create';
    editExpenseId = null;
  }

  function handleReceiptChange(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    if (receiptPreviewUrl && typeof URL !== 'undefined') URL.revokeObjectURL(receiptPreviewUrl);
    const file = input.files?.[0];
    receiptPreviewName = file?.name ?? '';
    receiptPreviewMime = file?.type ?? '';
    receiptPreviewUrl = file && typeof URL !== 'undefined' ? URL.createObjectURL(file) : null;
  }

  function clearReceiptPreview(): void {
    if (receiptPreviewUrl && typeof URL !== 'undefined') URL.revokeObjectURL(receiptPreviewUrl);
    receiptPreviewUrl = null;
    receiptPreviewName = '';
    receiptPreviewMime = '';
  }

  function openEdit(row: Row): void {
    surface = 'edit';
    editExpenseId = String(row.id);
  }

  function closeSurface(): void {
    surface = null;
    editExpenseId = null;
    clearReceiptPreview();
  }

  function registerHref(overrides: Record<string, string>): string {
    const params = new URLSearchParams();
    const project = overrides.project ?? projectFilter;
    const status = overrides.status ?? statusFilter;
    if (project) params.set('project', project);
    if (status) params.set('status', status);
    const query = params.toString();
    return `${base}/app/expenses${query ? `?${query}` : ''}`;
  }

  function exportHref(format: 'csv' | 'xlsx' | 'pdf'): string {
    const params = new URLSearchParams({ from: exportFrom, to: exportTo, format });
    if (exportProject) params.set('project', exportProject);
    if (exportWorker) params.set('worker', exportWorker);
    return `${base}/app/expenses/export?${params.toString()}`;
  }
</script>

<div class="expense-page">
  <header class="expense-page-context">
    <div>
      <p class="expense-eyebrow">{translate('Worker operations')}</p>
      <h2>{translate('Expenses and reimbursements')}</h2>
      <p>
        {translate(
          'Record the receipt and operational facts. Finance handles later classification.',
        )}
      </p>
    </div>
    <span class="expense-record-count" aria-label={translate('Expense count')}
      >{records.length}</span
    >
  </header>

  {#if !isAuditor}
    <div class="expense-primary-action expense-primary-action-top">
      <button type="button" data-expense-primary-cta onclick={openCreate}>
        <span aria-hidden="true">＋</span>
        {translate('Record expense')}
      </button>
    </div>
  {/if}

  <div class="expense-status-strip" aria-label={translate('Expense attention summary')}>
    <a class="expense-status-card" href={registerHref({ status: 'submitted' })}>
      <span>{translate('Needs attention')}</span>
      <strong>{pendingReviewCount}</strong>
      <small>{translate('Draft or review state')}</small>
    </a>
    <a class="expense-status-card" href={registerHref({ status: 'approved' })}>
      <span>{translate('Reimbursement')}</span>
      <strong>{reimbursementCount}</strong>
      <small>{translate('Pending or scheduled')}</small>
    </a>
  </div>

  <form
    class="expense-filters"
    method="GET"
    action={`${base}/app/expenses`}
    aria-label={translate('Filter expenses')}
  >
    <label>
      <span>{translate('Search expenses')}</span>
      <input
        bind:value={search}
        oninput={() => (registerPage = 1)}
        type="search"
        placeholder={translate('Vendor, project or date')}
      />
    </label>
    <label>
      <span>{translate('Project')}</span>
      <select name="project" bind:value={projectFilter} onchange={() => (registerPage = 1)}>
        <option value="">{translate('All projects')}</option>
        {#each availableProjects as project}
          <option value={String(project.id)}>{project.project_number} — {project.name}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>{translate('Status')}</span>
      <select name="status" bind:value={statusFilter} onchange={() => (registerPage = 1)}>
        <option value="">{translate('All statuses')}</option>
        <option value="draft">{translate('Draft')}</option>
        <option value="submitted">{translate('Submitted')}</option>
        <option value="approved">{translate('Approved')}</option>
        <option value="needs_changes">{translate('Needs changes')}</option>
      </select>
    </label>
    <button type="submit" class="secondary-button">{translate('Apply filters')}</button>
  </form>

  <section class="expense-export-panel" aria-labelledby="expense-export-title">
    <div>
      <h3 id="expense-export-title">{translate('Export expense register')}</h3>
      <p>{translate('Download the filtered operational expenses as PDF, Excel or CSV.')}</p>
    </div>
    <div class="expense-export-fields">
      <label><span>{translate('From')}</span><input type="date" bind:value={exportFrom} /></label>
      <label><span>{translate('To')}</span><input type="date" bind:value={exportTo} /></label>
      <label><span>{translate('Project')}</span><select bind:value={exportProject}><option value="">{translate('All projects')}</option>{#each availableProjects as project}<option value={String(project.id)}>{project.project_number} — {project.name}</option>{/each}</select></label>
      {#if data.user.role === 'owner_admin' || data.user.role === 'project_manager'}
        <label><span>{translate('Worker')}</span><select bind:value={exportWorker}><option value="">{translate('All workers')}</option>{#each data.workers ?? [] as worker}<option value={String(worker.id)}>{worker.name}</option>{/each}</select></label>
      {/if}
    </div>
    <div class="expense-export-actions">
      <a class="secondary-button" href={exportHref('pdf')}>{translate('Download PDF')}</a>
      <a class="secondary-button" href={exportHref('xlsx')}>{translate('Download Excel')}</a>
      <a class="secondary-button" href={exportHref('csv')}>{translate('Download CSV')}</a>
    </div>
  </section>

  <SectionCard title={translate('Recent expenses')} class="expense-list-surface">
    {#if visibleRecords.length > 0}
      <div class="expense-list" aria-live="polite">
        {#each pagedRecords.rows as row}
          <article class="expense-record" data-expense-record={String(row.id)}>
            <a class="record-card-link" href={`${base}/app/expenses/${String(row.id)}`}>
              <div class="expense-record-main">
                <strong>{row.vendor || translate('Expense')}</strong>
                <span class="expense-record-amount"
                  >{money(row.amount_minor, String(row.currency))}</span
                >
              </div>
              <small>
                {row.spent_on} · {row.project_number} · {controlledValue(
                  'expenseCategory',
                  row.category,
                ) || translate(String(row.category ?? ''))}
              </small>
              <span class="record-card-open">{translate('Open record →')}</span>
            </a>
            <div class="expense-record-statuses">
              <StatusBadge
                variant={statusVariant(row.approval_state)}
                text={controlledValue('status', row.approval_state) ||
                  translate(String(row.approval_state ?? ''))}
              />
              {#if row.reimbursement_state}
                <StatusBadge
                  variant={statusVariant(row.reimbursement_state)}
                  text={`${translate('Reimbursement')}: ${controlledValue('status', row.reimbursement_state) || translate(String(row.reimbursement_state))}`}
                />
              {/if}
            </div>
            {#if String(row.worker_id) === data.user.id || data.user.role === 'owner_admin'}
              <div class="expense-record-actions">
                {#if row.approval_state === 'draft'}
                  <button type="button" class="secondary-button" onclick={() => openEdit(row)}>
                    {translate('Edit')}
                  </button>
                  <form method="POST" action="?/submitExpense">
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="version" value={row.version} />
                    <button type="submit">{translate('Submit')}</button>
                  </form>
                {/if}
                {#if row.approval_state === 'draft'}
                  <form
                    method="POST"
                    action="?/deleteDraft"
                    data-action="deleteDraft"
                    data-record-type="expense"
                    data-record-id={String(row.id)}
                  >
                    <input type="hidden" name="recordType" value="expense" />
                    <input type="hidden" name="recordId" value={row.id} />
                    <input type="hidden" name="version" value={row.version} />
                    <button type="submit" class="destructive-button">{translate('Delete')}</button>
                  </form>
                {/if}
                {#if (row.approval_state === 'needs_changes' || row.approval_state === 'approved') && (String(row.worker_id) === data.user.id || data.user.role === 'owner_admin')}
                  <form
                    class="expense-record-actions"
                    method="POST"
                    action="?/createCorrectionDraft"
                  >
                    <input type="hidden" name="recordType" value="expense" />
                    <input type="hidden" name="originalId" value={row.id} />
                    <input
                      type="hidden"
                      name="requestId"
                      value={`expense-correction-${String(row.id)}`}
                    />
                    <label>
                      <span>{translate('Correction reason')}</span>
                      <input name="reason" minlength="3" required />
                    </label>
                    <button type="submit">{translate('Create corrected draft')}</button>
                  </form>
                {/if}
              </div>
            {/if}
      {#if ['owner_admin', 'project_manager'].includes(String(data.user.role))}
              <a href={`${base}/app/manage?type=expense#${String(row.id)}`}
                >{translate('Manage record')} →</a
              >
            {/if}
          </article>
        {/each}
      </div>
    {:else}
      <div class="expense-empty" role="status">
        <strong>{translate('No expenses recorded.')}</strong>
        <span>{translate('Your submitted expenses will appear here.')}</span>
      </div>
    {/if}
    {#if pagedRecords.totalPages > 1}
      <nav class="operational-pagination" aria-label={translate('Expense register pages')}>
        <button
          type="button"
          class="secondary-button"
          disabled={pagedRecords.current === 1}
          onclick={() => (registerPage -= 1)}>{translate('Previous')}</button
        >
        <span
          >{translate('Page')}
          {pagedRecords.current}
          {translate('of')}
          {pagedRecords.totalPages}</span
        >
        <button
          type="button"
          class="secondary-button"
          disabled={pagedRecords.current === pagedRecords.totalPages}
          onclick={() => (registerPage += 1)}>{translate('Next')}</button
        >
      </nav>
    {/if}
  </SectionCard>

  <ResponsiveSheet
    open={surface !== null}
    title={surface === 'edit' ? translate('Edit expense') : translate('Record expense')}
    description={translate('Operational entry only. Commercial treatment is handled separately.')}
    closeLabel={translate('Close expense form')}
    class="expense-entry-sheet"
    onclose={closeSurface}
  >
    {#if surface === 'create'}
      <form
        method="POST"
        action="?/createExpense"
        enctype="multipart/form-data"
        class="expense-entry-form"
        data-expense-entry-surface
        onsubmit={(event) => saveOfflineDraft(event, 'expense')}
      >
        {#if ['owner_admin', 'project_manager'].includes(String(data.user.role))}
          <label
            ><span>{translate('Worker')}</span><select name="workerId" required
              ><option value="">{translate('Select worker')}</option
              >{#each data.workers ?? [] as worker}<option value={String(worker.id)}
                  >{worker.name} — {worker.email}</option
                >{/each}</select
            ></label
          >
        {/if}

        <div class="expense-entry-intro">
          <strong>{translate('Capture what happened')}</strong>
          <span>{translate('Use the receipt and operational details you know on site.')}</span>
        </div>
        <label>
          <span>{translate('Receipt image or PDF')}</span>
          <input
            name="receipt"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            onchange={handleReceiptChange}
          />
          <small>{translate('JPG, PNG, HEIC or PDF up to 10 MB')}</small>
        </label>
        {#if receiptPreviewName}
          <div class="expense-receipt-preview" aria-live="polite">
            <strong>{translate('Receipt preview')}</strong>
            {#if receiptPreviewUrl && receiptPreviewMime.startsWith('image/')}
              <img src={receiptPreviewUrl} alt={receiptPreviewName} />
            {:else if receiptPreviewUrl && receiptPreviewMime === 'application/pdf'}
              <object
                data={receiptPreviewUrl}
                type="application/pdf"
                aria-label={receiptPreviewName}
              >
                <a href={receiptPreviewUrl} target="_blank" rel="noreferrer">{receiptPreviewName}</a
                >
              </object>
            {:else}
              <span>{receiptPreviewName}</span>
            {/if}
          </div>
        {/if}
        <label>
          <span>{translate('Project')}</span>
          <select name="projectId" required>
            <option value="">{translate('Select assignment')}</option>
            {#each availableProjects as project}
              <option value={String(project.id)}>{project.project_number} — {project.name}</option>
            {/each}
          </select>
        </label>
        <div class="expense-form-grid">
          <label>
            <span>{translate('Date')}</span>
            <input name="spentOn" type="date" required />
          </label>
          <label>
            <span>{translate('Category')}</span>
            <select name="category" required>
              {#each expenseCategories as [value, label]}
                <option {value}>{translate(label)}</option>
              {/each}
            </select>
          </label>
        </div>
        <label>
          <span>{translate('Vendor')}</span>
          <input name="vendor" required maxlength="200" />
        </label>
        <div class="expense-form-grid">
          <label>
            <span>{translate('Amount')}</span>
            <input name="amount" inputmode="decimal" pattern="[0-9]+([.][0-9][0-9]?)?" required />
          </label>
          <label>
            <span>{translate('Currency')}</span>
            <select name="currency" value="USD" required>
              <option value="USD">USD</option>
              <option value="BRL">BRL</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
        </div>
        <label>
          <span>{translate('Who paid')}</span>
          <select name="whoPaid" required>
            <option value="worker">{translate('Worker')}</option>
            <option value="company_card">{translate('Company card')}</option>
            <option value="company_direct">{translate('Company direct')}</option>
            <option value="client">{translate('Client paid directly')}</option>
            <option value="third_party">{translate('Third party')}</option>
          </select>
        </label>
        <label>
          <span>{translate('Description')}</span>
          <textarea name="description" minlength="3" maxlength="5000" required></textarea>
        </label>
        <label>
          <span>{translate('Payment method')}</span>
          <input
            name="paymentMethod"
            maxlength="80"
            placeholder={translate('Card, transfer or cash')}
          />
        </label>
        <div class="expense-entry-actions">
          <button type="button" class="secondary-button" onclick={closeSurface}
            >{translate('Cancel')}</button
          >
          <button type="submit">{translate('Save draft')}</button>
        </div>
      </form>
    {:else if surface === 'edit' && editRow}
      <form
        method="POST"
        action="?/updateExpense"
        class="expense-entry-form"
        data-expense-entry-surface
      >
        <input type="hidden" name="id" value={editRow.id} />
        <input type="hidden" name="version" value={editRow.version} />
        <div class="expense-entry-intro">
          <strong>{translate('Update operational details')}</strong>
          <span
            >{translate(
              'Submitted or approved values stay protected by the record lifecycle.',
            )}</span
          >
        </div>
        <div class="expense-form-grid">
          <label>
            <span>{translate('Date')}</span>
            <input name="spentOn" type="date" value={rowText(editRow, 'spent_on')} required />
          </label>
          <label>
            <span>{translate('Category')}</span>
            <select name="category" value={rowText(editRow, 'category')} required>
              {#each expenseCategories as [value, label]}
                <option {value}>{translate(label)}</option>
              {/each}
            </select>
          </label>
        </div>
        <label>
          <span>{translate('Vendor')}</span>
          <input name="vendor" value={rowText(editRow, 'vendor')} required maxlength="200" />
        </label>
        <div class="expense-form-grid">
          <label>
            <span>{translate('Amount')}</span>
            <input
              name="amount"
              inputmode="decimal"
              pattern="[0-9]+([.][0-9][0-9]?)?"
              value={minorToDecimal(editRow.amount_minor)}
              required
            />
          </label>
          <label>
            <span>{translate('Payment method')}</span>
            <input name="paymentMethod" value={rowText(editRow, 'payment_method')} maxlength="80" />
          </label>
        </div>
        <label>
          <span>{translate('Description')}</span>
          <textarea name="description" minlength="3" maxlength="5000"
            >{rowText(editRow, 'description')}</textarea
          >
        </label>
        <div class="expense-entry-actions">
          <button type="button" class="secondary-button" onclick={closeSurface}
            >{translate('Cancel')}</button
          >
          <button type="submit">{translate('Save changes')}</button>
        </div>
      </form>
    {/if}
  </ResponsiveSheet>
</div>

<style>
  .expense-primary-action-top {
    justify-content: flex-start;
  }
  .expense-status-card {
    color: inherit;
    text-decoration: none;
  }
  .expense-status-card:hover,
  .expense-status-card:focus-visible {
    border-color: var(--ja-teal, #277e78);
    outline: 3px solid color-mix(in srgb, var(--ja-teal, #277e78) 25%, transparent);
    outline-offset: 2px;
  }
  .expense-export-panel {
    display: grid;
    gap: 0.9rem;
    margin: 1rem 0;
    padding: 1rem;
    border: 1px solid var(--portal-border, #d8e2e8);
    border-radius: 0.75rem;
    background: var(--portal-surface-soft, #f8fbfc);
  }
  .expense-export-panel h3,
  .expense-export-panel p { margin: 0; }
  .expense-export-panel p { color: var(--portal-muted, #64748b); font-size: 0.86rem; }
  .expense-export-fields { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.75rem; }
  .expense-export-fields label { display: grid; gap: 0.3rem; }
  .expense-export-fields span { font-size: 0.78rem; font-weight: 600; }
  .expense-export-actions { display: flex; flex-wrap: wrap; gap: 0.6rem; }
  .expense-export-actions a { text-decoration: none; }
  @media (max-width: 52rem) { .expense-export-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 34rem) { .expense-export-fields { grid-template-columns: 1fr; } .expense-export-actions a { flex: 1 1 100%; text-align: center; } }
  .operational-pagination {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    justify-content: flex-end;
    margin-top: 1rem;
  }
  .operational-pagination span {
    color: var(--ja-steel, #637486);
    font-size: 0.85rem;
  }
  @media (max-width: 480px) {
    .operational-pagination {
      justify-content: stretch;
    }
    .operational-pagination button {
      flex: 1 1 7rem;
    }
    .operational-pagination span {
      order: -1;
      width: 100%;
      text-align: center;
    }
  }
</style>
