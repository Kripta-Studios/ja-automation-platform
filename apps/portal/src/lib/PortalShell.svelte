<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { createAuthClient } from 'better-auth/client';
  import { passkeyClient } from '@better-auth/passkey/client';
  import { onMount } from 'svelte';
  import {
    documentLanguage,
    normalizePortalLocale,
    portalText,
    translatePortalDom,
    type PortalLocale,
  } from './portal-i18n';
  import {
    adminNavigation,
    portalTitleFor,
    primaryNavigation,
    securityNavigation,
    secondaryNavigation,
    type NavItem,
  } from './portal-navigation';
  import PortalChrome from './PortalChrome.svelte';
  import { FormCard, FormSection, FieldGroup, Field, formValidation } from './portal/ui';
  import TodaySection from './portal/sections/TodaySection.svelte';
  import TimesheetPanel from './portal/sections/TimesheetPanel.svelte';
  import ExpenseSection from './portal/sections/ExpenseSection.svelte';
  import ReportSection from './portal/sections/ReportSection.svelte';
  import FinanceConfigurationSection from './portal/sections/FinanceConfigurationSection.svelte';
  import AccountingPackArtifactStatus from './portal/ui/localized-pdf/AccountingPackArtifactStatus.svelte';
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
  let online = $state(true);
  let queue = $state(0);
  let syncMessage = $state('');
  let conflictItems = $state<Array<{ mutationId: string; entityType: string; createdAt: string }>>(
    [],
  );
  let stepUpMessage = $state('');
  let menuOpen = $state(false);
  let searchOpen = $state(false);
  let searchValue = $derived(data.searchQuery ?? '');
  let offlineProjects = $state<Row[]>([]);
  let locale = $state<PortalLocale>('en');
  let securityMessage = $state('');
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
  };
  function actionMessage(result: ActionResult | undefined): string {
    if (!result) return '';
    const localized = result as ActionResultWithMessageKey;
    const messageKey = localized.messageKey;
    if (typeof messageKey === 'string' && messageKey.trim()) {
      const rawParams = localized.messageParams;
      const params =
        rawParams && typeof rawParams === 'object'
          ? Object.fromEntries(
              Object.entries(rawParams as Record<string, unknown>).filter(
                ([, value]) => typeof value === 'string' || typeof value === 'number',
              ),
            )
          : undefined;
      return portalText(locale, messageKey, params);
    }
    return typeof localized.message === 'string' ? localized.message : '';
  }

  const navigation: NavItem[] = primaryNavigation;
  const admin: NavItem[] = adminNavigation(base);
  const securityAdmin: NavItem[] = securityNavigation;
  const currentView = $derived($page.url.searchParams.get('view') ?? '');
  const currentTitle = $derived(portalTitleFor(data.section, currentView));
  const actionFeedback = $derived(actionMessage(form));
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
  const showAdmin = $derived(isManager || isFinance || canAudit);
  const visibleAdmin = $derived(admin.filter((item) => !item.financeOnly || isFinance));
  const availableProjects = $derived(
    data.projects && data.projects.length > 0 ? data.projects : offlineProjects,
  );
  const operationalProjects = $derived(
    availableProjects.filter((project) =>
      ['active', 'planned', 'paused'].includes(String(project.status ?? 'active')),
    ),
  );
  const activeProjects = operationalProjects;
  const activeClients = $derived(
    (data.clients ?? []).filter((client) => String(client.status ?? 'active') !== 'archived'),
  );
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
    grossPaymentsMinor?: unknown;
    paymentReversalsMinor?: unknown;
    netCollectedMinor?: unknown;
    outstandingMinor?: unknown;
    directCostMinor?: unknown;
    directCostComplete?: unknown;
    directCostMissingSourceIds?: unknown;
    contributionMinor?: unknown;
    paymentStatus?: unknown;
    payments?: LedgerPayment[];
    paymentReversals?: LedgerReversal[];
  };
  const ledgerForInvoice = (invoiceId: unknown): BillingLedgerRow | undefined =>
    data.ledger?.find((row) => String(row.invoiceId ?? '') === String(invoiceId)) as
      | BillingLedgerRow
      | undefined;
  const positiveMinor = (value: unknown): boolean => {
    const raw = String(value ?? '').trim();
    return /^\d+$/.test(raw) && raw.replace(/^0+/, '').length > 0;
  };
  const minorToDecimal = (value: unknown): string => {
    const raw = String(value ?? '').trim();
    if (!/^\d+$/.test(raw)) return '0.00';
    const normalized = raw.replace(/^0+(?=\d)/, '').padStart(3, '0');
    return `${normalized.slice(0, -2)}.${normalized.slice(-2)}`;
  };
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
  const searchHref = (row: Row) => {
    const id = String(row.id ?? '');
    if (row.type === 'project') return `${base}/app/projects/${id}`;
    if (row.type === 'client')
      return `${base}/app/projects?view=clients&focus=${encodeURIComponent(id)}`;
    if (row.type === 'invoice') return `${base}/app/billing/invoices/${id}`;
    if (row.type === 'report') return `${base}/app/reports/${id}`;
    if (row.type === 'expense') return `${base}/app/expenses/${id}`;
    if (row.type === 'worker') return `${base}/app/planning`;
    return `${base}/app/`;
  };
  const recordHref = (row: Row) => {
    const id = String(row.id ?? '');
    if (row.type === 'time') return `${base}/app/time/${id}`;
    if (row.type === 'expense') return `${base}/app/expenses/${id}`;
    if (row.type === 'daily' || row.type === 'technical') return `${base}/app/reports/${id}`;
    return `${base}/app/approvals`;
  };
  const offlineController = createOfflineController(base, {
    setOnline: (value) => (online = value),
    setQueue: (value) => (queue = value),
    setSyncMessage: (value) => (syncMessage = value),
    setConflictItems: (value) => (conflictItems = value),
    setOfflineProjects: (value) => (offlineProjects = value),
  });
  onMount(() => {
    const queryLocale = new URLSearchParams(location.search).get('lang');
    const savedLocale = localStorage.getItem('ja-portal-locale');
    locale = normalizePortalLocale(queryLocale ?? savedLocale ?? navigator.language);
    localStorage.setItem('ja-portal-locale', locale);
    document.documentElement.lang = documentLanguage(locale);
    configureOfflineIdentity(data.user.id);
    stopOfflineController = offlineController.start();
    // Only ask the passkey endpoint for a real authenticated Better Auth
    // session; otherwise its expected 401 would surface as a browser error.
    void authClient.getSession().then((result) => {
      if (result.data?.user) void refreshPasskeys();
    });
    return () => {
      stopOfflineController?.();
      stopOfflineController = null;
    };
  });
  $effect(() => {
    const projects = data.projects;
    if (projects?.length) void offlineController.cacheAssignments(projects);
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
    history.replaceState({}, '', url);
  }

  async function discardConflict(mutationId: string) {
    await offlineController.discardConflict(mutationId);
  }
  async function stepUp(event: SubmitEvent) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget as HTMLFormElement);
    const response = await fetch(`${base}/app/api/step-up`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: formData.get('password') }),
    });
    stepUpMessage = response.ok
      ? 'Step-up authentication is active for the next 10 minutes.'
      : 'Password verification failed.';
  }

  async function refreshPasskeys(): Promise<void> {
    const result = await authClient.passkey.listUserPasskeys();
    if (result.data) passkeys = result.data;
  }

  async function registerPasskey(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    securityMessage = '';
    const result = await authClient.passkey.addPasskey({
      name: passkeyName.trim() || 'J&A Portal device',
    });
    if (result.error) {
      securityMessage = 'Passkey registration was not completed.';
      return;
    }
    passkeyName = '';
    securityMessage = 'Passkey registered for this account.';
    await refreshPasskeys();
  }

  async function revokePasskey(id: string): Promise<void> {
    const result = await authClient.passkey.deletePasskey({ id });
    if (result.error) {
      securityMessage = 'Passkey could not be revoked.';
      return;
    }
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
                changeSummary: formValue(formData, 'changeSummary'),
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
    {href}
    {itemHref}
    {initials}
    {logout}
    {changeLocale}
    onMenuToggle={() => (menuOpen = !menuOpen)}
    onCloseMenu={() => (menuOpen = false)}
  />
  <main id="portal-main">
    <header class="print-only-header" aria-hidden="true" style="display: none;">
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
            id="portal-global-search"
            name="q"
            bind:value={searchValue}
            placeholder={translate('Search projects, people, invoices…')}
            autocomplete="off"
            onfocus={() => (searchOpen = true)}
            oninput={() => (searchOpen = true)}
            onblur={() => setTimeout(() => (searchOpen = false), 200)}
          />
          <button type="submit">{translate('Search')}</button>
          {#if searchOpen}
            <div
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
              {#each visibleSearchSuggestions as suggestion}
                <a
                  class="search-popover-item"
                  href={searchHref(suggestion)}
                  role="option"
                  aria-selected="false"
                  onclick={() => setTimeout(() => (searchOpen = false), 0)}
                >
                  <span>
                    <strong>{String(suggestion.label ?? translate('Record'))}</strong>
                    <small
                      >{String(suggestion.type ?? 'record')} · {String(
                        suggestion.detail ?? '',
                      )}</small
                    >
                  </span>
                  <i aria-hidden="true">↗</i>
                </a>
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
    {#if actionFeedback}<p class:success={form?.success} class="action-message" role="status">
        {actionFeedback}
      </p>{/if}
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
        {#each data.searchResults ?? [] as result}
          <a class="search-result" href={searchHref(result)}>
            <strong>{String(result.label ?? translate('Result'))}</strong>
            <small>{String(result.type ?? 'record')} · {String(result.detail ?? '')}</small>
          </a>
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
      />
    {:else if data.section === 'time'}
      {#if data.timesheet}
        <TimesheetPanel {data} {isAuditor} {translate} {controlledValue} />
      {/if}
      <div class="worker-form">
        {#if !isAuditor}<form
            method="POST"
            action="?/createTime"
            class="entry-panel"
            onsubmit={(event) => saveOfflineDraft(event, 'time')}
          >
            <h2>{translate('Log actual time')}</h2>
            <p>{translate('Enter only minutes actually worked.')}</p>
            <label
              >{translate('Project')}<select name="projectId" required
                ><option value="">{translate('Select assignment')}</option
                >{#each availableProjects as project}<option value={project.id}
                    >{project.project_number} — {project.name}</option
                  >{/each}</select
              ></label
            ><label>{translate('Work date')}<input name="workDate" type="date" required /></label
            ><label
              >{translate('Category')}<select name="category"
                ><option value="regular">{translate('Regular')}</option><option
                  value="commissioning">{translate('Commissioning')}</option
                ><option value="overtime">{translate('Overtime')}</option><option value="standby"
                  >{translate('Standby / waiting')}</option
                ><option value="weekend_holiday">{translate('Weekend / holiday')}</option><option
                  value="travel">{translate('Travel')}</option
                ><option value="remote_support">{translate('Remote support')}</option><option
                  value="training">{translate('Training')}</option
                ><option value="internal">{translate('Internal')}</option></select
              ></label
            ><label
              >{translate('Minutes')}<input
                name="minutes"
                type="number"
                min="1"
                max="1440"
                required
                inputmode="numeric"
              /></label
            ><label
              >{translate('Activity summary')}<textarea name="summary" required></textarea></label
            ><button>{translate('Save draft')}</button>
          </form>{/if}
        <section class="record-list">
          <div class="panel-title">
            <h2>{translate('Recent entries')}</h2>
            <span>{data.records?.length ?? 0}</span>
          </div>
          {#if data.timeFilter?.category || data.timeFilter?.projectId}
            <p class="form-help time-filter-note">
              {translate('Filtered view:')}
              {translate(data.timeFilter.category?.replaceAll('_', ' ') || 'all categories')}.
              <a href={`${base}/app/time`}>{translate('Clear filter')}</a>
            </p>
          {/if}
          {#each data.records ?? [] as row}<article
              class:is-modified={row.approval_state === 'needs_changes'}
              class="record-card"
            >
              <a class="record-card-link" href={`${base}/app/time/${String(row.id)}`}>
                <strong>{row.work_date} · {row.project_number}</strong><small
                  >{controlledValue('category', row.category)} · {row.minutes} min · {controlledValue(
                    'status',
                    row.approval_state,
                  )}</small
                >
                <span class="record-card-open">{translate('Open record →')}</span>
              </a>
              {#if row.approval_state === 'draft' && String(row.worker_id) === data.user.id}<div
                  class="record-actions"
                >
                  <details>
                    <summary>{translate('Edit draft')}</summary>
                    <form
                      method="POST"
                      action="?/updateTime"
                      data-entity-id={String(row.id)}
                      data-version={String(row.version)}
                      onsubmit={(event) => saveOfflineDraft(event, 'time')}
                    >
                      <input type="hidden" name="id" value={row.id} /><input
                        type="hidden"
                        name="version"
                        value={row.version}
                      /><input type="hidden" name="projectId" value={row.project_id} /><input
                        type="hidden"
                        name="workDate"
                        value={row.work_date}
                      /><label
                        >{translate('Category')}<select name="category" value={row.category}
                          ><option value="regular">{translate('Regular')}</option><option
                            value="commissioning">{translate('Commissioning')}</option
                          ><option value="overtime">{translate('Overtime')}</option><option
                            value="standby">{translate('Standby / waiting')}</option
                          ><option value="weekend_holiday">{translate('Weekend / holiday')}</option
                          ><option value="travel">{translate('Travel')}</option><option
                            value="remote_support">{translate('Remote support')}</option
                          ><option value="training">{translate('Training')}</option><option
                            value="internal">{translate('Internal')}</option
                          ></select
                        ></label
                      ><label
                        >{translate('Minutes')}<input
                          name="minutes"
                          type="number"
                          min="0"
                          max="1440"
                          value={row.minutes}
                          required
                        /></label
                      ><label
                        >{translate('Summary')}<textarea name="summary" required
                          >{row.activity_summary}</textarea
                        ></label
                      ><button>{translate('Save changes')}</button>
                    </form>
                  </details>
                  <form method="POST" action="?/submitTime">
                    <input type="hidden" name="id" value={row.id} /><input
                      type="hidden"
                      name="version"
                      value={row.version}
                    /><button>{translate('Submit')}</button>
                  </form>
                </div>{/if}
              {#if String(row.worker_id) === data.user.id && row.invoice_id == null && row.approval_state !== 'void'}
                <div class="record-actions" style="margin-top: 0.5rem;">
                  <form method="POST" action="?/deleteTime">
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="version" value={row.version} />
                    <button class="destructive-button">
                      {row.approval_state === 'draft' || row.approval_state === 'needs_changes'
                        ? translate('Delete')
                        : translate('Void')}
                    </button>
                  </form>
                </div>
              {/if}
            </article>{:else}<div class="empty">{translate('No time recorded.')}</div>{/each}
        </section>
      </div>
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
                    style="display:inline;"
                    onsubmit={(e) => {
                      if (!confirm(translate('Are you sure you want to delete this document?')))
                        e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="documentId" value={String(document.id)} />
                    <button
                      type="submit"
                      class="preview-link"
                      style="background:none; border:none; padding:0; cursor:pointer; color:var(--ja-red); text-decoration:underline;"
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
      <div class="finance-grid">
        <a
          href="{base}/app/time"
          class="metric"
          style="text-decoration: none; color: inherit; cursor: pointer;"
        >
          <span>{translate('APPROVED COMPENSATION')}</span><strong
            >{money(data.pay.estimatedApprovedMinor, data.pay.currency)}</strong
          >
          <p>{data.pay.approvedMinutes} {translate('approved minutes')}</p>
        </a>
        <a
          href="{base}/app/expenses"
          class="metric"
          style="text-decoration: none; color: inherit; cursor: pointer;"
        >
          <span>{translate('APPROVED REIMBURSEMENTS')}</span><strong
            >{money(data.pay.approvedReimbursementMinor, data.pay.currency)}</strong
          >
          <p>
            {translate('Pending pay:')}
            {money(data.pay.estimatedPendingMinor, data.pay.currency)} + {money(
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
          <a
            href="{base}/app/time"
            style="text-decoration: none; color: inherit; display: block; cursor: pointer;"
          >
            <span>{translate('Approved actual time')}</span><strong
              >{(data.pay.approvedMinutes / 60).toFixed(2)} h</strong
            >
          </a>
          <a
            href="{base}/app/time"
            style="text-decoration: none; color: inherit; display: block; cursor: pointer;"
          >
            <span>{translate('Pending actual time')}</span><strong
              >{(data.pay.pendingMinutes / 60).toFixed(2)} h</strong
            >
          </a>
          <a
            href="{base}/app/time"
            style="text-decoration: none; color: inherit; display: block; cursor: pointer;"
          >
            <span>{translate('Daily guarantee coverage')}</span><strong
              >{(data.pay.guaranteedMinutes ?? 0) / 60} h</strong
            >
          </a>
          <a
            href="{base}/app/projects"
            style="text-decoration: none; color: inherit; display: block; cursor: pointer;"
          >
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
        <div class="table-wrap">
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
                      style="text-decoration: none; font-weight: 500;"
                      >{String(row.projectNumber)} · {String(row.projectName)}</a
                    ></td
                  ><td>{(Number(row.actualMinutes ?? 0) / 60).toFixed(1)} h</td><td
                    >{(Number(row.approvedMinutes ?? 0) / 60).toFixed(1)} h</td
                  ><td>{(Number(row.pendingMinutes ?? 0) / 60).toFixed(1)} h</td><td
                    >{row.plannedMinutes === null
                      ? '—'
                      : `${(Number(row.plannedMinutes) / 60).toFixed(1)} h`}</td
                  ><td
                    >{row.hoursRemaining === null
                      ? '—'
                      : `${(Number(row.hoursRemaining) / 60).toFixed(1)} h`}</td
                  ><td>{money(String(row.estimatedApprovedMinor), String(row.currency))}</td><td
                    >{money(String(row.estimatedPendingMinor), String(row.currency))}</td
                  ></tr
                >{:else}<tr
                  ><td colspan="8"
                    >{translate('No project assignment budget context is configured.')}</td
                  ></tr
                >{/each}</tbody
            >
          </table>
        </div>
      </section>
      <section class="record-list full pay-settlements">
        <div class="panel-title">
          <div>
            <h2>{translate('Settlement status')}</h2>
            <p>{translate('Finalized compensation events for your own approved work.')}</p>
          </div>
          <span>{data.settlements?.length ?? 0}</span>
        </div>
        {#each data.settlements ?? [] as settlement}<article class="record-card">
            <a
              class="record-card-link"
              href="{base}/app/projects/{String(settlement.projectId ?? '')}"
            >
              <div>
                <strong
                  >{settlement.projectNumber} · {settlement.periodStart} → {settlement.periodEnd}</strong
                ><small
                  >{controlledValue('status', settlement.state)} · {settlement.settledAt ??
                    translate('Estimate only')}</small
                >
              </div>
              <strong>{money(settlement.amountMinor, String(settlement.currency))}</strong>
              <span class="record-card-open">{translate('Open record →')}</span>
            </a>
          </article>{:else}<div class="empty">
            {translate('No compensation settlements in this period.')}
          </div>{/each}
      </section>
    {:else if data.section === 'projects'}
      <div class="management-stack">
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
                    <form method="POST" action="?/transitionProject" data-action="transitionProject">
                      <input type="hidden" name="projectId" value={row.id} />
                      <input type="hidden" name="version" value={row.version ?? 1} />
                      <input type="hidden" name="status" value="{row.status === 'active' ? 'closing' : 'closing'}" />
                      <label class="sr-only" for={`project-close-reason-${row.id}`}>{translate('Reason')}</label>
                      <input id={`project-close-reason-${row.id}`} name="reason" required placeholder={translate('Reason')} />
                      <button type="submit" class="secondary-button">{translate('Begin close')}</button>
                    </form>
                  {:else if row.status === 'closing'}
                    <form method="POST" action="?/transitionProject" data-action="transitionProject">
                      <input type="hidden" name="projectId" value={row.id} />
                      <input type="hidden" name="version" value={row.version ?? 1} />
                      <input type="hidden" name="status" value="closed" />
                      <label class="sr-only" for={`project-finish-reason-${row.id}`}>{translate('Reason')}</label>
                      <input id={`project-finish-reason-${row.id}`} name="reason" required placeholder={translate('Reason')} />
                      <button type="submit" class="secondary-button">{translate('Close project')}</button>
                    </form>
                  {:else if row.status === 'closed'}
                    <form method="POST" action="?/transitionProject" data-action="transitionProject">
                      <input type="hidden" name="projectId" value={row.id} />
                      <input type="hidden" name="version" value={row.version ?? 1} />
                      <input type="hidden" name="status" value="archived" />
                      <label class="sr-only" for={`project-archive-reason-${row.id}`}>{translate('Reason')}</label>
                      <input id={`project-archive-reason-${row.id}`} name="reason" required placeholder={translate('Reason')} />
                      <button type="submit" class="danger">{translate('Archive project')}</button>
                    </form>
                  {:else if row.status === 'archived'}
                    <form method="POST" action="?/transitionProject" data-action="transitionProject">
                      <input type="hidden" name="projectId" value={row.id} />
                      <input type="hidden" name="version" value={row.version ?? 1} />
                      <input type="hidden" name="status" value="restore" />
                      <label class="sr-only" for={`project-restore-reason-${row.id}`}>{translate('Reason')}</label>
                      <input id={`project-restore-reason-${row.id}`} name="reason" required placeholder={translate('Reason')} />
                      <button type="submit" class="secondary-button">{translate('Restore project')}</button>
                    </form>
                  {/if}
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
                <p class="form-help">{translate('Archived clients remain visible to management for safe restore; workers never receive this list.')}</p>
              </div>
              <span>{data.clients.length}</span>
            </div>
            {#each data.clients as client}
              <article class="record-card" data-client-id={client.id}>
                <div>
                  <strong>{client.client_number} · {client.display_name}</strong>
                  <small>{client.legal_name} · {client.currency} · {controlledValue('status', client.status)} · {client.billing_address ?? translate('Billing address missing')}</small>
                </div>
                <div class="record-actions lifecycle-actions">
                  {#if client.status === 'archived'}
                    <form method="POST" action="?/transitionClient" data-action="transitionClient">
                      <input type="hidden" name="clientId" value={client.id} />
                      <input type="hidden" name="version" value={client.version ?? 1} />
                      <input type="hidden" name="status" value="restore" />
                      <label class="sr-only" for={`client-restore-reason-${client.id}`}>{translate('Reason')}</label>
                      <input id={`client-restore-reason-${client.id}`} name="reason" required placeholder={translate('Reason')} />
                      <button type="submit" class="secondary-button">{translate('Restore client')}</button>
                    </form>
                  {:else}
                    <form method="POST" action="?/transitionClient" data-action="transitionClient">
                      <input type="hidden" name="clientId" value={client.id} />
                      <input type="hidden" name="version" value={client.version ?? 1} />
                      <input type="hidden" name="status" value="archived" />
                      <label class="sr-only" for={`client-archive-reason-${client.id}`}>{translate('Reason')}</label>
                      <input id={`client-archive-reason-${client.id}`} name="reason" required placeholder={translate('Reason')} />
                      <button type="submit" class="danger">{translate('Archive client')}</button>
                    </form>
                  {/if}
                </div>
              </article>
            {:else}<div class="empty">{translate('No clients recorded.')}</div>{/each}
          </section>
          <details class="admin-details">
            <summary class="primary-button">{translate('New Client')}</summary>
            <form method="POST" action="?/createClient" class="admin-form-grid">
              <h2>{translate('Create client')}</h2>
              <label>{translate('Legal name')}<input name="legalName" required /></label><label
                >{translate('Display name')}<input name="displayName" required /></label
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
              ><label>{translate('Billing contact name')}<input name="billingContactName" /></label
              ><label>{translate('Billing contact email')}<input name="billingEmail" type="email" /></label
              ><label class="wide-field">{translate('Billing address')}<textarea name="billingAddress" rows="3" required></textarea></label
              ><label>{translate('Payment terms (days)')}<input name="paymentTermsDays" type="number" min="0" max="365" value="30" required /></label
              ><label>{translate('PO / reference')}<input name="poReference" /></label
              ><label class="wide-field">{translate('Notes')}<textarea name="notes" rows="2"></textarea></label>
              <button>{translate('Create client')}</button>
            </form>
          </details>
          <details class="admin-details">
            <summary class="primary-button">{translate('Update Client')}</summary>
            <p class="form-help">{translate('Each editor carries the record version it displayed. A stale submission is rejected so another administrator\'s changes are not overwritten.')}</p>
            {#each data.clients as client}
              <form method="POST" action="?/updateClient" class="admin-form-grid client-edit-form">
                <input type="hidden" name="clientId" value={client.id} />
                <input type="hidden" name="version" value={client.version ?? 1} />
                <h3 class="wide-field">{client.client_number} · {client.display_name}</h3>
                {#if !client.billing_address}
                  <p class="form-help wide-field">{translate('Billing address is missing on this existing record. Enter the real address before saving; the interface will not invent one.')}</p>
                {/if}
                <label>{translate('Legal name')}<input name="legalName" value={String(client.legal_name ?? '')} required /></label>
                <label>{translate('Display name')}<input name="displayName" value={String(client.display_name ?? '')} required /></label>
                <label>{translate('Currency')}<select name="currency" required>
                  <option value="USD" selected={client.currency === 'USD'}>USD</option>
                  <option value="BRL" selected={client.currency === 'BRL'}>BRL</option>
                  <option value="EUR" selected={client.currency === 'EUR'}>EUR</option>
                </select></label>
                <label>{translate('Timezone')}<input name="timezone" value={String(client.timezone ?? '')} required /></label>
                <label>{translate('Billing contact name')}<input name="billingContactName" value={String(client.billing_contact_name ?? '')} /></label>
                <label>{translate('Billing contact email')}<input name="billingEmail" type="email" value={String(client.billing_email ?? '')} /></label>
                <label class="wide-field">{translate('Billing address')}<textarea name="billingAddress" rows="3" required>{String(client.billing_address ?? '')}</textarea></label>
                <label>{translate('Payment terms (days)')}<input type="number" name="paymentTermsDays" min="0" max="365" value={client.payment_terms_days ?? 30} required /></label>
                <label>{translate('PO / reference')}<input name="poReference" value={String(client.po_reference ?? '')} /></label>
                <label class="wide-field">{translate('Notes')}<textarea name="notes" rows="2">{String(client.notes ?? '')}</textarea></label>
                <button>{translate('Update client')}</button>
              </form>
            {:else}
              <p class="empty">{translate('No clients recorded.')}</p>
            {/each}
          </details>
          <details class="admin-details">
            <summary class="primary-button">{translate('New Project')}</summary>
            <form method="POST" action="?/createProject" class="admin-form-grid">
              <h2>{translate('Create project')}</h2>
              <label
                >{translate('Client')}<select name="clientId" required
                  >{#each activeClients as client}<option value={client.id}
                      >{client.client_number} — {client.display_name}</option
                    >{/each}</select
                ></label
              ><label>{translate('Name')}<input name="name" required /></label><label
                >{translate('Description')}<textarea name="description" rows="2"></textarea></label
              ><label>{translate('Project alias')}<input name="projectAlias" /></label><label
                >{translate('Currency')}<select name="currency"
                  ><option>USD</option><option>BRL</option><option>EUR</option></select
                ></label
              ><label
                >{translate('Project manager')}<select name="projectManagerId"
                  ><option value="">{translate('Unassigned')}</option
                  >{#each data.workers ?? [] as worker}{#if worker.role === 'project_manager' && worker.status === 'active'}<option value={worker.id}>{worker.name}</option>{/if}{/each}</select
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
              ><label>{translate('Start date')}<input name="startDate" type="date" /></label><label
                >{translate('Planned end date (optional)')}<input
                  name="plannedEndDate"
                  type="date"
                /></label
              ><label
                >{translate('Expected minutes / day')}<input
                  name="expectedMinutesPerDay"
                  type="number"
                  min="0"
                  max="1440"
                  value="600"
                  required
                /></label
              ><label
                >{translate('Client daily minimum minutes')}<input
                  name="clientDailyMinimumMinutes"
                  type="number"
                  min="0"
                  max="1440"
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
          </details>
          {#if canManageAssignmentControls}
          <details class="admin-details">
            <summary class="primary-button">{translate('Assign Worker')}</summary>
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
                >{translate('Role')}<input name="assignmentRole" value="worker" required /></label
              ><label>{translate('Starts on')}<input name="startsOn" type="date" required /></label
              ><label>{translate('Ends on (optional)')}<input name="endsOn" type="date" /></label
              ><button>{translate('Assign')}</button>
            </form>
          </details>
          <details class="admin-details">
            <summary class="primary-button">{translate('Update Assignment')}</summary>
            <h2>{translate('Update assignment')}</h2>
            {#each (data.assignments ?? []).filter((assignment) => assignment.status === 'active') as assignment}
              <form method="POST" action="?/updateAssignment" class="admin-form-grid assignment-edit-form">
                <input type="hidden" name="assignmentId" value={assignment.id} />
                <input type="hidden" name="version" value={assignment.version ?? 1} />
                <p class="form-help wide-field">{assignment.project_number} · {assignment.project_name} · {assignment.worker_name}</p>
                <label>{translate('Starts on')}<input name="startsOn" type="date" value={String(assignment.starts_on ?? '')} required /></label>
                <label>{translate('Ends on')}<input name="endsOn" type="date" value={String(assignment.ends_on ?? '')} /></label>
                <label>{translate('Planned minutes')}<input name="plannedMinutes" type="number" min="0" value={assignment.planned_minutes ?? ''} /></label>
                <label class="check"><input name="canReview" type="checkbox" checked={Boolean(assignment.can_review)} /> {translate('Can review')}</label>
                <button>{translate('Update assignment')}</button>
              </form>
            {:else}<p class="empty">{translate('No active assignments to edit.')}</p>{/each}
          </details>
          <details class="admin-details">
            <summary class="primary-button">{translate('Remove Assignment')}</summary>
            <h2>{translate('Remove assignment')}</h2>
            <p class="form-help">{translate('Removal ends the assignment and preserves its historical row. It never hard-deletes project history.')}</p>
            {#each (data.assignments ?? []).filter((assignment) => assignment.status === 'active') as assignment}
              <form method="POST" action="?/removeAssignment" class="admin-form-grid assignment-remove-form" data-action="removeAssignment">
                <input type="hidden" name="assignmentId" value={assignment.id} />
                <input type="hidden" name="version" value={assignment.version ?? 1} />
                <p class="form-help wide-field">{assignment.project_number} · {assignment.project_name} · {assignment.worker_name}</p>
                <label>{translate('End date')}<input name="endsOn" type="date" min={String(assignment.starts_on ?? '')} value={String(assignment.ends_on ?? '')} /></label>
                <label class="wide-field">{translate('Removal reason')}<input name="reason" required maxlength="2000" /></label>
                <button class="danger">{translate('Remove assignment')}</button>
              </form>
            {:else}<p class="empty">{translate('No active assignments to remove.')}</p>{/each}
          </details>
          {/if}
          {#if data.user.role === 'owner_admin'}
          <details class="admin-details">
            <summary class="primary-button">{translate('Invite/Create Worker')}</summary>
            <form method="POST" action="?/createInvitation" class="admin-form-grid">
              <h2>{translate('Invite new worker')}</h2>
              <p style="font-size: 0.85rem; color: #666; margin-bottom: 0.5rem;">
                {translate(
                  "Invitations require step-up authentication. The worker will be added as 'invited' status.",
                )}
              </p>
              <label>{translate('Email')}<input name="email" type="email" required /></label>
              <label
                >{translate('Role')}
                <select name="role" required>
                  <option value="worker">{translate('Worker')}</option>
                  <option value="project_manager">{translate('Project Manager')}</option>
                  <option value="finance_admin">{translate('Finance Admin')}</option>
                  <option value="auditor_read_only">{translate('Auditor (Read Only)')}</option>
                  <option value="owner_admin">{translate('Owner Admin')}</option>
                </select>
              </label>
              <input type="hidden" name="expiresInDays" value="7" />
              <button>{translate('Create Invitation')}</button>
            </form>
          </details>
          {/if}
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
                >{translate('Description')}<textarea name="description" rows="2"></textarea></label
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
                  value="600"
                  required
                /></label
              ><label
                >{translate('Tue minutes')}<input
                  name="tuesdayMinutes"
                  type="number"
                  min="0"
                  max="1440"
                  value="600"
                  required
                /></label
              ><label
                >{translate('Wed minutes')}<input
                  name="wednesdayMinutes"
                  type="number"
                  min="0"
                  max="1440"
                  value="600"
                  required
                /></label
              ><label
                >{translate('Thu minutes')}<input
                  name="thursdayMinutes"
                  type="number"
                  min="0"
                  max="1440"
                  value="600"
                  required
                /></label
              ><label
                >{translate('Fri minutes')}<input
                  name="fridayMinutes"
                  type="number"
                  min="0"
                  max="1440"
                  value="600"
                  required
                /></label
              ><label
                >{translate('Sat minutes')}<input
                  name="saturdayMinutes"
                  type="number"
                  min="0"
                  max="1440"
                  value="600"
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
                <p class="form-help">{translate('Inactive rows remain available for audit and historical attribution.')}</p>
              </div>
              <span>{data.assignments?.length ?? 0}</span>
            </div>
            {#each data.assignments ?? [] as assignment}
              <article class="record-card">
                <div>
                  <strong>{assignment.project_number} · {assignment.project_name}</strong>
                  <small>{assignment.worker_name} · {assignment.starts_on} → {assignment.ends_on ?? translate('Open assignment')} · {controlledValue('status', assignment.status)}</small>
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
                    <span class="state-tag {worker.status}" style="margin-left: 0.5rem;"
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
                  <div
                    class="worker-actions"
                    style="display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-end;"
                  >
                    <details>
                      <summary
                        style="cursor: pointer; font-size: 0.875rem; font-weight: 500; padding: 0.25rem 0.5rem; border-radius: 4px; background: var(--surface-3);"
                        >{translate('Manage worker')}</summary
                      >
                      <div
                        class="worker-manage-panel"
                        style="margin-top: 0.5rem; background: var(--surface-2); padding: 1rem; border-radius: 4px; display: flex; flex-direction: column; gap: 1rem; align-items: flex-start; text-align: left; width: 280px;"
                      >
                        <form
                          method="POST"
                          action="?/updateWorkerProfile"
                          class="compact-form"
                          style="display: flex; flex-direction: column; gap: 0.5rem; width: 100%;"
                        >
                          <h4 style="margin: 0; font-size: 0.875rem;">
                            {translate('Edit Profile')}
                          </h4>
                          <input type="hidden" name="workerId" value={worker.id} />
                          <label style="display: flex; flex-direction: column; font-size: 0.75rem;"
                            >{translate('Name')}
                            <input
                              name="name"
                              value={worker.name}
                              required
                              style="margin-top: 0.25rem;"
                            /></label
                          >
                          <label style="display: flex; flex-direction: column; font-size: 0.75rem;"
                            >{translate('Email')}
                            <input
                              name="email"
                              value={worker.email}
                              type="email"
                              required
                              style="margin-top: 0.25rem;"
                            /></label
                          >
                          <label style="display: flex; flex-direction: column; font-size: 0.75rem;"
                            >{translate('Role')}
                            <select name="role" required style="margin-top: 0.25rem;">
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
                          <label style="display: flex; flex-direction: column; font-size: 0.75rem;"
                            >{translate('Joined At')}
                            <input
                              name="joinedAt"
                              type="date"
                              value={worker.created_at
                                ? String(worker.created_at).slice(0, 10)
                                : ''}
                              required
                              style="margin-top: 0.25rem;"
                            /></label
                          >
                          <button type="submit" style="margin-top: 0.25rem;"
                            >{translate('Save profile')}</button
                          >
                        </form>

                        <form
                          method="POST"
                          action="?/updateUserStatus"
                          class="compact-form"
                          style="display: flex; flex-direction: column; gap: 0.5rem; width: 100%; border-top: 1px solid var(--border); padding-top: 1rem;"
                        >
                          <h4 style="margin: 0; font-size: 0.875rem;">
                            {translate('Account Status')}
                          </h4>
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
        {#if canManageAssignmentControls}<form method="POST" action="?/createPlanning" class="admin-form-grid">
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
                value="600"
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
    {:else if data.section === 'approvals' || data.section === 'billing'}
      {#if data.section === 'approvals'}
        <section class="record-list full">
          <div class="panel-title">
            <h2>{translate('Records requiring review')}</h2>
            <span>{data.records?.length ?? 0}</span>
          </div>
          {#each data.records ?? [] as row}<article class="approval-row">
              <a class="record-card-link" href={recordHref(row)}>
                <strong>{row.type} · {row.date}</strong><small
                  >{row.amount}
                  {row.type === 'time' ? translate('minutes') : translate('minor units')} · {controlledValue(
                    'status',
                    row.approval_state,
                  )}</small
                >
                <span class="record-card-open">{translate('Open record →')}</span>
              </a>
              <div class="record-actions">
                {#if isAuditor}<span class="state-tag">{translate('Read-only review')}</span
                  >{:else if row.review_stage === 'report'}<form
                    method="POST"
                    action="?/reviewReport"
                  >
                    <input type="hidden" name="type" value={row.type} /><input
                      type="hidden"
                      name="id"
                      value={row.id}
                    /><input type="hidden" name="decision" value="approved" /><button
                      >{translate('Approve report')}</button
                    >
                  </form>
                  <form method="POST" action="?/reviewReport">
                    <input type="hidden" name="type" value={row.type} /><input
                      type="hidden"
                      name="id"
                      value={row.id}
                    /><input type="hidden" name="decision" value="needs_changes" /><label
                      >{translate('Required change')}<input name="reason" required /></label
                    ><button>{translate('Return')}</button>
                  </form>{:else if row.review_stage === 'correction' || row.review_stage === 'owner_override'}<form
                    method="POST"
                    action="?/createCorrectionDraft"
                  >
                    <input
                      type="hidden"
                      name="recordType"
                      value={row.type === 'time'
                        ? 'time_entry'
                        : row.type === 'expense'
                          ? 'expense'
                          : `${row.type}_report`}
                    /><input type="hidden" name="originalId" value={row.id} /><input
                      type="hidden"
                      name="requestId"
                      value={`approval-correction-${row.type}-${row.id}`}
                    />{#if row.review_stage === 'owner_override'}<input
                        type="hidden"
                        name="ownerOverride"
                        value="yes"
                      />{/if}<label
                      >{translate(
                        row.review_stage === 'owner_override'
                          ? 'Owner override reason'
                          : 'Correction reason',
                      )}<input name="reason" minlength="3" required /></label
                    ><button
                      >{translate(
                        row.review_stage === 'owner_override'
                          ? 'Create owner override draft'
                          : 'Create correction draft',
                      )}</button
                    >
                  </form>{:else if row.review_stage === 'finance'}<form
                    method="POST"
                    action="?/financeApprove"
                  >
                    <input type="hidden" name="type" value={row.type} /><input
                      type="hidden"
                      name="id"
                      value={row.id}
                    />{#if row.type === 'time'}<select name="billable"
                        ><option value="yes">{translate('Billable')}</option><option value="no"
                          >{translate('Non-billable')}</option
                        ></select
                      >{/if}<button>{translate('Finance approve')}</button>
                  </form>{:else}<form method="POST" action="?/approveRecord">
                    <input type="hidden" name="type" value={row.type} /><input
                      type="hidden"
                      name="id"
                      value={row.id}
                    /><input type="hidden" name="decision" value="approved" /><button
                      >{translate('Approve')}</button
                    >
                  </form>
                  <form method="POST" action="?/approveRecord">
                    <input type="hidden" name="type" value={row.type} /><input
                      type="hidden"
                      name="id"
                      value={row.id}
                    /><input type="hidden" name="decision" value="rejected" /><label
                      >{translate('Rejection reason')}<input name="reason" required /></label
                    ><button>{translate('Reject')}</button>
                  </form>{/if}
              </div>
            </article>{:else}<div class="empty">{translate('Approval queue clear.')}</div>{/each}
        </section>
        <section class="record-list full">
          <div class="panel-title">
            <h2>{translate('Milestones awaiting approval')}</h2>
            <span>{data.milestones?.length ?? 0}</span>
          </div>
          {#each data.milestones ?? [] as milestone}<article class="approval-row">
              <a class="record-card-link" href={`${base}/app/projects/${milestone.project_id}`}>
                <strong>{milestone.project_number} · {milestone.name}</strong><small
                  >{milestone.due_on ?? translate('No due date')} · {milestone.amount_minor}
                  {milestone.currency} · {translate('submitted')}</small
                >
                <span class="record-card-open">{translate('Open record →')}</span>
              </a>
              <div class="record-actions">
                {#if isAuditor}<span class="state-tag">{translate('Read-only review')}</span
                  >{:else}<form method="POST" action="?/reviewMilestone">
                    <input type="hidden" name="id" value={milestone.id} /><input
                      type="hidden"
                      name="decision"
                      value="approved"
                    /><button>{translate('Approve milestone')}</button>
                  </form>
                  <form method="POST" action="?/reviewMilestone">
                    <input type="hidden" name="id" value={milestone.id} /><input
                      type="hidden"
                      name="decision"
                      value="rejected"
                    /><input name="reason" placeholder={translate('Reason')} required /><button
                      >{translate('Reject')}</button
                    >
                  </form>{/if}
              </div>
            </article>{:else}<div class="empty">
              {translate('No milestones await approval.')}
            </div>{/each}
        </section>
      {/if}
      {#if !isAuditor}
        <details class="admin-details">
          <summary class="primary-button">{translate('Configure Billing Stream')}</summary>
          <form method="POST" action="?/createBillingRule" class="admin-form-grid">
            <h2>{translate('Configure billing stream')}</h2>
            <p class="form-help">
              {translate(
                'Labor and expense streams are configured independently. Draft generation may be automatic; invoice issue and send remain manual.',
              )}
            </p>
            <label
              >{translate('Project')}<select name="projectId" required
                ><option value="">{translate('Select project')}</option
                >{#each availableProjects as project}<option value={project.id}
                    >{project.project_number} — {project.name} ({project.currency})</option
                  >{/each}</select
              ></label
            ><label
              >{translate('Stream')}<select name="streamType" required
                ><option value="labor">{translate('Labor')}</option><option value="expense"
                  >{translate('Expenses')}</option
                ><option value="milestone">{translate('Milestone')}</option><option value="other"
                  >{translate('Other')}</option
                ></select
              ></label
            ><label
              >{translate('Cadence')}<select name="cadenceType" required
                ><option value="weekly">{translate('Weekly')}</option><option value="every_14_days"
                  >{translate('Every 14 days')}</option
                ><option value="semi_monthly">{translate('Semi-monthly')}</option><option
                  value="monthly">{translate('Monthly')}</option
                ><option value="custom">{translate('Custom')}</option><option value="milestone"
                  >{translate('Milestone')}</option
                ><option value="manual">{translate('Manual')}</option></select
              ></label
            ><label
              >{translate('Effective from')}<input
                name="effectiveFrom"
                type="date"
                required
              /></label
            ><label>{translate('Anchor date')}<input name="anchorDate" type="date" /></label><label
              >{translate('Legal entity')}<select name="legalEntityId" required
                ><option value="">{translate('Select legal entity')}</option
                >{#each data.legalEntities ?? [] as entity}<option value={entity.id}
                    >{entity.code} — {entity.legal_name} ({entity.currency})</option
                  >{/each}</select
              ></label
            ><label
              >{translate('Tax profile')}<select name="taxProfileId" required
                ><option value="">{translate('Select tax profile')}</option
                >{#each data.taxProfiles ?? [] as profile}<option value={profile.id}
                    >{profile.name} ({profile.currency})</option
                  >{/each}</select
              ></label
            ><label
              >{translate('Currency')}<select name="currency" required
                ><option>USD</option><option>BRL</option><option>EUR</option></select
              ></label
            ><label
              >{translate('Invoice template')}<input
                name="templateId"
                value="default"
                required
              /></label
            ><label
              >{translate('Recipient email')}<input name="recipientEmail" type="email" /></label
            ><label
              >{translate('Billing contact')}<select name="billingContactId"
                ><option value="">{translate('Use recipient email')}</option
                >{#each data.contacts ?? [] as contact}<option value={contact.id}
                    >{contact.client_number} · {contact.name} · {contact.email ??
                      translate('no email')}</option
                  >{/each}</select
              ></label
            ><label
              >{translate('Payment terms (days)')}<input
                name="paymentTermsDays"
                type="number"
                min="0"
                max="365"
                value="30"
                required
              /></label
            ><label>{translate('PO reference')}<input name="poNumberOverride" /></label><label
              >{translate('Grouping')}<select name="groupingMode"
                ><option value="summary">{translate('Summary')}</option><option value="detail"
                  >{translate('Detail')}</option
                ><option value="by_worker">{translate('By worker')}</option><option value="by_day"
                  >{translate('By day')}</option
                ><option value="by_category">{translate('By category')}</option></select
              ></label
            ><label
              >{translate('Semi-monthly rule')}<input
                name="semiMonthlyRule"
                value="1_15_16_end"
                required
              /></label
            ><label class="check"
              ><input name="autoGenerateDraft" type="checkbox" />
              {translate('Generate drafts when the stream is due')}</label
            ><button>{translate('Save billing stream')}</button>
          </form>
        </details>

        <details class="admin-details">
          <summary class="primary-button">{translate('New Legal Entity')}</summary>
          <form method="POST" action="?/createLegalEntity" class="admin-form-grid">
            <h2>{translate('Legal entity')}</h2>
            <label>{translate('Code')}<input name="code" required /></label><label
              >{translate('Legal name')}<input name="legalName" required /></label
            ><label
              >{translate('Currency')}<select name="currency"
                ><option>USD</option><option>BRL</option><option>EUR</option></select
              ></label
            ><label
              >{translate('Billing address')}<textarea name="billingAddress" rows="3" required
              ></textarea></label
            ><label
              >{translate('Company identifiers')}<textarea
                name="companyIdentifiers"
                rows="2"
                required
              ></textarea></label
            ><button>{translate('Save legal entity')}</button>
          </form>
        </details>

        <details class="admin-details">
          <summary class="primary-button">{translate('Update Legal Entity')}</summary>
          <form method="POST" action="?/updateLegalEntity" class="admin-form-grid">
            <h2>{translate('Update legal entity')}</h2>
            <label
              >{translate('Legal Entity')}<select name="legalEntityId" required>
                {#each data.legalEntities ?? [] as entity}<option value={entity.id}
                    >{entity.code} — {entity.legal_name}</option
                  >{/each}
              </select></label
            >
            <label>{translate('Legal name')}<input name="legalName" /></label>
            <label
              >{translate('Currency')}<select name="currency"
                ><option value="">{translate('Keep current')}</option><option value="USD"
                  >USD</option
                ><option value="BRL">BRL</option><option value="EUR">EUR</option></select
              ></label
            >
            <label
              >{translate('Billing address')}<textarea name="billingAddress" rows="3"
              ></textarea></label
            >
            <label
              >{translate('Company identifiers')}<textarea name="companyIdentifiers" rows="2"
              ></textarea></label
            >
            <button>{translate('Update legal entity')}</button>
          </form>
        </details>

        <details class="admin-details">
          <summary class="primary-button">{translate('Archive Legal Entity')}</summary>
          <form method="POST" action="?/archiveLegalEntity" class="admin-form-grid">
            <h2>{translate('Archive legal entity')}</h2>
            <label
              >{translate('Legal Entity')}<select name="legalEntityId" required>
                {#each data.legalEntities ?? [] as entity}<option value={entity.id}
                    >{entity.code} — {entity.legal_name}</option
                  >{/each}
              </select></label
            >
            <button class="danger">{translate('Archive legal entity')}</button>
          </form>
        </details>

        <details class="admin-details">
          <summary class="primary-button">{translate('New Invoice Numbering Policy')}</summary>
          <form method="POST" action="?/createInvoiceNumberPolicy" class="admin-form-grid">
            <h2>{translate('Invoice numbering policy')}</h2>
            <label
              >{translate('Legal entity')}<select name="legalEntityId" required
                ><option value="">{translate('Select entity')}</option
                >{#each data.legalEntities ?? [] as entity}<option value={entity.id}
                    >{entity.code} — {entity.legal_name}</option
                  >{/each}</select
              ></label
            ><label>{translate('Prefix')}<input name="prefix" value="JA-" required /></label><label
              >{translate('Digits')}<input
                name="digits"
                type="number"
                min="4"
                max="10"
                value="6"
                required
              /></label
            ><label
              >{translate('Effective from')}<input
                name="effectiveFrom"
                type="date"
                required
              /></label
            ><label
              >{translate('Accountant approved at')}<input
                name="accountantApprovedAt"
                type="datetime-local"
                required
              /></label
            ><button>{translate('Save numbering policy')}</button>
          </form>
        </details>

        <details class="admin-details">
          <summary class="primary-button">{translate('New Tax Profile')}</summary>
          <form method="POST" action="?/createTaxProfile" class="admin-form-grid">
            <h2>{translate('Tax profile')}</h2>
            <label
              >{translate('Legal entity')}<select name="legalEntityId"
                ><option value="">{translate('Global profile')}</option
                >{#each data.legalEntities ?? [] as entity}<option value={entity.id}
                    >{entity.code} — {entity.legal_name}</option
                  >{/each}</select
              ></label
            ><label>{translate('Name')}<input name="name" required /></label><label
              >{translate('Currency')}<select name="currency"
                ><option>USD</option><option>BRL</option><option>EUR</option></select
              ></label
            ><label
              >{translate('Effective from')}<input
                name="effectiveFrom"
                type="date"
                required
              /></label
            ><label
              >{translate('Component')}<input
                name="componentName"
                value="VAT / sales tax"
                required
              /></label
            ><label
              >{translate('Rate (basis points)')}<input
                name="componentBasisPoints"
                type="number"
                min="0"
                max="100000"
                value="0"
                required
              /></label
            ><label class="check"
              ><input name="componentCompound" type="checkbox" /> {translate('Compound tax')}</label
            ><button>{translate('Save tax profile')}</button>
          </form>
        </details>

        <details class="admin-details">
          <summary class="primary-button">{translate('Update Tax Profile')}</summary>
          <form method="POST" action="?/updateTaxProfile" class="admin-form-grid">
            <h2>{translate('Update tax profile')}</h2>
            <label
              >{translate('Tax Profile')}<select name="taxProfileId" required>
                {#each data.taxProfiles ?? [] as profile}<option value={profile.id}
                    >{profile.name}</option
                  >{/each}
              </select></label
            >
            <label>{translate('Name')}<input name="name" /></label>
            <button>{translate('Update tax profile')}</button>
          </form>
        </details>

        <details class="admin-details">
          <summary class="primary-button">{translate('Archive Tax Profile')}</summary>
          <form method="POST" action="?/archiveTaxProfile" class="admin-form-grid">
            <h2>{translate('Archive tax profile')}</h2>
            <label
              >{translate('Tax Profile')}<select name="taxProfileId" required>
                {#each data.taxProfiles ?? [] as profile}<option value={profile.id}
                    >{profile.name}</option
                  >{/each}
              </select></label
            >
            <button class="danger">{translate('Archive tax profile')}</button>
          </form>
        </details>
      {/if}
      <section class="record-list">
        <div class="panel-title">
          <h2>{translate('Billing rules')}</h2>
          <span>{data.billingRules?.length ?? 0}</span>
        </div>
        {#each data.billingRules ?? [] as rule}<article>
            <div>
              <strong>{rule.project_number} · {rule.stream_type}</strong><small
                >{rule.cadence_type} · {rule.currency} · {rule.tax_profile_name ??
                  'No tax profile'}</small
              >
            </div>
            {#if !isAuditor}<div class="compact-actions billing-rule-actions">
                <details class="billing-rule-editor">
                  <summary class="secondary-button">{translate('Edit billing rule')}</summary>
                  <form method="POST" action="?/updateBillingRule" class="admin-form-grid">
                    <input type="hidden" name="billingRuleId" value={rule.id} />
                    <label
                      >{translate('Invoice template')}<input
                        name="templateId"
                        value={String(rule.template_id ?? 'default')}
                      /></label
                    >
                    <label
                      >{translate('Recipient email')}<input
                        name="recipientEmail"
                        type="email"
                        value={String(rule.recipient_email ?? '')}
                      /></label
                    >
                    <label
                      >{translate('Payment terms (days)')}<input
                        name="paymentTermsDays"
                        type="number"
                        min="0"
                        max="365"
                        value={String(rule.payment_terms_days ?? 30)}
                      /></label
                    >
                    <label
                      >{translate('PO reference')}<input
                        name="poNumberOverride"
                        value={String(rule.po_number_override ?? '')}
                      /></label
                    >
                    <label
                      >{translate('Grouping')}<select name="groupingMode">
                        <option value="summary" selected={rule.grouping_mode === 'summary'}
                          >{translate('Summary')}</option
                        >
                        <option value="detail" selected={rule.grouping_mode === 'detail'}
                          >{translate('Detail')}</option
                        >
                        <option value="by_worker" selected={rule.grouping_mode === 'by_worker'}
                          >{translate('By worker')}</option
                        >
                        <option value="by_day" selected={rule.grouping_mode === 'by_day'}
                          >{translate('By day')}</option
                        >
                        <option value="by_category" selected={rule.grouping_mode === 'by_category'}
                          >{translate('By category')}</option
                        >
                      </select></label
                    >
                    <button type="submit">{translate('Save billing rule')}</button>
                  </form>
                </details>
                <form
                  method="POST"
                  action="?/archiveBillingRule"
                  onsubmit={(event) => {
                    if (!confirm(translate('Archive this billing rule?'))) event.preventDefault();
                  }}
                >
                  <input type="hidden" name="billingRuleId" value={rule.id} />
                  <button class="danger" type="submit">{translate('Archive billing rule')}</button>
                </form>
                <form method="POST" action="?/createDraft" class="compact-form">
                  <input type="hidden" name="billingRuleId" value={rule.id} /><input
                    name="periodStart"
                    type="date"
                    aria-label={translate('Period start')}
                    required
                  /><input
                    name="periodEnd"
                    type="date"
                    aria-label={translate('Period end')}
                    required
                  /><button>{translate('Build draft')}</button>
                </form>
                <form method="POST" action="?/closePeriod" class="compact-form">
                  <input type="hidden" name="billingRuleId" value={rule.id} /><input
                    name="periodStart"
                    type="date"
                    aria-label={translate('Close period start')}
                    required
                  /><input
                    name="periodEnd"
                    type="date"
                    aria-label={translate('Close period end')}
                    required
                  /><label
                    >{translate('Report language')}<select
                      name="reportLocale"
                      aria-label={translate('Report language')}
                    >
                      <option value="en">{translate('English')}</option><option value="pt"
                        >{translate('Português (BR)')}</option
                      ><option value="es">{translate('Spanish')}</option>
                    </select></label
                  ><button>{translate('Close sources')}</button>
                </form>
              </div>{/if}
          </article>{/each}
      </section>
      <section class="record-list full">
        <div class="panel-title">
          <h2>{translate('Invoices')}</h2>
          <span>{data.invoices?.length ?? 0}</span>
        </div>
        {#each data.invoices ?? [] as invoice}
          {@const ledgerRow = ledgerForInvoice(invoice.id)}
          <article class="invoice-row">
            <div>
              <strong>{invoice.invoice_number || 'Draft'} · {invoice.project_number}</strong><small
                >{controlledValue('billingStream', invoice.stream_type)} · {controlledValue(
                  'status',
                  invoice.state,
                )} · {paymentMoney(invoice.total_minor, String(invoice.currency))} · {translate('Currency')}: {String(
                  invoice.currency,
                )}</small
              >
              {#if ledgerRow}<small
                  >{translate('Collected')}: {paymentMoney(
                    ledgerRow.netCollectedMinor,
                    String(invoice.currency),
                  )} · {translate('Outstanding')}: {paymentMoney(
                    ledgerRow.outstandingMinor,
                    String(invoice.currency),
                  )} · {translate('Payment state')}: {controlledValue(
                    'status',
                    ledgerRow.paymentStatus,
                  )}</small
                >{/if}
            </div>
            {#if ledgerRow}<details class="payment-history">
                <summary>{translate('Collections and reversals')}</summary>
                <p class="form-help">
                  {translate('Gross')}: {paymentMoney(ledgerRow.grossPaymentsMinor, String(invoice.currency))} ·
                  {translate('Reversals')}: {paymentMoney(
                    ledgerRow.paymentReversalsMinor,
                    String(invoice.currency),
                  )} · {translate('Net')}: {paymentMoney(
                    ledgerRow.netCollectedMinor,
                    String(invoice.currency),
                  )}
                </p>
                {#each ledgerRow.payments ?? [] as payment}
                  {@const remainingMinor = String(payment.netAmountMinor ?? '0')}
                  <article class="record-card payment-history-row">
                    <div>
                      <strong>{translate('Payment')} · {String(payment.id ?? '—').slice(0, 12)}</strong>
                      <small
                        >{paymentMoney(payment.grossAmountMinor, String(payment.currency ?? invoice.currency))} ·
                        {String(payment.received_at ?? '').slice(0, 10)} ·
                        {String(payment.reference ?? translate('No reference'))}</small
                      >
                      <small
                        >{translate('Reversed')}: {paymentMoney(
                          payment.reversedMinor,
                          String(payment.currency ?? invoice.currency),
                        )} · {translate('Net')}: {paymentMoney(
                          payment.netAmountMinor,
                          String(payment.currency ?? invoice.currency),
                        )}</small
                      >
                    </div>
                    {#if !isAuditor && !['void', 'credited'].includes(String(invoice.state)) && positiveMinor(remainingMinor)}<form
                        method="POST"
                        action="?/reversePayment"
                        class="payment-form reversal-form"
                      >
                        <input type="hidden" name="paymentId" value={payment.id} />
                        <label
                          >{translate('Reversal amount')}<input
                            name="amount"
                            inputmode="decimal"
                            type="number"
                            min="0.01"
                            step="0.01"
                            max={minorToDecimal(remainingMinor)}
                            value={minorToDecimal(remainingMinor)}
                            aria-label={translate('Reversal amount')}
                            required
                          /></label
                        >
                        <label
                          >{translate('Effective date')}<input
                            name="effectiveOn"
                            type="date"
                            aria-label={translate('Effective date')}
                            required
                          /></label
                        >
                        <label
                          >{translate('Reason code')}<select
                            name="reasonCode"
                            aria-label={translate('Reason code')}
                            required
                          >
                            <option value="bank_return">{translate('Bank return')}</option>
                            <option value="duplicate">{translate('Duplicate')}</option>
                            <option value="entry_correction">{translate('Entry correction')}</option>
                            <option value="other">{translate('Other')}</option>
                          </select></label
                        >
                        <label
                          >{translate('Reason')}<input
                            name="reason"
                            placeholder={translate('Reason')}
                            aria-label={translate('Reason')}
                            required
                          /></label
                        >
                        <input
                          type="hidden"
                          name="idempotencyKey"
                          value={`reversal-${String(payment.id)}-${remainingMinor}`}
                        />
                        <button>{translate('Reverse payment')}</button>
                      </form>{/if}
                  </article>
                {:else}<p class="empty">{translate('No payments recorded.')}</p>{/each}
                {#if (ledgerRow.paymentReversals?.length ?? 0) > 0}<div class="table-wrap">
                    <table>
                      <caption>{translate('Immutable reversal history')}</caption>
                      <thead
                        ><tr
                          ><th>{translate('Payment')}</th><th>{translate('Amount')}</th><th
                            >{translate('Effective date')}</th
                          ><th>{translate('Reason code')}</th><th>{translate('Reason')}</th></tr
                        ></thead
                      ><tbody
                        >{#each ledgerRow.paymentReversals ?? [] as reversal}<tr
                            ><td>{String(reversal.originalPaymentId ?? '—').slice(0, 12)}</td><td
                              >{paymentMoney(reversal.amountMinor, String(reversal.currency ?? invoice.currency))}</td
                            ><td>{String(reversal.effectiveAt ?? '').slice(0, 10)}</td><td
                              >{controlledValue('status', reversal.reasonCode)}</td
                            ><td>{String(reversal.reason ?? '—')}</td></tr
                          >{/each}</tbody
                      >
                    </table>
                  </div>{/if}
              </details>{/if}
            <div class="record-actions">
              <a class="preview-link" href={`${base}/app/billing/invoices/${invoice.id}`}
                >{translate('Preview')}</a
              >
              {#if !isAuditor}{#if invoice.state === 'draft'}<form
                    method="POST"
                    action="?/approveInvoice"
                  >
                    <input type="hidden" name="invoiceId" value={invoice.id} /><button
                      >{translate('Approve')}</button
                    >
                  </form>{:else if invoice.state === 'approved'}<form
                    method="POST"
                    action="?/issueInvoice"
                  >
                    <input type="hidden" name="invoiceId" value={invoice.id} /><label
                      >{translate('Report language')}<select
                        name="reportLocale"
                        aria-label={translate('Invoice report language')}
                      >
                        <option value="en">EN</option><option value="pt">PT-BR</option><option
                          value="es">ES</option
                        >
                      </select></label
                    ><button>{translate('Issue')}</button>
                  </form>{:else if ['issued', 'sent', 'partially_paid', 'overdue'].includes(String(invoice.state))}<form
                    method="POST"
                    action="?/recordPayment"
                    class="payment-form"
                  >
                    <input type="hidden" name="invoiceId" value={invoice.id} /><label
                      >{translate('Payment amount')}<input
                        name="amount"
                        inputmode="decimal"
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={minorToDecimal(ledgerRow?.outstandingMinor ?? invoice.total_minor)}
                        placeholder={translate('0.00')}
                        aria-label={translate('Payment amount')}
                        required
                      /></label
                    ><label
                      >{translate('Currency')}<input
                        name="currency"
                        value={String(invoice.currency)}
                        readonly
                        aria-readonly="true"
                        required
                      /></label
                    ><label
                      >{translate('Received on')}<input
                        name="receivedOn"
                        type="date"
                        aria-label={translate('Received on')}
                        required
                      /></label
                    ><label
                      >{translate('Payment reference / note')}<input
                        name="reference"
                        placeholder={translate('Payment reference / note')}
                        aria-label={translate('Payment reference / note')}
                        required
                      /></label
                    ><input
                      name="idempotencyKey"
                      type="hidden"
                      value={String(invoice.paymentCommandToken ?? `payment-${String(invoice.id)}-${String(invoice.currency)}`)}
                    /><button>{translate('Record payment')}</button>
                  </form>{/if}
                {#if invoice.state === 'issued'}
                  <form method="POST" action="?/sendInvoice">
                    <input type="hidden" name="invoiceId" value={invoice.id} /><input
                      type="hidden"
                      name="idempotencyKey"
                      value={`send-${invoice.id}`}
                    /><button>{translate('Mark sent')}</button>
                  </form>
                {/if}
                {#if ['issued', 'sent', 'partially_paid', 'overdue'].includes(String(invoice.state))}
                  <form method="POST" action="?/voidInvoice">
                    <input type="hidden" name="invoiceId" value={invoice.id} /><input
                      type="hidden"
                      name="idempotencyKey"
                      value={`void-${invoice.id}`}
                    /><input
                      name="reason"
                      placeholder={translate('Void reason')}
                      aria-label={translate('Void reason')}
                      required
                    /><button>{translate('Void')}</button>
                  </form>
                {/if}
                {#if ['issued', 'sent', 'partially_paid', 'overdue'].includes(String(invoice.state))}
                  <form method="POST" action="?/createInvoiceAdjustment" class="payment-form">
                    <input type="hidden" name="originalInvoiceId" value={invoice.id} />
                    <select name="adjustmentType" aria-label={translate('Adjustment type')}>
                      <option value="credit">{translate('Credit')}</option><option value="debit"
                        >{translate('Debit')}</option
                      ><option value="correction">{translate('Correction')}</option>
                    </select>
                    <input
                      name="amountMinor"
                      placeholder={translate('Minor-unit amount')}
                      aria-label={translate('Adjustment amount')}
                      required
                    />
                    <input
                      name="reason"
                      placeholder={translate('Reason')}
                      aria-label={translate('Adjustment reason')}
                      required
                    />
                    <button>{translate('Create adjustment')}</button>
                  </form>
                {/if}{/if}
            </div>
          </article>{:else}<div class="empty">{translate('No invoice drafts.')}</div>{/each}
      </section>
    {:else if data.section === 'finance' && data.finance}
      <form class="filter-form">
        <label
          >{translate('Project')}<select
            name="project"
            onchange={(event) => event.currentTarget.form?.requestSubmit()}
            >{#each availableProjects as project}<option
                value={project.id}
                selected={project.id === data.selectedProjectId}
                >{project.project_number} — {project.name}</option
              >{/each}</select
          ></label
        >
      </form>
      <div class="finance-grid">
        {#each [['Approved cost', data.finance.approvedCostMinor], ['Revenue candidate', data.finance.revenueCandidateMinor], ['Contribution margin', data.finance.contributionMarginMinor], ['Invoiced', data.finance.invoicedMinor], ['Paid', data.finance.paidMinor], ['Receivable', data.finance.receivableMinor], ['Approved unbilled WIP', data.finance.approvedUnbilledWipMinor], ['Unapproved WIP', data.finance.unapprovedWipMinor]] as metric}<section
            class="metric"
          >
            <span>{translate(String(metric[0]))}</span><strong
              >{money(metric[1], data.finance.currency)}</strong
            >
          </section>{/each}
      </div>
      <p class="finance-note">
        {translate(
          'Contribution margin is project revenue less approved project cost. It is not company net profit.',
        )}
      </p>
      <section class="record-list full forecast-panel">
        <div class="panel-title">
          <div>
            <h2>{translate('Forecast and budget control')}</h2>
            <p>
              {translate(
                'Forecasts use actual records first and only use configured planning data for the remaining work. They never create actual time or billing sources.',
              )}
            </p>
          </div>
          <span
            >{data.finance.forecastAvailable
              ? translate('Planning basis available')
              : translate('No detailed plan')}</span
          >
        </div>
        <div class="finance-grid">
          {#each [['Planned remaining', data.finance.plannedRemainingMinutes === null ? '—' : `${(Number(data.finance.plannedRemainingMinutes) / 60).toFixed(1)} h`], ['ETC direct cost', data.finance.estimateToCompleteMinor === null ? '—' : money(data.finance.estimateToCompleteMinor, data.finance.currency)], ['EAC direct cost', data.finance.estimateAtCompletionCostMinor === null ? '—' : money(data.finance.estimateAtCompletionCostMinor, data.finance.currency)], ['Expected final margin', data.finance.expectedFinalMarginMinor === null ? '—' : money(data.finance.expectedFinalMarginMinor, data.finance.currency)], ['Hours consumed', data.finance.hoursConsumedBps === null ? '—' : `${(Number(data.finance.hoursConsumedBps) / 100).toFixed(1)}%`], ['Travel budget used', data.finance.travelBudgetConsumedBps === null ? '—' : `${(Number(data.finance.travelBudgetConsumedBps) / 100).toFixed(1)}%`]] as metric}<section
              class="metric"
            >
              <span>{translate(String(metric[0]))}</span><strong>{metric[1]}</strong>
            </section>{/each}
        </div>
        {#if data.finance.alerts?.length}<div class="alert-strip" role="status">
            {#each data.finance.alerts as alert}<span>{String(alert).replaceAll('_', ' ')}</span
              >{/each}
          </div>{/if}
      </section>
      {#if data.portfolio}<section class="record-list full economics-list">
          <div class="panel-title">
            <div>
              <h2>{translate('Portfolio views')}</h2>
              <p>
                {translate(
                  'Admin/Finance-only aggregates remain grouped by currency and drill back to the selected project economics.',
                )}
              </p>
            </div>
            <span>{data.portfolio.projects?.length ?? 0} {translate('projects')}</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead
                ><tr
                  ><th>{translate('Project')}</th><th>{translate('Client')}</th><th
                    >{translate('Currency')}</th
                  ><th>{translate('Approved hours')}</th><th>{translate('Revenue candidate')}</th
                  ><th>{translate('Direct cost')}</th><th>{translate('Contribution')}</th><th
                    >{translate('WIP')}</th
                  ></tr
                ></thead
              >
              <tbody
                >{#each data.portfolio.projects ?? [] as row}<tr
                    ><td>{String(row.projectNumber)} · {String(row.projectName)}</td><td
                      >{String(row.clientName)}</td
                    ><td>{String(row.currency)}</td><td
                      >{(Number(row.approvedMinutes ?? 0) / 60).toFixed(1)} h</td
                    ><td>{money(String(row.revenueCandidateMinor), String(row.currency))}</td><td
                      >{money(String(row.approvedCostMinor), String(row.currency))}</td
                    ><td>{money(String(row.contributionMarginMinor), String(row.currency))}</td><td
                      >{money(String(row.approvedUnbilledWipMinor), String(row.currency))}</td
                    ></tr
                  >{:else}<tr
                    ><td colspan="8">{translate('No finance projects are available.')}</td></tr
                  >{/each}</tbody
              >
            </table>
          </div>
          <div class="table-wrap">
            <table>
              <thead
                ><tr
                  ><th>{translate('Worker')}</th><th>{translate('Currency')}</th><th
                    >{translate('Approved hours')}</th
                  ><th>{translate('Billable hours')}</th><th>{translate('Revenue attributed')}</th
                  ><th>{translate('Loaded labor cost')}</th><th>{translate('Travel / expense')}</th
                  ><th>{translate('Contribution')}</th></tr
                ></thead
              >
              <tbody
                >{#each data.portfolio.byWorker ?? [] as row}<tr
                    ><td>{String(row.workerName)}</td><td>{String(row.currency)}</td><td
                      >{(Number(row.actualMinutes ?? 0) / 60).toFixed(1)} h</td
                    ><td>{(Number(row.billableMinutes ?? 0) / 60).toFixed(1)} h</td><td
                      >{money(String(row.revenue), String(row.currency))}</td
                    ><td>{money(String(row.internalCost), String(row.currency))}</td><td
                      >{money(String(row.expenseCost), String(row.currency))}</td
                    ><td>{money(String(row.contribution), String(row.currency))}</td></tr
                  >{:else}<tr
                    ><td colspan="8">{translate('No approved worker economics are available.')}</td
                    ></tr
                  >{/each}</tbody
              >
            </table>
          </div>
        </section>{/if}
      <FinanceConfigurationSection
        {data}
        {availableProjects}
        {isAuditor}
        {translate}
        {controlledValue}
      />
      <section class="record-list full economics-list">
        <div class="panel-title">
          <h2>{translate('Time economics review')}</h2>
          <span>{data.finance.timeEconomics?.length ?? 0} {translate('records')}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead
              ><tr
                ><th>{translate('Date')}</th><th>{translate('Category')}</th><th
                  >{translate('Minutes')}</th
                ><th>{translate('Billable')}</th><th>{translate('State')}</th><th
                  >{translate('Billing')}</th
                ><th>{translate('Client revenue')}</th><th>{translate('Loaded cost')}</th><th
                  >{translate('Worker compensation')}</th
                ><th>{translate('Configuration')}</th></tr
              ></thead
            ><tbody
              >{#each data.finance.timeEconomics ?? [] as row}<tr
                  ><td>{String(row.workDate)}</td><td
                    >{controlledValue('category', row.category)}</td
                  ><td>{String(row.actualMinutes)}</td><td
                    >{String(row.clientBillableMinutes ?? 0)}</td
                  ><td>{controlledValue('status', row.approvalState)}</td><td
                    >{controlledValue('status', row.billingStatus ?? 'unlocked')}</td
                  ><td>{money(String(row.clientRevenueMinor), data.finance.currency)}</td><td
                    >{money(String(row.internalCostMinor), data.finance.currency)}</td
                  ><td>{money(String(row.workerCompensationMinor), data.finance.currency)}</td><td
                    >{row.clientRateConfigured && row.internalCostConfigured
                      ? translate('Complete')
                      : translate('Rate review')}</td
                  ></tr
                >{:else}<tr
                  ><td colspan="10"
                    >{translate('No time economics are available for this project.')}</td
                  ></tr
                >{/each}</tbody
            >
          </table>
        </div>
      </section>
      <section class="record-list full economics-list">
        <div class="panel-title">
          <h2>{translate('Expense economics')}</h2>
          <span>{data.finance.expenseEconomics?.length ?? 0} {translate('records')}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead
              ><tr
                ><th>{translate('Date')}</th><th>{translate('Category')}</th><th
                  >{translate('Treatment')}</th
                ><th>{translate('Direct cost')}</th><th>{translate('Client revenue')}</th></tr
              ></thead
            ><tbody
              >{#each data.finance.expenseEconomics ?? [] as row}<tr
                  ><td>{String(row.spentOn)}</td><td>{controlledValue('category', row.category)}</td
                  ><td>{translate(String(row.treatment))}</td><td
                    >{money(String(row.costMinor), data.finance.currency)}</td
                  ><td>{money(String(row.revenueMinor), data.finance.currency)}</td></tr
                >{:else}<tr
                  ><td colspan="5"
                    >{translate('No approved expenses are available for this project.')}</td
                  ></tr
                >{/each}</tbody
            >
          </table>
        </div>
      </section>
      <section class="record-list full economics-list">
        <div class="panel-title">
          <div>
            <h2>{translate('Compensation settlements')}</h2>
            <p>
              {translate(
                'Finance-only finalization of approved compensation for the selected project.',
              )}
            </p>
          </div>
          <span>{data.settlements?.length ?? 0}</span>
        </div>
        {#if !isAuditor}<form method="POST" action="?/settleCompensation" class="admin-form-grid">
            <input type="hidden" name="projectId" value={data.selectedProjectId} />
            <label
              >{translate('Worker')}<select name="workerId" required
                ><option value="">{translate('Select worker')}</option
                >{#each data.workers ?? [] as worker}<option value={worker.id}>{worker.name}</option
                  >{/each}</select
              ></label
            >
            <label
              >{translate('Period start')}<input name="periodStart" type="date" required /></label
            >
            <label>{translate('Period end')}<input name="periodEnd" type="date" required /></label>
            <button>{translate('Finalize compensation')}</button>
          </form>{/if}
        <div class="table-wrap">
          <table>
            <thead
              ><tr
                ><th>{translate('Worker')}</th><th>{translate('Period')}</th><th
                  >{translate('Basis')}</th
                ><th>{translate('Source')}</th><th>{translate('Amount')}</th><th
                  >{translate('State')}</th
                ></tr
              ></thead
            ><tbody
              >{#each data.settlements ?? [] as settlement}<tr
                  ><td>{String(settlement.workerName)}</td><td
                    >{String(settlement.periodStart)} → {String(settlement.periodEnd)}</td
                  ><td>{String(settlement.sourceBasis)}</td><td
                    >{money(String(settlement.sourceAmountMinor), String(settlement.currency))}</td
                  ><td>{money(String(settlement.amountMinor), String(settlement.currency))}</td><td
                    >{controlledValue('status', settlement.state)}</td
                  ></tr
                >{:else}<tr
                  ><td colspan="6">{translate('No settlements recorded for this project.')}</td></tr
                >{/each}</tbody
            >
          </table>
        </div>
      </section>
      <section class="record-list full economics-list">
        <div class="panel-title">
          <div>
            <h2>{translate('Worker reimbursement queue')}</h2>
            <p>{translate('Reimbursements are separate from customer expense billing status.')}</p>
          </div>
          <span>{data.reimbursements?.length ?? 0}</span>
        </div>
        {#each data.reimbursements ?? [] as reimbursement}<article class="record-card">
            <div>
              <strong>{reimbursement.workerName} · {reimbursement.vendor}</strong><small
                >{reimbursement.spentOn} · {controlledValue('category', reimbursement.category)} · {controlledValue(
                  'status',
                  reimbursement.reimbursementState,
                )}</small
              >
            </div>
            {#if !isAuditor && reimbursement.reimbursementState !== 'reimbursed'}<form
                method="POST"
                action="?/recordReimbursement"
              >
                <input type="hidden" name="expenseId" value={reimbursement.id} />
                <input
                  type="hidden"
                  name="amountMinor"
                  value={reimbursement.reimbursementAmountMinor}
                />
                <input
                  name="reference"
                  placeholder={translate('Payment reference')}
                  aria-label={translate('Payment reference')}
                  required
                />
                <button>{translate('Mark reimbursed')}</button>
              </form>{:else}<strong
                >{money(
                  reimbursement.reimbursementAmountMinor,
                  String(reimbursement.currency),
                )}</strong
              >{/if}
          </article>{:else}<div class="empty">
            {translate('No approved worker-paid expenses require reimbursement.')}
          </div>{/each}
      </section>
    {:else if data.section === 'ledger'}
      <section class="record-list full ledger-list">
        <div class="panel-title">
          <div>
            <h2>{translate('Master Invoice / Cost / Collection Ledger')}</h2>
            <p>
              {translate(
                'Each row reconciles the issued invoice, locked source records, direct cost, collection, outstanding balance, and contribution.',
              )}
            </p>
          </div>
          <span>{data.ledger?.length ?? 0} {translate('invoices')}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead
              ><tr
                ><th>{translate('Invoice')}</th><th>{translate('Client / project')}</th><th
                  >{translate('Stream')}</th
                ><th>{translate('Gross')}</th><th>{translate('Reversals')}</th><th
                  >{translate('Net collected')}</th><th>{translate('Outstanding')}</th
                ><th>{translate('Direct cost')}</th><th>{translate('Contribution')}</th><th
                  >{translate('Sources')}</th
                ><th>{translate('Status')}</th></tr
              ></thead
            ><tbody
              >{#each data.ledger ?? [] as row}<tr
                  ><td>{String(row.invoiceNumber ?? '—')}</td><td
                    >{String(row.clientNumber)} · {String(row.projectNumber)}</td
                  ><td>{String(row.streamType)}</td><td
                    >{paymentMoney(String(row.totalMinor), String(row.currency))}</td
                  ><td>{paymentMoney(String(row.paymentReversalsMinor ?? '0'), String(row.currency))}</td
                  ><td>{paymentMoney(String(row.netCollectedMinor ?? row.collectedMinor ?? '0'), String(row.currency))}</td><td
                    >{paymentMoney(String(row.outstandingMinor), String(row.currency))}</td
                  ><td
                    >{row.directCostComplete
                      ? paymentMoney(String(row.directCostMinor ?? '0'), String(row.currency))
                      : translate('Unavailable — missing source IDs')}</td
                  ><td
                    >{row.directCostComplete
                      ? paymentMoney(String(row.contributionMinor ?? '0'), String(row.currency))
                      : translate('Unavailable')}</td
                  ><td>{Array.isArray(row.sources) ? row.sources.length : 0}{#if
                      Array.isArray(row.directCostMissingSourceIds) &&
                      row.directCostMissingSourceIds.length > 0
                    }<small> · {row.directCostMissingSourceIds.length} {translate('missing')}</small>{/if}</td><td
                    >{String(row.paymentStatus)}</td
                  ></tr
                >{:else}<tr
                  ><td colspan="11"
                    >{translate(
                      'No issued invoice records match the current authorization scope.',
                    )}</td
                  ></tr
                >{/each}</tbody
            >
          </table>
        </div>
      </section>
    {:else if data.section === 'accounting'}
      <div class="management-stack">
        {#if !isAuditor}<form method="POST" action="?/createAccountingPack" class="admin-form-grid">
            <h2>{translate('Generate monthly Accounting Pack')}</h2>
            <p class="form-help">
              {translate(
                'The pack contains invoice register, collections, worker/direct costs, expenses, AR, contribution, source counts, and deterministic PDF/XLSX/CSV/JSON artifacts.',
              )}
            </p>
            <label
              >{translate('Period start')}<input name="periodStart" type="date" required /></label
            ><label>{translate('Period end')}<input name="periodEnd" type="date" required /></label
            ><label
              >{translate('Report language')}<select
                name="reportLocale"
                aria-label={translate('Accounting Pack report language')}
              >
                <option value="en">{translate('English')}</option><option value="pt"
                  >{translate('Português (BR)')}</option
                ><option value="es">{translate('Spanish')}</option>
              </select></label
            ><button>{translate('Generate pack')}</button>
          </form>
          <form method="POST" action="?/runJobs" class="entry-panel">
            <h2>{translate('Process durable finance jobs')}</h2>
            <p>
              {translate(
                'Runs queued PDF and Accounting Pack artifact jobs with idempotent output registration.',
              )}
            </p>
            <button>{translate('Run due jobs')}</button>
          </form>{/if}
        <section class="record-list full">
          <div class="panel-title">
            <h2>{translate('Accounting Pack register')}</h2>
            <span>{data.packs?.length ?? 0} {translate('packs')}</span>
          </div>
          {#each data.packs ?? [] as pack}
            <AccountingPackArtifactStatus
              {pack}
              {isAuditor}
              {locale}
              {translate}
              {controlledValue}
            />
          {:else}<div class="empty">
              {translate('No Accounting Packs have been generated.')}
            </div>{/each}
        </section>
      </div>
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
            <details class="admin-details" style="margin-bottom: 2rem;">
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
            <details class="admin-details" style="margin-bottom: 2rem;">
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
          <div class="table-wrap">
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
          </div>
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
          <div class="table-wrap">
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
          </div>
        </section>
        <section class="entry-panel security-panel">
          <span class="portal-kicker">{translate('ACCOUNT SECURITY')}</span>
          <h2>{data.user.name}</h2>
          <p>{data.user.email} · {controlledValue('role', data.user.role ?? 'worker')}</p>
          <p>
            {translate(
              'Use step-up authentication immediately before payment, invoice void, rate, invitation, or final-pack actions.',
            )}
          </p>
          <form onsubmit={stepUp}>
            <label
              >{translate('Password')}<input
                name="password"
                type="password"
                minlength="12"
                autocomplete="current-password"
                required
              /></label
            ><button>{translate('Verify for protected actions')}</button>
          </form>
          {#if stepUpMessage}<p class="action-message" role="status">
              {translate(stepUpMessage)}
            </p>{/if}
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
  <nav class="bottom-nav" aria-label={translate('Mobile navigation')}>
    {#each navigation as item}<a class:active={data.section === item.section} href={itemHref(item)}
        >{translate(item.label)}</a
      >{/each}
  </nav>
</div>
