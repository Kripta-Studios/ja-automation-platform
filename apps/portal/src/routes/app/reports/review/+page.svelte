<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    Field,
    FieldGroup,
    FormCard,
    SectionCard,
    StatusBadge,
    TableRegion,
  } from '$lib/portal/ui';
  import type { PortalLocale } from '$lib/portal-i18n';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneActionMessage,
    standaloneText,
  } from '../../standalone-locale';
  import { reviewCopy, type ReviewLocale } from './copy';

  type Row = Record<string, unknown>;
  type ReviewReport = Row & {
    reportId: string;
    projectId: string;
    periodStart: string;
    periodEnd: string;
    reportType: string;
    state: string;
    snapshotVersion: number;
    snapshotSha256: string;
    pdfReady: boolean;
    conformityState: 'accepted' | 'signed_issue' | 'not_accepted';
    sources: readonly Row[];
    followup: Row & {
      latestEventId: string | null;
      latestEvent: Row | null;
      events: readonly Row[];
    };
  };

  const eventTypes = ['shared', 'exported', 'awaiting_signatory', 'returned', 'disputed'] as const;

  let { data, form } = $props();
  let localeOverride = $state<PortalLocale | null>(null);
  let selectedEvents = $state<Record<string, string>>({});
  const locale = $derived(
    localeOverride ?? resolveStandaloneLocale($page.url.searchParams.get('lang')),
  );
  const copy = $derived(
    reviewCopy[(locale === 'pt' ? 'pt' : locale === 'es' ? 'es' : 'en') as ReviewLocale],
  );
  const reports = $derived((data.review?.reports ?? []) as ReviewReport[]);
  const projects = $derived((data.projects ?? []) as Row[]);
  const responsibleUsers = $derived((data.responsibleUsers ?? []) as Row[]);
  const finance = $derived(
    (data.finance ?? { billing: [], invoices: [] }) as Row & {
      billing?: readonly Row[];
      invoices?: readonly Row[];
    },
  );
  const values = $derived((form?.values ?? {}) as Record<string, unknown>);
  const feedback = $derived.by(() => {
    if (form?.success && form.messageKey === 'action.reports.periodFollowupRecorded')
      return copy.recorded;
    const message = standaloneActionMessage(locale, form);
    return message === 'action.reports.periodFollowupRecorded' || message === 'Follow-up recorded'
      ? copy.recorded
      : message;
  });

  const display = (value: unknown, fallback = '—'): string =>
    value === null || value === undefined || value === '' ? fallback : String(value);
  const submittedValue = (name: string, fallback = ''): string => {
    const value = values[name];
    return value === null || value === undefined || value === '' ? fallback : String(value);
  };
  const eventType = (reportId: string): string =>
    selectedEvents[reportId] ?? submittedValue('eventType', 'shared');
  const eventLabel = (value: unknown): string => {
    const key = String(value ?? '');
    const labels = copy.followupTypes;
    return labels[key] ?? (key ? key.replaceAll('_', ' ') : '—');
  };
  const reasonLabel = (value: unknown): string => {
    const key = String(value ?? '');
    return copy.reasonLabels[key] ?? key.replaceAll('_', ' ');
  };
  const statusLabel = (value: unknown): string => {
    const key = String(value ?? '').toLowerCase();
    if (key === 'accepted') return copy.accepted;
    if (key === 'signed_issue') return copy.signedIssue;
    if (key === 'not_accepted') return copy.notAccepted;
    if (key === 'ready') return copy.readyForBilling;
    if (key === 'incomplete') return copy.incomplete;
    if (key === 'already_closed') return copy.alreadyClosed;
    return display(value);
  };
  const statusVariant = (value: unknown): 'success' | 'warning' | 'danger' | 'info' | 'neutral' => {
    const key = String(value ?? '').toLowerCase();
    if (['accepted', 'ready'].includes(key)) return 'success';
    if (['incomplete', 'signed_issue', 'not_accepted'].includes(key)) return 'warning';
    if (key === 'disputed') return 'danger';
    return 'info';
  };
  const linkFor = (href: unknown): string => {
    const value = String(href ?? '');
    return value.startsWith('/') ? `${base}${value}` : value;
  };
  const sourceLabel = (source: Row): string => `${display(source.type)} · ${display(source.id)}`;
  const reportHistoryCards = (report: ReviewReport) =>
    report.followup.events.map((event) => ({
      id: display(event.id),
      cells: [
        { label: copy.eventType, value: eventLabel(event.eventType) },
        { label: copy.eventDateShort, value: display(event.eventDate ?? event.createdAt) },
        { label: copy.version, value: `v${display(event.snapshotVersion)}` },
        { label: copy.hash, value: display(event.snapshotSha256) },
        { label: copy.responsible, value: display(event.responsibleUserId) },
        { label: copy.state, value: event.stale ? copy.stale : copy.ready },
      ],
    }));
  function selectEvent(reportId: string, event: Event): void {
    const control = event.currentTarget;
    if (!(control instanceof HTMLSelectElement)) return;
    selectedEvents = { ...selectedEvents, [reportId]: control.value };
  }
  function isDispatchEvent(reportId: string): boolean {
    return ['shared', 'exported'].includes(eventType(reportId));
  }
  function isSignatoryEvent(reportId: string): boolean {
    return eventType(reportId) === 'awaiting_signatory';
  }
  function isReturnEvent(reportId: string): boolean {
    return ['returned', 'disputed'].includes(eventType(reportId));
  }
  function defaultRetryKey(report: ReviewReport): string {
    const sequence = Number(report.followup.latestEvent?.sequenceNo ?? 0) + 1;
    return `${report.reportId}-event-${sequence}`;
  }
  function applyLocale(next: PortalLocale): void {
    localeOverride = next;
    persistStandaloneLocale(next);
    applyStandaloneDocumentLocale(next);
  }
  onMount(() => {
    const resolved = resolveStandaloneLocale($page.url.searchParams.get('lang'));
    applyLocale(resolved);
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'ja.portal.locale' || event.key === 'ja-portal-locale')
        localeOverride = resolveStandaloneLocale(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  });
  $effect(() => applyStandaloneDocumentLocale(locale));
