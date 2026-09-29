<script lang="ts">
  import DirectionIcon from '$lib/portal/ui/DirectionIcon.svelte';
  import PrintIcon from '$lib/portal/ui/PrintIcon.svelte';
  import { base } from '$app/paths';
  import { beforeNavigate } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { page } from '$app/stores';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneActionMessage,
    standaloneText,
  } from '../../standalone-locale';
  import { translateReportHistoryAction, type PortalLocale } from '$lib/portal-i18n';
  import { ActionBar, Field, FieldGroup, FormCard, FormSection, SectionCard } from '$lib/portal/ui';
  import {
    applyReportSnapshot,
    clearStoredReportAutosave,
    readStoredReportAutosave,
    reportAutosaveStorageKey,
    snapshotReportForm,
    snapshotToFormData,
    writeStoredReportAutosave,
    type StoredReportAutosave,
  } from '$lib/portal/report-autosave';
  import formValidation, { reportFormFieldErrors } from '$lib/portal/ui/form-validation';
  import ProblemNotice from '$lib/portal/ui/ProblemNotice.svelte';
  import {
    privateDownloadFilename,
    typedPrivateDownloadProblem,
  } from '$lib/portal/ui/private-document-download';
  import type { ProblemData } from '$lib/problem/contract';
  import {
    translateControlledValue,
    type ControlledValueDomain,
  } from '$lib/i18n/controlled-values';
  import LocalizedPdfPanel from '$lib/portal/ui/localized-pdf/LocalizedPdfPanel.svelte';
  import CorrectionDraftForm from '$lib/portal/ui/CorrectionDraftForm.svelte';
  import { dailyCorrectionFields, technicalCorrectionFields } from '$lib/portal/correction-fields';
  import {
    readSessionItem,
    removeSessionItem,
    saveSessionItem,
  } from '$lib/portal/ui/safe-session-storage';

  type Value = string | number | boolean | null | undefined;
  type Report = Record<string, Value>;
  type HistoryRow = Record<string, Value>;
  type Attachment = Record<string, Value>;

  let { data, form } = $props();
  const reportForm = $derived(
    form as
      | (Partial<ProblemData> & {
          actionName?: string;
          values?: Record<string, string>;
          success?: boolean;
        })
      | null
      | undefined,
  );
  const problem = $derived(
    reportForm?.code && reportForm.messageKey && reportForm.correlationId
      ? (reportForm as ProblemData)
      : null,
  );
  let localeOverride = $state<PortalLocale | null>(null);
  const locale = $derived(
    localeOverride ?? data.locale ?? resolveStandaloneLocale($page.url.searchParams.get('lang')),
  );
  const t = (key: string): string => standaloneText(locale, key);
  const reportHref = $derived(
    `${base}/app/reports/${encodeURIComponent(String(data.detail.report.id))}`,
  );
  const submissionBlocked = $derived(
    ['REPORT_SUBMISSION_CHANGED', 'REPORT_SUBMISSION_STATE_BLOCKED'].includes(problem?.code ?? ''),
  );
  const statusForDisplay = $derived(
    problem?.code === 'REPORT_SUBMISSION_STATE_BLOCKED' && typeof problem.params.status === 'string'
      ? problem.params.status
      : data.detail.report.approval_state,
  );
  const remedyLinks = $derived({
    review_report: { label: t('problem.remedy.reviewReport'), href: reportHref, reload: true },
    review_reports: { label: t('problem.remedy.reviewReports'), href: `${base}/app/reports` },
    review_report_fields: data.detail.canEdit
      ? { label: t('problem.remedy.reviewReportFields'), href: '#modify-report-form' }
      : { label: t('problem.remedy.reviewReport'), href: reportHref, reload: true },
    request_report_correction: data.detail.canCreateCorrection
      ? {
          label: t('problem.remedy.requestReportCorrection'),
          href: '#report-correction-title',
        }
      : { label: t('problem.remedy.contactProjectOwner') },
    review_report_history: {
      label: t('problem.remedy.reviewReportHistory'),
      href: '#change-history-title',
    },
    contact_project_owner: { label: t('problem.remedy.contactProjectOwner') },
    sign_in_again: { label: t('problem.remedy.signInAgain'), href: `${base}/app/login` },
  });
  const scrollKey = $derived(
    `report-form-scroll:${String(data.user.id)}:${String(data.detail.report.id)}`,
  );
  let submittingScroll: { top: number; at: number } | null = null;
  function captureSubmittingScroll(): void {
    submittingScroll = { top: window.scrollY, at: Date.now() };
    rememberScroll();
  }
  function rememberScroll(): void {
    const recent = submittingScroll && Date.now() - submittingScroll.at < 10_000;
    saveSessionItem(
      scrollKey,
      JSON.stringify(recent ? submittingScroll : { top: window.scrollY, at: Date.now() }),
    );
  }
  const controlled = (domain: ControlledValueDomain, value: unknown): string =>
    translateControlledValue(
      locale,
      domain,
      value === null || value === undefined ? null : String(value),
    );
  const report = $derived(data.detail.report as Report);
  const history = $derived((data.detail.history ?? []) as HistoryRow[]);
  const attachments = $derived((data.detail.attachments ?? []) as Attachment[]);
  const isDaily = $derived(data.detail.type === 'daily');
  const retainedReportValues = $derived(
    reportForm?.actionName === 'updateReport' && !data.detail.canEdit && reportForm.values
      ? (isDaily ? dailyCorrectionFields : technicalCorrectionFields).flatMap((field) => {
          const value = reportForm.values?.[field.name];
          return value === undefined
            ? []
            : [
                {
                  label: t(field.label),
                  value:
                    field.kind === 'checkbox'
                      ? t(value === 'on' ? 'problem.report.checked' : 'problem.report.notChecked')
                      : value || '—',
                },
              ];
        })
      : [],
  );
  const canAutosave = $derived(
    Boolean(
      data.detail.canEdit &&
      ['draft', 'needs_changes'].includes(String(report.approval_state ?? '')),
    ),
  );
  const autosaveKey = $derived(
    reportAutosaveStorageKey(String(data.user.id), data.detail.type, String(report.id)),
  );
  const autosaveAction = '/j-aautomation/app/reports?/autosaveReport';
  const attachmentAction = $derived(
    `${base}/app/api/reports/${encodeURIComponent(String(report.id))}/attachments`,
  );
  const attachmentCanEdit = $derived(
    Boolean(
      (data.detail.canEdit || data.detail.canWithdrawCorrection) &&
      ['draft', 'needs_changes'].includes(String(report.approval_state ?? '')) &&
      (data.user.role === 'owner_admin' ||
        data.user.role === 'project_manager' ||
        (data.user.role === 'worker' &&
          String(data.user.id) === String(report.worker_id ?? report.author_id))),
    ),
  );
  const attachmentWarning = $derived.by((): ProblemData | null => {
    if (attachmentCanEdit) return null;
    if (
      !['approved', 'finalized'].includes(String(report.approval_state ?? '')) &&
      !data.detail.locked
    )
      return null;
    const correctionAvailable = Boolean(data.detail.canCreateCorrection);
    const reviewHistory = !correctionAvailable && data.user.role === 'owner_admin';
    return {
      code: correctionAvailable
        ? 'WARNING_REPORT_ATTACHMENT_CORRECTION_AVAILABLE'
        : reviewHistory
          ? 'WARNING_REPORT_ATTACHMENT_REVIEW_HISTORY'
          : 'WARNING_REPORT_ATTACHMENT_CONTACT_OWNER',
      messageKey: correctionAvailable
        ? 'problem.warning.reportAttachmentCorrectionAvailable'
        : reviewHistory
          ? 'problem.warning.reportAttachmentReviewHistory'
          : 'problem.warning.reportAttachmentContactOwner',
      params: {},
      fieldErrors: {},
      remedies: [
        {
          id: correctionAvailable
            ? 'request_report_correction'
            : reviewHistory
              ? 'review_report_history'
              : 'contact_project_owner',
        },
      ],
      correlationId: '',
    };
  });
  const deleteDraftWarning: ProblemData = {
    code: 'WARNING_REPORT_DELETE_DRAFT',
    messageKey: 'problem.warning.reportDeleteDraft',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'review_report_fields' }],
    correlationId: '',
  };
  const attachmentSupersedeCandidates = $derived(
    attachments.filter((item) => attachmentDownloadable(item) && !item.supersedes_id),
  );
  let attachmentMessage = $state('');
  let attachmentError = $state(false);
  let attachmentNeedsReview = $state(false);
  let attachmentBusy = $state(false);
  let attachmentStatusElement = $state<HTMLElement | null>(null);
  const attachmentReviewHref = $derived(
    `${base}/app/reports/${encodeURIComponent(String(report.id))}#report-attachments-title`,
  );
  const attachmentDownloadKeys = {
    REPORT_ATTACHMENT_SIGN_IN_REQUIRED: 'problem.reportAttachment.signInRequired',
    REPORT_ATTACHMENT_DOWNLOAD_NOT_FOUND: 'problem.reportAttachment.downloadNotFound',
    REPORT_ATTACHMENT_DOWNLOAD_NOT_READY: 'problem.reportAttachment.downloadNotReady',
    REPORT_ATTACHMENT_DOWNLOAD_UNAVAILABLE: 'problem.reportAttachment.downloadUnavailable',
    REPORT_ATTACHMENT_DOWNLOAD_UNEXPECTED: 'problem.reportAttachment.downloadUnexpected',
  } as const;
  const attachmentDownloadTypes = new Set([
    'application/pdf',
    'application/zip',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'text/plain',
  ]);
  let attachmentDownloadBusy = $state(false);
  let attachmentDownloadFailure = $state<{ id: string; problem: ProblemData } | null>(null);
  let attachmentDownloadController: AbortController | null = null;
  function cancelAttachmentDownload(): void {
    const controller = attachmentDownloadController;
    attachmentDownloadController = null;
    controller?.abort();
    attachmentDownloadBusy = false;
  }
  beforeNavigate(cancelAttachmentDownload);
  const attachmentDownloadRemedyLinks = $derived({
    sign_in_again: { label: t('problem.remedy.signInAgain'), href: `${base}/app/login` },
    review_report: {
      label: t('problem.remedy.reviewReport'),
      href: attachmentReviewHref,
      reload: true,
    },
    review_attachments: {
      label: t('problem.remedy.reviewReport'),
      href: attachmentReviewHref,
      reload: true,
    },
    contact_report_owner: { label: t('problem.remedy.contactProjectOwner') },
  });
  function attachmentDownloadFallback(
    kind: 'network' | 'invalid' | 'signIn',
    reference = '',
  ): ProblemData {
    const failures = {
      network: {
        code: 'REPORT_ATTACHMENT_DOWNLOAD_NETWORK_UNAVAILABLE',
        messageKey: 'problem.reportAttachment.downloadNetworkUnavailable',
        message:
          'The attachment could not be reached. The report was not changed. Check your connection and try downloading again.',
        remedies: [{ id: 'retry_download' }],
      },
      invalid: {
        code: 'REPORT_ATTACHMENT_DOWNLOAD_INVALID_RESPONSE',
        messageKey: 'problem.reportAttachment.downloadInvalidResponse',
        message:
          'The attachment response could not be verified. The report was not changed. Review the current attachments before trying again.',
        remedies: [{ id: 'review_attachments' }],
      },
      signIn: {
        code: 'REPORT_ATTACHMENT_SIGN_IN_REQUIRED',
        messageKey: 'problem.reportAttachment.signInRequired',
        message:
          'Your session ended. Sign in again and review the current attachments before continuing.',
        remedies: [{ id: 'sign_in_again' }],
      },
    } as const;
    return { ...failures[kind], params: {}, fieldErrors: {}, correlationId: reference };
  }
  async function showAttachmentDownloadFailure(
    id: string,
    problem: ProblemData,
    controller: AbortController,
  ): Promise<void> {
    if (attachmentDownloadController !== controller || controller.signal.aborted) return;
    attachmentDownloadFailure = { id, problem };
    await tick();
    if (attachmentDownloadController !== controller || controller.signal.aborted) return;
    const card = [...document.querySelectorAll<HTMLElement>('[data-attachment-document-id]')].find(
      (item) => item.dataset.attachmentDocumentId === id,
    );
    const notice = card?.querySelector<HTMLElement>(
      '[data-attachment-download-problem] [data-ui="problem-notice"]',
    );
    notice?.focus({ preventScroll: true });
    const bounds = notice?.getBoundingClientRect();
    if (bounds && (bounds.top < 8 || bounds.bottom > window.innerHeight - 8))
      notice?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  async function downloadAttachment(event: MouseEvent, attachment: Attachment): Promise<void> {
    event.preventDefault();
    if (attachmentDownloadBusy) return;
    const id = display(attachment.document_id);
    const href = `${attachmentAction}/${encodeURIComponent(id)}`;
    const controller = new AbortController();
    attachmentDownloadController = controller;
    attachmentDownloadBusy = true;
    attachmentDownloadFailure = null;
    try {
      const response = await fetch(href, {
        method: 'GET',
        signal: controller.signal,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          accept:
            'application/json, application/octet-stream, application/pdf, image/*, text/plain',
        },
      });
      if (attachmentDownloadController !== controller || controller.signal.aborted) return;
      const reference = response.headers.get('x-correlation-id') ?? '';
      if (response.redirected) {
        const destination = new URL(response.url);
        await showAttachmentDownloadFailure(
          id,
          attachmentDownloadFallback(
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
        if (attachmentDownloadController !== controller || controller.signal.aborted) return;
        const typed = typedPrivateDownloadProblem(
          payload,
          attachmentDownloadKeys,
          new Set(['sign_in_again', 'review_report', 'review_attachments', 'contact_report_owner']),
          reference,
        );
        await showAttachmentDownloadFailure(
          id,
          typed
            ? typed.code === 'REPORT_ATTACHMENT_DOWNLOAD_UNEXPECTED'
              ? { ...typed, params: { correlationId: typed.correlationId } }
              : typed
            : attachmentDownloadFallback(response.status === 401 ? 'signIn' : 'invalid', reference),
          controller,
        );
        return;
      }
      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      const disposition = response.headers.get('content-disposition');
      if (
        !contentType ||
        !attachmentDownloadTypes.has(contentType) ||
        !disposition?.toLowerCase().startsWith('attachment')
      ) {
        await showAttachmentDownloadFailure(
          id,
          attachmentDownloadFallback('invalid', reference),
          controller,
        );
        return;
      }
      const file = await response.blob();
      if (attachmentDownloadController !== controller || controller.signal.aborted) return;
      const declaredLength = response.headers.get('content-length');
      if (!file.size || (declaredLength && Number(declaredLength) !== file.size)) {
        await showAttachmentDownloadFailure(
          id,
          attachmentDownloadFallback('invalid', reference),
          controller,
        );
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = privateDownloadFilename(
        disposition,
        attachment.safe_filename ?? attachment.original_filename,
      );
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
    } catch {
      if (attachmentDownloadController === controller && !controller.signal.aborted)
        await showAttachmentDownloadFailure(id, attachmentDownloadFallback('network'), controller);
    } finally {
      if (attachmentDownloadController === controller) {
        attachmentDownloadController = null;
        attachmentDownloadBusy = false;
      }
    }
  }
  type AutosaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'offline';
  let autosaveState = $state<AutosaveState>('idle');
  let autosaveMessage = $state(t('Autosave is ready'));
  let autosaveVersion = $state(1);
  let recoveryDraft = $state<StoredReportAutosave | null>(null);
  let recoveryOpen = $state(false);
  let recoveryStale = $state(false);
  let comparingDraft = $state(false);
  let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  let autosaveInFlight = false;
  $effect(() => {
    const version = Number(data.detail.report.version);
    if (Number.isInteger(version) && version > 0) autosaveVersion = version;
  });
  const display = (value: Value): string =>
    value === null || value === undefined ? '' : String(value);
  const submitted = (name: string, fallback: Value): string =>
    reportForm?.actionName === 'updateReport' && typeof reportForm.values?.[name] === 'string'
      ? reportForm.values[name]
      : display(fallback);
  const eventAction = (value: Value): string => {
    const action = display(value).trim();
    if (!action) return t('Change history');
    // Older report audit rows use a generic action. The report detail already
    // carries the authoritative source type, so contextualize those two legacy
    // values before the closed report-history mapper renders the label.
    const contextualAction =
      action === 'report.report_modified'
        ? isDaily
          ? 'daily_report.update'
          : 'technical_report.update'
        : action === 'report.report_deleted'
          ? isDaily
            ? 'daily_report.delete'
            : 'technical_report.delete'
          : action;
    const localizedAction = translateReportHistoryAction(locale, contextualAction);
    if (localizedAction) return localizedAction;
    const direct = controlled('recordType', action);
    if (direct && direct !== action) return direct;
    const normalized = action.toLowerCase().replace(/[.\s-]+/g, '_');
    const recordType = normalized.startsWith('time')
      ? 'time_entry'
      : normalized.startsWith('expense')
        ? 'expense'
        : normalized.startsWith('invoice')
          ? 'invoice'
          : normalized.startsWith('milestone')
            ? 'milestone'
            : normalized.startsWith('project')
              ? 'project'
              : normalized.startsWith('technical')
                ? 'technical_report'
                : normalized.startsWith('report')
                  ? 'daily_report'
                  : normalized.startsWith('period')
                    ? 'period_report'
                    : normalized.startsWith('settlement')
                      ? 'settlement'
                      : normalized.startsWith('reimbursement')
                        ? 'reimbursement'
                        : null;
    return recordType ? controlled('recordType', recordType) : t('Change history');
  };
  const checked = (value: Value): boolean => value === true || value === 1 || value === '1';
  const submittedChecked = (name: string, fallback: Value): boolean => {
    const value = reportForm?.actionName === 'updateReport' ? reportForm.values?.[name] : undefined;
    return value === undefined
      ? checked(fallback)
      : value === 'on' || value === 'true' || value === '1';
  };
  const changedFields = (value: Value): string[] => {
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value) as { changedFields?: unknown };
      return Array.isArray(parsed.changedFields)
        ? parsed.changedFields.filter((field): field is string => typeof field === 'string')
        : [];
    } catch {
      return [];
    }
  };
  function printReport(): void {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.print();
  }

  function attachmentState(value: Value): string {
    const state = display(value).trim();
    return state ? controlled('status', state) : t('Unknown');
  }

  function attachmentDownloadable(attachment: Attachment): boolean {
    return (
      display(attachment.state) === 'committed' &&
      ['clean', 'not_scanned'].includes(display(attachment.scan_status))
    );
  }

  function attachmentCanCancel(attachment: Attachment): boolean {
    return (
      attachmentCanEdit &&
      ['temporary', 'quarantined', 'rejected'].includes(display(attachment.state)) &&
      (display(attachment.owner_id) === display(data.user.id) || data.user.role === 'owner_admin')
    );
  }

  function filterAttachmentPredecessors(event: Event): void {
    const kindSelect = event.currentTarget;
    if (!(kindSelect instanceof HTMLSelectElement)) return;
    const form = kindSelect.form;
    const predecessorSelect = form?.elements.namedItem('supersedesDocumentId');
    if (!(predecessorSelect instanceof HTMLSelectElement)) return;
    for (const option of predecessorSelect.options) {
      if (!option.dataset.attachmentKind) continue;
      option.hidden = option.dataset.attachmentKind !== kindSelect.value;
    }
    const selected = predecessorSelect.selectedOptions[0];
    if (selected?.hidden) predecessorSelect.value = '';
  }

  function attachmentFilename(documentId: string): string {
    const predecessor = attachments.find((item) => display(item.document_id) === documentId);
    return display(predecessor?.safe_filename || predecessor?.original_filename) || documentId;
  }

  function focusAttachmentStatus(message: string, needsReview = false): void {
    attachmentMessage = message;
    attachmentError = true;
    attachmentNeedsReview = needsReview;
    queueMicrotask(() => attachmentStatusElement?.focus());
  }

  function attachmentFailureMessage(result: Record<string, unknown>, fallback: string): string {
    const translated =
      typeof result.messageKey === 'string' &&
      result.messageKey.startsWith('problem.reportAttachment.')
        ? t(result.messageKey)
        : fallback;
    return result.code === 'REPORT_ATTACHMENT_UNEXPECTED' &&
      typeof result.correlationId === 'string'
      ? `${translated} ${t('problem.reportAttachment.referenceLabel')} ${result.correlationId}`
      : translated;
  }

  function showAttachmentKindError(
    formElement: HTMLFormElement,
    result: Record<string, unknown>,
  ): void {
    const fieldErrors = result.fieldErrors;
    if (!fieldErrors || typeof fieldErrors !== 'object' || Array.isArray(fieldErrors)) return;
    const kindErrors = (fieldErrors as Record<string, unknown>).attachmentKind;
    const kindKey = Array.isArray(kindErrors) ? kindErrors[0] : kindErrors;
    if (typeof kindKey !== 'string' || !kindKey.startsWith('problem.reportAttachment.')) return;
    reportFormFieldErrors(formElement, { attachmentKind: [kindKey] });
  }

  async function uploadAttachment(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (attachmentBusy) return;
    const formElement = event.currentTarget;
    if (!(formElement instanceof HTMLFormElement)) return;
    reportFormFieldErrors(formElement, {});
    attachmentBusy = true;
    attachmentError = false;
    attachmentNeedsReview = false;
    attachmentMessage = t('Uploading attachment…');
    try {
      const response = await fetch(formElement.action, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
        body: new FormData(formElement),
      });
      const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok || result.success !== true) {
        showAttachmentKindError(formElement, result);
        focusAttachmentStatus(
          attachmentFailureMessage(result, t('Attachment upload failed')),
          result.code === 'REPORT_ATTACHMENT_STALE_VERSION' ||
            result.code === 'REPORT_ATTACHMENT_REPORT_LOCKED' ||
            result.code === 'REPORT_ATTACHMENT_PREDECESSOR_CHANGED' ||
            result.code === 'REPORT_ATTACHMENT_DUPLICATE_CONTENT' ||
            result.code === 'REPORT_ATTACHMENT_UNEXPECTED',
        );
        return;
      }
      window.location.reload();
    } catch {
      focusAttachmentStatus(t('problem.reportAttachment.uploadUncertain'), true);
    } finally {
      attachmentBusy = false;
    }
  }

  async function cancelAttachment(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (attachmentBusy) return;
    const formElement = event.currentTarget;
    if (!(formElement instanceof HTMLFormElement)) return;
    attachmentBusy = true;
    attachmentError = false;
    attachmentNeedsReview = false;
    attachmentMessage = t('Cancelling attachment…');
    try {
      const response = await fetch(formElement.action, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok || result.success !== true) {
        focusAttachmentStatus(
          attachmentFailureMessage(result, t('Attachment cancellation failed')),
          response.status === 409 || response.status === 404,
        );
        return;
      }
      window.location.reload();
    } catch {
      focusAttachmentStatus(t('problem.reportAttachment.cancelUncertain'), true);
    } finally {
      attachmentBusy = false;
    }
  }

  function reportStorage(): Storage | undefined {
    if (typeof window === 'undefined') return undefined;
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  }

  function editFormElement(): HTMLFormElement | null {
    if (typeof document === 'undefined') return null;
    return document.querySelector<HTMLFormElement>('[data-report-autosave-form]');
  }

  function setReportVersion(version: number): void {
    autosaveVersion = version;
    const versionControl = editFormElement()?.elements.namedItem('version');
    if (versionControl instanceof HTMLInputElement) versionControl.value = String(version);
  }

  function scheduleAutosave(event: Event): void {
    const editForm = event.currentTarget as HTMLFormElement;
    if (!data.detail.canEdit) return;
    autosaveState = 'dirty';
    if (canAutosave) {
      const snapshot = snapshotReportForm(editForm, autosaveVersion);
      writeStoredReportAutosave(reportStorage(), autosaveKey, {
        version: autosaveVersion,
        savedAt: new Date().toISOString(),
        payload: snapshot,
      });
      autosaveMessage = t('Unsaved changes are protected on this device');
    } else {
      autosaveMessage = t('Autosave is available for draft reports and reports needing changes');
    }
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => void saveReportDraft(editForm), 850);
  }

  async function actionData(response: Response): Promise<Record<string, unknown>> {
    const body = (await response.json().catch(() => null)) as unknown;
    if (!body || typeof body !== 'object') return {};
    const envelope = body as Record<string, unknown>;
    return envelope.data && typeof envelope.data === 'object'
      ? (envelope.data as Record<string, unknown>)
      : envelope;
  }

  async function saveReportDraft(editForm: HTMLFormElement): Promise<void> {
    autosaveTimer = undefined;
    if (!data.detail.canEdit || autosaveInFlight) return;
    if (!canAutosave) {
      autosaveState = 'conflict';
      autosaveMessage = t('This report must be a draft or need changes before it can autosave');
      return;
    }
    const snapshot = snapshotReportForm(editForm, autosaveVersion);
    writeStoredReportAutosave(reportStorage(), autosaveKey, {
      version: autosaveVersion,
      savedAt: new Date().toISOString(),
      payload: snapshot,
    });
    autosaveInFlight = true;
    autosaveState = 'saving';
    autosaveMessage = t('Saving draft…');
    try {
      const response = await fetch(autosaveAction, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
        body: snapshotToFormData(snapshot),
      });
      const result = await actionData(response);
      if (!response.ok || result.success !== true) {
        const message =
          standaloneActionMessage(locale, result) || t('Draft could not be autosaved');
        if (response.status === 409 || result.code === 'report_not_editable') {
          recoveryDraft = readStoredReportAutosave(reportStorage(), autosaveKey);
          recoveryOpen = Boolean(recoveryDraft);
          autosaveState = 'conflict';
          autosaveMessage = `${message}. ${t('Review the local draft before continuing.')}`;
        } else if (!response.status || response.status >= 500) {
          autosaveState = 'offline';
          autosaveMessage = `${message}. ${t('Your local recovery draft is preserved.')}`;
        } else {
          autosaveState = 'conflict';
          autosaveMessage = message;
        }
        return;
      }
      const nextVersion = Number(result.version);
      if (Number.isInteger(nextVersion) && nextVersion > 0) setReportVersion(nextVersion);
      clearStoredReportAutosave(reportStorage(), autosaveKey);
      recoveryDraft = null;
      recoveryOpen = false;
      recoveryStale = false;
      comparingDraft = false;
      autosaveState = 'saved';
      autosaveMessage = `${t('Draft saved at')} ${new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    } catch {
      autosaveState = 'offline';
      autosaveMessage = t('Offline. Your local recovery draft is preserved.');
    } finally {
      autosaveInFlight = false;
    }
  }

  function recoverDraft(): void {
    const editForm = editFormElement();
    if (!editForm || !recoveryDraft) return;
    if (recoveryStale) {
      autosaveState = 'conflict';
      autosaveMessage = t(
        'This local draft belongs to an older report version. Compare it and copy only needed text; it cannot replace the newer record.',
      );
      return;
    }
    applyReportSnapshot(editForm, recoveryDraft.payload);
    const draftVersion = Number(recoveryDraft.payload.version ?? recoveryDraft.version);
    if (Number.isInteger(draftVersion) && draftVersion > 0) setReportVersion(draftVersion);
    recoveryOpen = false;
    comparingDraft = false;
    autosaveState = 'dirty';
    autosaveMessage = t('Local draft recovered. Review the fields before saving or submitting.');
  }

  function compareDraft(): void {
    comparingDraft = !comparingDraft;
    recoveryOpen = true;
  }

  function discardDraft(): void {
    clearStoredReportAutosave(reportStorage(), autosaveKey);
    recoveryDraft = null;
    recoveryOpen = false;
    recoveryStale = false;
    comparingDraft = false;
    autosaveState = 'idle';
    autosaveMessage = t('Local recovery draft discarded');
  }

  onMount(() => {
    window.addEventListener('pagehide', cancelAttachmentDownload);
    const savedScroll = readSessionItem(scrollKey);
    // Browser scroll anchoring can shift the restored position when the failed
    // form's validation summary is inserted after hydration.
    const previousOverflowAnchor = document.documentElement.style.overflowAnchor;
    if (problem) document.documentElement.style.overflowAnchor = 'none';
    // `formdata` also fires for a direct form.submit() call, before the browser
    // adjusts scroll while unloading the old page.
    const editFormForScroll = editFormElement();
    editFormForScroll?.addEventListener('formdata', captureSubmittingScroll);
    window.addEventListener('pagehide', rememberScroll);
    localeOverride = resolveStandaloneLocale($page.url.searchParams.get('lang'), data.locale);
    persistStandaloneLocale(locale);
    applyStandaloneDocumentLocale(locale);
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'ja.portal.locale' || event.key === 'ja-portal-locale')
        localeOverride = resolveStandaloneLocale(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    if (problem)
      void tick().then(() => {
        const editForm = reportForm?.actionName === 'updateReport' ? editFormElement() : null;
        if (editForm && reportForm?.values) applyReportSnapshot(editForm, reportForm.values);
        if (editForm && problem.fieldErrors) reportFormFieldErrors(editForm, problem.fieldErrors);
        const target =
          editForm?.querySelector<HTMLElement>('[data-validation-summary]') ??
          document.querySelector<HTMLElement>('[data-report-problem] [data-ui="problem-notice"]');
        target?.focus({ preventScroll: true });
        if (savedScroll) {
          removeSessionItem(scrollKey);
          try {
            const value = JSON.parse(savedScroll) as { top?: unknown; at?: unknown };
            if (
              typeof value.top === 'number' &&
              Number.isFinite(value.top) &&
              typeof value.at === 'number' &&
              Date.now() - value.at < 300_000
            )
              window.scrollTo({ top: value.top, behavior: 'instant' });
          } catch {
            // A malformed saved position should not hide the report problem.
          }
        }
        if (target)
          requestAnimationFrame(() => {
            const bounds = target.getBoundingClientRect();
            const headerBottom =
              document.querySelector('.portal-layout > header')?.getBoundingClientRect().bottom ??
              0;
            if (bounds.top < headerBottom + 8 || bounds.bottom > innerHeight)
              target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
          });
      });
    if (
      form?.success &&
      [
        'action.reports.changesSaved',
        'action.reports.dailyDraftSaved',
        'action.reports.technicalDraftSaved',
      ].includes(String(form.messageKey ?? ''))
    ) {
      clearStoredReportAutosave(reportStorage(), autosaveKey);
    }
    const saved = readStoredReportAutosave(reportStorage(), autosaveKey);
    if (saved) {
      recoveryDraft = saved;
      recoveryOpen = true;
      recoveryStale = saved.version < Number(report.version);
      autosaveMessage = recoveryStale
        ? t(
            'This local draft belongs to an older report version. Compare it and copy only needed text; it cannot replace the newer record.',
          )
        : t('A local recovery draft is available for review');
    } else if (!canAutosave && data.detail.canEdit) {
      autosaveMessage = t('Autosave is available for draft reports and reports needing changes');
    }
    return () => {
      cancelAttachmentDownload();
      window.removeEventListener('pagehide', cancelAttachmentDownload);
      if (autosaveTimer) clearTimeout(autosaveTimer);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', rememberScroll);
      editFormForScroll?.removeEventListener('formdata', captureSubmittingScroll);
      document.documentElement.style.overflowAnchor = previousOverflowAnchor;
    };
  });
  $effect(() => applyStandaloneDocumentLocale(locale));
</script>

<svelte:head
  ><title>{isDaily ? t('Daily report') : t('PLC report')} | J&A Automation</title></svelte:head
>

<main class="record-detail-page report-detail-page">
  <nav class="detail-nav" aria-label={t('Report navigation')}>
    <a href={base + '/app/reports'} data-origin-back
      ><DirectionIcon direction="left" /> {t('Reports')}</a
    >
    <a href={base + '/app/projects/' + display(report.project_id)}>{t('Open project')}</a>
    <button type="button" class="no-print print-trigger" onclick={printReport}>
      <PrintIcon />
      {t('Print Report')}
    </button>
  </nav>

  <div class="no-print report-localized-pdf-slot">
    <LocalizedPdfPanel
      ownerType={isDaily ? 'daily_report' : 'technical_report'}
      ownerId={String(report.id)}
      {locale}
      title={t('PDF')}
    />
  </div>

  <header class="record-detail-header">
    <div>
      <span class="portal-kicker"
        >{isDaily ? t('DAILY FIELD REPORT') : t('PLC / TECHNICAL REPORT')} · {t(
          'SOURCE RECORD',
        )}</span
      >
      <h1>
        {isDaily ? display(report.summary) : display(report.system_name) || t('System / machine')}
      </h1>
      <p>
        {display(report.project_number)} · {display(report.project_name)} ·
        {isDaily ? display(report.work_date) : display(report.created_at).slice(0, 10)} ·
        {display(report.author_name)}
      </p>
    </div>
    <div class="detail-status-stack">
      <span class="state-tag">{controlled('status', statusForDisplay)}</span>
      {#if data.detail.locked}<small class="locked-note">{t('Finalized source · read-only')}</small
        >{/if}
    </div>
  </header>

  {#if problem}
    <div data-report-problem>
      <ProblemNotice
        {problem}
        {locale}
        {remedyLinks}
        kind={problem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
        status={`${t('Status')}: ${controlled('status', statusForDisplay)}`}
      />
    </div>
  {:else if standaloneActionMessage(locale, form)}
    <p class:success={form?.success} class="action-message" role="status" aria-live="polite">
      {standaloneActionMessage(locale, form)}
    </p>
  {/if}

  {#if retainedReportValues.length}
    <SectionCard title={t('problem.report.retainedValuesTitle')} data-report-retained-values>
      <p>{t('problem.report.retainedValuesHelp')}</p>
      <dl class="retained-report-values">
        {#each retainedReportValues as item}
          <div>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        {/each}
      </dl>
    </SectionCard>
  {/if}

  {#if data.detail.canSubmitDraft && !submissionBlocked}
    <section class="detail-panel record-detail-copy" aria-label={t('Report actions')}>
      <p>{t('Changes saved in this report still need an explicit submission for review.')}</p>
      <form method="POST" action="?/submitReport">
        <input type="hidden" name="type" value={data.detail.type} />
        <input type="hidden" name="id" value={String(report.id)} />
        <input type="hidden" name="version" value={Number(report.version)} />
        <button type="submit">{t('Submit for review')}</button>
      </form>
    </section>
  {/if}
  {#if data.detail.canWithdrawCorrection}
    <section class="detail-panel record-detail-copy" aria-label={t('Withdraw correction draft')}>
      <form method="POST" action="?/withdrawCorrectionDraft" class="record-correction-withdraw">
        <input
          type="hidden"
          name="recordType"
          value={isDaily ? 'daily_report' : 'technical_report'}
        />
        <input type="hidden" name="correctionId" value={String(report.id)} />
        <input type="hidden" name="version" value={Number(report.version)} />
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

  {#if data.detail.canCreateCorrection}
    <section class="detail-panel record-detail-copy" aria-labelledby="report-correction-title">
      <h2 id="report-correction-title">{t('Create corrected draft')}</h2>
      <CorrectionDraftForm
        recordType={isDaily ? 'daily_report' : 'technical_report'}
        record={report}
        translate={t}
        ownerOverride={data.user.role === 'owner_admin'}
        values={form?.values ?? {}}
        requestId={data.correctionRequestId}
      />
    </section>
  {/if}

  {#if data.detail.canEdit && report.approval_state === 'needs_changes'}
    <section class="change-alert" aria-labelledby="report-change-alert-title">
      <strong id="report-change-alert-title"
        >{t('This report needs changes before it can be approved.')}</strong
      >
      <span
        >{t(
          'Update the fields below and submit it again. The owner and admin team can see exactly what changed.',
        )}</span
      >
    </section>
  {/if}

  {#if data.detail.canEdit}
    <FormCard
      title={t('Modify report')}
      headingId="modify-report-title"
      class="report-edit-panel"
      data-report-edit
    >
      <div class="report-form-intro">
        <p class="form-help" id="modify-report-help">
          {t('Changes are versioned and notify the owner/admin review group.')}
        </p>
        <span class="state-tag" aria-label={`${t('VERSION')} ${display(report.version)}`}
          >v{display(report.version)}</span
        >
        <span
          class="form-help"
          data-autosave-status
          aria-live="polite"
          data-autosave-state={autosaveState}>{autosaveMessage}</span
        >
      </div>

      <form
        method="POST"
        action="?/updateReport"
        class="report-detail-form"
        id="modify-report-form"
        data-form="modify-report"
        data-report-autosave-form
        data-report-type={data.detail.type}
        data-report-id={report.id}
        aria-describedby="modify-report-help"
        oninput={scheduleAutosave}
        use:formValidation
      >
        <input id="report-id" type="hidden" name="id" value={report.id} />
        <input
          id="report-version"
          type="hidden"
          name="version"
          value={submitted('version', report.version)}
        />
        <input id="report-type" type="hidden" name="type" value={data.detail.type} />
        <input id="report-project-id" type="hidden" name="projectId" value={report.project_id} />
        {#if !isDaily}
          <input
            type="hidden"
            name="reportDate"
            value={display(report.report_date ?? report.created_at).slice(0, 10)}
          />
        {/if}

        {#if isDaily}
          <FormSection
            title={t('Shift')}
            description={t('Set the field date and the shift context for this source record.')}
          >
            <FieldGroup columns="2">
              <Field id="report-work-date" label={t('Work date')} required data-field="workDate">
                <input
                  id="report-work-date"
                  data-field="workDate"
                  name="workDate"
                  type="date"
                  value={submitted('workDate', report.work_date)}
                  required
                />
              </Field>
              <Field id="report-site-shift" label={t('Site / shift')} data-field="siteShift">
                <input
                  id="report-site-shift"
                  data-field="siteShift"
                  name="siteShift"
                  value={submitted('siteShift', report.site_shift)}
                />
              </Field>
            </FieldGroup>
          </FormSection>

          <FormSection
            title={t('Work performed')}
            description={t('Record the work completed during this shift.')}
          >
            <Field id="report-summary" label={t('Shift summary')} required data-field="summary">
              <textarea
                id="report-summary"
                data-field="summary"
                name="summary"
                required
                value={submitted('summary', report.summary)}
              ></textarea>
            </Field>
            <Field
              id="report-tasks-completed"
              label={t('Tasks completed')}
              required
              data-field="tasksCompleted"
            >
              <textarea
                id="report-tasks-completed"
                data-field="tasksCompleted"
                name="tasksCompleted"
                required
                value={submitted('tasksCompleted', report.tasks_completed)}
              ></textarea>
            </Field>
          </FormSection>

          <FormSection
            title={t('Issues / decisions')}
            description={t(
              'Capture problems, corrective action, customer decisions, and blockers.',
            )}
          >
            <FieldGroup columns="2">
              <Field
                id="report-problems-found"
                label={t('Problems found')}
                data-field="problemsFound"
              >
                <textarea
                  id="report-problems-found"
                  data-field="problemsFound"
                  name="problemsFound"
                  value={submitted('problemsFound', report.problems_found)}
                ></textarea>
              </Field>
              <Field
                id="report-corrective-actions"
                label={t('Corrective actions')}
                data-field="correctiveActions"
              >
                <textarea
                  id="report-corrective-actions"
                  data-field="correctiveActions"
                  name="correctiveActions"
                  value={submitted('correctiveActions', report.corrective_actions)}
                ></textarea>
              </Field>
              <Field
                id="report-client-decisions"
                label={t('Client decisions')}
                data-field="clientDecisions"
              >
                <textarea
                  id="report-client-decisions"
                  data-field="clientDecisions"
                  name="clientDecisions"
                  value={submitted('clientDecisions', report.client_decisions)}
                ></textarea>
              </Field>
              <Field id="report-open-items" label={t('Open items')} data-field="openItems">
                <textarea
                  id="report-open-items"
                  data-field="openItems"
                  name="openItems"
                  value={submitted('openItems', report.open_items)}
                ></textarea>
              </Field>
              <Field
                id="report-downtime-minutes"
                label={t('Downtime minutes')}
                data-field="downtimeMinutes"
              >
                <input
                  id="report-downtime-minutes"
                  data-field="downtimeMinutes"
                  name="downtimeMinutes"
                  type="number"
                  min="0"
                  max="1440"
                  value={submitted('downtimeMinutes', report.downtime_minutes ?? 0)}
                />
              </Field>
              <Field
                id="report-standby-reason"
                label={t('Standby reason')}
                data-field="standbyReason"
              >
                <input
                  id="report-standby-reason"
                  data-field="standbyReason"
                  name="standbyReason"
                  value={submitted('standbyReason', report.standby_reason)}
                />
              </Field>
              <Field id="report-blockers" label={t('Blockers')} data-field="blockers">
                <textarea
                  id="report-blockers"
                  data-field="blockers"
                  name="blockers"
                  value={submitted('blockers', report.blockers)}
                ></textarea>
              </Field>
            </FieldGroup>
          </FormSection>

          <FormSection
            title={t('Next steps')}
            description={t('Leave the handover context needed for the next shift and review.')}
          >
            <FieldGroup columns="2">
              <Field id="report-next-day-plan" label={t('Next-day plan')} data-field="nextDayPlan">
                <textarea
                  id="report-next-day-plan"
                  data-field="nextDayPlan"
                  name="nextDayPlan"
                  value={submitted('nextDayPlan', report.next_day_plan)}
                ></textarea>
              </Field>
              <Field
                id="report-customer-contact"
                label={t('Customer contact')}
                data-field="customerContact"
              >
                <input
                  id="report-customer-contact"
                  data-field="customerContact"
                  name="customerContact"
                  value={submitted('customerContact', report.customer_contact)}
                />
              </Field>
            </FieldGroup>
            <Field
              id="report-safety-related"
              label={t('Safety-related')}
              data-field="safetyRelated"
            >
              <input
                id="report-safety-related"
                data-field="safetyRelated"
                name="safetyRelated"
                type="checkbox"
                checked={submittedChecked('safetyRelated', report.safety_related)}
              />
            </Field>
          </FormSection>
        {:else}
          <FormSection
            title={t('Equipment')}
            description={t('Identify the plant, line, station, and automation equipment involved.')}
          >
            <FieldGroup columns="2">
              <Field
                id="report-system-name"
                label={t('System name')}
                required
                data-field="systemName"
              >
                <input
                  id="report-system-name"
                  data-field="systemName"
                  name="systemName"
                  value={submitted('systemName', report.system_name)}
                  required
                />
              </Field>
              <Field id="report-plant-site" label={t('Plant / site')} data-field="plantSite">
                <input
                  id="report-plant-site"
                  data-field="plantSite"
                  name="plantSite"
                  value={submitted('plantSite', report.plant_site)}
                />
              </Field>
              <Field id="report-area-line" label={t('Area / line')} data-field="areaLine">
                <input
                  id="report-area-line"
                  data-field="areaLine"
                  name="areaLine"
                  value={submitted('areaLine', report.area_line)}
                />
              </Field>
              <Field
                id="report-station-machine"
                label={t('Station / machine')}
                data-field="stationMachine"
              >
                <input
                  id="report-station-machine"
                  data-field="stationMachine"
                  name="stationMachine"
                  value={submitted('stationMachine', report.station_machine)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup columns="3">
              <Field id="report-system-type" label={t('System type')} data-field="systemType">
                <input
                  id="report-system-type"
                  data-field="systemType"
                  name="systemType"
                  value={submitted('systemType', report.system_type)}
                />
              </Field>
              <Field id="report-plc-platform" label={t('PLC platform')} data-field="plcPlatform">
                <input
                  id="report-plc-platform"
                  data-field="plcPlatform"
                  name="plcPlatform"
                  value={submitted('plcPlatform', report.plc_platform)}
                />
              </Field>
              <Field id="report-controller" label={t('Controller')} data-field="controller">
                <input
                  id="report-controller"
                  data-field="controller"
                  name="controller"
                  value={submitted('controller', report.controller)}
                />
              </Field>
              <Field id="report-hmi-scada" label={t('HMI / SCADA')} data-field="hmiScada">
                <input
                  id="report-hmi-scada"
                  data-field="hmiScada"
                  name="hmiScada"
                  value={submitted('hmiScada', report.hmi_scada)}
                />
              </Field>
              <Field
                id="report-network-protocol"
                label={t('Network protocol')}
                data-field="networkProtocol"
              >
                <input
                  id="report-network-protocol"
                  data-field="networkProtocol"
                  name="networkProtocol"
                  value={submitted('networkProtocol', report.network_protocol)}
                />
              </Field>
              <Field
                id="report-software-version"
                label={t('Software version')}
                data-field="softwareVersion"
              >
                <input
                  id="report-software-version"
                  data-field="softwareVersion"
                  name="softwareVersion"
                  value={submitted('softwareVersion', report.software_version)}
                />
              </Field>
            </FieldGroup>
          </FormSection>

          <FormSection
            title={t('Change')}
            description={t('Describe the technical change and its production impact.')}
          >
            <Field
              id="report-program-reference"
              label={t('Program reference')}
              data-field="programReference"
            >
              <input
                id="report-program-reference"
                data-field="programReference"
                name="programReference"
                value={submitted('programReference', report.program_reference)}
              />
            </Field>
            <Field
              id="report-problem-symptom"
              label={t('Problem / symptom')}
              required
              data-field="problemSymptom"
            >
              <textarea
                id="report-problem-symptom"
                data-field="problemSymptom"
                name="problemSymptom"
                required
                value={submitted('problemSymptom', report.problem_symptom)}
              ></textarea>
            </Field>
            <Field
              id="report-diagnosis-root-cause"
              label={t('Diagnosis / root cause')}
              required
              data-field="diagnosisRootCause"
            >
              <textarea
                id="report-diagnosis-root-cause"
                data-field="diagnosisRootCause"
                name="diagnosisRootCause"
                required
                value={submitted('diagnosisRootCause', report.diagnosis_root_cause)}
              ></textarea>
            </Field>
            <Field
              id="report-change-performed"
              label={t('Change performed')}
              required
              data-field="changePerformed"
            >
              <textarea
                id="report-change-performed"
                data-field="changePerformed"
                name="changePerformed"
                required
                value={submitted(
                  'changePerformed',
                  report.change_performed ?? report.change_summary,
                )}
              ></textarea>
            </Field>
            <Field
              id="report-production-impact"
              label={t('Production impact')}
              data-field="productionImpact"
            >
              <textarea
                id="report-production-impact"
                data-field="productionImpact"
                name="productionImpact"
                value={submitted('productionImpact', report.production_impact)}
              ></textarea>
            </Field>
          </FormSection>

          <FormSection
            title={t('Validation / risk')}
            description={t(
              'Record validation performed, results, open risk, and rollback information.',
            )}
          >
            <FieldGroup columns="2">
              <Field id="report-validation" label={t('Validation')} data-field="validation">
                <textarea
                  id="report-validation"
                  data-field="validation"
                  name="validation"
                  value={submitted('validation', report.validation)}
                ></textarea>
              </Field>
              <Field
                id="report-validation-result"
                label={t('Validation result')}
                data-field="validationResult"
              >
                <textarea
                  id="report-validation-result"
                  data-field="validationResult"
                  name="validationResult"
                  value={submitted('validationResult', report.validation_result)}
                ></textarea>
              </Field>
              <Field id="report-open-risk" label={t('Open risk / issue')} data-field="openRisk">
                <textarea
                  id="report-open-risk"
                  data-field="openRisk"
                  name="openRisk"
                  value={submitted('openRisk', report.open_risk)}
                ></textarea>
              </Field>
              <Field id="report-rollback-plan" label={t('Rollback plan')} data-field="rollbackPlan">
                <textarea
                  id="report-rollback-plan"
                  data-field="rollbackPlan"
                  name="rollbackPlan"
                  value={submitted('rollbackPlan', report.rollback_plan)}
                ></textarea>
              </Field>
            </FieldGroup>
          </FormSection>

          <FormSection
            title={t('Safety')}
            description={t('Flag changes that require safety-impact review.')}
          >
            <Field
              id="report-technical-safety-related"
              label={t('Safety impact')}
              data-field="safetyRelated"
            >
              <input
                id="report-technical-safety-related"
                data-field="safetyRelated"
                name="safetyRelated"
                type="checkbox"
                checked={submittedChecked('safetyRelated', report.safety_related)}
              />
            </Field>
          </FormSection>
        {/if}

        <ActionBar class="report-form-actions">
          <a class="secondary-action" href={base + '/app/reports'} data-origin-back>{t('Cancel')}</a
          >
          <button type="submit">{t('Save changes')}</button>
        </ActionBar>
      </form>

      <section
        class="report-recovery-panel"
        data-recovery-dialog
        aria-labelledby="report-recovery-title"
        hidden={!recoveryOpen}
      >
        <div>
          <strong id="report-recovery-title">{t('Local recovery draft')}</strong>
          <p class="form-help">
            {t(
              'A draft from this authenticated account is stored on this device. Review it before it can replace the fields on screen.',
            )}
          </p>
          {#if recoveryDraft}
            <small
              >{t('Captured')}
              {recoveryDraft.savedAt} · {t('version')}
              {recoveryDraft.version}</small
            >
          {/if}
        </div>
        <div class="record-actions">
          <button type="button" data-recover-draft onclick={recoverDraft} disabled={recoveryStale}
            >{t('Recover draft')}</button
          >
          <button type="button" class="secondary-action" data-compare-draft onclick={compareDraft}>
            {comparingDraft ? t('Hide comparison') : t('Compare draft')}
          </button>
          <button type="button" class="text-button" data-discard-draft onclick={discardDraft}>
            {t('Discard draft')}
          </button>
        </div>
        {#if comparingDraft && recoveryDraft}
          <pre class="report-recovery-comparison">{JSON.stringify(
              recoveryDraft.payload,
              null,
              2,
            )}</pre>
        {/if}
      </section>
    </FormCard>
  {/if}

  <section
    class="report-attachments-panel"
    aria-labelledby="report-attachments-title"
    data-report-attachments
  >
    <div class="report-attachments-header">
      <div>
        <span class="portal-kicker">{t('PRIVATE REPORT EVIDENCE')}</span>
        <h2 id="report-attachments-title">{t('Report attachments')}</h2>
        <p class="form-help" id="report-attachments-help">
          {isDaily
            ? t('Keep the evidence that supports this daily field report in its private record.')
            : t(
                'Keep technical files and PLC backups tied to this exact system and report version.',
              )}
        </p>
      </div>
      <span class="state-tag">{attachments.length} {t('files')}</span>
    </div>

    {#if attachmentMessage}
      <p
        class="action-message"
        role={attachmentError ? 'alert' : 'status'}
        aria-live={attachmentError ? 'assertive' : 'polite'}
        tabindex="-1"
        bind:this={attachmentStatusElement}
      >
        {attachmentMessage}
        {#if attachmentNeedsReview}
          <a href={attachmentReviewHref} target="_blank" rel="noopener noreferrer">
            {t('problem.reportAttachment.reviewCurrent')}
          </a>
        {/if}
      </p>
    {/if}

    {#if attachments.length > 0}
      <div class="report-attachment-list" aria-label={t('Attachments')}>
        {#each attachments as attachment}
          <article
            class="report-attachment-card"
            data-attachment-document-id={display(attachment.document_id)}
            data-attachment-kind={display(attachment.attachment_kind)}
          >
            <div class="report-attachment-card-header">
              <div>
                <h3>
                  {display(attachment.safe_filename || attachment.original_filename) ||
                    t('Attachment')}
                </h3>
                <p>
                  <span class="state-tag"
                    >{controlled('recordType', attachment.attachment_kind)}</span
                  >
                  {#if !isDaily && attachment.system_reference_snapshot}
                    <span>{t('System')}: {display(attachment.system_reference_snapshot)}</span>
                  {/if}
                </p>
              </div>
              {#if attachmentDownloadable(attachment)}
                <a
                  class="secondary-action"
                  href={`${attachmentAction}/${encodeURIComponent(String(attachment.document_id))}`}
                  download
                  data-attachment-download
                  aria-disabled={attachmentDownloadBusy}
                  onclick={(event) => downloadAttachment(event, attachment)}
                  onauxclick={(event) => {
                    if (event.button === 1) void downloadAttachment(event, attachment);
                  }}>{t('Download')}</a
                >
              {:else}
                <span class="form-help" data-attachment-download-state
                  >{t('Download unavailable until this file is clean and ready.')}</span
                >
              {/if}
            </div>
            {#if attachmentDownloadFailure?.id === display(attachment.document_id)}
              <div data-attachment-download-problem>
                <ProblemNotice
                  problem={attachmentDownloadFailure.problem}
                  {locale}
                  remedyLinks={attachmentDownloadRemedyLinks}
                />
                {#if attachmentDownloadFailure.problem.remedies.some((remedy) => remedy.id === 'retry_download')}
                  <button
                    type="button"
                    class="secondary-action"
                    disabled={attachmentDownloadBusy}
                    onclick={(event) => downloadAttachment(event, attachment)}
                    >{t('problem.expenseExport.retryDownload')}</button
                  >
                {/if}
              </div>
            {/if}
            <dl class="report-attachment-meta">
              <div>
                <dt>{t('Uploader')}</dt>
                <dd>{display(attachment.uploader_name) || t('System / machine')}</dd>
              </div>
              <div>
                <dt>{t('Uploaded')}</dt>
                <dd>{display(attachment.created_at).replace('T', ' ').slice(0, 19)}</dd>
              </div>
              <div>
                <dt>{t('Version')}</dt>
                <dd>v{display(attachment.version) || '—'}</dd>
              </div>
              <div>
                <dt>{t('State')}</dt>
                <dd>
                  {attachmentState(attachment.state)} · {display(attachment.scan_status) ||
                    t('Unknown')}
                </dd>
              </div>
              <div class="report-attachment-hash">
                <dt>{t('SHA-256')}</dt>
                <dd><code>{display(attachment.sha256) || t('Pending')}</code></dd>
              </div>
              {#if attachment.notes}
                <div>
                  <dt>{t('Notes')}</dt>
                  <dd>{display(attachment.notes)}</dd>
                </div>
              {/if}
              {#if attachment.supersedes_id}
                <div>
                  <dt>{t('Predecessor')}</dt>
                  <dd>{attachmentFilename(display(attachment.supersedes_id))}</dd>
                </div>
              {/if}
            </dl>
            {#if attachmentCanCancel(attachment)}
              <form
                method="POST"
                action={`${attachmentAction}/${encodeURIComponent(String(attachment.document_id))}/cancel`}
                class="report-attachment-cancel"
                onsubmit={cancelAttachment}
              >
                <button type="submit" class="text-button" disabled={attachmentBusy}
                  >{t('Cancel upload')}</button
                >
              </form>
            {/if}
          </article>
        {/each}
      </div>
    {:else}
      <p class="empty">{t('No private attachments have been added yet.')}</p>
    {/if}

    {#if attachmentCanEdit}
      <form
        method="POST"
        action={attachmentAction}
        enctype="multipart/form-data"
        class="report-attachment-upload"
        aria-describedby="report-attachments-help report-attachment-upload-help"
        onsubmit={uploadAttachment}
        data-report-attachment-upload
      >
        <input type="hidden" name="version" value={report.version} />
        <div class="report-attachment-upload-fields">
          <Field
            id="report-attachment-kind"
            label={t('Evidence type')}
            required
            data-field="attachmentKind"
          >
            <select
              id="report-attachment-kind"
              name="attachmentKind"
              required
              onchange={filterAttachmentPredecessors}
            >
              {#if isDaily}
                <option value="daily_attachment">{t('Daily report attachment')}</option>
              {:else}
                <option value="technical_attachment">{t('Technical attachment')}</option>
                <option value="plc_backup_before">{t('PLC backup · before')}</option>
                <option value="plc_backup_after">{t('PLC backup · after')}</option>
              {/if}
            </select>
          </Field>
          <Field id="report-attachment-file" label={t('File')} required data-field="file">
            <input
              id="report-attachment-file"
              name="file"
              type="file"
              accept=".pdf,.zip,.jpg,.jpeg,.png,.webp,.heic,.heif,.txt"
              required
            />
          </Field>
          <Field id="report-attachment-notes" label={t('Notes')} data-field="notes">
            <textarea
              id="report-attachment-notes"
              name="notes"
              maxlength="5000"
              rows="3"
              placeholder={t('What does this file substantiate?')}
            ></textarea>
          </Field>
          {#if attachmentSupersedeCandidates.length > 0}
            <Field
              id="report-attachment-predecessor"
              label={t('Supersedes (optional)')}
              data-field="supersedesDocumentId"
            >
              <select id="report-attachment-predecessor" name="supersedesDocumentId">
                <option value="">{t('This is a new evidence version')}</option>
                {#each attachmentSupersedeCandidates as predecessor}
                  <option
                    value={display(predecessor.document_id)}
                    data-attachment-kind={display(predecessor.attachment_kind)}
                    hidden={display(predecessor.attachment_kind) !==
                      (isDaily ? 'daily_attachment' : 'technical_attachment')}
                  >
                    {display(predecessor.safe_filename || predecessor.original_filename)} · v{display(
                      predecessor.version,
                    )}
                  </option>
                {/each}
              </select>
            </Field>
          {/if}
        </div>
        <p class="form-help" id="report-attachment-upload-help">
          {t('Allowed: PDF, ZIP, JPEG, PNG, WebP, HEIC/HEIF, or UTF-8 text. Maximum 50 MB.')}
        </p>
        <button type="submit" disabled={attachmentBusy}>{t('Upload private evidence')}</button>
      </form>
    {:else if attachmentWarning}
      <ProblemNotice
        problem={attachmentWarning}
        {locale}
        kind="warning"
        status={controlled('status', report.approval_state)}
        {remedyLinks}
      />
    {:else}
      <p class="change-alert" role="note">
        {t(
          'You have read-only access to this report. Contact the project manager or owner for changes.',
        )}
      </p>
    {/if}
  </section>

  <SectionCard
    title={t('Report summary')}
    headingId="report-summary-title"
    class="report-summary-panel"
  >
    <div class="record-detail-grid report-summary-grid">
      <article>
        <span>{t('PROJECT')}</span><strong>{display(report.project_number)}</strong><small
          >{display(report.project_name)}</small
        >
      </article>
      <article>
        <span>{t('WORK PERFORMED BY')}</span><strong>{display(report.author_name)}</strong><small
          >{display(report.author_email)}</small
        >
      </article>
      <article>
        <span>{t('REPORT CREATED BY')}</span><strong
          >{display(report.created_by_name || report.author_name)}</strong
        ><small>{display(report.created_by_email || report.author_email)}</small>
      </article>
      {#if report.reviewed_by_name}
        <article>
          <span>{t('REVIEWED BY')}</span><strong>{display(report.reviewed_by_name)}</strong><small
            >{display(report.reviewed_by_email)}</small
          >
        </article>
      {/if}
      <article>
        <span>{t('SAFETY')}</span><strong
          >{checked(report.safety_related) ? t('Review required') : t('No safety flag')}</strong
        ><small>{t('Recorded with the source')}</small>
      </article>
      <article>
        <span>{t('VERSION')}</span><strong>{display(report.version)}</strong><small
          >{display(report.updated_at)}</small
        >
      </article>
    </div>
  </SectionCard>

  <SectionCard
    title={t('Change history')}
    headingId="change-history-title"
    class="report-history-panel"
    data-history-panel
  >
    <div class="report-history-intro">
      <p class="form-help">{t('Immutable audit trail for this source record.')}</p>
      <span class="history-count">{history.length} {t('events')}</span>
    </div>
    {#each history as event}
      <article class="history-event">
        <div>
          <strong>{eventAction(event.action)}</strong>
          <small
            >{display(event.actor_name) || t('System / machine')} · {display(event.occurred_at)
              .replace('T', ' ')
              .slice(0, 19)}</small
          >
        </div>
        {#if changedFields(event.details_json).length > 0}
          <span class="change-summary"
            >{t('Changed')}: {changedFields(event.details_json).join(', ')}</span
          >
        {:else}
          <code>{display(event.details_json)}</code>
        {/if}
      </article>
    {:else}<p class="empty">{t('No audit history recorded.')}</p>{/each}
  </SectionCard>

  {#if data.detail.canDelete}
    <section class="danger-zone" aria-labelledby="draft-controls-title">
      <div>
        <h2 id="draft-controls-title">{t('Draft actions')}</h2>
        <div id="delete-report-warning">
          <ProblemNotice problem={deleteDraftWarning} {locale} kind="warning" {remedyLinks} />
        </div>
      </div>
      <form
        method="POST"
        action={`${base}/app/reports?/deleteDraft`}
        data-action="deleteDraft"
        data-record-type={isDaily ? 'daily_report' : 'technical_report'}
        data-record-id={String(report.id)}
        onsubmit={(event) => {
          if (!confirm(t('Delete this report? This cannot be undone.'))) event.preventDefault();
        }}
      >
        <input
          type="hidden"
          name="recordType"
          value={isDaily ? 'daily_report' : 'technical_report'}
        />
        <input type="hidden" name="recordId" value={report.id} />
        <input type="hidden" name="version" value={report.version} />
        <button class="danger-button" type="submit" aria-describedby="delete-report-warning">
          {t('Delete report')}
        </button>
      </form>
    </section>
  {/if}
</main>

<style>
  .report-attachments-panel {
    display: grid;
    gap: 1.25rem;
    margin-top: 1.5rem;
    padding: clamp(1rem, 2vw, 1.5rem);
    border: 1px solid var(--portal-border, #dcdbd9);
    border-radius: 1rem;
    background: var(--portal-surface, #fff);
  }

  .report-attachments-header,
  .report-attachment-card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .report-attachments-header h2,
  .report-attachment-card h3 {
    margin: 0.25rem 0 0;
  }

  .report-attachment-list {
    display: grid;
    gap: 0.75rem;
  }

  .report-attachment-card {
    display: grid;
    gap: 0.8rem;
    padding: 1rem;
    border: 1px solid var(--portal-border, #dcdbd9);
    border-radius: 0.75rem;
    background: var(--portal-surface-muted, #fafaf9);
  }

  .report-attachment-card-header p {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.5rem 0 0;
  }

  .retained-report-values {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
    gap: 0.8rem 1rem;
    margin: 1rem 0 0;
  }

  .retained-report-values > div {
    min-width: 0;
  }

  .retained-report-values dt {
    color: var(--portal-muted, #63625b);
    font-weight: 700;
  }

  .retained-report-values dd {
    margin: 0.2rem 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .report-attachment-meta {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.7rem 1rem;
    margin: 0;
  }

  .report-attachment-meta > div {
    min-width: 0;
  }

  .report-attachment-meta dt {
    color: var(--portal-muted, #63625b);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .report-attachment-meta dd {
    margin: 0.2rem 0 0;
    overflow-wrap: anywhere;
  }

  .report-attachment-hash code {
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .report-attachment-upload {
    display: grid;
    gap: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--portal-border, #dcdbd9);
  }

  .report-attachment-upload-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .report-attachment-upload-fields :global(.field:last-child) {
    grid-column: 1 / -1;
  }

  .report-attachment-cancel {
    justify-self: start;
  }

  @media (max-width: 640px) {
    .report-attachments-header,
    .report-attachment-card-header {
      display: grid;
    }

    .report-attachment-meta,
    .report-attachment-upload-fields {
      grid-template-columns: 1fr;
    }

    .report-attachment-upload-fields :global(.field:last-child) {
      grid-column: auto;
    }

    .report-attachment-card-header :global(a),
    .report-attachment-upload > :global(button) {
      width: 100%;
      justify-content: center;
    }
  }

  @media print {
    .report-attachments-panel {
      display: none;
    }
  }
</style>
