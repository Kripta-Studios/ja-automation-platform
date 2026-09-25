import { describe, expect, it } from 'vitest';
import { ValidationError } from '@ja/database';
import { buildCorrectionPatch } from '../../apps/portal/src/lib/server/actions/correction-draft-fields.js';
import { dailyCorrectionFields } from '../../apps/portal/src/lib/portal/correction-fields.js';

describe('correction form conversion', () => {
  it('requires an actual revised time value and keeps duration fields exact', () => {
    const original = {
      work_date: '2026-08-20',
      category: 'regular',
      minutes: 6,
      activity_summary: 'Initial activity',
      activity_code: null,
      site: null,
      start_time: null,
      end_time: null,
      break_minutes: null,
    };
    const form = {
      correctionFields: 'time_entry',
      workDate: '2026-08-20',
      category: 'regular',
      minutes: '6',
      activitySummary: 'Initial activity',
      activityCode: '',
      site: '',
    };
    expect(() => buildCorrectionPatch('time_entry', form, original)).toThrow(ValidationError);
    expect(
      buildCorrectionPatch(
        'time_entry',
        {
          ...form,
          activitySummary: 'Detailed conveyor wiring work',
          minutes: '7',
        },
        original,
      ),
    ).toEqual({
      activitySummary: 'Detailed conveyor wiring work',
      minutes: 7,
    });
  });

  it('converts expense amount to exact minor units and changes only revised fields', () => {
    const original = {
      spent_on: '2026-08-20',
      vendor: 'Hotel A',
      category: 'hotel',
      description: 'Project lodging',
      amount_minor: 1000,
      occurred_time_local: null,
      payment_method: null,
      time_entry_id: null,
    };
    const form = {
      correctionFields: 'expense',
      spentOn: '2026-08-20',
      vendor: 'Hotel A',
      category: 'hotel',
      description: 'Project lodging',
      amount: '10.00',
      occurredTimeLocal: '',
      paymentMethod: '',
      timeEntryId: '',
    };
    expect(() => buildCorrectionPatch('expense', form, original)).toThrow(ValidationError);
    expect(
      buildCorrectionPatch(
        'expense',
        { ...form, vendor: 'Hotel Central', amount: '12.34' },
        original,
      ),
    ).toEqual({ vendor: 'Hotel Central', amountMinor: 1234 });
    expect(() => buildCorrectionPatch('expense', { ...form, amount: '12.345' }, original)).toThrow(
      ValidationError,
    );
  });

  it('does not treat an empty daily downtime column rendered as zero as a correction', () => {
    const original: Record<string, unknown> = Object.fromEntries(
      dailyCorrectionFields.map((field) => [field.column, null]),
    );
    Object.assign(original, {
      work_date: '2026-08-20',
      summary: 'Installed site equipment',
      tasks_completed: 'Commissioned panel',
      safety_related: 0,
    });
    const form: Record<string, unknown> = Object.fromEntries(
      dailyCorrectionFields.map((field) => [field.name, '']),
    );
    Object.assign(form, {
      correctionFields: 'daily_report',
      workDate: '2026-08-20',
      summary: 'Installed site equipment',
      tasksCompleted: 'Commissioned panel',
      downtimeMinutes: '0',
    });
    expect(() => buildCorrectionPatch('daily_report', form, original)).toThrow(ValidationError);
    expect(
      buildCorrectionPatch(
        'daily_report',
        {
          ...form,
          summary: 'Installed and verified site equipment',
        },
        original,
      ),
    ).toEqual({ summary: 'Installed and verified site equipment' });
  });
});
