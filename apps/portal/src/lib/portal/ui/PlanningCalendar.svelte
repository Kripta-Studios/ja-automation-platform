<script lang="ts">
  import { untrack } from 'svelte';
  import {
    calendarDate,
    calendarMonthDays,
    eventsOnCalendarDate,
    shiftCalendarMonth,
    type PlanningEvent,
  } from '../calendar';

  let {
    events,
    translate,
    locale = 'en-US',
    onselectdate,
    onselectevent,
    initialDate,
    headingLevel = 2,
  }: {
    events: PlanningEvent[];
    translate: (text: string) => string;
    locale?: string;
    onselectdate?: (date: string) => void;
    onselectevent?: (event: PlanningEvent) => void;
    initialDate?: string;
    headingLevel?: 2 | 3;
  } = $props();

  const today = calendarDate(new Date());
  let selected = $state(untrack(() => calendarDate(initialDate ?? today)));
  let month = $state(untrack(() => selected));
  const days = $derived(
    calendarMonthDays(month).map((day) => ({
      ...day,
      count: eventsOnCalendarDate(events, day.date).length,
    })),
  );
  const agenda = $derived(eventsOnCalendarDate(events, selected));
  const monthLabel = $derived(formatDate(month, { month: 'long', year: 'numeric' }));
  const selectedLabel = $derived(formatDate(selected, { dateStyle: 'full' }));
  const weekdays = $derived(
    calendarMonthDays('2026-06-01')
      .slice(0, 7)
      .map((day) => ({
        short: formatDate(day.date, { weekday: 'short' }),
        full: formatDate(day.date, { weekday: 'long' }),
      })),
  );

  function formatDate(value: string, options: Intl.DateTimeFormatOptions) {
    const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)
      ? `${value}Z`
      : value;
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
      new Date(timestamp),
    );
  }

  function selectDate(date: string) {
    selected = date;
    month = date;
    onselectdate?.(date);
  }

  function moveMonth(amount: number) {
    month = shiftCalendarMonth(month, amount);
    selected = month;
  }

  function eventPeriod(event: PlanningEvent) {
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    const display = (value: string) =>
      formatDate(
        value,
        value.includes('T') ? { ...options, hour: '2-digit', minute: '2-digit' } : options,
      );
    return `${display(event.startsAt)}${event.endsAt ? ` – ${display(event.endsAt)}` : ''}`;
  }
</script>

