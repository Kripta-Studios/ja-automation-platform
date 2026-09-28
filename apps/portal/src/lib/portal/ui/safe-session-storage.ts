/** Storage may be disabled by the browser or policy. Form actions must still run. */
export function readSessionItem(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function saveSessionItem(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Scroll and draft recovery are optional when storage is unavailable.
  }
}

export function removeSessionItem(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // A failed cleanup must not interrupt the active form.
  }
}
