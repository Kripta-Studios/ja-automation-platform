<script lang="ts">
  import PrintIcon from '$lib/portal/ui/PrintIcon.svelte';
  import { base } from '$app/paths';
  import { enhance, type SubmitFunction } from '$app/forms';
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
  import { money as formatMoney } from '$lib/portal/portal-format';
  import {
    translateControlledValue,
    type ControlledValueDomain,
  } from '$lib/i18n/controlled-values';
  type Row = Record<string, string | number | boolean | null>;
  let { data, form } = $props();
  type DetailForm = Partial<ProblemData> & {
    actionName?: 'createCorrectionDraft' | 'withdrawCorrectionDraft' | 'submitExpense';
    values?: Record<string, string>;
    success?: boolean;
  };
  const detailForm = $derived(form as DetailForm | null | undefined);
  const problem = $derived(
    detailForm?.success === false &&
      detailForm.code &&
      detailForm.messageKey &&
      detailForm.correlationId
      ? (detailForm as ProblemData)
      : null,
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
  const recordHref = $derived(`${base}/app/expenses/${encodeURIComponent(String(record.id))}`);
  const remedyLinks = $derived({
    review_expense: {
      label: t('problem.remedy.reviewExpense'),
      href:
        problem?.code === 'EXPENSE_CORRECTION_ALREADY_EXISTS' && record.active_correction_id
          ? `${base}/app/expenses/${encodeURIComponent(String(record.active_correction_id))}`
          : recordHref,
    },
    review_expenses: { label: t('problem.remedy.reviewExpenses'), href: `${base}/app/expenses` },
    review_expense_fields: data.canCreateCorrection
      ? { label: t('problem.remedy.reviewExpenseFields'), href: '#expense-correction-title' }
      : { label: t('problem.remedy.reviewExpense') },
    review_time: record.time_entry_id
      ? {
          label: t('Review logged hours'),
          href: `${base}/app/time/${encodeURIComponent(String(record.time_entry_id))}`,
        }
      : { label: t('Review logged hours') },
    attach_receipt: { label: t('Reattach the receipt before saving again.') },
    contact_project_owner: { label: t('problem.remedy.contactProjectOwner') },
    contact_finance: { label: t('Contact Finance for an audited adjustment.') },
    enter_reason: {
      label: t('problem.remedy.enterReason'),
      href:
        detailForm?.actionName === 'withdrawCorrectionDraft' && data.canWithdrawCorrection
          ? '#expense-withdraw-reason'
          : data.canCreateCorrection
            ? '#expense-correction-title'
            : undefined,
    },
    sign_in_again: { label: t('problem.remedy.signInAgain'), href: `${base}/app/login` },
  });
  const retainedCorrectionValues = $derived(
    detailForm?.actionName === 'createCorrectionDraft' && !data.canCreateCorrection
      ? (
          [
            ['vendor', 'Vendor'],
            ['spentOn', 'Date'],
            ['description', 'Description'],
            ['category', 'Category'],
            ['amount', 'Amount'],
            ['occurredTimeLocal', 'Time expense occurred'],
            ['paymentMethod', 'Payment method'],
            ['timeEntryId', 'Related logged hours'],
            ['reason', 'Correction reason'],
          ] as const
        ).flatMap(([name, label]) =>
          typeof detailForm.values?.[name] === 'string'
            ? [{ label: t(label), value: detailForm.values[name] }]
            : [],
        )
      : [],
  );
  const retainedWithdrawReason = $derived(
    detailForm?.actionName === 'withdrawCorrectionDraft' && !data.canWithdrawCorrection
      ? (detailForm.values?.reason ?? '')
      : '',
  );
  const scrollKey = $derived(`expense-detail-scroll:${String(data.user.id)}:${String(record.id)}`);
  function rememberScroll(): void {
    sessionStorage.setItem(scrollKey, JSON.stringify({ top: window.scrollY, at: Date.now() }));
  }
  function restoreScroll(): void {
    const saved = sessionStorage.getItem(scrollKey);
    if (!saved) return;
    sessionStorage.removeItem(scrollKey);
    try {
      const value = JSON.parse(saved) as { top?: unknown; at?: unknown };
      if (
        typeof value.top === 'number' &&
        Number.isFinite(value.top) &&
        typeof value.at === 'number' &&
        Date.now() - value.at < 300_000
      )
        window.scrollTo({ top: value.top, behavior: 'instant' });
    } catch {
      // A malformed saved position does not hide the failure notice.
    }
  }
  const enhancedSubmit: SubmitFunction = () => {
    rememberScroll();
    return async ({ result, update }) => {
      await update({ reset: false, invalidateAll: true });
      if (result.type === 'failure') {
        await tick();
        restoreScroll();
      }
    };
  };
  let focusedProblemId = '';
  $effect(() => {
    const id = problem?.correlationId;
    if (!id || id === focusedProblemId) return;
    focusedProblemId = id;
    void tick().then(() => {
      const action = detailForm?.actionName;
      const targetForm =
        action === 'createCorrectionDraft'
          ? document.querySelector<HTMLFormElement>('form[data-correction-draft-form]')
          : action
            ? document.querySelector<HTMLFormElement>(
                `form[data-expense-detail-action="${action}"]`,
              )
            : null;
      if (targetForm && problem?.fieldErrors)
        reportFormFieldErrors(targetForm, problem.fieldErrors);
      const target =
        targetForm?.querySelector<HTMLElement>('[data-validation-summary]') ??
        document.querySelector<HTMLElement>(
          '[data-expense-detail-problem] [data-ui="problem-notice"]',
        );
      target?.focus({ preventScroll: true });
    });
  });
  const restrictedOperational = $derived(Boolean(data.user?.workforceProfile));
  const canViewFinance = $derived(
    !restrictedOperational && ['owner_admin', 'finance_admin'].includes(String(data.user?.role)),
  );
  const canViewOwnReimbursement = $derived(
    !restrictedOperational &&
      (canViewFinance ||
        (data.user?.role === 'worker' && String(record.worker_id) === String(data.user?.id))),
  );
  const money = (minor: unknown, currency: string) =>
    formatMoney(minor, currency, locale === 'pt' ? 'pt-BR' : locale);
  function printReport(): void {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.print();
  }
  onMount(() => {
    window.addEventListener('pagehide', rememberScroll);
    const correctionForm = document.querySelector<HTMLFormElement>(
      'form[data-correction-draft-form]',
    );
    const correctionValidation = correctionForm ? formValidation(correctionForm) : null;
    const correctionEnhancement = correctionForm ? enhance(correctionForm, enhancedSubmit) : null;
    if (problem) void tick().then(restoreScroll);
    localeOverride = resolveStandaloneLocale($page.url.searchParams.get('lang'), data.locale);
    persistStandaloneLocale(locale);
    applyStandaloneDocumentLocale(locale);
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'ja.portal.locale' || event.key === 'ja-portal-locale')
        localeOverride = resolveStandaloneLocale(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', rememberScroll);
      correctionValidation?.destroy();
      correctionEnhancement?.destroy();
    };
  });
  $effect(() => applyStandaloneDocumentLocale(locale));
