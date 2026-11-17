/**
 * Time categories a person can choose when capturing hours. The Time screen shows the quick
 * ones as chips and the rest under "More types"; other capture screens (digital-worker
 * capture) offer the same list. Billing bills every non-overtime category at the regular
 * rate, and pay rules carry a dedicated standby method, so Standby is a supported choice.
 */
export const quickTimeCategories = ['regular', 'travel', 'overtime'] as const;
export const moreTimeCategories = ['standby'] as const;
export const captureTimeCategories = [...quickTimeCategories, ...moreTimeCategories] as const;
export type CaptureTimeCategory = (typeof captureTimeCategories)[number];

export const isCaptureTimeCategory = (value: unknown): value is CaptureTimeCategory =>
  typeof value === 'string' && (captureTimeCategories as readonly string[]).includes(value);
