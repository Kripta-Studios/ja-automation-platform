<script module lang="ts">
  export type AdvancedScope = {
    projectId: string;
    billingRuleId: string;
    periodStart: string;
    periodEnd: string;
  };
</script>

<script lang="ts">
  /**
   * One screen to create an invoice: project → dates → amount → Create invoice.
   * The amount is the canonical draft engine's dry run (server); this component never
   * calculates money, it only formats the minor units it receives.
   */
  import { onDestroy, onMount } from 'svelte';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import {
    lastCompletePeriodForCadence,
    periodForCadence,
    type BillingCadence,
  } from '@ja/billing-engine';
  import type { PortalLocale } from '../../portal-i18n';
  import { journeyMoney } from '../project-invoice-journey';
  import { billingReadinessMessageKey, billingReadinessReviewPath } from '../billing-readiness';
  import {
    quickInvoiceFormat,
    quickInvoiceText,
    quickInvoiceWarningText,
    type QuickInvoiceCopyKey,
  } from '../billing-quick-invoice-copy';
  import QuickInvoiceAttention, {
    type AttentionClient,
    type AttentionItem,
    type ExpenseRow,
    type RunResult,
  } from './QuickInvoiceAttention.svelte';

  type Stream = {
    id: string;
    streamType: string;
    cadence: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    anchorDate: string | null;
    monthlyCutoffDay: number | null;
    includeExpenses: boolean;
    currency: string;
    taxProfileName: string | null;
  };
  type Project = {
    id: string;
    number: string;
    name: string;
    status: string;
    client: string;
    currency: string;
    streams: Stream[];
    unbilledMinutes: number;
    unbilledFrom: string | null;
    lastInvoicedThrough: string | null;
    openFrom?: string | null;
    openThrough?: string | null;
  };
  type SplitPart = {
    poKey: string | null;
    purchaseNo: string | null;
    people: Array<{ workerId: string; name: string; minutes: number }>;
    sourceCount: number;
    subtotalMinor: string;
    taxMinor: string;
    totalMinor: string;
  };
  type Split = { parts: SplitPart[]; totalMinor: string; signature: string };
  type Issued = { invoiceId: string; number: string | null; totalMinor: string; purchaseNo: string | null };
  type Warning = {
    code: string;
    severity: 'blocker' | 'excluded' | 'issue' | 'info';
    count: number;
    minutes: number;
    fix: string | null;
    message?: string;
  };
  type Group = {
    kind: 'labor' | 'expense' | 'fee';
    label: string;
    detail: string;
    minutes: number;
    unitPriceMinor: string | null;
    amountMinor: string;
    count: number;
    workerId?: string;
    category?: string;
    unit?: string;
    workedMinutes?: number;
    overrideRate?: boolean;
    overrideHours?: boolean;
  };
  /** "Change for this invoice only" (sent with every preview/create/issue; never money math). */
  type PersonOverride = {
    workerId: string;
    category: string | null;
    rate?: string;
    rateMinor?: string | null;
    billedHours?: string;
    billedMinutes?: number | null;
  };
  type Overrides = {
    people: PersonOverride[];
    tax: { mode: 'profile'; taxProfileId: string } | { mode: 'exempt' } | null;
    purchaseNo: string | null;
  };
  type Entry = { ref: { type: 'time'; id: string; version: number }; date: string; minutes: number; state: string; summary: string };
  type Preview = {
    state: 'ready' | 'blocked' | 'empty' | 'existing';
    stream: Stream | null;
    alternatives: Stream[];
    periodStart: string;
    periodEnd: string;
    mode: 'period' | 'selection';
    currency: string;
    groups: Group[];
    subtotalMinor: string;
    taxMinor: string;
    totalMinor: string;
    taxProfileName: string | null;
    taxes: Array<{ name: string; basisPoints: number }>;
    purchaseNo: string | null;
    dueDate: string | null;
    paymentTermsDays: number | null;
    provisionalNumber: string | null;
    warnings: Warning[];
    existingInvoice: { id: string; state: string; number: string | null } | null;
    suggestedPeriod: { start: string; end: string } | null;
    issuerLegalEntityId: string | null;
    openDrafts: Array<{
      id: string;
      state: string;
      periodStart: string;
      periodEnd: string;
      totalMinor: string;
    }>;
    projected: {
      state: string;
      groups: Group[];
      subtotalMinor: string;
      taxMinor: string;
      totalMinor: string;
      includedPendingMinor: string;
      pendingCount: number;
      pendingMinutes: number;
    } | null;
    attention: AttentionItem[];
    expenseRows: ExpenseRow[];
    expenseRowsTotal: number;
    client: AttentionClient | null;
    capabilities: { canApprove: boolean; canCorrectHours?: boolean; role: string };
    overrides: Overrides | null;
    taxOptions: Array<{ id: string; name: string; basisPoints: number }>;
    streamTaxProfileId: string | null;
    split?: Split | null;
  };
  type PeriodChoice = { id: string; label: string; start: string; end: string };

  let {
    locale = 'en',
    role = '',
    initialProjectId = '',
    initialPeriodStart = '',
    initialPeriodEnd = '',
    initialBillingRuleId = '',
    replacement = false,
    replacesInvoiceId = '',
    translate,
    onAdvancedRecords,
  }: {
    locale?: PortalLocale;
    role?: string;
    initialProjectId?: string;
    initialPeriodStart?: string;
    initialPeriodEnd?: string;
    initialBillingRuleId?: string;
    replacement?: boolean;
    /** The voided invoice this one replaces (linked and audited on create/issue). */
    replacesInvoiceId?: string;
    translate: (value: string) => string;
    onAdvancedRecords?: (scope: AdvancedScope) => void;
  } = $props();

  const t = (key: QuickInvoiceCopyKey) => quickInvoiceText(locale, key);
  const api = `${base}/app/api/billing/quick-invoice`;

  let projects = $state<Project[]>([]);
  let projectsLoading = $state(true);
  let projectsFailed = $state(false);
  let query = $state('');
  let projectId = $state('');
  let choosingProject = $state(true);
  let choiceId = $state('');
  let periodStart = $state('');
  let periodEnd = $state('');
  let streamOverride = $state('');
  let preview = $state<Preview | null>(null);
  let previewLoading = $state(false);
  let previewFailed = $state(false);
  let creating = $state(false);
  let createMessage = $state('');
  let requestKey = $state(newKey());
  let issueOpen = $state(false);
  let issuing = $state(false);
  let fixing = $state(false);
  let purchaseNo = $state('');
  let issueMessage = $state('');
  let issueFailedInvoice = $state('');
  /** Unclassified expenses left out of this invoice (sent with every request). */
  let excludedExpenses = $state<string[]>([]);
  /** Split by PO: invoices issued (or drafts saved) in the last action. */
  let doneInvoices = $state<Issued[]>([]);
  let doneKind = $state<'issued' | 'drafts'>('issued');
  const noOverrides = (): Overrides => ({ people: [], tax: null, purchaseNo: null });
  let overrides = $state<Overrides>(noOverrides());
  /** Open "Change" panel of a labor line (`worker:category`) or 'tax'. */
  let editing = $state('');
  let edit = $state({
    rate: '',
    hours: '',
    scope: 'invoice' as 'invoice' | 'record',
    reason: '',
    entries: [] as Entry[],
    entryHours: {} as Record<string, string>,
    loading: false,
    error: '',
    saving: false,
  });
  let taxEdit = $state({
    choice: '',
    scope: 'invoice' as 'invoice' | 'fromPeriod',
    error: '',
    saving: false,
    note: '',
    newName: '',
    newPercent: '',
  });
  let controller: AbortController | null = null;
  // Opening a project tries its default dates; when nothing is billable there but approved,
  // unbilled work exists elsewhere, jump to the suggested dates (at most a few times).
  let autoPeriod = false;
  let autoVisited: string[] = [];
  let autoAdjusted = $state(false);
  let debounce: ReturnType<typeof setTimeout> | undefined;

  function newKey(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  const today = new Date().toISOString().slice(0, 10);
  const project = $derived(projects.find((candidate) => candidate.id === projectId) ?? null);
  const filteredProjects = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? projects.filter((candidate) =>
          `${candidate.number} ${candidate.name} ${candidate.client}`
            .toLowerCase()
            .includes(needle),
        )
      : projects;
    return list.slice(0, 12);
  });

  /** The stream whose terms apply today (or the newest one); used for period choices only. */
  function currentStream(candidate: Project | null): Stream | null {
    if (!candidate?.streams.length) return null;
    const order: Record<string, number> = { labor: 0, milestone: 1, expense: 2 };
    return (
      [...candidate.streams].sort(
        (a, b) =>
          Number(b.effectiveFrom <= today && (!b.effectiveTo || b.effectiveTo >= today)) -
            Number(a.effectiveFrom <= today && (!a.effectiveTo || a.effectiveTo >= today)) ||
          (order[a.streamType] ?? 9) - (order[b.streamType] ?? 9) ||
          b.effectiveFrom.localeCompare(a.effectiveFrom),
      )[0] ?? null
    );
  }

  function shiftDate(date: string, days: number): string {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }
  function monthRange(offset: number): { start: string; end: string } {
    const now = new Date(`${today}T00:00:00Z`);
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0));
    return { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) };
  }

  const periodChoices = $derived.by((): PeriodChoice[] => {
    const stream = currentStream(project);
    const cadence = (stream?.cadence ?? 'manual') as BillingCadence;
    const options = {
      anchorDate: stream?.anchorDate ?? undefined,
      monthlyCutoffDay: stream?.monthlyCutoffDay ?? undefined,
    };
    const choices: PeriodChoice[] = [];
    try {
      if (cadence === 'weekly') {
        const current = periodForCadence('weekly', today, options)!;
        const last = periodForCadence('weekly', shiftDate(current.start, -1), options)!;
        choices.push({ id: 'last', label: t('lastWeek'), ...last });
        choices.push({ id: 'current', label: t('thisWeek'), ...current });
      } else if (['every_14_days', 'semi_monthly'].includes(cadence)) {
        const last = lastCompletePeriodForCadence(cadence, today, options);
        const current = periodForCadence(cadence, today, options);
        if (last) choices.push({ id: 'last', label: t('lastPeriod'), ...last });
        if (current) choices.push({ id: 'current', label: t('currentPeriod'), ...current });
      } else if (cadence === 'monthly') {
        const last = lastCompletePeriodForCadence(cadence, today, options);
        const current = periodForCadence(cadence, today, options);
        if (last) choices.push({ id: 'last', label: t('lastMonth'), ...last });
        if (current) choices.push({ id: 'current', label: t('thisMonth'), ...current });
      } else {
        // On-demand billing: everything since the last invoice, through today.
        const effectiveFrom = stream?.effectiveFrom ?? project?.unbilledFrom ?? today;
        let sinceStart = project?.lastInvoicedThrough
          ? shiftDate(project.lastInvoicedThrough, 1)
          : effectiveFrom;
        // Late entries dated before the last invoice, and logged future days, are included.
        if (project?.openFrom && project.openFrom < sinceStart) sinceStart = project.openFrom;
        const start = sinceStart < effectiveFrom ? effectiveFrom : sinceStart;
        const end = project?.openThrough && project.openThrough > today ? project.openThrough : today;
        if (start <= end) choices.push({ id: 'since', label: t('sinceLast'), start, end });
        choices.push({ id: 'last', label: t('lastMonth'), ...monthRange(-1) });
        choices.push({ id: 'current', label: t('thisMonth'), ...monthRange(0) });
      }
    } catch {
      choices.push({ id: 'last', label: t('lastMonth'), ...monthRange(-1) });
      choices.push({ id: 'current', label: t('thisMonth'), ...monthRange(0) });
    }
    return choices;
  });

  function chooseProject(id: string): void {
    resetOverrides();
    excludedExpenses = [];
    doneInvoices = [];
    projectId = id;
    choosingProject = false;
    query = '';
    streamOverride = '';
    createMessage = '';
    const choice = periodChoices[0];
    if (choice) applyChoice(choice);
    else schedulePreview(0);
    autoPeriod = true;
    autoVisited = [];
  }

  function applyChoice(choice: PeriodChoice): void {
    resetOverrides();
    autoPeriod = false;
    autoAdjusted = false;
    choiceId = choice.id;
    periodStart = choice.start;
    periodEnd = choice.end;
    schedulePreview(0);
  }

  function applyCustom(): void {
    resetOverrides();
    autoPeriod = false;
    autoAdjusted = false;
    choiceId = 'custom';
    schedulePreview(400);
  }

  function useSuggested(range: { start: string; end: string }): void {
    autoPeriod = false;
    choiceId = 'custom';
    periodStart = range.start;
    periodEnd = range.end;
    schedulePreview(0);
  }

  function schedulePreview(delay: number): void {
    clearTimeout(debounce);
    debounce = setTimeout(() => void loadPreview(), delay);
  }

  async function loadPreview(): Promise<void> {
    if (!projectId || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd))
      return;
    if (periodEnd < periodStart) return;
    controller?.abort();
    const current = new AbortController();
    controller = current;
    previewLoading = true;
    previewFailed = false;
    const params = new URLSearchParams({ projectId, periodStart, periodEnd });
    if (streamOverride) params.set('billingRuleId', streamOverride);
    const sent = overridesPayload();
    if (sent) params.set('overrides', JSON.stringify(sent));
    if (excludedExpenses.length) params.set('excluded', excludedExpenses.join(','));
    try {
      const response = await fetch(`${api}?${params}`, {
        signal: current.signal,
        headers: { accept: 'application/json' },
      });
      const body = (await response.json()) as { success?: boolean; preview?: Preview; detail?: string };
      if (controller !== current) return;
      if (!response.ok && sent && lastGoodOverrides) {
        // An invoice-only change the engine refused (e.g. more than 1.5 × the hours worked):
        // keep the previous changes and say why.
        overrides = lastGoodOverrides;
        overrideError = body.detail ?? t('hoursInvalid');
        controller = null;
        previewLoading = false;
        void loadPreview();
        return;
      }
      if (!response.ok || !body.preview) throw new Error('preview failed');
      overrideError = '';
      syncOverrides(body.preview);
      const suggested = body.preview.suggestedPeriod;
      if (autoPeriod && body.preview.state === 'empty' && suggested) {
        autoVisited.push(`${periodStart}:${periodEnd}`);
        const key = `${suggested.start}:${suggested.end}`;
        if (!autoVisited.includes(key) && autoVisited.length <= 3) {
          choiceId = 'custom';
          periodStart = suggested.start;
          periodEnd = suggested.end;
          autoAdjusted = true;
          controller = null;
          previewLoading = false;
          void loadPreview();
          return;
        }
      }
      if (body.preview.state !== 'empty') autoPeriod = false;
      preview = body.preview;
      requestKey = newKey();
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      if (controller === current) {
        previewFailed = true;
        preview = null;
      }
    } finally {
      if (controller === current) previewLoading = false;
    }
  }

  async function createInvoice(): Promise<void> {
    if (!preview || preview.state !== 'ready' || creating) return;
    creating = true;
    createMessage = '';
    try {
      const response = await fetch(api, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          projectId,
          periodStart,
          periodEnd,
          ...(streamOverride ? { billingRuleId: streamOverride } : {}),
          ...(overridesPayload() ? { overrides: overridesPayload() } : {}),
          ...(excludedExpenses.length ? { excludedExpenseIds: excludedExpenses } : {}),
          ...splitGuard(),
          ...(replacesInvoiceId ? { replacesInvoiceId } : {}),
          requestKey,
        }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        invoiceId?: string;
        invoiceIds?: string[];
        totalMinor?: string;
        reason?: string;
        preview?: Preview;
      };
      if (body.ok && body.invoiceIds && body.invoiceIds.length > 1) {
        // One draft per PO: list them here (each opens on its own).
        const parts = preview.split?.parts ?? [];
        doneKind = 'drafts';
        doneInvoices = body.invoiceIds.map((invoiceId, index) => ({
          invoiceId,
          number: null,
          totalMinor: parts[index]?.totalMinor ?? '0',
          purchaseNo: parts[index]?.purchaseNo ?? null,
        }));
        await loadPreview();
        return;
      }
      if (body.ok && body.invoiceId) {
        await goto(
          `${base}/app/billing/invoices/${encodeURIComponent(body.invoiceId)}?lang=${locale}&created=1`,
        );
        return;
      }
      if (body.preview) {
        preview = body.preview;
        requestKey = newKey();
      }
      createMessage = body.reason === 'amount_changed' ? t('amountChanged') : t('createFailed');
    } catch {
      createMessage = t('createFailed');
    } finally {
      creating = false;
    }
  }

  /** One inline fix: the server applies it and returns the recalculated preview. */
  async function run(operation: string, payload: Record<string, unknown>): Promise<RunResult> {
    fixing = true;
    try {
      const response = await fetch(api, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          operation,
          projectId,
          periodStart,
          periodEnd,
          ...(streamOverride ? { billingRuleId: streamOverride } : {}),
          ...(overridesPayload() ? { overrides: overridesPayload() } : {}),
          ...(excludedExpenses.length ? { excludedExpenseIds: excludedExpenses } : {}),
          ...payload,
        }),
      });
      const body = (await response.json()) as RunResult & { preview?: Preview; problem?: { message?: string } };
      if (!response.ok && !body.preview && (response.status === 409 || /CONFLICT|STALE/u.test(body.code ?? ''))) {
        // A record changed meanwhile: show its current state so the next try uses it.
        await loadPreview();
      }
      if (body.preview) {
        preview = body.preview;
        requestKey = newKey();
        if (operation === 'setupBilling') {
          // The new stream now exists: reload the project list so periods follow it.
          void reloadProjects();
        }
      }
      return {
        ...body,
        success: response.ok && body.success !== false,
        message: body.message ?? body.problem?.message,
      };
    } finally {
      fixing = false;
    }
  }

  async function reloadProjects(): Promise<void> {
    try {
      const response = await fetch(api, { headers: { accept: 'application/json' } });
      const body = (await response.json()) as { projects?: Project[] };
      if (response.ok && body.projects) projects = body.projects;
    } catch {
      /* the preview already reflects the change */
    }
  }

  async function issueInvoice(): Promise<void> {
    if (!preview || preview.state !== 'ready' || issuing) return;
    issuing = true;
    issueMessage = '';
    issueFailedInvoice = '';
    try {
      const response = await fetch(api, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          operation: 'issue',
          projectId,
          periodStart,
          periodEnd,
          ...(streamOverride ? { billingRuleId: streamOverride } : {}),
          ...(overridesPayload() ? { overrides: overridesPayload() } : {}),
          ...(excludedExpenses.length ? { excludedExpenseIds: excludedExpenses } : {}),
          ...splitGuard(),
          ...(replacesInvoiceId ? { replacesInvoiceId } : {}),
          requestKey,
          locale: locale === 'es' ? 'es' : locale === 'pt' ? 'pt' : 'en',
        }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        invoiceId?: string;
        invoices?: Issued[];
        reason?: string;
        message?: string;
        preview?: Preview;
      };
      if (body.ok && body.invoices && body.invoices.length > 1) {
        doneKind = 'issued';
        doneInvoices = body.invoices;
        issueOpen = false;
        await loadPreview();
        return;
      }
      if (body.ok && body.invoiceId) {
        await goto(
          `${base}/app/billing/invoices/${encodeURIComponent(body.invoiceId)}?lang=${locale}&issued=1`,
        );
        return;
      }
      if (body.preview) {
        preview = body.preview;
        requestKey = newKey();
      }
      if (body.reason === 'issue_failed' && body.invoiceId) {
        issueFailedInvoice = body.invoiceId;
        issueMessage = quickInvoiceFormat(locale, 'issueFailedDraft', { reason: body.message ?? '—' });
      } else if (body.reason === 'already_invoiced') {
        issueMessage = t('existing');
      } else
        issueMessage = body.reason === 'amount_changed' ? t('amountChanged') : t('createFailed');
      issueOpen = false;
    } catch {
      issueMessage = t('createFailed');
    } finally {
      issuing = false;
    }
  }

  /** Create/issue guard: the amount (and, when split by PO, the parts) the user saw. */
  function splitGuard(): { expectedTotalMinor: string; expectedSplit?: string } {
    const split = preview?.split;
    return split
      ? { expectedTotalMinor: split.totalMinor, expectedSplit: split.signature }
      : { expectedTotalMinor: preview?.totalMinor ?? '0' };
  }

  /** "Leave out of this invoice" for an unclassified expense (and undo). */
  function setExcluded(id: string, value: boolean): void {
    excludedExpenses = value ? [...new Set([...excludedExpenses, id])] : excludedExpenses.filter((entry) => entry !== id);
    void loadPreview();
  }

  let lastGoodOverrides: Overrides | null = null;
  let overrideError = $state('');

  /** Overrides to send (PO "for this invoice" included), or null when there are none. */
  function overridesPayload(): Overrides | null {
    const po = purchaseNo.trim() || overrides.purchaseNo;
    if (!overrides.people.length && !overrides.tax && !po) return null;
    return { people: overrides.people, tax: overrides.tax, purchaseNo: po || null };
  }

  /** Keep the server-normalized form (minor units / minutes) once the engine accepted it. */
  function syncOverrides(next: Preview): void {
    const echoed = next.overrides;
    overrides = echoed
      ? {
          people: echoed.people.map((person) => ({
            workerId: person.workerId,
            category: person.category,
            rateMinor: person.rateMinor,
            billedMinutes: person.billedMinutes,
          })),
          tax: echoed.tax,
          purchaseNo: overrides.purchaseNo,
        }
      : { ...noOverrides(), purchaseNo: overrides.purchaseNo };
    lastGoodOverrides = JSON.parse(JSON.stringify(overrides)) as Overrides;
  }

  function resetOverrides(): void {
    overrides = noOverrides();
    lastGoodOverrides = null;
    overrideError = '';
    editing = '';
  }

  function setPersonOverride(workerId: string, category: string | null, patch: Partial<PersonOverride>): void {
    const others = overrides.people.filter((person) => !(person.workerId === workerId && person.category === category));
    const current = overrides.people.find((person) => person.workerId === workerId && person.category === category) ?? {
      workerId,
      category,
    };
    const next = { ...current, ...patch };
    const empty =
      next.rate === undefined &&
      (next.rateMinor === undefined || next.rateMinor === null) &&
      next.billedHours === undefined &&
      (next.billedMinutes === undefined || next.billedMinutes === null);
    overrides = { ...overrides, people: empty ? others : [...others, next] };
  }

  /** Attention "Save as project rate" unticked: the rate applies to this invoice only. */
  async function invoiceRate(workerId: string, amount: string): Promise<boolean> {
    setPersonOverride(workerId, null, { rate: amount, rateMinor: undefined });
    await loadPreview();
    return !overrideError && !previewFailed;
  }

  const lineKey = (group: Group) => `${group.workerId ?? ''}:${group.category ?? ''}`;
  const decimalText = (minor: string | null | undefined) =>
    minor ? new Intl.NumberFormat(locale, { minimumFractionDigits: 2, useGrouping: false }).format(Number(minor) / 100) : '';
  const hoursText = (minutes: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(minutes / 60);
  const parseHours = (value: string): number | null => {
    const text = value.trim().replace(',', '.');
    if (!/^\d{1,4}(?:\.\d{1,2})?$/u.test(text)) return null;
    return Math.round(Number(text) * 60);
  };

  function openLine(group: Group): void {
    const key = lineKey(group);
    if (editing === key) {
      editing = '';
      return;
    }
    editing = key;
    edit = {
      rate: decimalText(group.unitPriceMinor),
      hours: hoursText(group.minutes),
      scope: 'invoice',
      reason: '',
      entries: [],
      entryHours: {},
      loading: false,
      error: '',
      saving: false,
    };
  }

  async function loadEntries(group: Group): Promise<void> {
    if (!group.workerId) return;
    edit.loading = true;
    try {
      const params = new URLSearchParams({ projectId, periodStart, periodEnd, detail: `worker:${group.workerId}` });
      if (streamOverride) params.set('billingRuleId', streamOverride);
      const response = await fetch(`${api}?${params}`, { headers: { accept: 'application/json' } });
      const body = (await response.json()) as { entries?: Entry[] };
      edit.entries = body.entries ?? [];
      edit.entryHours = Object.fromEntries(edit.entries.map((entry) => [entry.ref.id, hoursText(entry.minutes)]));
    } catch {
      edit.error = t('previewFailed');
    } finally {
      edit.loading = false;
    }
  }

  async function applyLine(group: Group): Promise<void> {
    if (!group.workerId || edit.saving) return;
    edit.error = '';
    const rate = edit.rate.trim();
    if (!/^\d{1,10}(?:[.,]\d{1,2})?$/u.test(rate)) {
      edit.error = t('rateZero');
      return;
    }
    const rateChanged = rate !== decimalText(group.unitPriceMinor);
    if (edit.scope === 'invoice') {
      const billed = parseHours(edit.hours);
      if (billed === null) {
        edit.error = t('hoursInvalid');
        return;
      }
      const hoursChanged = billed !== group.minutes;
      if (!rateChanged && !hoursChanged) {
        editing = '';
        return;
      }
      setPersonOverride(group.workerId, group.category ?? null, {
        ...(rateChanged ? { rate, rateMinor: undefined } : {}),
        ...(hoursChanged ? { billedHours: edit.hours.trim(), billedMinutes: undefined } : {}),
      });
      edit.saving = true;
      await loadPreview();
      edit.saving = false;
      if (!overrideError) editing = '';
      else edit.error = overrideError;
      return;
    }
    // Fix the worker's record: audited corrections and/or the person's project rate.
    const changes = edit.entries.filter(
      (entry) => parseHours(edit.entryHours[entry.ref.id] ?? '') !== entry.minutes,
    );
    if (changes.some((entry) => (parseHours(edit.entryHours[entry.ref.id] ?? '') ?? 0) <= 0)) {
      edit.error = t('hoursInvalid');
      return;
    }
    if (changes.length && edit.reason.trim().length < 10) {
      edit.error = t('correctionReasonShort');
      return;
    }
    edit.saving = true;
    try {
      for (const entry of changes) {
        const result = await run('correctHours', {
          source: entry.ref,
          hours: (edit.entryHours[entry.ref.id] ?? '').trim(),
          reason: edit.reason.trim(),
          requestKey: newKey(),
        });
        if (!result.success) {
          edit.error = quickInvoiceFormat(locale, 'fixFailed', { reason: result.detail || result.message || result.code || '—' });
          return;
        }
      }
      if (rateChanged) {
        const result = await run('setRate', {
          kind: 'client',
          workerId: group.workerId,
          amount: rate,
          effectiveFrom: preview?.periodStart ?? periodStart,
          scope: 'project',
        });
        if (!result.success) {
          edit.error = quickInvoiceFormat(locale, 'fixFailed', { reason: result.detail || result.message || result.rateCode || result.code || '—' });
          return;
        }
      }
      // Any invoice-only change for this line is superseded by the corrected record.
      setPersonOverride(group.workerId, group.category ?? null, {
        rate: undefined,
        rateMinor: undefined,
        billedHours: undefined,
        billedMinutes: undefined,
      });
      await loadPreview();
      editing = '';
    } finally {
      edit.saving = false;
    }
  }

  async function undoLine(group: Group): Promise<void> {
    if (!group.workerId) return;
    setPersonOverride(group.workerId, group.category ?? null, {
      rate: undefined,
      rateMinor: undefined,
      billedHours: undefined,
      billedMinutes: undefined,
    });
    // A general (all categories) rate set from Needs attention is undone too.
    setPersonOverride(group.workerId, null, { rate: undefined, rateMinor: undefined, billedHours: undefined, billedMinutes: undefined });
    editing = '';
    await loadPreview();
  }

  function openTax(): void {
    if (editing === 'tax') {
      editing = '';
      return;
    }
    editing = 'tax';
    const current = overrides.tax
      ? overrides.tax.mode === 'exempt'
        ? 'none'
        : overrides.tax.taxProfileId
      : (preview?.streamTaxProfileId ?? 'none');
    taxEdit = { choice: current, scope: 'invoice', error: '', saving: false, note: '', newName: '', newPercent: '' };
  }

  async function applyTax(): Promise<void> {
    if (!preview || taxEdit.saving) return;
    taxEdit.saving = true;
    taxEdit.error = '';
    try {
      if (taxEdit.choice === 'new') {
        const percent = taxEdit.newPercent.trim().replace(',', '.');
        if (!taxEdit.newName.trim() || !/^\d{1,3}(?:\.\d{1,2})?$/u.test(percent)) {
          taxEdit.error = t('taxNewInvalid');
          return;
        }
        // Basis points from the typed percentage (text → integer, no money involved).
        const [whole, fraction = ''] = percent.split('.');
        const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
        const created = (await run('setTax', {
          scope: taxEdit.scope,
          tax: { name: taxEdit.newName.trim(), basisPoints },
        })) as RunResult & { result?: { taxProfileId?: string | null; effectiveFrom?: string; split?: boolean } };
        if (!created.success || !created.result?.taxProfileId) {
          taxEdit.error = quickInvoiceFormat(locale, 'fixFailed', { reason: created.detail || created.message || created.code || '—' });
          return;
        }
        if (taxEdit.scope === 'invoice') {
          overrides = { ...overrides, tax: { mode: 'profile', taxProfileId: created.result.taxProfileId } };
          await loadPreview();
        } else if (created.result.split && created.result.effectiveFrom)
          taxEdit.note = quickInvoiceFormat(locale, 'taxSplitDone', { date: dateText(created.result.effectiveFrom) });
        editing = '';
        return;
      }
      if (taxEdit.scope === 'invoice') {
        const streamTax = preview.streamTaxProfileId ?? 'none';
        overrides = {
          ...overrides,
          tax:
            taxEdit.choice === streamTax
              ? null
              : taxEdit.choice === 'none'
                ? { mode: 'exempt' }
                : { mode: 'profile', taxProfileId: taxEdit.choice },
        };
        await loadPreview();
        editing = '';
        return;
      }
      const result = (await run('setTax', {
        scope: 'fromPeriod',
        tax: taxEdit.choice === 'none' ? { none: true } : { profileId: taxEdit.choice },
      })) as RunResult & { result?: { effectiveFrom?: string; split?: boolean } };
      if (!result.success) {
        taxEdit.error = quickInvoiceFormat(locale, 'fixFailed', { reason: result.detail || result.message || result.code || '—' });
        return;
      }
      overrides = { ...overrides, tax: null };
      taxEdit.note = result.result?.split && result.result.effectiveFrom
        ? quickInvoiceFormat(locale, 'taxSplitDone', { date: dateText(result.result.effectiveFrom) })
        : t('saved');
      await loadPreview();
      editing = '';
    } finally {
      taxEdit.saving = false;
    }
  }

  const overrideCount = $derived(overrides.people.length + (overrides.tax ? 1 : 0));

  function focusFirstBlocking(): void {
    const target = document.querySelector<HTMLElement>(
      '[data-attention-blocks="create"], [data-attention-blocks="issue"]',
    );
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.querySelector<HTMLElement>('input, button, select, textarea')?.focus({ preventScroll: true });
  }

  function attentionText(item: AttentionItem): string {
    return (
      item.message ??
      quickInvoiceWarningText(locale, { code: item.code ?? '', count: item.totalCount, minutes: item.minutes ?? 0 }) ??
      translate(billingReadinessMessageKey(item.code ?? ''))
    );
  }

  const money = (minor: string | null | undefined) =>
    minor === null || minor === undefined ? '—' : journeyMoney(minor, preview?.currency ?? '', locale);
  const hours = (minutes: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(minutes / 60);
  const dateText = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
  };
  const rangeText = (start: string, end: string) => `${dateText(start)} – ${dateText(end)}`;
  const cadenceText = (cadence: string) =>
    (
      {
        weekly: t('cadence_weekly'),
        every_14_days: t('cadence_every_14_days'),
        semi_monthly: t('cadence_semi_monthly'),
        monthly: t('cadence_monthly'),
        milestone: t('cadence_milestone'),
      } as Record<string, string>
    )[cadence] ?? t('cadence_manual');
  const streamLabel = (stream: Stream) =>
    `${t(`stream_${stream.streamType}` as QuickInvoiceCopyKey) ?? stream.streamType} · ${cadenceText(stream.cadence)} · ${dateText(stream.effectiveFrom)} → ${stream.effectiveTo ? dateText(stream.effectiveTo) : '…'}`;

  function fixHref(warning: Warning): string | null {
    const portal = `${base}/app`;
    const project = encodeURIComponent(projectId);
    const period = preview ? { start: preview.periodStart, end: preview.periodEnd } : undefined;
    const lang = `lang=${locale}`;
    switch (warning.fix) {
      case 'time':
        return `${portal}${billingReadinessReviewPath(['pending_time_submission'], projectId, period)}&${lang}`;
      case 'approvals':
        return `${portal}${billingReadinessReviewPath(['pending_time_approval'], projectId, period)}&${lang}`;
      case 'finance_approvals':
        return `${portal}${billingReadinessReviewPath(['pending_time_finance_review'], projectId, period)}`;
      case 'expenses':
        return `${portal}${billingReadinessReviewPath(['pending_expense_approval'], projectId, period)}&${lang}`;
      case 'expense_classification':
        return `${portal}${billingReadinessReviewPath(['missing_expense_classification'], projectId, period)}`;
      case 'rates':
        return `${portal}/projects/${project}?tab=billing&billingStep=people&${lang}#project-person-conditions`;
      case 'finance':
        return `${portal}/finance?view=commercial&project=${project}&${lang}`;
      case 'issuer_authority':
        return `${portal}/finance?view=commercial&project=${project}&${lang}#project-issuing-authority`;
      case 'numbering':
        return role === 'owner_admin' && preview?.issuerLegalEntityId
          ? `${portal}/billing?view=setup&setup=numbering&numberingEntity=${encodeURIComponent(preview.issuerLegalEntityId)}&${lang}#billing-numbering-policy`
          : null;
      case 'issuer_settings':
        return preview?.issuerLegalEntityId
          ? `${portal}/billing?view=setup&issuerSettings=${encodeURIComponent(preview.issuerLegalEntityId)}&${lang}#issuer-document-settings`
          : null;
      case 'project_po':
        return `${portal}/projects/${project}?tab=overview&${lang}`;
      case 'signoff':
        return `${portal}/projects/${project}?tab=reports&${lang}#project-reports`;
      case 'billing_setup':
        return `${portal}/projects/${project}?tab=billing&${lang}#project-panel-billing`;
      case 'invoice':
        return preview?.openDrafts[0]
          ? `${portal}/billing/invoices/${encodeURIComponent(preview.openDrafts[0].id)}?${lang}`
          : null;
      default:
        return null;
    }
  }

  /** Hours / Expenses switch when the project bills them on separate streams for these dates. */
  const streamKinds = $derived.by(() => {
    if (!preview?.stream) return [] as Stream[];
    const all = [preview.stream, ...preview.alternatives].filter(
      (stream) =>
        ['labor', 'expense'].includes(stream.streamType) &&
        stream.effectiveFrom <= preview!.periodEnd &&
        (!stream.effectiveTo || stream.effectiveTo >= preview!.periodStart),
    );
    const byKind = new Map<string, Stream>();
    for (const stream of all) if (!byKind.has(stream.streamType) || stream.id === preview.stream.id) byKind.set(stream.streamType, stream);
    return [...byKind.values()].sort((a, b) => (a.streamType === 'labor' ? -1 : b.streamType === 'labor' ? 1 : 0));
  });
  /** What the screen shows: everything logged (projection) when approvals are pending. */
  const shown = $derived.by(() => {
    if (!preview) return null;
    if (preview.projected?.state === 'ready') return preview.projected;
    return preview.state === 'ready' ? preview : null;
  });
  const labor = $derived(shown?.groups.filter((g) => g.kind === 'labor') ?? []);
  const fees = $derived(shown?.groups.filter((g) => g.kind === 'fee') ?? []);
  const expenses = $derived(shown?.groups.filter((g) => g.kind === 'expense') ?? []);
  const blocking = $derived(preview?.attention.filter((item) => item.blocks !== 'none') ?? []);
  const canIssue = $derived(Boolean(preview && preview.state === 'ready' && blocking.length === 0));
  const canSaveDraft = $derived(
    Boolean(preview && preview.state === 'ready' && !blocking.some((item) => item.blocks === 'create')),
  );
  const pendingLeftOut = $derived(
    preview?.projected && BigInt(preview.projected.includedPendingMinor) > 0n
      ? preview.projected.includedPendingMinor
      : null,
  );
  /** One invoice per PO (only when the amount shown is what would be created now). */
  const split = $derived(preview?.split && shown === preview ? preview.split : null);
  const datesAdjusted = $derived(
    Boolean(preview && (preview.periodStart !== periodStart || preview.periodEnd !== periodEnd)),
  );

  onMount(async () => {
    try {
      const response = await fetch(api, { headers: { accept: 'application/json' } });
      const body = (await response.json()) as { projects?: Project[] };
      if (!response.ok || !body.projects) throw new Error('projects failed');
      projects = body.projects;
      if (initialProjectId && projects.some((candidate) => candidate.id === initialProjectId)) {
        chooseProject(initialProjectId);
        // Prefilled scope (e.g. replacing a void invoice): exactly these dates and stream.
        if (initialPeriodStart && initialPeriodEnd && initialPeriodStart <= initialPeriodEnd) {
          const stream = projects
            .find((candidate) => candidate.id === initialProjectId)
            ?.streams.find((candidate) => candidate.id === initialBillingRuleId);
          streamOverride = stream ? stream.id : '';
          autoPeriod = false;
          choiceId = 'custom';
          periodStart = initialPeriodStart;
          periodEnd = initialPeriodEnd;
          schedulePreview(0);
        }
      }
    } catch {
      projectsFailed = true;
    } finally {
      projectsLoading = false;
    }
  });
  onDestroy(() => {
    controller?.abort();
    clearTimeout(debounce);
  });
</script>

<div class="quick-invoice" data-quick-invoice>
  <p class="quick-invoice__intro">{t('intro')}</p>
  {#if replacement}<p class="quick-invoice__muted" role="status" data-quick-invoice-replacement>{t('replacementPrefilled')}</p>{/if}
  <div class="quick-invoice__layout">
    <div class="quick-invoice__inputs">
      <section class="quick-invoice__step" aria-labelledby="quick-invoice-project">
        <h3 id="quick-invoice-project">{t('stepProject')}</h3>
        {#if project && !choosingProject}
          <div class="quick-invoice__chosen" data-quick-invoice-project={project.id}>
            <div>
              <strong>{project.number} · {project.name}</strong>
              <span>{project.client} · {project.currency}</span>
            </div>
            <button
              type="button"
              class="secondary-button"
              onclick={() => {
                choosingProject = true;
              }}>{t('change')}</button
            >
          </div>
        {:else}
          <label class="quick-invoice__field">
            <span>{t('searchProject')}</span>
            <input
              type="search"
              bind:value={query}
              placeholder={t('searchPlaceholder')}
              autocomplete="off"
              data-quick-invoice-search
            />
          </label>
          {#if projectsLoading}
            <p class="quick-invoice__muted" role="status">{t('calculating')}</p>
          {:else if projectsFailed}
            <p role="alert">{t('previewFailed')}</p>
          {:else if filteredProjects.length === 0}
            <p class="quick-invoice__muted">{t('noProjects')}</p>
          {:else}
            <ul class="quick-invoice__projects" aria-label={t('searchProject')}>
              {#each filteredProjects as candidate (candidate.id)}
                <li>
                  <button
                    type="button"
                    class="quick-invoice__project"
                    aria-pressed={candidate.id === projectId}
                    onclick={() => chooseProject(candidate.id)}
                  >
                    <strong>{candidate.number} · {candidate.name}</strong>
                    <span
                      >{candidate.client} · {candidate.currency}{#if candidate.unbilledMinutes > 0}
                        · <b class="quick-invoice__unbilled"
                          >{hours(candidate.unbilledMinutes)} h {t('unbilled')}</b
                        >{/if}{#if !candidate.streams.length}
                        · <em>{t('noBillingSetup')}</em>{/if}</span
                    >
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      </section>

      {#if project && !choosingProject}
        <section class="quick-invoice__step" aria-labelledby="quick-invoice-period">
          <h3 id="quick-invoice-period">{t('stepPeriod')}</h3>
          <div class="quick-invoice__choices" role="group" aria-label={t('stepPeriod')}>
            {#each periodChoices as choice (choice.id)}
              <button
                type="button"
                class="quick-invoice__choice"
                aria-pressed={choiceId === choice.id}
                onclick={() => applyChoice(choice)}
              >
                <strong>{choice.label}</strong>
                <span>{rangeText(choice.start, choice.end)}</span>
              </button>
            {/each}
            <button
              type="button"
              class="quick-invoice__choice"
              aria-pressed={choiceId === 'custom'}
              onclick={() => (choiceId = 'custom')}
            >
              <strong>{t('custom')}</strong>
              <span>{choiceId === 'custom' ? rangeText(periodStart, periodEnd) : t('from') + ' / ' + t('to')}</span>
            </button>
          </div>
          {#if choiceId === 'custom'}
            <div class="quick-invoice__dates">
              <label class="quick-invoice__field">
                <span>{t('from')}</span>
                <input
                  type="date"
                  bind:value={periodStart}
                  oninput={applyCustom}
                  data-quick-invoice-from
                />
              </label>
              <label class="quick-invoice__field">
                <span>{t('to')}</span>
                <input
                  type="date"
                  bind:value={periodEnd}
                  min={periodStart}
                  oninput={applyCustom}
                  data-quick-invoice-to
                />
              </label>
            </div>
          {/if}
          {#if autoAdjusted && choiceId === 'custom'}
            <p class="quick-invoice__muted" data-quick-invoice-auto-dates>{t('autoDates')}</p>
          {/if}
          {#if currentStream(project)}
            <p class="quick-invoice__muted">{cadenceText(currentStream(project)!.cadence)}</p>
          {/if}
        </section>
      {/if}
    </div>

    {#if project && !choosingProject}
      <section
        class="quick-invoice__amount"
        aria-labelledby="quick-invoice-amount"
        aria-busy={previewLoading}
        data-quick-invoice-state={preview?.state ?? (previewLoading ? 'loading' : 'idle')}
      >
        <h3 id="quick-invoice-amount">{t('stepAmount')}</h3>
        {#if previewLoading && !preview}
          <p class="quick-invoice__muted" role="status">{t('calculating')}</p>
        {:else if previewFailed}
          <p role="alert">{t('previewFailed')}</p>
          <button type="button" class="secondary-button" onclick={() => schedulePreview(0)}
            >{t('retry')}</button
          >
        {:else if preview}
          <div class:quick-invoice__stale={previewLoading}>
            {#if preview.stream && streamKinds.length > 1}
              <div class="quick-invoice__choices quick-invoice__kinds" role="group" aria-label={t('stream')}>
                {#each streamKinds as kind (kind.id)}
                  <button
                    type="button"
                    class="quick-invoice__choice"
                    aria-pressed={preview.stream.id === kind.id}
                    onclick={() => {
                      streamOverride = kind.id;
                      schedulePreview(0);
                    }}
                    data-quick-invoice-stream={kind.streamType}><strong>{t(`stream_${kind.streamType}` as QuickInvoiceCopyKey)}</strong></button
                  >
                {/each}
              </div>
            {/if}
            {#if datesAdjusted}
              <p class="quick-invoice__muted" data-quick-invoice-dates-used>
                {t('datesUsed')}: {rangeText(preview.periodStart, preview.periodEnd)}
              </p>
            {/if}

            {#if shown}
              <div
                class="quick-invoice__total"
                data-quick-invoice-total={preview.totalMinor}
                data-quick-invoice-shown-total={shown.totalMinor}
              >
                <span>{preview.projected && shown === preview.projected ? t('ifApproved') : t('amountHeading')}</span>
                <strong>{money(split ? split.totalMinor : shown.totalMinor)}</strong>
                {#if preview.projected && BigInt(preview.projected.includedPendingMinor) > 0n}
                  <small data-quick-invoice-projected
                    >{quickInvoiceFormat(locale, 'projected', { amount: money(preview.projected.includedPendingMinor) })}</small
                  >
                {/if}
              </div>
            {/if}

            {#if split}
              <div class="quick-invoice__split" data-quick-invoice-split={split.parts.length}>
                <strong>{quickInvoiceFormat(locale, 'splitTitle', { count: split.parts.length })}</strong>
                <small>{t('splitHelp')}</small>
                <ul>
                  {#each split.parts as part, index (index)}
                    <li data-quick-invoice-split-part={part.poKey ?? ''}>
                      <span
                        ><b>{part.purchaseNo ? `PO ${part.purchaseNo}` : t('splitNoPo')}</b>
                        · {part.people.map((person) => person.name).join(', ')}{#if part.people.some((person) => person.minutes)}
                          · {hours(part.people.reduce((total, person) => total + person.minutes, 0))} h{/if}</span
                      >
                      <strong>{money(part.totalMinor)}</strong>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
            {#if doneInvoices.length}
              <div class="quick-invoice__done" role="status" data-quick-invoice-done={doneInvoices.length}>
                <strong
                  >{quickInvoiceFormat(locale, doneKind === 'issued' ? 'splitIssued' : 'splitDrafts', {
                    count: doneInvoices.length,
                  })}</strong
                >
                <ul>
                  {#each doneInvoices as done (done.invoiceId)}
                    <li>
                      <a href={`${base}/app/billing/invoices/${encodeURIComponent(done.invoiceId)}?lang=${locale}`}
                        >{done.number ?? t('draft')}</a
                      >
                      <span>{done.purchaseNo ? `PO ${done.purchaseNo}` : '—'} · {money(done.totalMinor)}</span>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}

            {#if preview.state !== 'existing' && (preview.attention.length || shown)}
              <QuickInvoiceAttention
                {locale}
                role={preview.capabilities.role || role}
                currency={preview.currency}
                attention={preview.attention}
                expenseRows={preview.expenseRows}
                client={preview.client}
                disabled={previewLoading || issuing}
                bind:purchaseNo
                {run}
                {newKey}
                fixHref={(fix) => fixHref({ code: '', severity: 'info', count: 0, minutes: 0, fix: fix ?? null })}
                onInvoiceRate={invoiceRate}
                onExclude={setExcluded}
                otherText={attentionText}
                recordHref={(workerId) =>
                  `${base}/app${billingReadinessReviewPath(['pending_time_submission'], projectId, { start: preview!.periodStart, end: preview!.periodEnd })}&worker=${encodeURIComponent(workerId)}&lang=${locale}`}
              />
            {/if}

            {#if shown}
              <table class="quick-invoice__lines" aria-label={t('lines')}>
                <tbody>
                  {#if labor.length}
                    <tr class="quick-invoice__group-row"><th colspan="2">{t('hours')}</th></tr>
                    {#each labor as group, index (index)}
                      {@const key = lineKey(group)}
                      <tr data-quick-invoice-line={key}>
                        <td>
                          <span class="quick-invoice__line-label">{group.label}</span>
                          <small
                            >{group.detail} · {hours(group.minutes)} h{#if group.unitPriceMinor}{' '}×
                              {money(group.unitPriceMinor)}{/if}{#if group.overrideHours && group.workedMinutes !== undefined}
                              · {quickInvoiceFormat(locale, 'lineWorked', { hours: hours(group.workedMinutes) })}{/if}</small
                          >
                          {#if group.overrideRate || group.overrideHours}<span class="quick-invoice__badge" data-quick-invoice-override
                              >{t('invoiceOnlyBadge')}</span
                            >{/if}
                        </td>
                        <td class="quick-invoice__money">
                          {money(group.amountMinor)}
                          {#if group.workerId && group.unit === 'hourly' && shown === preview}
                            <button
                              type="button"
                              class="quick-invoice__change"
                              aria-expanded={editing === key}
                              aria-controls={`quick-invoice-edit-${index}`}
                              disabled={previewLoading || fixing}
                              onclick={() => openLine(group)}
                              data-quick-invoice-line-change>{t('lineChange')}</button
                            >
                          {/if}
                        </td>
                      </tr>
                      {#if editing === key}
                        <tr class="quick-invoice__edit-row">
                          <td colspan="2">
                            <div
                              class="quick-invoice__edit"
                              id={`quick-invoice-edit-${index}`}
                              role="group"
                              aria-label={quickInvoiceFormat(locale, 'lineChangeTitle', { name: group.label, detail: group.detail })}
                              data-quick-invoice-edit
                            >
                              <fieldset class="quick-invoice__scope">
                                <legend class="quick-invoice__sr">{t('lineChange')}</legend>
                                <label
                                  ><input type="radio" bind:group={edit.scope} value="invoice" data-quick-invoice-scope="invoice" />
                                  <span><strong>{t('scopeInvoice')}</strong><small>{t('scopeInvoiceHelp')}</small></span></label
                                >
                                {#if preview.capabilities.canCorrectHours}
                                  <label
                                    ><input
                                      type="radio"
                                      bind:group={edit.scope}
                                      value="record"
                                      onchange={() => {
                                        if (!edit.entries.length) void loadEntries(group);
                                      }}
                                      data-quick-invoice-scope="record"
                                    />
                                    <span><strong>{t('scopeRecord')}</strong><small>{t('scopeRecordHelp')}</small></span></label
                                  >
                                {/if}
                              </fieldset>
                              <div class="quick-invoice__edit-fields">
                                <label class="quick-invoice__field"
                                  ><span>{t('lineRate')} ({preview.currency}{t('perHour')})</span><input
                                    type="text"
                                    inputmode="decimal"
                                    autocomplete="off"
                                    bind:value={edit.rate}
                                    data-quick-invoice-edit-rate
                                  /></label
                                >
                                {#if edit.scope === 'invoice'}
                                  <label class="quick-invoice__field"
                                    ><span>{t('lineHours')}</span><input
                                      type="text"
                                      inputmode="decimal"
                                      autocomplete="off"
                                      bind:value={edit.hours}
                                      aria-describedby={`quick-invoice-worked-${index}`}
                                      data-quick-invoice-edit-hours
                                    /><small id={`quick-invoice-worked-${index}`}
                                      >{quickInvoiceFormat(locale, 'lineWorked', { hours: hours(group.workedMinutes ?? group.minutes) })}</small
                                    ></label
                                  >
                                {/if}
                              </div>
                              {#if edit.scope === 'record'}
                                {#if edit.loading}
                                  <p class="quick-invoice__muted" role="status">{t('entriesLoading')}</p>
                                {:else}
                                  <ul class="quick-invoice__entries">
                                    {#each edit.entries as entry (entry.ref.id)}
                                      <li>
                                        <label class="quick-invoice__entry"
                                          ><span>{dateText(entry.date)}{#if entry.summary}<small>{" · "}{entry.summary}</small>{/if}</span><input
                                            type="text"
                                            inputmode="decimal"
                                            autocomplete="off"
                                            aria-label={quickInvoiceFormat(locale, 'entryHours', { date: dateText(entry.date) })}
                                            bind:value={edit.entryHours[entry.ref.id]}
                                            data-quick-invoice-entry-hours={entry.ref.id}
                                          /><span aria-hidden="true">h</span></label
                                        >
                                      </li>
                                    {/each}
                                  </ul>
                                  <label class="quick-invoice__field"
                                    ><span>{t('correctionReason')}</span><textarea
                                      rows="2"
                                      maxlength="2000"
                                      bind:value={edit.reason}
                                      data-quick-invoice-correction-reason
                                    ></textarea></label
                                  >
                                {/if}
                              {/if}
                              {#if edit.error}<p class="quick-invoice__error" role="alert">{edit.error}</p>{/if}
                              <div class="quick-invoice__edit-actions">
                                <button
                                  type="button"
                                  class="primary-button"
                                  disabled={edit.saving || previewLoading}
                                  onclick={() => applyLine(group)}
                                  data-quick-invoice-edit-apply>{edit.saving ? t('saving') : t('apply')}</button
                                >
                                <button type="button" class="secondary-button" onclick={() => (editing = '')}>{t('cancel')}</button>
                                {#if group.overrideRate || group.overrideHours}
                                  <button type="button" class="quick-invoice__linkbtn" onclick={() => undoLine(group)} data-quick-invoice-edit-undo
                                    >{t('undoInvoiceChange')}</button
                                  >
                                {/if}
                              </div>
                            </div>
                          </td>
                        </tr>
                      {/if}
                    {/each}
                  {/if}
                  {#if fees.length}
                    <tr class="quick-invoice__group-row"><th colspan="2">{t('fees')}</th></tr>
                    {#each fees as group, index (index)}
                      <tr>
                        <td>
                          <span class="quick-invoice__line-label">{group.label}</span>
                          {#if group.count > 1 || group.minutes}<small
                              >{group.count}×{#if group.minutes}
                                · {hours(group.minutes)} h{/if}</small
                            >{/if}
                        </td>
                        <td class="quick-invoice__money">{money(group.amountMinor)}</td>
                      </tr>
                    {/each}
                  {/if}
                  {#if expenses.length}
                    <tr class="quick-invoice__group-row"><th colspan="2">{t('expenses')}</th></tr>
                    {#each expenses as group, index (index)}
                      <tr>
                        <td><span class="quick-invoice__line-label">{group.label}</span></td>
                        <td class="quick-invoice__money">{money(group.amountMinor)}</td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">{t('subtotal')}</th>
                    <td class="quick-invoice__money">{money(shown.subtotalMinor)}</td>
                  </tr>
                  <tr>
                    <th scope="row"
                      >{t('tax')} · {preview.taxProfileName ?? t('noTax')}{#if overrides.tax}<span class="quick-invoice__badge"
                          >{t('invoiceOnlyBadge')}</span
                        >{/if}</th
                    >
                    <td class="quick-invoice__money">
                      {money(shown.taxMinor)}
                      {#if shown === preview && preview.stream}
                        <button
                          type="button"
                          class="quick-invoice__change"
                          aria-expanded={editing === 'tax'}
                          aria-controls="quick-invoice-tax-edit"
                          disabled={previewLoading || fixing}
                          onclick={openTax}
                          data-quick-invoice-tax-change>{t('lineChange')}</button
                        >
                      {/if}
                    </td>
                  </tr>
                  {#if editing === 'tax'}
                    <tr class="quick-invoice__edit-row">
                      <td colspan="2">
                        <div class="quick-invoice__edit" id="quick-invoice-tax-edit" role="group" aria-label={t('taxChange')} data-quick-invoice-tax-edit>
                          <label class="quick-invoice__field"
                            ><span>{t('taxChange')}</span><select bind:value={taxEdit.choice} data-quick-invoice-tax-select>
                              <option value="none">{t('noTax')}</option>
                              {#each preview.taxOptions as option (option.id)}
                                <option value={option.id}>{option.name} · {option.basisPoints / 100}%</option>
                              {/each}
                              <option value="new">{t('taxNew')}</option>
                            </select></label
                          >
                          {#if taxEdit.choice === 'new'}
                            <div class="quick-invoice__edit-fields">
                              <label class="quick-invoice__field"
                                ><span>{t('taxName')}</span><input bind:value={taxEdit.newName} maxlength="160" placeholder="IVA" data-quick-invoice-tax-name /></label
                              >
                              <label class="quick-invoice__field"
                                ><span>{t('taxPercent')}</span><input
                                  bind:value={taxEdit.newPercent}
                                  inputmode="decimal"
                                  placeholder="21"
                                  data-quick-invoice-tax-percent
                                /></label
                              >
                            </div>
                          {/if}
                          <fieldset class="quick-invoice__scope">
                            <legend class="quick-invoice__sr">{t('taxChange')}</legend>
                            <label><input type="radio" bind:group={taxEdit.scope} value="invoice" /> <span><strong>{t('taxScopeInvoice')}</strong></span></label>
                            <label
                              ><input type="radio" bind:group={taxEdit.scope} value="fromPeriod" data-quick-invoice-tax-future />
                              <span
                                ><strong>{t('taxScopeFuture')}</strong><small
                                  >{quickInvoiceFormat(locale, 'taxScopeFutureHelp', { date: dateText(preview.periodStart) })}</small
                                ></span
                              ></label
                            >
                          </fieldset>
                          {#if taxEdit.error}<p class="quick-invoice__error" role="alert">{taxEdit.error}</p>{/if}
                          <div class="quick-invoice__edit-actions">
                            <button type="button" class="primary-button" disabled={taxEdit.saving || previewLoading} onclick={applyTax} data-quick-invoice-tax-apply
                              >{taxEdit.saving ? t('saving') : t('apply')}</button
                            >
                            <button type="button" class="secondary-button" onclick={() => (editing = '')}>{t('cancel')}</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  {/if}
                  <tr class="quick-invoice__grand">
                    <th scope="row">{t('total')}</th>
                    <td class="quick-invoice__money">{money(shown.totalMinor)}</td>
                  </tr>
                </tfoot>
              </table>
              {#if overrideCount || overrideError || taxEdit.note}
                <div class="quick-invoice__overrides" role="status" data-quick-invoice-overrides={overrideCount}>
                  {#if overrideError}<span class="quick-invoice__error">{overrideError}</span>{/if}
                  {#if taxEdit.note}<span>{taxEdit.note}</span>{/if}
                  {#if overrideCount}
                    <span>{quickInvoiceFormat(locale, 'overridesSummary', { count: overrideCount })}</span>
                    <button
                      type="button"
                      class="quick-invoice__linkbtn"
                      disabled={previewLoading}
                      onclick={() => {
                        overrides = { ...noOverrides(), purchaseNo: overrides.purchaseNo };
                        editing = '';
                        void loadPreview();
                      }}>{t('undoAll')}</button
                    >
                  {/if}
                </div>
              {/if}
              <dl class="quick-invoice__facts">
                {#if preview.dueDate}
                  <div>
                    <dt>{t('due')}</dt>
                    <dd>
                      {dateText(preview.dueDate)}{#if preview.paymentTermsDays !== null}{' '}({preview.paymentTermsDays}
                        {t('days')}){/if}
                    </dd>
                  </div>
                {/if}
                <div>
                  <dt>{t('po')}</dt>
                  <dd>{purchaseNo || preview.purchaseNo || '—'}</dd>
                </div>
                {#if preview.provisionalNumber}
                  <div>
                    <dt>{t('numberOnIssue')}</dt>
                    <dd>{preview.provisionalNumber}</dd>
                  </div>
                {/if}
              </dl>
            {:else if preview.state === 'existing' && preview.existingInvoice}
              <p class="quick-invoice__plain" role="status">{t('existing')}</p>
              <a
                class="primary-button"
                href={`${base}/app/billing/invoices/${encodeURIComponent(preview.existingInvoice.id)}?lang=${locale}`}
                >{t('openInvoice')}{#if preview.existingInvoice.number}
                  · {preview.existingInvoice.number}{/if}</a
              >
            {:else if preview.state === 'empty' && !preview.attention.some((item) => item.blocks !== 'none')}
              <p class="quick-invoice__plain" role="status" data-quick-invoice-nothing>
                {t('nothing')}
              </p>
              {#if preview.suggestedPeriod}
                <div class="quick-invoice__suggestion">
                  <span
                    >{t('suggested')}: {rangeText(
                      preview.suggestedPeriod.start,
                      preview.suggestedPeriod.end,
                    )}</span
                  >
                  <button
                    type="button"
                    class="secondary-button"
                    onclick={() => useSuggested(preview!.suggestedPeriod!)}
                    >{t('useDates')}</button
                  >
                </div>
              {/if}
            {:else if !preview.attention.length}
              <p class="quick-invoice__plain" role="alert">{t('blocked')}</p>
            {/if}

            {#if preview.openDrafts.length}
              <div class="quick-invoice__warnings quick-invoice__warnings--info">
                <h4>{t('openDrafts')}</h4>
                <ul>
                  {#each preview.openDrafts as draft (draft.id)}
                    <li>
                      <span
                        >{t(draft.state === 'approved' ? 'approved' : 'draft')} · {rangeText(
                          draft.periodStart,
                          draft.periodEnd,
                        )} · {money(draft.totalMinor)}</span
                      >
                      <a
                        class="secondary-button"
                        href={`${base}/app/billing/invoices/${encodeURIComponent(draft.id)}?lang=${locale}`}
                        >{t('openInvoice')}</a
                      >
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        {/if}

        <details class="quick-invoice__advanced" data-quick-invoice-advanced>
          <summary>{t('advanced')}</summary>
          <p class="quick-invoice__muted">{t('advancedHelp')}</p>
          {#if project.streams.length > 1}
            <label class="quick-invoice__field">
              <span>{t('stream')}</span>
              <select bind:value={streamOverride} onchange={() => schedulePreview(0)}>
                <option value="">{t('streamAuto')}</option>
                {#each project.streams as stream (stream.id)}
                  <option value={stream.id}>{streamLabel(stream)}</option>
                {/each}
              </select>
            </label>
          {/if}
          <div class="quick-invoice__advanced-actions">
            {#if onAdvancedRecords && preview?.stream && ['labor', 'expense'].includes(preview.stream.streamType)}
              <button
                type="button"
                class="secondary-button"
                onclick={() =>
                  onAdvancedRecords?.({
                    projectId,
                    billingRuleId: preview!.stream!.id,
                    periodStart: preview!.periodStart,
                    periodEnd: preview!.periodEnd,
                  })}>{t('pickRecords')}</button
              >
            {/if}
            <a
              class="secondary-button"
              href={`${base}/app/projects/${encodeURIComponent(projectId)}?tab=billing&lang=${locale}#project-panel-billing`}
              >{t('streamSettings')}</a
            >
          </div>
        </details>
      </section>
    {/if}
  </div>

  {#if project && !choosingProject && preview && preview.state !== 'existing' && (shown || blocking.length || issueMessage || createMessage)}
    <div class="quick-invoice__actionbar" data-quick-invoice-actionbar>
      {#if createMessage || issueMessage}
        <p class="quick-invoice__create-message" role="alert">
          {createMessage || issueMessage}
          {#if issueFailedInvoice}
            <a href={`${base}/app/billing/invoices/${encodeURIComponent(issueFailedInvoice)}?lang=${locale}`}>{t('openInvoice')}</a>
          {/if}
        </p>
      {/if}
      {#if issueOpen && preview?.state === 'ready'}
        <div class="quick-invoice__confirm" role="dialog" aria-modal="false" aria-labelledby="quick-invoice-confirm-title" data-quick-invoice-confirm>
          <strong id="quick-invoice-confirm-title"
            >{split
              ? quickInvoiceFormat(locale, 'issueConfirmSplit', { count: split.parts.length, amount: money(split.totalMinor) })
              : quickInvoiceFormat(locale, 'issueConfirmTitle', { amount: money(preview.totalMinor) })}</strong
          >
          <p>
            {quickInvoiceFormat(locale, 'issueConfirmBody', {
              client: preview.client?.name ?? project.client,
              period: rangeText(preview.periodStart, preview.periodEnd),
            })}
          </p>
          {#if pendingLeftOut}
            <p class="quick-invoice__amber">{quickInvoiceFormat(locale, 'projectedNotIncluded', { amount: money(pendingLeftOut) })}</p>
          {/if}
          <div class="quick-invoice__confirm-actions">
            <button
              type="button"
              class="primary-button quick-invoice__create"
              disabled={issuing || previewLoading}
              onclick={issueInvoice}
              data-quick-invoice-issue-confirm>{issuing ? t('issuing') : t('issueConfirm')}</button
            >
            <button type="button" class="secondary-button" onclick={() => (issueOpen = false)}>{t('cancel')}</button>
          </div>
        </div>
      {/if}
      <div class="quick-invoice__actionbar-row">
        <div class="quick-invoice__actionbar-total">
          {#if shown}
            <span>{t('total')}</span>
            <strong>{money(split ? split.totalMinor : canIssue || canSaveDraft ? preview!.totalMinor : shown.totalMinor)}</strong>
          {:else if blocking.length}
            <span>{t('attentionHelp')}</span>
          {/if}
        </div>
        <div class="quick-invoice__actionbar-buttons">
          {#if canSaveDraft}
            <button
              type="button"
              class="quick-invoice__secondary"
              disabled={previewLoading || creating || issuing || fixing}
              onclick={createInvoice}
              data-quick-invoice-create
              >{creating
                ? t('creating')
                : split
                  ? quickInvoiceFormat(locale, 'saveDraftsSplit', { count: split.parts.length })
                  : t('saveDraft')}</button
            >
          {/if}
          {#if canIssue}
            <button
              type="button"
              class="primary-button quick-invoice__create"
              disabled={previewLoading || creating || issuing || fixing}
              aria-expanded={issueOpen}
              onclick={() => (issueOpen = !issueOpen)}
              data-quick-invoice-issue
              >{split ? quickInvoiceFormat(locale, 'issueButtonSplit', { count: split.parts.length }) : t('issueButton')} ▸</button
            >
          {:else if blocking.length}
            <button
              type="button"
              class="primary-button quick-invoice__create"
              onclick={focusFirstBlocking}
              data-quick-invoice-resolve>{quickInvoiceFormat(locale, 'issueBlockedN', { count: blocking.length })}</button
            >
          {:else}
            <button type="button" class="primary-button quick-invoice__create" disabled>{t('issueButton')}</button>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .quick-invoice__change,
  .quick-invoice__linkbtn {
    min-height: 44px;
    padding: 0 0.6rem;
    border: 0;
    background: none;
    color: var(--ja-accent, #1d4ed8);
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
    cursor: pointer;
    box-shadow: none;
  }
  .quick-invoice__change {
    display: block;
    margin-left: auto;
    min-height: 32px;
    font-size: 0.85rem;
  }
  @media (max-width: 600px) {
    .quick-invoice__change {
      min-height: 44px;
    }
  }
  .quick-invoice__badge {
    display: inline-block;
    justify-self: start;
    margin-left: 0.4rem;
    padding: 0 0.4rem;
    border-radius: 999px;
    background: var(--ja-amber-surface, #fff4d6);
    color: var(--ja-amber-text, #7a4b00);
    font-size: 0.75rem;
    font-weight: 600;
  }
  .quick-invoice__lines .quick-invoice__edit-row td:first-child {
    display: table-cell;
    padding: 0 0 0.75rem;
  }
  .quick-invoice__edit {
    display: grid;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--ja-border, #d8d6cc);
    border-radius: 10px;
    background: var(--ja-surface-muted, #f7f6f1);
  }
  .quick-invoice__scope {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .quick-invoice__scope label {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    min-height: 44px;
  }
  .quick-invoice__scope input {
    width: 20px;
    height: 20px;
    margin-top: 0.15rem;
    flex: none;
  }
  .quick-invoice__scope span {
    display: grid;
  }
  .quick-invoice__scope small,
  .quick-invoice__edit-fields small {
    color: var(--ja-text-secondary, #57574f);
  }
  .quick-invoice__edit-fields {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  }
  .quick-invoice__entries {
    display: grid;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 16rem;
    overflow: auto;
  }
  .quick-invoice__entry {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 5rem auto;
    gap: 0.5rem;
    align-items: center;
  }
  .quick-invoice__entry input {
    min-height: 44px;
  }
  .quick-invoice__edit-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  .quick-invoice__error {
    margin: 0;
    color: var(--ja-danger, #b42318);
  }
  .quick-invoice__overrides {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.9rem;
  }
  .quick-invoice__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .quick-invoice {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }
  .quick-invoice__intro {
    margin: 0;
    color: var(--ja-text-secondary, #57574f);
  }
  .quick-invoice__layout {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }
  @media (min-width: 900px) {
    .quick-invoice__layout {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
    }
  }
  .quick-invoice__inputs {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }
  .quick-invoice__step,
  .quick-invoice__amount {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
    padding: 1rem;
    border: 1px solid var(--ja-border-subdued, #e4e4df);
    border-radius: var(--ja-radius, 1rem);
    background: var(--ja-surface, #fff);
  }
  .quick-invoice h3 {
    margin: 0;
    font-size: 1rem;
  }
  .quick-invoice h4 {
    margin: 0 0 0.4rem;
    font-size: 0.85rem;
  }
  .quick-invoice__field {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }
  .quick-invoice__field span {
    font-weight: 700;
    font-size: 0.85rem;
  }
  .quick-invoice__field input,
  .quick-invoice__field select {
    width: 100%;
    min-height: 2.75rem;
    min-width: 0;
  }
  .quick-invoice__muted {
    margin: 0;
    color: var(--ja-text-muted, #6b6b62);
    font-size: 0.85rem;
  }
  .quick-invoice__plain {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
  }
  .quick-invoice__projects {
    display: grid;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 22rem;
    overflow-y: auto;
  }
  .quick-invoice__project,
  .quick-invoice__choice {
    display: grid !important;
    justify-items: start;
    gap: 0.15rem;
    width: 100%;
    padding: 0.65rem 0.8rem !important;
    border: 1px solid var(--ja-border-strong, #d1d1c9) !important;
    border-radius: 0.6rem !important;
    color: var(--ja-text-primary, #20201d) !important;
    background: var(--ja-surface, #fff) !important;
    box-shadow: none !important;
    text-align: left;
    font-size: 0.85rem !important;
    font-weight: 400 !important;
  }
  .quick-invoice__unbilled {
    color: var(--ja-text-primary, #20201d);
    font-weight: 700;
  }
  .quick-invoice__project span,
  .quick-invoice__choice span {
    color: var(--ja-text-secondary, #57574f);
    font-size: 0.8rem;
  }
  .quick-invoice__project[aria-pressed='true'],
  .quick-invoice__choice[aria-pressed='true'] {
    border-color: var(--ja-primary, #292925) !important;
    box-shadow: inset 0 0 0 1px var(--ja-primary, #292925) !important;
    background: var(--ja-surface-raised, #eeeee9) !important;
  }
  .quick-invoice__chosen {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .quick-invoice__chosen div {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .quick-invoice__chosen span {
    color: var(--ja-text-secondary, #57574f);
    font-size: 0.85rem;
  }
  .quick-invoice__choices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
    gap: 0.5rem;
  }
  .quick-invoice__dates {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.75rem;
  }
  .quick-invoice__stale {
    opacity: 0.55;
    transition: opacity 0.2s;
  }
  .quick-invoice__stale,
  .quick-invoice__amount > div {
    display: grid;
    gap: 0.85rem;
  }
  .quick-invoice__total {
    display: grid;
    gap: 0.1rem;
  }
  .quick-invoice__total span {
    color: var(--ja-text-secondary, #57574f);
    font-size: 0.85rem;
  }
  .quick-invoice__total strong {
    font-size: clamp(1.6rem, 5vw, 2.1rem);
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .quick-invoice__lines {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  .quick-invoice__lines td,
  .quick-invoice__lines th {
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--ja-border-subdued, #e4e4df);
    text-align: left;
    vertical-align: top;
  }
  .quick-invoice__lines td:first-child {
    display: grid;
    gap: 0.1rem;
    padding-right: 0.75rem;
  }
  .quick-invoice__lines small {
    color: var(--ja-text-muted, #6b6b62);
  }
  .quick-invoice__group-row th {
    padding-top: 0.75rem;
    color: var(--ja-text-secondary, #57574f);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .quick-invoice__line-label {
    overflow-wrap: anywhere;
  }
  .quick-invoice__money {
    text-align: right !important;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .quick-invoice__lines tfoot th {
    font-weight: 600;
  }
  .quick-invoice__grand th,
  .quick-invoice__grand td {
    border-bottom: 0;
    font-size: 1rem;
    font-weight: 800;
  }
  .quick-invoice__facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    margin: 0;
    font-size: 0.85rem;
  }
  .quick-invoice__facts dt {
    color: var(--ja-text-muted, #6b6b62);
  }
  .quick-invoice__facts dd {
    margin: 0;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .quick-invoice__warnings {
    padding: 0.75rem;
    border-radius: 0.6rem;
    border: 1px solid var(--ja-border-subdued, #e4e4df);
    background: var(--ja-canvas, #f4f4f2);
  }
  .quick-invoice__warnings--danger {
    border-color: color-mix(in srgb, var(--ja-status-danger, #dc2626) 45%, white);
    background: color-mix(in srgb, var(--ja-status-danger, #dc2626) 7%, white);
  }
  .quick-invoice__warnings--warning {
    border-color: color-mix(in srgb, var(--ja-status-warning, #d97706) 45%, white);
    background: color-mix(in srgb, var(--ja-status-warning, #d97706) 8%, white);
  }
  .quick-invoice__warnings ul {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .quick-invoice__warnings li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem 0.75rem;
    font-size: 0.85rem;
  }
  .quick-invoice__warnings li span {
    flex: 1 1 14rem;
    min-width: 0;
  }
  .quick-invoice__split,
  .quick-invoice__done {
    display: grid;
    gap: 0.35rem;
    padding: 0.75rem;
    border: 1px solid var(--ja-border-subdued, #e4e4df);
    border-radius: 0.6rem;
    background: var(--ja-canvas, #f4f4f2);
    min-width: 0;
  }
  .quick-invoice__done {
    border-color: color-mix(in srgb, var(--ja-status-success, #15803d) 45%, white);
    background: color-mix(in srgb, var(--ja-status-success, #15803d) 6%, white);
  }
  .quick-invoice__split ul,
  .quick-invoice__done ul {
    display: grid;
    gap: 0.3rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .quick-invoice__split li,
  .quick-invoice__done li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.25rem 0.75rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .quick-invoice__split small {
    color: var(--ja-text-muted, #6b6b62);
  }
  .quick-invoice__done a {
    font-weight: 600;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }
  .quick-invoice__suggestion {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
  }
  .quick-invoice__advanced {
    border-top: 1px solid var(--ja-border-subdued, #e4e4df);
    padding-top: 0.6rem;
  }
  .quick-invoice__advanced summary {
    cursor: pointer;
    min-height: 2.75rem;
    display: flex;
    align-items: center;
    font-weight: 700;
    font-size: 0.85rem;
  }
  .quick-invoice__advanced[open] {
    display: grid;
    gap: 0.75rem;
  }
  .quick-invoice__advanced-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .quick-invoice__actionbar {
    position: sticky;
    bottom: 0;
    z-index: 2;
    display: grid;
    gap: 0.4rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--ja-border-strong, #d1d1c9);
    border-radius: var(--ja-radius, 1rem);
    background: var(--ja-surface, #fff);
    box-shadow: 0 -0.4rem 1.2rem rgb(25 25 20 / 0.08);
  }
  .quick-invoice__actionbar-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .quick-invoice__actionbar-total {
    display: grid;
    min-width: 0;
  }
  .quick-invoice__actionbar-total span {
    color: var(--ja-text-secondary, #57574f);
    font-size: 0.8rem;
  }
  .quick-invoice__actionbar-total strong {
    font-size: 1.25rem;
    font-variant-numeric: tabular-nums;
  }
  .quick-invoice__create {
    min-width: 12rem;
    font-size: 0.95rem !important;
  }
  .quick-invoice__create:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .quick-invoice__actionbar-buttons {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
  }
  .quick-invoice__secondary {
    min-height: 2.75rem;
    padding: 0 0.5rem !important;
    border: 0 !important;
    background: none !important;
    box-shadow: none !important;
    color: var(--ja-text-primary, #20201d) !important;
    text-decoration: underline;
    font-weight: 600 !important;
    font-size: 0.9rem !important;
    cursor: pointer;
  }
  .quick-invoice__confirm {
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px solid var(--ja-border-strong, #d1d1c9);
    border-radius: 0.6rem;
    background: var(--ja-canvas, #f4f4f2);
  }
  .quick-invoice__confirm p {
    margin: 0;
    font-size: 0.85rem;
  }
  .quick-invoice__confirm-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .quick-invoice__amber {
    color: #92400e;
    font-weight: 600;
  }
  .quick-invoice__total small {
    color: var(--ja-text-secondary, #57574f);
    font-size: 0.85rem;
  }
  .quick-invoice__create-message {
    margin: 0;
    color: var(--ja-red, #b42318);
    font-weight: 700;
  }
  @media (max-width: 600px) {
    .quick-invoice__create {
      width: 100%;
    }
    .quick-invoice__actionbar-buttons {
      width: 100%;
      flex-direction: row-reverse;
      justify-content: space-between;
    }
    .quick-invoice__actionbar-buttons .quick-invoice__create {
      flex: 1 1 auto;
      width: auto;
    }
  }
</style>
