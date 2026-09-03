<script lang="ts">
  import { enhance, type ActionResult, type SubmitFunction } from '$app/forms';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { SvelteSet } from 'svelte/reactivity';
  import { ResponsiveSheet, SectionCard, StatusBadge, formValidation } from '../ui';
  import type { PortalRow } from '../portal-data';

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
  };

  export type TeamDirectoryProps = {
    workers: PortalRow[];
    assignments?: PortalRow[];
    mailboxes?: MailboxRow[] | null;
    mailboxDirectoryStatus?: MailboxDirectoryStatus;
    mailboxDirectoryError?: string | null;
    canManageTeam?: boolean;
    canManageMail?: boolean;
    canonicalOwner?: boolean;
    currentUserId?: string;
    invitationPath?: string | null;
    translate: (value: string) => string;
    controlledValue?: (domain: 'status' | 'availability' | 'role', value: unknown) => string;
  };

  let {
    workers,
    assignments = [],
    mailboxes,
    mailboxDirectoryStatus,
    mailboxDirectoryError = null,
    canManageTeam = false,
    canManageMail = false,
    canonicalOwner = false,
    currentUserId = '',
    invitationPath = null,
    translate,
    controlledValue,
  }: TeamDirectoryProps = $props();

  let activeTab = $derived<'specialists' | 'mailboxes'>(
    $page.url.searchParams.get('directory') === 'mailboxes' ? 'mailboxes' : 'specialists',
  );
  let search = $state('');
  let showAll = $state(false);
  let editingWorkerId = $state<string | null>(null);
  let creatingUser = $state(false);
  let invitationCopied = $state(false);
  let mailboxSearch = $state('');
  const selectedMailboxes = new SvelteSet<string>();
  let targetProvisionRole = $state<'worker' | 'project_manager' | 'finance_admin'>('worker');
  let creatingMailbox = $state(false);
  let filterProvisioned = $state<'all' | 'available' | 'provisioned'>('all');
  let identityPassword = $state('');
  // These keys do not drive UI state. Keeping the cache non-reactive also avoids
  // mutating reactive state while mailbox forms are being rendered.
  const externalCommandKeys: Record<string, string> = {};

  type MailboxActionStatus = 'idle' | 'pending' | 'success' | 'error';
  type MailboxActionState = { status: MailboxActionStatus; action: string; message: string };
  let mailboxAction = $state<MailboxActionState>({ status: 'idle', action: '', message: '' });

  const normalizedSearch = $derived(search.trim().toLowerCase());
  const normalizedMailboxSearch = $derived(mailboxSearch.trim().toLowerCase());
  const mailboxRows = $derived(mailboxes ?? []);
  const mailboxDirectoryState = $derived(
    mailboxDirectoryStatus ??
      (mailboxes === undefined || mailboxes === null ? 'unavailable' : 'ready'),
  );
  const mailboxCountLabel = $derived(
    mailboxDirectoryState === 'ready' ? String(mailboxRows.length) : '—',
  );
  const canManageMailboxDirectory = $derived(
    Boolean(canManageMail || (canManageTeam && canonicalOwner)),
  );

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

  function workerAssignments(worker: PortalRow): PortalRow[] {
    const id = workerId(worker);
    return assignments.filter(
      (assignment) => value(assignment, 'worker_id', 'user_id') === id && Boolean(id),
    );
  }

  function availability(row: PortalRow): string {
    const explicit = value(row, 'availability', 'availability_status');
    if (explicit) return controlledValue?.('availability', explicit) || translate(explicit);
    const minutes = value(row, 'available_minutes', 'hours_available');
    if (minutes) return `${minutes} ${translate('available')}`;
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

  function minutesFor(rows: PortalRow[], key: 'planned_minutes' | 'actual_minutes'): number {
    return rows.reduce((total, row) => total + (Number(value(row, key)) || 0), 0);
  }

  function formatHours(minutes: number): string {
    return minutes > 0 ? `${(minutes / 60).toFixed(1)} h` : '—';
  }

  function matchesWorker(row: PortalRow): boolean {
    if (!normalizedSearch) return true;
    return [
      workerName(row),
      value(row, 'email', 'role', 'availability', 'availability_status'),
      ...workerAssignments(row).flatMap((assignment) => [
        value(assignment, 'project_number', 'project_name'),
        value(assignment, 'assignment_role', 'status'),
      ]),
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch);
  }

  const activeWorkers = $derived(
    (workers ?? []).filter((worker) => showAll || value(worker, 'status') === 'active'),
  );
  const visibleWorkers = $derived(activeWorkers.filter(matchesWorker));

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

  function mailboxPortalStatusLabel(mailbox: MailboxRow): string {
    if (isOwnerMailbox(mailbox)) return translate('Owner — protected');
    if (!mailbox.isProvisioned) return translate('Available');
    const status = String(mailbox.portalStatus ?? 'active');
    return `${statusLabel(status)} (${mailboxRoleLabel(mailbox)})`;
  }

  function mailboxStatusVariant(
    mailbox: MailboxRow,
  ): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    if (isOwnerMailbox(mailbox)) return 'info';
    if (mailbox.isProvisioned && String(mailbox.portalStatus ?? 'active') === 'active')
      return 'success';
    if (mailbox.isProvisioned) return 'warning';
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
    mailboxRows.filter((mailbox) => {
      if (filterProvisioned === 'available' && !mailboxIsEligible(mailbox)) return false;
      if (filterProvisioned === 'provisioned' && !mailbox.isProvisioned) return false;
      if (!normalizedMailboxSearch) return true;
      return [mailboxEmail(mailbox), mailboxUsername(mailbox), mailboxName(mailbox)]
        .join(' ')
        .toLowerCase()
        .includes(normalizedMailboxSearch);
    }),
  );
  const availableMailboxes = $derived(mailboxRows.filter(mailboxIsEligible));
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
    mailboxAction = { status: 'pending', action, message: translate('Working…') };
    return async ({ update, result }) => {
      if (result.type === 'success' || result.type === 'redirect') {
        const target =
          action === 'createMailboxAccount'
            ? 'new'
            : String(new FormData(formElement).get('stalwartAccountId') ?? 'new');
        delete externalCommandKeys[`${action}:${target || 'new'}`];
        mailboxAction = { status: 'success', action, message: actionMessage(result) };
        if (action === 'createMailboxAccount' || action === 'updateMailboxPassword')
          formElement.reset();
        if (action === 'createMailboxAccount') creatingMailbox = false;
        if (action === 'provisionMailboxUsers') clearMailboxSelection();
      } else {
        mailboxAction = { status: 'error', action, message: actionMessage(result) };
      }
      await update();
    };
  };

  async function confirmMailboxIdentity(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!identityPassword) return;
    mailboxAction = {
      status: 'pending',
      action: 'stepUp',
      message: translate('Confirming identity…'),
    };
    try {
      const response = await fetch(`${base}/app/api/step-up`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: identityPassword }),
      });
      identityPassword = '';
      mailboxAction = response.ok
        ? {
            status: 'success',
            action: 'stepUp',
            message: translate('Identity confirmed for protected actions for 10 minutes.'),
          }
        : {
            status: 'error',
            action: 'stepUp',
            message: translate('Identity confirmation failed.'),
          };
    } catch {
      identityPassword = '';
      mailboxAction = {
        status: 'error',
        action: 'stepUp',
        message: translate('Identity confirmation failed.'),
      };
    }
  }

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
</script>

