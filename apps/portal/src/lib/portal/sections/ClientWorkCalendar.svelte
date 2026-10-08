<script lang="ts">
  import { SvelteDate } from 'svelte/reactivity';
  import { page } from '$app/stores';
  import {
    calendarMinutesForDate,
    clientCalendarMonthDays,
    formatCalendarHours,
    groupClientCalendarEntries,
    normalizeCalendarMonth,
    type ClientCalendarEntry,
  } from '../client-work-calendar';

  let {
    clientId,
    entries,
    month,
    translate,
    controlledValue,
    locale = 'en-US',
  }: {
    clientId: string;
    entries: ClientCalendarEntry[];
    month: string;
    translate: (value: string) => string;
    controlledValue?: (domain: 'status', value: unknown) => string;
    locale?: string;
  } = $props();

  let selectedDate = $derived(`${normalizeCalendarMonth(month)}-01`);
  const days = $derived(
    clientCalendarMonthDays(month).map((day) => ({
      ...day,
      minutes: calendarMinutesForDate(entries, day.date),
    })),
  );
  const selectedProjects = $derived(groupClientCalendarEntries(entries, selectedDate));
  const monthLabel = $derived(formatDate(`${month}-01`, { month: 'long', year: 'numeric' }));
  const selectedLabel = $derived(formatDate(selectedDate, { dateStyle: 'full' }));
  const weekdays = $derived(
    days.slice(0, 7).map((day) => ({
      short: formatDate(day.date, { weekday: 'short' }),
      full: formatDate(day.date, { weekday: 'long' }),
    })),
  );

  function formatDate(value: string, options: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
      new SvelteDate(`${value}T00:00:00.000Z`),
    );
  }

  function monthHref(offset: number): string {
    const next = new SvelteDate(`${month}-01T00:00:00.000Z`);
    next.setUTCMonth(next.getUTCMonth() + offset);
    const nextMonth = next.toISOString().slice(0, 7);
    const url = new URL($page.url);
    url.searchParams.set('view', 'clients');
    url.searchParams.set('calendarMonth', nextMonth);
    url.hash = `client-work-calendar-${clientId}`;
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function hours(minutes: number): string {
    return formatCalendarHours(minutes, locale);
  }
</script>

<section
  class="client-work-calendar"
  id={`client-work-calendar-${clientId}`}
  aria-labelledby={`client-work-calendar-heading-${clientId}`}
  data-client-work-calendar
>
  <header class="client-work-calendar__toolbar">
    <div>
      <h3 id={`client-work-calendar-heading-${clientId}`}>{translate('Actual work calendar')}</h3>
      <p>{translate('Hours and workers come from logged time entries.')}</p>
    </div>
    <div class="client-work-calendar__navigation">
      <a href={monthHref(-1)} aria-label={`${translate('Previous month')}: ${monthLabel}`}
        >{translate('Previous')}</a
      >
      <strong aria-live="polite">{monthLabel}</strong>
      <a href={monthHref(1)} aria-label={`${translate('Next month')}: ${monthLabel}`}
        >{translate('Next')}</a
      >
    </div>
  </header>
  <div class="client-work-calendar__grid" role="group" aria-label={monthLabel}>
    {#each weekdays as weekday}
      <abbr class="client-work-calendar__weekday" title={weekday.full}>{weekday.short}</abbr>
    {/each}
    {#each days as day (day.date)}
      <button
        type="button"
        class="client-work-calendar__day"
        class:outside-month={!day.inMonth}
        class:selected={day.date === selectedDate}
        aria-pressed={day.date === selectedDate}
        aria-label={`${formatDate(day.date, { dateStyle: 'full' })} · ${translate('Actual hours')}: ${hours(day.minutes)}`}
        onclick={() => (selectedDate = day.date)}
      >
        <span>{Number(day.date.slice(-2))}</span>
        <small>{day.minutes ? hours(day.minutes) : '—'}</small>
      </button>
    {/each}
  </div>
  <section class="client-work-calendar__agenda" aria-labelledby={`client-work-day-${clientId}`}>
    <h4 id={`client-work-day-${clientId}`} aria-live="polite">{selectedLabel}</h4>
    {#if selectedProjects.length}
      <ul class="client-work-calendar__projects">
        {#each selectedProjects as project (project.id)}
          <li>
            <div class="client-work-calendar__project-heading">
              <strong>{project.projectNumber} · {project.name}</strong>
              <strong>{hours(project.minutes)}</strong>
            </div>
            {#if project.siteName}<p>{project.siteName}</p>{/if}
            <ul class="client-work-calendar__workers">
              {#each project.workers as worker (worker.id)}
                <li>
                  <span>{worker.name}</span>
                  <span>{hours(worker.minutes)}</span>
                  <small>
                    {#each worker.approvalStates as state, index (state)}
                      {#if index > 0}
                        ·
                      {/if}{controlledValue?.('status', state) ?? translate(state)}
                    {/each}
                  </small>
                </li>
              {/each}
            </ul>
          </li>
        {/each}
      </ul>
    {:else}
      <p role="status">{translate('No actual time logged on this day.')}</p>
    {/if}
  </section>
</section>

<style>
  .client-work-calendar {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
    padding: 0.85rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.65rem;
    background: var(--portal-surface, #fff);
  }

  .client-work-calendar h3,
  .client-work-calendar h4,
  .client-work-calendar p {
    margin: 0;
  }

  .client-work-calendar h3 {
    font-size: 1rem;
  }

  .client-work-calendar__toolbar,
  .client-work-calendar__navigation,
  .client-work-calendar__project-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .client-work-calendar__toolbar p,
  .client-work-calendar__agenda p,
  .client-work-calendar__workers small {
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
  }

  .client-work-calendar__navigation a {
    display: inline-flex;
    min-height: var(--ja-target-min, 2.75rem);
    align-items: center;
    justify-content: center;
    padding: 0.35rem 0.65rem;
    border: 1px solid var(--ja-control-border, #67675f);
    border-radius: 0.5rem;
    color: var(--ja-text-primary, #20201d);
    font-weight: 750;
    text-decoration: none;
  }

  .client-work-calendar__navigation a:focus-visible,
  .client-work-calendar__day:focus-visible {
    outline: 3px solid var(--ja-focus-ring, #275dad);
    outline-offset: 2px;
  }

  .client-work-calendar__grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 0.2rem;
  }

  .client-work-calendar__weekday {
    overflow: hidden;
    padding: 0.25rem 0;
    color: var(--portal-muted, #67675f);
    font-size: 0.75rem;
    text-align: center;
    text-decoration: none;
  }

  .client-work-calendar__day {
    display: grid;
    min-width: 0;
    min-height: 3.25rem;
    align-content: center;
    justify-items: center;
    gap: 0.15rem;
    padding: 0.2rem 0.1rem;
    border: 1px solid var(--ja-control-border, #67675f);
    border-radius: 0.45rem;
    background: var(--ja-surface, #fff);
    color: var(--ja-text-primary, #20201d);
    cursor: pointer;
  }

  .client-work-calendar__day small {
    overflow: hidden;
    max-width: 100%;
    color: var(--portal-muted, #67675f);
    font-size: 0.65rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .client-work-calendar__day.outside-month {
    opacity: 0.7;
  }

  .client-work-calendar__day.selected {
    border-color: var(--ja-focus-ring, #275dad);
    box-shadow: inset 0 0 0 1px var(--ja-focus-ring, #275dad);
  }

  .client-work-calendar__projects,
  .client-work-calendar__workers {
    display: grid;
    gap: 0.45rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .client-work-calendar__projects > li {
    min-width: 0;
    padding: 0.6rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.5rem;
  }

  .client-work-calendar__project-heading strong:first-child {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .client-work-calendar__workers {
    margin-top: 0.45rem;
  }

  .client-work-calendar__workers li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.1rem 0.5rem;
    padding-top: 0.35rem;
    border-top: 1px solid var(--portal-border, #dfdedc);
  }

  .client-work-calendar__workers li > span:first-child {
    overflow-wrap: anywhere;
    font-weight: 700;
  }

  .client-work-calendar__workers small {
    grid-column: 1 / -1;
  }
</style>
