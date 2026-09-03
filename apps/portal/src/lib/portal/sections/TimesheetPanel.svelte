<script lang="ts">
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
    <form class="timesheet-period" method="GET" action={`${base}/app/time`}>
      <label>{translate('Week of')}<input name="week" type="date" value={data.weekStart} /></label>
      <button type="submit">{translate('Open week')}</button>
    </form>
  </div>
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
            <th scope="row">{day.label}<small>{day.date}</small></th>
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
              {translate('pending')} · {money(
                data.weeklyPay.estimatedApprovedMinor,
                data.weeklyPay.currency,
              )}
              {translate('approved estimate')}
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
