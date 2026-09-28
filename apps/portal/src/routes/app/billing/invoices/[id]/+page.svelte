<script lang="ts">
  import PrintIcon from '$lib/portal/ui/PrintIcon.svelte';
  import { beforeNavigate, invalidateAll } from '$app/navigation';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount, tick } from 'svelte';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneText,
  } from '../../../standalone-locale';
  import type { PortalLocale } from '$lib/portal-i18n';
  import { translateControlledValue } from '$lib/i18n/controlled-values';
  import { money as formatMoney } from '$lib/portal/portal-format';
  import { createInvoicePdfPollingController } from '$lib/portal/invoice-pdf-polling';
  import { StatusBadge } from '$lib/portal/ui';
  import ProblemNotice from '$lib/portal/ui/ProblemNotice.svelte';
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
    due_date?: string | null;
  };
  type InvoicePdfStatus = 'queued' | 'running' | 'ready' | 'failed' | 'unavailable';
  let { data } = $props();
  let localeOverride = $state<PortalLocale | null>(null);
  const locale = $derived(
    localeOverride ?? data.locale ?? resolveStandaloneLocale($page.url.searchParams.get('lang')),
  );
  const t = (key: string): string => standaloneText(locale, key);
  const streamLabel = (value: unknown): string =>
    translateControlledValue(
      locale,
      'billingStream',
      value === null || value === undefined ? null : String(value),
    );
  const preview = $derived(data.preview as { invoice: InvoiceRow; lines: Row[]; taxes: Row[] });
  const invoice = $derived(preview.invoice);
  const invoicePhone = $derived(
    invoice.company_info && typeof invoice.company_info === 'object'
      ? String((invoice.company_info as Record<string, unknown>).phone ?? '').trim() || undefined
      : undefined,
  );
  const invoiceState = $derived(String(invoice.state ?? '').toLowerCase());
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
    sign_in_again: { label: t('problem.remedy.signInAgain'), href: `${base}/app/login?lang=${locale}` },
    review_invoice: {
      label: t('problem.invoiceDraftPreview.reviewInvoice'),
      href: `${base}/app/billing/invoices/${encodeURIComponent(invoiceId)}?lang=${locale}`,
      reload: true,
    },
    review_billing: { label: t('problem.invoiceDraftPreview.reviewBilling'), href: `${base}/app/billing` },
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
  const money = (minor: unknown) =>
    formatMoney(minor, String(invoice.currency), locale === 'pt' ? 'pt-BR' : locale);
  const quantityFor = (lines: Row[]) =>
    lines.reduce(
      (sum, line) =>
        sum +
        (Number(line.quantity_numerator ?? 1) / Number(line.quantity_denominator ?? 1) ||
          Number(line.quantity ?? 1)),
      0,
    );
  const laborLines = $derived(preview.lines.filter((line) => line.source_type !== 'expense'));
  const expenseLines = $derived(preview.lines.filter((line) => line.source_type === 'expense'));
  const mixedLines = $derived(laborLines.length > 0 && expenseLines.length > 0);
  const invoiceLineGroups = $derived(
    mixedLines
      ? [
          { kind: 'Labor', lines: laborLines, subtotal: invoice.labor_subtotal_minor },
          { kind: 'Expenses', lines: expenseLines, subtotal: invoice.expense_subtotal_minor },
        ]
      : [{ kind: null, lines: preview.lines, subtotal: invoice.subtotal_minor }],
  );
  const subtotalLessDiscountMinor = $derived(
    BigInt(String(invoice.subtotal_minor ?? 0)) - BigInt(String(invoice.discount_minor ?? 0)),
  );

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

  function invoiceStatusVariant(
    value: string,
  ): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    switch (value) {
      case 'paid':
        return 'success';
      case 'issued':
      case 'sent':
      case 'partially_paid':
      case 'approved':
        return 'info';
      case 'void':
      case 'voided':
        return 'danger';
      case 'credited':
      case 'credit_note':
      case 'credit':
        return 'warning';
      case 'draft':
        return 'neutral';
      default:
        return 'neutral';
    }
  }

  function invoiceStatusText(row: Row): string {
    const raw = String(row.state ?? '').toLowerCase();
    if (raw === 'superseded') return t('Superseded');
    const status = translateControlledValue(locale, 'status', raw) || t('Unknown');
    return raw === 'paid' ? `✓ ${status}` : status;
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

  beforeNavigate(() => {
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

  function issuedPdfFallback(kind: 'network' | 'invalid' | 'signIn' | 'popup', reference = ''): ProblemData {
    const definition = ({
      network: ['INVOICE_PDF_NETWORK_UNAVAILABLE', 'problem.invoice.pdfNetworkUnavailable', 'retry_download'],
      invalid: ['INVOICE_PDF_INVALID_RESPONSE', 'problem.invoice.pdfInvalidResponse', 'review_invoice'],
      signIn: ['INVOICE_PDF_SIGN_IN_REQUIRED', 'problem.invoice.pdfSignInRequired', 'sign_in_again'],
      popup: ['INVOICE_PDF_POPUP_BLOCKED', 'problem.invoice.pdfPopupBlocked', 'retry_download'],
    } as const)[kind];
    return {
      code: definition[0],
      messageKey: definition[1],
      params: {},
      fieldErrors: {},
      remedies: [{ id: definition[2] }],
      correlationId: /^[A-Za-z0-9._:-]{8,96}$/u.test(reference) ? reference : '',
    };
  }

  async function showIssuedPdfProblem(problem: ProblemData, controller: AbortController): Promise<void> {
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
      link.style.cssText = 'display: inline-block; margin: .5rem 0 1rem; min-height: 2.75rem; color: #0645ad';
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
      } catch { /* Browser popup policy. */ }
      issuedPdfPopup = popup;
      if (!popup) {
        await showIssuedPdfProblem(issuedPdfFallback('popup'), controller);
        issuedPdfController = null;
        issuedPdfBusy = false;
        return;
      }
    }
    const stillCurrent = () =>
      !draftPreviewDisposed && issuedPdfController === controller && !controller.signal.aborted && invoiceId === requestedInvoiceId;
    try {
      const response = await fetch(pdfUrl, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: { accept: 'application/pdf, application/json' },
      });
      if (!stillCurrent()) { popup?.close(); return; }
      const reference = response.headers.get('x-correlation-id') ?? '';
      if (response.redirected) {
        const destination = new URL(response.url);
        popup?.close();
        await showIssuedPdfProblem(
          issuedPdfFallback(destination.origin === location.origin && destination.pathname.endsWith('/app/login') ? 'signIn' : 'invalid', reference),
          controller,
        );
        return;
      }
      if (!response.ok) {
        const payload = response.headers.get('content-type')?.toLowerCase().includes('application/json')
          ? await response.json().catch(() => null)
          : null;
        if (!stillCurrent()) { popup?.close(); return; }
        popup?.close();
        await showIssuedPdfProblem(
          typedPrivateDownloadProblem(payload, issuedPdfMessageKeys, issuedPdfRemedyIds, reference) ??
            issuedPdfFallback(response.status === 401 ? 'signIn' : 'invalid', reference),
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
      if (!stillCurrent()) { popup?.close(); return; }
      const length = response.headers.get('content-length');
      if (file.size < 8 || (length && Number(length) !== file.size) || await file.slice(0, 5).text() !== '%PDF-') {
        popup?.close();
        await showIssuedPdfProblem(issuedPdfFallback('invalid', reference), controller);
        return;
      }
      if (!stillCurrent()) { popup?.close(); return; }
      const url = URL.createObjectURL(file);
      if (mode === 'embed') {
        if (securePdfPreviewUrl) {
          const old = issuedPdfObjectUrls.find((entry) => entry.url === securePdfPreviewUrl);
          if (old) clearTimeout(old.timer);
          URL.revokeObjectURL(securePdfPreviewUrl);
          issuedPdfObjectUrls = issuedPdfObjectUrls.filter((entry) => entry.url !== securePdfPreviewUrl);
        }
        securePdfPreviewUrl = url;
        securePdfPreviewOpen = true;
        issuedPdfObjectUrls.push({ url, timer: window.setTimeout(() => {
          if (securePdfPreviewUrl !== url) URL.revokeObjectURL(url);
        }, 60_000) });
      } else {
        const releaseUrl = () => {
          clearTimeout(timer);
          URL.revokeObjectURL(url);
          issuedPdfObjectUrls = issuedPdfObjectUrls.filter((entry) => entry.url !== url);
        };
        const timer = window.setTimeout(releaseUrl, mode === 'open' ? 3_600_000 : 60_000);
        issuedPdfObjectUrls.push({ url, timer, external: mode === 'open' });
        if (mode === 'open' && popup) {
          if (showIssuedPdfPopup(popup, url, privateDownloadFilename(disposition, `invoice-${requestedInvoiceId}.pdf`))) {
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
    const href = draftPreviewUrl;
    const controller = new AbortController();
    draftPreviewController = controller;
    const stillCurrent = () =>
      !draftPreviewDisposed &&
      draftPreviewController === controller &&
      !controller.signal.aborted &&
      invoiceId === requestedInvoiceId &&
      locale === requestedLocale;
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
    pdfPolling.update(pdfStatus);
  });

  let previousDraftPreviewInvoiceId: string | undefined;
  $effect(() => {
    const currentInvoiceId = invoiceId;
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
    if (previousIssuedPdfInvoiceId !== undefined && previousIssuedPdfInvoiceId !== currentInvoiceId) {
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

<svelte:head><title>{t('Invoice preview')} | {invoice.project_number}</title></svelte:head>
<main class="invoice-preview-page">
  <nav class="detail-nav no-print">
    <a href={`${base}/app/billing`} data-origin-back>← {t('Billing')}</a><button
      type="button"
      class="print-trigger"
      onclick={() => window.print()}><PrintIcon /> {t('Print Report')}</button
    >
  </nav>
  {#if invoiceState === 'draft' || invoiceState === 'approved'}
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
          <div class="invoice-pdf-panel__problem" bind:this={issuedPdfNotice} data-invoice-pdf-problem>
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
            >{issuedPdfBusy ? t('Loading') : securePdfPreviewOpen ? t('Close') : t('Open PDF')}</button
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
            <a href={pdfUrl} download onclick={(event) => onIssuedPdfLinkClick(event, 'download')} onauxclick={(event) => onIssuedPdfLinkClick(event, 'download')}>{t('Download PDF')}</a>
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
  {#if invoiceState === 'draft'}
    <details class="no-print draft-edit-details">
      <summary class="draft-edit-summary"
        >⚙ {t('Edit Invoice Details (Purchase No., Terms, Company, Discount)')}</summary
      >
      <form method="POST" action="?/updateInvoiceDraftDetails" class="draft-edit-form">
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <div class="draft-edit-grid">
          <div class="draft-field">
            <label for="edit-purchase-no">{t('Purchase No.')}</label>
            <input
              id="edit-purchase-no"
              name="purchaseNo"
              type="text"
              value={invoice.purchase_no !== '—' ? invoice.purchase_no : ''}
              placeholder={t('For example: BBS Mexico')}
            />
          </div>
          <div class="draft-field">
            <label for="edit-discount">{t('Discount Amount')}</label>
            <input
              id="edit-discount"
              name="discount"
              type="text"
              value={invoice.discount_minor
                ? (Number(invoice.discount_minor) / 100).toFixed(2)
                : '0.00'}
              placeholder="0.00"
            />
          </div>
          <div class="draft-field">
            <label for="edit-swift">{t('Bank Swift Number')}</label>
            <input
              id="edit-swift"
              name="bankSwiftNumber"
              type="text"
              value={invoice.terms_and_instructions?.bankSwiftNumber || ''}
            />
          </div>
          <div class="draft-field">
            <label for="edit-account">{t('Bank Account Number')}</label>
            <input
              id="edit-account"
              name="bankAccountNumber"
              type="text"
              value={invoice.terms_and_instructions?.bankAccountNumber || ''}
            />
          </div>
          <div class="draft-field">
            <label for="edit-bank-name">{t('Bank Name')}</label>
            <input
              id="edit-bank-name"
              name="bankName"
              type="text"
              value={invoice.terms_and_instructions?.bankName || ''}
            />
          </div>
          <div class="draft-field">
            <label for="edit-beneficiary">{t('Beneficiary')}</label>
            <input
              id="edit-beneficiary"
              name="beneficiary"
              type="text"
              value={invoice.terms_and_instructions?.beneficiary || ''}
            />
          </div>
          <div class="draft-field full-width">
            <label for="edit-past-due">{t('Past Due Notice')}</label>
            <input
              id="edit-past-due"
              name="pastDueNotice"
              type="text"
              value={invoice.terms_and_instructions?.pastDueNotice || ''}
            />
          </div>
        </div>
        <button type="submit" class="save-draft-btn">{t('Save Details')}</button>
      </form>
    </details>
  {/if}

  <article class="invoice-paper">
    <header>
      <div class="brand-block">
        <img src={`${base}/app/logo.png`} alt="J&A Automation" />
        <div class="company-details">
          <strong>{invoice.display_issuer_name || t('Issuing authority not configured')}</strong>
          {#if (invoiceState === 'draft' || invoiceState === 'approved') && (!invoice.resolved_legal_entity_revision_id || Number(invoice.canonical_assignment_matches) !== 1)}
            <small
              >{t(
                'Assign a reviewed project issuing authority before issuing this invoice.',
              )}</small
            >
          {/if}
          {#if invoice.company_info?.division}<div>{invoice.company_info.division}</div>{/if}
          {#if invoicePhone}<div>{t('Phone')}: {invoicePhone}</div>{/if}
          {#if invoice.display_issuer_address}<div>
              {invoice.display_issuer_address}
            </div>{/if}
          {#if invoice.company_info?.email}<div>{invoice.company_info.email}</div>{/if}
          {#if invoice.company_info?.website}<div>{invoice.company_info.website}</div>{/if}
        </div>
      </div>
      <div class="invoice-identity">
        <span>{invoiceState === 'draft' ? t('DRAFT INVOICE') : t('INVOICE')}</span>
        <strong>{invoice.invoice_number || t('PREVIEW')}</strong>
        <StatusBadge
          variant={invoiceStatusVariant(invoiceState)}
          text={invoiceStatusText(invoice)}
          data-invoice-status={invoiceState}
          aria-label={invoiceStatusText(invoice)}
        />
      </div>
    </header>
    <section class="invoice-parties">
      <div>
        <span>{t('BILL TO')}</span>
        <strong>{invoice.client_legal_name || invoice.client_name}</strong>
        {#if invoice.billing_contact_name}<p>{invoice.billing_contact_name}</p>{/if}
        {#if invoice.client_billing_address}<p>{invoice.client_billing_address}</p>{/if}
        {#if invoice.billing_email}<small>{invoice.billing_email}</small>{/if}
      </div>
    </section>
    <section class="invoice-meta">
      <div>
        <span>{t('PURCHASE NO.')}</span>
        <strong>{invoice.purchase_no || '—'}</strong>
      </div>
      <div>
        <span>{t('INVOICE NUMBER')}</span>
        <strong>{invoice.invoice_number || t('PREVIEW')}</strong>
      </div>
      <div>
        <span>{t('INVOICE DATE')}</span>
        <strong
          >{invoice.issued_at
            ? invoice.issued_at.slice(0, 10)
            : invoice.created_at
              ? invoice.created_at.slice(0, 10)
              : '—'}</strong
        >
      </div>
      <div>
        <span>{t('DUE DATE')}</span>
        <strong
          >{invoice.due_date || (invoice.issued_at ? invoice.issued_at.slice(0, 10) : '—')}</strong
        >
      </div>
    </section>
    <section
      class="invoice-line-items"
      data-mobile-representation="cards"
      aria-labelledby="invoice-line-items-heading"
    >
      <h2 class="visually-hidden" id="invoice-line-items-heading">{t('Invoice line items')}</h2>
      {#each invoiceLineGroups as group}
        <div class="invoice-line-group">
          {#if group.kind}<h3>{t(group.kind)}</h3>{/if}
          <table>
            <caption class="visually-hidden">{t('Invoice line items and amounts')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('DESCRIPTION')}</th>
                <th scope="col" class="amount">{t('QTY')}</th>
                <th scope="col" class="amount">{t('UNIT PRICE')}</th>
                <th scope="col" class="amount">{t('TOTAL')}</th>
              </tr>
            </thead>
            <tbody>
              {#each group.lines as line}
                <tr>
                  <td data-label={t('Description')}>{line.description}</td>
                  <td data-label={t('Quantity')} class="amount">
                    {(Number(line.quantity_numerator) / Number(line.quantity_denominator)).toFixed(
                      2,
                    )}
                  </td>
                  <td data-label={t('Unit Price')} class="amount">{money(line.unit_price_minor)}</td
                  >
                  <td data-label={t('Total')} class="amount">{money(line.subtotal_minor)}</td>
                </tr>
              {/each}
            </tbody>
            <tfoot>
              <tr class="qty-total-row">
                <td
                  ><strong>{group.kind ? `${t(group.kind)} · ${t('Subtotal')}` : t('Total')}</strong
                  ></td
                >
                <td class="amount qty-total-cell"
                  ><strong>{quantityFor(group.lines).toFixed(2)}</strong></td
                >
                <td></td>
                <td class="amount total-amount-cell"
                  ><strong>{money(group.subtotal || 0)}</strong></td
                >
              </tr>
            </tfoot>
          </table>
        </div>
      {/each}
    </section>
    <section class="invoice-bottom-grid">
      <div class="invoice-terms-card">
        <div class="terms-heading">{t('Terms & Instructions')}</div>
        <div class="terms-field">
          <strong>{t('Bank Swift Number')}:</strong>
          {invoice.terms_and_instructions?.bankSwiftNumber || '—'}
        </div>
        <div class="terms-field">
          <strong>{t('Bank Account Number')}:</strong>
          {invoice.terms_and_instructions?.bankAccountNumber || '—'}
        </div>
        <div class="terms-field">
          <strong>{t('Bank Name')}:</strong>
          {invoice.terms_and_instructions?.bankName || '—'}
        </div>
        <div class="terms-field">
          <strong>{t('Beneficiary')}:</strong>
          {invoice.terms_and_instructions?.beneficiary || '—'}
        </div>
        <div class="terms-notice">
          {invoice.terms_and_instructions?.pastDueNotice || '—'}
        </div>
      </div>
      <div class="invoice-total">
        <dl>
          <dt>{t('Subtotal')}</dt>
          <dd>{money(invoice.subtotal_minor)}</dd>
          <dt>{t('Discount')}</dt>
          <dd>{money(invoice.discount_minor || 0)}</dd>
          <dt>{t('Subtotal Less Discount')}</dt>
          <dd>{money(subtotalLessDiscountMinor.toString())}</dd>
          {#each preview.taxes as tax}
            <dt>{tax.name} · {Number(tax.basis_points) / 100}%</dt>
            <dd>{money(invoice.tax_minor)}</dd>
          {/each}
          <dt class="grand">{t('Total')}</dt>
          <dd class="grand">{money(invoice.total_minor)}</dd>
        </dl>
      </div>
    </section>
    <footer>
      <span>{t('J&A AUTOMATION · INVOICE PREVIEW')}</span><span
        >{invoice.project_number} / {streamLabel(invoice.stream_type)}</span
      >
    </footer>
  </article>
</main>
