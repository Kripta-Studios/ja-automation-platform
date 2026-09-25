import { encodeTechnicalReportChange } from '@ja/schemas';
import { ValidationError } from '@ja/database';
import { dailyCorrectionFields, technicalCorrectionFields } from '$lib/portal/correction-fields';
import { decimalToMinor } from '../action-utils';

type RecordType = 'time_entry' | 'expense' | 'daily_report' | 'technical_report';

const timeCategories = new Set([
  'regular',
  'overtime',
  'travel',
  'standby',
  'commissioning',
  'weekend_holiday',
  'remote_support',
  'training',
  'internal',
]);
const expenseCategories = new Set([
  'hotel',
  'rental_car',
  'fuel',
  'tolls',
  'parking',
  'airfare',
  'ground_transport',
  'meals',
  'per_diem',
  'materials',
  'tools',
  'shipping',
  'phone_data',
  'visa_permit',
  'other',
]);

function textField(
  form: Record<string, unknown>,
  name: string,
  max = 5000,
  required = false,
): string {
  const raw = form[name];
  if (typeof raw !== 'string') throw new ValidationError(`${name} is required`);
  const value = raw.trim();
  if (value.length > max || (required && value.length < 1))
    throw new ValidationError(`${name} is invalid`);
  return value;
}

function integerField(
  form: Record<string, unknown>,
  name: string,
  min: number,
  max: number,
): number {
  const raw = form[name];
  if (typeof raw !== 'string' || !/^\d+$/.test(raw))
    throw new ValidationError(`${name} must be a whole number`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new ValidationError(`${name} is outside the allowed range`);
  return value;
}

function dateField(form: Record<string, unknown>, name: string): string {
  const value = textField(form, name, 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError(`${name} is invalid`);
  return value;
}

function optional(value: string): string | null {
  return value || null;
}

/** Build only changed operational fields. The repository rechecks scope and writes the immutable link. */
export function buildCorrectionPatch(
  recordType: RecordType,
  form: Record<string, unknown>,
  original: Record<string, unknown>,
): Record<string, unknown> {
  if (form.correctionFields !== recordType)
    throw new ValidationError('Revised correction fields are required');
  const patch: Record<string, unknown> = {};
  const add = (name: string, column: string, value: unknown) => {
    const before = original[column] === '' ? null : (original[column] ?? null);
    const after = value === '' ? null : value;
    if (before !== after) patch[name] = after;
  };
  if (recordType === 'time_entry') {
    const category = textField(form, 'category', 100, true);
    if (!timeCategories.has(category)) throw new ValidationError('Time category is invalid');
    const summary = textField(form, 'activitySummary', 5000, true);
    if (summary.length < 3) throw new ValidationError('Activity summary is too short');
    const start = optional(form.startTime === undefined ? '' : textField(form, 'startTime', 5));
    const end = optional(form.endTime === undefined ? '' : textField(form, 'endTime', 5));
    const breakMinutes = start || end ? integerField(form, 'breakMinutes', 0, 1439) : null;
    add('workDate', 'work_date', dateField(form, 'workDate'));
    add('category', 'category', category);
    add('minutes', 'minutes', integerField(form, 'minutes', 0, 1440));
    add('activitySummary', 'activity_summary', summary);
    add('activityCode', 'activity_code', optional(textField(form, 'activityCode', 100)));
    add('site', 'site', optional(textField(form, 'site', 200)));
    add('startTime', 'start_time', start);
    add('endTime', 'end_time', end);
    add('breakMinutes', 'break_minutes', breakMinutes);
  } else if (recordType === 'expense') {
    const category = textField(form, 'category', 100, true);
    if (!expenseCategories.has(category)) throw new ValidationError('Expense category is invalid');
    const minor = decimalToMinor(form.amount);
    if (!minor || !/^\d+$/.test(minor)) throw new ValidationError('Expense amount is invalid');
    const amount = Number(minor);
    if (!Number.isSafeInteger(amount) || amount <= 0)
      throw new ValidationError('Expense amount is invalid');
    const occurred = optional(textField(form, 'occurredTimeLocal', 5));
    if (occurred && !/^([01]\d|2[0-3]):[0-5]\d$/.test(occurred))
      throw new ValidationError('Expense occurrence time is invalid');
    add('spentOn', 'spent_on', dateField(form, 'spentOn'));
    add('vendor', 'vendor', textField(form, 'vendor', 200, true));
    add('category', 'category', category);
    const description = textField(form, 'description', 5000, true);
    if (description.length < 3) throw new ValidationError('Expense description is too short');
    add('description', 'description', description);
    add('amountMinor', 'amount_minor', amount);
    add('occurredTimeLocal', 'occurred_time_local', occurred);
    add('paymentMethod', 'payment_method', optional(textField(form, 'paymentMethod', 80)));
    const timeEntryId = optional(textField(form, 'timeEntryId', 64));
    if (timeEntryId && !/^[0-9a-f-]{36}$/i.test(timeEntryId))
      throw new ValidationError('Related logged hours are invalid');
    add('timeEntryId', 'time_entry_id', timeEntryId);
  } else {
    const fields =
      recordType === 'daily_report' ? dailyCorrectionFields : technicalCorrectionFields;
    const changeFields: Record<string, string> = {};
    for (const field of fields) {
      if (field.kind === 'checkbox') {
        const value = form[field.name] === 'on';
        const before = original[field.column] === true || Number(original[field.column] ?? 0) === 1;
        if (before !== value) patch[field.name] = value;
        continue;
      }
      if (field.kind === 'number') {
        const value = integerField(form, field.name, 0, 1440);
        if (Number(original[field.column] ?? 0) !== value) patch[field.name] = value;
        continue;
      }
      const value =
        field.kind === 'date'
          ? dateField(form, field.name)
          : textField(form, field.name, 5000, field.required ?? false);
      if (field.required && value.length < 1)
        throw new ValidationError(`${field.name} is required`);
      if (
        recordType === 'technical_report' &&
        ['problemSymptom', 'diagnosisRootCause', 'changePerformed'].includes(field.name)
      ) {
        changeFields[field.name] = value;
        continue;
      }
      add(field.name, field.column, field.required ? value : optional(value));
    }
    if (recordType === 'technical_report') {
      const changed =
        changeFields.problemSymptom !== String(original.problem_symptom ?? '') ||
        changeFields.diagnosisRootCause !== String(original.diagnosis_root_cause ?? '') ||
        changeFields.changePerformed !== String(original.change_performed ?? '');
      if (changed) {
        patch.changeSummary = encodeTechnicalReportChange({
          problemSymptom: changeFields.problemSymptom ?? '',
          diagnosisRootCause: changeFields.diagnosisRootCause ?? '',
          changePerformed: changeFields.changePerformed ?? '',
        });
      }
    }
  }
  if (Object.keys(patch).length === 0)
    throw new ValidationError('Change at least one operational field before creating a correction');
  return patch;
}
