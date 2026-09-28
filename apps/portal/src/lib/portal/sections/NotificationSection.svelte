<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import { onMount, tick } from 'svelte';
  import { notificationCopy } from '../../notifications/copy';
  import { notificationTargetPath } from '../../notifications/target';
  import { standaloneActionMessage } from '../../../routes/app/standalone-locale';
  import ProblemNotice from '../ui/ProblemNotice.svelte';
  import RecordBrowser from '../ui/RecordBrowser.svelte';
  import type { ProblemData } from '$lib/problem/contract';
  import type { PortalActionResult, PortalRow } from '../portal-data';

  let {
    records,
    base,
    currentUserId,
    locale,
    translate,
    form,
  }: {
    records: PortalRow[];
    base: string;
    currentUserId: string;
    locale: 'en' | 'es' | 'pt';
    translate: (key: string) => string;
    form?: PortalActionResult;
  } = $props();
  type NotificationFailure = ProblemData & {
    success?: boolean;
    actionName?: string;
    values?: Record<string, unknown>;
  };
  const nativeFailure = $derived.by(() => {
    const result = form as NotificationFailure | null | undefined;
    return result?.success === false && result.actionName === 'markNotificationRead' && result.code
      ? result
      : null;
  });
  const nativeSuccess = $derived.by(() => {
    const result = form as { success?: boolean; messageKey?: string } | null | undefined;
    return result?.success === true && result.messageKey === 'action.notifications.markedRead'
      ? standaloneActionMessage(locale, form)
      : '';
  });
  let enhancedProblem = $state<NotificationFailure | null>(null);
  const problem = $derived(enhancedProblem ?? nativeFailure);
  const blockedByAccess = $derived(problem?.code === 'NOTIFICATION_ACCESS_CHANGED');
  const hiddenNotificationId = $derived(
    problem?.code === 'NOTIFICATION_UNAVAILABLE'
      ? String(problem.values?.notificationId ?? '')
      : '',
  );
  const visibleRecords = $derived(
    blockedByAccess ? [] : records.filter((row) => String(row.id) !== hiddenNotificationId),
  );
  const unreadOnly = $derived($page.url.searchParams.get('read') === 'unread');
  const unreadCount = $derived(visibleRecords.filter((row) => !row.read_at).length);
  const filtered = $derived(
    unreadOnly ? visibleRecords.filter((row) => !row.read_at) : visibleRecords,
  );
  let savingId = $state('');
  let feedback = $state('');
  let feedbackElement: HTMLParagraphElement | undefined = $state();
  const remedyLinks = $derived({
    review_notifications: {
      label: translate('Review activity inbox'),
      href: filterHref(unreadOnly) + '#notification-inbox-title',
    },
    sign_in_again: { label: translate('Sign in again'), href: `${base}/app/login` },
    contact_owner: { label: translate('Contact an owner') },
  });

  function filterHref(unread: boolean): string {
    const url = new URL($page.url);
    url.searchParams.delete('/markNotificationRead');
    if (unread) url.searchParams.set('read', 'unread');
    else url.searchParams.delete('read');
    url.searchParams.set('lang', locale);
    return `${url.pathname}${url.search}`;
  }
  function markReadHref(): string {
    const parameters = new URLSearchParams($page.url.searchParams);
    parameters.delete('/markNotificationRead');
    parameters.set('lang', locale);
    return `?/markNotificationRead&${parameters.toString()}#notification-inbox-title`;
  }
  type ScrollSnapshot = {
    top: number;
    path: string;
    unreadOnly: boolean;
    notificationId: string;
    at: number;
  };
  const scrollKey = () => `ja-notification-scroll:${currentUserId}:markNotificationRead`;
  let pendingForm: HTMLFormElement | null = null;
  let pendingSource: 'submit' | 'formdata' | null = null;
  let userIntentCount = 0;
  let enhancedHandled = false;
  function rememberScroll(formElement: HTMLFormElement): void {
    const snapshot: ScrollSnapshot = {
      top: window.scrollY,
      path: location.pathname,
      unreadOnly,
      notificationId:
        formElement.querySelector<HTMLInputElement>('input[name="notificationId"]')?.value ?? '',
      at: Date.now(),
    };
    try {
      sessionStorage.setItem(scrollKey(), JSON.stringify(snapshot));
    } catch {
      // The form still works when browser storage is unavailable.
    }
  }
  function forgetScroll(): void {
    try {
      sessionStorage.removeItem(scrollKey());
    } catch {
      // The form still works when browser storage is unavailable.
    }
  }
  function restoreScroll(notificationId?: string): void {
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(scrollKey());
      sessionStorage.removeItem(scrollKey());
    } catch {
      return;
    }
    if (!saved) return;
    let snapshot: Partial<ScrollSnapshot>;
    try {
      snapshot = JSON.parse(saved) as Partial<ScrollSnapshot>;
    } catch {
      return;
    }
    if (
      snapshot.path !== location.pathname ||
      snapshot.unreadOnly !== unreadOnly ||
      (notificationId && snapshot.notificationId !== notificationId) ||
      typeof snapshot.top !== 'number' ||
      !Number.isFinite(snapshot.top) ||
      typeof snapshot.at !== 'number' ||
      Date.now() - snapshot.at > 300_000 ||
      userIntentCount > 0
    )
      return;
    window.scrollTo({ top: snapshot.top, behavior: 'auto' });
  }
  onMount(() => {
    if (!nativeFailure && !nativeSuccess) forgetScroll();
    const markIntent = () => {
      userIntentCount += 1;
    };
    const captureSubmit = (event: Event) => {
      const formElement = event.target;
      if (!(formElement instanceof HTMLFormElement)) return;
      if (!formElement.matches('[data-notification-read-form]')) return;
      pendingForm = formElement;
      pendingSource = 'submit';
      rememberScroll(formElement);
    };
    const captureFormData = (event: Event) => {
      const formElement = event.target;
      if (!(formElement instanceof HTMLFormElement)) return;
      if (!formElement.matches('[data-notification-read-form]')) return;
      if (pendingForm === formElement && pendingSource === 'submit') return;
      pendingForm = formElement;
      pendingSource = 'formdata';
      rememberScroll(formElement);
    };
    const capturePageHide = () => {
      if (!pendingForm) return;
      try {
        if (!sessionStorage.getItem(scrollKey())) rememberScroll(pendingForm);
      } catch {
        // The pre-navigation snapshot already failed to persist.
      }
    };
    document.addEventListener('submit', captureSubmit, true);
    document.addEventListener('formdata', captureFormData, true);
    window.addEventListener('pagehide', capturePageHide);
    window.addEventListener('wheel', markIntent, { passive: true });
    window.addEventListener('touchmove', markIntent, { passive: true });
    window.addEventListener('pointerdown', markIntent, true);
    window.addEventListener('keydown', markIntent, true);
    return () => {
      document.removeEventListener('submit', captureSubmit, true);
      document.removeEventListener('formdata', captureFormData, true);
      window.removeEventListener('pagehide', capturePageHide);
      window.removeEventListener('wheel', markIntent);
      window.removeEventListener('touchmove', markIntent);
      window.removeEventListener('pointerdown', markIntent, true);
      window.removeEventListener('keydown', markIntent, true);
    };
  });
  let handledNativeResult = '';
  $effect(() => {
    const resultId = nativeFailure?.correlationId ?? (nativeSuccess ? 'marked-read' : '');
    if (!resultId || resultId === handledNativeResult || enhancedHandled) return;
    handledNativeResult = resultId;
    const notificationId = String(nativeFailure?.values?.notificationId ?? '');
    void tick().then(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (userIntentCount > 0) return;
          const focusTarget = nativeFailure
            ? (document.querySelector<HTMLElement>(
                '#notification-inbox-title ~ [data-ui="problem-notice"]',
              ) ??
              document.querySelector<HTMLElement>('.notification-inbox [data-ui="problem-notice"]'))
            : feedbackElement;
          focusTarget?.focus({ preventScroll: true });
          restoreScroll(notificationId || undefined);
        }),
      ),
    );
  });
  function uncertainSaveProblem(): NotificationFailure {
    return {
      success: false,
      actionName: 'markNotificationRead',
      code: 'NOTIFICATION_SAVE_UNCONFIRMED',
      messageKey: 'problem.notification.saveUnconfirmed',
      message:
        'The save could not be confirmed. Review the activity inbox before trying again; it may already be marked as read.',
      params: {},
      fieldErrors: {},
      remedies: [{ id: 'review_notifications' }],
      correlationId: '',
    };
  }
  function timestamp(value: unknown): string {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
      ? '—'
      : `${new Intl.DateTimeFormat({ en: 'en-US', es: 'es-ES', pt: 'pt-BR' }[locale], {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'UTC',
        }).format(date)} UTC`;
  }
