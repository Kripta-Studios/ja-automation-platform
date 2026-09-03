<script lang="ts">
  import { replaceState } from '$app/navigation';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { createAuthClient } from 'better-auth/client';
  import { passkeyClient } from '@better-auth/passkey/client';
  import { onMount, tick } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import {
    documentLanguage,
    normalizePortalLocale,
    portalText,
    translatePortalDom,
    type PortalLocale,
  } from './portal-i18n';
  import {
    mobilePrimaryNavigationFor,
    portalNavigationForRole,
    portalTitleFor,
    type NavItem,
  } from './portal-navigation';
  import PortalChrome from './PortalChrome.svelte';
  import {
    FormCard,
    FormSection,
    FieldGroup,
    Field,
    TableRegion,
    ToastRegion,
    formValidation,
  } from './portal/ui';
  import type { ToastItem } from './portal/ui';
  import TodaySection from './portal/sections/TodaySection.svelte';
  import TimeSection from './portal/sections/TimeSection.svelte';
  import ExpenseSection from './portal/sections/ExpenseSection.svelte';
  import ReportSection from './portal/sections/ReportSection.svelte';
  import ProjectSection, {
    type ProjectLifecycleAction,
  } from './portal/sections/ProjectSection.svelte';
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
  import { createOfflineController } from './portal/offline-controller';
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
    money,
  } from './portal/portal-format';
  import { configureOfflineIdentity, queueMutation, type OfflineAttachment } from './offline';
  import { paymentMoney } from './portal/payment-money';
  import {
    hasControlledValue,
    translateControlledValue,
    type ControlledValueDomain,
  } from './i18n/controlled-values';

  let { data, form }: { data: PortalData; form?: ActionResult } = $props();

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
  let conflictItems = $state<Array<{ mutationId: string; entityType: string; createdAt: string }>>(
    [],
  );
  let menuOpen = $state(false);
  let searchOpen = $state(false);
  let searchInput = $state<HTMLInputElement | null>(null);
  let searchValue = $derived(data.searchQuery ?? '');
  let offlineProjects = $state<Row[]>([]);
  let locale = $state<PortalLocale>('en');
  let securityMessage = $state('');
  let securitySucceeded = $state(false);
  type WorkerStatementFormat = 'pdf' | 'csv';
  type WorkerStatementStatus = 'queued' | 'running' | 'ready' | 'failed';
  type WorkerStatementArtifact = {
    artifactId: string;
    format: WorkerStatementFormat;
    status: WorkerStatementStatus;
    errorCode?: string | null;
  };
  let workerStatementArtifacts = $state<WorkerStatementArtifact[]>([]);
  let workerStatementBusy = $state(false);
  let workerStatementPolling = $state(false);
  let workerStatementError = $state('');
  let dismissedToastIds = $state<string[]>([]);
  type ProjectWorkflow =
    | 'new-client'
    | 'update-client'
    | 'new-project'
    | 'assign-worker'
    | 'update-assignment'
    | 'remove-assignment';
  let projectWorkflow = $state<ProjectWorkflow | null>(null);
  let passkeyName = $state('');
  let mfaPassword = $state('');
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
      case 'Step-up authentication is active for the next 10 minutes.':
        return portalText(locale, 'Step-up authentication is active for the next 10 minutes.');
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
            auditor_read_only: 'admin',
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
    stepUpRequired?: unknown;
    identityScope?: unknown;
    workerId?: unknown;
    userId?: unknown;
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

  const roleNavigation = $derived(portalNavigationForRole(base, data.user.role));
  const navigation: readonly NavItem[] = $derived(roleNavigation.primary);
  const mobileNavigation: readonly NavItem[] = $derived(mobilePrimaryNavigationFor(roleNavigation));
  const secondaryNavigation: readonly NavItem[] = $derived(roleNavigation.secondary);
  const visibleAdmin: readonly NavItem[] = $derived(roleNavigation.admin);
  const securityAdmin: readonly NavItem[] = $derived(roleNavigation.security);
  const currentView = $derived($page.url.searchParams.get('view') ?? '');
  const currentTitle = $derived(portalTitleFor(data.section, currentView));
  const formIdentity = $derived.by(() => {
    const result = form as ActionResultWithMessageKey | undefined;
    const stepUpRequired = Boolean(result?.stepUpRequired);
    const identityScope = typeof result?.identityScope === 'string' ? result.identityScope : '';
    const workerId = typeof result?.workerId === 'string' ? result.workerId : '';
    const userId = typeof result?.userId === 'string' ? result.userId : '';
    return {
      invitationNeedsIdentity: stepUpRequired && identityScope === 'invitation',
      profileNeedsIdentity: stepUpRequired && identityScope === 'workerProfile',
      statusNeedsIdentity: stepUpRequired && identityScope === 'userStatus',
      identityWorkerId: workerId || userId,
    };
  });
  const actionFeedback = $derived(actionMessage(form));
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
  const profileWorkerId = $derived(
    (() => {
      const requested = $page.url.searchParams.get('worker');
      const workers = data.workers ?? [];
      if (requested && workers.some((worker) => String(worker.id) === requested)) return requested;
      return String(workers[0]?.id ?? data.user.id);
    })(),
  );
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
    data.projects && data.projects.length > 0 ? data.projects : offlineProjects,
  );
  const operationalProjects = $derived(
    availableProjects.filter((project) =>
      ['active', 'planned', 'paused'].includes(String(project.status ?? 'active')),
    ),
  );
  const activeProjects = $derived(operationalProjects);
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
  const activeClients = $derived(
    (data.clients ?? []).filter((client) => String(client.status ?? 'active') !== 'archived'),
  );
  const href = (section: string) =>
    section === 'today' ? `${base}/app/` : `${base}/app/${section}`;
  const itemHref = (item: NavItem) => item.href ?? href(item.section);
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
      const failed = /could not|select a project/i.test(syncMessage);
      add(
        `sync:${syncMessage}`,
        translate(syncMessage),
        failed ? 'danger' : 'info',
        failed ? translate('Error') : translate('Success'),
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

  function handleGlobalKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
    event.preventDefault();
    searchOpen = true;
    void tick().then(() => {
      searchInput?.focus();
      searchInput?.select();
    });
  }

  const offlineController = createOfflineController(base, {
    setOnline: (value) => (online = value),
    setQueue: (value) => (queue = value),
    setSyncMessage: (value) => (syncMessage = value),
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
        (candidate.status === 'queued' ||
          candidate.status === 'running' ||
          candidate.status === 'ready' ||
          candidate.status === 'failed')
      );
    });
  }

  function workerStatementArtifact(format: WorkerStatementFormat): WorkerStatementArtifact | null {
    return workerStatementArtifacts.find((artifact) => artifact.format === format) ?? null;
  }

  async function loadWorkerStatementArtifacts(): Promise<boolean> {
    const query = new URLSearchParams({
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
    });
    const response = await fetch(`${base}/app/api/worker-statement?${query.toString()}`, {
      headers: { accept: 'application/json' },
    });
    const payload = (await response.json().catch(() => ({}))) as {
      artifacts?: unknown;
      error?: unknown;
    };
    if (!response.ok) {
      workerStatementError =
        typeof payload.error === 'string' ? payload.error : 'The action could not be completed.';
      return false;
    }
    applyWorkerStatementArtifacts(payload.artifacts);
    const pending = workerStatementArtifacts.some(
      (artifact) => artifact.status === 'queued' || artifact.status === 'running',
    );
    const failed = workerStatementArtifacts.find((artifact) => artifact.status === 'failed');
    workerStatementError =
      !pending && failed
        ? (failed.errorCode ?? 'Worker statement artifact generation failed.')
        : '';
    return pending;
  }

  async function pollWorkerStatementArtifacts(): Promise<void> {
    if (workerStatementPolling) return;
    workerStatementPolling = true;
    try {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const pending = await loadWorkerStatementArtifacts();
        if (!pending) return;
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      if (
        workerStatementArtifacts.some(
          (artifact) => artifact.status === 'queued' || artifact.status === 'running',
        )
      )
        workerStatementError = 'Queued artifacts are processed automatically in the background.';
    } finally {
      workerStatementPolling = false;
    }
  }

  async function requestWorkerStatement(): Promise<void> {
    if (workerStatementBusy || workerStatementPolling) return;
    workerStatementBusy = true;
    workerStatementError = '';
    try {
      const response = await fetch(`${base}/app/api/worker-statement`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          refresh: workerStatementArtifacts.length > 0,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        artifacts?: unknown;
        error?: unknown;
      };
      if (!response.ok) {
        workerStatementError =
          typeof payload.error === 'string' ? payload.error : 'The action could not be completed.';
        return;
      }
      applyWorkerStatementArtifacts(payload.artifacts);
      if (
        workerStatementArtifacts.some(
          (artifact) => artifact.status === 'queued' || artifact.status === 'running',
        )
      )
        void pollWorkerStatementArtifacts();
    } finally {
      workerStatementBusy = false;
    }
  }

  onMount(() => {
    const queryLocale = new URLSearchParams(location.search).get('lang');
    const savedLocale = localStorage.getItem('ja-portal-locale');
    locale = normalizePortalLocale(queryLocale ?? savedLocale ?? 'en');
    localStorage.setItem('ja-portal-locale', locale);
    document.documentElement.lang = documentLanguage(locale);
    document.addEventListener('keydown', handleGlobalKeydown);
    if (location.hash === '#new-project') {
      const newProjectDetails = document.getElementById('new-project');
      if (newProjectDetails instanceof HTMLDetailsElement) newProjectDetails.open = true;
    }
    if (data.offlineEnabled !== false) {
      configureOfflineIdentity(data.user.id);
      stopOfflineController = offlineController.start();
    }
    if (data.section === 'pay' && data.pay) {
      void loadWorkerStatementArtifacts().then((pending) => {
        if (pending) void pollWorkerStatementArtifacts();
      });
    }
    // Only ask the passkey endpoint for a real authenticated Better Auth
    // session; otherwise its expected 401 would surface as a browser error.
    void authClient.getSession().then((result) => {
      if (result.data?.user) void refreshPasskeys();
    });
    return () => {
      document.removeEventListener('keydown', handleGlobalKeydown);
      stopOfflineController?.();
      stopOfflineController = null;
    };
  });
  $effect(() => {
    const projects = data.projects;
    if (data.offlineEnabled !== false && projects?.length)
      void offlineController.cacheAssignments(projects);
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
    localStorage.setItem('ja-portal-locale', selected);
    const url = new URL(location.href);
    url.searchParams.set('lang', selected);
    replaceState(url, {});
  }

  async function discardConflict(mutationId: string) {
    await offlineController.discardConflict(mutationId);
  }
  async function refreshPasskeys(): Promise<void> {
    const result = await authClient.passkey.listUserPasskeys();
    if (result.data) passkeys = result.data;
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

  async function toggleMfa(action: 'enable' | 'verify' | 'disable'): Promise<void> {
    const response = await fetch(`${base}/app/api/security/mfa`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action,
        ...(action === 'verify' ? { code: mfaCode } : { password: mfaPassword }),
      }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
      totpURI?: string;
      backupCodes?: string[];
      requiresVerification?: boolean;
    };
    securitySucceeded = response.ok;
    securityMessage = response.ok
      ? action === 'verify'
        ? 'MFA enabled.'
        : action === 'disable'
          ? 'MFA disabled.'
          : 'MFA setup started.'
      : 'MFA could not be updated.';
    if (response.ok) {
      mfaPassword = '';
      if (action === 'enable') {
        mfaSetupUri = result.totpURI ?? '';
        mfaBackupCodes = result.backupCodes ?? [];
      } else if (action === 'verify') {
        mfaCode = '';
        mfaSetupUri = '';
        mfaBackupCodes = [];
        data.user.mfaEnrolled = true;
      } else {
        data.user.mfaEnrolled = false;
      }
    }
  }

  function verifyMfa(event: SubmitEvent): void {
    event.preventDefault();
    void toggleMfa('verify');
  }

  type OfflineEntity = 'time' | 'daily_report' | 'technical_report' | 'expense';

  async function saveOfflineDraft(event: SubmitEvent, entityType: OfflineEntity): Promise<void> {
    if (online) return;
    event.preventDefault();
    const formElement = event.currentTarget as HTMLFormElement;
    const formData = new FormData(formElement);
    const projectId = formValue(formData, 'projectId');
    if (!projectId) {
      syncMessage = 'Select a project before saving an offline draft.';
      return;
    }
    const payload =
      entityType === 'time'
        ? compact({
            projectId,
            workDate: formValue(formData, 'workDate'),
            category: formValue(formData, 'category'),
            activityCode: formValue(formData, 'activityCode'),
            minutes: formNumber(formData, 'minutes'),
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
    try {
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
      await offlineController.refreshQueue();
      syncMessage = 'Offline — saved on this device';
      formElement.reset();
    } catch {
      syncMessage = 'Offline draft could not be saved on this device.';
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
        <span>{translate(`${data.section.toUpperCase()} REPORT`)}</span>
        <strong>{new Date().toISOString().slice(0, 10)}</strong>
      </div>
    </header>
    <div class="portal-title">
      <div>
        <p class="portal-kicker">J&A / {data.section.toUpperCase()}</p>
        <h1 data-portal-live-text>{translate(currentTitle)}</h1>
      </div>
      <div class="portal-heading-tools">
        <button type="button" class="no-print print-trigger" onclick={printReport}>
          <span aria-hidden="true">⎙</span>
          {translate('Print report')}
        </button>
        <form
          class="global-search"
          method="GET"
          action={href(data.section)}
          role="search"
          onsubmit={() => (searchOpen = false)}
        >
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
                      role="option"
                      aria-selected="false"
                      onclick={() => setTimeout(() => (searchOpen = false), 0)}
                      onkeydown={(event) => handleSearchOptionKeydown(event, optionIndex)}
                    >
                      <span>
                        <strong>{String(suggestion.label ?? translate('Record'))}</strong>
                        <small>{group.label} · {String(suggestion.detail ?? '')}</small>
                      </span>
                      <i aria-hidden="true">↗</i>
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
      </div>
    </div>
    {#if conflictItems.length > 0}
      <section class="conflict-panel" aria-labelledby="offline-conflicts-title">
        <div>
          <span class="portal-kicker">{translate('OFFLINE REVIEW')}</span>
          <h2 id="offline-conflicts-title">{translate('Server changes need your review')}</h2>
          <p>
            {translate(
              'Your offline draft stayed on this device. Compare it with the server record before discarding it.',
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
    {#if (data.searchQuery ?? '').length >= 2}
      <section class="record-list full search-results" aria-live="polite">
        <div class="panel-title">
          <h2>{translate('Search results')}</h2>
          <span>{data.searchResults?.length ?? 0} {translate('matches')}</span>
        </div>
        {#each groupedSearchResults as group}
          <div class="search-result-group" role="group" aria-label={group.label}>
            <h3>{group.label}</h3>
            {#each group.rows as result}
              <a class="search-result" href={searchHref(result)}>
                <strong>{String(result.label ?? translate('Result'))}</strong>
                <small>{group.label} · {String(result.detail ?? '')}</small>
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
        {base}
        {data}
        {availableProjects}
        {online}
        {queue}
        {syncMessage}
        {money}
        {translate}
        {controlledValue}
        canCreateProject={canManageProjects}
        canCreateInvoiceDraft={canManageProjects}
        {invoiceDraftHref}
        canViewPendingReports={Boolean(data.dashboard)}
      />
    {:else if data.section === 'time'}
      <TimeSection
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
        {isAuditor}
        {availableProjects}
        {saveOfflineDraft}
        {translate}
        {controlledValue}
      />
    {:else if data.section === 'documents'}
      <div class="document-workspace">
        <FormCard title={translate('Register a private artifact')} class="document-upload-panel">
          <div class="panel-title">
            <div>
              <h2>{translate('Register a private artifact')}</h2>
              <p class="form-help">
                {translate(
                  'Receipts, PLC backups and project reports are validated, hashed and kept outside the public site.',
                )}
              </p>
            </div>
          </div>
          {#if !isAuditor}
            <form
              method="POST"
              action="?/uploadPrivateDocument"
              enctype="multipart/form-data"
              use:formValidation
            >
              <FormSection title={translate('Artifact details')}>
                <FieldGroup columns="2">
                  <Field
                    id="doc-project"
                    label={translate('Project')}
                    required
                    data-field="projectId"
                  >
                    <select id="doc-project" name="projectId" required>
                      <option value="">{translate('Select assignment')}</option>
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
                      required
                    />
                  </Field>
                  <Field
                    id="doc-sensitivity"
                    label={translate('Sensitivity')}
                    data-field="sensitivity"
                  >
                    <select id="doc-sensitivity" name="sensitivity">
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
        </FormCard>
        <section class="record-list full">
          <div class="panel-title">
            <div>
              <h2>{translate('Private project documents')}</h2>
              <p class="form-help">
                {translate('Files are private, hash-verified, and authorized on every download.')}
              </p>
            </div>
            <span>{data.documents?.length ?? 0} {translate('files')}</span>
          </div>
          {#each data.documents ?? [] as document}<article class="invoice-row">
              <div>
                <strong
                  >{String(
                    document.safe_filename ?? document.original_filename ?? translate('Document'),
                  )}</strong
                >
                <small
                  >{String(document.project_number ?? 'Private')} · {String(document.artifact_type)} ·
                  {String(document.byte_length)} bytes</small
                >
              </div>
              <div class="record-actions">
                <span class="state-tag">{String(document.sensitivity ?? 'internal')}</span>
                <a
                  class="preview-link"
                  target="_blank"
                  href={`${base}/app/api/documents/${String(document.id)}?view=1`}
                  >{translate('View')}</a
                >
                <a class="preview-link" href={`${base}/app/api/documents/${String(document.id)}`}
                  >{translate('Download')}</a
                >
                {#if data.user.role === 'owner_admin' || data.user.id === document.owner_id}
                  <form
                    method="POST"
                    action="?/deleteDocument"
                    class="document-delete-form"
                    onsubmit={(e) => {
                      if (!confirm(translate('Are you sure you want to delete this document?')))
                        e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="documentId" value={String(document.id)} />
                    <button type="submit" class="preview-link preview-link-danger"
                      >{translate('Delete')}</button
                    >
                  </form>
                {/if}
              </div>
            </article>{:else}<div class="empty">
              {translate('No private documents are available in your access scope.')}
            </div>{/each}
        </section>
      </div>
    {:else if data.section === 'pay' && data.pay}
      <form class="filter-form">
        <label>{translate('From')}<input name="start" type="date" value={data.periodStart} /></label
        ><label>{translate('Through')}<input name="end" type="date" value={data.periodEnd} /></label
        ><button>{translate('Apply period')}</button>
      </form>
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
            <button
              type="button"
              class="preview-link"
              disabled={workerStatementBusy || workerStatementPolling}
              aria-busy={workerStatementBusy || workerStatementPolling}
              onclick={() => void requestWorkerStatement()}>{translate('Generate report')}</button
            >
            {#each ['pdf', 'csv'] as format}
              {@const artifact = workerStatementArtifact(format as WorkerStatementFormat)}
              {#if artifact?.status === 'ready'}
                <a
                  class="preview-link"
                  aria-label={format === 'pdf'
                    ? translate('Download worker statement PDF')
                    : translate('Download worker statement CSV')}
                  href={`${base}/app/api/worker-statement/artifacts/${artifact.artifactId}/download`}
                  >{translate(format.toUpperCase())} · {translate('Ready')}</a
                >
              {:else if artifact}
                <span
                  class="state-tag"
                  data-ui="status-badge"
                  data-variant={artifact.status === 'failed' ? 'danger' : 'warning'}
                  >{translate(format.toUpperCase())} · {controlledValue(
                    'artifactState',
                    artifact.status,
                  )}</span
                >
              {/if}
            {/each}
          </div>
        </div>
        {#if workerStatementError}
          <p class="form-error" role="alert">{workerStatementError}</p>
        {:else if workerStatementBusy || workerStatementPolling}
          <p class="form-help" role="status" aria-live="polite">
            {translate('Queued artifacts are processed automatically in the background.')}
          </p>
        {/if}
      </section>
      <div class="finance-grid">
        <a href="{base}/app/time" class="metric metric-link">
          <span>{translate('APPROVED COMPENSATION')}</span><strong
            >{paymentMoney(data.pay.estimatedApprovedMinor, data.pay.currency)}</strong
          >
          <p>{data.pay.approvedMinutes} {translate('approved minutes')}</p>
        </a>
        <a href="{base}/app/expenses" class="metric metric-link">
          <span>{translate('APPROVED REIMBURSEMENTS')}</span><strong
            >{paymentMoney(data.pay.approvedReimbursementMinor, data.pay.currency)}</strong
          >
          <p>
            {translate('Pending pay:')}
            {paymentMoney(data.pay.estimatedPendingMinor, data.pay.currency)} + {paymentMoney(
              data.pay.pendingReimbursementMinor,
              data.pay.currency,
            )}
            {translate('reimbursements.')}
          </p>
        </a>
      </div>
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
          <strong>{translate('Privacy boundary')}</strong>
          <p>
            {translate(
              'This view contains only your own time, reimbursement, and compensation estimate. Client rates, internal cost, margin, and other workers remain restricted.',
            )}
          </p>
          {#if (data.pay.missingCompensationRules ?? 0) > 0}<p class="warning">
              {data.pay.missingCompensationRules}
              {translate(
                'time record(s) have no matching compensation rule and require Finance review.',
              )}
            </p>{/if}
          {#if data.pay.settlementTriggers?.length}<p>
              {translate('Settlement trigger:')}
              {data.pay.settlementTriggers.join(' · ')}
            </p>{/if}
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
                  ><td>{hours(row.actualMinutes ?? 0)}</td><td>{hours(row.approvedMinutes ?? 0)}</td
                  ><td>{hours(row.pendingMinutes ?? 0)}</td><td
                    >{row.plannedMinutes === null ? '—' : hours(row.plannedMinutes)}</td
                  ><td>{row.hoursRemaining === null ? '—' : hours(row.hoursRemaining)}</td><td
                    >{paymentMoney(String(row.estimatedApprovedMinor), String(row.currency))}</td
                  ><td>{paymentMoney(String(row.estimatedPendingMinor), String(row.currency))}</td
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
                  <td>{hours(activity.actualMinutes ?? 0)}</td>
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
            <p>{translate('Expected and actual payment dates for your own approved work.')}</p>
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
                <th>{translate('State')}</th>
                <th>{translate('Expected payment')}</th>
                <th>{translate('Actual payment')}</th>
                <th>{translate('Own amount')}</th>
              </tr>
            </thead>
            <tbody>
              {#each data.settlements ?? [] as settlement}
                <tr>
                  <td>
                    <a href="{base}/app/projects/{String(settlement.projectId ?? '')}">
                      {String(settlement.projectNumber ?? '—')} · {String(
                        settlement.periodStart ?? '—',
                      )} → {String(settlement.periodEnd ?? '—')}
                    </a>
                  </td>
                  <td>{controlledValue('status', settlement.state)}</td>
                  <td>{String(settlement.expectedPaymentOn ?? translate('Not scheduled'))}</td>
                  <td>{String(settlement.settledAt ?? translate('Not paid yet'))}</td>
                  <td>{paymentMoney(settlement.amountMinor, String(settlement.currency))}</td>
                </tr>
              {:else}
                <tr>
                  <td colspan="5">{translate('No compensation settlements in this period.')}</td>
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
              {translate('Expected and actual reimbursement dates for your own approved expenses.')}
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
                    >{String(expense.vendor ?? '—')} · {controlledValue(
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
                  <td>{paymentMoney(expense.reimbursementAmountMinor, String(expense.currency))}</td
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
    {:else if data.section === 'projects' && currentView === 'clients'}
      <ClientDirectorySection
        clients={data.clients ?? []}
        contacts={data.contacts ?? []}
        projects={data.projects ?? []}
        canManageContacts={canManageClientContacts}
        {translate}
        {controlledValue}
      />
    {:else if data.section === 'projects' && currentView === 'team'}
      <TeamDirectorySection
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
        projects={availableProjects}
        role={data.user.role}
        capabilities={{
          canCreateProject: false,
          canTransitionProject: false,
          canManageClients: false,
        }}
        getProjectLifecycleActions={projectLifecycleActions}
        {translate}
        {controlledValue}
      />
    {:else if data.section === 'projects'}
      <div class="management-stack">
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
              <button
                type="button"
                class="primary-button"
                class:active={projectWorkflow === 'new-client'}
                onclick={() => (projectWorkflow = 'new-client')}>{translate('New Client')}</button
              >
              <button
                type="button"
                class="primary-button"
                class:active={projectWorkflow === 'update-client'}
                onclick={() => (projectWorkflow = 'update-client')}
                >{translate('Update Client')}</button
              >
              <button
                type="button"
                class="primary-button"
                class:active={projectWorkflow === 'new-project'}
                onclick={() => (projectWorkflow = 'new-project')}>{translate('New Project')}</button
              >
              {#if canManageAssignmentControls}
                <button
                  type="button"
                  class="primary-button"
                  class:active={projectWorkflow === 'assign-worker'}
                  onclick={() => (projectWorkflow = 'assign-worker')}
                  >{translate('Assign Worker')}</button
                >
                <button
                  type="button"
                  class="primary-button"
                  class:active={projectWorkflow === 'update-assignment'}
                  onclick={() => (projectWorkflow = 'update-assignment')}
                  >{translate('Update Assignment')}</button
                >
                <button
                  type="button"
                  class="primary-button danger-outline"
                  class:active={projectWorkflow === 'remove-assignment'}
                  onclick={() => (projectWorkflow = 'remove-assignment')}
                  >{translate('Remove Assignment')}</button
                >
              {/if}
            </div>
          </nav>
          {#if projectWorkflow === 'new-client'}
            <section
              class="admin-details project-workflow-panel"
              data-project-workflow="new-client"
            >
              <form method="POST" action="?/createClient" class="admin-form-grid">
                <h2>{translate('Create client')}</h2>
                <label>{translate('Legal name')}<input name="legalName" required /></label><label
                  >{translate('Display name')}<input name="displayName" required /></label
                ><label
                  >{translate('Client code (optional)')}<input
                    name="clientCode"
                    maxlength="40"
                  /></label
                ><label
                  >{translate('Currency')}<select name="currency"
                    ><option>USD</option><option>BRL</option><option>EUR</option></select
                  ></label
                ><label
                  >{translate('Timezone')}<input
                    name="timezone"
                    value="America/New_York"
                    required
                  /></label
                ><label
                  >{translate('Billing contact name')}<input name="billingContactName" /></label
                ><label
                  >{translate('Billing contact email')}<input
                    name="billingEmail"
                    type="email"
                  /></label
                ><label class="wide-field"
                  >{translate('Billing address')}<textarea name="billingAddress" rows="3" required
                  ></textarea></label
                ><label
                  >{translate('Payment terms (days)')}<input
                    name="paymentTermsDays"
                    type="number"
                    min="0"
                    max="365"
                    value="30"
                    required
                  /></label
                ><label>{translate('PO / reference')}<input name="poReference" /></label><label
                  class="wide-field"
                  >{translate('Notes')}<textarea name="notes" rows="2"></textarea></label
                >
                <button>{translate('Create client')}</button>
              </form>
            </section>
          {/if}
          {#if projectWorkflow === 'update-client'}
            <section
              class="admin-details project-workflow-panel"
              data-project-workflow="update-client"
            >
              <p class="form-help">
                {translate(
                  "Each editor carries the record version it displayed. A stale submission is rejected so another administrator's changes are not overwritten.",
                )}
              </p>
              {#each data.clients as client}
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
            >
              <form method="POST" action="?/createProject" class="admin-form-grid">
                <h2>{translate('Create project')}</h2>
                <label
                  >{translate('Client')}<select name="clientId" required
                    >{#each activeClients as client}<option value={client.id}
                        >{client.client_number} — {client.display_name}</option
                      >{/each}</select
                  ></label
                ><label>{translate('Name')}<input name="name" required /></label><label
                  >{translate('Cost center code')}<input
                    name="costCenterCode"
                    maxlength="120"
                    required
                  /></label
                ><label
                  >{translate('Description')}<textarea name="description" rows="2"
                  ></textarea></label
                ><label>{translate('Project alias')}<input name="projectAlias" /></label><label
                  >{translate('Currency')}<select name="currency"
                    ><option>USD</option><option>BRL</option><option>EUR</option></select
                  ></label
                ><label
                  >{translate('Project manager')}<select name="projectManagerId"
                    ><option value="">{translate('Unassigned')}</option
                    >{#each data.workers ?? [] as worker}{#if worker.role === 'project_manager' && worker.status === 'active'}<option
                          value={worker.id}>{worker.name}</option
                        >{/if}{/each}</select
                  ></label
                ><label
                  >{translate('Billing model')}<select name="billingModel"
                    ><option value="tm">{translate('Time & materials')}</option><option
                      value="tm_daily_minimum">{translate('T&M · daily minimum')}</option
                    ><option value="all_in">{translate('All-in')}</option><option value="capped_tm"
                      >{translate('Capped T&M')}</option
                    ></select
                  ></label
                ><label
                  >{translate('Site timezone')}<input
                    name="timezone"
                    value="America/New_York"
                    required
                  /></label
                ><label>{translate('Start date')}<input name="startDate" type="date" /></label
                ><label
                  >{translate('Planned end date (optional)')}<input
                    name="plannedEndDate"
                    type="date"
                  /></label
                ><label
                  >{translate('Expected hours / day')}<input
                    name="expectedHoursPerDay"
                    type="number"
                    step="0.25"
                    min="0"
                    max="24"
                    value="10"
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
                    placeholder="8.0"
                  /></label
                ><label
                  >{translate('Budget type')}<select name="budgetType"
                    ><option value="none">{translate('No budget')}</option><option value="revenue"
                      >{translate('Revenue')}</option
                    ><option value="purchase_order">{translate('Purchase order')}</option><option
                      value="labor">{translate('Labor')}</option
                    ><option value="travel">{translate('Travel')}</option><option value="combined"
                      >{translate('Combined')}</option
                    ></select
                  ></label
                ><label
                  >{translate('Revenue budget (minor)')}<input
                    name="revenueBudgetMinor"
                    inputmode="numeric"
                    pattern="[0-9]*"
                  /></label
                ><label
                  >{translate('PO cap (minor)')}<input
                    name="poCapMinor"
                    inputmode="numeric"
                    pattern="[0-9]*"
                  /></label
                ><label
                  >{translate('Labor budget minutes')}<input
                    name="laborBudgetMinutes"
                    type="number"
                    min="0"
                  /></label
                ><label
                  >{translate('Travel budget (minor)')}<input
                    name="travelBudgetMinor"
                    inputmode="numeric"
                    pattern="[0-9]*"
                  /></label
                ><label class="check"
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
              >
                <form method="POST" action="?/assignWorker" class="admin-form-grid">
                  <h2>{translate('Assign worker')}</h2>
                  <label
                    >{translate('Project')}<select name="projectId" required
                      >{#each activeProjects as project}<option value={project.id}
                          >{project.project_number}</option
                        >{/each}</select
                    ></label
                  ><label
                    >{translate('Worker')}<select name="workerId" required
                      >{#each data.workers ?? [] as worker}<option value={worker.id}
                          >{worker.name} — {controlledValue('role', worker.role)}</option
                        >{/each}</select
                    ></label
                  ><label
                    >{translate('Role')}<input
                      name="assignmentRole"
                      value="worker"
                      required
                    /></label
                  ><label
                    >{translate('Starts on')}<input name="startsOn" type="date" required /></label
                  ><label
                    >{translate('Ends on (optional)')}<input name="endsOn" type="date" /></label
                  ><button>{translate('Assign')}</button>
                </form>
              </section>
            {/if}
            {#if projectWorkflow === 'update-assignment'}
              <section
                class="admin-details project-workflow-panel"
                data-project-workflow="update-assignment"
              >
                <h2>{translate('Update assignment')}</h2>
                {#each (data.assignments ?? []).filter((assignment) => assignment.status === 'active') as assignment}
                  <form
                    method="POST"
                    action="?/updateAssignment"
                    class="admin-form-grid assignment-edit-form"
                  >
                    <input type="hidden" name="assignmentId" value={assignment.id} />
                    <input type="hidden" name="version" value={assignment.version ?? 1} />
                    <p class="form-help wide-field">
                      {assignment.project_number} · {assignment.project_name} · {assignment.worker_name}
                    </p>
                    <label
                      >{translate('Starts on')}<input
                        name="startsOn"
                        type="date"
                        value={String(assignment.starts_on ?? '')}
                        required
                      /></label
                    >
                    <label
                      >{translate('Ends on')}<input
                        name="endsOn"
                        type="date"
                        value={String(assignment.ends_on ?? '')}
                      /></label
                    >
                    <label
                      >{translate('Planned minutes')}<input
                        name="plannedMinutes"
                        type="number"
                        min="0"
                        value={assignment.planned_minutes ?? ''}
                      /></label
                    >
                    <label class="check"
                      ><input
                        name="canReview"
                        type="checkbox"
                        checked={Boolean(assignment.can_review)}
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
                class="admin-details project-workflow-panel"
                data-project-workflow="remove-assignment"
              >
                <h2>{translate('Remove assignment')}</h2>
                <p class="form-help">
                  {translate(
                    'Removal ends the assignment and preserves its historical row. It never hard-deletes project history.',
                  )}
                </p>
                {#each (data.assignments ?? []).filter((assignment) => assignment.status === 'active') as assignment}
                  <form
                    method="POST"
                    action="?/removeAssignment"
                    class="admin-form-grid assignment-remove-form"
                    data-action="removeAssignment"
                  >
                    <input type="hidden" name="assignmentId" value={assignment.id} />
                    <input type="hidden" name="version" value={assignment.version ?? 1} />
                    <p class="form-help wide-field">
                      {assignment.project_number} · {assignment.project_name} · {assignment.worker_name}
                    </p>
                    <label
                      >{translate('End date')}<input
                        name="endsOn"
                        type="date"
                        min={String(assignment.starts_on ?? '')}
                        value={String(assignment.ends_on ?? '')}
                      /></label
                    >
                    <label class="wide-field"
                      >{translate('Removal reason')}<input
                        name="reason"
                        required
                        maxlength="2000"
                      /></label
                    >
                    <button class="danger">{translate('Remove assignment')}</button>
                  </form>
                {:else}<p class="empty">{translate('No active assignments to remove.')}</p>{/each}
              </section>
            {/if}
          {/if}
        {/if}
        <section class="record-list full">
          <div class="panel-title">
            <h2>{translate('Authorized projects')}</h2>
            <span>{availableProjects.length}</span>
          </div>
          {#each availableProjects as row}
            <article class="project-list-link">
              <a href={`${base}/app/projects/${row.id}`}>
                <div>
                  <strong>{row.project_number} · {row.name}</strong><small
                    >{controlledValue('status', row.status)} · {row.currency} · {row.timezone} · {row.start_date ??
                      translate('No start')} → {row.planned_end_date ??
                      translate('Open target')}</small
                  >
                </div>
                <span>{translate('OPEN PROJECT →')}</span>
              </a>
              {#if canManageProjects}
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
                      <button type="submit" class="danger">{translate('Archive project')}</button>
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
              {/if}
            </article>
          {:else}<div class="empty">{translate('No projects available.')}</div>{/each}
        </section>
        {#if canManageProjects}
          <section class="record-list full client-management-list">
            <div class="panel-title">
              <div>
                <h2>{translate('Clients')}</h2>
                <p class="form-help">
                  {translate(
                    'Archived clients remain visible to management for safe restore; workers never receive this list.',
                  )}
                </p>
              </div>
              <span>{data.clients?.length ?? 0}</span>
            </div>
            {#each data.clients ?? [] as client}
              <article class="record-card" data-client-id={client.id}>
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
          </section>
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
            <details class="admin-details">
              <summary class="primary-button">{translate('Create Milestone')}</summary>
              <form method="POST" action="?/createMilestone" class="admin-form-grid">
                <h2>{translate('Create milestone')}</h2>
                <label
                  >{translate('Project')}<select name="projectId" required
                    >{#each activeProjects as project}<option value={project.id}
                        >{project.project_number} — {project.name}</option
                      >{/each}</select
                  ></label
                ><label>{translate('Name')}<input name="name" required /></label><label
                  >{translate('Description')}<textarea name="description" rows="2"
                  ></textarea></label
                ><label
                  >{translate('Amount (minor)')}<input
                    name="amountMinor"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    required
                  /></label
                ><label>{translate('Due on')}<input name="dueOn" type="date" /></label><button
                  >{translate('Save milestone')}</button
                >
              </form>
            </details>
            <details class="admin-details">
              <summary class="primary-button">{translate('Expected Working Schedule')}</summary>
              <form method="POST" action="?/updateSchedule" class="admin-form-grid">
                <h2>{translate('Expected working schedule')}</h2>
                <label
                  >{translate('Project')}<select name="projectId" required
                    >{#each operationalProjects as project}<option value={project.id}
                        >{project.project_number} — {project.name}</option
                      >{/each}</select
                  ></label
                ><label
                  >{translate('Timezone')}<input
                    name="timezone"
                    value="America/New_York"
                    required
                  /></label
                ><label
                  >{translate('Effective from')}<input
                    name="effectiveFrom"
                    type="date"
                    required
                  /></label
                >
                <label
                  >{translate('Mon minutes')}<input
                    name="mondayMinutes"
                    type="number"
                    min="0"
                    max="1440"
                    required
                  /></label
                ><label
                  >{translate('Tue minutes')}<input
                    name="tuesdayMinutes"
                    type="number"
                    min="0"
                    max="1440"
                    required
                  /></label
                ><label
                  >{translate('Wed minutes')}<input
                    name="wednesdayMinutes"
                    type="number"
                    min="0"
                    max="1440"
                    required
                  /></label
                ><label
                  >{translate('Thu minutes')}<input
                    name="thursdayMinutes"
                    type="number"
                    min="0"
                    max="1440"
                    required
                  /></label
                ><label
                  >{translate('Fri minutes')}<input
                    name="fridayMinutes"
                    type="number"
                    min="0"
                    max="1440"
                    required
                  /></label
                ><label
                  >{translate('Sat minutes')}<input
                    name="saturdayMinutes"
                    type="number"
                    min="0"
                    max="1440"
                    required
                  /></label
                ><label
                  >{translate('Sun minutes')}<input
                    name="sundayMinutes"
                    type="number"
                    min="0"
                    max="1440"
                    value="0"
                    required
                  /></label
                ><button>{translate('Save schedule')}</button>
              </form>
            </details>
          {/if}
          <section class="record-list full assignment-history-list">
            <div class="panel-title">
              <div>
                <h2>{translate('Assignment history')}</h2>
                <p class="form-help">
                  {translate(
                    'Inactive rows remain available for audit and historical attribution.',
                  )}
                </p>
              </div>
              <span>{data.assignments?.length ?? 0}</span>
            </div>
            {#each data.assignments ?? [] as assignment}
              <article class="record-card">
                <div>
                  <strong>{assignment.project_number} · {assignment.project_name}</strong>
                  <small
                    >{assignment.worker_name} · {assignment.starts_on} → {assignment.ends_on ??
                      translate('Open assignment')} · {controlledValue(
                      'status',
                      assignment.status,
                    )}</small
                  >
                </div>
              </article>
            {:else}<div class="empty">{translate('No assignments recorded.')}</div>{/each}
          </section>
        {/if}
        {#if data.contacts}
          <section class="record-list full">
            <div class="panel-title">
              <h2>{translate('Client contacts')}</h2>
              <span>{data.contacts.length}</span>
            </div>
            {#each data.contacts as contact}
              <article class="record-card contact-card">
                <div>
                  <strong>{contact.client_number} · {contact.name}</strong><small
                    >{contact.email ?? translate('No email')} · {contact.role ??
                      translate('Contact')}{contact.is_billing_contact
                      ? ` · ${translate('billing')}`
                      : ''}{contact.is_primary ? ` · ${translate('primary')}` : ''}</small
                  >
                </div>
                {#if canManageClientContacts}
                  <div class="record-actions contact-actions">
                    <details>
                      <summary class="secondary-button">{translate('Edit contact')}</summary>
                      <form method="POST" action="?/updateClientContact" class="compact-form">
                        <input type="hidden" name="contactId" value={contact.id} />
                        <label
                          >{translate('Name')}<input
                            name="name"
                            value={String(contact.name ?? '')}
                            required
                          /></label
                        >
                        <label
                          >{translate('Email')}<input
                            name="email"
                            type="email"
                            value={String(contact.email ?? '')}
                          /></label
                        >
                        <label
                          >{translate('Phone')}<input
                            name="phone"
                            value={String(contact.phone ?? '')}
                          /></label
                        >
                        <label
                          >{translate('Role')}<input
                            name="role"
                            value={String(contact.role ?? '')}
                          /></label
                        >
                        <label class="check"
                          ><input
                            name="isBillingContact"
                            type="checkbox"
                            checked={Boolean(contact.is_billing_contact)}
                          />
                          {translate('Billing contact')}</label
                        >
                        <label class="check"
                          ><input
                            name="isPrimary"
                            type="checkbox"
                            checked={Boolean(contact.is_primary)}
                          />
                          {translate('Primary contact')}</label
                        >
                        <button type="submit">{translate('Update contact')}</button>
                      </form>
                    </details>
                    <form
                      method="POST"
                      action="?/deleteClientContact"
                      onsubmit={(event) => {
                        if (!confirm(translate('Delete this contact?'))) event.preventDefault();
                      }}
                    >
                      <input type="hidden" name="contactId" value={contact.id} />
                      <button class="danger" type="submit">{translate('Delete contact')}</button>
                    </form>
                  </div>
                {/if}
              </article>
            {:else}
              <div class="empty">{translate('No client contacts recorded.')}</div>
            {/each}
          </section>
        {/if}
        {#if data.workers && data.workers.length > 0}
          <section class="record-list full">
            <div class="panel-title">
              <h2>{translate('Team access')}</h2>
              <span>{data.workers.length} {translate('workers')}</span>
            </div>
            {#each data.workers as worker}
              <article class="record-card worker-card">
                <div>
                  <strong>{worker.name}</strong>
                  {#if worker.status !== 'active'}
                    <span class="state-tag state-tag-with-gap {worker.status}"
                      >{controlledValue('status', worker.status)}</span
                    >
                  {/if}
                  <small
                    >{worker.email} · {controlledValue('role', worker.role)} · {translate('joined')}
                    {String(worker.created_at ?? '').slice(0, 10)} → {worker.offboarded_at ??
                      'open'}</small
                  >
                </div>
                {#if data.user.role === 'owner_admin'}
                  <div class="worker-actions">
                    <details open={formIdentity.identityWorkerId === worker.id || undefined}>
                      <summary class="worker-manage-toggle">{translate('Manage worker')}</summary>
                      <div class="worker-manage-panel">
                        <form
                          method="POST"
                          action="?/updateWorkerProfile"
                          class="compact-form worker-profile-form"
                        >
                          <h4 class="worker-form-heading">{translate('Edit Profile')}</h4>
                          <input type="hidden" name="workerId" value={worker.id} />
                          <label class="worker-field"
                            >{translate('Name')}
                            <input
                              name="name"
                              value={worker.name}
                              required
                              class="worker-field-control"
                            /></label
                          >
                          <label class="worker-field"
                            >{translate('Email')}
                            <input
                              name="email"
                              value={worker.email}
                              type="email"
                              required
                              class="worker-field-control"
                            /></label
                          >
                          <label class="worker-field"
                            >{translate('Role')}
                            <select name="role" required class="worker-field-control">
                              <option value="worker" selected={worker.role === 'worker'}
                                >{translate('Worker')}</option
                              >
                              <option
                                value="project_manager"
                                selected={worker.role === 'project_manager'}
                                >{translate('Project Manager')}</option
                              >
                              <option
                                value="finance_admin"
                                selected={worker.role === 'finance_admin'}
                                >{translate('Finance Admin')}</option
                              >
                              <option
                                value="auditor_read_only"
                                selected={worker.role === 'auditor_read_only'}
                                >{translate('Auditor (Read Only)')}</option
                              >
                              <option value="owner_admin" selected={worker.role === 'owner_admin'}
                                >{translate('Owner / Admin')}</option
                              >
                            </select>
                          </label>
                          <label class="worker-field"
                            >{translate('Joined At')}
                            <input
                              name="joinedAt"
                              type="date"
                              value={worker.created_at
                                ? String(worker.created_at).slice(0, 10)
                                : ''}
                              class="worker-field-control"
                            /></label
                          >
                          <button type="submit" class="worker-form-submit"
                            >{translate('Save profile')}</button
                          >
                        </form>

                        <form
                          method="POST"
                          action="?/updateUserStatus"
                          class="compact-form worker-status-form"
                        >
                          <h4 class="worker-form-heading">{translate('Account Status')}</h4>
                          <input type="hidden" name="userId" value={worker.id} />
                          <select
                            name="status"
                            aria-label={`${translate('Status for')} ${worker.name}`}
                          >
                            <option value="active" selected={worker.status === 'active'}
                              >{translate('Active')}</option
                            >
                            <option value="suspended" selected={worker.status === 'suspended'}
                              >{translate('Suspend')}</option
                            >
                            <option value="offboarded" selected={worker.status === 'offboarded'}
                              >{translate('Offboard')}</option
                            >
                            <option value="archived" selected={worker.status === 'archived'}
                              >{translate('Archive')}</option
                            >
                          </select>
                          <button type="submit">{translate('Update status')}</button>
                        </form>
                      </div>
                    </details>
                  </div>
                {/if}
              </article>
            {/each}
          </section>
        {/if}
      </div>
    {:else if data.section === 'planning'}
      <div class="management-stack">
        {#if canManageAssignmentControls}<form
            method="POST"
            action="?/createPlanning"
            class="admin-form-grid"
          >
            <h2>{translate('Publish field assignment')}</h2>
            <label
              >{translate('Project')}<select name="projectId" required
                >{#each operationalProjects as project}<option value={project.id}
                    >{project.project_number} — {project.name}</option
                  >{/each}</select
              ></label
            ><label
              >{translate('Worker')}<select name="workerId" required
                >{#each data.workers ?? [] as worker}<option value={worker.id}>{worker.name}</option
                  >{/each}</select
              ></label
            ><label
              >{translate('Start')}<input name="startsAt" type="datetime-local" required /></label
            ><label>{translate('End')}<input name="endsAt" type="datetime-local" required /></label
            ><label
              >{translate('Planned minutes')}<input
                name="plannedMinutes"
                type="number"
                min="1"
                required
              /></label
            ><label>{translate('Site')}<input name="site" /></label><label
              >{translate('Required skill')}<input name="requiredSkill" /></label
            ><button>{translate('Publish assignment')}</button>
          </form>{/if}
        {#if data.user.role === 'owner_admin' || data.user.role === 'finance_admin'}
          <details class="admin-details">
            <summary class="primary-button">{translate('New Skill')}</summary>
            <form method="POST" action="?/createSkill" class="admin-form-grid">
              <h2>{translate('Add skill')}</h2>
              <label>{translate('Code')}<input name="code" required /></label><label
                >{translate('Name')}<input name="name" required /></label
              ><button>{translate('Save skill')}</button>
            </form>
          </details>
          <details class="admin-details">
            <summary class="primary-button">{translate('Update Skill')}</summary>
            <form method="POST" action="?/updateSkill" class="admin-form-grid">
              <h2>{translate('Update skill')}</h2>
              <label
                >{translate('Skill')}<select name="skillId" required>
                  {#each data.skills ?? [] as skill}<option value={skill.id}
                      >{skill.code} — {skill.name}</option
                    >{/each}
                </select></label
              >
              <label>{translate('Name')}<input name="name" /></label>
              <button>{translate('Update skill')}</button>
            </form>
          </details>
          <details class="admin-details">
            <summary class="primary-button">{translate('Delete Skill')}</summary>
            <form method="POST" action="?/deleteSkill" class="admin-form-grid">
              <h2>{translate('Delete skill')}</h2>
              <label
                >{translate('Skill')}<select name="skillId" required>
                  {#each data.skills ?? [] as skill}<option value={skill.id}
                      >{skill.code} — {skill.name}</option
                    >{/each}
                </select></label
              >
              <button class="danger">{translate('Delete skill')}</button>
            </form>
          </details>
          <details class="admin-details">
            <summary class="primary-button">{translate('Assign Skill')}</summary>
            <form method="POST" action="?/setWorkerSkill" class="admin-form-grid">
              <h2>{translate('Assign skill')}</h2>
              <label
                >{translate('Worker')}<select name="workerId" required
                  >{#each data.workers ?? [] as worker}<option value={worker.id}
                      >{worker.name}</option
                    >{/each}</select
                ></label
              ><label
                >{translate('Skill')}<select name="skillId" required
                  >{#each data.skills ?? [] as skill}<option value={skill.id}
                      >{skill.code} — {skill.name}</option
                    >{/each}</select
                ></label
              ><label
                >{translate('Proficiency')}<select name="proficiency"
                  ><option value="1">1 · {translate('exposure')}</option><option value="2"
                    >2 · {translate('developing')}</option
                  ><option value="3">3 · {translate('capable')}</option><option value="4"
                    >4 · {translate('advanced')}</option
                  ><option value="5">5 · {translate('expert')}</option></select
                ></label
              ><button>{translate('Update skill matrix')}</button>
            </form>
          </details>
          <details class="admin-details">
            <summary class="primary-button">{translate('Remove Worker Skill')}</summary>
            <form method="POST" action="?/deleteWorkerSkill" class="admin-form-grid">
              <h2>{translate('Remove worker skill')}</h2>
              <label
                >{translate('Worker')}<select name="workerId" required>
                  {#each data.workers ?? [] as worker}<option value={worker.id}
                      >{worker.name}</option
                    >{/each}
                </select></label
              >
              <label
                >{translate('Skill')}<select name="skillId" required>
                  {#each data.skills ?? [] as skill}<option value={skill.id}
                      >{skill.code} — {skill.name}</option
                    >{/each}
                </select></label
              >
              <button class="danger">{translate('Remove skill')}</button>
            </form>
          </details>
        {/if}
        <section class="record-list full">
          <div class="panel-title">
            <h2>{translate('Published schedule')}</h2>
            <span>{data.records?.length ?? 0}</span>
          </div>
          {#each data.records ?? [] as row}<a
              class="record-card-link"
              href={`${base}/app/projects/${row.project_id}`}
            >
              <div>
                <strong>{row.worker_name} · {row.project_number}</strong><small
                  >{String(row.starts_at).replace('T', ' ').slice(0, 16)} · {row.planned_minutes} min
                  · {row.site}</small
                >
              </div>
              <span class="record-card-open">{translate('Open record →')}</span>
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
        {isAuditor}
        {availableProjects}
        {translate}
        {controlledValue}
        formatMoney={paymentMoney}
      />
    {:else if data.section === 'finance' && data.finance}
      <FinanceOverviewSection
        {data}
        {availableProjects}
        {isAuditor}
        {translate}
        {controlledValue}
        {money}
        currentView={currentView || 'overview'}
      />
    {:else if data.section === 'ledger'}
      <CollectionsLedgerSection {data} {translate} {controlledValue} />
    {:else if data.section === 'accounting'}
      <AccountingSection {data} {isAuditor} {locale} {translate} {controlledValue} />
    {:else if data.section === 'profile'}
      <div class="management-stack">
        <section class="entry-panel">
          <span class="portal-kicker">{translate('WORKFORCE PROFILE')}</span>
          <h2>{translate('Skills and availability')}</h2>
          <p>
            {translate(
              'Keep your own workforce profile current without exposing compensation or client rates.',
            )}
          </p>
          {#if (data.user.role === 'owner_admin' || data.user.role === 'finance_admin') && (data.workers?.length ?? 0) > 0}
            <form method="GET" action={href('profile')} class="worker-profile-selector">
              <label
                >{translate('Inspect worker')}<select name="worker" required>
                  {#each data.workers ?? [] as worker}
                    <option value={worker.id} selected={String(worker.id) === profileWorkerId}
                      >{worker.name} · {controlledValue('role', worker.role)}</option
                    >
                  {/each}
                </select></label
              >
              <button type="submit">{translate('View worker profile')}</button>
            </form>
          {/if}
          {#if !isAuditor}
            <details class="admin-details profile-skill-details">
              <summary class="primary-button">{translate('Add Skill')}</summary>
              <form method="POST" action="?/setWorkerSkill" class="admin-form-grid">
                <input type="hidden" name="workerId" value={data.user.id ?? ''} />
                <label
                  >{translate('Skill')}
                  <select name="skillId" required>
                    <option value="">{translate('Select skill')}</option>
                    {#each data.allSkills ?? data.skills ?? [] as skill}
                      <option value={skill.id}>{skill.name}</option>
                    {/each}
                  </select>
                </label>
                <label
                  >{translate('Proficiency (1-5)')}
                  <input name="proficiency" type="number" min="1" max="5" value="3" required />
                </label>
                <button>{translate('Add skill')}</button>
              </form>
            </details>
            <details class="admin-details profile-skill-details">
              <summary class="primary-button">{translate('Remove Skill')}</summary>
              <form method="POST" action="?/deleteWorkerSkill" class="admin-form-grid">
                <input type="hidden" name="workerId" value={data.user.id ?? ''} />
                <label
                  >{translate('Skill')}
                  <select name="skillId" required>
                    <option value="">{translate('Select skill')}</option>
                    {#each data.skills ?? [] as skill}
                      <option value={skill.id}>{skill.name}</option>
                    {/each}
                  </select>
                </label>
                <button class="danger">{translate('Remove skill')}</button>
              </form>
            </details>
          {/if}
          <TableRegion
            class="table-wrap worker-profile-table"
            mobileMode="scroll"
            label={translate('Skills and availability')}
          >
            <table>
              <thead
                ><tr
                  ><th>{translate('Skill')}</th><th>{translate('Proficiency')}</th><th
                    >{translate('Verified')}</th
                  ></tr
                ></thead
              ><tbody
                >{#each data.skills ?? [] as skill}<tr
                    ><td>{skill.name}</td><td>{skill.proficiency}/5</td><td
                      >{skill.verified_at ? translate('verified') : translate('self-reported')}</td
                    ></tr
                  >{:else}<tr><td colspan="3">{translate('No skills recorded.')}</td></tr
                  >{/each}</tbody
              >
            </table>
          </TableRegion>
          {#if !isAuditor}<form method="POST" action="?/setAvailability" class="admin-form-grid">
              <input type="hidden" name="workerId" value={data.user.id ?? ''} /><label
                >{translate('Starts')}<input
                  name="startsAt"
                  type="datetime-local"
                  required
                /></label
              ><label
                >{translate('Ends')}<input name="endsAt" type="datetime-local" required /></label
              ><label
                >{translate('Availability')}<select name="availability"
                  ><option value="available">{translate('Available')}</option><option
                    value="unavailable">{translate('Unavailable')}</option
                  ><option value="tentative">{translate('Tentative')}</option></select
                ></label
              ><label>{translate('Note')}<textarea name="note" rows="2"></textarea></label><button
                >{translate('Save availability')}</button
              >
            </form>{/if}
          {#if data.user.role === 'owner_admin' && (data.workers?.length ?? 0) > 0}
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
                      'Assign skills and availability windows for an individual worker. These controls do not expose compensation or client-rate data.',
                    )}
                  </p>
                </div>
              </div>
              <details class="admin-details">
                <summary class="primary-button">{translate('Manage worker skills')}</summary>
                <form method="POST" action="?/setWorkerSkill" class="admin-form-grid">
                  <label
                    >{translate('Worker')}<select name="workerId" required>
                      {#each data.workers ?? [] as worker}
                        <option value={worker.id}
                          >{worker.name} · {controlledValue('role', worker.role)}</option
                        >
                      {/each}
                    </select></label
                  >
                  <label
                    >{translate('Skill')}<select name="skillId" required>
                      <option value="">{translate('Select skill')}</option>
                      {#each data.allSkills ?? data.skills ?? [] as skill}
                        <option value={skill.id}>{skill.name}</option>
                      {/each}
                    </select></label
                  >
                  <label
                    >{translate('Proficiency (1–5)')}<input
                      name="proficiency"
                      type="number"
                      min="1"
                      max="5"
                      value="3"
                      required
                    /></label
                  >
                  <button type="submit">{translate('Assign skill')}</button>
                </form>
                <form method="POST" action="?/deleteWorkerSkill" class="admin-form-grid">
                  <label
                    >{translate('Worker')}<select name="workerId" required>
                      {#each data.workers ?? [] as worker}
                        <option value={worker.id}
                          >{worker.name} · {controlledValue('role', worker.role)}</option
                        >
                      {/each}
                    </select></label
                  >
                  <label
                    >{translate('Skill')}<select name="skillId" required>
                      <option value="">{translate('Select skill')}</option>
                      {#each data.allSkills ?? data.skills ?? [] as skill}
                        <option value={skill.id}>{skill.name}</option>
                      {/each}
                    </select></label
                  >
                  <button class="danger" type="submit">{translate('Remove skill')}</button>
                </form>
              </details>
              <details class="admin-details">
                <summary class="primary-button">{translate('Manage worker availability')}</summary>
                <form method="POST" action="?/setAvailability" class="admin-form-grid">
                  <label
                    >{translate('Worker')}<select name="workerId" required>
                      {#each data.workers ?? [] as worker}
                        <option value={worker.id}
                          >{worker.name} · {controlledValue('role', worker.role)}</option
                        >
                      {/each}
                    </select></label
                  >
                  <label
                    >{translate('Starts')}<input
                      name="startsAt"
                      type="datetime-local"
                      required
                    /></label
                  >
                  <label
                    >{translate('Ends')}<input
                      name="endsAt"
                      type="datetime-local"
                      required
                    /></label
                  >
                  <label
                    >{translate('Availability')}<select name="availability" required>
                      <option value="available">{translate('Available')}</option>
                      <option value="unavailable">{translate('Unavailable')}</option>
                      <option value="tentative">{translate('Tentative')}</option>
                    </select></label
                  >
                  <label>{translate('Note')}<textarea name="note" rows="2"></textarea></label>
                  <button type="submit">{translate('Save worker availability')}</button>
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
          <div class="security-methods">
            <div class="security-method-heading">
              <div>
                <span class="portal-kicker">{translate('ACCOUNT MFA')}</span>
                <h3>{translate('Authenticator app')}</h3>
              </div>
              <span class="state-tag"
                >{data.user.mfaEnrolled ? translate('Enabled') : translate('Not enabled')}</span
              >
            </div>
            <p class="form-help">
              {translate(
                'Production accounts require a second factor. Enabling MFA returns the setup URI and one-time recovery codes; store them in an approved password manager.',
              )}
            </p>
            <label
              >{translate('Confirm with password')}<input
                type="password"
                bind:value={mfaPassword}
                minlength="12"
                autocomplete="current-password"
                required
              /></label
            >
            <div class="inline-actions">
              <button type="button" onclick={() => toggleMfa('enable')}
                >{translate('Enable MFA')}</button
              >
              {#if data.user.mfaEnrolled && !data.user.mfaRequired}<button
                  type="button"
                  class="secondary"
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
                      bind:value={mfaCode}
                      inputmode="numeric"
                      autocomplete="one-time-code"
                      pattern="[0-9]{6}"
                      minlength="6"
                      maxlength="6"
                      required
                    /></label
                  ><button type="submit">{translate('Verify MFA')}</button>
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
      <section class="record-list full">
        <div class="panel-title">
          <h2>{translate('Activity inbox')}</h2>
          <span>{data.records?.length ?? 0}</span>
        </div>
        {#each data.records ?? [] as row}
          {@const notificationKind = String(row.kind)}
          {@const notificationTarget =
            notificationKind === 'report_deleted'
              ? base + '/app/notifications/' + String(row.id)
              : notificationKind.startsWith('report_')
                ? base + '/app/reports/' + String(row.subject_id)
                : notificationKind.includes('expense')
                  ? base + '/app/expenses/' + String(row.subject_id)
                  : notificationKind === 'assignment_published'
                    ? base + '/app/projects/' + String(row.subject_id)
                    : base + '/app/notifications/' + String(row.id)}
          <article class:unread={!row.read_at} class="notification-row">
            <a class="record-card-link" href={notificationTarget}>
              <strong>{translate(notificationKind.replaceAll('_', ' '))}</strong>
              <small>
                {#if row.record_title}{String(row.record_title)} ·
                {/if}
                {#if row.project_number}{String(row.project_number)} ·
                {/if}
                {String(row.created_at).replace('T', ' ').slice(0, 16)}
              </small>
              {#if Array.isArray(row.changed_fields) && row.changed_fields.length > 0}
                <span class="change-summary"
                  >{translate('Changed:')}
                  {row.changed_fields
                    .map((field) => field.replaceAll(/([A-Z])/g, ' $1').toLowerCase())
                    .join(', ')}</span
                >
              {/if}
              <span class="record-card-open">{translate('Open record →')}</span>
            </a>
            <span class="state-tag">{row.read_at ? translate('read') : translate('new')}</span>
          </article>
        {:else}<div class="empty">{translate('No notifications.')}</div>{/each}
      </section>
    {:else if data.section === 'audit'}
      <section class="record-list full">
        <div class="panel-title">
          <h2>{translate('Append-only security and finance audit')}</h2>
          <span>{data.audit?.length ?? 0} {translate('events')}</span>
        </div>
        {#each data.audit ?? [] as row}<article>
            <div>
              <strong>{String(row.action).replaceAll('_', ' ')}</strong><small
                >{String(row.entity_type)} · {String(row.entity_id)} · {String(row.occurred_at)
                  .replace('T', ' ')
                  .slice(0, 19)}</small
              >
            </div>
            <code>{String(row.details_json ?? '{}')}</code>
          </article>{:else}<div class="empty">{translate('No audit events recorded.')}</div>{/each}
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
        class:active={data.section === item.section}
        href={itemHref(item)}
        aria-current={data.section === item.section ? 'page' : undefined}>{translate(item.label)}</a
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
