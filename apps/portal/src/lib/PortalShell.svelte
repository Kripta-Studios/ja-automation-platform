<script lang="ts">
  import ProjectCreationAssignments from '$lib/portal/sections/ProjectCreationAssignments.svelte';
  import DirectionIcon from '$lib/portal/ui/DirectionIcon.svelte';
  import {
    assignmentDirectoryView,
    assignmentFormAction,
    assignmentReviewHref,
    assignmentRetainedValue,
    assignmentWorkflowHref,
    projectWorkflowFrom,
  } from './portal/assignment-form-action';
  import ActualPdfPreview from '$lib/portal/ui/ActualPdfPreview.svelte';
  import PrintIcon from '$lib/portal/ui/PrintIcon.svelte';
  import ProblemNotice from '$lib/portal/ui/ProblemNotice.svelte';
  import {
    documentDownloadFallback,
    documentDownloadProblem,
    privateDownloadFilename,
  } from '$lib/portal/ui/private-document-download';
  import {
    verifiedWorkerStatementFile,
    workerStatementDownloadFallback,
    workerStatementDownloadProblem,
  } from '$lib/portal/ui/worker-statement-download';
  import type { ProblemData } from '$lib/problem/contract';
  import {
    mfaEnrollmentCopy,
    mfaProblemFromResponse,
    mfaProblemIsService,
    mfaUncertainProblem,
  } from '../routes/app/mfa-enrollment/mfa-enrollment-copy';
  import { beforeNavigate, goto, replaceState } from '$app/navigation';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { page as projectWorkflowPage } from '$app/state';
  import { createAuthClient } from 'better-auth/client';
  import { passkeyClient } from '@better-auth/passkey/client';
  import { disclosure } from './portal/ui/disclosure.js';
  import RecordBrowser from './portal/ui/RecordBrowser.svelte';
  import PlanningCalendar from './portal/ui/PlanningCalendar.svelte';
  import AvailabilityCalendar from './portal/sections/AvailabilityCalendar.svelte';
  import { onMount, tick, untrack } from 'svelte';
  import {
    persistStandaloneLocale,
    resolveStandaloneLocale,
  } from '../routes/app/standalone-locale';
  import { SvelteMap } from 'svelte/reactivity';
  import {
    documentLanguage,
    normalizePortalLocale,
    portalText,
    translatePortalDom,
    type PortalLocale,
  } from './portal-i18n';
  import {
    activeNavItem,
    financeProjectNavigationHref,
    mobilePrimaryNavigationFor,
    portalNavigationForRole,
    portalTitleFor,
    type NavItem,
  } from './portal-navigation';
  import PortalChrome from './PortalChrome.svelte';
  import {
    FormSection,
    SectionCard,
    FieldGroup,
    Field,
    TableRegion,
    ToastRegion,
    formValidation,
    reportFormFieldErrors,
  } from './portal/ui';
  import type { ToastItem } from './portal/ui';
  import TodaySection from './portal/sections/TodaySection.svelte';
  import NotificationSection from './portal/sections/NotificationSection.svelte';
  import TimeSection from './portal/sections/TimeSection.svelte';
  import ExpenseSection from './portal/sections/ExpenseSection.svelte';
  import ReportSection from './portal/sections/ReportSection.svelte';
  import ProjectSection, {
    type ProjectLifecycleAction,
  } from './portal/sections/ProjectSection.svelte';
  import ExpertiseWorkerSelect from './portal/sections/ExpertiseWorkerSelect.svelte';
  import ProjectBudgetInput from './portal/sections/ProjectBudgetInput.svelte';
  import ProjectSetupNextSteps from './portal/sections/ProjectSetupNextSteps.svelte';
  import ApprovalSection from './portal/sections/ApprovalSection.svelte';
  import BillingSection from './portal/sections/BillingSection.svelte';
  import FinanceOverviewSection from './portal/sections/FinanceOverviewSection.svelte';
  import CollectionsLedgerSection from './portal/sections/CollectionsLedgerSection.svelte';
  import AccountingSection from './portal/sections/AccountingSection.svelte';
  import ClientDirectorySection from './portal/sections/ClientDirectorySection.svelte';
  import TeamDirectorySection, {
    type MailboxDirectoryStatus,
    type MailboxRow,
  } from './portal/sections/TeamDirectorySection.svelte';
  import { createOfflineController, offlineReviewReasonMessage } from './portal/offline-controller';
  import type {
    PortalActionResult as ActionResult,
    PortalData,
    PortalRow as Row,
  } from './portal/portal-data';
  import {
    compact,
    decimalToMinor,
    formBoolean,
    formNumber,
    formValue,
    hours,
    initials,
  } from './portal/portal-format';
  import { configureOfflineIdentity, queueMutation, type OfflineAttachment } from './offline';
  import { paymentMoney } from './portal/payment-money';
  import {
    hasControlledValue,
    translateControlledValue,
    type ControlledValueDomain,
  } from './i18n/controlled-values';

  let { data, form }: { data: PortalData; form?: ActionResult } = $props();
  const payPeriodProblem = $derived(data.payPeriodProblem ?? null);

  function missingCompensationRuleProblem(count: number): ProblemData {
    return {
      code: 'WORKER_PAY_MISSING_COMPENSATION_RULE',
      messageKey:
        count === 1
          ? 'problem.warning.workerPayMissingCompensationRuleOne'
          : 'problem.warning.workerPayMissingCompensationRuleMany',
      message:
        count === 1
          ? '1 time record is excluded from your compensation estimate because no applicable rule exists or its currency does not match the project.'
          : `${count} time records are excluded from your compensation estimate because no applicable rules exist or their currencies do not match the projects.`,
      params: { count },
      fieldErrors: {},
      remedies: [{ id: 'contact_finance_owner' }],
      correlationId: '',
    };
  }

  type MailboxPortalUser = PortalData['user'] & {
    canonicalOwner?: boolean;
    isCanonicalOwner?: boolean;
    isOwner?: boolean;
    owner?: { canonical?: boolean; isCanonical?: boolean };
  };
  type MailboxPortalData = PortalData & {
    mailboxes?: MailboxRow[] | null;
    mailboxDirectoryStatus?: MailboxDirectoryStatus;
    mailboxDirectoryError?: string | null;
    canManageMail?: boolean;
    canonicalOwner?: boolean;
    isCanonicalOwner?: boolean;
    owner?: { canonical?: boolean; isCanonical?: boolean; canManageMail?: boolean };
  };
  const mailboxData = $derived(data as MailboxPortalData);
  const canonicalOwner = $derived.by(() => {
    const user = mailboxData.user as MailboxPortalUser;
    const owner = mailboxData.owner;
    return Boolean(
      mailboxData.canonicalOwner ||
      mailboxData.isCanonicalOwner ||
      owner?.canonical ||
      owner?.isCanonical ||
      user.canonicalOwner ||
      user.isCanonicalOwner ||
      user.isOwner ||
      user.owner?.canonical ||
      user.owner?.isCanonical,
    );
  });
  const canManageMail = $derived(
    Boolean(
      mailboxData.canManageMail ||
      mailboxData.owner?.canManageMail ||
      (mailboxData.user.role === 'owner_admin' && canonicalOwner),
    ),
  );
  const canManageTeamDirectory = $derived(
    mailboxData.user.role === 'owner_admin' && canonicalOwner,
  );
  let online = $state(true);
  let queue = $state(0);
  let syncMessage = $state('');
  let assignmentCacheMessage = $state('');
  let conflictItems = $state<
    Array<{
      mutationId: string;
      entityType: string;
      createdAt: string;
      state?: 'queued' | 'conflict' | 'rejected' | 'needs_review';
      reviewReason?: 'session' | 'service' | 'uncertain' | 'local';
    }>
  >([]);
  let menuOpen = $state(false);
  let searchOpen = $state(false);
  let searchInput = $state<HTMLInputElement | null>(null);
  let searchValue = $derived(data.searchQuery ?? '');
  let offlineProjects = $state<Row[]>([]);
  let locale = $state<PortalLocale>(untrack(() => normalizePortalLocale(data.locale)));
  let securityMessage = $state('');
  let securitySucceeded = $state(false);
  let mfaProblem = $state<ProblemData | null>(null);
  let mfaBusy = $state(false);
  let mfaEnrolled = $derived(Boolean(data.user.mfaEnrolled));
  const mfaNeedsReview = $derived(Boolean(mfaProblem && mfaProblemIsService(mfaProblem)));
  const mfaCopy = $derived(mfaEnrollmentCopy[locale]);
  const mfaRemedyLinks = $derived({
    sign_in_again: { label: mfaCopy.signInAgain, href: `${base}/app/login` },
    review_mfa_settings: {
      label: mfaCopy.reviewMfaSettings,
      href: `${base}/app/profile?lang=${locale}#account-mfa`,
    },
    review_mfa_code: { label: mfaCopy.reviewMfaCode, href: '#profile-mfa-code' },
    contact_owner: { label: mfaCopy.contactOwner },
  });
  type WorkerStatementFormat = 'pdf' | 'csv';
  type WorkerStatementStatus = 'queued' | 'running' | 'ready' | 'failed';
  type WorkerStatementArtifact = {
    artifactId: string;
    format: WorkerStatementFormat;
    status: WorkerStatementStatus;
    errorCode?: string | null;
    retryable?: boolean | null;
    currentAttemptNumber?: number;
    maxAttempts?: number;
    locale: PortalLocale;
  };
  type WorkerStatementRequest = {
    periodStart: string;
    periodEnd: string;
    locale: PortalLocale;
    refresh: boolean;
    requestKey: string;
    requestIssuedAt: string;
  };
  let workerStatementArtifacts = $state<WorkerStatementArtifact[]>([]);
  let workerStatementPreviewId = $state<string | null>(null);
  let workerStatementBusy = $state(false);
  let workerStatementPolling = $state(false);
  let workerStatementProblem = $state<ProblemData | null>(null);
  let workerStatementDownloadFailure = $state(false);
  let workerStatementDownloadFailedFormat = $state<WorkerStatementFormat | null>(null);
  let workerStatementDownloadFailedArtifactId = $state<string | null>(null);
  let workerStatementStatusUnknownIds = $state<string[]>([]);
  let workerStatementDownloadBusy = $state(false);
  let workerStatementDownloadController: AbortController | null = null;
  let workerStatementNoticeId = $state('');
  let pendingWorkerStatementRequest = $state<WorkerStatementRequest | null>(null);
  let workerStatementRequestChecked = $state(false);
  const workerStatementPeriodHref = $derived(
    `${base}/app/pay?start=${encodeURIComponent(data.periodStart ?? '')}&end=${encodeURIComponent(data.periodEnd ?? '')}&lang=${encodeURIComponent(locale)}`,
  );
  let dismissedToastIds = $state<string[]>([]);
  type ProjectWorkflow =
    | 'new-client'
    | 'update-client'
    | 'new-project'
    | 'assign-worker'
    | 'update-assignment'
    | 'remove-assignment';
  // Explicit current navigation wins over a retained previous native result;
  // the failed form's values remain available independently.
  let projectWorkflow = $derived<ProjectWorkflow | null>(
    projectWorkflowFrom(
      projectWorkflowPage.url,
      (form as { actionName?: string } | undefined)?.actionName,
    ),
  );
  const projectDirectoryView = $derived(
    assignmentDirectoryView(projectWorkflowPage.url, projectWorkflow),
  );
  async function rememberProjectWorkflow(
    workflow: ProjectWorkflow | null,
    hash = '',
  ): Promise<void> {
    const url = new URL(location.href);
    if (workflow) url.searchParams.set('action', workflow);
    else {
      url.searchParams.delete('action');
      // All projects / Assignment history explicitly leave the directory view.
      url.searchParams.delete('view');
    }
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith('/')) url.searchParams.delete(key);
    }
    if (workflow !== 'update-assignment' && workflow !== 'remove-assignment') {
      url.searchParams.delete('project');
      url.searchParams.delete('worker');
    }
    url.hash =
      hash ||
      (workflow === 'update-assignment' || workflow === 'remove-assignment'
        ? 'project-assignment-list'
        : '');
    // These query parameters select loaded views, not shallow page state.
    await goto(url, { replaceState: true, noScroll: true, keepFocus: true });
  }
  async function focusProjectDestination(selector: string): Promise<void> {
    await tick();
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) return;
    target.scrollIntoView({ block: 'start' });
    target.focus({ preventScroll: true });
  }
  async function openProjectWorkflow(workflow: ProjectWorkflow): Promise<void> {
    projectWorkflow = workflow;
    if (workflow === 'new-project') {
      newProjectClientId = '';
      newProjectCurrencyOverride = null;
      newProjectTimezoneOverride = null;
    }
    await rememberProjectWorkflow(workflow);
    await focusProjectDestination(`[data-project-workflow="${workflow}"]`);
  }
  async function showProjectList(): Promise<void> {
    projectWorkflow = null;
    await rememberProjectWorkflow(null);
    await tick();
    const target = document.getElementById('project-register');
    const disclosure = target?.querySelector('details');
    if (disclosure) disclosure.open = true;
    target?.scrollIntoView({ block: 'start' });
    target?.focus({ preventScroll: true });
  }
  async function showAssignmentHistory(event: MouseEvent): Promise<void> {
    event.preventDefault();
    projectWorkflow = null;
    await rememberProjectWorkflow(null, 'assignment-history');
    await tick();
    const target = document.getElementById('assignment-history');
    const disclosure = target?.querySelector('details');
    if (disclosure) disclosure.open = true;
    target?.scrollIntoView({ block: 'start' });
    target?.focus({ preventScroll: true });
  }
  let projectRegisterPage = $state<Row[]>([]);
  let documentPage = $state<Row[]>([]);
  let documentTransferBusy = $state(false);
  let documentTransferFailure = $state<{
    id: string;
    mode: 'view' | 'download';
    problem: ProblemData;
  } | null>(null);
  let planningPage = $state<Row[]>([]);
  const focusedPlanningRecord = $derived(
    data.section === 'planning' && $page.url.searchParams.get('focus')
      ? (data.records ?? []).find(
          (row: Row) => String(row.id) === $page.url.searchParams.get('focus'),
        )
      : undefined,
  );
  function planningRecordHref(row: Row): string {
    const project = encodeURIComponent(String(row.project_id ?? ''));
    const id = encodeURIComponent(String(row.id ?? ''));
    const date = encodeURIComponent(String(row.starts_at ?? '').slice(0, 10));
    if (data.user.role === 'owner_admin')
      return `${base}/app/manage?area=planning_assignment&project=${project}&focus=${id}`;
    if (data.user.role === 'project_manager')
      return `${base}/app/planning?project=${project}&date=${date}&focus=${id}#planning-assignment-${id}`;
    return `${base}/app/planning?project=${project}&date=${date}&focus=${id}#planning-shift-detail`;
  }
  let assignmentPage = $state<Row[]>([]);
  let passkeyName = $state('');
  let mfaCode = $state('');
  let mfaSetupUri = $state('');
  let mfaBackupCodes = $state<string[]>([]);
  let passkeys = $state<Array<{ id: string; name?: string | null; createdAt?: Date | string }>>([]);
  let stopOfflineController: (() => void) | null = null;
  const authClient = createAuthClient({
    basePath: `${base}/app/api/auth`,
    plugins: [passkeyClient()],
  });
  const translate = (value: string): string => {
    switch (value) {
      case 'Password verification failed.':
        return portalText(locale, 'Password verification failed.');
      case 'Passkey registration was not completed.':
        return portalText(locale, 'Passkey registration was not completed.');
      case 'Passkey registered for this account.':
        return portalText(locale, 'Passkey registered for this account.');
      case 'Passkey could not be revoked.':
        return portalText(locale, 'Passkey could not be revoked.');
      case 'Passkey revoked.':
        return portalText(locale, 'Passkey revoked.');
      case 'MFA enabled.':
        return portalText(locale, 'MFA enabled.');
      case 'MFA disabled.':
        return portalText(locale, 'MFA disabled.');
      case 'MFA setup started.':
        return portalText(locale, 'MFA setup started.');
      case 'MFA could not be updated.':
        return portalText(locale, 'MFA could not be updated.');
      case 'Select a project before saving an offline draft.':
        return portalText(locale, 'Select a project before saving an offline draft.');
      case 'Offline — saved on this device':
        return portalText(locale, 'Offline — saved on this device');
      case 'Offline draft could not be saved on this device.':
        return portalText(locale, 'Offline draft could not be saved on this device.');
      default:
        return portalText(locale, value);
    }
  };
  const controlledValue = (domain: ControlledValueDomain, value: unknown): string => {
    const raw = value == null ? '' : String(value);
    if (!raw) return '';
    const normalized = raw.trim().toLowerCase().replace(/\s+/g, '_');
    const canonicalRole =
      domain === 'role'
        ? ({
            owner_admin: 'owner',
            finance_admin: 'finance',
            project_manager: 'manager',
            auditor_read_only: 'auditor_read_only',
          }[normalized] ?? normalized)
        : normalized;
    const key = hasControlledValue(domain, raw)
      ? raw
      : hasControlledValue(domain, canonicalRole)
        ? canonicalRole
        : null;
    return key ? translateControlledValue(locale, domain, key) : translate(raw);
  };

  type ActionResultWithMessageKey = ActionResult & {
    messageKey?: unknown;
    messageParams?: unknown;
  };
  type SearchGroupKey = 'projects' | 'invoices' | 'specialists' | 'clients' | 'other';
  type SearchGroup = { key: SearchGroupKey; label: string; rows: Row[] };
  function actionMessage(result: ActionResult | undefined): string {
    if (!result) return '';
    const localized = result as ActionResultWithMessageKey;
    const messageKey = localized.messageKey;
    if (typeof messageKey === 'string' && messageKey.trim()) {
      const rawParams = localized.messageParams;
      const params: Record<string, string | number> | undefined =
        rawParams && typeof rawParams === 'object'
          ? (Object.fromEntries(
              Object.entries(rawParams as Record<string, unknown>).filter(
                ([, value]) => typeof value === 'string' || typeof value === 'number',
              ),
            ) as Record<string, string | number>)
          : undefined;
      return portalText(locale, messageKey, params);
    }
    return typeof localized.message === 'string' ? localized.message : '';
  }

  const roleNavigation = $derived(
    portalNavigationForRole(base, data.user.role, data.user.workforceProfile),
  );
  const canUseGlobalSearch = $derived(
    !['external_technician', 'supplier_coordinator'].includes(data.user.workforceProfile ?? ''),
  );
  const navigation: readonly NavItem[] = $derived(roleNavigation.primary);
  const mobileNavigation: readonly NavItem[] = $derived(mobilePrimaryNavigationFor(roleNavigation));
  const secondaryNavigation: readonly NavItem[] = $derived(roleNavigation.secondary);
  const visibleAdmin: readonly NavItem[] = $derived(roleNavigation.admin);
  const securityAdmin: readonly NavItem[] = $derived(roleNavigation.security);
  const currentView = $derived(projectWorkflowPage.url.searchParams.get('view') ?? '');
  const currentTitle = $derived(portalTitleFor(data.section, currentView));
  const actionFeedback = $derived(actionMessage(form));
  const documentResult = $derived.by(() => {
    const result = form as
      | (ProblemData & {
          success?: boolean;
          actionName?: string;
          values?: Record<string, unknown>;
        })
      | null
      | undefined;
    return data.section === 'documents' &&
      result?.success === false &&
      ['uploadPrivateDocument', 'archiveDocument'].includes(result.actionName ?? '') &&
      result.code &&
      result.messageKey
      ? result
      : null;
  });
  const documentProblem = $derived(documentResult as ProblemData | null);
  const documentFormValues = $derived.by((): Record<string, string> => {
    const values = documentResult?.values;
    return values && typeof values === 'object'
      ? Object.fromEntries(
          Object.entries(values).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : {};
  });
  const documentPreviewTypes = new Set([
    'application/pdf',
    'application/zip',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'text/plain',
  ]);

  async function showDocumentTransferFailure(
    id: string,
    mode: 'view' | 'download',
    problem: ProblemData,
  ): Promise<void> {
    documentTransferFailure = { id, mode, problem };
    await tick();
    if (documentTransferFailure?.id !== id) return;
    const notice = document
      .getElementById('document-download-problem')
      ?.querySelector<HTMLElement>('[data-ui="problem-notice"]');
    notice?.focus({ preventScroll: true });
    const bounds = notice?.getBoundingClientRect();
    if (!bounds) return;
    const header = document.querySelector<HTMLElement>('.portal-layout > header');
    const headerPosition = header ? window.getComputedStyle(header).position : '';
    const safeTop =
      (header && (headerPosition === 'sticky' || headerPosition === 'fixed')
        ? Math.max(0, header.getBoundingClientRect().bottom)
        : 0) + 16;
    const mobileNavigation = document.querySelector<HTMLElement>('.bottom-nav');
    const navigationTop =
      mobileNavigation && window.getComputedStyle(mobileNavigation).position === 'fixed'
        ? mobileNavigation.getBoundingClientRect().top
        : window.innerHeight;
    const safeBottom = Math.min(window.innerHeight, navigationTop) - 16;
    const scrollDelta =
      bounds.height > safeBottom - safeTop || bounds.top < safeTop
        ? bounds.top - safeTop
        : bounds.bottom > safeBottom
          ? bounds.bottom - safeBottom
          : 0;
    if (scrollDelta) window.scrollBy({ top: scrollDelta, behavior: 'instant' });
  }

  async function transferPrivateDocument(
    event: MouseEvent,
    record: Row,
    mode: 'view' | 'download',
  ): Promise<void> {
    event.preventDefault();
    if (documentTransferBusy) return;
    const id = String(record.id);
    const href = `${base}/app/api/documents/${encodeURIComponent(id)}${mode === 'view' ? '?view=1' : ''}`;
    documentTransferBusy = true;
    documentTransferFailure = null;
    // Reserve the preview tab in the trusted click. Browsers may block a new tab
    // opened only after the asynchronous authorization and integrity checks.
    let preview: Window | null = null;
    if (mode === 'view') {
      try {
        preview = window.open('about:blank', '_blank');
      } catch {
        // Treat a browser policy that throws like a blocked popup.
      }
    }
    if (preview) preview.opener = null;
    if (mode === 'view' && !preview) {
      await showDocumentTransferFailure(id, 'download', documentDownloadFallback('popup'));
      documentTransferBusy = false;
      return;
    }
    try {
      const response = await fetch(href, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          accept:
            'application/json, application/octet-stream, application/pdf, image/*, text/plain',
        },
      });
      const reference = response.headers.get('x-correlation-id') ?? '';
      if (response.redirected) {
        const destination = new URL(response.url);
        preview?.close();
        await showDocumentTransferFailure(
          id,
          mode,
          destination.origin === location.origin && destination.pathname.endsWith('/app/login')
            ? documentDownloadFallback('signIn', reference)
            : documentDownloadFallback('invalid', reference),
        );
        return;
      }
      if (!response.ok) {
        const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
        const payload = contentType.includes('application/json')
          ? await response.json().catch(() => null)
          : null;
        preview?.close();
        await showDocumentTransferFailure(
          id,
          mode,
          documentDownloadProblem(payload, reference) ??
            documentDownloadFallback(response.status === 401 ? 'signIn' : 'invalid', reference),
        );
        return;
      }
      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      const disposition = response.headers.get('content-disposition');
      const expectedDisposition = mode === 'view' ? 'inline' : 'attachment';
      if (
        !contentType ||
        !documentPreviewTypes.has(contentType) ||
        !disposition?.toLowerCase().startsWith(expectedDisposition)
      ) {
        preview?.close();
        await showDocumentTransferFailure(id, mode, documentDownloadFallback('invalid', reference));
        return;
      }
      const file = await response.blob();
      if (file.size === 0) {
        preview?.close();
        await showDocumentTransferFailure(id, mode, documentDownloadFallback('invalid', reference));
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      if (mode === 'view' && preview) {
        preview.location.replace(objectUrl);
      } else {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.rel = 'noopener noreferrer';
        if (mode === 'view') link.target = '_blank';
        else
          link.download = privateDownloadFilename(
            disposition,
            record.safe_filename ?? record.original_filename,
          );
        link.hidden = true;
        document.body.append(link);
        link.click();
        link.remove();
      }
    } catch {
      preview?.close();
      await showDocumentTransferFailure(id, mode, documentDownloadFallback('network'));
    } finally {
      documentTransferBusy = false;
    }
  }
  let documentScrollIntent = false;
  let restoredDocumentScrollId = '';
  onMount(() => {
    if (data.section !== 'documents') return;
    const markIntent = () => {
      documentScrollIntent = true;
    };
    const markKeyIntent = (event: KeyboardEvent) => {
      if (
        ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ', 'Tab'].includes(
          event.key,
        )
      )
        markIntent();
    };
    window.addEventListener('wheel', markIntent, { passive: true });
    window.addEventListener('touchmove', markIntent, { passive: true });
    window.addEventListener('pointerdown', markIntent, { passive: true });
    window.addEventListener('keydown', markKeyIntent, true);
    return () => {
      window.removeEventListener('wheel', markIntent);
      window.removeEventListener('touchmove', markIntent);
      window.removeEventListener('pointerdown', markIntent);
      window.removeEventListener('keydown', markKeyIntent, true);
    };
  });
  function rememberDocumentScroll(form: HTMLFormElement) {
    const input = form.elements.namedItem('viewportScrollY') as HTMLInputElement | null;
    const capture = () => {
      if (input) input.value = String(Math.max(0, Math.round(window.scrollY)));
    };
    const onSubmit = () => {
      documentScrollIntent = false;
      capture();
    };
    const onFormData = (event: FormDataEvent) => {
      documentScrollIntent = false;
      const viewport = String(Math.max(0, Math.round(window.scrollY)));
      if (input) input.value = viewport;
      event.formData.set('viewportScrollY', viewport);
    };
    form.addEventListener('submit', onSubmit, true);
    form.addEventListener('formdata', onFormData);
    return {
      destroy() {
        form.removeEventListener('submit', onSubmit, true);
        form.removeEventListener('formdata', onFormData);
      },
    };
  }
  $effect(() => {
    const id = documentProblem?.correlationId;
    if (!id || id === restoredDocumentScrollId) return;
    if (!/^\d{1,7}$/.test(documentFormValues.viewportScrollY ?? '')) return;
    const viewport = Number(documentFormValues.viewportScrollY);
    if (!Number.isSafeInteger(viewport) || viewport < 0) return;
    restoredDocumentScrollId = id;
    let active = true;
    let observer: ResizeObserver | undefined;
    const timers: number[] = [];
    const restore = () => {
      if (!active || documentProblem?.correlationId !== id || documentScrollIntent) return;
      window.scrollTo({ top: viewport, behavior: 'instant' });
      if (documentResult?.actionName !== 'uploadPrivateDocument') return;
      const focusedProblem =
        documentUploadForm?.querySelector<HTMLElement>('[data-validation-summary]') ??
        documentUploadForm?.querySelector<HTMLElement>('[data-ui="problem-notice"]');
      if (!focusedProblem) return;
      const header = document.querySelector<HTMLElement>('.portal-layout > header');
      const headerPosition = header ? window.getComputedStyle(header).position : '';
      const headerBottom =
        header && (headerPosition === 'sticky' || headerPosition === 'fixed')
          ? header.getBoundingClientRect().bottom
          : 0;
      const safeTop = Math.max(0, headerBottom) + 16;
      const problemTop = focusedProblem.getBoundingClientRect().top;
      if (problemTop < safeTop)
        window.scrollTo({
          top: Math.max(0, window.scrollY - (safeTop - problemTop)),
          behavior: 'instant',
        });
    };
    void tick().then(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!active) return;
          restore();
          observer = new ResizeObserver(() => requestAnimationFrame(restore));
          observer.observe(document.body);
          for (const delay of [180, 450, 900]) timers.push(window.setTimeout(restore, delay));
          timers.push(window.setTimeout(() => observer?.disconnect(), 1_500));
        }),
      ),
    );
    return () => {
      active = false;
      observer?.disconnect();
      for (const timer of timers) window.clearTimeout(timer);
    };
  });
  let documentUploadForm: HTMLFormElement | undefined = $state();
  let focusedDocumentProblemId = '';
  $effect(() => {
    const id = documentProblem?.correlationId;
    if (!id || id === focusedDocumentProblemId) return;
    focusedDocumentProblemId = id;
    void tick().then(() => {
      if (documentResult?.actionName === 'uploadPrivateDocument' && documentUploadForm) {
        reportFormFieldErrors(documentUploadForm, documentProblem.fieldErrors);
        (
          documentUploadForm.querySelector<HTMLElement>('[data-validation-summary]') ??
          documentUploadForm.querySelector<HTMLElement>('[data-ui="problem-notice"]')
        )?.focus({ preventScroll: true });
      } else if (documentResult?.actionName === 'archiveDocument') {
        const forms = document.querySelectorAll<HTMLFormElement>(
          'form[action="?/archiveDocument"]',
        );
        const selected = Array.from(forms).find(
          (candidate) =>
            candidate.elements.namedItem('documentId') instanceof HTMLInputElement &&
            (candidate.elements.namedItem('documentId') as HTMLInputElement).value ===
              documentFormValues.documentId,
        );
        if (selected) {
          reportFormFieldErrors(selected, documentProblem.fieldErrors);
          (
            selected.querySelector<HTMLElement>('[data-validation-summary]') ??
            selected.querySelector<HTMLElement>('[data-ui="problem-notice"]')
          )?.focus({ preventScroll: true });
        }
      }
    });
  });
  const globalProblem = $derived.by(() => {
    const result = form as
      | (ProblemData & {
          success?: boolean;
          actionName?: string;
          operation?: string;
          values?: Record<string, unknown>;
        })
      | null
      | undefined;
    const values = result?.values;
    const hasValue = (key: string) => typeof values?.[key] === 'string' && !!values[key];
    const handledInSection =
      (data.section === 'time' &&
        ((hasValue('projectId') && hasValue('workDate')) ||
          hasValue('weekStart') ||
          hasValue('entries'))) ||
      (data.section === 'reports' &&
        hasValue('projectId') &&
        (hasValue('workDate') || hasValue('reportDate') || hasValue('periodStart'))) ||
      (data.section === 'expenses' &&
        (hasValue('spentOn') ||
          hasValue('projectId') ||
          hasValue('amount') ||
          result?.messageKey === 'action.validation.expenseFields')) ||
      (data.section === 'projects' && result?.actionName === 'createClient') ||
      (data.section === 'documents' &&
        ['uploadPrivateDocument', 'archiveDocument'].includes(result?.actionName ?? '')) ||
      (data.section === 'notifications' && result?.actionName === 'markNotificationRead') ||
      data.section === 'billing' ||
      (data.section === 'projects' &&
        ['updateAssignment', 'removeAssignment', 'deleteAssignment'].includes(
          result?.actionName ?? '',
        )) ||
      (data.section === 'planning' &&
        [
          'createPlanning',
          'updatePlanning',
          'cancelPlanning',
          'createSkill',
          'updateSkill',
          'deleteSkill',
          'setWorkerSkill',
          'deleteWorkerSkill',
        ].includes(result?.operation ?? '')) ||
      (data.section === 'profile' &&
        ['setWorkerSkill', 'deleteWorkerSkill', 'setAvailability'].includes(
          result?.operation ?? '',
        ));
    return result &&
      result.success === false &&
      result.code &&
      !handledInSection &&
      result.actionName !== 'assignWorker' &&
      !(
        data.section === 'projects' &&
        currentView === 'team' &&
        result.code.startsWith('ACCESS_')
      ) &&
      !(
        data.section === 'approvals' &&
        /^(?:APPROVAL_|FINANCE_REVIEW_|EXPENSE_CLASSIFICATION_|FINANCE_ROLE_)/u.test(result.code)
      ) &&
      !(data.section === 'finance' && result.messageKey?.startsWith('problem.finance.'))
      ? result
      : null;
  });
  const globalRemedyLinks = $derived.by(() => {
    const sections = new Set(
      [...roleNavigation.primary, ...roleNavigation.secondary, ...roleNavigation.admin].map(
        (item) => item.section,
      ),
    );
    const canManageClients = data.user.role === 'owner_admin' || data.user.role === 'finance_admin';
    const projectAction = (form as { actionName?: string } | null)?.actionName ?? '';
    const isClientAction = /client/i.test(projectAction);
    const workforceWorkerId = (form as { values?: Record<string, unknown> } | null)?.values
      ?.workerId;
    const reviewedWorkerId =
      typeof workforceWorkerId === 'string' && workforceWorkerId
        ? workforceWorkerId
        : String(data.selectedWorkerId ?? data.user.id);
    return {
      ...(sections.has('time')
        ? {
            review_time: {
              label: translate('Review updated time entry'),
              href: `${base}/app/time#time-records`,
            },
          }
        : {}),
      ...(sections.has('expenses')
        ? {
            review_expense: {
              label: translate('Review updated expense'),
              href: `${base}/app/expenses#expense-records`,
            },
          }
        : {}),
      ...(sections.has('reports')
        ? {
            review_report: {
              label: translate('Review updated report'),
              href: `${base}/app/reports`,
            },
          }
        : {}),
      ...(sections.has('projects')
        ? {
            review_updated_record: {
              label: translate('Review updated record'),
              href:
                isClientAction && canManageClients
                  ? `${base}/app/projects?view=clients`
                  : `${base}/app/projects`,
            },
            review_assignments: {
              label: translate('Review assignments'),
              href: assignmentReviewHref(projectWorkflowPage.url, `${base}/app/projects`),
            },
            archive_project: {
              label:
                data.user.role === 'owner_admin'
                  ? translate('Archive project')
                  : translate('Contact an owner'),
              href: data.user.role === 'owner_admin' ? `${base}/app/projects` : undefined,
            },
            choose_available_manager: {
              label: translate('Choose an available manager'),
              href: `${base}/app/projects?action=new-project`,
            },
            review_selected_workers: {
              label: translate('Review selected workers'),
              href: `${base}/app/projects?action=new-project`,
            },
            review_project_dates: {
              label: translate('Review project dates'),
              href: `${base}/app/projects?action=new-project`,
            },
          }
        : {}),
      ...(canManageClients
        ? {
            review_client_projects: {
              label: translate('Review client projects'),
              href: `${base}/app/projects?view=clients`,
            },
            review_client_status: {
              label: translate('Review client status'),
              href: `${base}/app/projects?view=clients`,
            },
            review_client_currency: {
              label: translate('Review client currency'),
              href: `${base}/app/projects?view=clients`,
            },
            archive_client: {
              label: translate('Archive client'),
              href: `${base}/app/projects?view=clients`,
            },
            review_billing_contact: {
              label: translate('Review billing contact'),
              href:
                isClientAction && form?.success === false
                  ? undefined
                  : `${base}/app/projects?view=clients`,
            },
            add_billing_contact: {
              label: translate('Add billing contact'),
              href:
                isClientAction && form?.success === false
                  ? undefined
                  : `${base}/app/projects?view=clients`,
            },
          }
        : {}),
      ...(sections.has('planning')
        ? {
            review_planning: {
              label: translate('Review current planning'),
              href: `${base}/app/planning#planning-day-agenda`,
            },
            review_planning_fields: { label: translate('Review the planning fields') },
            review_worker_assignments: {
              label: translate('Review worker assignments'),
              href: `${base}/app/projects?action=update-assignment#project-assignment-list`,
            },
            review_projects: {
              label: translate('Review available projects'),
              href: `${base}/app/projects`,
            },
            review_project_status: {
              label:
                data.user.role === 'owner_admin'
                  ? translate('Review project status')
                  : translate('Contact the project owner'),
              href: data.user.role === 'owner_admin' ? `${base}/app/projects` : undefined,
            },
          }
        : {}),
      ...(['planning', 'profile'].some((section) => sections.has(section))
        ? {
            review_availability: {
              label: translate('Review updated availability'),
              href: `${base}/app/profile?worker=${encodeURIComponent(reviewedWorkerId)}#availability-calendar`,
            },
            review_availability_fields: { label: translate('Review availability dates') },
            review_skill_fields: { label: translate('Review expertise fields') },
            review_skills: {
              label: translate('Review current expertise'),
              href: `${base}/app/planning#planning-skills`,
            },
            review_worker_skills: {
              label: portalText(locale, 'problem.remedy.reviewWorkerSkills'),
              href: sections.has('planning')
                ? `${base}/app/planning#planning-skills`
                : `${base}/app/profile#profile-skills`,
            },
            review_workers: {
              label: translate('Review available workers'),
              href: `${base}/app/profile`,
            },
            review_own_skills: {
              label: translate('Review your expertise'),
              href: `${base}/app/profile#profile-skills`,
            },
            contact_project_owner: { label: translate('Contact the project owner') },
            sign_in_again: { label: translate('Sign in again'), href: `${base}/app/login` },
          }
        : {}),
      contact_owner: { label: translate('Contact an owner') },
      correct_fields: { label: portalText(locale, 'problem.remedy.correctFields') },
      review_documents: {
        label: portalText(locale, 'problem.remedy.reviewDocuments'),
        href: `${base}/app/documents#document-list`,
      },
      contact_document_owner: {
        label: portalText(locale, 'problem.remedy.contactDocumentOwner'),
      },
    };
  });
  const documentDownloadRemedyLinks = $derived({
    ...globalRemedyLinks,
    sign_in_again: { label: translate('Sign in again'), href: `${base}/app/login?lang=${locale}` },
  });
  const clientFormResult = $derived(
    (form as { actionName?: string } | undefined)?.actionName === 'createClient'
      ? (form as AssignmentFormResult & {
          success?: boolean;
          clientId?: string;
          clientNumber?: string;
        })
      : undefined,
  );
  const clientProblem = $derived(
    clientFormResult?.code && clientFormResult.messageKey && clientFormResult.correlationId
      ? (clientFormResult as ProblemData)
      : undefined,
  );
  let ownerClientForm: HTMLFormElement | undefined = $state();
  let focusedClientProblemId = '';
  $effect(() => {
    const id = clientProblem?.correlationId;
    if (!id || id === focusedClientProblemId) return;
    focusedClientProblemId = id;
    void tick().then(() => {
      if (ownerClientForm && clientProblem.fieldErrors)
        reportFormFieldErrors(ownerClientForm, clientProblem.fieldErrors);
      const panel = document.querySelector<HTMLElement>('[data-project-workflow="new-client"]');
      const target =
        panel?.querySelector<HTMLElement>('[data-validation-summary]') ??
        panel?.querySelector<HTMLElement>('[data-ui="problem-notice"]');
      target?.focus({ preventScroll: true });
      // A native form POST reload can restore the page at the top after focus moves.
      // Keep the focused explanation visible once that navigation has painted.
      if (target)
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (clientProblem?.correlationId !== id || document.activeElement !== target) return;
            const bounds = target.getBoundingClientRect();
            if (bounds.top < 16 || bounds.bottom > window.innerHeight - 16)
              target.scrollIntoView({ block: 'center', behavior: 'instant' });
          }),
        );
    });
  });
  const clientFieldErrors = $derived.by(() => {
    const result = form as
      | {
          actionName?: string;
          messageKey?: unknown;
          fields?: Record<string, string[] | undefined>;
          fieldErrors?: Record<string, string[] | undefined>;
        }
      | null
      | undefined;
    return (result?.actionName === 'createClient' ||
      result?.messageKey === 'action.validation.clientFields') &&
      (result.fieldErrors || result.fields)
      ? (result.fieldErrors ?? result.fields ?? {})
      : {};
  });
  const clientFormValues = $derived.by(() => {
    const result = form as
      | { actionName?: string; messageKey?: unknown; values?: Record<string, unknown> }
      | null
      | undefined;
    return (result?.actionName === 'createClient' ||
      result?.messageKey === 'action.validation.clientFields') &&
      result.values
      ? result.values
      : {};
  });
  const clientFormValue = (field: string, fallback = ''): string => {
    const value = clientFormValues[field];
    return typeof value === 'string' ? value : fallback;
  };
  function clientFieldLabel(field: string): string {
    const labels: Record<string, string> = {
      legalName: 'Legal name',
      displayName: 'Display name',
      clientCode: 'Client code (optional)',
      currency: 'Currency',
      timezone: 'Timezone',
      billingContactName: 'Billing contact name',
      billingEmail: 'Billing contact email',
      billingAddress: 'Billing address',
      paymentTermsDays: 'Payment terms (days)',
      poReference: 'PO / reference',
      notes: 'Notes',
    };
    return translate(labels[field] ?? field);
  }
  const projectFieldErrors = $derived.by(() => {
    const result = form as
      | {
          actionName?: string;
          messageKey?: unknown;
          fields?: Record<string, string[] | undefined>;
          fieldErrors?: Record<string, string[] | undefined>;
        }
      | null
      | undefined;
    if (result?.actionName === 'createProject') return result.fieldErrors ?? result.fields ?? {};
    return result?.messageKey === 'action.validation.projectFields' ? (result.fields ?? {}) : {};
  });
  const projectFormValues = $derived.by(() => {
    const result = form as
      | { actionName?: string; messageKey?: unknown; values?: Record<string, unknown> }
      | null
      | undefined;
    return (result?.actionName === 'createProject' ||
      result?.messageKey === 'action.validation.projectFields') &&
      result.values
      ? result.values
      : {};
  });
  const projectFormValue = (field: string, fallback = ''): string => {
    const value = projectFormValues[field];
    return typeof value === 'string' ? value : fallback;
  };
  const planningFailure = $derived.by(() => {
    const result = form as
      | {
          success?: boolean;
          operation?: string;
          values?: Record<string, unknown>;
          fields?: Record<string, string[]>;
          fieldErrors?: Record<string, string[]>;
          code?: string;
          correlationId?: string;
        }
      | null
      | undefined;
    return result?.success === false &&
      ['createPlanning', 'updatePlanning', 'cancelPlanning'].includes(result.operation ?? '')
      ? result
      : null;
  });
  const planningFailedUpdateId = $derived(
    planningFailure?.operation === 'updatePlanning' ? String(planningFailure.values?.id ?? '') : '',
  );
  const planningFailedRecordId = $derived(String(planningFailure?.values?.id ?? ''));
  const planningFailedRecordVisible = $derived(
    (data.records ?? []).some((row) => String(row.id) === planningFailedRecordId),
  );
  const planningProblem = $derived(
    planningFailure?.code && planningFailure.correlationId
      ? (planningFailure as unknown as ProblemData)
      : null,
  );
  const skillFailure = $derived.by(() => {
    const result = form as
      | {
          success?: boolean;
          operation?: string;
          values?: Record<string, unknown>;
          fields?: Record<string, string[]>;
          fieldErrors?: Record<string, string[]>;
          code?: string;
          correlationId?: string;
        }
      | null
      | undefined;
    return result?.success === false &&
      ['createSkill', 'updateSkill', 'deleteSkill', 'setWorkerSkill', 'deleteWorkerSkill'].includes(
        result.operation ?? '',
      )
      ? result
      : null;
  });
  const skillProblem = $derived(
    skillFailure?.code && skillFailure.correlationId
      ? (skillFailure as unknown as ProblemData)
      : null,
  );
  const skillValue = (operation: string, field: string, fallback = ''): string =>
    skillFailure?.operation === operation && skillFailure.values?.[field] != null
      ? String(skillFailure.values[field])
      : fallback;
  const skillChoiceId = (skill: Row): string => String(skill.skill_id ?? skill.id ?? '');
  const missingChoice = (
    value: string,
    choices: readonly Row[],
    identify: (choice: Row) => string = (choice) => String(choice.id ?? ''),
  ): boolean => Boolean(value && !choices.some((choice) => identify(choice) === value));
  const planningFieldMessage = (field: string, operation: string, id = ''): string =>
    planningFailure?.operation === operation &&
    (!id || String(planningFailure.values?.id ?? '') === id) &&
    !planningProblem &&
    planningFailure.fields?.[field]?.length
      ? translate(planningFailure.fields[field]?.[0] ?? '')
      : '';
  const planningUpdateValue = (field: string, id: string, fallback: unknown): string => {
    if (planningFailedUpdateId === id && planningFailure?.values?.[field] != null)
      return String(planningFailure.values[field]);
    return String(fallback ?? '');
  };
  let planningEditForms = $state<Record<string, Record<string, string>>>({});
  let planningEditorsExpanded = $state<Record<string, boolean>>({});
  const planningEditKey = (row: Row): string => `${String(row.id)}:${String(row.version)}`;
  const planningEditValue = (row: Row, field: string, fallback: unknown): string =>
    planningEditForms[planningEditKey(row)]?.[field] ??
    planningUpdateValue(field, String(row.id), fallback);
  const rememberPlanningEdit = (row: Row, form: HTMLFormElement): void => {
    planningEditorsExpanded[planningEditKey(row)] = true;
    planningEditForms[planningEditKey(row)] = Object.fromEntries(
      [...new FormData(form)].filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  };
  const planningWorkersForUpdate = (row: Row): Row[] => {
    const projectId = String(row.project_id);
    const startsOn = planningEditValue(row, 'startsAt', row.starts_at).slice(0, 10);
    const endsOn = planningEditValue(row, 'endsAt', row.ends_at).slice(0, 10) || startsOn;
    const eligible = (data.workers ?? []).filter(
      (worker) =>
        worker.status === 'active' &&
        (data.assignments ?? []).some(
          (assignment) =>
            String(assignment.project_id) === projectId &&
            String(assignment.worker_id ?? assignment.user_id) === String(worker.id) &&
            assignment.status === 'active' &&
            String(assignment.starts_on) <= startsOn &&
            (!assignment.ends_on || String(assignment.ends_on) >= endsOn),
        ),
    );
    // Keep the published worker visible if their membership has since expired or
    // the edited dates no longer fit it. The server validates any saved change.
    if (!eligible.some((worker) => String(worker.id) === String(row.worker_id)))
      return [
        { id: String(row.worker_id), name: String(row.worker_name ?? row.worker_id) },
        ...eligible,
      ];
    return eligible;
  };
  const createdProject = $derived.by(() => {
    const result = form as
      | { success?: boolean; messageKey?: string; messageParams?: Record<string, unknown> }
      | null
      | undefined;
    if (!result?.success || result.messageKey !== 'action.projects.projectCreated') return null;
    const projectId = result.messageParams?.projectId;
    const projectNumber = result.messageParams?.projectNumber;
    if (typeof projectId !== 'string' || !/^[0-9a-f-]{36}$/i.test(projectId)) return null;
    return {
      id: projectId,
      number: typeof projectNumber === 'string' ? projectNumber : '',
      initialAssignmentCount: Number(result.messageParams?.initialAssignmentCount ?? 0),
    };
  });
  function projectFieldLabel(field: string): string {
    const labels: Record<string, string> = {
      clientId: 'Client',
      costCenterCode: 'Cost center code',
      name: 'Name',
      currency: 'Currency',
      timezone: 'Site timezone',
      billingModel: 'Billing model',
      expectedHoursPerDay: 'Expected hours / day',
      plannedEndDate: 'Planned end date (optional)',
      revenueBudgetMinor: 'Revenue budget',
      poCapMinor: 'PO cap',
      laborBudgetMinutes: 'Planned labor hours',
      travelBudgetMinor: 'Travel budget',
      expenseBudgetMinor: 'Expense budget',
      initialWorkerIds: 'People (optional)',
      initialWorkersStartOn: 'Worker assignment start date (optional)',
      workerId: 'Worker',
      startsOn: 'Starts on',
      endsOn: 'Ends on (optional)',
      effectiveFrom: 'Terms effective from',
      customerHourlyRate: 'Customer hourly rate',
      internalCostHourlyRate: 'Internal hourly cost',
      workerPayType: 'Worker compensation method',
      workerPayAmount: 'Worker compensation rate',
      percentageBasis: 'Percentage basis',
      expensePayer: 'Expense payer',
      workerReimbursement: 'Reimburse worker',
      clientRecovery: 'Charge customer for expense',
      markupPercent: 'Expense markup percentage',
    };
    const assignmentField = /^assignments\.(\d+)\.(?:config\.)?(.+)$/.exec(field);
    if (assignmentField)
      return `${translate('Assignment')} ${Number(assignmentField[1]) + 1} · ${translate(labels[assignmentField[2]] ?? 'Worker assignments (optional)')}`;
    const defaultField = /^personDefaults\.(?:config\.)?(.+)$/.exec(field);
    if (defaultField)
      return `${translate('Project defaults for people')} · ${translate(labels[defaultField[1]] ?? 'Project defaults for people')}`;
    return translate(labels[field] ?? field);
  }
  const invitationPath = $derived.by(() => {
    const result = form as ActionResultWithMessageKey | undefined;
    if (!result?.success || result.messageKey !== 'action.access.invitation.created') return null;
    const rawParams = result.messageParams;
    if (!rawParams || typeof rawParams !== 'object') return null;
    const path = (rawParams as Record<string, unknown>).path;
    return typeof path === 'string' && path.startsWith('/') && path.includes('/app/invite/')
      ? path
      : null;
  });
  const profileWorkerId = $derived(String(data.selectedWorkerId ?? data.user.id));
  let profileSelectedWorkerId = $derived(profileWorkerId);
  let profileWorkerSearch = $state('');
  const profileMatchingWorkers = $derived(
    (data.workers ?? []).filter((worker) =>
      `${worker.name ?? ''} ${worker.email ?? ''}`
        .toLocaleLowerCase()
        .includes(profileWorkerSearch.trim().toLocaleLowerCase()),
    ),
  );
  const profileVisibleWorkers = $derived(
    (data.workers ?? []).filter(
      (worker) =>
        String(worker.id) === profileSelectedWorkerId || profileMatchingWorkers.includes(worker),
    ),
  );
  const profileExpertiseOptions = $derived(data.allSkills ?? data.skills ?? []);
  const profileAssignedExpertise = $derived(data.skills ?? []);
  const profileRemovalExpertiseOptions = $derived(
    profileExpertiseOptions.length > 0 ? profileExpertiseOptions : profileAssignedExpertise,
  );
  let planningStarts = $state('');
  let planningEnds = $state('');
  let planningProjectId = $state('');
  let planningWorkerIds = $state<string[]>([]);
  let planningRequestKey = $state('');
  $effect(() => {
    if (!planningRequestKey) planningRequestKey = crypto.randomUUID();
  });
  let restoredPlanningFailure: unknown;
  $effect(() => {
    if (
      planningFailure?.operation !== 'createPlanning' ||
      planningFailure === restoredPlanningFailure
    )
      return;
    restoredPlanningFailure = planningFailure;
    const values = planningFailure.values ?? {};
    planningProjectId = String(values.projectId ?? '');
    try {
      const workers = JSON.parse(String(values.workerIds ?? '[]'));
      planningWorkerIds = Array.isArray(workers)
        ? workers.filter((worker): worker is string => typeof worker === 'string')
        : [];
    } catch {
      planningWorkerIds = values.workerId ? [String(values.workerId)] : [];
    }
    planningRequestKey = String(values.requestKey ?? planningRequestKey);
    planningStarts = String(values.startsAt ?? '');
    planningEnds = String(values.endsAt ?? '');
  });
  const planningEligibleWorkers = $derived(
    (data.workers ?? []).filter(
      (worker) =>
        worker.status === 'active' &&
        (data.assignments ?? []).some(
          (assignment) =>
            String(assignment.project_id) === planningProjectId &&
            String(assignment.worker_id ?? assignment.user_id) === String(worker.id) &&
            assignment.status === 'active' &&
            (!planningStarts || String(assignment.starts_on) <= planningStarts.slice(0, 10)) &&
            (!assignment.ends_on ||
              String(assignment.ends_on) >= (planningEnds || planningStarts).slice(0, 10)),
        ),
    ),
  );
  const planningUnavailableWorkers = $derived(
    planningWorkerIds.filter(
      (id) => !planningEligibleWorkers.some((worker) => String(worker.id) === id),
    ),
  );
  let handledPlanningSuccess: unknown;
  $effect(() => {
    const result = form as
      | { success?: boolean; operation?: string; projectId?: string }
      | null
      | undefined;
    if (
      result?.success !== true ||
      result.operation !== 'createPlanning' ||
      result === handledPlanningSuccess
    )
      return;
    handledPlanningSuccess = result;
    if (operationalProjects.some((project) => project.id === result.projectId))
      planningProjectId = result.projectId ?? '';
  });
  $effect(() => {
    if (data.section !== 'planning') return;
    const requested = $page.url.searchParams.get('project');
    if (!planningProjectId)
      planningProjectId =
        requested && operationalProjects.some((project) => project.id === requested)
          ? requested
          : String(operationalProjects[0]?.id ?? '');
  });
  $effect(() => {
    const requestedWorker = $page.url.searchParams.get('worker');
    if (
      planningWorkerIds.length === 0 &&
      requestedWorker &&
      planningEligibleWorkers.some((worker) => worker.id === requestedWorker)
    )
      planningWorkerIds = [requestedWorker];
  });
  let handledPlanningUrlDate = '';
  $effect(() => {
    if (data.section !== 'planning') return;
    if (planningFailure?.operation === 'createPlanning') return;
    const date = $page.url.searchParams.get('date') ?? '';
    if (/^\d{4}-\d{2}-\d{2}$/u.test(date) && date !== handledPlanningUrlDate) {
      handledPlanningUrlDate = date;
      planningStarts = `${date}T08:00`;
      planningEnds = `${date}T16:00`;
    }
  });
  let planningForm: HTMLFormElement | undefined = $state();
  type WorkforceScrollSnapshot = {
    top: number;
    path: string;
    recordId: string;
    workerId: string;
    at: number;
  };
  const workforceScrollKey = (operation: string): string =>
    `ja-workforce-scroll:${String(data.user.id)}:${data.section}:${operation}`;
  let pendingWorkforceForm: HTMLFormElement | null = null;
  let pendingWorkforceSource: 'submit' | 'formdata' | null = null;
  let workforceScrollIntent = false;
  let workforceFocusIntent = false;
  function workforceFormValue(formElement: HTMLFormElement, name: string): string {
    return (
      formElement.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ??
      ''
    );
  }
  function rememberWorkforceScroll(formElement: HTMLFormElement): void {
    const operation = formElement.dataset.workforceOperation;
    if (!operation) return;
    const snapshot: WorkforceScrollSnapshot = {
      top: window.scrollY,
      path: location.pathname,
      recordId: formElement.dataset.recordId ?? workforceFormValue(formElement, 'id'),
      workerId: workforceFormValue(formElement, 'workerId'),
      at: Date.now(),
    };
    try {
      sessionStorage.setItem(workforceScrollKey(operation), JSON.stringify(snapshot));
    } catch {
      // Storage may be unavailable; the form remains usable with its fragment anchor.
    }
  }
  function revealWorkforceProblem(target: HTMLElement | null): void {
    if (!target || workforceScrollIntent) return;
    const header = document.querySelector<HTMLElement>('.portal-layout > header');
    const headerPosition = header ? window.getComputedStyle(header).position : '';
    const safeTop =
      (header && (headerPosition === 'sticky' || headerPosition === 'fixed')
        ? Math.max(0, header.getBoundingClientRect().bottom)
        : 0) + 16;
    const rect = target.getBoundingClientRect();
    if (rect.top < safeTop) {
      window.scrollBy({ top: rect.top - safeTop, behavior: 'instant' });
    } else if (rect.bottom > window.innerHeight - 16) {
      window.scrollBy({ top: rect.bottom - window.innerHeight + 16, behavior: 'instant' });
    }
  }
  function restoreWorkforceScroll(operation: string, recordId: string, workerId: string): void {
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(workforceScrollKey(operation));
      sessionStorage.removeItem(workforceScrollKey(operation));
    } catch {
      return;
    }
    if (!saved) return;
    let snapshot: Partial<WorkforceScrollSnapshot>;
    try {
      snapshot = JSON.parse(saved) as Partial<WorkforceScrollSnapshot>;
    } catch {
      return;
    }
    if (
      snapshot.path !== location.pathname ||
      snapshot.recordId !== recordId ||
      (workerId && snapshot.workerId !== workerId) ||
      typeof snapshot.top !== 'number' ||
      !Number.isFinite(snapshot.top) ||
      typeof snapshot.at !== 'number' ||
      Date.now() - snapshot.at > 300_000
    )
      return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (workforceScrollIntent) return;
        window.scrollTo({ top: snapshot.top, behavior: 'auto' });
        const focused = document.activeElement;
        if (focused instanceof HTMLElement) revealWorkforceProblem(focused);
      }),
    );
  }
  let handledWorkforceProblemId = '';
  $effect(() => {
    const problem = planningProblem ?? skillProblem;
    const failure = planningProblem ? planningFailure : skillFailure;
    if (!problem?.correlationId || !failure?.operation) return;
    if (handledWorkforceProblemId === problem.correlationId) return;
    handledWorkforceProblemId = problem.correlationId;
    const operation = failure.operation;
    const recordId = String(failure.values?.id ?? '');
    const fieldErrors = problem.fieldErrors;
    void tick().then(() => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLFormElement>(`form[data-workforce-operation="${operation}"]`),
      );
      const matching = candidates.filter(
        (candidate) => !recordId || candidate.dataset.recordId === recordId,
      );
      const target =
        matching.find((candidate) => candidate.closest('details')?.open) ?? matching[0];
      if (target && Object.keys(fieldErrors).length) {
        // ProjectBudgetInput submits a hidden minute value while its visible hours input has
        // no name. Give the visible control the server field name only while attaching errors.
        const plannedHoursInput =
          operation === 'createPlanning' && fieldErrors.plannedMinutes
            ? target
                .querySelector<HTMLInputElement>('input[type="hidden"][name="plannedMinutes"]')
                ?.parentElement?.querySelector<HTMLInputElement>('input:not([type="hidden"])')
            : null;
        if (plannedHoursInput) plannedHoursInput.name = 'plannedMinutes';
        try {
          reportFormFieldErrors(target, fieldErrors);
        } finally {
          plannedHoursInput?.removeAttribute('name');
        }
      }
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (workforceFocusIntent) return;
          const focusTarget =
            target?.querySelector<HTMLElement>('[data-validation-summary]') ??
            target?.querySelector<HTMLElement>('[data-ui="problem-notice"]') ??
            document.querySelector<HTMLElement>(
              data.section === 'profile'
                ? '#profile-skills [data-ui="problem-notice"]'
                : '[data-planning-fallback] [data-ui="problem-notice"], #planning-skills [data-ui="problem-notice"]',
            );
          focusTarget?.focus({ preventScroll: true });
          revealWorkforceProblem(focusTarget ?? null);
        }),
      );
      restoreWorkforceScroll(operation, recordId, String(failure.values?.workerId ?? ''));
    });
  });
  function selectPlanningDate(date: string) {
    planningStarts = `${date}T08:00`;
    planningEnds = `${date}T16:00`;
    tick().then(() => {
      planningForm?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      planningForm?.querySelector<HTMLInputElement>('input[name="startsAt"]')?.focus();
    });
  }
  const isAuditor = $derived(data.user.role === 'auditor_read_only');
  const isManager = $derived(Boolean(data.user.role && data.user.role !== 'worker' && !isAuditor));
  const isFinance = $derived(
    data.user.role === 'owner_admin' ||
      data.user.role === 'finance_admin' ||
      data.user.role === 'auditor_read_only',
  );
  const canManageProjects = $derived(
    data.user.role === 'owner_admin' || data.user.role === 'finance_admin',
  );
  const canManageClientContacts = $derived(
    data.user.role === 'owner_admin' || data.user.role === 'finance_admin',
  );
  const canManageAssignmentControls = $derived(
    data.user.role === 'owner_admin' || data.user.role === 'project_manager',
  );
  const canAudit = $derived(data.user.role === 'owner_admin' || isAuditor);
  const showAdmin = $derived(visibleAdmin.length > 0 || securityAdmin.length > 0);
  const availableProjects = $derived(
    data.projects && data.projects.length > 0
      ? data.projects
      : !online && data.offlineEnabled !== false
        ? offlineProjects
        : [],
  );
  const operationalProjects = $derived(
    availableProjects.filter((project) =>
      ['active', 'planned', 'paused'].includes(String(project.status ?? 'active')),
    ),
  );
  const emptyPlanningProjectProblem = $derived<ProblemData | null>(
    operationalProjects.length === 0
      ? {
          code: 'PLANNING_PROJECT_OPTIONS_EMPTY',
          messageKey: 'problem.planning.projectOptionsEmpty',
          params: {},
          fieldErrors: {},
          remedies:
            data.user.role === 'owner_admin'
              ? [{ id: 'review_project_status' }]
              : [{ id: 'contact_project_owner' }],
          correlationId: '',
        }
      : null,
  );
  const planningProjectUnavailable = $derived(
    planningProjectId &&
      !operationalProjects.some((project) => String(project.id) === planningProjectId)
      ? (availableProjects.find((project) => String(project.id) === planningProjectId) ?? null)
      : null,
  );
  const activeProjects = $derived(operationalProjects);
  type ProjectContextFormResult = {
    actionName?: string;
    success?: boolean;
    values?: Readonly<Record<string, unknown>>;
    fieldErrors?: ProblemData['fieldErrors'];
  };
  const milestoneFormResult = $derived(
    (form as ProjectContextFormResult | undefined)?.actionName === 'createMilestone'
      ? (form as ProjectContextFormResult)
      : undefined,
  );
  const scheduleFormResult = $derived(
    (form as ProjectContextFormResult | undefined)?.actionName === 'updateSchedule'
      ? (form as ProjectContextFormResult)
      : undefined,
  );
  const activeProjectContextId = $derived.by(() => {
    const requested = $page.url.searchParams.get('project') ?? '';
    return activeProjects.some((project) => String(project.id) === requested) ? requested : '';
  });
  const projectContextFormValue = (
    result: ProjectContextFormResult | undefined,
    field: string,
    fallback = '',
  ): string => {
    const value = result?.success === false ? result.values?.[field] : undefined;
    return typeof value === 'string' ? value : fallback;
  };
  const milestoneProjectId = $derived.by(() => {
    const requested = projectContextFormValue(
      milestoneFormResult,
      'projectId',
      activeProjectContextId,
    );
    return activeProjects.some((project) => String(project.id) === requested) ? requested : '';
  });
  let scheduleProjectOverride = $state<string | null>(null);
  let scheduleTimezoneOverride = $state<string | null>(null);
  let scheduleContextKey = $state<string | null>(null);
  $effect(() => {
    const contextKey = `${$page.url.pathname}|${$page.url.searchParams.get('project') ?? ''}`;
    if (scheduleContextKey === contextKey) return;
    scheduleContextKey = contextKey;
    scheduleProjectOverride = null;
    scheduleTimezoneOverride = null;
  });
  const scheduleProjectId = $derived.by(() => {
    const requested = projectContextFormValue(
      scheduleFormResult,
      'projectId',
      scheduleProjectOverride ?? activeProjectContextId,
    );
    return operationalProjects.some((project) => String(project.id) === requested) ? requested : '';
  });
  const selectedScheduleProject = $derived(
    operationalProjects.find((project) => String(project.id) === scheduleProjectId),
  );
  const scheduleTimezone = $derived(
    projectContextFormValue(
      scheduleFormResult,
      'timezone',
      scheduleTimezoneOverride ?? String(selectedScheduleProject?.timezone ?? 'America/New_York'),
    ),
  );
  let ownerMilestoneForm: HTMLFormElement | undefined = $state();
  let ownerScheduleForm: HTMLFormElement | undefined = $state();
  let ownerMilestoneDetails: HTMLDetailsElement | undefined = $state();
  let ownerScheduleDetails: HTMLDetailsElement | undefined = $state();
  $effect(() => {
    if (milestoneFormResult?.success === false && ownerMilestoneDetails)
      ownerMilestoneDetails.open = true;
    if (scheduleFormResult?.success === false && ownerScheduleDetails)
      ownerScheduleDetails.open = true;
    if (
      milestoneFormResult?.success === false &&
      milestoneFormResult.fieldErrors &&
      ownerMilestoneForm
    )
      reportFormFieldErrors(ownerMilestoneForm, milestoneFormResult.fieldErrors);
    if (
      scheduleFormResult?.success === false &&
      scheduleFormResult.fieldErrors &&
      ownerScheduleForm
    )
      reportFormFieldErrors(ownerScheduleForm, scheduleFormResult.fieldErrors);
  });
  type AssignmentFormResult = {
    actionName?: string;
    values?: Readonly<Record<string, unknown>>;
    code?: string;
    messageKey?: string;
    params?: ProblemData['params'];
    fieldErrors?: ProblemData['fieldErrors'];
    remedies?: ProblemData['remedies'];
    correlationId?: string;
  };
  const assignmentForm = $derived(
    (form as AssignmentFormResult | undefined)?.actionName === 'assignWorker'
      ? (form as AssignmentFormResult)
      : undefined,
  );
  let ownerAssignmentForm: HTMLFormElement | undefined = $state();
  $effect(() => {
    if (assignmentForm?.fieldErrors && ownerAssignmentForm)
      reportFormFieldErrors(ownerAssignmentForm, assignmentForm.fieldErrors);
  });
  const assignmentFormValue = (field: string, fallback = ''): string => {
    const submitted = assignmentForm?.values?.[field];
    return submitted == null ? fallback : String(submitted);
  };
  let assignmentSelectedProjectId = $derived(
    assignmentFormValue('projectId', $page.url.searchParams.get('project') ?? ''),
  );
  const assignmentSelectedProject = $derived(
    availableProjects.find((project) => String(project.id) === assignmentSelectedProjectId),
  );
  const assignmentProjectCurrency = $derived(String(assignmentSelectedProject?.currency ?? ''));
  let ownerAssignmentStartsOn = $state(assignmentFormValue('startsOn'));
  let ownerAssignmentEndsOn = $state(assignmentFormValue('endsOn'));
  let ownerUseProjectDefaults = $state(assignmentFormValue('useProjectDefaults') === 'on');
  let ownerUseExistingFinanceRules = $state(
    assignmentFormValue('useExistingFinanceRules') === 'on',
  );
  const assignmentProjectOptions = $derived(
    assignmentSelectedProject &&
      !activeProjects.some((project) => String(project.id) === assignmentSelectedProjectId)
      ? [...activeProjects, assignmentSelectedProject]
      : activeProjects,
  );
  const assignmentProjectUnavailable = $derived(
    Boolean(
      assignmentSelectedProject &&
      !['active', 'planned', 'paused'].includes(String(assignmentSelectedProject.status)),
    ),
  );
  const assignmentProblem = $derived(
    assignmentForm?.code && assignmentForm.messageKey && assignmentForm.correlationId
      ? (assignmentForm as ProblemData)
      : undefined,
  );
  const assignmentEditForm = $derived(
    (form as AssignmentFormResult | undefined)?.actionName === 'updateAssignment' ||
      (form as AssignmentFormResult | undefined)?.actionName === 'removeAssignment'
      ? (form as AssignmentFormResult)
      : undefined,
  );
  const assignmentEditProblem = $derived(
    assignmentEditForm?.code && assignmentEditForm.messageKey && assignmentEditForm.correlationId
      ? (assignmentEditForm as ProblemData)
      : undefined,
  );
  const assignmentEditValue = (field: string, assignmentId: unknown, fallback = ''): string =>
    assignmentRetainedValue(
      assignmentEditForm,
      projectWorkflow === 'update-assignment'
        ? 'updateAssignment'
        : projectWorkflow === 'remove-assignment'
          ? 'removeAssignment'
          : undefined,
      assignmentId,
      field,
      fallback,
    );
  let focusedAssignmentEditProblemId = '';
  $effect(() => {
    const correlationId = assignmentEditProblem?.correlationId;
    if (!correlationId || correlationId === focusedAssignmentEditProblemId) return;
    focusedAssignmentEditProblemId = correlationId;
    void tick().then(() => {
      const workflow =
        assignmentEditForm?.actionName === 'removeAssignment'
          ? 'remove-assignment'
          : 'update-assignment';
      const panel = document.querySelector<HTMLElement>(`[data-project-workflow="${workflow}"]`);
      const form = [...(panel?.querySelectorAll<HTMLFormElement>('form') ?? [])].find(
        (candidate) =>
          candidate.dataset.assignmentId === String(assignmentEditForm?.values?.assignmentId ?? ''),
      );
      if (form && assignmentEditProblem.fieldErrors)
        reportFormFieldErrors(form, assignmentEditProblem.fieldErrors);
      const target =
        panel?.querySelector<HTMLElement>('[data-validation-summary]') ??
        panel?.querySelector<HTMLElement>('[data-ui="problem-notice"]');
      target?.focus({ preventScroll: true });
    });
  });
  let focusedAssignmentProblemId = '';
  $effect(() => {
    const correlationId = assignmentProblem?.correlationId;
    if (!correlationId || correlationId === focusedAssignmentProblemId) return;
    focusedAssignmentProblemId = correlationId;
    void tick().then(() => {
      const panel = document.querySelector<HTMLElement>('[data-project-workflow="assign-worker"]');
      const target =
        panel?.querySelector<HTMLElement>('[data-validation-summary]') ??
        panel?.querySelector<HTMLElement>('[data-ui="problem-notice"][data-kind="error"]');
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
  });
  const assignmentAdvanceProblem = $derived(
    assignmentProjectUnavailable && assignmentSelectedProject
      ? ({
          code: 'PROJECT_ASSIGNMENT_BLOCKED_STATUS',
          messageKey: 'problem.project.assignmentBlockedStatus',
          params: {
            projectName: String(assignmentSelectedProject.name),
            status: String(assignmentSelectedProject.status),
          },
          fieldErrors: {},
          remedies:
            data.user.role === 'owner_admin'
              ? [{ id: 'review_project_status', projectId: assignmentSelectedProjectId }]
              : [{ id: 'contact_project_owner' }],
          correlationId: '',
        } satisfies ProblemData)
      : undefined,
  );
  const assignmentRemedyProjectId = $derived.by(() => {
    if (assignmentEditForm?.actionName === 'updateAssignment') {
      const assignmentId = String(assignmentEditForm.values?.assignmentId ?? '');
      const record = (data.assignments ?? []).find(
        (assignment) => String(assignment.id) === assignmentId,
      );
      return String(record?.project_id ?? '');
    }
    return assignmentSelectedProjectId;
  });
  const assignmentRemedyWorkerId = $derived.by(() => {
    if (assignmentEditForm?.actionName === 'updateAssignment') {
      const assignmentId = String(assignmentEditForm.values?.assignmentId ?? '');
      const record = (data.assignments ?? []).find(
        (assignment) => String(assignment.id) === assignmentId,
      );
      return String(record?.worker_id ?? record?.user_id ?? '');
    }
    return assignmentFormValue(
      'workerId',
      projectWorkflowPage.url.searchParams.get('worker') ?? '',
    );
  });
  const assignmentRemedyLinks = $derived({
    correct_fields: {
      label: portalText(locale, 'problem.remedy.correctFields'),
    },
    review_project_status: {
      label: portalText(locale, 'problem.remedy.reviewProjectStatus'),
      href: assignmentSelectedProjectId
        ? `${base}/app/projects/${encodeURIComponent(assignmentSelectedProjectId)}`
        : undefined,
    },
    contact_project_owner: {
      label: portalText(locale, 'problem.remedy.contactOwner'),
    },
    review_assignments: {
      label: portalText(locale, 'problem.remedy.reviewAssignments'),
      href: assignmentWorkflowHref(projectWorkflowPage.url, 'updateAssignment', {
        project: assignmentRemedyProjectId || undefined,
        worker: assignmentRemedyWorkerId || undefined,
      }),
    },
    review_finance_rules: {
      label: translate('Open finance configuration'),
      href: assignmentRemedyProjectId
        ? `${base}/app/finance?view=commercial&project=${encodeURIComponent(assignmentRemedyProjectId)}`
        : undefined,
    },
    choose_available_worker: {
      label: portalText(locale, 'problem.remedy.chooseAvailableWorker'),
    },
    review_updated_record: {
      label: translate('Review updated record'),
      href: assignmentWorkflowHref(
        projectWorkflowPage.url,
        assignmentEditForm?.actionName === 'removeAssignment'
          ? 'removeAssignment'
          : 'updateAssignment',
      ),
    },
  });
  const firstAuthorizedProjectId = $derived(String(data.projects?.[0]?.id ?? '').trim() || null);
  const invoiceDraftHref = $derived(
    canManageProjects && firstAuthorizedProjectId
      ? `${base}/app/projects/${encodeURIComponent(firstAuthorizedProjectId)}`
      : null,
  );

  /**
   * Keep project lifecycle semantics in the existing route actions. The new
   * project surface only renders these already-authorized transitions; it does
   * not infer or calculate any commercial state.
   */
  const projectLifecycleActions = (row: Row): readonly ProjectLifecycleAction[] => {
    const status = String(row.status ?? '');
    if (status === 'active' || status === 'paused') {
      return [
        {
          label: translate('Begin close'),
          action: '?/transitionProject',
          fields: { status: 'closing' },
        },
      ];
    }
    if (status === 'closing') {
      return [
        {
          label: translate('Close project'),
          action: '?/transitionProject',
          fields: { status: 'closed' },
        },
      ];
    }
    if (status === 'closed') {
      return [
        {
          label: translate('Archive project'),
          action: '?/transitionProject',
          fields: { status: 'archived' },
          destructive: true,
        },
      ];
    }
    if (status === 'archived') {
      return [
        {
          label: translate('Restore project'),
          action: '?/transitionProject',
          fields: { status: 'restore' },
        },
      ];
    }
    return [];
  };
  function projectLifecycleAssignmentWarning(row: Row, status: 'closing' | 'closed'): ProblemData {
    const projectName = String(row.name ?? row.project_name ?? translate('Unnamed project'));
    return {
      code: 'WARNING_PROJECT_LIFECYCLE_ASSIGNMENTS',
      messageKey: 'problem.warning.projectLifecycleAssignments',
      message: `${projectName}: ${controlledValue('status', status)} prevents new assignments. Review the project and assignments before continuing.`,
      params: { projectName, status },
      fieldErrors: {},
      remedies: [{ id: 'review_project' }, { id: 'review_assignments' }],
      correlationId: '',
    };
  }
  const activeClients = $derived(
    (data.clients ?? []).filter((client) => String(client.status ?? 'active') !== 'archived'),
  );
  let newProjectClientId = $state('');
  let newProjectCurrencyOverride = $state<string | null>(null);
  let newProjectTimezoneOverride = $state<string | null>(null);
  const selectedNewProjectClientId = $derived(
    newProjectClientId || projectFormValue('clientId', $page.url.searchParams.get('client') ?? ''),
  );
  const selectedNewProjectClient = $derived(
    activeClients.find((client) => String(client.id) === selectedNewProjectClientId),
  );
  const newProjectCurrency = $derived(
    newProjectCurrencyOverride ??
      (newProjectClientId
        ? String(selectedNewProjectClient?.currency ?? 'USD')
        : projectFormValue('currency', String(selectedNewProjectClient?.currency ?? 'USD'))),
  );
  const newProjectTimezone = $derived(
    newProjectTimezoneOverride ??
      (newProjectClientId
        ? String(selectedNewProjectClient?.timezone ?? 'America/New_York')
        : projectFormValue(
            'timezone',
            String(selectedNewProjectClient?.timezone ?? 'America/New_York'),
          )),
  );
  const href = (section: string) =>
    section === 'today' ? `${base}/app/` : `${base}/app/${section}`;
  const itemHref = (item: NavItem) =>
    financeProjectNavigationHref(item.href ?? href(item.section), {
      base,
      section: data.section,
      url: $page.url,
      projectId: availableProjects.some((project) => String(project.id) === data.selectedProjectId)
        ? data.selectedProjectId
        : undefined,
    });
  const activeDestination = $derived(
    activeNavItem([...navigation, ...secondaryNavigation, ...visibleAdmin, ...securityAdmin], {
      base,
      section: data.section,
      url: $page.url,
      role: data.user.role,
      itemHref,
    }),
  );
  const searchTerm = $derived(searchValue.trim().toLowerCase());
  const visibleSearchSuggestions = $derived(
    (data.searchSuggestions ?? [])
      .filter((row) => {
        if (!searchTerm) return true;
        return `${String(row.label ?? '')} ${String(row.detail ?? '')} ${String(row.type ?? '')}`
          .toLowerCase()
          .includes(searchTerm);
      })
      .slice(0, 8),
  );
  const searchGroupKey = (row: Row): SearchGroupKey => {
    switch (
      String(row.type ?? '')
        .trim()
        .toLowerCase()
    ) {
      case 'project':
      case 'projects':
        return 'projects';
      case 'invoice':
      case 'invoices':
        return 'invoices';
      case 'worker':
      case 'workers':
      case 'specialist':
      case 'specialists':
      case 'person':
      case 'people':
        return 'specialists';
      case 'client':
      case 'clients':
        return 'clients';
      default:
        return 'other';
    }
  };
  const searchGroupLabel = (key: SearchGroupKey): string => {
    switch (key) {
      case 'projects':
        return translate('Projects');
      case 'invoices':
        return translate('Invoices');
      case 'specialists':
        return translate('Specialists');
      case 'clients':
        return translate('Clients');
      default:
        return translate('Other records');
    }
  };
  const groupSearchRows = (rows: Row[]): SearchGroup[] => {
    const order: SearchGroupKey[] = ['projects', 'invoices', 'specialists', 'clients', 'other'];
    const grouped = new SvelteMap<SearchGroupKey, Row[]>();
    for (const row of rows) {
      const key = searchGroupKey(row);
      const existing = grouped.get(key);
      if (existing) existing.push(row);
      else grouped.set(key, [row]);
    }
    return order
      .filter((key) => (grouped.get(key)?.length ?? 0) > 0)
      .map((key) => ({ key, label: searchGroupLabel(key), rows: grouped.get(key) ?? [] }));
  };
  const groupedSearchSuggestions = $derived(groupSearchRows(visibleSearchSuggestions));
  const groupedSearchResults = $derived(groupSearchRows(data.searchResults ?? []));
  const searchHref = (row: Row) => {
    const id = String(row.id ?? '');
    const type = String(row.type ?? '')
      .trim()
      .toLowerCase();
    if (type === 'project' || type === 'projects') return `${base}/app/projects/${id}`;
    if (type === 'client' || type === 'clients')
      return `${base}/app/projects?view=clients&focus=${encodeURIComponent(id)}`;
    if (type === 'invoice' || type === 'invoices') return `${base}/app/billing/invoices/${id}`;
    if (type === 'report' || type === 'reports') return `${base}/app/reports/${id}`;
    if (type === 'expense' || type === 'expenses') return `${base}/app/expenses/${id}`;
    if (['worker', 'workers', 'specialist', 'specialists', 'person', 'people'].includes(type))
      return `${base}/app/planning`;
    return `${base}/app/`;
  };
  const isExpenseSearchRow = (row: Row) => String(row.type ?? '').toLowerCase() === 'expense';
  const searchResultDescription = (row: Row, groupLabel: string, fullId = false): string => {
    if (!isExpenseSearchRow(row)) return `${groupLabel} · ${String(row.detail ?? '')}`;
    const id = String(row.id ?? '');
    const projectNumber = String(row.projectNumber ?? '').trim();
    const date = String(row.spentOn ?? '').trim();
    const rawStatus = String(row.approvalState ?? '').trim();
    const status =
      rawStatus === 'void' ? translate('Withdrawn') : controlledValue('status', rawStatus);
    return [
      groupLabel,
      projectNumber ? `${projectNumber} · ${translate('Expenses')}` : String(row.detail ?? ''),
      date,
      status,
      id ? `ID ${fullId ? id : id.slice(-8)}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  };
  const expenseSearchAccessibleLabel = (row: Row, groupLabel: string): string | undefined =>
    isExpenseSearchRow(row)
      ? `${String(row.label ?? translate('Record'))} · ${searchResultDescription(row, groupLabel, true)}`
      : undefined;
  const toastItems = $derived.by(() => {
    const items: ToastItem[] = [];
    const add = (
      id: string,
      message: string,
      variant: ToastItem['variant'],
      title: string,
    ): void => {
      if (!message || dismissedToastIds.includes(id)) return;
      items.push({ id, message, variant, title, closeLabel: translate('Dismiss notification') });
    };

    if (actionFeedback) {
      add(
        `action:${String((form as ActionResultWithMessageKey | undefined)?.messageKey ?? actionFeedback)}`,
        actionFeedback,
        form?.success ? 'success' : 'danger',
        form?.success ? translate('Success') : translate('Error'),
      );
    }
    if (securityMessage) {
      add(
        `security:${securityMessage}`,
        translate(securityMessage),
        securitySucceeded ? 'success' : 'danger',
        securitySucceeded ? translate('Success') : translate('Error'),
      );
    }
    if (syncMessage) {
      const succeeded =
        syncMessage === 'Offline drafts synced.' ||
        syncMessage === 'Offline — saved on this device';
      add(
        `sync:${syncMessage}`,
        translate(syncMessage),
        succeeded ? 'success' : 'danger',
        succeeded ? translate('Success') : translate('Error'),
      );
    }
    return items;
  });

  function dismissToast(id: string): void {
    if (!dismissedToastIds.includes(id)) dismissedToastIds = [...dismissedToastIds, id];
  }

  function searchOptionElements(): HTMLElement[] {
    if (typeof document === 'undefined') return [];
    return Array.from(
      document.querySelectorAll<HTMLElement>('#portal-search-popover a[role="option"]'),
    );
  }

  function submitGlobalSearch(event: SubmitEvent): void {
    searchOpen = false;
    const formElement = event.currentTarget;
    if (!(formElement instanceof HTMLFormElement)) return;
    // Some tabs update browser history without navigating the Svelte page.
    // Read that current URL before the native GET serializes its controls.
    const currentUrl = new URL(window.location.href);
    formElement.action = currentUrl.pathname;
    for (const input of formElement.querySelectorAll('[data-search-context]')) input.remove();
    for (const [queryName, queryValue] of currentUrl.searchParams) {
      if (queryName === 'q' || queryName.startsWith('/')) continue;
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = queryName;
      input.value = queryValue;
      input.dataset.searchContext = '';
      formElement.append(input);
    }
  }

  function handleSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      searchOpen = false;
      searchInput?.blur();
      return;
    }
    if (event.key === 'ArrowDown' && searchOpen) {
      const first = searchOptionElements()[0];
      if (!first) return;
      event.preventDefault();
      first.focus();
    }
  }

  function handleSearchOptionKeydown(event: KeyboardEvent, index: number): void {
    const options = searchOptionElements();
    if (event.key === 'Escape') {
      event.preventDefault();
      searchOpen = false;
      searchInput?.focus();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      options[(index + delta + options.length) % options.length]?.focus();
    }
  }

  const offlineController = createOfflineController(base, {
    setOnline: (value) => (online = value),
    setQueue: (value) => (queue = value),
    setSyncMessage: (value) => (syncMessage = value),
    setAssignmentCacheMessage: (value) => (assignmentCacheMessage = value),
    getSyncMessage: () => syncMessage,
    setConflictItems: (value) => (conflictItems = value),
    setOfflineProjects: (value) => (offlineProjects = value),
  });

  function applyWorkerStatementArtifacts(value: unknown): void {
    if (!Array.isArray(value)) return;
    workerStatementArtifacts = value.filter((artifact): artifact is WorkerStatementArtifact => {
      if (!artifact || typeof artifact !== 'object') return false;
      const candidate = artifact as Record<string, unknown>;
      return (
        typeof candidate.artifactId === 'string' &&
        (candidate.format === 'pdf' || candidate.format === 'csv') &&
        (candidate.locale === 'en' || candidate.locale === 'es' || candidate.locale === 'pt') &&
        (candidate.status === 'queued' ||
          candidate.status === 'running' ||
          candidate.status === 'ready' ||
          candidate.status === 'failed')
      );
    });
  }

  function workerStatementArtifact(format: WorkerStatementFormat): WorkerStatementArtifact | null {
    return (
      workerStatementArtifacts.find(
        (artifact) => artifact.format === format && artifact.locale === locale,
      ) ?? null
    );
  }

  function canRetryWorkerStatement(artifact: WorkerStatementArtifact | null | undefined): boolean {
    return (
      artifact?.status === 'failed' &&
      artifact.retryable === true &&
      typeof artifact.currentAttemptNumber === 'number' &&
      typeof artifact.maxAttempts === 'number' &&
      artifact.currentAttemptNumber < artifact.maxAttempts
    );
  }

  function workerStatementStorageKey(request?: WorkerStatementRequest): string {
    return `worker-statement-request:${data.user.id}:${request?.periodStart ?? data.periodStart}:${request?.periodEnd ?? data.periodEnd}:${request?.locale ?? locale}`;
  }

  function savePendingWorkerStatementRequest(request: WorkerStatementRequest | null): void {
    const prior = pendingWorkerStatementRequest;
    pendingWorkerStatementRequest = request;
    workerStatementRequestChecked = false;
    try {
      if (request)
        sessionStorage.setItem(workerStatementStorageKey(request), JSON.stringify(request));
      else sessionStorage.removeItem(workerStatementStorageKey(prior ?? undefined));
    } catch {
      // The in-memory request identity still prevents a duplicate in this page session.
    }
  }

  function restorePendingWorkerStatementRequest(): void {
    try {
      const stored = sessionStorage.getItem(workerStatementStorageKey());
      if (!stored) return;
      const value = JSON.parse(stored) as Partial<WorkerStatementRequest>;
      if (
        value.periodStart === data.periodStart &&
        value.periodEnd === data.periodEnd &&
        value.locale === locale &&
        typeof value.requestKey === 'string' &&
        typeof value.requestIssuedAt === 'string' &&
        typeof value.refresh === 'boolean'
      )
        pendingWorkerStatementRequest = value as WorkerStatementRequest;
    } catch {
      // Corrupt storage cannot supply a trustworthy replay identity.
    }
  }

  function statementProblem(
    code: string,
    messageKey: `problem.workerStatement.${string}`,
    message: string,
    remedies: ProblemData['remedies'] = [{ id: 'check_statement_status' }],
  ): ProblemData {
    return {
      code,
      messageKey,
      message,
      params: {},
      fieldErrors: {},
      remedies,
      correlationId: crypto.randomUUID(),
    };
  }

  function responseStatementProblem(payload: unknown): ProblemData {
    if (payload && typeof payload === 'object') {
      const value = payload as Partial<ProblemData>;
      if (
        typeof value.code === 'string' &&
        typeof value.messageKey === 'string' &&
        value.messageKey.startsWith('problem.workerStatement.') &&
        typeof value.correlationId === 'string'
      )
        return {
          code: value.code,
          messageKey: value.messageKey as `problem.workerStatement.${string}`,
          message: typeof value.message === 'string' ? value.message : undefined,
          params: value.params ?? {},
          fieldErrors: value.fieldErrors ?? {},
          remedies: Array.isArray(value.remedies) ? value.remedies : [],
          correlationId: value.correlationId,
        };
    }
    return statementProblem(
      'WORKER_STATEMENT_UNEXPECTED',
      'problem.workerStatement.networkUncertain',
      'We could not confirm whether the statement request completed. Check the statement status before requesting again.',
    );
  }

  function failedWorkerStatementProblem(artifact: WorkerStatementArtifact): ProblemData {
    const remedy = canRetryWorkerStatement(artifact)
      ? [{ id: 'retry_statement' }]
      : [{ id: 'contact_finance_owner' }];
    if (artifact.errorCode === 'ARTIFACT_INTEGRITY_FAILED')
      return statementProblem(
        'WORKER_STATEMENT_INTEGRITY_FAILED',
        'problem.workerStatement.integrityFailed',
        'This statement file did not pass its integrity check. Request help from the owner or finance team.',
        remedy,
      );
    if (artifact.errorCode === 'WORKER_STATEMENT_RENDER_FAILED')
      return statementProblem(
        'WORKER_STATEMENT_RENDER_FAILED',
        'problem.workerStatement.renderFailed',
        'The statement could not be rendered. Retry this artifact if Retry is offered; otherwise contact the owner or finance team.',
        remedy,
      );
    if (artifact.errorCode === 'FINALIZATION_INTERRUPTED' || artifact.errorCode === 'LEASE_EXPIRED')
      return statementProblem(
        'WORKER_STATEMENT_PROCESSING_INTERRUPTED',
        'problem.workerStatement.processingInterrupted',
        'Statement processing stopped before completion. Retry this artifact if Retry is offered; otherwise contact the owner or finance team.',
        remedy,
      );
    return statementProblem(
      'WORKER_STATEMENT_ARTIFACT_FAILED',
      'problem.workerStatement.artifactFailed',
      'This statement could not be prepared. Review its status and retry if offered.',
      remedy,
    );
  }

  function refreshedWorkerStatementDownloadProblem(
    artifactId: string,
    current: WorkerStatementArtifact | null,
  ): ProblemData {
    if (current?.artifactId !== artifactId)
      return statementProblem(
        'WORKER_STATEMENT_NOT_FOUND',
        'problem.workerStatement.notFound',
        'This worker statement is unavailable. Open My Pay to review your statements.',
        [{ id: 'review_my_pay' }],
      );
    if (current.status === 'failed') return failedWorkerStatementProblem(current);
    return statementProblem(
      'WORKER_STATEMENT_ARTIFACT_PENDING',
      'problem.workerStatement.artifactPending',
      'This statement is still being prepared. Check its status again shortly.',
    );
  }

  async function showWorkerStatementProblem(
    problem: ProblemData,
    source: 'action' | 'download' = 'action',
  ): Promise<void> {
    workerStatementProblem = problem;
    workerStatementDownloadFailure = source === 'download';
    const noticeId = problem.correlationId;
    workerStatementNoticeId = noticeId;
    await tick();
    if (workerStatementNoticeId !== noticeId) return;
    const notice = document.querySelector<HTMLElement>(
      '.pay-export-actions [data-ui="problem-notice"]',
    );
    if (!notice) return;
    notice.focus({ preventScroll: true });
    // After a reload, the browser may restore the old scroll position after Svelte focuses the
    // notice. Wait for that paint, then move only if the focused explanation is offscreen.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (workerStatementNoticeId !== noticeId || document.activeElement !== notice) return;
        const bounds = notice.getBoundingClientRect();
        const mobileNav = document.querySelector<HTMLElement>('.bottom-nav');
        const bottom =
          mobileNav && getComputedStyle(mobileNav).position === 'fixed'
            ? mobileNav.getBoundingClientRect().top - 16
            : window.innerHeight - 16;
        const header = document.querySelector<HTMLElement>('.portal-layout > header');
        const top =
          header && ['fixed', 'sticky'].includes(getComputedStyle(header).position)
            ? header.getBoundingClientRect().bottom + 16
            : 16;
        const delta =
          bounds.height > bottom - top || bounds.top < top
            ? bounds.top - top
            : bounds.bottom > bottom
              ? bounds.bottom - bottom
              : 0;
        if (delta) window.scrollBy({ top: delta, behavior: 'instant' });
      }),
    );
  }

  function cancelWorkerStatementDownload(): void {
    workerStatementDownloadController?.abort();
    workerStatementDownloadController = null;
    workerStatementDownloadBusy = false;
  }

  beforeNavigate(() => cancelWorkerStatementDownload());
  onMount(() => () => cancelWorkerStatementDownload());

  async function downloadWorkerStatement(
    event: MouseEvent,
    artifact: WorkerStatementArtifact,
  ): Promise<void> {
    event.preventDefault();
    if (workerStatementDownloadBusy || artifact.status !== 'ready') return;
    const controller = new AbortController();
    workerStatementDownloadController = controller;
    workerStatementDownloadBusy = true;
    workerStatementDownloadFailedFormat = null;
    workerStatementDownloadFailedArtifactId = null;
    workerStatementProblem = null;
    try {
      const response = await fetch(
        `${base}/app/api/worker-statement/artifacts/${encodeURIComponent(artifact.artifactId)}/download`,
        {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { accept: 'application/pdf, text/csv, application/json' },
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) return;
      const reference = response.headers.get('x-correlation-id') ?? '';
      if (response.redirected) {
        const destination = new URL(response.url);
        workerStatementDownloadFailedFormat = artifact.format;
        await showWorkerStatementProblem(
          workerStatementDownloadFallback(
            destination.origin === location.origin && destination.pathname.endsWith('/app/login')
              ? 'signIn'
              : 'invalid',
            reference,
          ),
          'download',
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
        if (controller.signal.aborted) return;
        const problem =
          workerStatementDownloadProblem(payload, reference) ??
          workerStatementDownloadFallback(
            response.status === 401 ? 'signIn' : 'invalid',
            reference,
          );
        if (response.status === 409) {
          workerStatementStatusUnknownIds = [
            ...new Set([...workerStatementStatusUnknownIds, artifact.artifactId]),
          ];
          const refreshed = await loadWorkerStatementArtifacts({
            quiet: true,
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          const current = workerStatementArtifact(artifact.format);
          workerStatementDownloadFailedFormat = artifact.format;
          workerStatementDownloadFailedArtifactId = artifact.artifactId;
          if (
            !refreshed.ok ||
            (current?.artifactId === artifact.artifactId && current.status === 'ready')
          ) {
            await showWorkerStatementProblem(
              workerStatementDownloadFallback('statusUnknown', reference),
              'download',
            );
            return;
          }
          await showWorkerStatementProblem(
            refreshedWorkerStatementDownloadProblem(artifact.artifactId, current),
            'download',
          );
          return;
        }
        if (controller.signal.aborted) return;
        workerStatementDownloadFailedFormat = artifact.format;
        workerStatementDownloadFailedArtifactId = artifact.artifactId;
        await showWorkerStatementProblem(problem, 'download');
        return;
      }
      const verified = await verifiedWorkerStatementFile(response, artifact.format);
      if (controller.signal.aborted) return;
      if (!verified) {
        workerStatementDownloadFailedFormat = artifact.format;
        workerStatementDownloadFailedArtifactId = artifact.artifactId;
        await showWorkerStatementProblem(
          workerStatementDownloadFallback('invalid', reference),
          'download',
        );
        return;
      }
      const objectUrl = URL.createObjectURL(verified.file);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = verified.filename;
      link.hidden = true;
      document.body.append(link);
      try {
        link.click();
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
    } catch {
      if (controller.signal.aborted) return;
      workerStatementDownloadFailedFormat = artifact.format;
      workerStatementDownloadFailedArtifactId = artifact.artifactId;
      await showWorkerStatementProblem(workerStatementDownloadFallback('network'), 'download');
    } finally {
      if (workerStatementDownloadController === controller) {
        workerStatementDownloadController = null;
        workerStatementDownloadBusy = false;
      }
    }
  }

  async function checkWorkerStatementDownloadStatus(): Promise<void> {
    const artifactId = workerStatementDownloadFailedArtifactId;
    const format = workerStatementDownloadFailedFormat;
    if (!artifactId || !format || workerStatementDownloadBusy) return;
    const controller = new AbortController();
    workerStatementDownloadController = controller;
    workerStatementDownloadBusy = true;
    try {
      const result = await loadWorkerStatementArtifacts({ quiet: true, signal: controller.signal });
      if (controller.signal.aborted) return;
      const current = workerStatementArtifact(format);
      if (!result.ok || (current?.artifactId === artifactId && current.status === 'ready')) {
        await showWorkerStatementProblem(
          workerStatementDownloadFallback('statusUnknown'),
          'download',
        );
      } else {
        await showWorkerStatementProblem(
          refreshedWorkerStatementDownloadProblem(artifactId, current),
          'download',
        );
      }
    } finally {
      if (workerStatementDownloadController === controller) {
        workerStatementDownloadController = null;
        workerStatementDownloadBusy = false;
      }
    }
  }

  async function loadWorkerStatementArtifacts(
    options: { quiet?: boolean; signal?: AbortSignal } = {},
  ): Promise<{ ok: boolean; pending: boolean }> {
    const query = new URLSearchParams({
      periodStart: data.periodStart ?? '',
      periodEnd: data.periodEnd ?? '',
      locale,
    });
    try {
      const response = await fetch(`${base}/app/api/worker-statement?${query.toString()}`, {
        headers: { accept: 'application/json' },
        signal: options.signal,
      });
      if (options.signal?.aborted) return { ok: false, pending: false };
      const payload = (await response.json().catch(() => ({}))) as { artifacts?: unknown };
      if (options.signal?.aborted) return { ok: false, pending: false };
      if (!response.ok || !Array.isArray(payload.artifacts)) {
        if (!options.quiet) await showWorkerStatementProblem(responseStatementProblem(payload));
        return { ok: false, pending: false };
      }
      applyWorkerStatementArtifacts(payload.artifacts);
      workerStatementStatusUnknownIds = workerStatementStatusUnknownIds.filter((id) =>
        workerStatementArtifacts.some(
          (artifact) => artifact.artifactId === id && artifact.status === 'ready',
        ),
      );
      const pending = workerStatementArtifacts.some(
        (artifact) => artifact.status === 'queued' || artifact.status === 'running',
      );
      const failed = (['pdf', 'csv'] as WorkerStatementFormat[])
        .map((format) => workerStatementArtifact(format))
        .find((artifact) => artifact?.status === 'failed');
      if (
        !options.quiet &&
        failed &&
        workerStatementProblem?.code !== failedWorkerStatementProblem(failed).code
      )
        await showWorkerStatementProblem(failedWorkerStatementProblem(failed));
      else if (!options.quiet && !failed) workerStatementProblem = null;
      return { ok: true, pending };
    } catch {
      if (!options.quiet)
        await showWorkerStatementProblem(
          statementProblem(
            'WORKER_STATEMENT_NETWORK_UNCERTAIN',
            'problem.workerStatement.networkUncertain',
            'We could not confirm whether the statement request completed. Check the statement status before requesting again.',
          ),
        );
      return { ok: false, pending: false };
    }
  }

  async function pollWorkerStatementArtifacts(): Promise<void> {
    if (workerStatementPolling) return;
    workerStatementPolling = true;
    try {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const status = await loadWorkerStatementArtifacts();
        if (!status.ok || !status.pending) return;
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      if (
        workerStatementArtifacts.some(
          (artifact) => artifact.status === 'queued' || artifact.status === 'running',
        )
      )
        await showWorkerStatementProblem(
          statementProblem(
            'WORKER_STATEMENT_ARTIFACT_PENDING',
            'problem.workerStatement.artifactPending',
            'This statement is still being prepared. Check its status again shortly.',
          ),
        );
    } finally {
      workerStatementPolling = false;
    }
  }

  async function checkPendingWorkerStatementRequest(): Promise<boolean> {
    const pending = pendingWorkerStatementRequest;
    if (!pending) return true;
    const query = new URLSearchParams({
      periodStart: pending.periodStart,
      periodEnd: pending.periodEnd,
      locale: pending.locale,
      requestKey: pending.requestKey,
    });
    try {
      const response = await fetch(`${base}/app/api/worker-statement?${query.toString()}`, {
        headers: { accept: 'application/json' },
      });
      const payload = (await response.json().catch(() => ({}))) as { artifacts?: unknown };
      if (!response.ok) {
        await showWorkerStatementProblem(responseStatementProblem(payload));
        return false;
      }
      if (Array.isArray(payload.artifacts) && payload.artifacts.length === 2) {
        applyWorkerStatementArtifacts(payload.artifacts);
        savePendingWorkerStatementRequest(null);
        workerStatementProblem = null;
        if (
          workerStatementArtifacts.some(
            (artifact) => artifact.status === 'queued' || artifact.status === 'running',
          )
        )
          void pollWorkerStatementArtifacts();
        return true;
      }
      // The first POST may still be running. Only a replay with this exact request identity is
      // safe; a fresh Generate action remains hidden until two persisted artifacts are found.
      workerStatementRequestChecked = true;
    } catch {
      workerStatementRequestChecked = false;
    }
    await showWorkerStatementProblem(
      statementProblem(
        'WORKER_STATEMENT_NETWORK_UNCERTAIN',
        'problem.workerStatement.networkUncertain',
        'We could not confirm whether the statement request completed. Check the statement status before requesting again.',
      ),
    );
    return false;
  }

  async function requestWorkerStatement(): Promise<void> {
    if (workerStatementBusy || workerStatementPolling || pendingWorkerStatementRequest) return;
    const request: WorkerStatementRequest = {
      periodStart: data.periodStart ?? '',
      periodEnd: data.periodEnd ?? '',
      locale,
      refresh: workerStatementArtifacts.length > 0,
      requestKey: crypto.randomUUID(),
      requestIssuedAt: new Date().toISOString(),
    };
    savePendingWorkerStatementRequest(request);
    await sendWorkerStatementRequest(request);
  }

  async function sendWorkerStatementRequest(request: WorkerStatementRequest): Promise<void> {
    if (workerStatementBusy || workerStatementPolling) return;
    workerStatementBusy = true;
    workerStatementProblem = null;
    try {
      const response = await fetch(`${base}/app/api/worker-statement`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      const payload = (await response.json().catch(() => ({}))) as { artifacts?: unknown };
      if (!response.ok) {
        const problem = responseStatementProblem(payload);
        if (response.status >= 500 || response.status === 409)
          await checkPendingWorkerStatementRequest();
        else savePendingWorkerStatementRequest(null);
        if (pendingWorkerStatementRequest || (response.status < 500 && response.status !== 409))
          await showWorkerStatementProblem(problem);
        return;
      }
      savePendingWorkerStatementRequest(null);
      applyWorkerStatementArtifacts(payload.artifacts);
      if (
        workerStatementArtifacts.some(
          (artifact) => artifact.status === 'queued' || artifact.status === 'running',
        )
      )
        void pollWorkerStatementArtifacts();
    } catch {
      // A lost POST response may already have committed. Look up this request key first; any
      // user-initiated replay uses the same key, refresh choice, period, locale, and issued time.
      await checkPendingWorkerStatementRequest();
    } finally {
      workerStatementBusy = false;
    }
  }

  async function retrySameWorkerStatementRequest(): Promise<void> {
    const pending = pendingWorkerStatementRequest;
    if (!pending || !workerStatementRequestChecked || workerStatementBusy) return;
    const resolved = await checkPendingWorkerStatementRequest();
    if (
      resolved ||
      pendingWorkerStatementRequest?.requestKey !== pending.requestKey ||
      !workerStatementRequestChecked
    )
      return;
    await sendWorkerStatementRequest(pending);
  }

  async function retryWorkerStatement(artifact: WorkerStatementArtifact): Promise<void> {
    if (workerStatementBusy || !canRetryWorkerStatement(artifact)) return;
    workerStatementBusy = true;
    workerStatementProblem = null;
    try {
      // Re-read before mutation: another session may already have retried or completed it.
      const statusResponse = await fetch(
        `${base}/app/api/worker-statement/artifacts/${encodeURIComponent(artifact.artifactId)}`,
        { headers: { accept: 'application/json' } },
      );
      const statusPayload = (await statusResponse.json().catch(() => ({}))) as {
        artifact?: WorkerStatementArtifact;
      };
      if (!statusResponse.ok) {
        await showWorkerStatementProblem(responseStatementProblem(statusPayload));
        return;
      }
      if (
        statusPayload.artifact?.status !== 'failed' ||
        !canRetryWorkerStatement(statusPayload.artifact)
      ) {
        await loadWorkerStatementArtifacts();
        await showWorkerStatementProblem(
          statementProblem(
            'WORKER_STATEMENT_RETRY_CHANGED',
            'problem.workerStatement.retryChanged',
            'This statement changed while retrying. Review its current status before trying again.',
          ),
        );
        return;
      }
      const response = await fetch(
        `${base}/app/api/worker-statement/artifacts/${encodeURIComponent(artifact.artifactId)}/retry`,
        { method: 'POST', headers: { accept: 'application/json' } },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        artifact?: WorkerStatementArtifact;
      };
      if (!response.ok) {
        const problem = responseStatementProblem(payload);
        if (response.status >= 500 || response.status === 409) await loadWorkerStatementArtifacts();
        await showWorkerStatementProblem(problem);
        return;
      }
      await loadWorkerStatementArtifacts();
      void pollWorkerStatementArtifacts();
    } catch {
      await loadWorkerStatementArtifacts();
      await showWorkerStatementProblem(
        statementProblem(
          'WORKER_STATEMENT_NETWORK_UNCERTAIN',
          'problem.workerStatement.networkUncertain',
          'We could not confirm whether the statement request completed. Check the statement status before requesting again.',
        ),
      );
    } finally {
      workerStatementBusy = false;
    }
  }

  onMount(() => {
    const scrollOperations = [
      'createPlanning',
      'updatePlanning',
      'cancelPlanning',
      'createSkill',
      'updateSkill',
      'deleteSkill',
      'setWorkerSkill',
      'deleteWorkerSkill',
    ];
    if (!planningFailure && !skillFailure) {
      for (const operation of scrollOperations) {
        try {
          sessionStorage.removeItem(workforceScrollKey(operation));
        } catch {
          break;
        }
      }
    }
    const markScrollIntent = () => {
      workforceScrollIntent = true;
    };
    const markFocusIntent = () => {
      workforceFocusIntent = true;
    };
    const markKeyScrollIntent = (event: KeyboardEvent) => {
      markFocusIntent();
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key))
        markScrollIntent();
    };
    const captureSubmit = (event: Event) => {
      const formElement = event.target;
      if (!(formElement instanceof HTMLFormElement)) return;
      if (!scrollOperations.includes(formElement.dataset.workforceOperation ?? '')) return;
      workforceFocusIntent = false;
      workforceScrollIntent = false;
      pendingWorkforceForm = formElement;
      pendingWorkforceSource = 'submit';
      rememberWorkforceScroll(formElement);
    };
    const captureFormData = (event: Event) => {
      const formElement = event.target;
      if (!(formElement instanceof HTMLFormElement)) return;
      if (!scrollOperations.includes(formElement.dataset.workforceOperation ?? '')) return;
      if (pendingWorkforceForm === formElement && pendingWorkforceSource === 'submit') return;
      workforceFocusIntent = false;
      workforceScrollIntent = false;
      pendingWorkforceForm = formElement;
      pendingWorkforceSource = 'formdata';
      rememberWorkforceScroll(formElement);
    };
    const capturePageHide = () => {
      if (!pendingWorkforceForm) return;
      try {
        if (
          !sessionStorage.getItem(
            workforceScrollKey(pendingWorkforceForm.dataset.workforceOperation ?? ''),
          )
        )
          rememberWorkforceScroll(pendingWorkforceForm);
      } catch {
        // The pre-navigation snapshot already failed to persist.
      }
    };
    document.addEventListener('submit', captureSubmit, true);
    document.addEventListener('formdata', captureFormData, true);
    window.addEventListener('pagehide', capturePageHide);
    window.addEventListener('wheel', markScrollIntent, { passive: true });
    window.addEventListener('touchmove', markScrollIntent, { passive: true });
    window.addEventListener('pointerdown', markFocusIntent, true);
    window.addEventListener('keydown', markKeyScrollIntent, true);
    const queryLocale = new URLSearchParams(location.search).get('lang');
    locale = resolveStandaloneLocale(queryLocale, data.locale);
    persistStandaloneLocale(locale);
    document.documentElement.lang = documentLanguage(locale);
    if (data.section === 'projects') {
      const requested = new URLSearchParams(location.search).get('action');
      if (
        requested &&
        [
          'new-client',
          'update-client',
          'new-project',
          'assign-worker',
          'update-assignment',
          'remove-assignment',
        ].includes(requested)
      ) {
        void focusProjectDestination(`[data-project-workflow="${requested}"]`);
      }
    }
    if (
      data.section === 'planning' &&
      location.hash === '#planning-create-form' &&
      planningFailure?.operation !== 'createPlanning'
    ) {
      void tick().then(() => {
        planningForm?.scrollIntoView({ block: 'start' });
        planningForm?.querySelector<HTMLInputElement>('input[name="startsAt"]')?.focus({
          preventScroll: true,
        });
      });
    }
    if (data.section === 'planning' && location.hash === '#planning-day-agenda') {
      void tick().then(() => {
        const agenda = document.getElementById('planning-day-agenda');
        agenda?.scrollIntoView({ block: 'start' });
        agenda?.focus({ preventScroll: true });
      });
    }
    if (location.hash === '#new-project') {
      const newProjectDetails = document.getElementById('new-project');
      if (newProjectDetails instanceof HTMLDetailsElement) newProjectDetails.open = true;
    }
    if (data.offlineEnabled !== false) {
      configureOfflineIdentity(data.user.id);
      stopOfflineController = offlineController.start();
    }
    if (data.section === 'pay' && data.pay) {
      restorePendingWorkerStatementRequest();
      void loadWorkerStatementArtifacts().then((status) => {
        if (status.pending) void pollWorkerStatementArtifacts();
        if (pendingWorkerStatementRequest) void checkPendingWorkerStatementRequest();
      });
    }
    // Only ask the passkey endpoint for a real authenticated Better Auth
    // session; otherwise its expected 401 would surface as a browser error.
    if (navigator.onLine)
      void authClient
        .getSession()
        .then((result) => {
          if (result.data?.user) void refreshPasskeys();
        })
        .catch(() => undefined);
    return () => {
      document.removeEventListener('submit', captureSubmit, true);
      document.removeEventListener('formdata', captureFormData, true);
      window.removeEventListener('pagehide', capturePageHide);
      window.removeEventListener('wheel', markScrollIntent);
      window.removeEventListener('touchmove', markScrollIntent);
      window.removeEventListener('pointerdown', markFocusIntent, true);
      window.removeEventListener('keydown', markKeyScrollIntent, true);
      stopOfflineController?.();
      stopOfflineController = null;
    };
  });
  $effect(() => {
    const projects = data.projects;
    if (
      data.user.id &&
      data.offlineEnabled !== false &&
      Array.isArray(projects) &&
      untrack(() => online)
    )
      void offlineController.cacheAssignments(projects, {
        authoritativeWorkerAccess: data.user.role === 'worker',
      });
  });
  $effect(() => {
    locale;
    if (typeof document !== 'undefined') {
      document.documentElement.lang = documentLanguage(locale);
    }
    queueMicrotask(() => {
      if (typeof document !== 'undefined') translatePortalDom(document.body, locale);
    });
  });
  async function logout() {
    persistStandaloneLocale(locale);
    // Stop background sync/listeners before revoking this browser's offline
    // identity. This prevents a queued request from racing with sign-out.
    stopOfflineController?.();
    stopOfflineController = null;
    await offlineController.forgetIdentity(data.user.id);
    try {
      await fetch(`${base}/app/api/auth/sign-out`, { method: 'POST' });
    } catch {
      // Navigation to login still revokes the local session when the network
      // is unavailable; no private offline state remains usable.
    }
    location.assign(`${base}/app/login`);
  }

  function changeLocale(event: Event): void {
    const selected = normalizePortalLocale((event.currentTarget as HTMLSelectElement).value);
    locale = selected;
    persistStandaloneLocale(selected);
    const url = new URL(location.href);
    url.searchParams.set('lang', selected);
    replaceState(url, {});
  }

  async function discardConflict(mutationId: string) {
    await offlineController.discardConflict(mutationId);
  }

  function offlineReviewHref(entityType: string): string {
    const section =
      entityType === 'time' ? 'time' : entityType === 'expense' ? 'expenses' : 'reports';
    return `${base}/app/${section}?lang=${locale}`;
  }
  async function refreshPasskeys(): Promise<void> {
    if (!navigator.onLine) return;
    try {
      const result = await authClient.passkey.listUserPasskeys();
      if (result.data) passkeys = result.data;
    } catch {
      // This background read can race with a network transition. Keep the
      // last known list and refresh it when the account page is opened online.
    }
  }

  async function registerPasskey(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    securityMessage = '';
    securitySucceeded = false;
    const result = await authClient.passkey.addPasskey({
      name: passkeyName.trim() || 'J&A Portal device',
    });
    if (result.error) {
      securityMessage = 'Passkey registration was not completed.';
      return;
    }
    passkeyName = '';
    securitySucceeded = true;
    securityMessage = 'Passkey registered for this account.';
    await refreshPasskeys();
  }

  async function revokePasskey(id: string): Promise<void> {
    securitySucceeded = false;
    const result = await authClient.passkey.deletePasskey({ id });
    if (result.error) {
      securityMessage = 'Passkey could not be revoked.';
      return;
    }
    securitySucceeded = true;
    securityMessage = 'Passkey revoked.';
    await refreshPasskeys();
  }

  async function showMfaProblem(problem: ProblemData): Promise<void> {
    mfaProblem = problem;
    await tick();
    const notice = document.querySelector<HTMLElement>(
      '[data-profile-mfa-problem] [data-ui="problem-notice"]',
    );
    notice?.focus({ preventScroll: true });
    // Keep the focused explanation clear of the fixed mobile navigation and toasts.
    notice?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }

  function reviewCurrentMfaStatus(event: MouseEvent): void {
    event.preventDefault();
    window.location.reload();
  }

  async function toggleMfa(action: 'enable' | 'verify' | 'disable'): Promise<void> {
    if (mfaBusy || mfaNeedsReview || (action === 'enable' && mfaSetupUri)) return;
    mfaBusy = true;
    mfaProblem = null;
    securityMessage = '';
    securitySucceeded = false;
    try {
      const response = await fetch(`${base}/app/api/security/mfa`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          ...(action === 'verify' ? { code: mfaCode } : {}),
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        totpURI?: string;
        backupCodes?: string[];
      } | null;
      if (!response.ok) {
        await showMfaProblem(mfaProblemFromResponse(result) ?? mfaUncertainProblem());
        return;
      }
      if (action === 'enable') {
        if (!result?.totpURI || !Array.isArray(result.backupCodes) || !result.backupCodes.length) {
          await showMfaProblem(mfaUncertainProblem());
          return;
        }
        mfaSetupUri = result.totpURI;
        mfaBackupCodes = result.backupCodes;
        securityMessage = 'MFA setup started.';
      } else if (action === 'verify') {
        mfaCode = '';
        mfaSetupUri = '';
        mfaBackupCodes = [];
        mfaEnrolled = true;
        securityMessage = 'MFA enabled.';
      } else {
        mfaEnrolled = false;
        securityMessage = 'MFA disabled.';
      }
      securitySucceeded = true;
    } catch {
      await showMfaProblem(mfaUncertainProblem());
    } finally {
      mfaBusy = false;
    }
  }

  function verifyMfa(event: SubmitEvent): void {
    event.preventDefault();
    void toggleMfa('verify');
  }

  type OfflineEntity = 'time' | 'daily_report' | 'technical_report' | 'expense';

  type OfflineDraftSaveResult = { saved: boolean; error?: string };

  function offlineDraftStorageError(error: unknown): string {
    if (
      error instanceof Error &&
      (/^(?:Authenticated offline identity|Offline identity |Offline identity response)/u.test(
        error.message,
      ) ||
        (error instanceof TypeError &&
          /^(?:Failed to fetch|NetworkError when attempting to fetch resource\.|Load failed)$/iu.test(
            error.message,
          )))
    )
      return 'Your offline session is unavailable. Your entries are still here. Reconnect and sign in before saving.';
    if (error instanceof DOMException && error.name === 'QuotaExceededError')
      return 'This browser has reached its offline storage limit. Your entries are still here. Free up browser storage, then try saving again or reconnect and save online.';
    if (error instanceof DOMException && error.name === 'SecurityError')
      return 'Browser storage is unavailable. Your entries are still here. Enable site storage or reconnect and save online.';
    return 'The offline draft could not be stored on this device. Your entries are still here. Check browser storage, then try again or reconnect and save online.';
  }

  function clearPreviousLocalSaveToast(): void {
    if (
      syncMessage === 'Offline — saved on this device' ||
      syncMessage === 'Offline draft could not be saved on this device.'
    )
      syncMessage = '';
  }

  async function saveOfflineDraft(
    event: SubmitEvent,
    entityType: OfflineEntity,
  ): Promise<OfflineDraftSaveResult> {
    if (online) return { saved: false };
    event.preventDefault();
    const formElement = event.currentTarget as HTMLFormElement;
    const formData = new FormData(formElement);
    const projectId = formValue(formData, 'projectId');
    if (!projectId) {
      clearPreviousLocalSaveToast();
      return {
        saved: false,
        error: 'Select a project before saving this offline draft. Your entries are still here.',
      };
    }
    const payload =
      entityType === 'time'
        ? compact({
            projectId,
            workDate: formValue(formData, 'workDate'),
            category: formValue(formData, 'category'),
            activityCode: formValue(formData, 'activityCode'),
            minutes: formNumber(formData, 'minutes') ?? 0,
            startTime: formValue(formData, 'startTime'),
            endTime: formValue(formData, 'endTime'),
            breakMinutes: formNumber(formData, 'breakMinutes') ?? 0,
            summary: formValue(formData, 'summary'),
          })
        : entityType === 'daily_report'
          ? compact({
              projectId,
              workDate: formValue(formData, 'workDate'),
              siteShift: formValue(formData, 'siteShift'),
              summary: formValue(formData, 'summary'),
              tasksCompleted: formValue(formData, 'tasksCompleted'),
              problemsFound: formValue(formData, 'problemsFound'),
              correctiveActions: formValue(formData, 'correctiveActions'),
              clientDecisions: formValue(formData, 'clientDecisions'),
              downtimeMinutes: formNumber(formData, 'downtimeMinutes') ?? 0,
              standbyReason: formValue(formData, 'standbyReason'),
              blockers: formValue(formData, 'blockers'),
              openItems: formValue(formData, 'openItems'),
              nextDayPlan: formValue(formData, 'nextDayPlan'),
              safetyRelated: formBoolean(formData, 'safetyRelated'),
              customerContact: formValue(formData, 'customerContact'),
            })
          : entityType === 'technical_report'
            ? compact({
                projectId,
                reportDate: formValue(formData, 'reportDate'),
                systemName: formValue(formData, 'systemName'),
                plantSite: formValue(formData, 'plantSite'),
                areaLine: formValue(formData, 'areaLine'),
                stationMachine: formValue(formData, 'stationMachine'),
                systemType: formValue(formData, 'systemType'),
                plcPlatform: formValue(formData, 'plcPlatform'),
                controller: formValue(formData, 'controller'),
                hmiScada: formValue(formData, 'hmiScada'),
                networkProtocol: formValue(formData, 'networkProtocol'),
                softwareVersion: formValue(formData, 'softwareVersion'),
                programReference: formValue(formData, 'programReference'),
                problemSymptom: formValue(formData, 'problemSymptom'),
                diagnosisRootCause: formValue(formData, 'diagnosisRootCause'),
                changePerformed: formValue(formData, 'changePerformed'),
                safetyRelated: formBoolean(formData, 'safetyRelated'),
                productionImpact: formValue(formData, 'productionImpact'),
                validation: formValue(formData, 'validation'),
                validationResult: formValue(formData, 'validationResult'),
                openRisk: formValue(formData, 'openRisk'),
                rollbackPlan: formValue(formData, 'rollbackPlan'),
              })
            : compact({
                projectId,
                spentOn: formValue(formData, 'spentOn'),
                vendor: formValue(formData, 'vendor'),
                category: formValue(formData, 'category'),
                description: formValue(formData, 'description'),
                currency: formValue(formData, 'currency'),
                amountMinor: decimalToMinor(formValue(formData, 'amount')),
                projectCurrencyAmountMinor: formValue(formData, 'projectCurrencyAmountMinor'),
                fxRateBps: formNumber(formData, 'fxRateBps'),
                taxAmountMinor: formValue(formData, 'taxAmountMinor'),
                whoPaid: formValue(formData, 'whoPaid'),
                clientTreatment: formValue(formData, 'clientTreatment'),
                billingTreatment: formValue(formData, 'billingTreatment'),
                markupBps: formNumber(formData, 'markupBps'),
                paymentMethod: formValue(formData, 'paymentMethod'),
                receiptRequired: formBoolean(formData, 'receiptRequired'),
              });
    try {
      const attachmentFiles: OfflineAttachment[] = [];
      if (entityType === 'expense') {
        const receipt = formData.get('receipt');
        if (receipt instanceof File && receipt.size > 0) {
          const id = crypto.randomUUID();
          attachmentFiles.push({
            id,
            fileName: receipt.name || 'receipt',
            mediaType: receipt.type,
            bytes: await receipt.arrayBuffer(),
          });
          payload.receiptRequired = true;
        }
      }
      const mutationId = crypto.randomUUID();
      const existingEntityId = formElement.dataset.entityId;
      const existingVersion = Number(formElement.dataset.version);
      await queueMutation(
        {
          mutationId,
          entityType,
          entityId: existingEntityId || crypto.randomUUID(),
          baseVersion: existingEntityId && Number.isInteger(existingVersion) ? existingVersion : 0,
          createdAt: new Date().toISOString(),
          payload,
          attachments: attachmentFiles.map((attachment) => attachment.id),
        },
        attachmentFiles,
      );
      // The IndexedDB transaction has committed. A queue-count refresh must not
      // turn a confirmed local save into a failure that invites a duplicate draft.
      await offlineController.refreshQueue().catch(() => undefined);
      syncMessage = 'Offline — saved on this device';
      formElement.reset();
      return { saved: true };
    } catch (error) {
      clearPreviousLocalSaveToast();
      return { saved: false, error: offlineDraftStorageError(error) };
    }
  }

  function printReport(): void {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.print();
    window.setTimeout(() => {
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    }, 0);
  }

  function auditUtcIso(value: unknown): string | undefined {
    const raw = String(value ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(raw) &&
      !Number.isNaN(Date.parse(raw))
      ? raw
      : undefined;
  }

  function auditTimestampLabel(value: unknown): string {
    const utc = auditUtcIso(value);
    return utc ? `${utc.replace('T', ' ').slice(0, 19)} UTC` : String(value ?? '').trim() || '—';
  }

  function auditDetailsDisplay(value: unknown): string {
    const raw = String(value ?? '{}');
    try {
      JSON.parse(raw);
    } catch {
      return raw;
    }
    // Format the original tokens instead of parsing and serializing them:
    // JSON numbers may exceed JavaScript's safe integer range.
    let output = '';
    let depth = 0;
    let quoted = false;
    let escaped = false;
    const indent = () => '  '.repeat(depth);
    for (let index = 0; index < raw.length; index += 1) {
      const character = raw[index];
      if (quoted) {
        output += character;
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') {
        quoted = true;
        output += character;
      } else if (character === '{' || character === '[') {
        depth += 1;
        output += character;
        if (raw[index + 1] !== (character === '{' ? '}' : ']')) output += `\n${indent()}`;
      } else if (character === '}' || character === ']') {
        depth = Math.max(0, depth - 1);
        if (raw[index - 1] !== (character === '}' ? '{' : '[')) output += `\n${indent()}`;
        output += character;
      } else if (character === ',') {
        output += `,\n${indent()}`;
      } else if (character === ':') {
        output += ': ';
      } else if (!/\s/u.test(character)) {
        output += character;
      }
    }
    return output;
  }
</script>

<svelte:head
  ><title>{translate(currentTitle)} | J&A Portal</title><link
    rel="manifest"
    href={`${base}/app/manifest.webmanifest`}
  /><meta name="theme-color" content="#10202f" /></svelte:head
>
<a class="skip-link" href="#portal-main">{translate('Skip to main content')}</a>
<div class="portal-layout">
  <PortalChrome
    {base}
    {data}
    {navigation}
    {secondaryNavigation}
    {visibleAdmin}
    {securityAdmin}
    {showAdmin}
    {isManager}
    {isFinance}
    {canAudit}
    {menuOpen}
    {online}
    {queue}
    {syncMessage}
    {locale}
    {translate}
    {itemHref}
    {initials}
    {logout}
    {changeLocale}
    onMenuToggle={() => (menuOpen = !menuOpen)}
    onCloseMenu={() => (menuOpen = false)}
  />
  <main id="portal-main">
    <header class="print-only-header" aria-hidden="true">
      <div class="print-identity">
        <img src={`${base}/app/logo.png`} alt="J&A Automation" />
        <small>{translate('INDUSTRIAL AUTOMATION · FIELD SERVICES')}</small>
      </div>
      <div class="print-meta">
        <span data-portal-live-text
          >{portalText(locale, 'Report: {title}', { title: translate(currentTitle) })}</span
        >
        <strong>{new Date().toISOString().slice(0, 10)}</strong>
      </div>
    </header>
    <div class="portal-title">
      <div>
        <p class="portal-kicker" data-portal-live-text>J&A / {translate(currentTitle)}</p>
        <h1 data-portal-live-text>{translate(currentTitle)}</h1>
      </div>
      <div class="portal-heading-tools">
        <button type="button" class="no-print print-trigger" onclick={printReport}>
          <PrintIcon />
          {translate('Print report')}
        </button>
        {#if canUseGlobalSearch}
          <form
            class="global-search"
            method="GET"
            action={$page.url.pathname}
            role="search"
            onsubmit={submitGlobalSearch}
          >
            {#each Array.from($page.url.searchParams.entries()).filter(([queryName]) => queryName !== 'q' && !queryName.startsWith('/')) as [queryName, queryValue]}
              <input type="hidden" name={queryName} value={queryValue} data-search-context />
            {/each}
            <label class="visually-hidden" for="portal-global-search"
              >{translate('Search workspace')}</label
            >
            <input
              bind:this={searchInput}
              id="portal-global-search"
              name="q"
              bind:value={searchValue}
              role="combobox"
              aria-autocomplete="list"
              aria-controls="portal-search-popover"
              aria-expanded={searchOpen}
              placeholder={translate('Search projects, people, invoices…')}
              autocomplete="off"
              onfocus={() => (searchOpen = true)}
              oninput={() => (searchOpen = true)}
              onkeydown={handleSearchKeydown}
              onblur={() => setTimeout(() => (searchOpen = false), 200)}
            />
            <button type="submit">{translate('Search')}</button>
            {#if searchOpen}
              <div
                id="portal-search-popover"
                class="search-popover"
                role="listbox"
                aria-label={translate('Search recommendations')}
              >
                <div class="search-popover-heading">
                  <span
                    >{searchTerm
                      ? translate('Matching records')
                      : translate('Recommended records')}</span
                  >
                  <small>{translate('Only records in your access scope')}</small>
                </div>
                {#each groupedSearchSuggestions as group}
                  <div
                    class="search-popover-group"
                    role="group"
                    aria-labelledby={`search-group-${group.key}`}
                  >
                    <h3 id={`search-group-${group.key}`} class="search-popover-group-label">
                      {group.label}
                    </h3>
                    {#each group.rows as suggestion, suggestionIndex}
                      {@const optionIndex =
                        groupedSearchSuggestions
                          .slice(0, groupedSearchSuggestions.indexOf(group))
                          .reduce((count, item) => count + item.rows.length, 0) + suggestionIndex}
                      <a
                        id={`search-option-${optionIndex}`}
                        class="search-popover-item"
                        href={searchHref(suggestion)}
                        aria-label={expenseSearchAccessibleLabel(suggestion, group.label)}
                        role="option"
                        aria-selected="false"
                        onclick={() => setTimeout(() => (searchOpen = false), 0)}
                        onkeydown={(event) => handleSearchOptionKeydown(event, optionIndex)}
                      >
                        <span>
                          <strong>{String(suggestion.label ?? translate('Record'))}</strong>
                          <small>{searchResultDescription(suggestion, group.label)}</small>
                        </span>
                        <DirectionIcon direction="up-right" class="search-popover-arrow" />
                      </a>
                    {/each}
                  </div>
                {:else}
                  <p class="search-popover-empty">
                    {translate(
                      'No recommendation matches. Press Enter to search all authorized records.',
                    )}
                  </p>
                {/each}
              </div>
            {/if}
          </form>
        {/if}
      </div>
    </div>
    {#if assignmentCacheMessage}
      <p class="alert warn no-print" role="alert" data-assignment-cache-warning>
        {translate(assignmentCacheMessage)}
      </p>
    {/if}
    {#if globalProblem}
      <ProblemNotice
        problem={globalProblem}
        kind={globalProblem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
        remedyLinks={globalRemedyLinks}
      />
    {/if}
    {#if conflictItems.length > 0}
      <section class="conflict-panel" aria-labelledby="offline-conflicts-title">
        <div>
          <span class="portal-kicker">{translate('OFFLINE REVIEW')}</span>
          <h2 id="offline-conflicts-title">{translate('Offline drafts need your review')}</h2>
          <p>
            {translate(
              'Check saved records before discarding a local draft. A sync result may be uncertain or a server record may have changed.',
            )}
          </p>
        </div>
        <div class="conflict-list">
          {#each conflictItems as conflict}
            <div class="conflict-item">
              <span
                >{conflict.entityType.replaceAll('_', ' ')} · {conflict.createdAt
                  .slice(0, 16)
                  .replace('T', ' ')}</span
              >
              <span>
                {translate(
                  conflict.state === 'needs_review'
                    ? 'Draft needs checking'
                    : conflict.state === 'rejected'
                      ? 'Draft was rejected'
                      : 'Server record changed',
                )}
              </span>
              {#if conflict.state === 'needs_review'}
                <p>{translate(offlineReviewReasonMessage(conflict.reviewReason))}</p>
              {/if}
              <a href={offlineReviewHref(conflict.entityType)}>
                {translate('Check saved records')}
              </a>
              {#if conflict.state === 'needs_review'}
                <button
                  type="button"
                  class="text-button"
                  onclick={() => offlineController.retryReview(conflict.mutationId)}
                >
                  {translate('Retry this draft after review')}
                </button>
              {/if}
              <button
                type="button"
                class="text-button"
                onclick={() => discardConflict(conflict.mutationId)}
              >
                {translate('Discard local draft')}
              </button>
            </div>
          {/each}
        </div>
      </section>
    {/if}
    {#if canUseGlobalSearch && (data.searchQuery ?? '').length >= 2}
      <section class="record-list full search-results" aria-live="polite">
        <div class="panel-title">
          <h2>{translate('Search results')}</h2>
          <span>{data.searchResults?.length ?? 0} {translate('matches')}</span>
        </div>
        {#each groupedSearchResults as group}
          <div class="search-result-group" role="group" aria-label={group.label}>
            <h3>{group.label}</h3>
            {#each group.rows as result}
              <a
                class="search-result"
                href={searchHref(result)}
                aria-label={expenseSearchAccessibleLabel(result, group.label)}
              >
                <strong>{String(result.label ?? translate('Result'))}</strong>
                <small>{searchResultDescription(result, group.label)}</small>
              </a>
            {/each}
          </div>
        {:else}
          <div class="empty">{translate('No records match that search in your access scope.')}</div>
        {/each}
      </section>
    {/if}

    {#if data.section === 'today'}
      <TodaySection
        {locale}
        {base}
        {data}
        {availableProjects}
        {online}
        {queue}
        {syncMessage}
        money={(minor, currency) => paymentMoney(minor, currency, documentLanguage(locale))}
        {translate}
        {controlledValue}
        canCreateProject={canManageProjects}
        canCreateInvoiceDraft={canManageProjects}
        {invoiceDraftHref}
        canViewPendingReports={Boolean(data.dashboard)}
      />
    {:else if data.section === 'time'}
      <TimeSection
        {locale}
        {data}
        {isAuditor}
        {availableProjects}
        {saveOfflineDraft}
        {translate}
        {controlledValue}
      />
    {:else if data.section === 'expenses'}
      <ExpenseSection
        {data}
        {isAuditor}
        {availableProjects}
        {saveOfflineDraft}
        {translate}
        {controlledValue}
      />
    {:else if data.section === 'reports'}
      <ReportSection
        {data}
        {locale}
        {isAuditor}
        {availableProjects}
        {saveOfflineDraft}
        {translate}
        {controlledValue}
      />
    {:else if data.section === 'documents'}
      {#if data.user.role === 'owner_admin'}<a href={`${base}/app/manage?area=document`}
          >{translate('Data management')} <DirectionIcon /></a
        >{/if}
      <div class="document-workspace">
        <SectionCard
          id="document-upload"
          collapsible
          title={translate(isAuditor ? 'Review private artifacts' : 'Register a private artifact')}
          class="document-upload-panel"
          expanded={documentResult?.actionName === 'uploadPrivateDocument'}
        >
          <div class="panel-title">
            <div>
              <p class="form-help">
                {translate(
                  'Receipts, PLC backups and project reports are validated, hashed and kept outside the public site.',
                )}
              </p>
              {#if isAuditor}
                <p class="form-help">
                  {translate(
                    'Review registered private artifacts here. Ask an authorized project user to upload new evidence.',
                  )}
                </p>
              {/if}
            </div>
          </div>
          {#if !isAuditor}
            <form
              bind:this={documentUploadForm}
              method="POST"
              action="?/uploadPrivateDocument"
              enctype="multipart/form-data"
              use:formValidation
              use:rememberDocumentScroll
            >
              <input type="hidden" name="viewportScrollY" value="0" />
              {#if documentResult?.actionName === 'uploadPrivateDocument' && documentProblem}
                <ProblemNotice problem={documentProblem} remedyLinks={globalRemedyLinks} />
                <p class="form-help">{translate('Attach the file again before retrying.')}</p>
              {/if}
              <FormSection title={translate('Artifact details')}>
                <FieldGroup columns="2">
                  <Field
                    id="doc-project"
                    label={translate('Project')}
                    required
                    data-field="projectId"
                  >
                    <select
                      id="doc-project"
                      name="projectId"
                      value={documentResult?.actionName === 'uploadPrivateDocument'
                        ? (documentFormValues.projectId ?? '')
                        : String(data.selectedDocumentProject?.id ?? '')}
                      required
                    >
                      <option value="">{translate('Select project')}</option>
                      {#each availableProjects as project}
                        <option value={project.id}>{project.project_number} — {project.name}</option
                        >
                      {/each}
                    </select>
                  </Field>
                  <Field
                    id="doc-type"
                    label={translate('Artifact type')}
                    required
                    data-field="artifactType"
                  >
                    <input
                      id="doc-type"
                      name="artifactType"
                      placeholder={translate('PLC backup, engineering report')}
                      value={documentResult?.actionName === 'uploadPrivateDocument'
                        ? (documentFormValues.artifactType ?? '')
                        : ''}
                      required
                    />
                  </Field>
                  {#if canManageProjects}
                    <Field
                      id="doc-classification"
                      label={translate('Document access')}
                      data-field="artifactClassification"
                    >
                      <select
                        id="doc-classification"
                        name="artifactClassification"
                        value={documentResult?.actionName === 'uploadPrivateDocument'
                          ? (documentFormValues.artifactClassification ?? 'standard')
                          : 'standard'}
                      >
                        <option value="standard">{translate('Project document')}</option>
                        <option value="finance"
                          >{translate('Finance, Owner and Auditor only')}</option
                        >
                      </select>
                    </Field>
                  {/if}
                  <Field
                    id="doc-sensitivity"
                    label={translate('Sensitivity')}
                    data-field="sensitivity"
                  >
                    <select
                      id="doc-sensitivity"
                      name="sensitivity"
                      value={documentResult?.actionName === 'uploadPrivateDocument'
                        ? (documentFormValues.sensitivity ?? 'internal')
                        : 'internal'}
                    >
                      <option value="internal">{translate('Internal')}</option>
                      <option value="sensitive">{translate('Sensitive')}</option>
                      <option value="customer_private">{translate('Customer private')}</option>
                    </select>
                  </Field>
                  <Field
                    id="doc-description"
                    label={translate('Description')}
                    required
                    data-field="description"
                  >
                    <textarea
                      id="doc-description"
                      name="description"
                      value={documentResult?.actionName === 'uploadPrivateDocument'
                        ? (documentFormValues.description ?? '')
                        : ''}
                      required
                      placeholder={translate('What this artifact contains and why it is retained')}
                    ></textarea>
                  </Field>
                  <Field id="doc-file" label={translate('File')} required data-field="file">
                    <input
                      id="doc-file"
                      name="file"
                      type="file"
                      accept="application/pdf,application/zip,image/jpeg,image/png,image/webp,image/heic,image/heif,text/plain"
                      capture="environment"
                      required
                    />
                  </Field>
                </FieldGroup>
                <div class="form-actions">
                  <button>{translate('Upload and register hash')}</button>
                </div>
              </FormSection>
            </form>
          {/if}
        </SectionCard>
        {#if documentResult?.actionName === 'archiveDocument' && documentProblem && !documentPage.some((entry) => String(entry.id) === documentFormValues.documentId)}
          <ProblemNotice problem={documentProblem} remedyLinks={globalRemedyLinks} />
        {/if}
        <section id="document-list" class="record-list full">
          <div class="panel-title">
            <div>
              <h2>{translate('Private project documents')}</h2>
              {#if data.selectedDocumentProject}
                <p class="form-help">
                  {String(data.selectedDocumentProject.project_number)} — {String(
                    data.selectedDocumentProject.name,
                  )}
                  · <a href={`${base}/app/documents#document-list`}>{translate('All projects')}</a>
                </p>
              {/if}
              <p class="form-help">
                {translate(
                  isAuditor
                    ? 'Registered documents remain available as evidence. Authorized project users upload corrections as new documents; the original stays in the audit history.'
                    : 'Registered documents are retained as evidence. Upload a corrected file as a new document; the original stays available in the audit history.',
                )}
              </p>
              <p class="form-help">
                {translate('Files are private, hash-verified, and authorized on every download.')}
              </p>
            </div>
            <span
              >{data.documents?.length ?? 0}
              {translate((data.documents?.length ?? 0) === 1 ? 'file' : 'files')}</span
            >
          </div>
          {#if (data.documents?.length ?? 0) > 0}
            <RecordBrowser
              rows={data.documents ?? []}
              bind:visible={documentPage}
              {translate}
              label="Private project documents"
              contextKey={String(data.selectedDocumentProject?.id ?? 'all')}
              statusless
            />
          {/if}
          {#each (data.documents?.length ?? 0) > 0 ? documentPage : [] as document}<article
              class="invoice-row document-entry"
            >
              <div>
                <strong
                  >{String(
                    document.safe_filename ?? document.original_filename ?? translate('Document'),
                  )}</strong
                >
                <small
                  >{document.project_number
                    ? String(document.project_number)
                    : translate('Private')} · {String(document.artifact_type)} ·
                  {document.byte_length == null
                    ? ''
                    : `${String(document.byte_length)} bytes`}</small
                >
              </div>
              <div class="record-actions">
                <span class="state-tag">{String(document.sensitivity ?? 'internal')}</span>
                <a
                  class="preview-link"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`${base}/app/api/documents/${String(document.id)}?view=1`}
                  aria-disabled={documentTransferBusy}
                  onclick={(event) => transferPrivateDocument(event, document, 'view')}
                  onauxclick={(event) => {
                    if (event.button === 1) void transferPrivateDocument(event, document, 'view');
                  }}>{translate('View')}</a
                >
                <a
                  class="preview-link"
                  href={`${base}/app/api/documents/${String(document.id)}`}
                  aria-disabled={documentTransferBusy}
                  onclick={(event) => transferPrivateDocument(event, document, 'download')}
                  onauxclick={(event) => {
                    if (event.button === 1)
                      void transferPrivateDocument(event, document, 'download');
                  }}>{translate('Download')}</a
                >
                {#if data.user.role === 'owner_admin' || (data.user.role !== 'auditor_read_only' && (data.user.id === document.owner_id || document.can_archive === true))}
                  <details
                    class="document-archive-control"
                    open={documentResult?.actionName === 'archiveDocument' &&
                      documentFormValues.documentId === String(document.id)}
                  >
                    <summary>{translate('Archive')}</summary>
                    <form
                      method="POST"
                      action="?/archiveDocument"
                      class="document-delete-form"
                      use:formValidation
                      use:rememberDocumentScroll
                    >
                      <input type="hidden" name="viewportScrollY" value="0" />
                      {#if documentResult?.actionName === 'archiveDocument' && documentProblem && documentFormValues.documentId === String(document.id)}
                        <ProblemNotice problem={documentProblem} remedyLinks={globalRemedyLinks} />
                      {/if}
                      <input type="hidden" name="documentId" value={String(document.id)} />
                      <label
                        >{translate('Archive reason')}
                        <input
                          name="reason"
                          value={documentResult?.actionName === 'archiveDocument' &&
                          documentFormValues.documentId === String(document.id)
                            ? (documentFormValues.reason ?? '')
                            : ''}
                          minlength="3"
                          maxlength="500"
                          required
                        />
                      </label>
                      <button type="submit" class="preview-link preview-link-danger"
                        >{translate('Archive document')}</button
                      >
                    </form>
                  </details>
                {/if}
              </div>
              {#if documentTransferFailure?.id === String(document.id)}
                <div id="document-download-problem" class="document-download-feedback">
                  <ProblemNotice
                    problem={documentTransferFailure.problem}
                    remedyLinks={documentDownloadRemedyLinks}
                  />
                  {#if documentTransferFailure.problem.remedies.some((remedy) => remedy.id === 'retry_download')}
                    <button
                      type="button"
                      class="preview-link"
                      disabled={documentTransferBusy}
                      onclick={(event) =>
                        transferPrivateDocument(
                          event,
                          document,
                          documentTransferFailure?.mode ?? 'download',
                        )}
                      >{documentTransferFailure.mode === 'view'
                        ? translate('View')
                        : documentTransferFailure.problem.code === 'DOCUMENT_PREVIEW_POPUP_BLOCKED'
                          ? translate('Download')
                          : portalText(locale, 'problem.expenseExport.retryDownload')}</button
                    >
                  {/if}
                  {#if documentTransferFailure.problem.correlationId && documentTransferFailure.problem.code === 'DOCUMENT_DOWNLOAD_INVALID_RESPONSE'}
                    <small
                      >{portalText(locale, 'problem.error.reference', {
                        correlationId: documentTransferFailure.problem.correlationId,
                      })}</small
                    >
                  {/if}
                </div>
              {/if}
            </article>{:else}
            {#if (data.documents?.length ?? 0) === 0}
              <div class="empty">
                {translate('No private documents are available in your access scope.')}
              </div>
            {/if}
          {/each}
        </section>
      </div>
    {:else if data.section === 'pay'}
      {#if payPeriodProblem}
        <ProblemNotice
          problem={payPeriodProblem}
          remedyLinks={{
            correct_fields: {
              label: portalText(locale, 'problem.remedy.correctFields'),
              href: payPeriodProblem.fieldErrors.start ? '#pay-period-start' : '#pay-period-end',
            },
          }}
        />
      {/if}
      <form class="filter-form" method="GET">
        <input type="hidden" name="lang" value={locale} />
        <label for="pay-period-start">
          {translate('From')}
          <input
            id="pay-period-start"
            name="start"
            type={payPeriodProblem?.fieldErrors.start ? 'text' : 'date'}
            inputmode={payPeriodProblem?.fieldErrors.start ? 'numeric' : undefined}
            value={data.periodStart}
            required
            aria-invalid={Boolean(payPeriodProblem?.fieldErrors.start)}
            aria-describedby={payPeriodProblem?.fieldErrors.start
              ? 'pay-period-start-error'
              : undefined}
          />
          {#if payPeriodProblem?.fieldErrors.start}
            <small id="pay-period-start-error" class="field-error"
              >{payPeriodProblem.fieldErrors.start
                .map((key) => portalText(locale, key))
                .join(' ')}</small
            >
          {/if}
        </label>
        <label for="pay-period-end">
          {translate('Through')}
          <input
            id="pay-period-end"
            name="end"
            type={payPeriodProblem?.fieldErrors.end?.includes('problem.pay.endInvalid')
              ? 'text'
              : 'date'}
            inputmode={payPeriodProblem?.fieldErrors.end ? 'numeric' : undefined}
            value={data.periodEnd}
            required
            aria-invalid={Boolean(payPeriodProblem?.fieldErrors.end)}
            aria-describedby={payPeriodProblem?.fieldErrors.end
              ? 'pay-period-end-error'
              : undefined}
          />
          {#if payPeriodProblem?.fieldErrors.end}
            <small id="pay-period-end-error" class="field-error"
              >{payPeriodProblem.fieldErrors.end
                .map((key) => portalText(locale, key))
                .join(' ')}</small
            >
          {/if}
        </label>
        <button>{translate('Apply period')}</button>
      </form>
      {#if data.pay && !payPeriodProblem}
        <section class="record-list full pay-export-actions" aria-labelledby="pay-export-title">
          <div class="panel-title">
            <div>
              <h2 id="pay-export-title">{translate('Worker statement')}</h2>
              <p class="form-help">
                {translate(
                  'Download your own activity, compensation, settlement, and reimbursement statement for this period.',
                )}
              </p>
            </div>
            <div class="record-actions">
              {#if pendingWorkerStatementRequest}
                <button
                  type="button"
                  class="preview-link"
                  disabled={workerStatementBusy}
                  onclick={() => void checkPendingWorkerStatementRequest()}
                  >{portalText(locale, 'problem.workerStatement.checkStatus')}</button
                >
                {#if workerStatementRequestChecked}
                  <button
                    type="button"
                    class="preview-link"
                    disabled={workerStatementBusy || workerStatementPolling}
                    onclick={() => void retrySameWorkerStatementRequest()}
                    >{portalText(locale, 'problem.workerStatement.retrySameRequest')}</button
                  >
                {/if}
              {:else}
                <button
                  type="button"
                  class="preview-link"
                  disabled={workerStatementBusy || workerStatementPolling}
                  aria-busy={workerStatementBusy || workerStatementPolling}
                  onclick={() => void requestWorkerStatement()}
                  >{translate('Generate report')}</button
                >
              {/if}
              {#each ['pdf', 'csv'] as format}
                {@const artifact = workerStatementArtifact(format as WorkerStatementFormat)}
                {#if artifact?.status === 'ready' && !workerStatementStatusUnknownIds.includes(artifact.artifactId)}
                  <a
                    class="preview-link"
                    aria-label={format === 'pdf'
                      ? translate('Download worker statement PDF')
                      : translate('Download worker statement CSV')}
                    aria-disabled={workerStatementDownloadBusy}
                    href={`${base}/app/api/worker-statement/artifacts/${encodeURIComponent(artifact.artifactId)}/download`}
                    onclick={(event) => void downloadWorkerStatement(event, artifact)}
                    onauxclick={(event) => {
                      if (event.button === 1) void downloadWorkerStatement(event, artifact);
                    }}>{translate(format.toUpperCase())} · {translate('Ready')}</a
                  >
                  {#if format === 'pdf'}
                    <button
                      type="button"
                      class="preview-link"
                      aria-expanded={workerStatementPreviewId === artifact.artifactId}
                      onclick={() => {
                        workerStatementPreviewId =
                          workerStatementPreviewId === artifact.artifactId
                            ? null
                            : artifact.artifactId;
                      }}
                      >{workerStatementPreviewId === artifact.artifactId
                        ? locale === 'es'
                          ? 'Cerrar vista previa'
                          : locale === 'pt'
                            ? 'Fechar prévia'
                            : 'Close PDF preview'
                        : locale === 'es'
                          ? 'Vista previa del PDF guardado'
                          : locale === 'pt'
                            ? 'Prévia do PDF salvo'
                            : 'Preview saved PDF'}</button
                    >
                  {/if}
                {:else if artifact}
                  <span
                    class="state-tag"
                    data-ui="status-badge"
                    data-variant={artifact.status === 'failed' ? 'danger' : 'warning'}
                    >{translate(format.toUpperCase())} · {workerStatementStatusUnknownIds.includes(
                      artifact.artifactId,
                    )
                      ? portalText(locale, 'problem.workerStatement.checkStatus')
                      : controlledValue('artifactState', artifact.status)}</span
                  >
                  {#if canRetryWorkerStatement(artifact)}
                    <button
                      type="button"
                      class="preview-link"
                      disabled={workerStatementBusy || workerStatementPolling}
                      onclick={() => void retryWorkerStatement(artifact)}
                      >{portalText(locale, 'problem.workerStatement.retryAction')}
                      {translate(format.toUpperCase())}</button
                    >
                  {/if}
                {/if}
              {/each}
            </div>
          </div>
          {#if workerStatementPreviewId && workerStatementArtifact('pdf')?.artifactId === workerStatementPreviewId && workerStatementArtifact('pdf')?.status === 'ready' && !workerStatementStatusUnknownIds.includes(workerStatementPreviewId)}
            <ActualPdfPreview
              src={`${base}/app/api/worker-statement/artifacts/${encodeURIComponent(workerStatementPreviewId)}/download`}
              {locale}
              onFailure={(payload, status, reference) =>
                showWorkerStatementProblem(
                  workerStatementDownloadProblem(payload, reference) ??
                    workerStatementDownloadFallback(
                      status === 401 ? 'signIn' : 'invalid',
                      reference,
                    ),
                  'download',
                )}
            />
            <p class="form-help">
              {locale === 'es'
                ? 'Los valores del extracto provienen de sus registros guardados. Revise las horas o los gastos de origen y genere una nueva versión para reflejar los cambios autorizados.'
                : locale === 'pt'
                  ? 'Os valores do demonstrativo vêm dos seus registros salvos. Revise as horas ou despesas de origem e gere uma nova versão para refletir alterações autorizadas.'
                  : 'Statement values come from your saved records. Review source time or expenses and generate a new version to reflect authorized changes.'}
              <a
                href={`${base}/app/time?from=${encodeURIComponent(data.periodStart)}&to=${encodeURIComponent(data.periodEnd)}`}
                >{translate('Time')}</a
              >
              ·
              <a
                href={`${base}/app/expenses?from=${encodeURIComponent(data.periodStart)}&to=${encodeURIComponent(data.periodEnd)}`}
                >{translate('Expenses')}</a
              >
            </p>
          {/if}
          {#if workerStatementProblem}
            <ProblemNotice
              problem={workerStatementProblem.code === 'WORKER_STATEMENT_DOWNLOAD_STATUS_UNKNOWN'
                ? { ...workerStatementProblem, remedies: [] }
                : workerStatementProblem}
              {locale}
              kind={!workerStatementDownloadFailure &&
              (workerStatementProblem.code === 'WORKER_STATEMENT_NETWORK_UNCERTAIN' ||
                workerStatementProblem.code === 'WORKER_STATEMENT_SERVICE_UNAVAILABLE')
                ? 'service'
                : 'error'}
              remedyLinks={{
                review_my_pay: {
                  label: portalText(locale, 'problem.workerStatement.checkStatus'),
                  href: workerStatementPeriodHref,
                },
                check_statement_status: {
                  label: portalText(locale, 'problem.workerStatement.checkStatus'),
                  href: workerStatementPeriodHref,
                },
                retry_statement: {
                  label: portalText(locale, 'problem.workerStatement.retryAction'),
                },
                retry_download: {
                  label: portalText(locale, 'problem.expenseExport.retryDownload'),
                },
                contact_finance_owner: { label: portalText(locale, 'problem.remedy.contactOwner') },
                sign_in: {
                  label: portalText(locale, 'problem.workerStatement.signInAgain'),
                  href: `${base}/app/login?lang=${encodeURIComponent(locale)}`,
                },
                review_workspace: {
                  label: portalText(locale, 'problem.workerStatement.returnToWork'),
                  href: `${base}/app?lang=${encodeURIComponent(locale)}`,
                },
              }}
            />
            {#if workerStatementProblem.code === 'WORKER_STATEMENT_DOWNLOAD_STATUS_UNKNOWN' && workerStatementDownloadFailedArtifactId}
              <button
                type="button"
                class="preview-link"
                disabled={workerStatementDownloadBusy}
                onclick={() => void checkWorkerStatementDownloadStatus()}
                >{portalText(locale, 'problem.workerStatement.checkStatus')}</button
              >
            {/if}
            {#if workerStatementDownloadFailedFormat && workerStatementProblem.remedies.some((remedy) => remedy.id === 'retry_download')}
              {@const artifact = workerStatementArtifact(workerStatementDownloadFailedFormat)}
              {#if artifact?.status === 'ready'}
                <button
                  type="button"
                  class="preview-link"
                  disabled={workerStatementDownloadBusy}
                  onclick={(event) => void downloadWorkerStatement(event, artifact)}
                  >{portalText(locale, 'problem.expenseExport.retryDownload')}</button
                >
              {/if}
            {/if}
          {:else if workerStatementBusy || workerStatementPolling}
            <p class="form-help" role="status" aria-live="polite">
              {portalText(locale, 'problem.workerStatement.queued')}
            </p>
          {:else if workerStatementArtifacts.some((artifact) => artifact.status === 'ready')}
            <p class="form-help" role="status" aria-live="polite">
              {portalText(locale, 'problem.workerStatement.ready')}
            </p>
          {/if}
        </section>
        <div class="finance-grid">
          {#each data.pay.currencyBreakdown ?? [data.pay] as amount}
            <a href="{base}/app/time" class="metric metric-link">
              <span>{translate('APPROVED COMPENSATION')} · {amount.currency}</span><strong
                >{paymentMoney(
                  amount.estimatedApprovedMinor,
                  amount.currency,
                  documentLanguage(locale),
                )}</strong
              >
              <p>{data.pay.approvedMinutes} {translate('approved minutes')}</p>
            </a>
            <a href="{base}/app/expenses" class="metric metric-link">
              <span>{translate('APPROVED REIMBURSEMENTS')} · {amount.currency}</span><strong
                >{paymentMoney(
                  amount.approvedReimbursementMinor,
                  amount.currency,
                  documentLanguage(locale),
                )}</strong
              >
              <p>
                {translate('Estimated compensation awaiting approval:')}
                {paymentMoney(
                  amount.estimatedPendingMinor,
                  amount.currency,
                  documentLanguage(locale),
                )} · {translate('Estimated reimbursements awaiting approval:')}
                {paymentMoney(
                  amount.pendingReimbursementMinor,
                  amount.currency,
                  documentLanguage(locale),
                )}
              </p>
            </a>
          {/each}
        </div>
        <section class="record-list full" aria-label={translate('Payment still outstanding')}>
          <div class="panel-title">
            <div>
              <h2>{translate('Payment still outstanding')}</h2>
              <p>
                {translate(
                  'Reviewed compensation and approved expenses that have not been paid yet.',
                )}
              </p>
            </div>
          </div>
          {#each data.payOutstanding ?? [] as outstanding}
            <p>
              {translate('Unpaid reviewed settlements:')}
              <strong
                >{paymentMoney(
                  outstanding.settlementMinor,
                  outstanding.currency,
                  documentLanguage(locale),
                )}</strong
              >
              · {translate('Approved reimbursements awaiting payment:')}
              <strong
                >{paymentMoney(
                  outstanding.reimbursementMinor,
                  outstanding.currency,
                  documentLanguage(locale),
                )}</strong
              >
            </p>
          {:else}
            <p>
              {translate(
                'No reviewed payments or approved reimbursements are outstanding in this period.',
              )}
            </p>
          {/each}
        </section>
        <section class="record-list full pay-detail">
          <div class="panel-title">
            <div>
              <h2>{translate('Compensation statement')}</h2>
              <p>
                {data.pay.label ?? translate('Estimate from approved and pending records')} · {data.periodStart}
                {translate('to')}
                {data.periodEnd}
              </p>
            </div>
            <span
              >{data.pay.percentageBased
                ? translate('Percentage rule active')
                : translate('Rate rule active')}</span
            >
          </div>
          <div class="detail-grid">
            <a href="{base}/app/time" class="detail-grid-link">
              <span>{translate('Approved actual time')}</span><strong
                >{hours(data.pay.approvedMinutes)}</strong
              >
            </a>
            <a href="{base}/app/time" class="detail-grid-link">
              <span>{translate('Pending actual time')}</span><strong
                >{hours(data.pay.pendingMinutes)}</strong
              >
            </a>
            <a href="{base}/app/time" class="detail-grid-link">
              <span>{translate('Daily guarantee coverage')}</span><strong
                >{hours(data.pay.guaranteedMinutes ?? 0)}</strong
              >
            </a>
            <a href="{base}/app/projects" class="detail-grid-link">
              <span>{translate('Projects included')}</span><strong
                >{data.pay.projectIds?.length ?? 0}</strong
              >
            </a>
          </div>
          <div class="statement-note">
            {#if (data.pay.missingCompensationRules ?? 0) > 0}
              <ProblemNotice
                problem={missingCompensationRuleProblem(data.pay.missingCompensationRules ?? 0)}
                kind="warning"
                title={translate('Review required')}
                remedyLinks={{
                  contact_finance_owner: { label: translate('Contact Finance or an owner') },
                }}
              />
            {/if}
          </div>
        </section>
        <section class="record-list full pay-detail">
          <div class="panel-title">
            <div>
              <h2>{translate('Assignment budget context')}</h2>
              <p>
                {translate(
                  'Optional planning context only; actual and approved time remain the source of compensation.',
                )}
              </p>
            </div>
            <span>{data.pay.projectProgress?.length ?? 0} {translate('projects')}</span>
          </div>
          <TableRegion
            class="table-wrap worker-pay-table"
            mobileMode="scroll"
            label={translate('Assignment budget context')}
          >
            <table>
              <thead
                ><tr
                  ><th>{translate('Project')}</th><th>{translate('Actual')}</th><th
                    >{translate('Approved')}</th
                  ><th>{translate('Pending')}</th><th>{translate('Planned')}</th><th
                    >{translate('Remaining')}</th
                  ><th>{translate('Approved estimate')}</th><th>{translate('Pending estimate')}</th
                  ></tr
                ></thead
              >
              <tbody
                >{#each data.pay.projectProgress ?? [] as row}<tr
                    ><td
                      ><a
                        href="{base}/app/projects/{String(row.projectId ?? '')}"
                        class="project-progress-link"
                        >{String(row.projectNumber)} · {String(row.projectName)}</a
                      ></td
                    ><td>{hours(row.actualMinutes ?? 0)}</td><td
                      >{hours(row.approvedMinutes ?? 0)}</td
                    ><td>{hours(row.pendingMinutes ?? 0)}</td><td
                      >{row.plannedMinutes === null ? '—' : hours(row.plannedMinutes)}</td
                    ><td>{row.hoursRemaining === null ? '—' : hours(row.hoursRemaining)}</td><td
                      >{paymentMoney(
                        String(row.estimatedApprovedMinor),
                        String(row.currency),
                        documentLanguage(locale),
                      )}</td
                    ><td
                      >{paymentMoney(
                        String(row.estimatedPendingMinor),
                        String(row.currency),
                        documentLanguage(locale),
                      )}</td
                    ></tr
                  >{:else}<tr
                    ><td colspan="8"
                      >{translate('No project assignment budget context is configured.')}</td
                    ></tr
                  >{/each}</tbody
              >
            </table>
          </TableRegion>
        </section>
        <section class="record-list full pay-activity" aria-labelledby="pay-activity-title">
          <div class="panel-title">
            <div>
              <h2 id="pay-activity-title">{translate('Own activity detail')}</h2>
              <p class="form-help">
                {translate(
                  'Actual operational activity included in this period. Compensation interpretation remains governed by project rules.',
                )}
              </p>
            </div>
            <span>{data.payActivities?.length ?? 0} {translate('entries')}</span>
          </div>
          <TableRegion
            class="table-wrap worker-pay-table"
            mobileMode="scroll"
            label={translate('Own activity detail')}
          >
            <table>
              <caption class="sr-only">{translate('Own activity detail')}</caption>
              <thead>
                <tr>
                  <th>{translate('Date')}</th>
                  <th>{translate('Project')}</th>
                  <th>{translate('Category')}</th>
                  <th>{translate('Activity')}</th>
                  <th>{translate('Actual minutes')}</th>
                  <th>{translate('Approval')}</th>
                </tr>
              </thead>
              <tbody>
                {#each data.payActivities ?? [] as activity}
                  <tr>
                    <td>{String(activity.date ?? '—')}</td>
                    <td
                      >{String(activity.projectNumber ?? '—')} · {String(
                        activity.projectName ?? '',
                      )}</td
                    >
                    <td>{controlledValue('category', activity.category)}</td>
                    <td>{String(activity.activitySummary ?? '—')}</td>
                    <td>
                      {#if activity.startTime && activity.endTime}
                        <strong>{String(activity.startTime)} – {String(activity.endTime)}</strong
                        ><br />
                      {/if}
                      {hours(activity.actualMinutes ?? 0)}
                      {#if Number(activity.breakMinutes ?? 0) > 0}
                        · {translate('Break')}: {String(activity.breakMinutes)} {translate('min')}
                      {/if}
                    </td>
                    <td>{controlledValue('status', activity.approvalState)}</td>
                  </tr>
                {:else}
                  <tr>
                    <td colspan="6">{translate('No activity recorded in this period.')}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </TableRegion>
        </section>
        <section class="record-list full pay-settlements">
          <div class="panel-title">
            <div>
              <h2>{translate('Settlement status')}</h2>
              <p>
                {translate(
                  'Your reviewed compensation, recorded actual payments and remaining balance. Finalizing a settlement is not proof of payment.',
                )}
              </p>
            </div>
            <span>{data.settlements?.length ?? 0}</span>
          </div>
          <TableRegion
            class="table-wrap worker-pay-table"
            mobileMode="scroll"
            label={translate('Settlement status')}
          >
            <table>
              <caption class="sr-only">{translate('Settlement status')}</caption>
              <thead>
                <tr>
                  <th>{translate('Project / period')}</th>
                  <th>{translate('Payment state')}</th>
                  <th>{translate('Expected payment')}</th>
                  <th>{translate('Latest actual payment')}</th>
                  <th>{translate('Reviewed settlement')}</th>
                  <th>{translate('Actual paid')}</th>
                  <th>{translate('Remaining')}</th>
                </tr>
              </thead>
              <tbody>
                {#each data.settlements ?? [] as settlement}
                  <tr>
                    <td>
                      <a
                        class="project-progress-link"
                        href="{base}/app/projects/{String(settlement.projectId ?? '')}"
                      >
                        {String(settlement.projectNumber ?? '—')} · {String(
                          settlement.periodStart ?? '—',
                        )} → {String(settlement.periodEnd ?? '—')}
                      </a>
                    </td>
                    <td>{controlledValue('status', settlement.paymentState ?? settlement.state)}</td
                    >
                    <td>{String(settlement.expectedPaymentOn ?? translate('Not scheduled'))}</td>
                    <td>{String(settlement.actualPaymentOn ?? translate('Not paid yet'))}</td>
                    <td
                      >{paymentMoney(
                        settlement.amountMinor,
                        String(settlement.currency),
                        documentLanguage(locale),
                      )}</td
                    >
                    <td
                      >{paymentMoney(
                        settlement.paidAmountMinor,
                        String(settlement.currency),
                        documentLanguage(locale),
                      )}</td
                    >
                    <td
                      >{paymentMoney(
                        settlement.remainingAmountMinor,
                        String(settlement.currency),
                        documentLanguage(locale),
                      )}</td
                    >
                  </tr>
                {:else}
                  <tr>
                    <td colspan="7">{translate('No compensation settlements in this period.')}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </TableRegion>
        </section>
        <section
          class="record-list full pay-reimbursements"
          aria-labelledby="pay-reimbursements-title"
        >
          <div class="panel-title">
            <div>
              <h2 id="pay-reimbursements-title">{translate('Reimbursement status')}</h2>
              <p>
                {translate(
                  'Expected and actual reimbursement dates for your own approved expenses.',
                )}
              </p>
            </div>
            <span>{data.payExpenses?.length ?? 0}</span>
          </div>
          <TableRegion
            class="table-wrap worker-pay-table"
            mobileMode="scroll"
            label={translate('Reimbursement status')}
          >
            <table>
              <caption class="sr-only">{translate('Reimbursement status')}</caption>
              <thead>
                <tr>
                  <th>{translate('Date')}</th>
                  <th>{translate('Project')}</th>
                  <th>{translate('Vendor / category')}</th>
                  <th>{translate('State')}</th>
                  <th>{translate('Expected reimbursement')}</th>
                  <th>{translate('Actual reimbursement')}</th>
                  <th>{translate('Own amount')}</th>
                </tr>
              </thead>
              <tbody>
                {#each data.payExpenses ?? [] as expense}
                  <tr>
                    <td>{String(expense.spentOn ?? '—')}</td>
                    <td>{String(expense.projectNumber ?? '—')}</td>
                    <td
                      >{String(expense.vendor || expense.description || 'Expense')} · {controlledValue(
                        'expenseCategory',
                        expense.category,
                      )}</td
                    >
                    <td
                      >{controlledValue(
                        'status',
                        expense.reimbursementState ?? expense.approvalState,
                      )}</td
                    >
                    <td>{String(expense.expectedReimbursementOn ?? translate('Not scheduled'))}</td>
                    <td>{String(expense.reimbursedAt ?? translate('Not reimbursed yet'))}</td>
                    <td
                      >{paymentMoney(
                        expense.reimbursementAmountMinor,
                        String(expense.currency),
                        documentLanguage(locale),
                      )}</td
                    >
                  </tr>
                {:else}
                  <tr>
                    <td colspan="7">{translate('No reimbursable expenses in this period.')}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </TableRegion>
        </section>
      {/if}
    {:else if data.section === 'projects' && projectDirectoryView === 'clients'}
      <ClientDirectorySection
        clients={data.clients ?? []}
        contacts={data.contacts ?? []}
        projects={data.projects ?? []}
        canManageContacts={canManageClientContacts}
        {translate}
        {controlledValue}
      />
    {:else if data.section === 'projects' && projectDirectoryView === 'team'}
      <TeamDirectorySection
        {form}
        suppliers={data.suppliers ?? []}
        workers={data.workers ?? []}
        assignments={data.assignments ?? []}
        mailboxes={mailboxData.mailboxes}
        mailboxDirectoryStatus={mailboxData.mailboxDirectoryStatus}
        mailboxDirectoryError={mailboxData.mailboxDirectoryError}
        {canManageMail}
        {canonicalOwner}
        canManageTeam={canManageTeamDirectory}
        currentUserId={data.user.id}
        {invitationPath}
        {translate}
        {controlledValue}
      />
    {:else if data.section === 'projects' && data.user.role === 'project_manager'}
      <ProjectSection
        {base}
        {locale}
        {form}
        projects={availableProjects}
        workers={(data.workers ?? []).filter((worker) => worker.role === 'worker')}
        assignments={data.assignments ?? []}
        expertise={data.allSkills ?? []}
        workerExpertise={data.workerSkills ?? []}
        role={data.user.role}
        capabilities={{
          canCreateProject: false,
          canTransitionProject: false,
          canManageClients: false,
          canManageAssignments: canManageAssignmentControls,
        }}
        getProjectLifecycleActions={projectLifecycleActions}
        {translate}
        {controlledValue}
      />
    {:else if data.section === 'projects'}
      <div class="management-stack">
        <details id="project-calendar" class="admin-details" data-project-calendar>
          <summary class="secondary-button">{translate('Project calendar')}</summary>
          <PlanningCalendar
            {translate}
            {locale}
            events={availableProjects
              .filter((project) => project.start_date)
              .map((project) => ({
                id: String(project.id),
                title: `${project.project_number} · ${project.name}`,
                startsAt: String(project.start_date),
                endsAt: project.planned_end_date ? String(project.planned_end_date) : undefined,
                href: `${base}/app/projects/${project.id}`,
              }))}
          />
          <p class="form-help">
            {translate('Open a project from the calendar to review its dates, team and planning.')}
          </p>
        </details>
        {#if canManageProjects}
          <nav
            class="project-workflow-actions"
            aria-label={translate('Project management actions')}
          >
            <p>
              {translate(
                'Choose one action. The portal will show only the fields needed for that task.',
              )}
            </p>
            <div>
              <button type="button" class="secondary-button" onclick={showProjectList}
                >{translate('All projects')}</button
              >
              <a class="secondary-button" href={href('projects') + '?view=clients'}
                >{translate('Client contacts')}</a
              >
              <a class="secondary-button" href={href('projects') + '?view=team'}
                >{translate('Team access')}</a
              >
              <a class="secondary-button" href="#assignment-history" onclick={showAssignmentHistory}
                >{translate('Assignment history')}</a
              >
              <button
                type="button"
                class="primary-button"
                class:active={projectWorkflow === 'new-project'}
                onclick={() => openProjectWorkflow('new-project')}
                >{translate('New Project')}</button
              >
              <details
                class="workspace-actions-disclosure"
                open={Boolean(projectWorkflow && projectWorkflow !== 'new-project')}
              >
                <summary>{translate('More actions')}</summary>
                <div class="workspace-secondary-actions">
                  <button
                    type="button"
                    class="primary-button"
                    class:active={projectWorkflow === 'new-client'}
                    onclick={() => openProjectWorkflow('new-client')}
                    >{translate('New Client')}</button
                  >
                  <button
                    type="button"
                    class="primary-button"
                    class:active={projectWorkflow === 'update-client'}
                    onclick={() => openProjectWorkflow('update-client')}
                    >{translate('Update Client')}</button
                  >

                  {#if canManageAssignmentControls}
                    <button
                      type="button"
                      class="primary-button"
                      class:active={projectWorkflow === 'assign-worker'}
                      onclick={() => openProjectWorkflow('assign-worker')}
                      >{translate('Assign Worker')}</button
                    >
                    <button
                      type="button"
                      class="primary-button"
                      class:active={projectWorkflow === 'update-assignment'}
                      onclick={() => openProjectWorkflow('update-assignment')}
                      >{translate('Update Assignment')}</button
                    >
                    <button
                      type="button"
                      class="primary-button danger-outline"
                      class:active={projectWorkflow === 'remove-assignment'}
                      onclick={() => openProjectWorkflow('remove-assignment')}
                      >{translate('Remove Assignment')}</button
                    >
                  {/if}
                </div>
              </details>
            </div>
          </nav>
          {#if projectWorkflow === 'new-client'}
            <section
              class="admin-details project-workflow-panel"
              data-project-workflow="new-client"
              tabindex="-1"
            >
              <form
                bind:this={ownerClientForm}
                method="POST"
                action="?/createClient"
                class="admin-form-grid"
                use:formValidation
              >
                <h2>{translate('Create client')}</h2>
                {#if clientFormResult?.success && clientFormResult.clientId}
                  <div class="form-help wide-field" role="status">
                    <strong>{actionFeedback}</strong>
                    <a
                      class="secondary-button"
                      href={`${base}/app/projects?action=update-client&client=${encodeURIComponent(clientFormResult.clientId)}`}
                      >{translate('Edit client')} {clientFormResult.clientNumber ?? ''}</a
                    >
                  </div>
                {/if}
                {#if clientProblem}
                  <ProblemNotice
                    problem={clientProblem}
                    class="wide-field"
                    remedyLinks={globalRemedyLinks}
                  />
                {/if}
                {#if Object.keys(clientFieldErrors).length > 0 && !clientProblem}
                  <div class="form-help wide-field" role="alert" data-client-field-errors>
                    <strong>{translate('Review these client fields')}</strong>
                    <ul>
                      {#each Object.entries(clientFieldErrors) as [field, messages]}
                        <li>
                          {clientFieldLabel(field)}: {(messages ?? []).map(translate).join(' · ')}
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
                <label
                  >{translate('Legal name')}<input
                    name="legalName"
                    minlength="2"
                    value={clientFormValue('legalName')}
                    required
                  /></label
                ><label
                  >{translate('Display name')}<input
                    name="displayName"
                    minlength="2"
                    value={clientFormValue('displayName')}
                    required
                  /></label
                ><label
                  >{translate('Client code (optional)')}<input
                    name="clientCode"
                    maxlength="40"
                    value={clientFormValue('clientCode')}
                  /></label
                ><label
                  >{translate('Currency')}<select name="currency" required
                    ><option value="USD" selected={clientFormValue('currency', 'USD') === 'USD'}
                      >USD</option
                    ><option value="BRL" selected={clientFormValue('currency', 'USD') === 'BRL'}
                      >BRL</option
                    ><option value="EUR" selected={clientFormValue('currency', 'USD') === 'EUR'}
                      >EUR</option
                    ></select
                  ></label
                ><label
                  >{translate('Timezone')}<input
                    name="timezone"
                    value={clientFormValue('timezone', 'America/New_York')}
                    required
                  /></label
                ><label
                  >{translate('Billing contact name')}<input
                    name="billingContactName"
                    minlength="2"
                    value={clientFormValue('billingContactName')}
                  /><small>{translate('Required when no billing email is provided')}</small></label
                ><label
                  >{translate('Billing contact email')}<input
                    name="billingEmail"
                    type="email"
                    value={clientFormValue('billingEmail')}
                  /></label
                ><label class="wide-field"
                  >{translate('Billing address')}<textarea
                    name="billingAddress"
                    rows="3"
                    minlength="5"
                    required>{clientFormValue('billingAddress')}</textarea
                  ></label
                ><label
                  >{translate('Payment terms (days)')}<input
                    name="paymentTermsDays"
                    type="number"
                    min="0"
                    max="365"
                    value={clientFormValue('paymentTermsDays', '30')}
                    required
                  /></label
                ><label
                  >{translate('PO / reference')}<input
                    name="poReference"
                    value={clientFormValue('poReference')}
                  /></label
                ><label class="wide-field"
                  >{translate('Notes')}<textarea name="notes" rows="2"
                    >{clientFormValue('notes')}</textarea
                  ></label
                >
                <button>{translate('Create client')}</button>
              </form>
            </section>
          {/if}
          {#if projectWorkflow === 'update-client'}
            <section
              class="admin-details project-workflow-panel"
              data-project-workflow="update-client"
              tabindex="-1"
            >
              <p class="form-help">
                {translate(
                  "Each editor carries the record version it displayed. A stale submission is rejected so another administrator's changes are not overwritten.",
                )}
              </p>
              {#each (data.clients ?? []).filter((client) => !$page.url.searchParams.get('client') || String(client.id) === $page.url.searchParams.get('client')) as client}
                <form
                  method="POST"
                  action="?/updateClient"
                  class="admin-form-grid client-edit-form"
                >
                  <input type="hidden" name="clientId" value={client.id} />
                  <input type="hidden" name="version" value={client.version ?? 1} />
                  <h3 class="wide-field">{client.client_number} · {client.display_name}</h3>
                  {#if !client.billing_address}
                    <p class="form-help wide-field">
                      {translate(
                        'Billing address is missing on this existing record. Enter the real address before saving; the interface will not invent one.',
                      )}
                    </p>
                  {/if}
                  <label
                    >{translate('Legal name')}<input
                      name="legalName"
                      value={String(client.legal_name ?? '')}
                      required
                    /></label
                  >
                  <label
                    >{translate('Display name')}<input
                      name="displayName"
                      value={String(client.display_name ?? '')}
                      required
                    /></label
                  >
                  <label
                    >{translate('Client code (optional)')}<input
                      name="clientCode"
                      value={String(client.client_code ?? '')}
                      maxlength="40"
                    /></label
                  >
                  <label
                    >{translate('Currency')}<select name="currency" required>
                      <option value="USD" selected={client.currency === 'USD'}>USD</option>
                      <option value="BRL" selected={client.currency === 'BRL'}>BRL</option>
                      <option value="EUR" selected={client.currency === 'EUR'}>EUR</option>
                    </select></label
                  >
                  <label
                    >{translate('Timezone')}<input
                      name="timezone"
                      value={String(client.timezone ?? '')}
                      required
                    /></label
                  >
                  <label
                    >{translate('Billing contact name')}<input
                      name="billingContactName"
                      value={String(client.billing_contact_name ?? '')}
                    /></label
                  >
                  <label
                    >{translate('Billing contact email')}<input
                      name="billingEmail"
                      type="email"
                      value={String(client.billing_email ?? '')}
                    /></label
                  >
                  <label class="wide-field"
                    >{translate('Billing address')}<textarea name="billingAddress" rows="3" required
                      >{String(client.billing_address ?? '')}</textarea
                    ></label
                  >
                  <label
                    >{translate('Payment terms (days)')}<input
                      type="number"
                      name="paymentTermsDays"
                      min="0"
                      max="365"
                      value={client.payment_terms_days ?? 30}
                      required
                    /></label
                  >
                  <label
                    >{translate('PO / reference')}<input
                      name="poReference"
                      value={String(client.po_reference ?? '')}
                    /></label
                  >
                  <label class="wide-field"
                    >{translate('Notes')}<textarea name="notes" rows="2"
                      >{String(client.notes ?? '')}</textarea
                    ></label
                  >
                  <button>{translate('Update client')}</button>
                </form>
              {:else}
                <p class="empty">{translate('No clients recorded.')}</p>
              {/each}
            </section>
          {/if}
          {#if projectWorkflow === 'new-project'}
            <section
              id="new-project"
              class="admin-details project-workflow-panel"
              data-project-workflow="new-project"
              tabindex="-1"
            >
              {#if createdProject}
                <ProjectSetupNextSteps
                  {base}
                  projectId={createdProject.id}
                  projectNumber={createdProject.number}
                  initialAssignmentCount={createdProject.initialAssignmentCount}
                  canAssignWorkers={canManageAssignmentControls}
                  {translate}
                />
              {/if}
              <form
                method="POST"
                action="?/createProject"
                class="admin-form-grid project-setup-form"
              >
                <h2>{translate('Create project')}</h2>
                <p class="form-help wide-field">
                  {translate(
                    'Create the project with optional worker assignments and individual terms, or add people after saving.',
                  )}
                </p>
                {#if Object.keys(projectFieldErrors).length > 0}
                  <div class="form-help wide-field" role="alert" data-project-field-errors>
                    <strong>{translate('Check project fields')}</strong>
                    <ul>
                      {#each Object.entries(projectFieldErrors) as [field, messages]}
                        <li>
                          {projectFieldLabel(field)}: {(messages ?? []).map(translate).join(' · ')}
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
                <h3 class="wide-field">{translate('1 · Basics')}</h3>
                <label
                  >{translate('Client')}<select
                    name="clientId"
                    required
                    value={selectedNewProjectClientId}
                    onchange={(event) => {
                      newProjectClientId = event.currentTarget.value;
                      newProjectCurrencyOverride = null;
                      newProjectTimezoneOverride = null;
                    }}
                    ><option value="" disabled
                      >{portalText(locale, 'problem.client.idRequired')}</option
                    >{#each activeClients as client}<option value={client.id}
                        >{client.client_number} — {client.display_name}</option
                      >{/each}</select
                  ></label
                ><label
                  >{translate('Name')}<input
                    name="name"
                    value={projectFormValue('name')}
                    required
                  /></label
                ><label
                  >{translate('Cost center code')}<input
                    name="costCenterCode"
                    maxlength="120"
                    value={projectFormValue('costCenterCode')}
                    required
                  /><small
                    >{translate(
                      'End the cost center with digits. Those digits become the project number suffix (for example, CP020 becomes P-020).',
                    )}</small
                  ></label
                ><label
                  >{translate('Description')}<textarea name="description" rows="2"
                    >{projectFormValue('description')}</textarea
                  ></label
                ><label
                  >{translate('Project alias')}<input
                    name="projectAlias"
                    value={projectFormValue('projectAlias')}
                  /></label
                ><label
                  >{translate('Currency')}<select
                    name="currency"
                    value={newProjectCurrency}
                    onchange={(event) => (newProjectCurrencyOverride = event.currentTarget.value)}
                    ><option value="USD">USD</option><option value="BRL">BRL</option><option
                      value="EUR">EUR</option
                    ></select
                  ></label
                ><label
                  >{translate('Project manager')}<select name="projectManagerId"
                    ><option value="">{translate('Unassigned')}</option
                    >{#each data.workers ?? [] as worker}{#if worker.role === 'project_manager' && worker.status === 'active'}<option
                          value={worker.id}
                          selected={projectFormValue('projectManagerId') === worker.id}
                          >{worker.name} — {worker.email}</option
                        >{/if}{/each}</select
                  ></label
                >
                <h3 class="wide-field">{translate('2 · People')}</h3>
                <ProjectCreationAssignments
                  workers={data.workers ?? []}
                  currency={newProjectCurrency}
                  canAssignWorkers={data.user.role === 'owner_admin'}
                  values={projectFormValues}
                  errors={projectFieldErrors}
                  t={translate}
                />
                <h3 class="wide-field">{translate('3 · Commercial defaults')}</h3>
                <label
                  >{translate('Billing model')}<select name="billingModel"
                    ><option value="tm" selected={projectFormValue('billingModel', 'tm') === 'tm'}
                      >{translate('Time & materials')}</option
                    ><option
                      value="tm_daily_minimum"
                      selected={projectFormValue('billingModel') === 'tm_daily_minimum'}
                      >{translate('T&M · daily minimum')}</option
                    ><option value="all_in" selected={projectFormValue('billingModel') === 'all_in'}
                      >{translate('Hourly labor with included expenses (all-in)')}</option
                    ><option
                      value="capped_tm"
                      selected={projectFormValue('billingModel') === 'capped_tm'}
                      >{translate('Capped T&M')}</option
                    ></select
                  ></label
                ><label
                  >{translate('Site timezone')}<input
                    name="timezone"
                    value={newProjectTimezone}
                    oninput={(event) => (newProjectTimezoneOverride = event.currentTarget.value)}
                    required
                  /></label
                ><label
                  >{translate('Start date')}<input
                    name="startDate"
                    type="date"
                    value={projectFormValue('startDate')}
                  /></label
                ><label
                  >{translate('Planned end date (optional)')}<input
                    name="plannedEndDate"
                    type="date"
                    value={projectFormValue('plannedEndDate')}
                  /></label
                ><label
                  >{translate('Expected hours / day')}<input
                    name="expectedHoursPerDay"
                    type="number"
                    step="0.25"
                    min="0"
                    max="24"
                    value={projectFormValue('expectedHoursPerDay', '10')}
                    placeholder="10.0"
                    required
                  /></label
                ><label
                  >{translate('Client daily minimum hours')}<input
                    name="clientDailyMinimumHours"
                    type="number"
                    step="0.25"
                    min="0"
                    max="24"
                    value={projectFormValue('clientDailyMinimumHours')}
                    placeholder="8.0"
                  /></label
                >
                <p class="form-help">
                  {translate(
                    'Expected hours are planning context. The client daily minimum is a separate commercial top-up applied once per worker, project and day; it never changes actual recorded hours or worker compensation.',
                  )}
                </p>
                <p class="form-help">
                  {translate(
                    'All-in keeps labor hourly unless an explicit fixed labor price is configured. It only means selected expenses are included instead of billed separately.',
                  )}
                </p>
                <h3 class="wide-field">
                  {translate('4 · Optional planning and budget')}
                </h3>
                <p class="form-help wide-field">
                  {translate(
                    'Leave budgets blank when they are not agreed. A planning target does not limit billing; choose capped T&M and configure a cap only when the contract requires one.',
                  )}
                </p>
                <label
                  >{translate('Budget type')}<select name="budgetType"
                    ><option
                      value="none"
                      selected={projectFormValue('budgetType', 'none') === 'none'}
                      >{translate('No budget')}</option
                    ><option value="revenue" selected={projectFormValue('budgetType') === 'revenue'}
                      >{translate('Revenue')}</option
                    ><option
                      value="purchase_order"
                      selected={projectFormValue('budgetType') === 'purchase_order'}
                      >{translate('Purchase order')}</option
                    ><option value="labor" selected={projectFormValue('budgetType') === 'labor'}
                      >{translate('Labor')}</option
                    ><option value="travel" selected={projectFormValue('budgetType') === 'travel'}
                      >{translate('Travel')}</option
                    ><option value="expense" selected={projectFormValue('budgetType') === 'expense'}
                      >{translate('Expenses')}</option
                    ><option
                      value="combined"
                      selected={projectFormValue('budgetType') === 'combined'}
                      >{translate('Combined')}</option
                    ></select
                  ></label
                ><ProjectBudgetInput
                  name="revenueBudgetMinor"
                  label={translate('Revenue budget')}
                  value={projectFormValue('revenueBudgetMinor')}
                  currency={newProjectCurrency}
                /><ProjectBudgetInput
                  name="poCapMinor"
                  label={translate('PO cap')}
                  value={projectFormValue('poCapMinor')}
                  currency={newProjectCurrency}
                /><ProjectBudgetInput
                  name="laborBudgetMinutes"
                  label={translate('Planned labor hours')}
                  value={projectFormValue('laborBudgetMinutes')}
                  kind="hours"
                /><ProjectBudgetInput
                  name="expenseBudgetMinor"
                  label={translate('Expense budget')}
                  value={projectFormValue('expenseBudgetMinor')}
                  currency={newProjectCurrency}
                /><ProjectBudgetInput
                  name="travelBudgetMinor"
                  label={translate('Travel budget')}
                  value={projectFormValue('travelBudgetMinor')}
                  currency={newProjectCurrency}
                /><label class="check"
                  ><input name="weeklyCloseEnabled" type="checkbox" />
                  {translate('Weekly close required')}</label
                ><label class="check"
                  ><input name="dailyReportRequired" type="checkbox" />
                  {translate('Daily report required')}</label
                ><label class="check"
                  ><input name="technicalReportingRequired" type="checkbox" />
                  {translate('Technical reporting required')}</label
                ><button>{translate('Create project')}</button>
              </form>
            </section>
          {/if}
          {#if canManageAssignmentControls}
            {#if projectWorkflow === 'assign-worker'}
              <section
                class="admin-details project-workflow-panel"
                data-project-workflow="assign-worker"
                tabindex="-1"
              >
                <form
                  bind:this={ownerAssignmentForm}
                  use:formValidation
                  method="POST"
                  action="?/assignWorker"
                  class="admin-form-grid"
                >
                  <h2>{translate('Assign worker')}</h2>
                  {#if assignmentProblem}
                    <ProblemNotice
                      problem={assignmentProblem}
                      class="wide-field"
                      status={assignmentProblem.params.status
                        ? portalText(locale, 'Current status: {status}', {
                            status: controlledValue('status', assignmentProblem.params.status),
                          })
                        : undefined}
                      remedyLinks={assignmentRemedyLinks}
                    />
                  {:else if assignmentAdvanceProblem}
                    <ProblemNotice
                      problem={assignmentAdvanceProblem}
                      kind="warning"
                      class="wide-field"
                      status={portalText(locale, 'Current status: {status}', {
                        status: controlledValue('status', assignmentSelectedProject?.status),
                      })}
                      remedyLinks={assignmentRemedyLinks}
                    />
                  {/if}
                  <label
                    >{translate('Project')}<select
                      name="projectId"
                      bind:value={assignmentSelectedProjectId}
                      required
                      ><option value="">{translate('Select project')}</option
                      >{#each assignmentProjectOptions as project}<option
                          value={project.id}
                          disabled={!['active', 'planned', 'paused'].includes(
                            String(project.status),
                          )}
                          >{!['active', 'planned', 'paused'].includes(String(project.status))
                            ? portalText(locale, 'problem.project.unavailableOption', {
                                projectName: String(project.name),
                                status: controlledValue('status', project.status),
                              })
                            : `${project.project_number} · ${project.name}`}</option
                        >{/each}</select
                    ></label
                  ><ExpertiseWorkerSelect
                    workers={data.workers ?? []}
                    expertise={data.allSkills ?? []}
                    workerExpertise={data.workerSkills ?? []}
                    selectedWorkerId={assignmentFormValue(
                      'workerId',
                      $page.url.searchParams.get('worker') ?? '',
                    )}
                    {translate}
                  /><label
                    >{translate('Role')}<input
                      name="assignmentRole"
                      value="worker"
                      readonly
                      required
                    /></label
                  ><label
                    >{translate('Starts on')}<input
                      name="startsOn"
                      type="date"
                      bind:value={ownerAssignmentStartsOn}
                      required
                    /></label
                  ><label
                    >{translate('Ends on (optional)')}<input
                      name="endsOn"
                      type="date"
                      bind:value={ownerAssignmentEndsOn}
                    /></label
                  >
                  {#if data.user.role === 'owner_admin'}
                    <h3 class="wide-field">{translate('Finance configuration')}</h3>
                    <p class="form-help wide-field">
                      {translate(
                        'Enter the authorized internal hourly cost and worker compensation in this project’s currency. Check the effective dates before assigning.',
                      )}
                    </p>
                    <p class="form-help wide-field">
                      {translate('Project currency')}: {assignmentProjectCurrency ||
                        translate('Select project')}
                    </p>
                    <label class="check wide-field"
                      ><input
                        name="useProjectDefaults"
                        type="checkbox"
                        value="on"
                        bind:checked={ownerUseProjectDefaults}
                        onchange={() => {
                          if (ownerUseProjectDefaults) ownerUseExistingFinanceRules = false;
                        }}
                      />{translate('Use saved project defaults for this assignment')}</label
                    >
                    <p class="form-help wide-field">
                      {translate(
                        'The saved project defaults will be copied into this assignment. Future project changes preserve this agreement.',
                      )}
                    </p>
                    <label class="check wide-field">
                      <input
                        name="useExistingFinanceRules"
                        type="checkbox"
                        value="on"
                        bind:checked={ownerUseExistingFinanceRules}
                        onchange={() => {
                          if (ownerUseExistingFinanceRules) ownerUseProjectDefaults = false;
                        }}
                      />
                      {translate(
                        'Use existing authorized finance rules for this worker and assignment dates',
                      )}
                    </label>
                    {#if ownerUseExistingFinanceRules}
                      <p class="form-help wide-field">
                        {translate(
                          'Both internal cost and compensation rules must cover every assignment date in the project currency.',
                        )}
                        {#if assignmentSelectedProjectId}
                          <a
                            href={`${base}/app/finance?view=commercial&project=${encodeURIComponent(assignmentSelectedProjectId)}`}
                            target="_blank"
                            rel="noopener noreferrer">{translate('Open finance configuration')}</a
                          >
                        {/if}
                      </p>
                    {/if}
                    <label>
                      {translate('Internal hourly cost')} ({assignmentProjectCurrency ||
                        translate('Project currency')})
                      <input
                        name="internalCostHourlyRate"
                        type="text"
                        inputmode="decimal"
                        autocomplete="off"
                        placeholder="0.00"
                        value={assignmentFormValue('internalCostHourlyRate')}
                        required={!ownerUseExistingFinanceRules && !ownerUseProjectDefaults}
                        disabled={ownerUseExistingFinanceRules || ownerUseProjectDefaults}
                      />
                    </label>
                    <label>
                      {translate('Worker compensation method')}
                      <select
                        name="compensationBasis"
                        required={!ownerUseExistingFinanceRules && !ownerUseProjectDefaults}
                        disabled={ownerUseExistingFinanceRules || ownerUseProjectDefaults}
                      >
                        <option
                          value="hourly"
                          selected={assignmentFormValue('compensationBasis', 'hourly') === 'hourly'}
                          >{translate('Hourly')}</option
                        >
                        <option
                          value="daily"
                          selected={assignmentFormValue('compensationBasis') === 'daily'}
                          >{translate('Daily')}</option
                        >
                      </select>
                    </label>
                    <label>
                      {translate('Compensation rate')} ({assignmentProjectCurrency ||
                        translate('Project currency')})
                      <input
                        name="compensationRate"
                        type="text"
                        inputmode="decimal"
                        autocomplete="off"
                        placeholder="0.00"
                        value={assignmentFormValue('compensationRate')}
                        required={!ownerUseExistingFinanceRules && !ownerUseProjectDefaults}
                        disabled={ownerUseExistingFinanceRules || ownerUseProjectDefaults}
                      />
                    </label>
                    <label>
                      {translate('Finance effective from')}
                      <input
                        name="financeEffectiveFrom"
                        type="date"
                        value={ownerAssignmentStartsOn}
                        readonly
                        required={!ownerUseExistingFinanceRules && !ownerUseProjectDefaults}
                        disabled={ownerUseExistingFinanceRules || ownerUseProjectDefaults}
                      />
                    </label>
                    <label>
                      {translate('Finance effective to (optional)')}
                      <input
                        name="financeEffectiveTo"
                        type="date"
                        value={ownerAssignmentEndsOn}
                        readonly
                        disabled={ownerUseExistingFinanceRules || ownerUseProjectDefaults}
                      />
                    </label>
                    <label class="wide-field">
                      {translate('Finance notes (optional)')}
                      <textarea
                        name="financeNotes"
                        maxlength="2000"
                        rows="3"
                        disabled={ownerUseExistingFinanceRules || ownerUseProjectDefaults}
                        >{assignmentFormValue('financeNotes')}</textarea
                      >
                    </label>
                  {:else}
                    <p class="form-help wide-field">
                      {translate(
                        'Before you assign this worker, ask the project owner to set cost and compensation terms for these dates. The assignment is blocked until setup is complete.',
                      )}
                    </p>
                  {/if}
                  <button disabled={assignmentProjectUnavailable}>{translate('Assign')}</button>
                </form>
              </section>
            {/if}
            {#if projectWorkflow === 'update-assignment'}
              <section
                id="project-assignment-list"
                class="admin-details project-workflow-panel"
                data-project-workflow="update-assignment"
                tabindex="-1"
              >
                <h2>{translate('Update assignment')}</h2>
                {#if assignmentEditProblem && assignmentEditForm?.actionName === 'updateAssignment'}
                  <ProblemNotice
                    problem={assignmentEditProblem}
                    remedyLinks={assignmentRemedyLinks}
                  />
                {/if}
                {#each (data.assignments ?? []).filter((assignment) => assignment.status === 'active' && (!projectWorkflowPage.url.searchParams.get('worker') || String(assignment.worker_id ?? assignment.user_id) === projectWorkflowPage.url.searchParams.get('worker')) && (!projectWorkflowPage.url.searchParams.get('project') || String(assignment.project_id) === projectWorkflowPage.url.searchParams.get('project'))) as assignment}
                  <form
                    method="POST"
                    action={assignmentFormAction(projectWorkflowPage.url, 'updateAssignment')}
                    class="admin-form-grid assignment-edit-form"
                    data-action="updateAssignment"
                    data-assignment-id={assignment.id}
                    use:formValidation
                  >
                    <input type="hidden" name="assignmentId" value={assignment.id} />
                    <input
                      type="hidden"
                      name="version"
                      value={assignmentEditValue(
                        'version',
                        assignment.id,
                        String(assignment.version ?? 1),
                      )}
                    />
                    <p class="form-help wide-field">
                      {assignment.project_number} · {assignment.project_name} · {assignment.worker_name}
                    </p>
                    <label
                      >{translate('Starts on')}<input
                        name="startsOn"
                        type="date"
                        value={assignmentEditValue(
                          'startsOn',
                          assignment.id,
                          String(assignment.starts_on ?? ''),
                        )}
                        required
                      /></label
                    >
                    <label
                      >{translate('Ends on')}<input
                        name="endsOn"
                        type="date"
                        value={assignmentEditValue(
                          'endsOn',
                          assignment.id,
                          String(assignment.ends_on ?? ''),
                        )}
                      /></label
                    >
                    <ProjectBudgetInput
                      name="plannedMinutes"
                      label={translate('Planned hours')}
                      value={assignmentEditValue(
                        'plannedMinutes',
                        assignment.id,
                        String(assignment.planned_minutes ?? ''),
                      )}
                      kind="hours"
                    />
                    <label class="check"
                      ><input type="hidden" name="canReviewPresent" value="1" /><input
                        name="canReview"
                        type="checkbox"
                        checked={assignmentEditForm?.actionName === 'updateAssignment' &&
                        String(assignmentEditForm.values?.assignmentId ?? '') ===
                          String(assignment.id)
                          ? assignmentEditForm.values?.canReview === 'on'
                          : Boolean(assignment.can_review)}
                      />
                      {translate('Can review')}</label
                    >
                    <button>{translate('Update assignment')}</button>
                  </form>
                {:else}<p class="empty">{translate('No active assignments to edit.')}</p>{/each}
              </section>
            {/if}
            {#if projectWorkflow === 'remove-assignment'}
              <section
                id="project-assignment-list"
                class="admin-details project-workflow-panel"
                data-project-workflow="remove-assignment"
                tabindex="-1"
              >
                <h2>{translate('Remove assignment')}</h2>
                {#if assignmentEditProblem && assignmentEditForm?.actionName === 'removeAssignment'}
                  <ProblemNotice
                    problem={assignmentEditProblem}
                    remedyLinks={assignmentRemedyLinks}
                  />
                {/if}
                <p class="form-help">
                  {translate(
                    'Removal ends the assignment and preserves its historical row. It never hard-deletes project history.',
                  )}
                </p>
                {#each (data.assignments ?? []).filter((assignment) => assignment.status === 'active' && (!projectWorkflowPage.url.searchParams.get('worker') || String(assignment.worker_id ?? assignment.user_id) === projectWorkflowPage.url.searchParams.get('worker')) && (!projectWorkflowPage.url.searchParams.get('project') || String(assignment.project_id) === projectWorkflowPage.url.searchParams.get('project'))) as assignment}
                  <form
                    method="POST"
                    action={assignmentFormAction(projectWorkflowPage.url, 'removeAssignment')}
                    class="admin-form-grid assignment-remove-form"
                    data-action="removeAssignment"
                    data-assignment-id={assignment.id}
                    use:formValidation
                  >
                    <input type="hidden" name="assignmentId" value={assignment.id} />
                    <input
                      type="hidden"
                      name="version"
                      value={assignmentEditValue(
                        'version',
                        assignment.id,
                        String(assignment.version ?? 1),
                      )}
                    />
                    <p class="form-help wide-field">
                      {assignment.project_number} · {assignment.project_name} · {assignment.worker_name}
                    </p>
                    <label
                      >{translate('End date')}<input
                        name="endsOn"
                        type="date"
                        min={String(assignment.starts_on ?? '')}
                        max={data.assignmentToday}
                        disabled={Boolean(
                          data.assignmentToday &&
                          String(assignment.starts_on ?? '') > data.assignmentToday,
                        )}
                        value={assignmentEditValue(
                          'endsOn',
                          assignment.id,
                          data.assignmentToday &&
                            String(assignment.ends_on ?? '') <= data.assignmentToday
                            ? String(assignment.ends_on ?? '')
                            : '',
                        )}
                      /></label
                    >
                    <p class="form-help wide-field">
                      {translate(
                        data.assignmentToday &&
                          String(assignment.starts_on ?? '') > data.assignmentToday
                          ? 'This future assignment will be cancelled before it starts.'
                          : 'Leave the end date blank to remove access today, or choose an earlier date within the assignment.',
                      )}
                    </p>
                    <label class="wide-field"
                      >{translate('Removal reason')}<input
                        name="reason"
                        required
                        maxlength="2000"
                        value={assignmentEditValue('reason', assignment.id)}
                      /></label
                    >
                    <button class="danger">{translate('Remove assignment')}</button>
                  </form>
                {:else}<p class="empty">{translate('No active assignments to remove.')}</p>{/each}
              </section>
            {/if}
          {/if}
        {/if}
        <div id="project-register" tabindex="-1">
          <SectionCard
            title={translate('Authorized projects')}
            collapsible
            expanded={!projectWorkflow}
            class="record-list full"
          >
            <RecordBrowser
              rows={availableProjects}
              bind:visible={projectRegisterPage}
              {translate}
              statusLabel={(value) => controlledValue('status', value)}
              label="Project"
              showEmpty={availableProjects.length > 0}
            />
            {#each projectRegisterPage as row (row.id)}
              <article class="project-list-link">
                <a href={`${base}/app/projects/${row.id}`}>
                  <div>
                    <strong>{row.project_number} · {row.name}</strong><small
                      >{controlledValue('status', row.status)} · {row.currency} · {row.timezone} · {row.start_date ??
                        translate('No start')} → {row.planned_end_date ??
                        translate('Open target')}</small
                    >
                  </div>
                  <span>{translate('Open project').toUpperCase()} <DirectionIcon /></span>
                </a>
                {#if canManageProjects}
                  <details class="project-row-actions" use:disclosure>
                    <summary>{translate('Actions')}</summary>
                    <div class="record-actions lifecycle-actions">
                      {#if row.status === 'active' || row.status === 'paused'}
                        <form
                          method="POST"
                          action="?/transitionProject"
                          data-action="transitionProject"
                        >
                          <input type="hidden" name="projectId" value={row.id} />
                          <input type="hidden" name="version" value={row.version ?? 1} />
                          <input
                            type="hidden"
                            name="status"
                            value={row.status === 'active' ? 'closing' : 'closing'}
                          />
                          <ProblemNotice
                            problem={projectLifecycleAssignmentWarning(row, 'closing')}
                            kind="warning"
                            remedyLinks={{
                              review_project: {
                                label: portalText(locale, 'problem.remedy.reviewProjectStatus'),
                                href: `${base}/app/projects/${encodeURIComponent(String(row.id))}`,
                              },
                              review_assignments: {
                                label: portalText(locale, 'problem.remedy.reviewAssignments'),
                                href: canManageAssignmentControls
                                  ? assignmentWorkflowHref(
                                      projectWorkflowPage.url,
                                      'updateAssignment',
                                      {
                                        project: String(row.id),
                                      },
                                    )
                                  : `${base}/app/projects#assignment-history`,
                              },
                            }}
                          />
                          <label class="sr-only" for={`project-close-reason-${row.id}`}
                            >{translate('Reason')}</label
                          >
                          <input
                            id={`project-close-reason-${row.id}`}
                            name="reason"
                            required
                            placeholder={translate('Reason')}
                          />
                          <button type="submit" class="secondary-button"
                            >{translate('Begin close')}</button
                          >
                        </form>
                      {:else if row.status === 'closing'}
                        <form
                          method="POST"
                          action="?/transitionProject"
                          data-action="transitionProject"
                        >
                          <input type="hidden" name="projectId" value={row.id} />
                          <input type="hidden" name="version" value={row.version ?? 1} />
                          <input type="hidden" name="status" value="closed" />
                          <ProblemNotice
                            problem={projectLifecycleAssignmentWarning(row, 'closed')}
                            kind="warning"
                            remedyLinks={{
                              review_project: {
                                label: portalText(locale, 'problem.remedy.reviewProjectStatus'),
                                href: `${base}/app/projects/${encodeURIComponent(String(row.id))}`,
                              },
                              review_assignments: {
                                label: portalText(locale, 'problem.remedy.reviewAssignments'),
                                href: canManageAssignmentControls
                                  ? assignmentWorkflowHref(
                                      projectWorkflowPage.url,
                                      'updateAssignment',
                                      {
                                        project: String(row.id),
                                      },
                                    )
                                  : `${base}/app/projects#assignment-history`,
                              },
                            }}
                          />
                          <label class="sr-only" for={`project-finish-reason-${row.id}`}
                            >{translate('Reason')}</label
                          >
                          <input
                            id={`project-finish-reason-${row.id}`}
                            name="reason"
                            required
                            placeholder={translate('Reason')}
                          />
                          <button type="submit" class="secondary-button"
                            >{translate('Close project')}</button
                          >
                        </form>
                      {:else if row.status === 'closed'}
                        <form
                          method="POST"
                          action="?/transitionProject"
                          data-action="transitionProject"
                        >
                          <input type="hidden" name="projectId" value={row.id} />
                          <input type="hidden" name="version" value={row.version ?? 1} />
                          <input type="hidden" name="status" value="archived" />
                          <label class="sr-only" for={`project-archive-reason-${row.id}`}
                            >{translate('Reason')}</label
                          >
                          <input
                            id={`project-archive-reason-${row.id}`}
                            name="reason"
                            required
                            placeholder={translate('Reason')}
                          />
                          <button type="submit" class="danger"
                            >{translate('Archive project')}</button
                          >
                        </form>
                      {:else if row.status === 'archived'}
                        <form
                          method="POST"
                          action="?/transitionProject"
                          data-action="transitionProject"
                        >
                          <input type="hidden" name="projectId" value={row.id} />
                          <input type="hidden" name="version" value={row.version ?? 1} />
                          <input type="hidden" name="status" value="restore" />
                          <label class="sr-only" for={`project-restore-reason-${row.id}`}
                            >{translate('Reason')}</label
                          >
                          <input
                            id={`project-restore-reason-${row.id}`}
                            name="reason"
                            required
                            placeholder={translate('Reason')}
                          />
                          <button type="submit" class="secondary-button"
                            >{translate('Restore project')}</button
                          >
                        </form>
                      {/if}
                      <form
                        method="POST"
                        action="?/deleteProject"
                        data-action="deleteProject"
                        onsubmit={(event) => {
                          if (
                            !confirm(
                              translate(
                                'Delete this project? This will permanently remove it if it has no financial activity.',
                              ),
                            )
                          ) {
                            event.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="projectId" value={row.id} />
                        <button type="submit" class="danger">{translate('Delete project')}</button>
                      </form>
                    </div>
                  </details>
                {/if}
              </article>
            {:else}
              {#if availableProjects.length === 0}
                <div class="empty">{translate('No projects available.')}</div>
              {/if}
            {/each}
          </SectionCard>
        </div>
        {#if canManageProjects}
          <SectionCard
            title={translate('Clients')}
            collapsible
            class="record-list full client-management-list"
          >
            <div class="panel-title">
              <div>
                <p class="form-help">
                  {translate(
                    'Archived clients remain visible to management for safe restore; workers never receive this list.',
                  )}
                </p>
              </div>
              <span>{data.clients?.length ?? 0}</span>
            </div>
            {#each data.clients ?? [] as client}
              <article
                class="record-card"
                id={`client-controls-${client.id}`}
                data-client-id={client.id}
              >
                <div>
                  <strong>{client.client_number} · {client.display_name}</strong>
                  <small
                    >{client.legal_name} · {client.currency}{client.client_code
                      ? ` · ${client.client_code}`
                      : ''} · {controlledValue('status', client.status)} · {client.billing_address ??
                      translate('Billing address missing')}</small
                  >
                </div>
                <div class="record-actions lifecycle-actions">
                  {#if client.status === 'active' || client.status === 'closed'}
                    <form method="POST" action="?/transitionClient" data-action="transitionClient">
                      <input type="hidden" name="clientId" value={client.id} />
                      <input type="hidden" name="version" value={client.version ?? 1} />
                      <input
                        type="hidden"
                        name="status"
                        value={client.status === 'active' ? 'closed' : 'active'}
                      />
                      <label class="sr-only" for={`client-status-reason-${client.id}`}
                        >{translate('Reason')}</label
                      >
                      <input
                        id={`client-status-reason-${client.id}`}
                        name="reason"
                        required
                        placeholder={translate('Reason')}
                      />
                      <button type="submit" class="secondary-button">
                        {translate(client.status === 'active' ? 'Close client' : 'Reopen client')}
                      </button>
                    </form>
                  {/if}
                  {#if client.status === 'archived'}
                    <form method="POST" action="?/transitionClient" data-action="transitionClient">
                      <input type="hidden" name="clientId" value={client.id} />
                      <input type="hidden" name="version" value={client.version ?? 1} />
                      <input type="hidden" name="status" value="restore" />
                      <label class="sr-only" for={`client-restore-reason-${client.id}`}
                        >{translate('Reason')}</label
                      >
                      <input
                        id={`client-restore-reason-${client.id}`}
                        name="reason"
                        required
                        placeholder={translate('Reason')}
                      />
                      <button type="submit" class="secondary-button"
                        >{translate('Restore client')}</button
                      >
                    </form>
                  {:else}
                    <form method="POST" action="?/transitionClient" data-action="transitionClient">
                      <input type="hidden" name="clientId" value={client.id} />
                      <input type="hidden" name="version" value={client.version ?? 1} />
                      <input type="hidden" name="status" value="archived" />
                      <label class="sr-only" for={`client-archive-reason-${client.id}`}
                        >{translate('Reason')}</label
                      >
                      <input
                        id={`client-archive-reason-${client.id}`}
                        name="reason"
                        required
                        placeholder={translate('Reason')}
                      />
                      <button type="submit" class="danger">{translate('Archive client')}</button>
                    </form>
                  {/if}
                  <form
                    method="POST"
                    action="?/deleteClient"
                    data-action="deleteClient"
                    onsubmit={(event) => {
                      if (
                        !confirm(
                          translate(
                            'Delete this client? This will permanently remove it if it has no associated projects or invoices.',
                          ),
                        )
                      ) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="clientId" value={client.id} />
                    <button type="submit" class="danger">{translate('Delete client')}</button>
                  </form>
                </div>
              </article>
            {:else}<div class="empty">{translate('No clients recorded.')}</div>{/each}
          </SectionCard>
          <details class="admin-details">
            <summary class="primary-button">{translate('Add Client Contact')}</summary>
            <form method="POST" action="?/createClientContact" class="admin-form-grid">
              <h2>{translate('Add client contact')}</h2>
              <label
                >{translate('Client')}<select name="clientId" required
                  >{#each activeClients as client}<option value={client.id}
                      >{client.client_number} — {client.display_name}</option
                    >{/each}</select
                ></label
              >
              <label>{translate('Name')}<input name="name" required /></label><label
                >{translate('Email')}<input name="email" type="email" /></label
              ><label>{translate('Phone')}<input name="phone" /></label><label
                >{translate('Role')}<input name="role" /></label
              >
              <label class="check"
                ><input name="isBillingContact" type="checkbox" />
                {translate('Billing contact')}</label
              >
              <label class="check"
                ><input name="isPrimary" type="checkbox" /> {translate('Primary contact')}</label
              >
              <button>{translate('Save contact')}</button>
            </form>
          </details>
          {#if canManageAssignmentControls}
            <details class="admin-details" bind:this={ownerMilestoneDetails}>
              <summary class="primary-button">{translate('Create Milestone')}</summary>
              <form
                method="POST"
                action="?/createMilestone"
                class="admin-form-grid"
                bind:this={ownerMilestoneForm}
              >
                <h2>{translate('Create milestone')}</h2>
                <label
                  >{translate('Project')}<select
                    name="projectId"
                    value={milestoneProjectId}
                    required
                    ><option value="" disabled>{translate('Select project')}</option
                    >{#each activeProjects as project}<option value={project.id}
                        >{project.project_number} — {project.name}</option
                      >{/each}</select
                  ></label
                ><label
                  >{translate('Name')}<input
                    name="name"
                    value={projectContextFormValue(milestoneFormResult, 'name')}
                    required
                  /></label
                ><label
                  >{translate('Description')}<textarea name="description" rows="2"
                    >{projectContextFormValue(milestoneFormResult, 'description')}</textarea
                  ></label
                ><label
                  >{translate('Amount (minor)')}<input
                    name="amountMinor"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    value={projectContextFormValue(milestoneFormResult, 'amountMinor')}
                    required
                  /></label
                ><label
                  >{translate('Due on')}<input
                    name="dueOn"
                    type="date"
                    value={projectContextFormValue(milestoneFormResult, 'dueOn')}
                  /></label
                ><button>{translate('Save milestone')}</button>
              </form>
            </details>
            <details class="admin-details" bind:this={ownerScheduleDetails}>
              <summary class="primary-button">{translate('Expected Working Schedule')}</summary>
              <form
                method="POST"
                action="?/updateSchedule"
                class="admin-form-grid"
                bind:this={ownerScheduleForm}
              >
                <h2>{translate('Expected working schedule')}</h2>
                <label
                  >{translate('Project')}<select
                    name="projectId"
                    value={scheduleProjectId}
                    onchange={(event) => (scheduleProjectOverride = event.currentTarget.value)}
                    required
                    ><option value="" disabled>{translate('Select project')}</option
                    >{#each operationalProjects as project}<option value={project.id}
                        >{project.project_number} — {project.name}</option
                      >{/each}</select
                  ></label
                ><label
                  >{translate('Timezone')}<input
                    name="timezone"
                    value={scheduleTimezone}
                    oninput={(event) => (scheduleTimezoneOverride = event.currentTarget.value)}
                    required
                  /></label
                ><label
                  >{translate('Effective from')}<input
                    name="effectiveFrom"
                    type="date"
                    value={projectContextFormValue(scheduleFormResult, 'effectiveFrom')}
                    required
                  /></label
                >
                <label
                  >{translate('Mon minutes')}<input
                    name="mondayMinutes"
                    type="number"
                    min="0"
                    max="1440"
                    value={projectContextFormValue(scheduleFormResult, 'mondayMinutes')}
                    required
                  /></label
                ><label
                  >{translate('Tue minutes')}<input
                    name="tuesdayMinutes"
                    type="number"
                    min="0"
                    max="1440"
                    value={projectContextFormValue(scheduleFormResult, 'tuesdayMinutes')}
                    required
                  /></label
                ><label
                  >{translate('Wed minutes')}<input
                    name="wednesdayMinutes"
                    type="number"
                    min="0"
                    max="1440"
                    value={projectContextFormValue(scheduleFormResult, 'wednesdayMinutes')}
                    required
                  /></label
                ><label
                  >{translate('Thu minutes')}<input
                    name="thursdayMinutes"
                    type="number"
                    min="0"
                    max="1440"
                    value={projectContextFormValue(scheduleFormResult, 'thursdayMinutes')}
                    required
                  /></label
                ><label
                  >{translate('Fri minutes')}<input
                    name="fridayMinutes"
                    type="number"
                    min="0"
                    max="1440"
                    value={projectContextFormValue(scheduleFormResult, 'fridayMinutes')}
                    required
                  /></label
                ><label
                  >{translate('Sat minutes')}<input
                    name="saturdayMinutes"
                    type="number"
                    min="0"
                    max="1440"
                    value={projectContextFormValue(scheduleFormResult, 'saturdayMinutes')}
                    required
                  /></label
                ><label
                  >{translate('Sun minutes')}<input
                    name="sundayMinutes"
                    type="number"
                    min="0"
                    max="1440"
                    value={projectContextFormValue(scheduleFormResult, 'sundayMinutes', '0')}
                    required
                  /></label
                ><button>{translate('Save schedule')}</button>
              </form>
            </details>
          {/if}
          <SectionCard
            title={translate('Assignment history')}
            collapsible
            expanded={$page.url.hash === '#assignment-history'}
            class="record-list full assignment-history-list"
            id="assignment-history"
            tabindex="-1"
          >
            <div class="panel-title">
              <div>
                <p class="form-help">
                  {translate(
                    'Inactive rows remain available for audit and historical attribution.',
                  )}
                </p>
              </div>
              <span>{data.assignments?.length ?? 0}</span>
            </div>
            <RecordBrowser
              rows={data.assignments ?? []}
              bind:visible={assignmentPage}
              {translate}
              label="Assignment history"
              focusId={$page.url.hash === '#assignment-history'
                ? ($page.url.searchParams.get('assignment') ?? '')
                : ''}
            />
            {#each assignmentPage as assignment}
              <a
                class="record-card-link"
                href={canManageAssignmentControls
                  ? assignmentWorkflowHref(projectWorkflowPage.url, 'updateAssignment', {
                      project: String(assignment.project_id ?? ''),
                      worker: String(assignment.worker_id ?? assignment.user_id ?? ''),
                    })
                  : `${base}/app/projects/${encodeURIComponent(String(assignment.project_id ?? ''))}`}
              >
                <div>
                  <strong>{assignment.project_number} · {assignment.project_name}</strong>
                  <small
                    >{assignment.worker_name} · {assignment.starts_on} → {assignment.ends_on || '—'} ·
                    {controlledValue('status', assignment.status)}</small
                  >
                </div>
                <span class="record-card-open">{translate('Open record')} <DirectionIcon /></span>
              </a>
            {:else}<div class="empty">{translate('No assignments recorded.')}</div>{/each}
          </SectionCard>
        {/if}
      </div>
    {:else if data.section === 'planning'}
      <div class="management-stack">
        <PlanningCalendar
          {translate}
          {locale}
          agendaId="planning-day-agenda"
          initialDate={$page.url.searchParams.get('date') ?? undefined}
          events={(data.records ?? []).map((row) => ({
            id: String(row.id),
            title: `${row.worker_name} · ${row.project_number}${row.planned_minutes == null ? '' : ` · ${row.planned_minutes} min`}`,
            startsAt: String(row.starts_at),
            endsAt: row.ends_at == null ? undefined : String(row.ends_at),
            href: planningRecordHref(row),
          }))}
          onselectdate={canManageAssignmentControls ? selectPlanningDate : undefined}
        />
        <p class="form-help">
          {translate('Calendar times are shown in UTC. Planning never creates actual hours.')}
        </p>
        {#if focusedPlanningRecord}
          <section
            id="planning-shift-detail"
            class="record-list full planning-shift-detail"
            aria-labelledby="planning-shift-title"
            tabindex="-1"
          >
            <div class="panel-title">
              <h2 id="planning-shift-title">{translate('Published schedule')}</h2>
              <span class="state-tag"
                >{controlledValue('status', focusedPlanningRecord.status)}</span
              >
            </div>
            <p>
              <strong>{focusedPlanningRecord.worker_name}</strong> · {focusedPlanningRecord.project_number}
              · {focusedPlanningRecord.project_name}
            </p>
            <dl class="planning-shift-facts">
              <div>
                <dt>{translate('Start')}</dt>
                <dd>
                  {String(focusedPlanningRecord.starts_at).replace('T', ' ').slice(0, 16)} UTC
                </dd>
              </div>
              {#if focusedPlanningRecord.ends_at}
                <div>
                  <dt>{translate('End (optional)')}</dt>
                  <dd>
                    {String(focusedPlanningRecord.ends_at).replace('T', ' ').slice(0, 16)} UTC
                  </dd>
                </div>
              {/if}
              {#if focusedPlanningRecord.planned_minutes != null}
                <div>
                  <dt>{translate('Planned minutes (optional)')}</dt>
                  <dd>{focusedPlanningRecord.planned_minutes} min</dd>
                </div>
              {/if}
              {#if focusedPlanningRecord.site}
                <div>
                  <dt>{translate('Site (optional)')}</dt>
                  <dd>{focusedPlanningRecord.site}</dd>
                </div>
              {/if}
              {#if focusedPlanningRecord.required_skill}
                <div>
                  <dt>{translate('Required expertise')}</dt>
                  <dd>{focusedPlanningRecord.required_skill}</dd>
                </div>
              {/if}
            </dl>
            <a
              class="secondary-button"
              href={`${base}/app/projects/${encodeURIComponent(String(focusedPlanningRecord.project_id))}?tab=team`}
              >{translate('Open project')} <DirectionIcon /></a
            >
          </section>
        {/if}
        {#if planningProblem && planningFailure?.operation !== 'createPlanning' && !planningFailedRecordVisible}
          <div data-planning-fallback>
            <ProblemNotice
              problem={planningProblem}
              kind={planningProblem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
              remedyLinks={globalRemedyLinks}
            />
          </div>
        {/if}
        {#if canManageAssignmentControls && (data.records?.length ?? 0) > 0}
          <SectionCard title={translate('Published assignments')} class="full">
            {#each data.records ?? [] as row}
              {@const updateWorkers = planningWorkersForUpdate(row)}
              {@const selectedWorkerId = planningEditValue(row, 'workerId', row.worker_id)}
              <details
                id={`planning-assignment-${row.id}`}
                open={$page.url.searchParams.get('focus') === String(row.id) ||
                  $page.url.hash === `#planning-assignment-${row.id}` ||
                  planningEditorsExpanded[planningEditKey(row)] === true ||
                  planningFailedUpdateId === String(row.id) ||
                  (planningFailure?.operation === 'cancelPlanning' &&
                    String(planningFailure.values?.id ?? '') === String(row.id))}
                ontoggle={(event) => {
                  planningEditorsExpanded[planningEditKey(row)] = event.currentTarget.open;
                }}
              >
                <summary
                  >{row.worker_name} · {row.project_number} · {String(row.starts_at)
                    .slice(0, 16)
                    .replace('T', ' ')}{row.ends_at
                    ? ` → ${String(row.ends_at).slice(0, 16).replace('T', ' ')}`
                    : ''}</summary
                >
                <form
                  method="POST"
                  action={`?/updatePlanning#planning-assignment-${row.id}`}
                  data-workforce-operation="updatePlanning"
                  data-record-id={String(row.id)}
                  class="admin-form-grid"
                  use:formValidation
                  oninput={(event) => rememberPlanningEdit(row, event.currentTarget)}
                >
                  {#if planningProblem && planningFailure?.operation === 'updatePlanning' && planningFailedUpdateId === String(row.id)}
                    <ProblemNotice
                      problem={planningProblem}
                      kind={planningProblem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
                      remedyLinks={globalRemedyLinks}
                    />
                  {/if}
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="version" value={row.version} />
                  <input type="hidden" name="projectId" value={row.project_id} />
                  <label
                    >{translate('Worker')}<select name="workerId" required>
                      <option
                        value=""
                        selected={!updateWorkers.some(
                          (worker) => String(worker.id) === selectedWorkerId,
                        )}>{translate('Select assigned worker')}</option
                      >
                      {#each updateWorkers as worker}
                        <option value={worker.id} selected={String(worker.id) === selectedWorkerId}
                          >{worker.name}</option
                        >
                      {/each}
                    </select></label
                  >{#if planningFieldMessage('workerId', 'updatePlanning', String(row.id))}<small
                      class="field-error"
                      role="alert"
                      >{planningFieldMessage('workerId', 'updatePlanning', String(row.id))}</small
                    >{/if}
                  <label
                    >{translate('Start')}<input
                      name="startsAt"
                      type="datetime-local"
                      value={planningEditValue(row, 'startsAt', row.starts_at).slice(0, 16)}
                      required
                    /></label
                  >{#if planningFieldMessage('startsAt', 'updatePlanning', String(row.id))}<small
                      class="field-error"
                      role="alert"
                      >{planningFieldMessage('startsAt', 'updatePlanning', String(row.id))}</small
                    >{/if}
                  <label
                    >{translate('End (optional)')}<input
                      name="endsAt"
                      type="datetime-local"
                      value={planningEditValue(row, 'endsAt', row.ends_at).slice(0, 16)}
                    /></label
                  >{#if planningFieldMessage('endsAt', 'updatePlanning', String(row.id))}<small
                      class="field-error"
                      role="alert"
                      >{planningFieldMessage('endsAt', 'updatePlanning', String(row.id))}</small
                    >{/if}
                  <label
                    >{translate('Planned minutes (optional)')}<input
                      name="plannedMinutes"
                      type="number"
                      min="0"
                      max="10080"
                      value={planningEditValue(row, 'plannedMinutes', row.planned_minutes)}
                    /></label
                  >{#if planningFieldMessage('plannedMinutes', 'updatePlanning', String(row.id))}<small
                      class="field-error"
                      role="alert"
                      >{planningFieldMessage(
                        'plannedMinutes',
                        'updatePlanning',
                        String(row.id),
                      )}</small
                    >{/if}
                  <label
                    >{translate('Site (optional)')}<input
                      name="site"
                      value={planningEditValue(row, 'site', row.site)}
                    /></label
                  >
                  <label
                    >{translate('Required expertise')}<input
                      name="requiredSkill"
                      value={planningEditValue(row, 'requiredSkill', row.required_skill)}
                    /></label
                  >
                  <button type="submit">{translate('Save assignment')}</button>
                </form>
                <form
                  method="POST"
                  action={`?/cancelPlanning#planning-assignment-${row.id}`}
                  data-workforce-operation="cancelPlanning"
                  data-record-id={String(row.id)}
                  use:formValidation
                >
                  {#if planningProblem && planningFailure?.operation === 'cancelPlanning' && String(planningFailure.values?.id ?? '') === String(row.id)}
                    <ProblemNotice
                      problem={planningProblem}
                      kind={planningProblem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
                      remedyLinks={globalRemedyLinks}
                    />
                  {/if}
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="version" value={row.version} />
                  <button type="submit" class="secondary-button"
                    >{translate('Cancel assignment')}</button
                  >
                </form>
              </details>
            {/each}
          </SectionCard>
        {/if}
        {#if canManageAssignmentControls}<form
            id="planning-create-form"
            method="POST"
            action="?/createPlanning#planning-create-form"
            data-workforce-operation="createPlanning"
            bind:this={planningForm}
            class="admin-form-grid"
            use:formValidation
          >
            {#if form?.success === true && form?.operation === 'createPlanning'}
              <p class="form-help" role="status">{actionFeedback}</p>
            {/if}
            {#if planningProblem && planningFailure?.operation === 'createPlanning'}
              <ProblemNotice
                problem={planningProblem}
                kind={planningProblem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
                remedyLinks={globalRemedyLinks}
              />
            {/if}
            <input type="hidden" name="requestKey" value={planningRequestKey} />
            <h2>{translate('Publish field assignment')}</h2>
            <p class="form-help">
              {translate(
                'Publish a planned assignment for one or more assigned workers. Planning does not create actual time entries; each worker records the work performed separately.',
              )}
            </p>
            {#if emptyPlanningProjectProblem}
              <div class="form-help">
                <ProblemNotice
                  problem={emptyPlanningProjectProblem}
                  kind="error"
                  remedyLinks={{
                    review_project_status: {
                      label: translate('Review project status'),
                      href: `${base}/app/projects`,
                    },
                    contact_project_owner: {
                      label: translate('Contact the project owner'),
                    },
                  }}
                />
              </div>
            {/if}
            <label
              >{translate('Project')}<select
                name="projectId"
                bind:value={planningProjectId}
                required
                >{#if planningProjectId && !operationalProjects.some((project) => String(project.id) === planningProjectId)}
                  <option value={planningProjectId} disabled
                    >{String(
                      planningProjectUnavailable?.name ?? translate('Previously selected project'),
                    )} · {translate('Unavailable for planning')}</option
                  >
                {/if}{#each operationalProjects as project}<option value={project.id}
                    >{project.project_number} — {project.name}</option
                  >{/each}</select
              ></label
            >{#if planningFieldMessage('projectId', 'createPlanning')}<small
                class="field-error"
                role="alert">{planningFieldMessage('projectId', 'createPlanning')}</small
              >{/if}{#if planningProjectId && planningEligibleWorkers.length === 0}<p
                class="form-help"
                role="status"
              >
                {translate(
                  'No worker is assigned to this project for the selected dates. Assign a worker to the project or choose another date.',
                )}
              </p>{/if}
            <fieldset class="planning-workers-fieldset">
              <legend>{translate('Workers')}</legend>
              <p class="form-help">
                {translate(
                  'Select one or more assigned workers. Each worker receives the same assignment.',
                )}
              </p>
              {#each planningEligibleWorkers as worker}
                <label class="check"
                  ><input
                    type="checkbox"
                    name="workerIds"
                    value={String(worker.id)}
                    bind:group={planningWorkerIds}
                  />{worker.name}</label
                >
              {/each}
              {#each planningUnavailableWorkers as workerId}
                <label class="check"
                  ><input
                    type="checkbox"
                    name="workerIds"
                    value={workerId}
                    bind:group={planningWorkerIds}
                  />{String(
                    (data.workers ?? []).find((worker) => String(worker.id) === workerId)?.name ??
                      translate('Previously selected worker'),
                  )} · {translate('Unavailable for these dates')}</label
                >
              {/each}
              {#if planningFieldMessage('workerIds', 'createPlanning')}<small
                  class="field-error"
                  role="alert">{planningFieldMessage('workerIds', 'createPlanning')}</small
                >{/if}
            </fieldset>
            <p class="form-help">
              {translate(
                'Enter dates and times in UTC. The worker agenda also shows times in UTC.',
              )}
            </p>
            <label
              >{translate('Start (UTC)')}<input
                name="startsAt"
                type="datetime-local"
                bind:value={planningStarts}
                required
              /></label
            >{#if planningFieldMessage('startsAt', 'createPlanning')}<small
                class="field-error"
                role="alert">{planningFieldMessage('startsAt', 'createPlanning')}</small
              >{/if}<label
              >{translate('End (UTC, optional)')}<input
                name="endsAt"
                type="datetime-local"
                bind:value={planningEnds}
              /></label
            >{#if planningFieldMessage('endsAt', 'createPlanning')}<small
                class="field-error"
                role="alert">{planningFieldMessage('endsAt', 'createPlanning')}</small
              >{/if}<ProjectBudgetInput
              name="plannedMinutes"
              label={translate('Planned hours (optional)')}
              kind="hours"
              value={planningFailure?.operation === 'createPlanning'
                ? String(planningFailure.values?.plannedMinutes ?? '')
                : ''}
            />
            {#if planningFieldMessage('plannedMinutes', 'createPlanning')}<small
                class="field-error"
                role="alert">{planningFieldMessage('plannedMinutes', 'createPlanning')}</small
              >{/if}<label
              >{translate('Site (optional)')}<input
                name="site"
                value={planningFailure?.operation === 'createPlanning'
                  ? String(planningFailure.values?.site ?? '')
                  : ''}
              /></label
            ><label
              >{translate('Required expertise')}<input
                name="requiredSkill"
                value={planningFailure?.operation === 'createPlanning'
                  ? String(planningFailure.values?.requiredSkill ?? '')
                  : ''}
              /></label
            ><button
              disabled={Boolean(
                (planningProjectId &&
                  !operationalProjects.some(
                    (project) => String(project.id) === planningProjectId,
                  )) ||
                planningUnavailableWorkers.length > 0 ||
                planningWorkerIds.length === 0 ||
                !planningRequestKey,
              )}>{translate('Publish assignment')}</button
            >
          </form>{/if}
        {#if data.user.role === 'owner_admin' || data.user.role === 'finance_admin'}
          <SectionCard
            title={translate('Manage worker expertise')}
            id="planning-skills"
            collapsible
            expanded={Boolean(skillProblem)}
            class="full planning-skill-tools"
          >
            {#if skillProblem}
              <ProblemNotice
                problem={skillProblem}
                kind={skillProblem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
                remedyLinks={globalRemedyLinks}
              />
            {/if}
            <details class="admin-details" open={skillFailure?.operation === 'createSkill'}>
              <summary class="primary-button">{translate('New expertise')}</summary>
              <form
                method="POST"
                action="?/createSkill#planning-skills"
                data-workforce-operation="createSkill"
                class="admin-form-grid"
                use:formValidation
              >
                <h2>{translate('Add expertise')}</h2>
                <label
                  >{translate('Code')}<input
                    name="code"
                    value={skillValue('createSkill', 'code')}
                    required
                  /></label
                ><label
                  >{translate('Name')}<input
                    name="name"
                    value={skillValue('createSkill', 'name')}
                    required
                  /></label
                ><button>{translate('Save expertise')}</button>
              </form>
            </details>
            <details class="admin-details" open={skillFailure?.operation === 'updateSkill'}>
              <summary class="primary-button">{translate('Update expertise')}</summary>
              <form
                method="POST"
                action="?/updateSkill#planning-skills"
                data-workforce-operation="updateSkill"
                class="admin-form-grid"
                use:formValidation
              >
                <h2>{translate('Update expertise')}</h2>
                <label
                  >{translate('Expertise')}<select
                    name="skillId"
                    value={skillValue('updateSkill', 'skillId')}
                    required
                  >
                    {#if missingChoice(skillValue('updateSkill', 'skillId'), data.skills ?? [])}<option
                        value={skillValue('updateSkill', 'skillId')}
                        disabled>{translate('Expertise')} · {translate('Unavailable')}</option
                      >{/if}
                    {#each data.skills ?? [] as skill}<option value={skill.id}
                        >{skill.code} — {skill.name}</option
                      >{/each}
                  </select></label
                >
                <label
                  >{translate('Name')}<input
                    name="name"
                    value={skillValue('updateSkill', 'name')}
                  /></label
                >
                <button>{translate('Update expertise')}</button>
              </form>
            </details>
            <details class="admin-details" open={skillFailure?.operation === 'deleteSkill'}>
              <summary class="primary-button">{translate('Delete expertise')}</summary>
              <form
                method="POST"
                action="?/deleteSkill#planning-skills"
                data-workforce-operation="deleteSkill"
                class="admin-form-grid"
                use:formValidation
              >
                <h2>{translate('Delete expertise')}</h2>
                <label
                  >{translate('Expertise')}<select
                    name="skillId"
                    value={skillValue('deleteSkill', 'skillId')}
                    required
                  >
                    {#if missingChoice(skillValue('deleteSkill', 'skillId'), data.skills ?? [])}<option
                        value={skillValue('deleteSkill', 'skillId')}
                        disabled>{translate('Expertise')} · {translate('Unavailable')}</option
                      >{/if}
                    {#each data.skills ?? [] as skill}<option value={skill.id}
                        >{skill.code} — {skill.name}</option
                      >{/each}
                  </select></label
                >
                <button class="danger">{translate('Delete expertise')}</button>
              </form>
            </details>
            <details class="admin-details" open={skillFailure?.operation === 'setWorkerSkill'}>
              <summary class="primary-button">{translate('Assign expertise')}</summary>
              <form
                method="POST"
                action="?/setWorkerSkill#planning-skills"
                data-workforce-operation="setWorkerSkill"
                class="admin-form-grid"
                use:formValidation
              >
                <h2>{translate('Assign expertise')}</h2>
                <label
                  >{translate('Worker')}<select
                    name="workerId"
                    value={skillValue('setWorkerSkill', 'workerId')}
                    required
                    >{#if missingChoice(skillValue('setWorkerSkill', 'workerId'), data.workers ?? [])}<option
                        value={skillValue('setWorkerSkill', 'workerId')}
                        disabled>{translate('Worker')} · {translate('Unavailable')}</option
                      >{/if}{#each data.workers ?? [] as worker}<option value={worker.id}
                        >{worker.name}</option
                      >{/each}</select
                  ></label
                ><label
                  >{translate('Expertise')}<select
                    name="skillId"
                    value={skillValue('setWorkerSkill', 'skillId')}
                    required
                    >{#if missingChoice(skillValue('setWorkerSkill', 'skillId'), data.skills ?? [])}<option
                        value={skillValue('setWorkerSkill', 'skillId')}
                        disabled>{translate('Expertise')} · {translate('Unavailable')}</option
                      >{/if}{#each data.skills ?? [] as skill}<option value={skill.id}
                        >{skill.code} — {skill.name}</option
                      >{/each}</select
                  ></label
                ><label
                  >{translate('Proficiency')}<select
                    name="proficiency"
                    value={skillValue('setWorkerSkill', 'proficiency', '1')}
                    ><option value="1">1 · {translate('exposure')}</option><option value="2"
                      >2 · {translate('developing')}</option
                    ><option value="3">3 · {translate('capable')}</option><option value="4"
                      >4 · {translate('advanced')}</option
                    ><option value="5">5 · {translate('expert')}</option></select
                  ></label
                ><button>{translate('Update expertise matrix')}</button>
              </form>
            </details>
            <details class="admin-details" open={skillFailure?.operation === 'deleteWorkerSkill'}>
              <summary class="primary-button">{translate('Remove worker expertise')}</summary>
              <form
                method="POST"
                action="?/deleteWorkerSkill#planning-skills"
                data-workforce-operation="deleteWorkerSkill"
                class="admin-form-grid"
                use:formValidation
              >
                <h2>{translate('Remove worker expertise')}</h2>
                <label
                  >{translate('Worker')}<select
                    name="workerId"
                    value={skillValue('deleteWorkerSkill', 'workerId')}
                    required
                  >
                    {#if missingChoice(skillValue('deleteWorkerSkill', 'workerId'), data.workers ?? [])}<option
                        value={skillValue('deleteWorkerSkill', 'workerId')}
                        disabled>{translate('Worker')} · {translate('Unavailable')}</option
                      >{/if}
                    {#each data.workers ?? [] as worker}<option value={worker.id}
                        >{worker.name}</option
                      >{/each}
                  </select></label
                >
                <label
                  >{translate('Expertise')}<select
                    name="skillId"
                    value={skillValue('deleteWorkerSkill', 'skillId')}
                    required
                  >
                    {#if missingChoice(skillValue('deleteWorkerSkill', 'skillId'), data.skills ?? [])}<option
                        value={skillValue('deleteWorkerSkill', 'skillId')}
                        disabled>{translate('Expertise')} · {translate('Unavailable')}</option
                      >{/if}
                    {#each data.skills ?? [] as skill}<option value={skill.id}
                        >{skill.code} — {skill.name}</option
                      >{/each}
                  </select></label
                >
                <button class="danger">{translate('Remove expertise')}</button>
              </form>
            </details>
          </SectionCard>
        {/if}
        <section class="record-list full">
          <div class="panel-title">
            <h2>{translate('Published schedule')}</h2>
            <span>{data.records?.length ?? 0}</span>
          </div>
          <form method="GET" class="admin-form-grid">
            <label
              >{translate('Project')}<select
                name="project"
                value={$page.url.searchParams.get('project') ?? ''}
              >
                <option value="">{translate('All')}</option>
                {#each data.projects ?? [] as project}<option value={project.id}
                    >{project.project_number} · {project.name}</option
                  >{/each}
              </select></label
            >
            {#if data.user.role !== 'worker' && (data.planningFilterWorkers?.length || $page.url.searchParams.get('worker'))}<label
                >{translate('Worker')}<select
                  name="worker"
                  value={$page.url.searchParams.get('worker') ?? ''}
                >
                  <option value="">{translate('All')}</option>
                  {#if $page.url.searchParams.get('worker') && !(data.planningFilterWorkers ?? []).some((worker) => String(worker.id) === $page.url.searchParams.get('worker'))}<option
                      value={$page.url.searchParams.get('worker') ?? ''}
                      disabled>{translate('Worker')} · {translate('Unavailable')}</option
                    >{/if}
                  {#each data.planningFilterWorkers ?? [] as worker}<option value={worker.id}
                      >{worker.label}</option
                    >{/each}
                </select></label
              >{/if}
            <button type="submit">{translate('Filter')}</button>
          </form>
          <RecordBrowser
            rows={data.records ?? []}
            bind:visible={planningPage}
            {translate}
            label="Published schedule"
          />
          {#each planningPage as row}<a class="record-card-link" href={planningRecordHref(row)}>
              <div>
                <strong class="planning-record-heading"
                  >{row.worker_name} · {row.project_number}</strong
                >
                <small class="planning-record-detail"
                  >{String(row.starts_at).replace('T', ' ').slice(0, 16)}{row.planned_minutes ==
                  null
                    ? ''
                    : ` · ${row.planned_minutes} min`}{row.site ? ` · ${row.site}` : ''}</small
                >
              </div>
              <span class="record-card-open">{translate('Open record')} <DirectionIcon /></span>
              <span class="state-tag">{controlledValue('status', row.status)}</span>
            </a>{/each}
        </section>
      </div>
    {:else if data.section === 'approvals'}
      <ApprovalSection
        {data}
        {isAuditor}
        isOwner={data.user.role === 'owner_admin'}
        canSeeFinanceReview={isFinance}
        {translate}
        {controlledValue}
      />
    {:else if data.section === 'billing'}
      <BillingSection
        {data}
        {form}
        {locale}
        {isAuditor}
        {availableProjects}
        {translate}
        {controlledValue}
        formatMoney={(minor, currency) => paymentMoney(minor, currency, documentLanguage(locale))}
      />
    {:else if data.section === 'finance' && data.finance}
      <FinanceOverviewSection
        {locale}
        {data}
        {availableProjects}
        {isAuditor}
        {translate}
        {controlledValue}
        money={(minor, currency) => paymentMoney(minor, currency, documentLanguage(locale))}
        currentView={currentView || 'overview'}
      />
    {:else if data.section === 'ledger'}
      <CollectionsLedgerSection {data} {translate} {controlledValue} {locale} />
    {:else if data.section === 'accounting'}
      <AccountingSection {data} {isAuditor} {locale} {translate} {controlledValue} />
    {:else if data.section === 'profile'}
      <div class="management-stack">
        <section class="entry-panel" id="profile-skills">
          <span class="portal-kicker">{translate('WORKFORCE PROFILE')}</span>
          <h2>{translate('Expertise and availability')}</h2>
          <p>
            {translate(
              ['owner_admin', 'finance_admin', 'project_manager'].includes(String(data.user.role))
                ? "Review the selected worker's expertise and availability without exposing compensation or client rates."
                : isAuditor
                  ? 'Review the expertise and availability shown here without exposing compensation or client rates.'
                  : 'Keep your own workforce profile current without exposing compensation or client rates.',
            )}
          </p>
          {#if skillProblem}
            <ProblemNotice
              problem={skillProblem}
              kind={skillProblem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
              remedyLinks={globalRemedyLinks}
            />
          {/if}
          {#if (data.user.role === 'owner_admin' || data.user.role === 'finance_admin' || data.user.role === 'project_manager') && (data.workers?.length ?? 0) > 0}
            <form method="GET" action={href('profile')} class="worker-profile-selector">
              <label
                >{translate('Search team')}<input
                  type="search"
                  bind:value={profileWorkerSearch}
                  autocomplete="off"
                /></label
              >
              {#if profileWorkerSearch.trim() && profileMatchingWorkers.length === 0}
                <p class="form-help" role="status">{translate('No matching records.')}</p>
              {/if}
              <label
                >{translate('Inspect worker')}<select
                  name="worker"
                  required
                  bind:value={profileSelectedWorkerId}
                >
                  {#each profileVisibleWorkers as worker}
                    <option value={worker.id}
                      >{worker.name} · {controlledValue('role', worker.role)}</option
                    >
                  {/each}
                </select></label
              >
              <button type="submit">{translate('View worker profile')}</button>
            </form>
          {/if}
          {#if !isAuditor}
            {#if profileExpertiseOptions.length === 0}
              <p class="form-help">
                {translate(
                  data.user.role === 'owner_admin'
                    ? 'No expertise options are available. Configure the expertise catalog before adding expertise.'
                    : 'No expertise options are available. Ask the owner to configure the expertise catalog before adding expertise.',
                )}
                {#if data.user.role === 'owner_admin'}
                  <a href={`${href('planning')}#planning-skills`}
                    >{translate('Manage expertise catalog')}</a
                  >
                {/if}
              </p>
            {/if}
            {#if profileExpertiseOptions.length > 0 || skillFailure?.operation === 'setWorkerSkill'}
              <details
                class="admin-details profile-skill-details"
                open={skillFailure?.operation === 'setWorkerSkill' &&
                  skillValue('setWorkerSkill', 'workerId') === profileWorkerId}
              >
                <summary class="primary-button">{translate('Add expertise')}</summary>
                <form
                  method="POST"
                  action="?/setWorkerSkill#profile-skills"
                  data-workforce-operation="setWorkerSkill"
                  data-workforce-origin="profile"
                  class="admin-form-grid"
                  use:formValidation
                >
                  <input type="hidden" name="workerId" value={profileWorkerId} />
                  <label
                    >{translate('Expertise')}
                    <select name="skillId" value={skillValue('setWorkerSkill', 'skillId')} required>
                      <option value="">{translate('Select expertise')}</option>
                      {#if missingChoice(skillValue('setWorkerSkill', 'skillId'), data.allSkills ?? data.skills ?? [], skillChoiceId)}<option
                          value={skillValue('setWorkerSkill', 'skillId')}
                          disabled>{translate('Expertise')} · {translate('Unavailable')}</option
                        >{/if}
                      {#each data.allSkills ?? data.skills ?? [] as skill}
                        <option value={skillChoiceId(skill)}>{skill.name}</option>
                      {/each}
                    </select>
                  </label>
                  <label
                    >{translate('Proficiency (1-5)')}
                    <input
                      name="proficiency"
                      type="number"
                      min="1"
                      max="5"
                      value={skillValue('setWorkerSkill', 'proficiency', '3')}
                      required
                    />
                  </label>
                  <button disabled={profileExpertiseOptions.length === 0}
                    >{translate('Add expertise')}</button
                  >
                </form>
              </details>
            {/if}
            {#if (data.skills?.length ?? 0) > 0 || skillFailure?.operation === 'deleteWorkerSkill'}
              <details
                class="admin-details profile-skill-details"
                open={skillFailure?.operation === 'deleteWorkerSkill' &&
                  skillValue('deleteWorkerSkill', 'workerId') === profileWorkerId}
              >
                <summary class="primary-button">{translate('Remove expertise')}</summary>
                <form
                  method="POST"
                  action="?/deleteWorkerSkill#profile-skills"
                  data-workforce-operation="deleteWorkerSkill"
                  data-workforce-origin="profile"
                  class="admin-form-grid"
                  use:formValidation
                >
                  <input type="hidden" name="workerId" value={profileWorkerId} />
                  <label
                    >{translate('Expertise')}
                    <select
                      name="skillId"
                      value={skillValue('deleteWorkerSkill', 'skillId')}
                      required
                    >
                      <option value="">{translate('Select expertise')}</option>
                      {#if missingChoice(skillValue('deleteWorkerSkill', 'skillId'), data.skills ?? [], skillChoiceId)}<option
                          value={skillValue('deleteWorkerSkill', 'skillId')}
                          disabled>{translate('Expertise')} · {translate('Unavailable')}</option
                        >{/if}
                      {#each data.skills ?? [] as skill}
                        <option value={skillChoiceId(skill)}>{skill.name}</option>
                      {/each}
                    </select>
                  </label>
                  {#if profileAssignedExpertise.length === 0}
                    <p class="form-help">
                      {translate(
                        'No expertise is assigned to this profile, so there is nothing to remove.',
                      )}
                    </p>
                  {/if}
                  <button class="danger" disabled={profileAssignedExpertise.length === 0}
                    >{translate('Remove expertise')}</button
                  >
                </form>
              </details>
            {/if}
          {/if}
          <TableRegion
            class="table-wrap worker-profile-table"
            mobileMode="scroll"
            label={translate('Expertise and availability')}
          >
            <table>
              <thead
                ><tr
                  ><th>{translate('Expertise')}</th><th>{translate('Proficiency')}</th><th
                    >{translate('Verified')}</th
                  ></tr
                ></thead
              ><tbody
                >{#each data.skills ?? [] as skill}<tr
                    ><td>{skill.name}</td><td>{skill.proficiency}/5</td><td
                      >{skill.verified_at ? translate('verified') : translate('self-reported')}</td
                    ></tr
                  >{:else}<tr><td colspan="3">{translate('No expertise recorded.')}</td></tr
                  >{/each}</tbody
              >
            </table>
          </TableRegion>
          {#key profileWorkerId}
            <AvailabilityCalendar
              records={data.availability ?? []}
              workerId={profileWorkerId}
              currentUserId={String(data.user.id)}
              readOnly={isAuditor}
              {form}
              {translate}
              {locale}
            />
          {/key}
          {#if data.user.role === 'owner_admin' && (data.workers?.length ?? 0) > 0 && (profileExpertiseOptions.length > 0 || profileRemovalExpertiseOptions.length > 0 || Boolean(skillFailure))}
            <section
              class="owner-workforce-controls"
              aria-labelledby="worker-profile-controls-title"
            >
              <div class="panel-title">
                <div>
                  <span class="portal-kicker">{translate('OWNER ADMIN')}</span>
                  <h3 id="worker-profile-controls-title">{translate('Manage worker profiles')}</h3>
                  <p class="form-help">
                    {translate(
                      'Assign expertise and availability windows for an individual worker. These controls do not expose compensation or client-rate data.',
                    )}
                  </p>
                </div>
              </div>
              <details
                class="admin-details"
                open={skillFailure?.operation === 'setWorkerSkill' ||
                  skillFailure?.operation === 'deleteWorkerSkill'}
              >
                <summary class="primary-button">{translate('Manage worker expertise')}</summary>
                {#if profileExpertiseOptions.length === 0}
                  <p class="form-help">
                    {translate(
                      'No expertise options are available. Configure the expertise catalog before adding expertise.',
                    )}
                    <a href={`${href('planning')}#planning-skills`}
                      >{translate('Manage expertise catalog')}</a
                    >
                  </p>
                {/if}
                <form
                  method="POST"
                  action="?/setWorkerSkill#profile-skills"
                  data-workforce-operation="setWorkerSkill"
                  data-workforce-origin="owner"
                  class="admin-form-grid"
                  use:formValidation
                >
                  <label
                    >{translate('Worker')}<select
                      name="workerId"
                      value={skillValue('setWorkerSkill', 'workerId')}
                      required
                    >
                      {#if missingChoice(skillValue('setWorkerSkill', 'workerId'), data.workers ?? [])}<option
                          value={skillValue('setWorkerSkill', 'workerId')}
                          disabled>{translate('Worker')} · {translate('Unavailable')}</option
                        >{/if}
                      {#each data.workers ?? [] as worker}
                        <option value={worker.id}
                          >{worker.name} · {controlledValue('role', worker.role)}</option
                        >
                      {/each}
                    </select></label
                  >
                  <label
                    >{translate('Expertise')}<select
                      name="skillId"
                      value={skillValue('setWorkerSkill', 'skillId')}
                      required
                    >
                      <option value="">{translate('Select expertise')}</option>
                      {#if missingChoice(skillValue('setWorkerSkill', 'skillId'), data.allSkills ?? data.skills ?? [], skillChoiceId)}<option
                          value={skillValue('setWorkerSkill', 'skillId')}
                          disabled>{translate('Expertise')} · {translate('Unavailable')}</option
                        >{/if}
                      {#each data.allSkills ?? data.skills ?? [] as skill}
                        <option value={skillChoiceId(skill)}>{skill.name}</option>
                      {/each}
                    </select></label
                  >
                  <label
                    >{translate('Proficiency (1–5)')}<input
                      name="proficiency"
                      type="number"
                      min="1"
                      max="5"
                      value={skillValue('setWorkerSkill', 'proficiency', '3')}
                      required
                    /></label
                  >
                  <button type="submit" disabled={profileExpertiseOptions.length === 0}
                    >{translate('Assign expertise')}</button
                  >
                </form>
                <form
                  method="POST"
                  action="?/deleteWorkerSkill#profile-skills"
                  data-workforce-operation="deleteWorkerSkill"
                  data-workforce-origin="owner"
                  class="admin-form-grid"
                  use:formValidation
                >
                  <label
                    >{translate('Worker')}<select
                      name="workerId"
                      value={skillValue('deleteWorkerSkill', 'workerId')}
                      required
                    >
                      {#if missingChoice(skillValue('deleteWorkerSkill', 'workerId'), data.workers ?? [])}<option
                          value={skillValue('deleteWorkerSkill', 'workerId')}
                          disabled>{translate('Worker')} · {translate('Unavailable')}</option
                        >{/if}
                      {#each data.workers ?? [] as worker}
                        <option value={worker.id}
                          >{worker.name} · {controlledValue('role', worker.role)}</option
                        >
                      {/each}
                    </select></label
                  >
                  <label
                    >{translate('Expertise')}<select
                      name="skillId"
                      value={skillValue('deleteWorkerSkill', 'skillId')}
                      required
                    >
                      <option value="">{translate('Select expertise')}</option>
                      {#if missingChoice(skillValue('deleteWorkerSkill', 'skillId'), profileRemovalExpertiseOptions, skillChoiceId)}<option
                          value={skillValue('deleteWorkerSkill', 'skillId')}
                          disabled>{translate('Expertise')} · {translate('Unavailable')}</option
                        >{/if}
                      {#each profileRemovalExpertiseOptions as skill}
                        <option value={skillChoiceId(skill)}>{skill.name}</option>
                      {/each}
                    </select></label
                  >
                  {#if profileRemovalExpertiseOptions.length === 0}
                    <p class="form-help">
                      {translate('No expertise options are available to remove.')}
                    </p>
                  {/if}
                  <button
                    class="danger"
                    type="submit"
                    disabled={profileRemovalExpertiseOptions.length === 0}
                    >{translate('Remove expertise')}</button
                  >
                </form>
              </details>
            </section>
          {/if}
          <TableRegion
            class="table-wrap worker-profile-table"
            mobileMode="scroll"
            label={translate('Availability')}
          >
            <table>
              <thead
                ><tr
                  ><th>{translate('Window')}</th><th>{translate('Status')}</th><th
                    >{translate('Note')}</th
                  ></tr
                ></thead
              ><tbody
                >{#each data.availability ?? [] as item}<tr
                    ><td
                      >{String(item.starts_at).replace('T', ' ').slice(0, 16)} → {String(
                        item.ends_at,
                      )
                        .replace('T', ' ')
                        .slice(0, 16)}</td
                    ><td>{controlledValue('availability', item.availability)}</td><td
                      >{item.note ?? '—'}</td
                    ></tr
                  >{:else}<tr
                    ><td colspan="3">{translate('No availability windows recorded.')}</td></tr
                  >{/each}</tbody
              >
            </table>
          </TableRegion>
        </section>
        <section class="entry-panel security-panel">
          <span class="portal-kicker">{translate('ACCOUNT SECURITY')}</span>
          <h2>{data.user.name}</h2>
          <p>{data.user.email} · {controlledValue('role', data.user.role ?? 'worker')}</p>
          <div class="security-methods">
            <div class="security-method-heading">
              <div>
                <span class="portal-kicker">{translate('PHISHING-RESISTANT ACCESS')}</span>
                <h3>{translate('Passkeys')}</h3>
              </div>
              <span class="state-tag">{passkeys.length} {translate('registered')}</span>
            </div>
            <p class="form-help">
              {translate(
                'Register a device passkey for faster, phishing-resistant sign-in. A passkey never leaves your device.',
              )}
            </p>
            <form class="inline-form" onsubmit={registerPasskey}>
              <label
                >{translate('Device name')}<input
                  name="passkeyName"
                  bind:value={passkeyName}
                  placeholder={translate('Work laptop')}
                  maxlength="80"
                /></label
              ><button type="submit">{translate('Register passkey')}</button>
            </form>
            {#if passkeys.length}<ul class="security-list">
                {#each passkeys as passkey}<li>
                    <span
                      ><strong>{passkey.name || translate('Unnamed device')}</strong><small
                        >{passkey.createdAt
                          ? new Date(passkey.createdAt).toLocaleDateString()
                          : translate('Registered device')}</small
                      ></span
                    ><button
                      type="button"
                      class="text-button danger"
                      onclick={() => revokePasskey(passkey.id)}>{translate('Revoke')}</button
                    >
                  </li>{/each}
              </ul>{/if}
          </div>
          <div id="account-mfa" class="security-methods">
            <div class="security-method-heading">
              <div>
                <span class="portal-kicker">{translate('ACCOUNT MFA')}</span>
                <h3>{translate('Authenticator app')}</h3>
              </div>
              <span class="state-tag"
                >{mfaNeedsReview
                  ? mfaCopy.statusUnverified
                  : mfaEnrolled
                    ? translate('Enabled')
                    : translate('Not enabled')}</span
              >
            </div>
            <p class="form-help">
              {translate(
                'MFA is optional. Enabling it returns the setup URI and one-time recovery codes; store them in an approved password manager.',
              )}
            </p>
            {#if mfaProblem}
              <div data-profile-mfa-problem>
                <ProblemNotice
                  problem={mfaProblem}
                  kind={mfaProblemIsService(mfaProblem) ? 'service' : 'error'}
                  remedyLinks={mfaRemedyLinks}
                />
                {#if mfaProblem.correlationId && !mfaProblemIsService(mfaProblem)}
                  <small
                    >{portalText(locale, 'problem.error.reference', {
                      correlationId: mfaProblem.correlationId,
                    })}</small
                  >
                {/if}
                {#if mfaProblem.remedies.some((remedy) => remedy.id === 'review_mfa_status')}
                  <a
                    data-sveltekit-reload
                    href={`${base}/app/profile?lang=${locale}#account-mfa`}
                    onclick={reviewCurrentMfaStatus}>{mfaCopy.reviewMfaStatus}</a
                  >
                {/if}
              </div>
            {/if}
            {#if mfaEnrolled}
              <p class="form-help" data-mfa-disable-warning>{mfaCopy.disableWarning}</p>
            {/if}
            <div class="inline-actions">
              {#if !mfaEnrolled && !mfaSetupUri}<button
                  type="button"
                  disabled={mfaBusy || mfaNeedsReview}
                  onclick={() => toggleMfa('enable')}>{translate('Enable MFA')}</button
                >{/if}
              {#if mfaEnrolled}<button
                  type="button"
                  class="secondary"
                  disabled={mfaBusy || mfaNeedsReview}
                  onclick={() => toggleMfa('disable')}>{translate('Disable MFA')}</button
                >{/if}
            </div>
            {#if mfaSetupUri}
              <div class="security-setup" aria-live="polite">
                <p><strong>{translate('Finish authenticator setup')}</strong></p>
                <p class="form-help">
                  {translate(
                    'Add this URI to your authenticator, then enter the current six-digit code to confirm the device. Recovery codes are shown once; store them securely.',
                  )}
                </p>
                <code class="security-uri">{mfaSetupUri}</code>
                {#if mfaBackupCodes.length}
                  <p class="security-codes" aria-label={translate('One-time recovery codes')}>
                    {mfaBackupCodes.join(' · ')}
                  </p>
                {/if}
                <form class="inline-form" onsubmit={verifyMfa}>
                  <label
                    >{translate('Authenticator code')}<input
                      id="profile-mfa-code"
                      bind:value={mfaCode}
                      aria-invalid={Boolean(mfaProblem?.fieldErrors.code?.length)}
                      aria-describedby={mfaProblem?.fieldErrors.code?.length
                        ? 'profile-mfa-code-error'
                        : undefined}
                      inputmode="numeric"
                      autocomplete="one-time-code"
                      pattern={'[0-9]{6}'}
                      minlength="6"
                      maxlength="6"
                      required
                    /></label
                  >{#if mfaProblem?.fieldErrors.code?.[0]}<p
                      id="profile-mfa-code-error"
                      class="field-error"
                    >
                      {portalText(locale, mfaProblem.fieldErrors.code[0], mfaProblem.params)}
                    </p>{/if}<button type="submit" disabled={mfaBusy || mfaNeedsReview}
                    >{translate('Verify MFA')}</button
                  >
                </form>
              </div>
            {/if}
          </div>
          {#if securityMessage}<p class="action-message" role="status">
              {translate(securityMessage)}
            </p>{/if}
        </section>
      </div>
    {:else if data.section === 'notifications'}
      <NotificationSection
        records={data.records ?? []}
        {form}
        currentUserId={String(data.user.id)}
        {base}
        {locale}
        {translate}
      />
    {:else if data.section === 'audit'}
      <section class="record-list full">
        <div class="panel-title">
          <h2>{translate('Append-only security and finance audit')}</h2>
          <span>{data.audit?.length ?? 0} {translate('events on this page')}</span>
        </div>
        <p class="form-help">
          {translate(
            'Business and security includes all events except job service lifecycle. All activity keeps every event available.',
          )}
        </p>
        <nav class="audit-view-nav" aria-label={translate('Audit event filters')}>
          <a
            href={`${base}/app/audit?lang=${encodeURIComponent(locale)}&view=business`}
            aria-current={(data.auditView ?? 'business') === 'business' ? 'page' : undefined}
            >{translate('Business & security')}</a
          >
          <a
            href={`${base}/app/audit?lang=${encodeURIComponent(locale)}&view=service`}
            aria-current={data.auditView === 'service' ? 'page' : undefined}
            >{translate('Job service')}</a
          >
          <a
            href={`${base}/app/audit?lang=${encodeURIComponent(locale)}&view=all`}
            aria-current={data.auditView === 'all' ? 'page' : undefined}
            >{translate('All activity')}</a
          >
        </nav>
        {#if data.auditOlderPage}
          <a
            class="audit-latest-link"
            href={`${base}/app/audit?lang=${encodeURIComponent(locale)}&view=${data.auditView ?? 'business'}`}
            >{translate('Latest events')}</a
          >
        {/if}
        {#each data.audit ?? [] as row (String(row.id))}<article class="audit-event">
            <div>
              <strong>{String(row.action).replaceAll('_', ' ')}</strong><small
                >{String(row.entity_type)} · {String(row.entity_id)} ·
                <time datetime={auditUtcIso(row.occurred_at)}
                  >{auditTimestampLabel(row.occurred_at)}</time
                ></small
              >
              <small>{translate('Actor ID')}: {String(row.actor_id || '—')}</small>
            </div>
            <details class="audit-event__details">
              <summary
                aria-label={`${translate('View details')}: ${String(row.action)} · ${String(row.entity_id)}`}
                >{translate('View details')}</summary
              >
              <pre><code>{auditDetailsDisplay(row.details_json)}</code></pre>
            </details>
          </article>{:else}<div class="empty">
            {translate('No audit events in this view.')}
          </div>{/each}
        {#if data.auditHasMore && data.auditNextCursor}
          <a
            class="audit-older-link"
            href={`${base}/app/audit?lang=${encodeURIComponent(locale)}&view=${data.auditView ?? 'business'}&beforeAt=${encodeURIComponent(data.auditNextCursor.occurredAt)}&beforeId=${encodeURIComponent(data.auditNextCursor.id)}`}
            >{translate('Older events')}</a
          >
        {:else if data.auditOlderPage && (data.audit?.length ?? 0) > 0}
          <p class="form-help">{translate('End of this audit view.')}</p>
        {/if}
      </section>
    {:else}
      <section class="record-list full">
        <div class="panel-title"><h2 data-portal-live-text>{translate(currentTitle)}</h2></div>
        <div class="empty">{translate('Nothing is available in this view yet.')}</div>
      </section>
    {/if}
  </main>
  <ToastRegion toasts={toastItems} label={translate('Notifications')} ondismiss={dismissToast} />
  <nav class="bottom-nav" aria-label={translate('Mobile navigation')}>
    {#each mobileNavigation as item}
      <a
        class:active={activeDestination === item}
        href={itemHref(item)}
        aria-current={activeDestination === item ? 'page' : undefined}>{translate(item.label)}</a
      >
    {/each}
    <button
      type="button"
      class="bottom-nav-more"
      aria-controls="portal-navigation"
      aria-expanded={menuOpen}
      onclick={() => (menuOpen = true)}
    >
      {translate('More')}
    </button>
  </nav>
</div>

<style>
  .document-workspace {
    overflow-anchor: none;
  }
  .document-entry {
    flex-wrap: wrap;
  }
  .document-download-feedback {
    flex: 1 1 100%;
    min-width: 0;
  }
  .document-download-feedback > button {
    min-height: 2.75rem;
  }
  .planning-workers-fieldset {
    grid-column: 1 / -1;
    min-width: 0;
  }
  .planning-shift-detail {
    scroll-margin-top: 1rem;
  }
  .planning-shift-detail p {
    overflow-wrap: anywhere;
  }
  .planning-shift-facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
    gap: 0.8rem;
    margin: 1rem 0;
  }
  .planning-shift-facts div {
    min-width: 0;
  }
  .planning-shift-facts dt {
    color: var(--ja-text-secondary);
    font-size: 0.8rem;
  }
  .planning-shift-facts dd {
    margin: 0.2rem 0 0;
    overflow-wrap: anywhere;
    font-weight: 650;
  }
  @media (max-width: 767px) {
    :global(.portal-layout main .admin-form-grid.project-setup-form) {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
