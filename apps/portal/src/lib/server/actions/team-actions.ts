/**
 * People directory actions (Owner only):
 *
 * - fixPersonNames: save proposed human names for people whose stored name is
 *   a login. Each change goes through the same repository profile update as
 *   "Edit profile" (validation, session revocation rules, `worker.update` audit).
 *   E-mail and role are re-read on the server and kept unchanged.
 * - setPersonDefaultRates: the person's default internal hourly cost and pay
 *   rate, valid for every project in one currency. New assignments inherit
 *   them (project defaults still win). Saved through the finance repository
 *   (exact minor units, `*_rule.create` audit); an open default is superseded
 *   instead of overlapped.
 */
import { isCurrency, type Currency } from '@ja/billing-engine';
import {
  CANONICAL_OWNER_EMAIL,
  SYNTHETIC_OWNER_DEPLOYMENT_ID,
  SYNTHETIC_OWNER_EMAIL,
  SYNTHETIC_OWNER_TENANT_ID,
  AccessDeniedError,
  assertLiveSession,
} from '@ja/database';
import { uuidSchema } from '@ja/schemas';
import { openPortalRepository } from '$lib/server/portal-repository';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';
import { actionFail, actionFailure, actionSuccess } from './action-message';
import { rateMinor, withAssignmentFinanceTransaction } from './assignment-finance';
import { PayBillingIntervalRepository } from '@ja/database';
import { parsePayIntervalForm } from '$lib/server/intervals';

const MAX_RENAMES = 200;

function ownerFailure(event: PortalActionEvent) {
  if (!event.locals.user || !event.locals.session)
    return actionFail(401, 'action.error.unauthenticated', {}, 'Sign in again to continue.');
  const email = event.locals.user.email.trim().toLowerCase();
  const synthetic =
    process.env.NODE_ENV !== 'production' &&
    process.env.JA_TENANT_ID === SYNTHETIC_OWNER_TENANT_ID &&
    process.env.JA_DEPLOYMENT_ID === SYNTHETIC_OWNER_DEPLOYMENT_ID &&
    email === SYNTHETIC_OWNER_EMAIL;
  if (event.locals.user.role !== 'owner_admin' || (email !== CANONICAL_OWNER_EMAIL && !synthetic))
    return actionFail(403, 'action.error.forbidden', {}, 'Owner administration required');
  return null;
}

const decimalPattern = /^\d{1,9}(?:[.,]\d{1,2})?$/u;

