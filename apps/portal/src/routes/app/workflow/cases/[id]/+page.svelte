<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import ActionBar from '$lib/portal/ui/ActionBar.svelte';
  import Field from '$lib/portal/ui/Field.svelte';
  import FormCard from '$lib/portal/ui/FormCard.svelte';
  import SectionCard from '$lib/portal/ui/SectionCard.svelte';
  import StatusBadge from '$lib/portal/ui/StatusBadge.svelte';
  import { billingReadinessMessageKey } from '$lib/portal/billing-readiness';
  import { normalizePortalLocale, portalText } from '$lib/portal-i18n';
  import { workflowActionCopy, workflowStatus, workflowText } from '$lib/portal/workflow/copy';
  import type { ActionData, PageData } from './$types';

  let { data, form } = $props<{ data: PageData; form: ActionData }>();
  const locale = $derived(
    normalizePortalLocale($page.url.searchParams.get('lang') ?? $page.data.locale),
  );
  const t = (key: string) => workflowText(locale, key);
  const financeCase = $derived(data.financeCase);
  const actionMessage = $derived(workflowActionCopy(locale, form));
  const actionSucceeded = $derived((form as { success?: boolean } | null)?.success === true);
  const selected = $derived(
    new Set(
      financeCase.manifest.selectedSources.map(
        (source: { type: 'time' | 'expense'; id: string }) => `${source.type}:${source.id}`,
      ),
    ),
  );
  const invoicePrepared = $derived(financeCase.phase === 'invoice_prepared');

  function readiness(code: string): string {
    const direct: Record<string, string> = {
      pending_time_submission: 'A time record still needs worker submission.',
      pending_expense_submission: 'An expense still needs worker submission.',
      pending_expense_approval: 'An expense still needs approval.',
      missing_expense_classification: 'An expense needs a finance classification.',
      source_not_billable: 'This source is not billable under the current rules.',
      source_already_reserved: 'This source is already reserved by an invoice.',
      source_requires_remaining_period_billing:
        'This source has a remaining balance that needs its existing billing workflow.',
      client_daily_minimum_already_billed: 'The current daily minimum is already billed.',
      complete_client_billing_group_required: 'Select the complete billing group for this source.',
      selection_requires_whole_period_billing: 'This billing rule requires a whole-period case.',
      selected_source_not_eligible:
        'This source does not meet the current billing eligibility rules.',
      no_invoice_sources_selected: 'Select at least one current source before preparing a draft.',
      selected_source_outside_scope:
        'A selected source is outside the current project, period, or stream.',
      selected_source_changed:
        'A selected source changed. Refresh the snapshot and review it again.',
      stream_requires_existing_invoice_workflow:
        'This billing stream must use its existing invoice workflow.',
    };
    return direct[code] ? t(direct[code]) : portalText(locale, billingReadinessMessageKey(code));
  }

  function sourceHref(type: string, id: string) {
    const path = type === 'time' ? 'time' : type === 'expense' ? 'expenses' : 'reports';
    return `${base}/app/${path}/${encodeURIComponent(id)}`;
  }

  function changedSourceHref(value: string) {
    const separator = value.indexOf(':');
    if (separator < 0) return null;
    return sourceHref(value.slice(0, separator), value.slice(separator + 1));
  }

  function value(name: string): string {
    const values = (form as { values?: Record<string, string> } | null)?.values;
    return values?.[name] ?? '';
  }

  function recordField(record: Record<string, unknown>, ...names: string[]) {
    for (const name of names) {
      const found = record[name];
      if (found !== undefined && found !== null && String(found) !== '') return String(found);
    }
    return t('Not available');
  }

  function reportReviewHref() {
    const query = new URLSearchParams({
      project: financeCase.projectId,
      from: financeCase.periodStart,
      to: financeCase.periodEnd,
      lang: locale,
    });
    return `${base}/app/reports/review?${query.toString()}`;
  }

  function sourceLabel(type: string) {
    if (type === 'time') return t('Time entry');
    if (type === 'expense') return t('Expense receipt');
    return t('Current source');
  }

  function scopeLabel(scope: string) {
    return scope === 'whole_period' ? t('Whole period scope') : t('Selected-source scope');
  }

  function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    if (status === 'approved' || status === 'final' || status === 'accepted') return 'success';
    if (status === 'needs_changes' || status === 'submitted' || status === 'review')
      return 'warning';
    return 'neutral';
  }

  function streamLabel(stream: unknown): string {
    if (stream === 'labor') return t('Labor');
    if (stream === 'expense') return t('Expenses');
    if (stream === 'milestone') return t('Milestone');
    if (stream === 'other') return t('Other stream');
    return t('Not available');
  }

  function cadenceLabel(value: unknown): string {
    const labels: Record<string, string> = {
      weekly: 'Weekly',
      every_14_days: 'Every 14 days',
      semi_monthly: 'Semi-monthly',
      monthly: 'Monthly',
      custom: 'Custom',
      milestone: 'Milestone',
      manual: 'Manual',
    };
    const key = String(value ?? '');
    return labels[key] ? t(labels[key]) : t('Not available');
  }

  function ruleCadence(rule: Record<string, unknown>): string {
    return `${streamLabel(rule.stream_type)} · ${cadenceLabel(rule.cadence_type)}`;
  }

  function billingStateLabel(state: string): string {
    const labels: Record<string, string> = {
      unlocked: 'Available for billing',
      locked: 'Already billed or reserved',
      partially_billed: 'Partially billed',
      draft: 'Reserved in a draft invoice',
      approved: 'Reserved in an approved invoice',
      issued: 'Included in an issued invoice',
      sent: 'Included in an issued invoice',
      paid: 'Included in an issued invoice',
      overdue: 'Included in an issued invoice',
    };
    return labels[state] ? t(labels[state]) : t('Not available');
  }

  const reviewState = $derived(
    invoicePrepared
      ? t('Invoice draft prepared')
      : financeCase.reviewCurrent
        ? t('Snapshot current')
        : financeCase.reviewedManifestSha256
          ? t('Snapshot stale')
          : t('Review not recorded'),
  );
