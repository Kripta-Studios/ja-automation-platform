<script lang="ts">
  import RecordBrowser from '$lib/portal/ui/RecordBrowser.svelte';
  import { base } from '$app/paths';
  import { portalText, normalizePortalLocale } from '$lib/portal-i18n';
  import { SectionCard, StatusBadge } from '$lib/portal/ui';
  let { data, form } = $props();
  let search = $state('');
  const t = (text: string) => portalText(normalizePortalLocale(data.locale), text);
  const types = [
    ['expense', 'Expenses'],
    ['time_entry', 'Time'],
    ['daily_report', 'Daily'],
    ['technical_report', 'Technical / PLC'],
  ] as const;
  const records = $derived(
    data.records.filter((row) =>
      Object.values(row).some((value) =>
        String(value ?? '')
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    ),
  );
  const section = $derived(
    data.recordType === 'expense'
      ? 'expenses'
      : data.recordType === 'time_entry'
        ? 'time'
        : 'reports',
  );
  function fieldValue(row: Record<string, unknown> | null, name: string, type: string): string {
    if (
      form &&
      'values' in form &&
      'recordId' in form &&
      form.recordId === String(row?.id ?? '') &&
      form.values &&
      typeof form.values === 'object'
    )
      return String((form.values as Record<string, unknown>)[name] ?? '');
    if (name === 'amount' && row?.amount_minor !== undefined) {
      const raw = String(row.amount_minor).padStart(3, '0');
      return `${raw.slice(0, -2)}.${raw.slice(-2)}`;
    }
    const value = String(row?.[name] ?? '');
    return type === 'datetime-local' ? value.slice(0, 16) : value;
  }
  let catalogPage = $state<typeof data.catalogRows>([]);
  let recordPage = $state<typeof data.records>([]);
</script>

<svelte:head><title>{t('Data management')} · J&amp;A</title></svelte:head>
<div class="management-page">
  <header>
    <h1>{t('Data management')}</h1>
    <p>
      {t(
        'Manage all company records from your Owner account. Changes apply equally to demo and production records.',
      )}
    </p>
  </header>
  {#if form?.message}<p class="management-feedback" role={form.success ? 'status' : 'alert'}>
      {t(form.message ?? '')}
    </p>{/if}
  <nav class="management-tabs" aria-label={t('Management areas')}>
    {#each [['', 'Operational records'], ['planning_assignment', 'Planning'], ['worker_availability', 'Availability'], ['document', 'Documents'], ['technical_change', 'Technical changes'], ['project_milestone', 'Milestones']] as [area, label]}
      <a
        href={area ? `?area=${area}` : '?type=expense'}
        aria-current={(area ? data.area === area : !data.catalog) ? 'page' : undefined}
        >{t(label ?? '')}</a
      >
    {/each}
  </nav>
  {#if data.catalog}
    <SectionCard title={t(data.catalog.title)}>
      {#if data.area === 'document'}<a
          class="management-action primary-action"
          href={`${base}/app/documents`}>{t('Upload document')} →</a
        >{:else}<details open={Boolean(form && 'recordId' in form && form.recordId === '')}>
          <summary>{t('Add record')}</summary>{@render catalogForm(null)}
        </details>{/if}
      <div class="management-records">
        <RecordBrowser
          rows={data.catalogRows}
          bind:visible={catalogPage}
          focusId={data.focusId}
          translate={t}
          label="Records"
        />
        {#each catalogPage as row}
          <article>
            <h2>
              {String(
                row.name ??
                  row.component ??
                  row.safe_filename ??
                  row.original_filename ??
                  data.workers.find((worker) => worker.id === row.worker_id)?.name ??
                  row.id,
              )}
            </h2>
            <p>
              {row.archived_at ? t('Archived') : String(row.starts_at ?? row.due_on ?? '')} · {String(
                row.status ?? row.approval_state ?? row.availability ?? '',
              )}
            </p>
            <details
              open={data.focusId === row.id ||
                Boolean(form && 'recordId' in form && form.recordId === row.id)}
            >
              <summary>{t('Edit')}</summary>{@render catalogForm(row)}
            </details>
          </article>
        {:else}<p>{t('No records found')}</p>{/each}
      </div>
    </SectionCard>
  {:else}
    <SectionCard title={t('Operational records')}>
      <nav aria-label={t('Record type')} class="management-tabs">
        {#each types as [type, label]}<a
            href={`?type=${type}`}
            aria-current={data.recordType === type ? 'page' : undefined}>{t(label ?? '')}</a
          >{/each}
      </nav>
      <div class="management-toolbar">
        <label>{t('Search')}<input type="search" bind:value={search} /></label><a
          class="management-action primary-action"
          href={`${base}/app/${section}`}>{t('Add or edit records')} →</a
        >
      </div>
      <div class="management-records">
        <RecordBrowser
          rows={records}
          bind:visible={recordPage}
          translate={t}
          label="Operational records"
        />
        {#each recordPage as row}
          <article id={String(row.id)}>
            <header>
              <strong
                >{String(
                  row.vendor ?? row.summary ?? row.system_name ?? row.activity_summary ?? row.id,
                )}</strong
              ><StatusBadge text={t(String(row.approval_state))} />
            </header>
            <p>
              {row.worker_name} · {row.project_number} · {row.spent_on ??
                row.work_date ??
                row.report_date}
            </p>
            <a
              class="management-action"
              href={`${base}/app/${section}${section === 'reports' ? '/' + row.id : '?edit=' + row.id}`}
              >{t('Open record →')}</a
            >
            {#if row.managementBlock}
              <p>{t(row.managementBlock)}</p>
              <div class="management-tabs">
                <a href={`${base}/app/billing`}>{t('Billing')}</a><a
                  href={`${base}/app/finance/cash`}>{t('Payments and settlements')}</a
                ><a href={`${base}/app/reports`}>{t('Reports')}</a><a href={`${base}/app/approvals`}
                  >{t('Corrections')}</a
                ><a href="?area=technical_change">{t('Technical changes')}</a>
              </div>
            {:else}
              <details>
                <summary>{t('Manage record')}</summary>
                <form method="POST" action={`?/manageRecord&type=${data.recordType}`}>
                  <input type="hidden" name="recordType" value={data.recordType} /><input
                    type="hidden"
                    name="id"
                    value={row.id}
                  /><input type="hidden" name="version" value={row.version} />
                  <label
                    >{t('Correction reason')}<textarea
                      name="reason"
                      minlength="3"
                      maxlength="2000"
                      required
                    ></textarea></label
                  >
                  <label class="confirmation"
                    ><input type="checkbox" name="confirmed" value="yes" required />{t(
                      'I confirm this change to the selected record.',
                    )}</label
                  >
                  <div class="management-tabs">
                    {#if row.approval_state !== 'draft'}<button name="operation" value="reopen"
                        >{t('Reopen as draft')}</button
                      >{/if}
                    <button name="operation" value="delete" class="destructive-button"
                      >{t('Delete')}</button
                    >
                  </div>
                </form>
              </details>
            {/if}
          </article>
        {:else}<p>{t('No records found')}</p>{/each}
      </div>
    </SectionCard>
  {/if}
  <SectionCard title={t('All management areas')}>
    <div class="management-domains">
      {#each data.domains as domain}<a
          class="management-domain"
          href={`${base}/app/${domain.route}`}
        >
          <span class="domain-title">{t(domain.title)} <span aria-hidden="true">→</span></span>
          <span class="domain-count"
            >{domain.counts.reduce((sum, value) => sum + value.count, 0)} {t('records')}</span
          >
        </a>{/each}
    </div>
  </SectionCard>
</div>

{#snippet catalogForm(row: Record<string, unknown> | null)}
  <form method="POST" action={`?/manageCatalog&area=${data.area}`}>
    <input type="hidden" name="kind" value={data.area} /><input
      type="hidden"
      name="id"
      value={String(row?.id ?? '')}
    /><input type="hidden" name="token" value={String(row?.token ?? '')} />
    {#each data.catalog?.fields ?? [] as field}
      <label
        >{t(field.label)}
        {#if field.type === 'project'}<select
            name={field.name}
            value={fieldValue(row, field.name, field.type)}
            required
            ><option value="">{t('Select project')}</option>{#each data.projects as project}<option
                value={project.id}>{project.project_number} — {project.name}</option
              >{/each}</select
          >
        {:else if field.type === 'worker'}<select
            name={field.name}
            value={fieldValue(row, field.name, field.type)}
            required
            ><option value="">{t('Select worker')}</option>{#each data.workers as worker}<option
                value={worker.id}>{worker.name} — {worker.email}</option
              >{/each}</select
          >
        {:else if field.type === 'report'}<select
            name={field.name}
            value={fieldValue(row, field.name, field.type)}
            ><option value="">—</option>{#each data.technicalReports as report}<option
                value={report.id}>{report.system_name}</option
              >{/each}</select
          >
        {:else if field.type === 'select'}<select
            name={field.name}
            value={fieldValue(row, field.name, field.type) || field.options?.[0]}
            required
            >{#each field.options ?? [] as option}<option value={option}
                >{t(
                  field.name === 'safety_impact' ? (option === '1' ? 'Yes' : 'No') : option,
                )}</option
              >{/each}</select
          >
        {:else}<input
            name={field.name}
            type={field.type}
            value={fieldValue(row, field.name, field.type)}
            required={field.required}
            min={field.type === 'number' ? 0 : undefined}
          />{/if}
      </label>
    {/each}
    <label
      >{t('Correction reason')}<textarea name="reason" minlength="3" maxlength="2000" required
      ></textarea></label
    >
    <label class="confirmation"
      ><input type="checkbox" name="confirmed" value="yes" required />{t(
        'I confirm this change to the selected record.',
      )}</label
    >
    <div class="management-tabs">
      <button class="primary-action" name="operation" value={row ? 'update' : 'create'}
        >{t('Save changes')}</button
      >{#if row}{#if data.area === 'document' && row.archived_at}<button
            name="operation"
            value="restore">{t('Restore')}</button
          >{:else}<button name="operation" value="delete" class="destructive-button"
            >{t(data.area === 'document' ? 'Archive' : 'Delete')}</button
          >{/if}{/if}
    </div>
  </form>
{/snippet}

<style>
  .management-page {
    display: grid;
    gap: 24px;
    max-width: 1200px;
    margin: auto;
    padding: clamp(0px, 1vw, 12px);
  }
  .management-page h1 {
    font-size: clamp(1.5rem, 3vw, 2rem);
    font-weight: 700;
    line-height: 1.2;
    margin: 0 0 12px;
  }
  .management-page p {
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .management-tabs,
  .management-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin: 16px 0;
  }
  .management-tabs a,
  .management-action,
  summary,
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid var(--ja-control-border);
    border-radius: var(--ja-control-radius);
    background: var(--ja-surface-raised);
    color: var(--ja-text-primary);
    font: inherit;
    font-weight: 600;
    text-decoration: none;
    line-height: 1.4;
    box-shadow: var(--ja-shadow-soft);
    min-height: 44px;
    padding: 12px;
    cursor: pointer;
  }
  .management-tabs a[aria-current] {
    background: var(--ja-primary);
    color: var(--ja-white);
    border-color: var(--ja-primary);
    border-radius: 8px;
    font-weight: 700;
  }
  .management-records,
  .management-domains {
    display: grid;
    gap: 16px;
  }
  .management-domains {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  }
  article {
    min-width: 0;
    padding: 20px;
    border: 1px solid var(--ja-border-subdued);
    background: var(--ja-canvas);
    border-radius: 12px;
  }
  article header {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }
  article strong {
    overflow-wrap: anywhere;
  }
  h2 {
    font-size: 1.05rem;
  }
  label {
    display: grid;
    gap: 8px;
    margin: 12px 0;
  }
  input,
  select,
  textarea {
    width: 100%;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid var(--ja-control-border);
    border-radius: var(--ja-control-radius);
    background: var(--ja-surface);
    color: var(--ja-text-primary);
    max-width: 100%;
    min-height: 44px;
  }
  .confirmation {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  textarea {
    width: 100%;
    min-height: 88px;
  }
  .management-page > header p,
  article > p {
    color: var(--ja-text-secondary);
  }
  .management-page > header p {
    max-width: 76ch;
    margin-bottom: 0;
  }
  .management-toolbar {
    justify-content: space-between;
  }
  .management-toolbar label {
    flex: 1;
    max-width: 480px;
  }
  .management-page > .management-tabs {
    margin: 0;
    padding: 12px;
    background: var(--ja-surface);
    border: 1px solid var(--ja-border-subdued);
    border-radius: var(--ja-radius);
  }
  .management-action {
    margin-block: 4px 12px;
  }
  .primary-action {
    background: var(--ja-primary);
    color: var(--ja-white);
    border-color: var(--ja-primary);
  }
  .destructive-button {
    background: #fff1f2;
    color: var(--ja-red);
    border-color: var(--ja-red);
  }
  .management-tabs a:hover,
  .management-action:hover,
  summary:hover,
  button:hover {
    border-color: var(--ja-primary);
    box-shadow: 0 0 0 1px var(--ja-primary);
  }
  .primary-action:hover {
    background: var(--ja-primary-hover);
  }
  .destructive-button:hover {
    border-color: var(--ja-red);
    box-shadow: 0 0 0 1px var(--ja-red);
  }
  a:focus-visible,
  summary:focus-visible,
  button:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 3px solid var(--ja-focus-ring);
    outline-offset: 3px;
  }
  details {
    margin-block: 12px;
  }
  summary {
    justify-content: flex-start;
    width: fit-content;
  }
  summary::before {
    content: '+';
    font-size: 1.2rem;
    line-height: 1;
  }
  details[open] > summary::before {
    content: '−';
  }
  details[open] > summary {
    margin-bottom: 16px;
  }
  form {
    padding: 16px;
    border: 1px solid var(--ja-border-subdued);
    border-radius: 12px;
    background: var(--ja-surface);
  }
  .confirmation input {
    width: 20px;
    height: 20px;
    min-height: 20px;
    flex-shrink: 0;
    accent-color: var(--ja-primary);
  }
  .confirmation {
    min-height: 44px;
  }
  .management-feedback {
    padding: 16px;
    border: 1px solid var(--ja-primary);
    background: var(--ja-surface-raised);
    border-radius: 12px;
  }
  .management-feedback[role='alert'] {
    border-color: var(--ja-red);
  }
  .management-domain {
    display: grid;
    gap: 12px;
    padding: 20px;
    border: 1px solid var(--ja-border-strong);
    border-radius: 12px;
    background: var(--ja-canvas);
    color: var(--ja-text-primary);
    text-decoration: none;
  }
  .management-domain:hover {
    border-color: var(--ja-primary);
    background: var(--ja-surface-raised);
  }
  .domain-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-weight: 700;
  }
  .domain-count {
    color: var(--ja-text-secondary);
    font-size: 0.9rem;
  }
  @media (max-width: 600px) {
    .management-page {
      padding: 0;
    }
    article {
      padding: 16px;
    }
    .management-toolbar {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
