<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneText,
  } from '../../standalone-locale';
  import type { PortalLocale } from '$lib/portal-i18n';
  import {
    translateControlledValue,
    type ControlledValueDomain,
  } from '$lib/i18n/controlled-values';
  type Row = Record<string, string | number | boolean | null>;
  let { data } = $props();
  let localeOverride = $state<PortalLocale | null>(null);
  const locale = $derived(
    localeOverride ?? data.locale ?? resolveStandaloneLocale($page.url.searchParams.get('lang')),
  );
  const t = (key: string): string => standaloneText(locale, key);
  const controlled = (domain: ControlledValueDomain, value: unknown): string =>
    translateControlledValue(
      locale,
      domain,
      value === null || value === undefined ? null : String(value),
    );
  const record = $derived(data.record as Row);
  const hours = (minutes: unknown) => String((Number(minutes ?? 0) / 60).toFixed(1)) + ' h';
  function printReport(): void {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.print();
  }
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

<svelte:head><title>{t('Time entry')} | {record.project_number}</title></svelte:head>
<main class="record-detail-page">
  <nav class="detail-nav">
    <a href={base + '/app/time'}>← {t('Time')}</a>
    <a href={base + '/app/projects/' + String(record.project_id)}>{t('Open project')}</a>
    <button type="button" class="no-print print-trigger" onclick={printReport}>
      <span aria-hidden="true">⎙</span>
      {t('Print Report')}
    </button>
  </nav>
  <header class="record-detail-header">
    <div>
      <span class="portal-kicker">{t('TIME ENTRY · SOURCE RECORD')}</span>
      <h1>{record.project_number} · {record.work_date}</h1>
      <p>{record.project_name} · {record.worker_name}</p>
    </div>
    <span class="state-tag">{controlled('status', record.approval_state)}</span>
  </header>
  <section class="record-detail-grid">
    <article><span>{t('ACTUAL TIME')}</span><strong>{hours(record.minutes)}</strong></article>
    <article>
      <span>{t('CATEGORY')}</span><strong>{controlled('timeCategory', record.category)}</strong>
    </article>
    <article>
      <span>{t('BILLABILITY')}</span><strong
        >{controlled('status', record.billability_state ?? 'pending')}</strong
      >
    </article>
    <article>
      <span>{t('SITE')}</span><strong>{record.site ?? record.site_name ?? '—'}</strong>
    </article>
  </section>
  <section class="detail-panel record-detail-copy">
    <div class="panel-title">
      <h2>{t('Activity summary')}</h2>
      <span>{record.activity_code ?? t('No code')}</span>
    </div>
    <p>{record.activity_summary ?? t('No activity summary was recorded.')}</p>
    <dl class="record-facts">
      <div>
        <dt>{t('Project timezone')}</dt>
        <dd>{record.project_timezone ?? '—'}</dd>
      </div>
      <div>
        <dt>{t('Shift window')}</dt>
        <dd>{record.start_time ?? '—'} → {record.end_time ?? '—'}</dd>
      </div>
      <div>
        <dt>{t('Break')}</dt>
        <dd>{record.break_minutes ? String(record.break_minutes) + ' min' : '—'}</dd>
      </div>
      <div>
        <dt>{t('Submitted')}</dt>
        <dd>{record.submitted_at ?? t('Not submitted')}</dd>
      </div>
      <div>
        <dt>{t('Approved')}</dt>
        <dd>{record.approved_at ?? t('Not approved')}</dd>
      </div>
    </dl>
  </section>
</main>