<section class="planning-calendar" data-ui="planning-calendar" aria-label={translate('Calendar')}>
  <div class="calendar-toolbar">
    <svelte:element this={`h${headingLevel}`} class="calendar-month" aria-live="polite"
      >{monthLabel}</svelte:element
    >
    <nav aria-label={translate('Calendar navigation')}>
      <button type="button" aria-label={translate('Previous month')} onclick={() => moveMonth(-1)}
        >←</button
      >
      <button type="button" onclick={() => selectDate(today)}>{translate('Today')}</button>
      <button type="button" aria-label={translate('Next month')} onclick={() => moveMonth(1)}
        >→</button
      >
    </nav>
  </div>
  <p class="calendar-hint">
    {translate('Select a day to see its agenda.')}
    {translate('Times shown in UTC.')}
  </p>
  <div class="calendar-grid" aria-label={monthLabel}>
    {#each weekdays as weekday}
      <abbr class="weekday" title={weekday.full}>{weekday.short}</abbr>
    {/each}
    {#each days as day (day.date)}
      <button
        type="button"
        class="calendar-day"
        class:outside-month={!day.inMonth}
        class:today={day.date === today}
        class:selected={day.date === selected}
        aria-current={day.date === today ? 'date' : undefined}
        aria-pressed={day.date === selected}
        aria-label={`${formatDate(day.date, { dateStyle: 'full' })} · ${translate('Events')}: ${day.count}`}
        onclick={() => selectDate(day.date)}
      >
        <span>{Number(day.date.slice(-2))}</span>
        <span class="event-count" aria-hidden="true">{day.count || '·'}</span>
      </button>
    {/each}
  </div>
  <div class="calendar-agenda">
    <svelte:element this={`h${headingLevel + 1}`} class="agenda-date" aria-live="polite"
      >{selectedLabel}</svelte:element
    >
    {#if agenda.length}
      <ul>
        {#each agenda as event (event.id)}
          <li data-tone={event.tone ?? 'neutral'}>
            {#if onselectevent}
              <button class="agenda-event" type="button" onclick={() => onselectevent?.(event)}>
                <strong>{event.title}</strong><span>{eventPeriod(event)}</span>
              </button>
            {:else if event.href}
              <a class="agenda-event" href={event.href}>
                <strong>{event.title}</strong><span>{eventPeriod(event)}</span>
              </a>
            {:else}
              <div class="agenda-event">
                <strong>{event.title}</strong><span>{eventPeriod(event)}</span>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p role="status">{translate('No events on this day.')}</p>
    {/if}
  </div>
</section>

<style>
  .planning-calendar {
    min-width: 0;
    color: var(--ja-text-primary);
  }
  .calendar-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.65rem;
  }
  .calendar-month,
  .agenda-date {
    margin: 0;
    font-size: 1rem;
    line-height: 1.5;
  }
  .calendar-toolbar nav {
    display: flex;
    gap: 0.35rem;
  }
  .calendar-toolbar button {
    min-width: 44px;
    min-height: 44px;
    padding: 0.45rem 0.65rem;
  }
  button {
    border: 1px solid var(--ja-control-border);
    border-radius: var(--ja-control-radius);
    background: var(--ja-surface);
    color: var(--ja-text-primary);
    cursor: pointer;
  }
  button:hover,
  a.agenda-event:hover {
    background: var(--ja-surface-raised);
  }
  button:focus-visible,
  a:focus-visible {
    outline: 3px solid var(--ja-focus-ring);
    outline-offset: 2px;
  }
  .calendar-hint {
    color: var(--ja-text-secondary);
    font-size: 0.875rem;
    margin: 0.75rem 0;
  }
  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(44px, 1fr));
    gap: 1px;
    overflow-x: auto;
  }
  .weekday {
    padding: 0.35rem 0;
    text-align: center;
    color: var(--ja-text-secondary);
    text-decoration: none;
    font-size: 0.75rem;
    overflow: hidden;
  }
  .calendar-day {
    width: 100%;
    margin-top: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 48px;
    padding: 0.2rem 0;
    line-height: 1.15;
    font-size: 0.875rem;
    border-color: var(--ja-border-strong);
    box-shadow: none;
  }
  .calendar-day.outside-month {
    background: var(--ja-surface-raised);
    color: var(--ja-text-secondary);
  }
  .calendar-day.today {
    text-decoration: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 3px;
    border-color: var(--ja-primary);
  }
  .calendar-day.selected {
    background: var(--ja-primary);
    border-color: var(--ja-primary);
    color: white;
  }
  .event-count {
    font-size: 0.7rem;
    margin-top: 0.2rem;
    font-weight: 700;
  }
  .calendar-agenda {
    margin-top: 1rem;
    border-top: 1px solid var(--ja-border-strong);
    padding-top: 0.85rem;
  }
  .calendar-agenda ul {
    display: grid;
    gap: 0.5rem;
    list-style: none;
    margin: 0.65rem 0 0;
    padding: 0;
  }
  .calendar-agenda li {
    min-width: 0;
    border-left: 4px solid var(--ja-text-muted);
  }
  li[data-tone='info'] {
    border-left-color: var(--ja-status-info);
  }
  li[data-tone='success'] {
    border-left-color: var(--ja-status-success);
  }
  li[data-tone='warning'] {
    border-left-color: var(--ja-status-warning);
  }
  li[data-tone='danger'] {
    border-left-color: var(--ja-status-danger);
  }
  .agenda-event {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
    width: 100%;
    min-height: 44px;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--ja-border-strong);
    border-radius: 0 var(--ja-control-radius) var(--ja-control-radius) 0;
    background: var(--ja-surface);
    text-align: left;
    color: var(--ja-text-primary);
    white-space: normal;
    overflow-wrap: anywhere;
    text-decoration: none;
  }
  a.agenda-event strong,
  button.agenda-event strong {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .agenda-event span {
    font-size: 0.8rem;
    color: var(--ja-text-secondary);
  }
  .calendar-agenda p {
    color: var(--ja-text-secondary);
  }
</style>
