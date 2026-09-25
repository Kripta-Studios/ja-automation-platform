<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { datePresetRange } from '../ui/date-presets';
  import { base } from '$app/paths';
  import { TableRegion } from '../ui';
  import type { TableCardRow } from '../ui';
  import { categorySummary, hours, money, shiftWeek } from '../portal-format';
  import type { PortalData } from '../portal-data';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';

  let {
    data,
    isAuditor,
    translate,
    controlledValue,
  }: {
    data: PortalData;
    isAuditor: boolean;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
  } = $props();

  let currentWeek = $state('');
  onMount(() => {
    currentWeek = datePresetRange('week').from;
  });
  function weekHref(week: string): string {
    const params = new URLSearchParams($page.url.searchParams);
    params.set('week', week);
    // The selected week and register describe the same period after a week jump.
    params.set('from', week);
    params.set('to', shiftWeek(week, 6));
    params.delete('edit');
    params.delete('action');
    return `${base}/app/time?${params}#weekly-timesheet-title`;
  }
  const displayMinutes = (value: number | null | undefined): string =>
    value === null || value === undefined ? '—' : hours(value);
  const expectedTotal = (
    days: ReadonlyArray<{ expectedMinutes: number | null }> | undefined,
  ): number | null => {
    if (!days || days.length === 0 || days.some((day) => day.expectedMinutes === null)) return null;
    return days.reduce((sum, day) => sum + (day.expectedMinutes ?? 0), 0);
  };
  const differenceTotal = (
    days: ReadonlyArray<{ differenceMinutes: number | null }> | undefined,
  ): number | null => {
    if (!days || days.length === 0 || days.some((day) => day.differenceMinutes === null))
      return null;
    return days.reduce((sum, day) => sum + (day.differenceMinutes ?? 0), 0);
  };

  const differenceLabel = (value: number | null): string =>
    value === null ? '—' : `${value > 0 ? '+' : ''}${hours(value)}`;

  const categoryLabel = (category: string): string =>
    controlledValue('timeCategory', category) || translate(category.replaceAll('_', ' '));

  const summarizeCategories = (categories: Record<string, number>): string =>
    categorySummary(categories, categoryLabel);

  const timesheetCardRows = $derived.by((): TableCardRow[] =>
    (data.timesheet?.days ?? []).map((day) => ({
      id: day.date,
      href: `${base}/app/time?week=${encodeURIComponent(data.weekStart ?? '')}&from=${encodeURIComponent(day.date)}&to=${encodeURIComponent(day.date)}#time-records`,
      linkLabel: translate('Open day entries'),
      linkAriaLabel: `${translate('Open time entries for')} ${day.label} ${day.date}`,
      cells: [
        { label: translate('Day'), value: `${day.label} · ${day.date}` },
        { label: translate('Actual'), value: hours(day.actualMinutes) },
        { label: translate('Expected'), value: displayMinutes(day.expectedMinutes) },
        { label: translate('Difference'), value: differenceLabel(day.differenceMinutes) },
        {
          label: translate('Categories'),
          value: summarizeCategories(day.categories) || '—',
        },
        {
          label: translate('Status'),
          value: controlledValue('status', day.status) || translate(day.status),
        },
      ],
    })),
  );
</script>

