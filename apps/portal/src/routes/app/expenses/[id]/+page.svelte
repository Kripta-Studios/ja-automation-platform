<script lang="ts">
  import DirectionIcon from '$lib/portal/ui/DirectionIcon.svelte';
  import PrintIcon from '$lib/portal/ui/PrintIcon.svelte';
  import { base } from '$app/paths';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { page } from '$app/stores';
  import { beforeNavigate } from '$app/navigation';
  import { confirmDirtyForms, dirtyFormGuard } from '$lib/portal/dirty-form-guard';
  import { onMount, tick, untrack } from 'svelte';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneActionMessage,
    standaloneText,
  } from '../../standalone-locale';
  import CorrectionDraftForm from '$lib/portal/ui/CorrectionDraftForm.svelte';
  import ProblemNotice from '$lib/portal/ui/ProblemNotice.svelte';
  import {
    documentDownloadFallback,
    documentDownloadProblem,
    privateDownloadFilename,
  } from '$lib/portal/ui/private-document-download';
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
    actionName?:
      | 'createCorrectionDraft'
      | 'withdrawCorrectionDraft'
      | 'withdrawCrewExpenseDraft'
      | 'submitExpense';
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
  let localeMounted = $state(false);
  const locale = $derived(
    $page.url.searchParams.has('lang')
      ? resolveStandaloneLocale($page.url.searchParams.get('lang'), data.locale)
      : (localeOverride ?? data.locale ?? resolveStandaloneLocale()),
  );
  const t = (key: string): string => standaloneText(locale, key);
  const controlled = (domain: ControlledValueDomain, value: unknown): string =>
    translateControlledValue(
      locale,
      domain,
      value === null || value === undefined ? null : String(value),
    );
  const record = $derived(data.record as Row);
  const canViewExpenseMoney = $derived(
    data.expenseMoneyVisible !== false && data.user?.role !== 'project_manager',
  );
  let pmCorrectionForm: HTMLFormElement | undefined = $state();
  beforeNavigate((navigation) => {
    if (
      navigation.to?.url.pathname === navigation.from?.url.pathname &&
      navigation.to?.url.search === navigation.from?.url.search
    )
      return;
    if (
      !navigation.willUnload &&
      !confirmDirtyForms(
        pmCorrectionForm,
        t('Discard your unsaved changes? Your entered information will be lost.'),
      )
    )
      navigation.cancel();
  });
  let pmRecordId = $state(untrack(() => String(record.id)));
  let pmVendor = $state(untrack(() => detailForm?.values?.vendor ?? String(record.vendor ?? '')));
  let pmSpentOn = $state(
    untrack(() => detailForm?.values?.spentOn ?? String(record.spent_on ?? '')),
  );
  let pmDescription = $state(
    untrack(() => detailForm?.values?.description ?? String(record.description ?? '')),
  );
  let pmCategory = $state(
    untrack(() => detailForm?.values?.category ?? String(record.category ?? 'other')),
  );
  let pmOccurredTime = $state(
    untrack(
      () => detailForm?.values?.occurredTimeLocal ?? String(record.occurred_time_local ?? ''),
    ),
  );
  let pmTimeEntryId = $state(
    untrack(() => detailForm?.values?.timeEntryId ?? String(record.time_entry_id ?? '')),
  );
  const pmCorrectionPatch = $derived.by(() => {
    const fields: Array<[string, string, string]> = [
      ['vendor', 'vendor', pmVendor],
      ['spentOn', 'spent_on', pmSpentOn],
      ['description', 'description', pmDescription],
      ['category', 'category', pmCategory],
      ['occurredTimeLocal', 'occurred_time_local', pmOccurredTime],
      ['timeEntryId', 'time_entry_id', pmTimeEntryId],
    ];
    return Object.fromEntries(
      fields.flatMap(([name, column, value]) => {
        const before = record[column] === '' ? null : (record[column] ?? null);
        const after = value === '' ? null : value;
        return before === after ? [] : [[name, after]];
      }),
    );
  });
  $effect(() => {
    if (pmRecordId === String(record.id)) return;
    pmRecordId = String(record.id);
    pmVendor = String(record.vendor ?? '');
    pmSpentOn = String(record.spent_on ?? '');
    pmDescription = String(record.description ?? '');
    pmCategory = String(record.category ?? 'other');
    pmOccurredTime = String(record.occurred_time_local ?? '');
    pmTimeEntryId = String(record.time_entry_id ?? '');
  });
  const recordHref = $derived(`${base}/app/expenses/${encodeURIComponent(String(record.id))}`);
  const receiptHref = $derived(
    `${base}/app/api/documents/${encodeURIComponent(String(record.receipt_document_id))}?view=1`,
  );
  const receiptMessageKeys: Readonly<Record<string, ProblemData['messageKey']>> = {
    DOCUMENT_DOWNLOAD_SIGN_IN_REQUIRED: 'problem.expenseReceipt.downloadSignInRequired',
    DOCUMENT_DOWNLOAD_UNAVAILABLE: 'problem.expenseReceipt.downloadUnavailable',
    DOCUMENT_DOWNLOAD_FILE_MISSING: 'problem.expenseReceipt.downloadFileMissing',
    DOCUMENT_DOWNLOAD_INTEGRITY_BLOCKED: 'problem.expenseReceipt.downloadIntegrityBlocked',
    DOCUMENT_DOWNLOAD_SERVICE_UNAVAILABLE: 'problem.expenseReceipt.downloadServiceUnavailable',
    DOCUMENT_DOWNLOAD_NETWORK_UNAVAILABLE: 'problem.expenseReceipt.downloadNetworkUnavailable',
    DOCUMENT_DOWNLOAD_INVALID_RESPONSE: 'problem.expenseReceipt.downloadInvalidResponse',
    DOCUMENT_PREVIEW_POPUP_BLOCKED: 'problem.expenseReceipt.previewBlocked',
  };
  const receiptFallbackMessages: Readonly<Record<string, string>> = {
    DOCUMENT_DOWNLOAD_SIGN_IN_REQUIRED:
      'Your session ended. Sign in again, then return to this expense to view its receipt.',
    DOCUMENT_DOWNLOAD_UNAVAILABLE:
      'This receipt is unavailable. Review the current expense before trying to view it again.',
    DOCUMENT_DOWNLOAD_FILE_MISSING:
      'The receipt file is missing. Ask the project owner to review this expense before trying again.',
    DOCUMENT_DOWNLOAD_INTEGRITY_BLOCKED:
      'The receipt could not be verified, so its preview was blocked. Ask the project owner to review it.',
    DOCUMENT_DOWNLOAD_SERVICE_UNAVAILABLE:
      'The receipt could not be opened. No expense was changed. Try viewing it later. Reference: {correlationId}.',
    DOCUMENT_DOWNLOAD_NETWORK_UNAVAILABLE:
      'The receipt could not be reached. No expense was changed. Check your connection and try View again.',
    DOCUMENT_DOWNLOAD_INVALID_RESPONSE:
      'The receipt response could not be verified. No expense was changed. Review this expense and try again.',
    DOCUMENT_PREVIEW_POPUP_BLOCKED:
      'Your browser blocked the receipt preview. Allow pop-ups for this site, then try View again.',
  };
  let receiptPreviewProblem = $state<ProblemData | null>(null);
  let receiptPreviewBusy = $state(false);
  let receiptPreviewController: AbortController | null = null;
  let receiptPreviewWindow: Window | null = null;
  let receiptPreviewObjectUrls: { url: string; timer: number }[] = [];
  let receiptPreviewDisposed = false;
  const receiptRemedyLinks = $derived({
    sign_in_again: { label: t('problem.remedy.signInAgain'), href: `${base}/app/login` },
    review_documents: {
      label: t('problem.remedy.reviewExpense'),
      href: recordHref,
      reload: true,
    },
    contact_owner: { label: t('problem.remedy.contactProjectOwner') },
    retry_download: {
      label: t('problem.expenseReceipt.tryViewAgain'),
      href: '#expense-receipt-preview',
    },
  });
  const submissionBlocked = $derived(
    detailForm?.actionName === 'submitExpense' &&
      [
        'EXPENSE_SUBMISSION_CHANGED',
        'EXPENSE_SUBMISSION_NOT_DRAFT',
        'EXPENSE_SUBMISSION_RECEIPT_REQUIRED',
        'EXPENSE_SUBMISSION_LOCKED',
      ].includes(problem?.code ?? ''),
  );
  const statusForDisplay = $derived(
    problem?.code === 'EXPENSE_SUBMISSION_NOT_DRAFT' && typeof problem.params.status === 'string'
      ? problem.params.status
      : record.approval_state,
  );
  const statusLabel = $derived(
    (data.linkedPairTimeId || data.crewRecorded) && statusForDisplay === 'void'
      ? t('Withdrawn')
      : controlled('status', statusForDisplay),
  );
  const remedyLinks = $derived({
    review_expense: {
      label: t('problem.remedy.reviewExpense'),
      href:
        problem?.code === 'EXPENSE_CORRECTION_ALREADY_EXISTS' && record.active_correction_id
          ? `${base}/app/expenses/${encodeURIComponent(String(record.active_correction_id))}`
          : recordHref,
      reload: ['EXPENSE_SUBMISSION_CHANGED', 'EXPENSE_SUBMISSION_NOT_DRAFT'].includes(
        problem?.code ?? '',
      ),
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
          (canViewExpenseMoney || !['amount', 'paymentMethod'].includes(name)) &&
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
  let submittingExpense = $state(false);
  const enhancedSubmit: SubmitFunction = ({ formElement, cancel }) => {
    const isExpenseSubmission = formElement.dataset.expenseDetailAction === 'submitExpense';
    if (isExpenseSubmission) {
      if (submittingExpense) {
        cancel();
        return;
      }
      submittingExpense = true;
    }
    rememberScroll();
    return async ({ result, update }) => {
      try {
        await update({ reset: false, invalidateAll: true });
        if (result.type === 'failure') await tick();
      } finally {
        if (isExpenseSubmission) submittingExpense = false;
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
      const summary = targetForm?.querySelector<HTMLElement>('[data-validation-summary]');
      if (summary) {
        summary.focus({ preventScroll: true });
        restoreScroll();
        return;
      }
      const submitProblem = action === 'submitExpense';
      const notice = document.querySelector<HTMLElement>(
        submitProblem
          ? '[data-expense-submit-problem] [data-ui="problem-notice"]'
          : '[data-expense-detail-problem] [data-ui="problem-notice"]',
      );
      if (!notice) return;
      notice.focus({ preventScroll: true });
      if (submitProblem) restoreScroll();
      else sessionStorage.removeItem(scrollKey);
      requestAnimationFrame(() => {
        const bounds = notice.getBoundingClientRect();
        const headerBottom =
          document.querySelector('.portal-layout > header')?.getBoundingClientRect().bottom ?? 0;
        if (bounds.top < headerBottom + 8 || bounds.bottom > innerHeight)
          notice.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      });
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
  const financeClassificationPending = $derived(
    canViewFinance &&
      record.approval_state === 'approved' &&
      record.commercial_classification_state === 'unclassified' &&
      Number(record.expense_policy_required ?? 0) === 1,
  );
  const financeClassificationHref = $derived.by(() => {
    const params = new URLSearchParams({
      view: 'commercial',
      project: String(record.project_id),
      expense: String(record.id),
      lang: locale,
    });
    const query = $page.url.searchParams.get('q');
    if (query !== null) params.set('q', query);
    return `${base}/app/finance?${params.toString()}#expense-classification`;
  });
  const financeClassificationHold: ProblemData = {
    code: 'EXPENSE_FINANCE_CLASSIFICATION_PENDING',
    messageKey: 'problem.expenseDetail.financeClassificationHold',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'review_expense_classification' }],
    correlationId: '',
  };
  const needsVerifiedConversion = $derived(
    (record.project_currency_amount_minor === null ||
      record.project_currency_amount_minor === undefined) &&
      record.currency !== record.project_currency,
  );
  const money = (minor: unknown, currency: string) =>
    formatMoney(minor, currency, locale === 'pt' ? 'pt-BR' : locale);
  function receiptProblem(problem: ProblemData): ProblemData {
    const messageKey = receiptMessageKeys[problem.code];
    if (!messageKey) return problem;
    return {
      ...problem,
      messageKey,
      message: (receiptFallbackMessages[problem.code] ?? problem.message ?? '').replace(
        '{correlationId}',
        problem.correlationId,
      ),
    };
  }
  function clearReceiptPreviewUrls(): void {
    for (const item of receiptPreviewObjectUrls) {
      window.clearTimeout(item.timer);
      URL.revokeObjectURL(item.url);
    }
    receiptPreviewObjectUrls = [];
  }
  function showReceiptPreviewProblem(problem: ProblemData): void {
    if (receiptPreviewDisposed) return;
    receiptPreviewWindow?.close();
    receiptPreviewWindow = null;
    receiptPreviewProblem = receiptProblem(problem);
    void tick().then(() => {
      if (receiptPreviewDisposed || !receiptPreviewProblem) return;
      const notice = document.querySelector<HTMLElement>(
        '[data-expense-receipt-problem] [data-ui="problem-notice"]',
      );
      if (!notice) return;
      notice.focus({ preventScroll: true });
      const bounds = notice.getBoundingClientRect();
      const headerBottom =
        document.querySelector('.portal-layout > header')?.getBoundingClientRect().bottom ?? 0;
      if (bounds.top < headerBottom + 8 || bounds.bottom > innerHeight)
        notice.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    });
  }
  function receiptSignatureMatches(mediaType: string, bytes: Uint8Array): boolean {
    const ascii = (start: number, end: number): string =>
      String.fromCharCode(...bytes.subarray(start, end));
    if (mediaType === 'application/pdf') return ascii(0, 5) === '%PDF-';
    if (mediaType === 'image/jpeg')
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (mediaType === 'image/png')
      return ascii(1, 4) === 'PNG' && bytes[0] === 0x89 && bytes[4] === 0x0d;
    if (mediaType === 'image/webp') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    if (mediaType === 'image/heic' || mediaType === 'image/heif')
      return (
        ascii(4, 8) === 'ftyp' &&
        ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(ascii(8, 12))
      );
    return false;
  }
  function showReceiptPreviewFallback(preview: Window, objectUrl: string, filename: string): void {
    const popupDocument = preview.document;
    popupDocument.title = t('problem.expenseReceipt.previewReady');
    popupDocument.documentElement.lang = locale;
    const heading = popupDocument.createElement('h1');
    heading.textContent = t('problem.expenseReceipt.previewReady');
    const explanation = popupDocument.createElement('p');
    explanation.textContent = t('problem.expenseReceipt.previewFallback');
    const download = popupDocument.createElement('a');
    download.href = objectUrl;
    download.download = filename;
    download.textContent = t('problem.expenseReceipt.downloadVerified');
    const main = popupDocument.createElement('main');
    main.append(heading, explanation, download);
    popupDocument.body.replaceChildren(main);
  }
  async function viewPrivateReceipt(): Promise<void> {
    if (receiptPreviewBusy || receiptPreviewDisposed) return;
    let preview: Window | null = null;
    try {
      preview = window.open('about:blank', '_blank');
      if (preview) preview.opener = null;
    } catch {
      try {
        preview?.close();
      } catch {
        // A blocked provisional window can also reject close().
      }
      showReceiptPreviewProblem(documentDownloadFallback('popup'));
      return;
    }
    if (!preview) {
      showReceiptPreviewProblem(documentDownloadFallback('popup'));
      return;
    }
    const controller = new AbortController();
    receiptPreviewController = controller;
    receiptPreviewWindow = preview;
    receiptPreviewBusy = true;
    receiptPreviewProblem = null;
    const current = (): boolean =>
      !receiptPreviewDisposed &&
      receiptPreviewController === controller &&
      !controller.signal.aborted;
    try {
      const response = await fetch(receiptHref, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!current()) return;
      if (response.redirected) {
        const destination = new URL(response.url);
        if (destination.origin === location.origin && destination.pathname.endsWith('/app/login')) {
          showReceiptPreviewProblem(documentDownloadFallback('signIn'));
          return;
        }
      }
      const contentType =
        response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
      if (!response.ok) {
        const payload =
          contentType === 'application/json' ? await response.json().catch(() => null) : null;
        if (current())
          showReceiptPreviewProblem(
            documentDownloadProblem(payload, response.headers.get('x-correlation-id')) ??
              documentDownloadFallback(response.status === 401 ? 'signIn' : 'invalid'),
          );
        return;
      }
      const disposition = response.headers.get('content-disposition') ?? '';
      if (
        ![
          'application/pdf',
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/heic',
          'image/heif',
        ].includes(contentType) ||
        !/^inline\s*;/iu.test(disposition) ||
        !/(?:^|;)\s*filename\*?=/iu.test(disposition)
      ) {
        showReceiptPreviewProblem(documentDownloadFallback('invalid'));
        return;
      }
      const file = await response.blob();
      if (!current()) return;
      const signature = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      if (!current()) return;
      if (!file.size || !receiptSignatureMatches(contentType, signature)) {
        showReceiptPreviewProblem(documentDownloadFallback('invalid'));
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      if (preview.closed) {
        URL.revokeObjectURL(objectUrl);
        showReceiptPreviewProblem(documentDownloadFallback('popup'));
        return;
      }
      try {
        showReceiptPreviewFallback(
          preview,
          objectUrl,
          privateDownloadFilename(disposition, 'receipt.pdf'),
        );
        preview.location.replace(objectUrl);
      } catch {
        URL.revokeObjectURL(objectUrl);
        showReceiptPreviewProblem(documentDownloadFallback('popup'));
        return;
      }
      receiptPreviewWindow = null;
      const timer = window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
        receiptPreviewObjectUrls = receiptPreviewObjectUrls.filter(
          (item) => item.url !== objectUrl,
        );
      }, 120_000);
      receiptPreviewObjectUrls.push({ url: objectUrl, timer });
    } catch {
      if (current()) showReceiptPreviewProblem(documentDownloadFallback('network'));
    } finally {
      if (receiptPreviewController === controller) {
        receiptPreviewController = null;
        receiptPreviewBusy = false;
      }
    }
  }
  function onReceiptPreviewClick(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0) return;
    event.preventDefault();
    void viewPrivateReceipt();
  }
  function onReceiptPreviewAuxClick(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 1) return;
    event.preventDefault();
    void viewPrivateReceipt();
  }
  function onReceiptRemedyClick(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[href="#expense-receipt-preview"]');
    if (!link) return;
    event.preventDefault();
    void viewPrivateReceipt();
  }
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
    localeOverride = resolveStandaloneLocale($page.url.searchParams.get('lang'), data.locale);
    localeMounted = true;
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'ja.portal.locale' || event.key === 'ja-portal-locale')
        localeOverride = resolveStandaloneLocale(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    document.addEventListener('click', onReceiptRemedyClick);
    return () => {
      receiptPreviewDisposed = true;
      receiptPreviewController?.abort();
      receiptPreviewWindow?.close();
      clearReceiptPreviewUrls();
      document.removeEventListener('click', onReceiptRemedyClick);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', rememberScroll);
      correctionValidation?.destroy();
      correctionEnhancement?.destroy();
    };
  });
  $effect(() => {
    if (!localeMounted) return;
    persistStandaloneLocale(locale);
    applyStandaloneDocumentLocale(locale);
  });
