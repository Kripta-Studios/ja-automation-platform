export type ReportAutosaveSnapshot = Readonly<Record<string, string>>;

/** The existing edit form's values, taken from loaded server data, never live typing. */
export function loadedReportAutosaveSnapshot(
  type: string,
  report: Readonly<Record<string, unknown>>,
): ReportAutosaveSnapshot | null {
  if (type !== 'daily' && type !== 'technical') return null;
  const display = (value: unknown) => (value === null || value === undefined ? '' : String(value));
  const snapshot: Record<string, string> = {
    id: display(report.id),
    type,
    projectId: display(report.project_id),
    version: display(report.version),
    safetyRelated: [true, 1, '1'].includes(report.safety_related as boolean | number | string)
      ? 'on'
      : 'off',
  };
  const fields =
    type === 'daily'
      ? [
          'workDate',
          'siteShift',
          'summary',
          'tasksCompleted',
          'problemsFound',
          'correctiveActions',
          'clientDecisions',
          'openItems',
          'standbyReason',
          'blockers',
          'nextDayPlan',
          'customerContact',
        ]
      : [
          'systemName',
          'plantSite',
          'areaLine',
          'stationMachine',
          'systemType',
          'plcPlatform',
          'controller',
          'hmiScada',
          'networkProtocol',
          'softwareVersion',
          'programReference',
          'problemSymptom',
          'diagnosisRootCause',
          'productionImpact',
          'validation',
          'validationResult',
          'openRisk',
          'rollbackPlan',
        ];
  for (const field of fields) {
    const column = field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    snapshot[field] = display(report[column]);
  }
  if (type === 'daily') snapshot.downtimeMinutes = display(report.downtime_minutes ?? 0);
  else {
    snapshot.reportDate = display(report.report_date ?? report.created_at).slice(0, 10);
    snapshot.changePerformed = display(report.change_performed ?? report.change_summary);
  }
  return snapshot;
}

/** An identical stored copy is redundant; different or unknown content remains protected. */
export function reportRecoveryMatchesLoaded(
  saved: ReportAutosaveSnapshot,
  loaded: ReportAutosaveSnapshot | null,
  successfulRead: boolean,
): boolean {
  if (!successfulRead || !loaded) return false;
  for (const field of ['id', 'type', 'projectId'])
    if (!saved[field] || saved[field] !== loaded[field]) return false;
  if (!/^[1-9]\d*$/.test(saved.version ?? '') || !/^[1-9]\d*$/.test(loaded.version ?? ''))
    return false;
  const keys = new Set([...Object.keys(saved), ...Object.keys(loaded)]);
  return [...keys].every((key) => key === 'version' || saved[key] === loaded[key]);
}

/** Commands with no report fields must not silently act on a different report edit. */
export function reportFieldlessActionReadiness(
  current: ReportAutosaveSnapshot | null,
  confirmed: ReportAutosaveSnapshot | null,
  unresolvedFailure: boolean,
  recovery: ReportAutosaveSnapshot | null,
): 'ready' | 'dirty' | 'blocked' {
  if (!current || !confirmed || unresolvedFailure) return 'blocked';
  if (current.version !== confirmed.version || !/^[1-9]\d*$/.test(current.version ?? ''))
    return 'blocked';
  for (const field of ['id', 'type', 'projectId'])
    if (!current[field] || current[field] !== confirmed[field]) return 'blocked';
  const currentKeys = Object.keys(current);
  const confirmedKeys = Object.keys(confirmed);
  if (currentKeys.length !== confirmedKeys.length || currentKeys.some((key) => !(key in confirmed)))
    return 'blocked';
  if (
    recovery &&
    !reportRecoveryMatchesLoaded(recovery, confirmed, true) &&
    !(recovery.version === current.version && reportRecoveryMatchesLoaded(recovery, current, true))
  )
    return 'blocked';
  return reportRecoveryMatchesLoaded(current, confirmed, true) ? 'ready' : 'dirty';
}

