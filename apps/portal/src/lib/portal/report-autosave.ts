export type ReportAutosaveSnapshot = Readonly<Record<string, string>>;

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
