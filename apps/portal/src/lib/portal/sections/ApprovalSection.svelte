<script lang="ts">
  import { base } from '$app/paths';
  import { tick } from 'svelte';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import { SectionCard, StatusBadge } from '../ui';

  type Tab = 'time' | 'expenses' | 'reports';
  type Stage = 'operational' | 'report' | 'correction' | 'owner_override' | 'finance' | '';
  const tabs: readonly Tab[] = ['time', 'expenses', 'reports'];

  let {
    data,
    isAuditor,
    isOwner,
    canSeeFinanceReview = false,
    translate,
    controlledValue,
  }: {
    data: PortalData;
    isAuditor: boolean;
    isOwner: boolean;
    /** Explicit capability: finance rows remain out of the PM surface by default. */
    canSeeFinanceReview?: boolean;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
  } = $props();

  let activeTab = $state<Tab>('time');
  let search = $state('');
  let stageFilter = $state<Stage>('');
  const componentId = $props.id();

  const rows = $derived(data.records ?? []);
  const milestones = $derived(data.milestones ?? []);
  const financeReviewVisible = $derived(
    canSeeFinanceReview &&
      ['owner_admin', 'finance_admin', 'auditor_read_only'].includes(String(data.user.role)),
  );
  const ownerOverrideAllowed = $derived(
    isOwner && String(data.user.role) === 'owner_admin' && !isAuditor,
  );
  const financeRows = $derived(
    financeReviewVisible ? rows.filter((row) => String(row.review_stage) === 'finance') : [],
  );
  const operationalRows = $derived(rows.filter((row) => String(row.review_stage) !== 'finance'));
  const attentionCount = $derived(
    operationalRows.filter((row) => ['submitted', 'approved'].includes(String(row.approval_state)))
      .length,
  );
  const reportCount = $derived(
    operationalRows.filter((row) => ['daily', 'technical'].includes(String(row.type))).length,
  );

  const visibleRows = $derived.by(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return operationalRows.filter((row) => {
      const type = String(row.type);
      const matchesTab =
        activeTab === 'time'
          ? type === 'time'
          : activeTab === 'expenses'
            ? type === 'expense'
            : ['daily', 'technical'].includes(type);
      const matchesStage = !stageFilter || String(row.review_stage) === stageFilter;
      const matchesSearch =
        !normalizedSearch ||
        [row.id, row.date, row.type, row.project_id, row.worker_id, row.approval_state]
          .map((value) => String(value ?? '').toLowerCase())
          .some((value) => value.includes(normalizedSearch));
      return matchesTab && matchesStage && matchesSearch;
    });
  });

  function value(row: Row, key: string): string {
    const raw = row[key];
    return raw === null || raw === undefined ? '' : String(raw);
  }

  function recordHref(row: Row): string {
    const id = encodeURIComponent(value(row, 'id'));
    const type = value(row, 'type');
    if (type === 'expense') return `${base}/app/expenses/${id}`;
    if (type === 'time') return `${base}/app/time/${id}`;
    if (['daily', 'technical'].includes(type)) return `${base}/app/reports/${id}`;
    return `${base}/app/${encodeURIComponent(type)}/${id}`;
  }

  function tabId(tab: Tab): string {
    return `approval-tab-${componentId}-${tab}`;
  }

  function panelId(): string {
    return `approval-panel-${componentId}`;
  }

  function focusTab(tab: Tab): void {
    activeTab = tab;
    if (typeof document === 'undefined') return;
    void tick().then(() => document.getElementById(tabId(tab))?.focus());
  }

  function handleTabKeydown(event: KeyboardEvent, tab: Tab): void {
    const currentIndex = tabs.indexOf(tab);
    let nextIndex: number | undefined;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (nextTab) focusTab(nextTab);
  }

  function tabLabel(tab: Tab): string {
    if (tab === 'time') return translate('Time');
    if (tab === 'expenses') return translate('Expenses');
    return translate('Reports');
  }

  function stageLabel(stage: unknown): string {
    switch (String(stage)) {
      case 'report':
        return translate('Report review');
      case 'correction':
        return translate('Correction draft');
      case 'owner_override':
        return translate('Owner override');
      case 'finance':
        return translate('Finance review');
      default:
        return translate('Operational review');
    }
  }

  function statusVariant(
    valueToClass: unknown,
  ): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    switch (String(valueToClass ?? '')) {
      case 'approved':
        return 'success';
      case 'rejected':
        return 'danger';
      case 'submitted':
      case 'needs_changes':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  function rowType(row: Row): 'time' | 'expense' {
    return value(row, 'type') === 'expense' ? 'expense' : 'time';
  }

  function correctionType(row: Row): string {
    const type = value(row, 'type');
    if (type === 'time') return 'time_entry';
    if (type === 'expense') return 'expense';
    return `${type}_report`;
  }
</script>

<div class="approval-page">
  <header class="approval-context">
    <div>
      <p class="approval-eyebrow">{translate('Operational control')}</p>
      <h2>{translate('Approvals')}</h2>
      <p>{translate('Review submitted operational truth before it moves to the next stage.')}</p>
    </div>
    <span class="approval-count" aria-label={translate('Approval queue count')}
      >{operationalRows.length}</span
    >
  </header>

  <div class="approval-attention" aria-label={translate('Approval attention summary')}>
    <article class="approval-attention-card">
      <span>{translate('Needs attention')}</span>
      <strong>{attentionCount}</strong>
      <small>{translate('Submitted or correction-ready records')}</small>
    </article>
    <article class="approval-attention-card">
      <span>{translate('Reports')}</span>
      <strong>{reportCount}</strong>
      <small>{translate('Daily and technical reports in scope')}</small>
    </article>
    {#if financeReviewVisible}
      <article class="approval-attention-card approval-attention-card-finance">
        <span>{translate('Finance review')}</span>
        <strong>{financeRows.length}</strong>
        <small>{translate('Separate finance queue')}</small>
      </article>
    {/if}
  </div>

  <div class="approval-tabs" aria-label={translate('Approval domains')} role="tablist">
    {#each tabs as tab}
      <button
        type="button"
        role="tab"
        id={tabId(tab)}
        aria-selected={activeTab === tab}
        aria-controls={panelId()}
        tabindex={activeTab === tab ? 0 : -1}
        class:active={activeTab === tab}
        onclick={() => focusTab(tab)}
        onkeydown={(event) => handleTabKeydown(event, tab)}
      >
        <span>{tabLabel(tab)}</span>
        <strong
          >{operationalRows.filter((row) => {
            const type = value(row, 'type');
            return tab === 'time'
              ? type === 'time'
              : tab === 'expenses'
                ? type === 'expense'
                : ['daily', 'technical'].includes(type);
          }).length}</strong
        >
      </button>
    {/each}
  </div>

  <form
    class="approval-filters"
    aria-label={translate('Filter approvals')}
    onsubmit={(event) => event.preventDefault()}
  >
    <label>
      <span>{translate('Search queue')}</span>
      <input bind:value={search} type="search" placeholder={translate('Date, type or record')} />
    </label>
    <label>
      <span>{translate('Review stage')}</span>
      <select bind:value={stageFilter}>
        <option value="">{translate('All stages')}</option>
        <option value="operational">{translate('Operational review')}</option>
        <option value="report">{translate('Report review')}</option>
        <option value="correction">{translate('Correction draft')}</option>
        {#if ownerOverrideAllowed}<option value="owner_override"
            >{translate('Owner override')}</option
          >{/if}
      </select>
    </label>
    <button
      type="button"
      class="secondary-button"
      onclick={() => {
        search = '';
        stageFilter = '';
      }}>{translate('Clear filters')}</button
    >
  </form>

  <div
    id={panelId()}
    class="approval-tab-panel"
    role="tabpanel"
    aria-labelledby={tabId(activeTab)}
    tabindex="0"
  >
    <SectionCard title={tabLabel(activeTab)} class="approval-list-surface">
      {#if visibleRows.length > 0}
        <div class="approval-list" aria-live="polite">
          {#each visibleRows as row}
            <article class="approval-row" data-approval-row={value(row, 'id')}>
              <div class="approval-row-main">
                <a class="approval-record-link" href={recordHref(row)}>
                  <strong>{value(row, 'type')} · {value(row, 'date')}</strong>
                  <small>{stageLabel(row.review_stage)} · {value(row, 'project_id')}</small>
                  <span>{translate('Open record →')}</span>
                </a>
                <div class="approval-row-status">
                  <StatusBadge
                    variant={statusVariant(row.approval_state)}
                    text={controlledValue('status', row.approval_state) ||
                      value(row, 'approval_state')}
                  />
                </div>
              </div>

              <div class="approval-row-actions">
                {#if isAuditor}
                  <span class="approval-read-only">{translate('Read-only review')}</span>
                {:else if value(row, 'review_stage') === 'report'}
                  <form method="POST" action="?/reviewReport">
                    <input type="hidden" name="type" value={value(row, 'type')} />
                    <input type="hidden" name="id" value={value(row, 'id')} />
                    <input type="hidden" name="decision" value="approved" />
                    <button type="submit">{translate('Approve report')}</button>
                  </form>
                  <details class="approval-action-menu">
                    <summary>{translate('Review actions')}</summary>
                    <form method="POST" action="?/reviewReport">
                      <input type="hidden" name="type" value={value(row, 'type')} />
                      <input type="hidden" name="id" value={value(row, 'id')} />
                      <input type="hidden" name="decision" value="needs_changes" />
                      <label>
                        <span>{translate('Required change')}</span>
                        <input name="reason" minlength="3" required />
                      </label>
                      <button type="submit" class="secondary-button">{translate('Return')}</button>
                    </form>
                  </details>
                {:else if ['correction', 'owner_override'].includes(value(row, 'review_stage'))}
                  {#if value(row, 'review_stage') === 'owner_override' && !ownerOverrideAllowed}
                    <span class="approval-read-only">{translate('Owner review required')}</span>
                  {:else}
                    <form method="POST" action="?/createCorrectionDraft">
                      <input type="hidden" name="recordType" value={correctionType(row)} />
                      <input type="hidden" name="originalId" value={value(row, 'id')} />
                      <input
                        type="hidden"
                        name="requestId"
                        value={`approval-correction-${value(row, 'type')}-${value(row, 'id')}`}
                      />
                      {#if value(row, 'review_stage') === 'owner_override'}
                        <input type="hidden" name="ownerOverride" value="yes" />
                      {/if}
                      <label>
                        <span
                          >{translate(
                            value(row, 'review_stage') === 'owner_override'
                              ? 'Owner override reason'
                              : 'Correction reason',
                          )}</span
                        >
                        <input name="reason" minlength="3" required />
                      </label>
                      <button type="submit"
                        >{translate(
                          value(row, 'review_stage') === 'owner_override'
                            ? 'Create owner override draft'
                            : 'Create correction draft',
                        )}</button
                      >
                    </form>
                  {/if}
                {:else}
                  <form method="POST" action="?/approveRecord">
                    <input type="hidden" name="type" value={rowType(row)} />
                    <input type="hidden" name="id" value={value(row, 'id')} />
                    <input type="hidden" name="decision" value="approved" />
                    <button type="submit">{translate('Approve')}</button>
                  </form>
                  <details class="approval-action-menu">
                    <summary>{translate('Review actions')}</summary>
                    <form method="POST" action="?/approveRecord">
                      <input type="hidden" name="type" value={rowType(row)} />
                      <input type="hidden" name="id" value={value(row, 'id')} />
                      <input type="hidden" name="decision" value="needs_changes" />
                      <label>
                        <span>{translate('Required change')}</span>
                        <input name="reason" minlength="3" required />
                      </label>
                      <button type="submit" class="secondary-button">
                        {translate('Needs changes')}
                      </button>
                    </form>
                    <form method="POST" action="?/approveRecord">
                      <input type="hidden" name="type" value={rowType(row)} />
                      <input type="hidden" name="id" value={value(row, 'id')} />
                      <input type="hidden" name="decision" value="rejected" />
                      <label>
                        <span>{translate('Rejection reason')}</span>
                        <input name="reason" minlength="3" required />
                      </label>
                      <button type="submit" class="danger-button">{translate('Reject')}</button>
                    </form>
                  </details>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <div class="approval-empty" role="status">
          <strong>{translate('Approval queue clear.')}</strong>
          <span>{translate('No records match this operational view.')}</span>
        </div>
      {/if}
    </SectionCard>
  </div>

  {#if milestones.length > 0}
    <SectionCard title={translate('Project approvals')} class="approval-milestone-surface">
      <div class="approval-list" aria-live="polite">
        {#each milestones as milestone}
          <article class="approval-row" data-approval-milestone={value(milestone, 'id')}>
            <div class="approval-row-main">
              <a
                class="approval-record-link"
                href={`${base}/app/projects/${encodeURIComponent(value(milestone, 'project_id'))}`}
              >
                <strong>{value(milestone, 'project_number')} · {value(milestone, 'name')}</strong>
                <small
                  >{value(milestone, 'due_on') || translate('No due date')} · {translate(
                    'Submitted',
                  )}</small
                >
                <span>{translate('Open project →')}</span>
              </a>
              <StatusBadge variant="warning" text={translate('Submitted')} />
            </div>
            {#if isAuditor}
              <span class="approval-read-only">{translate('Read-only review')}</span>
            {:else}
              <div class="approval-row-actions">
                <form method="POST" action="?/reviewMilestone">
                  <input type="hidden" name="id" value={value(milestone, 'id')} />
                  <input type="hidden" name="decision" value="approved" />
                  <button type="submit">{translate('Approve')}</button>
                </form>
                <details class="approval-action-menu">
                  <summary>{translate('Review actions')}</summary>
                  <form method="POST" action="?/reviewMilestone">
                    <input type="hidden" name="id" value={value(milestone, 'id')} />
                    <input type="hidden" name="decision" value="rejected" />
                    <label>
                      <span>{translate('Rejection reason')}</span>
                      <input name="reason" minlength="3" required />
                    </label>
                    <button type="submit" class="danger-button">{translate('Reject')}</button>
                  </form>
                </details>
              </div>
            {/if}
          </article>
        {/each}
      </div>
    </SectionCard>
  {/if}

  {#if canSeeFinanceReview && financeReviewVisible}
    <SectionCard title={translate('Finance review')} class="approval-finance-surface">
      <p class="approval-finance-note">
        {translate('This separate queue is visible only with an authorized Finance capability.')}
      </p>
      {#if financeRows.length > 0}
        <div class="approval-list" aria-live="polite">
          {#each financeRows as row}
            <article class="approval-row" data-finance-review-row={value(row, 'id')}>
              <div class="approval-row-main">
                <a class="approval-record-link" href={recordHref(row)}>
                  <strong>{value(row, 'type')} · {value(row, 'date')}</strong>
                  <small>{translate('Finance review')} · {value(row, 'project_id')}</small>
                  <span>{translate('Open record →')}</span>
                </a>
                <StatusBadge variant="warning" text={translate('Approved operationally')} />
              </div>
              {#if isAuditor}
                <span class="approval-read-only">{translate('Read-only review')}</span>
              {:else}
                <form method="POST" action="?/financeApprove" class="finance-review-form">
                  <input type="hidden" name="type" value={rowType(row)} />
                  <input type="hidden" name="id" value={value(row, 'id')} />
                  {#if value(row, 'type') === 'time'}
                    <label>
                      <span>{translate('Commercial treatment')}</span>
                      <select name="billable" required>
                        <option value="yes">{translate('Billable')}</option>
                        <option value="no">{translate('Non-billable')}</option>
                      </select>
                    </label>
                  {/if}
                  <button type="submit">{translate('Record Finance review')}</button>
                </form>
              {/if}
            </article>
          {/each}
        </div>
      {:else}
        <div class="approval-empty" role="status">
          <strong>{translate('Finance queue clear.')}</strong>
        </div>
      {/if}
    </SectionCard>
  {/if}
</div>

<style>
  .approval-page {
    display: grid;
    gap: 1.25rem;
  }

  .approval-context,
  .approval-row-main,
  .approval-row-actions,
  .approval-filters,
  .finance-review-form {
    display: flex;
    align-items: center;
    gap: 0.9rem;
  }

  .approval-context {
    justify-content: space-between;
    border-bottom: 1px solid var(--border, #d7dee8);
    padding-bottom: 1rem;
  }

  .approval-context h2,
  .approval-context p {
    margin: 0;
  }

  .approval-context p:last-child {
    color: var(--muted, #5d6878);
    margin-top: 0.35rem;
  }

  .approval-eyebrow {
    color: var(--accent, #0d5c63);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  .approval-count {
    align-items: center;
    background: var(--surface-3, #eef3f6);
    border: 1px solid var(--border, #d7dee8);
    border-radius: 999px;
    display: inline-flex;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    min-height: 2.75rem;
    min-width: 2.75rem;
    justify-content: center;
  }

  .approval-attention {
    display: grid;
    gap: 0.8rem;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .approval-attention-card {
    background: var(--surface-2, #f7f9fb);
    border: 1px solid var(--border, #d7dee8);
    border-left: 3px solid var(--accent, #0d5c63);
    border-radius: 0.6rem;
    display: grid;
    gap: 0.2rem;
    padding: 0.9rem 1rem;
  }

  .approval-attention-card-finance {
    border-left-color: var(--warning, #a25b00);
  }

  .approval-attention-card strong {
    font-size: 1.5rem;
    font-variant-numeric: tabular-nums;
  }

  .approval-attention-card small,
  .approval-finance-note,
  .approval-record-link small {
    color: var(--muted, #5d6878);
  }

  .approval-tabs {
    border-bottom: 1px solid var(--border, #d7dee8);
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
  }

  .approval-tabs button {
    align-items: center;
    background: transparent;
    border: 0;
    border-bottom: 3px solid transparent;
    color: var(--muted, #5d6878);
    display: inline-flex;
    gap: 0.55rem;
    min-height: 2.9rem;
    padding: 0.55rem 0.9rem;
    white-space: nowrap;
  }

  .approval-tabs button.active {
    border-bottom-color: var(--accent, #0d5c63);
    color: var(--ink, #172333);
  }

  .approval-tabs button strong {
    background: var(--surface-3, #eef3f6);
    border-radius: 999px;
    font-size: 0.75rem;
    min-width: 1.55rem;
    padding: 0.15rem 0.35rem;
    text-align: center;
  }

  .approval-filters {
    align-items: end;
    flex-wrap: wrap;
  }

  .approval-filters label,
  .finance-review-form label,
  .approval-action-menu label,
  .approval-row-actions > form label {
    display: grid;
    gap: 0.3rem;
  }

  .approval-filters label:first-child {
    flex: 1 1 16rem;
  }

  .approval-filters label:not(:first-child) {
    flex: 0 1 14rem;
  }

  .approval-filters span,
  .finance-review-form span,
  .approval-action-menu span,
  .approval-row-actions > form span {
    font-size: 0.78rem;
    font-weight: 700;
  }

  .approval-filters input,
  .approval-filters select,
  .finance-review-form select,
  .approval-action-menu input,
  .approval-row-actions > form input {
    border: 1px solid var(--border, #c8d1dc);
    border-radius: 0.4rem;
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
  }

  .approval-row {
    border-bottom: 1px solid var(--border, #d7dee8);
    display: grid;
    gap: 0.9rem;
    padding: 1rem 0;
  }

  .approval-row:last-child {
    border-bottom: 0;
  }

  .approval-row-main {
    justify-content: space-between;
    min-width: 0;
  }

  .approval-record-link {
    display: grid;
    gap: 0.22rem;
    min-width: 0;
    text-decoration: none;
  }

  .approval-record-link strong,
  .approval-record-link small,
  .approval-record-link span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .approval-record-link span {
    color: var(--accent, #0d5c63);
    font-size: 0.8rem;
    font-weight: 700;
  }

  .approval-row-status {
    flex: 0 0 auto;
  }

  .approval-row-actions {
    align-items: start;
    flex-wrap: wrap;
  }

  .approval-row-actions form,
  .finance-review-form {
    align-items: end;
    flex-wrap: wrap;
  }

  .approval-row-actions button,
  .finance-review-form button,
  .approval-tabs button,
  .approval-filters button,
  .approval-action-menu summary {
    cursor: pointer;
    min-height: 44px;
  }

  .approval-action-menu {
    position: relative;
  }

  .approval-action-menu summary {
    align-items: center;
    border: 1px solid var(--border, #c8d1dc);
    border-radius: 0.4rem;
    display: inline-flex;
    list-style: none;
    padding: 0.55rem 0.7rem;
  }

  .approval-action-menu summary::-webkit-details-marker {
    display: none;
  }

  .approval-action-menu[open] summary {
    border-color: var(--accent, #0d5c63);
  }

  .approval-action-menu > form {
    background: var(--surface, #fff);
    border: 1px solid var(--border, #c8d1dc);
    border-radius: 0.5rem;
    box-shadow: 0 10px 28px rgb(19 34 52 / 14%);
    display: grid;
    gap: 0.65rem;
    margin-top: 0.4rem;
    min-width: min(21rem, 84vw);
    padding: 0.8rem;
  }

  .approval-read-only {
    color: var(--muted, #5d6878);
    font-size: 0.85rem;
    font-weight: 700;
  }

  .approval-empty {
    color: var(--muted, #5d6878);
    display: grid;
    gap: 0.3rem;
    padding: 1.5rem 0;
    text-align: center;
  }

  .approval-finance-note {
    margin: 0 0 0.5rem;
  }

  .approval-filters button:focus-visible,
  .approval-tabs button:focus-visible,
  .approval-row button:focus-visible,
  .approval-action-menu summary:focus-visible,
  .approval-record-link:focus-visible,
  .approval-filters input:focus-visible,
  .approval-filters select:focus-visible,
  .approval-row input:focus-visible,
  .approval-row select:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--accent, #0d5c63) 38%, transparent);
    outline-offset: 2px;
  }

  @media (max-width: 760px) {
    .approval-attention {
      grid-template-columns: 1fr;
    }

    .approval-context,
    .approval-row-main,
    .approval-filters {
      align-items: stretch;
      flex-direction: column;
    }

    .approval-count {
      align-self: flex-start;
    }

    .approval-filters label,
    .approval-filters label:not(:first-child) {
      flex: 1 1 auto;
      width: 100%;
    }

    .approval-filters button {
      width: 100%;
    }

    .approval-row-actions,
    .approval-row-actions form,
    .finance-review-form {
      align-items: stretch;
      flex-direction: column;
      width: 100%;
    }

    .approval-row-actions > form,
    .approval-row-actions > form button,
    .finance-review-form button,
    .finance-review-form label,
    .approval-action-menu,
    .approval-action-menu summary {
      width: 100%;
    }

    .approval-action-menu > form {
      min-width: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .approval-page,
    .approval-page * {
      scroll-behavior: auto;
      transition-duration: 0.01ms;
    }
  }
</style>
