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
  import { money as formatMoney } from '$lib/portal/portal-format';
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
  {#if standaloneActionMessage(locale, form)}
    <p class="action-message" role="alert">{standaloneActionMessage(locale, form)}</p>
  {/if}
  {#if data.canSubmitDraft}
    <section class="detail-panel record-detail-copy" aria-label={t('Draft actions')}>
      <form method="POST" action="?/submitExpense">
        <input type="hidden" name="id" value={String(record.id)} />
        <input type="hidden" name="version" value={Number(record.version)} />
        <button type="submit">{t('Submit')}</button>
      </form>
    </section>
  {/if}
  {#if data.canWithdrawCorrection}
    <section class="detail-panel record-detail-copy" aria-label={t('Withdraw correction draft')}>
      <form method="POST" action="?/withdrawCorrectionDraft" class="record-correction-withdraw">
        <input type="hidden" name="recordType" value="expense" />
        <input type="hidden" name="correctionId" value={String(record.id)} />
        <input type="hidden" name="version" value={Number(record.version)} />
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
      <CorrectionDraftForm
        recordType="expense"
        {record}
        translate={t}
        ownerOverride={data.user.role === 'owner_admin'}
        values={form?.values ?? {}}
        timeOptions={data.correctionTimeOptions}
        requestId={data.correctionRequestId}
      />
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
