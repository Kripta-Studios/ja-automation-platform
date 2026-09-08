<script lang="ts">
  import { base } from '$app/paths';
  import { SectionCard, FormCard, FieldGroup, Field } from '$lib/portal/ui';
  import { paymentMoney } from '$lib/portal/payment-money';
  import { copy } from './copy';
  let { data, form } = $props();
  const locale = $derived(data.locale === 'es' ? 'es' : data.locale === 'pt' ? 'pt' : 'en');
  const t = $derived(copy[locale]);
  const invalidFields = $derived((form?.fields ?? []) as string[]);
  const value = (name: string) =>
    form?.values?.[name] ?? data.defaults[name as keyof typeof data.defaults] ?? '';
  const fields = [
    ['workHours', 'work', '0.1'],
    ['referenceHours', 'reference', '0.1'],
    ['minimumHours', 'minimum', '0.1'],
    ['sellRate', 'sell', '0.01'],
    ['workerRate', 'pay', '0.01'],
    ['loadedCostRate', 'cost', '0.01'],
    ['expenseAmount', 'expenseAmount', '0.01'],
    ['fixedPrice', 'fixedPrice', '0.01'],
  ] as const;
  const multiplierFields = [
    ['sellMultiplier', 'sellMultiplier'],
    ['workerMultiplier', 'payMultiplier'],
    ['costMultiplier', 'costMultiplier'],
  ] as const;
  const moneyResults = [
    ['laborRevenueMinor', 'laborRevenue'],
    ['expenseRevenueMinor', 'expenseRevenue'],
    ['revenueMinor', 'totalRevenue'],
    ['workerCompensationMinor', 'workerPay'],
    ['loadedLaborCostMinor', 'laborCost'],
    ['expenseCostMinor', 'expenseCost'],
    ['directCostMinor', 'totalCost'],
    ['contributionMinor', 'contribution'],
    ['workerReimbursementMinor', 'reimbursement'],
  ] as const;
  const cadenceLabel = (cadence: unknown) =>
    ({
      weekly: t.weekly,
      every_14_days: t.fortnight,
      semi_monthly: t.twice,
      monthly: t.monthly,
      custom: t.custom,
      manual: t.custom,
      milestone: t.custom,
    })[String(cadence)] ?? String(cadence);
</script>

