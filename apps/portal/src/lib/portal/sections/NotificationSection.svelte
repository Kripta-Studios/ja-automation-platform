<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import { tick } from 'svelte';
  import { notificationCopy } from '../../notifications/copy';
  import { notificationTargetPath } from '../../notifications/target';
  import { standaloneActionMessage } from '../../../routes/app/standalone-locale';
  import RecordBrowser from '../ui/RecordBrowser.svelte';
  import type { PortalRow } from '../portal-data';

  let {
    records,
    base,
    locale,
    translate,
  }: {
    records: PortalRow[];
    base: string;
    locale: 'en' | 'es' | 'pt';
    translate: (key: string) => string;
  } = $props();
  const unreadOnly = $derived($page.url.searchParams.get('read') === 'unread');
  const unreadCount = $derived(records.filter((row) => !row.read_at).length);
  const filtered = $derived(unreadOnly ? records.filter((row) => !row.read_at) : records);
  let savingId = $state('');
  let feedback = $state('');
  let failed = $state(false);
  let feedbackElement: HTMLParagraphElement;

  function filterHref(unread: boolean): string {
    const url = new URL($page.url);
    if (unread) url.searchParams.set('read', 'unread');
    else url.searchParams.delete('read');
    url.searchParams.set('lang', locale);
    return `${url.pathname}${url.search}`;
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
    <span class="inbox-total"><b>{records.length}</b>{translate('Records')}</span>
  </div>
  <p class="inbox-description">
    {translate('Review your latest 50 notifications. Filters apply to this list.')}
  </p>
  <nav class="inbox-filters" aria-label={translate('Notification filters')}>
    <a href={filterHref(false)} aria-current={!unreadOnly ? 'page' : undefined}>
      {translate('All')} <span>{records.length}</span>
    </a>
    <a href={filterHref(true)} aria-current={unreadOnly ? 'page' : undefined}>
      {translate('Unread')} <span>{unreadCount}</span>
    </a>
  </nav>
  <p
    bind:this={feedbackElement}
    class:error={failed}
    class="inbox-feedback"
    role="status"
    tabindex="-1"
  >
    {feedback}
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
                action="?/markNotificationRead"
                use:enhance={({ cancel }) => {
                  if (savingId) {
                    cancel();
                    return;
                  }
                  savingId = String(row.id);
                  feedback = '';
                  return async ({ result, update }) => {
                    try {
                      if (result.type === 'success' || result.type === 'failure') {
                        failed = result.type === 'failure' || !result.data?.success;
                        feedback = standaloneActionMessage(locale, result.data);
                        if (!failed) await update({ reset: false });
                      } else {
                        failed = true;
                        feedback = translate(
                          'Could not update the notification. Please try again.',
                        );
                      }
                    } catch {
                      failed = true;
                      feedback = translate(
                        'Could not refresh the inbox. Reload to check the notification status.',
                      );
                    } finally {
                      savingId = '';
                      await tick();
                      feedbackElement?.focus();
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
  .inbox-feedback.error {
    color: #9a2018;
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