</script>

<svelte:head><title>{copy.title} | J&amp;A</title></svelte:head>

<main class="period-review-page" data-period-review lang={locale === 'pt' ? 'pt-BR' : locale}>
  <nav class="review-nav">
    <a href={`${base}/app/reports?lang=${locale}`}>← {copy.back}</a>
  </nav>

  <header class="review-header">
    <div>
      <p class="review-kicker">{copy.period}</p>
      <h1>{copy.title}</h1>
      <p>{copy.intro}</p>
    </div>
    <label class="review-language">
      <span>{standaloneText(locale, 'Language')}</span>
      <select
        aria-label={standaloneText(locale, 'Language')}
        value={locale}
        onchange={(event) =>
          applyLocale(((event.currentTarget as HTMLSelectElement).value as PortalLocale) ?? 'en')}
      >
        <option value="en">English</option>
        <option value="es">Español</option>
        <option value="pt">Português</option>
      </select>
    </label>
  </header>

  {#if feedback}
    <p class="review-feedback" role="status" aria-live="polite">{feedback}</p>
  {/if}

  <FormCard title={copy.period} class="review-filter-card">
    <form method="GET" action={`${base}/app/reports/review`}>
      <input type="hidden" name="lang" value={locale} />
      <FieldGroup columns="auto">
        <Field id="review-project" label={copy.project} required>
          <select id="review-project" name="project" value={data.selectedProjectId ?? ''} required>
            <option value="">{copy.selectProject}</option>
            {#each projects as project}
              <option value={display(project.id)}
                >{display(project.label, display(project.name))}</option
              >
            {/each}
          </select>
        </Field>
        <Field id="review-from" label={copy.from} required>
          <input id="review-from" name="from" type="date" value={data.periodStart ?? ''} required />
        </Field>
        <Field id="review-to" label={copy.to} required>
          <input id="review-to" name="to" type="date" value={data.periodEnd ?? ''} required />
        </Field>
      </FieldGroup>
      <button type="submit">{copy.apply}</button>
    </form>
    {#if !data.review}
      <p class="review-help">{copy.choosePeriod}</p>
    {/if}
  </FormCard>

  {#if data.review}
    <section class="period-context" aria-label={copy.period}>
      <div>
        <span>{copy.period}</span>
        <strong>{display(data.periodStart)} → {display(data.periodEnd)}</strong>
      </div>
      <p>{copy.periodNotAccepted}</p>
    </section>

    <SectionCard title={copy.reportQueue} data-review-queue>
      {#if reports.length === 0}
        <p class="empty-state">{copy.noReports}</p>
      {:else}
        <div class="review-report-list">
          {#each reports as report}
            <article class="review-report-card" data-period-review-report={report.reportId}>
              <header class="review-report-heading">
                <div>
                  <p class="review-kicker">{display(report.reportType)}</p>
                  <h3>{display(report.periodStart)} → {display(report.periodEnd)}</h3>
                </div>
                <StatusBadge
                  variant={statusVariant(report.conformityState)}
                  text={statusLabel(report.conformityState)}
                />
              </header>

              <dl class="review-facts">
                <div>
                  <dt>{copy.reportId}</dt>
                  <dd><code>{display(report.reportId)}</code></dd>
                </div>
                <div>
                  <dt>{copy.state}</dt>
                  <dd>{display(report.state)}</dd>
                </div>
                <div>
                  <dt>{copy.version}</dt>
                  <dd>v{display(report.snapshotVersion)}</dd>
                </div>
                <div>
                  <dt>{copy.hash}</dt>
                  <dd><code>{display(report.snapshotSha256)}</code></dd>
                </div>
                <div>
                  <dt>{copy.pdf}</dt>
                  <dd>
                    <StatusBadge
                      variant={report.pdfReady ? 'success' : 'warning'}
                      text={report.pdfReady ? copy.ready : copy.unavailable}
                    />
                  </dd>
                </div>
                <div>
                  <dt>{copy.conformity}</dt>
                  <dd>{statusLabel(report.conformityState)}</dd>
                </div>
              </dl>

              <div class="review-report-actions">
                <a
                  href={`${base}/app/reports/period/${encodeURIComponent(report.reportId)}?lang=${locale}`}
                  >{copy.openReport} →</a
                >
                {#if report.pdfReady}
                  <a
                    href={`${base}/app/api/reports/${encodeURIComponent(report.reportId)}/pdf`}
                    target="_blank"
                    rel="noreferrer">{copy.openPdf} ↗</a
                  >
                {/if}
              </div>

              <section class="review-sources" aria-label={copy.sourceCoverage}>
                <div class="review-section-heading">
                  <h4>{copy.sourceCoverage}</h4>
                  <span>{report.sources.length}</span>
                </div>
                <p class="review-help">{copy.sourceIdsBelong}</p>
                <ul>
                  {#each report.sources as source}
                    <li data-source-link={source.id}>
                      <a href={linkFor(source.href)}>{sourceLabel(source)} ↗</a>
                    </li>
                  {:else}
                    <li>{copy.noSources}</li>
                  {/each}
                </ul>
              </section>

              <section class="review-followup" data-followup-history>
                <div class="review-section-heading">
                  <div>
                    <h4>{copy.followup}</h4>
                    <p class="review-help">{copy.followupHelp}</p>
                  </div>
                  {#if report.followup.latestEvent}
                    <StatusBadge
                      variant={report.followup.latestEvent.stale ? 'warning' : 'info'}
                      text={report.followup.latestEvent.stale
                        ? copy.stale
                        : eventLabel(report.followup.latestEvent.eventType)}
                    />
                  {/if}
                </div>

                {#if report.followup.latestEvent}
                  <div class="latest-event">
                    <strong
                      >{copy.latestEvent}: {eventLabel(
                        report.followup.latestEvent.eventType,
                      )}</strong
                    >
                    <span
                      >{display(
                        report.followup.latestEvent.eventDate ??
                          report.followup.latestEvent.createdAt,
                      )} · {copy.responsible}: {display(
                        report.followup.latestEvent.responsibleUserId,
                      )}</span
                    >
                    {#if report.followup.latestEvent.stale}<p class="stale-note">
                        {copy.stale}
                      </p>{/if}
                  </div>
                {:else}
                  <p class="empty-state">{copy.noEvents}</p>
                {/if}

                <details class="history-details">
                  <summary>{copy.history} ({report.followup.events.length})</summary>
                  <TableRegion
                    label={copy.history}
                    mobileMode="cards"
                    cardRows={reportHistoryCards(report)}
                  >
                    <table>
                      <thead
                        ><tr
                          ><th>{copy.eventType}</th><th>{copy.eventDateShort}</th><th
                            >{copy.version}</th
                          ><th>{copy.hash}</th><th>{copy.responsible}</th><th>{copy.state}</th></tr
                        ></thead
                      >
                      <tbody>
                        {#each report.followup.events as event}
                          <tr>
                            <td>{eventLabel(event.eventType)}</td>
                            <td>{display(event.eventDate ?? event.createdAt)}</td>
                            <td>v{display(event.snapshotVersion)}</td>
                            <td><code>{display(event.snapshotSha256)}</code></td>
                            <td>{display(event.responsibleUserId)}</td>
                            <td>{event.stale ? copy.stale : copy.ready}</td>
                          </tr>
                        {:else}
                          <tr><td colspan="6">{copy.noEvents}</td></tr>
                        {/each}
                      </tbody>
                    </table>
                  </TableRegion>
                </details>

                <FormCard title={copy.followupForm} class="followup-form">
                  <p class="review-help">{copy.dispatchAttestation}</p>
                  {#if /^[a-f0-9]{64}$/.test(report.snapshotSha256 ?? '')}
                    <form
                      method="POST"
                      action={`?/recordFollowup&${new URLSearchParams({ project: data.selectedProjectId ?? '', from: data.periodStart ?? '', to: data.periodEnd ?? '', lang: locale })}`}
                    >
                      <input type="hidden" name="periodReportId" value={report.reportId} />
                      <input
                        type="hidden"
                        name="expectedSnapshotVersion"
                        value={report.snapshotVersion}
                      />
                      <input
                        type="hidden"
                        name="expectedSnapshotSha256"
                        value={report.snapshotSha256}
                      />
                      <input
                        type="hidden"
                        name="expectedLatestEventId"
                        value={report.followup.latestEventId ?? ''}
                      />
                      <FieldGroup columns="auto">
                        <Field id={`event-type-${report.reportId}`} label={copy.eventType} required>
                          <select
                            id={`event-type-${report.reportId}`}
                            name="eventType"
                            value={eventType(report.reportId)}
                            onchange={(event) => selectEvent(report.reportId, event)}
                            required
                          >
                            {#each eventTypes as type}
                              <option value={type}>{copy.followupTypes[type]}</option>
                            {/each}
                          </select>
                        </Field>
                        <Field
                          id={`responsible-${report.reportId}`}
                          label={copy.responsible}
                          required
                        >
                          <select
                            id={`responsible-${report.reportId}`}
                            name="responsibleUserId"
                            value={submittedValue('responsibleUserId')}
                            required
                          >
                            <option value="">{copy.responsible}</option>
                            {#each responsibleUsers as user}
                              <option value={display(user.id)}
                                >{display(user.name, display(user.id))} · {display(
                                  user.role,
                                )}</option
                              >
                            {/each}
                          </select>
                        </Field>
                        <input
                          type="hidden"
                          name="idempotencyKey"
                          value={submittedValue('idempotencyKey', defaultRetryKey(report))}
                        />
                        <Field id={`next-followup-${report.reportId}`} label={copy.nextFollowUp}>
                          <input
                            id={`next-followup-${report.reportId}`}
                            name="nextFollowUpOn"
                            type="date"
                            value={submittedValue('nextFollowUpOn')}
                          />
                        </Field>
                        <Field
                          id={`method-${report.reportId}`}
                          label={copy.method}
                          help={isDispatchEvent(report.reportId)
                            ? copy.requiredForDispatch
                            : undefined}
                        >
                          <input
                            id={`method-${report.reportId}`}
                            name="method"
                            type="text"
                            maxlength="200"
                            value={submittedValue('method')}
                            required={isDispatchEvent(report.reportId)}
                          />
                        </Field>
                        <Field id={`event-date-${report.reportId}`} label={copy.eventDate}>
                          <input
                            id={`event-date-${report.reportId}`}
                            name="eventDate"
                            type="date"
                            value={submittedValue('eventDate')}
                            required={isDispatchEvent(report.reportId)}
                          />
                        </Field>
                        <Field id={`reference-${report.reportId}`} label={copy.reference}>
                          <input
                            id={`reference-${report.reportId}`}
                            name="reference"
                            type="text"
                            maxlength="500"
                            value={submittedValue('reference')}
                            required={isDispatchEvent(report.reportId)}
                          />
                        </Field>
                        <Field
                          id={`signatory-${report.reportId}`}
                          label={copy.signatoryName}
                          help={isSignatoryEvent(report.reportId)
                            ? copy.requiredForSignatory
                            : undefined}
                        >
                          <input
                            id={`signatory-${report.reportId}`}
                            name="signatoryName"
                            type="text"
                            maxlength="200"
                            value={submittedValue('signatoryName')}
                            required={isSignatoryEvent(report.reportId)}
                          />
                        </Field>
                        <Field
                          id={`reason-${report.reportId}`}
                          label={copy.reason}
                          help={isReturnEvent(report.reportId) ? copy.requiredForReturn : undefined}
                        >
                          <textarea
                            id={`reason-${report.reportId}`}
                            name="reason"
                            maxlength="2000"
                            rows="3"
                            required={isReturnEvent(report.reportId)}
                            >{submittedValue('reason')}</textarea
                          >
                        </Field>
                      </FieldGroup>
                      <p class="review-help">{copy.exactBinding}</p>
                      <p class="review-help">{copy.pdfRequired}</p>
                      {#if !report.pdfReady}
                        <p class="review-warning">{copy.pdfRequired}</p>
                      {/if}
                      <button type="submit">{copy.record}</button>
                    </form>
                  {:else}
                    <p class="review-warning">{copy.unavailable} · {copy.pdfRequired}</p>
                    <a
                      href={`${base}/app/reports/period/${encodeURIComponent(report.reportId)}?lang=${locale}`}
                      >{copy.openReport} →</a
                    >
                  {/if}
                </FormCard>
              </section>
            </article>
          {/each}
        </div>
      {/if}
    </SectionCard>

    <SectionCard title={copy.financeReadiness} data-finance-readiness>
      {#if data.userRole === 'project_manager'}
        <p class="restricted-note">{copy.noFinanceAmounts}</p>
      {:else if finance.billing?.length}
        <p class="review-help">{copy.sourceIdsBelong}</p>
        <div class="readiness-list">
          {#each finance.billing ?? [] as stream}
            {@const readiness = (stream.readiness ?? {}) as Row}
            <article class="readiness-card">
              <header>
                <div>
                  <h3>{display(stream.streamType)}</h3>
                  <p>{copy.cadence}: {display(stream.cadenceType)}</p>
                </div>
                <StatusBadge
                  variant={statusVariant(readiness.state)}
                  text={statusLabel(readiness.state)}
                />
              </header>
              {#if Array.isArray(readiness.reasons) && readiness.reasons.length}
                <ul>
                  {#each readiness.reasons as reason}
                    {@const sourceHref = reason.sourceHref}
                    <li data-readiness-reason={reason.code}>
                      <span
                        >{copy.reasonLabels[String(reason.code)] ?? reasonLabel(reason.code)}</span
                      >
                      {#if sourceHref}<a href={linkFor(sourceHref)}
                          >{copy.openSource} · {display(reason.sourceId)} ↗</a
                        >{:else if reason.code === 'period_cutoff_mismatch'}<small
                          >{copy.cadenceMismatch}</small
                        >{/if}
                    </li>
                  {/each}
                </ul>
              {:else}
                <p>{copy.readyForBilling}</p>
              {/if}
            </article>
          {/each}
        </div>
      {:else}
        <p class="restricted-note">{copy.financeRestricted}</p>
      {/if}
      <div class="invoice-section">
        <h3>{copy.invoiceDrafts}</h3>
        {#if finance.invoices?.length}
          <ul>
            {#each finance.invoices ?? [] as invoice}
              <li>
                <span>{copy.invoice} · {display(invoice.invoiceNumber, display(invoice.id))}</span
                ><small
                  >{display(invoice.streamType)} · {display(invoice.state)} · {display(
                    invoice.periodStart,
                  )} → {display(invoice.periodEnd)}</small
                >
              </li>
            {/each}
          </ul>
        {:else}
          <p>{copy.noInvoices}</p>
        {/if}
      </div>
    </SectionCard>
  {/if}
</main>

<style>
  .period-review-page {
    max-width: 1240px;
    margin: 0 auto;
    padding: clamp(1rem, 4vw, 2.75rem);
    display: grid;
    gap: 1rem;
    color: #1d3a4d;
  }

  .review-nav a,
  .review-report-actions a,
  .review-sources a,
  .readiness-card a {
    color: #17665e;
    font-weight: 750;
  }

  .period-review-page :global([data-ui='field-group'][data-columns='auto']) {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  }

  .period-review-page > :global(*) {
    min-width: 0;
  }
  .period-review-page :global(*) {
    box-sizing: border-box;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .review-header,
  .review-report-heading,
  .review-section-heading,
  .readiness-card header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .review-header {
    padding: 0.5rem 0 0.75rem;
  }

  .review-header h1 {
    max-width: 48rem;
    margin: 0;
    color: #173146;
    font-size: clamp(1.65rem, 4vw, 2.45rem);
    line-height: 1.08;
  }

  .review-header p {
    max-width: 54rem;
    margin: 0.65rem 0 0;
    line-height: 1.55;
  }

  .review-kicker {
    margin: 0 0 0.35rem;
    color: #63788a;
    font:
      700 0.7rem Consolas,
      monospace;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .review-language {
    display: grid;
    gap: 0.35rem;
    min-width: 8rem;
    color: #536b7b;
    font-size: 0.72rem;
    font-weight: 700;
  }

  :global(.review-filter-card) form,
  :global(.followup-form) form {
    display: grid;
    min-width: 0;
    gap: 1rem;
  }

  :global(.review-filter-card) button,
  :global(.followup-form) button {
    min-height: 2.75rem;
    width: max-content;
    padding: 0.65rem 1rem;
    border: 1px solid #17665e;
    border-radius: 0.5rem;
    color: #fff;
    background: #277e78;
    font-weight: 800;
    cursor: pointer;
  }

  :global(.review-filter-card) button:hover,
  :global(.review-filter-card) button:focus-visible,
  :global(.followup-form) button:hover,
  :global(.followup-form) button:focus-visible {
    background: #17665e;
  }

  .review-feedback {
    margin: 0;
    padding: 0.8rem 1rem;
    border-left: 0.3rem solid #277e78;
    border-radius: 0 0.5rem 0.5rem 0;
    background: #f1fbfa;
  }

  .review-help,
  .review-warning,
  .restricted-note,
  .stale-note {
    margin: 0.35rem 0 0;
    color: #536b7b;
    font-size: 0.82rem;
    line-height: 1.5;
  }

  .review-warning,
  .stale-note {
    color: #7a5410;
  }

  .period-context {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.1rem;
    border: 1px solid #d6e4e7;
    border-radius: 0.65rem;
    background: #f8fbfc;
  }

  .period-context div {
    display: grid;
    gap: 0.3rem;
  }

  .period-context span {
    color: #63788a;
    font:
      700 0.68rem Consolas,
      monospace;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .period-context p {
    max-width: 45rem;
    margin: 0;
    color: #6b4e12;
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .review-report-list,
  .readiness-list {
    display: grid;
    gap: 1rem;
  }

  .review-report-card,
  .readiness-card {
    display: grid;
    gap: 1rem;
    min-width: 0;
    padding: 1rem;
    border: 1px solid #d6e4e7;
    border-radius: 0.65rem;
    background: #fff;
  }

  .review-report-heading h3,
  .readiness-card h3,
  .invoice-section h3 {
    margin: 0;
    color: #173146;
    font-size: 1.05rem;
  }

  .review-facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
    gap: 0.8rem 1rem;
    margin: 0;
  }

  .review-facts div {
    min-width: 0;
    padding: 0.7rem;
    border-radius: 0.45rem;
    background: #f2f6f8;
  }

  dt {
    color: #63788a;
    font-size: 0.7rem;
    font-weight: 700;
  }

  dd {
    margin: 0.3rem 0 0;
    overflow-wrap: anywhere;
    font-size: 0.82rem;
  }

  code {
    overflow-wrap: anywhere;
    font-size: 0.72rem;
  }

  .review-report-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem 1.25rem;
  }

  .review-sources,
  .review-followup,
  .invoice-section {
    display: grid;
    gap: 0.65rem;
    padding-top: 0.95rem;
    border-top: 1px solid #e2ebee;
  }

  .review-section-heading h4 {
    margin: 0;
    color: #173146;
    font-size: 0.95rem;
  }

  .review-section-heading > span {
    color: #63788a;
    font-weight: 750;
  }

  .review-sources ul,
  .readiness-card ul,
  .invoice-section ul {
    display: grid;
    gap: 0.45rem;
    margin: 0;
    padding-left: 1.25rem;
  }

  .review-sources li,
  .readiness-card li,
  .invoice-section li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    min-width: 0;
    line-height: 1.45;
  }

  .latest-event {
    display: grid;
    gap: 0.3rem;
    padding: 0.75rem;
    border-left: 0.25rem solid #277e78;
    border-radius: 0 0.45rem 0.45rem 0;
    background: #f1fbfa;
  }

  .latest-event span {
    color: #536b7b;
    font-size: 0.78rem;
  }

  .history-details summary {
    width: max-content;
    padding: 0.6rem 0;
    color: #17665e;
    font-weight: 800;
    cursor: pointer;
  }

  :global(.followup-form) {
    margin-top: 0.35rem;
    background: #f8fbfc;
  }

  :global(.followup-form) :global(.ui-card-heading) {
    font-size: 1rem;
  }

  :global(.followup-form input),
  :global(.followup-form select),
  :global(.followup-form textarea),
  :global(.review-filter-card input),
  :global(.review-filter-card select),
  .review-language select {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    min-height: 2.75rem;
    padding: 0.62rem 0.7rem;
    border: 1px solid #d7e1e9;
    border-radius: 0.5rem;
    color: #213c50;
    background: #fff;
    font: inherit;
  }

  :global(.followup-form) textarea {
    min-height: 5.75rem;
    resize: vertical;
  }

  .readiness-card header p,
  .invoice-section p {
    margin: 0.3rem 0 0;
    color: #536b7b;
    font-size: 0.8rem;
  }

  .readiness-card li,
  .invoice-section li {
    flex-wrap: wrap;
  }

  .readiness-card li span,
  .invoice-section li span {
    min-width: min(100%, 20rem);
  }

  .readiness-card small,
  .invoice-section small {
    display: block;
    color: #536b7b;
  }

  .empty-state {
    margin: 0;
    color: #536b7b;
  }

  @media (max-width: 700px) {
    .review-header,
    .period-context,
    .review-report-heading,
    .review-section-heading,
    .readiness-card header {
      flex-direction: column;
      align-items: stretch;
    }

    .review-language {
      width: 100%;
    }

    :global(.review-filter-card) button,
    :global(.followup-form) button {
      width: 100%;
    }

    .review-sources li,
    .readiness-card li,
    .invoice-section li {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.25rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .period-review-page,
    .period-review-page * {
      scroll-behavior: auto !important;
      transition-duration: 0.001ms !important;
    }
  }
</style>
