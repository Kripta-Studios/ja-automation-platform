<script lang="ts">
  import { base } from '$app/paths';
  import { ResponsiveSheet } from '../ui';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import TimesheetPanel from './TimesheetPanel.svelte';

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
  type CategoryOption = Readonly<{ value: string; label: string }>;

  const primaryCategories: readonly CategoryOption[] = [
    { value: 'regular', label: 'Work' },
    { value: 'overtime', label: 'Overtime' },
    { value: 'travel', label: 'Travel' },
    { value: 'standby', label: 'Standby' },
    { value: 'commissioning', label: 'Commissioning' },
  ];
  const moreCategories: readonly CategoryOption[] = [
    { value: 'weekend_holiday', label: 'Weekend / holiday' },
    { value: 'remote_support', label: 'Remote support' },
    { value: 'training', label: 'Training' },
    { value: 'internal', label: 'Internal' },
  ];
  const filterCategories = [...primaryCategories, ...moreCategories];

  let surface = $state<Surface | null>(null);
  let editTimeId = $state<string | null>(null);
  let createCategory = $state('regular');
  let editCategory = $state('regular');

  const records = $derived(data.records ?? []);
  const editRow = $derived.by(
    () => records.find((row) => String(row.id) === editTimeId) as Row | undefined,
  );
  const totalActualMinutes = $derived(
    records.reduce((total, row) => total + Number(row.minutes ?? 0), 0),
  );
  const pendingCount = $derived(
    records.filter((row) =>
      ['draft', 'submitted', 'needs_changes'].includes(String(row.approval_state)),
    ).length,
  );
  const approvedCount = $derived(
    records.filter((row) => String(row.approval_state) === 'approved').length,
  );
  const activeCategory = $derived(surface === 'edit' ? editCategory : createCategory);
  const showOperationalDetail = $derived(
    activeCategory === 'travel' || activeCategory === 'standby',
  );
  const operationalDetailLabel = $derived(
    activeCategory === 'travel' ? 'Travel operational detail' : 'Standby reason',
  );

  function openCreate(): void {
    surface = 'create';
    editTimeId = null;
    createCategory = 'regular';
  }

  function openEdit(row: Row): void {
    surface = 'edit';
    editTimeId = String(row.id);
    editCategory = String(row.category ?? 'regular');
  }

  function closeSurface(): void {
    surface = null;
    editTimeId = null;
    createCategory = 'regular';
    editCategory = 'regular';
  }
</script>

