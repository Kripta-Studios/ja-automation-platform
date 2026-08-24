<script lang="ts">
  import { base } from '$app/paths';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import { ResponsiveSheet, SectionCard, StatusBadge } from '../ui';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import { money } from '../portal-format';

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
  let search = $state('');
  let projectFilter = $state('');
  let statusFilter = $state('');
  let receiptPreviewUrl = $state<string | null>(null);
  let receiptPreviewName = $state('');
  let receiptPreviewMime = $state('');

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
  const editRow = $derived.by(
    () => records.find((row) => String(row.id) === editExpenseId) as Row | undefined,
  );
  const visibleRecords = $derived.by(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return records.filter((row) => {
      const matchesSearch =
        !normalizedSearch ||
        [row.vendor, row.project_number, row.description, row.spent_on]
          .map((value) => String(value ?? '').toLowerCase())
          .some((value) => value.includes(normalizedSearch));
      const matchesProject = !projectFilter || String(row.project_id ?? '') === projectFilter;
      const matchesStatus = !statusFilter || String(row.approval_state ?? '') === statusFilter;
      return matchesSearch && matchesProject && matchesStatus;
    });
  });

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

  <div class="expense-status-strip" aria-label={translate('Expense attention summary')}>
    <div class="expense-status-card">
      <span>{translate('Needs attention')}</span>
      <strong>{pendingReviewCount}</strong>
      <small>{translate('Draft or review state')}</small>
    </div>
    <div class="expense-status-card">
      <span>{translate('Reimbursement')}</span>
      <strong>{reimbursementCount}</strong>
      <small>{translate('Pending or scheduled')}</small>
    </div>
  </div>

  <form
    class="expense-filters"
    aria-label={translate('Filter expenses')}
    onsubmit={(event) => event.preventDefault()}
  >
    <label>
      <span>{translate('Search expenses')}</span>
      <input bind:value={search} type="search" placeholder={translate('Vendor, project or date')} />
    </label>
    <label>
      <span>{translate('Project')}</span>
      <select bind:value={projectFilter}>
        <option value="">{translate('All projects')}</option>
        {#each availableProjects as project}
          <option value={String(project.id)}>{project.project_number} — {project.name}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>{translate('Status')}</span>
      <select bind:value={statusFilter}>
        <option value="">{translate('All statuses')}</option>
        <option value="draft">{translate('Draft')}</option>
        <option value="submitted">{translate('Submitted')}</option>
        <option value="approved">{translate('Approved')}</option>
        <option value="needs_changes">{translate('Needs changes')}</option>
      </select>
    </label>
  </form>

  <SectionCard title={translate('Recent expenses')} class="expense-list-surface">
    {#if visibleRecords.length > 0}
      <div class="expense-list" aria-live="polite">
        {#each visibleRecords as row}
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
            {#if String(row.worker_id) === data.user.id}
              <div class="expense-record-actions">
                {#if row.approval_state === 'draft' || row.approval_state === 'needs_changes'}
                  <button type="button" class="secondary-button" onclick={() => openEdit(row)}>
                    {translate('Edit')}
                  </button>
                  <form method="POST" action="?/submitExpense">
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="version" value={row.version} />
                    <button type="submit">{translate('Submit')}</button>
                  </form>
                {/if}
                {#if row.approval_state !== 'void'}
                  <form method="POST" action="?/deleteExpense">
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="version" value={row.version} />
                    <button type="submit" class="destructive-button">
                      {row.approval_state === 'draft' || row.approval_state === 'needs_changes'
                        ? translate('Delete')
                        : translate('Void')}
                    </button>
                  </form>
                {/if}
              </div>
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
  </SectionCard>

  {#if !isAuditor}
    <div class="expense-primary-action">
      <button type="button" data-expense-primary-cta onclick={openCreate}>
        <span aria-hidden="true">＋</span>
        {translate('Record expense')}
      </button>
    </div>
  {/if}

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
            <select name="currency" required>
              <option>USD</option>
              <option>BRL</option>
              <option>EUR</option>
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
