<script lang="ts">
  import { base } from '$app/paths';
  import { paymentMoney } from '$lib/portal/payment-money';
  import { portalText, normalizePortalLocale } from '$lib/portal-i18n';
  import { TableRegion } from '$lib/portal/ui';
  let { data } = $props();
  const locale = $derived(normalizePortalLocale(data.locale));
  const t = (value: string) => portalText(locale, value);
  const amount = (minor: unknown, currency: unknown) =>
    paymentMoney(
      minor,
      String(currency ?? 'USD'),
      locale === 'es' ? 'es-ES' : locale === 'pt' ? 'pt-PT' : 'en-US',
    );
</script>

<svelte:head><title>{t('Worker pay review')} · J&amp;A</title></svelte:head>
<main class="owner-pay">
  <a href={`${base}/app/manage`} class="back-link">← {t('Data management')}</a>
  <header>
    <h1>{t('Worker pay review')}</h1>
    <p>
      {t(
        'Current approved and pending worker compensation, reimbursements, and settlement status.',
      )}
    </p>
  </header>
  <section class="pay-card">
    <h2>{t('Select worker and period')}</h2>
    <form method="GET" class="pay-filters">
      <label
        >{t('Worker')}
        <select name="worker" required value={data.selectedWorker?.id ?? ''}>
          <option value="">{t('Select worker')}</option>
          {#each data.workers as worker}<option value={worker.id}>{worker.name}</option>{/each}
        </select>
      </label>
      <label>{t('From')}<input name="start" type="date" required value={data.periodStart} /></label>
      <label>{t('Through')}<input name="end" type="date" required value={data.periodEnd} /></label>
      <button type="submit">{t('Apply period')}</button>
    </form>
  </section>

  {#if data.selectedWorker && data.pay}
    <section class="pay-card" aria-labelledby="owner-pay-summary-title">
      <h2 id="owner-pay-summary-title">
        {data.selectedWorker.name} · {t('Compensation statement')}
      </h2>
      <p class="muted">
        {data.periodStart} → {data.periodEnd} · {t('Estimates are not proof of payment.')}
      </p>
      <div class="money-grid">
        {#each data.pay.currencyBreakdown as row}
          <div class="money-item">
            <span>{t('Approved compensation')} · {row.currency}</span>
            <strong>{amount(row.estimatedApprovedMinor, row.currency)}</strong>
          </div>
          <div class="money-item">
            <span>{t('Pending compensation')} · {row.currency}</span>
            <strong>{amount(row.estimatedPendingMinor, row.currency)}</strong>
          </div>
          <div class="money-item">
            <span>{t('Approved reimbursements')} · {row.currency}</span>
            <strong>{amount(row.approvedReimbursementMinor, row.currency)}</strong>
          </div>
          <div class="money-item">
            <span>{t('Pending reimbursements')} · {row.currency}</span>
            <strong>{amount(row.pendingReimbursementMinor, row.currency)}</strong>
          </div>
        {/each}
      </div>
      <p>
        {t('Approved actual time')}: {data.pay.approvedMinutes}
        {t('minutes')} · {t('Pending actual time')}: {data.pay.pendingMinutes}
        {t('minutes')}
      </p>
      {#if data.pay.missingCompensationRules > 0}<p role="status">
          {data.pay.missingCompensationRules}
          {t('time record(s) have no matching compensation rule and require Finance review.')}
        </p>{/if}
    </section>

    <section class="pay-card" aria-labelledby="owner-pay-outstanding-title">
      <h2 id="owner-pay-outstanding-title">{t('Payment still outstanding')}</h2>
      <p class="muted">
        {t('Reviewed settlements and approved reimbursements awaiting actual payment.')}
      </p>
      {#each data.outstanding as row}
        <p>
          {row.currency} · {t('Unpaid reviewed settlements')}:
          <strong>{amount(row.settlementMinor, row.currency)}</strong>
          · {t('Approved reimbursements awaiting payment')}:
          <strong>{amount(row.reimbursementMinor, row.currency)}</strong>
        </p>
      {:else}
        <p>
          {t('No reviewed payments or approved reimbursements are outstanding in this period.')}
        </p>
      {/each}
    </section>

    <section class="pay-card" aria-labelledby="owner-pay-activities-title">
      <h2 id="owner-pay-activities-title">{t('Activity detail')}</h2>
      <TableRegion class="table-scroll" mobileMode="scroll" label={t('Activity detail')}>
        <table>
          <thead
            ><tr
              ><th>{t('Date')}</th><th>{t('Project')}</th><th>{t('Category')}</th><th
                >{t('Activity')}</th
              ><th>{t('Actual minutes')}</th><th>{t('Approval')}</th></tr
            ></thead
          >
          <tbody>
            {#each data.activities as row}
              <tr
                ><td>{String(row.date)}</td><td
                  >{String(row.projectNumber)} · {String(row.projectName)}</td
                ><td>{String(row.category)}</td><td>{String(row.activitySummary ?? '—')}</td><td
                  >{String(row.actualMinutes)}</td
                ><td>{String(row.approvalState)}</td></tr
              >
            {:else}<tr><td colspan="6">{t('No activity recorded in this period.')}</td></tr>{/each}
          </tbody>
        </table>
      </TableRegion>
    </section>

    <section class="pay-card" aria-labelledby="owner-pay-settlements-title">
      <h2 id="owner-pay-settlements-title">{t('Settlement status')}</h2>
      <p class="muted">{t('A reviewed settlement is not proof of payment.')}</p>
      <TableRegion class="table-scroll" mobileMode="scroll" label={t('Settlement status')}>
        <table>
          <thead
            ><tr
              ><th>{t('Project / period')}</th><th>{t('Payment state')}</th><th
                >{t('Expected payment')}</th
              ><th>{t('Latest actual payment')}</th><th>{t('Reviewed settlement')}</th><th
                >{t('Actual paid')}</th
              ><th>{t('Remaining')}</th></tr
            ></thead
          >
          <tbody>
            {#each data.settlements as row}
              <tr
                ><td
                  >{String(row.projectNumber)} · {String(row.periodStart)} → {String(
                    row.periodEnd,
                  )}</td
                ><td>{String(row.paymentState)}</td><td>{String(row.expectedPaymentOn ?? '—')}</td
                ><td>{String(row.actualPaymentOn ?? '—')}</td><td
                  >{amount(row.amountMinor, row.currency)}</td
                ><td>{amount(row.paidAmountMinor, row.currency)}</td><td
                  >{amount(row.remainingAmountMinor, row.currency)}</td
                ></tr
              >
            {:else}<tr><td colspan="7">{t('No settlements in this period.')}</td></tr>{/each}
          </tbody>
        </table>
      </TableRegion>
    </section>

    <section class="pay-card" aria-labelledby="owner-pay-expenses-title">
      <h2 id="owner-pay-expenses-title">{t('Reimbursements')}</h2>
      <TableRegion class="table-scroll" mobileMode="scroll" label={t('Reimbursements')}>
        <table>
          <thead
            ><tr
              ><th>{t('Date')}</th><th>{t('Project')}</th><th>{t('Expense')}</th><th
                >{t('Approval')}</th
              ><th>{t('Reimbursement state')}</th><th>{t('Expected reimbursement')}</th><th
                >{t('Actual reimbursement')}</th
              ><th>{t('Amount')}</th></tr
            ></thead
          >
          <tbody>
            {#each data.expenses as row}
              <tr
                ><td>{String(row.spentOn)}</td><td>{String(row.projectNumber)}</td><td
                  >{row.vendor ? `${String(row.vendor)} · ` : ''}{String(row.category)}</td
                ><td>{String(row.approvalState)}</td><td>{String(row.reimbursementState)}</td><td
                  >{String(row.expectedReimbursementOn ?? '—')}</td
                ><td>{String(row.reimbursedAt ?? '—')}</td><td
                  >{amount(row.reimbursementAmountMinor, row.currency)}</td
                ></tr
              >
            {:else}<tr><td colspan="8">{t('No reimbursements in this period.')}</td></tr>{/each}
          </tbody>
        </table>
      </TableRegion>
    </section>
  {:else}
    <p class="empty-note">{t('Select a worker to review their current pay statement.')}</p>
  {/if}
</main>

<style>
  .owner-pay {
    display: grid;
    gap: 1rem;
    max-width: 100%;
    min-width: 0;
  }
  .owner-pay header h1,
  .pay-card h2 {
    margin: 0 0 0.5rem;
  }
  .owner-pay header p,
  .muted {
    color: var(--text-muted, #536173);
  }
  .back-link {
    width: fit-content;
  }
  .pay-card {
    min-width: 0;
    padding: clamp(1rem, 2vw, 1.5rem);
    border: 1px solid var(--border, #ccd4df);
    border-radius: 0.8rem;
    background: var(--surface, #fff);
  }
  .pay-filters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
    align-items: end;
    gap: 0.8rem;
  }
  .pay-filters label {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
    font-weight: 600;
  }
  .pay-filters input,
  .pay-filters select,
  .pay-filters button {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: 2.75rem;
    padding: 0.5rem 0.65rem;
  }
  .money-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
    gap: 0.7rem;
    margin: 1rem 0;
  }
  .money-item {
    display: grid;
    gap: 0.3rem;
    padding: 0.8rem;
    border: 1px solid var(--border, #ccd4df);
    border-radius: 0.5rem;
  }
  .money-item strong {
    font-size: 1.3rem;
  }
  :global(.owner-pay .table-scroll) {
    max-width: 100%;
    overflow-x: auto;
  }
  table {
    width: 100%;
    min-width: 43rem;
    border-collapse: collapse;
  }
  th,
  td {
    text-align: left;
    padding: 0.65rem;
    border-bottom: 1px solid var(--border, #ccd4df);
    vertical-align: top;
  }
  th {
    white-space: nowrap;
  }
  .empty-note {
    padding: 1rem;
  }
  @media (max-width: 600px) {
    .pay-filters,
    .money-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
