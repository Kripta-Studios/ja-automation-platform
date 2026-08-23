<script lang="ts">
  import { base } from '$app/paths';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import { money } from '../portal-format';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';

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

  let expenseClientTreatment = $state('non_billable');
  let expenseBillingTreatment = $state('internal_non_billable');

  function syncExpenseTreatment(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    expenseClientTreatment = value;
    expenseBillingTreatment =
      value === 'reimbursable'
        ? 'reimbursable_at_cost'
        : value === 'all_in'
          ? 'all_in'
          : 'internal_non_billable';
  }

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

  function rowText(row: Row, key: string): string {
    const value = row[key];
    return value === null || value === undefined ? '' : String(value);
  }

  // Keep minor-unit formatting string based so the edit form never rounds
  // money through binary floating point.
  function minorToDecimal(value: unknown): string {
    const raw = rowText({ amount_minor: value } as Row, 'amount_minor');
    if (!/^\d+$/.test(raw)) return '';
    const padded = raw.padStart(3, '0');
    return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
  }
</script>

<div class="worker-form">
  {#if !isAuditor}
    <form
      method="POST"
      action="?/createExpense"
      enctype="multipart/form-data"
      class="entry-panel"
      onsubmit={(event) => saveOfflineDraft(event, 'expense')}
    >
      <h2>{translate('Record expense')}</h2>
      <label
        >{translate('Project')}
        <select name="projectId" required>
          <option value="">{translate('Select assignment')}</option>
          {#each availableProjects as project}
            <option value={project.id}>{project.project_number} — {project.name}</option>
          {/each}
        </select>
      </label>
      <label>{translate('Date')}<input name="spentOn" type="date" required /></label>
      <label>{translate('Vendor')}<input name="vendor" required /></label>
      <label
        >{translate('Category')}
        <select name="category">
          <option value="hotel">{translate('Hotel')}</option>
          <option value="rental_car">{translate('Rental car')}</option>
          <option value="fuel">{translate('Fuel')}</option>
          <option value="tolls">{translate('Tolls')}</option>
          <option value="parking">{translate('Parking')}</option>
          <option value="airfare">{translate('Airfare')}</option>
          <option value="ground_transport">{translate('Train / bus / taxi / rideshare')}</option>
          <option value="meals">{translate('Meals')}</option>
          <option value="per_diem">{translate('Per diem')}</option>
          <option value="materials">{translate('Project materials')}</option>
          <option value="tools">{translate('Tools / consumables')}</option>
          <option value="shipping">{translate('Shipping')}</option>
          <option value="phone_data">{translate('Phone / data')}</option>
          <option value="visa_permit">{translate('Visa / permit')}</option>
          <option value="other">{translate('Other')}</option>
        </select>
      </label>
      <label
        >{translate('Amount')}<input
          name="amount"
          inputmode="decimal"
          pattern="[0-9]+([.][0-9][0-9]?)?"
          required
        /></label
      >
      <label
        >{translate('Currency')}
        <select name="currency">
          <option>USD</option>
          <option>BRL</option>
          <option>EUR</option>
        </select>
      </label>
      <label>{translate('Description')}<textarea name="description" required></textarea></label>
      <label
        >{translate('Who paid')}
        <select name="whoPaid">
          <option value="worker">{translate('Worker')}</option>
          <option value="company_card">{translate('Company card')}</option>
          <option value="company_direct">{translate('Company direct')}</option>
          <option value="client">{translate('Client paid directly')}</option>
          <option value="third_party">{translate('Third party')}</option>
        </select>
      </label>
      <label
        >{translate('Client treatment')}
        <select
          name="clientTreatment"
          value={expenseClientTreatment}
          onchange={syncExpenseTreatment}
        >
          <option value="non_billable">{translate('Non-billable')}</option>
          <option value="reimbursable">{translate('Reimbursable')}</option>
          <option value="all_in">{translate('All-in project cost')}</option>
        </select>
      </label>
      <label
        >{translate('Billing treatment')}
        <select name="billingTreatment" value={expenseBillingTreatment}>
          <option value="internal_non_billable">{translate('Internal / non-billable')}</option>
          <option value="reimbursable_at_cost">{translate('Reimbursable at cost')}</option>
          <option value="reimbursable_plus_markup">{translate('Reimbursable + markup')}</option>
          <option value="all_in">{translate('Included in all-in / fixed price')}</option>
          <option value="client_direct">{translate('Paid directly by client')}</option>
          <option value="allowance_per_diem">{translate('Allowance / per diem')}</option>
          <option value="informational">{translate('Informational only')}</option>
        </select>
      </label>
      <label>{translate('Markup (basis points)')}<input name="markupBps" type="number" min="0" /></label>
      <label>{translate('Tax amount (minor units)')}<input name="taxAmountMinor" type="number" min="0" /></label>
      <label
        >{translate('Project currency amount (minor units)')}<input
          name="projectCurrencyAmountMinor"
          type="number"
          min="0"
        /></label
      >
      <label
        >{translate('FX rate (basis points)')}<input
          name="fxRateBps"
          type="number"
          min="1"
          placeholder={translate('e.g. 9200')}
        /></label
      >
      <label>{translate('Payment method')}<input name="paymentMethod" placeholder={translate('Card, transfer, cash')} /></label>
      <label class="check"><input name="receiptRequired" type="checkbox" /> {translate('Receipt required')}</label>
      <label
        >{translate('Receipt image or PDF')}<input
          name="receipt"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
        /></label
      >
      <button>{translate('Save draft')}</button>
    </form>
  {/if}

  <section class="record-list">
    <div class="panel-title">
      <h2>{translate('Recent expenses')}</h2>
      <span>{data.records?.length ?? 0}</span>
    </div>
    {#each data.records ?? [] as row}
      <article class="record-card">
        <a class="record-card-link" href={`${base}/app/expenses/${String(row.id)}`}>
          <strong>{row.vendor} · {money(row.amount_minor, String(row.currency))}</strong>
          <small
            >{row.spent_on} · {row.project_number} · {controlledValue('status', row.approval_state) || translate(row.approval_state)} · {translate(String(row.who_paid ?? ''))} · {controlledValue('status', row.reimbursement_state) || translate(String(row.reimbursement_state ?? ''))}</small
          >
          <span class="record-card-open">{translate('Open record →')}</span>
          </a>
        {#if
          String(row.worker_id) === data.user.id &&
          row.invoice_id == null &&
          (row.approval_state === 'draft' || row.approval_state === 'needs_changes')
        }
          <details class="expense-edit-details">
            <summary>{translate('Edit')}</summary>
            <form
              method="POST"
              action="?/updateExpense"
              class="entry-panel"
              style="display: grid; gap: 1rem; margin-top: 1rem;"
            >
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="version" value={row.version} />
              <label
                >{translate('Date')}<input
                  name="spentOn"
                  type="date"
                  value={rowText(row, 'spent_on')}
                  required
                /></label
              >
              <label
                >{translate('Vendor')}<input
                  name="vendor"
                  value={rowText(row, 'vendor')}
                  required
                /></label
              >
              <label
                >{translate('Category')}
                <select name="category" value={rowText(row, 'category')} required>
                  {#each expenseCategories as [value, label]}
                    <option {value}>{translate(label)}</option>
                  {/each}
                </select>
              </label>
              <label
                >{translate('Amount')}<input
                  name="amount"
                  inputmode="decimal"
                  pattern="[0-9]+([.][0-9][0-9]?)?"
                  value={minorToDecimal(row.amount_minor)}
                  required
                /></label
              >
              <label
                >{translate('Description')}<textarea name="description"
                  >{rowText(row, 'description')}</textarea
                ></label
              >
              <label
                >{translate('Project-currency amount')}<input
                  name="projectCurrencyAmount"
                  inputmode="decimal"
                  pattern="[0-9]+([.][0-9][0-9]?)?"
                  value={minorToDecimal(
                    row.project_currency_amount_minor ?? row.amount_minor,
                  )}
                /></label
              >
              <label
                >{translate('FX rate (basis points)')}<input
                  name="fxRateBps"
                  type="number"
                  min="1"
                  value={rowText(row, 'fx_rate_bps')}
                /></label
              >
              <label
                >{translate('Payment method')}<input
                  name="paymentMethod"
                  value={rowText(row, 'payment_method')}
                /></label
              >
              <button type="submit">{translate('Save changes')}</button>
            </form>
          </details>
        {/if}
        {#if
          (row.approval_state === 'draft' || row.approval_state === 'needs_changes') &&
          String(row.worker_id) === data.user.id
        }
          <form method="POST" action="?/submitExpense">
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="version" value={row.version} />
            <button>{translate('Submit')}</button>
          </form>
        {/if}
        {#if String(row.worker_id) === data.user.id && row.invoice_id == null && row.approval_state !== 'void'}
          <div class="record-actions" style="margin-top: 0.5rem;">
            <form method="POST" action="?/deleteExpense">
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="version" value={row.version} />
              <button class="destructive-button">
                {row.approval_state === 'draft' || row.approval_state === 'needs_changes'
                  ? translate('Delete')
                  : translate('Void')}
              </button>
            </form>
          </div>
        {/if}
      </article>
    {:else}
      <div class="empty">{translate('No expenses recorded.')}</div>
    {/each}
  </section>
</div>
