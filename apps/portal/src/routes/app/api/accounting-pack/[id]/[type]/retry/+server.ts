import { randomUUID } from 'node:crypto';
import { json, type RequestHandler } from '@sveltejs/kit';
import { V3AccessDeniedError, V3ValidationError } from '@ja/database';
import { authorizePrivateArtifact } from '$lib/server/private-artifact-access';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  accountingPackFormats,
  accountingPackKnownConflict,
  accountingPackProblem,
  type AccountingPackFormat,
} from '../../../accounting-pack-api';

const types = new Set<string>(accountingPackFormats);

function uncertainRetryProblem(correlationId: string, packId: string | undefined, status: number) {
  return json(
    {
      error: `We could not confirm whether the retry was queued. Check this Accounting Pack before trying again. Reference: ${correlationId}.`,
      code: 'UNEXPECTED_ERROR',
      messageKey: 'problem.error.unexpected',
      params: { correlationId },
      fieldErrors: {},
      remedies: packId ? [{ id: 'review_accounting_pack', packId }] : [],
      correlationId,
    },
    {
      status,
      headers: { 'cache-control': 'private, no-store', 'x-correlation-id': correlationId },
    },
  );
}

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
  const correlationId = locals.correlationId ?? randomUUID();
  if (!locals.user || !locals.session)
    return accountingPackProblem('ACCOUNTING_PACK_SIGN_IN_REQUIRED', 'signInRequired', 401, {
      correlationId,
    });
  const packId = params.id;
  const format = params.type;
  if (!packId || !format || !types.has(format))
    return accountingPackProblem('ACCOUNTING_PACK_NOT_FOUND', 'notFound', 404, {
      correlationId,
    });
  let context: ReturnType<typeof openPortalRepository> | undefined;
  let authorizedPack = false;
  try {
    context = openPortalRepository(locals);
    // Authorize the object before parsing retry data or calling its repository method.
    // Missing and private packs, including an auditor's read-only pack, stay indistinguishable.
    if (
      !authorizePrivateArtifact(context.sqlite, context.principal, 'accounting_pack', packId) ||
      (context.principal.role !== 'owner_admin' && context.principal.role !== 'finance_admin')
    )
      return accountingPackProblem('ACCOUNTING_PACK_NOT_FOUND', 'notFound', 404, {
        correlationId,
      });
    authorizedPack = true;

    const body = (await request.json().catch(() => null)) as { idempotencyKey?: unknown } | null;
    const idempotencyKey =
      body && typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
    if (
      !idempotencyKey ||
      idempotencyKey.length > 200 ||
      [...idempotencyKey].some((character) => {
        const code = character.codePointAt(0) ?? 0;
        return code <= 0x1f || code === 0x7f;
      })
    )
      return accountingPackProblem('ACCOUNTING_PACK_RETRY_KEY_INVALID', 'retryKeyInvalid', 400, {
        packId,
        fieldErrors: { idempotencyKey: ['Enter a valid request key.'] },
        correlationId,
      });

    try {
      const job = context.v3.retryAccountingPackExport(
        context.principal,
        packId,
        format as AccountingPackFormat,
        idempotencyKey,
      );
      const downloadUrl = url.pathname.replace(/\/retry\/?$/u, '');
      return json(
        { job: { id: job.jobId, created: job.created, state: job.state }, downloadUrl },
        {
          status: 202,
          headers: {
            'cache-control': 'private, no-store',
            'retry-after': '2',
            location: downloadUrl,
          },
        },
      );
    } catch (cause) {
      const known = accountingPackKnownConflict(
        cause,
        packId,
        format as AccountingPackFormat,
        context.principal.role,
        correlationId,
      );
      if (known) return known;
      if (cause instanceof V3ValidationError)
        return accountingPackProblem('ACCOUNTING_PACK_NOT_FOUND', 'notFound', 404, {
          correlationId,
        });
      if (cause instanceof V3AccessDeniedError)
        return accountingPackProblem('ACCOUNTING_PACK_NOT_FOUND', 'notFound', 404, {
          correlationId,
        });
      console.error('Unexpected Accounting Pack retry failure', { correlationId, cause });
      return uncertainRetryProblem(correlationId, packId, 500);
    }
  } catch (cause) {
    console.error('Unexpected Accounting Pack retry setup failure', {
      correlationId,
      packId,
      format,
      cause,
    });
    // Setup failure happened before invoking the retry. Keep object-specific
    // guidance only when its authorization already succeeded.
    return accountingPackProblem(
      'ACCOUNTING_PACK_RETRY_SERVICE_UNAVAILABLE',
      'retryServiceUnavailable',
      503,
      { correlationId, ...(authorizedPack ? { packId } : {}) },
    );
  } finally {
    try {
      context?.sqlite.close();
    } catch (cause) {
      console.error('Accounting Pack retry repository close failed', { correlationId, cause });
    }
  }
};
