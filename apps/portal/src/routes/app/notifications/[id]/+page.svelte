<script lang="ts">
  import DirectionIcon from '$lib/portal/ui/DirectionIcon.svelte';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount, tick } from 'svelte';
  import { invalidateAll } from '$app/navigation';
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
  import { notificationCopy, notificationRemovedNote } from '$lib/notifications/copy';
  import { notificationTargetPath } from '$lib/notifications/target';
  import { personDisplayName } from '$lib/portal/display-name';

  type Value = string | number | boolean | string[] | null | undefined;
  type Notification = Record<string, Value>;
  let { data, form } = $props();
  let localeOverride = $state<PortalLocale | null>(null);
  const locale = $derived(
    localeOverride ?? data.locale ?? resolveStandaloneLocale($page.url.searchParams.get('lang')),
  );
  const t = (key: string): string => standaloneText(locale, key);
  const notification = $derived(data.notification as Notification);
  const copy = $derived(notificationCopy(String(notification.kind), locale));
  const kind = $derived(copy.subject);
  const removed = $derived(
    notification.source_unavailable === true && notification.kind !== 'workspace_activity',
  );
  const changedFields = $derived(
    Array.isArray(notification.changed_fields) ? notification.changed_fields : [],
  );
  const target = $derived(notificationTargetPath(notification.target));
  // T27 (round 2): dates in the viewer's language and local time, names instead of logins,
  // field names in words, and the reviewer's reason for a returned record.
  const languageTag = $derived(locale === 'es' ? 'es-ES' : locale === 'pt' ? 'pt-BR' : 'en-US');
  const whenText = (value: unknown) => {
    const time = Date.parse(String(value ?? ''));
    return Number.isFinite(time)
      ? new Intl.DateTimeFormat(languageTag, { dateStyle: 'medium', timeStyle: 'short' }).format(time)
      : '';
  };
  const dayText = (value: unknown) => {
    const day = String(value ?? '');
    return /^\d{4}-\d{2}-\d{2}$/u.test(day)
      ? new Intl.DateTimeFormat(languageTag, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${day}T00:00:00Z`))
      : day || '—';
  };
  const FIELD_WORDS: Record<string, readonly [string, string, string]> = {
    summary: ['Summary', 'Resumen', 'Resumo'],
    taskscompleted: ['Work done', 'Trabajo realizado', 'Trabalho realizado'],
    problemsfound: ['Problems found', 'Problemas encontrados', 'Problemas encontrados'],
    openitems: ['Open items', 'Pendientes', 'Itens em aberto'],
    nextdayplan: ['Plan for the next day', 'Plan para el día siguiente', 'Plano para o dia seguinte'],
    blockers: ['Blockers', 'Bloqueos', 'Impedimentos'],
    downtimeminutes: ['Downtime', 'Parada', 'Parada'],
    safetynotes: ['Safety notes', 'Notas de seguridad', 'Notas de segurança'],
    correctiveactions: ['Corrective actions', 'Acciones correctivas', 'Ações corretivas'],
    clientdecisions: ['Client decisions', 'Decisiones del cliente', 'Decisões do cliente'],
    siteshift: ['Site / shift', 'Sitio / turno', 'Local / turno'],
    swift: ['SWIFT/BIC', 'SWIFT/BIC', 'SWIFT/BIC'],
    iban: ['IBAN', 'IBAN', 'IBAN'],
    bankname: ['Bank', 'Banco', 'Banco'],
    beneficiary: ['Beneficiary', 'Beneficiario', 'Beneficiário'],
    accountnumber: ['Account number', 'Número de cuenta', 'Número da conta'],
  };
  const fieldWord = (key: string) => {
    const known = FIELD_WORDS[key.replace(/[_\s-]/gu, '').toLocaleLowerCase()];
    if (known) return known[locale === 'es' ? 1 : locale === 'pt' ? 2 : 0];
    const words = key.replace(/([a-z0-9])([A-Z])/gu, '$1 $2').replace(/[_.-]+/gu, ' ').trim().toLocaleLowerCase();
    return words.charAt(0).toLocaleUpperCase() + words.slice(1);
  };
  const reviewReason = $derived(
    typeof (notification as { review_reason?: unknown }).review_reason === 'string'
      ? String((notification as { review_reason?: string }).review_reason)
      : '',
  );
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
    // Refresh the layout so the bell no longer counts this notification.
    if ((data as { justRead?: boolean }).justRead) void invalidateAll();
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
    <a href={base + '/app/notifications'} data-origin-back
      ><DirectionIcon direction="left" /> {t('Activity inbox')}</a
    >
    {#if target}<a href={base + target}>{t('Open source record')}</a>{/if}
  </nav>
  <header class="record-detail-header">
    <div>
      <span class="portal-kicker">{t('ACTIVITY INBOX · NOTIFICATION')}</span>
      <h1>{kind}</h1>
      <p>{whenText(notification.created_at)}</p>
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
          contact_owner: { label: t('Contact an owner') },
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
      <h2>{notification.record_title ?? kind}</h2>
      {#if notification.project_number}<span>{notification.project_number}</span>{/if}
    </div>
    <p data-notification-body>{removed ? notificationRemovedNote(locale) : copy.body}</p>
    {#if notification.person_name}<p>{t('Person')}: <b>{notification.person_name}</b></p>{/if}
    {#if reviewReason}<p class="notification-reason" data-notification-reason>
        <strong>{t('Reviewer note')}:</strong> {reviewReason}
      </p>{/if}
    {#if notification.actor_name}<p>
        {t('Last change by')}: {personDisplayName(notification.actor_name) || notification.actor_name}
      </p>{/if}
    {#if !removed}<dl class="record-facts">
      <div>
        <dt>{t('Project')}</dt>
        <dd>{notification.project_name ?? '—'}</dd>
      </div>
      <div>
        <dt>{t('Record date')}</dt>
        <dd>{dayText(notification.record_date)}</dd>
      </div>
    </dl>{/if}
    {#if changedFields.length > 0}<p class="change-summary">
        {t('Changed fields')}: {changedFields.map((field) => fieldWord(String(field))).join(', ')}
      </p>{/if}
  </section>
  <form method="POST" action="?/markRead" class="notification-read-form">
    <input type="hidden" name="notificationId" value={notification.id} />
    {#if !notification.read_at}<button>{t('Mark as read')}</button>{/if}
  </form>
</main>
