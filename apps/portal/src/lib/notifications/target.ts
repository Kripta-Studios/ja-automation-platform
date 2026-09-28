/** Only record destinations from the authorized notification DTO may become links. */
export function notificationTargetPath(value: unknown): string | null {
  return typeof value === 'string' &&
    value === value.trim() &&
    /^\/app\/(?:time|expenses|reports|projects|pay|billing)(?:\/[A-Za-z0-9_-]+)*$/u.test(value)
    ? value
    : null;
}
