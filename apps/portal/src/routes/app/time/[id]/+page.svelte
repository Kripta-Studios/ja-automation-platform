<script lang="ts">
  import PrintIcon from '$lib/portal/ui/PrintIcon.svelte';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneActionMessage,
    standaloneText,
  } from '../../standalone-locale';
  import CorrectionDraftForm from '$lib/portal/ui/CorrectionDraftForm.svelte';
  import type { PortalLocale } from '$lib/portal-i18n';
  import {
    translateControlledValue,
    type ControlledValueDomain,
  } from '$lib/i18n/controlled-values';
  type Row = Record<string, string | number | boolean | null>;
  let { data, form } = $props();
  let localeOverride = $state<PortalLocale | null>(null);
  const locale = $derived(
    localeOverride ?? data.locale ?? resolveStandaloneLocale($page.url.searchParams.get('lang')),
  );
  const t = (key: string): string => standaloneText(locale, key);
  const controlled = (domain: ControlledValueDomain, value: unknown): string =>
    translateControlledValue(
      locale,
      domain,
      value === null || value === undefined ? null : String(value),
    );
  const record = $derived(data.record as Row);
  const canAddRelatedExpense = $derived(
    !['rejected', 'void', 'needs_changes'].includes(String(record.approval_state)) &&
      (data.user?.role === 'owner_admin' ||
        data.user?.role === 'project_manager' ||
        (data.user?.role === 'worker' && String(record.worker_id) === String(data.user.id))),
  );
  const relatedExpenseHref = $derived.by(() => {
    const params = new URLSearchParams({
      project: String(record.project_id),
      worker: String(record.worker_id),
      date: String(record.work_date),
      timeEntry: String(record.id),
    });
    const language = $page.url.searchParams.get('lang');
    if (language) params.set('lang', language);
    return `${base}/app/expenses?${params.toString()}`;
  });
  const hours = (minutes: unknown) => {
    const actualMinutes = Number(minutes ?? 0);
    return `${Math.floor(actualMinutes / 60)} h ${actualMinutes % 60} min`;
  };
  const localMoment = (value: unknown): string => {
    if (!value) return t('Not submitted');
    const date = new Date(String(value));
    if (!Number.isFinite(date.valueOf())) return String(value);
    try {
      return new Intl.DateTimeFormat(
        locale === 'es' ? 'es-ES' : locale === 'pt' ? 'pt-BR' : 'en-GB',
        {
          timeZone: String(record.project_timezone || 'UTC'),
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short',
        },
      ).format(date);
    } catch {
      return String(value);
    }
  };
  function printReport(): void {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.print();
  }
  onMount(() => {
    localeOverride = resolveStandaloneLocale($page.url.searchParams.get('lang'), data.locale);
    persistStandaloneLocale(locale);
    applyStandaloneDocumentLocale(locale);
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'ja.portal.locale' || event.key === 'ja-portal-locale')
        localeOverride = resolveStandaloneLocale(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  });
  $effect(() => applyStandaloneDocumentLocale(locale));
</script>

