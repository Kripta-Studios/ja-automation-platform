<script lang="ts">
  import { useAssistantPaneRequest } from '../assistant/surface-request.svelte';
  import { confirmDirtyForms, dirtyFormGuard } from '../dirty-form-guard';
  import { beforeNavigate, replaceState } from '$app/navigation';
  import { useViewPreferences } from '../ui/view-preferences.svelte';
  import { formatDecimalHours } from './time-entry-actions';
  import { disclosure } from '../ui/disclosure.js';
  import { enhance } from '$app/forms';
  import { base } from '$app/paths';
  import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
  import { page } from '$app/stores';
  import { tick, untrack } from 'svelte';
  import type { ProblemData } from '$lib/problem/contract';
  import { filterProjectTeamWorkers } from '../supplier-technician-filters';
  import { normalizePortalLocale, portalText } from '$lib/portal-i18n';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import {
    ProblemNotice,
    ResponsiveSheet,
    StatusBadge,
    formValidation,
    reportFormFieldErrors,
  } from '../ui';
  import type { PortalActionResult, PortalRow } from '../portal-data';
  import { generateAccessPassword, isCompanyEmail, normalizeAccessEmail } from '../access-email';
  import { personDisplayName, personInitials, proposedPersonName } from '../person-name';
  import { teamCopy, type TeamCopyKey } from '../team-ux-copy';
  import PersonProjectsPanel from './PersonProjectsPanel.svelte';
  import PersonPayPanel from './PersonPayPanel.svelte';
  import FixNamesPanel from './FixNamesPanel.svelte';
  import { normalizeSelectSearch } from '../searchable-selects';
  import {
    mailboxCopy,
    mailboxOutcomeNeedsRetry,
    mailboxOutcomeText,
    type MailboxCopyKey,
  } from '../mailbox-ux-copy';

  const CORPORATE_DOMAIN = '@j-aautomation.com';
  const OWNER_EMAIL = 'antonny.luty@j-aautomation.com';

  export type MailboxDirectoryStatus = 'loading' | 'ready' | 'unavailable' | 'error';

  /** Safe Stalwart projection. Credentials and password hashes are never sent to the browser. */
  export type MailboxRow = {
    id?: string;
    accountId?: string;
    stalwartAccountId?: string;
    username: string;
    email: string;
    name: string;
    description?: string | null;
    isProvisioned: boolean;
    portalRole?: string | null;
    portalUserId?: string | null;
    portalStatus?: string | null;
    status?: string | null;
    provisioningEligible?: boolean;
    isOwner?: boolean;
    portalOffboardedAt?: string | null;
    /** Stalwart Webmail sign-in state; null/undefined = mail server not asked. */
    signInBlocked?: boolean | null;
  };

  export type MailboxStatusFilter = 'all' | 'active' | 'offboarded' | 'unlinked' | 'blocked';
  /** Server-side scope of the Mailboxes tab (search, status filter, page). */
  export type MailboxDirectoryMeta = {
    source: 'live' | 'portal';
    q: string;
    status: MailboxStatusFilter;
    page: number;
    pageSize: number;
    pageCount: number;
    total: number;
    filtered: number;
    counts: Record<MailboxStatusFilter, number>;
    stillSigningIn: number;
  };
  /** Server-side scope of the People directory (see team-directory-page.ts). */
  export type PeopleDirectoryMeta = {
    q: string;
    role: string;
    status: 'active' | 'inactive' | 'all';
    project: string;
    page: number;
    pageSize: number;
    pageCount: number;
    total: number;
    activeTotal: number;
    filtered: number;
    roleOptions: string[];
    projectOptions: Array<{ id: string; name: string }>;
    nameFixCount: number;
  };

  export type TeamDirectoryProps = {
    workers: PortalRow[];
    suppliers?: PortalRow[];
    assignments?: PortalRow[];
    mailboxes?: MailboxRow[] | null;
    mailboxDirectoryStatus?: MailboxDirectoryStatus;
    mailboxDirectoryError?: string | null;
    mailboxDirectory?: MailboxDirectoryMeta | null;
    peopleDirectory?: PeopleDirectoryMeta | null;
    /** Owner: people whose stored name looks like a login (Fix names). */
    nameFixWorkers?: PortalRow[] | null;
    /** Owner: active people without a login (Add person → existing person). */
    existingPeople?: PortalRow[] | null;
    canManageTeam?: boolean;
    canManageMail?: boolean;
    canonicalOwner?: boolean;
    currentUserId?: string;
    invitationPath?: string | null;
    /** Owner only: unused invitation links (pending or recently expired). */
    invitations?: ReadonlyArray<{
      id: string;
      email: string;
      role: string;
      expiresAt: string;
      createdAt: string;
      expired: boolean;
    }>;
    translate: (value: string) => string;
    controlledValue?: (domain: 'status' | 'availability' | 'role', value: unknown) => string;
    form?: ActionResult | PortalActionResult;
    /** People directory projections (server-scoped, see team-directory-load.ts). */
    projects?: PortalRow[];
    teamStats?: PortalRow[];
    teamWeekStart?: string;
    mailboxLinkedIds?: string[];
    personPayRules?: PortalRow[];
    personAssignModes?: Record<string, 'defaults' | 'existing' | 'rates'>;
    skills?: PortalRow[];
    workerSkills?: PortalRow[];
    viewerRole?: string;
    locale?: string;
  };

  let {
    suppliers = [],
    workers,
    assignments = [],
    mailboxes,
    mailboxDirectoryStatus,
    mailboxDirectoryError = null,
    mailboxDirectory = null,
    peopleDirectory = null,
    nameFixWorkers = null,
    existingPeople = null,
    canManageTeam = false,
    canManageMail = false,
    canonicalOwner = false,
    currentUserId = '',
    invitationPath = null,
    invitations = [],
    translate,
    controlledValue,
    form,
    projects = [],
    teamStats = [],
    mailboxLinkedIds = [],
    personPayRules = [],
    personAssignModes = {},
    skills = [],
    workerSkills = [],
    viewerRole = '',
    locale = 'en',
  }: TeamDirectoryProps = $props();

  const problemPayload = $derived.by(() => {
    const candidate = form as unknown as Record<string, unknown> | null | undefined;
    if (!candidate) return null;
    const payload =
      candidate.data && typeof candidate.data === 'object'
        ? (candidate.data as Record<string, unknown>)
        : candidate;
    return typeof payload.code === 'string' &&
      payload.code.startsWith('ACCESS_') &&
      typeof payload.messageKey === 'string'
      ? (payload as unknown as ProblemData & {
          actionName?: string;
          values?: Readonly<Record<string, unknown>>;
        })
      : null;
  });
  const problemLocale = $derived(
    normalizePortalLocale($page.url.searchParams.get('lang') ?? $page.data.locale),
  );
  const supplierStatusHref = $derived(
    `${base}/app/supplier?workspaceAction=directory&directoryStatus=inactive&lang=${encodeURIComponent(problemLocale)}#supplier-directory`,
  );
  const problemRecordId = $derived(
    problemPayload?.remedies.find((remedy) => remedy.recordId)?.recordId,
  );
  const personReviewHref = $derived(
    problemRecordId
      ? `${base}/app/projects?view=team&worker=${encodeURIComponent(problemRecordId)}`
      : `${base}/app/projects?view=team`,
  );
  function teamActionHref(actionName: string, workerId?: string): string {
    const params = new URLSearchParams({ view: 'team' });
    const lang = $page.url.searchParams.get('lang');
    if (lang) params.set('lang', lang);
    if (workerId) {
      params.set('worker', workerId);
      params.set('tab', 'access');
    }
    return `?${params.toString()}&/${actionName}`;
  }
  let activeTab = $derived<'specialists' | 'mailboxes'>(
    $page.url.searchParams.get('directory') === 'mailboxes' ? 'mailboxes' : 'specialists',
  );
  let hasFocusedSpecialistsAnchor = false;
  $effect(() => {
    if ($page.url.hash !== '#team-panel-specialists' || activeTab !== 'specialists') {
      hasFocusedSpecialistsAnchor = false;
      return;
    }
    if (hasFocusedSpecialistsAnchor) return;
    hasFocusedSpecialistsAnchor = true;
    void tick().then(() => {
      const target = document.getElementById('team-panel-specialists');
      if (!(target instanceof HTMLElement)) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start' });
    });
  });
  let search = $state('');
  let directoryProjectId = $state(untrack(() => $page.url.searchParams.get('project') ?? ''));
  let directorySupplierId = $state('');
  let directoryTechnicianId = $state('');
  let lastDirectoryProjectQuery = untrack(() => $page.url.searchParams.get('project') ?? '');
  $effect(() => {
    const requested = $page.url.searchParams.get('project') ?? '';
    if (requested !== lastDirectoryProjectQuery) {
      lastDirectoryProjectQuery = requested;
      directoryProjectId = requested;
    }
  });
  let createLocal = $state(true);
  let localRole = $state('worker');
  let existingUserId = $state('');
  let localName = $state('');
  let localEmail = $state('');
  let localCreateMailbox = $state(true);
  let localPhone = $state('');
  let localCompany = $state('');
  let localContactName = $state('');
  let localNotes = $state('');
  let localSupplierId = $state('');
  let revealPassword = $state(false);
  let localPassword = $state('');
  let inviteEmail = $state('');
  const normalizedLocalEmail = $derived(normalizeAccessEmail(localEmail));
  const normalizedInviteEmail = $derived(normalizeAccessEmail(inviteEmail));
  const localEmailIsCompany = $derived(
    Boolean(normalizedLocalEmail) && isCompanyEmail(normalizedLocalEmail),
  );
  const localCreatesMailbox = $derived(localEmailIsCompany && localCreateMailbox);
  const accessRoleChoices = [
    {
      value: 'worker',
      label: 'Worker',
      help: 'Records time, expenses and reports on assigned projects.',
    },
    {
      value: 'project_manager',
      label: 'Project Manager',
      help: 'Plans projects and reviews the team’s work.',
    },
    {
      value: 'finance_admin',
      label: 'Finance Admin',
      help: 'Invoices, payments and accounting.',
    },
    {
      value: 'auditor_read_only',
      label: 'Auditor (Read Only)',
      help: 'Can see records but cannot change anything.',
    },
    {
      value: 'external_technician',
      label: 'External technician',
      help: 'Supplier staff who record time on assigned projects.',
    },
    {
      value: 'supplier_coordinator',
      label: 'Supplier coordinator',
      help: 'Manages a supplier’s people and their work.',
    },
  ] as const;
  function generateLocalPassword(): void {
    localPassword = generateAccessPassword();
    passwordCopied = false;
    revealPassword = true;
  }
  // Owner password reset inside "Edit team member".
  let resetPasswordValue = $state<Record<string, string>>({});
  let resetPasswordReveal = $state<Record<string, boolean>>({});
  const resetPasswordSuccess = $derived.by(() => {
    const candidate = form as unknown as Record<string, unknown> | null | undefined;
    const payload = (
      candidate?.data && typeof candidate.data === 'object' ? candidate.data : candidate
    ) as Record<string, unknown> | null | undefined;
    const key = typeof payload?.messageKey === 'string' ? payload.messageKey : '';
    const params = payload?.messageParams as Record<string, unknown> | undefined;
    return payload?.success === true && key.startsWith('action.access.password.reset')
      ? { key, userId: typeof params?.userId === 'string' ? params.userId : '' }
      : null;
  });
  const resetPasswordDoneFor = $derived(resetPasswordSuccess?.userId ?? '');
  // T32/owner-5: after Add person, say which address signs in and open the person.
  const createdAccount = $derived.by(() => {
    const candidate = form as unknown as Record<string, unknown> | null | undefined;
    const payload = (
      candidate?.data && typeof candidate.data === 'object' ? candidate.data : candidate
    ) as Record<string, unknown> | null | undefined;
    const key = typeof payload?.messageKey === 'string' ? payload.messageKey : '';
    const params = payload?.messageParams as Record<string, unknown> | undefined;
    return payload?.success === true && key.startsWith('action.access.localAccount.')
      ? {
          userId: typeof params?.userId === 'string' ? params.userId : '',
          email: typeof params?.email === 'string' ? params.email : '',
        }
      : null;
  });
  let passwordCopied = $state(false);
  // T33: open work shown before suspend/offboard, loaded when the confirm opens.
  type Checklist = {
    draftTime: number;
    draftExpenses: number;
    pendingTime: number;
    pendingExpenses: number;
    activeAssignments: Array<{ projectName: string; endsOn: string | null }>;
    unsettledApprovedMinutes: number;
    unreimbursedExpenses: number;
  };
  let checklists = $state<Record<string, Checklist | 'error'>>({});
  async function loadChecklist(personId: string): Promise<void> {
    if (checklists[personId] && checklists[personId] !== 'error') return;
    try {
      const response = await fetch(
        `${base}/app/api/people/${encodeURIComponent(personId)}/offboarding`,
        { headers: { accept: 'application/json' } },
      );
      checklists[personId] = response.ok ? ((await response.json()) as Checklist) : 'error';
    } catch {
      checklists[personId] = 'error';
    }
  }
  async function copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  const resetPasswordDoneKey = $derived(resetPasswordSuccess?.key ?? '');
  $effect(() => {
    const done = resetPasswordSuccess?.userId;
    if (done) untrack(() => (resetPasswordValue[done] = ''));
  });
  let showAll = $state(false);
  let editingWorkerId = $derived<string | null>($page.url.searchParams.get('worker'));
  let selectedWorkforceProfiles = $state<Record<string, string>>({});
  let selectedWorkforceSuppliers = $state<Record<string, string>>({});
  const failedWorkerProfileId = $derived(
    problemPayload?.actionName === 'updateWorkerProfile' &&
      typeof problemPayload.values?.workerId === 'string'
      ? problemPayload.values.workerId
      : null,
  );
  const failedWorkforceProfileId = $derived(
    problemPayload?.actionName === 'setWorkforceProfile' &&
      typeof problemPayload.values?.workerId === 'string'
      ? problemPayload.values.workerId
      : null,
  );
  const workforceSupplierInactiveProblem = $derived(
    problemPayload?.code === 'ACCESS_WORKFORCE_SUPPLIER_INACTIVE' &&
      problemPayload.actionName === 'setWorkforceProfile' &&
      Boolean(failedWorkforceProfileId),
  );
  const failedStatusUserId = $derived(
    problemPayload?.actionName === 'updateUserStatus' &&
      typeof problemPayload.values?.userId === 'string'
      ? problemPayload.values.userId
      : null,
  );
  const problemPersonName = $derived.by(() => {
    const id =
      failedWorkerProfileId ?? failedWorkforceProfileId ?? failedStatusUserId ?? problemRecordId;
    const person = workers.find((candidate) => workerId(candidate) === id);
    return person ? workerName(person) : String(problemPayload?.values?.name ?? '').trim();
  });
  let creatingUser = $state(false);
  let invitationCopied = $state(false);
  let mailboxSearch = $state('');
  const selectedMailboxes = new SvelteSet<string>();
  let targetProvisionRole = $state<'worker' | 'project_manager' | 'finance_admin'>('worker');
  let creatingMailbox = $state(false);
  let filterProvisioned = $state<'all' | 'available' | 'provisioned'>('all');
  let mailboxStatus = $state<MailboxStatusFilter>('all');
  // These keys do not drive UI state. Keeping the cache non-reactive also avoids
  // mutating reactive state while mailbox forms are being rendered.
  const externalCommandKeys: Record<string, string> = {};

  $effect(() => {
    if (problemPayload?.actionName !== 'createLocalPortalUser') return;
    const values = problemPayload.values;
    if (values) {
      existingUserId = String(values.existingUserId ?? '');
      localName = String(values.name ?? '');
      localEmail = String(values.email ?? '');
      localCreateMailbox = values.createMailbox === 'on';
      localRole = String(values.role ?? 'worker');
      localSupplierId = String(values.supplierId ?? '');
      localPhone = String(values.phone ?? '');
      localCompany = String(values.company ?? '');
      localContactName = String(values.contactName ?? '');
      localNotes = String(values.notes ?? '');
    }
    creatingUser = true;
    createLocal = true;
    activeTab = 'specialists';
  });
  $effect(() => {
    const failedEditorId = failedWorkerProfileId ?? failedWorkforceProfileId;
    if (!failedEditorId) return;
    if (failedWorkforceProfileId) {
      const retainedProfile = problemPayload?.values?.profile;
      const retainedSupplier = problemPayload?.values?.supplierId;
      if (typeof retainedProfile === 'string')
        selectedWorkforceProfiles[failedWorkforceProfileId] = retainedProfile;
      if (typeof retainedSupplier === 'string')
        selectedWorkforceSuppliers[failedWorkforceProfileId] = retainedSupplier;
    }
    editingWorkerId = failedEditorId;
    activeTab = 'specialists';
    search = '';
    directorySupplierId = '';
    directoryTechnicianId = '';
    showAll = true;
  });
  $effect(() => {
    if (!failedStatusUserId) return;
    activeTab = 'specialists';
    search = '';
    directorySupplierId = '';
    directoryTechnicianId = '';
    showAll = true;
  });
  $effect(() => {
    if (problemPayload?.actionName === 'createMailboxAccount') {
      creatingMailbox = true;
      activeTab = 'mailboxes';
    }
    if (
      ['updateMailboxPassword', 'destroyMailboxAccount'].includes(problemPayload?.actionName ?? '')
    )
      activeTab = 'mailboxes';
  });
  function revealTeamProblem(target: HTMLElement): void {
    const header = document.querySelector<HTMLElement>('.portal-layout > header');
    const headerPosition = header ? window.getComputedStyle(header).position : '';
    const safeTop =
      (header && (headerPosition === 'sticky' || headerPosition === 'fixed')
        ? Math.max(0, header.getBoundingClientRect().bottom)
        : 0) + 16;
    const mobileNavigation = document.querySelector<HTMLElement>('.bottom-nav');
    let safeBottom =
      mobileNavigation &&
      mobileNavigation.getClientRects().length > 0 &&
      window.getComputedStyle(mobileNavigation).position === 'fixed'
        ? mobileNavigation.getBoundingClientRect().top - 16
        : window.innerHeight - 16;
    const bounds = target.getBoundingClientRect();
    const toastRegion = document.querySelector<HTMLElement>('[data-ui="toast-region"]');
    if (
      toastRegion?.getClientRects().length &&
      window.getComputedStyle(toastRegion).position === 'fixed'
    ) {
      const toastBounds = toastRegion.getBoundingClientRect();
      const overlapsHorizontally =
        bounds.left < toastBounds.right && bounds.right > toastBounds.left;
      if (overlapsHorizontally && toastBounds.bottom > safeTop && toastBounds.top < safeBottom)
        safeBottom = Math.min(safeBottom, toastBounds.top - 16);
    }
    const delta =
      bounds.height > safeBottom - safeTop || bounds.top < safeTop
        ? bounds.top - safeTop
        : bounds.bottom > safeBottom
          ? bounds.bottom - safeBottom
          : 0;
    if (delta) window.scrollBy({ top: delta, behavior: 'instant' });
  }
  $effect(() => {
    const actionName = problemPayload?.actionName;
    const errors = problemPayload?.fieldErrors;
    if (!actionName || !errors) return;
    if (
      !Object.keys(errors).length &&
      actionName !== 'setWorkforceProfile' &&
      actionName !== 'updateUserStatus'
    )
      return;
    const failedTeamId = failedWorkerProfileId ?? failedWorkforceProfileId ?? failedStatusUserId;
    if (
      failedTeamId &&
      workers.some((worker) => workerId(worker) === failedTeamId) &&
      !teamPage.some((worker) => workerId(worker) === failedTeamId)
    )
      return;
    void tick().then(() => {
      const candidates = document.querySelectorAll<HTMLFormElement>(
        `[data-team-directory] form[action*="/${actionName}"]`,
      );
      const selectedInput =
        actionName === 'updateWorkerProfile' || actionName === 'setWorkforceProfile'
          ? 'workerId'
          : actionName === 'updateUserStatus'
            ? 'userId'
            : 'portalUserId';
      const selectedUserId = String(problemPayload.values?.[selectedInput] ?? '');
      const target =
        Array.from(candidates).find(
          (candidate) =>
            !selectedUserId ||
            candidate.querySelector<HTMLInputElement>(`input[name="${selectedInput}"]`)?.value ===
              selectedUserId,
        ) ?? null;
      if (target) {
        if (Object.keys(errors).length) reportFormFieldErrors(target, errors);
        // The sheet also focuses its first control after opening. Move focus
        // after that initial focus pass so the submitted error stays announced.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const summary = target.querySelector<HTMLElement>('[data-validation-summary]');
            const supplierNotice =
              workforceSupplierInactiveProblem && actionName === 'setWorkforceProfile'
                ? target
                    .closest('.team-directory__editor')
                    ?.querySelector<HTMLElement>(
                      '[data-workforce-supplier-problem] [data-ui="problem-notice"]',
                    )
                : null;
            const focusTarget =
              supplierNotice ??
              summary ??
              target
                .closest('[data-team-actions]')
                ?.querySelector<HTMLElement>('[data-status-problem] [data-ui="problem-notice"]') ??
              document.querySelector<HTMLElement>(
                '[data-team-directory] > [data-ui="problem-notice"]',
              );
            focusTarget?.focus({ preventScroll: true });
            if (
              focusTarget &&
              ['updateWorkerProfile', 'setWorkforceProfile', 'updateUserStatus'].includes(
                actionName,
              )
            ) {
              revealTeamProblem(focusTarget);
              requestAnimationFrame(() => {
                if (focusTarget.isConnected && document.activeElement === focusTarget)
                  revealTeamProblem(focusTarget);
              });
            }
          }),
        );
      } else if (actionName === 'updateUserStatus' || actionName === 'setWorkforceProfile') {
        requestAnimationFrame(() => {
          const notice = document.querySelector<HTMLElement>(
            '[data-team-directory] > [data-ui="problem-notice"]',
          );
          notice?.focus({ preventScroll: true });
          if (notice) revealTeamProblem(notice);
        });
      }
    });
  });

  function failedWorkerProfileValue(
    worker: PortalRow,
    field: 'name' | 'email' | 'role',
  ): string | null {
    if (failedWorkerProfileId !== workerId(worker)) return null;
    const retained = problemPayload?.values?.[field];
    return typeof retained === 'string' ? retained : null;
  }

  function workforceProfileValue(worker: PortalRow): string {
    const id = workerId(worker);
    if (selectedWorkforceProfiles[id] !== undefined) return selectedWorkforceProfiles[id];
    if (failedWorkforceProfileId === id && typeof problemPayload?.values?.profile === 'string')
      return problemPayload.values.profile;
    return value(worker, 'workforce_profile') || 'standard';
  }

  function workforceSupplierValue(worker: PortalRow): string {
    const id = workerId(worker);
    if (selectedWorkforceSuppliers[id] !== undefined) return selectedWorkforceSuppliers[id];
    if (failedWorkforceProfileId === id && typeof problemPayload?.values?.supplierId === 'string')
      return problemPayload.values.supplierId;
    return value(worker, 'supplier_id');
  }

  function workforceProblemContext(worker: PortalRow): string {
    const supplierId = workforceSupplierValue(worker);
    const supplier = suppliers.find((candidate) => String(candidate.id ?? '') === supplierId);
    const supplierName = supplier ? value(supplier, 'name') : '';
    return [workerName(worker), supplierName].filter(Boolean).join(' · ');
  }

  function unavailableWorkforceSupplier(worker: PortalRow): string {
    const selected = workforceSupplierValue(worker);
    return selected && !suppliers.some((supplier) => String(supplier.id) === selected)
      ? selected
      : '';
  }

  function failedMailboxValue(actionName: string, mailbox: MailboxRow, field: string): string {
    if (problemPayload?.actionName !== actionName) return '';
    if (String(problemPayload.values?.portalUserId ?? '') !== String(mailbox.portalUserId ?? ''))
      return '';
    return String(problemPayload.values?.[field] ?? '');
  }
  function failedExternalValue(actionName: string, accountId: string, field: string): string {
    if (problemPayload?.actionName !== actionName) return '';
    if (actionName !== 'createMailboxAccount') {
      if (String(problemPayload.values?.stalwartAccountId ?? '') !== accountId) return '';
    }
    return String(problemPayload.values?.[field] ?? '');
  }

  type MailboxActionStatus = 'idle' | 'pending' | 'success' | 'error';
  type MailboxActionState = {
    status: MailboxActionStatus;
    action: string;
    message: string;
    /** Mailbox the action was about (for the inline row message). */
    email?: string;
    /** Portal change saved but the mailbox step must be retried. */
    warning?: boolean;
  };
  let mailboxAction = $state<MailboxActionState>({ status: 'idle', action: '', message: '' });

  // Accent- and case-insensitive: "josé raúl" finds "Jose Raul" and vice versa.
  const normalizedSearch = $derived(normalizeSelectSearch(search));
  const normalizedMailboxSearch = $derived(mailboxSearch.trim().toLowerCase());
  const mailboxRows = $derived(mailboxes ?? []);
  const mailboxDirectoryState = $derived(
    mailboxDirectoryStatus ??
      (mailboxes === undefined || mailboxes === null ? 'unavailable' : 'ready'),
  );
  const mailboxCountLabel = $derived(
    mailboxDirectory ? String(mailboxDirectory.total) : '',
  );
  /** Stalwart down: the list shows only portal-linked mailboxes (from the DB). */
  const mailboxDegraded = $derived(mailboxDirectory?.source === 'portal');
  $effect(() => {
    if (!mailboxDirectory) return;
    const q = mailboxDirectory.q;
    mailboxStatus = mailboxDirectory.status;
    if (untrack(() => document.activeElement?.id !== 'mailbox-search' || !mailboxSearch))
      mailboxSearch = q;
  });
  let mailboxSearchTimer: ReturnType<typeof setTimeout> | undefined;
  function submitMailboxFilters(form: HTMLFormElement | null | undefined, delay = 0): void {
    if (!form) return;
    clearTimeout(mailboxSearchTimer);
    mailboxSearchTimer = setTimeout(() => form.requestSubmit(), delay);
  }
  function mailboxListHref(changes: Record<string, string>): string {
    const url = new URL($page.url);
    url.searchParams.set('view', 'team');
    url.searchParams.set('directory', 'mailboxes');
    for (const [key, next] of Object.entries(changes)) {
      if (next) url.searchParams.set(key, next);
      else url.searchParams.delete(key);
    }
    for (const key of [...url.searchParams.keys()])
      if (key.startsWith('/')) url.searchParams.delete(key);
    return `?${url.searchParams.toString()}`;
  }
  const mailboxFilterHref = (status: MailboxStatusFilter) =>
    mailboxListHref({ mstatus: status === 'all' ? '' : status, mpage: '' });
  const mailboxPageHref = (pageNumber: number) =>
    mailboxListHref({ mpage: pageNumber > 1 ? String(pageNumber) : '' });
  const mailboxStatusOptions = $derived.by(() => {
    const counts = mailboxDirectory?.counts;
    const count = (key: MailboxStatusFilter) => counts?.[key] ?? 0;
    return [
      { value: 'all', label: mc('filterAll', { count: count('all') }), disabled: false },
      { value: 'active', label: mc('filterActive', { count: count('active') }), disabled: false },
      {
        value: 'offboarded',
        label: mc('filterOffboarded', { count: count('offboarded') }),
        disabled: false,
      },
      {
        value: 'unlinked',
        label: mc('filterUnlinked', { count: count('unlinked') }),
        disabled: mailboxDegraded,
      },
      {
        value: 'blocked',
        label: mailboxDegraded
          ? mc('filterBlockedUnknown')
          : mc('filterBlocked', { count: count('blocked') }),
        disabled: mailboxDegraded,
      },
    ] satisfies Array<{ value: MailboxStatusFilter; label: string; disabled: boolean }>;
  });
  const mailboxRange = $derived.by(() => {
    if (!mailboxDirectory) return null;
    const from = mailboxDirectory.filtered
      ? (mailboxDirectory.page - 1) * mailboxDirectory.pageSize + 1
      : 0;
    return {
      from,
      to: Math.min(mailboxDirectory.filtered, from + mailboxRows.length - 1),
      total: mailboxDirectory.filtered,
    };
  });
  const canManageMailboxDirectory = $derived(
    Boolean(canManageMail || (canManageTeam && canonicalOwner)),
  );
  beforeNavigate((navigation) => {
    if (navigation.willUnload) return;
    const forms = document.querySelectorAll<HTMLFormElement>('[data-team-assistant-form]');
    if (
      Array.from(forms).some(
        (form) => !confirmDirtyForms(form, translate('Discard unsaved changes?')),
      )
    )
      navigation.cancel();
  });
  useAssistantPaneRequest({
    url: () => $page.url,
    panes: ['team-create', 'team-invite', 'mailbox-create'],
    activate: (pane) => {
      // Failed native submissions already own their recovery surface and retained values.
      if (
        problemPayload &&
        ['createLocalPortalUser', 'createInvitation', 'createMailboxAccount'].includes(
          problemPayload.actionName ?? '',
        )
      )
        return;
      if (pane === 'mailbox-create') {
        if (!canManageMailboxDirectory) return;
        activeTab = 'mailboxes';
        creatingMailbox = true;
      } else {
        if (!canManageTeam) return;
        activeTab = 'specialists';
        creatingMailbox = false;
        createLocal = pane === 'team-create';
        creatingUser = true;
      }
    },
    deactivate: (pane) => {
      if (problemPayload) return;
      if (pane === 'mailbox-create') creatingMailbox = false;
      else if (creatingUser && createLocal === (pane === 'team-create')) creatingUser = false;
    },
  });

  function value(row: PortalRow, ...keys: string[]): string {
    for (const key of keys) {
      const candidate = row[key];
      if (candidate !== null && candidate !== undefined && String(candidate).trim())
        return String(candidate);
    }
    return '';
  }

  function workerId(row: PortalRow): string {
    return value(row, 'id', 'worker_id', 'user_id');
  }

  function workerName(row: PortalRow): string {
    return value(row, 'name', 'worker_name') || translate('Unnamed specialist');
  }

  function workerEmail(row: PortalRow): string {
    return value(row, 'email').trim().toLowerCase();
  }

  function workerIsProtectedOwner(row: PortalRow): boolean {
    return workerEmail(row) === OWNER_EMAIL;
  }

  function setDirectoryProject(projectId: string): void {
    directoryProjectId = projectId;
    const url = new URL($page.url);
    if (projectId) url.searchParams.set('project', projectId);
    else url.searchParams.delete('project');
    replaceState(url, {});
  }

  const projectFilterOptions = $derived.by(() => {
    const projectsById = new SvelteMap<string, string>();
    for (const assignment of assignments) {
      const id = value(assignment, 'project_id');
      if (!id) continue;
      const label = [value(assignment, 'project_number'), value(assignment, 'project_name')]
        .filter(Boolean)
        .join(' · ');
      if (label) projectsById.set(id, label);
    }
    return [...projectsById].map(([id, name]) => ({ id, name }));
  });

  function availability(row: PortalRow): string {
    const explicit = value(row, 'availability', 'availability_status');
    if (explicit) return controlledValue?.('availability', explicit) || translate(explicit);
    const availableMinutes = value(row, 'available_minutes');
    if (availableMinutes !== '')
      return `${formatDecimalHours(Number(availableMinutes))} ${translate('available')}`;
    const availableHours = value(row, 'hours_available');
    if (availableHours !== '') return `${availableHours}h ${translate('available')}`;
    const status = value(row, 'status');
    return status
      ? controlledValue?.('status', status) || translate(status)
      : translate('Not provided');
  }

  function statusLabel(valueToLabel: unknown): string {
    const status = valueToLabel == null ? '' : String(valueToLabel).trim();
    return status
      ? controlledValue?.('status', status) || translate(status)
      : translate('Status unavailable');
  }

  function statusVariant(row: PortalRow): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    switch (value(row, 'status')) {
      case 'active':
        return 'success';
      case 'suspended':
      case 'inactive':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  function formatHours(minutes: number): string {
    return minutes > 0 ? formatDecimalHours(minutes) : '—';
  }

  const relationFilteredWorkers = $derived(
    filterProjectTeamWorkers(workers ?? [], assignments ?? [], {
      projectId: directoryProjectId,
      supplierId: directorySupplierId,
      technicianId: directoryTechnicianId,
    }),
  );
  const existingUserCandidates = $derived(
    (existingPeople ?? workers ?? []).filter(
      (worker) =>
        value(worker, 'status') === 'active' &&
        value(worker, 'has_portal_access') !== '1' &&
        !workerIsProtectedOwner(worker),
    ),
  );

  function accessRoleForWorker(worker: PortalRow): string {
    const profile = value(worker, 'workforce_profile');
    if (profile === 'external_technician' || profile === 'supplier_coordinator') return profile;
    return value(worker, 'role') || 'worker';
  }

  function selectExistingPerson(userId: string): void {
    existingUserId = userId;
    const worker = existingUserCandidates.find((candidate) => workerId(candidate) === userId);
    if (!worker) {
      localName = '';
      localEmail = '';
      localPhone = '';
      localCompany = '';
      localContactName = '';
      localNotes = '';
      localRole = 'worker';
      localSupplierId = '';
      return;
    }
    localName = workerName(worker);
    const email = value(worker, 'email');
    localEmail = email.endsWith('@personnel.invalid') ? '' : email;
    localPhone = value(worker, 'phone');
    localCompany = value(worker, 'company');
    localContactName = value(worker, 'contact_name');
    localNotes = value(worker, 'notes');
    localRole = accessRoleForWorker(worker);
    localSupplierId = value(worker, 'supplier_id');
  }

  function mailboxEmail(mailbox: MailboxRow): string {
    const email = String(mailbox.email ?? '')
      .trim()
      .toLowerCase();
    return email.includes('@')
      ? email
      : `${String(mailbox.username ?? '')
          .trim()
          .toLowerCase()}${CORPORATE_DOMAIN}`;
  }

  function mailboxUsername(mailbox: MailboxRow): string {
    const username = String(mailbox.username ?? '').trim();
    return username || mailboxEmail(mailbox).split('@')[0] || '—';
  }

  function mailboxName(mailbox: MailboxRow): string {
    return String(mailbox.name ?? mailbox.description ?? '').trim() || mailboxUsername(mailbox);
  }

  function isOwnerMailbox(mailbox: MailboxRow): boolean {
    return Boolean(mailbox.isOwner) || mailboxEmail(mailbox) === OWNER_EMAIL;
  }

  function stalwartAccountId(mailbox: MailboxRow): string {
    return String(mailbox.stalwartAccountId ?? mailbox.accountId ?? mailbox.id ?? '').trim();
  }

  function mailboxRole(mailbox: MailboxRow): string {
    if (isOwnerMailbox(mailbox)) return 'owner_admin';
    return String(mailbox.portalRole ?? '').trim() || 'worker';
  }

  function mailboxRoleLabel(mailbox: MailboxRow): string {
    const role = mailboxRole(mailbox);
    return role === 'owner_admin'
      ? translate('Unique Owner')
      : controlledValue?.('role', role) || translate(role);
  }

  function mailboxPortalInactive(mailbox: MailboxRow): boolean {
    return (
      Boolean(mailbox.isProvisioned) &&
      !isOwnerMailbox(mailbox) &&
      String(mailbox.portalStatus ?? 'active') !== 'active'
    );
  }

  function shortDate(value: unknown): string {
    const date = new Date(String(value ?? ''));
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function mailboxPortalStatusLabel(mailbox: MailboxRow): string {
    if (isOwnerMailbox(mailbox)) return translate('Owner — protected');
    if (!mailbox.isProvisioned) return mc('portalNotLinked');
    const status = String(mailbox.portalStatus ?? 'active');
    if (status === 'suspended') return mc('portalSuspended');
    if (status !== 'active') {
      const date = shortDate(mailbox.portalOffboardedAt);
      return date ? mc('portalRemovedOn', { date }) : mc('portalRemoved');
    }
    return `${statusLabel(status)} (${mailboxRoleLabel(mailbox)})`;
  }

  function mailboxSignInBadge(mailbox: MailboxRow): {
    variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
    text: string;
  } {
    if (mailbox.signInBlocked === true) return { variant: 'neutral', text: mc('badgeBlocked') };
    if (mailbox.signInBlocked === false)
      return mailboxPortalInactive(mailbox)
        ? { variant: 'danger', text: mc('badgeStillSignsIn') }
        : { variant: 'success', text: mc('badgeSignsIn') };
    return { variant: 'neutral', text: mc('badgeUnknown') };
  }

  function mailboxStatusVariant(
    mailbox: MailboxRow,
  ): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    if (isOwnerMailbox(mailbox)) return 'info';
    if (mailbox.isProvisioned && String(mailbox.portalStatus ?? 'active') === 'active')
      return 'success';
    if (mailbox.isProvisioned) return 'warning';
    if (!mailbox.isProvisioned && mailbox.signInBlocked === true) return 'neutral';
    if (['suspended', 'inactive', 'disabled'].includes(String(mailbox.status ?? '').toLowerCase()))
      return 'warning';
    return 'neutral';
  }

  function mailboxIsEligible(mailbox: MailboxRow): boolean {
    return (
      !isOwnerMailbox(mailbox) && !mailbox.isProvisioned && mailbox.provisioningEligible !== false
    );
  }

  const filteredMailboxes = $derived(
    mailboxDirectory
      ? mailboxRows
      : mailboxRows.filter((mailbox) => {
      if (filterProvisioned === 'available' && !mailboxIsEligible(mailbox)) return false;
      if (filterProvisioned === 'provisioned' && !mailbox.isProvisioned) return false;
      if (!normalizedMailboxSearch) return true;
      return [mailboxEmail(mailbox), mailboxUsername(mailbox), mailboxName(mailbox)]
        .join(' ')
        .toLowerCase()
        .includes(normalizedMailboxSearch);
    }),
  );
  const eligibleVisibleMailboxes = $derived(filteredMailboxes.filter(mailboxIsEligible));
  const allVisibleEligibleSelected = $derived(
    eligibleVisibleMailboxes.length > 0 &&
      eligibleVisibleMailboxes.every((mailbox) => selectedMailboxes.has(mailboxEmail(mailbox))),
  );

  function toggleMailboxSelection(mailbox: MailboxRow): void {
    if (!mailboxIsEligible(mailbox)) return;
    const email = mailboxEmail(mailbox);
    if (selectedMailboxes.has(email)) selectedMailboxes.delete(email);
    else selectedMailboxes.add(email);
  }

  function toggleAllVisibleMailboxes(): void {
    if (allVisibleEligibleSelected) {
      for (const mailbox of eligibleVisibleMailboxes)
        selectedMailboxes.delete(mailboxEmail(mailbox));
    } else {
      for (const mailbox of eligibleVisibleMailboxes) selectedMailboxes.add(mailboxEmail(mailbox));
    }
  }

  function clearMailboxSelection(): void {
    selectedMailboxes.clear();
  }

  function confirmationPattern(email: string): string {
    return email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function externalCommandKey(action: string, target: string): string {
    const key = `${action}:${target}`;
    const existing = externalCommandKeys[key];
    if (existing) return existing;
    const retained = failedExternalValue(action, target, 'idempotencyKey');
    if (retained.length >= 16 && retained.length <= 200) {
      externalCommandKeys[key] = retained;
      return retained;
    }
    const created = globalThis.crypto.randomUUID();
    externalCommandKeys[key] = created;
    return created;
  }

  function requireExactConfirmation(event: SubmitEvent, email: string): void {
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;
    const confirmation = form.elements.namedItem('confirmation');
    if (!(confirmation instanceof HTMLInputElement)) return;
    const valid = confirmation.value.trim().toLowerCase() === email.trim().toLowerCase();
    confirmation.setCustomValidity(
      valid ? '' : translate('Type the exact email address to confirm.'),
    );
    if (!valid) {
      event.preventDefault();
      confirmation.reportValidity();
    }
  }

  function actionMessage(result: ActionResult): string {
    if (result.type === 'error') return translate('The mailbox operation could not be completed.');
    if (result.type === 'redirect') return translate('Mailbox operation completed.');
    if (result.data && typeof result.data === 'object') {
      const data = result.data as Record<string, unknown>;
      const outcome = mailboxOutcomeText(locale, data.mailboxOutcome);
      if (result.type === 'success' && data.actionName === 'reactivateMailboxUser')
        return [mc('reactivated', { role: roleLabel(String(data.role ?? 'worker')) }), outcome]
          .filter(Boolean)
          .join(' ');
      if (result.type === 'success' && outcome) {
        if (data.actionName === 'setMailboxSignIn') return outcome;
        const base = translate(String(data.messageKey ?? ''));
        return [base && base !== data.messageKey ? base : '', outcome].filter(Boolean).join(' ');
      }
      if (typeof data.messageKey === 'string') {
        const localized = translate(data.messageKey);
        if (localized !== data.messageKey) return localized;
      }
      if (typeof data.message === 'string' && data.message.trim()) return data.message;
    }
    return result.type === 'success'
      ? translate('Mailbox operation completed.')
      : translate('The mailbox operation was rejected.');
  }

  const enhanceMailboxForm: SubmitFunction = ({ formElement }) => {
    const action = formElement.dataset.mailboxAction ?? 'mailbox';
    const email = String(new FormData(formElement).get('email') ?? '').toLowerCase() || undefined;
    mailboxAction = { status: 'pending', action, email, message: translate('Working…') };
    return async ({ update, result }) => {
      if (result.type === 'success' || result.type === 'redirect') {
        const target =
          action === 'createMailboxAccount'
            ? 'new'
            : String(new FormData(formElement).get('stalwartAccountId') ?? 'new');
        delete externalCommandKeys[`${action}:${target || 'new'}`];
        const outcome =
          result.type === 'success'
            ? (result.data as Record<string, unknown> | undefined)?.mailboxOutcome
            : undefined;
        mailboxAction = {
          status: 'success',
          action,
          email,
          warning: mailboxOutcomeNeedsRetry(outcome),
          message: actionMessage(result),
        };
        if (action === 'createMailboxAccount' || action === 'updateMailboxPassword')
          formElement.reset();
        if (action === 'createMailboxAccount') creatingMailbox = false;
        if (action === 'provisionMailboxUsers') clearMailboxSelection();
      } else {
        mailboxAction = { status: 'error', action, email, message: actionMessage(result) };
      }
      await update();
    };
  };

  function handleDirectoryTabKeydown(event: KeyboardEvent): void {
    let next: 'specialists' | 'mailboxes' | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'Home') next = 'specialists';
    if (event.key === 'ArrowRight' || event.key === 'End') next = 'mailboxes';
    if (!next) return;
    event.preventDefault();
    activeTab = next;
    requestAnimationFrame(() => document.getElementById(`team-tab-${next}`)?.focus());
  }

  async function copyInvitation(): Promise<void> {
    if (!invitationPath || typeof navigator === 'undefined') return;
    await navigator.clipboard.writeText(new URL(invitationPath, location.origin).toString());
    invitationCopied = true;
  }
  const workforceSupplierProblemInForm = $derived.by(() =>
    Boolean(
      workforceSupplierInactiveProblem &&
      canManageTeam &&
      failedWorkforceProfileId &&
      editingWorkerId === failedWorkforceProfileId &&
      teamPage.some(
        (worker) =>
          workerId(worker) === failedWorkforceProfileId &&
          (value(worker, 'role') || 'worker') === 'worker' &&
          !workerIsProtectedOwner(worker),
      ),
    ),
  );

  useViewPreferences({
    scope: 'team-directory',
    user: () => `${$page.data.user?.id ?? ''}:${$page.data.user?.role ?? ''}`,
    url: () => $page.url,
    // Search and filters live in the URL (server-scoped lists); only the
    // legacy "show inactive" toggle is remembered per viewer.
    defaults: { showAll: false },
    get: () => ({ showAll }),
    set: (saved) => {
      showAll = saved.showAll;
    },
  });

  /* ------------------------------------------------ People directory */
  const tc = (key: TeamCopyKey, params: Record<string, string | number> = {}) =>
    teamCopy(locale, key, params);
  const mc = (key: MailboxCopyKey, params: Record<string, string | number> = {}) =>
    mailboxCopy(locale, key, params);
  const todayIso = new Date().toISOString().slice(0, 10);
  let fixingNames = $state(false);
  let roleFilter = $state('');
  let statusFilter = $state<'active' | 'inactive' | 'all'>('active');
  let peopleLimit = $state(50);
  function personName(row: PortalRow): string {
    return personDisplayName(row.name ?? row.worker_name, row.email) || translate('Unnamed specialist');
  }
  function roleLabel(role: string): string {
    const choice = accessRoleChoices.find((candidate) => candidate.value === role);
    if (choice) return translate(choice.label);
    if (role === 'owner_admin') return translate('Owner');
    return controlledValue?.('role', role) || translate(role);
  }
  // Pending invitations share the People search so an invitee can be found by email.
  const shownInvitations = $derived(
    canManageTeam && canonicalOwner
      ? invitations.filter(
          (invitation) =>
            !normalizedSearch ||
            normalizeSelectSearch(`${invitation.email} ${roleLabel(invitation.role)}`).includes(
              normalizedSearch,
            ),
        )
      : [],
  );
  let confirmRevokeId = $state('');
  let invitationBusyId = $state('');
  function invitationDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const submitInvitationAction: SubmitFunction = ({ formData }) => {
    invitationBusyId = String(formData.get('invitationId') ?? '');
    return async ({ update }) => {
      await update();
      invitationBusyId = '';
      confirmRevokeId = '';
    };
  };
  const statsById = $derived(new Map(teamStats.map((row) => [String(row.worker_id), row])));
  function statsFor(row: PortalRow) {
    const stats = statsById.get(workerId(row));
    const n = (key: string) => Number(stats?.[key] ?? 0) || 0;
    return {
      week_approved_minutes: n('week_approved_minutes'),
      week_submitted_minutes: n('week_submitted_minutes'),
      week_draft_minutes: n('week_draft_minutes'),
      pending_time: n('pending_time'),
      pending_expenses: n('pending_expenses'),
    };
  }
  const linkedIds = $derived(new Set(mailboxLinkedIds));
  function mailboxLinked(row: PortalRow): boolean {
    const id = workerId(row);
    return linkedIds.has(id) || (mailboxes ?? []).some((mailbox) => mailbox.portalUserId === id);
  }
  function personAssignments(row: PortalRow): PortalRow[] {
    const id = workerId(row);
    return assignments.filter((assignment) => value(assignment, 'worker_id', 'user_id') === id);
  }
  function currentAssignments(row: PortalRow): PortalRow[] {
    return personAssignments(row).filter(
      (assignment) =>
        value(assignment, 'status') === 'active' &&
        (!value(assignment, 'ends_on') || value(assignment, 'ends_on') >= todayIso) &&
        (!directoryProjectId || value(assignment, 'project_id') === directoryProjectId),
    );
  }
  const skillNames = $derived(new Map(skills.map((skill) => [String(skill.id), String(skill.name ?? '')])));
  function personSkills(row: PortalRow): string[] {
    const id = workerId(row);
    return workerSkills
      .filter((entry) => String(entry.worker_id) === id)
      .map((entry) => skillNames.get(String(entry.skill_id)) ?? '')
      .filter(Boolean);
  }
  function hoursText(minutes: number): string {
    if (!(minutes > 0)) return '0';
    const hundredths = Math.round((minutes * 100) / 60);
    const whole = Math.floor(hundredths / 100);
    const fraction = hundredths % 100;
    const sep = locale.startsWith('en') ? '.' : ',';
    return fraction ? `${whole}${sep}${String(fraction).padStart(2, '0').replace(/0$/u, '')}` : String(whole);
  }
  function linkParams(): URLSearchParams {
    const params = new URLSearchParams({ view: 'team' });
    const lang = $page.url.searchParams.get('lang');
    if (lang) params.set('lang', lang);
    return params;
  }
  function personHref(id: string, tab = 'overview'): string {
    const params = linkParams();
    params.set('person', id);
    if (tab !== 'overview') params.set('tab', tab);
    return `?${params.toString()}`;
  }
  function directoryHref(): string {
    const params = linkParams();
    const project = $page.url.searchParams.get('project');
    if (project) params.set('project', project);
    return `?${params.toString()}`;
  }
  function clearPeopleFilters(): void {
    search = '';
    roleFilter = '';
    statusFilter = 'active';
    setDirectoryProject('');
  }
  const personParam = $derived(
    $page.url.searchParams.get('person') ??
      failedWorkerProfileId ??
      failedWorkforceProfileId ??
      failedStatusUserId ??
      $page.url.searchParams.get('worker'),
  );
  const selectedPerson = $derived(
    personParam ? (workers.find((worker) => workerId(worker) === personParam) ?? null) : null,
  );
  type PersonTab = 'overview' | 'projects' | 'hours' | 'expenses' | 'pay' | 'access';
  const tabLabel: Record<PersonTab, TeamCopyKey> = {
    overview: 'tabOverview',
    projects: 'tabProjects',
    hours: 'tabHours',
    expenses: 'tabExpenses',
    pay: 'tabPay',
    access: 'tabAccess',
  };
  const personTabs = $derived<PersonTab[]>(
    canManageTeam
      ? ['overview', 'projects', 'hours', 'expenses', 'pay', 'access']
      : ['overview', 'projects', 'hours', 'expenses'],
  );
  const personTab = $derived.by<PersonTab>(() => {
    const requested = $page.url.searchParams.get('tab') as PersonTab | null;
    if (failedWorkerProfileId || failedWorkforceProfileId || failedStatusUserId || resetPasswordDoneFor)
      return canManageTeam ? 'access' : 'overview';
    return requested && personTabs.includes(requested) ? requested : 'overview';
  });
  const profileSaved = $derived.by(() => {
    const candidate = form as unknown as Record<string, unknown> | null | undefined;
    const payload = (candidate?.data && typeof candidate.data === 'object' ? candidate.data : candidate) as
      | Record<string, unknown>
      | null
      | undefined;
    return payload?.success === true && payload.messageKey === 'action.access.workerProfile.updated';
  });
  /** Mailbox step of the last portal status change (person page). */
  const statusOutcome = $derived.by(() => {
    const candidate = form as unknown as Record<string, unknown> | null | undefined;
    const payload = (candidate?.data && typeof candidate.data === 'object' ? candidate.data : candidate) as
      | Record<string, unknown>
      | null
      | undefined;
    if (payload?.success !== true || payload.actionName !== 'updateUserStatus') return null;
    return {
      userId: String(payload.userId ?? ''),
      outcome: String(payload.mailboxOutcome ?? ''),
      text: mailboxOutcomeText(locale, payload.mailboxOutcome),
      retry: mailboxOutcomeNeedsRetry(payload.mailboxOutcome),
    };
  });
  const hoursPeriods: Array<{ value: string; label: TeamCopyKey }> = [
    { value: 'this_week', label: 'hoursThisWeek' },
    { value: 'last_week', label: 'hoursLastWeek' },
    { value: 'this_month', label: 'hoursThisMonth' },
    { value: 'last_month', label: 'hoursLastMonth' },
  ];
  const nameFixCount = $derived(
    peopleDirectory?.nameFixCount ??
    workers.filter(
      (worker) =>
        value(worker, 'status') === 'active' &&
        !workerIsProtectedOwner(worker) &&
        proposedPersonName(worker.name, worker.email),
    ).length,
  );
  const roleOptions = $derived(
    peopleDirectory?.roleOptions ??
      [...new Set(workers.map((worker) => accessRoleForWorker(worker)))].sort(),
  );
  const peopleProjectOptions = $derived(peopleDirectory?.projectOptions ?? projectFilterOptions);
  // Server-scoped directory: the page already holds the filtered, sorted page.
  $effect(() => {
    if (!peopleDirectory) return;
    const q = peopleDirectory.q;
    if (untrack(() => document.activeElement?.id !== 'team-search' || !search)) search = q;
    roleFilter = peopleDirectory.role;
    statusFilter = peopleDirectory.status;
  });
  let peopleSearchTimer: ReturnType<typeof setTimeout> | undefined;
  function submitPeopleFilters(form: HTMLFormElement | null | undefined, delay = 0): void {
    if (!form || !peopleDirectory) return;
    clearTimeout(peopleSearchTimer);
    peopleSearchTimer = setTimeout(() => form.requestSubmit(), delay);
  }
  function peoplePageHref(pageNumber: number): string {
    const url = new URL($page.url);
    url.searchParams.delete('person');
    url.searchParams.delete('worker');
    url.searchParams.delete('tab');
    if (pageNumber > 1) url.searchParams.set('ppage', String(pageNumber));
    else url.searchParams.delete('ppage');
    return `?${url.searchParams.toString()}`;
  }
  const peopleRange = $derived.by(() => {
    if (!peopleDirectory) return null;
    const from = peopleDirectory.filtered ? (peopleDirectory.page - 1) * peopleDirectory.pageSize + 1 : 0;
    return {
      from,
      to: Math.min(peopleDirectory.filtered, from + workers.length - 1),
      total: peopleDirectory.filtered,
    };
  });
  const peopleRows = $derived(
    peopleDirectory
      ? workers
      : relationFilteredWorkers
      .filter((worker) => {
        const status = value(worker, 'status') || 'active';
        if (statusFilter === 'active' && status !== 'active') return false;
        if (statusFilter === 'inactive' && status === 'active') return false;
        if (roleFilter && accessRoleForWorker(worker) !== roleFilter) return false;
        if (!normalizedSearch) return true;
        return normalizeSelectSearch(
          [
            personName(worker),
            workerName(worker),
            value(worker, 'email'),
            ...personAssignments(worker).map((assignment) =>
              [value(assignment, 'project_number'), value(assignment, 'project_name')].join(' '),
            ),
          ].join(' '),
        ).includes(normalizedSearch);
      })
      .sort((a, b) => personName(a).localeCompare(personName(b))),
  );
  const shownPeople = $derived(peopleDirectory ? peopleRows : peopleRows.slice(0, peopleLimit));
  const teamPage = $derived(selectedPerson ? [selectedPerson] : shownPeople);
</script>

{#snippet offboardChecklistBlock(personId: string)}
  {@const list = checklists[personId]}
  <div class="person__checklist" role="status">
    <strong>{tc('checklistTitle')}</strong>
    {#if !list}
      <p>{tc('checklistLoading')}</p>
    {:else if list === 'error'}
      <p>—</p>
    {:else}
      <ul>
        {#if list.draftTime || list.draftExpenses}<li>
            {tc('checklistDrafts', { time: list.draftTime, expenses: list.draftExpenses })}
          </li>{/if}
        {#if list.pendingTime || list.pendingExpenses}<li>
            {tc('checklistPending', { time: list.pendingTime, expenses: list.pendingExpenses })}
          </li>{/if}
        {#if list.activeAssignments.length}<li>
            {tc('checklistAssignments', {
              projects: list.activeAssignments
                .map((row) => (row.endsOn ? `${row.projectName} (→ ${row.endsOn})` : row.projectName))
                .join(', '),
            })}
          </li>{/if}
        {#if list.unsettledApprovedMinutes || list.unreimbursedExpenses}<li>
            {tc('checklistPay', {
              hours: (list.unsettledApprovedMinutes / 60).toFixed(1),
              expenses: list.unreimbursedExpenses,
            })}
            <a href={personHref(personId, 'pay')}>{tc('checklistOpenPay')}</a>
          </li>{/if}
        {#if !list.draftTime && !list.draftExpenses && !list.pendingTime && !list.pendingExpenses && !list.activeAssignments.length && !list.unsettledApprovedMinutes && !list.unreimbursedExpenses}
          <li>{tc('checklistClear')}</li>
        {/if}
      </ul>
    {/if}
  </div>
{/snippet}

{#snippet offboardForm(worker: PortalRow, linked: boolean)}
  <details
    class="person__confirm"
    ontoggle={(event) => {
      if ((event.currentTarget as HTMLDetailsElement).open) void loadChecklist(workerId(worker));
    }}
  >
    <summary class="team-directory__action team-directory__action--danger-outline"
      >{tc('offboardOpen')}</summary
    >
    <form
      method="POST"
      action={teamActionHref('updateUserStatus', workerId(worker))}
      class="person__offboard"
      use:formValidation
      data-offboard-form
    >
      {@render offboardChecklistBlock(workerId(worker))}
      <input type="hidden" name="userId" value={workerId(worker)} /><input
        type="hidden"
        name="status"
        value="offboarded"
      />
      {#if linked && canonicalOwner}
        <fieldset class="team-directory__mailbox-choice" data-offboard-mailbox-choice>
          <legend>{mc('mailboxChoiceLegend', { email: value(worker, 'email') })}</legend>
          <label
            ><input type="radio" name="mailbox" value="block" checked />{mc('mailboxChoiceBlock')}</label
          ><label><input type="radio" name="mailbox" value="keep" />{mc('mailboxChoiceKeep')}</label>
          <small>{mc('mailboxChoiceHelp')}</small>
        </fieldset>
      {/if}
      <label
        >{tc('statusReason')}<textarea name="reason" required maxlength="2000"></textarea></label
      >
      <button type="submit" class="team-directory__action team-directory__action--danger-outline"
        >{tc('offboardConfirm')}</button
      >
    </form>
  </details>
{/snippet}

<div class="team-directory" data-team-directory>
  {#snippet pager(current: number, pages: number, href: (n: number) => string, name: string)}
    <nav class="team-pager" aria-label={mc('pageOf', { page: current, pages })} data-pager={name}>
      {#if current > 1}<a class="secondary-button team-pager__step" href={href(current - 1)} rel="prev"
          >← {mc('previous')}</a
        >{:else}<span class="secondary-button team-pager__step team-pager__step--off" aria-hidden="true"
          >← {mc('previous')}</span
        >{/if}
      <span class="team-pager__label">{mc('pageOf', { page: current, pages })}</span>
      {#if current < pages}<a class="secondary-button team-pager__step" href={href(current + 1)} rel="next"
          >{mc('next')} →</a
        >{:else}<span class="secondary-button team-pager__step team-pager__step--off" aria-hidden="true"
          >{mc('next')} →</span
        >{/if}
    </nav>
  {/snippet}
  <header class="team-directory__header">
    <div>
      <h2>{tc('title')}</h2>
      <p>{canManageTeam ? tc('intro') : `${tc('introPm')}`}</p>
    </div>
  </header>

  {#if problemPayload && !workforceSupplierProblemInForm && !(failedStatusUserId && canManageTeam && workers.some((worker) => workerId(worker) === failedStatusUserId))}
    <ProblemNotice
      problem={problemPayload}
      status={problemPersonName || undefined}
      remedyLinks={{
        review_owner_access: {
          label: portalText(problemLocale, 'problem.remedy.reviewOwnerAccess'),
          href: `${base}/app/projects?view=team`,
        },
        review_user_status: {
          label: portalText(problemLocale, 'problem.remedy.reviewUserStatus'),
          href: personReviewHref,
        },
        review_existing_person: {
          label: portalText(problemLocale, 'problem.remedy.reviewExistingPerson'),
          href: personReviewHref,
        },
        review_supplier_profile: {
          label: portalText(problemLocale, 'problem.remedy.reviewSupplierProfile'),
          href: personReviewHref,
        },
        ...(canonicalOwner
          ? {
              review_supplier_status: {
                label: portalText(problemLocale, 'problem.remedy.reviewSupplierStatus'),
                href: supplierStatusHref,
              },
            }
          : {}),
        review_user_access: {
          label: portalText(problemLocale, 'problem.remedy.reviewUserAccess'),
          href: personReviewHref,
        },
        review_mailbox_identity: {
          label: portalText(problemLocale, 'problem.remedy.reviewMailboxIdentity'),
          href: canManageMail ? `${base}/app/projects?view=team&directory=mailboxes` : undefined,
        },
        review_updated_record: {
          label: portalText(problemLocale, 'problem.remedy.reviewUpdatedRecord'),
          href: personReviewHref,
        },
        correct_email: { label: portalText(problemLocale, 'problem.remedy.correctEmail') },
        enter_reason: { label: portalText(problemLocale, 'problem.remedy.enterReason') },
        contact_owner: { label: portalText(problemLocale, 'problem.remedy.contactOwner') },
        sign_in_again: {
          label: portalText(problemLocale, 'problem.remedy.signInAgain'),
          href: `${base}/app/login`,
        },
      }}
    />
  {/if}

  {#if canManageMailboxDirectory}
    <div class="team-directory__tabs" role="tablist" aria-label={translate('Team directory views')}>
      <a
        id="team-tab-specialists"
        href="?view=team&directory=specialists"
        role="tab"
        aria-selected={activeTab === 'specialists'}
        aria-controls={activeTab === 'specialists' ? 'team-panel-specialists' : undefined}
        tabindex={activeTab === 'specialists' ? 0 : -1}
        class="team-directory__tab"
        class:team-directory__tab--active={activeTab === 'specialists'}
        onclick={() => (activeTab = 'specialists')}
        onkeydown={handleDirectoryTabKeydown}
      >
        <span>{tc('title')}</span><span class="team-directory__tab-count"
          >{peopleDirectory?.activeTotal ??
            workers.filter((worker) => value(worker, 'status') === 'active').length}</span
        >
      </a>
      <a
        id="team-tab-mailboxes"
        href="?view=team&directory=mailboxes"
        role="tab"
        aria-selected={activeTab === 'mailboxes'}
        aria-controls={activeTab === 'mailboxes' ? 'team-panel-mailboxes' : undefined}
        tabindex={activeTab === 'mailboxes' ? 0 : -1}
        class="team-directory__tab"
        class:team-directory__tab--active={activeTab === 'mailboxes'}
        onclick={() => (activeTab = 'mailboxes')}
        onkeydown={handleDirectoryTabKeydown}
      >
        <span>{translate('Mailboxes')} ({CORPORATE_DOMAIN})</span>{#if mailboxCountLabel}<span
            class="team-directory__tab-count"
            aria-label={translate('Mailbox count')}>{mailboxCountLabel}</span
          >{/if}
      </a>
    </div>
  {/if}

  {#if mailboxAction.status !== 'idle'}
    <div
      class:team-directory__feedback--success={mailboxAction.status === 'success' &&
        !mailboxAction.warning}
      class:team-directory__feedback--error={mailboxAction.status === 'error' || mailboxAction.warning}
      class:team-directory__feedback--pending={mailboxAction.status === 'pending'}
      class="team-directory__feedback"
      role={mailboxAction.status === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      data-mailbox-feedback={mailboxAction.status}
    >
      <strong
        >{mailboxAction.status === 'pending'
          ? translate('Updating mailbox directory')
          : translate('Mailbox directory')}</strong
      ><span>{mailboxAction.message}</span>
    </div>
  {/if}

  {#if activeTab === 'specialists'}
    <section
      id="team-panel-specialists"
      tabindex="-1"
      role={canManageMailboxDirectory ? 'tabpanel' : undefined}
      aria-labelledby={canManageMailboxDirectory ? 'team-tab-specialists' : undefined}
      class="team-directory__specialists"
    >
      {#if selectedPerson}
        {#each [selectedPerson] as worker (workerId(worker))}
          {@const role = value(worker, 'role') || 'worker'}
          {@const profileRole = failedWorkerProfileValue(worker, 'role') ?? role}
          {@const protectedOwner = workerIsProtectedOwner(worker)}
          {@const stats = statsFor(worker)}
          {@const linked = mailboxLinked(worker)}
          <article class="person" data-person-page={workerId(worker)}>
            <a class="person__back" href={directoryHref()}>← {tc('back')}</a>
            <header class="person__header">
              <div class="person__avatar" aria-hidden="true">{personInitials(worker.name, worker.email)}</div>
              <div class="person__identity">
                <h3 data-person-name>{personName(worker)}</h3>
                <p>
                  <strong
                    >{protectedOwner
                      ? translate('Unique Owner')
                      : roleLabel(accessRoleForWorker(worker))}</strong
                  >
                  {#if value(worker, 'email')}
                    · <a href={`mailto:${value(worker, 'email')}`}>{value(worker, 'email')}</a>
                  {/if}
                  {#if value(worker, 'phone')}
                    · <a href={`tel:${value(worker, 'phone')}`}>{value(worker, 'phone')}</a>
                  {/if}
                </p>
              </div>
              <div class="person__badges">
                <StatusBadge
                  variant={protectedOwner ? 'info' : statusVariant(worker)}
                  text={protectedOwner
                    ? translate('Owner — protected')
                    : statusLabel(value(worker, 'status') || 'active')}
                />
                {#if canManageTeam}
                  <StatusBadge
                    variant={linked ? 'success' : 'neutral'}
                    text={linked ? tc('mailboxLinked') : tc('mailboxNone')}
                  />
                {/if}
              </div>
            </header>

            <nav class="person__tabs" aria-label={personName(worker)}>
              {#each personTabs as tab (tab)}
                <a
                  href={personHref(workerId(worker), tab)}
                  class="person__tab"
                  class:person__tab--active={personTab === tab}
                  aria-current={personTab === tab ? 'page' : undefined}
                  data-person-tab={tab}
                  data-sveltekit-noscroll
                  data-sveltekit-replacestate>{tc(tabLabel[tab])}</a
                >
              {/each}
            </nav>

            {#if personTab === 'overview'}
              <div class="person__panel" data-person-panel="overview">
                <dl class="person__stats">
                  <div>
                    <dt>{tc('weekApproved')}</dt>
                    <dd>{tc('hours', { value: hoursText(stats.week_approved_minutes) })}</dd>
                  </div>
                  <div>
                    <dt>{tc('weekSubmitted')}</dt>
                    <dd>{tc('hours', { value: hoursText(stats.week_submitted_minutes) })}</dd>
                  </div>
                  <div>
                    <dt>{tc('weekDraft')}</dt>
                    <dd>{tc('hours', { value: hoursText(stats.week_draft_minutes) })}</dd>
                  </div>
                  <div class:person__stat--attention={stats.pending_time + stats.pending_expenses > 0}>
                    <dt>{tc('pendingApprovals')}</dt>
                    <dd>
                      {stats.pending_time + stats.pending_expenses}
                      <small
                        >{tc('pendingDetail', {
                          time: stats.pending_time,
                          expenses: stats.pending_expenses,
                        })}</small
                      >
                      {#if stats.pending_time + stats.pending_expenses > 0 && viewerRole !== 'auditor_read_only'}
                        <a href={`${base}/app/approvals`}>{tc('reviewApprovals')}</a>
                      {/if}
                    </dd>
                  </div>
                </dl>
                <PersonProjectsPanel
                  personId={workerId(worker)}
                  assignments={personAssignments(worker)}
                  {projects}
                  modes={personAssignModes}
                  canManage={canManageTeam && value(worker, 'status') === 'active' && ['worker', 'project_manager'].includes(role)}
                  isOwner={canManageTeam}
                  {locale}
                  today={todayIso}
                />
              </div>
            {:else if personTab === 'projects'}
              <div class="person__panel" data-person-panel="projects">
                <PersonProjectsPanel
                  personId={workerId(worker)}
                  assignments={personAssignments(worker)}
                  {projects}
                  modes={personAssignModes}
                  canManage={canManageTeam && value(worker, 'status') === 'active' && ['worker', 'project_manager'].includes(role)}
                  isOwner={canManageTeam}
                  {locale}
                  today={todayIso}
                />
                <details class="team-directory__assignment-details" use:disclosure>
                  <summary
                    >{translate('Planned vs actual')}
                    <span class="disclosure-count">{personAssignments(worker).length}</span></summary
                  >
                  <ul class="person__plain-list">
                    {#each personAssignments(worker) as assignment (value(assignment, 'id'))}
                      <li>
                        {[value(assignment, 'project_number'), value(assignment, 'project_name')]
                          .filter(Boolean)
                          .join(' · ')}:
                        {translate('Planned hours')}
                        {formatHours(Number(value(assignment, 'planned_minutes')) || 0)} ·
                        {translate('Actual hours')}
                        {formatHours(Number(value(assignment, 'actual_minutes')) || 0)}
                      </li>
                    {/each}
                  </ul>
                </details>
              </div>
            {:else if personTab === 'hours'}
              <div class="person__panel" data-person-panel="hours">
                <p class="person__muted">{tc('hoursIntro')}</p>
                <div class="person__link-grid">
                  {#each hoursPeriods as period (period.value)}
                    <a
                      class="person__link-card"
                      href={`${base}/app/time?view=overview&rworker=${encodeURIComponent(workerId(worker))}&period=${period.value}`}
                      ><strong>{tc(period.label)}</strong>
                      {#if period.value === 'this_week'}<small
                          >{tc('weekHours', {
                            approved: hoursText(stats.week_approved_minutes),
                            submitted: hoursText(stats.week_submitted_minutes),
                          })}</small
                        >{/if}</a
                    >
                  {/each}
                </div>
              </div>
            {:else if personTab === 'expenses'}
              <div class="person__panel" data-person-panel="expenses">
                <p class="person__muted">{tc('expensesIntro')}</p>
                <a
                  class="primary-button person__cta"
                  href={`${base}/app/expenses?view=overview&worker=${encodeURIComponent(workerId(worker))}`}
                  >{tc('openExpenses', { name: personName(worker) })}</a
                >
              </div>
            {:else if personTab === 'pay' && canManageTeam}
              <div class="person__panel" data-person-panel="pay">
                <PersonPayPanel
                  personId={workerId(worker)}
                  rules={personPayRules}
                  {locale}
                  today={todayIso}
                />
              </div>
            {:else if personTab === 'access' && canManageTeam}
              <div class="person__panel" data-person-panel="access" data-team-actions>
                <p class="person__muted">{tc('accessIntro')}</p>
                {#if failedStatusUserId === workerId(worker) && problemPayload}
                  <div data-status-problem>
                    <ProblemNotice
                      problem={problemPayload}
                      status={personName(worker)}
                      remedyLinks={{
                        review_user_access: {
                          label: portalText(problemLocale, 'problem.remedy.reviewUserAccess'),
                          href: `${base}/app/projects?view=team`,
                        },
                        review_owner_access: {
                          label: portalText(problemLocale, 'problem.remedy.reviewOwnerAccess'),
                          href: `${base}/app/projects?view=team`,
                        },
                        contact_owner: {
                          label: portalText(problemLocale, 'problem.remedy.contactOwner'),
                        },
                      }}
                    />
                  </div>
                {/if}
                {#if protectedOwner}
                  <p class="team-directory__owner-lock" role="status">
                    {translate(
                      'This is the unique Owner account. Role changes and portal offboarding are unavailable.',
                    )}
                  </p>
                {:else}
                  <div class="team-directory__editor" id={`team-editor-${workerId(worker)}`}>
                    <form
                      method="POST"
                      action={teamActionHref('updateWorkerProfile', workerId(worker))}
                      class="team-directory__form"
                      use:formValidation
                      data-person-profile-form
                    >
                      <h3>{translate('Edit profile')}</h3>
                      <input type="hidden" name="workerId" value={workerId(worker)} /><label
                        for={`worker-name-${workerId(worker)}`}>{translate('Name')}</label
                      ><input
                        id={`worker-name-${workerId(worker)}`}
                        name="name"
                        value={failedWorkerProfileValue(worker, 'name') ?? workerName(worker)}
                        required
                        maxlength="160"
                      /><label for={`worker-email-${workerId(worker)}`}>{translate('Email')}</label
                      ><input
                        id={`worker-email-${workerId(worker)}`}
                        name="email"
                        type="email"
                        value={failedWorkerProfileValue(worker, 'email') ?? value(worker, 'email')}
                        required
                      /><label for={`worker-role-${workerId(worker)}`}>{translate('Role')}</label
                      ><select id={`worker-role-${workerId(worker)}`} name="role" required data-person-role
                        >{#if !['worker', 'project_manager', 'finance_admin', 'auditor_read_only'].includes(profileRole)}<option
                            value={profileRole}
                            selected
                            disabled
                            >{portalText(problemLocale, 'problem.access.workerRoleInvalid')}</option
                          >{/if}<option value="worker" selected={profileRole === 'worker'}
                          >{translate('Worker')}</option
                        ><option value="project_manager" selected={profileRole === 'project_manager'}
                          >{translate('Project Manager')}</option
                        ><option value="finance_admin" selected={profileRole === 'finance_admin'}
                          >{translate('Finance Admin')}</option
                        ><option
                          value="auditor_read_only"
                          selected={profileRole === 'auditor_read_only'}
                          >{translate('Auditor (Read Only)')}</option
                        ></select
                      ><input
                        type="hidden"
                        name="joinedAt"
                        value={value(worker, 'created_at').slice(0, 10)}
                      />
                      {#if profileSaved}
                        <p class="team-directory__reset-done" role="status" data-profile-saved>
                          {portalText(problemLocale, 'action.access.workerProfile.updated')}
                        </p>
                      {/if}
                      <div class="team-directory__form-actions">
                        <button type="submit" class="team-directory__action"
                          >{translate('Save profile')}</button
                        >
                      </div>
                    </form>
                    <section class="person__mailbox" aria-label={tc('mailbox')}>
                      <h3>{tc('mailbox')}</h3>
                      <p>
                        <StatusBadge
                          variant={linked ? 'success' : 'neutral'}
                          text={linked ? tc('mailboxLinked') : tc('mailboxNone')}
                        />
                        {linked ? tc('mailboxLinkedHelp') : tc('mailboxNoneHelp')}
                      </p>
                      {#if mailboxDirectoryStatus === 'unavailable' || mailboxDirectoryStatus === 'error'}
                        <p class="person__notice" role="status" data-mail-unavailable>
                          {tc('mailServerUnavailable')}
                        </p>
                      {/if}
                    </section>
                  {#if value(worker, 'has_portal_access') === '1' && value(worker, 'status') === 'active' && workerId(worker) !== currentUserId}
                    {@const resetId = workerId(worker)}
                    <form
                      method="POST"
                      action={teamActionHref('resetUserPassword', resetId)}
                      class="team-directory__form team-directory__reset-password"
                      data-reset-password-form
                      use:formValidation
                      onsubmit={(event) => {
                        if (
                          !confirm(
                            translate(
                              'Set this new password? The old one stops working right away and the person is signed out.',
                            ),
                          )
                        )
                          event.preventDefault();
                      }}
                    >
                      <h3>{translate('Reset password')}</h3>
                      <p class="team-directory__form-help">
                        {(mailboxes ?? []).some((mailbox) => mailbox.portalUserId === resetId)
                          ? translate(
                              'Sets one new password for both the portal and Webmail. Give it to the person in a safe way.',
                            )
                          : mailboxDirectoryStatus === 'ready' ||
                              !isCompanyEmail(value(worker, 'email'))
                            ? translate(
                                'Sets a new portal password. Give it to the person in a safe way.',
                              )
                            : translate(
                                'Sets a new password. If this person has a Webmail mailbox, the same password is set there too.',
                              )}
                      </p>
                      <input type="hidden" name="userId" value={resetId} />
                      <label for={`reset-password-${resetId}`}>{translate('New password')}</label>
                      <div class="team-directory__password-row">
                        <input
                          id={`reset-password-${resetId}`}
                          name="password"
                          type={resetPasswordReveal[resetId] ? 'text' : 'password'}
                          autocomplete="new-password"
                          minlength="12"
                          maxlength="128"
                          value={resetPasswordValue[resetId] ?? ''}
                          oninput={(event) =>
                            (resetPasswordValue[resetId] = event.currentTarget.value)}
                          aria-describedby={`reset-password-help-${resetId}`}
                          required
                        /><button
                          type="button"
                          class="team-directory__action team-directory__action--quiet"
                          onclick={() => {
                            resetPasswordValue[resetId] = generateAccessPassword();
                            resetPasswordReveal[resetId] = true;
                          }}>{translate('Generate')}</button
                        >
                      </div>
                      <small id={`reset-password-help-${resetId}`}
                        >{translate('At least 12 characters.')}</small
                      >
                      <label class="team-directory__inline-check"
                        ><input
                          type="checkbox"
                          checked={resetPasswordReveal[resetId] ?? false}
                          onchange={(event) =>
                            (resetPasswordReveal[resetId] = event.currentTarget.checked)}
                        />{translate('Show password to copy')}</label
                      >
                      {#if problemPayload?.actionName === 'resetUserPassword' && problemPayload.values?.userId === resetId}
                        <div data-reset-password-problem>
                          <ProblemNotice problem={problemPayload} locale={problemLocale} />
                        </div>
                      {:else if resetPasswordDoneFor === resetId}
                        <p
                          class="team-directory__reset-done"
                          role="status"
                          data-reset-password-done
                        >
                          {portalText(problemLocale, resetPasswordDoneKey)}
                        </p>
                      {/if}
                      <button type="submit" class="team-directory__action"
                        >{translate('Save new password')}</button
                      >
                    </form>
                  {/if}
                    <section class="person__danger" aria-labelledby={`person-danger-${workerId(worker)}`}>
                      <h3 id={`person-danger-${workerId(worker)}`}>{tc('dangerTitle')}</h3>
                      {#if statusOutcome && statusOutcome.userId === workerId(worker) && statusOutcome.text}
                        <p
                          class="team-directory__row-feedback"
                          class:team-directory__row-feedback--error={statusOutcome.retry}
                          role="status"
                          data-status-mailbox-outcome={statusOutcome.outcome}
                        >
                          {statusOutcome.text}
                          {#if statusOutcome.retry}<a href="?view=team&directory=mailboxes&mstatus=offboarded"
                              >{mc('openMailboxes')}</a
                            >{/if}
                        </p>
                      {/if}
                      {#if workerId(worker) === currentUserId}
                        <p class="person__muted">—</p>
                      {:else if value(worker, 'status') === 'active'}
                        <p class="person__muted">{tc('suspendHelp')}</p>
                        <p class="person__muted">{tc('offboardHelp')}</p>
                        <div class="person__danger-actions">
                          <!-- T33: a styled confirm with the open-work checklist and a reason. -->
                          <details
                            class="person__confirm"
                            ontoggle={(event) => {
                              if ((event.currentTarget as HTMLDetailsElement).open)
                                void loadChecklist(workerId(worker));
                            }}
                          >
                            <summary class="team-directory__action team-directory__action--quiet"
                              >{tc('suspendOpen')}</summary
                            >
                            <form
                              method="POST"
                              action={teamActionHref('updateUserStatus', workerId(worker))}
                              use:formValidation
                            >
                              {@render offboardChecklistBlock(workerId(worker))}
                              <input type="hidden" name="userId" value={workerId(worker)} /><input
                                type="hidden"
                                name="status"
                                value="suspended"
                              />
                              <label
                                >{tc('statusReason')}<textarea name="reason" required maxlength="2000"
                                ></textarea></label
                              >
                              <button type="submit" class="team-directory__action"
                                >{tc('suspendConfirm')}</button
                              >
                            </form>
                          </details>
                          {@render offboardForm(worker, linked)}
                        </div>
                      {:else}
                        {#if value(worker, 'status') === 'suspended'}
                          <p class="person__muted">{tc('suspendedOffboardHelp')}</p>
                        {/if}
                        <form
                          method="POST"
                          action={teamActionHref('updateUserStatus', workerId(worker))}
                          use:formValidation
                        >
                          <input type="hidden" name="userId" value={workerId(worker)} /><input
                            type="hidden"
                            name="status"
                            value="active"
                          />
                          <input type="hidden" name="reason" value="Access restored by the owner" />
                          {#if linked && canonicalOwner}<label class="team-directory__inline-check"
                              ><input type="checkbox" name="mailbox" value="unblock" checked />{mc(
                                'alsoUnblock',
                              )}</label
                            >{/if}
                          <button type="submit" class="team-directory__action"
                            >{tc('restoreConfirm')}</button
                          >
                        </form>
                        {#if value(worker, 'status') === 'suspended'}
                          <!-- T33: offboarding is possible straight from the suspended state. -->
                          {@render offboardForm(worker, linked)}
                        {/if}
                      {/if}
                    </section>
                  </div>
                {/if}
                <details class="person__more">
                  <summary>{tc('moreSettings')}</summary>
                  <div class="person__more-body">
                    <h3>{tc('skillsAvailability')}</h3>
                    <p>
                      {translate('Availability')}: <strong>{availability(worker)}</strong>
                    </p>
                    {#if personSkills(worker).length}
                      <ul class="person__chips">
                        {#each personSkills(worker) as skill (skill)}<li>{skill}</li>{/each}
                      </ul>
                    {:else}
                      <p class="person__muted">{tc('skillsNone')}</p>
                    {/if}
                    <p class="person__inline-links">
                      <a href={`${base}/app/profile?worker=${workerId(worker)}`}>{tc('editSkills')}</a>
                      <a href={`${base}/app/planning?worker=${workerId(worker)}`}>{tc('planning')}</a>
                    </p>
                    {#if !protectedOwner}
                  {#if role === 'worker'}
                    {#if workforceSupplierInactiveProblem && failedWorkforceProfileId === workerId(worker) && problemPayload}
                      <div data-workforce-supplier-problem>
                        <ProblemNotice
                          problem={problemPayload}
                          locale={problemLocale}
                          status={workforceProblemContext(worker)}
                          remedyLinks={canonicalOwner
                            ? {
                                review_supplier_status: {
                                  label: portalText(
                                    problemLocale,
                                    'problem.remedy.reviewSupplierStatus',
                                  ),
                                  href: supplierStatusHref,
                                },
                              }
                            : {}}
                        />
                      </div>
                    {/if}
                    <form
                      method="POST"
                      action={teamActionHref('setWorkforceProfile', workerId(worker))}
                      class="team-directory__form"
                      use:formValidation
                    >
                      <input type="hidden" name="workerId" value={workerId(worker)} />
                      <label for={`workforce-profile-${workerId(worker)}`}
                        >{translate('Access profile')}</label
                      ><select
                        id={`workforce-profile-${workerId(worker)}`}
                        name="profile"
                        value={workforceProfileValue(worker)}
                        required
                        onchange={(event) =>
                          (selectedWorkforceProfiles[workerId(worker)] = event.currentTarget.value)}
                      >
                        <option value="standard">{translate('Worker')}</option>
                        <option value="supplier_coordinator"
                          >{translate('Supplier coordinator')}</option
                        >
                        <option value="external_technician"
                          >{translate('External technician')}</option
                        >
                      </select>
                      <label for={`workforce-supplier-${workerId(worker)}`}
                        >{translate('Supplier')}</label
                      ><select
                        id={`workforce-supplier-${workerId(worker)}`}
                        name="supplierId"
                        value={workforceSupplierValue(worker)}
                        onchange={(event) =>
                          (selectedWorkforceSuppliers[workerId(worker)] =
                            event.currentTarget.value)}
                        required={workforceProfileValue(worker) !== 'standard'}
                        aria-describedby={workforceProfileValue(worker) !== 'standard'
                          ? `workforce-supplier-cue-${workerId(worker)}`
                          : undefined}
                      >
                        <option value="">{translate('Select supplier')}</option>
                        {#if unavailableWorkforceSupplier(worker)}
                          <option value={unavailableWorkforceSupplier(worker)} disabled
                            >{portalText(
                              problemLocale,
                              'problem.access.workforceSupplierUnavailableOption',
                            )}</option
                          >
                        {/if}
                        {#each suppliers as supplier}<option value={String(supplier.id)}
                            >{supplier.name}</option
                          >{/each}
                      </select>
                      {#if workforceProfileValue(worker) !== 'standard'}
                        <p
                          class="team-directory__form-help"
                          id={`workforce-supplier-cue-${workerId(worker)}`}
                        >
                          {portalText(problemLocale, 'problem.access.workforceSupplierCue')}
                        </p>
                      {/if}
                      <button type="submit" class="team-directory__action"
                        >{translate('Save profile')}</button
                      >
                    </form>
                  {/if}
                    {/if}
                  </div>
                </details>
              </div>
            {/if}
          </article>
        {/each}
      {:else if personParam}
        <p class="team-directory__empty team-directory__empty--large" role="status">
          {tc('personNotFound')} <a href={directoryHref()}>{tc('back')}</a>
        </p>
      {:else}
        <div class="people__toolbar">
          {#if canManageTeam}
            <button
              type="button"
              class="primary-button"
              aria-expanded={creatingUser}
              aria-controls="team-create-panel"
              data-add-person
              onclick={() => {
                creatingUser = !creatingUser;
                fixingNames = false;
              }}>{creatingUser ? tc('closeAdd') : tc('addPerson')}</button
            >
            {#if nameFixCount > 0}
              <button
                type="button"
                class="secondary-button"
                aria-expanded={fixingNames}
                data-fix-names-open
                onclick={() => {
                  fixingNames = !fixingNames;
                  creatingUser = false;
                }}>{tc('fixNames', { count: nameFixCount })}</button
              >
            {/if}
          {/if}
        </div>
        {#if canManageTeam && createdAccount?.userId}
          <section class="team-directory__created" role="status" data-team-created>
            <strong>{tc('createdTitle')}</strong>
            {#if createdAccount.email}<p>{tc('createdSignIn', { email: createdAccount.email })}</p>{/if}
            <div class="team-directory__created-actions">
              {#if createdAccount.email}<button
                  type="button"
                  class="secondary-button"
                  onclick={() => void copyText(createdAccount.email)}>{tc('copyEmail')}</button
                >{/if}
              <a class="primary-button" href={personHref(createdAccount.userId)}>{tc('openPerson')}</a>
            </div>
          </section>
        {/if}
        {#if canManageTeam && (creatingUser || invitationPath)}
          <section
            class="team-directory__provisioning"
            id="team-create-panel"
            aria-labelledby="team-create-user-title"
          >
            <h2 id="team-create-user-title" class="visually-hidden">{translate('Create user access')}</h2>
          {#if creatingUser}
            {#if createLocal}
              <form
                method="POST"
                action="?view=team&/createLocalPortalUser"
                id="assistant-team-create"
                data-team-assistant-form
                use:dirtyFormGuard
                class="team-directory__create-form"
                autocomplete="off"
                use:formValidation
              >
                <label
                  >{translate('Full name')}<input
                    name="name"
                    bind:value={localName}
                    minlength="2"
                    maxlength="160"
                    autocomplete="off"
                    required
                  /></label
                >
                <label
                  >{translate('Email or username')}<input
                    name="email"
                    type="text"
                    inputmode="email"
                    autocapitalize="none"
                    spellcheck="false"
                    bind:value={localEmail}
                    placeholder={translate('first.last')}
                    aria-describedby="local-email-preview"
                    required
                  /><small id="local-email-preview" class="team-directory__email-preview"
                    >{#if normalizedLocalEmail}{translate('Account address')}:
                      <strong data-email-preview>{normalizedLocalEmail}</strong>{:else}{translate(
                        'Type a username like juan.perez and @j-aautomation.com is added for you.',
                      )}{/if}</small
                  ></label
                >
                <fieldset class="team-directory__roles" aria-describedby="local-role-help">
                  <legend>{translate('What will this person do?')}</legend>
                  {#each accessRoleChoices as choice (choice.value)}
                    <label class="team-directory__role-choice"
                      ><input
                        type="radio"
                        name="role"
                        value={choice.value}
                        bind:group={localRole}
                      /><span
                        ><strong>{translate(choice.label)}</strong><small
                          >{translate(choice.help)}</small
                        ></span
                      ></label
                    >
                  {/each}
                  <p id="local-role-help" class="team-directory__form-help">
                    {translate('You can assign projects after the account is created.')}
                  </p>
                </fieldset>
                {#if ['external_technician', 'supplier_coordinator'].includes(localRole)}<label
                    >{translate('Supplier')}<select
                      name="supplierId"
                      bind:value={localSupplierId}
                      required
                      ><option value="">{translate('Select supplier')}</option
                      >{#each suppliers as supplier}<option value={String(supplier.id)}
                          >{supplier.name}</option
                        >{/each}</select
                    ></label
                  >{/if}
                <div class="team-directory__password-field">
                  <label for="local-initial-password">{translate('Password')}</label>
                  <div class="team-directory__password-row">
                    <input
                      id="local-initial-password"
                      name="password"
                      type={revealPassword ? 'text' : 'password'}
                      bind:value={localPassword}
                      minlength="12"
                      maxlength="128"
                      autocomplete="new-password"
                      aria-describedby="local-password-help"
                      required
                    /><button
                      type="button"
                      class="team-directory__action team-directory__action--quiet"
                      onclick={generateLocalPassword}>{translate('Generate')}</button
                    ><button
                      type="button"
                      class="team-directory__action team-directory__action--quiet"
                      disabled={!localPassword}
                      onclick={async () => (passwordCopied = await copyText(localPassword))}
                      >{passwordCopied ? tc('passwordCopied') : tc('copyPassword')}</button
                    >
                  </div>
                  <small class="team-directory__password-once">{tc('passwordOnce')}</small>
                  <small id="local-password-help"
                    >{localCreatesMailbox
                      ? translate(
                          'At least 12 characters. The same password opens the portal and Webmail.',
                        )
                      : translate('At least 12 characters.')}</small
                  >
                  <label class="team-directory__inline-check"
                    ><input type="checkbox" bind:checked={revealPassword} />{translate(
                      'Show password to copy',
                    )}</label
                  >
                </div>
                {#if localEmailIsCompany}
                  <label class="team-directory__mailbox-choice">
                    <input
                      type="checkbox"
                      name="createMailbox"
                      bind:checked={localCreateMailbox}
                      aria-describedby="local-mailbox-help"
                    />
                    <span
                      >{translate('Also create the Webmail mailbox')}<small id="local-mailbox-help"
                        >{translate(
                          'Uncheck only if this person already has a mailbox or must not have one.',
                        )}</small
                      ></span
                    >
                  </label>
                {:else if normalizedLocalEmail}
                  <p class="team-directory__form-help team-directory__create-wide">
                    {translate('External address: portal access only, no Webmail mailbox.')}
                  </p>
                {/if}
                <details class="team-directory__create-more team-directory__create-wide">
                  <summary>{translate('More details (optional)')}</summary>
                  <div class="team-directory__create-more-fields">
                    <label
                      >{translate('Existing person (optional)')}<select
                        name="existingUserId"
                        value={existingUserId}
                        onchange={(event) =>
                          selectExistingPerson((event.currentTarget as HTMLSelectElement).value)}
                      >
                        <option value="">{translate('Create a new person')}</option>
                        {#each existingUserCandidates as worker}<option value={workerId(worker)}
                            >{workerName(worker)} · {value(worker, 'email') ||
                              translate('email required')}</option
                          >{/each}
                      </select></label
                    >
                    <label
                      >{translate('Phone')}<input
                        name="phone"
                        bind:value={localPhone}
                        maxlength="80"
                      /></label
                    >
                    <label
                      >{translate('Company')}<input
                        name="company"
                        bind:value={localCompany}
                        maxlength="200"
                      /></label
                    >
                    <label
                      >{translate('Contact name')}<input
                        name="contactName"
                        bind:value={localContactName}
                        maxlength="160"
                      /></label
                    >
                    <label class="team-directory__create-wide"
                      >{translate('Notes')}<textarea
                        name="notes"
                        bind:value={localNotes}
                        maxlength="5000"
                      ></textarea></label
                    >
                  </div>
                </details>
                <div class="team-directory__create-actions team-directory__create-wide">
                  <button type="submit" class="team-directory__action team-directory__create-submit"
                    >{translate('Create user')}</button
                  >
                  <button
                    type="button"
                    class="team-directory__link-button"
                    onclick={() => (createLocal = false)}
                    >{translate('Send an invitation link instead')}</button
                  >
                </div>
              </form>
            {:else}
              <form
                id="team-create-user-form"
                data-team-assistant-form
                use:dirtyFormGuard
                method="POST"
                action="?view=team&/createInvitation"
                class="team-directory__create-form"
                use:formValidation
              >
                <label for="team-invite-email">{translate('Email or username')}</label><input
                  id="team-invite-email"
                  name="email"
                  type="text"
                  inputmode="email"
                  autocapitalize="none"
                  spellcheck="false"
                  autocomplete="email"
                  placeholder={translate('first.last')}
                  bind:value={inviteEmail}
                  aria-describedby="team-invite-email-preview"
                  required
                /><small id="team-invite-email-preview" class="team-directory__email-preview"
                  >{#if normalizedInviteEmail}{translate('Account address')}:
                    <strong data-email-preview>{normalizedInviteEmail}</strong>{:else}{translate(
                      'Type a username like juan.perez and @j-aautomation.com is added for you.',
                    )}{/if}</small
                >
                <label for="team-invite-role">{translate('Access role')}</label><select
                  id="team-invite-role"
                  name="role"
                  required
                  ><option value="worker">{translate('Worker')}</option><option
                    value="project_manager">{translate('Project Manager')}</option
                  ><option value="finance_admin">{translate('Finance Admin')}</option><option
                    value="auditor_read_only">{translate('Auditor (Read Only)')}</option
                  ></select
                >
                <label for="team-invite-expiry">{translate('Invitation expires')}</label><select
                  id="team-invite-expiry"
                  name="expiresInDays"
                  required
                  ><option value="1">1 {translate('day')}</option><option value="3"
                    >3 {translate('days')}</option
                  ><option value="7" selected>7 {translate('days')}</option><option value="14"
                    >14 {translate('days')}</option
                  ></select
                >
                <div class="team-directory__create-explainer">
                  <strong>{translate('What happens next')}</strong>
                  <ol>
                    <li>{translate('The portal creates a single-use activation link.')}</li>
                    <li>
                      {translate('Send the link to the invited person through a trusted channel.')}
                    </li>
                    <li>
                      {translate(
                        'They choose their name and password before the account becomes active.',
                      )}
                    </li>
                  </ol>
                </div>
                <label
                  ><span>{translate('Send the invitation email to this address?')}</span>
                  <select name="emailChoice" required>
                    <option value="">{translate('Choose an option')}</option>
                    <option value="no">{translate('No, do not send email')}</option>
                    <option value="yes">{translate('Yes, send this email')}</option>
                  </select></label
                >
                <button type="submit" class="team-directory__action team-directory__create-submit"
                  >{translate('Create invitation')}</button
                >
                <button
                  type="button"
                  class="team-directory__link-button team-directory__create-wide"
                  onclick={() => (createLocal = true)}
                  >{translate('Set a password myself instead')}</button
                >
              </form>
            {/if}
          {/if}
          {#if invitationPath}
            <div class="team-directory__invitation-result" role="status" data-invitation-result>
              <div>
                <strong>{translate('Invitation ready')}</strong>
                <p>
                  {translate(
                    'Copy this private activation link and send it to the invited person.',
                  )}
                </p>
                <a href={invitationPath}>{invitationPath}</a>
              </div>
              <button type="button" class="team-directory__action" onclick={copyInvitation}
                >{invitationCopied
                  ? translate('Copied')
                  : translate('Copy activation link')}</button
              >
            </div>
          {/if}
          </section>
        {/if}
        {#if canManageTeam && fixingNames}
          <FixNamesPanel workers={nameFixWorkers ?? workers} {locale} onclose={() => (fixingNames = false)} />
        {/if}

        <form
          class="people__filters"
          role="search"
          method="GET"
          action=""
          data-sveltekit-keepfocus
          data-sveltekit-noscroll
          data-sveltekit-replacestate
          data-people-filters
          onsubmit={(event) => {
            if (!peopleDirectory) event.preventDefault();
          }}
        >
          <input type="hidden" name="view" value="team" />
          {#if $page.url.searchParams.get('lang')}<input
              type="hidden"
              name="lang"
              value={$page.url.searchParams.get('lang')}
            />{/if}
          <label class="people__search"
            >{tc('search')}<input
              id="team-search"
              name="pq"
              bind:value={search}
              type="search"
              placeholder={tc('searchPlaceholder')}
              data-people-search
              oninput={(event) => submitPeopleFilters(event.currentTarget.form, 400)}
            /></label
          >
          <label
            >{tc('role')}<select
              name="prole"
              bind:value={roleFilter}
              data-people-role
              onchange={(event) => submitPeopleFilters(event.currentTarget.form)}
            >
              <option value="">{tc('allRoles')}</option>
              {#each roleOptions as option (option)}
                <option value={option}>{roleLabel(option)}</option>
              {/each}
            </select></label
          >
          <label
            >{tc('status')}<select
              name="pstatus"
              bind:value={statusFilter}
              data-people-status
              onchange={(event) => submitPeopleFilters(event.currentTarget.form)}
            >
              <option value="active">{tc('statusActive')}</option>
              <option value="inactive">{tc('statusInactive')}</option>
              <option value="all">{tc('statusAll')}</option>
            </select></label
          >
          <label
            >{tc('project')}<select
              id="team-project-filter"
              name="project"
              value={directoryProjectId}
              onchange={(event) => {
                if (peopleDirectory) submitPeopleFilters(event.currentTarget.form);
                else setDirectoryProject(event.currentTarget.value);
              }}
            >
              <option value="">{tc('allProjects')}</option>
              {#each peopleProjectOptions as project (project.id)}
                <option value={project.id}>{project.name}</option>
              {/each}
            </select></label
          >
          <noscript><button type="submit" class="secondary-button">{mc('apply')}</button></noscript>
          {#if search || roleFilter || statusFilter !== 'active' || directoryProjectId}
            {#if peopleDirectory}
              <a class="secondary-button people__clear" href={`?${linkParams().toString()}`}
                >{tc('clear')}</a
              >
            {:else}
              <button type="button" class="secondary-button people__clear" onclick={clearPeopleFilters}
                >{tc('clear')}</button
              >
            {/if}
          {/if}
        </form>

        {#if shownInvitations.length}
          <section
            class="people__invitations"
            aria-labelledby="team-invitations-title"
            data-pending-invitations
          >
            <h3 id="team-invitations-title">
              {tc('invitesTitle')}
              <span class="people__invitations-count">{shownInvitations.length}</span>
            </h3>
            <p class="person__muted">{tc('invitesIntro')}</p>
            <ul>
              {#each shownInvitations as invitation (invitation.id)}
                <li class="people__invitation" data-invitation-id={invitation.id}>
                  <span class="people__invitation-who">
                    <strong>{invitation.email}</strong>
                    <small>
                      {roleLabel(invitation.role)} ·
                      {#if invitation.expired}
                        <StatusBadge
                          variant="warning"
                          text={tc('inviteExpired', { date: invitationDate(invitation.expiresAt) })}
                        />
                      {:else}
                        {tc('inviteExpires', { date: invitationDate(invitation.expiresAt) })}
                      {/if}
                    </small>
                  </span>
                  <span class="people__invitation-actions">
                    <form
                      method="POST"
                      action="?view=team&/reissueInvitation"
                      use:enhance={submitInvitationAction}
                    >
                      <input type="hidden" name="invitationId" value={invitation.id} />
                      <button
                        type="submit"
                        class="secondary-button"
                        disabled={invitationBusyId === invitation.id}>{tc('inviteNewLink')}</button
                      >
                    </form>
                    {#if confirmRevokeId === invitation.id}
                      <form
                        method="POST"
                        action="?view=team&/revokeInvitation"
                        use:enhance={submitInvitationAction}
                      >
                        <input type="hidden" name="invitationId" value={invitation.id} />
                        <button
                          type="submit"
                          class="team-directory__action team-directory__action--danger"
                          disabled={invitationBusyId === invitation.id}
                          >{tc('inviteRevokeConfirm')}</button
                        >
                      </form>
                      <button
                        type="button"
                        class="secondary-button"
                        onclick={() => (confirmRevokeId = '')}>{tc('closeAdd')}</button
                      >
                    {:else}
                      <button
                        type="button"
                        class="secondary-button"
                        onclick={() => (confirmRevokeId = invitation.id)}
                        >{tc('inviteRevoke')}</button
                      >
                    {/if}
                  </span>
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        <p class="people__count" aria-live="polite" data-people-count>
          {#if peopleRange}
            {peopleRange.total === 0
              ? tc('shown', { count: 0 })
              : mc('showingRange', {
                  from: peopleRange.from,
                  to: peopleRange.to,
                  total: peopleRange.total,
                })}
          {:else}
            {peopleRows.length === 1 ? tc('shownOne') : tc('shown', { count: peopleRows.length })}
          {/if}
        </p>
        {#if peopleRows.length === 0}
          <p class="team-directory__empty team-directory__empty--large">{tc('empty')}</p>
        {:else}
          <div class="people__table" role="table" aria-label={tc('title')}>
            <div class="people__row people__row--head" role="row">
              <span role="columnheader">{tc('colPerson')}</span>
              <span role="columnheader">{tc('role')}</span>
              <span role="columnheader">{tc('colProjects')}</span>
              <span role="columnheader">{tc('colWeek')}</span>
              {#if canManageTeam}<span role="columnheader">{tc('mailbox')}</span>{/if}
            </div>
            {#each shownPeople as worker (workerId(worker))}
              {@const current = currentAssignments(worker)}
              {@const stats = statsFor(worker)}
              <div class="people__row" role="row" data-worker-id={workerId(worker)}>
                <span class="people__person" role="cell">
                  <span class="people__avatar" aria-hidden="true">{personInitials(worker.name, worker.email)}</span>
                  <span class="people__name">
                    <a href={personHref(workerId(worker))} data-person-link>{personName(worker)}</a>
                    <small>{value(worker, 'email')}</small>
                  </span>
                </span>
                <span role="cell" class="people__role">
                  {workerIsProtectedOwner(worker)
                    ? translate('Unique Owner')
                    : roleLabel(accessRoleForWorker(worker))}
                  {#if value(worker, 'status') !== 'active'}
                    <StatusBadge variant={statusVariant(worker)} text={statusLabel(value(worker, 'status'))} />
                  {/if}
                </span>
                <span role="cell" class="people__projects">
                  {#if current.length === 0}
                    <small class="person__muted">{tc('noProjects')}</small>
                  {:else}
                    {#each current.slice(0, 1) as assignment (value(assignment, 'id'))}
                      <span class="people__chip" title={value(assignment, 'project_name') || value(assignment, 'project_number')}>{value(assignment, 'project_name') || value(assignment, 'project_number')}</span>
                    {/each}
                    {#if current.length > 1}<small>{tc('moreProjects', { count: current.length - 1 })}</small>{/if}
                  {/if}
                </span>
                <span role="cell" class="people__week">
                  {#if stats.week_approved_minutes + stats.week_submitted_minutes > 0}
                    {tc('weekHours', {
                      approved: hoursText(stats.week_approved_minutes),
                      submitted: hoursText(stats.week_submitted_minutes),
                    })}
                  {:else}
                    <small class="person__muted">{tc('weekNone')}</small>
                  {/if}
                </span>
                {#if canManageTeam}
                  <span role="cell" class="people__mailbox" data-mailbox-linked={mailboxLinked(worker) ? '1' : '0'}>
                    {#if mailboxLinked(worker)}<span class="people__mail-ok" title={tc('mailboxLinked')}
                        ><span aria-hidden="true">✓</span> {tc('mailbox')}</span
                      >{:else}<small class="person__muted">{tc('mailboxNone')}</small>{/if}
                  </span>
                {/if}
              </div>
            {/each}
          </div>
          {#if peopleDirectory && peopleDirectory.pageCount > 1}
            {@render pager(peopleDirectory.page, peopleDirectory.pageCount, peoplePageHref, 'people')}
          {:else if peopleRows.length > shownPeople.length}
            <button type="button" class="secondary-button people__more" onclick={() => (peopleLimit += 50)}
              >{tc('showMore', { count: Math.min(50, peopleRows.length - shownPeople.length) })}</button
            >
          {/if}
        {/if}
      {/if}
    </section>
  {:else if canManageMailboxDirectory}
    <div
      id="team-panel-mailboxes"
      role="tabpanel"
      aria-labelledby="team-tab-mailboxes"
      class="team-directory__mailboxes"
      data-mailbox-directory-state={mailboxDirectoryState}
      data-mailbox-source={mailboxDirectory?.source ?? 'none'}
    >
      <div class="team-directory__provisioning-heading">
        <div>
          <h2>{mc('mailboxesTitle')}</h2>
          <p>{mc('mailboxesIntro')}</p>
        </div>
        <button
          type="button"
          class="team-directory__action"
          aria-expanded={creatingMailbox}
          aria-controls="create-mailbox-sheet-form"
          onclick={() => (creatingMailbox = true)}>{translate('+ Create email account')}</button
        >
      </div>
      {#if mailboxDirectoryState === 'loading'}<div
          class="team-directory__directory-state"
          role="status"
          aria-live="polite"
        >
          <span class="team-directory__state-mark" aria-hidden="true">…</span><strong
            >{translate('Loading live mailbox directory')}</strong
          >
          <p>{translate('Reading the current Stalwart account list. Please wait.')}</p>
        </div>
      {:else if (mailboxDirectoryState === 'unavailable' || mailboxDirectoryState === 'error') && !mailboxDirectory}<div
          class="team-directory__directory-state team-directory__directory-state--error"
          role="alert"
          aria-live="assertive"
        >
          <span class="team-directory__state-mark" aria-hidden="true">!</span><strong
            >{mailboxDirectoryState === 'error'
              ? translate('Mailbox directory error')
              : translate('Mailbox directory unavailable')}</strong
          >
          <p>
            {mailboxDirectoryError ||
              translate('Stalwart did not return a live directory. No account is shown as ready.')}
          </p>
        </div>
      {:else}<div class="team-directory__mailbox-workspace">
          {#if mailboxDegraded}<div
              class="team-directory__degraded"
              role="status"
              aria-live="polite"
              data-mailbox-degraded
            >
              <strong>{mc('degradedTitle')}</strong>
              <p>{mc('degradedBody')}</p>
            </div>{/if}
          <form
            class="team-directory__controls team-directory__mailbox-toolbar"
            role="search"
            method="GET"
            action=""
            data-sveltekit-keepfocus
            data-sveltekit-noscroll
            data-sveltekit-replacestate
            data-mailbox-filters
          >
            <input type="hidden" name="view" value="team" /><input
              type="hidden"
              name="directory"
              value="mailboxes"
            />{#if $page.url.searchParams.get('lang')}<input
                type="hidden"
                name="lang"
                value={$page.url.searchParams.get('lang')}
              />{/if}
            <div class="team-directory__field">
              <label for="mailbox-search">{mc('searchMailboxes')}</label><input
                id="mailbox-search"
                name="mq"
                bind:value={mailboxSearch}
                type="search"
                placeholder={mc('searchMailboxesPlaceholder')}
                oninput={(event) => submitMailboxFilters(event.currentTarget.form, 400)}
              />
            </div>
            <div class="team-directory__field">
              <label for="mailbox-filter">{mc('show')}</label><select
                id="mailbox-filter"
                name="mstatus"
                bind:value={mailboxStatus}
                class="team-directory__filter-select"
                onchange={(event) => submitMailboxFilters(event.currentTarget.form)}
                >{#each mailboxStatusOptions as option (option.value)}<option
                    value={option.value}
                    disabled={option.disabled}>{option.label}</option
                  >{/each}</select
              >
            </div>
            <noscript><button type="submit" class="team-directory__action">{mc('apply')}</button></noscript>
          </form>
          <p class="team-directory__mailbox-scope" aria-live="polite" data-mailbox-count>
            {#if mailboxRange && mailboxRange.total > 0}{mc('showingRange', {
                from: mailboxRange.from,
                to: mailboxRange.to,
                total: mailboxRange.total,
              })}{:else}{mc('mailboxScope', { count: mailboxRange?.total ?? 0 })}{/if}
            {#if mailboxDirectory && mailboxDirectory.stillSigningIn > 0 && mailboxDirectory.status !== 'offboarded'}
              <span class="team-directory__attention" data-still-signing-in
                >· {mc('stillSigningIn', { count: mailboxDirectory.stillSigningIn })}
                <a href={mailboxFilterHref('offboarded')}>{mc('stillSigningInShow')}</a></span
              >
            {/if}
          </p>
          {#if selectedMailboxes.size > 0}<form
              method="POST"
              action="?view=team&/provisionMailboxUsers"
              class="team-directory__bulk-bar"
              data-mailbox-action="provisionMailboxUsers"
              use:enhance={enhanceMailboxForm}
              use:formValidation
              aria-busy={mailboxAction.status === 'pending' &&
                mailboxAction.action === 'provisionMailboxUsers'}
            >
              {#each Array.from(selectedMailboxes) as selectedEmail}<input
                  type="hidden"
                  name="emails"
                  value={selectedEmail}
                />{/each}
              <div class="team-directory__bulk-info">
                <strong>{selectedMailboxes.size}</strong>
                {translate('available accounts selected')}
              </div>
              <div class="team-directory__bulk-controls">
                <label class="team-directory__inline-label" for="bulk-provision-role"
                  ><span>{translate('Assign role')}</span><select
                    id="bulk-provision-role"
                    name="role"
                    bind:value={targetProvisionRole}
                    ><option value="worker">{translate('Worker')}</option><option
                      value="project_manager">{translate('Project Manager')}</option
                    ><option value="finance_admin">{translate('Finance Admin')}</option></select
                  ></label
                ><button
                  type="submit"
                  class="team-directory__action"
                  disabled={mailboxAction.status === 'pending'}
                  >{mailboxAction.status === 'pending' &&
                  mailboxAction.action === 'provisionMailboxUsers'
                    ? translate('Provisioning…')
                    : translate('Provision selected in portal')}</button
                ><button
                  type="button"
                  class="team-directory__action team-directory__action--quiet"
                  onclick={clearMailboxSelection}>{translate('Deselect all')}</button
                >
              </div>
            </form>{/if}
          {#if filteredMailboxes.length === 0}<p
              class="team-directory__empty team-directory__empty--large"
              role="status"
            >
              {mc('noMailboxes')}
            </p>{:else}
            {#snippet mailboxControls(mailbox: MailboxRow, idPrefix: string)}
              {@const email = mailboxEmail(mailbox)}
              {@const accountId = stalwartAccountId(mailbox)}
              {@const fieldKey = `${idPrefix}-${mailboxUsername(mailbox)}`}
              {#if mailboxIsEligible(mailbox)}
                <form
                  method="POST"
                  action="?view=team&/provisionMailboxUsers"
                  class="team-directory__inline-provision"
                  data-mailbox-action="provisionMailboxUsers"
                  use:enhance={enhanceMailboxForm}
                  use:formValidation
                >
                  <input type="hidden" name="emails" value={email} />
                  <input type="hidden" name="role" value="worker" />
                  <button
                    type="submit"
                    class="team-directory__action"
                    disabled={mailboxAction.status === 'pending'}
                  >
                    {mailboxAction.status === 'pending' &&
                    mailboxAction.action === 'provisionMailboxUsers'
                      ? translate('Activating…')
                      : translate('Activate in portal')}
                  </button>
                </form>
              {/if}
              <details
                class="team-directory__mailbox-management"
                open={mailboxAction.email === email ||
                  (['changeMailboxRole', 'deprovisionMailboxUser', 'reactivateMailboxUser'].includes(
                  problemPayload?.actionName ?? '',
                ) &&
                  String(problemPayload?.values?.portalUserId ?? '') ===
                    String(mailbox.portalUserId ?? '')) ||
                  (['updateMailboxPassword', 'destroyMailboxAccount'].includes(
                    problemPayload?.actionName ?? '',
                  ) &&
                    String(problemPayload?.values?.stalwartAccountId ?? '') === accountId)}
              >
                <summary class="team-directory__action team-directory__action--quiet"
                  >{translate('Manage mailbox')}</summary
                >
                <div class="team-directory__mailbox-management-body">
                  {#if mailboxAction.email === email && mailboxAction.status !== 'idle'}<p
                      class="team-directory__row-feedback"
                      class:team-directory__row-feedback--error={mailboxAction.status === 'error' ||
                        mailboxAction.warning}
                      role={mailboxAction.status === 'error' ? 'alert' : 'status'}
                      data-mailbox-row-feedback={mailboxAction.status}
                    >
                      {mailboxAction.message}
                    </p>{/if}
                  {#if isOwnerMailbox(mailbox)}<div
                      class="team-directory__owner-lock"
                      role="status"
                    >
                      <strong>{translate('Unique Owner — protected')}</strong>
                      <p>
                        {translate(
                          'This is the unique Owner mailbox. It cannot be re-roled, offboarded or deleted from this screen.',
                        )}
                      </p>
                      {#if accountId}
                        <form
                          method="POST"
                          action="?view=team&directory=mailboxes&/updateMailboxPassword"
                          class="team-directory__protected-form"
                          data-mailbox-action="updateMailboxPassword"
                          use:enhance={enhanceMailboxForm}
                          use:formValidation
                          onsubmit={(event) => requireExactConfirmation(event, email)}
                        >
                          <input
                            type="hidden"
                            name="idempotencyKey"
                            value={externalCommandKey('updateMailboxPassword', accountId)}
                          />
                          <h3>{translate('Change Owner Webmail password')}</h3>
                          <input type="hidden" name="stalwartAccountId" value={accountId} />
                          <input type="hidden" name="email" value={email} />
                          <label for={`owner-mailbox-password-${fieldKey}`}
                            >{translate('New Webmail password')}</label
                          >
                          <input
                            id={`owner-mailbox-password-${fieldKey}`}
                            name="password"
                            type="password"
                            autocomplete="new-password"
                            minlength="12"
                            required
                          />
                          <label for={`owner-mailbox-password-reason-${fieldKey}`}
                            >{translate('Reason for password change')}</label
                          >
                          <textarea
                            id={`owner-mailbox-password-reason-${fieldKey}`}
                            name="reason"
                            value={failedExternalValue(
                              'updateMailboxPassword',
                              accountId,
                              'reason',
                            )}
                            rows="2"
                            minlength="5"
                            required
                          ></textarea>
                          <label for={`owner-mailbox-password-confirm-${fieldKey}`}
                            >{translate('Type the exact email to confirm')}</label
                          >
                          <input
                            id={`owner-mailbox-password-confirm-${fieldKey}`}
                            name="confirmation"
                            value={failedExternalValue(
                              'updateMailboxPassword',
                              accountId,
                              'confirmation',
                            )}
                            type="email"
                            autocomplete="off"
                            pattern={confirmationPattern(email)}
                            required
                          />
                          <button
                            type="submit"
                            class="team-directory__action"
                            disabled={mailboxAction.status === 'pending'}
                          >
                            {translate('Change Webmail password')}
                          </button>
                        </form>
                      {/if}
                    </div>
                  {:else}{#if mailboxPortalInactive(mailbox)}<form
                        method="POST"
                        action="?view=team&directory=mailboxes&/reactivateMailboxUser"
                        class="team-directory__protected-form team-directory__reactivate"
                        data-mailbox-action="reactivateMailboxUser"
                        use:enhance={enhanceMailboxForm}
                        use:formValidation
                        onsubmit={(event) => {
                          const form = event.currentTarget as HTMLFormElement;
                          const chosen = String(new FormData(form).get('role') ?? 'worker');
                          if (!confirm(mc('reactivateConfirm', { email, role: roleLabel(chosen) })))
                            event.preventDefault();
                        }}
                      >
                        <h3>{mc('reactivateTitle')}</h3>
                        <p class="team-directory__portal-status" data-portal-status>
                          <strong>{mailboxPortalStatusLabel(mailbox)}</strong>
                        </p>
                        <p class="team-directory__form-help">{mc('reactivateHelp')}</p>
                        <input type="hidden" name="email" value={email} /><input
                          type="hidden"
                          name="portalUserId"
                          value={mailbox.portalUserId ?? ''}
                        />
                        <div class="team-directory__reactivate-row">
                          <label for={`mailbox-reactivate-role-${fieldKey}`}>{mc('reactivateAs')}</label
                          ><select
                            id={`mailbox-reactivate-role-${fieldKey}`}
                            name="role"
                            value={failedMailboxValue('reactivateMailboxUser', mailbox, 'role') ||
                              (['worker', 'project_manager', 'finance_admin'].includes(mailboxRole(mailbox))
                                ? mailboxRole(mailbox)
                                : 'worker')}
                            required
                            ><option value="worker">{translate('Worker')}</option><option
                              value="project_manager">{translate('Project Manager')}</option
                            ><option value="finance_admin">{translate('Finance Admin')}</option
                            ></select
                          ><button
                            type="submit"
                            class="team-directory__action"
                            disabled={mailboxAction.status === 'pending'}
                            >{mc('reactivateSave')}</button
                          >
                        </div>
                        {#if mailbox.signInBlocked !== false}<label class="team-directory__inline-check"
                            ><input
                              type="checkbox"
                              name="unblock"
                              value="1"
                              checked
                            />{mc('alsoUnblock')}</label
                          >{/if}
                      </form>{:else if mailbox.isProvisioned}<form
                        method="POST"
                        action="?view=team&directory=mailboxes&/changeMailboxRole"
                        class="team-directory__protected-form"
                        data-mailbox-action="changeMailboxRole"
                        use:enhance={enhanceMailboxForm}
                        use:formValidation
                        onsubmit={(event) => requireExactConfirmation(event, email)}
                      >
                        <h3>{translate('Change portal role')}</h3>
                        <input type="hidden" name="email" value={email} /><input
                          type="hidden"
                          name="portalUserId"
                          value={mailbox.portalUserId ?? ''}
                        /><label for={`mailbox-role-${fieldKey}`}>{translate('New role')}</label
                        ><select
                          id={`mailbox-role-${fieldKey}`}
                          name="role"
                          value={failedMailboxValue('changeMailboxRole', mailbox, 'role') ||
                            mailboxRole(mailbox)}
                          required
                          ><option value="worker">{translate('Worker')}</option><option
                            value="project_manager">{translate('Project Manager')}</option
                          ><option value="finance_admin">{translate('Finance Admin')}</option
                          ></select
                        ><label for={`mailbox-role-reason-${fieldKey}`}
                          >{translate('Reason for role change')}</label
                        ><textarea
                          id={`mailbox-role-reason-${fieldKey}`}
                          name="reason"
                          value={failedMailboxValue('changeMailboxRole', mailbox, 'reason')}
                          rows="2"
                          minlength="5"
                          required
                        ></textarea><label for={`mailbox-role-confirm-${fieldKey}`}
                          >{translate('Type the exact email to confirm')}</label
                        ><input
                          id={`mailbox-role-confirm-${fieldKey}`}
                          name="confirmation"
                          value={failedMailboxValue('changeMailboxRole', mailbox, 'confirmation')}
                          type="email"
                          autocomplete="off"
                          pattern={confirmationPattern(email)}
                          required
                          aria-describedby={`mailbox-role-confirm-help-${fieldKey}`}
                        /><small id={`mailbox-role-confirm-help-${fieldKey}`}>{email}</small><button
                          type="submit"
                          class="team-directory__action"
                          disabled={mailboxAction.status === 'pending'}
                          >{translate('Save role')}</button
                        >
                      </form>{:else}<p class="team-directory__form-help">
                        {translate('Provision this mailbox first to manage its portal role.')}
                      </p>{/if}
                    {#if accountId}<div class="team-directory__protected-form" data-mailbox-sign-in>
                        <h3>{mc('signInTitle')}</h3>
                        {#if mailbox.signInBlocked === true}
                          <p class="team-directory__form-help">{mc('signInBlockedHelp')}</p>
                          <form
                            method="POST"
                            action="?view=team&directory=mailboxes&/setMailboxSignIn"
                            data-mailbox-action="setMailboxSignIn"
                            use:enhance={enhanceMailboxForm}
                            onsubmit={(event) => {
                              if (!confirm(mc('unblockConfirm', { email }))) event.preventDefault();
                            }}
                          >
                            <input type="hidden" name="stalwartAccountId" value={accountId} /><input
                              type="hidden"
                              name="email"
                              value={email}
                            /><input type="hidden" name="blocked" value="0" /><button
                              type="submit"
                              class="team-directory__action team-directory__action--quiet"
                              disabled={mailboxAction.status === 'pending'}
                              >{mc('unblockSignIn')}</button
                            >
                          </form>
                        {:else if mailbox.signInBlocked === false}
                          <p
                            class="team-directory__form-help"
                            class:team-directory__form-help--attention={mailboxPortalInactive(mailbox)}
                          >
                            {mailboxPortalInactive(mailbox) ? mc('signInOpenLeftHelp') : mc('signInOpenHelp')}
                          </p>
                          <form
                            method="POST"
                            action="?view=team&directory=mailboxes&/setMailboxSignIn"
                            data-mailbox-action="setMailboxSignIn"
                            use:enhance={enhanceMailboxForm}
                            onsubmit={(event) => {
                              if (!confirm(mc('blockConfirm', { email }))) event.preventDefault();
                            }}
                          >
                            <input type="hidden" name="stalwartAccountId" value={accountId} /><input
                              type="hidden"
                              name="email"
                              value={email}
                            /><input type="hidden" name="blocked" value="1" /><button
                              type="submit"
                              class={mailboxPortalInactive(mailbox)
                                ? 'team-directory__action'
                                : 'team-directory__action team-directory__action--quiet'}
                              disabled={mailboxAction.status === 'pending'}
                              >{mc('blockSignIn')}</button
                            >
                          </form>
                        {:else}
                          <p class="team-directory__form-help">{mc('signInUnknownHelp')}</p>
                        {/if}
                      </div>{/if}
                    <details class="team-directory__mailbox-more">
                      <summary>{mc('moreMailboxActions')}</summary>
                      {#if mailbox.isProvisioned && !mailboxPortalInactive(mailbox)}<form
                        method="POST"
                        action="?view=team&directory=mailboxes&/deprovisionMailboxUser"
                        class="team-directory__protected-form team-directory__protected-form--danger"
                        data-mailbox-action="deprovisionMailboxUser"
                        use:enhance={enhanceMailboxForm}
                        use:formValidation
                        onsubmit={(event) => requireExactConfirmation(event, email)}
                      >
                        <h3>{translate('Remove portal access')}</h3>
                        <p class="team-directory__danger-copy">
                          {translate(
                            'This archives the portal access and revokes the user session. It does not delete the Stalwart mailbox.',
                          )}
                        </p>
                        <input type="hidden" name="email" value={email} /><input
                          type="hidden"
                          name="portalUserId"
                          value={mailbox.portalUserId ?? ''}
                        /><fieldset class="team-directory__mailbox-choice">
                          <legend>{mc('signInTitle')}</legend>
                          <label
                            ><input type="radio" name="mailbox" value="block" checked />{mc(
                              'mailboxChoiceBlock',
                            )}</label
                          ><label
                            ><input type="radio" name="mailbox" value="keep" />{mc(
                              'mailboxChoiceKeep',
                            )}</label
                          >
                          <small>{mc('mailboxChoiceHelp')}</small>
                        </fieldset><label for={`mailbox-offboard-reason-${fieldKey}`}
                          >{translate('Reason for removing access')}</label
                        ><textarea
                          id={`mailbox-offboard-reason-${fieldKey}`}
                          name="reason"
                          value={failedMailboxValue('deprovisionMailboxUser', mailbox, 'reason')}
                          rows="2"
                          minlength="5"
                          required
                        ></textarea><label for={`mailbox-offboard-confirm-${fieldKey}`}
                          >{translate('Type the exact email to confirm')}</label
                        ><input
                          id={`mailbox-offboard-confirm-${fieldKey}`}
                          name="confirmation"
                          value={failedMailboxValue(
                            'deprovisionMailboxUser',
                            mailbox,
                            'confirmation',
                          )}
                          type="email"
                          autocomplete="off"
                          pattern={confirmationPattern(email)}
                          required
                        /><button
                          type="submit"
                          class="team-directory__action team-directory__action--danger"
                          disabled={mailboxAction.status === 'pending'}
                          >{translate('Remove portal access')}</button
                        >
                      </form>{/if}
                      {#if accountId && !mailboxDegraded}<form
                        method="POST"
                        action="?view=team&directory=mailboxes&/updateMailboxPassword"
                        class="team-directory__protected-form"
                        data-mailbox-action="updateMailboxPassword"
                        use:enhance={enhanceMailboxForm}
                        use:formValidation
                        onsubmit={(event) => requireExactConfirmation(event, email)}
                      >
                        <input
                          type="hidden"
                          name="idempotencyKey"
                          value={externalCommandKey('updateMailboxPassword', accountId)}
                        />
                        <h3>{translate('Change Webmail password')}</h3>
                        <p class="team-directory__form-help">
                          {translate(
                            'Sets one new password for both the portal and Webmail. Give it to the person in a safe way.',
                          )}
                        </p>
                        <input type="hidden" name="stalwartAccountId" value={accountId} /><input
                          type="hidden"
                          name="email"
                          value={email}
                        /><label for={`mailbox-password-${fieldKey}`}
                          >{translate('New Webmail password')}</label
                        ><input
                          id={`mailbox-password-${fieldKey}`}
                          name="password"
                          type="password"
                          autocomplete="new-password"
                          minlength="12"
                          required
                        /><label for={`mailbox-password-reason-${fieldKey}`}
                          >{translate('Reason for password change')}</label
                        ><textarea
                          id={`mailbox-password-reason-${fieldKey}`}
                          name="reason"
                          value={failedExternalValue('updateMailboxPassword', accountId, 'reason')}
                          rows="2"
                          minlength="5"
                          required
                        ></textarea><label for={`mailbox-password-confirm-${fieldKey}`}
                          >{translate('Type the exact email to confirm')}</label
                        ><input
                          id={`mailbox-password-confirm-${fieldKey}`}
                          name="confirmation"
                          value={failedExternalValue(
                            'updateMailboxPassword',
                            accountId,
                            'confirmation',
                          )}
                          type="email"
                          autocomplete="off"
                          pattern={confirmationPattern(email)}
                          required
                        /><button
                          type="submit"
                          class="team-directory__action"
                          disabled={mailboxAction.status === 'pending'}
                          >{translate('Change Webmail password')}</button
                        >
                      </form>
                      <form
                        method="POST"
                        action="?view=team&directory=mailboxes&/destroyMailboxAccount"
                        class="team-directory__protected-form team-directory__protected-form--danger"
                        data-mailbox-action="destroyMailboxAccount"
                        use:enhance={enhanceMailboxForm}
                        use:formValidation
                        onsubmit={(event) => requireExactConfirmation(event, `DELETE ${email}`)}
                      >
                        <input
                          type="hidden"
                          name="idempotencyKey"
                          value={externalCommandKey('destroyMailboxAccount', accountId)}
                        />
                        <h3>{translate('Delete mailbox')}</h3>
                        <p class="team-directory__danger-copy">
                          <strong>{translate('Permanent external action.')}</strong>
                          {translate(
                            'This deletes the Stalwart account and its Webmail data. Portal access is not a substitute for this confirmation.',
                          )}
                        </p>
                        <input type="hidden" name="stalwartAccountId" value={accountId} /><input
                          type="hidden"
                          name="email"
                          value={email}
                        /><label for={`mailbox-delete-reason-${fieldKey}`}
                          >{translate('Reason for deleting mailbox')}</label
                        ><textarea
                          id={`mailbox-delete-reason-${fieldKey}`}
                          name="reason"
                          value={failedExternalValue('destroyMailboxAccount', accountId, 'reason')}
                          rows="2"
                          minlength="5"
                          required
                        ></textarea><label for={`mailbox-delete-confirm-${fieldKey}`}
                          >{translate(
                            'Type DELETE, followed by a space and the exact email shown below, to confirm deletion',
                          )}</label
                        ><input
                          id={`mailbox-delete-confirm-${fieldKey}`}
                          name="confirmation"
                          value={failedExternalValue(
                            'destroyMailboxAccount',
                            accountId,
                            'confirmation',
                          )}
                          type="text"
                          autocomplete="off"
                          pattern={confirmationPattern(`DELETE ${email}`)}
                          required
                        /><small>{`DELETE ${email}`}</small><button
                          type="submit"
                          class="team-directory__action team-directory__action--danger"
                          disabled={mailboxAction.status === 'pending'}
                          >{translate('Delete mailbox permanently')}</button
                        >
                      </form>{:else if !accountId}<p class="team-directory__form-help">
                        {translate(
                          'Stalwart account identifier unavailable; protected controls are disabled.',
                        )}
                      </p>{:else}<p class="team-directory__form-help">{mc('signInUnknownHelp')}</p>{/if}
                    </details>
                  {/if}
                </div>
              </details>
            {/snippet}
            <div class="team-directory__mailbox-table-wrapper">
              <table class="team-directory__mailbox-table">
                <caption class="sr-only">{translate('Live corporate mailbox directory')}</caption
                ><thead
                  ><tr
                    ><th scope="col" class="team-directory__select-column"
                      ><label class="team-directory__checkbox-hit" for="mailbox-select-all"
                        ><input
                          id="mailbox-select-all"
                          type="checkbox"
                          aria-label={translate('Select all eligible mailboxes')}
                          checked={allVisibleEligibleSelected}
                          onchange={toggleAllVisibleMailboxes}
                          disabled={eligibleVisibleMailboxes.length === 0}
                        /><span class="sr-only">{translate('Select all eligible mailboxes')}</span
                        ></label
                      ></th
                    ><th scope="col">{translate('Mailbox / Email')}</th><th scope="col"
                      >{translate('Name')}</th
                    ><th scope="col">{mc('colPortal')}</th>{#if !mailboxDegraded}<th scope="col"
                        >{mc('colWebmail')}</th
                      >{/if}<th scope="col">{translate('Controls')}</th
                    ></tr
                  ></thead
                ><tbody
                  >{#each filteredMailboxes as mailbox}{@const email = mailboxEmail(mailbox)}<tr
                      class:team-directory__mailbox-row--provisioned={mailbox.isProvisioned}
                      class:team-directory__mailbox-row--owner={isOwnerMailbox(mailbox)}
                      ><td class="team-directory__select-column"
                        ><label
                          class="team-directory__checkbox-hit"
                          for={`mailbox-select-${mailboxUsername(mailbox)}`}
                          ><input
                            id={`mailbox-select-${mailboxUsername(mailbox)}`}
                            type="checkbox"
                            value={email}
                            checked={selectedMailboxes.has(email)}
                            onchange={() => toggleMailboxSelection(mailbox)}
                            disabled={!mailboxIsEligible(mailbox)}
                            aria-label={`${translate('Select')} ${email}`}
                          /><span class="sr-only">{`${translate('Select')} ${email}`}</span></label
                        ></td
                      ><td
                        ><div class="team-directory__email-cell">
                          <strong>{mailboxUsername(mailbox)}</strong><span>{CORPORATE_DOMAIN}</span>
                        </div></td
                      ><td><strong>{mailboxName(mailbox)}</strong></td><td
                        ><StatusBadge
                          variant={mailboxStatusVariant(mailbox)}
                          text={mailboxPortalStatusLabel(mailbox)}
                        /></td
                      >{#if !mailboxDegraded}<td
                          data-mailbox-sign-in-state={String(mailbox.signInBlocked ?? 'unknown')}
                          ><StatusBadge {...mailboxSignInBadge(mailbox)} /></td
                        >{/if}<td>{@render mailboxControls(mailbox, 'table')}</td></tr
                    >{/each}</tbody
                >
              </table>
            </div>
            <div
              class="team-directory__mailbox-cards"
              aria-label={translate('Mailbox cards for small screens')}
            >
              {#each filteredMailboxes as mailbox}{@const email = mailboxEmail(mailbox)}
                <article
                  class="team-directory__mailbox-card"
                  class:team-directory__mailbox-row--provisioned={mailbox.isProvisioned}
                  class:team-directory__mailbox-row--owner={isOwnerMailbox(mailbox)}
                  data-mailbox-card={email}
                >
                  <div class="team-directory__mailbox-card-heading">
                    <label
                      class="team-directory__checkbox-hit"
                      for={`mailbox-card-select-${mailboxUsername(mailbox)}`}
                      ><input
                        id={`mailbox-card-select-${mailboxUsername(mailbox)}`}
                        type="checkbox"
                        value={email}
                        checked={selectedMailboxes.has(email)}
                        onchange={() => toggleMailboxSelection(mailbox)}
                        disabled={!mailboxIsEligible(mailbox)}
                        aria-label={`${translate('Select')} ${email}`}
                      /><span class="sr-only">{`${translate('Select')} ${email}`}</span></label
                    >
                    <div>
                      <strong>{mailboxName(mailbox)}</strong><span
                        class="team-directory__mailbox-card-email">{email}</span
                      >
                    </div>
                  </div>
                  <div class="team-directory__mailbox-card-badges">
                    <StatusBadge
                      variant={mailboxStatusVariant(mailbox)}
                      text={mailboxPortalStatusLabel(mailbox)}
                    />
                    {#if !mailboxDegraded}<StatusBadge {...mailboxSignInBadge(mailbox)} />{/if}
                  </div>
                  {@render mailboxControls(mailbox, 'card')}
                </article>{/each}
            </div>
          {/if}
          {#if mailboxDirectory && mailboxDirectory.pageCount > 1}
            {@render pager(mailboxDirectory.page, mailboxDirectory.pageCount, mailboxPageHref, 'mailboxes')}
          {/if}
          {#if !mailboxDegraded}<form
              method="POST"
              action="?view=team&directory=mailboxes&/bootstrapMailboxUsers"
              class="team-directory__protected-toolbar"
              data-mailbox-action="bootstrapMailboxUsers"
              use:enhance={enhanceMailboxForm}
            >
              <button
                type="submit"
                class="team-directory__action team-directory__action--quiet"
                disabled={mailboxAction.status === 'pending'}
              >
                {translate('Synchronize all Stalwart accounts')}
              </button>
            </form>{/if}
        </div>{/if}
    </div>
  {/if}

  {#if canManageMailboxDirectory}<ResponsiveSheet
      open={creatingMailbox}
      title={translate('Create a new Stalwart mailbox')}
      description={translate(
        'The account is created in Stalwart first, then optionally provisioned in the portal. Passwords are sent only to Stalwart.',
      )}
      closeLabel={translate('Close mailbox form')}
      class="team-directory__create-sheet"
      protectChanges
      onclose={() => (creatingMailbox = false)}
    >
      <form
        id="create-mailbox-sheet-form"
        method="POST"
        action="?view=team&directory=mailboxes&/createMailboxAccount"
        class="team-directory__mailbox-create-form"
        data-mailbox-action="createMailboxAccount"
        use:enhance={enhanceMailboxForm}
        use:formValidation
        aria-busy={mailboxAction.status === 'pending' &&
          mailboxAction.action === 'createMailboxAccount'}
      >
        {#if problemPayload?.code === 'ACCESS_LOCAL_MAILBOX_PENDING'}
          <div class="team-directory__mailbox-recovery-notice">
            <ProblemNotice problem={problemPayload} />
          </div>
        {/if}
        <input
          type="hidden"
          name="idempotencyKey"
          value={externalCommandKey('createMailboxAccount', 'new')}
        />
        <label for="mailbox-create-username">{translate('Alias / username')}</label>
        <div class="team-directory__input-addon">
          <input
            id="mailbox-create-username"
            name="username"
            value={failedExternalValue('createMailboxAccount', 'new', 'username')}
            type="text"
            autocomplete="off"
            placeholder={translate('first.last')}
            required
            pattern="[A-Za-z0-9._-]+"
          /><span class="team-directory__addon">{CORPORATE_DOMAIN}</span>
        </div>
        <label for="mailbox-create-name">{translate('Display name')}</label><input
          id="mailbox-create-name"
          name="name"
          value={failedExternalValue('createMailboxAccount', 'new', 'name')}
          type="text"
          autocomplete="name"
          required
          maxlength="160"
        /><label for="mailbox-create-password">{translate('Initial Webmail password')}</label><input
          id="mailbox-create-password"
          name="password"
          type="password"
          autocomplete="new-password"
          minlength="12"
          required
        />
        <p class="team-directory__form-help">
          {translate(
            'Use a unique password of at least 12 characters. It is not retained in this form after submission.',
          )}
        </p>
        <label for="mailbox-create-quota">{translate('Disk quota')}</label><select
          id="mailbox-create-quota"
          name="quotaMb"
          value={failedExternalValue('createMailboxAccount', 'new', 'quotaMb') || '5120'}
          required
          ><option value="1024">1 GB</option><option value="5120">5 GB</option><option value="10240"
            >10 GB</option
          ><option value="0">{translate('Unlimited')}</option></select
        ><label for="mailbox-create-role">{translate('Provision in portal as')}</label><select
          id="mailbox-create-role"
          name="provisionRole"
          value={failedExternalValue('createMailboxAccount', 'new', 'provisionRole') || 'worker'}
          required
          ><option value="worker">{translate('Worker (default)')}</option><option
            value="project_manager">{translate('Project Manager')}</option
          ><option value="finance_admin">{translate('Finance Admin')}</option><option
            value="auditor_read_only">{translate('Auditor (Read Only)')}</option
          ></select
        >
        <p class="team-directory__danger-copy">
          {translate(
            'Creating a mailbox changes the live Stalwart directory. Verify the alias and quota before continuing.',
          )}
        </p>
        <div class="team-directory__form-actions">
          <button
            type="button"
            class="team-directory__action team-directory__action--quiet"
            onclick={() => (creatingMailbox = false)}>{translate('Cancel')}</button
          ><button
            type="submit"
            class="team-directory__action"
            disabled={mailboxAction.status === 'pending'}
            >{mailboxAction.status === 'pending' && mailboxAction.action === 'createMailboxAccount'
              ? translate('Creating…')
              : translate('Create mailbox')}</button
          >
        </div>
      </form>
    </ResponsiveSheet>{/if}
</div>

<style>
  .person__confirm {
    display: grid;
    gap: 0.5rem;
  }
  .person__confirm > summary {
    list-style: none;
    cursor: pointer;
    display: inline-flex;
    width: fit-content;
  }
  .person__confirm > summary::-webkit-details-marker {
    display: none;
  }
  .person__confirm form {
    display: grid;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--ja-border, #d0d5dd);
    border-radius: 0.75rem;
  }
  .person__confirm textarea {
    min-height: 4rem;
  }
  .person__checklist ul {
    margin: 0.25rem 0 0;
    padding-left: 1.1rem;
  }
  .person__checklist p {
    margin: 0.25rem 0 0;
  }
  .team-directory__created {
    display: grid;
    gap: 0.5rem;
    padding: 1rem;
    margin: 0.75rem 0;
    border: 1px solid #12b76a;
    border-radius: 0.75rem;
    background: color-mix(in srgb, #12b76a 8%, transparent);
  }
  .team-directory__created p {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .team-directory__created-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .team-directory__password-once {
    display: block;
    color: #b54708;
  }
  /* Server-scoped lists: pager, scope line, degraded mail server notice. */
  .team-pager {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    margin: 1rem 0 0.5rem;
  }
  .team-pager__step {
    min-height: var(--ja-target-min, 2.75rem);
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }
  .team-pager__step--off {
    opacity: 0.45;
    pointer-events: none;
  }
  .team-pager__label {
    color: var(--portal-muted, #63625b);
    font-size: 0.9rem;
  }
  .team-directory__mailbox-scope {
    margin: 0.25rem 0 0.75rem;
    color: var(--portal-muted, #63625b);
  }
  .team-directory__attention {
    color: #b42318;
    font-weight: 600;
  }
  .team-directory__attention a {
    color: inherit;
    margin-left: 0.25rem;
  }
  .team-directory__degraded {
    border: 1px solid #f0c36d;
    background: #fff8e6;
    color: #4d3800;
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    margin-bottom: 0.75rem;
  }
  .team-directory__degraded p {
    margin: 0.25rem 0 0;
    line-height: 1.4;
  }
  .team-directory__mailbox-choice {
    display: grid;
    gap: 0.25rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem 0.75rem;
    margin: 0 0 0.75rem;
  }
  .team-directory__mailbox-choice legend {
    font-weight: 600;
    padding: 0 0.25rem;
    overflow-wrap: anywhere;
  }
  .team-directory__mailbox-choice label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: var(--ja-target-min, 2.75rem);
    font-weight: 400;
  }
  .team-directory__mailbox-choice input,
  .team-directory__protected-form .team-directory__mailbox-choice input[type='radio'] {
    width: 1.15rem;
    min-width: 1.15rem;
    height: 1.15rem;
    min-height: 0;
    flex: none;
    margin: 0;
  }
  .team-directory__protected-form .team-directory__inline-check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--portal-ink, #20201d);
    font-size: 0.9rem;
    font-weight: 600;
  }
  .team-directory__protected-form .team-directory__inline-check input[type='checkbox'] {
    width: 1.15rem;
    min-width: 1.15rem;
    height: 1.15rem;
    min-height: 0;
    margin: 0;
  }
  .team-directory__protected-form .team-directory__mailbox-choice label {
    display: flex;
    flex-direction: row;
    align-items: center;
  }
  .team-directory__mailbox-choice small {
    color: var(--portal-muted, #63625b);
    line-height: 1.4;
  }
  .team-directory__portal-status {
    margin: 0;
    color: #8a4b00;
  }
  .team-directory__reactivate-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .team-directory__reactivate-row select {
    min-height: var(--ja-target-min, 2.75rem);
    flex: 1 1 10rem;
  }
  .team-directory__form-help--attention {
    color: #b42318;
    font-weight: 600;
  }
  .team-directory__row-feedback {
    margin: 0 0 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: #ecfdf3;
    color: #05603a;
    line-height: 1.4;
  }
  .team-directory__row-feedback--error {
    background: #fff3f1;
    color: #b42318;
  }
  .team-directory__row-feedback a {
    color: inherit;
    font-weight: 600;
    margin-left: 0.35rem;
  }
  .team-directory__mailbox-card-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0.5rem 0;
  }
  .team-directory__mailbox-more {
    margin-top: 0.5rem;
  }
  .team-directory__mailbox-more > summary {
    cursor: pointer;
    min-height: var(--ja-target-min, 2.75rem);
    display: flex;
    align-items: center;
    color: var(--portal-muted, #63625b);
  }
  .person__offboard {
    display: grid;
    gap: 0.5rem;
    flex: 1 0 100%;
    max-width: 36rem;
  }
  .person__offboard > button {
    justify-self: start;
  }
  .team-directory__email-preview {
    display: block;
    margin-top: 0.35rem;
    font-weight: 400;
    color: var(--portal-muted, #63625b);
    overflow-wrap: anywhere;
  }
  .team-directory__email-preview strong {
    color: var(--portal-ink, #20201d);
  }
  .team-directory__create-form .team-directory__roles,
  .team-directory__create-form .team-directory__password-field,
  .team-directory__create-form .team-directory__mailbox-choice,
  .team-directory__create-wide {
    grid-column: 1 / -1;
  }
  .team-directory__roles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  .team-directory__roles legend {
    margin-bottom: 0.4rem;
    padding: 0;
    color: var(--portal-muted, #63625b);
    font-size: 0.8125rem;
    font-weight: 800;
  }
  .team-directory__roles > p {
    grid-column: 1 / -1;
    margin: 0;
  }
  .team-directory__create-form .team-directory__role-choice {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    min-height: 44px;
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.55rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #20201d);
    font-weight: 400;
    cursor: pointer;
  }
  .team-directory__create-form .team-directory__role-choice:has(input:checked) {
    border-color: var(--portal-accent, #53524c);
    box-shadow: inset 0 0 0 1px var(--portal-accent, #53524c);
  }
  .team-directory__create-form .team-directory__role-choice input {
    width: 1.1rem;
    min-height: 0;
    height: 1.1rem;
    margin: 0.15rem 0 0;
    flex: 0 0 1.1rem;
  }
  .team-directory__role-choice span {
    display: grid;
    gap: 0.15rem;
  }
  .team-directory__role-choice small,
  .team-directory__mailbox-choice small {
    display: block;
    color: var(--portal-muted, #63625b);
    font-weight: 400;
    font-size: 0.8125rem;
  }
  .team-directory__password-field {
    display: grid;
    gap: 0.3rem;
  }
  .team-directory__password-field > small,
  .team-directory__reset-password > small {
    color: var(--portal-muted, #63625b);
  }
  .team-directory__password-row {
    display: flex;
    gap: 0.5rem;
    align-items: stretch;
  }
  .team-directory__password-row input {
    flex: 1 1 auto;
    min-width: 0;
    margin-top: 0 !important;
  }
  .team-directory__password-row button {
    flex: 0 0 auto;
  }
  .team-directory__create-form .team-directory__inline-check,
  .team-directory__inline-check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    color: var(--portal-ink, #20201d);
    font-weight: 400;
  }
  .team-directory__inline-check input {
    width: 1.1rem !important;
    min-height: 0 !important;
    height: 1.1rem;
    margin: 0 !important;
  }
  .team-directory__create-more summary {
    cursor: pointer;
    min-height: 44px;
    display: flex;
    align-items: center;
    font-weight: 700;
  }
  .team-directory__create-more-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.65rem 0.8rem;
  }
  .team-directory__create-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1rem;
  }
  .team-directory__link-button {
    min-height: 44px;
    padding: 0.4rem 0;
    border: 0;
    background: none;
    color: var(--portal-accent, #53524c);
    font: inherit;
    font-weight: 700;
    text-decoration: underline;
    cursor: pointer;
    justify-self: start;
  }
  .team-directory__form.team-directory__reset-password {
    grid-template-columns: minmax(0, 1fr);
    max-width: 34rem;
    margin-top: 1rem;
    align-content: start;
  }
  .team-directory__reset-password h3,
  .team-directory__reset-password p {
    margin: 0;
  }
  .team-directory__reset-done {
    margin: 0;
    padding: 0.65rem 0.8rem;
    border: 1px solid #a6d8b8;
    border-radius: 0.5rem;
    background: #ecf8f0;
    color: #14532d;
  }
  .team-directory__mailbox-recovery-notice {
    grid-column: 1 / -1;
  }
  .team-directory__create-form .team-directory__mailbox-choice {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
    min-height: 44px;
  }
  .team-directory__mailbox-choice input[type='checkbox'] {
    width: 1.15rem;
    height: 1.15rem;
    flex: 0 0 1.15rem;
    margin-top: 0.15rem;
  }

  .team-directory {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }
  .team-directory__specialists {
    scroll-margin-top: 5.5rem;
  }
  .team-directory__header,
  .team-directory__provisioning-heading,
  .team-directory__invitation-result {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }
  .team-directory h2,
  .team-directory h3 {
    margin: 0;
    color: var(--portal-ink, #20201d);
  }
  .team-directory__header p:last-child,
  .team-directory__provisioning-heading p:last-child,
  .team-directory__invitation-result p {
    margin: 0.35rem 0 0;
    color: var(--portal-muted, #63625b);
  }
  .team-directory__protected-toolbar {
    display: flex;
    align-items: end;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .team-directory__protected-toolbar {
    justify-content: space-between;
    padding: 0.85rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.65rem;
    background: var(--portal-wash, #f7f7f6);
  }
  .team-directory__tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    border-bottom: 2px solid var(--portal-border, #dfdedc);
  }
  .team-directory__tab {
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    gap: 0.5rem;
    border: 0;
    border-bottom: 3px solid transparent;
    padding: 0.65rem 1rem;
    background: transparent;
    color: var(--portal-muted, #67675f);
    font: inherit;
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
  }
  .team-directory__tab:hover,
  .team-directory__tab:focus-visible {
    color: var(--portal-ink, #20201d);
  }
  .team-directory__tab--active {
    border-bottom-color: var(--portal-accent, #53524c);
    color: var(--portal-accent, #53524c);
  }
  .team-directory__tab-count {
    min-width: 1.55rem;
    padding: 0.12rem 0.45rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--portal-accent, #53524c) 12%, transparent);
    text-align: center;
    font-size: 0.8125rem;
  }
  .team-directory__feedback {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: baseline;
    padding: 0.7rem 0.9rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.65rem;
    background: var(--portal-wash, #f8f8f7);
    color: var(--portal-ink, #20201d);
  }
  .team-directory__feedback--success {
    border-color: #86847a;
    background: #f8f8f7;
  }
  .team-directory__feedback--error {
    border-color: #b42318;
    background: #fff3f1;
    color: #7a271a;
  }
  .team-directory__feedback--pending {
    border-color: var(--portal-accent, #53524c);
  }
  .team-directory__provisioning,
  .team-directory__mailboxes {
    display: grid;
    gap: 1rem;
  }
  .team-directory__provisioning {
    padding: 1rem;
    border: 1px solid color-mix(in srgb, var(--portal-accent, #53524c) 32%, transparent);
    border-radius: 0.8rem;
    background: color-mix(in srgb, var(--portal-surface, #fff) 88%, #f1f1f0);
  }
  .team-directory__create-form,
  .team-directory__mailbox-create-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem 0.8rem;
    padding-top: 1rem;
    border-top: 1px solid var(--portal-border, #dfdedc);
  }
  .team-directory__create-form label,
  .team-directory__mailbox-create-form label,
  .team-directory__protected-form label,
  .team-directory__field label {
    display: block;
    color: var(--portal-muted, #63625b);
    font-size: 0.8125rem;
    font-weight: 800;
  }
  .team-directory__create-form input,
  .team-directory__create-form select,
  .team-directory__mailbox-create-form input,
  .team-directory__mailbox-create-form select,
  .team-directory__protected-form input,
  .team-directory__protected-form select,
  .team-directory__protected-form textarea,
  .team-directory__controls input,
  .team-directory__controls select {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: var(--ja-target-min, 2.75rem);
    margin-top: 0.3rem;
    border: 1px solid var(--ja-control-border, #67675f);
    border-radius: 0.5rem;
    padding: 0.55rem 0.7rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #20201d);
    font: inherit;
  }
  .team-directory__protected-form textarea {
    min-height: 4.5rem;
    resize: vertical;
  }
  .team-directory__create-form .team-directory__create-explainer,
  .team-directory__create-form .team-directory__create-submit,
  .team-directory__create-form :global([data-validation-summary]) {
    grid-column: 1 / -1;
  }
  .team-directory__create-explainer {
    padding: 0.8rem;
    border-radius: 0.55rem;
    background: var(--portal-surface, #fff);
  }
  .team-directory__create-explainer ol {
    display: grid;
    gap: 0.3rem;
    margin: 0.5rem 0 0;
    padding-left: 1.25rem;
    color: var(--portal-muted, #63625b);
    font-size: 0.85rem;
  }
  .team-directory__invitation-result {
    align-items: flex-start;
    padding: 0.9rem;
    border: 1px solid #86847a;
    border-radius: 0.65rem;
    background: #f8f8f7;
  }
  .team-directory__invitation-result > div {
    min-width: 0;
  }
  .team-directory__invitation-result a {
    display: block;
    margin-top: 0.5rem;
    overflow-wrap: anywhere;
    color: var(--portal-accent, #53524c);
    font-weight: 750;
  }
  .team-directory__controls {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: end;
    gap: 0.75rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.75rem;
    background: var(--portal-surface, #fff);
  }
  .team-directory__field {
    min-width: 0;
  }
  .team-directory__checkbox-hit input {
    width: 1.2rem;
    height: 1.2rem;
    margin: 0;
    accent-color: var(--portal-accent, #53524c);
  }
  .team-directory input:focus-visible,
  .team-directory select:focus-visible,
  .team-directory textarea:focus-visible,
  .team-directory button:focus-visible,
  .team-directory a:focus-visible,
  .team-directory summary:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--portal-accent, #53524c) 32%, transparent);
    outline-offset: 2px;
  }
  :global(.team-directory__card) {
    display: grid;
    gap: 1rem;
  }
  .team-directory__form-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: end;
  }
  .team-directory__action,
  .team-directory summary {
    display: inline-flex;
    min-height: var(--ja-target-min, 2.75rem);
    align-items: center;
    justify-content: center;
    border: 1px solid var(--portal-accent, #53524c);
    border-radius: 0.55rem;
    padding: 0.55rem 0.85rem;
    background: var(--portal-accent, #53524c);
    color: #fff;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }
  .team-directory__action:disabled {
    cursor: wait;
    opacity: 0.6;
  }
  .team-directory__action--danger {
    border-color: #b42318;
    background: #b42318;
  }
  .team-directory__action--quiet {
    background: transparent;
    color: var(--portal-accent, #53524c);
  }
  .team-directory__editor {
    display: grid;
    gap: 1rem;
    padding: 1rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.65rem;
    background: var(--portal-wash, #f8f8f7);
  }
  .team-directory__form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }
  .team-directory__form h3,
  .team-directory__form-actions {
    grid-column: 1 / -1;
  }
  .team-directory__form input,
  .team-directory__form select {
    box-sizing: border-box;
    width: 100%;
    min-height: var(--ja-target-min, 2.75rem);
    border: 1px solid var(--ja-control-border, #67675f);
    border-radius: 0.5rem;
    padding: 0.55rem 0.7rem;
    font: inherit;
  }
  .team-directory__empty,
  .team-directory__form-help {
    color: var(--portal-muted, #63625b);
    line-height: 1.4;
  }
  .team-directory__empty {
    margin: 0;
    padding: 0.6rem;
    border: 1px dashed var(--portal-border, #dfdedc);
    font-size: 0.82rem;
  }
  .team-directory__empty--large {
    padding: 1.25rem;
    text-align: center;
  }
  .team-directory__owner-lock {
    margin: 0;
    padding: 0.75rem;
    border: 1px solid color-mix(in srgb, #53524c 42%, transparent);
    border-radius: 0.55rem;
    background: #f5f5f5;
    color: var(--portal-ink, #20201d);
  }
  .team-directory__owner-lock p {
    margin: 0.35rem 0 0;
    color: var(--portal-muted, #63625b);
  }
  .team-directory__mailbox-workspace {
    display: grid;
    gap: 1rem;
  }
  .team-directory__mailbox-toolbar {
    grid-template-columns: minmax(0, 1fr) minmax(12rem, 18rem);
  }
  .team-directory__bulk-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.85rem 1rem;
    border-radius: 0.65rem;
    background: #53524c;
    color: #fff;
  }
  .team-directory__bulk-info {
    font-size: 0.95rem;
  }
  .team-directory__bulk-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
  }
  .team-directory__inline-label {
    display: flex;
    min-height: var(--ja-target-min, 2.75rem);
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    font-weight: 700;
  }
  .team-directory__inline-label select {
    min-height: 2.5rem;
    border: 0;
    border-radius: 0.45rem;
    padding: 0.4rem 0.6rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #20201d);
    font: inherit;
  }
  .team-directory__mailbox-table-wrapper {
    overflow-x: auto;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.75rem;
    background: var(--portal-surface, #fff);
  }
  .team-directory__mailbox-table {
    width: 100%;
    min-width: 50rem;
    border-collapse: collapse;
    font-size: 0.88rem;
  }
  .team-directory__mailbox-table th,
  .team-directory__mailbox-table td {
    padding: 0.8rem 1rem;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid var(--portal-border, #dfdedc);
  }
  .team-directory__mailbox-table th {
    background: var(--portal-wash, #f8f8f7);
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .team-directory__mailbox-table tbody tr:hover {
    background: color-mix(in srgb, var(--portal-wash, #f8f8f7) 40%, transparent);
  }
  .team-directory__mailbox-row--provisioned {
    background: color-mix(in srgb, var(--portal-wash, #f8f8f7) 42%, transparent);
  }
  .team-directory__mailbox-row--owner {
    background: #f5f5f5;
  }
  .team-directory__select-column {
    width: 3.5rem;
  }
  .team-directory__checkbox-hit {
    display: inline-flex;
    min-width: 2.75rem;
    min-height: 2.75rem;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .team-directory__email-cell {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    overflow-wrap: anywhere;
  }
  .team-directory__email-cell span {
    color: var(--portal-muted, #67675f);
    font-size: 0.82rem;
  }
  .team-directory__mailbox-management {
    min-width: 12rem;
  }
  .team-directory__mailbox-management summary {
    width: fit-content;
    list-style: none;
  }
  .team-directory__mailbox-management summary::-webkit-details-marker {
    display: none;
  }
  .team-directory__mailbox-management-body {
    display: grid;
    gap: 0.8rem;
    min-width: min(31rem, 100%);
    margin-top: 0.6rem;
    padding: 0.8rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.65rem;
    background: var(--portal-wash, #f8f8f7);
  }
  .team-directory__protected-form {
    display: grid;
    gap: 0.35rem;
    padding: 0.8rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.55rem;
    background: var(--portal-surface, #fff);
  }
  .team-directory__protected-form h3 {
    font-size: 0.95rem;
  }
  .team-directory__protected-form small {
    overflow-wrap: anywhere;
    color: var(--portal-muted, #63625b);
  }
  .team-directory__protected-form--danger {
    border-color: color-mix(in srgb, #b42318 48%, var(--portal-border, #dfdedc));
    background: #fff9f7;
  }
  .team-directory__danger-copy {
    margin: 0;
    color: #7a271a;
    font-size: 0.84rem;
    line-height: 1.45;
  }
  .team-directory__protected-form :global([data-validation-summary]),
  .team-directory__mailbox-create-form :global([data-validation-summary]) {
    grid-column: 1 / -1;
  }
  .team-directory__directory-state {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0 0.7rem;
    align-items: center;
    padding: 1.1rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.75rem;
    background: var(--portal-wash, #f8f8f7);
  }
  .team-directory__directory-state p {
    grid-column: 2;
    margin: 0.25rem 0 0;
    color: var(--portal-muted, #63625b);
  }
  .team-directory__directory-state--error {
    border-color: #b42318;
    background: #fff3f1;
  }
  .team-directory__state-mark {
    display: grid;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 50%;
    background: var(--portal-accent, #53524c);
    color: #fff;
    font-weight: 900;
  }
  .team-directory__directory-state--error .team-directory__state-mark {
    background: #b42318;
  }
  .team-directory__mailbox-cards {
    display: none;
    gap: 0.8rem;
  }
  .team-directory__mailbox-card {
    display: grid;
    gap: 0.8rem;
    padding: 0.9rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.75rem;
    background: var(--portal-surface, #fff);
  }
  .team-directory__mailbox-card-heading {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.7rem;
    align-items: center;
  }
  .team-directory__mailbox-card-heading > div {
    display: grid;
    min-width: 0;
    gap: 0.2rem;
  }
  .team-directory__mailbox-card-email {
    overflow-wrap: anywhere;
    color: var(--portal-accent, #53524c);
    font-size: 0.82rem;
  }
  .team-directory__input-addon {
    display: flex;
    min-width: 0;
    align-items: center;
    border: 1px solid var(--ja-control-border, #67675f);
    border-radius: 0.5rem;
    overflow: hidden;
    background: var(--portal-surface, #fff);
  }
  .team-directory__input-addon input {
    margin: 0;
    border: 0;
    border-radius: 0;
  }
  .team-directory__addon {
    display: flex;
    height: 100%;
    min-height: 2.75rem;
    align-items: center;
    padding: 0 0.7rem;
    background: var(--portal-wash, #f5f5f5);
    color: var(--portal-muted, #63625b);
    font-size: 0.82rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .team-directory__mailbox-create-form .team-directory__form-help,
  .team-directory__mailbox-create-form .team-directory__danger-copy,
  .team-directory__mailbox-create-form .team-directory__form-actions {
    grid-column: 1 / -1;
  }
  .team-directory__mailbox-create-form .team-directory__form-actions {
    justify-content: flex-end;
  }
  @media (max-width: 58rem) {
    .team-directory__controls {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 720px) {
    .team-directory__header,
    .team-directory__provisioning-heading,
    .team-directory__invitation-result {
      align-items: stretch;
      flex-direction: column;
    }
    .team-directory__tabs {
      flex-direction: column;
      border-bottom: 0;
    }
    .team-directory__tab {
      justify-content: space-between;
      border: 1px solid var(--portal-border, #dfdedc);
      border-radius: 0.5rem;
    }
    .team-directory__tab--active {
      border-color: var(--portal-accent, #53524c);
      background: var(--portal-wash, #f5f5f5);
    }
    .team-directory__controls,
    .team-directory__form,
    .team-directory__create-form,
    .team-directory__mailbox-create-form,
    .team-directory__mailbox-toolbar {
      grid-template-columns: 1fr;
    }
    .team-directory__protected-toolbar {
      align-items: stretch;
      flex-direction: column;
    }
    .team-directory__protected-toolbar button {
      width: 100%;
    }
    .team-directory__create-form .team-directory__create-explainer,
    .team-directory__create-form .team-directory__create-submit {
      grid-column: auto;
    }
    .team-directory__create-submit,
    .team-directory__provisioning-heading > button,
    .team-directory__invitation-result > button,
    .team-directory__form-actions,
    .team-directory__form-actions button,
    .team-directory__bulk-controls,
    .team-directory__bulk-controls > *,
    .team-directory__protected-form > button {
      width: 100%;
    }
    .team-directory__bulk-bar {
      align-items: stretch;
    }
    .team-directory__bulk-controls {
      flex-direction: column;
      align-items: stretch;
    }
    .team-directory__inline-label {
      justify-content: space-between;
    }
    .team-directory__inline-label select {
      flex: 1;
    }
    .team-directory__mailbox-table-wrapper {
      display: none;
    }
    .team-directory__mailbox-cards {
      display: grid;
    }
    .team-directory__mailbox-card .team-directory__mailbox-management-body {
      min-width: 0;
    }
    .team-directory__mailbox-create-form .team-directory__form-actions {
      justify-content: stretch;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .team-directory * {
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
    }
  }

  /* ---------------------------------------------- People directory */
  .person .team-directory__form {
    grid-template-columns: minmax(0, 32rem);
    gap: 0.35rem;
  }
  .person .team-directory__form label {
    margin-top: 0.4rem;
  }
  .people__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin-bottom: 0.75rem;
  }
  .people__filters {
    display: grid;
    grid-template-columns: minmax(14rem, 2fr) repeat(3, minmax(9rem, 1fr)) auto;
    gap: 0.75rem;
    align-items: end;
    margin: 0.5rem 0 0.75rem;
  }
  .people__filters label {
    display: grid;
    gap: 0.3rem;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--portal-muted, #5b6670);
  }
  .people__filters input,
  .people__filters select {
    min-height: var(--ja-target-min, 2.75rem);
    width: 100%;
    box-sizing: border-box;
    font-weight: 400;
    color: var(--portal-ink, #1f2328);
  }
  .people__clear {
    min-height: var(--ja-target-min, 2.75rem);
  }
  .people__invitations {
    margin: 0 0 1rem;
    padding: 0.85rem 1rem;
    border: 1px solid var(--ja-border-subdued, #d0d5dd);
    border-radius: 0.75rem;
    background: var(--ja-surface, #fff);
  }
  .people__invitations h3 {
    margin: 0 0 0.25rem;
    font-size: 1rem;
  }
  .people__invitations-count {
    display: inline-block;
    min-width: 1.5rem;
    padding: 0 0.4rem;
    border-radius: 999px;
    background: var(--ja-surface-raised, #f2f4f7);
    font-size: 0.8125rem;
    text-align: center;
  }
  .people__invitations ul {
    margin: 0.5rem 0 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.5rem;
  }
  .people__invitation {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--ja-border-subdued, #eaecf0);
  }
  .people__invitation-who {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .people__invitation-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .people__invitation-actions form {
    margin: 0;
  }
  .people__invitation-actions button {
    min-height: 44px;
  }
  .people__count {
    margin: 0 0 0.5rem;
    color: var(--portal-muted, #5b6670);
    font-size: 0.85rem;
  }
  .people__table {
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.75rem;
    overflow: hidden;
    background: var(--portal-surface, #fff);
  }
  .people__row {
    display: grid;
    grid-template-columns: minmax(15rem, 2.2fr) minmax(8rem, 1fr) minmax(10rem, 1.6fr) minmax(9rem, 1.2fr) minmax(6rem, 0.7fr);
    gap: 0.75rem;
    align-items: center;
    padding: 0.55rem 1rem;
    border-top: 1px solid var(--portal-border, #eceae6);
    font-size: 0.9rem;
  }
  .people__row:hover {
    background: var(--portal-wash, #f8f8f7);
  }
  .people__row--head {
    border-top: 0;
    background: var(--portal-wash, #f8f8f7);
    font-size: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--portal-muted, #5b6670);
  }
  .people__person {
    display: flex;
    gap: 0.65rem;
    align-items: center;
    min-width: 0;
  }
  .people__avatar,
  .person__avatar {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 999px;
    background: var(--portal-wash, #efeeea);
    color: var(--portal-ink, #1f2328);
    font-size: 0.8rem;
    font-weight: 800;
  }
  .people__name {
    display: grid;
    min-width: 0;
  }
  .people__name a {
    font-weight: 750;
    color: var(--portal-ink, #1f2328);
    text-decoration: none;
    min-height: 1.75rem;
    display: inline-flex;
    align-items: center;
  }
  .people__name a::after {
    /* whole row opens the person */
    content: '';
    position: absolute;
    inset: 0;
  }
  .people__row {
    position: relative;
  }
  .people__name a:hover,
  .people__name a:focus-visible {
    text-decoration: underline;
  }
  .people__name small {
    color: var(--portal-muted, #5b6670);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .people__role {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .people__projects {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    align-items: center;
  }
  .people__chip {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-radius: 999px;
    padding: 0.15rem 0.55rem;
    background: var(--portal-wash, #efeeea);
    font-size: 0.8rem;
  }
  .people__mail-ok {
    color: #1d6b3a;
    font-weight: 700;
    font-size: 0.85rem;
  }
  .people__more {
    margin-top: 0.75rem;
  }
  .person__muted {
    margin: 0;
    color: var(--portal-muted, #5b6670);
  }
  .person {
    display: grid;
    gap: 1rem;
  }
  .person__back {
    justify-self: start;
    min-height: var(--ja-target-min, 2.75rem);
    display: inline-flex;
    align-items: center;
    font-weight: 700;
  }
  .person__header {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .person__avatar {
    width: 3.25rem;
    height: 3.25rem;
    font-size: 1.05rem;
  }
  .person__identity {
    flex: 1 1 16rem;
    min-width: 0;
  }
  .person__identity h3 {
    margin: 0;
    font-size: 1.5rem;
  }
  .person__identity p {
    margin: 0.2rem 0 0;
    color: var(--portal-muted, #5b6670);
    overflow-wrap: anywhere;
  }
  .person__badges {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .person__tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--portal-border, #dfdedc);
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .person__tab {
    min-height: var(--ja-target-min, 2.75rem);
    display: inline-flex;
    align-items: center;
    padding: 0 0.9rem;
    color: var(--portal-muted, #5b6670);
    font-weight: 700;
    text-decoration: none;
    border-bottom: 3px solid transparent;
    white-space: nowrap;
  }
  .person__tab--active {
    color: var(--portal-ink, #1f2328);
    border-bottom-color: var(--portal-ink, #1f2328);
  }
  .person__panel {
    display: grid;
    gap: 1.25rem;
  }
  .person__stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: 0.75rem;
    margin: 0;
  }
  .person__stats > div {
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.7rem;
    padding: 0.75rem 0.9rem;
    background: var(--portal-surface, #fff);
  }
  .person__stats dt {
    font-size: 0.8rem;
    color: var(--portal-muted, #5b6670);
    font-weight: 700;
  }
  .person__stats dd {
    margin: 0.2rem 0 0;
    font-size: 1.35rem;
    font-weight: 800;
    display: grid;
    gap: 0.2rem;
  }
  .person__stats dd small {
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--portal-muted, #5b6670);
  }
  .person__stats dd a {
    font-size: 0.85rem;
  }
  .person__stat--attention {
    border-color: #d9a520 !important;
    background: #fff9e8 !important;
  }
  .person__link-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.75rem;
  }
  .person__link-card {
    display: grid;
    gap: 0.25rem;
    padding: 0.9rem;
    min-height: var(--ja-target-min, 2.75rem);
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.7rem;
    text-decoration: none;
    color: var(--portal-ink, #1f2328);
    background: var(--portal-surface, #fff);
  }
  .person__link-card small {
    color: var(--portal-muted, #5b6670);
  }
  .person__cta {
    justify-self: start;
  }
  .person__plain-list {
    margin: 0.5rem 0 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.3rem;
  }
  .person__mailbox h3,
  .person__danger h3,
  .person__more-body h3 {
    margin: 0 0 0.4rem;
    font-size: 1rem;
  }
  .person__mailbox p {
    margin: 0;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .person__notice {
    margin-top: 0.5rem !important;
    padding: 0.55rem 0.75rem;
    border-radius: 0.5rem;
    background: #fff4d6;
    color: #6b4b00;
  }
  .person__danger {
    border-top: 1px solid var(--portal-border, #dfdedc);
    padding-top: 0.9rem;
    display: grid;
    gap: 0.5rem;
  }
  .person__danger-actions {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .person__danger-actions form {
    margin: 0;
  }
  .team-directory__action--danger-outline {
    background: transparent;
    border-color: #b42318;
    color: #b42318;
  }
  .person__more {
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.7rem;
  }
  .team-directory .person__more > summary {
    display: flex;
    justify-content: flex-start;
    width: 100%;
    box-sizing: border-box;
    background: transparent;
    color: var(--portal-ink, #1f2328);
    border: 0;
  }
  .person__more-body {
    padding: 0 1rem 1rem;
    display: grid;
    gap: 0.6rem;
  }
  .person__more-body p {
    margin: 0;
  }
  .person__chips {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .person__chips li {
    border-radius: 999px;
    padding: 0.15rem 0.6rem;
    background: var(--portal-wash, #efeeea);
    font-size: 0.85rem;
  }
  .person__inline-links {
    display: flex !important;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .person__inline-links a {
    min-height: var(--ja-target-min, 2.75rem);
    display: inline-flex;
    align-items: center;
  }
  @media (max-width: 900px) {
    .people__filters {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .people__search {
      grid-column: 1 / -1;
    }
  }
  @media (max-width: 760px) {
    .people__row.people__row--head {
      display: none;
    }
    .people__row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.15rem 0.6rem;
      padding: 0.6rem 0.85rem;
      font-size: 0.82rem;
    }
    .people__person {
      flex: 1 1 100%;
    }
    .people__role,
    .people__projects,
    .people__week,
    .people__mailbox {
      flex: 0 1 auto;
    }
    .people__role {
      margin-left: 2.9rem;
    }
    .people__role::after,
    .people__projects::after {
      content: '·';
      margin-left: 0.6rem;
      color: var(--portal-muted, #5b6670);
    }
    .people__mailbox[data-mailbox-linked='1'] {
      display: none;
    }
    .people__name small {
      display: none;
    }
  }
  @media (max-width: 640px) {
    .person__stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem;
    }
    .person__stats dd {
      font-size: 1.15rem;
    }
    .people__toolbar > * {
      flex: 1 1 auto;
    }
    .person__identity h3 {
      font-size: 1.25rem;
    }
    .person__danger-actions form,
    .person__danger-actions button {
      width: 100%;
    }
  }
</style>
