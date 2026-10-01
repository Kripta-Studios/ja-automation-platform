<script lang="ts">
  import DirectionIcon from '$lib/portal/ui/DirectionIcon.svelte';
  import PrintIcon from '$lib/portal/ui/PrintIcon.svelte';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount, tick } from 'svelte';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneActionMessage,
    standaloneText,
  } from '../../standalone-locale';
  import CorrectionDraftForm from '$lib/portal/ui/CorrectionDraftForm.svelte';
  import ProblemNotice from '$lib/portal/ui/ProblemNotice.svelte';
  import formValidation, { reportFormFieldErrors } from '$lib/portal/ui/form-validation';
  import type { ProblemData } from '$lib/problem/contract';
  import type { PortalLocale } from '$lib/portal-i18n';
  import {
    translateControlledValue,
    type ControlledValueDomain,
  } from '$lib/i18n/controlled-values';
  type Row = Record<string, string | number | boolean | null>;
  let { data, form } = $props();
  const detailForm = $derived(form as (Partial<ProblemData> & { success?: boolean }) | null);
  const problem = $derived(
    detailForm?.success === false &&
      detailForm.code &&
      detailForm.messageKey &&
      detailForm.correlationId
      ? (detailForm as ProblemData)
      : null,
  );
  const withdrawProblem = $derived(form?.actionName === 'withdrawCorrectionDraft' ? problem : null);
  const withdrawalNeedsReview = $derived(
    Boolean(data.withdrawWarning) ||
      (withdrawProblem &&
        ![
          'CORRECTION_WITHDRAW_REASON_INVALID',
          'TIME_CORRECTION_WITHDRAW_REASON_INVALID',
          'TIME_CORRECTION_WITHDRAW_REASON_TOO_LONG',
        ].includes(withdrawProblem.code)),
  );
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
  const retainedCorrectionValues = $derived.by(() => {
    if (
      data.canCreateCorrection ||
      form?.actionName !== 'createCorrectionDraft' ||
      !problem?.code?.startsWith('TIME_CORRECTION_')
    )
      return [];
    const values = form?.values as Record<string, unknown> | undefined;
    if (!values) return [];
    const fields = [
      ['workDate', 'Date'],
      ['category', 'Operational category'],
      ['minutes', 'Actual minutes'],
      ['startTime', 'Start time'],
      ['endTime', 'End time'],
      ['breakMinutes', 'Break'],
      ['site', 'Site'],
      ['activityCode', 'Operational detail'],
      ['activitySummary', 'Activity summary'],
      ['reason', 'Correction reason'],
    ] as const;
    return fields.flatMap(([name, label]) => {
      const value = values[name];
      if (typeof value !== 'string' || !value.trim()) return [];
      return [
        { label: t(label), value: name === 'category' ? controlled('timeCategory', value) : value },
      ];
    });
  });
  const recordHref = $derived(`${base}/app/time/${encodeURIComponent(String(record.id))}`);
  const submissionBlocked = $derived(
    ['TIME_SUBMISSION_CHANGED', 'TIME_SUBMISSION_NOT_DRAFT', 'TIME_SUBMISSION_LOCKED'].includes(
      problem?.code ?? '',
    ),
  );
  const statusForDisplay = $derived(
    problem?.code === 'TIME_SUBMISSION_NOT_DRAFT' && typeof problem.params.status === 'string'
      ? problem.params.status
      : record.approval_state,
  );
  const linkedExpenseId = $derived(
    problem?.remedies.find((remedy) => remedy.id === 'review_linked_expense')?.recordId ??
      data.withdrawWarning?.remedies.find(
        (remedy: { id: string }) => remedy.id === 'review_linked_expense',
      )?.recordId,
  );
  const linkedReportId = $derived(
    problem?.remedies.find((remedy) => remedy.id === 'review_linked_report')?.recordId ??
      data.withdrawWarning?.remedies.find(
        (remedy: { id: string }) => remedy.id === 'review_linked_report',
      )?.recordId,
  );
  const remedyLinks = $derived({
    review_time: { label: t('Review updated time entry'), href: recordHref, reload: true },
    review_week: { label: t('problem.remedy.reviewTimeDrafts'), href: `${base}/app/time` },
    contact_finance: { label: t('Contact Finance for an audited adjustment.') },
    contact_project_owner: { label: t('problem.remedy.contactProjectOwner') },
    contact_owner: { label: t('problem.remedy.contactProjectOwner') },
    sign_in_again: { label: t('problem.remedy.signInAgain'), href: `${base}/app/login` },
    enter_reason: {
      label: t('problem.remedy.enterReason'),
      href:
        form?.actionName === 'createCorrectionDraft'
          ? '#correction-draft-reason'
          : '#time-withdraw-reason',
    },
    ...(linkedExpenseId
      ? {
          review_linked_expense: {
            label: t('Review linked expense'),
            href: `${base}/app/expenses/${encodeURIComponent(linkedExpenseId)}?lang=${locale}`,
          },
        }
      : {}),
    ...(linkedReportId
      ? {
          review_linked_report: {
            label: t('Review linked report'),
            href: `${base}/app/reports/${encodeURIComponent(linkedReportId)}?lang=${locale}`,
          },
        }
      : {}),
  });
  const scrollKey = $derived(`ja:time-detail-scroll:${String(record.id)}`);
  function rememberScroll(): void {
    try {
      sessionStorage.setItem(scrollKey, JSON.stringify({ top: scrollY, at: Date.now() }));
    } catch {
      // The error notice remains usable when session storage is unavailable.
    }
  }
  function restoreScroll(): void {
    try {
      const saved = sessionStorage.getItem(scrollKey);
      sessionStorage.removeItem(scrollKey);
      if (!saved) return;
      const value = JSON.parse(saved) as { top?: unknown; at?: unknown };
      if (
        typeof value.top === 'number' &&
        Number.isFinite(value.top) &&
        typeof value.at === 'number' &&
        Date.now() - value.at < 300_000
      )
        scrollTo({ top: value.top, behavior: 'instant' });
    } catch {
      // A malformed position never hides the failure notice.
    }
  }
  let focusedProblemId = '';
  $effect(() => {
    const id = problem?.correlationId;
    if (!id || id === focusedProblemId) return;
    focusedProblemId = id;
    void tick().then(() => {
      const withdrawForm = document.querySelector<HTMLFormElement>(
        'form.record-correction-withdraw',
      );
      if (withdrawProblem && withdrawForm)
        reportFormFieldErrors(withdrawForm, withdrawProblem.fieldErrors);
      const correctionForm = document.querySelector<HTMLFormElement>(
        'form[data-correction-draft-form]',
      );
      if (form?.actionName === 'createCorrectionDraft' && problem && correctionForm)
        reportFormFieldErrors(correctionForm, problem.fieldErrors);
      const notice = document.querySelector<HTMLElement>(
        '[data-time-detail-problem] [data-ui="problem-notice"]',
      );
      if (!notice) return;
      restoreScroll();
      notice.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        const bounds = notice.getBoundingClientRect();
        const headerBottom =
          document.querySelector('.portal-layout > header')?.getBoundingClientRect().bottom ?? 0;
        if (bounds.top < headerBottom + 8 || bounds.bottom > innerHeight)
          notice.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      });
    });
  });
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
    return `${String(Number((actualMinutes / 60).toFixed(4)))} h`;
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
    <a href={base + '/app/time'} data-origin-back><DirectionIcon direction="left" /> {t('Time')}</a>
    {#if !data.user?.workforceProfile}<a href={base + '/app/projects/' + String(record.project_id)}
        >{t('Open project')}</a
      >{/if}
    {#if record.approval_state === 'submitted' && ['owner_admin', 'project_manager'].includes(data.user?.role ?? '')}
      <a
        class="no-print"
        href={`${base}/app/approvals?project=${encodeURIComponent(String(record.project_id))}&tab=time&status=submitted&q=&lang=${encodeURIComponent(locale)}`}
        >{t('Review in approvals')}</a
      >
    {/if}
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
    <span class="state-tag">{controlled('status', statusForDisplay)}</span>
  </header>
  {#if problem && (!withdrawProblem || !data.canWithdrawCorrection)}
    <div data-time-detail-problem>
      <ProblemNotice
        {problem}
        kind={problem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
        status={`${t('Status')}: ${controlled('status', statusForDisplay)}`}
        {remedyLinks}
      />
    </div>
    {#if withdrawProblem && !data.canWithdrawCorrection && form?.values?.reason}
      <p><strong>{t('Withdrawal reason you entered')}:</strong> {form.values.reason}</p>
    {/if}
  {:else if !problem && standaloneActionMessage(locale, form)}
    <p class="action-message" role="alert">{standaloneActionMessage(locale, form)}</p>
  {/if}
  {#if data.correctionOrigin}
    <section class="detail-panel record-detail-copy" aria-labelledby="time-correction-origin-title">
      <h2 id="time-correction-origin-title">
        <span class="state-tag">{t('Corrected time entry')}</span>
      </h2>
      <p><strong>{t('Correction reason')}:</strong> {data.correctionOrigin.reason}</p>
      <a
        href={`${base}/app/time/${encodeURIComponent(data.correctionOrigin.id)}?lang=${encodeURIComponent(locale)}`}
        >{t('Open original time entry')} <DirectionIcon /></a
      >
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
        <dd>
          {record.break_minutes === null || record.break_minutes === undefined
            ? '—'
            : hours(record.break_minutes)}
        </dd>
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
  {#if data.activeCorrection}
    <section class="detail-panel record-detail-copy" aria-label={t('Open existing correction')}>
      <p>
        {t('An existing correction is')}
        {controlled('status', data.activeCorrection.status)}.
      </p>
      <a
        href={`${base}/app/time/${encodeURIComponent(data.activeCorrection.id)}?lang=${encodeURIComponent(locale)}`}
        >{t('Open existing correction')} <DirectionIcon /></a
      >
    </section>
  {/if}
  {#if data.ownDraft}
    <section class="detail-panel record-detail-copy" aria-label={t('Edit draft')}>
      {#if data.ownDraft.can_edit === 1}
        <a
          class="primary-button"
          href={`${base}/app/time?edit=${encodeURIComponent(String(record.id))}`}
          >{t('Edit draft')} <DirectionIcon /></a
        >
      {/if}
      {#if !submissionBlocked}
        <form method="POST" action="?/submitTime" onsubmit={rememberScroll}>
          <input type="hidden" name="id" value={String(record.id)} />
          <input type="hidden" name="version" value={data.ownDraft.version} />
          <button type="submit">{t('Submit')}</button>
        </form>
      {/if}
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
      {#if withdrawProblem}
        <div data-time-detail-problem>
          <ProblemNotice
            problem={withdrawProblem}
            kind={withdrawProblem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
            status={`${t('Status')}: ${controlled('status', statusForDisplay)}`}
            {remedyLinks}
          />
        </div>
      {:else if data.withdrawWarning}
        <ProblemNotice
          problem={data.withdrawWarning}
          kind="warning"
          status={`${t('Status')}: ${controlled('status', record.approval_state)}`}
          {remedyLinks}
        />
      {/if}
      {#if withdrawalNeedsReview}
        {#if withdrawProblem && form?.values?.reason}
          <p><strong>{t('Withdrawal reason you entered')}:</strong> {form.values.reason}</p>
        {/if}
      {:else}
        <form
          method="POST"
          action="?/withdrawCorrectionDraft"
          class="record-correction-withdraw"
          use:formValidation
        >
          <input type="hidden" name="recordType" value="time_entry" />
          <input type="hidden" name="correctionId" value={String(record.id)} />
          <input type="hidden" name="version" value={data.withdrawVersion} />
          <label
            ><span>{t('Why withdraw this draft?')}</span><input
              id="time-withdraw-reason"
              name="reason"
              value={withdrawProblem ? String(form?.values?.reason ?? '') : ''}
              minlength="3"
              maxlength="2000"
              required
            /></label
          >
          <button type="submit" class="destructive-button">{t('Withdraw correction draft')}</button>
        </form>
      {/if}
    </section>
  {/if}
  {#if ['needs_changes', 'rejected'].includes(String(record.approval_state))}
    <section class="detail-panel record-detail-copy" aria-labelledby="time-review-title">
      <h2 id="time-review-title">{t('Review outcome')}</h2>
      <p>
        <strong>{t('Review reason')}:</strong>
        {record.review_reason || t('No review reason was recorded.')}
      </p>
      {#if !data.activeCorrection && data.canCreateCorrection}
        <a href="#time-correction-title">{t('Create corrected draft')} <DirectionIcon /></a>
      {:else if !data.activeCorrection}
        <p>{t('The recorded worker must create a corrected draft from their Time register.')}</p>
      {/if}
    </section>
  {/if}
  {#if data.canCreateCorrection}
    <section class="detail-panel record-detail-copy" aria-labelledby="time-correction-title">
      <h2 id="time-correction-title">{t('Create corrected draft')}</h2>
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
  {#if retainedCorrectionValues.length}
    <section
      class="detail-panel record-detail-copy"
      aria-labelledby="time-correction-retained-title"
    >
      <h2 id="time-correction-retained-title">{t('problem.time.correctionValuesRetained')}</h2>
      <dl class="record-facts">
        {#each retainedCorrectionValues as item}
          <div>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        {/each}
      </dl>
    </section>
  {/if}
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
