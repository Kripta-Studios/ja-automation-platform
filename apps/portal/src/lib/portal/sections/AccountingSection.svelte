<script lang="ts">
  import RecordBrowser from '../ui/RecordBrowser.svelte';
  import { invalidateAll } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount, tick } from 'svelte';
  import type { PortalLocale } from '../../portal-i18n';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import AccountingPackArtifactStatus from '../ui/localized-pdf/AccountingPackArtifactStatus.svelte';
  import type { PortalData } from '../portal-data';
  import { SectionCard } from '../ui';
  import ProblemNotice from '../ui/ProblemNotice.svelte';
  import { localizedServerFieldMessage } from '../ui/form-validation';
  import type { ProblemData } from '../../problem/contract';

  type Props = {
    data: PortalData;
    isAuditor: boolean;
    locale: PortalLocale;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
  };

  let { data, isAuditor, locale, translate, controlledValue }: Props = $props();

  type PackActionForm = {
    success?: boolean;
    billingOperation?: unknown;
    values?: unknown;
    code?: unknown;
    messageKey?: unknown;
    params?: unknown;
    fieldErrors?: unknown;
    remedies?: unknown;
    correlationId?: unknown;
  } | null;
  const actionForm = $derived($page.form as PackActionForm);
  const packProblem = $derived.by((): ProblemData | null => {
    if (
      actionForm?.success !== false ||
      !['createAccountingPack', 'finalizeAccountingPack'].includes(
        String(actionForm.billingOperation),
      ) ||
      typeof actionForm.code !== 'string' ||
      typeof actionForm.messageKey !== 'string'
    )
      return null;
    return {
      code: actionForm.code,
      messageKey: actionForm.messageKey as ProblemData['messageKey'],
      params:
        actionForm.params && typeof actionForm.params === 'object'
          ? (actionForm.params as ProblemData['params'])
          : {},
      fieldErrors:
        actionForm.fieldErrors && typeof actionForm.fieldErrors === 'object'
          ? (actionForm.fieldErrors as ProblemData['fieldErrors'])
          : {},
      remedies: Array.isArray(actionForm.remedies)
        ? (actionForm.remedies as ProblemData['remedies'])
        : [],
      correlationId: String(actionForm.correlationId ?? ''),
    };
  });
  const packValues = $derived.by((): Record<string, string> => {
    const values = actionForm?.values;
    return values && typeof values === 'object' && !Array.isArray(values)
      ? Object.fromEntries(
          Object.entries(values).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : {};
  });
  const createPackProblem = $derived(
    actionForm?.billingOperation === 'createAccountingPack' ? packProblem : null,
  );
  const finalizePackProblem = $derived(
    actionForm?.billingOperation === 'finalizeAccountingPack' ? packProblem : null,
  );
  const packRemedyLinks = $derived({
    review_accounting_pack: {
      label: translate('Review accounting pack'),
      href: '#accounting-register',
    },
    review_billing_setup: {
      label: translate('Review billing setup'),
      href: `${base}/app/billing?view=setup`,
    },
    contact_finance: { label: translate('Contact a finance administrator') },
    contact_owner: { label: translate('Contact an owner') },
  });
  const createPackErrors = $derived.by(() => {
    if (!createPackProblem) return [];
    return [
      { name: 'periodStart', label: 'Period start' },
      { name: 'periodEnd', label: 'Period end' },
      { name: 'reportLocale', label: 'Report language' },
    ].flatMap(({ name, label }) => {
      const raw = createPackProblem.fieldErrors[name]?.[0];
      return raw ? [{ name, label, message: localizedServerFieldMessage(locale, raw) }] : [];
    });
  });
  function createPackError(name: string): string | undefined {
    return createPackErrors.find((field) => field.name === name)?.message;
  }
  let focusedPackProblemId = '';
  let focusedFinalizeProblemId = '';
  let restoredPackScrollId = '';
  let packScrollIntent = false;
  let packRecoveryFocusId = $state('');
  type PackScrollOperation = 'createAccountingPack' | 'finalizeAccountingPack';
  type PackScrollSnapshot = {
    top: number;
    path: string;
    operation: PackScrollOperation;
    packId: string;
    at: number;
  };
  const packScrollKey = () => `ja-accounting-pack-scroll:${data.user.id}`;
  function readPackScroll(operation: PackScrollOperation, packId: string): number | null {
    let saved: string | null;
    try {
      saved = sessionStorage.getItem(packScrollKey());
      sessionStorage.removeItem(packScrollKey());
    } catch {
      return null;
    }
    if (!saved) return null;
    let snapshot: Partial<PackScrollSnapshot>;
    try {
      snapshot = JSON.parse(saved) as Partial<PackScrollSnapshot>;
    } catch {
      return null;
    }
    const valid =
      snapshot.path === location.pathname &&
      snapshot.operation === operation &&
      (operation !== 'finalizeAccountingPack' || snapshot.packId === packId) &&
      typeof snapshot.top === 'number' &&
      Number.isSafeInteger(snapshot.top) &&
      snapshot.top >= 0 &&
      typeof snapshot.at === 'number' &&
      Date.now() - snapshot.at >= 0 &&
      Date.now() - snapshot.at < 300_000;
    if (!valid) return null;
    if (snapshot.packId) packRecoveryFocusId = snapshot.packId;
    return snapshot.top!;
  }
  onMount(() => {
    const markIntent = () => {
      packScrollIntent = true;
    };
    const markKeyIntent = (event: KeyboardEvent) => {
      if (
        ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ', 'Tab'].includes(
          event.key,
        )
      )
        markIntent();
    };
    window.addEventListener('wheel', markIntent, { passive: true });
    window.addEventListener('touchmove', markIntent, { passive: true });
    window.addEventListener('pointerdown', markIntent, { passive: true });
    window.addEventListener('keydown', markKeyIntent, true);
    return () => {
      window.removeEventListener('wheel', markIntent);
      window.removeEventListener('touchmove', markIntent);
      window.removeEventListener('pointerdown', markIntent);
      window.removeEventListener('keydown', markKeyIntent, true);
    };
  });
  function rememberPackScroll(form: HTMLFormElement) {
    const input = form.elements.namedItem('viewportScrollY') as HTMLInputElement | null;
    const operation: PackScrollOperation = form
      .getAttribute('action')
      ?.includes('finalizeAccountingPack')
      ? 'finalizeAccountingPack'
      : 'createAccountingPack';
    const packId =
      form.querySelector<HTMLInputElement>('input[name="packId"]')?.value ??
      form.dataset.packId ??
      '';
    let pending = false;
    const capture = () => {
      const viewport = Math.max(0, Math.round(window.scrollY));
      if (input) input.value = String(viewport);
      return viewport;
    };
    const remember = (top: number) => {
      try {
        sessionStorage.setItem(
          packScrollKey(),
          JSON.stringify({
            top,
            path: location.pathname,
            operation,
            packId,
            at: Date.now(),
          } satisfies PackScrollSnapshot),
        );
      } catch {
        // The server-retained create scroll still works when storage is unavailable.
      }
    };
    capture();
    window.addEventListener('scroll', capture, { passive: true });
    const captureSubmit = () => {
      packScrollIntent = false;
      pending = true;
      remember(capture());
    };
    const captureFormData = (event: FormDataEvent) => {
      packScrollIntent = false;
      pending = true;
      const viewport = capture();
      event.formData.set('viewportScrollY', String(viewport));
      remember(viewport);
    };
    const capturePageHide = () => {
      if (!pending) return;
      try {
        if (!sessionStorage.getItem(packScrollKey())) remember(capture());
      } catch {
        // Keep the first pre-navigation snapshot when storage is unavailable.
      }
    };
    form.addEventListener('submit', captureSubmit, true);
    form.addEventListener('formdata', captureFormData);
    window.addEventListener('pagehide', capturePageHide);
    return {
      destroy() {
        window.removeEventListener('scroll', capture);
        form.removeEventListener('submit', captureSubmit, true);
        form.removeEventListener('formdata', captureFormData);
        window.removeEventListener('pagehide', capturePageHide);
      },
    };
  }
  $effect(() => {
    if (actionForm?.success !== true) return;
    try {
      sessionStorage.removeItem(packScrollKey());
    } catch {
      // Browser storage is optional for this recovery path.
    }
  });
  $effect(() => {
    const problem = createPackProblem ?? finalizePackProblem;
    const id = problem?.correlationId;
    if (!id || id === restoredPackScrollId) return;
    const operation: PackScrollOperation = createPackProblem
      ? 'createAccountingPack'
      : 'finalizeAccountingPack';
    const savedViewport = readPackScroll(operation, packValues.packId ?? '');
    const retainedViewport = String(packValues.viewportScrollY ?? '');
    const viewport = /^\d{1,7}$/.test(retainedViewport) ? Number(retainedViewport) : savedViewport;
    if (viewport === null || !Number.isSafeInteger(viewport) || viewport < 0) return;
    restoredPackScrollId = id;
    let active = true;
    let observer: ResizeObserver | undefined;
    const timers: number[] = [];
    const restore = () => {
      if (
        active &&
        (createPackProblem ?? finalizePackProblem)?.correlationId === id &&
        !packScrollIntent
      )
        window.scrollTo({ top: viewport, behavior: 'instant' });
    };
    void tick().then(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!active) return;
          restore();
          observer = new ResizeObserver(() => requestAnimationFrame(restore));
          observer.observe(document.body);
          for (const delay of [180, 450, 900]) timers.push(window.setTimeout(restore, delay));
          timers.push(window.setTimeout(() => observer?.disconnect(), 1_500));
        }),
      ),
    );
    return () => {
      active = false;
      observer?.disconnect();
      for (const timer of timers) window.clearTimeout(timer);
    };
  });
  $effect(() => {
    const id = createPackProblem?.correlationId;
    if (!id || id === focusedPackProblemId) return;
    focusedPackProblemId = id;
    void tick().then(() => {
      const target = document.querySelector<HTMLElement>(
        createPackErrors.length > 1
          ? '[data-accounting-pack-summary]'
          : createPackErrors.length === 1
            ? `#accounting-pack-${createPackErrors[0]?.name}`
            : '#accounting-generate [data-ui="problem-notice"]',
      );
      target?.focus({ preventScroll: true });
    });
  });
  $effect(() => {
    const id = finalizePackProblem?.correlationId;
    if (!id || id === focusedFinalizeProblemId) return;
    focusedFinalizeProblemId = id;
    void tick().then(() =>
      document
        .querySelector<HTMLElement>('[data-accounting-finalize-problem] [data-ui="problem-notice"]')
        ?.focus({ preventScroll: true }),
    );
  });

  $effect(() => {
    if (
      !(data.packs ?? []).some((pack) =>
        ['queued', 'running', 'processing'].includes(String(pack.state)),
      )
    )
      return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void invalidateAll();
    }, 2500);
    return () => clearInterval(timer);
  });
  const packs = $derived(data.packs ?? []);

  function previousCompleteMonth(): { periodStart: string; periodEnd: string } {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    return {
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
    };
  }

  const packPeriod = previousCompleteMonth();

  function packState(pack: Record<string, unknown>): string {
    return String(pack.state ?? 'pending').toLowerCase();
  }

  function stateCount(state: string): number {
    return packs.filter((pack) => packState(pack) === state).length;
  }
  let packPage = $state<typeof packs>([]);
  let packFilter = $state('');
  function filterPacks(status: string) {
    packFilter = status;
    document.getElementById('accounting-register')?.scrollIntoView({ block: 'start' });
  }
