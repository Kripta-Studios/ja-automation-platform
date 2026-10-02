<script lang="ts">
  import DirectionIcon from '$lib/portal/ui/DirectionIcon.svelte';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneText,
  } from './standalone-locale';
  import type { PortalLocale } from '$lib/portal-i18n';

  const locale = $derived(
    resolveStandaloneLocale(
      $page.url.searchParams.get('lang'),
      ($page.data as { locale?: PortalLocale }).locale,
    ),
  );
  const status = $derived($page.status);
  const financeProjectUnavailable = $derived(
    status === 404 && $page.error?.message === 'finance.project_unavailable',
  );
  const auditHistoryCursorInvalid = $derived(
    status === 400 &&
      $page.url.pathname === `${base}/app/audit` &&
      $page.error?.message === 'Invalid audit history cursor',
  );
  const translate = (key: string): string => standaloneText(locale, key);
  const notificationDetailUnavailable = $derived.by(() => {
    if (status !== 404) return false;
    const prefix = `${base}/app/notifications/`;
    const path = $page.url.pathname;
    return path.startsWith(prefix) && !path.slice(prefix.length).includes('/');
  });
  const title = $derived(
    auditHistoryCursorInvalid
      ? translate('Invalid audit history link')
      : financeProjectUnavailable
        ? translate('Project unavailable')
        : notificationDetailUnavailable
          ? translate('Notification unavailable')
          : status === 404
            ? standaloneText(locale, 'No results')
            : status === 403
              ? standaloneText(locale, 'Access restricted')
              : standaloneText(locale, 'Error'),
  );
  const genericFailure = $derived(standaloneText(locale, 'action.error.unavailable'));
  const closeoutFinanceDenied = $derived(
    status === 403 &&
      $page.url.pathname.includes('/projects/') &&
      $page.url.pathname.endsWith('/closeout') &&
      $page.error?.message === 'Finance role required',
  );
  const approvalRoleDenied = $derived(
    status === 403 &&
      $page.url.pathname.endsWith('/approvals') &&
      $page.error?.message === 'Approval access required',
  );
  const description = $derived(
    auditHistoryCursorInvalid
      ? translate(
          'This audit history link is incomplete or invalid. Open the latest events to continue.',
        )
      : financeProjectUnavailable
        ? translate(
            'The selected project is unavailable in your access scope. Choose an available project to continue; your other filters are retained.',
          )
        : status === 404
          ? notificationDetailUnavailable
            ? translate('problem.notification.unavailable')
            : translate('No records match that search in your access scope.')
          : status === 403
            ? closeoutFinanceDenied
              ? translate('problem.closeout.financeRoleRequired')
              : approvalRoleDenied
                ? translate(
                    'Approvals are available to owners, project managers, and finance administrators. Open your workspace or contact an owner if you need this access.',
                  )
                : translate(
                    'Your account does not have access to this page. Return to a section available to your role.',
                  )
            : genericFailure,
  );
  const recoveryHref = $derived(
    auditHistoryCursorInvalid
      ? (() => {
          const requestedView = $page.url.searchParams.get('view');
          const view =
            requestedView === 'service' || requestedView === 'all' ? requestedView : 'business';
          return `${base}/app/audit?lang=${encodeURIComponent(locale)}&view=${view}`;
        })()
      : financeProjectUnavailable
        ? (() => {
            const recovery = new URL($page.url);
            recovery.searchParams.delete('project');
            recovery.searchParams.set('view', 'overview');
            return `${recovery.pathname}${recovery.search}`;
          })()
        : notificationDetailUnavailable
          ? `${base}/app/notifications?lang=${locale}`
          : `${base}/app/`,
  );
  const recoveryLabel = $derived(
    auditHistoryCursorInvalid
      ? translate('Open latest audit events')
      : financeProjectUnavailable
        ? translate('Choose an available project')
        : notificationDetailUnavailable
          ? translate('Activity inbox')
          : standaloneText(locale, 'Open my workspace'),
  );
  const sectionLabel = $derived.by(() => {
    const code = String($page.error?.message ?? '');
    if (auditHistoryCursorInvalid) return translate('Audit log');
    if (approvalRoleDenied) return translate('Approvals');
    if (code.includes('project') || $page.url.pathname.includes('/projects/'))
      return translate('Projects');
    if (code.includes('report')) return translate('Reports');
    if (code.includes('timeEntry')) return translate('Time');
    if (code.includes('expense')) return translate('Expenses');
    if (code.includes('invoice')) return translate('Invoices');
    if (code.includes('notification')) return translate('Notifications');
    return translate('Portal');
  });

  let errorHeading: HTMLHeadingElement | undefined;

  onMount(() => {
    persistStandaloneLocale(locale);
    applyStandaloneDocumentLocale(locale);
    if (status === 403 || notificationDetailUnavailable || auditHistoryCursorInvalid)
      errorHeading?.focus();
  });
  $effect(() => applyStandaloneDocumentLocale(locale));
</script>

<svelte:head><title>{title} · J&A Automation</title></svelte:head>

<main class="record-detail-page error-page">
  <nav class="detail-nav no-print" aria-label={translate('Portal navigation')}>
    <a href={recoveryHref}><DirectionIcon direction="left" /> {recoveryLabel}</a>
    <span>{sectionLabel}</span>
  </nav>
  <section class="detail-panel" role="alert">
    <p class="portal-kicker">{sectionLabel}</p>
    <h1 bind:this={errorHeading} tabindex="-1">{title}</h1>
    <p>{description}</p>
    {#if closeoutFinanceDenied}<p>{translate('Contact an owner')}</p>{/if}
    <a class="secondary-button" href={recoveryHref}>{recoveryLabel}</a>
  </section>
</main>
