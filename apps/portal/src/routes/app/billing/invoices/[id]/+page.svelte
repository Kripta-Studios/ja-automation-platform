<script lang="ts">
  import DirectionIcon from '$lib/portal/ui/DirectionIcon.svelte';
  import PrintIcon from '$lib/portal/ui/PrintIcon.svelte';
  import StatusBadge from '$lib/portal/ui/StatusBadge.svelte';
  import { beforeNavigate, invalidateAll, goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount, tick } from 'svelte';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneText,
    standaloneActionMessage,
  } from '../../../standalone-locale';
  import type { PortalLocale } from '$lib/portal-i18n';
  import {
    renderInvoiceDocument,
    type InvoiceTemplateSnapshot,
  } from '@ja/reporting/invoice-document';
  import { dirtyFormGuard, hasUnsavedFormChanges } from '$lib/portal/dirty-form-guard';
  import { createInvoicePdfPollingController } from '$lib/portal/invoice-pdf-polling';
  import ProblemNotice from '$lib/portal/ui/ProblemNotice.svelte';
  import formValidation, { reportFormFieldErrors } from '$lib/portal/ui/form-validation';
  import {
    privateDownloadFilename,
    typedPrivateDownloadProblem,
  } from '$lib/portal/ui/private-document-download';
  import type { ProblemData } from '$lib/problem/contract';
  import LocalizedPdfPanel from '$lib/portal/ui/localized-pdf/LocalizedPdfPanel.svelte';
  import { centerNavigationTarget } from '$lib/portal/ui/navigation-target';
  import {
    quickInvoiceFormat,
    quickInvoiceText,
    quickInvoiceWarningText,
    type QuickInvoiceCopyKey,
  } from '$lib/portal/billing-quick-invoice-copy';
  import RecordPaymentForm from '$lib/portal/sections/RecordPaymentForm.svelte';
  import { moneyText } from '$lib/portal/money-copy';
  import { billingFixText, type BillingFixCopyKey } from '$lib/portal/billing-fix-copy';
  import { paymentMoney } from '$lib/portal/payment-money';
  import { translateControlledValue } from '$lib/i18n/controlled-values';
  import { documentLanguage } from '$lib/portal-i18n';

  type Row = Record<string, unknown>;
  type InvoiceRow = Row & {
    company_info?: Record<string, string | null> | null;
    terms_and_instructions?: Record<string, string | null> | null;
    calculation?: { subtotalMinor?: string | number | bigint | null } | null;
    invoice_date?: string | null;
    issued_at?: string | null;
    created_at?: string | null;
    due_at?: string | null;
  };
  type InvoicePdfStatus = 'queued' | 'running' | 'ready' | 'failed' | 'unavailable';
  let { data, form } = $props();
  type DraftDetailsForm = Partial<ProblemData> & {
    success?: boolean;
    billingOperation?: string;
    values?: Record<string, string>;
  };
  const draftDetailsForm = $derived(form as DraftDetailsForm | null | undefined);
  const draftDetailsProblem = $derived(
    draftDetailsForm?.success === false &&
      draftDetailsForm.code &&
      draftDetailsForm.messageKey &&
      draftDetailsForm.correlationId
      ? (draftDetailsForm as ProblemData)
      : null,
  );
  let draftDetailsNotice = $state<HTMLDivElement | undefined>(undefined);
  function draftValue(name: string, fallback: unknown): string {
    const value =
      draftDetailsForm?.billingOperation === 'updateInvoiceDraftDetails'
        ? draftDetailsForm.values?.[name]
        : undefined;
    return value === undefined ? String(fallback ?? '') : value;
  }
  let localeOverride = $state<PortalLocale | null>(null);
  const locale = $derived(
    localeOverride ?? data.locale ?? resolveStandaloneLocale($page.url.searchParams.get('lang')),
  );
  const t = (key: string): string => standaloneText(locale, key);
  const preview = $derived(data.preview as { invoice: InvoiceRow; lines: Row[]; taxes: Row[] });
  const invoice = $derived(preview.invoice);
  const invoiceState = $derived(String(invoice.state ?? '').toLowerCase());
  /** Delivery is a fact of its own: it can still be recorded after a payment arrived. */
  const invoiceSentAt = $derived(
    typeof invoice.sent_at === 'string' && invoice.sent_at ? String(invoice.sent_at) : '',
  );
  const invoiceStatusLabel = $derived(translateControlledValue(locale, 'status', invoiceState));
  function invoiceStatusVariant(
    state: string,
  ): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
    switch (state) {
      case 'draft':
        return 'neutral';
      case 'paid':
        return 'success';
      case 'overdue':
        return 'warning';
      case 'void':
        return 'danger';
      case 'credited':
      case 'credit_note':
      default:
        return 'info';
    }
  }
  const hasDraftPreview = $derived(
    ['draft', 'approved'].includes(invoiceState) &&
      (invoice.invoice_number === null || invoice.invoice_number === undefined) &&
      (invoice.issued_at === null || invoice.issued_at === undefined),
  );
  const canEditDraft = $derived(
    invoiceState === 'draft' &&
      hasDraftPreview &&
      ![
        'BILLING_INVOICE_HISTORICAL_ISSUE_MARKERS',
        'BILLING_READ_ONLY_ROLE',
        'BILLING_FINANCE_REQUIRED',
        'BILLING_ACCOUNT_INACTIVE',
        'BILLING_SESSION_EXPIRED',
        'BILLING_SIGN_IN_REQUIRED',
        'ACTION_ERROR_FORBIDDEN',
        'ACTION_ERROR_UNAUTHENTICATED',
      ].includes(draftDetailsProblem?.code ?? '') &&
      ['owner_admin', 'finance_admin'].includes(String(data.user?.role ?? '')),
  );
  const retainedDraftValues = $derived(
    !canEditDraft && draftDetailsForm?.billingOperation === 'updateInvoiceDraftDetails'
      ? (
          [
            ['invoiceDate', 'Invoice Date'],
            ['dueDate', 'Due Date'],
            ['paymentTermsDays', 'Payment terms (days)'],
            ['companyDivision', 'Division'],
            ['companyPhone', 'Phone'],
            ['companyEmail', 'Email'],
            ['companyWebsite', 'Website'],
            ['purchaseNo', 'Purchase No.'],
            ['discount', 'Discount Amount'],
            ['bankSwiftNumber', 'Bank Swift Number'],
            ['bankAccountNumber', 'Bank Account Number'],
            ['bankName', 'Bank Name'],
            ['beneficiary', 'Beneficiary'],
            ['bankAchRouting', 'ACH routing number'],
            ['bankWireRouting', 'Wire routing number (domestic)'],
            ['bankSwiftEur', 'SWIFT code for EUR payments'],
            ['pastDueNotice', 'Past Due Notice'],
          ] as Array<[string, string]>
        ).filter(([name]) => draftDetailsForm?.values?.[name] !== undefined)
      : [],
  );
  $effect(() => {
    if (draftDetailsProblem)
      void tick().then(() => {
        const editor = document.querySelector<HTMLFormElement>(
          'form[action="?/updateInvoiceDraftDetails"]',
        );
        if (editor)
          reportFormFieldErrors(
            editor,
            draftDetailsProblem.fieldErrors,
            Object.fromEntries(
              Object.entries(draftDetailsProblem.params).filter(
                (entry): entry is [string, string | number] =>
                  typeof entry[1] === 'string' || typeof entry[1] === 'number',
              ),
            ),
          );
        const notice = draftDetailsNotice?.querySelector<HTMLElement>('[data-problem-code]');
        notice?.focus({ preventScroll: true });
        notice?.scrollIntoView({ block: 'center' });
      });
  });
  const defaultDiscount = $derived.by(() => {
    const raw = String(invoice.discount_minor ?? '0').trim();
    if (!/^\d+$/.test(raw)) return raw;
    const digits = raw.replace(/^0+(?=\d)/, '').padStart(3, '0');
    return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
  });
  const legacyDiscountMismatch = $derived.by(() => {
    try {
      const discount = BigInt(String(invoice.discount_minor ?? '0'));
      return (
        discount !== 0n &&
        BigInt(String(invoice.total_minor ?? '0')) !==
          BigInt(String(invoice.subtotal_minor ?? '0')) -
            discount +
            BigInt(String(invoice.tax_minor ?? '0'))
      );
    } catch {
      return false;
    }
  });
  const invoiceId = $derived(String(invoice.id ?? ''));
  const numberPreview = $derived(
    invoice.draft_number_preview as {
      number: string | null;
      asOf: string;
      policy: { prefix: string; digits: number; effectiveFrom: string } | null;
    } | null,
  );
  const numberingHref = $derived(
    `${base}/app/billing?view=setup&setup=numbering&numberingEntity=${encodeURIComponent(String(invoice.issuer_legal_entity_id ?? ''))}&lang=${locale}#billing-numbering-policy`,
  );
  let numberingSummary = $state<HTMLDetailsElement>();
  const draftPreviewUrl = $derived(
    `${base}/app/api/invoices/${encodeURIComponent(invoiceId)}/draft-preview?lang=${locale}`,
  );
  const pdfStatus = $derived(invoicePdfStatus(invoice));
  // Lifecycle panel: one obvious next step (issue → PDF → mark sent → payments).
  const q = (key: QuickInvoiceCopyKey) => quickInvoiceText(locale, key);
  const canManageInvoice = $derived(
    ['owner_admin', 'finance_admin'].includes(String(data.user?.role ?? '')),
  );
  // T35: the same money format as the balance and the document ("US$ 3.025,00", not "3.025,00 USD").
  const invoiceTotalText = $derived(
    paymentMoney(
      String(invoice.total_minor ?? '0'),
      String(invoice.currency ?? 'USD'),
      documentLanguage(locale),
    ),
  );
  const invoiceBalance = $derived(
    (
      data as {
        balance?: {
          outstandingMinor: string;
          collectedMinor: string;
          creditedMinor?: string;
          currency: string;
          history?: Array<{ kind: 'payment' | 'reversal'; date: string; amountMinor: string }>;
        } | null;
      }
    ).balance ?? null,
  );
  /** T60: an overdue invoice with a payment reads "Overdue · Partly paid" everywhere. */
  const overduePartlyPaid = $derived(
    invoiceState === 'overdue' &&
      invoiceBalance !== null &&
      BigInt(invoiceBalance.collectedMinor || '0') > 0n &&
      BigInt(invoiceBalance.outstandingMinor || '0') > 0n,
  );
  let paymentOpen = $state(false);
  let paymentNotice = $state('');
  /** Calendar day in the reader's language ("24 Nov 2026"), not ISO. */
  const dateLabel = (day: string) =>
    /^\d{4}-\d{2}-\d{2}$/u.test(day)
      ? new Intl.DateTimeFormat(documentLanguage(locale), {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${day}T00:00:00Z`))
      : day;
  const paymentFormat = (minor: unknown, currency?: string) =>
    paymentMoney(minor, currency, documentLanguage(locale));
  type IssueCheck =
    | { ok: true }
    | { ok: false; reasons: ReadonlyArray<{ code: string }>; message: string }
    | null;
  const issueBlockers = $derived.by(() => {
    const check = (data as { issueCheck?: IssueCheck }).issueCheck;
    if (!check || check.ok) return [];
    const codes = [...new Set(check.reasons.map((reason) => reason.code))];
    const countOf = (code: string) =>
      check.reasons.filter((reason) => reason.code === code).length;
    return codes.map((code) => {
      const fix: Record<string, { href: string | null; label: QuickInvoiceCopyKey }> = {
        canonical_legal_entity_revision_required: {
          href: `${financeHref}#project-issuing-authority`,
          label: 'fix_issuer_authority',
        },
        missing_accountant_approved_number_policy: {
          href: String(data.user?.role) === 'owner_admin' ? numberingHref : null,
          label: 'fix_numbering',
        },
        // T16: open period generation prefilled with this invoice's project and period.
        customer_signoff_required: {
          href: `${base}/app/reports?${new URLSearchParams({
            view: 'signoff',
            refresh: 'period',
            project: String(invoice.project_id ?? ''),
            from: String(invoice.period_start ?? ''),
            to: String(invoice.period_end ?? ''),
            lang: locale,
          }).toString()}`,
          label: 'fix_signoff',
        },
        // D12: never bill overtime at $0 silently: set the overtime rate first.
        missing_overtime_client_rate: { href: financeHref, label: 'fix_overtime_rate' },
        missing_client_rate: { href: financeHref, label: 'fix_invoice' },
        // Round 2: a stale draft is refreshed in place (form below), never a raw code.
        stale_billing_configuration: { href: null, label: 'refreshDraft' },
      };
      return {
        code,
        text:
          quickInvoiceWarningText(locale, { code, count: countOf(code), minutes: 0 }) ??
          (code === 'issue_blocked' ? check.message : t(code)),
        href: fix[code]?.href ?? null,
        label: fix[code]?.label ?? ('fix_invoice' as QuickInvoiceCopyKey),
      };
    });
  });
  let issueDialog = $state<HTMLDialogElement>();
  /** D15: credit notes keep their own name in the page chrome. */
  const isCreditNote = $derived(String(invoice.document_type ?? '') === 'credit_note');
  let refreshingDraft = $state(false);
  const draftRefreshed = $derived($page.url.searchParams.get('refreshed') === '1');
  let issueSubmitting = $state(false);
  const sendKey = $derived(`send-${invoiceId}-${String(invoice.version ?? '')}`);
  const justCreated = $derived($page.url.searchParams.get('created') === '1');
  const pdfUrl = $derived(`${base}/app/api/invoices/${encodeURIComponent(invoiceId)}/pdf`);
  let securePdfPreviewOpen = $state(false);
  let securePdfPreviewUrl = $state('');
  let issuedPdfBusy = $state(false);
  let issuedPdfProblem = $state<ProblemData | null>(null);
  let issuedPdfOpenedFallback = $state(false);
  let issuedPdfController: AbortController | null = null;
  let issuedPdfPopup: Window | null = null;
  let issuedPdfNotice = $state<HTMLDivElement | undefined>(undefined);
  let issuedPdfObjectUrls: Array<{ url: string; timer: number; external?: boolean }> = [];
  const issuedPdfRemedies = $derived({
    sign_in_again: {
      label: t('problem.remedy.signInAgain'),
      href: `${base}/app/login?lang=${locale}`,
    },
    review_invoice: {
      label: t('problem.invoiceDraftPreview.reviewInvoice'),
      href: `${base}/app/billing/invoices/${encodeURIComponent(invoiceId)}?lang=${locale}`,
      reload: true,
    },
    review_billing: {
      label: t('problem.invoiceDraftPreview.reviewBilling'),
      href: `${base}/app/billing`,
    },
    contact_finance: { label: t('Contact a finance administrator') },
    retry_download: { label: t('Download PDF'), href: '#invoice-issued-pdf-download' },
  });
  let draftPreviewBusy = $state(false);
  let draftPreviewProblem = $state<ProblemData | null>(null);
  let draftPreviewController: AbortController | null = null;
  let draftPreviewDisposed = false;
  let draftPreviewNotice = $state<HTMLDivElement | undefined>(undefined);
  let draftPreviewObjectUrls: Array<{ url: string; timer: number }> = [];
  const draftPreviewRemedies = $derived({
    sign_in_again: { label: t('problem.remedy.signInAgain'), href: `${base}/app/login` },
    contact_owner: { label: t('problem.remedy.contactOwner') },
    review_billing: {
      label: t('problem.invoiceDraftPreview.reviewBilling'),
      href: `${base}/app/billing`,
    },
    review_invoice: {
      label: t('problem.invoiceDraftPreview.reviewInvoice'),
      href: `${base}/app/billing/invoices/${encodeURIComponent(invoiceId)}?lang=${locale}`,
      reload: true,
    },
    review_legal_entity: {
      label: t('problem.invoiceDraftPreview.reviewLegalEntity'),
      href: `${base}/app/finance?view=commercial&project=${encodeURIComponent(String(invoice.project_id ?? ''))}&lang=${locale}#project-issuing-authority`,
    },
    retry_preview: {
      label: t('problem.invoiceDraftPreview.retryPreview'),
      href: '#invoice-draft-preview-action',
    },
  });
  const isOwner = $derived(String(data.user?.role) === 'owner_admin');
  // Owner decision 2026-11-25: an issued invoice is corrected in place as a NEW VERSION with
  // the same number (version 1 and every later version stay in the history with their PDF).
  const canCorrectIssued = $derived(
    isOwner &&
      !hasDraftPreview &&
      !isCreditNote &&
      ['issued', 'sent', 'partially_paid', 'paid', 'overdue'].includes(invoiceState),
  );
  const pdfPolling = createInvoicePdfPollingController(() => invalidateAll());
  const documentSnapshot = $derived({
    ...data.documentSnapshot,
    locale,
  } as InvoiceTemplateSnapshot);
  const documentPreview = $derived(
    renderInvoiceDocument(documentSnapshot, {
      editable: canEditDraft || canCorrectIssued,
      numberingInteractive: hasDraftPreview,
      logoUrl: `${base}/app/logo.png`,
    }),
  );
  let draftEditor = $state<HTMLDetailsElement>();
  let draftEditorForm = $state<HTMLFormElement>();
  let detailsSaving = $state(false);
  // Bank, payee and company contact details are company-wide issuer settings (decision D1):
  // the draft shows them, Billing setup › Issuer settings changes them.
  const companyWideFields = [
    'bankSwiftNumber',
    'bankAccountNumber',
    'bankName',
    'beneficiary',
    'bankAchRouting',
    'bankWireRouting',
    'bankSwiftEur',
    'companyDivision',
    'companyPhone',
    'companyEmail',
    'companyWebsite',
  ];
  const fixText = (key: BillingFixCopyKey, params: Record<string, string | number> = {}) =>
    billingFixText(locale, key, params);
  const issuerSettingsHref = $derived(
    `${base}/app/billing?view=setup&issuerSettings=${encodeURIComponent(String(invoice.issuer_legal_entity_id ?? ''))}&lang=${locale}#issuer-document-settings`,
  );
  const projectHref = $derived(
    `${base}/app/projects/${encodeURIComponent(String(invoice.project_id ?? ''))}?lang=${locale}`,
  );
  const financeHref = $derived(
    `${base}/app/finance?view=commercial&project=${encodeURIComponent(String(invoice.project_id ?? ''))}&lang=${locale}`,
  );
  async function navigateConfiguration(href: string): Promise<void> {
    try {
      await goto(href);
    } catch (caught) {
      // Staying with an unsaved draft is an expected navigation cancellation.
      if (caught instanceof Error && caught.message === 'navigation cancelled') return;
      throw caught;
    }
  }
  // Inline editing (2026-11-25): click a value of the rendered draft, edit it in place.
  type InlineEditor = {
    field: string;
    label: string;
    value: string;
    kind: 'text' | 'textarea' | 'date' | 'number' | 'line';
    alsoLabel?: string;
    note?: string;
    lineId?: string;
    lineKey?: string;
    hours?: string;
    rate?: string;
    isHoursLine?: boolean;
    sourceHref?: string;
    /** Non-hours line of an issued invoice: its amount. */
    amount?: string;
    /** Saving creates a new version of an issued invoice. */
    issued?: boolean;
  };
  let inlineEditor = $state<InlineEditor | null>(null);
  let inlineSaving = $state(false);
  let inlineError = $state('');
  let inlineDialog = $state<HTMLDialogElement>();
  let issuedCorrectionOpen = $state(false);
  const currentRevision = $derived(Number(invoice.current_revision_number ?? 1));
  type VersionEntry = {
    revisionNumber: number;
    invoiceNumber: string;
    createdAt: string;
    createdBy: string | null;
    replacedAt: string | null;
    current: boolean;
    totalMinor: string;
    currency: string;
    pdfReady: boolean;
    changedFields: string[];
    reason: string | null;
  };
  const versionHistory = $derived(
    (Array.isArray(invoice.version_history) ? invoice.version_history : []) as VersionEntry[],
  );
  let correctionNotice = $state('');
  const payeeFieldNames = [
    'bankSwiftNumber',
    'bankAccountNumber',
    'bankName',
    'beneficiary',
    'bankAchRouting',
    'bankWireRouting',
    'bankSwiftEur',
  ];
  const payeeLabels: Record<string, string> = {
    bankSwiftNumber: 'Bank Swift Number',
    bankAccountNumber: 'Bank Account Number',
    bankName: 'Bank Name',
    beneficiary: 'Beneficiary',
    bankAchRouting: 'ACH routing number',
    bankWireRouting: 'Wire routing number (domestic)',
    bankSwiftEur: 'SWIFT code for EUR payments',
  };
  function dateOnly(value: unknown): string {
    const text = String(value ?? '');
    return /^\d{4}-\d{2}-\d{2}/u.test(text) ? text.slice(0, 10) : '';
  }
  function minorToDecimal(value: unknown): string {
    const raw = String(value ?? '');
    if (!/^-?\d+$/u.test(raw)) return '';
    const negative = raw.startsWith('-');
    const digits = (negative ? raw.slice(1) : raw).padStart(3, '0');
    return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
  }
  function inlineEditorFor(name: string, element: HTMLElement): InlineEditor | null {
    const terms = (invoice.terms_and_instructions ?? {}) as Record<string, unknown>;
    switch (name) {
      case 'client':
        return {
          field: name,
          label: t('Client name'),
          value: String(invoice.client_legal_name ?? invoice.client_name ?? ''),
          kind: 'text',
          alsoLabel: t('Also update the client record'),
        };
      case 'clientAddress':
        return {
          field: name,
          label: t('Client address'),
          value: String(invoice.client_billing_address ?? ''),
          kind: 'textarea',
          alsoLabel: t('Also update the client record'),
        };
      case 'projectName':
        return {
          field: name,
          label: t('Project'),
          value: String(invoice.project_name ?? ''),
          kind: 'text',
          alsoLabel: t('Also update the project record'),
        };
      case 'costCenter':
        return {
          field: name,
          label: t('Cost center'),
          value: String(invoice.cost_center_code ?? ''),
          kind: 'text',
          alsoLabel: t('Also update the project record'),
        };
      case 'purchaseNo':
        return {
          field: name,
          label: t('Purchase No.'),
          value: String(invoice.purchase_no ?? '').replace(/^—$/u, ''),
          kind: 'text',
          alsoLabel: t('Also use for future invoices of this project'),
        };
      case 'invoiceDate':
        return { field: name, label: t('Invoice Date'), value: dateOnly(invoice.invoice_date), kind: 'date' };
      case 'dueDate':
        return { field: name, label: t('Due Date'), value: dateOnly(invoice.due_date), kind: 'date' };
      case 'paymentTermsDays':
        return {
          field: name,
          label: t('Payment terms (days)'),
          value: String(invoice.payment_terms_days ?? ''),
          kind: 'number',
          alsoLabel: t('Also use for future invoices of this project'),
        };
      case 'pastDueNotice':
        return {
          field: name,
          label: t('Past Due Notice'),
          value: String(terms.pastDueNotice ?? ''),
          kind: 'textarea',
          alsoLabel: t('Also use for future invoices of this project'),
        };
      case 'line': {
        const lineId = element.dataset.invoiceLineId ?? '';
        const line = preview.lines.find((row) => String(row.id ?? '') === lineId);
        if (!line) return null;
        const isHoursLine = String(line.source_type) === 'time';
        const numerator = Number(line.quantity_numerator ?? 0);
        const denominator = Math.max(1, Number(line.quantity_denominator ?? 1));
        return {
          field: 'line',
          label: t('Invoice line'),
          value: String(line.description ?? ''),
          kind: 'line',
          lineId,
          lineKey: element.dataset.invoiceLineKey ?? '',
          isHoursLine,
          hours: isHoursLine ? String(Math.round((numerator / denominator) * 100) / 100) : '',
          rate: isHoursLine ? minorToDecimal(line.unit_price_minor) : '',
          amount: isHoursLine ? '' : minorToDecimal(line.subtotal_minor),
          note: isHoursLine
            ? t('Rate and hours change this invoice only. Time entries and worker pay stay as they are.')
            : '',
          sourceHref: line.source_id
            ? `${base}/app/${isHoursLine ? 'time' : 'expenses'}/${encodeURIComponent(String(line.source_id))}?lang=${locale}`
            : undefined,
        };
      }
    }
    if (name === 'invoiceNumber' && canEditDraft && isOwner)
      return {
        field: name,
        label: t('Invoice number'),
        value: String(invoice.requested_invoice_number ?? numberPreview?.number ?? ''),
        kind: 'text',
        note: t('Any unused number. Leave empty to use the automatic number.'),
      };
    if (name === 'invoiceNumber' && canCorrectIssued)
      return {
        field: name,
        label: t('Invoice number'),
        value: String(invoice.invoice_number ?? ''),
        kind: 'text',
        note: t('The old number stays in the history and is never used again.'),
      };
    if (payeeFieldNames.includes(name) && isOwner && canCorrectIssued)
      return {
        field: name,
        label: t(payeeLabels[name] ?? name),
        value: String(terms[name] ?? ''),
        kind: 'text',
      };
    if (payeeFieldNames.includes(name) && isOwner)
      return {
        field: name,
        label: t(payeeLabels[name] ?? name),
        value: String(terms[name] ?? ''),
        kind: 'text',
        note: t('Bank details apply to every invoice of this issuer. Every owner is notified of the change.'),
      };
    return null;
  }
  async function openInlineEditor(editor: InlineEditor): Promise<void> {
    inlineError = '';
    inlineEditor = editor;
    await tick();
    inlineDialog?.showModal();
    inlineDialog?.querySelector<HTMLElement>('input:not([type=hidden]),textarea')?.focus();
  }
  function closeInlineEditor(): void {
    inlineDialog?.close();
    inlineEditor = null;
    inlineError = '';
  }
  async function openPreviewField(name: string, element?: HTMLElement): Promise<void> {
    if (canCorrectIssued && element) {
      const editor = inlineEditorFor(name, element);
      if (editor) {
        await openInlineEditor({ ...editor, alsoLabel: undefined, issued: true });
        return;
      }
    }
    if (!canEditDraft && !hasDraftPreview && isOwner && name !== '') {
      issuedCorrectionOpen = true;
      await tick();
      document.getElementById('invoice-issued-correction')?.scrollIntoView({ block: 'center' });
      return;
    }
    if (canEditDraft && element) {
      const editor = inlineEditorFor(name, element);
      if (editor) {
        await openInlineEditor(editor);
        return;
      }
    }
    if (name === 'invoiceNumber' && hasDraftPreview) {
      if (String(data.user?.role) === 'owner_admin') await navigateConfiguration(numberingHref);
      else if (numberingSummary) {
        numberingSummary.open = true;
        await tick();
        centerNavigationTarget(numberingSummary);
      }
      return;
    }
    if (!canEditDraft) return;
    if (companyWideFields.includes(name)) {
      await navigateConfiguration(issuerSettingsHref);
      return;
    }
    if (['issuingAuthority', 'companyName', 'companyAddress'].includes(name)) {
      await navigateConfiguration(
        `${financeHref}&task=${encodeURIComponent('Project issuing authority')}#project-issuing-authority`,
      );
      return;
    }
    if (name === 'client') {
      const clientId = String(invoice.client_id ?? '');
      if (clientId)
        await navigateConfiguration(
          `${base}/app/projects?view=clients&client=${encodeURIComponent(clientId)}&lang=${locale}#client-directory-client-${encodeURIComponent(clientId)}`,
        );
      return;
    }
    if (draftEditor) draftEditor.open = true;
    await tick();
    const control = draftEditorForm?.elements.namedItem(name);
    if (control instanceof HTMLElement) {
      control.focus({ preventScroll: true });
      control.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
  function previewInteractions(node: HTMLElement) {
    const listener = (event: Event) => previewClick(event as MouseEvent | KeyboardEvent);
    node.addEventListener('click', listener);
    node.addEventListener('keydown', listener);
    return {
      destroy() {
        node.removeEventListener('click', listener);
        node.removeEventListener('keydown', listener);
      },
    };
  }
  function previewClick(event: MouseEvent | KeyboardEvent): void {
    if (event instanceof KeyboardEvent && !['Enter', ' '].includes(event.key)) return;
    if (!(event.target instanceof Element)) return;
    const field = event.target.closest<HTMLElement>('[data-invoice-edit]');
    if (!field) {
      const source = event.target.closest<HTMLElement>('[data-invoice-source-id][role="link"]');
      if (source && canEditDraft) {
        event.preventDefault();
        void navigateConfiguration(
          `${base}/app/${source.dataset.invoiceSourceType === 'expense' ? 'expenses' : 'time'}/${encodeURIComponent(source.dataset.invoiceSourceId ?? '')}?lang=${locale}`,
        );
      }
      return;
    }
    event.preventDefault();
    void openPreviewField(field.dataset.invoiceEdit ?? '', field);
  }

  function invoicePdfStatus(row: Row): InvoicePdfStatus {
    const status = String(row.pdf_status ?? row.pdfStatus ?? '')
      .trim()
      .toLowerCase();
    if (status === 'ready') return 'ready';
    if (status === 'failed') return 'failed';
    if (status === 'rendering' || status === 'running' || status === 'processing') return 'running';
    if (status === 'queued' || status === 'pending') return 'queued';
    return 'unavailable';
  }

  function pdfStatusLabel(status: InvoicePdfStatus): string {
    return t(status === 'unavailable' ? 'Unavailable' : status);
  }

  function clearDraftPreviewObjectUrls(): void {
    for (const { url, timer } of draftPreviewObjectUrls) {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    }
    draftPreviewObjectUrls = [];
  }

  function cancelDraftPreview(): void {
    draftPreviewController?.abort();
    draftPreviewController = null;
    draftPreviewBusy = false;
    clearDraftPreviewObjectUrls();
  }

  function clearIssuedPdfObjectUrls(): void {
    for (const { url, timer, external } of issuedPdfObjectUrls) {
      if (external) continue;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    }
    issuedPdfObjectUrls = issuedPdfObjectUrls.filter((entry) => entry.external);
    securePdfPreviewUrl = '';
  }

  function cancelIssuedPdf(): void {
    issuedPdfController?.abort();
    issuedPdfController = null;
    issuedPdfPopup?.close();
    issuedPdfPopup = null;
    issuedPdfBusy = false;
    securePdfPreviewOpen = false;
    clearIssuedPdfObjectUrls();
  }

  beforeNavigate((navigation) => {
    if (
      hasUnsavedFormChanges(draftEditorForm) &&
      !window.confirm(t('You have unsaved changes. Leave without saving?'))
    ) {
      navigation.cancel();
      return;
    }
    cancelDraftPreview();
    cancelIssuedPdf();
  });

  const issuedPdfMessageKeys: Record<string, ProblemData['messageKey']> = {
    INVOICE_PDF_SIGN_IN_REQUIRED: 'problem.invoice.pdfSignInRequired',
    INVOICE_PDF_UNAVAILABLE: 'problem.invoice.pdfUnavailable',
    INVOICE_PDF_NOT_READY: 'problem.invoice.pdfNotReady',
    INVOICE_PDF_INTEGRITY_BLOCKED: 'problem.invoice.pdfIntegrityBlocked',
    INVOICE_PDF_SERVICE_UNAVAILABLE: 'problem.invoice.pdfServiceUnavailable',
  };
  const issuedPdfRemedyIds = new Set([
    'sign_in_again',
    'review_invoice',
    'review_billing',
    'contact_finance',
    'retry_download',
  ]);

  function issuedPdfFallback(
    kind: 'network' | 'invalid' | 'signIn' | 'popup',
    reference = '',
  ): ProblemData {
    const definition = (
      {
        network: [
          'INVOICE_PDF_NETWORK_UNAVAILABLE',
          'problem.invoice.pdfNetworkUnavailable',
          'retry_download',
        ],
        invalid: [
          'INVOICE_PDF_INVALID_RESPONSE',
          'problem.invoice.pdfInvalidResponse',
          'review_invoice',
        ],
        signIn: [
          'INVOICE_PDF_SIGN_IN_REQUIRED',
          'problem.invoice.pdfSignInRequired',
          'sign_in_again',
        ],
        popup: ['INVOICE_PDF_POPUP_BLOCKED', 'problem.invoice.pdfPopupBlocked', 'retry_download'],
      } as const
    )[kind];
    return {
      code: definition[0],
      messageKey: definition[1],
      params: {},
      fieldErrors: {},
      remedies: [{ id: definition[2] }],
      correlationId: /^[A-Za-z0-9._:-]{8,96}$/u.test(reference) ? reference : '',
    };
  }

  async function showIssuedPdfProblem(
    problem: ProblemData,
    controller: AbortController,
  ): Promise<void> {
    if (issuedPdfController !== controller || controller.signal.aborted) return;
    issuedPdfProblem = problem;
    await tick();
    if (issuedPdfController !== controller || controller.signal.aborted) return;
    const notice = issuedPdfNotice?.querySelector<HTMLElement>('[data-ui="problem-notice"]');
    notice?.focus({ preventScroll: true });
    const bounds = notice?.getBoundingClientRect();
    if (bounds && (bounds.top < 88 || bounds.bottom > window.innerHeight - 96))
      notice?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }

  function prepareIssuedPdfPopup(popup: Window): boolean {
    try {
      popup.opener = null;
      popup.document.title = t('PDF');
      popup.document.documentElement.lang = locale;
      const body = popup.document.body;
      body.replaceChildren();
      body.style.cssText = 'font: 1rem/1.5 system-ui, sans-serif; margin: 1.5rem; color: #181716';
      const status = popup.document.createElement('p');
      status.textContent = t('Loading');
      const fallback = popup.document.createElement('p');
      fallback.textContent = t('problem.invoice.pdfPreviewFallback');
      body.append(status, fallback);
      return true;
    } catch {
      popup.close();
      return false;
    }
  }

  function showIssuedPdfPopup(popup: Window, url: string, filename: string): boolean {
    try {
      const doc = popup.document;
      const body = doc.body;
      const status = body.querySelector('p');
      status?.remove();
      const link = doc.createElement('a');
      link.href = url;
      link.download = filename;
      link.textContent = t('Download PDF');
      link.style.cssText =
        'display: inline-block; margin: .5rem 0 1rem; min-height: 2.75rem; color: #0645ad';
      const frame = doc.createElement('iframe');
      frame.title = t('PDF');
      frame.style.cssText = 'display: block; width: 100%; height: 78vh; border: 1px solid #d6d5d2';
      body.append(link, frame);
      frame.src = url;
      return true;
    } catch {
      popup.close();
      return false;
    }
  }

  function onIssuedPdfRemedyClick(event: MouseEvent): void {
    if (!(event.target instanceof Element) || !issuedPdfNotice) return;
    const retry = event.target.closest<HTMLAnchorElement>('a[href="#invoice-issued-pdf-download"]');
    if (!retry || !issuedPdfNotice.contains(retry)) return;
    event.preventDefault();
    void getIssuedPdf('download');
  }

  function onIssuedPdfLinkClick(event: MouseEvent, mode: 'open' | 'download'): void {
    if (event.defaultPrevented || (event.button !== 0 && event.button !== 1)) return;
    event.preventDefault();
    void getIssuedPdf(mode);
  }

  async function getIssuedPdf(mode: 'open' | 'download' | 'embed'): Promise<void> {
    if (issuedPdfBusy || draftPreviewDisposed) return;
    if (mode === 'embed' && securePdfPreviewOpen) {
      securePdfPreviewOpen = false;
      const currentUrl = securePdfPreviewUrl;
      const entry = issuedPdfObjectUrls.find((item) => item.url === currentUrl);
      if (entry) clearTimeout(entry.timer);
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      issuedPdfObjectUrls = issuedPdfObjectUrls.filter((item) => item.url !== currentUrl);
      securePdfPreviewUrl = '';
      return;
    }
    const requestedInvoiceId = invoiceId;
    const controller = new AbortController();
    issuedPdfController = controller;
    issuedPdfBusy = true;
    issuedPdfProblem = null;
    issuedPdfOpenedFallback = false;
    let popup: Window | null = null;
    if (mode === 'open') {
      try {
        popup = window.open('about:blank', '_blank');
        if (popup && !prepareIssuedPdfPopup(popup)) popup = null;
      } catch {
        /* Browser popup policy. */
      }
      issuedPdfPopup = popup;
      if (!popup) {
        await showIssuedPdfProblem(issuedPdfFallback('popup'), controller);
        issuedPdfController = null;
        issuedPdfBusy = false;
        return;
      }
    }
    const stillCurrent = () =>
      !draftPreviewDisposed &&
      issuedPdfController === controller &&
      !controller.signal.aborted &&
      invoiceId === requestedInvoiceId;
    try {
      const response = await fetch(pdfUrl, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: { accept: 'application/pdf, application/json' },
      });
      if (!stillCurrent()) {
        popup?.close();
        return;
      }
      const reference = response.headers.get('x-correlation-id') ?? '';
      if (response.redirected) {
        const destination = new URL(response.url);
        popup?.close();
        await showIssuedPdfProblem(
          issuedPdfFallback(
            destination.origin === location.origin && destination.pathname.endsWith('/app/login')
              ? 'signIn'
              : 'invalid',
            reference,
          ),
          controller,
        );
        return;
      }
      if (!response.ok) {
        const payload = response.headers
          .get('content-type')
          ?.toLowerCase()
          .includes('application/json')
          ? await response.json().catch(() => null)
          : null;
        if (!stillCurrent()) {
          popup?.close();
          return;
        }
        popup?.close();
        await showIssuedPdfProblem(
          typedPrivateDownloadProblem(
            payload,
            issuedPdfMessageKeys,
            issuedPdfRemedyIds,
            reference,
          ) ?? issuedPdfFallback(response.status === 401 ? 'signIn' : 'invalid', reference),
          controller,
        );
        return;
      }
      const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      const disposition = response.headers.get('content-disposition');
      if (type !== 'application/pdf' || !disposition?.toLowerCase().startsWith('attachment')) {
        popup?.close();
        await showIssuedPdfProblem(issuedPdfFallback('invalid', reference), controller);
        return;
      }
      const file = await response.blob();
      if (!stillCurrent()) {
        popup?.close();
        return;
      }
      const length = response.headers.get('content-length');
      if (
        file.size < 8 ||
        (length && Number(length) !== file.size) ||
        (await file.slice(0, 5).text()) !== '%PDF-'
      ) {
        popup?.close();
        await showIssuedPdfProblem(issuedPdfFallback('invalid', reference), controller);
        return;
      }
      if (!stillCurrent()) {
        popup?.close();
        return;
      }
      const url = URL.createObjectURL(file);
      if (mode === 'embed') {
        if (securePdfPreviewUrl) {
          const old = issuedPdfObjectUrls.find((entry) => entry.url === securePdfPreviewUrl);
          if (old) clearTimeout(old.timer);
          URL.revokeObjectURL(securePdfPreviewUrl);
          issuedPdfObjectUrls = issuedPdfObjectUrls.filter(
            (entry) => entry.url !== securePdfPreviewUrl,
          );
        }
        securePdfPreviewUrl = url;
        securePdfPreviewOpen = true;
        issuedPdfObjectUrls.push({
          url,
          timer: window.setTimeout(() => {
            if (securePdfPreviewUrl !== url) URL.revokeObjectURL(url);
          }, 60_000),
        });
      } else {
        const releaseUrl = () => {
          clearTimeout(timer);
          URL.revokeObjectURL(url);
          issuedPdfObjectUrls = issuedPdfObjectUrls.filter((entry) => entry.url !== url);
        };
        const timer = window.setTimeout(releaseUrl, mode === 'open' ? 3_600_000 : 60_000);
        issuedPdfObjectUrls.push({ url, timer, external: mode === 'open' });
        if (mode === 'open' && popup) {
          if (
            showIssuedPdfPopup(
              popup,
              url,
              privateDownloadFilename(disposition, `invoice-${requestedInvoiceId}.pdf`),
            )
          ) {
            popup.addEventListener('pagehide', releaseUrl, { once: true });
            issuedPdfPopup = null;
            issuedPdfOpenedFallback = true;
          } else {
            await showIssuedPdfProblem(issuedPdfFallback('popup'), controller);
          }
        } else {
          const link = document.createElement('a');
          link.href = url;
          link.download = privateDownloadFilename(disposition, `invoice-${requestedInvoiceId}.pdf`);
          link.hidden = true;
          document.body.append(link);
          link.click();
          link.remove();
        }
      }
    } catch {
      popup?.close();
      if (stillCurrent()) await showIssuedPdfProblem(issuedPdfFallback('network'), controller);
    } finally {
      if (issuedPdfPopup === popup) issuedPdfPopup = null;
      if (issuedPdfController === controller) {
        issuedPdfController = null;
        issuedPdfBusy = false;
      }
    }
  }

  function previewNetworkProblem(): ProblemData {
    return {
      code: 'INVOICE_DRAFT_PREVIEW_NETWORK_UNAVAILABLE',
      messageKey: 'problem.invoiceDraftPreview.networkUnavailable',
      params: {},
      fieldErrors: {},
      remedies: [{ id: 'retry_preview' }],
      correlationId: '',
    };
  }

  function previewSignInProblem(): ProblemData {
    return {
      code: 'INVOICE_DRAFT_PREVIEW_SIGN_IN_REQUIRED',
      messageKey: 'problem.invoiceDraftPreview.signInRequired',
      params: {},
      fieldErrors: {},
      remedies: [{ id: 'sign_in_again' }],
      correlationId: '',
    };
  }

  function parseDraftPreviewProblem(payload: unknown): ProblemData {
    if (!payload || typeof payload !== 'object') return previewNetworkProblem();
    const candidate = payload as Partial<ProblemData>;
    if (
      typeof candidate.code !== 'string' ||
      !candidate.code.startsWith('INVOICE_DRAFT_PREVIEW_') ||
      typeof candidate.messageKey !== 'string' ||
      !candidate.messageKey.startsWith('problem.invoiceDraftPreview.')
    )
      return previewNetworkProblem();
    return {
      code: candidate.code,
      messageKey: candidate.messageKey as ProblemData['messageKey'],
      message: typeof candidate.message === 'string' ? candidate.message : undefined,
      params: candidate.params && typeof candidate.params === 'object' ? candidate.params : {},
      fieldErrors:
        candidate.fieldErrors && typeof candidate.fieldErrors === 'object'
          ? candidate.fieldErrors
          : {},
      remedies: Array.isArray(candidate.remedies) ? candidate.remedies : [],
      correlationId: typeof candidate.correlationId === 'string' ? candidate.correlationId : '',
    };
  }

  function showDraftPreviewProblem(problem: ProblemData): void {
    if (draftPreviewDisposed) return;
    draftPreviewProblem = problem;
    void tick().then(() => {
      if (!draftPreviewDisposed)
        draftPreviewNotice
          ?.querySelector<HTMLElement>('[data-ui="problem-notice"]')
          ?.focus({ preventScroll: true });
    });
  }

  function onDraftPreviewRemedyClick(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const retry = event.target.closest<HTMLAnchorElement>(
      'a[href="#invoice-draft-preview-action"]',
    );
    if (!retry || !draftPreviewNotice?.contains(retry)) return;
    event.preventDefault();
    void downloadDraftPreview();
  }

  function onDraftPreviewLinkClick(event: MouseEvent): void {
    if (draftPreviewBusy) {
      event.preventDefault();
      return;
    }
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    event.preventDefault();
    void downloadDraftPreview();
  }

  async function downloadDraftPreview(): Promise<void> {
    if (draftPreviewBusy || draftPreviewDisposed) return;
    const requestedInvoiceId = invoiceId;
    const requestedLocale = locale;
    const requestedVersion = String(invoice.version ?? '');
    const href = draftPreviewUrl;
    const controller = new AbortController();
    draftPreviewController = controller;
    const stillCurrent = () =>
      !draftPreviewDisposed &&
      draftPreviewController === controller &&
      !controller.signal.aborted &&
      invoiceId === requestedInvoiceId &&
      locale === requestedLocale &&
      String(invoice.version ?? '') === requestedVersion;
    draftPreviewBusy = true;
    draftPreviewProblem = null;
    try {
      const response = await fetch(href, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!stillCurrent()) return;
      if (response.redirected) {
        const destination = new URL(response.url);
        if (destination.origin === location.origin && destination.pathname.endsWith('/app/login')) {
          showDraftPreviewProblem(previewSignInProblem());
          return;
        }
      }
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (!response.ok) {
        const payload = contentType.includes('json')
          ? await response.json().catch(() => null)
          : null;
        if (stillCurrent()) showDraftPreviewProblem(parseDraftPreviewProblem(payload));
        return;
      }
      const disposition = response.headers.get('content-disposition') ?? '';
      const filename = disposition.match(/filename="?([^";]+)"?/iu)?.[1] ?? '';
      const expectedFilename = `draft-preview-${requestedInvoiceId}-${requestedLocale}.pdf`;
      if (!contentType.startsWith('application/pdf') || filename !== expectedFilename) {
        showDraftPreviewProblem(previewNetworkProblem());
        return;
      }
      const file = await response.blob();
      if (!stillCurrent()) return;
      if (file.size < 8) {
        showDraftPreviewProblem(previewNetworkProblem());
        return;
      }
      const header = await file.slice(0, 5).text();
      if (!stillCurrent()) return;
      if (header !== '%PDF-') {
        showDraftPreviewProblem(previewNetworkProblem());
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = expectedFilename;
      link.hidden = true;
      document.body.append(link);
      try {
        link.click();
      } finally {
        link.remove();
        const timer = window.setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
          draftPreviewObjectUrls = draftPreviewObjectUrls.filter((item) => item.url !== objectUrl);
        }, 60_000);
        draftPreviewObjectUrls.push({ url: objectUrl, timer });
      }
    } catch {
      if (stillCurrent()) showDraftPreviewProblem(previewNetworkProblem());
    } finally {
      if (draftPreviewController === controller) {
        draftPreviewController = null;
        draftPreviewBusy = false;
      }
    }
  }

  $effect(() => {
    pdfPolling.update(hasDraftPreview ? 'unavailable' : pdfStatus);
  });

  let previousDraftPreviewInvoiceId: string | undefined;
  $effect(() => {
    const currentInvoiceId = `${invoiceId}:${String(invoice.version ?? '')}`;
    if (
      previousDraftPreviewInvoiceId !== undefined &&
      previousDraftPreviewInvoiceId !== currentInvoiceId
    ) {
      cancelDraftPreview();
      draftPreviewProblem = null;
    }
    previousDraftPreviewInvoiceId = currentInvoiceId;
  });
  let previousIssuedPdfInvoiceId: string | undefined;
  $effect(() => {
    const currentInvoiceId = invoiceId;
    if (
      previousIssuedPdfInvoiceId !== undefined &&
      previousIssuedPdfInvoiceId !== currentInvoiceId
    ) {
      cancelIssuedPdf();
      issuedPdfProblem = null;
      issuedPdfOpenedFallback = false;
    }
    previousIssuedPdfInvoiceId = currentInvoiceId;
  });

  onMount(() => {
    localeOverride = resolveStandaloneLocale($page.url.searchParams.get('lang'), data.locale);
    persistStandaloneLocale(locale);
    applyStandaloneDocumentLocale(locale);
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'ja.portal.locale' || event.key === 'ja-portal-locale')
        localeOverride = resolveStandaloneLocale(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('click', onDraftPreviewRemedyClick);
    window.addEventListener('click', onIssuedPdfRemedyClick);
    return () => {
      draftPreviewDisposed = true;
      cancelDraftPreview();
      cancelIssuedPdf();
      pdfPolling.dispose();
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('click', onDraftPreviewRemedyClick);
      window.removeEventListener('click', onIssuedPdfRemedyClick);
    };
  });
  $effect(() => applyStandaloneDocumentLocale(locale));
