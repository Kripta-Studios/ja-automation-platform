/** Only record destinations from the authorized notification DTO may become links. */
export function notificationTargetPath(value: unknown): string | null {
  return typeof value === 'string' &&
    value === value.trim() &&
    /^\/app\/(?:time|expenses|reports|projects|pay|billing|crew)(?:\/[A-Za-z0-9_-]+)*$/u.test(value)
    ? value
    : null;
}

const OPEN_TARGET =
  /^\/app\/(?:time|expenses|reports|projects|pay|billing|crew)(?:\/[A-Za-z0-9_-]+)*(?:\?[A-Za-z0-9_=&%.-]*)?$/u;

/**
 * Where "open this notification" may land: an in-app record path with an
 * optional plain query (for example `/app/time?day=2026-11-16&focus=hours`).
 * Anything else (absolute URLs, `//host`, fragments, odd characters) is refused.
 */
export function notificationOpenTarget(value: unknown): string | null {
  return typeof value === 'string' && OPEN_TARGET.test(value) ? value : null;
}
