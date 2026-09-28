import { randomUUID } from 'node:crypto';
import type { RequestHandler } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';
import { servePrivateArtifact } from '$lib/server/private-artifact-access';
import {
  accountingPackFormats,
  accountingPackKnownConflict,
  accountingPackProblem,
  type AccountingPackFormat,
} from '../../accounting-pack-api';

const types = new Set<string>(accountingPackFormats);

export const GET: RequestHandler = async ({ locals, params }) => {
  const correlationId = locals.correlationId ?? randomUUID();
  if (!locals.user || !locals.session)
    return accountingPackProblem('ACCOUNTING_PACK_SIGN_IN_REQUIRED', 'signInRequired', 401, {
      correlationId,
    });
  const routeParams = params as { id?: string; type?: string };
  const exportType = routeParams.type;
  const packId = routeParams.id;
  if (!packId || !exportType || !types.has(exportType))
    return accountingPackProblem('ACCOUNTING_PACK_NOT_FOUND', 'notFound', 404, {
      correlationId,
    });
  let context: ReturnType<typeof openPortalRepository> | undefined;
  let authorizedPack = false;
  // Keep one reference across the private boundary, route logs and the typed
  // response. The helper may log the underlying storage failure first.
  try {
    context = openPortalRepository(locals);
    const principal = { ...context.principal, correlationId };
    const { v3 } = context;
    let knownCause: unknown;
    const response = await servePrivateArtifact({
      sqlite: context.sqlite,
      principal,
      kind: 'accounting_pack',
      id: packId,
      loadMetadata: () => {
        // The shared helper invokes this only after object authorization.
        authorizedPack = true;
        try {
          return v3.accountingPackExport(
            principal,
            packId,
            exportType as 'pdf' | 'xlsx' | 'invoice_csv' | 'expense_csv' | 'json',
          );
        } catch (cause) {
          knownCause = cause;
          throw cause;
        }
      },
    });
    // The shared service authorizes and audits before a known 409 is localized.
    if (response.status === 401) {
      return accountingPackProblem(
        'ACCOUNTING_PACK_SIGN_IN_REQUIRED',
        'signInRequired',
        401,
        { correlationId },
      );
    }
    if (response.status === 404)
      return accountingPackProblem('ACCOUNTING_PACK_NOT_FOUND', 'notFound', 404, {
        correlationId,
      });
    if (response.status === 409) {
      const known = accountingPackKnownConflict(
        knownCause,
        packId,
        exportType as AccountingPackFormat,
        context.principal.role,
        correlationId,
      );
      if (known) return known;
      // Artifact integrity or storage failures also stay safe and typed.
      return accountingPackProblem('ACCOUNTING_PACK_EXPORT_UNAVAILABLE', 'exportUnavailable', 409, {
        packId,
        format: exportType as AccountingPackFormat,
        role: context.principal.role,
        correlationId,
      });
    }
    if (response.status >= 500) {
      console.error('Accounting Pack artifact service unavailable', {
        correlationId,
        packId,
        format: exportType,
        status: response.status,
      });
      return accountingPackProblem(
        'ACCOUNTING_PACK_EXPORT_SERVICE_UNAVAILABLE',
        'exportServiceUnavailable',
        503,
        {
          ...(authorizedPack ? { packId } : {}),
          format: exportType as AccountingPackFormat,
          correlationId,
        },
      );
    }
    return response;
  } catch (cause) {
    console.error('Unexpected Accounting Pack download failure', {
      correlationId,
      packId,
      format: exportType,
      cause,
    });
    return accountingPackProblem(
      'ACCOUNTING_PACK_EXPORT_SERVICE_UNAVAILABLE',
      'exportServiceUnavailable',
      503,
      {
        ...(authorizedPack ? { packId } : {}),
        format: exportType as AccountingPackFormat,
        correlationId,
      },
    );
  } finally {
    try {
      context?.sqlite.close();
    } catch (cause) {
      console.error('Accounting Pack download repository close failed', { correlationId, cause });
    }
  }
};
