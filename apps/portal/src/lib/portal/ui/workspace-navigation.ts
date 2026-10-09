import { tick } from 'svelte';
import { centerNavigationTarget } from './navigation-target';

const storageKey = 'ja:workspace-native-submit';
const lifetime = 120_000;
const identityNames = new Set([
  'id',
  'recordId',
  'clientId',
  'contactId',
  'projectId',
  'workerId',
  'assignmentId',
  'projectMemberId',
  'userId',
  'ruleId',
  'revisionId',
  'documentId',
  'paymentId',
  'entryId',
  'statementId',
  'grantId',
  'delegationId',
  'invoiceId',
  'expenseId',
  'timeEntryId',
  'reportId',
  'billingRuleId',
  'billingStreamId',
  'legalEntityId',
  'issuerEntityId',
  'supplierId',
  'technicianId',
  'planningId',
  'skillId',
]);
const markerNames = [
  'data-project-workflow',
  'data-management-record-id',
  'data-worker-id',
  'data-client-id',
  'data-assignment-id',
  'data-finance-configuration',
  'data-workforce-operation',
  'data-supplier-operation',
] as const;
type Target = { id: string } | { marker: (typeof markerNames)[number]; value: string };
type SavedWorkspace = {
  version: 2;
  actor: string;
  path: string;
  at: number;
  action: string;
  formId: string;
  identity: [string, string][];
  targets: Target[];
};
let actor = () => '';
let failed = () => false;
let generation = 0;
let committedUrl = '';
let cancelWaiting: (() => void) | undefined;

/** Identity only; never persist entered fields, commercial values or credentials. */
export function configureWorkspaceNavigation(actorId: () => string, hasError: () => boolean): void {
  if (typeof window === 'undefined') return;
  actor = actorId;
  failed = hasError;
}

function savedWorkspace(): SavedWorkspace | undefined {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return;
    const value = JSON.parse(raw) as SavedWorkspace;
    if (
      value.version !== 2 ||
      !actor() ||
      value.actor !== actor() ||
      value.path !== location.pathname ||
      !Number.isFinite(value.at) ||
      Date.now() - value.at < 0 ||
      Date.now() - value.at > lifetime ||
      typeof value.action !== 'string' ||
      typeof value.formId !== 'string' ||
      !Array.isArray(value.targets) ||
      value.targets.length > 40 ||
      !value.targets.every(
        (target) =>
          target &&
          typeof target === 'object' &&
          ('id' in target
            ? typeof target.id === 'string' && target.id.length < 300
            : markerNames.includes(target.marker) &&
              typeof target.value === 'string' &&
              target.value.length < 300),
      ) ||
      !Array.isArray(value.identity) ||
      value.identity.length > 40 ||
      !value.identity.every(
        (entry) =>
          Array.isArray(entry) &&
          entry.length === 2 &&
          identityNames.has(entry[0]) &&
          typeof entry[1] === 'string' &&
          entry[1].length < 200,
      )
    ) {
      sessionStorage.removeItem(storageKey);
      return;
    }
    return value;
  } catch {
    return;
  }
}

function fragment(url: URL): string {
  try {
    return decodeURIComponent(url.hash.slice(1));
  } catch {
    return '';
  }
}

/** Components resolve these identifiers against their own authorized, paginated data. */
export function pendingWorkspaceTargetIds(): string[] {
  if (typeof window === 'undefined') return [];
  const saved = savedWorkspace();
  return [
    fragment(new URL(location.href)),
    saved?.formId ?? '',
    ...(saved?.targets.flatMap((target) => ('id' in target ? [target.id] : [])) ?? []),
  ].filter(Boolean);
}