</script>

<svelte:head>
  <title>{t('Finance case')} · {data.projectName}</title>
</svelte:head>

<main class="workflow-case">
  <nav aria-label={t('Breadcrumb')}>
    <a class="text-link" href={`${base}/app/workflow?lang=${locale}`}>{t('Digital workers')}</a
    ><span aria-hidden="true"> / </span><span>{t('Finance case')}</span>
  </nav>
  <header class="case-heading">
    <div>
      <p class="eyebrow">{data.projectNumber} · {data.projectName}</p>
      <h1>{t('Finance case')}</h1>
      <p class="intro">
        {scopeLabel(financeCase.scopeKind)} · {financeCase.periodStart} – {financeCase.periodEnd}
      </p>
    </div>
    <StatusBadge
      variant={invoicePrepared ? 'info' : financeCase.reviewCurrent ? 'success' : 'warning'}
      text={reviewState}
    />
  </header>

  {#if actionMessage}<p
      class:success={actionSucceeded}
      class="notice"
      role={actionSucceeded ? 'status' : 'alert'}
    >
      {actionMessage}
    </p>{/if}
  {#if data.isAuditor}<p class="read-only-note">
      <StatusBadge variant="info" text={t('Read-only view')} />
      {t('Auditor view description')}
    </p>{/if}

  <div class="summary-grid">
    <div class="summary-card">
      <span>{t('Billing stream')}</span><strong
        >{streamLabel(financeCase.manifest.rule.stream_type)}</strong
      >
    </div>
    <div class="summary-card">
      <span>{t('Billing rule')}</span><strong>{ruleCadence(financeCase.manifest.rule)}</strong>
    </div>
    <div class="summary-card">
      <span>{t('Case version')}</span><strong>{financeCase.version}</strong>
    </div>
    <div class="summary-card">
      <span>{invoicePrepared ? t('Invoice state') : t('Current review')}</span><strong
        >{invoicePrepared
          ? workflowStatus(locale, financeCase.invoiceState ?? '')
          : reviewState}</strong
      >
    </div>
  </div>

  {#if financeCase.snapshotChanges.addedSources.length || financeCase.snapshotChanges.removedSources.length || financeCase.snapshotChanges.changedSources.length || financeCase.snapshotChanges.contextChanged}
    <SectionCard title={t('Snapshot changes')}>
      {#if financeCase.snapshotChanges.contextChanged}<p>{t('Context changed')}</p>{/if}
      {#each [['Sources added', financeCase.snapshotChanges.addedSources], ['Sources removed', financeCase.snapshotChanges.removedSources], ['Sources changed', financeCase.snapshotChanges.changedSources]] as [label, sources]}
        {#if sources.length}<div class="change-group">
            <h3>{t(label)}</h3>
            <ul>
              {#each sources as source}<li>
                  {#if changedSourceHref(source)}<a
                      class="text-link"
                      href={changedSourceHref(source)!}
                      >{sourceLabel(source.split(':', 1)[0])} · {source
                        .split(':')
                        .slice(1)
                        .join(':')}</a
                    >{:else}{source}{/if}
                </li>{/each}
            </ul>
          </div>{/if}
      {/each}
    </SectionCard>
  {:else if financeCase.reviewedManifestSha256}
    <p class="empty">{t('No source changes since review')}</p>
  {/if}

  {#if financeCase.manifest.reasons.length}
    <SectionCard title={t('Current snapshot blockers')}>
      <ul class="reason-list">
        {#each financeCase.manifest.reasons as reason (reason.code + ':' + (reason.sourceId ?? ''))}<li
          >
            {readiness(reason.code)}{#if reason.sourceId}<span class="reason-source">
                — {reason.sourceId}</span
              >{/if}
          </li>{/each}
      </ul>
    </SectionCard>
  {/if}

  <SectionCard title={t('Current source snapshot')} description={t('Source snapshot description')}>
    {#if financeCase.manifest.sources.length === 0}<p class="empty">
        {t('No current source snapshot')}
      </p>{:else}
      <ul class="source-list">
        {#each financeCase.manifest.sources as source (source.type + ':' + source.id)}
          <li class="source-card">
            <div class="source-main">
              <div class="source-copy">
                <h3>
                  {sourceLabel(source.type)}{#if source.workerName}
                    · {source.workerName}{/if}
                </h3>
                <p>{source.summary || t('Current source')}</p>
                <p class="meta">
                  {source.date} · {t('Source status')}: {workflowStatus(
                    locale,
                    source.approvalState,
                  )} · {t('Billing state')}: {billingStateLabel(source.billingState)}
                </p>
                <a class="text-link" href={sourceHref(source.type, source.id)}
                  >{t('View source record')}</a
                >
              </div>
              <StatusBadge
                variant={source.blockers.length ? 'warning' : 'success'}
                text={selected.has(`${source.type}:${source.id}`)
                  ? t('Source is included')
                  : t('Source is excluded')}
              />
            </div>
            {#if source.blockers.length}<ul class="reason-list">
                {#each source.blockers as reason}<li>{readiness(reason.code)}</li>{/each}
              </ul>{/if}
          </li>
        {/each}
      </ul>
    {/if}
    {#if financeCase.manifest.remainder.length}<p class="subtle">
        {financeCase.manifest.remainder.length}
        {t('Sources outside this selected scope remain visible in the register.')}
      </p>{/if}
  </SectionCard>

  <SectionCard title={t('Period reports and follow-up')}>
    {#if data.periodReviewAccess}
      <p>{t('Period report records are managed in the reports review workspace.')}</p>
      <a class="text-link" href={reportReviewHref()}>{t('Open the reports review workspace')}</a>
      {#if data.periodReports.length === 0}<p class="empty">
          {t('No current period report')}
        </p>{:else}
        <ul class="card-list">
          {#each data.periodReports as report (report.reportId)}
            <li class="record-card">
              <div class="record-topline">
                <div>
                  <h3>
                    {workflowText(locale, report.reportType)} · {report.periodStart} – {report.periodEnd}
                  </h3>
                  <p class="meta">{t('Case version')}: {report.snapshotVersion}</p>
                </div>
                <StatusBadge
                  variant={statusVariant(report.state)}
                  text={workflowStatus(locale, report.state)}
                />
              </div>
              <p class="meta">
                {report.pdfReady ? t('Report PDF ready') : t('Report PDF not ready')}
              </p>
              <a class="text-link" href={reportReviewHref()}
                >{t('Open the reports review workspace')}</a
              >
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
      <p class="empty">{t('Period report records are managed in the reports review workspace.')}</p>
    {/if}
    {#if financeCase.manifest.conformities.length}<details class="audit-details">
        <summary>{t('Customer conformity records')}</summary>
        <ul>
          {#each financeCase.manifest.conformities as conformity}<li>
              {recordField(conformity, 'id')} · {recordField(conformity, 'signed_at')} · {conformity.invalidation_id
                ? t('Invalidated')
                : t('Current')}
            </li>{/each}
        </ul>
      </details>{/if}
    {#if financeCase.manifest.followups.length}<details class="audit-details">
        <summary>{t('Follow-up history')}</summary>
        <ul>
          {#each financeCase.manifest.followups as followup}<li>
              {recordField(followup, 'event_type')} · {recordField(followup, 'next_follow_up_on')} · {recordField(
                followup,
                'sequence_no',
              )}
            </li>{/each}
        </ul>
      </details>{/if}
    {#if financeCase.manifest.reports.length}<details class="audit-details">
        <summary>{t('Reports included in snapshot')}</summary>
        <ul>
          {#each financeCase.manifest.reports as report}<li>
              {recordField(report, 'report_type')} · {recordField(report, 'audience')} · {recordField(
                report,
                'state',
              )} · v{recordField(report, 'snapshot_version')}
            </li>{/each}
        </ul>
      </details>{/if}
  </SectionCard>

  {#if !data.isAuditor && !invoicePrepared}
    <div class="action-grid">
      <FormCard title={t('Reconcile current records')}>
        <p>{t('Reconcile description')}</p>
        <form method="POST" action="?/reconcile">
          <input type="hidden" name="expectedVersion" value={financeCase.version} /><input
            type="hidden"
            name="requestKey"
            value={data.requestKeys.reconcile}
          /><input type="hidden" name="lang" value={locale} />
          <ActionBar
            ><button type="submit">{t('Refresh the current source snapshot')}</button></ActionBar
          >
        </form>
      </FormCard>
      <FormCard title={t('Record case review')}>
        <p>{t('Record case review description')}</p>
        {#if !financeCase.reviewCurrent}<p class="notice">
            {financeCase.reviewedManifestSha256
              ? t('Re-review after changes')
              : t('Case not reviewed')}
          </p>{/if}
        <form method="POST" action="?/recordReview">
          <input type="hidden" name="expectedVersion" value={financeCase.version} /><input
            type="hidden"
            name="manifestSha256"
            value={financeCase.manifestSha256}
          /><input type="hidden" name="requestKey" value={data.requestKeys.recordReview} /><input
            type="hidden"
            name="lang"
            value={locale}
          />
          <Field id="case-review-reason" label={t('Review reason')} required>
            <textarea
              id="case-review-reason"
              name="reason"
              rows="3"
              required
              maxlength="2000"
              placeholder={t('Explain the evidence or reason for this status change.')}
              >{value('reason')}</textarea
            >
          </Field>
          <ActionBar><button type="submit">{t('Record case review')}</button></ActionBar>
        </form>
      </FormCard>
    </div>
  {/if}
  {#if !data.isAuditor}
    <FormCard title={t('Create invoice draft')}>
      {#if financeCase.draftInvoiceId}
        <p>{invoicePrepared ? t('Invoice draft prepared') : t('Draft prepared')}</p>
        {#if financeCase.invoiceState}<p>
            {t('Invoice state')}: {workflowStatus(locale, financeCase.invoiceState)}
          </p>{/if}
        <a
          class="button-link"
          href={`${base}/app/billing/invoices/${encodeURIComponent(financeCase.draftInvoiceId)}`}
          >{t('Open invoice draft')}</a
        >
      {:else if !invoicePrepared}
        <p>
          {financeCase.manifest.readyForDraft
            ? t('Draft creation requires a current case review.')
            : t('Draft creation unavailable')}
        </p>
        <form method="POST" action="?/prepareDraft">
          <input type="hidden" name="expectedVersion" value={financeCase.version} /><input
            type="hidden"
            name="requestKey"
            value={data.requestKeys.prepareDraft}
          /><input type="hidden" name="lang" value={locale} /><ActionBar
            ><button
              type="submit"
              disabled={!financeCase.manifest.readyForDraft || !financeCase.reviewCurrent}
              >{t('Create invoice draft')}</button
            ></ActionBar
          >
        </form>
      {/if}
    </FormCard>
  {/if}

  <details class="audit-details">
    <summary>{t('Audit context')}</summary>
    <dl>
      <dt>{t('Case version')}</dt>
      <dd>{financeCase.version}</dd>
      <dt>{t('Manifest fingerprint')}</dt>
      <dd><code>{financeCase.manifestSha256}</code></dd>
      <dt>{t('Last reviewed fingerprint')}</dt>
      <dd><code>{financeCase.reviewedManifestSha256 ?? t('Not available')}</code></dd>
      <dt>{t('Current review')}</dt>
      <dd>{financeCase.currentReviewId ?? t('Not available')}</dd>
    </dl>
  </details>
</main>

<style>
  .workflow-case {
    display: grid;
    gap: 1rem;
    max-width: 78rem;
    margin: 0 auto;
    padding: clamp(1rem, 3vw, 2rem);
  }
  nav {
    color: var(--color-text-muted, #475569);
    font-size: 0.92rem;
  }
  .case-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }
  h1 {
    margin: 0;
    font-size: clamp(1.65rem, 4vw, 2.35rem);
  }
  .eyebrow,
  .intro,
  .meta,
  .subtle {
    color: var(--color-text-muted, #475569);
  }
  .eyebrow {
    margin: 0 0 0.35rem;
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .intro {
    margin: 0.5rem 0 0;
  }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.7rem;
  }
  .summary-card {
    display: grid;
    gap: 0.35rem;
    padding: 0.85rem;
    border: 1px solid var(--color-border, #d7dee8);
    border-radius: 0.7rem;
    background: var(--color-surface, #fff);
  }
  .summary-card span {
    color: var(--color-text-muted, #475569);
    font-size: 0.85rem;
  }
  .summary-card strong {
    overflow-wrap: anywhere;
  }
  .source-list,
  .card-list,
  .reason-list {
    display: grid;
    gap: 0.75rem;
    margin: 0.75rem 0 0;
    padding: 0;
    list-style: none;
  }
  .source-card,
  .record-card {
    padding: 0.9rem;
    border: 1px solid var(--color-border, #d7dee8);
    border-radius: 0.75rem;
    background: var(--color-surface, #fff);
  }
  .source-main,
  .record-topline {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.85rem;
  }
  .source-copy {
    min-width: 0;
  }
  .source-card h3,
  .record-card h3,
  .change-group h3 {
    margin: 0;
    font-size: 1rem;
  }
  .source-card p {
    margin: 0.35rem 0;
    overflow-wrap: anywhere;
  }
  .text-link {
    display: inline-block;
    margin-top: 0.4rem;
    font-weight: 650;
  }
  .reason-list {
    padding-left: 1.25rem;
    list-style: disc;
  }
  .reason-list li {
    margin: 0.35rem 0;
  }
  .reason-source {
    overflow-wrap: anywhere;
    color: var(--color-text-muted, #475569);
  }
  .change-group {
    margin-top: 0.75rem;
  }
  .change-group ul {
    padding-left: 1.2rem;
  }
  .action-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    align-items: start;
  }
  .action-grid :global(textarea) {
    width: 100%;
  }
  .action-grid form {
    display: grid;
    gap: 0.8rem;
  }
  .audit-details {
    padding: 0.8rem;
    border: 1px solid var(--color-border, #d7dee8);
    border-radius: 0.7rem;
  }
  .audit-details summary {
    cursor: pointer;
    font-weight: 650;
  }
  .audit-details code {
    overflow-wrap: anywhere;
  }
  dl {
    display: grid;
    grid-template-columns: minmax(10rem, auto) minmax(0, 1fr);
    gap: 0.5rem;
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .notice,
  .read-only-note {
    padding: 0.8rem 1rem;
    border-radius: 0.65rem;
    background: #fff7ed;
    color: #7c2d12;
  }
  .notice.success {
    background: #ecfdf5;
    color: #14532d;
  }
  .read-only-note {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    background: #eff6ff;
    color: #1e3a8a;
  }
  .empty,
  .subtle {
    color: var(--color-text-muted, #475569);
  }
  .button-link,
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.65rem;
    padding: 0.55rem 0.9rem;
    border: 1px solid var(--color-border-strong, #64748b);
    border-radius: 0.55rem;
    background: var(--color-primary, #164e63);
    color: white;
    text-decoration: none;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  @media (max-width: 48rem) {
    .workflow-case {
      padding: 1rem 0.75rem;
    }
    .summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .action-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .source-main,
    .record-topline,
    .case-heading {
      flex-direction: column;
    }
    dl {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
