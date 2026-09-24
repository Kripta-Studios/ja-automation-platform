<script lang="ts">
  import { SectionCard } from '$lib/portal/ui';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import type { PortalLocale } from '$lib/portal-i18n';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneText,
  } from '../../../standalone-locale';
  let { data } = $props();
  let localeOverride = $state<PortalLocale | null>(null);
  const locale = $derived(
    localeOverride ?? data.locale ?? resolveStandaloneLocale($page.url.searchParams.get('lang')),
  );
  const t = (key: string, params?: Record<string, string | number>) =>
    standaloneText(locale, key, params);
  const record = $derived(data.record);
  const crewHref = $derived(
    `/j-aautomation/app/crew?${new URLSearchParams({ project: record.projectId, date: record.workDate })}`,
  );
  const expenseHref = $derived(
    `/j-aautomation/app/expenses?${new URLSearchParams({
      project: record.projectId,
      worker: record.workerId,
      date: record.workDate,
      timeEntry: record.id,
    })}`,
  );
  onMount(() => {
    localeOverride = resolveStandaloneLocale($page.url.searchParams.get('lang'), data.locale);
    persistStandaloneLocale(locale);
    applyStandaloneDocumentLocale(locale);
  });
  $effect(() => applyStandaloneDocumentLocale(locale));
</script>

<svelte:head><title>{t("Crew time · J&A Automation")}</title></svelte:head>
<main class="crew-detail">
  <a href={crewHref}>{t("← Back to crew hours")}</a>
  <h1>{record.workerName} · {record.workDate}</h1>
  <SectionCard title={t("Recorded work")}>
    <dl>
      <div>
        <dt>{t("Project")}</dt>
        <dd>{record.projectName}</dd>
      </div>
      <div>
        <dt>{t("Person")}</dt>
        <dd>{record.workerName}</dd>
      </div>
      <div>
        <dt>{t("Work date")}</dt>
        <dd>{record.workDate}</dd>
      </div>
      <div>
        <dt>{t("Actual time")}</dt>
        <dd>{Math.floor(record.minutes / 60)} h {record.minutes % 60} {t("min")}</dd>
      </div>
      <div>
        <dt>{t("Category")}</dt>
        <dd>{record.category}</dd>
      </div>
      <div>
        <dt>{t("Work performed")}</dt>
        <dd>{record.summary}</dd>
      </div>
      {#if record.site}<div>
          <dt>{t("Site")}</dt>
          <dd>{record.site}</dd>
        </div>{/if}
      {#if record.startTime && record.endTime}
        <div>
          <dt>{t("Interval")}</dt>
          <dd>{record.startTime}–{record.endTime}</dd>
        </div>
      {/if}
      <div>
        <dt>{t("Approval")}</dt>
        <dd>{record.approvalState}</dd>
      </div>
    </dl>
    <a class="expense-link" href={expenseHref}>{t("Add expense for")} {record.workerName}</a>
  </SectionCard>
</main>

<style>
  .crew-detail {
    max-width: 52rem;
    margin: 0 auto;
    padding: 1rem 1rem 4rem;
    display: grid;
    gap: 1.25rem;
  }
  .crew-detail h1 {
    margin: 0;
  }
  dl {
    display: grid;
    gap: 0.75rem;
  }
  dl div {
    display: grid;
    grid-template-columns: minmax(8rem, 1fr) 2fr;
    gap: 1rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid #e3e9ef;
  }
  dt {
    font-weight: 700;
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .expense-link {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    padding: 0.55rem 1rem;
    border-radius: 0.45rem;
    background: #eaf1f5;
    color: #164c68;
    font-weight: 700;
    text-decoration: none;
  }
  a:focus-visible {
    outline: 3px solid #e6a23c;
    outline-offset: 2px;
  }
  @media (max-width: 600px) {
    dl div {
      grid-template-columns: 1fr;
      gap: 0.25rem;
    }
    .crew-detail {
      padding: 0.8rem;
    }
  }
</style>