function actionName(url: URL): string {
  return [...url.searchParams.keys()].find((key) => key.startsWith('/')) ?? '';
}
function identities(form: HTMLFormElement): [string, string][] {
  return Array.from(form.querySelectorAll<HTMLInputElement>('input[type="hidden"][name]'))
    .filter(
      (input) =>
        identityNames.has(input.name) && input.value.length > 0 && input.value.length < 200,
    )
    .map((input) => [input.name, input.value]);
}
function targetsFor(form: HTMLFormElement): Target[] {
  const targets: Target[] = [];
  for (let node = form.parentElement; node && node !== document.body; node = node.parentElement) {
    if (node.id && node.id !== 'portal-main') targets.push({ id: node.id });
    for (const marker of markerNames) {
      if (node.hasAttribute(marker))
        targets.push({ marker, value: node.getAttribute(marker) ?? '' });
    }
  }
  return targets;
}
function findTarget(target: Target): HTMLElement | null {
  if ('id' in target) return document.getElementById(target.id);
  if (!markerNames.includes(target.marker)) return null;
  return (
    Array.from(document.querySelectorAll<HTMLElement>(`[${target.marker}]`)).find(
      (node) => node.getAttribute(target.marker) === target.value,
    ) ?? null
  );
}
function findForm(saved: SavedWorkspace): HTMLFormElement | null {
  const byId = saved.formId ? document.getElementById(saved.formId) : null;
  if (byId instanceof HTMLFormElement) return byId;
  const matches = Array.from(document.forms).filter((form) => {
    const url = new URL(form.action, location.href);
    return (
      url.pathname === saved.path &&
      actionName(url) === saved.action &&
      saved.identity.every(([name, value]) =>
        identities(form).some(([n, v]) => n === name && v === value),
      )
    );
  });
  // Never choose an unrelated editor when an action has several anonymous forms.
  return matches.length === 1 ? (matches[0] ?? null) : null;
}
function openEditor(id: string, opened: Set<string>): void {
  if (!id || document.getElementById(id) || opened.has(id)) return;
  const button = Array.from(
    document.querySelectorAll<HTMLButtonElement>('button[type="button"]'),
  ).find(
    (node) =>
      (node.dataset.workspaceOpen === id || node.getAttribute('aria-controls') === id) &&
      node.getAttribute('aria-expanded') === 'false' &&
      !node.disabled,
  );
  if (button) {
    opened.add(id);
    button.click();
  }
}
function restoredTarget(saved: SavedWorkspace, opened: Set<string>): HTMLElement | null {
  const editing = !/^\/(create|delete|remove|discard)/i.test(saved.action);
  if (editing) {
    for (const id of [
      saved.formId,
      ...saved.targets.flatMap((target) => ('id' in target ? [target.id] : [])),
    ])
      openEditor(id, opened);
    const form = findForm(saved);
    if (form) return form;
    if (opened.size > 0) return null;
  }
  for (const descriptor of saved.targets) {
    const target = findTarget(descriptor);
    if (target) return target;
  }
  return findForm(saved);
}
function urlTarget(url: URL, opened: Set<string>): HTMLElement | null {
  const id = fragment(url);
  if (id) {
    openEditor(id, opened);
    return document.getElementById(id);
  }
  const section = url.pathname.split('/app/')[1] ?? '';
  const action = url.searchParams.get('action');
  if (/^billing\/invoices\/[^/]+$/.test(section) && url.searchParams.get('edit') === '1')
    return document.getElementById('invoice-draft-details');
  if (/^reports\/[^/]+$/.test(section) && url.searchParams.has('edit'))
    return document.getElementById('modify-report-form');
  if (section === 'projects' && action) {
    return (
      Array.from(document.querySelectorAll<HTMLElement>('[data-project-workflow]')).find(
        (node) => node.dataset.projectWorkflow === action,
      ) ?? null
    );
  }
  if (/^projects\/[^/]+$/.test(section) && url.searchParams.has('tab'))
    return document.getElementById(`project-panel-${url.searchParams.get('tab')}`);
  if (section === 'projects') {
    const focus = url.searchParams.get('focus') ?? url.searchParams.get('client');
    if (focus) return document.getElementById(`client-directory-client-${focus}`);
    const worker = url.searchParams.get('worker');
    if (worker)
      return (
        document.getElementById(`team-editor-${worker}`) ??
        Array.from(document.querySelectorAll<HTMLElement>('[data-worker-id]')).find(
          (node) => node.dataset.workerId === worker,
        ) ??
        null
      );
    if (url.searchParams.get('directory') === 'mailboxes')
      return document.getElementById('team-panel-mailboxes');
  }
  if (section === 'time' && url.searchParams.get('batch') === '1')
    return document.getElementById('time-owner-batch-title');
  if (section === 'reports' && url.searchParams.has('view'))
    return document.getElementById(`report-panel-${url.searchParams.get('view')}`);
  if (section === 'finance' && url.searchParams.has('task'))
    return document.querySelector<HTMLElement>('[data-finance-configuration]');
  if (section === 'billing' && url.searchParams.has('issuerSettings'))
    return (
      document.getElementById(`issuer-settings-${url.searchParams.get('issuerSettings')}`) ??
      document.getElementById('issuer-document-settings')
    );
  if (section === 'planning' && url.searchParams.has('focus'))
    return document.getElementById(`planning-assignment-${url.searchParams.get('focus')}`);
  if (section === 'manage' && url.searchParams.has('focus')) {
    const record = document.getElementById(url.searchParams.get('focus') ?? '');
    return record?.querySelector<HTMLFormElement>('form[data-management-record-id]') ?? record;
  }
  if (section === 'supplier' && url.searchParams.has('workspaceAction')) {
    const task = url.searchParams.get('workspaceAction');
    const ids: Record<string, string> = {
      directory: 'supplier-directory',
      setup: 'supplier-setup',
      authorize: 'supplier-setup',
      personnel: 'supplier-personnel',
      report: 'supplier-report',
    };
    if (task === 'time')
      return document.querySelector<HTMLFormElement>(
        'form[data-supplier-operation="createTimeBatch"]',
      );
    return document.getElementById(ids[task ?? ''] ?? 'supplier-workspace');
  }
  return null;
}
function modalOwnsFocus(): boolean {
  return Boolean(
    document.querySelector(
      'dialog[open], [aria-modal="true"]:not([aria-hidden="true"]):not([inert])',
    ),
  );
}