export const teamActions = {
  fixPersonNames: async (event: PortalActionEvent) => {
    if (event.params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const denied = ownerFailure(event);
    if (denied) return denied;
    const form = await event.request.formData();
    const ids = form.getAll('workerId').map(String);
    const names = form.getAll('name').map((value) => String(value).replace(/\s+/gu, ' ').trim());
    if (!ids.length || ids.length !== names.length || ids.length > MAX_RENAMES)
      return actionFail(
        400,
        'problem.access.workerProfileInvalid',
        {},
        'Choose at least one person to rename.',
        { code: 'ACCESS_WORKER_PROFILE_INVALID', actionName: 'fixPersonNames' },
      );
    const invalid = ids.filter(
      (id, index) =>
        !uuidSchema.safeParse(id).success ||
        (names[index] ?? '').length < 2 ||
        (names[index] ?? '').length > 160,
    );
    if (invalid.length)
      return actionFail(
        400,
        'problem.access.nameRequired',
        {},
        'Every name needs 2 to 160 characters.',
        {
          code: 'ACCESS_WORKER_PROFILE_INVALID',
          actionName: 'fixPersonNames',
          values: { invalid: invalid.slice(0, 50).join(',') },
        },
      );
    let context: ReturnType<typeof openPortalRepository>;
    try {
      context = openPortalRepository(event.locals);
    } catch (error) {
      return actionFailure(error, { actionName: 'fixPersonNames' });
    }
    try {
      assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
      const read = context.sqlite.prepare('SELECT name,email,role FROM user WHERE id=?');
      let renamed = 0;
      withAssignmentFinanceTransaction(context.sqlite, () => {
        ids.forEach((id, index) => {
          const target = read.get(id) as { name: string; email: string; role: string } | undefined;
          if (!target) throw new Error('Person not found');
          const name = names[index]!;
          if (target.name === name) return;
          // Same validated profile update and audit as "Edit profile";
          // e-mail and role are the stored values, so nothing else changes.
          context.repository.updateWorkerProfile(context.principal, id, {
            name,
            email: target.email,
            role: target.role,
            joinedAt: '',
          });
          renamed += 1;
        });
      });
      return actionSuccess(
        'action.access.workerProfile.updated',
        { count: renamed },
        `${renamed} names updated`,
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'Person not found')
        return actionFail(
          409,
          'problem.access.userSelectionInvalid',
          {},
          'One of the people is no longer available. Reload the page and try again.',
          { code: 'ACCESS_PERSON_UNAVAILABLE', actionName: 'fixPersonNames' },
        );
      return actionFailure(error, { actionName: 'fixPersonNames' });
    } finally {
      context.sqlite.close();
    }
  },

  setPersonDefaultRates: async (event: PortalActionEvent) => {
    if (event.params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const denied = ownerFailure(event);
    if (denied) return denied;
    const object = await formObject(event.request);
    const text = (key: string) => (typeof object[key] === 'string' ? String(object[key]).trim() : '');
    const workerId = text('workerId');
    const currency = text('currency');
    const cost = text('internalCostHourlyRate');
    const pay = text('compensationRate');
    const basis = text('compensationBasis') === 'daily' ? 'daily' : 'hourly';
    const effectiveFrom = text('effectiveFrom');
    const values = { workerId, currency, internalCostHourlyRate: cost, compensationRate: pay, compensationBasis: basis, effectiveFrom };
    const fieldErrors: Record<string, string[]> = {};
    if (!uuidSchema.safeParse(workerId).success) fieldErrors.workerId = ['Choose a person.'];
    if (!isCurrency(currency)) fieldErrors.currency = ['Choose a currency.'];
    if (!decimalPattern.test(cost)) fieldErrors.internalCostHourlyRate = ['Use an amount like 25 or 25.50.'];
    if (!decimalPattern.test(pay)) fieldErrors.compensationRate = ['Use an amount like 20 or 20.50.'];
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(effectiveFrom)) fieldErrors.effectiveFrom = ['Choose a date.'];
    if (Object.keys(fieldErrors).length)
      return actionFail(400, 'problem.assignment.financeTermsRequired', {}, 'Complete the highlighted fields.', {
        code: 'TEAM_DEFAULT_RATES_INVALID',
        actionName: 'setPersonDefaultRates',
        fieldErrors,
        values,
      });
    let context: ReturnType<typeof openPortalRepository>;
    try {
      context = openPortalRepository(event.locals);
    } catch (error) {
      return actionFailure(error, { actionName: 'setPersonDefaultRates', values });
    }
    try {
      const open = (table: 'compensation_rule' | 'internal_cost_rule') =>
        context.sqlite
          .prepare(
            `SELECT id,effective_from FROM ${table}
              WHERE worker_id=? AND project_id IS NULL AND currency=?
                AND (effective_to IS NULL OR effective_to>=?)
              ORDER BY effective_from DESC LIMIT 1`,
          )
          .get(workerId, currency, effectiveFrom) as { id: string; effective_from: string } | undefined;
      const openPay = open('compensation_rule');
      const openCost = open('internal_cost_rule');
      if ((openPay && openPay.effective_from >= effectiveFrom) || (openCost && openCost.effective_from >= effectiveFrom))
        return actionFail(
          409,
          'problem.assignment.financeDatesMismatch',
          {},
          'A default rate already starts on or after this date. Choose a later date.',
          {
            code: 'TEAM_DEFAULT_RATES_DATE',
            actionName: 'setPersonDefaultRates',
            fieldErrors: { effectiveFrom: ['Choose a later date.'] },
            values,
          },
        );
      const notes = 'Default rate set from the person page';
      withAssignmentFinanceTransaction(context.sqlite, () => {
        const costInput = {
          workerId,
          currency: currency as Currency,
          hourlyRateMinor: rateMinor(cost),
          effectiveFrom,
          costMethod: 'loaded_hourly',
          overtimeMethod: 'BASE_RATE_MULTIPLIER' as const,
          notes,
        };
        if (openCost) context.v3.supersedeInternalCostRule(context.principal, openCost.id, costInput);
        else context.v3.createInternalCostRule(context.principal, costInput);
        const payInput = {
          workerId,
          currency: currency as Currency,
          ruleType: basis === 'daily' ? ('Daily' as const) : ('Hourly' as const),
          rateBasis: basis as 'hourly' | 'daily',
          rateMinor: rateMinor(pay),
          effectiveFrom,
          notes,
        };
        if (openPay) context.v3.supersedeCompensationRule(context.principal, openPay.id, payInput);
        else context.v3.createCompensationRule(context.principal, payInput);
      });
      return actionSuccess('action.finance.compensationRuleSaved', {}, 'Default rates saved');
    } catch (error) {
      return actionFailure(error, { actionName: 'setPersonDefaultRates', values });
    } finally {
      context.sqlite.close();
    }
  },

  /** Person page → Pay: how often this person is paid (audited version, Owner only here). */
  setPersonPayInterval: async (event: PortalActionEvent) => {
    if (event.params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const denied = ownerFailure(event);
    if (denied) return denied;
    const form = await event.request.formData();
    const workerId = String(form.get('workerId') ?? '').trim();
    const parsed = parsePayIntervalForm(form);
    if (!uuidSchema.safeParse(workerId).success || !parsed.ok)
      return actionFail(
        400,
        'problem.assignment.financeTermsRequired',
        {},
        'Complete the highlighted fields.',
        {
          code: 'PAY_INTERVAL_INVALID',
          actionName: 'setPersonPayInterval',
          fieldErrors: parsed.ok ? { workerId: ['Choose a person.'] } : parsed.fieldErrors,
        },
      );
    let context: ReturnType<typeof openPortalRepository>;
    try {
      context = openPortalRepository(event.locals);
    } catch (error) {
      return actionFailure(error, { actionName: 'setPersonPayInterval' });
    }
    try {
      new PayBillingIntervalRepository(context.sqlite).setPersonInterval(context.principal, {
        userId: workerId,
        ...parsed.value,
      });
      return actionSuccess('action.finance.payIntervalSaved', {}, 'Pay interval saved');
    } catch (error) {
      return actionFailure(error, { actionName: 'setPersonPayInterval' });
    } finally {
      context.sqlite.close();
    }
  },
};