<div class="team-directory" data-team-directory>
  <header class="team-directory__header">
    <div>
      <p class="team-directory__eyebrow">{translate('OPERATIONAL DIRECTORY')}</p>
      <h2>{translate('Team')}</h2>
      <p>{translate('Active specialists, availability and project assignments.')}</p>
    </div>
    <span class="team-directory__count" aria-live="polite">{visibleWorkers.length}</span>
  </header>

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
        <span>{translate('Specialists')}</span><span class="team-directory__tab-count"
          >{visibleWorkers.length}</span
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
        <span>{translate('Mailboxes')} ({CORPORATE_DOMAIN})</span><span
          class="team-directory__tab-count"
          aria-label={translate('Mailbox count')}>{mailboxCountLabel}</span
        >
      </a>
    </div>
  {/if}

  {#if mailboxAction.status !== 'idle'}
    <div
      class:team-directory__feedback--success={mailboxAction.status === 'success'}
      class:team-directory__feedback--error={mailboxAction.status === 'error'}
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
      role={canManageMailboxDirectory ? 'tabpanel' : undefined}
      aria-labelledby={canManageMailboxDirectory ? 'team-tab-specialists' : undefined}
      class="team-directory__specialists"
    >
      {#if canManageTeam}
        <section class="team-directory__provisioning" aria-labelledby="team-create-user-title">
          <div class="team-directory__provisioning-heading">
            <div>
              <p class="team-directory__eyebrow">{translate('SECURE USER PROVISIONING')}</p>
              <h2 id="team-create-user-title">{translate('Create user access')}</h2>
              <p>
                {translate(
                  'Choose the email and role. The invited person sets their own name and password securely.',
                )}
              </p>
            </div>
            <button
              type="button"
              class="team-directory__action"
              aria-expanded={creatingUser}
              aria-controls="team-create-user-form"
              onclick={() => (creatingUser = !creatingUser)}
              >{creatingUser ? translate('Close') : translate('Create user')}</button
            >
          </div>
          {#if creatingUser}
            <form
              id="team-create-user-form"
              method="POST"
              action="?view=team&/createInvitation"
              class="team-directory__create-form"
              use:formValidation
            >
              <label for="team-invite-email">{translate('Email / company alias')}</label><input
                id="team-invite-email"
                name="email"
                type="email"
                autocomplete="email"
                required
              />
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
              <button type="submit" class="team-directory__action team-directory__create-submit"
                >{translate('Create invitation')}</button
              >
            </form>
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

      <div class="team-directory__controls">
        <div class="team-directory__field">
          <label for="team-search">{translate('Search team')}</label><input
            id="team-search"
            bind:value={search}
            type="search"
            placeholder={translate('Name, role or project')}
          />
        </div>
        <label class="team-directory__toggle" for="team-show-inactive"
          ><input id="team-show-inactive" bind:checked={showAll} type="checkbox" /><span
            >{translate('Include inactive specialists')}</span
          ></label
        >
      </div>

      <div class="team-directory__list">
        {#each visibleWorkers as worker}
          {@const assignmentsForWorker = workerAssignments(worker)}
          {@const role = value(worker, 'role') || 'worker'}
          {@const protectedOwner = workerIsProtectedOwner(worker)}
          <SectionCard
            title={workerName(worker)}
            class="team-directory__card"
            data-worker-id={workerId(worker) || undefined}
          >
            <div class="team-directory__identity">
              <div class="team-directory__avatar" aria-hidden="true">
                {workerName(worker)
                  .split(' ')
                  .map((part) => part[0] ?? '')
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div class="team-directory__identity-copy">
                <strong
                  >{protectedOwner
                    ? translate('Unique Owner')
                    : controlledValue?.('role', role) || translate(role)}</strong
                >{#if value(worker, 'email')}<a href={`mailto:${value(worker, 'email')}`}
                    >{value(worker, 'email')}</a
                  >{/if}
              </div>
              <StatusBadge
                variant={protectedOwner ? 'info' : statusVariant(worker)}
                text={protectedOwner
                  ? translate('Owner — protected')
                  : statusLabel(value(worker, 'status') || 'active')}
              />
            </div>
            <dl class="team-directory__facts">
              <div>
                <dt>{translate('Availability')}</dt>
                <dd>{availability(worker)}</dd>
              </div>
              <div>
                <dt>{translate('Assignments')}</dt>
                <dd>
                  {assignmentsForWorker.filter(
                    (assignment) => value(assignment, 'status') === 'active',
                  ).length}
                </dd>
              </div>
              <div>
                <dt>{translate('Planned hours')}</dt>
                <dd>{formatHours(minutesFor(assignmentsForWorker, 'planned_minutes'))}</dd>
              </div>
              <div>
                <dt>{translate('Actual hours')}</dt>
                <dd>{formatHours(minutesFor(assignmentsForWorker, 'actual_minutes'))}</dd>
              </div>
            </dl>
            {#if canManageTeam}<div class="team-directory__actions" data-team-actions>
                {#if protectedOwner}<p class="team-directory__owner-lock" role="status">
                    {translate(
                      'Antonny Luty is the unique Owner. Role changes and portal offboarding are unavailable.',
                    )}
                  </p>{:else}<button
                    type="button"
                    class="team-directory__action"
                    aria-expanded={editingWorkerId === workerId(worker)}
                    aria-controls={`team-editor-${workerId(worker)}`}
                    onclick={() =>
                      (editingWorkerId =
                        editingWorkerId === workerId(worker) ? null : workerId(worker))}
                    >{translate('Edit team member')}</button
                  >{#if workerId(worker) !== currentUserId && value(worker, 'status') === 'active'}<form
                      method="POST"
                      action="?view=team&/updateUserStatus"
                      use:formValidation
                      onsubmit={(event) => {
                        if (!confirm(translate('Remove this team member access?')))
                          event.preventDefault();
                      }}
                    >
                      <input type="hidden" name="userId" value={workerId(worker)} /><input
                        type="hidden"
                        name="status"
                        value="offboarded"
                      /><button
                        type="submit"
                        class="team-directory__action team-directory__action--danger"
                        >{translate('Remove access')}</button
                      >
                    </form>{:else if workerId(worker) !== currentUserId}<form
                      method="POST"
                      action="?view=team&/updateUserStatus"
                      use:formValidation
                      onsubmit={(event) => {
                        if (!confirm(translate('Remove this team member access?')))
                          event.preventDefault();
                      }}
                    >
                      <input type="hidden" name="userId" value={workerId(worker)} /><input
                        type="hidden"
                        name="status"
                        value="active"
                      /><button type="submit" class="team-directory__action"
                        >{translate('Restore access')}</button
                      >
                    </form>{/if}{/if}
              </div>
              {#if editingWorkerId === workerId(worker) && !protectedOwner}<div
                  class="team-directory__editor"
                  id={`team-editor-${workerId(worker)}`}
                >
                  <form
                    method="POST"
                    action="?view=team&/updateWorkerProfile"
                    class="team-directory__form"
                    use:formValidation
                  >
                    <h3>{translate('Edit profile')}</h3>
                    <input type="hidden" name="workerId" value={workerId(worker)} /><label
                      for={`worker-name-${workerId(worker)}`}>{translate('Name')}</label
                    ><input
                      id={`worker-name-${workerId(worker)}`}
                      name="name"
                      value={workerName(worker)}
                      required
                      maxlength="160"
                    /><label for={`worker-email-${workerId(worker)}`}>{translate('Email')}</label
                    ><input
                      id={`worker-email-${workerId(worker)}`}
                      name="email"
                      type="email"
                      value={value(worker, 'email')}
                      required
                    /><label for={`worker-role-${workerId(worker)}`}>{translate('Role')}</label
                    ><select id={`worker-role-${workerId(worker)}`} name="role" required
                      ><option value="worker" selected={role === 'worker'}
                        >{translate('Worker')}</option
                      ><option value="project_manager" selected={role === 'project_manager'}
                        >{translate('Project Manager')}</option
                      ><option value="finance_admin" selected={role === 'finance_admin'}
                        >{translate('Finance Admin')}</option
                      ><option value="auditor_read_only" selected={role === 'auditor_read_only'}
                        >{translate('Auditor (Read Only)')}</option
                      ></select
                    ><input
                      type="hidden"
                      name="joinedAt"
                      value={value(worker, 'created_at').slice(0, 10)}
                    />
                    <div class="team-directory__form-actions">
                      <button type="submit" class="team-directory__action"
                        >{translate('Save profile')}</button
                      ><button
                        type="button"
                        class="team-directory__action team-directory__action--quiet"
                        onclick={() => (editingWorkerId = null)}>{translate('Cancel')}</button
                      >
                    </div>
                  </form>
                </div>{/if}
            {/if}
            <section aria-labelledby={`team-assignments-${workerId(worker)}`}>
              <h3 id={`team-assignments-${workerId(worker)}`}>
                {translate('Project assignments')}
              </h3>
              <div class="team-directory__assignment-list">
                {#each assignmentsForWorker as assignment}<article
                    class="team-directory__assignment"
                  >
                    <strong
                      >{[value(assignment, 'project_number'), value(assignment, 'project_name')]
                        .filter(Boolean)
                        .join(' · ') || translate('Authorized project')}</strong
                    ><span
                      >{controlledValue?.('role', value(assignment, 'assignment_role')) ||
                        value(assignment, 'assignment_role') ||
                        translate('Assignment')}</span
                    ><small
                      >{value(assignment, 'starts_on') || '—'} → {value(assignment, 'ends_on') ||
                        translate('Open assignment')} · {statusLabel(
                        value(assignment, 'status'),
                      )}</small
                    ><small
                      >{translate('Planned vs actual')}: {formatHours(
                        Number(value(assignment, 'planned_minutes')) || 0,
                      )} → {formatHours(Number(value(assignment, 'actual_minutes')) || 0)}</small
                    >
                  </article>{:else}<p class="team-directory__empty">
                    {translate('No project assignments recorded.')}
                  </p>{/each}
              </div>
            </section>
          </SectionCard>
        {:else}<p class="team-directory__empty team-directory__empty--large">
            {translate('No active specialists found.')}
          </p>{/each}
      </div>
    </section>
  {:else if canManageMailboxDirectory}
    <div
      id="team-panel-mailboxes"
      role="tabpanel"
      aria-labelledby="team-tab-mailboxes"
      class="team-directory__mailboxes"
      data-mailbox-directory-state={mailboxDirectoryState}
    >
      <div class="team-directory__provisioning-heading">
        <div>
          <p class="team-directory__eyebrow">{translate('STALWART MAIL SERVER DIRECTORY')}</p>
          <h2>{translate('Corporate email accounts')}</h2>
          <p>
            {translate(
              'Live accounts from Stalwart. Password hashes and credentials are never shown in the portal.',
            )}
          </p>
        </div>
        <button
          type="button"
          class="team-directory__action"
          aria-expanded={creatingMailbox}
          aria-controls="create-mailbox-sheet-form"
          onclick={() => (creatingMailbox = true)}>{translate('+ Create email account')}</button
        >
      </div>
      <div class="team-directory__protected-toolbar">
        <form class="team-directory__step-up" onsubmit={confirmMailboxIdentity}>
          <label for="mailbox-owner-password">{translate('Confirm Owner password')}</label>
          <input
            id="mailbox-owner-password"
            type="password"
            autocomplete="current-password"
            maxlength="128"
            bind:value={identityPassword}
            required
          />
          <button
            type="submit"
            class="team-directory__action"
            disabled={mailboxAction.status === 'pending'}
          >
            {translate('Unlock protected actions')}
          </button>
        </form>
        <form
          method="POST"
          action="?view=team&/bootstrapMailboxUsers"
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
        </form>
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
      {:else if mailboxDirectoryState === 'unavailable' || mailboxDirectoryState === 'error'}<div
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
          <div class="team-directory__controls team-directory__mailbox-toolbar">
            <div class="team-directory__field">
              <label for="mailbox-search">{translate('Search accounts')}</label><input
                id="mailbox-search"
                bind:value={mailboxSearch}
                type="search"
                placeholder={translate('Search by alias or name')}
              />
            </div>
            <div class="team-directory__field">
              <label for="mailbox-filter">{translate('Filter accounts')}</label><select
                id="mailbox-filter"
                bind:value={filterProvisioned}
                class="team-directory__filter-select"
                ><option value="all">{translate('All mailboxes')} ({mailboxRows.length})</option
                ><option value="available"
                  >{translate('Available to provision')} ({availableMailboxes.length})</option
                ><option value="provisioned"
                  >{translate('Already in Portal')} ({mailboxRows.length -
                    availableMailboxes.length})</option
                ></select
              >
            </div>
          </div>
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
              {translate('No email accounts found matching your search.')}
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
              <details class="team-directory__mailbox-management">
                <summary class="team-directory__action team-directory__action--quiet"
                  >{translate('Manage mailbox')}</summary
                >
                <div class="team-directory__mailbox-management-body">
                  {#if isOwnerMailbox(mailbox)}<div
                      class="team-directory__owner-lock"
                      role="status"
                    >
                      <strong>{translate('Unique Owner — protected')}</strong>
                      <p>
                        {translate(
                          'Antonny Luty is the only Owner. This mailbox cannot be re-roled, offboarded or deleted from this screen.',
                        )}
                      </p>
                      {#if accountId}
                        <form
                          method="POST"
                          action="?view=team&/updateMailboxPassword"
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
                  {:else}{#if mailbox.isProvisioned}<form
                        method="POST"
                        action="?view=team&/changeMailboxRole"
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
                        ><select id={`mailbox-role-${fieldKey}`} name="role" required
                          ><option value="worker" selected={mailboxRole(mailbox) === 'worker'}
                            >{translate('Worker')}</option
                          ><option
                            value="project_manager"
                            selected={mailboxRole(mailbox) === 'project_manager'}
                            >{translate('Project Manager')}</option
                          ><option
                            value="finance_admin"
                            selected={mailboxRole(mailbox) === 'finance_admin'}
                            >{translate('Finance Admin')}</option
                          ></select
                        ><label for={`mailbox-role-reason-${fieldKey}`}
                          >{translate('Reason for role change')}</label
                        ><textarea
                          id={`mailbox-role-reason-${fieldKey}`}
                          name="reason"
                          rows="2"
                          minlength="5"
                          required
                        ></textarea><label for={`mailbox-role-confirm-${fieldKey}`}
                          >{translate('Type the exact email to confirm')}</label
                        ><input
                          id={`mailbox-role-confirm-${fieldKey}`}
                          name="confirmation"
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
                    {#if mailbox.isProvisioned}<form
                        method="POST"
                        action="?view=team&/deprovisionMailboxUser"
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
                        /><label for={`mailbox-offboard-reason-${fieldKey}`}
                          >{translate('Reason for removing access')}</label
                        ><textarea
                          id={`mailbox-offboard-reason-${fieldKey}`}
                          name="reason"
                          rows="2"
                          minlength="5"
                          required
                        ></textarea><label for={`mailbox-offboard-confirm-${fieldKey}`}
                          >{translate('Type the exact email to confirm')}</label
                        ><input
                          id={`mailbox-offboard-confirm-${fieldKey}`}
                          name="confirmation"
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
                    {#if accountId}<form
                        method="POST"
                        action="?view=team&/updateMailboxPassword"
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
                            'Stalwart validates and stores this password. The portal never stores or displays it.',
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
                          rows="2"
                          minlength="5"
                          required
                        ></textarea><label for={`mailbox-password-confirm-${fieldKey}`}
                          >{translate('Type the exact email to confirm')}</label
                        ><input
                          id={`mailbox-password-confirm-${fieldKey}`}
                          name="confirmation"
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
                        action="?view=team&/destroyMailboxAccount"
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
                      </form>{:else}<p class="team-directory__form-help">
                        {translate(
                          'Stalwart account identifier unavailable; protected controls are disabled.',
                        )}
                      </p>{/if}
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
                    ><th scope="col">{translate('Portal status')}</th><th scope="col"
                      >{translate('Controls')}</th
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
                      ><td>{@render mailboxControls(mailbox, 'table')}</td></tr
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
                    <StatusBadge
                      variant={mailboxStatusVariant(mailbox)}
                      text={mailboxPortalStatusLabel(mailbox)}
                    />
                  </div>
                  <dl class="team-directory__mailbox-card-facts">
                    <div>
                      <dt>{translate('Alias')}</dt>
                      <dd>{mailboxUsername(mailbox)}</dd>
                    </div>
                    <div>
                      <dt>{translate('Portal role')}</dt>
                      <dd>{mailboxRoleLabel(mailbox)}</dd>
                    </div>
                  </dl>
                  {@render mailboxControls(mailbox, 'card')}
                </article>{/each}
            </div>
          {/if}
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
      onclose={() => (creatingMailbox = false)}
    >
      <form
        id="create-mailbox-sheet-form"
        method="POST"
        action="?view=team&/createMailboxAccount"
        class="team-directory__mailbox-create-form"
        data-mailbox-action="createMailboxAccount"
        use:enhance={enhanceMailboxForm}
        use:formValidation
        aria-busy={mailboxAction.status === 'pending' &&
          mailboxAction.action === 'createMailboxAccount'}
      >
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
            type="text"
            autocomplete="off"
            placeholder="nombre.apellido"
            required
            pattern="[A-Za-z0-9._-]+"
          /><span class="team-directory__addon">{CORPORATE_DOMAIN}</span>
        </div>
        <label for="mailbox-create-name">{translate('Display name')}</label><input
          id="mailbox-create-name"
          name="name"
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
          required
          ><option value="1024">1 GB</option><option value="5120" selected>5 GB</option><option
            value="10240">10 GB</option
          ><option value="0">{translate('Unlimited')}</option></select
        ><label for="mailbox-create-role">{translate('Provision in portal as')}</label><select
          id="mailbox-create-role"
          name="provisionRole"
          required
          ><option value="worker" selected>{translate('Worker (default)')}</option><option
            value="project_manager">{translate('Project Manager')}</option
          ><option value="finance_admin">{translate('Finance Admin')}</option></select
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
  .team-directory {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }
  .team-directory__header,
  .team-directory__identity,
  .team-directory__provisioning-heading,
  .team-directory__invitation-result {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }
  .team-directory__eyebrow {
    margin: 0 0 0.35rem;
    color: var(--portal-muted, #64748b);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.12em;
  }
  .team-directory h2,
  .team-directory h3 {
    margin: 0;
    color: var(--portal-ink, #16202a);
  }
  .team-directory__header p:last-child,
  .team-directory__provisioning-heading p:last-child,
  .team-directory__invitation-result p {
    margin: 0.35rem 0 0;
    color: var(--portal-muted, #526174);
  }
  .team-directory__protected-toolbar,
  .team-directory__step-up {
    display: flex;
    align-items: end;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .team-directory__protected-toolbar {
    justify-content: space-between;
    padding: 0.85rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.65rem;
    background: var(--portal-wash, #f4f7fa);
  }
  .team-directory__step-up label {
    color: var(--portal-muted, #526174);
    font-size: 0.82rem;
    font-weight: 700;
  }
  .team-directory__step-up input {
    min-height: 2.75rem;
    border: 1px solid var(--portal-border, #cbd5e1);
    border-radius: 0.5rem;
    padding: 0.55rem 0.7rem;
    background: #fff;
  }
  .team-directory__count {
    display: grid;
    min-width: 2.75rem;
    min-height: 2.75rem;
    place-items: center;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 999px;
    color: var(--portal-ink, #16202a);
    font-weight: 800;
  }
  .team-directory__tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    border-bottom: 2px solid var(--portal-border, #d7dee8);
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
    color: var(--portal-muted, #64748b);
    font: inherit;
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
  }
  .team-directory__tab:hover,
  .team-directory__tab:focus-visible {
    color: var(--portal-ink, #16202a);
  }
  .team-directory__tab--active {
    border-bottom-color: var(--portal-accent, #0f5f73);
    color: var(--portal-accent, #0f5f73);
  }
  .team-directory__tab-count {
    min-width: 1.55rem;
    padding: 0.12rem 0.45rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--portal-accent, #0f5f73) 12%, transparent);
    text-align: center;
    font-size: 0.75rem;
  }
  .team-directory__feedback {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: baseline;
    padding: 0.7rem 0.9rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.65rem;
    background: var(--portal-wash, #f5f8fa);
    color: var(--portal-ink, #16202a);
  }
  .team-directory__feedback--success {
    border-color: #37967f;
    background: #effaf6;
  }
  .team-directory__feedback--error {
    border-color: #b42318;
    background: #fff3f1;
    color: #7a271a;
  }
  .team-directory__feedback--pending {
    border-color: var(--portal-accent, #0f5f73);
  }
  .team-directory__provisioning,
  .team-directory__mailboxes {
    display: grid;
    gap: 1rem;
  }
  .team-directory__provisioning {
    padding: 1rem;
    border: 1px solid color-mix(in srgb, var(--portal-accent, #0f5f73) 32%, transparent);
    border-radius: 0.8rem;
    background: color-mix(in srgb, var(--portal-surface, #fff) 88%, #dff6f2);
  }
  .team-directory__create-form,
  .team-directory__mailbox-create-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem 0.8rem;
    padding-top: 1rem;
    border-top: 1px solid var(--portal-border, #d7dee8);
  }
  .team-directory__create-form label,
  .team-directory__mailbox-create-form label,
  .team-directory__protected-form label,
  .team-directory__field label,
  .team-directory__controls > label:first-child {
    display: block;
    color: var(--portal-muted, #526174);
    font-size: 0.8rem;
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
    border: 1px solid var(--ja-control-border, #64748b);
    border-radius: 0.5rem;
    padding: 0.55rem 0.7rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #16202a);
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
    color: var(--portal-muted, #526174);
    font-size: 0.85rem;
  }
  .team-directory__invitation-result {
    align-items: flex-start;
    padding: 0.9rem;
    border: 1px solid #37967f;
    border-radius: 0.65rem;
    background: #effaf6;
  }
  .team-directory__invitation-result > div {
    min-width: 0;
  }
  .team-directory__invitation-result a {
    display: block;
    margin-top: 0.5rem;
    overflow-wrap: anywhere;
    color: var(--portal-accent, #0f5f73);
    font-weight: 750;
  }
  .team-directory__controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 0.75rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.75rem;
    background: var(--portal-surface, #fff);
  }
  .team-directory__field {
    min-width: 0;
  }
  .team-directory__toggle {
    display: flex;
    min-height: var(--ja-target-min, 2.75rem);
    align-items: center;
    gap: 0.5rem;
    color: var(--portal-ink, #16202a);
    font-size: 0.82rem;
    font-weight: 700;
  }
  .team-directory__toggle input,
  .team-directory__checkbox-hit input {
    width: 1.2rem;
    height: 1.2rem;
    margin: 0;
    accent-color: var(--portal-accent, #0f5f73);
  }
  .team-directory input:focus-visible,
  .team-directory select:focus-visible,
  .team-directory textarea:focus-visible,
  .team-directory button:focus-visible,
  .team-directory a:focus-visible,
  .team-directory summary:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--portal-accent, #0f5f73) 32%, transparent);
    outline-offset: 2px;
  }
  .team-directory__list {
    display: grid;
    gap: 1rem;
  }
  :global(.team-directory__card) {
    display: grid;
    gap: 1rem;
  }
  .team-directory__identity {
    align-items: center;
  }
  .team-directory__avatar {
    display: grid;
    flex: 0 0 auto;
    width: 2.75rem;
    height: 2.75rem;
    place-items: center;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 50%;
    background: var(--portal-wash, #eef7f6);
    color: var(--portal-accent, #0f5f73);
    font-weight: 850;
  }
  .team-directory__identity-copy {
    display: grid;
    min-width: 0;
    flex: 1 1 auto;
    gap: 0.2rem;
  }
  .team-directory__identity-copy a {
    display: inline-flex;
    min-height: var(--ja-target-min, 2.75rem);
    align-items: center;
    overflow-wrap: anywhere;
    color: var(--portal-accent, #0f5f73);
    font-size: 0.82rem;
    font-weight: 700;
  }
  .team-directory__facts {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
    margin: 0;
  }
  .team-directory__facts div {
    min-width: 0;
    padding: 0.7rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--portal-surface, #fff) 92%, var(--portal-wash, #eef2f5));
  }
  .team-directory__facts dt,
  .team-directory__mailbox-card-facts dt {
    color: var(--portal-muted, #64748b);
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .team-directory__facts dd,
  .team-directory__mailbox-card-facts dd {
    margin: 0.2rem 0 0;
    overflow-wrap: anywhere;
    font-weight: 750;
  }
  .team-directory__actions,
  .team-directory__form-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: end;
  }
  .team-directory__actions form {
    margin: 0;
  }
  .team-directory__action,
  .team-directory summary {
    display: inline-flex;
    min-height: var(--ja-target-min, 2.75rem);
    align-items: center;
    justify-content: center;
    border: 1px solid var(--portal-accent, #0f5f73);
    border-radius: 0.55rem;
    padding: 0.55rem 0.85rem;
    background: var(--portal-accent, #0f5f73);
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
    color: var(--portal-accent, #0f5f73);
  }
  .team-directory__editor {
    display: grid;
    gap: 1rem;
    padding: 1rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.65rem;
    background: var(--portal-wash, #f5f8fa);
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
    border: 1px solid var(--ja-control-border, #64748b);
    border-radius: 0.5rem;
    padding: 0.55rem 0.7rem;
    font: inherit;
  }
  .team-directory__assignment-list {
    display: grid;
    gap: 0.5rem;
  }
  .team-directory__assignment {
    display: grid;
    gap: 0.2rem;
    padding: 0.7rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.5rem;
    background: var(--portal-wash, #f5f8fa);
  }
  .team-directory__assignment span,
  .team-directory__assignment small,
  .team-directory__empty,
  .team-directory__form-help {
    color: var(--portal-muted, #526174);
    line-height: 1.4;
  }
  .team-directory__empty {
    margin: 0;
    padding: 0.6rem;
    border: 1px dashed var(--portal-border, #d7dee8);
    font-size: 0.82rem;
  }
  .team-directory__empty--large {
    padding: 1.25rem;
    text-align: center;
  }
  .team-directory__owner-lock {
    margin: 0;
    padding: 0.75rem;
    border: 1px solid color-mix(in srgb, #0f5f73 42%, transparent);
    border-radius: 0.55rem;
    background: #eef7f6;
    color: var(--portal-ink, #16202a);
  }
  .team-directory__owner-lock p {
    margin: 0.35rem 0 0;
    color: var(--portal-muted, #526174);
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
    background: #0f5f73;
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
    color: var(--portal-ink, #16202a);
    font: inherit;
  }
  .team-directory__mailbox-table-wrapper {
    overflow-x: auto;
    border: 1px solid var(--portal-border, #d7dee8);
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
    border-bottom: 1px solid var(--portal-border, #d7dee8);
  }
  .team-directory__mailbox-table th {
    background: var(--portal-wash, #f5f8fa);
    color: var(--portal-muted, #64748b);
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .team-directory__mailbox-table tbody tr:hover {
    background: color-mix(in srgb, var(--portal-wash, #f5f8fa) 40%, transparent);
  }
  .team-directory__mailbox-row--provisioned {
    background: color-mix(in srgb, var(--portal-wash, #f5f8fa) 42%, transparent);
  }
  .team-directory__mailbox-row--owner {
    background: #eef7f6;
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
    align-items: baseline;
    gap: 0.15rem;
    overflow-wrap: anywhere;
  }
  .team-directory__email-cell span {
    color: var(--portal-muted, #64748b);
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
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.65rem;
    background: var(--portal-wash, #f5f8fa);
  }
  .team-directory__protected-form {
    display: grid;
    gap: 0.35rem;
    padding: 0.8rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.55rem;
    background: var(--portal-surface, #fff);
  }
  .team-directory__protected-form h3 {
    font-size: 0.95rem;
  }
  .team-directory__protected-form small {
    overflow-wrap: anywhere;
    color: var(--portal-muted, #526174);
  }
  .team-directory__protected-form--danger {
    border-color: color-mix(in srgb, #b42318 48%, var(--portal-border, #d7dee8));
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
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.75rem;
    background: var(--portal-wash, #f5f8fa);
  }
  .team-directory__directory-state p {
    grid-column: 2;
    margin: 0.25rem 0 0;
    color: var(--portal-muted, #526174);
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
    background: var(--portal-accent, #0f5f73);
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
    border: 1px solid var(--portal-border, #d7dee8);
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
    color: var(--portal-accent, #0f5f73);
    font-size: 0.82rem;
  }
  .team-directory__mailbox-card-facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
    margin: 0;
  }
  .team-directory__mailbox-card-facts div {
    padding: 0.6rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.5rem;
  }
  .team-directory__input-addon {
    display: flex;
    min-width: 0;
    align-items: center;
    border: 1px solid var(--ja-control-border, #64748b);
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
    background: var(--portal-wash, #eef7f6);
    color: var(--portal-muted, #526174);
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
  @media (max-width: 720px) {
    .team-directory__header,
    .team-directory__identity,
    .team-directory__provisioning-heading,
    .team-directory__invitation-result {
      align-items: stretch;
      flex-direction: column;
    }
    .team-directory__count {
      width: fit-content;
    }
    .team-directory__tabs {
      flex-direction: column;
      border-bottom: 0;
    }
    .team-directory__tab {
      justify-content: space-between;
      border: 1px solid var(--portal-border, #d7dee8);
      border-radius: 0.5rem;
    }
    .team-directory__tab--active {
      border-color: var(--portal-accent, #0f5f73);
      background: var(--portal-wash, #eef7f6);
    }
    .team-directory__controls,
    .team-directory__facts,
    .team-directory__form,
    .team-directory__create-form,
    .team-directory__mailbox-create-form,
    .team-directory__mailbox-toolbar {
      grid-template-columns: 1fr;
    }
    .team-directory__protected-toolbar,
    .team-directory__step-up {
      align-items: stretch;
      flex-direction: column;
    }
    .team-directory__protected-toolbar form,
    .team-directory__protected-toolbar button,
    .team-directory__step-up input {
      width: 100%;
    }
    .team-directory__create-form .team-directory__create-explainer,
    .team-directory__create-form .team-directory__create-submit {
      grid-column: auto;
    }
    .team-directory__create-submit,
    .team-directory__provisioning-heading > button,
    .team-directory__invitation-result > button,
    .team-directory__actions,
    .team-directory__actions form,
    .team-directory__actions .team-directory__action,
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

  @media (max-width: 640px) {
    .team-directory__mailbox-card-facts {
      grid-template-columns: 1fr;
    }
  }
</style>