/** Cancel delayed work when leaving a route; Back retains SvelteKit's scroll history. */
export function cancelWorkspaceNavigation(): void {
  generation += 1;
  cancelWaiting?.();
  cancelWaiting = undefined;
}

/** Reconcile both full-page responses and reused SvelteKit screens after router focus/scroll. */
export function restoreWorkspaceNavigation(url: URL, popstate = false): void {
  committedUrl = url.href;
  cancelWorkspaceNavigation();
  if (popstate) return;
  const currentGeneration = generation;
  const href = url.href;
  const saved = savedWorkspace();
  const currentActor = actor();
  const consume = () => {
    if (!saved) return;
    try {
      const current = JSON.parse(
        sessionStorage.getItem(storageKey) ?? 'null',
      ) as SavedWorkspace | null;
      if (
        current?.actor === saved.actor &&
        current.at === saved.at &&
        current.path === saved.path &&
        current.formId === saved.formId &&
        current.action === saved.action
      )
        sessionStorage.removeItem(storageKey);
    } catch {
      /* Optional browser storage. */
    }
  };
  // User input or another route can cancel even before the queued frames run.
  cancelWaiting = consume;
  const opened = new Set<string>();
  void tick().then(() => {
    // Kit's queued fragment reset and disclosure actions must finish first.
    setTimeout(
      () =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (
              generation !== currentGeneration ||
              location.href !== href ||
              actor() !== currentActor
            )
              return;
            if (failed() || modalOwnsFocus()) {
              consume();
              return;
            }
            const stop = () => {
              observer?.disconnect();
              clearTimeout(timeout);
            };
            const attempt = () => {
              if (
                generation !== currentGeneration ||
                location.href !== href ||
                actor() !== currentActor ||
                failed() ||
                modalOwnsFocus()
              ) {
                stop();
                consume();
                return;
              }
              const target = saved ? restoredTarget(saved, opened) : urlTarget(url, opened);
              if (!target) return;
              // Opening a conditional editor requires a Svelte render before measuring.
              if (!target.isConnected) return;
              centerNavigationTarget(target);
              stop();
              consume();
            };
            const observer = new MutationObserver(attempt);
            observer.observe(document.body, { subtree: true, childList: true });
            const timeout = setTimeout(() => {
              stop();
              consume();
            }, 2000);
            cancelWaiting = () => {
              stop();
              consume();
            };
            attempt();
          }),
        ),
      0,
    );
  });
}

