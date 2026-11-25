import type { DatabaseSync } from 'node:sqlite';
import { PAY_INTERVALS, type PayInterval } from '@ja/billing-engine';
import {
  CLIENT_BILLING_CADENCES,
  assignmentPayInterval,
  nextInvoicePeriod,
  nextPayPeriod,
  personPayInterval,
  type ClientBillingCadence,
} from '@ja/database';
import type { PersonPayIntervalView } from '$lib/portal/interval-copy';

export type { PersonPayIntervalView };

/**
 * Pay and billing intervals for portal pages (owner request 2026-11-25). The settings are read
 * only where pay or client billing is already shown (Owner / Finance, or the person's own
 * My Pay); they choose periods and never change amounts.
 */

export function personPayIntervalView(
  sqlite: DatabaseSync,
  userId: string,
  today = new Date().toISOString().slice(0, 10),
): PersonPayIntervalView {
  const own = personPayInterval(sqlite, userId);
  const next = nextPayPeriod(sqlite, userId, { today });
  const members = sqlite
    .prepare(
      `SELECT pm.id,p.project_number,p.name FROM project_member pm JOIN project p ON p.id=pm.project_id
        WHERE pm.user_id=? AND pm.status='active' AND (pm.ends_on IS NULL OR pm.ends_on>=?)
        ORDER BY p.project_number,pm.starts_on`,
    )
    .all(userId, today) as Array<{ id: string; project_number: string; name: string }>;
  const overrides: PersonPayIntervalView['overrides'] = [];
  for (const member of members) {
    const setting = assignmentPayInterval(sqlite, member.id);
    if (setting?.interval)
      overrides.push({
        projectMemberId: member.id,
        projectNumber: member.project_number,
        projectName: member.name,
        interval: setting.interval,
      });
  }
  return {
    interval: own?.interval ?? null,
    anchorDate: own?.anchorDate ?? null,
    version: own?.version ?? 0,
    nextStart: next.source === 'person' ? (next.period?.start ?? null) : null,
    nextEnd: next.source === 'person' ? (next.period?.end ?? null) : null,
    overrides,
  };
}

/** Add `next_period_start` / `next_period_end` to billing stream rows (finance views only). */
export function withNextInvoicePeriods<T extends Record<string, unknown>>(
  sqlite: DatabaseSync,
  rules: readonly T[],
  today = new Date().toISOString().slice(0, 10),
): Array<T & { next_period_start: string | null; next_period_end: string | null }> {
  return rules.map((rule) => {
    let period: { start: string; end: string } | null = null;
    try {
      period =
        rule.id && rule.project_id && rule.cadence_type
          ? nextInvoicePeriod(
              sqlite,
              {
                id: String(rule.id),
                project_id: String(rule.project_id),
                cadence_type: String(rule.cadence_type),
                anchor_date: rule.anchor_date == null ? null : String(rule.anchor_date),
                monthly_cutoff_day:
                  rule.monthly_cutoff_day == null ? null : Number(rule.monthly_cutoff_day),
                effective_from: rule.effective_from == null ? null : String(rule.effective_from),
                effective_to: rule.effective_to == null ? null : String(rule.effective_to),
              },
              today,
            )
          : null;
    } catch {
      period = null;
    }
    return {
      ...rule,
      next_period_start: period?.start ?? null,
      next_period_end: period?.end ?? null,
    };
  });
}

export type IntervalFormResult<T> =
  | { ok: true; value: T }
  | { ok: false; fieldErrors: Record<string, string[]> };

const ISO = /^\d{4}-\d{2}-\d{2}$/u;

export function parsePayIntervalForm(form: FormData): IntervalFormResult<{
  interval: PayInterval | null;
  anchorDate: string | null;
  expectedVersion: number;
}> {
  const interval = String(form.get('payInterval') ?? '').trim();
  const anchorDate = String(form.get('payAnchorDate') ?? '').trim();
  const rawVersion = String(form.get('expectedVersion') ?? '');
  const version = /^\d{1,9}$/u.test(rawVersion) ? Number(rawVersion) : -1;
  const fieldErrors: Record<string, string[]> = {};
  if (interval && !(PAY_INTERVALS as readonly string[]).includes(interval))
    fieldErrors.payInterval = ['Choose how often this person is paid.'];
  if (anchorDate && (!ISO.test(anchorDate) || interval !== 'every_14_days'))
    fieldErrors.payAnchorDate = ['Choose a valid first day.'];
  if (!Number.isSafeInteger(version) || version < 0)
    fieldErrors.expectedVersion = ['Reload the page and try again.'];
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return {
    ok: true,
    value: {
      interval: (interval || null) as PayInterval | null,
      anchorDate: anchorDate || null,
      expectedVersion: version,
    },
  };
}

export function parseClientIntervalForm(form: FormData): IntervalFormResult<{
  cadence: ClientBillingCadence | null;
  anchorDate: string | null;
  monthlyCutoffDay: number | null;
  expectedVersion: number;
}> {
  const cadence = String(form.get('billingInterval') ?? '').trim();
  const anchorDate = String(form.get('billingAnchorDate') ?? '').trim();
  const cutoff = String(form.get('monthlyCutoffDay') ?? '').trim();
  const rawVersion = String(form.get('expectedVersion') ?? '');
  const version = /^\d{1,9}$/u.test(rawVersion) ? Number(rawVersion) : -1;
  const fieldErrors: Record<string, string[]> = {};
  if (cadence && !(CLIENT_BILLING_CADENCES as readonly string[]).includes(cadence))
    fieldErrors.billingInterval = ['Choose how often this client is invoiced.'];
  if (cadence === 'every_14_days' && !ISO.test(anchorDate))
    fieldErrors.billingAnchorDate = ['Choose the first day of a 2-week period.'];
  const day = cutoff ? Number(cutoff) : null;
  if (cadence === 'monthly' && day !== null && (!Number.isInteger(day) || day < 1 || day > 28))
    fieldErrors.monthlyCutoffDay = ['Use a day from 1 to 28, or leave it empty.'];
  if (!Number.isSafeInteger(version) || version < 0)
    fieldErrors.expectedVersion = ['Reload the page and try again.'];
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return {
    ok: true,
    value: {
      cadence: (cadence || null) as ClientBillingCadence | null,
      anchorDate: cadence === 'every_14_days' ? anchorDate : null,
      monthlyCutoffDay: cadence === 'monthly' ? day : null,
      expectedVersion: version,
    },
  };
}

export type AssignmentPayIntervalValue = {
  /** Own override (null = same as the person). */
  interval: PayInterval | null;
  anchorDate: string | null;
  version: number;
  /** The person default shown as "Same as the person (…)". */
  personInterval: PayInterval | null;
};

/** Project Team tab (Owner / Finance): pay interval per assignment. */
export function projectAssignmentPayIntervals(
  sqlite: DatabaseSync,
  projectId: string,
): Record<string, AssignmentPayIntervalValue> {
  const members = sqlite
    .prepare('SELECT id,user_id FROM project_member WHERE project_id=?')
    .all(projectId) as Array<{ id: string; user_id: string }>;
  const people = new Map<string, PayInterval | null>();
  return Object.fromEntries(
    members.map((member) => {
      if (!people.has(member.user_id))
        people.set(member.user_id, personPayInterval(sqlite, member.user_id)?.interval ?? null);
      const own = assignmentPayInterval(sqlite, member.id);
      return [
        member.id,
        {
          interval: own?.interval ?? null,
          anchorDate: own?.anchorDate ?? null,
          version: own?.version ?? 0,
          personInterval: people.get(member.user_id) ?? null,
        },
      ];
    }),
  );
}