</script>

<div class="accounting-section" data-ui="accounting-section">
  <header class="accounting-section__context">
    <div>
      <p class="accounting-section__eyebrow">{translate('Finance operations')}</p>
      <h2>{translate('Accounting')}</h2>
      <p>
        {translate(
          'Create a reviewable Accounting Pack and follow each artifact until it is ready, failed or queued for automatic processing.',
        )}
      </p>
    </div>
  </header>

  {#if finalizePackProblem}
    <div data-accounting-finalize-problem>
      <ProblemNotice
        problem={finalizePackProblem}
        kind={finalizePackProblem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
        remedyLinks={packRemedyLinks}
      />
    </div>
  {/if}

  <div
    class="accounting-section__attention"
    aria-label={translate('Accounting Pack attention summary')}
  >
    <button type="button" aria-pressed={packFilter === ''} onclick={() => filterPacks('')}>
      <span>{translate('Packs')}</span>
      <strong>{packs.length}</strong>
      <small>{translate('Immutable period registers')}</small>
    </button>
    <button
      type="button"
      aria-pressed={packFilter === 'queued'}
      onclick={() => filterPacks('queued')}
    >
      <span>{translate('Queued')}</span>
      <strong>{stateCount('queued')}</strong>
      <small>{translate('Automatic artifact processing pending')}</small>
    </button>
    <button
      type="button"
      aria-pressed={packFilter === 'failed'}
      onclick={() => filterPacks('failed')}
    >
      <span>{translate('Failed')}</span>
      <strong>{stateCount('failed')}</strong>
      <small>{translate('Independent artifact retry may be available')}</small>
    </button>
    <button
      type="button"
      aria-pressed={packFilter === 'ready'}
      onclick={() => filterPacks('ready')}
    >
      <span>{translate('Ready')}</span>
      <strong>{stateCount('ready')}</strong>
      <small>{translate('Available for review, finalization or download')}</small>
    </button>
  </div>

  {#if !isAuditor}
    <SectionCard
      id="accounting-generate"
      title={translate('Generate monthly Accounting Pack')}
      collapsible
      expanded={Boolean(createPackProblem)}
      class="accounting-section__create"
    >
      {#if createPackProblem}
        <ProblemNotice
          problem={createPackProblem}
          kind={createPackProblem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
          remedyLinks={packRemedyLinks}
        />
      {/if}
      <form
        method="POST"
        action="?/createAccountingPack"
        class="accounting-section__form"
        use:rememberPackScroll
        use:enhance
      >
        <input type="hidden" name="viewportScrollY" value="0" />
        <p>
          {translate(
            'The pack contains invoice register, collections, worker/direct costs, expenses, accounts receivable, contribution, source counts and deterministic artifacts.',
          )}
        </p>
        <p>
          {translate(
            'The previous complete month is filled in. Change the dates only if you need another range.',
          )}
        </p>
        {#if createPackErrors.length > 1}
          <div data-ui="validation-summary" data-accounting-pack-summary tabindex="-1" role="alert">
            <strong>{translate('Check the highlighted fields')}</strong>
            <ul>
              {#each createPackErrors as field (field.name)}
                <li>
                  <a href={`#accounting-pack-${field.name}`}
                    >{translate(field.label)}: {field.message}</a
                  >
                </li>
              {/each}
            </ul>
          </div>
        {/if}
        <div class="accounting-section__fields">
          <label>
            <span>{translate('Period start')}</span>
            <input
              id="accounting-pack-periodStart"
              name="periodStart"
              type="date"
              value={createPackProblem ? (packValues.periodStart ?? '') : packPeriod.periodStart}
              aria-invalid={Boolean(createPackError('periodStart'))}
              aria-describedby={createPackError('periodStart')
                ? 'accounting-pack-periodStart-error'
                : undefined}
              required
            />
            {#if createPackError('periodStart')}<small
                id="accounting-pack-periodStart-error"
                role="alert">{createPackError('periodStart')}</small
              >{/if}
          </label>
          <label>
            <span>{translate('Period end')}</span>
            <input
              id="accounting-pack-periodEnd"
              name="periodEnd"
              type="date"
              value={createPackProblem ? (packValues.periodEnd ?? '') : packPeriod.periodEnd}
              aria-invalid={Boolean(createPackError('periodEnd'))}
              aria-describedby={createPackError('periodEnd')
                ? 'accounting-pack-periodEnd-error'
                : undefined}
              required
            />
            {#if createPackError('periodEnd')}<small
                id="accounting-pack-periodEnd-error"
                role="alert">{createPackError('periodEnd')}</small
              >{/if}
          </label>
          <label>
            <span>{translate('Report language')}</span>
            <select
              id="accounting-pack-reportLocale"
              name="reportLocale"
              value={createPackProblem ? (packValues.reportLocale ?? 'en') : 'en'}
              aria-label={translate('Accounting Pack report language')}
              aria-invalid={Boolean(createPackError('reportLocale'))}
              aria-describedby={createPackError('reportLocale')
                ? 'accounting-pack-reportLocale-error'
                : undefined}
            >
              <option value="en">{translate('English')}</option>
              <option value="pt">{translate('Português (BR)')}</option>
              <option value="es">{translate('Spanish')}</option>
            </select>
            {#if createPackError('reportLocale')}<small
                id="accounting-pack-reportLocale-error"
                role="alert">{createPackError('reportLocale')}</small
              >{/if}
          </label>
        </div>
        <div class="accounting-section__actions">
          <button type="submit">{translate('Generate pack')}</button>
        </div>
      </form>
    </SectionCard>
  {/if}

  <p>
    {translate(
      'Generate creates files for reviewing a period. Finalize freezes the reviewed figures as a historical version; later corrections require a new version.',
    )}
  </p>
  <SectionCard
    id="accounting-register"
    title={translate('Accounting Pack register')}
    class="accounting-section__register"
  >
    <RecordBrowser
      rows={packs}
      bind:visible={packPage}
      bind:status={packFilter}
      focusId={packRecoveryFocusId}
      {translate}
      label="Accounting"
    />
    {#if packs.length > 0}
      <div class="accounting-section__packs" aria-live="polite">
        {#each packPage as pack}
          <AccountingPackArtifactStatus
            {pack}
            {isAuditor}
            {locale}
            {translate}
            {controlledValue}
            {rememberPackScroll}
            problem={finalizePackProblem && packValues.packId === String(pack.id)
              ? finalizePackProblem
              : null}
          />
        {/each}
      </div>
    {:else}
      <div class="accounting-section__empty" role="status">
        <strong>{translate('No Accounting Packs have been generated.')}</strong>
        <span
          >{translate('Generate a period pack when the source records are ready for review.')}</span
        >
      </div>
    {/if}
  </SectionCard>
</div>

<style>
  .accounting-section {
    overflow-anchor: none;
  }
  .accounting-section {
    display: grid;
    gap: 1.25rem;
  }

  .accounting-section__context {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
  }

  .accounting-section__eyebrow {
    margin: 0 0 0.35rem;
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .accounting-section__context h2 {
    margin: 0;
    color: var(--portal-ink, #20201d);
    font-size: clamp(1.55rem, 2vw, 2rem);
    letter-spacing: -0.025em;
  }

  .accounting-section__context p:last-child {
    max-width: 48rem;
    margin: 0.4rem 0 0;
    color: var(--portal-muted, #67675f);
  }

  .accounting-section__attention {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .accounting-section__attention button {
    text-align: left;
    cursor: pointer;
    display: grid;
    gap: 0.22rem;
    min-height: 6rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.75rem;
    background: var(--portal-surface, #fff);
  }

  .accounting-section__attention span,
  .accounting-section__attention small {
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
  }

  .accounting-section__attention strong {
    color: var(--portal-ink, #20201d);
    font-size: 1.45rem;
    font-variant-numeric: tabular-nums;
  }

  .accounting-section__form {
    display: grid;
    gap: 1rem;
  }

  .accounting-section__form > p {
    max-width: 60rem;
    margin: 0;
    color: var(--portal-muted, #67675f);
  }

  .accounting-section__fields {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .accounting-section__fields label {
    display: grid;
    gap: 0.35rem;
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    font-weight: 650;
  }

  .accounting-section__fields input,
  .accounting-section__fields select {
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--portal-border-strong, #c4c4bf);
    border-radius: 0.5rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #20201d);
    font: inherit;
  }

  .accounting-section__actions {
    display: flex;
    justify-content: flex-end;
  }

  .accounting-section__actions button {
    min-height: 2.75rem;
  }

  .accounting-section__packs {
    display: grid;
    gap: 0.9rem;
  }

  .accounting-section__empty {
    display: grid;
    gap: 0.3rem;
    padding: 1.25rem 0.5rem;
    text-align: center;
  }

  .accounting-section__empty span {
    color: var(--portal-muted, #67675f);
  }

  .accounting-section__fields input:focus-visible,
  .accounting-section__fields select:focus-visible,
  .accounting-section__actions button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--portal-accent, #53524c) 32%, transparent);
    outline-offset: 2px;
  }

  @media (max-width: 52rem) {
    .accounting-section__attention {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .accounting-section__fields {
      grid-template-columns: 1fr;
    }

    .accounting-section__actions,
    .accounting-section__actions button {
      width: 100%;
    }
  }

  @media (max-width: 36rem) {
    .accounting-section__attention {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .accounting-section * {
      scroll-behavior: auto;
    }
  }
</style>
