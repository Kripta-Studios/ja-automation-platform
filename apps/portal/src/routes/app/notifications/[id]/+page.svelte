<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneActionMessage,
    standaloneText,
  } from '../../standalone-locale';
  import type { PortalLocale } from '$lib/portal-i18n';
  import { translateControlledValue } from '$lib/i18n/controlled-values';

  type Value = string | number | boolean | string[] | null | undefined;
  type Notification = Record<string, Value>;
  let { data, form } = $props();
  let localeOverride = $state<PortalLocale | null>(null);
  const locale = $derived(
    localeOverride ?? data.locale ?? resolveStandaloneLocale($page.url.searchParams.get('lang')),
  );
  const t = (key: string): string => standaloneText(locale, key);
  const notificationType = (value: unknown): string => {
    const kind = String(value ?? '').toLowerCase();
    const recordType =
      kind === 'assignment_published'
        ? 'project'
        : kind === 'missing_time'
          ? 'time_entry'
          : kind.includes('expense')
            ? 'expense_submitted'
            : kind.includes('technical')
              ? 'technical_report'
              : kind.startsWith('report_')
                ? 'report_submitted'
                : null;
    return recordType
      ? translateControlledValue(locale, 'recordType', recordType)
      : t('Notification');
  };
  const notification = $derived(data.notification as Notification);
  const kind = $derived(notificationType(notification.kind));
  const changedFields = $derived(
    Array.isArray(notification.changed_fields) ? notification.changed_fields : [],
  );
  const target = $derived(
    notification.kind === 'report_deleted'
      ? ''
      : String(notification.kind ?? '').startsWith('report_')
        ? base + '/app/reports/' + String(notification.subject_id)
        : String(notification.kind ?? '').includes('expense')
          ? base + '/app/expenses/' + String(notification.subject_id)
          : notification.kind === 'assignment_published'
            ? base + '/app/projects/' + String(notification.subject_id)
            : base + '/app/notifications',
  );
  onMount(() => {
    localeOverride = resolveStandaloneLocale($page.url.searchParams.get('lang'), data.locale);
    persistStandaloneLocale(locale);
    applyStandaloneDocumentLocale(locale);
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'ja.portal.locale' || event.key === 'ja-portal-locale')
        localeOverride = resolveStandaloneLocale(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  });
  $effect(() => applyStandaloneDocumentLocale(locale));
</script>

<svelte:head><title>{t('Notification')} | J&A Automation</title></svelte:head>

<main class="record-detail-page notification-detail-page">
  <nav class="detail-nav">
    <a href={base + '/app/notifications'}>← {t('Activity inbox')}</a>
    {#if target}<a href={target}>{t('Open source record')}</a>{/if}
  </nav>
  <header class="record-detail-header">
    <div>
      <span class="portal-kicker">{t('ACTIVITY INBOX · NOTIFICATION')}</span>
      <h1>{kind}</h1>
      <p>
        {String(notification.created_at ?? '')
          .replace('T', ' ')
          .slice(0, 19)}
      </p>
    </div>
    <span class="state-tag">{notification.read_at ? t('read') : t('new')}</span>
  </header>
  {#if standaloneActionMessage(locale, form)}<p
      class:success={form?.success}
      class="action-message"
      role="status"
    >
      {standaloneActionMessage(locale, form)}
    </p>{/if}
  <section class="detail-panel record-detail-copy">
    <div class="panel-title">
      <h2>{notification.record_title ?? t('Workspace activity')}</h2>
      <span>{notification.project_number ?? '—'}</span>
    </div>
    <p>
      {notification.actor_name ?? t('A workspace user')}
      {t('generated this activity for')}
      {notification.project_name ?? t('the workspace')}.
    </p>
    <dl class="record-facts">
      <div>
        <dt>{t('Project')}</dt>
        <dd>{notification.project_name ?? '—'}</dd>
      </div>
      <div>
        <dt>{t('Record date')}</dt>
        <dd>{notification.record_date ?? '—'}</dd>
      </div>
      <div>
        <dt>{t('Source ID')}</dt>
        <dd>{notification.subject_id ?? '—'}</dd>
      </div>
    </dl>
    {#if changedFields.length > 0}<p class="change-summary">
        {t('Changed fields')}: {changedFields.join(', ')}
      </p>{/if}
  </section>
  <form method="POST" action="?/markRead" class="notification-read-form">
    <input type="hidden" name="notificationId" value={notification.id} />
    {#if !notification.read_at}<button>{t('Mark as read')}</button>{/if}
  </form>
</main>