<div class="time-page">
  <header class="time-page-context">
    <div>
      <p class="time-eyebrow">{translate('Worker operations')}</p>
      <h2>{translate('Time')}</h2>
      <p>
        {translate(
          'Record actual operational time. Commercial interpretation is applied from configured project rules.',
        )}
      </p>
    </div>
  </header>

  <div class="time-status-strip" aria-label={translate('Time attention summary')}>
    <div class="time-status-card">
      <span>{translate('Actual recorded')}</span>
      <strong>{totalActualMinutes} {translate('min')}</strong>
      <small>{translate('Minutes you really recorded.')}</small>
    </div>
    <div class="time-status-card">
      <span>{translate('Needs attention')}</span>
      <strong>{pendingCount}</strong>
      <small>{translate('Draft or review state')}</small>
    </div>
    <div class="time-status-card">
      <span>{translate('Approved')}</span>
      <strong>{approvedCount}</strong>
      <small>{translate('Rows approved by the workflow')}</small>
    </div>
  </div>

  {#if data.timesheet}
    <TimesheetPanel {data} {isAuditor} {translate} {controlledValue} />
  {/if}

  <form
    class="time-filters"
    method="GET"
    action={`${base}/app/time`}
    aria-label={translate('Filter time entries')}
  >
    <input type="hidden" name="week" value={data.weekStart ?? ''} />
    <label>
      <span>{translate('Project')}</span>
      <select name="project">
        <option value="">{translate('All projects')}</option>
        {#each availableProjects as project}
          <option
            value={String(project.id)}
            selected={String(data.timeFilter?.projectId ?? '') === String(project.id)}
            >{project.project_number} — {project.name}</option
          >
        {/each}
      </select>
    </label>
    <label>
      <span>{translate('Category')}</span>
      <select name="category">
        <option value="">{translate('All categories')}</option>
        {#each filterCategories as category}
          <option value={category.value} selected={data.timeFilter?.category === category.value}
            >{translate(category.label)}</option
          >
        {/each}
      </select>
    </label>
    <div class="time-filter-actions">
      <button type="submit" class="secondary-button">{translate('Apply filters')}</button>
      {#if data.timeFilter?.category || data.timeFilter?.projectId}
        <a href={`${base}/app/time?week=${encodeURIComponent(data.weekStart ?? '')}`}
          >{translate('Clear filters')}</a
        >
      {/if}
    </div>
  </form>

  <section class="time-record-list" aria-labelledby="time-records-title">
    <div class="time-list-heading">
      <div>
        <span class="time-eyebrow">{translate('ACTIVITY REGISTER')}</span>
        <h3 id="time-records-title">{translate('Recent time entries')}</h3>
      </div>
      <span class="time-record-count">{records.length}</span>
    </div>
    {#if data.timeFilter?.category || data.timeFilter?.projectId}
      <p class="form-help time-filter-note">
        {translate('Filtered view:')}
        {translate(data.timeFilter.category?.replaceAll('_', ' ') || 'all categories')}.
      </p>
    {/if}
    <div class="time-records">
      {#each records as row}
        <article
          class:time-record-needs-changes={row.approval_state === 'needs_changes'}
          class="time-record"
        >
          <a class="time-record-link" href={`${base}/app/time/${String(row.id)}`}>
            <strong>{row.work_date} · {row.project_number}</strong>
            <small
              >{controlledValue('category', row.category)} · {row.minutes} min · {controlledValue(
                'status',
                row.approval_state,
              )}</small
            >
            <span class="time-record-summary">{row.activity_summary}</span>
            <span>{translate('Open record →')}</span>
          </a>
          {#if row.approval_state === 'draft' && String(row.worker_id) === data.user.id}
            <div class="time-record-actions">
              <button type="button" class="secondary-button" onclick={() => openEdit(row)}>
                {translate('Edit draft')}
              </button>
              <form method="POST" action="?/submitTime">
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="version" value={row.version} />
                <button type="submit">{translate('Submit')}</button>
              </form>
            </div>
          {/if}
          {#if String(row.worker_id) === data.user.id && row.approval_state !== 'void'}
            <div class="time-record-actions time-destructive-actions">
              {#if row.approval_state === 'draft'}
                <form
                  method="POST"
                  action="?/deleteDraft"
                  data-action="deleteDraft"
                  data-record-type="time_entry"
                  data-record-id={String(row.id)}
                >
                  <input type="hidden" name="recordType" value="time_entry" />
                  <input type="hidden" name="recordId" value={row.id} />
                  <input type="hidden" name="version" value={row.version} />
                  <button type="submit" class="destructive-button">{translate('Delete')}</button>
                </form>
              {:else}
                <form method="POST" action="?/deleteTime">
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="version" value={row.version} />
                  <button type="submit" class="destructive-button">
                    {row.approval_state === 'needs_changes'
                      ? translate('Delete')
                      : translate('Void')}
                  </button>
                </form>
              {/if}
            </div>
          {/if}
        </article>
      {:else}
        <div class="time-empty" role="status">
          <strong>{translate('No time recorded.')}</strong>
          <span>{translate('Your actual time entries will appear here.')}</span>
        </div>
      {/each}
    </div>
  </section>
  {#if !isAuditor}
    <div class="time-primary-action-wrap">
      <button type="button" class="time-primary-action" data-time-primary-cta onclick={openCreate}>
        {translate('Log time')}
      </button>
    </div>
  {/if}
</div>

<ResponsiveSheet
  open={surface !== null}
  title={surface === 'edit' ? translate('Edit time entry') : translate('Log time')}
  description={translate('Operational entry only. Commercial rules are applied separately.')}
  closeLabel={translate('Close time form')}
  class="time-entry-sheet"
  onclose={closeSurface}
>
  {#if surface === 'create'}
    <form
      method="POST"
      action="?/createTime"
      class="expense-entry-form time-entry-form"
      data-time-entry-surface
      onsubmit={(event) => saveOfflineDraft(event, 'time')}
    >
      <div class="expense-entry-intro time-entry-intro">
        <strong>{translate('Capture actual work')}</strong>
        <span>{translate('Enter what happened on site, not its commercial interpretation.')}</span>
      </div>
      <label>
        <span>{translate('Assigned project')}</span>
        <select name="projectId" required>
          <option value="">{translate('Select assignment')}</option>
          {#each availableProjects as project}
            <option value={String(project.id)}>{project.project_number} — {project.name}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>{translate('Date')}</span>
        <input name="workDate" type="date" required />
      </label>
      <label>
        <span>{translate('Operational category')}</span>
        <select name="category" bind:value={createCategory} required>
          {#each primaryCategories as category}
            <option value={category.value}>{translate(category.label)}</option>
          {/each}
          <optgroup label={translate('More')}>
            {#each moreCategories as category}
              <option value={category.value}>{translate(category.label)}</option>
            {/each}
          </optgroup>
        </select>
      </label>
      {#if showOperationalDetail}
        <label>
          <span>{translate(operationalDetailLabel)}</span>
          <input
            name="activityCode"
            maxlength="100"
            placeholder={translate('Operational detail')}
          />
        </label>
      {/if}
      <label>
        <span>{translate('Actual duration (minutes)')}</span>
        <input name="minutes" type="number" min="1" max="1440" required inputmode="numeric" />
      </label>
      <label>
        <span>{translate('Activity summary')}</span>
        <textarea name="summary" minlength="3" maxlength="5000" required></textarea>
      </label>
      <div class="expense-entry-actions time-entry-actions">
        <button type="button" class="secondary-button" onclick={closeSurface}
          >{translate('Cancel')}</button
        >
        <button type="submit">{translate('Save draft')}</button>
      </div>
    </form>
  {:else if surface === 'edit' && editRow}
    <form
      method="POST"
      action="?/updateTime"
      class="expense-entry-form time-entry-form"
      data-entity-id={String(editRow.id)}
      data-version={String(editRow.version)}
      data-time-entry-surface
      onsubmit={(event) => saveOfflineDraft(event, 'time')}
    >
      <input type="hidden" name="id" value={editRow.id} />
      <input type="hidden" name="version" value={editRow.version} />
      <input type="hidden" name="projectId" value={editRow.project_id} />
      <input type="hidden" name="workDate" value={editRow.work_date} />
      <div class="expense-entry-intro time-entry-intro">
        <strong>{translate('Update actual work')}</strong>
        <span>{translate('The project and date remain bound to the original entry.')}</span>
      </div>
      <label>
        <span>{translate('Operational category')}</span>
        <select name="category" bind:value={editCategory} required>
          {#each primaryCategories as category}
            <option value={category.value}>{translate(category.label)}</option>
          {/each}
          <optgroup label={translate('More')}>
            {#each moreCategories as category}
              <option value={category.value}>{translate(category.label)}</option>
            {/each}
          </optgroup>
        </select>
      </label>
      {#if showOperationalDetail}
        <label>
          <span>{translate(operationalDetailLabel)}</span>
          <input
            name="activityCode"
            maxlength="100"
            value={String(editRow.activity_code ?? '')}
            placeholder={translate('Operational detail')}
          />
        </label>
      {/if}
      <label>
        <span>{translate('Actual duration (minutes)')}</span>
        <input name="minutes" type="number" min="0" max="1440" value={editRow.minutes} required />
      </label>
      <label>
        <span>{translate('Activity summary')}</span>
        <textarea name="summary" minlength="3" maxlength="5000" required
          >{editRow.activity_summary}</textarea
        >
      </label>
      <div class="expense-entry-actions time-entry-actions">
        <button type="button" class="secondary-button" onclick={closeSurface}
          >{translate('Cancel')}</button
        >
        <button type="submit">{translate('Save changes')}</button>
      </div>
    </form>
  {/if}
</ResponsiveSheet>