</script>

<section class="record-list full notification-inbox" aria-labelledby="notification-inbox-title">
  <div class="panel-title">
    <h2 id="notification-inbox-title">{translate('Activity inbox')}</h2>
    <span class="inbox-total"><b>{visibleRecords.length}</b>{translate('Records')}</span>
  </div>
  <p class="inbox-description">
    {translate('Review your latest 50 notifications. Filters apply to this list.')}
  </p>
  <nav class="inbox-filters" aria-label={translate('Notification filters')}>
    <a href={filterHref(false)} aria-current={!unreadOnly ? 'page' : undefined}>
      {translate('All')} <span>{visibleRecords.length}</span>
    </a>
    <a href={filterHref(true)} aria-current={unreadOnly ? 'page' : undefined}>
      {translate('Unread')} <span>{unreadCount}</span>
    </a>
  </nav>
  {#if problem}
    <ProblemNotice
      {problem}
      kind={problem.code === 'UNEXPECTED_ERROR' || problem.code === 'NOTIFICATION_SAVE_UNCONFIRMED'
        ? 'service'
        : 'error'}
      {remedyLinks}
    />
  {/if}
  <p bind:this={feedbackElement} class="inbox-feedback" role="status" tabindex="-1">
    {feedback || nativeSuccess}
  </p>
  <RecordBrowser
    rows={filtered}
    controlled
    resetKey={String(unreadOnly)}
    pageSize={10}
    showEmpty={false}
    label="Notifications"
    {translate}
  >
    {#snippet children(rows)}
      {#each rows as row (row.id)}
        {@const safeTarget = notificationTargetPath(row.target)}
        {@const detailHref = `${base}/app/notifications/${encodeURIComponent(String(row.id))}?lang=${locale}`}
        <article class:unread={!row.read_at} class="notification-row" data-notification-id={row.id}>
          <a class="record-card-link" href={safeTarget ? base + safeTarget : detailHref}>
            <strong>{notificationCopy(String(row.kind), locale).subject}</strong>
            <small>
              {#if row.record_title}{String(row.record_title)} ·
              {/if}
              {#if row.project_number}{String(row.project_number)} ·
              {/if}
              <time datetime={String(row.created_at)}>{timestamp(row.created_at)}</time>
            </small>
            {#if row.record_date}<span>{translate('Record date')}: {String(row.record_date)}</span
              >{/if}
            {#if Array.isArray(row.changed_fields) && row.changed_fields.length}
              <span class="change-summary"
                >{translate('Changed:')}
                {row.changed_fields
                  .map((field) => field.replaceAll(/([A-Z])/g, ' $1').toLowerCase())
                  .join(', ')}</span
              >
            {/if}
            <span class="record-card-open">{translate('Open record →')}</span>
          </a>
          <div class="inbox-row-actions">
            <span class="state-tag">{row.read_at ? translate('read') : translate('new')}</span>
            <a class="inbox-detail" href={detailHref}>{translate('Notification details')}</a>
            {#if !row.read_at}
              <form
                method="POST"
                action={markReadHref()}
                data-notification-read-form
                use:enhance={({ cancel }) => {
                  if (savingId) {
                    cancel();
                    return;
                  }
                  savingId = String(row.id);
                  feedback = '';
                  enhancedProblem = null;
                  enhancedHandled = true;
                  const scrollTop = window.scrollY;
                  const intentAtSubmit = userIntentCount;
                  return async ({ result, update }) => {
                    try {
                      if (result.type === 'success' && result.data?.success) {
                        await update({ reset: false });
                        feedback = standaloneActionMessage(locale, result.data);
                      } else if (
                        result.type === 'failure' &&
                        result.data &&
                        typeof result.data === 'object' &&
                        'code' in result.data
                      ) {
                        enhancedProblem = result.data as NotificationFailure;
                      } else {
                        enhancedProblem = uncertainSaveProblem();
                      }
                    } catch {
                      enhancedProblem = uncertainSaveProblem();
                    } finally {
                      savingId = '';
                      pendingForm = null;
                      pendingSource = null;
                      forgetScroll();
                      await tick();
                      if (userIntentCount === intentAtSubmit) {
                        const focusTarget = enhancedProblem
                          ? document.querySelector<HTMLElement>(
                              '.notification-inbox [data-ui="problem-notice"]',
                            )
                          : feedbackElement;
                        focusTarget?.focus({ preventScroll: true });
                        window.scrollTo({ top: scrollTop, behavior: 'auto' });
                      }
                    }
                  };
                }}
              >
                <input type="hidden" name="notificationId" value={String(row.id)} />
                <button type="submit" disabled={Boolean(savingId)}
                  >{savingId === String(row.id)
                    ? translate('Saving…')
                    : translate('Mark as read')}</button
                >
              </form>
            {/if}
          </div>
        </article>
      {:else}
        <div class="empty" role="status">
          <strong
            >{translate(
              unreadOnly ? 'No unread notifications in this list.' : 'No notifications.',
            )}</strong
          >
          {#if unreadOnly}<a href={filterHref(false)}>{translate('View all notifications')}</a>{/if}
        </div>
      {/each}
    {/snippet}
  </RecordBrowser>
</section>

<style>
  .inbox-description {
    color: var(--ja-muted, #56574f);
    margin: 0 0 1rem;
  }
  .inbox-filters,
  .inbox-row-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.625rem;
  }
  .inbox-filters a,
  .inbox-detail,
  .inbox-row-actions button,
  .empty a {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--ja-control-border, #86877b);
    border-radius: 0.5rem;
    font-size: 0.875rem;
    text-decoration: none;
    color: var(--ja-ink, #24251f);
    background: white;
  }
  .inbox-filters a[aria-current] {
    background: var(--ja-ink, #24251f);
    color: white;
  }
  .inbox-filters span {
    font-variant-numeric: tabular-nums;
  }
  .inbox-total {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .inbox-row-actions .state-tag {
    display: inline-flex;
    align-items: center;
    align-self: center;
    width: auto;
    min-height: 1.75rem;
    margin: 0;
    padding: 0.25rem 0.625rem;
    border: 1px solid var(--ja-line, #d6d5d2);
    border-radius: 999px;
    background: var(--ja-canvas, #f6f6f1);
    color: var(--ja-ink, #24251f);
    font-size: 0.8125rem;
    line-height: 1.4;
  }
  .notification-inbox :global(.notification-row) {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.75rem;
    padding: 1.125rem;
    border: 1px solid var(--ja-line, #d6d5d2);
    border-radius: 0.75rem;
    margin-block: 0.75rem;
  }
  .notification-inbox :global(.notification-row.unread) {
    border-inline-start: 3px solid var(--ja-accent, #a3291d);
  }
  .record-card-link {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .inbox-row-actions form {
    margin: 0;
  }
  .inbox-row-actions button {
    cursor: pointer;
  }
  .inbox-row-actions button:disabled {
    cursor: wait;
    opacity: 0.65;
  }
  .inbox-feedback {
    margin: 0.75rem 0;
    font-size: 0.875rem;
  }
  .inbox-feedback:empty {
    display: none;
  }
  .empty {
    display: grid;
    justify-items: start;
    gap: 0.75rem;
  }
  a:focus-visible,
  button:focus-visible,
  .inbox-feedback:focus-visible {
    outline: 2px solid var(--ja-accent, #2349b5);
    outline-offset: 3px;
  }
  @media (max-width: 479px) {
    .inbox-row-actions {
      align-items: stretch;
    }
    .inbox-row-actions form {
      flex: 1 1 auto;
    }
    .inbox-row-actions button {
      width: 100%;
    }
  }
</style>