</script>

<svelte:head
  ><title
    >{invoice.invoice_number || (isCreditNote ? q('draftCreditNote') : t('Draft invoice'))} | {invoice.project_number} | {t(
      'Invoice preview',
    )}</title
  ><link
    rel="stylesheet"
    href={`${base}/app/billing/invoices/${encodeURIComponent(invoiceId)}/preview-style`}
  /></svelte:head
>
{#snippet balanceBlock(balance: NonNullable<typeof invoiceBalance>)}
  <p class="invoice-lifecycle__balance" data-invoice-balance>
    {moneyText(locale, 'balance')}:
    <strong>{paymentFormat(balance.outstandingMinor, balance.currency)}</strong>
    {#if BigInt(balance.collectedMinor) > 0n}
      · {moneyText(locale, 'collected')}: {paymentFormat(balance.collectedMinor, balance.currency)}
    {/if}
    {#if BigInt(balance.creditedMinor ?? '0') > 0n}
      · {q('creditNotesApplied')}: −{paymentFormat(balance.creditedMinor, balance.currency)}
    {/if}
  </p>
  {#if balance.history?.length}
    <details class="invoice-lifecycle__help" data-invoice-payment-history>
      <summary>{q('historyTitle')} ({balance.history.length})</summary>
      <ul>
        {#each balance.history as item, index (index)}
          <li>
            {dateLabel(item.date)} · {q(item.kind === 'payment' ? 'historyPayment' : 'historyReversal')} ·
            {item.kind === 'reversal' ? '−' : ''}{paymentFormat(item.amountMinor, balance.currency)}
          </li>
        {/each}
      </ul>
    </details>
  {/if}
{/snippet}
<main class="invoice-preview-page">
  <header class="invoice-page-heading no-print">
    <h1>{invoice.invoice_number || (isCreditNote ? q('draftCreditNote') : t('Draft invoice'))}</h1>
    <p>
      {invoice.project_number}{#if invoice.project_name}
        · {invoice.project_name}{/if}
      {#if isCreditNote && invoice.credit_note_for_invoice_number}
        · {q('creditNoteOf').replace('{number}', String(invoice.credit_note_for_invoice_number))}{/if}
    </p>
    {#if !invoice.invoice_number && numberPreview?.number}
      <p class="invoice-page-heading__number" data-invoice-will-be>
        {q('willBeNumber').replace('{number}', String(numberPreview.number))}
      </p>
    {/if}
  </header>
  <nav class="detail-nav no-print" aria-label={t('Invoice')}>
    <a href={`${base}/app/billing?lang=${encodeURIComponent(locale)}`} data-origin-back
      ><DirectionIcon direction="left" /> {t('Billing')}</a
    ><button type="button" class="print-trigger" onclick={() => window.print()}
      ><PrintIcon /> {q('printDocument')}</button
    >
    <StatusBadge
      variant={invoiceStatusVariant(invoiceState)}
      text={invoiceState === 'paid'
        ? `✓ ${invoiceStatusLabel}`
        : overduePartlyPaid
          ? `${invoiceStatusLabel} · ${q('partlyPaidTitle')}`
          : invoiceStatusLabel}
      data-invoice-status={invoiceState}
    />
  </nav>
  {#if canManageInvoice && hasDraftPreview}
    <section
      class="invoice-lifecycle no-print"
      aria-labelledby="invoice-lifecycle-heading"
      data-invoice-lifecycle="issue"
    >
      {#if justCreated && invoiceState === 'draft'}
        <p class="invoice-lifecycle__notice" role="status">{q('createdNotice')}</p>
      {/if}
      {#if draftRefreshed && invoiceState === 'draft'}
        <p class="invoice-lifecycle__notice" role="status" data-invoice-refreshed>
          {q('draftRefreshed')}
        </p>
      {/if}
      <div class="invoice-lifecycle__row">
        <div class="invoice-lifecycle__summary">
          <p id="invoice-lifecycle-heading" class="invoice-lifecycle__eyebrow">
            {issueBlockers.length ? q('cannotIssue') : q('readyToIssue')}
          </p>
          <strong data-invoice-lifecycle-total={String(invoice.total_minor ?? '')}
            >{invoiceTotalText}</strong
          >
          <span
            >{invoice.client_legal_name || invoice.client_name} · {invoice.period_start} → {invoice.period_end}</span
          >
        </div>
        <button
          type="button"
          class="primary-button invoice-lifecycle__primary"
          disabled={issueBlockers.length > 0}
          onclick={() => issueDialog?.showModal()}
          data-invoice-issue-open>{q(isCreditNote ? 'issueCreditNoteButton' : 'issueButton')}</button
        >
      </div>
      {#if issueBlockers.length}
        <ul class="invoice-lifecycle__blockers">
          {#each issueBlockers as blocker, blockerIndex (blocker.code)}
            {#if blockerIndex === 1 && issueBlockers[0]?.code === 'stale_billing_configuration'}
              <li class="invoice-lifecycle__blockers-after">{q('refreshDraftAfter')}</li>
            {/if}
            <li data-invoice-blocker={blocker.code}>
              <span>{blocker.text}</span>
              {#if blocker.code === 'stale_billing_configuration' && invoiceState === 'draft'}
                <form
                  method="POST"
                  action="?/refreshInvoiceDraft"
                  data-invoice-refresh-draft
                  use:enhance={() => {
                    refreshingDraft = true;
                    return async ({ result, update }) => {
                      refreshingDraft = false;
                      if (result.type === 'redirect') {
                        await goto(result.location, { invalidateAll: true });
                        return;
                      }
                      await update({ reset: false });
                    };
                  }}
                >
                  <input type="hidden" name="version" value={String(invoice.version ?? '')} />
                  <button type="submit" class="secondary-button" disabled={refreshingDraft}
                    >{q('refreshDraft')}</button
                  >
                </form>
              {:else if blocker.href}<a class="secondary-button" href={blocker.href}
                  >{q(blocker.label)}</a
                >{/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="invoice-lifecycle__help">{q('issueHelp')}</p>
      {/if}
      {#if invoiceState === 'draft'}
        <details class="invoice-lifecycle__more">
          <summary>{q('moreActions')}</summary>
          <form
            method="POST"
            action="?/deleteInvoice"
            class="invoice-lifecycle__discard"
            use:enhance={() =>
              async ({ result, update }) => {
                if (result.type === 'success')
                  await goto(`${base}/app/billing?lang=${encodeURIComponent(locale)}`);
                else await update();
              }}
          >
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <input type="hidden" name="version" value={String(invoice.version ?? '')} />
            <p>{q('discardHelp')}</p>
            <label>
              <span>{q('discardReason')}</span>
              <input name="reason" required minlength="3" maxlength="2000" />
            </label>
            <button type="submit" class="secondary-button">{q('discard')}</button>
          </form>
        </details>
      {/if}
    </section>
    <dialog
      bind:this={issueDialog}
      class="invoice-issue-dialog no-print"
      aria-labelledby="invoice-issue-dialog-title"
      data-invoice-issue-dialog
    >
      <form
        method="POST"
        action="?/issueInvoice"
        use:enhance={() => {
          issueSubmitting = true;
          return async ({ update }) => {
            await update();
            issueSubmitting = false;
            issueDialog?.close();
          };
        }}
      >
        <h2 id="invoice-issue-dialog-title">{q(isCreditNote ? 'creditNoteConfirmTitle' : 'confirmTitle')}</h2>
        <dl>
          <div>
            <dt>{q('client')}</dt>
            <dd>{invoice.client_legal_name || invoice.client_name}</dd>
          </div>
          <div>
            <dt>{q('period')}</dt>
            <dd>{invoice.period_start} → {invoice.period_end}</dd>
          </div>
          {#if numberPreview?.number}
            <div>
              <dt>{q('numberOnIssue')}</dt>
              <dd>{numberPreview.number}</dd>
            </div>
          {/if}
          <div class="invoice-issue-dialog__total">
            <dt>{q('total')}</dt>
            <dd data-invoice-issue-confirm-total>{invoiceTotalText}</dd>
          </div>
        </dl>
        <p>{q('confirmBody')}</p>
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <input type="hidden" name="expectedTotalMinor" value={String(invoice.total_minor ?? '')} />
        <input type="hidden" name="reportLocale" value={locale} />
        <div class="invoice-issue-dialog__actions">
          <button type="button" class="secondary-button" onclick={() => issueDialog?.close()}
            >{q('cancel')}</button
          >
          <button type="submit" class="primary-button" disabled={issueSubmitting} data-invoice-issue-confirm
            >{issueSubmitting ? q('issuing') : q('confirmIssue')}</button
          >
        </div>
      </form>
    </dialog>
  {:else if canManageInvoice && ['issued', 'sent', 'partially_paid', 'overdue', 'paid'].includes(invoiceState)}
    <section
      class="invoice-lifecycle no-print"
      aria-labelledby="invoice-lifecycle-heading"
      data-invoice-lifecycle="issued"
    >
      <div class="invoice-lifecycle__row">
        <div class="invoice-lifecycle__summary">
          <p id="invoice-lifecycle-heading" class="invoice-lifecycle__eyebrow">
            {q(
              invoiceState === 'paid'
                ? 'paidTitle'
                : invoiceState === 'partially_paid'
                  ? 'partlyPaidTitle'
                  : invoiceState === 'overdue'
                    ? 'overdueTitle'
                    : invoiceState === 'sent'
                      ? 'sentTitle'
                      : isCreditNote
                        ? 'creditNoteIssuedTitle'
                        : 'issuedTitle',
            )}{overduePartlyPaid ? ` · ${q('partlyPaidTitle')}` : ''}{invoiceState === 'overdue' &&
            !invoiceSentAt
              ? ` · ${q('notSentYet')}`
              : ''} · {invoice.invoice_number}
          </p>
          <strong>{invoiceTotalText}</strong>
          <span
            >{invoice.client_legal_name || invoice.client_name} · {invoice.period_start} → {invoice.period_end}</span
          >
        </div>
        <div class="invoice-lifecycle__actions">
          {#if pdfStatus === 'ready'}
            <a
              class="primary-button"
              href={pdfUrl}
              download
              aria-disabled={issuedPdfBusy}
              data-invoice-lifecycle-pdf
              onclick={(event) => onIssuedPdfLinkClick(event, 'download')}
              onauxclick={(event) => onIssuedPdfLinkClick(event, 'download')}
              >{t('Download PDF')}</a
            >
          {/if}
          {#if !invoiceSentAt}
            <form method="POST" action="?/sendInvoice" use:enhance>
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <input type="hidden" name="idempotencyKey" value={sendKey} />
              <button
                type="submit"
                class="secondary-button"
                disabled={pdfStatus !== 'ready'}
                data-invoice-mark-sent>{q('markSent')}</button
              >
            </form>
          {/if}
          {#if invoiceBalance && BigInt(invoiceBalance.outstandingMinor) > 0n}
            <button
              type="button"
              class={paymentOpen ? 'secondary-button' : 'primary-button'}
              aria-expanded={paymentOpen}
              onclick={() => {
                paymentOpen = !paymentOpen;
                paymentNotice = '';
              }}
              data-invoice-record-payment>{moneyText(locale, 'recordPayment')}</button
            >
          {/if}
          <a
            class="secondary-button"
            href={`${base}/app/billing?invoice=${encodeURIComponent(invoiceId)}&lang=${locale}#invoice-collections`}
            >{q('payments')}</a
          >
        </div>
      </div>
      {#if invoiceBalance}{@render balanceBlock(invoiceBalance)}{/if}
      {#if paymentNotice}<p class="invoice-lifecycle__balance" role="status" data-invoice-payment-notice>{paymentNotice}</p>{/if}
      {#if paymentOpen && invoiceBalance && BigInt(invoiceBalance.outstandingMinor) > 0n}
        <RecordPaymentForm
          {invoiceId}
          currency={invoiceBalance.currency}
          outstandingMinor={invoiceBalance.outstandingMinor}
          action="?/recordPayment"
          {locale}
          money={paymentFormat}
          oncancel={() => (paymentOpen = false)}
          ondone={(message) => {
            paymentOpen = false;
            paymentNotice = message;
          }}
        />
      {/if}
      {#if invoiceSentAt}
        <p class="invoice-lifecycle__help" data-invoice-sent-at={invoiceSentAt}>
          ✓ {quickInvoiceFormat(locale, 'sentOn', { date: invoiceSentAt.slice(0, 10) })}
        </p>
      {:else}
        <p class="invoice-lifecycle__help" data-invoice-not-sent>
          {pdfStatus === 'ready' ? q('issuedHelp') : q('markSentWaiting')}
        </p>
      {/if}
    </section>
  {/if}
  {#if !canManageInvoice && invoiceBalance && ['issued', 'sent', 'partially_paid', 'overdue', 'paid'].includes(invoiceState)}
    <!-- T12 round 2: read-only roles see the balance, credit notes and payment history too. -->
    <section class="invoice-lifecycle no-print" aria-labelledby="invoice-readonly-heading" data-invoice-readonly-balance>
      <div class="invoice-lifecycle__summary">
        <p id="invoice-readonly-heading" class="invoice-lifecycle__eyebrow">
          {q(
            invoiceState === 'paid'
              ? 'paidTitle'
              : invoiceState === 'partially_paid'
                ? 'partlyPaidTitle'
                : invoiceState === 'overdue'
                  ? 'overdueTitle'
                  : invoiceState === 'sent'
                    ? 'sentTitle'
                    : isCreditNote
                      ? 'creditNoteIssuedTitle'
                      : 'issuedTitle',
          )} · {invoice.invoice_number}
        </p>
        <strong>{invoiceTotalText}</strong>
      </div>
      {@render balanceBlock(invoiceBalance)}
    </section>
  {/if}
  {#if canManageInvoice && invoiceState === 'void' && invoice.stream_type !== 'adjustment' && invoice.project_id && invoice.period_start && invoice.period_end}
    <section
      class="invoice-lifecycle no-print"
      aria-labelledby="invoice-void-heading"
      data-invoice-lifecycle="void"
    >
      <div class="invoice-lifecycle__row">
        <div class="invoice-lifecycle__summary">
          <p id="invoice-void-heading" class="invoice-lifecycle__eyebrow">
            {q('voidTitle')} · {invoice.invoice_number}
          </p>
          <strong>{invoiceTotalText}</strong>
          <span
            >{invoice.client_legal_name || invoice.client_name} · {invoice.period_start} → {invoice.period_end}</span
          >
        </div>
        <div class="invoice-lifecycle__actions">
          <a
            class="primary-button"
            href={`${base}/app/billing?${new URLSearchParams({
              project: String(invoice.project_id),
              newInvoice: '1',
              periodStart: String(invoice.period_start),
              periodEnd: String(invoice.period_end),
              ...(invoice.billing_rule_id ? { billingRuleId: String(invoice.billing_rule_id) } : {}),
              replaces: invoiceId,
              lang: locale,
            })}`}
            data-invoice-create-replacement>{q('createReplacement')}</a
          >
        </div>
      </div>
      <p class="invoice-lifecycle__help">{q('voidHelp')}</p>
    </section>
  {/if}
  {#if hasDraftPreview}
    <section class="invoice-pdf-panel no-print" aria-labelledby="invoice-pdf-heading">
      <div class="invoice-pdf-panel__heading">
        <div>
          <p class="invoice-pdf-panel__eyebrow">{t('PDF')}</p>
          <h2 id="invoice-pdf-heading">{t('Preview')}</h2>
        </div>
      </div>
      <p class="invoice-pdf-panel__help">{t('Draft')} · {t('Preview')}</p>
      {#if draftPreviewProblem}
        <div class="invoice-pdf-panel__problem" bind:this={draftPreviewNotice}>
          <ProblemNotice
            problem={draftPreviewProblem}
            kind="error"
            remedyLinks={draftPreviewRemedies}
          />
        </div>
      {/if}
      <a
        id="invoice-draft-preview-action"
        class="invoice-pdf-panel__action"
        href={draftPreviewUrl}
        download
        aria-disabled={draftPreviewBusy}
        onclick={onDraftPreviewLinkClick}
        >{draftPreviewBusy ? t('Loading') : t('Download PDF')} · {t('Preview')}</a
      >
    </section>
  {:else}
    <section class="invoice-pdf-panel no-print" aria-labelledby="invoice-pdf-heading">
      <div class="invoice-pdf-panel__heading">
        <div>
          <p class="invoice-pdf-panel__eyebrow">{t('PDF')}</p>
          <h2 id="invoice-pdf-heading">{t('Invoice')} · {t('PDF')}</h2>
        </div>
        <span
          class="invoice-pdf-panel__status"
          data-invoice-pdf-status={pdfStatus}
          aria-live="polite">{t('PDF')} · {pdfStatusLabel(pdfStatus)}</span
        >
      </div>
      {#if pdfStatus === 'ready'}
        {#if issuedPdfProblem}
          <div
            class="invoice-pdf-panel__problem"
            bind:this={issuedPdfNotice}
            data-invoice-pdf-problem
          >
            <ProblemNotice
              problem={issuedPdfProblem}
              kind="error"
              remedyLinks={issuedPdfRemedies}
              {locale}
            />
          </div>
        {/if}
        <div class="invoice-pdf-panel__actions">
          <button
            type="button"
            class="invoice-pdf-panel__action"
            aria-controls="invoice-pdf-frame"
            aria-expanded={securePdfPreviewOpen}
            disabled={issuedPdfBusy}
            onclick={() => void getIssuedPdf('embed')}
            >{issuedPdfBusy
              ? t('Loading')
              : securePdfPreviewOpen
                ? t('Close')
                : t('action.billing.pdfViewHere')}</button
          >
          <a
            class="invoice-pdf-panel__action invoice-pdf-panel__action--secondary"
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={issuedPdfBusy}
            onclick={(event) => onIssuedPdfLinkClick(event, 'open')}
            onauxclick={(event) => onIssuedPdfLinkClick(event, 'open')}>{t('Open PDF')}</a
          >
          <a
            id="invoice-issued-pdf-download"
            class="invoice-pdf-panel__action invoice-pdf-panel__action--secondary"
            href={pdfUrl}
            download
            aria-disabled={issuedPdfBusy}
            onclick={(event) => onIssuedPdfLinkClick(event, 'download')}
            onauxclick={(event) => onIssuedPdfLinkClick(event, 'download')}>{t('Download PDF')}</a
          >
        </div>
        {#if issuedPdfOpenedFallback || securePdfPreviewOpen}
          <p class="invoice-pdf-panel__fallback" role="status">
            {t('problem.invoice.pdfPreviewFallback')}
            <a
              href={pdfUrl}
              download
              onclick={(event) => onIssuedPdfLinkClick(event, 'download')}
              onauxclick={(event) => onIssuedPdfLinkClick(event, 'download')}>{t('Download PDF')}</a
            >
          </p>
        {/if}
        {#if securePdfPreviewOpen && securePdfPreviewUrl}
          <div class="invoice-pdf-panel__frame-wrap">
            <iframe
              id="invoice-pdf-frame"
              title={`${t('PDF')} · ${invoice.invoice_number || t('PREVIEW')}`}
              src={securePdfPreviewUrl}
              loading="lazy"
            ></iframe>
          </div>
        {/if}
      {:else if pdfStatus === 'queued'}
        <p class="invoice-pdf-panel__message" role="status" aria-live="polite">
          {t(pdfStatus)} · {t('Loading')}
        </p>
      {:else if pdfStatus === 'running'}
        <p class="invoice-pdf-panel__message" role="status" aria-live="polite">
          {t(pdfStatus)} · {t('Loading')}
        </p>
      {:else if pdfStatus === 'failed'}
        <p class="invoice-pdf-panel__message invoice-pdf-panel__message--error" role="alert">
          {t('Failed')} · {t('Error')}
        </p>
      {:else if pdfStatus === 'unavailable'}
        <p class="invoice-pdf-panel__message" role="status">{t('Unavailable')}</p>
      {/if}
      <details class="invoice-pdf-panel__languages localized-pdf-slot" data-invoice-pdf-languages>
        <summary>{q('pdfOtherLanguages')}</summary>
        <LocalizedPdfPanel ownerType="invoice" ownerId={invoiceId} {locale} title={q('pdfOtherLanguages')} />
      </details>
    </section>
  {/if}
  {#if legacyDiscountMismatch}
    <p class="no-print" role="alert">
      {t(
        'This invoice contains a legacy discount that does not reconcile with its saved total. The saved amounts have not been changed. Ask Finance to review the source calculation before issuing or replacing this invoice.',
      )}
    </p>
  {/if}
  {#if draftDetailsProblem}
    <div class="no-print" bind:this={draftDetailsNotice} tabindex="-1" data-invoice-details-problem>
      <ProblemNotice
        problem={draftDetailsProblem}
        {locale}
        remedyLinks={{
          review_invoice: {
            label: t('Review invoice'),
            href: `${base}/app/billing/invoices/${encodeURIComponent(invoiceId)}?lang=${locale}`,
            reload: true,
          },
        }}
      />
    </div>
  {:else if standaloneActionMessage(locale, form) && !paymentNotice}
    <p class="no-print invoice-action-status" role="status">{standaloneActionMessage(locale, form)}</p>
  {/if}
  {#if retainedDraftValues.length}
    <section class="detail-panel no-print" data-invoice-retained-customizations>
      <h2>{t('problem.expenseDetail.retainedValuesTitle')}</h2>
      <p>{t('Copy these values before reviewing the current invoice.')}</p>
      <dl>
        {#each retainedDraftValues as [name, label]}
          <div data-invoice-retained-field={name}>
            <dt>{t(label)}</dt>
            <dd>{draftDetailsForm?.values?.[name] || '—'}</dd>
          </div>
        {/each}
      </dl>
    </section>
  {/if}
  {#if hasDraftPreview}
    <details
      id="invoice-numbering-summary"
      class="detail-panel no-print invoice-source-guidance"
      bind:this={numberingSummary}
    >
      <summary>{t('Invoice numbering policy')}</summary>
      <p>{t('invoice.provisionalNumberHelp')}</p>
      {#if numberPreview?.policy}
        <dl>
          <div>
            <dt>{t('Invoice number')}</dt>
            <dd>{numberPreview.number || '—'}</dd>
          </div>
          <div>
            <dt>{t('Prefix')}</dt>
            <dd>{numberPreview.policy.prefix}</dd>
          </div>
          <div>
            <dt>{t('Digits')}</dt>
            <dd>{numberPreview.policy.digits}</dd>
          </div>
          <div>
            <dt>{t('Effective from')}</dt>
            <dd>{numberPreview.policy.effectiveFrom}</dd>
          </div>
        </dl>
      {:else}<p>{t('invoice.numberingNotConfigured')}</p>{/if}
      {#if String(data.user?.role) === 'owner_admin'}
        <a href={numberingHref}>{t('Invoice numbering policy')}</a>
      {:else}<p>{t('invoice.numberingOwnerOnly')}</p>{/if}
    </details>
  {/if}
  {#if invoiceState === 'draft' && canEditDraft}
    {#key `${invoiceId}:${invoice.version}:${draftDetailsForm?.correlationId ?? ''}`}
      <details
        id="invoice-draft-details"
        tabindex="-1"
        bind:this={draftEditor}
        class="no-print draft-edit-details"
        open={Boolean(draftDetailsProblem) || $page.url.searchParams.get('edit') === '1'}
      >
        <summary class="draft-edit-summary"
          >⚙ {t('Edit invoice dates, payment terms and details')}</summary
        >
        <form
          method="POST"
          action="?/updateInvoiceDraftDetails"
          class="draft-edit-form"
          bind:this={draftEditorForm}
          use:formValidation
          use:dirtyFormGuard={{ initialDirty: Boolean(draftDetailsProblem) }}
          use:enhance={({ cancel }) => {
            if (detailsSaving) {
              cancel();
              return;
            }
            detailsSaving = true;
            return async ({ update }) => {
              try {
                await update({ reset: false });
              } finally {
                detailsSaving = false;
              }
            };
          }}
        >
          <fieldset class="invoice-editor-fields" disabled={detailsSaving}>
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <input
              type="hidden"
              name="expectedVersion"
              value={draftValue('expectedVersion', invoice.version)}
            />
            <input
              type="hidden"
              name="expectedBillingRuleVersion"
              value={draftValue('expectedBillingRuleVersion', invoice.billing_rule_version)}
            />
            <input
              type="hidden"
              name="expectedProjectVersion"
              value={draftValue('expectedProjectVersion', invoice.project_version)}
            />
            <input
              type="hidden"
              name="expectedIssuerSettingsVersion"
              value={draftValue(
                'expectedIssuerSettingsVersion',
                invoice.issuer_settings_version ?? 0,
              )}
            />
            <p>
              {t(
                'Select a field in the preview to edit it here. Save updates the preview immediately.',
              )}
            </p>
            <p>
              {t(
                'Invoice numbers are assigned on issuance. Hours, rates and totals must be changed in their source records and recalculated.',
              )}
            </p>
            <div class="draft-edit-grid">
              <div class="draft-field">
                <label for="edit-invoice-date">{t('Invoice Date')}</label>
                <input
                  id="edit-invoice-date"
                  name="invoiceDate"
                  type="date"
                  required
                  value={draftValue(
                    'invoiceDate',
                    documentSnapshot.invoiceDate ?? documentSnapshot.issueDate,
                  )?.slice(0, 10)}
                />
              </div>
              <div class="draft-field">
                <label for="edit-due-date">{t('Due Date')}</label>
                <input
                  id="edit-due-date"
                  name="dueDate"
                  type="date"
                  value={draftValue('dueDate', invoice.due_date_override)?.slice(0, 10)}
                />
                <small>{t('Leave empty to calculate from invoice date and payment terms.')}</small>
              </div>
              <div class="draft-field">
                <label for="edit-payment-terms">{t('Payment terms (days)')}</label>
                <input
                  id="edit-payment-terms"
                  name="paymentTermsDays"
                  type="number"
                  min="0"
                  max="365"
                  step="1"
                  required
                  value={draftValue('paymentTermsDays', documentSnapshot.paymentTermsDays ?? 30)}
                />
              </div>
              <div class="draft-field">
                <label for="edit-purchase-no">{t('Purchase No.')}</label>
                <input
                  id="edit-purchase-no"
                  name="purchaseNo"
                  type="text"
                  value={draftValue(
                    'purchaseNo',
                    invoice.purchase_no !== '—' ? invoice.purchase_no : '',
                  )}
                  placeholder={fixText('purchaseNoPlaceholder')}
                />
              </div>
              <div class="draft-field full-width">
                <label class="draft-checkbox">
                  <input type="checkbox" name="applyToFutureInvoices" data-apply-future-invoices />
                  <span>{t('Also use for future invoices of this project')}</span>
                </label>
                <small
                  >{t(
                    'Unchecked: the purchase number and payment terms change on this draft only.',
                  )}</small
                >
              </div>
              <!-- T93: no discount is configurable anywhere, so an empty read-only field is
                   only shown when a (legacy) discount exists on this draft. -->
              {#if defaultDiscount !== '0.00' && defaultDiscount !== '0'}
              <div class="draft-field">
                <label for="edit-discount">{t('Discount Amount')}</label>
                <input
                  id="edit-discount"
                  name="discount"
                  type="text"
                  value={draftValue('discount', defaultDiscount)}
                  placeholder="0.00"
                  readonly
                  aria-describedby="discount-help"
                />
                <small id="discount-help"
                  >{t(
                    'Discounts must be applied through billing calculation so taxes and totals remain correct.',
                  )}</small
                >
              </div>
              {/if}
              <div class="draft-field full-width">
                <label for="edit-past-due">{t('Past Due Notice')}</label>
                <textarea
                  id="edit-past-due"
                  name="pastDueNotice"
                  rows="3"
                  maxlength="2000"
                  value={draftValue('pastDueNotice', invoice.terms_and_instructions?.pastDueNotice)}
                ></textarea>
              </div>
            </div>
            <section class="invoice-source-guidance" data-company-wide-details>
              <h4>{fixText('companyWideTitle')}</h4>
              <p>{fixText('companyWideHelp')}</p>
              {#if String(data.user?.role ?? '') !== 'owner_admin'}
                <p>{fixText('companyWideFinanceNote')}</p>
              {/if}
              <a href={issuerSettingsHref}>{fixText('companyWideOwnerLink')}</a>
            </section>
            <p>
              {t(
                'Invoice and due dates apply to this draft. Issued invoices keep their original data.',
              )}
            </p>
            <button type="submit" class="save-draft-btn" disabled={detailsSaving}
              >{detailsSaving ? t('Saving') : t('Save Details')}</button
            >
          </fieldset>
        </form>
      </details>
    {/key}
  {/if}

  {#if invoice.source_settings_changed && ['draft', 'approved'].includes(invoiceState)}
    <section class="detail-panel no-print invoice-source-guidance" role="status">
      <p>{t('invoice.sourceSettingsChanged')}</p>
      {#if ['owner_admin', 'finance_admin'].includes(String(data.user?.role ?? ''))}
        <a
          href={`${base}/app/billing?view=invoices&project=${encodeURIComponent(String(invoice.project_id ?? ''))}&lang=${locale}`}
          >{t('Rebuild invoice draft')}</a
        >
      {/if}
    </section>
  {/if}
  {#if canEditDraft}
    <details
      class="detail-panel no-print invoice-source-guidance"
      aria-label={t('Edit invoice sources')}
    >
      <summary>{q('streamSettings')} · {t('Edit hours, expenses and billing source records')}</summary>
      {#if !invoice.resolved_legal_entity_revision_id || Number(invoice.canonical_assignment_matches) !== 1}
        <p role="status">
          {t('Assign a reviewed project issuing authority before issuing this invoice.')}
        </p>
      {/if}
      <p>
        {t(
          'Select underlined preview fields to edit. Calculated values follow their approved source records.',
        )}
      </p>
      <div class="invoice-source-links">
        <a
          href={`${base}/app/billing?view=streams&project=${encodeURIComponent(String(invoice.project_id ?? ''))}&focus=${encodeURIComponent(String(invoice.billing_rule_id ?? ''))}&lang=${locale}#billing-stream-${encodeURIComponent(String(invoice.billing_rule_id ?? ''))}`}
          >{q('streamSettings')}</a
        >
        <a
          href={`${base}/app/billing?view=setup&issuerSettings=${encodeURIComponent(String(invoice.issuer_legal_entity_id ?? ''))}&lang=${locale}#issuer-document-settings`}
          >{t('issuerSettings.title')}</a
        >
        <a
          href={String(data.user?.role) === 'owner_admin'
            ? numberingHref
            : '#invoice-numbering-summary'}
          >{String(data.user?.role) === 'owner_admin'
            ? t('Billing configuration and numbering')
            : t('Invoice numbering policy')}</a
        >
        <a href={projectHref}>{t('Project and client')}</a>
        <a href={`${financeHref}#project-issuing-authority`}>{t('Issuing authority')}</a>
      </div>
      <details>
        <summary>{t('Edit hours, expenses and billing source records')}</summary>
        <p>
          {t(
            'After changing an approved source, rebuild the draft from Billing to update its calculated lines.',
          )}
        </p>
        <ul>
          {#each preview.lines.filter( (line) => ['time', 'time_entry', 'expense'].includes(String(line.source_type)), ) as line}
            <li>
              <a
                href={`${base}/app/${String(line.source_type) === 'expense' ? 'expenses' : 'time'}/${encodeURIComponent(String(line.source_id ?? ''))}?lang=${locale}`}
                >{String(line.description ?? t('Source record'))}</a
              >
            </li>
          {/each}
        </ul>
        <a
          href={`${base}/app/billing?project=${encodeURIComponent(String(invoice.project_id ?? ''))}&lang=${locale}`}
          >{t('Rebuild invoice draft')}</a
        >
      </details>
    </details>
  {/if}
  {#if canEditDraft}
    <p class="no-print invoice-inline-hint" data-invoice-inline-hint>
      {t('Click any underlined text or a line of the invoice to change it.')}
    </p>
  {:else if isOwner && !hasDraftPreview && !['void', 'superseded'].includes(invoiceState)}
    <details
      class="no-print invoice-issued-correction"
      id="invoice-issued-correction"
      bind:open={issuedCorrectionOpen}
    >
      <summary>{t('Correct this issued invoice')}</summary>
      <p>
        {canCorrectIssued
          ? t(
              'Click any underlined value or a line of the invoice to correct it. Each save keeps the same invoice number and creates a new version; earlier versions and their PDFs stay in the history.',
            )
          : t(
              'Only the owner can correct an issued invoice. The correction keeps the same invoice number and adds a new version; earlier versions and their PDFs stay in the history.',
            )}
      </p>
    </details>
  {/if}
  {#if correctionNotice}
    <p class="no-print invoice-correction-email" role="status" data-invoice-correction-saved>
      {correctionNotice}
    </p>
  {/if}
  {#if versionHistory.length > 1}
    <section class="no-print invoice-version-history" data-invoice-version-history>
      <h2>{t('Versions of this invoice')}</h2>
      <ol>
        {#each [...versionHistory].reverse() as version (version.revisionNumber)}
          <li data-invoice-version={version.revisionNumber}>
            <div>
              <strong>
                {t('Version {version}').replace('{version}', String(version.revisionNumber))}
                · {version.invoiceNumber}
              </strong>
              {#if version.current}
                <span class="invoice-version-history__current">{t('current')}</span>
              {/if}
            </div>
            <p>
              {#if version.replacedAt}
                {t('Replaced on {date}').replace('{date}', String(version.replacedAt).slice(0, 10))}
              {:else}
                {t('Saved on {date}').replace('{date}', String(version.createdAt).slice(0, 10))}
              {/if}
              {#if version.createdBy}· {version.createdBy}{/if}
              · {paymentMoney(version.totalMinor, version.currency, documentLanguage(locale))}
              {#if version.reason}· {version.reason}{/if}
            </p>
            {#if version.pdfReady}
              <a
                href={`${base}/app/api/invoices/${encodeURIComponent(invoiceId)}/pdf?version=${version.revisionNumber}`}
                download
                data-invoice-version-pdf={version.revisionNumber}
              >{t('Download PDF')} ({t('Version {version}').replace('{version}', String(version.revisionNumber))})</a>
            {:else}
              <span>{t('PDF not ready yet')}</span>
            {/if}
          </li>
        {/each}
      </ol>
    </section>
  {/if}
  <dialog
    bind:this={inlineDialog}
    class="no-print invoice-inline-editor"
    aria-labelledby="invoice-inline-editor-title"
    onclose={() => {
      inlineEditor = null;
      inlineError = '';
    }}
  >
    {#if inlineEditor}
      {@const editor = inlineEditor}
      <form
        method="POST"
        action={editor.issued ? '?/correctIssuedInvoice' : '?/editInvoiceField'}
        use:enhance={() => {
          inlineSaving = true;
          inlineError = '';
          return async ({ result, update }) => {
            inlineSaving = false;
            if (result.type === 'failure') {
              const data = result.data as Record<string, unknown> | undefined;
              inlineError =
                (typeof data?.inlineMessage === 'string' && data.inlineMessage) ||
                standaloneActionMessage(locale, result.data) ||
                t('The change was not saved.');
              return;
            }
            if (editor.issued && result.type === 'success') {
              const data = (result.data ?? {}) as Record<string, unknown>;
              // The saved message itself comes from the action; only the email outcome is added.
              correctionNotice =
                typeof data.email === 'string' && data.email !== 'queued'
                  ? t('The corrected invoice email was not queued.')
                  : data.email === 'queued'
                    ? t('The corrected invoice email is queued.')
                    : '';
            }
            closeInlineEditor();
            await update({ reset: false });
          };
        }}
      >
        <h2 id="invoice-inline-editor-title">{editor.label}</h2>
        <input type="hidden" name="field" value={editor.field} />
        <input type="hidden" name="revision" value={String(currentRevision)} />
        <input type="hidden" name="version" value={String(invoice.version ?? '')} />
        <input type="hidden" name="lineId" value={editor.lineId ?? ''} />
        <input type="hidden" name="lineKey" value={editor.lineKey ?? ''} />
        <input
          type="hidden"
          name="legalEntityId"
          value={String(invoice.issuer_legal_entity_id ?? '')}
        />
        <input type="hidden" name="currency" value={String(invoice.currency ?? '')} />
        <input
          type="hidden"
          name="settingsVersion"
          value={String(invoice.issuer_settings_version ?? 0)}
        />
        <input type="hidden" name="projectVersion" value={String(invoice.project_version ?? '')} />
        <input
          type="hidden"
          name="billingRuleVersion"
          value={String(invoice.billing_rule_version ?? '')}
        />
        {#if editor.kind === 'line'}
          <input type="hidden" name="originalDescription" value={editor.value} />
          <input type="hidden" name="originalHours" value={editor.hours ?? ''} />
          <input type="hidden" name="originalRate" value={editor.rate ?? ''} />
          <label>
            <span>{t('Description')}</span>
            <input name="description" value={editor.value} maxlength="500" required />
          </label>
          {#if editor.isHoursLine}
            <div class="invoice-inline-editor__pair">
              <label>
                <span>{t('Hours')}</span>
                <input
                  name="hours"
                  inputmode="decimal"
                  value={editor.hours}
                />
              </label>
              <label>
                <span>{t('Rate')} ({String(invoice.currency ?? '')})</span>
                <input
                  name="rate"
                  inputmode="decimal"
                  value={editor.rate}
                />
              </label>
            </div>
          {:else if editor.issued && editor.amount}
            <input type="hidden" name="originalAmount" value={editor.amount} />
            <label>
              <span>{t('Amount')} ({String(invoice.currency ?? '')})</span>
              <input name="amount" inputmode="decimal" value={editor.amount} />
            </label>
          {/if}
        {:else if editor.kind === 'textarea'}
          <label>
            <span>{editor.label}</span>
            <textarea name="value" rows="4" maxlength="2000">{editor.value}</textarea>
          </label>
        {:else}
          <label>
            <span>{editor.label}</span>
            <input
              name="value"
              type={editor.kind}
              value={editor.value}
              min={editor.kind === 'number' ? 0 : undefined}
              max={editor.kind === 'number' ? 365 : undefined}
              maxlength={editor.kind === 'text' ? 500 : undefined}
            />
          </label>
        {/if}
        {#if editor.alsoLabel}
          <label class="invoice-inline-editor__also">
            <input type="checkbox" name="alsoUpdateRecord" />
            <span>{editor.alsoLabel}</span>
          </label>
        {/if}
        {#if editor.note}<p class="invoice-inline-editor__note">{editor.note}</p>{/if}
        {#if editor.issued}
          <p class="invoice-inline-editor__note" data-invoice-correction-note>
            {t('Saving creates version {next} of this invoice. Version {current} and its PDF stay in the history.')
              .replace('{next}', String(currentRevision + 1))
              .replace('{current}', String(currentRevision))}
          </p>
          <label>
            <span>{t('Reason (optional)')}</span>
            <input name="reason" maxlength="500" />
          </label>
          <label class="invoice-inline-editor__also">
            <input type="checkbox" name="sendCorrected" />
            <span>{t('Send the corrected invoice to the client')}</span>
          </label>
          <label>
            <span>{t('Client email')}</span>
            <input
              name="recipient"
              type="email"
              value={String(invoice.billing_email ?? '')}
              maxlength="254"
            />
          </label>
        {/if}
        {#if inlineError}<p class="invoice-inline-editor__error" role="alert">{inlineError}</p>{/if}
        <div class="invoice-inline-editor__actions">
          <button type="submit" disabled={inlineSaving}
            >{inlineSaving ? t('Saving') : t('Save')}</button
          >
          <button type="button" class="secondary-button" onclick={closeInlineEditor}
            >{t('Cancel')}</button
          >
          {#if editor.sourceHref}
            <a href={editor.sourceHref}>{t('Open source record')}</a>
          {/if}
        </div>
      </form>
    {/if}
  </dialog>
  <div
    class="invoice-document-shell"
    use:previewInteractions
    role="group"
    aria-label={t('Invoice preview')}
  >
    {@html documentPreview.bodyHtml}
  </div>
</main>

<style>
  .invoice-correction-email {
    max-width: 70rem;
    margin: 0.5rem auto;
    padding: 0.5rem 1rem;
    border-radius: var(--ja-radius, 1rem);
    background: var(--ja-surface, #fff);
    color: var(--ja-text, #1f1f1b);
  }
  .invoice-version-history {
    max-width: 70rem;
    margin: 0.5rem auto;
    padding: 0.75rem 1rem;
    border: 1px solid var(--ja-border-strong, #d1d1c9);
    border-radius: var(--ja-radius, 1rem);
    background: var(--ja-surface, #fff);
  }
  .invoice-version-history h2 {
    font-size: 1rem;
    margin: 0 0 0.5rem;
  }
  .invoice-version-history ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }
  .invoice-version-history li p {
    margin: 0.25rem 0;
    color: var(--ja-text-secondary, #55554d);
    overflow-wrap: anywhere;
  }
  .invoice-version-history a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }
  .invoice-version-history__current {
    margin-inline-start: 0.5rem;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    background: var(--ja-surface-muted, #f1efe7);
    font-size: 0.8rem;
  }
  .invoice-inline-hint {
    max-width: 70rem;
    margin: 0.5rem auto;
    padding: 0 1rem;
    color: var(--ja-text-secondary, #55554d);
  }
  .invoice-issued-correction {
    max-width: 70rem;
    margin: 0.5rem auto;
    padding: 0.75rem 1rem;
    border: 1px solid var(--ja-border-strong, #d1d1c9);
    border-radius: var(--ja-radius, 1rem);
    background: var(--ja-surface, #fff);
  }
  .invoice-issued-correction summary {
    cursor: pointer;
    font-weight: 600;
    min-height: 44px;
    display: flex;
    align-items: center;
  }
  .invoice-inline-editor {
    position: fixed;
    inset: 0;
    margin: auto;
    height: fit-content;
    max-height: calc(100dvh - 2rem);
    overflow: auto;
    width: min(32rem, calc(100vw - 2rem));
    border: 1px solid var(--ja-border-strong, #d1d1c9);
    border-radius: var(--ja-radius, 1rem);
    padding: 1.1rem;
    background: var(--ja-surface, #fff);
    color: var(--ja-text-primary, #20201d);
  }
  .invoice-inline-editor::backdrop {
    background: rgb(0 0 0 / 0.35);
  }
  .invoice-inline-editor form {
    display: grid;
    gap: 0.8rem;
  }
  .invoice-inline-editor h2 {
    margin: 0;
    font-size: 1.15rem;
  }
  .invoice-inline-editor label {
    display: grid;
    gap: 0.3rem;
  }
  .invoice-inline-editor input:not([type='checkbox']),
  .invoice-inline-editor textarea {
    min-height: 44px;
    font: inherit;
    padding: 0.5rem 0.65rem;
    width: 100%;
    box-sizing: border-box;
  }
  .invoice-inline-editor__pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }
  .invoice-inline-editor label.invoice-inline-editor__also {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
  }
  .invoice-inline-editor__also input {
    width: 1.25rem;
    height: 1.25rem;
  }
  .invoice-inline-editor__note {
    margin: 0;
    color: var(--ja-text-secondary, #55554d);
    font-size: 0.92rem;
  }
  .invoice-inline-editor__error {
    margin: 0;
    color: var(--ja-danger, #a1261b);
    font-weight: 600;
  }
  .invoice-inline-editor__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
  }
  .invoice-inline-editor__actions button {
    min-height: 44px;
    padding: 0 1.1rem;
  }
  .invoice-lifecycle {
    display: grid;
    gap: 0.75rem;
    max-width: 70rem;
    margin: 1rem auto;
    padding: 1rem 1.1rem;
    border: 1px solid var(--ja-border-strong, #d1d1c9);
    border-radius: var(--ja-radius, 1rem);
    background: var(--ja-surface, #fff);
    color: var(--ja-text-primary, #20201d);
    box-shadow: 0 0.6rem 1.6rem rgb(0 0 0 / 0.18);
  }
  .invoice-lifecycle__notice {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border-radius: 0.6rem;
    background: var(--ja-surface-raised, #eeeee9);
    font-weight: 700;
  }
  .invoice-lifecycle__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem 1.5rem;
  }
  .invoice-lifecycle__summary {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .invoice-lifecycle__eyebrow {
    margin: 0;
    color: var(--ja-text-secondary, #57574f);
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .invoice-lifecycle__summary strong {
    font-size: clamp(1.5rem, 5vw, 2rem);
    font-variant-numeric: tabular-nums;
  }
  .invoice-lifecycle__summary span {
    color: var(--ja-text-secondary, #57574f);
    font-size: 0.85rem;
  }
  .invoice-lifecycle__primary {
    min-width: 12rem;
    font-size: 0.95rem;
  }
  .invoice-lifecycle__primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .invoice-lifecycle__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .invoice-lifecycle__balance {
    margin: 0.6rem 0 0;
    font-variant-numeric: tabular-nums;
  }
  .invoice-action-status {
    margin: 0.75rem 0;
    padding: 0.6rem 0.9rem;
    border-radius: 0.6rem;
    background: var(--ja-surface, #fff);
    color: var(--ja-text, #1c1c19);
    border: 1px solid var(--ja-border-subdued, #e4e4df);
  }
  .invoice-pdf-panel__languages {
    margin-top: 0.9rem;
  }
  .invoice-pdf-panel__languages > summary {
    cursor: pointer;
    min-height: 44px;
    display: flex;
    align-items: center;
    font-weight: 600;
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .invoice-lifecycle__help {
    margin: 0;
    color: var(--ja-text-secondary, #57574f);
    font-size: 0.85rem;
  }
  .invoice-lifecycle__blockers {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0.75rem;
    list-style: none;
    border-radius: 0.6rem;
    border: 1px solid color-mix(in srgb, var(--ja-status-warning, #d97706) 45%, white);
    background: color-mix(in srgb, var(--ja-status-warning, #d97706) 8%, white);
  }
  .invoice-lifecycle__blockers-after {
    font-weight: 600;
  }
  .invoice-lifecycle__blockers li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.85rem;
  }
  .invoice-lifecycle__more summary {
    cursor: pointer;
    min-height: 2.75rem;
    display: flex;
    align-items: center;
    font-size: 0.85rem;
    font-weight: 700;
  }
  .invoice-lifecycle__discard {
    display: grid;
    gap: 0.5rem;
    max-width: 32rem;
  }
  .invoice-lifecycle__discard p {
    margin: 0;
    font-size: 0.85rem;
  }
  .invoice-lifecycle__discard label {
    display: grid;
    gap: 0.3rem;
    font-size: 0.85rem;
    font-weight: 700;
  }
  .invoice-lifecycle__discard input {
    min-height: 2.75rem;
  }
  .invoice-issue-dialog {
    position: fixed;
    inset: 0;
    margin: auto;
    height: fit-content;
    max-height: calc(100dvh - 2rem);
    overflow: auto;
    width: min(30rem, calc(100vw - 2rem));
    padding: 1.25rem;
    border: 0;
    border-radius: var(--ja-radius, 1rem);
    color: var(--ja-text-primary, #20201d);
    background: var(--ja-surface, #fff);
  }
  .invoice-issue-dialog::backdrop {
    background: rgb(0 0 0 / 0.5);
  }
  .invoice-issue-dialog form {
    display: grid;
    gap: 0.85rem;
  }
  .invoice-issue-dialog h2 {
    margin: 0;
    font-size: 1.2rem;
  }
  .invoice-issue-dialog dl {
    display: grid;
    gap: 0.4rem;
    margin: 0;
  }
  .invoice-issue-dialog dl div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }
  .invoice-issue-dialog dt {
    color: var(--ja-text-secondary, #57574f);
  }
  .invoice-issue-dialog dd {
    margin: 0;
    text-align: right;
    overflow-wrap: anywhere;
  }
  .invoice-issue-dialog__total {
    padding-top: 0.5rem;
    border-top: 1px solid var(--ja-border-subdued, #e4e4df);
    font-size: 1.2rem;
    font-weight: 800;
  }
  .invoice-issue-dialog__total dt {
    color: inherit;
  }
  .invoice-issue-dialog p {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ja-text-secondary, #57574f);
  }
  .invoice-issue-dialog__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .invoice-page-heading {
    max-width: 70rem;
    margin: 1rem auto;
    padding: 1rem;
    color: #f7f7f5;
    overflow-wrap: anywhere;
  }
  .invoice-page-heading h1 {
    color: inherit;
    font-size: clamp(1.35rem, 4vw, 2rem);
    margin: 0;
  }
  .invoice-page-heading p {
    margin: 0.4rem 0 0;
    color: #deddd8;
  }
  .invoice-source-guidance a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding-block: 0.55rem;
    max-width: 100%;
    overflow-wrap: anywhere;
  }
  @media (max-width: 600px) {
    .invoice-source-links a {
      width: 100%;
      padding-inline: 0.7rem;
      border: 1px solid var(--portal-border, #dfdedc);
      border-radius: 0.6rem;
    }
    .invoice-source-links {
      gap: 0.5rem;
    }
  }
  .invoice-editor-fields {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .invoice-document-shell {
    position: relative;
    margin: auto;
    overflow: hidden;
    background: white;
    box-shadow: 0 1rem 4rem #0007;
    min-height: 0;
    max-width: 210mm;
    padding: 14mm;
  }
  @media screen and (max-width: 600px) {
    .invoice-document-shell {
      padding: 1.25rem;
    }
    /* T35/T91: on a phone a money amount or quantity never breaks inside itself
       ("US$ 3.\n025,0\n0"). The description column wraps instead, and the line
       table may scroll sideways as a last resort. Screen only: the PDF/print
       document keeps the shared invoice CSS. */
    .invoice-document-shell :global(.invoice-line-items) {
      overflow-x: auto;
    }
    .invoice-document-shell :global(#ja-invoice-document.invoice-canonical table.invoice-lines) {
      table-layout: auto;
    }
    .invoice-document-shell :global(#ja-invoice-document.invoice-canonical td.amount),
    .invoice-document-shell :global(#ja-invoice-document.invoice-canonical .total-row > :last-child) {
      white-space: nowrap;
    }
    .invoice-document-shell :global(#ja-invoice-document.invoice-canonical td:first-child) {
      overflow-wrap: anywhere;
    }
  }
  @media print {
    .invoice-document-shell {
      padding: 0;
      max-width: none;
      box-shadow: none;
    }
  }
  .invoice-source-guidance {
    max-width: 70rem;
    margin: 1rem auto;
  }
  .invoice-source-links {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-block: 1rem;
  }
  [data-invoice-retained-customizations] dd {
    overflow-wrap: anywhere;
  }
</style>
