<script lang="ts">
  import DirectionIcon from '$lib/portal/ui/DirectionIcon.svelte';
  import PrintIcon from '$lib/portal/ui/PrintIcon.svelte';
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
  const draftPreviewUrl = $derived(
    `${base}/app/api/invoices/${encodeURIComponent(invoiceId)}/draft-preview?lang=${locale}`,
  );
  const pdfStatus = $derived(invoicePdfStatus(invoice));
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
  const pdfPolling = createInvoicePdfPollingController(() => invalidateAll());
  const documentSnapshot = $derived({
    ...data.documentSnapshot,
    locale,
  } as InvoiceTemplateSnapshot);
  const documentPreview = $derived(
    renderInvoiceDocument(documentSnapshot, {
      editable: canEditDraft,
      logoUrl: `${base}/app/logo.png`,
    }),
  );
  let draftEditor = $state<HTMLDetailsElement>();
  let draftEditorForm = $state<HTMLFormElement>();
  let editExplanation = $state('');
  let detailsSaving = $state(false);
  const companyFields: Array<[string, string, string]> = [
    ['companyDivision', 'Division', 'division'],
    ['companyPhone', 'Phone', 'phone'],
    ['companyEmail', 'Email', 'email'],
    ['companyWebsite', 'Website', 'website'],
  ];
  const projectHref = $derived(
    `${base}/app/projects/${encodeURIComponent(String(invoice.project_id ?? ''))}?lang=${locale}`,
  );
  const financeHref = $derived(
    `${base}/app/finance?view=commercial&project=${encodeURIComponent(String(invoice.project_id ?? ''))}&lang=${locale}`,
  );
  async function openPreviewField(name: string): Promise<void> {
    if (!canEditDraft) return;
    if (name === 'invoiceNumber') {
      editExplanation = t(
        'Invoice numbers are assigned when the invoice is issued, using the approved numbering policy.',
      );
      return;
    }
    if (name === 'issuingAuthority') {
      editExplanation = t(
        'The legal issuer name and address come from the reviewed project issuing authority. Edit that authority to change future drafts.',
      );
      return;
    }
    if (name === 'client') {
      editExplanation = t(
        'Client billing identity and address come from the project client record.',
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
        void goto(
          `${base}/app/${source.dataset.invoiceSourceType === 'expense' ? 'expenses' : 'time'}/${encodeURIComponent(source.dataset.invoiceSourceId ?? '')}?lang=${locale}`,
        );
      }
      return;
    }
    event.preventDefault();
    void openPreviewField(field.dataset.invoiceEdit ?? '');
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
  ><title>{t('Invoice preview')} | {invoice.project_number}</title><link
    rel="stylesheet"
    href={`${base}/app/billing/invoices/${encodeURIComponent(invoiceId)}/preview-style`}
  /></svelte:head
>
<main class="invoice-preview-page">
  <nav class="detail-nav no-print">
    <a href={`${base}/app/billing`} data-origin-back
      ><DirectionIcon direction="left" /> {t('Billing')}</a
    ><button type="button" class="print-trigger" onclick={() => window.print()}
      ><PrintIcon /> {t('Print Report')}</button
    >
  </nav>
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
          <h2 id="invoice-pdf-heading">{t('Preview')}</h2>
        </div>
        <span
          class="invoice-pdf-panel__status"
          data-invoice-pdf-status={pdfStatus}
          aria-live="polite">{t('PDF')} · {pdfStatusLabel(pdfStatus)}</span
        >
      </div>
      {#if pdfStatus === 'ready'}
        <p class="invoice-pdf-panel__help">{t('Ready')}</p>
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
                : t('Open PDF')}</button
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
    </section>
    <div class="no-print localized-pdf-slot">
      <LocalizedPdfPanel ownerType="invoice" ownerId={invoiceId} {locale} title={t('PDF')} />
    </div>
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
  {:else if standaloneActionMessage(locale, form)}
    <p class="no-print" role="status">{standaloneActionMessage(locale, form)}</p>
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
  {#if invoiceState === 'draft' && canEditDraft}
    {#key `${invoiceId}:${invoice.version}:${draftDetailsForm?.correlationId ?? ''}`}
      <details
        bind:this={draftEditor}
        class="no-print draft-edit-details"
        open={Boolean(draftDetailsProblem)}
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
                  placeholder={t('For example: BBS Mexico')}
                />
              </div>
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
              <div class="draft-field">
                <label for="edit-swift">{t('Bank Swift Number')}</label>
                <input
                  id="edit-swift"
                  name="bankSwiftNumber"
                  type="text"
                  value={draftValue(
                    'bankSwiftNumber',
                    invoice.terms_and_instructions?.bankSwiftNumber,
                  )}
                />
              </div>
              <div class="draft-field">
                <label for="edit-account">{t('Bank Account Number')}</label>
                <input
                  id="edit-account"
                  name="bankAccountNumber"
                  type="text"
                  value={draftValue(
                    'bankAccountNumber',
                    invoice.terms_and_instructions?.bankAccountNumber,
                  )}
                />
              </div>
              <div class="draft-field">
                <label for="edit-bank-name">{t('Bank Name')}</label>
                <input
                  id="edit-bank-name"
                  name="bankName"
                  type="text"
                  value={draftValue('bankName', invoice.terms_and_instructions?.bankName)}
                />
              </div>
              <div class="draft-field">
                <label for="edit-beneficiary">{t('Beneficiary')}</label>
                <input
                  id="edit-beneficiary"
                  name="beneficiary"
                  type="text"
                  value={draftValue('beneficiary', invoice.terms_and_instructions?.beneficiary)}
                />
              </div>
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
            <div class="draft-edit-grid">
              {#each companyFields as [name, label, key]}
                <div class="draft-field">
                  <label for={`edit-${name}`}>{t(label)}</label>
                  <input
                    id={`edit-${name}`}
                    {name}
                    type="text"
                    value={draftValue(name, invoice.company_info?.[key])}
                  />
                </div>
              {/each}
            </div>
            <div class="invoice-source-guidance" aria-label={t('invoice.sourceSaveTitle')}>
              <p>
                {t(
                  invoice.purchase_no_source === 'billing_stream'
                    ? 'invoice.sourceSaveStreamPo'
                    : 'invoice.sourceSaveProjectPo',
                )}
              </p>
              <p>{t('invoice.sourceSaveTerms')}</p>
              <p>{t('invoice.sourceSaveIssuer')}</p>
            </div>
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
    <section
      class="detail-panel no-print invoice-source-guidance"
      aria-label={t('Edit invoice sources')}
    >
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
      {#if editExplanation}<p role="status">{editExplanation}</p>{/if}
      <div class="invoice-source-links">
        <a
          href={`${base}/app/billing?view=streams&project=${encodeURIComponent(String(invoice.project_id ?? ''))}&focus=${encodeURIComponent(String(invoice.billing_rule_id ?? ''))}&lang=${locale}#billing-stream-${encodeURIComponent(String(invoice.billing_rule_id ?? ''))}`}
          >{t('invoice.sourceStreamLink')}</a
        >
        <a
          href={`${base}/app/billing?view=setup&issuerSettings=${encodeURIComponent(String(invoice.issuer_legal_entity_id ?? ''))}&lang=${locale}#issuer-document-settings`}
          >{t('issuerSettings.title')}</a
        >
        <a href={`${base}/app/billing?view=setup&lang=${locale}`}
          >{String(data.user?.role) === 'owner_admin'
            ? t('Billing configuration and numbering')
            : t('Billing configuration')}</a
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
    </section>
  {/if}
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