/** Decode the framework action envelope before inspecting its application data. */
export function decodeReportAutosaveResult(
  text: string,
  deserialize: (text: string) => unknown,
): Record<string, unknown> {
  try {
    const action = deserialize(text) as { type?: unknown; data?: unknown } | null;
    if (
      !action ||
      (action.type !== 'success' && action.type !== 'failure') ||
      !action.data ||
      typeof action.data !== 'object' ||
      Array.isArray(action.data)
    )
      return {};
    return action.data as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Only an acknowledgement of this exact optimistic request may advance its base. */
export function acknowledgeReportAutosave(
  sent: ReportAutosaveSnapshot,
  current: ReportAutosaveSnapshot,
  result: Record<string, unknown>,
): { version: number; retained: ReportAutosaveSnapshot | null } | null {
  const baseVersion = Number(sent.version);
  const version = result.version;
  if (
    result.success !== true ||
    result.autosaved !== true ||
    result.id !== sent.id ||
    result.type !== sent.type ||
    current.id !== sent.id ||
    current.type !== sent.type ||
    current.projectId !== sent.projectId ||
    current.version !== sent.version ||
    !Number.isInteger(baseVersion) ||
    baseVersion < 1 ||
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    (version !== baseVersion && version !== baseVersion + 1)
  )
    return null;
  const keys = new Set([...Object.keys(sent), ...Object.keys(current)]);
  const changed = [...keys].some((key) => key !== 'version' && sent[key] !== current[key]);
  return { version, retained: changed ? { ...current, version: String(version) } : null };
}

/** A native submit can await the existing request without starting a second write. */
export function createReportAutosaveFlight() {
  let pending: Promise<boolean> | null = null;
  return {
    busy: () => pending !== null,
    wait: () => pending ?? Promise.resolve(true),
    run(task: () => Promise<boolean>): Promise<boolean> {
      if (pending) return pending;
      const flight = Promise.resolve().then(task);
      pending = flight;
      void flight.then(
        () => {
          if (pending === flight) pending = null;
        },
        () => {
          if (pending === flight) pending = null;
        },
      );
      return flight;
    },
  };
}

export type StoredReportAutosave = Readonly<{
  version: number;
  savedAt: string;
  payload: ReportAutosaveSnapshot;
}>;

const namedControlSelector = 'input[name], select[name], textarea[name]';

/**
 * Keep report drafts isolated by the authenticated user and report identity.
 * The user id is supplied by the authenticated page data; no shared fallback
 * partition is ever used for recovery drafts.
 */
export function reportAutosaveStorageKey(userId: string, type: string, reportId: string): string {
  return `ja-report-autosave:${encodeURIComponent(userId)}:${type}:${encodeURIComponent(reportId)}`;
}

export function snapshotReportForm(form: HTMLFormElement, version: number): ReportAutosaveSnapshot {
  const payload: Record<string, string> = {};
  for (const element of form.querySelectorAll(namedControlSelector)) {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      )
    )
      continue;
    const { name } = element;
    if (!name || (element instanceof HTMLInputElement && element.type === 'file')) continue;
    if (
      element instanceof HTMLInputElement &&
      (element.type === 'checkbox' || element.type === 'radio')
    ) {
      if (element.type === 'radio' && !element.checked) continue;
      payload[name] = element.checked ? 'on' : 'off';
      continue;
    }
    payload[name] = element.value;
  }
  payload.version = String(version);
  return payload;
}

export function snapshotToFormData(snapshot: ReportAutosaveSnapshot): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(snapshot)) form.set(name, value);
  return form;
}

export function applyReportSnapshot(form: HTMLFormElement, snapshot: ReportAutosaveSnapshot): void {
  for (const element of form.querySelectorAll(namedControlSelector)) {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      )
    )
      continue;
    const { name } = element;
    if (!name || !(name in snapshot)) continue;
    const value = snapshot[name];
    if (value === undefined) continue;
    if (
      element instanceof HTMLInputElement &&
      (element.type === 'checkbox' || element.type === 'radio')
    ) {
      element.checked = value === 'on' || value === 'true' || value === '1';
    } else element.value = value;
  }
}

export function readStoredReportAutosave(
  storage: Storage | undefined,
  key: string,
): StoredReportAutosave | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredReportAutosave>;
    const version = value.version;
    const savedAt = value.savedAt;
    const rawPayload = value.payload;
    if (
      !value ||
      typeof value !== 'object' ||
      typeof version !== 'number' ||
      !Number.isInteger(version) ||
      version < 1 ||
      typeof savedAt !== 'string' ||
      !rawPayload ||
      typeof rawPayload !== 'object'
    )
      return null;
    const payload = Object.fromEntries(
      Object.entries(rawPayload).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
    return { version, savedAt, payload };
  } catch {
    return null;
  }
}

export function writeStoredReportAutosave(
  storage: Storage | undefined,
  key: string,
  value: StoredReportAutosave,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredReportAutosave(storage: Storage | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Private browsing and quota policies can reject cleanup; the next save can retry it.
  }
}