/** Keep filters in place and remember the semantic context of every native save. */
export function installWorkspaceNavigation(): () => void {
  committedUrl = location.href;
  const pending = new WeakSet<HTMLFormElement>();
  let historyFragment = '';
  let fragmentIntent = '';
  let fragmentDeadline = 0;
  let linkIntent = 0;
  const submissions = new WeakMap<Event, SavedWorkspace>();
  const submit = (event: SubmitEvent) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || event.defaultPrevented) return;
    const button = event.submitter as HTMLButtonElement | HTMLInputElement | null;
    const target = button?.getAttribute('formtarget') ?? form.target;
    if (target && target !== '_self') return;
    const destination = new URL(button?.getAttribute('formaction') ?? form.action, location.href);
    if (destination.origin !== location.origin || destination.pathname !== location.pathname)
      return;
    const method = (button?.getAttribute('formmethod') ?? form.method).toLowerCase();
    if (method === 'get') {
      if (destination.hash) {
        destination.hash = '';
        if (button?.hasAttribute('formaction')) button.formAction = destination.href;
        else form.action = destination.href;
      }
      form.setAttribute('data-sveltekit-noscroll', '');
      form.setAttribute('data-sveltekit-keepfocus', '');
    } else if (method === 'post') {
      cancelWorkspaceNavigation();
      if (pending.has(form)) {
        event.preventDefault();
        return;
      }
      pending.add(form);
      submissions.set(event, {
        version: 2,
        actor: actor(),
        path: destination.pathname,
        at: Date.now(),
        action: actionName(destination),
        formId: form.id,
        identity: identities(form),
        targets: targetsFor(form),
      });
      // This task is a fallback for form handlers that stop bubbling. It never
      // treats validation, enhanced saves or canceled confirmations as navigation.
      setTimeout(() => finish(event), 0);
    }
  };
  const finish = (event: Event) => {
    const saved = submissions.get(event);
    if (!saved) return;
    submissions.delete(event);
    if (event.defaultPrevented) {
      if (event.target instanceof HTMLFormElement) pending.delete(event.target);
      return;
    }
    if (!saved.actor) return;
    // Native actions commonly use only ?/save. Keep the surrounding view and
    // selected record in the response URL, without changing action-owned values.
    if (event.target instanceof HTMLFormElement) {
      const form = event.target;
      const button = (event as SubmitEvent).submitter as
        | HTMLButtonElement
        | HTMLInputElement
        | null;
      const destination = new URL(button?.getAttribute('formaction') ?? form.action, location.href);
      const current = new URL(location.href);
      for (const name of [
        'view',
        'action',
        'client',
        'project',
        'worker',
        'tab',
        'directory',
        'task',
        'focus',
        'workspaceAction',
        'lang',
        'issuerSettings',
        'invoice',
        'setup',
      ]) {
        if (!destination.searchParams.has(name) && current.searchParams.has(name))
          destination.searchParams.set(name, current.searchParams.get(name)!);
      }
      if (
        destination.pathname.endsWith('/app/projects') &&
        destination.searchParams.get('view') === 'team' &&
        saved.action === '/updateWorkerProfile' &&
        !destination.searchParams.has('worker')
      ) {
        const workerId = saved.identity.find(([name]) => name === 'workerId')?.[1];
        if (workerId) destination.searchParams.set('worker', workerId);
      }
      if (button?.hasAttribute('formaction')) button.formAction = destination.href;
      else form.action = destination.href;
    }
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(saved));
    } catch {
      /* Storage is optional. */
    }
  };
  const click = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
      return;
    const element = event.target instanceof Element ? event.target : null;
    const anchor = element?.closest('a');
    if (anchor) {
      if (anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
      const destination = new URL(anchor.href, location.href);
      const intent = ++linkIntent;
      historyFragment = '';
      fragmentIntent = '';
      // Kit optimizes same-route fragments without a full afterNavigate lifecycle.
      // Follow the actual committed URL, including conditional paginated editors.
      if (
        destination.origin === location.origin &&
        destination.pathname === location.pathname &&
        destination.hash
      ) {
        fragmentIntent = destination.href !== location.href ? destination.href : '';
        fragmentDeadline = Date.now() + 1000;
        setTimeout(() => {
          if (intent !== linkIntent) return;
          if (location.href === destination.href)
            restoreWorkspaceNavigation(new URL(location.href));
          else fragmentIntent = '';
        }, 0);
      }
      if (
        destination.origin === location.origin &&
        destination.pathname === location.pathname &&
        !destination.hash
      )
        anchor.setAttribute('data-sveltekit-noscroll', '');
      return;
    }
    const button = element?.closest<HTMLButtonElement>(
      'button[type="button"][data-workspace-open], button[type="button"][aria-controls][aria-expanded="false"]',
    );
    const id = button?.dataset.workspaceOpen ?? button?.getAttribute('aria-controls');
    if (
      id &&
      button?.getAttribute('aria-expanded') !== 'true' &&
      !button?.closest('header, nav, [role=dialog]')
    ) {
      const href = location.href;
      const clickGeneration = generation;
      const currentActor = actor();
      void tick().then(() =>
        requestAnimationFrame(() => {
          const target = document.getElementById(id);
          if (
            !event.defaultPrevented &&
            target &&
            !modalOwnsFocus() &&
            location.href === href &&
            generation === clickGeneration &&
            actor() === currentActor &&
            (button?.hasAttribute('data-workspace-open') ||
              target instanceof HTMLFormElement ||
              Boolean(target.querySelector('form')))
          )
            centerNavigationTarget(target);
        }),
      );
    }
  };
  const popstate = () => {
    // Kit resets fragment focus with location.replace on the committed URL.
    // That synthetic history event must not cancel its pending centering.
    if (location.href === committedUrl) return;
    // A browser fragment link also emits popstate. Its captured click is an
    // explicit destination, whereas actual history traversal retains its scroll.
    if (fragmentIntent === location.href && Date.now() <= fragmentDeadline) return;
    historyFragment = location.href;
    committedUrl = location.href;
    linkIntent += 1;
    cancelWorkspaceNavigation();
  };
  const hashchange = () => {
    fragmentIntent = '';
    if (historyFragment === location.href) {
      historyFragment = '';
      return;
    }
    restoreWorkspaceNavigation(new URL(location.href));
  };
  const userIntent = (event: Event) => {
    if (
      event instanceof KeyboardEvent &&
      !['Tab', 'PageDown', 'PageUp', 'Home', 'End', 'ArrowDown', 'ArrowUp'].includes(event.key)
    )
      return;
    if (event.isTrusted) {
      linkIntent += 1;
      fragmentIntent = '';
      cancelWorkspaceNavigation();
    }
  };
  window.addEventListener('popstate', popstate);
  window.addEventListener('hashchange', hashchange);
  document.addEventListener('wheel', userIntent, { passive: true });
  document.addEventListener('touchstart', userIntent, { passive: true });
  document.addEventListener('pointerdown', userIntent, true);
  document.addEventListener('keydown', userIntent, true);
  document.addEventListener('submit', submit, true);
  document.addEventListener('submit', finish);
  document.addEventListener('click', click, true);
  return () => {
    cancelWorkspaceNavigation();
    linkIntent += 1;
    window.removeEventListener('popstate', popstate);
    window.removeEventListener('hashchange', hashchange);
    document.removeEventListener('wheel', userIntent);
    document.removeEventListener('touchstart', userIntent);
    document.removeEventListener('pointerdown', userIntent, true);
    document.removeEventListener('keydown', userIntent, true);
    document.removeEventListener('submit', submit, true);
    document.removeEventListener('submit', finish);
    document.removeEventListener('click', click, true);
  };
}
