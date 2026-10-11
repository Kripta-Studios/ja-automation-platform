import { randomUUID } from 'node:crypto';
import {
  AccessDeniedError,
  ConflictError,
  DigitalWorkAccessDeniedError,
  DigitalWorkConflictError,
  DigitalWorkNotFoundError,
  DigitalWorkValidationError,
  ReadinessError,
  ValidationError,
} from '@ja/database';
import {
  actionFail,
  actionFailure,
  type ActionMessageKey,
} from '$lib/server/actions/action-message';
import { isRealIsoDate } from '$lib/server/iso-date';

export type WorkflowLocale = 'en' | 'es' | 'pt';

export function requestKey(): string {
  return randomUUID();
}

export function validDateRange(start: string, end: string): boolean {
  return isRealIsoDate(start) && isRealIsoDate(end) && end >= start;
}

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value === 'string') values[name] = value;
  }
  const sourceValues = formData
    .getAll('source')
    .filter((value): value is string => typeof value === 'string');
  if (sourceValues.length) values.sources = JSON.stringify(sourceValues);
  return values;
}

export function selectedSourceRefs(formData: FormData): Array<{
  type: 'time' | 'expense';
  id: string;
  version: number;
}> {
  const refs: Array<{ type: 'time' | 'expense'; id: string; version: number }> = [];
  for (const value of formData.getAll('source')) {
    if (typeof value !== 'string') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error('Invalid selected source');
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('type' in parsed) ||
      !('id' in parsed) ||
      !('version' in parsed)
    )
      throw new Error('Invalid selected source');
    const source = parsed as { type?: unknown; id?: unknown; version?: unknown };
    if (
      (source.type !== 'time' && source.type !== 'expense') ||
      typeof source.id !== 'string' ||
      !source.id.trim() ||
      !Number.isSafeInteger(source.version) ||
      Number(source.version) < 1
    )
      throw new Error('Invalid selected source');
    refs.push({ type: source.type, id: source.id, version: Number(source.version) });
  }
  return refs;
}

export type EvidenceInput = {
  type:
    | 'time'
    | 'expense'
    | 'daily_report'
    | 'technical_report'
    | 'period_report'
    | 'customer_conformity'
    | 'document'
    | 'external';
  id: string;
  version?: number;
  note?: string;
};

export function evidenceFromForm(formData: FormData): EvidenceInput | undefined {
  const idValue = formData.get('evidenceId');
  const id = typeof idValue === 'string' ? idValue.trim() : '';
  if (!id) return undefined;
  const typeValue = formData.get('evidenceType');
  const allowed = new Set([
    'time',
    'expense',
    'daily_report',
    'technical_report',
    'period_report',
    'customer_conformity',
    'document',
    'external',
  ]);
  if (typeof typeValue !== 'string' || !allowed.has(typeValue))
    throw new Error('Invalid evidence type');
  const rawVersion = formData.get('evidenceVersion');
  const versionText = typeof rawVersion === 'string' ? rawVersion.trim() : '';
  let version: number | undefined;
  if (versionText) {
    if (
      !/^\d+$/u.test(versionText) ||
      !Number.isSafeInteger(Number(versionText)) ||
      Number(versionText) < 1
    )
      throw new Error('Invalid evidence version');
    version = Number(versionText);
  }
  const rawNote = formData.get('evidenceNote');
  const note = typeof rawNote === 'string' ? rawNote.trim() : '';
  return {
    type: typeValue as EvidenceInput['type'],
    id,
    ...(version === undefined ? {} : { version }),
    ...(note ? { note } : {}),
  };
}