</script>

<svelte:head><title>{t('Expense')} | {record.project_number}</title></svelte:head>
<main class="record-detail-page">
  <nav class="detail-nav">
    <a href={base + '/app/expenses'} data-origin-back>← {t('Expenses')}</a>
    <a href={base + '/app/projects/' + String(record.project_id)}>{t('Open project')}</a>
    <button type="button" class="no-print print-trigger" onclick={printReport}>
      <PrintIcon />
      {t('Print Report')}
    </button>
  </nav>
  <header class="record-detail-header">
    <div>
      <span class="portal-kicker">{t('EXPENSE · SOURCE RECORD')}</span>
      <h1>
        {record.vendor || record.description || controlled('expenseCategory', record.category)}
      </h1>
      <p>{record.project_number} · {record.project_name} · {record.spent_on}</p>
    </div>
    <span class="state-tag">{controlled('status', record.approval_state)}</span>
  </header>
  {#if problem}
    <div data-expense-detail-problem>
      <ProblemNotice
        {problem}
        kind={problem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
        status={`${t('Status')}: ${controlled('status', record.approval_state)}`}
        {remedyLinks}
      />
    </div>
  {:else if standaloneActionMessage(locale, form)}
    <p class="action-message" role="alert">{standaloneActionMessage(locale, form)}</p>
  {/if}
  {#if retainedCorrectionValues.length}
    <section
      class="detail-panel record-detail-copy"
      aria-labelledby="expense-retained-values-title"
    >
      <h2 id="expense-retained-values-title">{t('problem.expenseDetail.retainedValuesTitle')}</h2>
      <p>{t('problem.expenseDetail.retainedValuesHelp')}</p>
      <dl class="record-facts">
        {#each retainedCorrectionValues as item (item.label)}
          <div>
            <dt>{item.label}</dt>
            <dd>{item.value || '—'}</dd>
          </div>
        {/each}
      </dl>
    </section>
  {/if}
  {#if retainedWithdrawReason}
    <p class="detail-panel record-detail-copy">
      <strong>{t('problem.expenseDetail.retainedReason')}:</strong>
      {retainedWithdrawReason}
    </p>
  {/if}
  {#if data.canSubmitDraft}
    <section class="detail-panel record-detail-copy" aria-label={t('Draft actions')}>
      <form
        method="POST"
        action="?/submitExpense"
        data-expense-detail-action="submitExpense"
        use:formValidation
        use:enhance={enhancedSubmit}
      >
        <input type="hidden" name="id" value={String(record.id)} />
        <input type="hidden" name="version" value={Number(record.version)} />
        <button type="submit">{t('Submit')}</button>
      </form>
    </section>
  {/if}
  {#if data.canWithdrawCorrection}
    <section class="detail-panel record-detail-copy" aria-label={t('Withdraw correction draft')}>
      <form
        method="POST"
        action="?/withdrawCorrectionDraft"
        class="record-correction-withdraw"
        data-expense-detail-action="withdrawCorrectionDraft"
        use:formValidation
        use:enhance={enhancedSubmit}
      >
        <input type="hidden" name="recordType" value="expense" />
        <input type="hidden" name="correctionId" value={String(record.id)} />
        <input type="hidden" name="version" value={Number(record.version)} />
        <label
          ><span>{t('Why withdraw this draft?')}</span><input
            id="expense-withdraw-reason"
            name="reason"
            minlength="3"
            maxlength="2000"
            required
            value={detailForm?.actionName === 'withdrawCorrectionDraft'
              ? (detailForm.values?.reason ?? '')
              : ''}
          /></label
        >
        <button type="submit" class="destructive-button">{t('Withdraw correction draft')}</button>
      </form>
    </section>
  {/if}
  {#if ['needs_changes', 'rejected'].includes(String(record.approval_state))}
    <section class="detail-panel record-detail-copy" aria-labelledby="expense-review-title">
      <h2 id="expense-review-title">{t('Review outcome')}</h2>
      <p>
        <strong>{t('Review reason')}:</strong>
        {record.review_reason || t('No review reason was recorded.')}
      </p>
      {#if record.active_correction_id}
        <p>
          {t('An existing correction is')}
          {controlled('status', record.active_correction_state)}.
        </p>
        <a href={`${base}/app/expenses/${encodeURIComponent(String(record.active_correction_id))}`}
          >{t('Open existing correction')} →</a
        >
      {:else if data.canCreateCorrection}
        <a href="#expense-correction-title">{t('Create corrected draft')} →</a>
      {:else if record.approval_state === 'rejected'}
        <p>
          {t(
            'A rejected expense cannot be corrected. Create a new expense if the cost should be recorded.',
          )}
        </p>
        {#if data.user?.role === 'owner_admin' || (data.user?.role === 'worker' && String(record.worker_id) === String(data.user?.id))}
          <a
            href={`${base}/app/expenses?project=${encodeURIComponent(String(record.project_id))}&date=${encodeURIComponent(String(record.spent_on))}`}
            >{t('Add expense')} →</a
          >
        {/if}
      {:else}
        <p>
          {t('The recorded worker must create a corrected draft from their Expenses register.')}
        </p>
      {/if}
    </section>
  {/if}
  {#if data.canCreateCorrection}
    <section class="detail-panel record-detail-copy" aria-labelledby="expense-correction-title">
      <h2 id="expense-correction-title">{t('Create corrected draft')}</h2>
      <div data-expense-detail-action="createCorrectionDraft">
        <CorrectionDraftForm
          recordType="expense"
          {record}
          translate={t}
          ownerOverride={data.user.role === 'owner_admin'}
          values={detailForm?.actionName === 'createCorrectionDraft'
            ? (detailForm.values ?? {})
            : {}}
          timeOptions={data.correctionTimeOptions}
          requestId={detailForm?.actionName === 'createCorrectionDraft'
            ? (detailForm.values?.requestId ?? data.correctionRequestId)
            : data.correctionRequestId}
        />
      </div>
    </section>
  {/if}
  <section class="record-detail-grid">
    <article>
      <span>{t('AMOUNT')}</span><strong
        >{money(record.amount_minor, String(record.currency))}</strong
      >
    </article>
    <article>
      <span>{t('CATEGORY')}</span><strong>{controlled('expenseCategory', record.category)}</strong>
    </article>
    {#if canViewFinance}
      <article>
        <span>{t('CLIENT TREATMENT')}</span><strong
          >{controlled('billingStream', record.client_treatment)}</strong
        >
      </article>
    {/if}
    {#if canViewOwnReimbursement && record.reimbursement_state}
      <article>
        <span>{t('REIMBURSEMENT')}</span><strong
          >{controlled('status', record.reimbursement_state)}</strong
        >
      </article>
    {/if}
  </section>
  <section class="detail-panel record-detail-copy">
    <div class="panel-title">
      <h2>{t('Expense details')}</h2>
      <span>{record.who_paid ? controlled('role', record.who_paid) : t('worker paid')}</span>
    </div>
    <p>{record.description ?? t('No description was recorded.')}</p>
    <dl class="record-facts">
      <div>
        <dt>{t('Vendor')}</dt>
        <dd>{record.vendor || '—'}</dd>
      </div>
      <div>
        <dt>{t('Time expense occurred')}</dt>
        <dd>{record.occurred_time_local ?? '—'}</dd>
      </div>
      <div>
        <dt>{t('Related logged hours')}</dt>
        <dd>
          {#if record.time_entry_id}
            <a
              href={base +
                (data.user?.role === 'worker' && String(record.worker_id) !== String(data.user?.id)
                  ? '/app/crew/time/'
                  : '/app/time/') +
                String(record.time_entry_id)}>{t('Open time record')}</a
            >
          {:else}
            —
          {/if}
        </dd>
      </div>
      <div>
        <dt>{t('Payment method')}</dt>
        <dd>{record.payment_method ?? '—'}</dd>
      </div>
      {#if canViewFinance}
        <div>
          <dt>{t('Billing treatment')}</dt>
          <dd>{controlled('billingStream', record.billing_treatment ?? 'internal')}</dd>
        </div>
        <div>
          <dt>{t('Project-currency amount')}</dt>
          <dd>
            {money(
              record.project_currency_amount_minor ?? record.amount_minor,
              String(record.project_currency ?? record.currency),
            )}
          </dd>
        </div>
      {/if}
      <div>
        <dt>{t('Receipt')}</dt>
        <dd>
          {record.receipt_document_id ? t('Registered private receipt') : t('No receipt linked')}
        </dd>
      </div>
    </dl>
    {#if record.receipt_document_id}
      <a
        class="preview-link"
        target="_blank"
        href={base + '/app/api/documents/' + String(record.receipt_document_id) + '?view=1'}
        >{t('Open private receipt')}</a
      >
    {/if}
  </section>
</main>
