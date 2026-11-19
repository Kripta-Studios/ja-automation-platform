<script lang="ts">
  import { page } from '$app/stores';
  import type { PortalLocale } from '../../portal-i18n';
  import type { AuditFilter } from '../audit-log';
  import type { PortalRow } from '../portal-data';
  import { scaleCopy, scaleLocaleTag, type ScaleShellCopyKey } from './scale-shell-copy';
  import { auditActionText, auditEntityTypeText } from '../audit-action-labels';
  import { auditDetailLines, auditDetailText } from '../audit-detail';

  let {
    rows,
    view,
    filter,
    total,
    pageNumber,
    pages,
    pageSize,
    actors,
    entityTypes,
    base,
    locale,
    translate,
    actionLabel,
    timestampLabel,
    utcIso,
    detailsDisplay,
  }: {
    rows: PortalRow[];
    view: 'all' | 'business' | 'service';
    filter: AuditFilter;
    total: number;
    pageNumber: number;
    pages: number;
    pageSize: number;
    actors: Array<{ id: string; name: string }>;
    entityTypes: string[];
    base: string;
    locale: PortalLocale;
    translate: (value: string) => string;
    actionLabel: (row: Record<string, unknown>) => string;
    timestampLabel: (value: unknown) => string;
    utcIso: (value: unknown) => string | undefined;
    detailsDisplay: (value: unknown) => string;
  } = $props();

  const c = (key: ScaleShellCopyKey, params?: Record<string, string | number>) =>
    scaleCopy(locale, key, params);
  const number = (value: number) => new Intl.NumberFormat(scaleLocaleTag[locale]).format(value);
  const rangeLabel = $derived(
    filter.range === '7'
      ? c('last7')
      : filter.range === '30'
        ? c('last30')
        : filter.range === '90'
          ? c('last90')
          : filter.range === 'all'
            ? c('allTime')
            : c('rangeCustom', { from: filter.from || '…', to: filter.to || '…' }),
  );
  const first = $derived(total ? (pageNumber - 1) * pageSize + 1 : 0);
  const last = $derived(Math.min(total, pageNumber * pageSize));
  const moreOpen = $derived(Boolean(filter.type) || view !== 'business' || filter.range === 'custom');
  let formElement: HTMLFormElement | undefined = $state();

  function hrefWith(changes: Record<string, string | null>): string {
    const url = new URL($page.url);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    url.searchParams.set('lang', locale);
    return `${url.pathname}${url.search}`;
  }
  /** Keep shareable URLs short: empty filters are not sent. */
  function dropEmptyFields(event: FormDataEvent): void {
    for (const [key, value] of [...event.formData.entries()])
      if (value === '' || (key === 'view' && value === 'business') || (key === 'range' && value === '7'))
        event.formData.delete(key);
  }
  function rangeChanged(): void {
    // A preset replaces custom dates.
    for (const input of formElement?.querySelectorAll<HTMLInputElement>('input[type="date"]') ?? [])
      input.value = '';
    submitNow();
  }
  function submitNow(): void {
    formElement?.requestSubmit();
  }
  function shortTime(value: unknown): string {
    const iso = utcIso(value);
    if (!iso) return timestampLabel(value);
    return new Intl.DateTimeFormat(scaleLocaleTag[locale], {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  }
  function shortRef(value: unknown): string {
    const raw = String(value ?? '');
    return raw.length > 14 && /^[0-9a-f-]{20,}$/iu.test(raw) ? `…${raw.slice(-8)}` : raw;
  }
  function humanType(type: string): string {
    return auditEntityTypeText(type, locale);
  }
  /** Human label (A3); the raw machine code stays in the expanded detail. */
  function humanAction(row: Record<string, unknown>): string {
    const shellLabel = actionLabel(row);
    return auditActionText(
      shellLabel.startsWith('security.mfa.login') ? 'security.mfa.login' : String(row.action),
      locale,
    );
  }
</script>

<section class="record-list full audit-log" aria-labelledby="audit-log-title" data-audit-log>
  <div class="panel-title">
    <h2 id="audit-log-title">{translate('Append-only security and finance audit')}</h2>
    <span class="audit-log__scope" data-audit-scope
      >{c('scopeLine', { range: rangeLabel, total: number(total) })}</span
    >
  </div>

  <form
    bind:this={formElement}
    class="audit-log__filters"
    method="GET"
    action={`${base}/app/audit`}
    aria-label={translate('Audit event filters')}
    data-sveltekit-keepfocus
    data-sveltekit-noscroll
    onformdata={dropEmptyFields}
  >
    <input type="hidden" name="lang" value={locale} />
    <label class="audit-log__find">
      <span>{c('auditFind')}</span>
      <input
        type="search"
        name="find"
        value={filter.find}
        maxlength="120"
        autocomplete="off"
        placeholder={c('auditFindHint')}
      />
    </label>
    <label>
      <span>{c('auditPeriod')}</span>
      <select name="range" value={filter.range === 'custom' ? '' : filter.range} onchange={rangeChanged}>
        <option value="7">{c('last7')}</option>
        <option value="30">{c('last30')}</option>
        <option value="90">{c('last90')}</option>
        <option value="all">{c('allTime')}</option>
        {#if filter.range === 'custom'}<option value="">{c('customRange')}</option>{/if}
      </select>
    </label>
    <label>
      <span>{c('actor')}</span>
      <select name="actor" value={filter.actor} onchange={submitNow}>
        <option value="">{c('anyone')}</option>
        <option value="service">{c('serviceJobs')}</option>
        {#each actors as person (person.id)}<option value={person.id}>{person.name}</option>{/each}
      </select>
    </label>
    <div class="audit-log__buttons">
      <button type="submit" class="primary-button">{c('search')}</button>
      {#if filter.find || filter.actor || filter.type || filter.range !== '7' || view !== 'business'}
        <a class="secondary-button" href={`${base}/app/audit?lang=${encodeURIComponent(locale)}`}
          >{c('clear')}</a
        >
      {/if}
    </div>
    <details class="audit-log__more" open={moreOpen}>
      <summary>{c('moreFilters')}</summary>
      <div class="audit-log__more-grid">
        <label>
          <span>{c('kind')}</span>
          <select name="view" value={view} onchange={submitNow}>
            <option value="business">{c('business')}</option>
            <option value="service">{c('service')}</option>
            <option value="all">{c('all')}</option>
          </select>
        </label>
        <label>
          <span>{c('recordType')}</span>
          <select name="type" value={filter.type} onchange={submitNow}>
            <option value="">{c('anyType')}</option>
            {#each entityTypes as type (type)}<option value={type}>{humanType(type)}</option>{/each}
          </select>
        </label>
        <label>
          <span>{c('from')}</span>
          <input type="date" name="from" value={filter.range === 'custom' ? filter.from : ''} />
        </label>
        <label>
          <span>{c('to')}</span>
          <input type="date" name="to" value={filter.range === 'custom' ? filter.to : ''} />
        </label>
      </div>
    </details>
  </form>

  <p class="audit-log__count" role="status" aria-live="polite" data-audit-count>
    {total ? c('showing', { from: number(first), to: number(last), total: number(total) }) : c('showingNone')}
  </p>

  {#if rows.length === 0}
    <div class="empty">{c('noEvents')}</div>
  {:else}
    <ul class="audit-log__list">
      {#each rows as row (String(row.id))}
        {@const detail = auditDetailLines(row.details_json, locale)}
        <li>
          <details class="audit-log__row audit-event">
            <summary
              aria-label={`${translate('View details')}: ${humanAction(row)} · ${String(row.entity_id)}`}
            >
              <time class="audit-log__time" datetime={utcIso(row.occurred_at)}
                >{shortTime(row.occurred_at)}</time
              >
              <span class="audit-log__actor"
                >{String(row.actor_name ?? '') || (row.actor_id ? shortRef(row.actor_id) : c('unknownActor'))}</span
              >
              <strong class="audit-log__action" title={String(row.action)}>{humanAction(row)}</strong>
              <span class="audit-log__entity"
                >{humanType(String(row.entity_type))} · {shortRef(row.entity_id)}</span
              >
            </summary>
            <div class="audit-log__detail">
              {#if detail.kind === 'none'}
                <p class="audit-log__none">{auditDetailText(locale, 'noDetails')}</p>
              {:else}
                <dl class="audit-log__fields" data-audit-fields={detail.kind}>
                  {#each detail.lines as line, lineIndex (lineIndex)}
                    <div>
                      <dt>{line.label}</dt>
                      <dd>
                        {#if line.before !== undefined}<span class="audit-log__old"
                            >{line.before}</span
                          > → {/if}{line.value}
                      </dd>
                    </div>
                  {/each}
                </dl>
                {#if detail.hidden > 0}
                  <p class="audit-log__none">
                    {auditDetailText(locale, 'more', { count: detail.hidden })}
                  </p>
                {/if}
              {/if}
              <details class="audit-log__technical">
                <summary>{auditDetailText(locale, 'technical')}</summary>
                <p>
                  <small
                    >{String(row.action)} · {String(row.entity_type)} · {String(row.entity_id)} ·
                    {timestampLabel(row.occurred_at)}</small
                  >
                  <small>{translate('Actor ID')}: {String(row.actor_id || '—')}</small>
                </p>
                <pre><code>{detailsDisplay(row.details_json)}</code></pre>
              </details>
            </div>
          </details>
        </li>
      {/each}
    </ul>
  {/if}

  {#if pages > 1}
    <nav class="audit-log__pager" aria-label={c('pageOf', { page: pageNumber, pages })}>
      {#if pageNumber > 1}
        <a class="secondary-button" href={hrefWith({ page: String(pageNumber - 1) })} rel="prev"
          >← {c('previous')}</a
        >
      {/if}
      <span>{c('pageOf', { page: number(pageNumber), pages: number(pages) })}</span>
      {#if pageNumber < pages}
        <a
          class="secondary-button audit-older-link"
          href={hrefWith({ page: String(pageNumber + 1) })}
          rel="next">{c('next')} →</a
        >
      {/if}
    </nav>
  {/if}
</section>

<style>
  .audit-log__scope {
    font-weight: 650;
  }
  .audit-log__filters {
    display: grid;
    grid-template-columns: minmax(14rem, 2fr) repeat(2, minmax(10rem, 1fr)) auto;
    gap: 0.75rem;
    align-items: end;
    margin: 0.5rem 0 0.75rem;
  }
  .audit-log__filters label {
    display: grid;
    gap: 0.3rem;
    font-size: 0.85rem;
    font-weight: 600;
    min-width: 0;
  }
  .audit-log__filters input,
  .audit-log__filters select {
    min-height: 44px;
    width: 100%;
    box-sizing: border-box;
  }
  .audit-log__buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .audit-log__buttons > * {
    min-height: 44px;
  }
  .audit-log__more {
    grid-column: 1 / -1;
  }
  .audit-log__more summary {
    cursor: pointer;
    font-weight: 600;
    min-height: 32px;
    display: inline-flex;
    align-items: center;
  }
  .audit-log__more-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.75rem;
    margin-top: 0.5rem;
  }
  .audit-log__count {
    margin: 0 0 0.5rem;
    color: #44596b;
    font-size: 0.9rem;
  }
  .audit-log__list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid #dfe7ee;
    border-radius: 10px;
    overflow: hidden;
  }
  .audit-log__list li + li {
    border-top: 1px solid #e8eef3;
  }
  .audit-log__row summary {
    display: grid;
    grid-template-columns: 11rem minmax(8rem, 1fr) minmax(10rem, 1.6fr) minmax(8rem, 1fr) 1.75rem;
    gap: 0.75rem;
    align-items: center;
    padding: 0.55rem 0.75rem;
    min-height: 44px;
    cursor: pointer;
    font-size: 0.9rem;
    list-style: none;
  }
  .audit-log__row summary::-webkit-details-marker {
    display: none;
  }
  .audit-log__row summary::after {
    grid-column: -2;
    grid-row: 1;
    justify-self: end;
  }
  .audit-log__row[open] summary {
    background: #f3f7fa;
  }
  .audit-log__row summary > * {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .audit-log__time,
  .audit-log__entity {
    color: #526779;
  }
  .audit-log__detail {
    padding: 0.5rem 0.75rem 0.75rem;
  }
  .audit-log__detail p {
    display: grid;
    gap: 0.2rem;
    margin: 0 0 0.5rem;
    word-break: break-all;
  }
  .audit-log__fields {
    display: grid;
    gap: 0.3rem;
    margin: 0 0 0.5rem;
  }
  .audit-log__fields > div {
    display: grid;
    grid-template-columns: minmax(8rem, 14rem) minmax(0, 1fr);
    gap: 0.75rem;
  }
  .audit-log__fields dt {
    font-weight: 600;
    color: #33475a;
  }
  .audit-log__fields dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .audit-log__old {
    color: #6b7c8c;
    text-decoration: line-through;
  }
  .audit-log__none {
    color: #526779;
    margin: 0 0 0.5rem;
  }
  .audit-log__technical summary {
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    min-height: 32px;
    display: inline-flex;
    align-items: center;
  }
  .audit-log__detail pre {
    max-height: 22rem;
    overflow: auto;
    margin: 0;
    font-size: 0.8rem;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .audit-log__pager {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    margin-top: 0.75rem;
    flex-wrap: wrap;
  }
  .audit-log__pager a {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }
  @media (max-width: 720px) {
    .audit-log__filters {
      grid-template-columns: 1fr 1fr;
    }
    .audit-log__find,
    .audit-log__buttons {
      grid-column: 1 / -1;
    }
    .audit-log__row summary {
      grid-template-columns: 1fr auto 1.75rem;
      gap: 0.15rem 0.5rem;
    }
    .audit-log__action {
      grid-column: 1 / 3;
      grid-row: 1;
      white-space: normal;
    }
    .audit-log__row summary::after {
      grid-column: 3;
      grid-row: 1 / span 3;
      align-self: center;
    }
    .audit-log__entity {
      grid-column: 1 / 3;
    }
    /* Z8: full timestamps and names on phones (no "8:4…" truncation). */
    .audit-log__row summary > .audit-log__time,
    .audit-log__row summary > .audit-log__actor {
      white-space: normal;
      overflow: visible;
      text-overflow: clip;
    }
    .audit-log__row summary > .audit-log__actor {
      text-align: right;
    }
    .audit-log__fields > div {
      grid-template-columns: 1fr;
      gap: 0.1rem;
    }
  }
</style>