export function parseProposedSettings(formData: FormData): unknown | undefined {
  const result: Record<string, unknown> = {};
  const textFields = [
    ['billingRuleId', 'billingRuleId'],
    ['effectiveFrom', 'effectiveFrom'],
    ['effectiveTo', 'effectiveTo'],
    ['streamType', 'streamType'],
    ['cadenceType', 'cadenceType'],
  ] as const;
  for (const [field, key] of textFields) {
    const value = formData.get(field);
    if (typeof value === 'string' && value.trim()) result[key] = value.trim();
  }
  const currency = formData.get('proposalCurrency');
  if (typeof currency === 'string' && currency.trim())
    result.currency = currency.trim().toUpperCase();
  const includeExpenses = formData.get('includeExpenses');
  if (includeExpenses === 'true') result.includeExpenses = true;
  if (includeExpenses === 'false') result.includeExpenses = false;
  const minimumMinutes = formData.get('minimumMinutes');
  if (typeof minimumMinutes === 'string' && minimumMinutes.trim()) {
    if (!/^\d+$/u.test(minimumMinutes.trim())) throw new Error('Invalid minimum minutes');
    result.minimumMinutes = Number(minimumMinutes.trim());
  }
  const fixedPrice = formData.get('fixedPrice');
  if (typeof fixedPrice === 'string' && fixedPrice.trim()) {
    const value = fixedPrice.trim();
    if (!/^\d{1,16}(?:\.\d{1,2})?$/u.test(value)) throw new Error('Invalid fixed price');
    const [whole, fraction = ''] = value.split('.');
    result.fixedPriceMinor = (
      BigInt(whole ?? '0') * 100n +
      BigInt(fraction.padEnd(2, '0') || '0')
    ).toString();
  }
  const note = formData.get('proposalNote');
  if (typeof note === 'string' && note.trim()) result.note = note.trim();
  return Object.keys(result).length ? result : undefined;
}

function failureDetails(
  error: unknown,
): { status: number; key: ActionMessageKey; code: string } | null {
  if (
    error instanceof DigitalWorkAccessDeniedError ||
    error instanceof AccessDeniedError ||
    error instanceof DigitalWorkNotFoundError
  )
    return {
      status: error instanceof DigitalWorkNotFoundError ? 404 : 403,
      key: 'problem.digitalWorkers.notAvailable',
      code: 'DIGITAL_WORK_NOT_AVAILABLE',
    };
  if (
    error instanceof DigitalWorkValidationError &&
    (error.message === 'Proposal end precedes start' ||
      /^(effectiveFrom|effectiveTo) (must be a real ISO date|is required or too long)$/u.test(
        error.message,
      ))
  )
    return {
      status: 400,
      key: 'problem.digitalWorkers.invalidDateRange',
      code: 'DIGITAL_WORK_INVALID_DATE_RANGE',
    };
  if (error instanceof DigitalWorkConflictError || error instanceof ConflictError)
    return { status: 409, key: 'problem.digitalWorkers.conflict', code: 'DIGITAL_WORK_CONFLICT' };
  if (error instanceof ReadinessError)
    return {
      status: 409,
      key: 'problem.digitalWorkers.readinessBlocked',
      code: 'DIGITAL_WORK_READINESS_BLOCKED',
    };
  if (error instanceof DigitalWorkValidationError || error instanceof ValidationError)
    return {
      status: 400,
      key: 'problem.digitalWorkers.invalidSelection',
      code: 'DIGITAL_WORK_INVALID',
    };
  return null;
}

export function workflowActionFailure(
  caught: unknown,
  operation: string,
  values: Record<string, string>,
) {
  const details = failureDetails(caught);
  if (!details) return actionFailure(caught, { operation, values });
  const englishMessage =
    caught instanceof ReadinessError
      ? 'Resolve the blockers in the source register, then refresh the case before trying again.'
      : details.status === 409
        ? 'The record changed while this form was open. Refresh and review the current version.'
        : details.status === 400
          ? 'Review the selected values and try again.'
          : 'This record is not available under your current access.';
  return actionFail(details.status, details.key, {}, englishMessage, {
    operation,
    values,
    code: details.code,
  });
}

export function workflowInputFailure(
  status: number,
  key:
    | 'problem.digitalWorkers.required'
    | 'problem.digitalWorkers.reasonMissing'
    | 'problem.digitalWorkers.invalidDateRange'
    | 'problem.digitalWorkers.invalidSelection',
  operation: string,
  values: Record<string, string>,
  fieldErrors: Record<string, string[]> = {},
) {
  const englishMessage =
    key === 'problem.digitalWorkers.reasonMissing'
      ? 'Add a review reason before saving.'
      : key === 'problem.digitalWorkers.invalidDateRange'
        ? 'Enter valid dates, with the end date on or after the start date.'
        : key === 'problem.digitalWorkers.required'
          ? 'Complete this field before saving.'
          : 'Choose a current project, stream, and source selection.';
  return actionFail(status, key, {}, englishMessage, {
    operation,
    values,
    fieldErrors,
  });
}

export function localeFromForm(
  formData: FormData,
  fallback: WorkflowLocale = 'en',
): WorkflowLocale {
  const value = formData.get('lang');
  return value === 'es' || value === 'pt' || value === 'en' ? value : fallback;
}
