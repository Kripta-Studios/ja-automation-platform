<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import PlanningCalendar from '../ui/PlanningCalendar.svelte';
  import { ResponsiveSheet } from '../ui';
  import type { PortalRow } from '../portal-data';

  let {
    records,
    workerId,
    readOnly = false,
    translate,
    locale,
  }: {
    records: PortalRow[];
    workerId: string;
    readOnly?: boolean;
    translate: (key: string) => string;
    locale: string;
  } = $props();
  let open = $state(false);
  let editing = $state<PortalRow | null>(null);
  let startsAt = $state('');
  let endsAt = $state('');
  let availability = $state('available');
  let note = $state('');
  let pending = $state(false);
  let failed = $state(false);
  const stateLabel = (state: unknown) =>
    translate(
      state === 'unavailable' ? 'Unavailable' : state === 'tentative' ? 'Tentative' : 'Available',
    );
  const events = $derived(
    records.map((row) => ({
      id: String(row.id),
      title: `${stateLabel(row.availability)}${row.note ? ` · ${row.note}` : ''}`,
      startsAt: String(row.starts_at),
      endsAt: String(row.ends_at),
      tone:
        row.availability === 'unavailable'
          ? ('danger' as const)
          : row.availability === 'tentative'
            ? ('warning' as const)
            : ('success' as const),
    })),
  );
  function add(date: string) {
    editing = null;
    startsAt = `${date}T08:00`;
    endsAt = `${date}T16:00`;
    availability = 'available';
    note = '';
    failed = false;
    open = true;
  }
  function edit(id: string) {
    const row = records.find((item) => String(item.id) === id);
    if (!row) return;
    editing = row;
    startsAt = String(row.starts_at).slice(0, 16);
    endsAt = String(row.ends_at).slice(0, 16);
    availability = String(row.availability);
    note = String(row.note ?? '');
    failed = false;
    open = true;
  }
  const save: SubmitFunction = () => {
    pending = true;
    failed = false;
    return async ({ result, update }) => {
      pending = false;
      if (result.type === 'success') open = false;
      else failed = true;
      await update({ reset: false });
    };
  };
</script>

<section aria-label={translate('Availability calendar')} data-availability-calendar>
  <h3>{translate('Availability calendar')}</h3>
  <p class="form-help">
    {translate(
      'Choose a day to add availability. Open an existing window to edit it. Times are UTC.',
    )}
  </p>
  {#if !readOnly}<button
      type="button"
      class="secondary-button"
      onclick={() => add(new Date().toISOString().slice(0, 10))}
      >{translate('Add availability')}</button
    >{/if}
  <PlanningCalendar
    headingLevel={3}
    {events}
    {translate}
    {locale}
    onselectdate={readOnly ? undefined : add}
    onselectevent={readOnly ? undefined : (event) => edit(event.id)}
  />
  <p class="form-help">
    {translate('Showing the latest 200 availability windows for this person.')}
  </p>
</section>
<ResponsiveSheet
  {open}
  title={translate(editing ? 'Edit availability' : 'Add availability')}
  closeLabel={translate('Close')}
  onclose={() => {
    if (!pending) open = false;
  }}
>
  <form method="POST" action="?/setAvailability" class="admin-form-grid" use:enhance={save}>
    <input type="hidden" name="workerId" value={workerId} />
    {#if editing}<input type="hidden" name="id" value={String(editing.id)} /><input
        type="hidden"
        name="version"
        value={String(editing.version)}
      />{/if}
    <input type="hidden" name="startsAt" value={startsAt ? `${startsAt}:00.000Z` : ''} />
    <input type="hidden" name="endsAt" value={endsAt ? `${endsAt}:00.000Z` : ''} />
    <p class="form-help">{translate('UTC time')}</p>
    <label
      >{translate('Starts')}<input type="datetime-local" bind:value={startsAt} required /></label
    >
    <label
      >{translate('Ends')}<input
        type="datetime-local"
        bind:value={endsAt}
        min={startsAt}
        required
      /></label
    >
    <label
      >{translate('Availability')}<select name="availability" bind:value={availability} required>
        <option value="available">{translate('Available')}</option><option value="unavailable"
          >{translate('Unavailable')}</option
        ><option value="tentative">{translate('Tentative')}</option>
      </select></label
    >
    <label
      >{translate('Note')}<textarea name="note" rows="3" maxlength="1000" bind:value={note}
      ></textarea></label
    >
    {#if failed}<p role="alert">
        {translate(
          'Availability could not be saved. Check the dates or reload if another person changed this window.',
        )}
      </p>{/if}
    <button type="submit" disabled={pending}
      >{translate(pending ? 'Saving…' : 'Save availability')}</button
    >
  </form>
</ResponsiveSheet>
