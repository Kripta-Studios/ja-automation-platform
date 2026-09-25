<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount, tick } from 'svelte';
  import ProblemNotice from '$lib/portal/ui/ProblemNotice.svelte';
  import type { ProblemData } from '$lib/problem/contract';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneActionMessage,
    standaloneText,
  } from '../../standalone-locale';
  import type { PortalLocale } from '$lib/portal-i18n';
  import { translateControlledValue } from '$lib/i18n/controlled-values';
  import { notificationCopy } from '$lib/notifications/copy';
  import { notificationTargetPath } from '$lib/notifications/target';

  type Value = string | number | boolean | string[] | null | undefined;
  type Notification = Record<string, Value>;
  let { data, form } = $props();
  let localeOverride = $state<PortalLocale | null>(null);
  const locale = $derived(
    localeOverride ?? data.locale ?? resolveStandaloneLocale($page.url.searchParams.get('lang')),
  );
  const t = (key: string): string => standaloneText(locale, key);
  const notification = $derived(data.notification as Notification);
  const kind = $derived(notificationCopy(String(notification.kind), locale).subject);
  const changedFields = $derived(
    Array.isArray(notification.changed_fields) ? notification.changed_fields : [],
  );
  const target = $derived(notificationTargetPath(notification.target));
  const formProblem = $derived(
    form?.success === false && typeof form.code === 'string' && typeof form.messageKey === 'string'
      ? (form as ProblemData)
      : null,
  );
  let focusedProblemId = '';
  $effect(() => {
    const id = formProblem?.correlationId;
    if (!id || id === focusedProblemId) return;
    focusedProblemId = id;
    void tick().then(() =>
      document
        .querySelector<HTMLElement>('[data-notification-problem] [data-ui="problem-notice"]')
        ?.focus({ preventScroll: true }),
    );
  });
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
    <a href={base + '/app/notifications'} data-origin-back>← {t('Activity inbox')}</a>
    {#if target}<a href={base + target}>{t('Open source record')}</a>{/if}
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
    <span class="state-tag"
      >{translateControlledValue(locale, 'status', notification.read_at ? 'read' : 'new')}</span
    >
  </header>
  {#if formProblem}
    <div data-notification-problem>
      <ProblemNotice
        problem={formProblem}
        kind={formProblem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
        remedyLinks={{
          review_notifications: {
            label: t('Activity inbox'),
            href: `${base}/app/notifications`,
          },
          sign_in_again: { label: t('Sign in'), href: `${base}/app/login` },
        }}
      />
    </div>
  {:else if standaloneActionMessage(locale, form)}<p
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
        <dd>{notification.source_id ?? notification.subject_id ?? '—'}</dd>
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