<section class="timesheet-panel" aria-labelledby="weekly-timesheet-title">
  <div class="timesheet-heading">
    <div>
      <span class="portal-kicker">{translate('WEEKLY TIMESHEET')}</span>
      <h2 id="weekly-timesheet-title">{translate('Actual time, one week at a glance')}</h2>
      <p>
        {data.timesheet?.weekStart} → {data.timesheet?.weekEnd}. {translate(
          'Planning target only; it never creates time.',
        )}
      </p>
    </div>
    <form class="timesheet-period" method="GET" action={`${base}/app/time#weekly-timesheet-title`}>
      <label>{translate('Week of')}<input name="week" type="date" value={data.weekStart} /></label>
      <button type="submit">{translate('Open week')}</button>
    </form>
  </div>
  <nav class="timesheet-week-navigation" aria-label={translate('Week of')}>
    <a href={weekHref(shiftWeek(data.weekStart ?? '', -7))}>← {translate('Previous week')}</a>
    {#if currentWeek}<a
        href={weekHref(currentWeek)}
        aria-current={data.weekStart === currentWeek ? 'date' : undefined}
        >{translate('This week')}</a
      >{/if}
    <a href={weekHref(shiftWeek(data.weekStart ?? '', 7))}>{translate('Next week')} →</a>
  </nav>
  <div class="timesheet-guide" aria-label={translate('How to read this timesheet')}>
    <div>
      <strong>{translate('Actual')}</strong><span>{translate('Minutes you really recorded.')}</span>
    </div>
    <div>
      <strong>{translate('Expected')}</strong><span
        >{translate('Planning target only; it never creates time.')}</span
      >
    </div>
    <div>
      <strong>{translate('Difference')}</strong><span
        >{translate('Actual minus expected for the day.')}</span
      >
    </div>
    <div>
      <strong>{translate('Status')}</strong><span
        >{translate('Draft, submitted, approved or needs changes.')}</span
      >
    </div>
  </div>
  <TableRegion
    class="timesheet-table-wrap"
    mobileMode="cards"
    cardRows={timesheetCardRows}
    headingId="weekly-timesheet-title"
    label={translate('Timesheet table')}
    scrollInstruction={translate('Scroll horizontally to review all columns.')}
    detailsLabel={translate('Open details')}
  >
    <table class="timesheet-table">
      <caption class="visually-hidden"
        >{translate('Weekly actual time and approval status')}</caption
      >
      <thead>
        <tr>
          <th scope="col">{translate('Day')}</th>
          <th scope="col">{translate('Actual')}</th>
          <th scope="col">{translate('Expected')}</th>
          <th scope="col">{translate('Difference')}</th>
          <th scope="col">{translate('Categories')}</th>
          <th scope="col">{translate('Status')}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.timesheet?.days ?? [] as day}
          <tr
            class:timesheet-exception={day.status === 'Needs note' ||
              day.status === 'Needs changes'}
          >
            <th scope="row"
              ><a
                href={`${base}/app/time?week=${encodeURIComponent(data.weekStart ?? '')}&from=${encodeURIComponent(day.date)}&to=${encodeURIComponent(day.date)}#time-records`}
                >{day.label}<small>{day.date}</small></a
              ></th
            >
            <td>{hours(day.actualMinutes)}</td>
            <td>{displayMinutes(day.expectedMinutes)}</td>
            <td
              class:positive={day.differenceMinutes !== null && day.differenceMinutes > 0}
              class:negative={day.differenceMinutes !== null && day.differenceMinutes < 0}
            >
              {differenceLabel(day.differenceMinutes)}
            </td>
            <td>{summarizeCategories(day.categories) || '—'}</td>
            <td
              ><span class="timesheet-status"
                >{controlledValue('status', day.status) || translate(day.status)}</span
              ></td
            >
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">{translate('Actual')}</th>
          <td
            >{hours(data.timesheet?.days.reduce((sum, day) => sum + day.actualMinutes, 0) ?? 0)}</td
          >
          <td>{displayMinutes(expectedTotal(data.timesheet?.days))}</td>
          <td
            >{(() => {
              const difference = differenceTotal(data.timesheet?.days);
              return difference === null ? '—' : `${difference > 0 ? '+' : ''}${hours(difference)}`;
            })()}</td
          >
          <td colspan="2">
            {#if data.weeklyPay}
              {hours(data.weeklyPay.approvedMinutes)}
              {translate('approved')} · {hours(data.weeklyPay.pendingMinutes)}
              {translate('pending')}
              {#each data.weeklyPay.currencyBreakdown ?? [data.weeklyPay] as amount}
                · {money(amount.estimatedApprovedMinor, amount.currency)}
                {translate('approved estimate')}
              {/each}
            {:else}
              {translate('Review access is limited to operational time.')}
            {/if}
          </td>
        </tr>
      </tfoot>
    </table>
  </TableRegion>
  {#if !isAuditor}
    <details class="timesheet-copy">
      <summary>{translate('Copy previous week layout')}</summary>
      <div class="timesheet-copy-body">
        <p>
          {translate(
            'Copies projects, categories and activity labels into zero-minute drafts. It never copies time values.',
          )}
        </p>
        <form method="POST" action="?/copyTimeLayout">
          <input type="hidden" name="sourceWeekStart" value={shiftWeek(data.weekStart ?? '', -7)} />
          <input type="hidden" name="targetWeekStart" value={data.weekStart} />
          <button type="submit">{translate('Add this week’s layout')}</button>
        </form>
      </div>
    </details>
  {/if}
</section>

<style>
  #weekly-timesheet-title {
    scroll-margin-top: 5rem;
  }
  .timesheet-table th a {
    color: inherit;
    display: grid;
    gap: 0.15rem;
    text-decoration: none;
  }
  .timesheet-table th a:hover,
  .timesheet-table th a:focus-visible {
    color: var(--ja-teal, #706e66);
    text-decoration: underline;
    outline: 3px solid color-mix(in srgb, var(--ja-teal, #706e66) 25%, transparent);
    outline-offset: 2px;
  }

  .timesheet-week-navigation {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.75rem 0 1rem;
  }
  .timesheet-week-navigation a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--ja-control-border, #86877b);
    border-radius: 0.5rem;
    color: var(--ja-ink, #24251f);
    text-decoration: none;
    background: white;
    font-size: 0.875rem;
  }
  .timesheet-week-navigation a[aria-current] {
    background: var(--ja-canvas, #f6f6f1);
    font-weight: 600;
  }
  .timesheet-week-navigation a:focus-visible {
    outline: 2px solid var(--ja-accent, #2349b5);
    outline-offset: 3px;
  }
  @media print {
    .timesheet-week-navigation {
      display: none;
    }
  }
</style>
