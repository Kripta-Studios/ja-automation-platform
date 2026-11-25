<script lang="ts">
  import DirectionIcon from '../ui/DirectionIcon.svelte';
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import { onMount, tick } from 'svelte';
  import { notificationCopy, notificationRemovedNote } from '../../notifications/copy';
  import { notificationTargetPath } from '../../notifications/target';
  import { standaloneActionMessage } from '../../../routes/app/standalone-locale';
  import ProblemNotice from '../ui/ProblemNotice.svelte';
  import RecordBrowser from '../ui/RecordBrowser.svelte';
  import type { ProblemData } from '$lib/problem/contract';
  import type { PortalActionResult, PortalRow } from '../portal-data';
  import { scaleCopy, scaleLocaleTag } from './scale-shell-copy';

  let {
    records,
    base,
    currentUserId,
    locale,
    translate,
    form,
    serverPage,
  }: {
    /** Server paging (scale): counts and page come from SQL, rows are one page. */
    serverPage?: {
      total: number;
      all: number;
      unread: number;
      page: number;
      pages: number;
      pageSize: number;
      unreadOnly: boolean;
    };
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
  const unreadCount = $derived(
    serverPage ? serverPage.unread : visibleRecords.filter((row) => !row.read_at).length,
  );
  const allCount = $derived(serverPage ? serverPage.all : visibleRecords.length);
  const sc = (key: Parameters<typeof scaleCopy>[1], params?: Record<string, string | number>) =>
    scaleCopy(locale, key, params);
  const fmt = (value: number) => new Intl.NumberFormat(scaleLocaleTag[locale]).format(value);
  const markedAll = $derived.by(() => {
    const result = form as { success?: boolean; messageKey?: string; count?: number } | null | undefined;
    return result?.success === true && result.messageKey === 'action.notifications.markedAllRead'
      ? sc('markedAllRead', { count: fmt(Number(result.count ?? 0)) })
      : '';
  });
  function pageHref(target: number): string {
    const url = new URL($page.url);
    url.searchParams.delete('/markNotificationRead');
    url.searchParams.delete('/markAllNotificationsRead');
    url.searchParams.set('page', String(target));
    url.searchParams.set('lang', locale);
    return `${url.pathname}${url.search}`;
  }
  const filtered = $derived(
    unreadOnly ? visibleRecords.filter((row) => !row.read_at) : visibleRecords,
  );
  // Plain "what happened + where to fix it" line for the person's own work.
  const quickWords = {
    en: { time: 'Your hours', expense: 'Your expense', daily: 'Your daily report', technical: 'Your technical report', report: 'Your report', needsChanges: 'Changes requested: {what} for {date}', missing: 'Hours not sent for {date}', fix: 'Fix it', logHours: 'Log hours', open: 'Open' },
    es: { time: 'Tus horas', expense: 'Tu gasto', daily: 'Tu informe diario', technical: 'Tu informe técnico', report: 'Tu informe', needsChanges: 'Cambios solicitados: {what} del {date}', missing: 'Horas sin enviar del {date}', fix: 'Corregir', logHours: 'Registrar horas', open: 'Abrir' },
    pt: { time: 'Suas horas', expense: 'Sua despesa', daily: 'Seu relatório diário', technical: 'Seu relatório técnico', report: 'Seu relatório', needsChanges: 'Ajustes solicitados: {what} de {date}', missing: 'Horas não enviadas em {date}', fix: 'Corrigir', logHours: 'Registrar horas', open: 'Abrir' },
  } as const;
  const longDate = (iso: string) =>
    /^\d{4}-\d{2}-\d{2}$/u.test(iso)
      ? new Date(`${iso}T12:00:00Z`).toLocaleDateString(
          locale === 'pt' ? 'pt-BR' : locale === 'es' ? 'es-ES' : 'en-US',
          { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' },
        )
      : iso;
  function quickNotice(row: PortalRow): { title: string; cta: string; href: string } | null {
    const words = quickWords[locale] ?? quickWords.en;
    const kind = String(row.kind ?? '');
    const date = String(row.record_date ?? '');
    if (kind === 'missing_time') {
      const day = /(\d{4}-\d{2}-\d{2})$/u.exec(String(row.subject_id ?? ''))?.[1] ?? '';
      if (!day) return null;
      return {
        title: words.missing.replace('{date}', longDate(day)),
        cta: words.logHours,
        href: `${base}/app/time?day=${day}&focus=hours&lang=${locale}`,
      };
    }
    const returned = /^approval_returned_(time|expense|daily|technical)$/u.exec(kind)?.[1] ??
      (kind === 'report_needs_changes' ? 'report' : '');
    if (!returned) return null;
    const what = words[returned as 'time' | 'expense' | 'daily' | 'technical' | 'report'];
    const target = notificationTargetPath(row.target);
    const href =
      returned === 'time' && date
        ? `${base}/app/time?day=${date}&lang=${locale}`
        : target
          ? base + target
          : '';
    if (!href) return null;
    return {
      title: words.needsChanges.replace('{what}', what).replace('{date}', longDate(date)),
      cta: words.fix,
      href,
    };
  }
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
    else url.searchParams.set('read', 'all');
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

<section
  class="record-list full notification-inbox"
  class:notification-inbox--compact={Boolean(serverPage)}
  aria-labelledby="notification-inbox-title"
>
  <div class="panel-title">
    <h2 id="notification-inbox-title">{translate('Activity inbox')}</h2>
    <span class="inbox-total"><b>{allCount}</b>{translate(allCount === 1 ? 'record' : 'records')}</span>
  </div>
  {#if serverPage}
    <p class="inbox-description" data-inbox-scope>
      {sc('inboxScope', { unread: fmt(serverPage.unread), all: fmt(serverPage.all) })}
    </p>
  {:else}
    <p class="inbox-description">
      {translate('Review your latest 50 notifications. Filters apply to this list.')}
    </p>
  {/if}
  <nav class="inbox-filters" aria-label={translate('Notification filters')}>
    <a href={filterHref(false)} aria-current={!unreadOnly ? 'page' : undefined}>
      {translate('All')} <span>{allCount}</span>
    </a>
    <a href={filterHref(true)} aria-current={unreadOnly ? 'page' : undefined}>
      {translate('Unread')} <span>{unreadCount}</span>
    </a>
    {#if serverPage && serverPage.unread > 0}
      <form
        method="POST"
        action="?/markAllNotificationsRead"
        class="inbox-mark-all"
        use:enhance={() => {
          feedback = '';
          enhancedProblem = null;
          return async ({ update }) => {
            await update({ reset: false });
          };
        }}
      >
        <button type="submit" class="secondary-button" data-mark-all-read
          >{sc('markAllRead')}</button
        >
      </form>
    {/if}
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
    {markedAll || feedback || nativeSuccess}
  </p>
  <RecordBrowser
    rows={filtered}
    controlled
    resetKey={String(unreadOnly)}
    pageSize={10}
    server={serverPage
      ? {
          summary:
            serverPage.total > 0
              ? sc('showing', {
                  from: fmt((serverPage.page - 1) * serverPage.pageSize + 1),
                  to: fmt(Math.min(serverPage.total, serverPage.page * serverPage.pageSize)),
                  total: fmt(serverPage.total),
                })
              : // The empty state below already says there is nothing (one message only).
                '',
          prevHref: serverPage.page > 1 ? pageHref(serverPage.page - 1) : undefined,
          nextHref: serverPage.page < serverPage.pages ? pageHref(serverPage.page + 1) : undefined,
          prevLabel: sc('previous'),
          nextLabel: sc('next'),
        }
      : undefined}
    showEmpty={false}
    label="Notifications"
    {translate}
  >
    {#snippet children(rows)}
      {#each rows as row (row.id)}
        {@const safeTarget = notificationTargetPath(row.target)}
        {@const quick = quickNotice(row)}
        {@const detailHref = `${base}/app/notifications/${encodeURIComponent(String(row.id))}?lang=${locale}`}
        {@const removed = row.source_unavailable === true && row.kind !== 'workspace_activity'}
        {@const destination = removed ? '' : quick ? quick.href : safeTarget ? base + safeTarget : ''}
        <article class:unread={!row.read_at} class="notification-row" data-notification-id={row.id}>
          <a
            class="record-card-link"
            data-sveltekit-preload-data="off"
            href={destination
              ? `${detailHref}&open=1&to=${encodeURIComponent(destination.slice(base.length))}`
              : detailHref}
          >
            <strong>{quick && !removed ? quick.title : notificationCopy(String(row.kind), locale).subject}</strong>
            <small>
              {#if row.person_name}{String(row.person_name)} ·
              {/if}
              {#if row.record_title}{String(row.record_title)} ·
              {/if}
              {#if row.project_number}{String(row.project_number)} ·
              {/if}
              <time datetime={String(row.created_at)}>{timestamp(row.created_at)}</time>
            </small>
            {#if row.record_date}<span>{translate('Record date')}: {longDate(String(row.record_date))}</span
              >{/if}
            {#if Array.isArray(row.changed_fields) && row.changed_fields.length}
              <span class="change-summary"
                >{translate('Changed:')}
                {row.changed_fields
                  .map((field) => field.replaceAll(/([A-Z])/g, ' $1').toLowerCase())
                  .join(', ')}</span
              >
            {/if}
            {#if removed}
              <span class="change-summary">{notificationRemovedNote(locale)}</span>
            {:else if destination}
              <span class="record-card-open" class:is-fix={Boolean(quick)}
                >{quick ? quick.cta : translate('Open record')} <DirectionIcon /></span
              >
            {/if}
          </a>
          <div class="inbox-row-actions">
            <span class="state-tag">{row.read_at ? translate('read') : translate('new')}</span>
            <a class="inbox-detail" data-sveltekit-preload-data="off" href={detailHref}>{translate('Notification details')}</a>
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
  .record-card-open.is-fix {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 44px;
    padding: 0 1rem;
    border-radius: 0.6rem;
    background: var(--ja-red, #b42318);
    color: #fff;
    font-weight: 700;
    width: fit-content;
  }
  .inbox-description {
    color: var(--ja-muted, #56574f);
    margin: 0 0 1rem;
  }
  .inbox-mark-all button {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
  }
  .inbox-mark-all {
    margin-left: auto;
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
  /* Scale: 25 rows per page stay one or two lines each. */
  .notification-inbox--compact :global(.notification-row) {
    gap: 0.4rem 1rem;
    padding: 0.6rem 0.9rem;
    margin-block: 0.4rem;
  }
  .notification-inbox--compact .record-card-link {
    gap: 0.1rem;
  }
  .notification-inbox--compact .record-card-link > small {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .notification-inbox--compact .inbox-row-actions {
    gap: 0.4rem;
  }
  @media (min-width: 900px) {
    .notification-inbox--compact :global(.notification-row) {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
    }
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
