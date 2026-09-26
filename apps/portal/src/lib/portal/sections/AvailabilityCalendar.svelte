<script lang="ts">
  import { enhance } from '$app/forms';
  import { base } from '$app/paths';
  import type { SubmitFunction } from '@sveltejs/kit';
  import PlanningCalendar from '../ui/PlanningCalendar.svelte';
  import { ProblemNotice, ResponsiveSheet, formValidation, reportFormFieldErrors } from '../ui';
  import type { PortalActionResult, PortalRow } from '../portal-data';
  import type { ProblemData } from '$lib/problem/contract';
  import { normalizePortalLocale, portalText } from '$lib/portal-i18n';
  import { onMount, tick, untrack } from 'svelte';

  let {
    records,
    workerId,
    currentUserId,
    readOnly = false,
    translate,
    locale,
    form,
  }: {
    records: PortalRow[];
    workerId: string;
    currentUserId: string;
    readOnly?: boolean;
    translate: (key: string) => string;
    locale: string;
    form?: PortalActionResult;
  } = $props();
  type AvailabilityFailure = ProblemData & {
    success?: boolean;
    operation?: string;
    values?: Record<string, unknown>;
  };
  const submitted = $derived.by(() => {
    const result = form as AvailabilityFailure | null | undefined;
    return result?.success === false &&
      result.operation === 'setAvailability' &&
      String(result.values?.workerId ?? '') === workerId
      ? result
      : null;
  });
  const initialFailure = untrack(() => submitted);
  let dismissedProblemId = $state('');
  let enhancedProblem = $state<AvailabilityFailure | null>(null);
  const problem = $derived.by(() => {
    const result = enhancedProblem ?? submitted;
    return result?.code && result.correlationId !== dismissedProblemId ? result : null;
  });
  let open = $state(Boolean(initialFailure));
  let editing = $state<PortalRow | null>(
    untrack(() =>
      initialFailure?.values?.id
        ? (records.find((row) => String(row.id) === String(initialFailure.values?.id)) ?? null)
        : null,
    ),
  );
  let startsAt = $state(String(initialFailure?.values?.startsAt ?? '').slice(0, 16));
  let endsAt = $state(String(initialFailure?.values?.endsAt ?? '').slice(0, 16));
  let availability = $state(String(initialFailure?.values?.availability ?? 'available'));
  let note = $state(String(initialFailure?.values?.note ?? ''));
  let editorForm: HTMLFormElement | undefined = $state();
  type AvailabilityScrollSnapshot = {
    top: number;
    sheetTop: number;
    path: string;
    recordId: string;
    at: number;
  };
  const scrollKey = () => `ja-workforce-scroll:${currentUserId}:setAvailability:${workerId}`;
  let pendingNativeSave = false;
  let pendingSaveSource: 'submit' | 'formdata' | null = null;
  let scrollIntent = false;
  let scrollIntentCount = 0;
  function sheetBody(): HTMLElement | null {
    return editorForm?.closest<HTMLElement>('.responsive-sheet-body') ?? null;
  }
  function rememberScroll(): void {
    if (!editorForm) return;
    const snapshot: AvailabilityScrollSnapshot = {
      top: window.scrollY,
      sheetTop: sheetBody()?.scrollTop ?? 0,
      path: location.pathname,
      recordId: editorForm.querySelector<HTMLInputElement>('input[name="id"]')?.value ?? '',
      at: Date.now(),
    };
    try {
      sessionStorage.setItem(scrollKey(), JSON.stringify(snapshot));
    } catch {
      // Storage may be unavailable; the form remains usable with its fragment anchor.
    }
  }
  function forgetScroll(): void {
    try {
      sessionStorage.removeItem(scrollKey());
    } catch {
      // Storage may be unavailable.
    }
  }
  function restoreScroll(recordId: string): void {
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(scrollKey());
      sessionStorage.removeItem(scrollKey());
    } catch {
      return;
    }
    if (!saved) return;
    let snapshot: Partial<AvailabilityScrollSnapshot>;
    try {
      snapshot = JSON.parse(saved) as Partial<AvailabilityScrollSnapshot>;
    } catch {
      return;
    }
    if (
      snapshot.path !== location.pathname ||
      snapshot.recordId !== recordId ||
      typeof snapshot.top !== 'number' ||
      !Number.isFinite(snapshot.top) ||
      typeof snapshot.sheetTop !== 'number' ||
      !Number.isFinite(snapshot.sheetTop) ||
      typeof snapshot.at !== 'number' ||
      Date.now() - snapshot.at > 300_000
    )
      return;
    const top = snapshot.top;
    const sheetTop = snapshot.sheetTop;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (scrollIntent) return;
        window.scrollTo({ top, behavior: 'auto' });
        const body = sheetBody();
        if (body) body.scrollTop = sheetTop;
      }),
    );
  }
  onMount(() => {
    if (!submitted) forgetScroll();
    const markScrollIntent = () => {
      scrollIntent = true;
      scrollIntentCount += 1;
    };
    const markKeyScrollIntent = (event: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key))
        markScrollIntent();
    };
    const captureSubmit = (event: Event) => {
      if (event.target !== editorForm) return;
      pendingNativeSave = true;
      pendingSaveSource = 'submit';
      rememberScroll();
    };
    const captureFormData = (event: Event) => {
      if (event.target !== editorForm || !editorForm) return;
      if (pendingNativeSave && pendingSaveSource === 'submit') return;
      pendingNativeSave = true;
      pendingSaveSource = 'formdata';
      rememberScroll();
    };
    const capturePageHide = () => {
      if (!pendingNativeSave) return;
      try {
        if (!sessionStorage.getItem(scrollKey())) rememberScroll();
      } catch {
        // The pre-navigation snapshot already failed to persist.
      }
    };
    document.addEventListener('submit', captureSubmit, true);
    document.addEventListener('formdata', captureFormData, true);
    window.addEventListener('pagehide', capturePageHide);
    window.addEventListener('wheel', markScrollIntent, { passive: true });
    window.addEventListener('touchmove', markScrollIntent, { passive: true });
    window.addEventListener('keydown', markKeyScrollIntent, true);
    return () => {
      document.removeEventListener('submit', captureSubmit, true);
      document.removeEventListener('formdata', captureFormData, true);
      window.removeEventListener('pagehide', capturePageHide);
      window.removeEventListener('wheel', markScrollIntent);
      window.removeEventListener('touchmove', markScrollIntent);
      window.removeEventListener('keydown', markKeyScrollIntent, true);
    };
  });
  let reportedProblemId = '';
  const bindingId = $derived(String(problem?.values?.id ?? editing?.id ?? ''));
  const bindingVersion = $derived(String(problem?.values?.version ?? editing?.version ?? ''));
  const t = (key: string) => portalText(normalizePortalLocale(locale), key);
  const remedyLinks = $derived({
    review_availability: {
      label: t('problem.remedy.reviewAvailability'),
      href: `${base}/app/profile?worker=${encodeURIComponent(workerId)}#availability-calendar`,
    },
    review_availability_fields: { label: t('problem.remedy.reviewAvailabilityDates') },
    contact_project_owner: { label: t('problem.remedy.contactProjectOwner') },
    contact_owner: { label: t('problem.remedy.contactOwner') },
    sign_in_again: { label: t('problem.remedy.signInAgain'), href: `${base}/app/login` },
  });
  $effect(() => {
    if (!problem?.correlationId || problem.correlationId === reportedProblemId) return;
    reportedProblemId = problem.correlationId;
    const fieldErrors = problem.fieldErrors;
    void tick().then(() => {
      if (editorForm && Object.keys(fieldErrors).length)
        reportFormFieldErrors(editorForm, fieldErrors);
      const target =
        editorForm?.querySelector<HTMLElement>('[data-validation-summary]') ??
        editorForm?.querySelector<HTMLElement>('[data-ui="problem-notice"]');
      target?.focus({ preventScroll: true });
      if (submitted?.correlationId === problem.correlationId)
        restoreScroll(String(submitted.values?.id ?? ''));
    });
  });
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
    dismissedProblemId = problem?.correlationId ?? '';
    enhancedProblem = null;
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
    dismissedProblemId = problem?.correlationId ?? '';
    enhancedProblem = null;
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
    const scrollY = window.scrollY;
    const sheetScrollY = sheetBody()?.scrollTop ?? 0;
    const intentAtSubmit = scrollIntentCount;
    return async ({ result, update }) => {
      pending = false;
      pendingNativeSave = false;
      pendingSaveSource = null;
      forgetScroll();
      if (result.type === 'success') {
        open = false;
        enhancedProblem = null;
      } else if (result.type === 'failure' && result.data && 'code' in result.data) {
        enhancedProblem = result.data as AvailabilityFailure;
      } else failed = true;
      await update({ reset: false });
      if (result.type !== 'success') {
        await tick();
        if (scrollIntentCount === intentAtSubmit) {
          window.scrollTo({ top: scrollY, behavior: 'auto' });
          const body = sheetBody();
          if (body) body.scrollTop = sheetScrollY;
        }
        const target =
          editorForm?.querySelector<HTMLElement>('[data-validation-summary]') ??
          editorForm?.querySelector<HTMLElement>('[data-ui="problem-notice"]');
        target?.focus({ preventScroll: true });
      }
    };
  };
