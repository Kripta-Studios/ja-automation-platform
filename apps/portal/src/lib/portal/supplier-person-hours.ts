import { durationMinutes } from './ui/time-entry-clock';

/**
 * T70: per-person hours in the supplier "Record team hours" form accept
 * 7.5, 7,5 or 7:30 — more than 0 and at most 24 hours. The browser marks the
 * exact input that fails instead of a generic batch error.
 */
export function validSupplierPersonHours(text: string): boolean {
  const minutes = durationMinutes(text);
  return minutes !== null && minutes > 0 && minutes <= 1440;
}