<svelte:head><title>{t.title} | J&A</title></svelte:head>
<main class="agreement-page" lang={locale === 'pt' ? 'pt-BR' : locale}>
  <a
    href={`${base}/app/finance?view=commercial&project=${encodeURIComponent(data.selectedProjectId)}&lang=${locale}`}
    >← {t.back}</a
  >
  <h1>{t.title}</h1>
  <SectionCard title={t.summary}>
    <form method="GET" class="project-picker">
      <input type="hidden" name="lang" value={locale} />
      <label for="agreement-project">{t.project}</label>
      <select id="agreement-project" name="project" value={data.selectedProjectId}>
        <option value="">{t.select}</option>
        {#each data.projects as project}<option value={project.id}>{project.label}</option>{/each}
      </select>
      <button type="submit">{t.view}</button>
    </form>
    {#if data.agreement}
      <h2>{data.agreement.number} — {data.agreement.name}</h2>
      <dl class="facts">
        <div>
          <dt>{t.pricing}</dt>
          <dd>{data.agreement.pricing === 'all_in' ? t.fixed : String(data.agreement.pricing)}</dd>
        </div>
        <div>
          <dt>{t.currency}</dt>
          <dd>{data.agreement.currency}</dd>
        </div>
        <div>
          <dt>{t.reference}</dt>
          <dd>
            {data.agreement.referenceMinutes == null
              ? t.none
              : Number(data.agreement.referenceMinutes) / 60}
          </dd>
        </div>
        <div>
          <dt>{t.minimum}</dt>
          <dd>
            {data.agreement.minimumMinutes == null
              ? t.none
              : Number(data.agreement.minimumMinutes) / 60}
          </dd>
        </div>
      </dl>
      <p>{t.expenseNote}</p>
      <details>
        <summary>{t.streams}</summary>
        {#each data.streams as stream}
          <p>
            <strong>{stream.stream_type}</strong> · {cadenceLabel(stream.cadence_type)} · {stream.currency}
            · {t.from}
            {stream.effective_from} · {t.to}
            {stream.effective_to ?? '—'}
          </p>
        {:else}<p>{t.none}</p>{/each}
      </details>
      <details>
        <summary>{t.policies}</summary>
        {#each data.policies as policy}
          <dl class="facts">
            <div>
              <dt>{t.from}</dt>
              <dd>{policy.effectiveFrom}</dd>
            </div>
            <div>
              <dt>{t.to}</dt>
              <dd>{policy.effectiveTo ?? '—'}</dd>
            </div>
            <div>
              <dt>{t.enabled}</dt>
              <dd>{policy.overtimeEnabled ? t.yes : t.no}</dd>
            </div>
            <div>
              <dt>{t.travel}</dt>
              <dd>{policy.travelClientBillable ? t.yes : t.no}</dd>
            </div>
            <div>
              <dt>{t.signoff}</dt>
              <dd>{policy.customerSignoffRequired ? t.yes : t.no}</dd>
            </div>
          </dl>
        {:else}<p>{t.none}</p>{/each}
      </details>
    {/if}
  </SectionCard>
  <FormCard title={t.sample}>
    <p>{t.scope}</p>
    {#if form?.invalid}<p role="alert" class="form-error">{t.invalid}</p>{/if}
    <form method="POST" data-commercial-example>
      <FieldGroup>
        <Field id="example-currency" label={t.currency}
          ><select id="example-currency" name="currency" value={value('currency')}
            >{#each ['USD', 'EUR', 'BRL'] as currency}<option>{currency}</option>{/each}</select
          ></Field
        >
        <Field id="example-pricing" label={t.pricing}
          ><select id="example-pricing" name="pricing" value={value('pricing')}
            ><option value="hourly">{t.hourly}</option><option value="fixed">{t.fixed}</option
            ></select
          ></Field
        >
        <Field id="example-expenses" label={t.expenses}
          ><select id="example-expenses" name="expenseTreatment" value={value('expenseTreatment')}
            ><option value="included">{t.included}</option><option value="recoverable"
              >{t.recoverable}</option
            ><option value="customer_direct">{t.direct}</option></select
          ></Field
        >
        <Field id="example-payer" label={t.payer}
          ><select
            id="example-payer"
            name="workerAdvancedExpense"
            value={value('workerAdvancedExpense')}
            ><option value="yes">{t.yes}</option><option value="no">{t.no}</option></select
          ></Field
        >
        {#each fields as [name, label, step]}
          <Field id={`example-${name}`} label={t[label]} required
            ><input
              id={`example-${name}`}
              {name}
              type="number"
              min="0"
              {step}
              value={value(name)}
              required
              aria-invalid={invalidFields.includes(name) || undefined}
            /></Field
          >
        {/each}
      </FieldGroup>
      <details>
        <summary>{t.overtime}</summary>
        <p>{t.multiplierNote}</p>
        <FieldGroup>
          <Field id="example-threshold" label={t.threshold}
            ><input
              id="example-threshold"
              name="thresholdHours"
              type="number"
              min="0.1"
              max="24"
              step="0.1"
              value={value('thresholdHours')}
            /></Field
          >
          {#each multiplierFields as [name, label]}
            <Field id={`example-${name}`} label={t[label]} required
              ><input
                id={`example-${name}`}
                {name}
                type="number"
                min="0"
                max="10"
                step="0.01"
                value={value(name)}
                required
              /></Field
            >
          {/each}
        </FieldGroup>
      </details>
      <details open>
        <summary>{t.periods}</summary>
        <FieldGroup>
          <Field id="example-cadence" label={t.cadence}
            ><select id="example-cadence" name="cadence" value={value('cadence')}
              ><option value="weekly">{t.weekly}</option><option value="every_14_days"
                >{t.fortnight}</option
              ><option value="semi_monthly">{t.twice}</option><option value="monthly"
                >{t.monthly}</option
              ><option value="custom">{t.custom}</option></select
            ></Field
          >
          <Field id="example-date" label={t.date}
            ><input
              id="example-date"
              name="exampleDate"
              type="date"
              value={value('exampleDate')}
              required
            /></Field
          >
          <Field id="example-anchor" label={t.anchor}
            ><input
              id="example-anchor"
              name="anchorDate"
              type="date"
              value={value('anchorDate')}
            /></Field
          >
        </FieldGroup>
      </details>
      <button type="submit" class="calculate">{t.calculate}</button>
    </form>
  </FormCard>
  {#if form?.result}
    <SectionCard title={t.result} data-commercial-result>
      <p>{t.resultNote}</p>
      <dl class="facts">
        <div>
          <dt>{t.actual}</dt>
          <dd>{form.result.actualMinutes / 60}</dd>
        </div>
        <div>
          <dt>{t.regular}</dt>
          <dd>{form.result.regularMinutes / 60}</dd>
        </div>
        <div>
          <dt>{t.overtimeHours}</dt>
          <dd>{form.result.overtimeMinutes / 60}</dd>
        </div>
        <div>
          <dt>{t.adjustment}</dt>
          <dd>{form.result.minimumAdjustmentMinutes / 60}</dd>
        </div>
        {#each moneyResults as [key, label]}<div>
            <dt>{t[label]}</dt>
            <dd>{paymentMoney(form.result[key], form.result.currency, locale)}</dd>
          </div>{/each}
      </dl>
      {#if form.periods.length}<h3>{t.periods}</h3>
        <ol>
          {#each form.periods as period}<li>{period.start} → {period.end}</li>{/each}
        </ol>{/if}
    </SectionCard>
  {/if}
</main>

<style>
  .agreement-page {
    max-width: 1120px;
    margin: 0 auto;
    padding: clamp(1rem, 4vw, 2.5rem);
    display: grid;
    gap: 1.25rem;
  }
  .agreement-page h1 {
    font-size: clamp(1.6rem, 4vw, 2.2rem);
    margin: 0;
  }
  .agreement-page p {
    line-height: 1.6;
  }
  .project-picker {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    align-items: center;
  }
  .project-picker select {
    flex: 1 1 16rem;
    min-width: 0;
  }
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr));
    gap: 1rem;
  }
  .facts div {
    padding: 0.75rem;
    background: #f2f6f8;
    border-radius: 0.5rem;
  }
  dt {
    font-size: 0.875rem;
    color: #44515d;
  }
  dd {
    margin: 0.5rem 0 0;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  details {
    margin: 1rem 0;
  }
  summary {
    padding: 0.75rem 0;
    font-weight: 600;
    cursor: pointer;
  }
  input,
  select,
  button {
    min-height: 44px;
    max-width: 100%;
  }
  .calculate {
    margin-top: 1rem;
  }
  .form-error {
    color: #9b1c1c;
    padding: 1rem;
    border: 1px solid currentColor;
  }
  @media (max-width: 600px) {
    .project-picker {
      display: grid;
    }
    .calculate {
      width: 100%;
    }
  }
</style>