</script>

<section
  id="availability-calendar"
  aria-label={translate('Availability calendar')}
  data-availability-calendar
>
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
  title={translate(bindingId ? 'Edit availability' : 'Add availability')}
  closeLabel={translate('Close')}
  onclose={() => {
    if (!pending) open = false;
  }}
>
  <form
    method="POST"
    action="?/setAvailability#availability-calendar"
    class="admin-form-grid availability-editor"
    bind:this={editorForm}
    use:formValidation
    use:enhance={save}
  >
    {#if problem}
      <ProblemNotice
        {problem}
        kind={problem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
        {remedyLinks}
      />
    {/if}
    <input type="hidden" name="workerId" value={workerId} />
    {#if bindingId}<input type="hidden" name="id" value={bindingId} /><input
        type="hidden"
        name="version"
        value={bindingVersion}
      />{/if}
    <p class="form-help">{translate('UTC time')}</p>
    <label
      >{translate('Starts')}<input
        type="datetime-local"
        name="startsAt"
        bind:value={startsAt}
        required
      /></label
    >
    <label
      >{translate('Ends')}<input
        type="datetime-local"
        name="endsAt"
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
    <input type="hidden" name="startsAt" value={startsAt ? `${startsAt}:00.000Z` : ''} />
    <input type="hidden" name="endsAt" value={endsAt ? `${endsAt}:00.000Z` : ''} />
    {#if failed && !problem}<p role="alert">
        {translate(
          'Availability could not be saved. Check the dates or reload if another person changed this window.',
        )}
      </p>{/if}
    <button type="submit" disabled={pending}
      >{translate(pending ? 'Saving…' : 'Save availability')}</button
    >
  </form>
</ResponsiveSheet>

<style>
  .admin-form-grid.availability-editor {
    grid-template-columns: minmax(0, 1fr);
  }

  .availability-editor input,
  .availability-editor select,
  .availability-editor textarea {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
</style>
