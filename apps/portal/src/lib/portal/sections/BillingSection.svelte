<script lang="ts">
  import { useViewPreferences } from '../ui/view-preferences.svelte';
  import DirectionIcon from '../ui/DirectionIcon.svelte';
  import { disclosure } from '../ui/disclosure.js';
  import { lastCompletePeriodForCadence, type BillingCadence } from '@ja/billing-engine';
  import RecordBrowser from '../ui/RecordBrowser.svelte';
  import { base } from '$app/paths';
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import { beforeNavigate, invalidateAll, replaceState } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { portalText, type PortalLocale } from '../../portal-i18n';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import { ResponsiveSheet, SectionCard, StatusBadge, TableRegion } from '../ui';
  import ProblemNotice from '../ui/ProblemNotice.svelte';
  import {
    privateDownloadFilename,
    typedPrivateDownloadProblem,
  } from '../ui/private-document-download';
  import type { ProblemData } from '../../problem/contract';
  import type { TableCardRow } from '../ui';
  import { billingReadinessMessageKey, billingReadinessReviewPath } from '../billing-readiness';
  import { localizedServerFieldMessage } from '../ui/form-validation';
  import { reversalRecoveryState } from '../billing-reversal-recovery';
  import { formatTaxBasisPoints, taxProfileComponents } from '../tax-profile-presentation';
  import { dirtyFormGuard, hasUnsavedFormChanges } from '../dirty-form-guard';

  const draftPeriodWarning: ProblemData = {
    code: 'WARNING_BILLING_DRAFT_PERIOD_SCOPE',
    messageKey: 'problem.billing.warningDraftPeriodScope',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'review_selected_period' }],
    correlationId: '',
  };
  const issueInvoiceWarning: ProblemData = {
    code: 'WARNING_BILLING_ISSUE_LOCKS_DRAFT',
    messageKey: 'problem.billing.warningIssueLocksDraft',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'review_invoice' }],
    correlationId: '',
  };
  const uncertainDeliveryWarning: ProblemData = {
    code: 'WARNING_BILLING_DELIVERY_UNCERTAIN',
    messageKey: 'problem.billing.warningDeliveryUncertain',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'review_delivery_status' }],
    correlationId: '',
  };
  const adjustmentWarning: ProblemData = {
    code: 'WARNING_BILLING_ADJUSTMENT_AUDIT',
    messageKey: 'problem.billing.warningAdjustmentAudit',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'review_invoice' }],
    correlationId: '',
  };
  const discardDraftWarning: ProblemData = {
    code: 'WARNING_BILLING_DISCARD_DRAFT',
    messageKey: 'problem.warning.billingDiscardDraft',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'review_invoice' }],
    correlationId: '',
  };
  const discardApprovedWarning: ProblemData = {
    code: 'WARNING_BILLING_DISCARD_APPROVED',
    messageKey: 'problem.warning.billingDiscardApproved',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'review_invoice' }],
    correlationId: '',
  };
  const discardLinkedFinanceProblem: ProblemData = {
    code: 'BILLING_DISCARD_LINKED_FINANCE',
    messageKey: 'problem.warning.billingDiscardSourceLinkedFinance',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'review_invoice' }],
    correlationId: '',
  };
  const archiveStreamWarning: ProblemData = {
    code: 'WARNING_BILLING_ARCHIVE_STREAM',
    messageKey: 'problem.warning.billingArchiveStream',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'review_invoice' }],
    correlationId: '',
  };
  const streamNoTaxProfileWarning: ProblemData = {
    code: 'WARNING_BILLING_STREAM_NO_TAX_PROFILE',
    messageKey: 'problem.warning.billingStreamNoTaxProfile',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'create_tax_profile' }],
    correlationId: '',
  };
  const historicalIssueMarkersProblem: ProblemData = {
    code: 'BILLING_INVOICE_HISTORICAL_ISSUE_MARKERS',
    messageKey: 'problem.billing.historicalIssueMarkers',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'review_invoice' }],
    correlationId: '',
  };
  const invoiceStreamRequiredProblem = (selectedProject: boolean): ProblemData => ({
    code: 'WARNING_BILLING_INVOICE_NEEDS_ACTIVE_STREAM',
    messageKey: selectedProject
      ? 'An invoice draft needs an active billing stream for the selected project. Set up a stream below, then choose Create invoice again.'
      : 'An invoice draft needs an active billing stream. Set up a stream for a project below, then choose Create invoice again.',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'new_billing_stream' }],
    correlationId: '',
  });

  type BillingStage = 'all' | 'wip' | 'drafts' | 'outstanding' | 'overdue' | 'credits' | 'paid';
  type BillingWorkspace = 'invoices' | 'streams' | 'setup';
  type BillingSetupAction = 'stream' | 'entity' | 'tax' | 'numbering';
  type InvoicePdfStatus = 'queued' | 'running' | 'ready' | 'failed' | 'unavailable';

  const setupActions: ReadonlyArray<{ id: BillingSetupAction; label: string }> = [
    { id: 'stream', label: 'New billing stream' },
    { id: 'entity', label: 'New invoice issuer' },
    { id: 'tax', label: 'New tax profile' },
    { id: 'numbering', label: 'Invoice numbering policy' },
  ];

  type LedgerPayment = {
    id?: unknown;
    grossAmountMinor?: unknown;
    reversedMinor?: unknown;
    netAmountMinor?: unknown;
    currency?: unknown;
    received_at?: unknown;
    reference?: unknown;
  };

  type LedgerReversal = {
    id?: unknown;
    originalPaymentId?: unknown;
    amountMinor?: unknown;
    currency?: unknown;
    effectiveAt?: unknown;
    reasonCode?: unknown;
    reason?: unknown;
  };

  type BillingLedgerRow = {
    invoiceId?: unknown;
    invoiceNumber?: unknown;
    grossPaymentsMinor?: unknown;
    paymentReversalsMinor?: unknown;
    netCollectedMinor?: unknown;
    outstandingMinor?: unknown;
    paymentStatus?: unknown;
    firstPaymentDate?: unknown;
    lastPaymentDate?: unknown;
    paidAt?: unknown;
    payments?: LedgerPayment[];
    paymentReversals?: LedgerReversal[];
  };

  type IssueBlocker = {
    code: string;
    sourceId?: string;
    deepLink?: string;
  };

  type BillingReadinessPreview = {
    state: 'ready' | 'incomplete' | 'already_closed';
    streamType: string;
    includedSourceCount: number;
    excludedSourceCount: number;
    hasPositiveFixedFee: boolean;
    hasPositiveDraftAmount: boolean;
    includedExpenseRows: Array<{
      id: string;
      spentOn: string;
      category: string;
      description: string;
      amountMinor: string;
    }>;
    includedExpenseSubtotalMinor: string;
    reasons: Array<{ code?: string; sourceId?: string }>;
    existingInvoiceId?: string | null;
    existingInvoiceState?: string | null;
  };

  type BillingActionResult = {
    invoiceEmailRecipient?: string;
    invoiceEmailId?: string;
    success?: boolean;
    message?: string;
    messageKey?: unknown;
    messageParams?: Record<string, unknown>;
    reasons?: unknown;
    issueBlocker?: unknown;
    code?: unknown;
    deepLink?: unknown;
    billingRuleId?: unknown;
    periodStart?: unknown;
    periodEnd?: unknown;
    params?: unknown;
    fieldErrors?: unknown;
    remedies?: unknown;
    correlationId?: unknown;
    billingOperation?: unknown;
    values?: unknown;
  } | null;

  let {
    data,
    form,
    isAuditor,
    availableProjects,
    locale = 'en',
    translate,
    controlledValue,
    formatMoney,
  }: {
    data: PortalData;
    form?: BillingActionResult;
    isAuditor: boolean;
    availableProjects: Row[];
    locale?: PortalLocale;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
    /** The canonical exact-money formatter. This component never calculates money. */
    formatMoney: (minor: unknown, currency: string) => string;
  } = $props();

  let search = $state('');
  const billingStageFromQuery = (value: string | null): BillingStage =>
    value && ['all', 'wip', 'drafts', 'outstanding', 'overdue', 'credits', 'paid'].includes(value)
      ? (value as BillingStage)
      : 'all';
  let projectFilter = $state($page.url.searchParams.get('project')?.trim() ?? '');
  let stageFilter = $state<BillingStage>(
    billingStageFromQuery($page.url.searchParams.get('stage')?.trim() ?? null),
  );
  let workspace = $state<BillingWorkspace>('invoices');
  let setupAction = $state<BillingSetupAction>('stream');
  let issuerSettingsSavingId = $state('');
  const issuerDocumentFields = [
    ['bankSwiftNumber', 'Bank Swift Number'],
    ['bankAccountNumber', 'Bank Account Number'],
    ['bankName', 'Bank Name'],
    ['beneficiary', 'Beneficiary'],
    ['companyDivision', 'Division'],
    ['companyPhone', 'Phone'],
    ['companyEmail', 'Email'],
    ['companyWebsite', 'Website'],
  ] as const;
  beforeNavigate((navigation) => {
    const forms = document.querySelectorAll<HTMLFormElement>('[data-issuer-settings-form]');
    if (
      Array.from(forms).some(hasUnsavedFormChanges) &&
      !window.confirm(translate('Discard unsaved changes?'))
    )
      navigation.cancel();
  });
  function issuerSetting(entity: Row, name: string): string {
    const settings = entity.document_settings;
    return settings && typeof settings === 'object'
      ? String((settings as Record<string, unknown>)[name] ?? '')
      : '';
  }
  function issuerSettingsGuard(formElement: HTMLFormElement, options: { initialDirty?: boolean }) {
    let guard = dirtyFormGuard(formElement, options);
    let disposed = false;
    const reset = () =>
      queueMicrotask(() => {
        if (disposed) return;
        guard.destroy();
        guard = dirtyFormGuard(formElement);
      });
    formElement.addEventListener('reset', reset);
    return {
      update(next: { initialDirty?: boolean }) {
        guard.update(next);
      },
      destroy() {
        disposed = true;
        formElement.removeEventListener('reset', reset);
        guard.destroy();
      },
    };
  }
  function resetIssuerSettings(event: Event, entity: Row) {
    event.preventDefault();
    const formElement = event.currentTarget as HTMLFormElement;
    for (const [name] of issuerDocumentFields) {
      const control = formElement.elements.namedItem(name);
      if (control instanceof HTMLInputElement) control.value = issuerSetting(entity, name);
    }
    const version = formElement.elements.namedItem('expectedVersion');
    if (version instanceof HTMLInputElement)
      version.value = issuerSetting(entity, 'version') || '0';
  }
  let invoiceSetupRequired = $state(false);
  let invoiceSetupSelectedProject = $state(false);
  let invoiceSetupTargetProjectId = $state<string | null>(null);
  // A native failure can render the selected invoice immediately on the server.
  // Explicit user selection or closing the drawer takes precedence afterward.
  let selectedInvoiceIntent = $state<string | null>(null);
  let selectedInvoiceIntentProblemId = $state('');
  let invoicePdfBusyId = $state('');
  let invoicePdfFailure = $state<{
    id: string;
    surface: 'table' | 'drawer';
    problem: ProblemData;
  } | null>(null);
  let invoicePdfOpenedId = $state('');
  let invoicePdfController: AbortController | null = null;
  let invoicePdfDisposed = false;
  let invoicePdfPopup: Window | null = null;
  let invoicePdfObjectUrls: Array<{ url: string; timer: number; external?: boolean }> = [];
  const invoicePdfMessageKeys: Record<string, ProblemData['messageKey']> = {
    INVOICE_PDF_SIGN_IN_REQUIRED: 'problem.invoice.pdfSignInRequired',
    INVOICE_PDF_UNAVAILABLE: 'problem.invoice.pdfUnavailable',
    INVOICE_PDF_NOT_READY: 'problem.invoice.pdfNotReady',
    INVOICE_PDF_INTEGRITY_BLOCKED: 'problem.invoice.pdfIntegrityBlocked',
    INVOICE_PDF_SERVICE_UNAVAILABLE: 'problem.invoice.pdfServiceUnavailable',
  };
  const invoicePdfRemedyIds = new Set([
    'sign_in_again',
    'review_invoice',
    'review_billing',
    'contact_finance',
    'retry_download',
  ]);
  const invoicePdfRemedyLinks = $derived({
    sign_in_again: { label: translate('Sign in again'), href: `${base}/app/login` },
    review_invoice: {
      label: translate('Review invoice'),
      href: invoicePdfFailure?.id
        ? `${base}/app/billing/invoices/${encodeURIComponent(invoicePdfFailure.id)}`
        : `${base}/app/billing?view=invoices`,
    },
    review_billing: {
      label: translate('Review billing setup'),
      href: `${base}/app/billing?view=invoices`,
    },
    contact_finance: { label: translate('Contact a finance administrator') },
    retry_download: { label: translate('Download PDF'), href: '#invoice-pdf-retry' },
  });
  function invoicePdfFallback(
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
  function cancelInvoicePdf(): void {
    invoicePdfController?.abort();
    invoicePdfController = null;
    invoicePdfPopup?.close();
    invoicePdfPopup = null;
    invoicePdfBusyId = '';
    for (const { url, timer, external } of invoicePdfObjectUrls) {
      if (external) continue;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    }
    invoicePdfObjectUrls = invoicePdfObjectUrls.filter((entry) => entry.external);
  }
  beforeNavigate(cancelInvoicePdf);
  onMount(() => () => {
    invoicePdfDisposed = true;
    cancelInvoicePdf();
  });
  async function showInvoicePdfFailure(
    id: string,
    surface: 'table' | 'drawer',
    problem: ProblemData,
    controller: AbortController,
  ): Promise<void> {
    if (invoicePdfDisposed || invoicePdfController !== controller || controller.signal.aborted)
      return;
    invoicePdfFailure = { id, surface, problem };
    await tick();
    if (invoicePdfDisposed || invoicePdfController !== controller || controller.signal.aborted)
      return;
    const notice = document.querySelector<HTMLElement>(
      `[data-invoice-pdf-problem="${surface}"] [data-ui="problem-notice"]`,
    );
    notice?.focus({ preventScroll: true });
    const bounds = notice?.getBoundingClientRect();
    if (bounds && (bounds.top < 88 || bounds.bottom > window.innerHeight - 96))
      notice?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
  function prepareInvoicePdfPopup(popup: Window): boolean {
    try {
      popup.opener = null;
      popup.document.title = translate('PDF');
      popup.document.documentElement.lang = locale;
      const body = popup.document.body;
      body.replaceChildren();
      body.style.cssText = 'font: 1rem/1.5 system-ui, sans-serif; margin: 1.5rem; color: #181716';
      const status = popup.document.createElement('p');
      status.textContent = translate('Loading');
      const fallback = popup.document.createElement('p');
      fallback.textContent = translate('problem.invoice.pdfPreviewFallback');
      body.append(status, fallback);
      return true;
    } catch {
      popup.close();
      return false;
    }
  }
  function showInvoicePdfPopup(popup: Window, url: string, filename: string): boolean {
    try {
      const doc = popup.document;
      const body = doc.body;
      body.querySelector('p')?.remove();
      const link = doc.createElement('a');
      link.href = url;
      link.download = filename;
      link.textContent = translate('Download PDF');
      link.style.cssText =
        'display: inline-block; margin: .5rem 0 1rem; min-height: 2.75rem; color: #0645ad';
      const frame = doc.createElement('iframe');
      frame.title = translate('PDF');
      frame.style.cssText = 'display: block; width: 100%; height: 78vh; border: 1px solid #d6d5d2';
      body.append(link, frame);
      frame.src = url;
      return true;
    } catch {
      popup.close();
      return false;
    }
  }
  function onInvoicePdfRemedyClick(
    event: MouseEvent,
    id: string,
    surface: 'table' | 'drawer',
  ): void {
    if (!(event.target instanceof Element)) return;
    const retry = event.target.closest<HTMLAnchorElement>('a[href="#invoice-pdf-retry"]');
    if (
      !retry ||
      !event.currentTarget ||
      !(event.currentTarget instanceof Element) ||
      !event.currentTarget.contains(retry)
    )
      return;
    event.preventDefault();
    void getInvoicePdf(id, 'download', surface);
  }
  function onInvoicePdfLinkClick(
    event: MouseEvent,
    id: string,
    mode: 'open' | 'download',
    surface: 'table' | 'drawer',
  ): void {
    if (event.defaultPrevented || (event.button !== 0 && event.button !== 1)) return;
    event.preventDefault();
    void getInvoicePdf(id, mode, surface);
  }
  async function getInvoicePdf(
    id: string,
    mode: 'open' | 'download',
    surface: 'table' | 'drawer',
  ): Promise<void> {
    if (invoicePdfBusyId || invoicePdfDisposed) return;
    const controller = new AbortController();
    invoicePdfController = controller;
    invoicePdfBusyId = id;
    invoicePdfFailure = null;
    invoicePdfOpenedId = '';
    let popup: Window | null = null;
    if (mode === 'open') {
      try {
        popup = window.open('about:blank', '_blank');
        if (popup && !prepareInvoicePdfPopup(popup)) popup = null;
      } catch {
        /* Browser popup policy. */
      }
      invoicePdfPopup = popup;
      if (!popup) {
        await showInvoicePdfFailure(id, surface, invoicePdfFallback('popup'), controller);
        invoicePdfController = null;
        invoicePdfBusyId = '';
        return;
      }
    }
    const current = () =>
      !invoicePdfDisposed && invoicePdfController === controller && !controller.signal.aborted;
    try {
      const response = await fetch(`${base}/app/api/invoices/${encodeURIComponent(id)}/pdf`, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: { accept: 'application/pdf, application/json' },
      });
      if (!current()) {
        popup?.close();
        return;
      }
      const reference = response.headers.get('x-correlation-id') ?? '';
      if (response.redirected) {
        const destination = new URL(response.url);
        popup?.close();
        await showInvoicePdfFailure(
          id,
          surface,
          invoicePdfFallback(
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
        if (!current()) {
          popup?.close();
          return;
        }
        popup?.close();
        await showInvoicePdfFailure(
          id,
          surface,
          typedPrivateDownloadProblem(
            payload,
            invoicePdfMessageKeys,
            invoicePdfRemedyIds,
            reference,
          ) ?? invoicePdfFallback(response.status === 401 ? 'signIn' : 'invalid', reference),
          controller,
        );
        return;
      }
      const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      const disposition = response.headers.get('content-disposition');
      if (type !== 'application/pdf' || !disposition?.toLowerCase().startsWith('attachment')) {
        popup?.close();
        await showInvoicePdfFailure(
          id,
          surface,
          invoicePdfFallback('invalid', reference),
          controller,
        );
        return;
      }
      const file = await response.blob();
      if (!current()) {
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
        await showInvoicePdfFailure(
          id,
          surface,
          invoicePdfFallback('invalid', reference),
          controller,
        );
        return;
      }
      if (!current()) {
        popup?.close();
        return;
      }
      const url = URL.createObjectURL(file);
      const releaseUrl = () => {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
        invoicePdfObjectUrls = invoicePdfObjectUrls.filter((entry) => entry.url !== url);
      };
      const timer = window.setTimeout(releaseUrl, mode === 'open' ? 3_600_000 : 60_000);
      invoicePdfObjectUrls.push({ url, timer, external: mode === 'open' });
      if (mode === 'open' && popup) {
        if (
          showInvoicePdfPopup(popup, url, privateDownloadFilename(disposition, `invoice-${id}.pdf`))
        ) {
          popup.addEventListener('pagehide', releaseUrl, { once: true });
          invoicePdfPopup = null;
          invoicePdfOpenedId = id;
        } else {
          await showInvoicePdfFailure(id, surface, invoicePdfFallback('popup'), controller);
        }
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = privateDownloadFilename(disposition, `invoice-${id}.pdf`);
        link.hidden = true;
        document.body.append(link);
        link.click();
        link.remove();
      }
    } catch {
      popup?.close();
      if (current())
        await showInvoicePdfFailure(id, surface, invoicePdfFallback('network'), controller);
    } finally {
      if (invoicePdfPopup === popup) invoicePdfPopup = null;
      if (invoicePdfController === controller) {
        invoicePdfController = null;
        invoicePdfBusyId = '';
      }
    }
  }
  const paymentDraft = $derived.by((): Record<string, string> | null => {
    if (form?.success !== false || form.billingOperation !== 'recordPayment') return null;
    const values = form.values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) return null;
    return Object.fromEntries(
      Object.entries(values).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  });
  const reversalDraft = $derived.by((): Record<string, string> | null => {
    if (form?.success !== false || form.billingOperation !== 'reversePayment') return null;
    const values = form.values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) return null;
    return Object.fromEntries(
      Object.entries(values).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  });
  const reversalInvoiceId = $derived.by(() => {
    const paymentId = reversalDraft?.paymentId;
    if (!paymentId) return '';
    const ledger = (data.ledger ?? []).find(
      (row) =>
        Array.isArray((row as BillingLedgerRow).payments) &&
        (row as BillingLedgerRow).payments?.some(
          (payment) => String(payment.id ?? '') === paymentId,
        ),
    ) as BillingLedgerRow | undefined;
    return String(
      ledger?.invoiceId ?? (ledger as Record<string, unknown> | undefined)?.invoice_id ?? '',
    );
  });
  const billingFailureOperation = $derived(
    form?.success === false ? String(form.billingOperation ?? '') : '',
  );
  const billingFailureValues = $derived.by((): Record<string, string> => {
    const values = form?.success === false ? form.values : null;
    if (!values || typeof values !== 'object' || Array.isArray(values)) return {};
    return Object.fromEntries(
      Object.entries(values).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  });
  const invoiceFailureId = $derived(
    billingFailureValues.invoiceId ||
      billingFailureValues.originalInvoiceId ||
      String(form?.invoiceEmailId ?? ''),
  );
  const selectedInvoiceId = $derived(
    (selectedInvoiceIntent !== null &&
    (!billingProblem?.correlationId ||
      selectedInvoiceIntentProblemId === billingProblem.correlationId)
      ? selectedInvoiceIntent
      : null) ??
      paymentDraft?.invoiceId ??
      (reversalInvoiceId || invoiceFailureId || $page.url.searchParams.get('invoice') || ''),
  );
  let invoiceWizardOpen = $state(false);
  let invoiceWizardStep = $state(1);
  let wizardRuleId = $state('');
  let wizardPeriodStart = $state('');
  let wizardPeriodEnd = $state('');
  let wizardReadiness = $state<BillingReadinessPreview | null>(null);
  let wizardReadinessLoading = $state(false);
  let wizardReadinessError = $state('');
  let wizardReadinessRemedy = $state('');
  let wizardReadinessReference = $state('');
  let wizardReadinessAlert = $state<HTMLDivElement>();
  $effect(() => {
    if (!wizardReadinessError) return;
    void tick().then(() => wizardReadinessAlert?.focus());
  });
  const billingProblem = $derived.by((): ProblemData | null => {
    if (
      !form ||
      form.success !== false ||
      typeof form.code !== 'string' ||
      typeof form.messageKey !== 'string'
    )
      return null;
    return {
      code: form.code,
      messageKey: form.messageKey as ProblemData['messageKey'],
      message: typeof form.message === 'string' ? form.message : undefined,
      params:
        form.params && typeof form.params === 'object'
          ? (form.params as ProblemData['params'])
          : {},
      fieldErrors:
        form.fieldErrors && typeof form.fieldErrors === 'object'
          ? (form.fieldErrors as ProblemData['fieldErrors'])
          : {},
      remedies: Array.isArray(form.remedies) ? (form.remedies as ProblemData['remedies']) : [],
      correlationId: String(form.correlationId ?? ''),
    };
  });
  function problemFor(operation: string, field?: string, id?: string): boolean {
    if (!billingProblem || billingFailureOperation !== operation) return false;
    return !field || billingFailureValues[field] === id;
  }
  function invoiceProblemFormAvailable(
    operation: string,
    state: string,
    creditNote: boolean,
  ): boolean {
    if (operation === 'setInvoicePlanningDates')
      return (
        canManageBilling &&
        (['draft', 'approved'].includes(state) ||
          billingProblem?.code === 'BILLING_PLANNING_INVOICE_LOCKED')
      );
    if (operation === 'emailInvoice')
      return !isAuditor && ['issued', 'sent', 'partially_paid', 'paid', 'overdue'].includes(state);
    if (operation === 'approveInvoice') return !isAuditor && state === 'draft';
    if (operation === 'deleteInvoice')
      return (
        !isAuditor &&
        (state === 'draft' || (state === 'approved' && data.user.role === 'owner_admin'))
      );
    if (operation === 'recalculateApprovedInvoice' || operation === 'issueInvoice')
      return !isAuditor && state === 'approved';
    if (operation === 'restoreCreditNoteState')
      return !isAuditor && creditNote && state === 'overdue';
    if (operation === 'sendInvoice') return !isAuditor && state === 'issued';
    if (operation === 'voidInvoice')
      return (
        canVoidInvoice && ['issued', 'sent', 'partially_paid', 'paid', 'overdue'].includes(state)
      );
    if (operation === 'createInvoiceAdjustment')
      return !isAuditor && ['issued', 'sent', 'partially_paid', 'paid', 'overdue'].includes(state);
    return false;
  }
  type BillingRecoveryOptions = {
    operation: string;
    problem: ProblemData | null;
    values: Record<string, string>;
    field?: string;
    id?: string;
  };
  function recoveryOptions(operation: string, field?: string, id?: string): BillingRecoveryOptions {
    return { operation, problem: billingProblem, values: billingFailureValues, field, id };
  }
  let nextBillingFormId = 0;
  function recoverBillingForm(formElement: HTMLFormElement, initial: BillingRecoveryOptions) {
    const formId = ++nextBillingFormId;
    let submitted: Map<string, string> | null = null;
    let lastProblemId = '';
    const originalDescriptions = new WeakMap<HTMLElement, string | null>();
    const scrollInput = document.createElement('input');
    scrollInput.type = 'hidden';
    scrollInput.name = 'viewportScrollY';
    formElement.append(scrollInput);
    const drawerScrollInput = document.createElement('input');
    drawerScrollInput.type = 'hidden';
    drawerScrollInput.name = 'drawerScrollTop';
    formElement.append(drawerScrollInput);
    const drawerBody = formElement
      .closest('[data-ui="responsive-sheet"]')
      ?.querySelector<HTMLElement>('.responsive-sheet-body');
    const capture = () => {
      scrollInput.value = String(Math.max(0, Math.round(window.scrollY)));
      drawerScrollInput.value = String(Math.max(0, Math.round(drawerBody?.scrollTop ?? 0)));
    };
    const onSubmit = () => {
      capture();
      submitted = new Map(
        Array.from(new FormData(formElement).entries()).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      );
    };
    const onFormData = (event: Event) => {
      capture();
      const data = (event as FormDataEvent).formData;
      data.set('viewportScrollY', scrollInput.value);
      data.set('drawerScrollTop', drawerScrollInput.value);
      submitted = new Map(
        Array.from(data.entries()).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      );
    };
    formElement.addEventListener('submit', onSubmit, true);
    formElement.addEventListener('formdata', onFormData);
    window.addEventListener('scroll', capture, { passive: true });
    drawerBody?.addEventListener('scroll', capture, { passive: true });
    capture();
    const apply = (options: BillingRecoveryOptions) => {
      const { operation, problem, values, field, id } = options;
      if (!problem || billingFailureOperation !== operation || (field && values[field] !== id))
        return;
      if (lastProblemId === problem.correlationId) return;
      lastProblemId = problem.correlationId;
      formElement
        .querySelectorAll('[data-billing-recovery-error], [data-billing-recovery-summary]')
        .forEach((node) => node.remove());
      formElement
        .querySelectorAll<HTMLElement>('[data-billing-recovery-invalid]')
        .forEach((node) => {
          node.removeAttribute('data-billing-recovery-invalid');
          node.removeAttribute('aria-invalid');
          const originalDescription = originalDescriptions.get(node);
          if (originalDescription === null || originalDescription === undefined)
            node.removeAttribute('aria-describedby');
          else node.setAttribute('aria-describedby', originalDescription);
        });
      for (const [name, value] of Object.entries(values)) {
        if (name === 'viewportScrollY' || name === 'drawerScrollTop') continue;
        const control = Array.from(formElement.elements).find(
          (element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
            (element instanceof HTMLInputElement ||
              element instanceof HTMLSelectElement ||
              element instanceof HTMLTextAreaElement) &&
            element.name === name,
        );
        if (!control) continue;
        if (
          submitted &&
          (control instanceof HTMLInputElement && control.type === 'checkbox'
            ? control.checked !== submitted.has(name)
            : control.value !== submitted.get(name))
        )
          continue;
        if (control instanceof HTMLInputElement && control.type === 'checkbox')
          control.checked = value === 'true' || value === 'on' || value === '1';
        else control.value = value;
      }
      if (operation === 'createTaxProfile') {
        const percent = formElement.querySelector<HTMLInputElement>(
          'input[name="componentPercent"]',
        );
        const basisPoints = formElement.querySelector<HTMLInputElement>(
          'input[name="componentBasisPoints"]',
        );
        const value = percent ? percentToBps(percent.value) : null;
        if (basisPoints && value !== null) basisPoints.value = value;
      }
      const visibleErrors: Array<{
        control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        message: string;
      }> = [];
      for (const [name, messages] of Object.entries(problem.fieldErrors)) {
        const control = Array.from(formElement.elements).find(
          (element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
            (element instanceof HTMLInputElement ||
              element instanceof HTMLSelectElement ||
              element instanceof HTMLTextAreaElement) &&
            element.name === name &&
            !(element instanceof HTMLInputElement && element.type === 'hidden'),
        );
        if (!control || !messages?.length) continue;
        const message = localizedServerFieldMessage(
          String($page.data.locale ?? 'en'),
          messages[0] ?? '',
        );
        const inputId = control.id || `billing-recovery-${formId}-${name}`;
        control.id = inputId;
        const errorId = `${inputId}-error`;
        if (!originalDescriptions.has(control))
          originalDescriptions.set(control, control.getAttribute('aria-describedby'));
        control.setAttribute('aria-invalid', 'true');
        control.setAttribute(
          'aria-describedby',
          [originalDescriptions.get(control), errorId].filter(Boolean).join(' '),
        );
        control.dataset.billingRecoveryInvalid = '';
        const small = document.createElement('small');
        small.id = errorId;
        small.dataset.fieldErrorFor = inputId;
        small.dataset.billingRecoveryError = '';
        small.setAttribute('role', 'alert');
        small.textContent = message;
        control.insertAdjacentElement('afterend', small);
        visibleErrors.push({ control, message });
      }
      if (visibleErrors.length > 1) {
        const summary = document.createElement('div');
        summary.dataset.ui = 'validation-summary';
        summary.dataset.billingRecoverySummary = '';
        summary.tabIndex = -1;
        summary.setAttribute('role', 'alert');
        const heading = document.createElement('strong');
        heading.textContent = translate('Check the highlighted fields');
        const list = document.createElement('ul');
        for (const { control, message } of visibleErrors) {
          const item = document.createElement('li');
          const link = document.createElement('a');
          link.href = `#${control.id}`;
          link.textContent = `${control.closest('label')?.querySelector('span')?.textContent?.trim() || control.name}: ${message}`;
          item.append(link);
          list.append(item);
        }
        summary.append(heading, list);
        formElement.prepend(summary);
      }
      const scroll = /^\d{1,7}$/.test(values.viewportScrollY ?? '')
        ? Number(values.viewportScrollY)
        : null;
      const drawerScroll = /^\d{1,7}$/.test(values.drawerScrollTop ?? '')
        ? Number(values.drawerScrollTop)
        : null;
      void tick().then(() =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const failureNotice = Array.from(
              formElement.parentElement?.querySelectorAll<HTMLElement>(
                '[data-ui="problem-notice"][data-kind="error"]',
              ) ?? [],
            ).find((notice) => notice.dataset.problemCode === problem.code);
            const target =
              visibleErrors.length > 1
                ? formElement.querySelector<HTMLElement>('[data-billing-recovery-summary]')
                : (visibleErrors[0]?.control ?? failureNotice);
            target?.focus({ preventScroll: true });
            if (drawerScroll !== null)
              drawerBody?.scrollTo({ top: drawerScroll, behavior: 'instant' });
            if (scroll !== null) window.scrollTo({ top: scroll, behavior: 'instant' });
            if (target && document.activeElement === target) {
              const bounds = target.getBoundingClientRect();
              if (bounds.top < 72 || bounds.bottom > window.innerHeight - 72)
                target.scrollIntoView({ block: 'center', inline: 'nearest' });
            }
          }),
        ),
      );
    };
    apply(initial);
    return {
      update(next: BillingRecoveryOptions) {
        apply(next);
      },
      destroy() {
        formElement.removeEventListener('submit', onSubmit, true);
        formElement.removeEventListener('formdata', onFormData);
        window.removeEventListener('scroll', capture);
        drawerBody?.removeEventListener('scroll', capture);
        scrollInput.remove();
        drawerScrollInput.remove();
      },
    };
  }
  const paymentFieldErrors = $derived.by(() => {
    if (!billingProblem || !paymentDraft?.invoiceId) return [];
    const fields = billingProblem.fieldErrors;
    const definitions = [
      { name: 'amount', source: 'amountMinor', label: 'Payment amount' },
      { name: 'currency', source: 'currency', label: 'Currency' },
      { name: 'receivedOn', source: 'receivedAt', label: 'Received on' },
      { name: 'reference', source: 'reference', label: 'Payment reference / note' },
    ] as const;
    return definitions.flatMap(({ name, source, label }) => {
      const raw = fields[source]?.[0] ?? fields[name]?.[0];
      return raw
        ? [
            {
              name,
              label,
              message: localizedServerFieldMessage(String($page.data.locale ?? 'en'), raw),
            },
          ]
        : [];
    });
  });
  const reversalFieldErrors = $derived.by(() => {
    if (!billingProblem || !reversalDraft?.paymentId) return [];
    const fields = billingProblem.fieldErrors;
    const definitions = [
      { name: 'amount', source: 'amountMinor', label: 'Reversal amount' },
      { name: 'effectiveOn', source: 'effectiveOn', label: 'Effective date' },
      { name: 'reasonCode', source: 'reasonCode', label: 'Reason code' },
      { name: 'reason', source: 'reason', label: 'Reason' },
    ] as const;
    return definitions.flatMap(({ name, source, label }) => {
      const raw = fields[source]?.[0] ?? fields[name]?.[0];
      return raw
        ? [
            {
              name,
              label,
              message: localizedServerFieldMessage(String($page.data.locale ?? 'en'), raw),
            },
          ]
        : [];
    });
  });
  function paymentError(name: string): string | undefined {
    if (selectedInvoiceId !== paymentDraft?.invoiceId) return undefined;
    return paymentFieldErrors.find((field) => field.name === name)?.message;
  }
  function reversalError(name: string, paymentId: string): string | undefined {
    if (reversalDraft?.paymentId !== paymentId || selectedInvoiceId !== reversalInvoiceId)
      return undefined;
    return reversalFieldErrors.find((field) => field.name === name)?.message;
  }
  let focusedProblemId = '';
  let focusedPaymentFieldsId = '';
  let focusedReversalFieldsId = '';
  let restoredReversalScrollId = '';
  let restoredPaymentScrollId = '';
  function rememberReversalScroll(form: HTMLFormElement) {
    const drawerBody = form
      .closest('[data-ui="responsive-sheet"]')
      ?.querySelector<HTMLElement>('.responsive-sheet-body');
    const viewportInput = form.elements.namedItem('viewportScrollY') as HTMLInputElement | null;
    const drawerInput = form.elements.namedItem('drawerScrollTop') as HTMLInputElement | null;
    const capture = () => {
      if (viewportInput) viewportInput.value = String(Math.max(0, Math.round(window.scrollY)));
      if (drawerInput)
        drawerInput.value = String(Math.max(0, Math.round(drawerBody?.scrollTop ?? 0)));
    };
    capture();
    window.addEventListener('scroll', capture, { passive: true });
    drawerBody?.addEventListener('scroll', capture, { passive: true });
    form.addEventListener('submit', capture, true);
    return {
      destroy() {
        window.removeEventListener('scroll', capture);
        drawerBody?.removeEventListener('scroll', capture);
        form.removeEventListener('submit', capture, true);
      },
    };
  }
  $effect(() => {
    const id = billingProblem?.correlationId;
    if (
      !id ||
      id === restoredPaymentScrollId ||
      billingProblem?.code !== 'BILLING_PAYMENT_EXCEEDS_BALANCE' ||
      !paymentDraft?.invoiceId ||
      selectedInvoiceId !== paymentDraft.invoiceId
    )
      return;
    restoredPaymentScrollId = id;
    const viewport = /^\d{1,7}$/.test(paymentDraft.viewportScrollY ?? '')
      ? parseInt(paymentDraft.viewportScrollY, 10)
      : null;
    const drawer = /^\d{1,7}$/.test(paymentDraft.drawerScrollTop ?? '')
      ? parseInt(paymentDraft.drawerScrollTop, 10)
      : null;
    void tick().then(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const drawerBody = document.querySelector<HTMLElement>(
            '[data-ui="billing-section"] [data-ui="responsive-sheet"] .responsive-sheet-body',
          );
          if (drawer !== null) drawerBody?.scrollTo({ top: drawer, behavior: 'instant' });
          if (viewport !== null) window.scrollTo({ top: viewport, behavior: 'instant' });
          const notice = document.querySelector<HTMLElement>(
            '[data-billing-payment-problem] [data-ui="problem-notice"]',
          );
          notice?.focus({ preventScroll: true });
          if (notice && document.activeElement === notice) {
            const bounds = notice.getBoundingClientRect();
            if (bounds.top < 72 || bounds.bottom > window.innerHeight - 72)
              notice.scrollIntoView({ block: 'center', inline: 'nearest' });
          }
        }),
      ),
    );
  });
  $effect(() => {
    const id = billingProblem?.correlationId;
    if (!id || id === restoredReversalScrollId || !reversalDraft?.paymentId) return;
    if (
      !/^\d{1,7}$/.test(String(reversalDraft.viewportScrollY ?? '')) ||
      !/^\d{1,7}$/.test(String(reversalDraft.drawerScrollTop ?? ''))
    )
      return;
    const viewport = Number(reversalDraft.viewportScrollY);
    const drawer = Number(reversalDraft.drawerScrollTop);
    if (
      !Number.isSafeInteger(viewport) ||
      viewport < 0 ||
      !Number.isSafeInteger(drawer) ||
      drawer < 0
    )
      return;
    restoredReversalScrollId = id;
    void tick().then(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          document
            .querySelector<HTMLElement>(
              '[data-ui="billing-section"] [data-ui="responsive-sheet"] .responsive-sheet-body',
            )
            ?.scrollTo({ top: drawer, behavior: 'instant' });
          window.scrollTo({ top: viewport, behavior: 'instant' });
          if (billingProblem?.code === 'BILLING_REVERSAL_EXCEEDS_REMAINING') {
            const notice = document.querySelector<HTMLElement>(
              '[data-billing-payment-problem] [data-ui="problem-notice"]',
            );
            notice?.focus({ preventScroll: true });
            if (notice && document.activeElement === notice) {
              const bounds = notice.getBoundingClientRect();
              if (bounds.top < 72 || bounds.bottom > window.innerHeight - 72)
                notice.scrollIntoView({ block: 'center', inline: 'nearest' });
            }
          }
        }),
      ),
    );
  });
  const problemRemedyLinks = $derived({
    correct_field: { label: translate('problem.remedy.correctField') },
    review_record: {
      label: translate('Review updated record'),
      href: `${base}/app/billing?view=invoices`,
    },
    review_invoice: {
      label: translate('Review invoice'),
      href: `${base}/app/billing?view=invoices`,
    },
    review_selected_period: { label: translate('Review selected period') },
    review_delivery_status: {
      label: translate('Review delivery status'),
      href: '#invoice-email-deliveries',
    },
    review_ledger: {
      label: translate('Review invoice ledger'),
      href:
        billingProblem?.code === 'BILLING_PAYMENT_EXCEEDS_BALANCE' && paymentDraft?.invoiceId
          ? `${base}/app/billing?view=invoices&invoice=${encodeURIComponent(paymentDraft.invoiceId)}#invoice-collections`
          : billingProblem?.code === 'BILLING_REVERSAL_EXCEEDS_REMAINING' && reversalInvoiceId
            ? `${base}/app/billing?view=invoices&invoice=${encodeURIComponent(reversalInvoiceId)}#invoice-collections`
            : selectedInvoiceId
              ? '#invoice-collections'
              : `${base}/app/billing?view=invoices`,
      reload:
        billingProblem?.code === 'BILLING_PAYMENT_EXCEEDS_BALANCE' ||
        billingProblem?.code === 'BILLING_REVERSAL_EXCEEDS_REMAINING',
    },
    review_billing_setup: {
      label: translate('Review billing setup'),
      href: `${base}/app/billing?view=setup`,
    },
    review_pending_records: {
      label: translate('Review pending records'),
      href: readinessActionHref(),
    },
    review_accounting_pack: {
      label: translate('Review accounting pack'),
      href: `${base}/app/accounting`,
    },
    contact_finance: { label: translate('Contact a finance administrator') },
    contact_owner: { label: translate('Contact an owner') },
    sign_in_again: { label: translate('Sign in again'), href: `${base}/app/login` },
  });
  function invoiceReviewRemedyLinks(invoiceId: string) {
    return {
      ...problemRemedyLinks,
      review_invoice: {
        label: translate('Review invoice'),
        href: `${base}/app/billing/invoices/${encodeURIComponent(invoiceId)}`,
      },
    };
  }
  $effect(() => {
    const id = billingProblem?.correlationId;
    const inWizard = invoiceWizardOpen && form?.billingRuleId !== undefined;
    const inPaymentDrawer = Boolean(
      (paymentDraft?.invoiceId && selectedInvoiceId === paymentDraft.invoiceId) ||
      (reversalDraft?.paymentId && selectedInvoiceId === reversalInvoiceId),
    );
    const inInvoiceDrawer = Boolean(invoiceFailureId && selectedInvoiceId === invoiceFailureId);
    const inTaxRecovery = canManageBilling && (taxProfileUnavailable || taxProfileRetryDenied);
    const focusKey = `${id}:${inPaymentDrawer || inInvoiceDrawer ? 'drawer' : inWizard ? 'wizard' : inTaxRecovery ? 'tax-recovery' : 'page'}`;
    if (!id || focusKey === focusedProblemId) return;
    focusedProblemId = focusKey;
    if (
      inPaymentDrawer &&
      (paymentFieldErrors.length || reversalFieldErrors.length) &&
      billingProblem?.code !== 'BILLING_PAYMENT_EXCEEDS_BALANCE' &&
      billingProblem?.code !== 'BILLING_REVERSAL_EXCEEDS_REMAINING'
    )
      return;
    void tick().then(() => {
      const selector =
        inPaymentDrawer || inInvoiceDrawer
          ? '[data-billing-invoice-problem] [data-ui="problem-notice"], [data-billing-payment-problem] [data-ui="problem-notice"], [data-billing-planning-problem] [data-ui="problem-notice"]'
          : inTaxRecovery
            ? '[data-tax-recovery] [data-ui="problem-notice"]'
            : inWizard
              ? '.billing-section__invoice-wizard [data-ui="problem-notice"]'
              : '[data-ui="billing-section"] > [data-ui="problem-notice"]';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const notice = document.querySelector<HTMLElement>(selector);
          notice?.focus({ preventScroll: true });
          if (notice && document.activeElement === notice) {
            const bounds = notice.getBoundingClientRect();
            if (bounds.top < 72 || bounds.bottom > window.innerHeight - 72)
              notice.scrollIntoView({ block: 'center', inline: 'nearest' });
          }
        });
      });
    });
  });
  $effect(() => {
    const id = billingProblem?.correlationId;
    if (
      !id ||
      !paymentDraft?.invoiceId ||
      selectedInvoiceId !== paymentDraft.invoiceId ||
      !paymentFieldErrors.length ||
      billingProblem?.code === 'BILLING_PAYMENT_EXCEEDS_BALANCE'
    )
      return;
    if (id === focusedPaymentFieldsId) return;
    focusedPaymentFieldsId = id;
    void tick().then(() => {
      const target = document.querySelector<HTMLElement>(
        paymentFieldErrors.length > 1
          ? '[data-billing-payment-summary]'
          : `#billing-payment-${paymentFieldErrors[0]?.name}`,
      );
      (
        target ??
        document.querySelector<HTMLElement>(
          '[data-billing-payment-problem] [data-ui="problem-notice"]',
        )
      )?.focus({ preventScroll: true });
    });
  });
  $effect(() => {
    const id = billingProblem?.correlationId;
    const paymentId = reversalDraft?.paymentId;
    if (
      !id ||
      !paymentId ||
      selectedInvoiceId !== reversalInvoiceId ||
      !reversalFieldErrors.length ||
      billingProblem?.code === 'BILLING_REVERSAL_EXCEEDS_REMAINING'
    )
      return;
    if (id === focusedReversalFieldsId) return;
    focusedReversalFieldsId = id;
    void tick().then(() => {
      const targetId =
        reversalFieldErrors.length > 1
          ? `billing-reversal-${paymentId}-summary`
          : `billing-reversal-${paymentId}-${reversalFieldErrors[0]?.name}`;
      (
        document.getElementById(targetId) ??
        document.querySelector<HTMLElement>(
          '[data-billing-payment-problem] [data-ui="problem-notice"]',
        )
      )?.focus({ preventScroll: true });
    });
  });

  const todayIso = $derived(new Date().toISOString().slice(0, 10));

  function streamDraftPeriod(rule: Row): { start: string; end: string } {
    const cadence = rowValue(rule, 'cadence_type', 'cadenceType').toLowerCase() as BillingCadence;
    const monthlyCutoffRaw = rowValue(rule, 'monthly_cutoff_day', 'monthlyCutoffDay');
    try {
      const period = lastCompletePeriodForCadence(cadence, todayIso, {
        anchorDate: rowValue(rule, 'anchor_date', 'anchorDate') || undefined,
        monthlyCutoffDay: monthlyCutoffRaw ? parseInt(monthlyCutoffRaw, 10) : undefined,
      }) ?? { start: '', end: '' };
      const effectiveFrom = rowValue(rule, 'effective_from', 'effectiveFrom');
      const effectiveTo = rowValue(rule, 'effective_to', 'effectiveTo');
      if (
        (effectiveFrom && period.start < effectiveFrom) ||
        (effectiveTo && period.end > effectiveTo)
      )
        return { start: '', end: '' };
      return period;
    } catch {
      // A missing anchor or manual cadence must be resolved by an explicit user
      // choice. Never make a weekly suggestion for a non-weekly stream.
      return { start: '', end: '' };
    }
  }

  function readinessReasons(): Array<{ code?: string }> {
    if (!form || !Array.isArray(form.reasons)) return [];
    return form.reasons as Array<{ code?: string }>;
  }

  function readinessActionHref(reasons = readinessReasons()): string {
    return `${base}/app${billingReadinessReviewPath(
      reasons.map((reason) => String(reason.code ?? '')),
      rowValue(wizardRule, 'project_id', 'projectId'),
      { start: wizardPeriodStart, end: wizardPeriodEnd },
    )}`;
  }

  function reopenBlockedSelection(): void {
    const ruleId = String(form?.billingRuleId ?? '');
    if (ruleId) {
      wizardRuleId = ruleId;
      wizardPeriodStart = String(form?.periodStart ?? '');
      wizardPeriodEnd = String(form?.periodEnd ?? '');
    }
    invoiceWizardStep = 4;
    invoiceWizardOpen = true;
  }

  $effect(() => {
    if (!billingProblem || form?.billingRuleId === undefined) return;
    wizardRuleId = String(form.billingRuleId);
    wizardPeriodStart = String(form.periodStart ?? '');
    wizardPeriodEnd = String(form.periodEnd ?? '');
    invoiceWizardStep = 12;
    invoiceWizardOpen = true;
  });

  function clearInvoiceSetupWarning(): void {
    invoiceSetupRequired = false;
    invoiceSetupSelectedProject = false;
    invoiceSetupTargetProjectId = null;
  }

  function selectBillingWorkspace(next: BillingWorkspace, action = setupAction): void {
    workspace = next;
    setupAction = action;
    const url = new URL(location.href);
    url.searchParams.set('view', next);
    if (projectFilter) url.searchParams.set('project', projectFilter);
    else url.searchParams.delete('project');
    if (stageFilter !== 'all') url.searchParams.set('stage', stageFilter);
    else url.searchParams.delete('stage');
    if (next === 'setup') url.searchParams.set('setup', action);
    else url.searchParams.delete('setup');
    // Keep the current document and scroll position while making refresh and
    // returning from an invoice restore the workspace the user selected.
    replaceState(url, $page.state);
  }

  async function showSetupAction(
    action: BillingSetupAction,
    preserveInvoicePrerequisite = false,
  ): Promise<void> {
    if (!preserveInvoicePrerequisite) clearInvoiceSetupWarning();
    selectBillingWorkspace('setup', action);
    await tick();
    const form = document.querySelector<HTMLElement>('.billing-section__config-form');
    const prerequisiteNotice =
      action === 'stream' && invoiceSetupRequired
        ? document.querySelector<HTMLElement>(
            '[data-problem-code="WARNING_BILLING_INVOICE_NEEDS_ACTIVE_STREAM"]',
          )
        : null;
    (prerequisiteNotice ?? form)?.scrollIntoView({
      block: prerequisiteNotice ? 'center' : 'start',
    });
    if (prerequisiteNotice) prerequisiteNotice.focus({ preventScroll: true });
    else
      form?.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea')?.focus({
        preventScroll: true,
      });
  }

  const invoices = $derived(data.invoices ?? []);
  const billingRules = $derived(
    (data.billingRules ?? []).map((rule) => ({
      ...rule,
      browser_status:
        String(rule.enabled) === '1'
          ? 'active'
          : String(rule.enabled) === '0'
            ? 'archived'
            : 'unknown',
    })),
  );
  const activeWizardRules = $derived(billingRules.filter((rule) => String(rule.enabled) === '1'));
  $effect(() => {
    if (!invoiceSetupRequired) return;
    const targetProjectId = invoiceSetupTargetProjectId;
    if (
      activeWizardRules.some(
        (rule) => !targetProjectId || rowValue(rule, 'project_id', 'projectId') === targetProjectId,
      )
    )
      clearInvoiceSetupWarning();
  });
  const visibleBillingRules = $derived(
    billingRules.filter(
      (rule) => !projectFilter || rowValue(rule, 'project_id', 'projectId') === projectFilter,
    ),
  );
  let billingRulePage = $state<Row[]>([]);
  const streamFocusId = $derived($page.url.searchParams.get('focus')?.trim() ?? '');
  const wizardRule = $derived(billingRules.find((rule) => rowValue(rule, 'id') === wizardRuleId));
  const wizardHasNoBillableSources = $derived(
    wizardReadiness?.state === 'ready' &&
      !wizardReadiness.hasPositiveDraftAmount &&
      (!wizardReadiness.existingInvoiceId || wizardReadiness.existingInvoiceState === 'draft'),
  );
  const wizardEmptySourcesMessage = $derived(
    (wizardReadiness?.includedSourceCount ?? 0) > 0
      ? 'The eligible records total zero billable amount. Review rates, included hours, milestone amounts, and the billing setup.'
      : wizardReadiness?.streamType === 'expense'
        ? 'No approved, unbilled expenses are available in this period. Choose another period or approve the expenses first.'
        : wizardReadiness?.streamType === 'milestone'
          ? 'No approved, unbilled milestones are available in this period. Choose another period or approve a milestone first.'
          : 'No billable labor records are available in this period. Choose another period or review the time and billing setup.',
  );
  const wizardStepLabels = [
    'Client / project',
    'Billing stream',
    'Labor / expenses',
    'Period',
    'Included records',
    'Excluded / pending',
    'Taxes',
    'Invoice data',
    'Banking / payment',
    'Commercial adjustments',
    'Preview',
    'Save / issue',
  ];
  let setupProjectId = $state('');
  let setupCadence = $state('weekly');
  let setupCurrency = $state('');
  let setupLegalEntityId = $state('');
  let setupTaxProfileId = $state('');
  let setupContactId = $state('');
  const setupProject = $derived(
    availableProjects.find((project) => rowValue(project, 'id') === setupProjectId),
  );
  const setupEligibleIssuers = $derived(
    (data.legalEntities ?? []).filter(
      (entity) =>
        setupProjectId &&
        rowValue(entity, 'currency') === setupCurrency &&
        rowValue(entity, 'status') === 'active',
    ),
  );
  const setupIssuerUnavailableProblem = $derived.by((): ProblemData | null => {
    if (!setupProject || !setupCurrency || setupEligibleIssuers.length > 0) return null;
    return {
      code: 'BILLING_SETUP_NO_ACTIVE_ISSUER_FOR_CURRENCY',
      messageKey: 'problem.billing.noActiveIssuerForProjectCurrency',
      params: {
        projectName: rowValue(setupProject, 'name', 'project_name', 'projectName'),
        currency: setupCurrency,
      },
      fieldErrors: {},
      remedies: [
        { id: canManageIssuerAndNumbering ? 'configure_invoice_issuer' : 'contact_owner' },
      ],
      correlationId: '',
    };
  });
  $effect(() => {
    setupCurrency = rowValue(setupProject, 'currency');
    setupLegalEntityId = rowValue(
      (data.legalEntities ?? []).find(
        (entity) =>
          rowValue(entity, 'code') === 'JA-USA' &&
          rowValue(entity, 'currency') === setupCurrency &&
          rowValue(entity, 'status') === 'active',
      ),
      'id',
    );
    setupTaxProfileId = '';
    setupContactId = '';
  });
  $effect(() => {
    if (!setupLegalEntityId) return;
    setupTaxProfileId = '';
  });
  const ledgerRows = $derived(data.ledger ?? []);
  const canManageBilling = $derived(
    !isAuditor && ['owner_admin', 'finance_admin'].includes(String(data.user.role ?? '')),
  );
  const taxProfileFailure = $derived(
    Boolean(
      billingProblem && ['updateTaxProfile', 'archiveTaxProfile'].includes(billingFailureOperation),
    ),
  );
  const taxProfileRetryDenied = $derived(
    taxProfileFailure &&
      [
        'BILLING_FINANCE_REQUIRED',
        'ACTION_ERROR_FORBIDDEN',
        'ACTION_ERROR_UNAUTHENTICATED',
      ].includes(billingProblem?.code ?? ''),
  );
  const taxProfileUnavailable = $derived(
    taxProfileFailure &&
      (billingProblem?.code === 'BILLING_TAX_PROFILE_UNAVAILABLE' ||
        !(data.taxProfiles ?? []).some(
          (profile) => rowValue(profile, 'id') === billingFailureValues.taxProfileId,
        )),
  );
  let taxProfileRefresh = $state<'idle' | 'refreshing' | 'done' | 'failed'>('idle');
  let refreshedTaxProfileProblem = '';
  let observedTaxProfileProblem = '';
  $effect(() => {
    const problemId = billingProblem?.correlationId ?? '';
    if (problemId !== observedTaxProfileProblem) {
      observedTaxProfileProblem = problemId;
      taxProfileRefresh = 'idle';
    }
    if (
      !problemId ||
      problemId === refreshedTaxProfileProblem ||
      billingProblem?.code !== 'BILLING_TAX_PROFILE_UNAVAILABLE'
    )
      return;
    refreshedTaxProfileProblem = problemId;
    taxProfileRefresh = 'refreshing';
    void invalidateAll()
      .then(() => {
        if (billingProblem?.correlationId === problemId) taxProfileRefresh = 'done';
      })
      .catch(() => {
        if (billingProblem?.correlationId === problemId) taxProfileRefresh = 'failed';
      });
  });
  const canManageIssuerAndNumbering = $derived(data.user.role === 'owner_admin');
  const canVoidInvoice = $derived(data.user.role === 'owner_admin');

  useViewPreferences({
    scope: 'billing',
    user: () => `${data.user.id}:${data.user.role}`,
    url: () => $page.url,
    defaults: {
      search: '',
      projectFilter: '',
      stageFilter: 'all',
      workspace: 'invoices',
      setupAction: 'stream',
    },
    query: {
      search: 'q',
      projectFilter: 'project',
      stageFilter: 'stage',
      workspace: 'view',
      setupAction: 'setup',
    },
    get: () => ({ search, projectFilter, stageFilter, workspace, setupAction }),
    set: (saved) => {
      search = saved.search;
      projectFilter = saved.projectFilter;
      stageFilter = billingStageFromQuery(saved.stageFilter);
      if (!billingProblem) {
        workspace = ['invoices', 'streams', 'setup'].includes(saved.workspace)
          ? (saved.workspace as BillingWorkspace)
          : 'invoices';
        setupAction = setupActions.some((action) => action.id === saved.setupAction)
          ? (saved.setupAction as BillingSetupAction)
          : 'stream';
      }
    },
  });
  let restoredBillingLocationId = '';
  $effect(() => {
    const id = billingProblem?.correlationId;
    if (!id || id === restoredBillingLocationId) return;
    restoredBillingLocationId = id;
    if (
      [
        'createBillingRule',
        'createLegalEntity',
        'createTaxProfile',
        'createInvoiceNumberPolicy',
        'updateLegalEntity',
        'updateIssuerDocumentSettings',
        'archiveLegalEntity',
        'updateTaxProfile',
        'archiveTaxProfile',
      ].includes(billingFailureOperation)
    ) {
      workspace = 'setup';
      setupAction = billingFailureOperation.includes('LegalEntity')
        ? 'entity'
        : billingFailureOperation.includes('TaxProfile')
          ? 'tax'
          : billingFailureOperation === 'createInvoiceNumberPolicy'
            ? 'numbering'
            : 'stream';
      if (billingFailureOperation === 'createBillingRule') {
        setupProjectId = billingFailureValues.projectId ?? '';
        setupCadence = billingFailureValues.cadenceType ?? 'weekly';
        void tick().then(() => {
          setupLegalEntityId = billingFailureValues.legalEntityId ?? '';
          setupContactId = billingFailureValues.billingContactId ?? '';
          void tick().then(() => (setupTaxProfileId = billingFailureValues.taxProfileId ?? ''));
        });
      }
    } else if (
      ['updateBillingRule', 'archiveBillingRule', 'closePeriod'].includes(billingFailureOperation)
    ) {
      workspace = 'streams';
    } else if (billingFailureOperation && billingFailureOperation !== 'createDraft') {
      workspace = 'invoices';
    }
  });

  function rowValue(row: Row | Record<string, unknown> | undefined, ...keys: string[]): string {
    if (!row) return '';
    const source = row as Record<string, unknown>;
    for (const key of keys) {
      const value = source[key];
      if (value !== null && value !== undefined && value !== '') return String(value);
    }
    return '';
  }

  function savedSemiMonthlyRuleProblem(rule: Row): ProblemData | null {
    if (rowValue(rule, 'enabled') !== '1') return null;
    const cadence = rowValue(rule, 'cadence_type', 'cadenceType');
    const split = rowValue(rule, 'semi_monthly_rule', 'semiMonthlyRule');
    if (cadence !== 'semi_monthly' || !split || split === '1_15_16_end') return null;
    const canReviewSetup = ['owner_admin', 'finance_admin'].includes(String(data.user.role ?? ''));
    return {
      code: 'BILLING_SAVED_SEMI_MONTHLY_RULE_NOT_APPLIED',
      messageKey: canReviewSetup
        ? 'problem.billing.savedSemiMonthlyRuleNotApplied'
        : 'problem.billing.savedSemiMonthlyRuleContactFinance',
      fieldErrors: {},
      remedies: [{ id: canReviewSetup ? 'review_billing_setup' : 'contact_finance' }],
      correlationId: '',
    };
  }

  function ledgerForInvoice(invoiceId: unknown): BillingLedgerRow | undefined {
    const id = String(invoiceId ?? '');
    return ledgerRows.find((row) => {
      const candidate = row as Record<string, unknown>;
      return String(candidate.invoiceId ?? candidate.invoice_id ?? '') === id;
    }) as BillingLedgerRow | undefined;
  }

  function automationBlockers(rule: Row): string[] {
    const raw = rowValue(rule, 'automation_blocking_reasons', 'automationBlockingReasons');
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((reason) =>
          typeof reason === 'string'
            ? reason
            : reason && typeof reason === 'object' && 'code' in reason
              ? String(reason.code)
              : '',
        )
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  function invoiceState(invoice: Row): string {
    return rowValue(invoice, 'state').toLowerCase();
  }

  function financeDraftHasKnownLinkedLines(invoice: Row): boolean {
    // These counts are optional in the invoice projection. Absence is unknown, not zero;
    // the repository remains authoritative if the invoice changes before submission.
    return [
      'invoice_source_count',
      'invoiceSourceCount',
      'invoice_line_count',
      'invoiceLineCount',
    ].some((key) => {
      const count = (invoice as Record<string, unknown>)[key];
      return typeof count === 'number'
        ? Number.isSafeInteger(count) && count > 0
        : typeof count === 'string' && /^[1-9]\d*$/.test(count);
    });
  }

  function isCreditNoteInvoice(invoice: Row): boolean {
    return (
      rowValue(invoice, 'stream_type', 'streamType') === 'adjustment' &&
      rowValue(invoice, 'total_minor', 'totalMinor').startsWith('-')
    );
  }

  function balanceLabel(invoice: Row): string {
    return isCreditNoteInvoice(invoice) ? translate('Credit balance') : translate('Outstanding');
  }

  function balanceDisplay(invoice: Row, ledger: BillingLedgerRow | undefined): string {
    if (!ledger) return '—';
    const amount = String(ledger.outstandingMinor ?? '0');
    return formatMoney(
      isCreditNoteInvoice(invoice) && amount.startsWith('-') ? amount.slice(1) : amount,
      invoiceCurrency(invoice),
    );
  }

  function invoiceStage(invoice: Row): Exclude<BillingStage, 'all'> | null {
    const state = invoiceState(invoice);
    const ledger = ledgerForInvoice(rowValue(invoice, 'id'));
    const paymentState = String(ledger?.paymentStatus ?? '').toLowerCase();
    if (
      isCreditNoteInvoice(invoice) &&
      ['issued', 'sent', 'partially_paid', 'paid', 'overdue'].includes(state)
    )
      return 'credits';
    if (state === 'overdue' || paymentState === 'overdue') return 'overdue';
    if (['wip', 'ready'].includes(state)) return 'wip';
    if (['draft', 'approved'].includes(state)) return 'drafts';
    if (state === 'paid' || paymentState === 'paid') return 'paid';
    if (['issued', 'sent', 'partially_paid'].includes(state)) return 'outstanding';
    return null;
  }

  // Summary cards count the same project/search scope as the register; only
  // their stage differs. This keeps a project handoff's totals meaningful.
  const summaryInvoices = $derived.by(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const invoiceProject = rowValue(invoice, 'project_id', 'projectId');
      const matchesProject = !projectFilter || invoiceProject === projectFilter;
      const matchesSearch =
        !normalizedSearch ||
        [
          rowValue(invoice, 'invoice_number', 'invoiceNumber'),
          rowValue(invoice, 'project_number', 'projectNumber'),
          rowValue(invoice, 'project_name', 'projectName'),
          invoiceProjectIdentity(invoice),
          rowValue(invoice, 'client_code', 'clientCode'),
          rowValue(invoice, 'client_number', 'clientNumber'),
          rowValue(invoice, 'client_name', 'clientName'),
          rowValue(invoice, 'cost_center_code', 'costCenterCode'),
          rowValue(invoice, 'stream_type', 'streamType'),
          rowValue(invoice, 'currency'),
          rowValue(invoice, 'state'),
          rowValue(invoice, 'period_start', 'periodStart'),
          rowValue(invoice, 'period_end', 'periodEnd'),
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesProject && matchesSearch;
    });
  });

  const stageCounts = $derived({
    wip: summaryInvoices.filter((invoice) => invoiceStage(invoice) === 'wip').length,
    drafts: summaryInvoices.filter((invoice) => invoiceStage(invoice) === 'drafts').length,
    outstanding: summaryInvoices.filter((invoice) => invoiceStage(invoice) === 'outstanding')
      .length,
    overdue: summaryInvoices.filter((invoice) => invoiceStage(invoice) === 'overdue').length,
    credits: summaryInvoices.filter((invoice) => invoiceStage(invoice) === 'credits').length,
    paid: summaryInvoices.filter((invoice) => invoiceStage(invoice) === 'paid').length,
  });

  const visibleInvoices = $derived(
    summaryInvoices.filter(
      (invoice) => stageFilter === 'all' || invoiceStage(invoice) === stageFilter,
    ),
  );

  const selectedInvoice = $derived(
    invoices.find((invoice) => rowValue(invoice, 'id') === selectedInvoiceId),
  );
  let reviewedInvoiceHashId = '';
  $effect(() => {
    const requested = $page.url.searchParams.get('invoice');
    if (
      !requested ||
      requested !== selectedInvoiceId ||
      !selectedInvoice ||
      $page.url.hash !== '#invoice-collections' ||
      reviewedInvoiceHashId === requested
    )
      return;
    reviewedInvoiceHashId = requested;
    void tick().then(() =>
      requestAnimationFrame(() => {
        const heading = document.getElementById('invoice-collections');
        heading?.scrollIntoView({ block: 'start', inline: 'nearest' });
        heading?.focus({ preventScroll: true });
      }),
    );
  });
  const billingProblemByForm = $derived.by(() => {
    if (!billingProblem) return false;
    if (invoiceWizardOpen && billingFailureOperation === 'createDraft') return true;
    if (selectedInvoice && invoiceFailureId === selectedInvoiceId) return true;
    if (
      (paymentDraft?.invoiceId && paymentDraft.invoiceId === selectedInvoiceId) ||
      (reversalDraft?.paymentId && reversalInvoiceId && reversalInvoiceId === selectedInvoiceId)
    )
      return true;
    if (workspace === 'setup' && canManageBilling) {
      if (billingFailureOperation === 'createBillingRule' && setupAction === 'stream') return true;
      if (billingFailureOperation === 'createTaxProfile' && setupAction === 'tax') return true;
      if (
        canManageIssuerAndNumbering &&
        ((billingFailureOperation === 'createLegalEntity' && setupAction === 'entity') ||
          (billingFailureOperation === 'createInvoiceNumberPolicy' && setupAction === 'numbering'))
      )
        return true;
      if (
        billingFailureOperation === 'updateLegalEntity' &&
        (data.legalEntities ?? []).some(
          (entity) => rowValue(entity, 'id') === billingFailureValues.legalEntityId,
        )
      )
        return true;
      if (taxProfileFailure) return true;
      if (
        billingFailureOperation === 'updateIssuerDocumentSettings' &&
        (data.legalEntities ?? []).some(
          (entity) => rowValue(entity, 'id') === billingFailureValues.legalEntityId,
        )
      )
        return true;
    }
    return (
      workspace === 'streams' &&
      canManageBilling &&
      ['updateBillingRule', 'archiveBillingRule', 'closePeriod'].includes(
        billingFailureOperation,
      ) &&
      billingRules.some(
        (rule) =>
          rowValue(rule, 'id') === billingFailureValues.billingRuleId &&
          rule.browser_status === 'active',
      )
    );
  });

  const invoiceCardRows = $derived.by((): TableCardRow[] =>
    invoicePage.map((invoice) => {
      const id = rowValue(invoice, 'id');
      const ledger = ledgerForInvoice(id);
      return {
        id,
        href: `#invoice-${id}`,
        linkLabel: translate('Manage'),
        cells: [
          {
            label: translate('Invoice'),
            value: invoiceTitle(invoice),
          },
          {
            label: translate('Client'),
            value: invoiceClientIdentity(invoice),
          },
          {
            label: translate('Project'),
            value: invoiceProjectIdentity(invoice) || '—',
          },
          {
            label: translate('Amount'),
            value: invoiceTotal(invoice),
          },
          {
            label: translate('Status'),
            value: invoiceStatusText(invoice),
          },
          {
            label: translate('PDF'),
            value: hasDraftPreview(invoice)
              ? translate('Preview')
              : translate(
                  invoicePdfStatus(invoice) === 'unavailable'
                    ? 'Unavailable'
                    : invoicePdfStatus(invoice),
                ),
          },
          {
            label: balanceLabel(invoice),
            value: balanceDisplay(invoice, ledger),
          },
        ],
      };
    }),
  );

  function stageLabel(stage: BillingStage): string {
    switch (stage) {
      case 'wip':
        return translate('WIP / Ready');
      case 'drafts':
        return translate('Drafts');
      case 'outstanding':
        return translate('Outstanding');
      case 'overdue':
        return translate('Overdue');
      case 'credits':
        return translate('Credit balances');
      case 'paid':
        return translate('Paid');
      default:
        return translate('All invoices');
    }
  }

  function statusVariant(value: unknown): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    switch (String(value ?? '').toLowerCase()) {
      case 'paid':
        return 'success';
      case 'issued':
      case 'sent':
      case 'partially_paid':
      case 'approved':
        return 'info';
      case 'overdue':
        return 'danger';
      case 'draft':
        return 'neutral';
      case 'wip':
      case 'ready':
        return 'warning';
      case 'void':
      case 'voided':
        return 'danger';
      case 'credited':
      case 'credit_note':
      case 'credit':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  function dateValue(value: unknown): string {
    const raw = String(value ?? '').trim();
    if (!raw) return '—';
    return raw.replace('T', ' ').slice(0, 16);
  }

  function isoDateAttr(value: unknown): string {
    const raw = String(value ?? '').trim();
    return raw ? raw.slice(0, 10) : '';
  }

  function openInvoice(invoice: Row): void {
    selectedInvoiceIntent = rowValue(invoice, 'id');
    selectedInvoiceIntentProblemId = billingProblem?.correlationId ?? '';
  }

  function closeInvoice(): void {
    selectedInvoiceIntent = '';
    selectedInvoiceIntentProblemId = billingProblem?.correlationId ?? '';
  }

  function jumpInvoiceSection(id: string): void {
    const target = document.getElementById(id);
    target?.scrollIntoView({ block: 'start' });
    target?.focus({ preventScroll: true });
  }

  function chooseWizardRule(ruleId: string): void {
    wizardRuleId = ruleId;
    const rule = billingRules.find((candidate) => rowValue(candidate, 'id') === ruleId);
    const period = rule ? streamDraftPeriod(rule) : { start: '', end: '' };
    wizardPeriodStart = period.start;
    wizardPeriodEnd = period.end;
    wizardReadiness = null;
    wizardReadinessError = '';
    wizardReadinessRemedy = '';
    wizardReadinessReference = '';
  }

  function resetWizardReadiness(): void {
    wizardReadiness = null;
    wizardReadinessError = '';
    wizardReadinessRemedy = '';
    wizardReadinessReference = '';
  }

  async function checkWizardPeriod(): Promise<void> {
    resetWizardReadiness();
    if (!wizardRuleId || !wizardPeriodStart || !wizardPeriodEnd) {
      wizardReadinessError = translate('Select a billing stream and valid period first.');
      wizardReadinessRemedy = 'review_selected_period';
      return;
    }
    wizardReadinessLoading = true;
    try {
      const query = new URLSearchParams({
        billingRuleId: wizardRuleId,
        periodStart: wizardPeriodStart,
        periodEnd: wizardPeriodEnd,
      });
      const response = await fetch(`${base}/app/api/billing/readiness?${query.toString()}`, {
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as Partial<ProblemData> | null;
        wizardReadinessError = translate(
          problem?.messageKey ?? 'problem.billing.readinessUnavailable',
        );
        wizardReadinessRemedy = problem?.remedies?.[0]?.id ?? 'retry_readiness';
        wizardReadinessReference = problem?.correlationId ?? '';
        return;
      }
      wizardReadiness = (await response.json()) as BillingReadinessPreview;
    } catch {
      wizardReadinessError = translate('problem.billing.readinessUnavailable');
      wizardReadinessRemedy = 'retry_readiness';
    } finally {
      wizardReadinessLoading = false;
    }
  }

  function openInvoiceWizard(): void {
    const eligibleRules = projectFilter
      ? activeWizardRules.filter(
          (rule) => rowValue(rule, 'project_id', 'projectId') === projectFilter,
        )
      : activeWizardRules;
    if (eligibleRules.length === 0) {
      invoiceSetupSelectedProject = availableProjects.some(
        (project) => rowValue(project, 'id') === projectFilter,
      );
      if (invoiceSetupSelectedProject) setupProjectId = projectFilter;
      invoiceSetupTargetProjectId = invoiceSetupSelectedProject ? projectFilter : null;
      invoiceSetupRequired = true;
      void showSetupAction('stream', true);
      return;
    }
    clearInvoiceSetupWarning();
    invoiceWizardStep = 1;
    chooseWizardRule(rowValue(eligibleRules[0], 'id'));
    invoiceWizardOpen = true;
  }

  function openInvoiceFromCard(event: MouseEvent): void {
    const article = (event.target as HTMLElement | null)?.closest('[data-row]');
    if (!(article instanceof HTMLElement)) return;
    const id = article.getAttribute('data-row') ?? '';
    const invoice = visibleInvoices.find((row) => rowValue(row, 'id') === id);
    if (!invoice) return;
    event.preventDefault();
    openInvoice(invoice);
  }

  function percentToBps(raw: string): string | null {
    const value = raw.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
    const [whole, fraction = ''] = value.split('.');
    const paddedFraction = `${fraction}00`.slice(0, 2);
    const digits = `${whole}${paddedFraction}`.replace(/^0+(?=\d)/, '') || '0';
    return BigInt(digits) <= 10_000n ? digits : null;
  }

  function minorToDecimal(value: unknown): string {
    const raw = String(value ?? '').trim();
    if (!/^\d+$/.test(raw)) return '0.00';
    const normalized = raw.replace(/^0+(?=\d)/, '').padStart(3, '0');
    return `${normalized.slice(0, -2)}.${normalized.slice(-2)}`;
  }

  function asIssueBlocker(value: unknown): IssueBlocker | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const source = value as Record<string, unknown>;
    const code = String(source.code ?? '').trim();
    if (!code) return undefined;
    const deepLink = String(source.deepLink ?? source.deep_link ?? '').trim();
    const sourceId = String(source.sourceId ?? source.source_id ?? '').trim();
    return {
      code,
      ...(sourceId ? { sourceId } : {}),
      ...(deepLink ? { deepLink } : {}),
    };
  }

  function blockerFromReasons(value: unknown): IssueBlocker | undefined {
    if (Array.isArray(value)) {
      for (const reason of value) {
        const blocker = asIssueBlocker(reason);
        if (blocker) return blocker;
      }
      return undefined;
    }
    return asIssueBlocker(value);
  }

  const issueBlocker = $derived.by(() => {
    if (!form || billingFailureOperation !== 'issueInvoice') return undefined;
    return blockerFromReasons(form.reasons) ?? asIssueBlocker(form.issueBlocker);
  });

  function invoiceIssueBlocker(invoice: Row): IssueBlocker | undefined {
    const source = invoice as Record<string, unknown>;
    return (
      asIssueBlocker(source.issueBlocker) ??
      asIssueBlocker(source.issue_blocker) ??
      blockerFromReasons(source.issueBlockers ?? source.issue_blockers)
    );
  }

  function blockerHref(blocker: IssueBlocker): string | undefined {
    if (!blocker.deepLink) return undefined;
    return blocker.deepLink.startsWith('/') ? `${base}${blocker.deepLink}` : blocker.deepLink;
  }

  function blockerMessage(blocker: IssueBlocker): string {
    if (blocker.code === 'customer_signoff_required')
      return translate('Customer sign-off is required before this invoice can be issued.');
    return translate('Invoice issue is blocked until billing readiness is complete.');
  }

  function projectLabel(project: Row): string {
    const number = rowValue(project, 'project_number', 'projectNumber');
    const name = rowValue(project, 'name', 'project_name', 'projectName');
    const currency = rowValue(project, 'currency');
    return [number, name, currency ? `(${currency})` : ''].filter(Boolean).join(' — ');
  }

  function invoiceClientIdentity(invoice: Row): string {
    const code = rowValue(invoice, 'client_code', 'clientCode');
    const number = rowValue(invoice, 'client_number', 'clientNumber');
    const name = rowValue(invoice, 'client_name', 'clientName');
    return [code, number, name].filter(Boolean).join(' · ') || '—';
  }

  function invoiceProjectIdentity(invoice: Row): string {
    const projectId = rowValue(invoice, 'project_id', 'projectId');
    const project = (data.projects ?? []).find(
      (candidate) => rowValue(candidate, 'id') === projectId,
    );
    const projectName =
      rowValue(invoice, 'project_name', 'projectName') ||
      rowValue(project, 'name', 'project_name', 'projectName');
    const projectNumber = rowValue(invoice, 'project_number', 'projectNumber');
    const costCenter = rowValue(invoice, 'cost_center_code', 'costCenterCode');
    const poNumber = rowValue(invoice, 'po_number', 'poNumber');
    return [
      [projectNumber, projectName].filter(Boolean).join(' · '),
      costCenter ? `${translate('Cost center')}: ${costCenter}` : '',
      poNumber ? `PO: ${poNumber}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  function invoiceCurrency(invoice: Row): string {
    return rowValue(invoice, 'currency') || 'USD';
  }

  function invoiceTotal(invoice: Row): string {
    return formatMoney(rowValue(invoice, 'total_minor', 'totalMinor'), invoiceCurrency(invoice));
  }

  function invoiceStatus(invoice: Row): string {
    if (invoiceState(invoice) === 'superseded') return translate('Superseded');
    return (
      controlledValue('status', rowValue(invoice, 'state')) ||
      rowValue(invoice, 'state') ||
      translate('Unknown')
    );
  }

  function invoiceStatusText(invoice: Row): string {
    const status = invoiceStatus(invoice);
    return invoiceState(invoice) === 'paid' ? `✓ ${status}` : status;
  }

  function invoicePdfStatus(invoice: Row): InvoicePdfStatus {
    const status = rowValue(invoice, 'pdf_status', 'pdfStatus').toLowerCase();
    if (status === 'ready') return 'ready';
    if (status === 'failed') return 'failed';
    if (status === 'rendering' || status === 'running' || status === 'processing') return 'running';
    if (status === 'queued' || status === 'pending') return 'queued';
    return 'unavailable';
  }

  function hasDraftPreview(invoice: Row): boolean {
    const number = invoice.invoice_number ?? invoice.invoiceNumber;
    const issuedAt = invoice.issued_at ?? invoice.issuedAt;
    return (
      ['draft', 'approved'].includes(invoiceState(invoice)) &&
      (number === null || number === undefined) &&
      (issuedAt === null || issuedAt === undefined)
    );
  }

  function groupingLabel(mode: string): string {
    const labels: Record<string, string> = {
      summary: 'Summary',
      detail: 'Detail',
      by_worker: 'By worker',
      by_day: 'By day',
      by_category: 'By category',
    };
    return labels[mode] ? translate(labels[mode]) : mode || '—';
  }

  function templateLabel(template: string): string {
    const labels: Record<string, string> = {
      default: 'Default',
      'labor-detailed': 'Labor detailed',
      'labor-summary': 'Labor summary',
      'expenses-detailed': 'Expenses detailed',
      'fixed-milestone': 'Fixed milestone',
    };
    return labels[template] ? translate(labels[template]) : template || '—';
  }

  function streamStatusLabel(state: string): string {
    const labels: Record<string, string> = {
      active: 'Active',
      archived: 'Archived',
      unknown: 'Unknown',
    };
    return translate(labels[state] ?? state);
  }

  function invoiceTitle(invoice: Row): string {
    if (invoiceState(invoice) === 'superseded') {
      const number = rowValue(invoice, 'invoice_number', 'invoiceNumber');
      const project = invoiceProjectIdentity(invoice);
      const period = [
        rowValue(invoice, 'period_start', 'periodStart'),
        rowValue(invoice, 'period_end', 'periodEnd'),
      ]
        .filter(Boolean)
        .join(' – ');
      return [translate('Superseded approved invoice'), number || project, period]
        .filter(Boolean)
        .join(' · ');
    }
    return rowValue(invoice, 'invoice_number', 'invoiceNumber') || translate('Draft invoice');
  }

  function paymentLabel(payment: LedgerPayment | undefined): string {
    if (!payment) return translate('Payment');
    const reference = String(payment.reference ?? '').trim();
    if (
      reference &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(reference)
    )
      return `${translate('Payment')} · ${reference}`;
    const received = dateValue(payment.received_at);
    return received && received !== '—'
      ? `${translate('Payment')} · ${received}`
      : translate('Payment');
  }

  function paymentStatus(ledger: BillingLedgerRow | undefined): string {
    return ledger
      ? controlledValue('status', ledger.paymentStatus) || translate('Unpaid')
      : translate('No ledger row');
  }

  function lifecycleStage(state: string): 'draft' | 'approved' | 'issued' | 'collected' {
    if (state === 'paid') return 'collected';
    if (['issued', 'sent', 'partially_paid', 'overdue'].includes(state)) return 'issued';
    if (state === 'approved') return 'approved';
    return 'draft';
  }

  function nextStepCopy(state: string, isCreditNote = false): string {
    if (isCreditNote && ['issued', 'sent', 'partially_paid', 'paid', 'overdue'].includes(state))
      return translate(
        'This issued credit is a balance owed to the customer. Review its allocation or refund in the ledger; do not record a customer payment.',
      );
    if (state === 'superseded')
      return translate(
        'This approved version was replaced. Its amounts and lines remain available for review.',
      );
    if (state === 'draft')
      return translate(
        'Approve this draft after Finance has reviewed the lines. The client does not receive it yet.',
      );
    if (state === 'approved')
      return translate(
        'Issue to assign the invoice number, lock the snapshot and generate the client PDF.',
      );
    if (['issued', 'sent', 'partially_paid', 'overdue'].includes(state))
      return translate(
        'Record money received from the client. That is the only path that counts as collected.',
      );
    if (state === 'paid') return translate('Issued history is immutable');
    return translate('No lifecycle action available');
  }
  let invoicePage = $state<typeof visibleInvoices>([]);
</script>

<div class="billing-section" data-ui="billing-section">
  <header class="billing-section__context">
    <div>
      <p class="billing-section__eyebrow">{translate('Finance operations')}</p>
      <h2>{translate('Billing')}</h2>
      <p>
        {translate(
          'Invoices are the bill: draft, approve, issue, collect. Billing streams only set cadence and template for a project.',
        )}
      </p>
    </div>
    {#if isAuditor}
      <span class="billing-section__read-only" role="status">{translate('Read-only review')}</span>
    {:else if canManageBilling}
      <button type="button" class="primary-button" onclick={openInvoiceWizard}
        >{translate('Create invoice')}</button
      >
    {/if}
  </header>
  {#if billingProblem && !billingProblemByForm}
    <ProblemNotice
      problem={billingProblem}
      kind={billingProblem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
      remedyLinks={problemRemedyLinks}
    />
  {/if}
  {#if form?.success && String(form.messageKey ?? '').startsWith('action.billing.invoiceDraft') && form.messageParams?.invoiceId}
    <p role="status">
      <a
        class="secondary-button"
        href={`${base}/app/billing/invoices/${encodeURIComponent(String(form.messageParams.invoiceId))}`}
        >{translate('Open invoice')} <DirectionIcon /></a
      >
    </p>
  {:else if form?.success && form.messageKey === 'action.billing.invoiceAlreadyExists' && form.messageParams?.invoiceId}
    <p role="status">
      <a
        class="secondary-button"
        href={`${base}/app/billing/invoices/${encodeURIComponent(String(form.messageParams.invoiceId))}`}
        >{translate('Open existing invoice')} <DirectionIcon /></a
      >
    </p>
  {/if}

  {#if invoiceWizardOpen && canManageBilling}
    <ResponsiveSheet
      open={true}
      title={translate('Create invoice')}
      description={translate('Guided invoice workflow')}
      closeLabel={translate('Close')}
      onclose={() => (invoiceWizardOpen = false)}
    >
      <form method="POST" action="?/createDraft" class="billing-section__invoice-wizard">
        {#if billingProblem}
          <ProblemNotice
            problem={billingProblem}
            kind={billingProblem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
            remedyLinks={problemRemedyLinks}
          />
        {/if}
        <input type="hidden" name="billingRuleId" value={wizardRuleId} />
        <input type="hidden" name="periodStart" value={wizardPeriodStart} />
        <input type="hidden" name="periodEnd" value={wizardPeriodEnd} />
        <ol class="billing-section__wizard-progress" aria-label={translate('Invoice steps')}>
          {#each wizardStepLabels as label, index}
            <li aria-current={invoiceWizardStep === index + 1 ? 'step' : undefined}>
              <button type="button" onclick={() => (invoiceWizardStep = index + 1)}>
                <span>{index + 1}</span>{translate(label)}
              </button>
            </li>
          {/each}
        </ol>
        <details class="billing-section__wizard-mobile-progress">
          <summary
            >{translate('Invoice steps')} · {invoiceWizardStep}/12 · {translate(
              wizardStepLabels[invoiceWizardStep - 1] ?? 'Invoice steps',
            )}</summary
          >
          <ol aria-label={translate('Invoice steps')}>
            {#each wizardStepLabels as label, index}
              <li aria-current={invoiceWizardStep === index + 1 ? 'step' : undefined}>
                <button
                  type="button"
                  onclick={(event) => {
                    invoiceWizardStep = index + 1;
                    event.currentTarget.closest('details')?.removeAttribute('open');
                  }}><span>{index + 1}</span>{translate(label)}</button
                >
              </li>
            {/each}
          </ol>
        </details>

        {#if invoiceWizardStep === 1}
          <section>
            <h3>{translate('Client / project')}</h3>
            <p>{translate('Choose the project whose approved source records will be billed.')}</p>
            <label>
              <span>{translate('Project and billing stream')}</span>
              <select
                value={wizardRuleId}
                onchange={(event) => chooseWizardRule(event.currentTarget.value)}
                required
              >
                {#each activeWizardRules as rule}
                  <option value={rowValue(rule, 'id')}>
                    {rowValue(rule, 'client_number', 'clientNumber')} · {rowValue(
                      rule,
                      'client_name',
                      'clientName',
                    )} — {rowValue(rule, 'project_number', 'projectNumber')} · {controlledValue(
                      'billingStream',
                      rowValue(rule, 'stream_type', 'streamType'),
                    )} · {controlledValue(
                      'billingStream',
                      rowValue(rule, 'cadence_type', 'cadenceType'),
                    )} ·
                    {rowValue(rule, 'currency')}
                  </option>
                {/each}
              </select>
            </label>
          </section>
        {:else if invoiceWizardStep === 2}
          <section>
            <h3>{translate('Billing stream')}</h3>
            <p>
              {translate(
                'Labor and expenses approved for customer billing use independent streams, cadence and tax configuration. Non-billable expenses are excluded even if J&A reimburses the worker.',
              )}
            </p>
            <dl>
              <div>
                <dt>{translate('Stream')}</dt>
                <dd>
                  {controlledValue(
                    'billingStream',
                    rowValue(wizardRule, 'stream_type', 'streamType'),
                  )}
                </dd>
              </div>
              <div>
                <dt>{translate('Cadence')}</dt>
                <dd>
                  {controlledValue(
                    'billingStream',
                    rowValue(wizardRule, 'cadence_type', 'cadenceType'),
                  )}
                </dd>
              </div>
              <div>
                <dt>{translate('Tax profile')}</dt>
                <dd>
                  {rowValue(wizardRule, 'tax_profile_name', 'taxProfileName') ||
                    translate('No tax profile configured')}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              class="secondary-button"
              onclick={() => {
                selectBillingWorkspace('streams');
                invoiceWizardOpen = false;
              }}>{translate('Manage stream')}</button
            >
          </section>
        {:else if invoiceWizardStep === 3}
          <section>
            <h3>{translate('Labor / expenses')}</h3>
            <p>
              {translate(
                'This stream includes one source family only, preventing the same labor or expense from being invoiced twice.',
              )}
            </p>
            <dl>
              <div>
                <dt>{translate('Source')}</dt>
                <dd>
                  {controlledValue(
                    'billingStream',
                    rowValue(wizardRule, 'stream_type', 'streamType'),
                  )}
                </dd>
              </div>
              <div>
                <dt>{translate('Saved grouping setting')}</dt>
                <dd>
                  {groupingLabel(rowValue(wizardRule, 'grouping_mode', 'groupingMode'))}
                </dd>
              </div>
            </dl>
            <p data-billing-grouping-help>
              {translate(
                'Grouping cannot be customized here. Invoice layout follows the selected template.',
              )}
            </p>
          </section>
        {:else if invoiceWizardStep === 4}
          <section>
            <h3>{translate('Period')}</h3>
            <p>
              {translate(
                'The suggested dates come from this stream’s configured cadence. Manual dates are an explicit change and are never replaced silently.',
              )}
            </p>
            <div class="billing-section__wizard-fields">
              <label
                ><span>{translate('Period start')}</span><input
                  data-billing-wizard-period-start
                  bind:value={wizardPeriodStart}
                  oninput={resetWizardReadiness}
                  type="date"
                  required
                /></label
              >
              <label
                ><span>{translate('Period end')}</span><input
                  bind:value={wizardPeriodEnd}
                  oninput={resetWizardReadiness}
                  type="date"
                  required
                /></label
              >
            </div>
            <button
              type="button"
              class="secondary-button"
              disabled={wizardReadinessLoading ||
                !wizardRuleId ||
                !wizardPeriodStart ||
                !wizardPeriodEnd}
              onclick={checkWizardPeriod}
              >{wizardReadinessLoading
                ? translate('Checking period…')
                : translate('Check selected period')}</button
            >
            {#if wizardReadinessError}
              <div
                role="alert"
                tabindex="-1"
                bind:this={wizardReadinessAlert}
                data-billing-readiness-problem
              >
                <p>{wizardReadinessError}</p>
                {#if wizardReadinessReference}
                  <small>{translate('Reference')}: {wizardReadinessReference}</small>
                {/if}
                {#if wizardReadinessRemedy === 'review_billing_setup'}
                  <a href={`${base}/app/billing?view=setup`}>{translate('Review billing setup')}</a>
                {:else if wizardReadinessRemedy === 'sign_in_again'}
                  <a href={`${base}/app/login`}>{translate('Sign in again')}</a>
                {:else if wizardReadinessRemedy === 'contact_finance'}
                  <span>{translate('Contact a finance administrator')}</span>
                {:else if wizardReadinessRemedy === 'contact_owner'}
                  <span>{translate('Contact an owner')}</span>
                {:else if wizardReadinessRemedy === 'review_selected_period'}
                  <button
                    type="button"
                    class="secondary-button"
                    onclick={() =>
                      document
                        .querySelector<HTMLInputElement>('[data-billing-wizard-period-start]')
                        ?.focus()}>{translate('Review selected period')}</button
                  >
                {:else if wizardReadinessRemedy === 'retry_readiness'}
                  <button type="button" class="secondary-button" onclick={checkWizardPeriod}
                    >{translate('Retry')}</button
                  >
                {/if}
              </div>
            {/if}
            {#if wizardReadiness?.reasons.some((reason) => reason.code === 'pending_time_finance_review')}
              <div role="status" data-pending-time-finance-review>
                <p>{translate('action.billing.readiness.pendingTimeFinanceReview')}</p>
                <a href={readinessActionHref(wizardReadiness.reasons)}
                  >{translate('Review pending records')}</a
                >
              </div>
            {/if}
            {#if wizardReadiness?.existingInvoiceId}
              <p role="status">
                {translate('An invoice already exists for this stream and period.')}
                {controlledValue('status', wizardReadiness.existingInvoiceState)}
              </p>
              <a
                class="secondary-button"
                href={`${base}/app/billing/invoices/${encodeURIComponent(wizardReadiness.existingInvoiceId)}`}
                >{translate('Open existing invoice')} <DirectionIcon /></a
              >
            {/if}
          </section>
        {:else if invoiceWizardStep === 5}
          <section>
            <h3>{translate('Included records')}</h3>
            <p>
              {translate(
                'The draft includes approved, eligible and unbilled records from this exact period. The generated draft preserves a source-by-source snapshot for review.',
              )}
            </p>
            <p>
              {translate(
                'Eligibility and totals are calculated by the billing engine when the draft is saved; the browser does not duplicate those calculations.',
              )}
            </p>
            {#if wizardReadiness}
              <dl>
                <div>
                  <dt>{translate('Included source records')}</dt>
                  <dd>{wizardReadiness.includedSourceCount}</dd>
                </div>
                <div>
                  <dt>{translate('Period readiness')}</dt>
                  <dd>
                    {wizardHasNoBillableSources
                      ? translate(
                          wizardReadiness.includedSourceCount > 0
                            ? 'No positive billable amount'
                            : 'No billable records',
                        )
                      : controlledValue('status', wizardReadiness.state)}
                  </dd>
                </div>
              </dl>
              {#if wizardHasNoBillableSources}<p role="alert">
                  {translate(wizardEmptySourcesMessage)}
                </p>{/if}
              {#if wizardReadiness.includedExpenseRows?.length}
                <h4>{translate('Eligible expenses')}</h4>
                <table class="billing-section__table">
                  <thead
                    ><tr
                      ><th>{translate('Date')}</th><th>{translate('Category')}</th><th
                        >{translate('Description')}</th
                      ><th>{translate('Customer amount')}</th></tr
                    ></thead
                  >
                  <tbody
                    >{#each wizardReadiness.includedExpenseRows as expense}<tr>
                        <td>{expense.spentOn}</td><td
                          >{controlledValue('expenseCategory', expense.category)}</td
                        >
                        <td>{expense.description}</td><td
                          >{formatMoney(expense.amountMinor, rowValue(wizardRule, 'currency'))}</td
                        >
                      </tr>{/each}</tbody
                  >
                  <tfoot
                    ><tr
                      ><th colspan="3"
                        >{translate('Eligible expense subtotal before caps and adjustments')}</th
                      ><td
                        >{formatMoney(
                          wizardReadiness.includedExpenseSubtotalMinor,
                          rowValue(wizardRule, 'currency'),
                        )}</td
                      ></tr
                    ></tfoot
                  >
                </table>
              {/if}
            {:else}
              <button type="button" class="secondary-button" onclick={checkWizardPeriod}
                >{translate('Check selected period')}</button
              >
            {/if}
          </section>
        {:else if invoiceWizardStep === 6}
          <section>
            <h3>{translate('Excluded / pending')}</h3>
            <p>
              {translate(
                'Pending approvals, active corrections, missing rates or required reports block this exact period. The result explains each exclusion and keeps your selected dates.',
              )}
            </p>
            {#if wizardReadiness}
              <dl>
                <div>
                  <dt>{translate('Excluded or pending source records')}</dt>
                  <dd>{wizardReadiness.excludedSourceCount}</dd>
                </div>
              </dl>
              {#if wizardReadiness.reasons.length}
                <ul>
                  {#each wizardReadiness.reasons as reason}
                    <li>{translate(billingReadinessMessageKey(reason.code))}</li>
                  {/each}
                </ul>
              {:else}
                <p>{translate('No blocking conditions were found for this exact period.')}</p>
              {/if}
            {:else}
              <button type="button" class="secondary-button" onclick={checkWizardPeriod}
                >{translate('Check selected period')}</button
              >
            {/if}
            <a class="secondary-button" href={readinessActionHref(wizardReadiness?.reasons ?? [])}
              >{translate('Review pending records')}</a
            >
          </section>
        {:else if invoiceWizardStep === 7}
          <section>
            <h3>{translate('Taxes')}</h3>
            <p>
              {translate(
                'A selected tax profile calculates tax. Without one, the draft adds no tax.',
              )}
            </p>
            <dl>
              <div>
                <dt>{translate('Tax profile')}</dt>
                <dd>
                  {rowValue(wizardRule, 'tax_profile_name', 'taxProfileName') ||
                    translate('No tax profile configured')}
                </dd>
              </div>
              <div>
                <dt>{translate('Currency')}</dt>
                <dd>{rowValue(wizardRule, 'currency')}</dd>
              </div>
            </dl>
          </section>
        {:else if invoiceWizardStep === 8}
          <section>
            <h3>{translate('Invoice data')}</h3>
            <p>
              {translate(
                'The invoice issuer is your company. The customer legal name comes from the client used to create this project.',
              )}
            </p>
            <dl>
              <div>
                <dt>{translate('Invoice issuer')}</dt>
                <dd>
                  {rowValue(wizardRule, 'legal_entity_code', 'legalEntityCode') ||
                    translate('Missing')}
                </dd>
              </div>
              <div>
                <dt>{translate('Customer legal entity')}</dt>
                <dd>{rowValue(wizardRule, 'client_legal_name', 'clientLegalName')}</dd>
              </div>
              <div>
                <dt>{translate('Customer billing address')}</dt>
                <dd>
                  {rowValue(wizardRule, 'client_billing_address', 'clientBillingAddress') ||
                    translate('Missing')}
                </dd>
              </div>
              <div>
                <dt>{translate('Recipient email')}</dt>
                <dd>
                  {rowValue(wizardRule, 'recipient_email', 'recipientEmail') ||
                    translate('Missing')}
                </dd>
              </div>
              <div>
                <dt>{translate('PO reference')}</dt>
                <dd>{rowValue(wizardRule, 'po_number_override', 'poNumberOverride') || '—'}</dd>
              </div>
            </dl>
          </section>
        {:else if invoiceWizardStep === 9}
          <section>
            <h3>{translate('Banking / payment')}</h3>
            <p>
              {translate(
                'Payment terms come from the billing stream. Review payment instructions on the draft before issuing.',
              )}
            </p>
            <dl>
              <div>
                <dt>{translate('Issuing entity')}</dt>
                <dd>
                  {rowValue(wizardRule, 'legal_entity_code', 'legalEntityCode') ||
                    translate('Missing')}
                </dd>
              </div>
              <div>
                <dt>{translate('Payment terms (days)')}</dt>
                <dd>{rowValue(wizardRule, 'payment_terms_days', 'paymentTermsDays') || '30'}</dd>
              </div>
            </dl>
          </section>
        {:else if invoiceWizardStep === 10}
          <section>
            <h3>{translate('Commercial adjustments')}</h3>
            <p>
              {translate(
                'Correct a wrong source record in Time or Expenses. A commercial adjustment changes only what is billed and never overwrites the actual work record.',
              )}
            </p>
            <p>
              {translate(
                'Manual commercial adjustments are added to the reviewable draft with a reason and audit trail before issue.',
              )}
            </p>
          </section>
        {:else if invoiceWizardStep === 11}
          <section>
            <h3>{translate('Preview')}</h3>
            <dl>
              <div>
                <dt>{translate('Customer legal entity')}</dt>
                <dd>{rowValue(wizardRule, 'client_legal_name', 'clientLegalName')}</dd>
              </div>
              <div>
                <dt>{translate('Project')}</dt>
                <dd>{rowValue(wizardRule, 'project_number', 'projectNumber')}</dd>
              </div>
              <div>
                <dt>{translate('Period')}</dt>
                <dd>
                  {wizardPeriodStart && wizardPeriodEnd
                    ? `${wizardPeriodStart} → ${wizardPeriodEnd}`
                    : translate('Choose dates in the Period step to preview this invoice.')}
                </dd>
              </div>
            </dl>
            {#if wizardReadiness?.includedExpenseRows?.length}
              <h4>{translate('Eligible expenses')}</h4>
              <table class="billing-section__table">
                <thead
                  ><tr
                    ><th>{translate('Date')}</th><th>{translate('Description')}</th><th
                      >{translate('Customer amount')}</th
                    ></tr
                  ></thead
                >
                <tbody
                  >{#each wizardReadiness.includedExpenseRows as expense}<tr>
                      <td>{expense.spentOn}</td><td>{expense.description}</td>
                      <td>{formatMoney(expense.amountMinor, rowValue(wizardRule, 'currency'))}</td>
                    </tr>{/each}</tbody
                >
                <tfoot
                  ><tr
                    ><th colspan="2"
                      >{translate('Eligible expense subtotal before caps and adjustments')}</th
                    ><td
                      >{formatMoney(
                        wizardReadiness.includedExpenseSubtotalMinor,
                        rowValue(wizardRule, 'currency'),
                      )}</td
                    ></tr
                  ></tfoot
                >
              </table>
            {/if}
            <p>
              {translate(
                'Save draft builds a reviewable snapshot. It does not issue, number, send or collect the invoice.',
              )}
            </p>
            {#if !wizardReadiness}<p role="status">
                {translate('Check the selected billing period before saving a draft.')}
              </p>{/if}
          </section>
        {:else}
          <section>
            <h3>{translate('Save / issue')}</h3>
            <p>
              {translate(
                'Save the draft now. Finance can then review lines and adjustments, approve it, issue the immutable numbered version, send it and register collections.',
              )}
            </p>
            <ProblemNotice
              problem={draftPeriodWarning}
              kind="warning"
              remedyLinks={problemRemedyLinks}
            />
            {#if wizardHasNoBillableSources}
              <p role="status">
                {translate(wizardEmptySourcesMessage)}
              </p>
              {#if wizardReadiness?.existingInvoiceId}
                <a
                  class="secondary-button"
                  href={`${base}/app/billing/invoices/${encodeURIComponent(wizardReadiness.existingInvoiceId)}`}
                  >{translate('Open existing invoice')} <DirectionIcon /></a
                >
              {/if}
              <button type="button" class="secondary-button" onclick={() => (invoiceWizardStep = 4)}
                >{translate('Period')} <DirectionIcon /></button
              >
            {:else if !wizardReadiness || wizardReadiness.state === 'incomplete'}
              <p role="status">
                {translate('Resolve the period readiness issues before saving an invoice draft.')}
              </p>
            {/if}
            {#if wizardReadiness?.existingInvoiceId && wizardReadiness.existingInvoiceState !== 'draft'}
              <a
                class="primary-button"
                href={`${base}/app/billing/invoices/${encodeURIComponent(wizardReadiness.existingInvoiceId)}`}
                >{translate('Open existing invoice')} <DirectionIcon /></a
              >
            {:else}
              <button
                type="submit"
                disabled={!wizardRuleId ||
                  !wizardPeriodStart ||
                  !wizardPeriodEnd ||
                  !wizardReadiness ||
                  wizardReadiness.state === 'incomplete' ||
                  wizardHasNoBillableSources}>{translate('Save invoice draft')}</button
              >
            {/if}
          </section>
        {/if}

        <div class="billing-section__wizard-actions">
          <button
            type="button"
            class="secondary-button"
            disabled={invoiceWizardStep === 1}
            onclick={() => (invoiceWizardStep = Math.max(1, invoiceWizardStep - 1))}
            >{translate('Previous')}</button
          >
          {#if invoiceWizardStep < 12}
            <button
              type="button"
              onclick={() => (invoiceWizardStep = Math.min(12, invoiceWizardStep + 1))}
              >{translate('Next')}</button
            >
          {/if}
        </div>
      </form>
    </ResponsiveSheet>
  {/if}

  {#if issueBlocker}
    <aside class="billing-section__issue-blocker" data-issue-blocker role="alert">
      <div>
        <strong>{translate('Invoice issue blocked')}</strong>
        <span>{blockerMessage(issueBlocker)}</span>
      </div>
      {#if blockerHref(issueBlocker)}
        <a href={blockerHref(issueBlocker)}>{translate('Open sign-off')}</a>
      {/if}
    </aside>
  {/if}

  {#if readinessReasons().length > 0}
    <aside class="billing-section__issue-blocker" data-billing-readiness role="alert">
      <div>
        <strong>{translate(String(form?.messageKey ?? 'Error'))}</strong>
        <ul>
          {#each readinessReasons() as reason}
            <li>{translate(billingReadinessMessageKey(reason.code))}</li>
          {/each}
        </ul>
      </div>
      <div class="billing-section__blocker-actions">
        <a class="secondary-button" href={readinessActionHref()}
          >{translate('Review pending records')}</a
        >
        <button type="button" onclick={reopenBlockedSelection}
          >{translate('Choose another period')}</button
        >
      </div>
    </aside>
  {/if}

  <div class="billing-section__workspace" role="tablist" aria-label={translate('Billing')}>
    <button
      type="button"
      role="tab"
      aria-selected={workspace === 'invoices'}
      class:billing-section__workspace-tab--active={workspace === 'invoices'}
      class="billing-section__workspace-tab"
      onclick={() => {
        clearInvoiceSetupWarning();
        selectBillingWorkspace('invoices');
      }}>{translate('Invoices')}</button
    >
    <button
      type="button"
      role="tab"
      aria-selected={workspace === 'streams'}
      class:billing-section__workspace-tab--active={workspace === 'streams'}
      class="billing-section__workspace-tab"
      onclick={() => {
        clearInvoiceSetupWarning();
        selectBillingWorkspace('streams');
      }}>{translate('Billing streams')}</button
    >
    {#if canManageBilling}
      <button
        type="button"
        role="tab"
        aria-selected={workspace === 'setup'}
        class:billing-section__workspace-tab--active={workspace === 'setup'}
        class="billing-section__workspace-tab"
        onclick={() => {
          clearInvoiceSetupWarning();
          selectBillingWorkspace('setup');
        }}>{translate('Configure billing')}</button
      >
    {/if}
  </div>

  {#if workspace === 'invoices'}
    <div class="billing-section__summary" aria-label={translate('Billing stage summary')}>
      {#each [['all', 'All invoices', summaryInvoices.length], ['wip', 'WIP / Ready', stageCounts.wip], ['drafts', 'Drafts', stageCounts.drafts], ['outstanding', 'Outstanding', stageCounts.outstanding], ['overdue', 'Overdue', stageCounts.overdue], ['credits', 'Credit balances', stageCounts.credits], ['paid', 'Paid', stageCounts.paid]] as summary}
        <button
          type="button"
          class:billing-section__summary-card--active={stageFilter === summary[0]}
          class:billing-section__summary-card--danger={summary[0] === 'overdue'}
          class="billing-section__summary-card"
          aria-pressed={stageFilter === summary[0]}
          onclick={() => (stageFilter = summary[0] as BillingStage)}
        >
          <span>{translate(String(summary[1]))}</span>
          <strong>{summary[2]}</strong>
        </button>
      {/each}
    </div>

    <form
      class="billing-section__filters"
      aria-label={translate('Filter billing')}
      onsubmit={(event) => event.preventDefault()}
    >
      <label>
        <span>{translate('Search invoices')}</span>
        <input
          bind:value={search}
          type="search"
          placeholder={translate('Invoice, project or period')}
        />
      </label>
      <label>
        <span>{translate('Project')}</span>
        <select bind:value={projectFilter}>
          <option value="">{translate('All projects')}</option>
          {#each availableProjects as project}
            <option value={rowValue(project, 'id')}>{projectLabel(project)}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>{translate('Stage')}</span>
        <select bind:value={stageFilter}>
          <option value="all">{translate('All invoices')}</option>
          <option value="wip">{translate('WIP / Ready')}</option>
          <option value="drafts">{translate('Drafts')}</option>
          <option value="outstanding">{translate('Outstanding')}</option>
          <option value="overdue">{translate('Overdue')}</option>
          <option value="credits">{translate('Credit balances')}</option>
          <option value="paid">{translate('Paid')}</option>
        </select>
      </label>
      <button
        type="button"
        class="secondary-button"
        onclick={() => {
          search = '';
          projectFilter = '';
          stageFilter = 'all';
        }}>{translate('Clear filters')}</button
      >
    </form>
  {/if}

  {#if workspace === 'setup' && canManageBilling}
    <details class="billing-section__config" open>
      <summary class="primary-button">{translate('Configure billing')}</summary>
      <div class="billing-section__config-body">
        <div class="billing-section__config-heading">
          <div>
            <h3>{translate('Billing configuration')}</h3>
            <p>
              {translate(
                'Configure effective billing streams and source rules. Configuration does not create actual time or payments.',
              )}
            </p>
          </div>
        </div>

        <nav class="billing-section__setup-actions" aria-label={translate('Configure billing')}>
          {#each setupActions as action}
            <button
              type="button"
              id={action.id === 'entity'
                ? 'billing-issuer-setup-action'
                : action.id === 'tax'
                  ? 'billing-tax-setup-action'
                  : undefined}
              aria-pressed={setupAction === action.id}
              disabled={!canManageIssuerAndNumbering &&
                (action.id === 'entity' || action.id === 'numbering')}
              title={!canManageIssuerAndNumbering &&
              (action.id === 'entity' || action.id === 'numbering')
                ? translate('Owner access')
                : undefined}
              onclick={() => void showSetupAction(action.id)}
            >
              {translate(action.label)}
            </button>
          {/each}
        </nav>
        <p class="billing-section__setup-help">
          {translate(
            'Choose one action. The portal will show only the fields needed for that task.',
          )}
        </p>
        {#if !canManageIssuerAndNumbering}
          <p class="billing-section__setup-help">
            {translate('Legal entities and invoice numbering policies require owner access.')}
          </p>
        {/if}

        <div class="billing-section__directories">
          <details
            class="billing-reference-directory billing-section__issuer-directory"
            use:disclosure
          >
            <summary
              >{translate('Invoice issuers (J&A Automation)')}
              <span class="disclosure-count">{data.legalEntities?.length ?? 0}</span></summary
            >
            <table class="billing-section__table billing-section__issuer-table">
              <thead>
                <tr>
                  <th scope="col">{translate('Code')}</th>
                  <th scope="col">{translate('Legal name')}</th>
                  <th scope="col">{translate('Currency')}</th>
                  {#if canManageIssuerAndNumbering}<th scope="col">{translate('Edit')}</th>{/if}
                </tr>
              </thead>
              <tbody>
                {#each data.legalEntities ?? [] as entity}
                  <tr>
                    <td
                      ><span class="billing-section__issuer-mobile-label">{translate('Code')}</span
                      >{rowValue(entity, 'code')}</td
                    >
                    <td
                      ><span class="billing-section__issuer-mobile-label"
                        >{translate('Legal name')}</span
                      >{rowValue(entity, 'legal_name', 'legalName')}</td
                    >
                    <td
                      ><span class="billing-section__issuer-mobile-label"
                        >{translate('Currency')}</span
                      >{rowValue(entity, 'currency')}</td
                    >
                    {#if canManageIssuerAndNumbering}<td>
                        <details
                          open={problemFor(
                            'updateLegalEntity',
                            'legalEntityId',
                            rowValue(entity, 'id'),
                          )}
                        >
                          <summary>{translate('Edit issuer')}</summary>
                          {#if problemFor('updateLegalEntity', 'legalEntityId', rowValue(entity, 'id'))}
                            <ProblemNotice
                              problem={billingProblem!}
                              kind="error"
                              remedyLinks={problemRemedyLinks}
                            />
                          {/if}
                          <form
                            method="POST"
                            action="?/updateLegalEntity"
                            class="billing-section__config-form"
                            use:recoverBillingForm={recoveryOptions(
                              'updateLegalEntity',
                              'legalEntityId',
                              rowValue(entity, 'id'),
                            )}
                          >
                            <input
                              type="hidden"
                              name="legalEntityId"
                              value={rowValue(entity, 'id')}
                            />
                            <label
                              ><span>{translate('Legal name')}</span><input
                                name="legalName"
                                value={rowValue(entity, 'legal_name', 'legalName')}
                                required
                              /></label
                            >
                            <label
                              ><span>{translate('Currency')}</span><input
                                name="currency"
                                value={rowValue(entity, 'currency')}
                                readonly
                              /></label
                            >
                            <label
                              ><span>{translate('Issuer address and phone')}</span><textarea
                                name="billingAddress"
                                rows="3"
                                required
                                >{rowValue(entity, 'billing_address', 'billingAddress')}</textarea
                              ></label
                            >
                            <label
                              ><span>{translate('Tax or registration identifier (optional)')}</span
                              ><textarea name="companyIdentifiers" rows="2"
                                >{rowValue(
                                  entity,
                                  'company_identifiers',
                                  'companyIdentifiers',
                                )}</textarea
                              ></label
                            >
                            <button type="submit">{translate('Save issuer')}</button>
                          </form>
                        </details>
                      </td>{/if}
                  </tr>
                {:else}
                  <tr
                    ><td colspan={canManageIssuerAndNumbering ? 4 : 3}
                      >{translate('No invoice issuers recorded.')}</td
                    ></tr
                  >
                {/each}
              </tbody>
            </table>
          </details>
          <details
            id="issuer-document-settings"
            class="billing-reference-directory"
            open={Boolean($page.url.searchParams.get('issuerSettings')) ||
              billingFailureOperation === 'updateIssuerDocumentSettings'}
            use:disclosure
          >
            <summary>{translate('issuerSettings.title')}</summary>
            <p>{translate('issuerSettings.help')}</p>
            {#each data.legalEntities ?? [] as entity}
              {#key `${rowValue(entity, 'id')}:${issuerSetting(entity, 'version')}`}
                <details
                  open={$page.url.searchParams.get('issuerSettings') === rowValue(entity, 'id') ||
                    problemFor(
                      'updateIssuerDocumentSettings',
                      'legalEntityId',
                      rowValue(entity, 'id'),
                    )}
                >
                  <summary
                    >{rowValue(entity, 'legal_name', 'legalName')} · {rowValue(
                      entity,
                      'currency',
                    )}</summary
                  >
                  {#if problemFor('updateIssuerDocumentSettings', 'legalEntityId', rowValue(entity, 'id'))}
                    <ProblemNotice
                      problem={billingProblem!}
                      kind="error"
                      remedyLinks={problemRemedyLinks}
                    />
                    <a href={$page.url.href}>{translate('Refresh')}</a>
                  {/if}
                  <form
                    method="POST"
                    action="?/updateIssuerDocumentSettings"
                    class="billing-section__config-form"
                    data-issuer-settings-form
                    onreset={(event) => resetIssuerSettings(event, entity)}
                    use:issuerSettingsGuard={{
                      initialDirty: problemFor(
                        'updateIssuerDocumentSettings',
                        'legalEntityId',
                        rowValue(entity, 'id'),
                      ),
                    }}
                    use:recoverBillingForm={recoveryOptions(
                      'updateIssuerDocumentSettings',
                      'legalEntityId',
                      rowValue(entity, 'id'),
                    )}
                    use:enhance={({ cancel }) => {
                      if (issuerSettingsSavingId) {
                        cancel();
                        return;
                      }
                      issuerSettingsSavingId = rowValue(entity, 'id');
                      return async ({ update }) => {
                        try {
                          await update({ reset: false });
                        } finally {
                          issuerSettingsSavingId = '';
                        }
                      };
                    }}
                  >
                    <input type="hidden" name="legalEntityId" value={rowValue(entity, 'id')} />
                    <input type="hidden" name="currency" value={rowValue(entity, 'currency')} />
                    <input
                      type="hidden"
                      name="expectedVersion"
                      value={issuerSetting(entity, 'version') || '0'}
                    />
                    {#each issuerDocumentFields as [name, label]}
                      <label
                        ><span>{translate(label)}</span><input
                          {name}
                          type={name === 'companyEmail' ? 'email' : 'text'}
                          value={issuerSetting(entity, name)}
                          maxlength={name === 'companyPhone'
                            ? 80
                            : name === 'companyEmail'
                              ? 254
                              : name === 'companyWebsite'
                                ? 500
                                : ['bankSwiftNumber', 'bankAccountNumber'].includes(name)
                                  ? 160
                                  : 300}
                          disabled={Boolean(issuerSettingsSavingId)}
                        /></label
                      >
                    {/each}
                    <button type="submit" disabled={Boolean(issuerSettingsSavingId)}
                      >{translate(
                        issuerSettingsSavingId === rowValue(entity, 'id')
                          ? 'Saving'
                          : 'issuerSettings.save',
                      )}</button
                    >
                    <button
                      type="reset"
                      class="secondary-button"
                      disabled={Boolean(issuerSettingsSavingId)}>{translate('Cancel')}</button
                    >
                  </form>
                </details>
              {/key}
            {/each}
          </details>
          <details
            class="billing-reference-directory"
            data-tax-profile-directory
            open={['updateTaxProfile', 'archiveTaxProfile'].includes(billingFailureOperation)}
            use:disclosure
          >
            <summary
              >{translate('Tax profiles')}
              <span class="disclosure-count">{data.taxProfiles?.length ?? 0}</span></summary
            >
            <p>
              {translate(
                'To change rates, dates or currency, create a new tax profile and explicitly select it in the applicable billing stream. Its effective date does not automatically replace another profile.',
              )}
            </p>
            <p>
              {translate(
                'This list shows active profiles. Archived profiles leave this list; their components and issued invoice history are retained.',
              )}
            </p>
            {#if taxProfileUnavailable || taxProfileRetryDenied}
              <div data-tax-recovery>
                <ProblemNotice
                  problem={billingProblem!}
                  kind="error"
                  remedyLinks={problemRemedyLinks}
                />
                <p>
                  {#if taxProfileRefresh === 'refreshing'}{translate(
                      'Refreshing current tax profile information…',
                    )}
                  {:else if taxProfileRefresh === 'done'}{translate(
                      'Current profile information has been refreshed. The submitted change was not retried. Copy any entered name before leaving this view.',
                    )}
                  {:else if taxProfileRefresh === 'failed'}{translate(
                      'Current profile information could not be refreshed. Your entered name is retained. Check your connection and reload to review the profile.',
                    )}
                  {:else}{translate(
                      'Review the current profile and your access before retrying. Copy any entered name before reloading this page.',
                    )}{/if}
                </p>
                {#if billingFailureValues.name !== undefined}
                  <dl class="record-facts" data-tax-retained-name>
                    <div>
                      <dt>{translate('Entered name (not saved)')}</dt>
                      <dd>{billingFailureValues.name || translate('Empty')}</dd>
                    </div>
                  </dl>
                {/if}
              </div>
            {/if}
            {#each data.taxProfiles ?? [] as profile}
              {@const profileId = rowValue(profile, 'id')}
              {@const components = taxProfileComponents(profile.components_json)}
              <SectionCard
                title={rowValue(profile, 'name')}
                headingId={`tax-profile-${profileId}-title`}
                class="billing-section__tax-profile"
                data-tax-profile={profileId}
              >
                <dl class="record-facts">
                  <div>
                    <dt>{translate('Invoice issuer (J&A Automation)')}</dt>
                    <dd>
                      {rowValue(profile, 'legal_entity_code', 'legalEntityCode') ||
                        translate('Global profile')}
                    </dd>
                  </div>
                  <div>
                    <dt>{translate('Currency')}</dt>
                    <dd>{rowValue(profile, 'currency')}</dd>
                  </div>
                  <div>
                    <dt>{translate('Effective from')}</dt>
                    <dd>{rowValue(profile, 'effective_from', 'effectiveFrom')}</dd>
                  </div>
                  <div>
                    <dt>{translate('Status')}</dt>
                    <dd>{controlledValue('status', rowValue(profile, 'status'))}</dd>
                  </div>
                </dl>
                <h4>{translate('Tax components')}</h4>
                <ul data-tax-components>
                  {#if components === null}<li>
                      {translate(
                        'Tax component details are unavailable. Reload this page to review the current profile.',
                      )}
                    </li>
                  {:else}{#each components as component}
                      <li>
                        {component.name} · {formatTaxBasisPoints(component.basisPoints)} · {translate(
                          component.compound ? 'Compound tax' : 'Non-compound tax',
                        )}
                      </li>
                    {:else}<li>{translate('No tax components recorded.')}</li>{/each}{/if}
                </ul>
                {#if !taxProfileRetryDenied && !(taxProfileUnavailable && profileId === billingFailureValues.taxProfileId)}<details
                    class="billing-section__rule-editor"
                    open={problemFor('updateTaxProfile', 'taxProfileId', profileId) ||
                      problemFor('archiveTaxProfile', 'taxProfileId', profileId)}
                  >
                    <summary class="secondary-button">{translate('Manage tax profile')}</summary>
                    <div class="billing-section__rule-actions">
                      {#if problemFor('updateTaxProfile', 'taxProfileId', profileId)}
                        <ProblemNotice
                          problem={billingProblem!}
                          kind="error"
                          remedyLinks={problemRemedyLinks}
                        />
                      {/if}
                      <form
                        method="POST"
                        action="?/updateTaxProfile"
                        class="billing-section__config-form"
                        use:recoverBillingForm={recoveryOptions(
                          'updateTaxProfile',
                          'taxProfileId',
                          profileId,
                        )}
                        use:enhance
                      >
                        <h4>{translate('Rename tax profile')}</h4>
                        <p>
                          {translate(
                            'Renaming changes only the profile name. Rates, dates, currency and issued invoice snapshots stay unchanged.',
                          )}
                        </p>
                        <input type="hidden" name="taxProfileId" value={profileId} />
                        <label
                          ><span>{translate('Name')}</span><input
                            name="name"
                            value={rowValue(profile, 'name')}
                            maxlength="160"
                            required
                          /></label
                        >
                        <label class="billing-section__checkbox"
                          ><input name="confirmTaxProfileChange" type="checkbox" required /><span
                            >{translate('I confirm this profile rename.')}</span
                          ></label
                        >
                        <button type="submit">{translate('Rename tax profile')}</button>
                      </form>
                      {#if problemFor('archiveTaxProfile', 'taxProfileId', profileId)}
                        <ProblemNotice
                          problem={billingProblem!}
                          kind="error"
                          remedyLinks={problemRemedyLinks}
                        />
                      {/if}
                      <form
                        method="POST"
                        action="?/archiveTaxProfile"
                        class="billing-section__config-form"
                        use:recoverBillingForm={recoveryOptions(
                          'archiveTaxProfile',
                          'taxProfileId',
                          profileId,
                        )}
                        use:enhance
                      >
                        <h4>{translate('Archive tax profile')}</h4>
                        <p>
                          {translate(
                            'Streams using an archived profile cannot create new invoice drafts until a replacement profile is explicitly selected. An approved invoice using this profile must be issued or recalculated before archiving. Issued invoices stay unchanged.',
                          )}
                        </p>
                        <input type="hidden" name="taxProfileId" value={profileId} />
                        <label class="billing-section__checkbox"
                          ><input name="confirmTaxProfileChange" type="checkbox" required /><span
                            >{translate(
                              'I have reviewed linked streams and confirm archiving this profile.',
                            )}</span
                          ></label
                        >
                        <button type="submit" class="danger"
                          >{translate('Archive tax profile')}</button
                        >
                      </form>
                    </div>
                  </details>{/if}
              </SectionCard>
            {:else}<p>{translate('No tax profiles recorded.')}</p>{/each}
          </details>
        </div>

        {#if setupAction === 'stream'}
          {#if problemFor('createBillingRule')}
            <ProblemNotice
              problem={billingProblem!}
              kind="error"
              remedyLinks={problemRemedyLinks}
            />
          {/if}
          {#if invoiceSetupRequired}
            <ProblemNotice
              problem={invoiceStreamRequiredProblem(invoiceSetupSelectedProject)}
              kind="warning"
              remedyLinks={{
                new_billing_stream: {
                  label: translate('New billing stream'),
                  href: '#billing-new-stream-project',
                },
              }}
            />
          {/if}
          {#if setupIssuerUnavailableProblem}
            <div id="billing-issuer-unavailable">
              <ProblemNotice
                problem={setupIssuerUnavailableProblem}
                kind="error"
                remedyLinks={{
                  configure_invoice_issuer: {
                    label: translate('New invoice issuer'),
                    href: '#billing-issuer-setup-action',
                  },
                  contact_owner: { label: translate('Contact an owner') },
                }}
              />
            </div>
          {/if}
          <form
            method="POST"
            action="?/createBillingRule"
            class="billing-section__config-form"
            use:recoverBillingForm={recoveryOptions('createBillingRule')}
            use:enhance
          >
            <h4>{translate('New billing stream')}</h4>
            <label>
              <span>{translate('Project')}</span>
              <select
                id="billing-new-stream-project"
                name="projectId"
                bind:value={setupProjectId}
                required
              >
                <option value="">{translate('Select project')}</option>
                {#each availableProjects as project}
                  <option value={rowValue(project, 'id')}>{projectLabel(project)}</option>
                {/each}
              </select>
            </label>
            <label>
              <span>{translate('Stream')}</span>
              <select name="streamType" required>
                <option value="labor">{translate('Labor')}</option>
                <option value="expense">{translate('Expenses')}</option>
                <option value="milestone">{translate('Milestone')}</option>
                <option value="other">{translate('Other')}</option>
              </select>
            </label>
            <p data-expense-billability-help>
              {translate(
                'An expense stream invoices only approved expenses marked for customer billing. Non-billable expenses are not charged to the customer; worker reimbursement is configured separately.',
              )}
            </p>
            <label>
              <span>{translate('Cadence')}</span>
              <select name="cadenceType" bind:value={setupCadence} required>
                <option value="weekly">{translate('Weekly')}</option>
                <option value="every_14_days">{translate('Every 14 days')}</option>
                <option value="semi_monthly">{translate('Semi-monthly')}</option>
                <option value="monthly">{translate('Monthly')}</option>
                <option value="custom">{translate('Custom')}</option>
                <option value="milestone">{translate('Milestone')}</option>
                <option value="manual">{translate('Manual')}</option>
              </select>
            </label>
            <label>
              <span>{translate('Effective from')}</span>
              <input name="effectiveFrom" type="date" required />
            </label>
            <label hidden={!['weekly', 'every_14_days', 'custom'].includes(setupCadence)}>
              <span>{translate('Anchor date')}</span>
              <input name="anchorDate" type="date" required={setupCadence === 'every_14_days'} />
            </label>
            <label>
              <span>{translate('Invoice issuer (J&A Automation)')}</span>
              <select
                name="legalEntityId"
                bind:value={setupLegalEntityId}
                aria-describedby={setupIssuerUnavailableProblem
                  ? 'billing-issuer-unavailable'
                  : undefined}
                required
              >
                <option value="">{translate('Select legal entity')}</option>
                {#each setupEligibleIssuers as entity}
                  <option value={rowValue(entity, 'id')}>
                    {rowValue(entity, 'code')} — {rowValue(entity, 'legal_name', 'legalName')}
                  </option>
                {/each}
              </select>
            </label>
            <label>
              <span>{translate('Tax profile')}</span>
              <select name="taxProfileId" bind:value={setupTaxProfileId}>
                <option value="">{translate('No tax profile configured')}</option>
                {#each (data.taxProfiles ?? []).filter((profile) => setupLegalEntityId && rowValue(profile, 'currency') === setupCurrency && rowValue(profile, 'status') === 'active' && (!rowValue(profile, 'legal_entity_id', 'legalEntityId') || rowValue(profile, 'legal_entity_id', 'legalEntityId') === setupLegalEntityId)) as profile}
                  <option value={rowValue(profile, 'id')}>
                    {rowValue(profile, 'name')} ({rowValue(profile, 'currency')})
                  </option>
                {/each}
              </select>
            </label>
            {#if !setupTaxProfileId}
              <ProblemNotice
                problem={streamNoTaxProfileWarning}
                kind="warning"
                {locale}
                remedyLinks={{
                  create_tax_profile: {
                    label: portalText(locale, 'problem.remedy.createTaxProfile'),
                    href: '#billing-tax-setup-action',
                  },
                }}
              />
            {/if}
            <label>
              <span>{translate('Currency')}</span>
              <input name="currency" value={setupCurrency} readonly required />
            </label>
            <label>
              <span>{translate('Invoice template')}</span>
              <select name="templateId" required>
                <option value="default">{translate('Default')}</option>
                <option value="labor-detailed">{translate('Labor detailed')}</option>
                <option value="labor-summary">{translate('Labor summary')}</option>
                <option value="expenses-detailed">{translate('Expenses detailed')}</option>
                <option value="fixed-milestone">{translate('Fixed milestone')}</option>
              </select>
            </label>
            <label>
              <span>{translate('Recipient email')}</span>
              <input name="recipientEmail" type="email" />
            </label>
            <label>
              <span>{translate('Billing contact')}</span>
              <select name="billingContactId" bind:value={setupContactId}>
                <option value="">{translate('Use recipient email')}</option>
                {#each (data.contacts ?? []).filter((contact) => setupProject && rowValue(contact, 'client_id', 'clientId') === rowValue(setupProject, 'client_id', 'clientId')) as contact}
                  <option value={rowValue(contact, 'id')}>
                    {rowValue(contact, 'client_number', 'clientNumber')} · {rowValue(
                      contact,
                      'name',
                    )} ·
                    {rowValue(contact, 'email') || translate('no email')}
                  </option>
                {/each}
              </select>
            </label>
            <label>
              <span>{translate('Payment terms (days)')}</span>
              <input name="paymentTermsDays" type="number" min="0" max="365" value="30" required />
            </label>
            <label>
              <span>{translate('PO reference')}</span>
              <input name="poNumberOverride" />
            </label>
            <p data-billing-grouping-help>
              {translate(
                'Grouping cannot be customized here. Invoice layout follows the selected template.',
              )}
            </p>
            <label hidden={setupCadence !== 'semi_monthly'}>
              <span>{translate('Semi-monthly rule')}</span>
              <select
                name="semiMonthlyRule"
                aria-describedby="billing-semi-monthly-rule-help"
                required={setupCadence === 'semi_monthly'}
              >
                {#if billingProblem?.code === 'BILLING_SEMI_MONTHLY_RULE_INVALID' && billingFailureValues.semiMonthlyRule === ''}
                  <option value="" disabled selected
                    >{translate('Choose the full-month split')}</option
                  >
                {/if}
                {#if billingFailureOperation === 'createBillingRule' && billingFailureValues.semiMonthlyRule && billingFailureValues.semiMonthlyRule !== '1_15_16_end'}
                  <option value={billingFailureValues.semiMonthlyRule} disabled selected>
                    {translate('Previously entered unsupported rule')}
                  </option>
                {/if}
                <option value="1_15_16_end">
                  {translate('Days 1–15 and 16–month end')}
                </option>
              </select>
            </label>
            <p id="billing-semi-monthly-rule-help" hidden={setupCadence !== 'semi_monthly'}>
              {translate('Semi-monthly billing currently covers both halves of each month.')}
            </p>
            <label class="billing-section__checkbox">
              <input name="autoGenerateDraft" type="checkbox" />
              <span>{translate('Generate drafts when the stream is due')}</span>
            </label>
            <button type="submit">{translate('Save billing stream')}</button>
          </form>
        {/if}

        <div class="billing-section__config-compact-grid">
          {#if setupAction === 'entity' && canManageIssuerAndNumbering}
            {#if problemFor('createLegalEntity')}
              <ProblemNotice
                problem={billingProblem!}
                kind="error"
                remedyLinks={problemRemedyLinks}
              />
            {/if}
            <form
              method="POST"
              action="?/createLegalEntity"
              class="billing-section__config-form"
              use:recoverBillingForm={recoveryOptions('createLegalEntity')}
              use:enhance
            >
              <h4>{translate('New invoice issuer')}</h4>
              <label><span>{translate('Code')}</span><input name="code" required /></label>
              <label
                ><span>{translate('Legal name')}</span><input name="legalName" required /></label
              >
              <label>
                <span>{translate('Currency')}</span>
                <select name="currency"
                  ><option>USD</option><option>BRL</option><option>EUR</option></select
                >
              </label>
              <label
                ><span>{translate('Issuer address and phone')}</span><textarea
                  name="billingAddress"
                  rows="3"
                  required
                ></textarea></label
              >
              <label
                ><span>{translate('Tax or registration identifier (optional)')}</span><textarea
                  name="companyIdentifiers"
                  rows="2"
                ></textarea></label
              >
              <button type="submit">{translate('Save legal entity')}</button>
            </form>
          {/if}

          {#if setupAction === 'tax'}
            {#if problemFor('createTaxProfile')}
              <ProblemNotice
                problem={billingProblem!}
                kind="error"
                remedyLinks={problemRemedyLinks}
              />
            {/if}
            <form
              method="POST"
              action="?/createTaxProfile"
              class="billing-section__config-form"
              use:recoverBillingForm={recoveryOptions('createTaxProfile')}
              use:enhance
            >
              <h4>{translate('New tax profile')}</h4>
              <label>
                <span>{translate('Invoice issuer (J&A Automation)')}</span>
                <select name="legalEntityId">
                  <option value="">{translate('Global profile')}</option>
                  {#each data.legalEntities ?? [] as entity}
                    <option value={rowValue(entity, 'id')}
                      >{rowValue(entity, 'code')} — {rowValue(
                        entity,
                        'legal_name',
                        'legalName',
                      )}</option
                    >
                  {/each}
                </select>
              </label>
              <label><span>{translate('Name')}</span><input name="name" required /></label>
              <label>
                <span>{translate('Currency')}</span>
                <select name="currency"
                  ><option>USD</option><option>BRL</option><option>EUR</option></select
                >
              </label>
              <label
                ><span>{translate('Effective from')}</span><input
                  name="effectiveFrom"
                  type="date"
                  required
                /></label
              >
              <label
                ><span>{translate('Component')}</span><input
                  name="componentName"
                  value="VAT / sales tax"
                  required
                /></label
              >
              <label
                ><span>{translate('Tax rate')}</span><input
                  name="componentPercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value="0"
                  required
                  oninput={(event) => {
                    const parsed = percentToBps(event.currentTarget.value);
                    if (parsed === null) {
                      event.currentTarget.setCustomValidity(
                        translate('Enter a valid percentage from 0 to 100.'),
                      );
                      event.currentTarget.setAttribute('aria-invalid', 'true');
                      return;
                    }
                    event.currentTarget.setCustomValidity('');
                    event.currentTarget.removeAttribute('aria-invalid');
                    const form = event.currentTarget.form;
                    const hidden = form?.elements.namedItem(
                      'componentBasisPoints',
                    ) as HTMLInputElement | null;
                    if (!hidden) return;
                    hidden.value = parsed;
                  }}
                /><input type="hidden" name="componentBasisPoints" value="0" /></label
              >
              <label class="billing-section__checkbox"
                ><input name="componentCompound" type="checkbox" /><span
                  >{translate('Compound tax')}</span
                ></label
              >
              <button type="submit">{translate('Save tax profile')}</button>
            </form>
          {/if}

          {#if setupAction === 'numbering' && canManageIssuerAndNumbering}
            {#if problemFor('createInvoiceNumberPolicy')}
              <ProblemNotice
                problem={billingProblem!}
                kind="error"
                remedyLinks={problemRemedyLinks}
              />
            {/if}
            <form
              method="POST"
              action="?/createInvoiceNumberPolicy"
              class="billing-section__config-form"
              use:recoverBillingForm={recoveryOptions('createInvoiceNumberPolicy')}
              use:enhance
            >
              <h4>{translate('Invoice numbering policy')}</h4>
              <label>
                <span>{translate('Legal entity')}</span>
                <select name="legalEntityId" required>
                  <option value="">{translate('Select entity')}</option>
                  {#each data.legalEntities ?? [] as entity}
                    <option value={rowValue(entity, 'id')}
                      >{rowValue(entity, 'code')} — {rowValue(
                        entity,
                        'legal_name',
                        'legalName',
                      )}</option
                    >
                  {/each}
                </select>
              </label>
              <label
                ><span>{translate('Prefix')}</span><input
                  name="prefix"
                  value="JA-"
                  required
                /></label
              >
              <label
                ><span>{translate('Digits')}</span><input
                  name="digits"
                  type="number"
                  min="4"
                  max="10"
                  value="6"
                  required
                /></label
              >
              <label
                ><span>{translate('Effective from')}</span><input
                  name="effectiveFrom"
                  type="date"
                  required
                /></label
              >
              <label
                ><span>{translate('Accountant approved at')}</span><input
                  name="accountantApprovedAt"
                  type="datetime-local"
                  required
                /></label
              >
              <button type="submit">{translate('Save numbering policy')}</button>
            </form>
          {/if}
        </div>
      </div>
    </details>
  {/if}

  {#if workspace === 'streams'}
    <SectionCard title={translate('Billing streams')} class="billing-section__rules">
      <div class="billing-section__section-intro">
        <p>
          {translate(
            'A billing stream sets cadence, template and tax for one project. Create the draft here. Approve, issue and collect in Invoices.',
          )}
        </p>
        <span>{visibleBillingRules.length}</span>
      </div>
      <RecordBrowser
        rows={visibleBillingRules}
        bind:visible={billingRulePage}
        translate={(key) => streamStatusLabel(key)}
        label="Billing streams"
        contextKey={projectFilter || 'all-projects'}
        focusId={streamFocusId}
      />
      {#if visibleBillingRules.length > 0}
        <div class="billing-section__rule-list" aria-live="polite">
          <table class="billing-section__table">
            <caption class="sr-only">{translate('Billing streams')}</caption>
            <thead>
              <tr>
                <th scope="col">{translate('Project')}</th>
                <th scope="col">{translate('Cadence')}</th>
                <th scope="col">{translate('Tax profile')}</th>
                <th scope="col">{translate('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {#each billingRulePage as rule}
                <tr data-billing-rule={rowValue(rule, 'id')}>
                  <td>
                    <span class="billing-section__rule-mobile-label">{translate('Project')}</span>
                    <a
                      href={`${base}/app/billing?view=streams&project=${encodeURIComponent(rowValue(rule, 'project_id', 'projectId'))}&focus=${encodeURIComponent(rowValue(rule, 'id'))}#billing-stream-${encodeURIComponent(rowValue(rule, 'id'))}`}
                    >
                      <strong>{rowValue(rule, 'project_number', 'projectNumber')}</strong>
                    </a>
                    <small>
                      {controlledValue(
                        'billingStream',
                        rowValue(rule, 'stream_type', 'streamType'),
                      ) || rowValue(rule, 'stream_type', 'streamType')}
                    </small>
                  </td>
                  <td>
                    <span class="billing-section__rule-mobile-label">{translate('Cadence')}</span>
                    <StatusBadge
                      variant={rule.browser_status === 'active' ? 'success' : 'neutral'}
                      text={streamStatusLabel(rule.browser_status)}
                    />
                    {controlledValue(
                      'billingStream',
                      rowValue(rule, 'cadence_type', 'cadenceType'),
                    )}
                    · {rowValue(rule, 'currency')}
                    {#if rule.browser_status === 'active'}
                      <small>
                        {translate('Effective')}: {rowValue(
                          rule,
                          'effective_from',
                          'effectiveFrom',
                        )}
                        → {rowValue(rule, 'effective_to', 'effectiveTo') || '…'}
                      </small>
                    {:else}
                      <small
                        >{translate('Effective from')}: {rowValue(
                          rule,
                          'effective_from',
                          'effectiveFrom',
                        ) || '—'}</small
                      >
                      <small
                        >{translate('Effective to')}: {rowValue(
                          rule,
                          'effective_to',
                          'effectiveTo',
                        ) || '—'}</small
                      >
                    {/if}
                    <small>
                      {rule.browser_status === 'active'
                        ? String(rowValue(rule, 'auto_generate_draft', 'autoGenerateDraft')) === '1'
                          ? translate('Automatic draft enabled')
                          : translate('Automatic draft disabled')
                        : String(rowValue(rule, 'auto_generate_draft', 'autoGenerateDraft')) === '1'
                          ? translate('Saved automatic draft setting: enabled')
                          : translate('Saved automatic draft setting: disabled')}
                    </small>
                    {#if rule.browser_status === 'active' && String(rowValue(rule, 'auto_generate_draft', 'autoGenerateDraft')) === '1'}
                      <small>
                        {translate('Next period')}: {streamDraftPeriod(rule).start || '—'} → {streamDraftPeriod(
                          rule,
                        ).end || '—'}
                      </small>
                      <small>
                        {translate('Last run')}: {dateValue(
                          rowValue(rule, 'automation_last_run', 'automationLastRun'),
                        )} · {controlledValue(
                          'status',
                          rowValue(rule, 'automation_last_result', 'automationLastResult') ||
                            'not_run',
                        )}
                      </small>
                      {#if automationBlockers(rule).length > 0}
                        <small class="billing-section__automation-blocker">
                          {translate('Blocking reason')}: {automationBlockers(rule)
                            .map((reason) => translate(billingReadinessMessageKey(reason)))
                            .join(' · ')}
                        </small>
                      {/if}
                    {/if}
                  </td>
                  <td>
                    <span class="billing-section__rule-mobile-label"
                      >{translate('Tax profile')}</span
                    >
                    {rowValue(rule, 'tax_profile_name', 'taxProfileName') ||
                      translate('No tax profile')}
                  </td>
                  <td>
                    <span class="billing-section__rule-mobile-label">{translate('Actions')}</span>
                    {#if savedSemiMonthlyRuleProblem(rule)}
                      <ProblemNotice
                        problem={savedSemiMonthlyRuleProblem(rule)!}
                        kind="warning"
                        remedyLinks={problemRemedyLinks}
                      />
                    {/if}
                    {#if canManageBilling && rule.browser_status === 'active'}
                      <form
                        method="POST"
                        action="?/createDraft"
                        class="billing-section__period-form"
                      >
                        <input type="hidden" name="billingRuleId" value={rowValue(rule, 'id')} />
                        <div class="billing-section__period-warning">
                          <ProblemNotice
                            problem={draftPeriodWarning}
                            kind="warning"
                            remedyLinks={problemRemedyLinks}
                          />
                        </div>
                        <label
                          ><span>{translate('Period start')}</span><input
                            name="periodStart"
                            type="date"
                            value={streamDraftPeriod(rule).start}
                            required
                          /></label
                        >
                        <label
                          ><span>{translate('Period end')}</span><input
                            name="periodEnd"
                            type="date"
                            value={streamDraftPeriod(rule).end}
                            required
                          /></label
                        >
                        <button type="submit">{translate('Create invoice draft')}</button>
                      </form>
                      <details
                        id={`billing-stream-${rowValue(rule, 'id')}`}
                        class="billing-section__rule-editor"
                        open={streamFocusId === rowValue(rule, 'id') ||
                          ['updateBillingRule', 'archiveBillingRule', 'closePeriod'].some(
                            (operation) =>
                              problemFor(operation, 'billingRuleId', rowValue(rule, 'id')),
                          )}
                      >
                        <summary class="secondary-button">{translate('Manage stream')}</summary>
                        <div class="billing-section__rule-actions">
                          {#if problemFor('updateBillingRule', 'billingRuleId', rowValue(rule, 'id'))}
                            <ProblemNotice
                              problem={billingProblem!}
                              kind="error"
                              remedyLinks={problemRemedyLinks}
                            />
                          {/if}
                          <form
                            method="POST"
                            action="?/updateBillingRule"
                            class="billing-section__inline-form"
                            use:recoverBillingForm={recoveryOptions(
                              'updateBillingRule',
                              'billingRuleId',
                              rowValue(rule, 'id'),
                            )}
                          >
                            <input
                              type="hidden"
                              name="billingRuleId"
                              value={rowValue(rule, 'id')}
                            />
                            <label
                              ><span>{translate('Invoice template')}</span><select
                                name="templateId"
                              >
                                <option
                                  value="default"
                                  selected={rowValue(rule, 'template_id', 'templateId') ===
                                    'default'}>{translate('Default')}</option
                                >
                                <option
                                  value="labor-detailed"
                                  selected={rowValue(rule, 'template_id', 'templateId') ===
                                    'labor-detailed'}>{translate('Labor detailed')}</option
                                >
                                <option
                                  value="labor-summary"
                                  selected={rowValue(rule, 'template_id', 'templateId') ===
                                    'labor-summary'}>{translate('Labor summary')}</option
                                >
                                <option
                                  value="expenses-detailed"
                                  selected={rowValue(rule, 'template_id', 'templateId') ===
                                    'expenses-detailed'}>{translate('Expenses detailed')}</option
                                >
                                <option
                                  value="fixed-milestone"
                                  selected={rowValue(rule, 'template_id', 'templateId') ===
                                    'fixed-milestone'}>{translate('Fixed milestone')}</option
                                >
                              </select></label
                            >
                            <label
                              ><span>{translate('Recipient email')}</span><input
                                name="recipientEmail"
                                type="email"
                                value={rowValue(rule, 'recipient_email', 'recipientEmail')}
                              /></label
                            >
                            <label
                              ><span>{translate('Payment terms (days)')}</span><input
                                name="paymentTermsDays"
                                type="number"
                                min="0"
                                max="365"
                                value={rowValue(rule, 'payment_terms_days', 'paymentTermsDays') ||
                                  '30'}
                              /></label
                            >
                            <label
                              ><span>{translate('Past Due Notice')}</span><textarea
                                name="pastDueNotice"
                                rows="3"
                                maxlength="2000"
                                >{rowValue(rule, 'past_due_notice', 'pastDueNotice')}</textarea
                              ></label
                            >
                            <label
                              ><span>{translate('PO reference')}</span><input
                                name="poNumberOverride"
                                value={rowValue(rule, 'po_number_override', 'poNumberOverride')}
                              /></label
                            >
                            <p data-billing-grouping-help>
                              {translate(
                                'Grouping cannot be customized here. Invoice layout follows the selected template.',
                              )}
                            </p>
                            <p data-billing-saved-grouping>
                              <strong>{translate('Saved grouping setting')}:</strong>
                              {groupingLabel(rowValue(rule, 'grouping_mode', 'groupingMode'))}
                            </p>
                            <label class="billing-section__checkbox">
                              <input type="hidden" name="autoGenerateDraftPresent" value="1" />
                              <input
                                name="autoGenerateDraft"
                                type="checkbox"
                                checked={String(
                                  rowValue(rule, 'auto_generate_draft', 'autoGenerateDraft'),
                                ) === '1'}
                              />
                              <span
                                >{translate('Automatically prepare draft after period close')}</span
                              >
                            </label>
                            <button type="submit">{translate('Save billing stream')}</button>
                          </form>
                          <button
                            type="button"
                            class="secondary-button"
                            onclick={() => void showSetupAction('stream')}
                            >{translate('New effective-dated conditions')}</button
                          >
                          <p class="billing-section__effective-note">
                            {translate(
                              'Cadence and commercial conditions use effective-dated streams. Create a successor for a future change so historic periods are never reinterpreted.',
                            )}
                          </p>
                          {#if problemFor('archiveBillingRule', 'billingRuleId', rowValue(rule, 'id'))}
                            <ProblemNotice
                              problem={billingProblem!}
                              kind="error"
                              remedyLinks={problemRemedyLinks}
                            />
                          {/if}
                          <ProblemNotice
                            problem={archiveStreamWarning}
                            kind="warning"
                            remedyLinks={problemRemedyLinks}
                          />
                          <form
                            method="POST"
                            action="?/archiveBillingRule"
                            use:recoverBillingForm={recoveryOptions(
                              'archiveBillingRule',
                              'billingRuleId',
                              rowValue(rule, 'id'),
                            )}
                            onsubmit={(event) => {
                              if (!confirm(translate('Archive this billing rule?')))
                                event.preventDefault();
                            }}
                          >
                            <input
                              type="hidden"
                              name="billingRuleId"
                              value={rowValue(rule, 'id')}
                            />
                            <button type="submit" class="danger"
                              >{translate('Archive billing stream')}</button
                            >
                          </form>
                          <details
                            class="billing-section__close-sources"
                            open={problemFor('closePeriod', 'billingRuleId', rowValue(rule, 'id'))}
                          >
                            <summary>{translate('Close sources')}</summary>
                            <p>
                              {translate(
                                'Close sources after the invoice is issued so leftover work cannot be billed twice.',
                              )}
                            </p>
                            {#if problemFor('closePeriod', 'billingRuleId', rowValue(rule, 'id'))}
                              <ProblemNotice
                                problem={billingProblem!}
                                kind="error"
                                remedyLinks={problemRemedyLinks}
                              />
                            {/if}
                            <form
                              method="POST"
                              action="?/closePeriod"
                              class="billing-section__period-form"
                              use:recoverBillingForm={recoveryOptions(
                                'closePeriod',
                                'billingRuleId',
                                rowValue(rule, 'id'),
                              )}
                            >
                              <input
                                type="hidden"
                                name="billingRuleId"
                                value={rowValue(rule, 'id')}
                              />
                              <label
                                ><span>{translate('Close period start')}</span><input
                                  name="periodStart"
                                  type="date"
                                  value={streamDraftPeriod(rule).start}
                                  required
                                /></label
                              >
                              <label
                                ><span>{translate('Close period end')}</span><input
                                  name="periodEnd"
                                  type="date"
                                  value={streamDraftPeriod(rule).end}
                                  required
                                /></label
                              >
                              <label
                                ><span>{translate('Report language')}</span><select
                                  name="reportLocale"
                                  ><option value="en">{translate('English')}</option><option
                                    value="pt">{translate('Português (BR)')}</option
                                  ><option value="es">{translate('Spanish')}</option></select
                                ></label
                              >
                              <button type="submit">{translate('Close sources')}</button>
                            </form>
                          </details>
                        </div>
                      </details>
                    {:else if rule.browser_status !== 'active'}
                      <details
                        id={`billing-stream-${rowValue(rule, 'id')}`}
                        class="billing-section__saved-stream"
                        data-saved-stream={rowValue(rule, 'id')}
                      >
                        <summary>{translate('Saved stream settings')}</summary>
                        <p>
                          {translate(
                            rule.browser_status === 'archived'
                              ? 'Archived streams retain saved settings and history. Use a new active stream for future billing.'
                              : 'This stream’s availability is unknown. Review the current billing setup before making changes.',
                          )}
                        </p>
                        <dl class="record-facts">
                          <div>
                            <dt>{translate('Invoice template')}</dt>
                            <dd>{templateLabel(rowValue(rule, 'template_id', 'templateId'))}</dd>
                          </div>
                          <div>
                            <dt>{translate('Saved grouping setting')}</dt>
                            <dd>
                              {groupingLabel(rowValue(rule, 'grouping_mode', 'groupingMode'))}
                            </dd>
                          </div>
                          <div>
                            <dt>{translate('Recipient email')}</dt>
                            <dd>{rowValue(rule, 'recipient_email', 'recipientEmail') || '—'}</dd>
                          </div>
                          <div>
                            <dt>{translate('Payment terms (days)')}</dt>
                            <dd>
                              {rowValue(rule, 'payment_terms_days', 'paymentTermsDays') || '—'}
                            </dd>
                          </div>
                          <div>
                            <dt>{translate('PO reference')}</dt>
                            <dd>
                              {rowValue(rule, 'po_number_override', 'poNumberOverride') || '—'}
                            </dd>
                          </div>
                        </dl>
                      </details>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <div class="billing-section__empty" role="status">
          <strong>{translate('No billing streams configured.')}</strong>
          <span>{translate('Create an effective-dated stream to prepare an invoice draft.')}</span>
        </div>
      {/if}
    </SectionCard>
  {/if}

  {#if workspace === 'invoices'}
    <SectionCard title={translate('Invoice register')} class="billing-section__invoices">
      <div class="billing-section__section-intro">
        <p>
          {stageFilter === 'all'
            ? translate(
                canManageBilling
                  ? 'Each row is one bill. Open Manage to approve, issue, collect, or correct. Adjustment is a new draft, never an edit of the issued bill.'
                  : 'billing.invoiceRegister.readOnlyHelp',
              )
            : `${stageLabel(stageFilter)} · ${translate('filtered')}`}
        </p>
        <span>{visibleInvoices.length}</span>
      </div>

      <RecordBrowser
        rows={visibleInvoices}
        bind:visible={invoicePage}
        {translate}
        statusLabel={(value) => controlledValue('status', value)}
        label="Billing"
        filtersEnabled={false}
        showEmpty={false}
      />
      {#if visibleInvoices.length > 0 || selectedInvoice}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="billing-section__invoice-list"
          data-billing-invoice-list
          aria-live="polite"
          onclick={openInvoiceFromCard}
        >
          <TableRegion
            class="billing-section__table-region"
            ariaLabel={translate('Invoice register')}
            mobileMode="cards"
            cardRows={invoiceCardRows}
          >
            <table class="billing-section__table">
              <caption class="sr-only">{translate('Invoice register')}</caption>
              <thead>
                <tr>
                  <th scope="col">{translate('Invoice')}</th>
                  <th scope="col">{translate('Client')}</th>
                  <th scope="col">{translate('Project')}</th>
                  <th scope="col">{translate('Dates')}</th>
                  <th scope="col">{translate('Amount')}</th>
                  <th scope="col">{translate('Balance (receivable / credit)')}</th>
                  <th scope="col">{translate('Status')}</th>
                  <th scope="col">{translate('PDF')}</th>
                  <th scope="col">{translate('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {#each invoicePage as invoice}
                  {@const invoiceId = rowValue(invoice, 'id')}
                  {@const invoiceStateValue = invoiceState(invoice)}
                  {@const ledger = ledgerForInvoice(invoiceId)}
                  {@const pdfStatus = invoicePdfStatus(invoice)}
                  {@const draftPreview = hasDraftPreview(invoice)}
                  <tr
                    data-invoice-row={invoiceId}
                    data-invoice-state={invoiceStateValue}
                    data-invoice-issued-on={isoDateAttr(rowValue(invoice, 'issued_at', 'issuedAt'))}
                  >
                    <td>
                      <a href={`${base}/app/billing/invoices/${encodeURIComponent(invoiceId)}`}>
                        <strong>{invoiceTitle(invoice)}</strong>
                      </a>
                    </td>
                    <td>{invoiceClientIdentity(invoice)}</td>
                    <td>{invoiceProjectIdentity(invoice) || '—'}</td>
                    <td>
                      {dateValue(rowValue(invoice, 'issued_at', 'issuedAt'))}
                      /
                      {dateValue(
                        rowValue(invoice, 'expected_collection_on', 'expectedCollectionOn'),
                      )}
                    </td>
                    <td>{invoiceTotal(invoice)}</td>
                    <td>{balanceDisplay(invoice, ledger)}</td>
                    <td>
                      <StatusBadge
                        variant={statusVariant(invoiceStateValue)}
                        text={invoiceStatusText(invoice)}
                        data-invoice-status={invoiceStateValue}
                        aria-label={invoiceStatus(invoice)}
                      />
                    </td>
                    <td>
                      <span data-invoice-pdf-status={draftPreview ? 'preview' : pdfStatus}>
                        {translate('PDF')} · {translate(
                          draftPreview
                            ? 'Preview'
                            : pdfStatus === 'unavailable'
                              ? 'Unavailable'
                              : pdfStatus,
                        )}
                      </span>
                      {#if !draftPreview && pdfStatus === 'ready'}
                        <a
                          href={`${base}/app/api/invoices/${encodeURIComponent(invoiceId)}/pdf`}
                          download
                          aria-label={`${translate('Download PDF')}: ${invoiceTitle(invoice)}`}
                          aria-disabled={Boolean(invoicePdfBusyId)}
                          onclick={(event) =>
                            onInvoicePdfLinkClick(event, invoiceId, 'download', 'table')}
                          onauxclick={(event) =>
                            onInvoicePdfLinkClick(event, invoiceId, 'download', 'table')}
                          >{translate('Download PDF')}</a
                        >
                        {#if invoicePdfFailure?.id === invoiceId && invoicePdfFailure.surface === 'table'}
                          <div
                            data-invoice-pdf-problem="table"
                            onclick={(event) => onInvoicePdfRemedyClick(event, invoiceId, 'table')}
                            role="presentation"
                          >
                            <ProblemNotice
                              problem={invoicePdfFailure.problem}
                              kind="error"
                              remedyLinks={invoicePdfRemedyLinks}
                              {locale}
                            />
                          </div>
                        {/if}
                      {/if}
                    </td>
                    <td>
                      <button type="button" onclick={() => openInvoice(invoice)}
                        >{translate('Manage')}</button
                      >
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </TableRegion>

          {#if selectedInvoice}
            {@const invoice = selectedInvoice}
            {@const invoiceId = rowValue(invoice, 'id')}
            {@const invoiceStateValue = invoiceState(invoice)}
            {@const canRecordPayment = ['issued', 'sent', 'partially_paid', 'overdue'].includes(
              invoiceStateValue,
            )}
            {@const paymentRetryBlocked =
              billingProblem?.code === 'BILLING_IDEMPOTENCY_REUSED' &&
              paymentDraft?.invoiceId === invoiceId}
            {@const paymentProblemForInvoice = Boolean(
              (billingFailureOperation === 'recordPayment' &&
                paymentDraft?.invoiceId === invoiceId) ||
              (billingFailureOperation === 'reversePayment' &&
                reversalDraft?.paymentId &&
                reversalInvoiceId === invoiceId),
            )}
            {@const isCreditNote = isCreditNoteInvoice(invoice)}
            {@const ledger = ledgerForInvoice(invoiceId)}
            {@const currency = invoiceCurrency(invoice)}
            {@const rowBlocker = invoiceIssueBlocker(invoice)}
            {@const pdfStatus = invoicePdfStatus(invoice)}
            {@const draftPreview = hasDraftPreview(invoice)}
            {@const currentLifecycle = lifecycleStage(invoiceStateValue)}
            {@const historicalIssueMarkers =
              ['draft', 'approved'].includes(invoiceStateValue) &&
              Boolean(
                rowValue(invoice, 'invoice_number', 'invoiceNumber', 'issued_at', 'issuedAt'),
              )}
            {@const planningEditable =
              canManageBilling &&
              ['draft', 'approved'].includes(invoiceStateValue) &&
              !historicalIssueMarkers}
            {@const planningLockedFailure =
              canManageBilling &&
              billingProblem?.code === 'BILLING_PLANNING_INVOICE_LOCKED' &&
              problemFor('setInvoicePlanningDates', 'invoiceId', invoiceId)}
            <ResponsiveSheet
              open={true}
              title={invoiceTitle(invoice)}
              description={rowValue(invoice, 'project_number', 'projectNumber')}
              closeLabel={translate('Close')}
              onclose={closeInvoice}
            >
              {#if billingProblem && paymentProblemForInvoice}
                <div data-billing-payment-problem>
                  <ProblemNotice
                    problem={billingProblem}
                    kind={billingProblem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
                    status={billingProblem.code === 'BILLING_PAYMENT_EXCEEDS_BALANCE' &&
                    billingProblem.params.remainingMinor !== undefined &&
                    billingProblem.params.currency
                      ? `${balanceLabel(invoice)}: ${formatMoney(billingProblem.params.remainingMinor, String(billingProblem.params.currency))}`
                      : billingProblem.code === 'BILLING_REVERSAL_EXCEEDS_REMAINING' &&
                          billingProblem.params.remainingMinor !== undefined &&
                          billingProblem.params.currency
                        ? `${translate('problem.billing.reversalRemainingLabel')}: ${formatMoney(billingProblem.params.remainingMinor, String(billingProblem.params.currency))}`
                        : undefined}
                    remedyLinks={problemRemedyLinks}
                  />
                </div>
              {/if}
              {#if billingProblem && invoiceFailureId === invoiceId && !paymentProblemForInvoice && !invoiceProblemFormAvailable(billingFailureOperation, invoiceStateValue, isCreditNote)}
                <div data-billing-invoice-problem>
                  <ProblemNotice
                    problem={billingProblem}
                    kind={billingProblem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
                    remedyLinks={problemRemedyLinks}
                  />
                  {#if billingFailureOperation === 'voidInvoice' && billingFailureValues.reason}
                    <p data-billing-void-attempted-reason>
                      <strong>{translate('Void reason')}:</strong>
                      {billingFailureValues.reason}
                    </p>
                  {/if}
                </div>
              {/if}
              <article class="billing-section__invoice" data-invoice-row={invoiceId}>
                <nav class="billing-section__drawer-tabs" aria-label={translate('Jump to')}>
                  <button type="button" onclick={() => jumpInvoiceSection('invoice-overview')}
                    >{translate('Overview')}</button
                  >
                  <button type="button" onclick={() => jumpInvoiceSection('invoice-collections')}
                    >{translate('Collections')}</button
                  >
                  <button type="button" onclick={() => jumpInvoiceSection('invoice-lifecycle')}
                    >{translate('Lifecycle')}</button
                  >
                </nav>
                <div class="billing-section__invoice-heading" id="invoice-overview" tabindex="-1">
                  <div>
                    <strong
                      >{invoiceTitle(invoice)} · {rowValue(
                        invoice,
                        'project_number',
                        'projectNumber',
                      )}</strong
                    >
                    <small>
                      {controlledValue(
                        'billingStream',
                        rowValue(invoice, 'stream_type', 'streamType'),
                      )} ·
                      {invoiceStatus(invoice)} · {invoiceTotal(invoice)} · {translate('Currency')}: {currency}
                    </small>
                  </div>
                  <StatusBadge
                    variant={statusVariant(invoiceStateValue)}
                    text={invoiceStatusText(invoice)}
                    data-invoice-status={invoiceStateValue}
                    aria-label={invoiceStatus(invoice)}
                  />
                </div>
                <ol
                  class="billing-section__lifecycle"
                  id="invoice-lifecycle"
                  tabindex="-1"
                  aria-label={translate('Invoice timeline')}
                >
                  {#each ['draft', 'approved', 'issued', 'collected'] as step}
                    {@const status =
                      ['draft', 'approved', 'issued', 'collected'].indexOf(step) <
                      ['draft', 'approved', 'issued', 'collected'].indexOf(currentLifecycle)
                        ? 'done'
                        : step === currentLifecycle
                          ? 'current'
                          : 'upcoming'}
                    <li
                      class="billing-section__lifecycle-step"
                      data-lifecycle-status={status}
                      aria-current={status === 'current' ? 'step' : undefined}
                    >
                      {step === 'draft'
                        ? translate('Draft invoice')
                        : step === 'approved'
                          ? translate('Approved')
                          : step === 'issued'
                            ? translate('Issue invoice')
                            : translate('Collected')}
                    </li>
                  {/each}
                </ol>

                <div
                  class="billing-section__invoice-dates"
                  aria-label={translate('Invoice timeline')}
                >
                  <div>
                    <span>{translate('Planned issue')}</span><strong
                      >{dateValue(rowValue(invoice, 'planned_issue_on', 'plannedIssueOn'))}</strong
                    >
                  </div>
                  <div>
                    <span>{translate('Actual issue')}</span><strong
                      >{dateValue(rowValue(invoice, 'issued_at', 'issuedAt'))}</strong
                    >
                  </div>
                  <div>
                    <span>{translate('Expected collection')}</span><strong
                      >{dateValue(
                        rowValue(invoice, 'expected_collection_on', 'expectedCollectionOn'),
                      )}</strong
                    >
                  </div>
                  <div>
                    <span>{translate('Actual collection')}</span><strong
                      >{dateValue(ledger?.paidAt ?? ledger?.lastPaymentDate)}</strong
                    >
                  </div>
                </div>

                {#if planningEditable || planningLockedFailure}
                  {#if problemFor('setInvoicePlanningDates', 'invoiceId', invoiceId)}
                    <div data-billing-planning-problem>
                      <ProblemNotice
                        problem={billingProblem!}
                        kind="error"
                        status={planningLockedFailure ? invoiceStatus(invoice) : undefined}
                        remedyLinks={problemRemedyLinks}
                      />
                    </div>
                  {/if}
                  {#if planningLockedFailure}
                    <p class="billing-section__planning-attempt-note">
                      {translate('problem.billing.planningAttemptNotSaved')}
                    </p>
                  {/if}
                  <form
                    method="POST"
                    action="?/setInvoicePlanningDates"
                    class="billing-section__planning-form"
                    aria-label={translate('Plan invoice dates')}
                    use:recoverBillingForm={recoveryOptions(
                      'setInvoicePlanningDates',
                      'invoiceId',
                      invoiceId,
                    )}
                  >
                    <fieldset disabled={!planningEditable}>
                      <legend>{translate('Planned and expected dates')}</legend>
                      <p>
                        {translate(
                          'Planning and expected values are directional controls. They never count as actual time, paid cash, or collected revenue.',
                        )}
                      </p>
                      <div class="billing-section__planning-fields">
                        <label
                          ><span>{translate('Planned issue')}</span><input
                            name="plannedIssueOn"
                            type="date"
                            value={rowValue(invoice, 'planned_issue_on', 'plannedIssueOn')}
                          /></label
                        >
                        <label
                          ><span>{translate('Expected collection')}</span><input
                            name="expectedCollectionOn"
                            type="date"
                            value={rowValue(
                              invoice,
                              'expected_collection_on',
                              'expectedCollectionOn',
                            )}
                          /></label
                        >
                        <input type="hidden" name="invoiceId" value={invoiceId} />
                        <input
                          type="hidden"
                          name="expectedVersion"
                          value={rowValue(invoice, 'version')}
                        />
                        {#if planningEditable}
                          <button type="submit">{translate('Save planning dates')}</button>
                        {/if}
                      </div>
                    </fieldset>
                  </form>
                {/if}

                <h3 id="invoice-collections" tabindex="-1">{translate('Collections')}</h3>
                <p class="billing-section__timeline-note">
                  {translate('Only append-only payment events count as collected')}
                </p>

                {#if ledger}
                  <div class="billing-section__invoice-ledger">
                    <span
                      >{translate('Collected')}:
                      <strong>{formatMoney(ledger.netCollectedMinor, currency)}</strong></span
                    >
                    <span
                      >{balanceLabel(invoice)}:
                      <strong>{balanceDisplay(invoice, ledger)}</strong></span
                    >
                    <span
                      >{translate('Payment state')}: <strong>{paymentStatus(ledger)}</strong></span
                    >
                  </div>
                {/if}

                {#if rowBlocker}
                  <aside
                    class="billing-section__row-blocker"
                    data-invoice-issue-blocker
                    role="alert"
                  >
                    <span>{blockerMessage(rowBlocker)}</span>
                    {#if blockerHref(rowBlocker)}<a href={blockerHref(rowBlocker)}
                        >{translate('Open sign-off')}</a
                      >{/if}
                  </aside>
                {/if}

                {#if ledger}
                  <details
                    class="billing-section__payment-history"
                    open={Boolean(reversalDraft?.paymentId) && reversalInvoiceId === invoiceId}
                  >
                    <summary>{translate('Collections and reversals')}</summary>
                    <div class="billing-section__history-summary">
                      <span
                        >{translate('Gross')}: {formatMoney(
                          ledger.grossPaymentsMinor,
                          currency,
                        )}</span
                      >
                      <span
                        >{translate('Reversals')}: {formatMoney(
                          ledger.paymentReversalsMinor,
                          currency,
                        )}</span
                      >
                      <span
                        >{translate('Net')}: {formatMoney(ledger.netCollectedMinor, currency)}</span
                      >
                    </div>
                    {#each ledger.payments ?? [] as payment}
                      {@const paymentId = String(payment.id ?? '')}
                      {@const reversalRecovery = reversalRecoveryState(
                        payment.netAmountMinor,
                        reversalDraft?.paymentId,
                        paymentId,
                      )}
                      <article class="billing-section__payment-row">
                        <div>
                          <strong>{paymentLabel(payment)}</strong>
                          <small>
                            {formatMoney(
                              payment.grossAmountMinor,
                              String(payment.currency ?? currency),
                            )} ·
                            {dateValue(payment.received_at)} · {String(
                              payment.reference ?? translate('No reference'),
                            )}
                          </small>
                          <small>
                            {translate('Reversed')}: {formatMoney(
                              payment.reversedMinor,
                              String(payment.currency ?? currency),
                            )} ·
                            {translate('Net')}: {formatMoney(
                              payment.netAmountMinor,
                              String(payment.currency ?? currency),
                            )}
                          </small>
                        </div>
                        {#if canManageBilling && !['void', 'credited'].includes(invoiceStateValue) && reversalRecovery.visible}
                          {#if !reversalRecovery.canSubmit}
                            <p class="billing-section__timeline-note">
                              {translate('problem.billing.reversalNoRemaining')}
                            </p>
                          {/if}
                          {#if reversalDraft?.paymentId === paymentId && reversalFieldErrors.length > 1}
                            <div
                              data-ui="validation-summary"
                              id={`billing-reversal-${paymentId}-summary`}
                              tabindex="-1"
                              role="alert"
                            >
                              <strong>{translate('Check the highlighted fields')}</strong>
                              <ul>
                                {#each reversalFieldErrors as field (field.name)}
                                  <li>
                                    <a href={`#billing-reversal-${paymentId}-${field.name}`}
                                      >{translate(field.label)}: {field.message}</a
                                    >
                                  </li>
                                {/each}
                              </ul>
                            </div>
                          {/if}
                          <form
                            method="POST"
                            action="?/reversePayment"
                            class="billing-section__payment-form"
                            use:rememberReversalScroll
                            use:enhance
                          >
                            <input type="hidden" name="paymentId" value={paymentId} />
                            <input type="hidden" name="viewportScrollY" value="0" />
                            <input type="hidden" name="drawerScrollTop" value="0" />
                            <label
                              ><span>{translate('Reversal amount')}</span><input
                                id={`billing-reversal-${paymentId}-amount`}
                                name="amount"
                                inputmode="decimal"
                                type="number"
                                min="0.01"
                                step="0.01"
                                max={minorToDecimal(payment.netAmountMinor)}
                                value={reversalDraft?.paymentId === paymentId
                                  ? reversalDraft.amount
                                  : minorToDecimal(payment.netAmountMinor)}
                                aria-invalid={Boolean(reversalError('amount', paymentId))}
                                aria-describedby={reversalError('amount', paymentId)
                                  ? `billing-reversal-${paymentId}-amount-error`
                                  : undefined}
                                required
                              />{#if reversalError('amount', paymentId)}<small
                                  id={`billing-reversal-${paymentId}-amount-error`}
                                  data-field-error-for={`billing-reversal-${paymentId}-amount`}
                                  role="alert">{reversalError('amount', paymentId)}</small
                                >{/if}</label
                            >
                            <label
                              ><span>{translate('Effective date')}</span><input
                                id={`billing-reversal-${paymentId}-effectiveOn`}
                                name="effectiveOn"
                                type="date"
                                value={reversalDraft?.paymentId === paymentId
                                  ? reversalDraft.effectiveOn
                                  : ''}
                                aria-invalid={Boolean(reversalError('effectiveOn', paymentId))}
                                aria-describedby={reversalError('effectiveOn', paymentId)
                                  ? `billing-reversal-${paymentId}-effectiveOn-error`
                                  : undefined}
                                required
                              />{#if reversalError('effectiveOn', paymentId)}<small
                                  id={`billing-reversal-${paymentId}-effectiveOn-error`}
                                  data-field-error-for={`billing-reversal-${paymentId}-effectiveOn`}
                                  role="alert">{reversalError('effectiveOn', paymentId)}</small
                                >{/if}</label
                            >
                            <label
                              ><span>{translate('Reason code')}</span><select
                                id={`billing-reversal-${paymentId}-reasonCode`}
                                name="reasonCode"
                                value={reversalDraft?.paymentId === paymentId
                                  ? reversalDraft.reasonCode
                                  : 'bank_return'}
                                aria-invalid={Boolean(reversalError('reasonCode', paymentId))}
                                aria-describedby={reversalError('reasonCode', paymentId)
                                  ? `billing-reversal-${paymentId}-reasonCode-error`
                                  : undefined}
                                required
                                ><option value="bank_return">{translate('Bank return')}</option
                                ><option value="duplicate">{translate('Duplicate')}</option><option
                                  value="entry_correction">{translate('Entry correction')}</option
                                ><option value="other">{translate('Other')}</option></select
                              >{#if reversalError('reasonCode', paymentId)}<small
                                  id={`billing-reversal-${paymentId}-reasonCode-error`}
                                  data-field-error-for={`billing-reversal-${paymentId}-reasonCode`}
                                  role="alert">{reversalError('reasonCode', paymentId)}</small
                                >{/if}</label
                            >
                            <label
                              ><span>{translate('Reason')}</span><input
                                id={`billing-reversal-${paymentId}-reason`}
                                name="reason"
                                value={reversalDraft?.paymentId === paymentId
                                  ? reversalDraft.reason
                                  : ''}
                                aria-invalid={Boolean(reversalError('reason', paymentId))}
                                aria-describedby={reversalError('reason', paymentId)
                                  ? `billing-reversal-${paymentId}-reason-error`
                                  : undefined}
                                required
                              />{#if reversalError('reason', paymentId)}<small
                                  id={`billing-reversal-${paymentId}-reason-error`}
                                  data-field-error-for={`billing-reversal-${paymentId}-reason`}
                                  role="alert">{reversalError('reason', paymentId)}</small
                                >{/if}</label
                            >
                            <input
                              type="hidden"
                              name="idempotencyKey"
                              value={`reversal-${String(payment.id ?? '')}-${String(payment.netAmountMinor ?? '0')}`}
                            />
                            <button type="submit" disabled={!reversalRecovery.canSubmit}
                              >{translate('Reverse payment')}</button
                            >
                          </form>
                        {/if}
                      </article>
                    {:else}
                      <p class="billing-section__empty">{translate('No payments recorded.')}</p>
                    {/each}
                    {#if (ledger.paymentReversals?.length ?? 0) > 0}
                      <div class="billing-section__reversal-table">
                        <table>
                          <caption>{translate('Immutable reversal history')}</caption>
                          <thead
                            ><tr
                              ><th scope="col">{translate('Payment')}</th><th scope="col"
                                >{translate('Amount')}</th
                              ><th scope="col">{translate('Effective date')}</th><th scope="col"
                                >{translate('Reason code')}</th
                              ><th scope="col">{translate('Reason')}</th></tr
                            ></thead
                          >
                          <tbody>
                            {#each ledger.paymentReversals ?? [] as reversal}
                              {@const originalPayment = (ledger.payments ?? []).find(
                                (payment) =>
                                  String(payment.id ?? '') ===
                                  String(reversal.originalPaymentId ?? ''),
                              )}
                              <tr
                                ><td>{paymentLabel(originalPayment)}</td><td
                                  >{formatMoney(
                                    reversal.amountMinor,
                                    String(reversal.currency ?? currency),
                                  )}</td
                                ><td>{dateValue(reversal.effectiveAt)}</td><td
                                  >{controlledValue('status', reversal.reasonCode)}</td
                                ><td>{String(reversal.reason ?? '—')}</td></tr
                              >
                            {/each}
                          </tbody>
                        </table>
                      </div>
                    {/if}
                  </details>
                {/if}

                <div class="billing-section__invoice-actions">
                  <div class="billing-section__next-step">
                    <strong>{translate('Next step')}</strong>
                    <p>{nextStepCopy(invoiceStateValue, isCreditNote)}</p>
                  </div>
                  <div class="billing-section__invoice-toolbar">
                    <a
                      class="secondary-button"
                      href={`${base}/app/billing/invoices/${encodeURIComponent(invoiceId)}`}
                      >{translate('Preview')}</a
                    >
                    <span
                      class="billing-section__artifact-status"
                      data-invoice-pdf-status={draftPreview ? 'preview' : pdfStatus}
                      aria-live="polite"
                    >
                      {translate('PDF')} · {translate(
                        draftPreview
                          ? 'Preview'
                          : pdfStatus === 'unavailable'
                            ? 'Unavailable'
                            : pdfStatus,
                      )}
                    </span>
                    {#if draftPreview}
                      <p class="billing-section__artifact-note" data-invoice-preview-help>
                        {translate(
                          'Preview is available before issuance. The final PDF is generated after issuance.',
                        )}
                      </p>
                    {:else if pdfStatus === 'ready'}
                      {#if invoicePdfFailure?.id === invoiceId && invoicePdfFailure.surface === 'drawer'}
                        <div
                          data-invoice-pdf-problem="drawer"
                          onclick={(event) => onInvoicePdfRemedyClick(event, invoiceId, 'drawer')}
                          role="presentation"
                        >
                          <ProblemNotice
                            problem={invoicePdfFailure.problem}
                            kind="error"
                            remedyLinks={invoicePdfRemedyLinks}
                            {locale}
                          />
                        </div>
                      {/if}
                      <a
                        class="secondary-button"
                        href={`${base}/app/api/invoices/${encodeURIComponent(invoiceId)}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${translate('Open PDF')}: ${invoiceTitle(invoice)}`}
                        aria-disabled={Boolean(invoicePdfBusyId)}
                        onclick={(event) =>
                          onInvoicePdfLinkClick(event, invoiceId, 'open', 'drawer')}
                        onauxclick={(event) =>
                          onInvoicePdfLinkClick(event, invoiceId, 'open', 'drawer')}
                        >{translate('Open PDF')}</a
                      >
                      <a
                        class="secondary-button"
                        href={`${base}/app/api/invoices/${encodeURIComponent(invoiceId)}/pdf`}
                        download
                        aria-label={`${translate('Download PDF')}: ${invoiceTitle(invoice)}`}
                        aria-disabled={Boolean(invoicePdfBusyId)}
                        onclick={(event) =>
                          onInvoicePdfLinkClick(event, invoiceId, 'download', 'drawer')}
                        onauxclick={(event) =>
                          onInvoicePdfLinkClick(event, invoiceId, 'download', 'drawer')}
                        >{translate('Download PDF')}</a
                      >
                      {#if invoicePdfOpenedId === invoiceId}
                        <p class="billing-section__artifact-note" role="status">
                          {translate('problem.invoice.pdfPreviewFallback')}
                        </p>
                      {/if}
                    {:else if pdfStatus === 'failed'}
                      <span class="billing-section__artifact-note" role="alert"
                        >{translate('Failed')}</span
                      >
                    {:else if pdfStatus === 'queued' || pdfStatus === 'running'}
                      <span class="billing-section__artifact-note" role="status"
                        >{translate('PDF')} · {translate(pdfStatus)}</span
                      >
                    {:else}
                      <span class="billing-section__artifact-note" role="status"
                        >{translate('Unavailable')}</span
                      >
                    {/if}
                  </div>
                  {#if !isAuditor && ['issued', 'sent', 'partially_paid', 'paid', 'overdue'].includes(invoiceStateValue)}
                    <details
                      class="billing-section__action-panel"
                      open={problemFor('emailInvoice', 'invoiceId', invoiceId)}
                    >
                      <summary>{translate('Send by email')}</summary>
                      {#if problemFor('emailInvoice', 'invoiceId', invoiceId)}
                        <ProblemNotice
                          problem={billingProblem!}
                          kind="error"
                          remedyLinks={problemRemedyLinks}
                        />
                      {/if}
                      {#if (data.invoiceEmailDeliveries ?? []).some((delivery) => delivery.invoiceId === invoiceId && delivery.status === 'uncertain')}
                        <ProblemNotice
                          problem={uncertainDeliveryWarning}
                          kind="warning"
                          remedyLinks={problemRemedyLinks}
                        />
                      {/if}
                      <form
                        method="POST"
                        action="?/emailInvoice"
                        class="billing-section__payment-form"
                        use:recoverBillingForm={recoveryOptions(
                          'emailInvoice',
                          'invoiceId',
                          invoiceId,
                        )}
                      >
                        <input type="hidden" name="invoiceId" value={invoiceId} />
                        <label
                          ><span>{translate('Invoice recipient email')}</span><input
                            type="email"
                            name="recipient"
                            maxlength="254"
                            required
                            value={form?.invoiceEmailId === invoiceId
                              ? (form.invoiceEmailRecipient ?? '')
                              : ''}
                          /></label
                        >
                        <p>
                          {translate(
                            'Send the issued PDF by email. Queued is not sent; SMTP acceptance does not confirm inbox delivery.',
                          )}
                        </p>
                        <label
                          ><span>{translate('Send the invoice PDF to this address?')}</span>
                          <select name="emailChoice" required>
                            <option value="">{translate('Choose an option')}</option>
                            <option value="no">{translate('No, do not send email')}</option>
                            <option value="yes">{translate('Yes, send this email')}</option>
                          </select></label
                        >
                        <button type="submit" disabled={pdfStatus !== 'ready'}
                          >{translate('Send by email')}</button
                        >
                      </form>
                      <div id="invoice-email-deliveries">
                        {#each (data.invoiceEmailDeliveries ?? []).filter((delivery) => delivery.invoiceId === invoiceId) as delivery}
                          <p role="status">
                            {delivery.recipient}: {translate(
                              delivery.status === 'uncertain'
                                ? 'Delivery uncertain; check mail server before retrying'
                                : delivery.status === 'accepted'
                                  ? 'Accepted by SMTP server'
                                  : delivery.status === 'sending'
                                    ? 'Email sending'
                                    : delivery.status === 'failed'
                                      ? 'Email failed; administrator action required'
                                      : delivery.status === 'retrying'
                                        ? 'Email delivery error; automatic retry pending'
                                        : 'Email queued',
                            )}
                          </p>
                        {/each}
                      </div>
                    </details>
                  {/if}
                  {#if historicalIssueMarkers}
                    <ProblemNotice
                      problem={historicalIssueMarkersProblem}
                      kind="error"
                      remedyLinks={{
                        review_invoice: {
                          label: translate('Review linked invoice'),
                          href: `${base}/app/billing/invoices/${encodeURIComponent(invoiceId)}`,
                        },
                      }}
                    />
                  {:else if isAuditor}
                    <span class="billing-section__read-only"
                      >{translate('Issued history is immutable')}</span
                    >
                  {:else if invoiceStateValue === 'draft'}
                    {#if problemFor('approveInvoice', 'invoiceId', invoiceId)}
                      <ProblemNotice
                        problem={billingProblem!}
                        kind="error"
                        remedyLinks={problemRemedyLinks}
                      />
                    {/if}
                    <form
                      method="POST"
                      action="?/approveInvoice"
                      use:recoverBillingForm={recoveryOptions(
                        'approveInvoice',
                        'invoiceId',
                        invoiceId,
                      )}
                    >
                      <input type="hidden" name="invoiceId" value={invoiceId} />
                      <button type="submit">{translate('Approve')}</button>
                    </form>
                    {#if problemFor('deleteInvoice', 'invoiceId', invoiceId)}
                      <ProblemNotice
                        problem={billingProblem!}
                        kind="error"
                        remedyLinks={problemRemedyLinks}
                      />
                    {/if}
                    {#if data.user.role === 'finance_admin' && financeDraftHasKnownLinkedLines(invoice)}
                      <ProblemNotice
                        problem={discardLinkedFinanceProblem}
                        kind="error"
                        remedyLinks={invoiceReviewRemedyLinks(invoiceId)}
                      />
                    {:else}
                      <ProblemNotice
                        problem={discardDraftWarning}
                        kind="warning"
                        remedyLinks={invoiceReviewRemedyLinks(invoiceId)}
                      />
                    {/if}
                    <form
                      method="POST"
                      action="?/deleteInvoice"
                      use:recoverBillingForm={recoveryOptions(
                        'deleteInvoice',
                        'invoiceId',
                        invoiceId,
                      )}
                    >
                      <input type="hidden" name="version" value={invoice.version} />
                      <input type="hidden" name="invoiceId" value={invoiceId} />
                      <label
                        >{translate('Correction reason')}<input
                          name="reason"
                          minlength="3"
                          maxlength="2000"
                          required
                        /></label
                      >
                      <button
                        type="submit"
                        class="danger"
                        disabled={data.user.role === 'finance_admin' &&
                          financeDraftHasKnownLinkedLines(invoice)}
                        >{translate('Discard draft')}</button
                      >
                    </form>
                  {:else if invoiceStateValue === 'approved'}
                    {#if problemFor('recalculateApprovedInvoice', 'invoiceId', invoiceId)}
                      <ProblemNotice
                        problem={billingProblem!}
                        kind="error"
                        remedyLinks={problemRemedyLinks}
                      />
                    {/if}
                    <form
                      method="POST"
                      action="?/recalculateApprovedInvoice"
                      use:recoverBillingForm={recoveryOptions(
                        'recalculateApprovedInvoice',
                        'invoiceId',
                        invoiceId,
                      )}
                    >
                      <input type="hidden" name="version" value={invoice.version} />
                      <input type="hidden" name="invoiceId" value={invoiceId} />
                      <label
                        >{translate('Recalculation reason')}<input
                          name="reason"
                          minlength="3"
                          maxlength="2000"
                          required
                        /></label
                      >
                      <button type="submit">{translate('Recalculate and review draft')}</button>
                    </form>
                    {#if data.user.role === 'owner_admin'}
                      {#if problemFor('deleteInvoice', 'invoiceId', invoiceId)}
                        <ProblemNotice
                          problem={billingProblem!}
                          kind="error"
                          remedyLinks={problemRemedyLinks}
                        />
                      {/if}
                      <ProblemNotice
                        problem={discardApprovedWarning}
                        kind="warning"
                        remedyLinks={invoiceReviewRemedyLinks(invoiceId)}
                      />
                      <form
                        method="POST"
                        action="?/deleteInvoice"
                        use:recoverBillingForm={recoveryOptions(
                          'deleteInvoice',
                          'invoiceId',
                          invoiceId,
                        )}
                      >
                        <input type="hidden" name="version" value={invoice.version} />
                        <input type="hidden" name="invoiceId" value={invoiceId} />
                        <label
                          >{translate('Correction reason')}<input
                            name="reason"
                            minlength="3"
                            maxlength="2000"
                            required
                          /></label
                        >
                        <button class="danger">{translate('Discard draft')}</button>
                      </form>
                    {/if}
                    {#if problemFor('issueInvoice', 'invoiceId', invoiceId)}
                      <ProblemNotice
                        problem={billingProblem!}
                        kind="error"
                        remedyLinks={problemRemedyLinks}
                      />
                    {/if}
                    <ProblemNotice
                      problem={issueInvoiceWarning}
                      kind="warning"
                      remedyLinks={problemRemedyLinks}
                    />
                    <form
                      method="POST"
                      action="?/issueInvoice"
                      class="billing-section__primary-form"
                      use:recoverBillingForm={recoveryOptions(
                        'issueInvoice',
                        'invoiceId',
                        invoiceId,
                      )}
                    >
                      <input type="hidden" name="invoiceId" value={invoiceId} />
                      <label
                        ><span>{translate('Report language')}</span><select name="reportLocale"
                          ><option value="en">EN</option><option value="pt">PT-BR</option><option
                            value="es">ES</option
                          ></select
                        ></label
                      >
                      <button type="submit">{translate('Issue invoice')}</button>
                    </form>
                  {:else if ['issued', 'sent', 'partially_paid', 'paid', 'overdue'].includes(invoiceStateValue) || paymentDraft?.invoiceId === invoiceId}
                    {#if isCreditNote && invoiceStateValue === 'overdue'}
                      {#if problemFor('restoreCreditNoteState', 'invoiceId', invoiceId)}
                        <ProblemNotice
                          problem={billingProblem!}
                          kind="error"
                          remedyLinks={problemRemedyLinks}
                        />
                      {/if}
                      <form
                        method="POST"
                        action="?/restoreCreditNoteState"
                        use:recoverBillingForm={recoveryOptions(
                          'restoreCreditNoteState',
                          'invoiceId',
                          invoiceId,
                        )}
                      >
                        <input type="hidden" name="invoiceId" value={invoiceId} />
                        <p>
                          {translate(
                            'A credit note cannot be overdue. Restore its issued status before accounting finalization.',
                          )}
                        </p>
                        <button type="submit">{translate('Restore credit note status')}</button>
                      </form>
                    {/if}
                    {#if isCreditNote}
                      <p class="billing-section__timeline-note">
                        {translate(
                          'A credit balance is not a customer payment. Use the ledger to review it.',
                        )}
                      </p>
                      <a
                        class="secondary-button"
                        href={`${base}/app/ledger?project=${encodeURIComponent(rowValue(invoice, 'project_id', 'projectId'))}`}
                        >{translate('Review credit in ledger')} <DirectionIcon /></a
                      >
                    {:else if canRecordPayment || paymentDraft?.invoiceId === invoiceId}
                      <details
                        class="billing-section__action-panel"
                        open={paymentDraft?.invoiceId === invoiceId}
                      >
                        <summary>{translate('Record payment')}</summary>
                        <p>
                          {translate(
                            'Record money received from the client. That is the only path that counts as collected.',
                          )}
                        </p>
                        {#if paymentDraft?.invoiceId === invoiceId && paymentFieldErrors.length > 1}
                          <div
                            data-ui="validation-summary"
                            data-billing-payment-summary
                            tabindex="-1"
                            role="alert"
                          >
                            <strong>{translate('Check the highlighted fields')}</strong>
                            <ul>
                              {#each paymentFieldErrors as field (field.name)}
                                <li>
                                  <a href={`#billing-payment-${field.name}`}
                                    >{translate(field.label)}: {field.message}</a
                                  >
                                </li>
                              {/each}
                            </ul>
                          </div>
                        {/if}
                        <form
                          method="POST"
                          action="?/recordPayment"
                          class="billing-section__payment-form"
                          use:enhance
                          use:rememberReversalScroll
                        >
                          <input type="hidden" name="viewportScrollY" value="0" />
                          <input type="hidden" name="drawerScrollTop" value="0" />
                          <input type="hidden" name="invoiceId" value={invoiceId} />
                          <label
                            ><span>{translate('Payment amount')}</span><input
                              id="billing-payment-amount"
                              name="amount"
                              inputmode="decimal"
                              type="number"
                              min="0.01"
                              step="0.01"
                              max={minorToDecimal(
                                ledger?.outstandingMinor ??
                                  rowValue(invoice, 'total_minor', 'totalMinor'),
                              )}
                              value={paymentDraft?.invoiceId === invoiceId
                                ? paymentDraft.amount
                                : ''}
                              aria-invalid={Boolean(paymentError('amount'))}
                              aria-describedby={paymentError('amount')
                                ? 'billing-payment-amount-error'
                                : undefined}
                              required
                            />{#if paymentError('amount')}<small
                                id="billing-payment-amount-error"
                                data-field-error-for="billing-payment-amount"
                                role="alert">{paymentError('amount')}</small
                              >{/if}</label
                          >
                          <label
                            ><span>{translate('Currency')}</span><input
                              id="billing-payment-currency"
                              name="currency"
                              value={currency}
                              readonly
                              aria-readonly="true"
                              aria-invalid={Boolean(paymentError('currency'))}
                              aria-describedby={paymentError('currency')
                                ? 'billing-payment-currency-error'
                                : undefined}
                              required
                            />{#if paymentError('currency')}<small
                                id="billing-payment-currency-error"
                                data-field-error-for="billing-payment-currency"
                                role="alert">{paymentError('currency')}</small
                              >{/if}</label
                          >
                          <label
                            ><span>{translate('Received on')}</span><input
                              id="billing-payment-receivedOn"
                              name="receivedOn"
                              type="date"
                              value={paymentDraft?.invoiceId === invoiceId
                                ? paymentDraft.receivedOn
                                : todayIso}
                              aria-invalid={Boolean(paymentError('receivedOn'))}
                              aria-describedby={paymentError('receivedOn')
                                ? 'billing-payment-receivedOn-error'
                                : undefined}
                              required
                            />{#if paymentError('receivedOn')}<small
                                id="billing-payment-receivedOn-error"
                                data-field-error-for="billing-payment-receivedOn"
                                role="alert">{paymentError('receivedOn')}</small
                              >{/if}</label
                          >
                          <label
                            ><span>{translate('Payment reference / note')}</span><input
                              id="billing-payment-reference"
                              name="reference"
                              value={paymentDraft?.invoiceId === invoiceId
                                ? paymentDraft.reference
                                : ''}
                              aria-invalid={Boolean(paymentError('reference'))}
                              aria-describedby={paymentError('reference')
                                ? 'billing-payment-reference-error'
                                : undefined}
                              required
                            />{#if paymentError('reference')}<small
                                id="billing-payment-reference-error"
                                data-field-error-for="billing-payment-reference"
                                role="alert">{paymentError('reference')}</small
                              >{/if}</label
                          >
                          <input
                            name="idempotencyKey"
                            type="hidden"
                            value={rowValue(invoice, 'paymentCommandToken') ||
                              `payment-${invoiceId}-${currency}`}
                          />
                          <button type="submit" disabled={!canRecordPayment || paymentRetryBlocked}
                            >{translate('Record payment')}</button
                          >
                        </form>
                      </details>
                    {/if}
                    <details
                      class="billing-section__action-panel"
                      open={problemFor('createInvoiceAdjustment', 'originalInvoiceId', invoiceId)}
                    >
                      <summary>{translate('Create adjustment')}</summary>
                      <p>
                        {translate(
                          'Open a credit or debit draft. The issued bill stays unchanged.',
                        )}
                      </p>
                      {#if problemFor('createInvoiceAdjustment', 'originalInvoiceId', invoiceId)}
                        <div data-billing-invoice-problem>
                          <ProblemNotice
                            problem={billingProblem!}
                            kind="error"
                            remedyLinks={problemRemedyLinks}
                          />
                        </div>
                      {/if}
                      <ProblemNotice
                        problem={adjustmentWarning}
                        kind="warning"
                        remedyLinks={problemRemedyLinks}
                      />
                      <form
                        method="POST"
                        action="?/createInvoiceAdjustment"
                        class="billing-section__payment-form"
                        use:recoverBillingForm={recoveryOptions(
                          'createInvoiceAdjustment',
                          'originalInvoiceId',
                          invoiceId,
                        )}
                      >
                        <input type="hidden" name="originalInvoiceId" value={invoiceId} />
                        <label
                          ><span>{translate('Adjustment type')}</span><select name="adjustmentType"
                            ><option value="credit">{translate('Credit')}</option><option
                              value="debit">{translate('Debit')}</option
                            ><option value="correction">{translate('Correction')}</option></select
                          ></label
                        >
                        <label
                          ><span>{translate('Adjustment amount')}</span><input
                            name="amount"
                            inputmode="decimal"
                            type="number"
                            min="0.01"
                            step="0.01"
                            required
                          /></label
                        >
                        <label
                          ><span>{translate('Adjustment reason')}</span><input
                            name="reason"
                            required
                          /></label
                        >
                        <button type="submit">{translate('Create adjustment')}</button>
                      </form>
                    </details>
                    {#if canVoidInvoice || invoiceStateValue === 'issued'}
                      <details
                        class="billing-section__action-panel"
                        open={problemFor('sendInvoice', 'invoiceId', invoiceId) ||
                          problemFor('voidInvoice', 'invoiceId', invoiceId)}
                      >
                        <summary>{translate('More actions')}</summary>
                        {#if invoiceStateValue === 'issued'}
                          <p>
                            {translate(
                              'Mark sent records a manual delivery only. It does not send an email.',
                            )}
                          </p>
                          {#if problemFor('sendInvoice', 'invoiceId', invoiceId)}
                            <ProblemNotice
                              problem={billingProblem!}
                              kind="error"
                              remedyLinks={problemRemedyLinks}
                            />
                          {/if}
                          <form
                            method="POST"
                            action="?/sendInvoice"
                            use:recoverBillingForm={recoveryOptions(
                              'sendInvoice',
                              'invoiceId',
                              invoiceId,
                            )}
                          >
                            <input type="hidden" name="invoiceId" value={invoiceId} />
                            <input
                              type="hidden"
                              name="idempotencyKey"
                              value={`send-${invoiceId}`}
                            />
                            <button type="submit">{translate('Mark sent')}</button>
                          </form>
                        {/if}
                        {#if canVoidInvoice}
                          {#if problemFor('voidInvoice', 'invoiceId', invoiceId)}
                            <div data-billing-invoice-problem>
                              <ProblemNotice
                                problem={billingProblem!}
                                kind="error"
                                remedyLinks={problemRemedyLinks}
                              />
                            </div>
                          {/if}
                          <form
                            method="POST"
                            action="?/voidInvoice"
                            class="billing-section__payment-form"
                            use:recoverBillingForm={recoveryOptions(
                              'voidInvoice',
                              'invoiceId',
                              invoiceId,
                            )}
                          >
                            <input type="hidden" name="invoiceId" value={invoiceId} />
                            <input
                              type="hidden"
                              name="idempotencyKey"
                              value={`void-${invoiceId}`}
                            />
                            <label
                              ><span>{translate('Void reason')}</span><input
                                name="reason"
                                required
                              /></label
                            >
                            <button type="submit" class="danger">{translate('Void')}</button>
                          </form>
                        {/if}
                      </details>
                    {/if}
                  {:else}
                    <span class="billing-section__read-only"
                      >{translate('No lifecycle action available')}</span
                    >
                  {/if}
                </div>
              </article>
            </ResponsiveSheet>
          {/if}
        </div>
      {:else}
        <div class="billing-section__empty" role="status">
          <strong>{translate('No invoices match this view.')}</strong>
          <span
            >{translate(
              canManageBilling
                ? 'Adjust filters or build a draft from an authorized billing stream.'
                : 'billing.invoiceRegister.readOnlyEmptyHelp',
            )}</span
          >
        </div>
      {/if}
    </SectionCard>
  {/if}
</div>

<style>
  .billing-section__saved-stream :global(.record-facts dd) {
    white-space: normal;
    overflow-wrap: anywhere;
    text-overflow: clip;
  }
  [data-tax-profile-directory] :global(.record-facts dd),
  [data-tax-profile-directory] :global(.ui-card-heading),
  [data-tax-components] li {
    min-width: 0;
    white-space: normal;
    overflow-wrap: anywhere;
    overflow: visible;
    text-overflow: clip;
  }

  .billing-section__issuer-mobile-label {
    display: none;
  }

  .billing-section__issuer-directory {
    grid-column: 1 / -1;
    min-width: 0;
  }

  .billing-section__issuer-table th:last-child,
  .billing-section__issuer-table td:last-child {
    width: 21rem;
  }

  .billing-section__issuer-table .billing-section__config-form {
    grid-template-columns: minmax(0, 1fr);
  }

  .billing-section__table {
    width: 100%;
    border-collapse: collapse;
  }

  .billing-section__rule-mobile-label {
    display: none;
  }

  .billing-section__table th,
  .billing-section__table td {
    padding: 0.65rem 0.7rem;
    border-bottom: 1px solid var(--portal-border, #dfdedc);
    text-align: left;
    vertical-align: top;
  }

  .billing-section__table td small {
    display: block;
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
  }

  .billing-section__table td .billing-section__period-form {
    margin-bottom: 0.5rem;
  }

  .billing-section__table thead th {
    position: sticky;
    top: 0;
    background: var(--portal-surface, #fff);
    font-size: 0.8125rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .billing-section__table tbody tr:hover {
    background: color-mix(in srgb, var(--portal-accent, #53524c) 6%, #fff);
  }

  .billing-section__directories {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    margin-bottom: 1.25rem;
  }

  .billing-section__drawer-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 0.85rem;
  }

  .billing-section__drawer-tabs button {
    min-height: 2.75rem;
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 999px;
    background: #fff;
    font: inherit;
    font-weight: 650;
  }

  .billing-section__drawer-tabs button:hover {
    background: var(--portal-ink, #20201d);
    border-color: var(--portal-ink, #20201d);
    color: #fff;
  }

  .billing-section {
    display: grid;
    gap: 1.25rem;
  }

  .billing-section__workspace {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .billing-section__workspace-tab {
    min-height: 2.75rem;
    padding: 0.55rem 1rem;
    border: 1px solid var(--portal-line, #e1e1de);
    border-radius: 999px;
    background: #fff;
    color: var(--portal-ink, #20201d);
    font-weight: 650;
  }

  .billing-section__workspace-tab--active,
  .billing-section__workspace-tab[aria-selected='true'] {
    background: var(--portal-ink, #20201d);
    border-color: var(--portal-ink, #20201d);
    color: #fff;
  }

  .billing-section__workspace-tab:focus-visible {
    outline: 2px solid var(--portal-accent, #706e66);
    outline-offset: 2px;
  }

  .billing-section__context {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
  }

  .billing-section__eyebrow {
    margin: 0 0 0.35rem;
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    font-weight: 750;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .billing-section__context h2 {
    margin: 0;
    color: var(--portal-ink, #20201d);
    font-size: clamp(1.55rem, 2vw, 2rem);
    letter-spacing: -0.025em;
  }

  .billing-section__context p:last-child {
    max-width: 48rem;
    margin: 0.4rem 0 0;
    color: var(--portal-muted, #67675f);
  }

  .billing-section__read-only {
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    font-weight: 700;
  }

  .billing-section :global([data-ui='status-badge'][data-invoice-status='issued']),
  .billing-section :global([data-ui='status-badge'][data-invoice-status='sent']),
  .billing-section :global([data-ui='status-badge'][data-invoice-status='partially_paid']) {
    color: #585750;
    border-color: #9d9b94;
    background: #efefed;
  }

  .billing-section :global([data-ui='status-badge'][data-invoice-status='paid']) {
    color: #17663a;
    border-color: #4da876;
    background: #dff4e5;
  }

  .billing-section :global([data-ui='status-badge'][data-invoice-status='draft']) {
    color: #63625b;
    border-color: #bcbbb6;
    background: #f3f3f2;
  }

  .billing-section :global([data-ui='status-badge'][data-invoice-status='void']),
  .billing-section :global([data-ui='status-badge'][data-invoice-status='voided']) {
    color: #8a252b;
    border-color: #cb6d72;
    background: #fbe4e4;
  }

  .billing-section :global([data-ui='status-badge'][data-invoice-status='credited']),
  .billing-section :global([data-ui='status-badge'][data-invoice-status='credit_note']),
  .billing-section :global([data-ui='status-badge'][data-invoice-status='credit']) {
    color: #80520b;
    border-color: #d6a54b;
    background: #fff1cc;
  }

  .billing-section__issue-blocker,
  .billing-section__row-blocker {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.9rem 1rem;
    border: 1px solid
      color-mix(in srgb, var(--portal-danger, #b42318) 44%, var(--portal-border, #dfdedc));
    border-radius: 0.7rem;
    background: color-mix(in srgb, var(--portal-danger, #b42318) 7%, var(--portal-surface, #fff));
  }

  .billing-section__issue-blocker > div,
  .billing-section__row-blocker {
    display: grid;
    gap: 0.25rem;
  }

  .billing-section__issue-blocker span,
  .billing-section__row-blocker span {
    color: var(--portal-muted, #67675f);
    font-size: 0.86rem;
  }

  .billing-section__issue-blocker a,
  .billing-section__row-blocker a {
    color: var(--portal-accent, #53524c);
    font-weight: 750;
    white-space: nowrap;
  }

  .billing-section__summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr));
    gap: 0.75rem;
  }

  .billing-section__summary-card {
    display: grid;
    gap: 0.22rem;
    min-height: 6.25rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.75rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #20201d);
    text-align: left;
    cursor: pointer;
    font: inherit;
  }

  .billing-section__summary-card:hover,
  .billing-section__summary-card--active {
    border-color: var(--portal-accent, #53524c);
    background: color-mix(in srgb, var(--portal-accent, #53524c) 7%, var(--portal-surface, #fff));
  }

  .billing-section__summary-card--danger {
    border-color: color-mix(
      in srgb,
      var(--portal-danger, #b42318) 40%,
      var(--portal-border, #dfdedc)
    );
  }

  .billing-section__summary-card span {
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
  }

  .billing-section__summary-card--active span {
    color: var(--portal-ink, #20201d);
  }

  .billing-section__summary-card strong {
    font-size: 1.45rem;
    font-variant-numeric: tabular-nums;
  }

  .billing-section__filters {
    display: grid;
    grid-template-columns: minmax(16rem, 2fr) minmax(12rem, 1fr) minmax(12rem, 1fr) auto;
    align-items: end;
    gap: 0.75rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--portal-surface, #fff) 92%, var(--portal-wash, #f2f2f1));
  }

  .billing-section__filters label,
  .billing-section__config-form label,
  .billing-section__inline-form label,
  .billing-section__period-form label,
  .billing-section__payment-form label,
  .billing-section__invoice-actions > form > label {
    display: grid;
    gap: 0.35rem;
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    font-weight: 650;
  }

  .billing-section__filters input,
  .billing-section__filters select,
  .billing-section__config-form input,
  .billing-section__config-form select,
  .billing-section__config-form textarea,
  .billing-section__inline-form input,
  .billing-section__inline-form select,
  .billing-section__period-form input,
  .billing-section__period-form select,
  .billing-section__payment-form input,
  .billing-section__payment-form select,
  .billing-section__invoice-actions input,
  .billing-section__invoice-actions select {
    box-sizing: border-box;
    width: 100%;
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--portal-border-strong, #c4c4bf);
    border-radius: 0.5rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #20201d);
    font: inherit;
  }

  .billing-section__filters button,
  .billing-section__config button,
  .billing-section__rule-actions button,
  .billing-section__invoice-actions button,
  .billing-section__invoice-actions a,
  .billing-section__payment-form button,
  .billing-section__rule-editor summary {
    min-height: 2.75rem;
  }

  .billing-section__config {
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.75rem;
    background: var(--portal-surface, #fff);
  }

  .billing-section__config > summary {
    box-sizing: border-box;
    width: fit-content;
    margin: 0.9rem;
    cursor: pointer;
    list-style: none;
  }

  .billing-section__config > summary::-webkit-details-marker,
  .billing-section__rule-editor > summary::-webkit-details-marker,
  .billing-section__payment-history > summary::-webkit-details-marker {
    display: none;
  }

  .billing-section__config-body {
    display: grid;
    gap: 1rem;
    padding: 0 1rem 1rem;
    border-top: 1px solid var(--portal-border, #dfdedc);
  }

  .billing-section__config-heading h3,
  .billing-section__config-form h4 {
    margin: 0;
    color: var(--portal-ink, #20201d);
  }

  .billing-section__config-heading p,
  .billing-section__setup-help,
  .billing-section__section-intro p {
    margin: 0.35rem 0 0;
    color: var(--portal-muted, #67675f);
  }

  .billing-section__setup-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
  }

  .billing-section__setup-actions button {
    min-height: 2.75rem;
    padding: 0.5rem 0.9rem;
    border: 1px solid var(--portal-border-strong, #c4c4bf);
    border-radius: 999px;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #20201d);
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }

  .billing-section__setup-actions button[aria-pressed='true'] {
    border-color: var(--portal-accent, #53524c);
    background: var(--portal-accent, #53524c);
    color: #fff;
  }

  .billing-section__config-form {
    scroll-margin-top: 6rem;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
    padding: 1rem 0;
    border-bottom: 1px solid var(--portal-border, #dfdedc);
  }

  .billing-section__config-form h4,
  .billing-section__config-form > button {
    grid-column: 1 / -1;
  }

  .billing-section__config-form > [data-expense-billability-help] {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--portal-muted, #67675f);
    line-height: 1.5;
  }

  .billing-section__config-form [hidden] {
    display: none;
  }

  .billing-section__config-form textarea {
    min-height: 5rem;
    resize: vertical;
  }

  .billing-section__checkbox {
    display: flex !important;
    align-items: center;
    gap: 0.5rem !important;
    min-height: 2.75rem;
  }

  .billing-section__checkbox input {
    width: auto;
    min-height: auto;
  }

  .billing-section__config-compact-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
  }

  .billing-section__config-compact-grid .billing-section__config-form {
    grid-template-columns: 1fr;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.65rem;
    padding: 0.9rem;
  }

  .billing-section__section-intro {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .billing-section__section-intro > span {
    color: var(--portal-muted, #67675f);
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .billing-section__rule-list,
  .billing-section__invoice-list {
    display: grid;
    gap: 0.75rem;
  }

  .billing-section__invoice {
    display: grid;
    gap: 0.9rem;
    padding: 1rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.7rem;
    background: var(--portal-surface, #fff);
  }

  .billing-section__rule-editor[open] {
    width: 100%;
    min-width: 0;
  }

  .billing-section__invoice-heading > div {
    display: grid;
    gap: 0.25rem;
  }

  .billing-section__invoice small,
  .billing-section__payment-row small {
    color: var(--portal-muted, #67675f);
  }

  .billing-section__rule-editor > summary,
  .billing-section__payment-history > summary,
  .billing-section__action-panel > summary,
  .billing-section__close-sources > summary {
    box-sizing: border-box;
    width: fit-content;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--portal-border-strong, #c4c4bf);
    border-radius: 0.5rem;
    color: var(--portal-ink, #20201d);
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 750;
    list-style: none;
  }

  .billing-section__rule-actions {
    box-sizing: border-box;
    display: grid;
    gap: 0.8rem;
    width: min(48rem, 100%);
    min-width: 0;
    margin-top: 0.65rem;
    padding: 0.85rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.65rem;
    background: var(--portal-wash, #f9f9f8);
  }

  .billing-section__inline-form,
  .billing-section__period-form,
  .billing-section__payment-form {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.65rem;
  }

  .billing-section__period-warning {
    flex: 1 1 100%;
    width: 100%;
  }

  .billing-section__inline-form > label,
  .billing-section__period-form > label,
  .billing-section__payment-form > label {
    flex: 1 1 10rem;
  }

  .billing-section__invoice-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .billing-section__invoice-dates {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .billing-section__invoice-dates > div {
    display: grid;
    gap: 0.25rem;
    padding: 0.65rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.5rem;
  }

  .billing-section__invoice-dates span,
  .billing-section__invoice-ledger span {
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
  }

  .billing-section__invoice-dates strong,
  .billing-section__invoice-ledger strong {
    font-variant-numeric: tabular-nums;
  }

  .billing-section__timeline-note {
    margin: -0.2rem 0 0;
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
  }

  .billing-section__planning-form {
    padding: 0.8rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.65rem;
    background: var(--portal-wash, #f9f9f8);
  }

  .billing-section__planning-attempt-note {
    margin: 0 0 0.65rem;
    color: var(--portal-muted, #67675f);
    font-size: 0.875rem;
  }

  .billing-section__planning-form fieldset {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .billing-section__planning-form legend {
    padding: 0;
    color: var(--portal-ink, #20201d);
    font-weight: 750;
  }

  .billing-section__planning-form p {
    max-width: 58rem;
    margin: 0;
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
  }

  .billing-section__planning-fields {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: end;
    gap: 0.65rem;
  }

  .billing-section__planning-fields label {
    display: grid;
    gap: 0.35rem;
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    font-weight: 650;
  }

  .billing-section__planning-fields input {
    box-sizing: border-box;
    width: 100%;
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--portal-border-strong, #c4c4bf);
    border-radius: 0.5rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #20201d);
    font: inherit;
  }

  .billing-section__planning-fields button {
    min-height: 2.75rem;
  }

  .billing-section__invoice-ledger,
  .billing-section__history-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.25rem;
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
  }

  .billing-section__payment-history {
    display: grid;
    gap: 0.75rem;
  }

  .billing-section__payment-row {
    display: grid;
    gap: 0.7rem;
    padding: 0.75rem;
    border-left: 3px solid var(--portal-border-strong, #c4c4bf);
    background: var(--portal-wash, #f9f9f8);
  }

  .billing-section__payment-row > div:first-child {
    display: grid;
    gap: 0.25rem;
  }

  .billing-section__lifecycle {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .billing-section__lifecycle-step {
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    background: var(--portal-wash, #f9f9f8);
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    font-weight: 750;
  }

  .billing-section__lifecycle-step[data-lifecycle-status='done'] {
    background: #efefed;
    color: #585750;
  }

  .billing-section__lifecycle-step[data-lifecycle-status='current'] {
    background: var(--portal-ink, #20201d);
    color: #fff;
  }

  .billing-section__invoice-actions {
    display: grid;
    gap: 0.85rem;
    padding-top: 0.35rem;
    border-top: 1px solid var(--portal-border, #dfdedc);
  }

  .billing-section__next-step {
    display: grid;
    gap: 0.35rem;
    padding: 0.85rem 0.95rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.65rem;
    background: var(--portal-wash, #f9f9f8);
  }

  .billing-section__next-step p {
    margin: 0;
    color: var(--portal-muted, #67675f);
    max-width: 48rem;
  }

  .billing-section__invoice-toolbar,
  .billing-section__primary-form,
  .billing-section__invoice-actions > form {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.65rem;
  }

  .billing-section__invoice-toolbar [data-invoice-pdf-problem],
  .billing-section__invoice-toolbar .billing-section__artifact-note[role='status'] {
    flex-basis: 100%;
    min-width: 0;
  }

  .billing-section__invoice-actions form > label,
  .billing-section__payment-form > label {
    min-width: 11rem;
  }

  .billing-section__payment-form [data-field-error-for] {
    display: block;
    margin-block-start: 0.25rem;
    color: var(--ja-danger, #a40f18);
    font-size: 0.82rem;
    font-weight: 700;
  }

  .billing-section__payment-form [aria-invalid='true'] {
    border-color: var(--ja-danger, #a40f18);
  }

  .billing-section :global([data-billing-recovery-error]) {
    display: block;
    margin-block-start: 0.25rem;
    color: var(--ja-danger, #a40f18);
    font-size: 0.82rem;
    font-weight: 700;
  }

  .billing-section :global([data-billing-recovery-invalid]) {
    border-color: var(--ja-danger, #a40f18);
  }

  .billing-section :global([data-billing-recovery-summary]) {
    display: grid;
    gap: 0.35rem;
    padding: 0.75rem;
    border: 1px solid var(--ja-danger, #a40f18);
    border-radius: 0.5rem;
    color: var(--ja-danger, #a40f18);
  }

  .billing-section__action-panel,
  .billing-section__close-sources {
    display: grid;
    gap: 0.65rem;
  }

  .billing-section__action-panel[open],
  .billing-section__close-sources[open] {
    padding: 0.85rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.65rem;
    background: var(--portal-wash, #f9f9f8);
  }

  .billing-section__action-panel p,
  .billing-section__close-sources p {
    margin: 0;
    color: var(--portal-muted, #67675f);
    font-size: 0.82rem;
    max-width: 48rem;
  }

  .billing-section__reversal-table {
    overflow-x: auto;
  }

  .billing-section__reversal-table table {
    width: 100%;
    border-collapse: collapse;
  }

  .billing-section__reversal-table th,
  .billing-section__reversal-table td {
    padding: 0.65rem;
    border-bottom: 1px solid var(--portal-border, #dfdedc);
    text-align: left;
    vertical-align: top;
  }

  .billing-section__reversal-table th {
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .billing-section__empty {
    display: grid;
    gap: 0.3rem;
    padding: 1.25rem 0.5rem;
    color: var(--portal-muted, #67675f);
    text-align: center;
  }

  .billing-section__invoice-wizard {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    min-width: 0;
    width: 100%;
  }

  .billing-section__invoice-wizard > * {
    min-width: 0;
    max-width: 100%;
  }

  .billing-section__invoice-wizard select {
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }

  .billing-section__wizard-mobile-progress {
    display: none;
  }

  .billing-section__wizard-progress {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .billing-section__wizard-progress button {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    padding: 0.55rem;
    border: 1px solid var(--portal-border, #dfdedc);
    background: var(--portal-wash, #f9f9f8);
    color: var(--portal-ink, #20201d);
    text-align: left;
  }

  .billing-section__wizard-progress li[aria-current='step'] button {
    border-color: var(--portal-accent, #53524c);
    background: color-mix(in srgb, var(--portal-accent, #53524c) 10%, white);
  }

  .billing-section__wizard-progress span {
    display: inline-grid;
    place-items: center;
    min-width: 1.45rem;
    min-height: 1.45rem;
    border-radius: 999px;
    background: var(--portal-ink, #20201d);
    color: white;
    font-size: 0.8125rem;
  }

  .billing-section__invoice-wizard section,
  .billing-section__invoice-wizard dl {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.75rem;
    min-width: 0;
  }

  .billing-section__invoice-wizard section > * {
    min-width: 0;
  }

  .billing-section__invoice-wizard section > h3,
  .billing-section__invoice-wizard section > p,
  .billing-section__invoice-wizard dl,
  .billing-section__invoice-wizard dd {
    margin: 0;
  }

  .billing-section__invoice-wizard dl > div {
    display: grid;
    grid-template-columns: minmax(8rem, 0.4fr) 1fr;
    gap: 0.6rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--portal-border, #dfdedc);
  }

  .billing-section__invoice-wizard dt {
    color: var(--portal-muted, #67675f);
  }

  .billing-section__wizard-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .billing-section__wizard-actions {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--portal-border, #dfdedc);
  }

  .billing-section__automation-blocker {
    color: var(--portal-danger, #9f2430);
  }

  .billing-section__effective-note {
    max-width: 48rem;
    margin: 0;
    color: var(--portal-muted, #67675f);
  }

  .billing-section button:focus-visible,
  .billing-section a:focus-visible,
  .billing-section input:focus-visible,
  .billing-section select:focus-visible,
  .billing-section textarea:focus-visible,
  .billing-section summary:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--portal-accent, #53524c) 32%, transparent);
    outline-offset: 2px;
  }

  @media (max-width: 52rem) {
    .billing-section__filters {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .billing-section__filters label:first-child,
    .billing-section__filters button {
      grid-column: 1 / -1;
    }

    .billing-section__config-form,
    .billing-section__config-compact-grid {
      grid-template-columns: 1fr 1fr;
    }

    .billing-section__invoice-dates {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .billing-section__rule-list .billing-section__table,
    .billing-section__rule-list .billing-section__table tbody,
    .billing-section__rule-list .billing-section__table tr,
    .billing-section__rule-list .billing-section__table td {
      display: block;
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
    }

    .billing-section__rule-list .billing-section__table thead {
      display: none;
    }

    .billing-section__rule-list .billing-section__table tbody tr {
      margin-bottom: 0.75rem;
      padding: 0.5rem;
      border: 1px solid var(--portal-border, #dfdedc);
      border-radius: 0.65rem;
    }

    .billing-section__rule-list .billing-section__table td {
      padding: 0.35rem 0.5rem;
      border: 0;
    }

    .billing-section__rule-mobile-label {
      display: block;
      margin-bottom: 0.2rem;
      color: var(--portal-muted, #67675f);
      font-size: 0.8125rem;
      font-weight: 700;
    }

    .billing-section__issuer-table,
    .billing-section__issuer-table tbody,
    .billing-section__issuer-table tr,
    .billing-section__issuer-table td {
      display: block;
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
    }

    .billing-section__issuer-table thead {
      display: none;
    }

    .billing-section__issuer-table tbody tr {
      margin-bottom: 0.75rem;
      padding: 0.5rem;
      border: 1px solid var(--portal-border, #dfdedc);
      border-radius: 0.65rem;
    }

    .billing-section__issuer-table td {
      padding: 0.35rem 0.5rem;
      border: 0;
    }

    .billing-section__issuer-table th:last-child,
    .billing-section__issuer-table td:last-child {
      width: 100%;
    }

    .billing-section__issuer-mobile-label {
      display: block;
      color: var(--portal-muted, #67675f);
      font-size: 0.8125rem;
      font-weight: 700;
    }

    .billing-section__issuer-table td details,
    .billing-section__issuer-table td :global([data-ui='problem-notice']) {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
    }

    .billing-section__context,
    .billing-section__invoice-heading {
      align-items: flex-start;
      flex-direction: column;
    }

    .billing-section__workspace {
      display: grid;
      grid-template-columns: 1fr;
    }

    .billing-section__setup-actions {
      display: grid;
      grid-template-columns: 1fr;
    }

    .billing-section__setup-actions button {
      width: 100%;
    }

    .billing-section__workspace-tab {
      width: 100%;
    }

    .billing-section__summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .billing-section__filters,
    .billing-section__config-form,
    .billing-section__config-compact-grid,
    .billing-section__directories,
    .billing-section__invoice-dates,
    .billing-section__planning-fields,
    .billing-section__wizard-fields {
      grid-template-columns: 1fr;
    }

    .billing-section__wizard-progress {
      display: none;
    }
    .billing-section__wizard-mobile-progress {
      display: block;
      min-width: 0;
    }
    .billing-section__wizard-mobile-progress summary {
      padding: 0.65rem;
      border: 1px solid var(--portal-border, #dfdedc);
      border-radius: 0.45rem;
      font-weight: 700;
      cursor: pointer;
    }
    .billing-section__wizard-mobile-progress ol {
      display: grid;
      gap: 0.35rem;
      max-height: min(40vh, 20rem);
      overflow-y: auto;
      margin: 0.4rem 0 0;
      padding: 0;
      list-style: none;
    }
    .billing-section__wizard-mobile-progress button {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      min-height: 2.75rem;
      padding: 0.55rem;
      border: 1px solid var(--portal-border, #dfdedc);
      background: var(--portal-wash, #f9f9f8);
      color: var(--portal-ink, #20201d);
      text-align: left;
    }
    .billing-section__wizard-mobile-progress li[aria-current='step'] button {
      border-color: var(--portal-accent, #53524c);
      font-weight: 700;
    }

    .billing-section__filters label:first-child,
    .billing-section__filters button,
    .billing-section__config-form h4,
    .billing-section__config-form > button {
      grid-column: auto;
    }

    .billing-section__config > summary,
    .billing-section__invoice-toolbar > a,
    .billing-section__invoice-actions > form,
    .billing-section__invoice-actions > form > button,
    .billing-section__invoice-actions > form > label,
    .billing-section__primary-form,
    .billing-section__rule-editor,
    .billing-section__rule-editor > summary {
      width: 100%;
    }

    .billing-section__config > summary {
      width: calc(100% - 1.8rem);
    }

    .billing-section__rule-actions,
    .billing-section__inline-form,
    .billing-section__period-form,
    .billing-section__payment-form,
    .billing-section__invoice-actions > form {
      display: grid;
      min-width: 0;
      width: 100%;
    }

    .billing-section__invoice-actions > form > label,
    .billing-section__inline-form > label,
    .billing-section__period-form > label,
    .billing-section__payment-form > label {
      min-width: 0;
      width: 100%;
    }

    .billing-section__issue-blocker,
    .billing-section__row-blocker {
      flex-direction: column;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .billing-section * {
      scroll-behavior: auto;
    }
  }
</style>
