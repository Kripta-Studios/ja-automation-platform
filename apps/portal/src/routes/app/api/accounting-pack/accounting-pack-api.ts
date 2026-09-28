import { randomUUID } from 'node:crypto';
import { json } from '@sveltejs/kit';
import {
  V3AccountingPackExportProblemError,
  V3AccountingPackSourceChangedError,
} from '@ja/database';
import { englishCoverageKey } from '$lib/i18n/coverage-translations';

export const accountingPackFormats = ['pdf', 'xlsx', 'invoice_csv', 'expense_csv', 'json'] as const;
export type AccountingPackFormat = (typeof accountingPackFormats)[number];

type ProblemName =
  | 'sourceChanged'
  | 'exportProcessing'
  | 'exportFailedRetryable'
  | 'exportUnavailable'
  | 'exportServiceUnavailable'
  | 'retryServiceUnavailable'
  | 'retryNotReady'
  | 'retryLimit'
  | 'alreadyReady'
  | 'finalImmutable'
  | 'signInRequired'
  | 'notFound'
  | 'retryKeyInvalid';

const formatLabels: Record<AccountingPackFormat, string> = {
  pdf: 'PDF',
  xlsx: 'XLSX',
  invoice_csv: 'invoice CSV',
  expense_csv: 'expense CSV',
  json: 'JSON',
};

const codeToName = {
  ACCOUNTING_PACK_SOURCE_CHANGED: 'sourceChanged',
  ACCOUNTING_PACK_EXPORT_PROCESSING: 'exportProcessing',
  ACCOUNTING_PACK_EXPORT_FAILED_RETRYABLE: 'exportFailedRetryable',
  ACCOUNTING_PACK_EXPORT_UNAVAILABLE: 'exportUnavailable',
  ACCOUNTING_PACK_EXPORT_RETRY_NOT_READY: 'retryNotReady',
  ACCOUNTING_PACK_EXPORT_RETRY_LIMIT: 'retryLimit',
  ACCOUNTING_PACK_EXPORT_ALREADY_READY: 'alreadyReady',
  ACCOUNTING_PACK_EXPORT_FINAL_IMMUTABLE: 'finalImmutable',
} as const;

export function accountingPackProblem(
  code: string,
  name: ProblemName,
  status: number,
  options: {
    packId?: string;
    format?: AccountingPackFormat;
    role?: string;
    correlationId?: string;
    fieldErrors?: Record<string, string[]>;
  } = {},
): Response {
  const messageKey = `problem.accountingPack.${name}`;
  const correlationId = options.correlationId ?? randomUUID();
  const params = {
    ...(options.format ? { format: formatLabels[options.format] } : {}),
    ...(name === 'exportServiceUnavailable' || name === 'retryServiceUnavailable'
      ? { correlationId }
      : {}),
  };
  const message = englishCoverageKey(messageKey)
    .replace('{format}', options.format ? formatLabels[options.format] : '')
    .replace('{correlationId}', correlationId);
  const remedies =
    name === 'signInRequired'
      ? [{ id: 'sign_in' }]
      : name === 'notFound'
        ? []
        : (name === 'retryServiceUnavailable' || name === 'exportServiceUnavailable') && !options.packId
          ? [{ id: 'contact_support' }]
        : name === 'exportFailedRetryable' && options.packId && options.format
          ? options.role === 'owner_admin' || options.role === 'finance_admin'
            ? [
                {
                  id: 'retry_accounting_pack_export',
                  packId: options.packId,
                  format: options.format,
                },
              ]
            : [{ id: 'contact_finance_owner' }]
          : name === 'retryLimit'
            ? options.role === 'owner_admin' || options.role === 'finance_admin'
              ? options.packId
                ? [{ id: 'review_accounting_pack', packId: options.packId }]
                : []
              : [{ id: 'contact_finance_owner' }]
            : options.packId
              ? [{ id: 'review_accounting_pack', packId: options.packId }]
              : [];
  return json(
    {
      error: message,
      code,
      messageKey,
      params,
      fieldErrors: options.fieldErrors ?? {},
      remedies,
      correlationId,
    },
    {
      status,
      headers: { 'cache-control': 'private, no-store', 'x-correlation-id': correlationId },
    },
  );
}

export function accountingPackKnownConflict(
  cause: unknown,
  packId: string,
  format: AccountingPackFormat,
  role: string,
  correlationId: string,
): Response | null {
  if (cause instanceof V3AccountingPackSourceChangedError)
    return accountingPackProblem(cause.code, 'sourceChanged', 409, { packId, correlationId });
  if (cause instanceof V3AccountingPackExportProblemError)
    return accountingPackProblem(cause.code, codeToName[cause.code], 409, {
      packId,
      format,
      role,
      correlationId,
    });
  return null;
}