</script>

<svelte:head><title>{t('Expense')} | {record.project_number}</title></svelte:head>
{#if data.reviewOnly}
  <main class="record-detail-page" data-review-only="expense">
    <nav class="detail-nav" data-review-navigation aria-label={t('Back to approvals')}>
      <a
        href={`${base}/app/approvals?project=${encodeURIComponent(String(record.project_id))}&tab=expenses&status=${encodeURIComponent(String(record.approval_state))}&q=&lang=${encodeURIComponent(locale)}`}
        ><DirectionIcon direction="left" /> {t('Back to approvals')}</a
      >
    </nav>
    <header class="record-detail-header">
      <div>
        <span class="portal-kicker">{t('Read-only operational review')}</span>
        <h1>{t('Expense')} · {record.project_number}</h1>
        <p>{record.project_name} · {record.spent_on}</p>
      </div>
      <span class="state-tag">{controlled('status', record.approval_state)}</span>
    </header>
    <section class="detail-panel record-detail-copy">
      <p>{t('Approval actions remain in the Approvals queue.')}</p>
      <dl class="record-facts">
        <div>
          <dt>{t('Worker')}</dt>
          <dd>{record.worker_name}</dd>
        </div>
        <div>
          <dt>{t('Project')}</dt>
          <dd>{record.project_number} · {record.project_name}</dd>
        </div>
        <div>
          <dt>{t('Date')}</dt>
          <dd>{record.spent_on}</dd>
        </div>
        <div>
          <dt>{t('Status')}</dt>
          <dd>{controlled('status', record.approval_state)}</dd>
        </div>
        <div>
          <dt>{t('Category')}</dt>
          <dd>{controlled('expenseCategory', record.category)}</dd>
        </div>
        <div>
          <dt>{t('Vendor')}</dt>
          <dd>{record.vendor || '—'}</dd>
        </div>
        <div>
          <dt>{t('Description')}</dt>
          <dd>{record.description || '—'}</dd>
        </div>
      </dl>
    </section>
  </main>
{:else}
  <main class="record-detail-page">
    <nav class="detail-nav">
      <a href={base + '/app/expenses'} data-origin-back
        ><DirectionIcon direction="left" /> {t('Expenses')}</a
      >
      <a href={base + '/app/projects/' + String(record.project_id)}>{t('Open project')}</a>
      {#if record.approval_state === 'submitted' && ['owner_admin', 'project_manager'].includes(data.user?.role ?? '')}
        <a
          class="no-print"
          href={`${base}/app/approvals?project=${encodeURIComponent(String(record.project_id))}&tab=expenses&status=submitted&q=&lang=${encodeURIComponent(locale)}`}
          >{t('Review in approvals')}</a
        >
      {/if}
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
        <p>{t('Worker')}: {record.worker_name || '—'}</p>
      </div>
      <span class="state-tag">{statusLabel}</span>
    </header>
    {#if data.correctionOrigin}
      <section
        class="detail-panel record-detail-copy"
        aria-labelledby="expense-correction-origin-title"
      >
        <h2 id="expense-correction-origin-title">{t('Expense correction')}</h2>
        <p>
          {t('Original expense')}: {data.correctionOrigin.projectNumber} ·
          {data.correctionOrigin.projectName} · {data.correctionOrigin.spentOn} ·
          {controlled('expenseCategory', data.correctionOrigin.category)} ·
          {controlled('status', data.correctionOrigin.approvalState)}
        </p>
        <a
          href={`${base}/app/expenses/${encodeURIComponent(data.correctionOrigin.id)}?lang=${encodeURIComponent(locale)}`}
          >{t('Open original expense')} <DirectionIcon /></a
        >
      </section>
    {/if}
    {#if data.linkedPairTimeId}
      <section class="detail-panel record-detail-copy" aria-label={t('Linked time and meal entry')}>
        <p>{t('This time entry and meal expense were created together.')}</p>
        <a
          href={`${base}/app/time/${encodeURIComponent(data.linkedPairTimeId)}?lang=${encodeURIComponent(locale)}`}
        >
          {t('Review linked time entry')}
          <DirectionIcon />
        </a>
        {#if record.approval_state === 'draft'}
          <p>{t('Submit this pair with the weekly time entries.')}</p>
        {/if}
      </section>
    {/if}
    {#if problem && detailForm?.actionName !== 'submitExpense'}
      <div data-expense-detail-problem>
        <ProblemNotice
          {problem}
          {locale}
          kind={problem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
          status={`${t('Status')}: ${statusLabel}`}
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
    {#if problem && detailForm?.actionName === 'submitExpense'}
      <section class="detail-panel record-detail-copy" data-expense-submit-problem>
        <ProblemNotice
          {problem}
          {locale}
          kind={problem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
          status={`${t('Status')}: ${controlled('status', statusForDisplay)}`}
          {remedyLinks}
        />
      </section>
    {/if}
    {#if data.canSubmitDraft && !submissionBlocked}
      <section class="detail-panel record-detail-copy" aria-label={t('Draft actions')}>
        <form
          method="POST"
          action="?/submitExpense"
          data-expense-detail-action="submitExpense"
          aria-busy={submittingExpense}
          use:formValidation
          use:enhance={enhancedSubmit}
        >
          <input type="hidden" name="id" value={String(record.id)} />
          <input type="hidden" name="version" value={Number(record.version)} />
          <button type="submit" disabled={submittingExpense}>{t('Submit')}</button>
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
    {#if data.canWithdrawCrewDraft}
      <section
        class="detail-panel record-detail-copy"
        aria-label={t('Withdraw crew expense draft')}
      >
        <form
          method="POST"
          action="?/withdrawCrewExpenseDraft"
          data-expense-detail-action="withdrawCrewExpenseDraft"
          use:formValidation
          use:enhance={enhancedSubmit}
        >
          <input type="hidden" name="expenseId" value={String(record.id)} />
          <input type="hidden" name="version" value={Number(record.version)} />
          <label>
            <span>{t('Why withdraw this draft?')}</span>
            <input
              id="crew-expense-withdraw-reason"
              name="reason"
              minlength="3"
              maxlength="2000"
              required
              value={detailForm?.actionName === 'withdrawCrewExpenseDraft'
                ? (detailForm.values?.reason ?? '')
                : ''}
              aria-invalid={detailForm?.actionName === 'withdrawCrewExpenseDraft' &&
                Boolean(detailForm.fieldErrors?.reason?.length)}
              aria-describedby={detailForm?.actionName === 'withdrawCrewExpenseDraft' &&
              detailForm.fieldErrors?.reason?.length
                ? 'crew-expense-withdraw-reason-error'
                : undefined}
            />
            {#if detailForm?.actionName === 'withdrawCrewExpenseDraft' && detailForm.fieldErrors?.reason?.length}
              <small id="crew-expense-withdraw-reason-error" class="field-error">
                {t('problem.expense.crewWithdrawalInvalid')}
              </small>
            {/if}
          </label>
          <button type="submit" class="destructive-button">
            {t('Withdraw crew expense draft')}
          </button>
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
          <a
            href={`${base}/app/expenses/${encodeURIComponent(String(record.active_correction_id))}`}
            >{t('Open existing correction')} <DirectionIcon /></a
          >
        {:else if data.canCreateCorrection}
          <a href="#expense-correction-title">{t('Create corrected draft')} <DirectionIcon /></a>
        {:else if record.approval_state === 'rejected' && data.correctionOrigin}
          <p>
            {t('Open the original expense to check its current status and available actions.')}
          </p>
        {:else if record.approval_state === 'rejected'}
          <p>
            {t(
              'A rejected expense cannot be corrected. Create a new expense if the cost should be recorded.',
            )}
          </p>
          {#if data.user?.role === 'owner_admin' || (data.user?.role === 'worker' && String(record.worker_id) === String(data.user?.id))}
            <a
              href={`${base}/app/expenses?project=${encodeURIComponent(String(record.project_id))}&date=${encodeURIComponent(String(record.spent_on))}`}
              >{t('Add expense')} <DirectionIcon /></a
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
          {#if data.user.role === 'project_manager'}
            <form
              method="POST"
              action="?/createCorrectionDraft"
              data-correction-draft-form
              class="admin-form-grid"
              bind:this={pmCorrectionForm}
              use:formValidation
              use:dirtyFormGuard={{
                initialDirty: String(detailForm?.values?.originalId ?? '') === String(record.id),
              }}
            >
              <input type="hidden" name="recordType" value="expense" />
              <input type="hidden" name="originalId" value={String(record.id)} />
              <input
                type="hidden"
                name="requestId"
                value={detailForm?.actionName === 'createCorrectionDraft'
                  ? (detailForm.values?.requestId ?? data.correctionRequestId)
                  : data.correctionRequestId}
              />
              <input type="hidden" name="patch" value={JSON.stringify(pmCorrectionPatch)} />
              <label
                ><span>{t('Vendor (optional)')}</span><input
                  name="vendor"
                  maxlength="200"
                  bind:value={pmVendor}
                /></label
              >
              <label
                ><span>{t('Date')}</span><input
                  name="spentOn"
                  type="date"
                  required
                  bind:value={pmSpentOn}
                /></label
              >
              <label
                ><span>{t('Description')}</span><textarea
                  name="description"
                  required
                  minlength="3"
                  maxlength="5000"
                  bind:value={pmDescription}
                ></textarea></label
              >
              <label
                ><span>{t('Category')}</span><select
                  name="category"
                  required
                  bind:value={pmCategory}
                >
                  {#each ['hotel', 'rental_car', 'fuel', 'tolls', 'parking', 'airfare', 'ground_transport', 'meals', 'per_diem', 'materials', 'tools', 'shipping', 'phone_data', 'visa_permit', 'other'] as category}
                    <option value={category}>{controlled('expenseCategory', category)}</option>
                  {/each}
                </select></label
              >
              <label
                ><span>{t('Time expense occurred (optional)')}</span><input
                  name="occurredTimeLocal"
                  type="time"
                  step="60"
                  bind:value={pmOccurredTime}
                /></label
              >
              <label
                ><span>{t('Related logged hours (optional)')}</span><select
                  name="timeEntryId"
                  bind:value={pmTimeEntryId}
                >
                  <option value="">{t('Expense only / no linked hours')}</option>
                  {#if pmTimeEntryId && !data.correctionTimeOptions.some((option: { id: string }) => option.id === pmTimeEntryId)}
                    <option value={pmTimeEntryId}>{t('Current linked hours')}</option>
                  {/if}
                  {#each data.correctionTimeOptions as option (option.id)}
                    <option value={option.id}
                      >{option.workerName} · {Number(option.minutes) / 60} h · {option.summary}</option
                    >
                  {/each}
                </select></label
              >
              <label
                ><span>{t('Correction reason')}</span><textarea
                  name="reason"
                  required
                  minlength="3"
                  maxlength="2000"
                  value={detailForm?.actionName === 'createCorrectionDraft'
                    ? (detailForm.values?.reason ?? '')
                    : ''}
                ></textarea></label
              >
              <button type="submit">{t('Create corrected draft')}</button>
            </form>
          {:else}
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
          {/if}
        </div>
      </section>
    {/if}
    {#if financeClassificationPending}
      <div data-expense-finance-classification-hold>
        <ProblemNotice
          problem={financeClassificationHold}
          {locale}
          kind="warning"
          title={t('Needs Finance classification')}
          remedyLinks={{
            review_expense_classification: {
              label: t('Review expense classification'),
              href: financeClassificationHref,
            },
          }}
        />
      </div>
    {/if}
    <section class="record-detail-grid">
      {#if canViewExpenseMoney}
        <article>
          <span>{t('AMOUNT')}</span><strong
            >{money(record.amount_minor, String(record.currency))}</strong
          >
        </article>
      {/if}
      <article>
        <span>{t('CATEGORY')}</span><strong>{controlled('expenseCategory', record.category)}</strong
        >
      </article>
      {#if canViewFinance}
        <article>
          <span>{t('CLIENT TREATMENT')}</span><strong
            >{financeClassificationPending
              ? t('Needs Finance classification')
              : controlled('billingStream', record.client_treatment)}</strong
          >
        </article>
      {/if}
      {#if canViewOwnReimbursement && record.approval_state !== 'void' && record.reimbursement_state}
        <article>
          <span>{t('REIMBURSEMENT')}</span><strong
            >{financeClassificationPending
              ? t('Needs Finance classification')
              : controlled('status', record.reimbursement_state)}</strong
          >
        </article>
      {/if}
    </section>
    <section class="detail-panel record-detail-copy">
      <div class="panel-title">
        <h2>{t('Expense details')}</h2>
        {#if canViewExpenseMoney}
          <span>{record.who_paid ? controlled('role', record.who_paid) : t('worker paid')}</span>
        {/if}
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
                  (data.user?.role === 'worker' &&
                  String(record.worker_id) !== String(data.user?.id)
                    ? '/app/crew/time/'
                    : '/app/time/') +
                  String(record.time_entry_id)}>{t('Open time record')}</a
              >
            {:else}
              —
            {/if}
          </dd>
        </div>
        {#if canViewExpenseMoney}
          <div>
            <dt>{t('Payment method')}</dt>
            <dd>{record.payment_method ?? '—'}</dd>
          </div>
        {/if}
        {#if canViewFinance}
          <div>
            <dt>{t('Billing treatment')}</dt>
            <dd>
              {financeClassificationPending
                ? t('Needs Finance classification')
                : controlled('billingStream', record.billing_treatment ?? 'internal')}
            </dd>
          </div>
          <div
            data-expense-project-amount
            class:expense-conversion-needed={needsVerifiedConversion}
          >
            <dt>{t('Project-currency amount')}</dt>
            <dd>
              {#if needsVerifiedConversion}
                <span data-expense-conversion-required
                  >{t('Verified currency conversion needed')}</span
                >
                <p data-expense-conversion-explanation>
                  {t(
                    'No verified conversion is recorded. This expense keeps its original currency. A conversion cannot currently be entered here.',
                  )}
                </p>
                <a href={financeClassificationHref}
                  >{t('Review expense classification')} <DirectionIcon /></a
                >
              {:else}
                {money(
                  record.project_currency_amount_minor ?? record.amount_minor,
                  String(record.project_currency ?? record.currency),
                )}
              {/if}
            </dd>
          </div>
        {/if}
        {#if canViewExpenseMoney}
          <div>
            <dt>{t('Receipt')}</dt>
            <dd>
              {record.receipt_document_id
                ? t('Registered private receipt')
                : t('No receipt linked')}
            </dd>
          </div>
        {/if}
      </dl>
      {#if canViewExpenseMoney && record.receipt_document_id}
        <a
          id="expense-receipt-preview"
          class="preview-link"
          target="_blank"
          href={receiptHref}
          aria-busy={receiptPreviewBusy}
          onclick={onReceiptPreviewClick}
          onauxclick={onReceiptPreviewAuxClick}>{t('Open private receipt')}</a
        >
        {#if receiptPreviewProblem}
          <div data-expense-receipt-problem>
            <ProblemNotice
              problem={receiptPreviewProblem}
              {locale}
              status={`${t('Status')}: ${controlled('status', statusForDisplay)}`}
              remedyLinks={receiptRemedyLinks}
            />
          </div>
        {/if}
      {/if}
    </section>
  </main>
{/if}

<style>
  .expense-conversion-needed {
    grid-column: 1 / -1;
  }

  .expense-conversion-needed dd {
    overflow: visible;
    overflow-wrap: anywhere;
    white-space: normal;
  }
</style>
