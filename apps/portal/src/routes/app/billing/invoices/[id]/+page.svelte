<script lang="ts">
  import { base } from '$app/paths';
  type Row = Record<string, string | number | boolean | null>;
  let { data } = $props();
  const preview = $derived(data.preview as { invoice: Row; lines: Row[]; taxes: Row[] });
  const invoice = $derived(preview.invoice);
  const money = (minor: string | number | null | undefined) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: String(invoice.currency),
    }).format(Number(minor ?? 0) / 100);
</script>

<svelte:head><title>Invoice preview | {invoice.project_number}</title></svelte:head>
<main class="invoice-preview-page">
  <nav class="detail-nav no-print">
    <a href={`${base}/app/billing`}>← Billing</a><button onclick={() => window.print()}
      >Print preview</button
    >
  </nav>
  <article class="invoice-paper">
    <div class="demo-watermark">DEMONSTRATION · NOT FOR PAYMENT</div>
    <header>
      <div>
        <img src={`${base}/app/logo.png`} alt="J&A Automation" /><small
          >INDUSTRIAL AUTOMATION · FIELD SERVICES</small
        >
      </div>
      <div class="invoice-identity">
        <span>{invoice.state === 'draft' ? 'DRAFT INVOICE' : 'INVOICE'}</span><strong
          >{invoice.invoice_number || 'PREVIEW'}</strong
        >
      </div>
    </header>
    <section class="invoice-parties">
      <div>
        <span>FROM</span><strong>{invoice.issuer_name}</strong>
        <p>{invoice.issuer_address}</p>
        <small>{invoice.company_identifiers}</small>
      </div>
      <div>
        <span>BILL TO</span><strong>{invoice.client_legal_name}</strong>
        <p>{invoice.client_name}<br />{invoice.billing_email}</p>
      </div>
    </section>
    <section class="invoice-meta">
      <div>
        <span>PROJECT</span><strong>{invoice.project_number}</strong><small
          >{invoice.project_name}</small
        >
      </div>
      <div>
        <span>BILLING PERIOD</span><strong>{invoice.period_start}</strong><small
          >through {invoice.period_end}</small
        >
      </div>
      <div>
        <span>STREAM</span><strong>{String(invoice.stream_type).toUpperCase()}</strong><small
          >{invoice.tax_profile_name}</small
        >
      </div>
    </section>
    <table>
      <thead
        ><tr><th>DESCRIPTION</th><th>SOURCE</th><th>QTY</th><th>RATE</th><th>AMOUNT</th></tr></thead
      ><tbody
        >{#each preview.lines as line}<tr
            ><td>{line.description}</td><td>{String(line.source_type).toUpperCase()}</td><td
              >{(Number(line.quantity_numerator) / Number(line.quantity_denominator)).toFixed(
                2,
              )}</td
            ><td>{money(line.unit_price_minor)}</td><td>{money(line.subtotal_minor)}</td></tr
          >{/each}</tbody
      >
    </table>
    <section class="invoice-total">
      <div>
        <span>Separate billing treatment</span>
        <p>
          Labor and reimbursable expenses use independent streams and configured tax profiles.
          All-in project expenses remain in project cost and do not appear here.
        </p>
      </div>
      <dl>
        <dt>Subtotal</dt>
        <dd>{money(invoice.subtotal_minor)}</dd>
        {#each preview.taxes as tax}<dt>{tax.name} · {Number(tax.basis_points) / 100}%</dt>
          <dd>{money(invoice.tax_minor)}</dd>{/each}
        <dt class="grand">Total</dt>
        <dd class="grand">{money(invoice.total_minor)}</dd>
      </dl>
    </section>
    <footer>
      <span>J&A AUTOMATION · MVP DEMONSTRATION</span><span
        >{invoice.project_number} / {invoice.stream_type}</span
      >
    </footer>
  </article>
</main>
