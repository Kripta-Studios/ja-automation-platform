<script lang="ts">
  import { base } from '$app/paths';
  type Row = Record<string, string | number | boolean | null>;
  let { data } = $props();
  const record = $derived(data.record as Row);
  const money = (minor: string | number | null | undefined, currency: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
      Number(minor ?? 0) / 100,
    );
</script>

<svelte:head><title>Expense | {record.project_number}</title></svelte:head>
<main class="record-detail-page">
  <nav class="detail-nav">
    <a href={base + '/app/expenses'}>← Expenses</a>
    <a href={base + '/app/projects/' + String(record.project_id)}>Open project</a>
  </nav>
  <header class="record-detail-header">
    <div>
      <span class="portal-kicker">EXPENSE · SOURCE RECORD</span>
      <h1>{record.vendor ?? record.category}</h1>
      <p>{record.project_number} · {record.project_name} · {record.spent_on}</p>
    </div>
    <span class="state-tag">{record.approval_state}</span>
  </header>
  <section class="record-detail-grid">
    <article>
      <span>AMOUNT</span><strong>{money(record.amount_minor, String(record.currency))}</strong>
    </article>
    <article>
      <span>CATEGORY</span><strong>{String(record.category).replaceAll('_', ' ')}</strong>
    </article>
    <article>
      <span>CLIENT TREATMENT</span><strong
        >{String(record.client_treatment).replaceAll('_', ' ')}</strong
      >
    </article>
    <article>
      <span>REIMBURSEMENT</span><strong>{record.reimbursement_state ?? 'pending'}</strong>
    </article>
  </section>
  <section class="detail-panel record-detail-copy">
    <div class="panel-title">
      <h2>Expense details</h2>
      <span>{record.who_paid ?? 'worker paid'}</span>
    </div>
    <p>{record.description ?? 'No description was recorded.'}</p>
    <dl class="record-facts">
      <div>
        <dt>Vendor</dt>
        <dd>{record.vendor ?? '—'}</dd>
      </div>
      <div>
        <dt>Payment method</dt>
        <dd>{record.payment_method ?? '—'}</dd>
      </div>
      <div>
        <dt>Billing treatment</dt>
        <dd>{String(record.billing_treatment ?? 'internal').replaceAll('_', ' ')}</dd>
      </div>
      <div>
        <dt>Project-currency amount</dt>
        <dd>
          {money(
            record.project_currency_amount_minor ?? record.amount_minor,
            String(record.project_currency ?? record.currency),
          )}
        </dd>
      </div>
      <div>
        <dt>Receipt</dt>
        <dd>{record.receipt_document_id ? 'Registered private receipt' : 'No receipt linked'}</dd>
      </div>
    </dl>
    {#if record.receipt_document_id}
      <a
        class="preview-link"
        href={base + '/app/api/documents/' + String(record.receipt_document_id)}
        >Open private receipt</a
      >
    {/if}
  </section>
</main>
