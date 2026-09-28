<script lang="ts">
  import { base } from '$app/paths';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import { portalText } from '$lib/portal-i18n';
  import { SectionCard, FieldGroup, Field, ProblemNotice } from '$lib/portal/ui';
  import { paymentMoney } from '$lib/portal/payment-money';
  import { ownerFinanceCopy } from '$lib/portal/owner-finance-copy';
  import { cashFilters } from '$lib/portal/owner-finance';
  import { cashCopy } from './copy';
  import { tick } from 'svelte';
  let { data } = $props();
  const locale = $derived(data.locale === 'es' ? 'es' : data.locale === 'pt' ? 'pt' : 'en');
  const t = $derived(cashCopy[locale]);
  const ft = $derived(ownerFinanceCopy[locale]);
  const problemFields = $derived(Object.keys(data.problem?.fieldErrors ?? {}));
  const firstProblemField = $derived(problemFields[0] ?? 'filter');
  const fromDateInvalid = $derived(data.problem?.fieldErrors.from?.[0] === 'Enter a valid date.');
  const toDateInvalid = $derived(data.problem?.fieldErrors.to?.[0] === 'Enter a valid date.');
  let problemContainer = $state<HTMLDivElement>();
  function fieldError(name: string): string | undefined {
    const key = data.problem?.fieldErrors[name]?.[0];
    return key ? portalText(locale, key) : undefined;
  }
  function fieldLabel(name: string): string {
    return name === 'currency'
      ? ft.currency
      : name === 'filter'
        ? ft.filter
        : name === 'from'
          ? t.from
          : name === 'to'
            ? t.to
            : name === 'group'
              ? t.group
              : t.project;
  }
  function rememberFilterScroll(event: SubmitEvent): void {
    const input = (event.currentTarget as HTMLFormElement).elements.namedItem('viewportScrollY');
    if (input instanceof HTMLInputElement)
      input.value = String(Math.max(0, Math.round(window.scrollY)));
  }
  function focusCashProblem(): void {
    const container = problemContainer;
    if (!container || !data.problem) return;
    void tick().then(() =>
      requestAnimationFrame(() => {
        if (!container.isConnected) return;
        const target =
          container.querySelector<HTMLElement>('[data-ui="validation-summary"]') ??
          container.querySelector<HTMLElement>('[data-ui="problem-notice"]');
        if (!target) return;
        const scroll = $page.url.searchParams.get('viewportScrollY');
        if (scroll && /^\d{1,7}$/.test(scroll)) window.scrollTo(0, Number(scroll));
        if (document.activeElement !== target && !target.contains(document.activeElement))
          target.focus({ preventScroll: true });
        const bounds = target.getBoundingClientRect();
        const clearOfHeader = 88;
        if (bounds.top < clearOfHeader) {
          window.scrollBy(0, bounds.top - clearOfHeader);
        } else if (bounds.bottom > window.innerHeight - 24) {
          window.scrollBy(
            0,
            Math.min(bounds.bottom - (window.innerHeight - 24), bounds.top - clearOfHeader),
          );
        }
      }),
    );
  }
  $effect(() => {
    if (data.problem && problemContainer) focusCashProblem();
  });
  afterNavigate(() => setTimeout(focusCashProblem, 0));
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
  <a href={`${base}/app/finance?view=economic&lang=${locale}`} data-origin-back>← {t.back}</a>
  <h1>{t.title}</h1>
  <p>{t.explanation}</p>
  <p>{t.pending}</p>
  <SectionCard title={t.group}>
    {#if data.problem}
      <div id="cash-filter-problem" bind:this={problemContainer}>
        <ProblemNotice
          problem={data.problem}
          kind="error"
          remedyLinks={{
            correct_field: {
              label: portalText(locale, 'problem.remedy.correctField'),
              href: `#cash-${firstProblemField}`,
            },
          }}
        />
        {#if problemFields.length > 1}
          <div data-ui="validation-summary" tabindex="-1">
            <strong>{portalText(locale, 'Check the highlighted fields')}</strong>
            <ul>
              {#each problemFields as name}
                <li><a href={`#cash-${name}`}>{fieldLabel(name)}: {fieldError(name)}</a></li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    {/if}
    <form method="GET" onsubmit={rememberFilterScroll}>
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="viewportScrollY" value="" />
      <FieldGroup>
        <Field id="cash-currency" label={ft.currency} error={fieldError('currency')}
          ><select
            id="cash-currency"
            name="currency"
            value={data.currency}
            aria-invalid={fieldError('currency') ? 'true' : undefined}
            aria-describedby={fieldError('currency') ? 'cash-currency-error' : undefined}
            ><option value="">—</option
            >{#if data.currency && !data.currencies.includes(data.currency)}<option
                value={data.currency}
                disabled>{portalText(locale, 'Unavailable')}</option
              >{/if}{#each data.currencies as currency}<option value={currency}>{currency}</option
              >{/each}</select
          ></Field
        >
        <Field id="cash-filter" label={ft.filter} error={fieldError('filter')}
          ><select
            id="cash-filter"
            name="filter"
            value={data.filter}
            aria-invalid={fieldError('filter') ? 'true' : undefined}
            aria-describedby={fieldError('filter') ? 'cash-filter-error' : undefined}
            >{#if !cashFilters.includes(data.filter as (typeof cashFilters)[number])}<option
                value={data.filter}
                disabled>{portalText(locale, 'Unavailable')}</option
              >{/if}{#each cashFilters as filter}<option value={filter}>{ft[filter]}</option
              >{/each}</select
          ></Field
        >
        <Field id="cash-from" label={t.from} error={fieldError('from')}
          ><input
            id="cash-from"
            type={fromDateInvalid ? 'text' : 'date'}
            name="from"
            value={data.from}
            aria-invalid={fieldError('from') ? 'true' : undefined}
            aria-describedby={fieldError('from') ? 'cash-from-error' : undefined}
          /></Field
        >
        <Field id="cash-to" label={t.to} error={fieldError('to')}
          ><input
            id="cash-to"
            type={toDateInvalid ? 'text' : 'date'}
            name="to"
            value={data.to}
            aria-invalid={fieldError('to') ? 'true' : undefined}
            aria-describedby={fieldError('to') ? 'cash-to-error' : undefined}
          /></Field
        >
        <Field id="cash-project" label={t.project} error={fieldError('project')}
          ><select
            id="cash-project"
            name="project"
            value={data.projectId}
            aria-invalid={fieldError('project') ? 'true' : undefined}
            aria-describedby={fieldError('project') ? 'cash-project-error' : undefined}
            ><option value="">{t.all}</option
            >{#if data.projectId && !data.projects.some((project) => project.id === data.projectId)}<option
                value={data.projectId}
                disabled
                >{portalText(locale, 'Previously selected project is no longer available')}</option
              >{/if}{#each data.projects as project}<option value={project.id}
                >{project.label}</option
              >{/each}</select
          ></Field
        >
        <Field id="cash-group" label={t.group} error={fieldError('group')}
          ><select
            id="cash-group"
            name="group"
            value={data.granularity}
            aria-invalid={fieldError('group') ? 'true' : undefined}
            aria-describedby={fieldError('group') ? 'cash-group-error' : undefined}
            >{#if data.granularity !== 'week' && data.granularity !== 'month'}<option
                value={data.granularity}
                disabled>{portalText(locale, 'Unavailable')}</option
              >{/if}<option value="week">{t.week}</option><option value="month">{t.month}</option
            ></select
          ></Field
        >
      </FieldGroup>
      <label
        ><input type="checkbox" name="dated" value="1" checked={data.datedOnly} /> {ft.dates}</label
      >
      <button type="submit">{t.apply}</button>
    </form>
    {#if !data.problem && !data.datedOnly}<p>{t.unknownDateNote}</p>{/if}
  </SectionCard>
  {#if !data.problem}{#each data.groups as group}
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
    {:else}<SectionCard title={t.title}><p>{t.none}</p></SectionCard>{/each}{/if}
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
    background: #f6f6f5;
    padding: 0.75rem;
    border-radius: 0.5rem;
  }
  dt {
    color: #53514c;
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
    border: 1px solid #d7d6d3;
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
