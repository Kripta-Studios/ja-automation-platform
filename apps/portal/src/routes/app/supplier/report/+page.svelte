<script lang="ts">
  import { portalText } from '$lib/portal-i18n';
  import { SectionCard } from '$lib/portal/ui';
  import { supplierCopy, supplierStateLabel, supplierCategoryLabel } from '../copy';
  let { data } = $props();
  const c = $derived(supplierCopy[data.locale as keyof typeof supplierCopy]);
  const query = $derived(
    new URLSearchParams({
      projectId: data.projectId || '',
      from: data.from,
      to: data.to,
      lang: data.locale,
      ...(data.supplierId ? { supplierId: data.supplierId } : {}),
    }).toString(),
  );
</script>

<svelte:head><title>{c.report} · J&A</title></svelte:head>
<div class="supplier-page" lang={data.locale}>
  <nav><a href="/j-aautomation/app">{c.back}</a></nav>
  <h1 class="supplier-title">{c.report}</h1>
  <p>{c.reportNote}</p>
  <form method="GET">
    <label
      >{c.project}<select name="projectId" value={data.projectId}
        >{#each data.projects as project}<option value={project.id}>{project.name}</option
          >{/each}</select
      ></label
    >
    {#if data.owner}<label
        >{c.provider}<select name="supplierId" value={data.supplierId || ''}
          ><option value="">—</option>{#each data.suppliers as supplier}<option value={supplier.id}
              >{supplier.name}</option
            >{/each}</select
        ></label
      >{/if}
    <label>{c.from}<input type="date" name="from" value={data.from} required /></label><label
      >{c.to}<input type="date" name="to" value={data.to} required /></label
    >
    <label
      >{portalText(data.locale, 'Language')}<select name="lang" value={data.locale}
        ><option value="en">English</option><option value="es">Español</option><option value="pt"
          >Português</option
        ></select
      ></label
    ><button class="primary-button">{c.apply}</button>
  </form>
  {#if data.report}
    <h2>{data.report.project.name}</h2>
    <p>{data.from} — {data.to}</p>
    <strong>{c.total}: {data.report.totalMinutes}</strong>
    <nav>
      <a href={`/j-aautomation/app/supplier/report.csv?${query}`}>{c.download}</a><button
        onclick={() => window.print()}>{c.print}</button
      >
    </nav>
    <SectionCard title={c.report}>
      {#each data.report.rows as row}
        <article>
          <h3>{row.workerName} · {row.workDate}</h3>
          <dl>
            <dt>{c.category}</dt>
            <dd>{supplierCategoryLabel(data.locale, row.category)}</dd>
            <dt>{c.minutes}</dt>
            <dd>{row.minutes}</dd>
            <dt>{c.state}</dt>
            <dd>
              {supplierStateLabel(data.locale, row.state)}{#if row.isSuperseded}
                · {c.superseded}{/if}
            </dd>
            <dt>{c.recordedBy}</dt>
            <dd>{row.recordedByName}</dd>
          </dl>
          <p>{row.summary}</p>
        </article>
      {:else}<p>{c.empty}</p>{/each}
    </SectionCard>
  {:else}<p>{c.empty}</p>{/if}
</div>

<style>
  h1 {
    font-size: 1.65rem;
    font-weight: 700;
    line-height: 1.25;
  }
  .supplier-page {
    min-width: 0;
    display: grid;
    gap: 1rem;
  }
  form {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
    align-items: end;
  }
  label {
    display: grid;
    gap: 0.4rem;
    min-width: 0;
  }
  input,
  select {
    max-width: 100%;
    box-sizing: border-box;
  }
  nav {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
  }
  a {
    padding: 0.65rem 0;
  }
  article {
    padding: 1rem 0;
    border-bottom: 1px solid #ccd3db;
    break-inside: avoid;
    overflow-wrap: anywhere;
  }
  dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
  }
  dd {
    margin: 0;
  }
  @media print {
    nav,
    form {
      display: none;
    }
    .supplier-page {
      padding: 0;
      max-width: none;
    }
  }
</style>