<svelte:head><title>{t('Time entry')} | {record.project_number}</title></svelte:head>
<main class="record-detail-page">
  <nav class="detail-nav">
    <a href={base + '/app/time'} data-origin-back>← {t('Time')}</a>
    {#if !data.user?.workforceProfile}<a href={base + '/app/projects/' + String(record.project_id)}
        >{t('Open project')}</a
      >{/if}
    {#if canAddRelatedExpense}
      <a href={relatedExpenseHref}>{t('Add related expense')}</a>
    {/if}
    <button type="button" class="no-print print-trigger" onclick={printReport}>
      <PrintIcon />
      {t('Print Report')}
    </button>
  </nav>
  <header class="record-detail-header">
    <div>
      <span class="portal-kicker">{t('TIME ENTRY · SOURCE RECORD')}</span>
      <h1>{record.project_number} · {record.work_date}</h1>
      <p>{record.project_name} · {record.worker_name}</p>
    </div>
    <span class="state-tag">{controlled('status', record.approval_state)}</span>
  </header>
  {#if data.ownDraft}
    <section class="detail-panel record-detail-copy" aria-label={t('Edit draft')}>
      {#if data.ownDraft.can_edit === 1}
        <a
          class="primary-button"
          href={`${base}/app/time?edit=${encodeURIComponent(String(record.id))}`}
          >{t('Edit draft')} →</a
        >
      {/if}
      <form method="POST" action="?/submitTime">
        <input type="hidden" name="id" value={String(record.id)} />
        <input type="hidden" name="version" value={data.ownDraft.version} />
        <button type="submit">{t('Submit')}</button>
      </form>
      {#if data.ownDraft.can_delete === 1}
        <form
          method="POST"
          action={`${base}/app/time?/deleteDraft`}
          onsubmit={(event) => {
            if (!window.confirm(t('Delete this draft?'))) event.preventDefault();
          }}
        >
          <input type="hidden" name="recordType" value="time_entry" />
          <input type="hidden" name="recordId" value={String(record.id)} />
          <input type="hidden" name="version" value={data.ownDraft.version} />
          <button type="submit" class="destructive-button">{t('Delete draft')}</button>
        </form>
      {/if}
    </section>
  {/if}
  {#if data.canWithdrawCorrection}
    <section class="detail-panel record-detail-copy" aria-label={t('Withdraw correction draft')}>
      <form method="POST" action="?/withdrawCorrectionDraft" class="record-correction-withdraw">
        <input type="hidden" name="recordType" value="time_entry" />
        <input type="hidden" name="correctionId" value={String(record.id)} />
        <input type="hidden" name="version" value={data.withdrawVersion} />
        <label
          ><span>{t('Why withdraw this draft?')}</span><input
            name="reason"
            minlength="3"
            required
          /></label
        >
        <button type="submit" class="destructive-button">{t('Withdraw correction draft')}</button>
      </form>
    </section>
  {/if}
  {#if ['needs_changes', 'rejected'].includes(String(record.approval_state))}
    <section class="detail-panel record-detail-copy" aria-labelledby="time-review-title">
      <h2 id="time-review-title">{t('Review outcome')}</h2>
      <p>
        <strong>{t('Review reason')}:</strong>
        {record.review_reason || t('No review reason was recorded.')}
      </p>
      {#if record.active_correction_id}
        <p>
          {t('An existing correction is')}
          {controlled('status', record.active_correction_state)}.
        </p>
        <a href={`${base}/app/time/${encodeURIComponent(String(record.active_correction_id))}`}
          >{t('Open existing correction')} →</a
        >
      {:else if data.canCreateCorrection}
        <a href="#time-correction-title">{t('Create corrected draft')} →</a>
      {:else}
        <p>{t('The recorded worker must create a corrected draft from their Time register.')}</p>
      {/if}
    </section>
  {/if}
  {#if data.canCreateCorrection}
    <section class="detail-panel record-detail-copy" aria-labelledby="time-correction-title">
      <h2 id="time-correction-title">{t('Create corrected draft')}</h2>
      {#if standaloneActionMessage(locale, form)}
        <p role="alert">{standaloneActionMessage(locale, form)}</p>
      {/if}
      <CorrectionDraftForm
        recordType="time_entry"
        {record}
        translate={t}
        ownerOverride={data.user.role === 'owner_admin'}
        values={form?.values ?? {}}
        requestId={data.correctionRequestId}
      />
    </section>
  {/if}
  <section class="record-detail-grid">
    <article><span>{t('ACTUAL TIME')}</span><strong>{hours(record.minutes)}</strong></article>
    <article>
      <span>{t('CATEGORY')}</span><strong>{controlled('timeCategory', record.category)}</strong>
    </article>
    {#if 'billability_state' in record}
      <article>
        <span>{t('BILLABILITY')}</span><strong
          >{controlled('status', record.billability_state ?? 'pending')}</strong
        >
      </article>
    {/if}
    <article>
      <span>{t('SITE')}</span><strong>{record.site ?? record.site_name ?? '—'}</strong>
    </article>
  </section>
  <section class="detail-panel record-detail-copy">
    <div class="panel-title">
      <h2>{t('Activity summary')}</h2>
      <span>{record.activity_code ?? t('No code')}</span>
    </div>
    <p>{record.activity_summary ?? t('No activity summary was recorded.')}</p>
    <dl class="record-facts">
      <div>
        <dt>{t('Project timezone')}</dt>
        <dd>{record.project_timezone ?? '—'}</dd>
      </div>
      <div>
        <dt>{t('Shift window')}</dt>
        <dd>{record.start_time ?? '—'} → {record.end_time ?? '—'}</dd>
      </div>
      <div>
        <dt>{t('Break')}</dt>
        <dd>{record.break_minutes ? String(record.break_minutes) + ' min' : '—'}</dd>
      </div>
      <div>
        <dt>{t('Submitted')}</dt>
        <dd>{record.submitted_at ? localMoment(record.submitted_at) : t('Not submitted')}</dd>
      </div>
      <div>
        <dt>{t('Approved')}</dt>
        <dd>{record.approved_at ? localMoment(record.approved_at) : t('Not approved')}</dd>
      </div>
    </dl>
  </section>
  <section class="detail-panel record-detail-copy">
    <div class="panel-title"><h2>{t('Related reports')}</h2></div>
    {#if data.relatedReports?.length}
      <ul>
        {#each data.relatedReports as report}
          <li>
            <a href={`${base}/app/reports/${report.id}`}
              >{t(report.type === 'technical' ? 'Technical report' : 'Daily report')}</a
            >
            · {controlled('status', report.status)}
          </li>
        {/each}
      </ul>
    {:else}
      <p>{t('No related reports yet.')}</p>
    {/if}
    <a
      href={`${base}/app/reports?project=${encodeURIComponent(String(record.project_id))}&from=${encodeURIComponent(String(record.work_date))}&to=${encodeURIComponent(String(record.work_date))}`}
      >{t('View project reports')}</a
    >
  </section>
</main>
