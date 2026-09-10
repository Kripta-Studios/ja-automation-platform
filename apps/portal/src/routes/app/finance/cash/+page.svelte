<script lang="ts">
  import { base } from '$app/paths';
  import { SectionCard, FieldGroup, Field } from '$lib/portal/ui';
  import { paymentMoney } from '$lib/portal/payment-money';
  import { ownerFinanceCopy } from '$lib/portal/owner-finance-copy';
  import { cashFilters } from '$lib/portal/owner-finance';
  import { cashCopy } from './copy';
  let { data } = $props();
  const locale = $derived(data.locale === 'es' ? 'es' : data.locale === 'pt' ? 'pt' : 'en');
  const t = $derived(cashCopy[locale]);
  const ft = $derived(ownerFinanceCopy[locale]);
  const metrics = [
    ['expectedInMinor', 'expectedIn'],
    ['expectedOutMinor', 'expectedOut'],
    ['expectedNetMinor', 'expectedNet'],
    ['actualNetMinor', 'actualNet'],
    ['unconfirmedMinor', 'unconfirmed'],
  ] as const;
</script>

<svelte:head><title>{t.title} | J&A</title></svelte:head>
<main class="cash-page" lang={locale === 'pt' ? 'pt-BR' : locale}>
  <a href={`${base}/app/finance?view=economic&lang=${locale}`}>← {t.back}</a>
  <h1>{t.title}</h1>
  <p>{t.explanation}</p>
  <p>{t.pending}</p>
  <SectionCard title={t.group}>
    <form method="GET">
      <input type="hidden" name="lang" value={locale} />
      <FieldGroup>
        <Field id="cash-currency" label={ft.currency}
          ><select id="cash-currency" name="currency" value={data.currency}
            ><option value="">—</option>{#each data.currencies as currency}<option value={currency}
                >{currency}</option
              >{/each}</select
          ></Field
        >
        <Field id="cash-filter" label={ft.filter}
          ><select id="cash-filter" name="filter" value={data.filter}
            >{#each cashFilters as filter}<option value={filter}>{ft[filter]}</option
              >{/each}</select
          ></Field
        >
        <Field id="cash-from" label={t.from}
          ><input id="cash-from" type="date" name="from" value={data.from} /></Field
        >
        <Field id="cash-to" label={t.to}
          ><input id="cash-to" type="date" name="to" value={data.to} /></Field
        >
        <Field id="cash-project" label={t.project}
          ><select id="cash-project" name="project" value={data.projectId}
            ><option value="">{t.all}</option>{#each data.projects as project}<option
                value={project.id}>{project.label}</option
              >{/each}</select
          ></Field
        >
        <Field id="cash-group" label={t.group}
          ><select id="cash-group" name="group" value={data.granularity}
            ><option value="week">{t.week}</option><option value="month">{t.month}</option></select
          ></Field
        >
      </FieldGroup>
      <label
        ><input type="checkbox" name="dated" value="1" checked={data.datedOnly} /> {ft.dates}</label
      >
      <button type="submit">{t.apply}</button>
    </form>
    {#if !data.datedOnly}<p>{t.unknownDateNote}</p>{/if}
  </SectionCard>
  {#each data.groups as group}
    <SectionCard
      title={`${group.period ?? t.undated} · ${group.currency} · ${group.entity || t.unknownEntity}`}
      data-cash-group
    >
      {#if group.projectScope}<p>{group.projectScope}</p>{/if}
      <dl class="metrics">
        {#each metrics as [key, label]}<div>
            <dt>{t[label]}</dt>
            <dd>{paymentMoney(group[key], group.currency, locale)}</dd>
          </div>{/each}
      </dl>
      <details open>
        <summary>{t.sources} ({group.ids.length})</summary>
        <div class="source-list">
          {#each data.movements.filter((item) => group.ids.includes(item.id)) as item}
            <article data-cash-source={item.id}>
              <h3>{t[item.kind]} · {item.party}</h3>
              <p>{item.project}</p>
              <p>
                <strong>{paymentMoney(item.amountMinor, item.currency, locale)}</strong> · {item.basis ===
                'actual'
                  ? t.actualBasis
                  : item.basis === 'expected'
                    ? t.expectedBasis
                    : t.needs_confirmation}
              </p>
              <dl>
                <div>
                  <dt>{item.basis === 'actual' ? t.actual : t.expected}</dt>
                  <dd>{item.date ?? t.undated}</dd>
                </div>
                {#if item.dueDate}<div>
                    <dt>{t.due}</dt>
                    <dd>{item.dueDate}</dd>
                  </div>{/if}
                <div>
                  <dt>{t.reference}</dt>
                  <dd>{item.reference || '—'}</dd>
                </div>
              </dl>
              <a href={`${base}${item.href}`}>{t.open} →</a>
            </article>
          {/each}
        </div>
      </details>
    </SectionCard>
  {:else}<SectionCard title={t.title}><p>{t.none}</p></SectionCard>{/each}
</main>

<style>
  .cash-page {
    max-width: 1180px;
    margin: 0 auto;
    padding: clamp(1rem, 4vw, 2.5rem);
    display: grid;
    gap: 1rem;
  }
  h1 {
    font-size: clamp(1.7rem, 4vw, 2.3rem);
  }
  p {
    line-height: 1.6;
    margin: 0.4rem 0;
  }
  .metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
    gap: 1rem;
  }
  .metrics div {
    background: #f2f6f8;
    padding: 0.75rem;
    border-radius: 0.5rem;
  }
  dt {
    color: #44515d;
    font-size: 0.875rem;
  }
  dd {
    margin: 0.3rem 0 0.75rem;
    overflow-wrap: anywhere;
  }
  .metrics dd {
    font-weight: 700;
  }
  summary {
    cursor: pointer;
    padding: 0.75rem 0;
    font-weight: 600;
  }
  .source-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 290px), 1fr));
    gap: 1rem;
  }
  article {
    border: 1px solid #ccd7de;
    padding: 1rem;
    border-radius: 0.5rem;
    min-width: 0;
  }
  h3 {
    font-size: 1rem;
    overflow-wrap: anywhere;
  }
  article a {
    display: inline-block;
    padding: 0.75rem 0;
  }
  input,
  select,
  button {
    min-height: 44px;
  }
  button {
    margin-top: 1rem;
  }
  @media (max-width: 600px) {
    button {
      width: 100%;
    }
  }
</style>
