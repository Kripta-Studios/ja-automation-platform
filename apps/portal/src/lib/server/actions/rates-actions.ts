import { fail } from '@sveltejs/kit';
import {
  AccessDeniedError,
  ConflictError,
  V3AccessDeniedError,
  V3ConflictError,
  V3ValidationError,
  ValidationError,
} from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';
import { RateSaveError, saveClientRate, saveWorkerPay, type RateSaveCode } from '../rates-core';

export type { RateSaveCode } from '../rates-core';

function rateFailure(error: unknown, kind: string, values: Record<string, string>) {
  let code: RateSaveCode = 'failed';
  if (error instanceof RateSaveError) code = error.code;
  else if (error instanceof AccessDeniedError || error instanceof V3AccessDeniedError) code = 'forbidden';
  else if (
    error instanceof V3ValidationError ||
    error instanceof ValidationError ||
    error instanceof V3ConflictError ||
    error instanceof ConflictError
  ) {
    const message = error.message;
    code = /already|follow|starts on/iu.test(message) ? 'same_day' : 'failed';
  } else throw error;
  return fail(code === 'forbidden' ? 403 : code === 'failed' ? 409 : 400, {
    success: false,
    rateSave: { kind, code, values },
  });
}

async function runRateSave(event: PortalActionEvent, kind: 'client' | 'pay') {
  if (event.params.section !== 'finance') return fail(404, { success: false });
  if (!event.locals.user)
    return fail(401, { success: false, rateSave: { kind, code: 'forbidden', values: {} } });
  const object = await formObject(event.request);
  const values = Object.fromEntries(
    ['projectId', 'workerId', 'amount', 'basis', 'effectiveFrom'].map((key) => [
      key,
      String(object[key] ?? '').slice(0, 200),
    ]),
  );
  const context = openPortalRepository(event.locals);
  try {
    const result =
      kind === 'client'
        ? saveClientRate(context.sqlite, context.v3, context.principal, object)
        : saveWorkerPay(context.sqlite, context.v3, context.principal, object);
    return { success: true, rateSave: { kind, code: 'saved', changed: result.changed, values } };
  } catch (error) {
    return rateFailure(error, kind, values);
  } finally {
    context.sqlite.close();
  }
}

export const ratesActions = {
  saveClientRate: (event: PortalActionEvent) => runRateSave(event, 'client'),
  saveWorkerPay: (event: PortalActionEvent) => runRateSave(event, 'pay'),
};
