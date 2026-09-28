import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  verifiedWorkerStatementFile,
  workerStatementDownloadFallback,
  workerStatementDownloadProblem,
} from './worker-statement-download.ts';

function fileResponse(body: string | Uint8Array, format: 'pdf' | 'csv', filename: string): Response {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  return new Response(new Uint8Array(bytes).buffer, {
    headers: {
      'content-type': format === 'pdf' ? 'application/pdf' : 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'content-length': String(bytes.byteLength),
    },
  });
}

test('accepts only statement codes with their matching translation and permitted remedies', () => {
  assert.equal(
    workerStatementDownloadProblem({
      code: 'WORKER_STATEMENT_ARTIFACT_PENDING',
      messageKey: 'problem.workerStatement.artifactPending',
      remedies: [{ id: 'check_statement_status' }],
      correlationId: 'reference-1234',
    })?.code,
    'WORKER_STATEMENT_ARTIFACT_PENDING',
  );
  assert.equal(
    workerStatementDownloadProblem({
      code: 'WORKER_STATEMENT_ARTIFACT_PENDING',
      messageKey: 'problem.workerStatement.integrityFailed',
      remedies: [],
    }),
    null,
  );
  assert.equal(
    workerStatementDownloadProblem({
      code: 'WORKER_STATEMENT_NOT_FOUND',
      messageKey: 'problem.workerStatement.notFound',
      remedies: [{ id: 'review_billing' }],
    }),
    null,
  );
  assert.equal(workerStatementDownloadFallback('network', '<bad>').correlationId, '');
  assert.deepEqual(workerStatementDownloadFallback('statusUnknown', 'reference-1234'), {
    code: 'WORKER_STATEMENT_DOWNLOAD_STATUS_UNKNOWN',
    messageKey: 'problem.workerStatement.downloadStatusUnknown',
    remedies: [{ id: 'check_statement_status' }],
    params: {},
    fieldErrors: {},
    correlationId: 'reference-1234',
  });
  assert.deepEqual(
    workerStatementDownloadProblem({
      code: 'WORKER_STATEMENT_UNEXPECTED',
      messageKey: 'problem.workerStatement.unexpected',
      remedies: [{ id: 'review_my_pay' }],
      correlationId: 'reference-1234',
    })?.params,
    { correlationId: 'reference-1234' },
  );
});

test('validates a PDF including its header and EOF, and corrects its extension', async () => {
  const valid = await verifiedWorkerStatementFile(
    fileResponse('%PDF-1.7\ncontent\n%%EOF\n', 'pdf', 'my-pay.csv'),
    'pdf',
  );
  assert.equal(valid?.filename, 'my-pay.pdf');
  assert.equal(
    await verifiedWorkerStatementFile(fileResponse('%PDF-1.7\ncontent', 'pdf', 'my-pay.pdf'), 'pdf'),
    null,
  );
});

test('validates CSV UTF-8, NUL, MIME, disposition, and byte count', async () => {
  assert.equal(
    (await verifiedWorkerStatementFile(fileResponse('date,amount\n2026-09-28,10\n', 'csv', 'pay.csv'), 'csv'))
      ?.filename,
    'pay.csv',
  );
  assert.equal(
    await verifiedWorkerStatementFile(fileResponse(new Uint8Array([0xff]), 'csv', 'pay.csv'), 'csv'),
    null,
  );
  assert.equal(
    await verifiedWorkerStatementFile(fileResponse('date\0amount', 'csv', 'pay.csv'), 'csv'),
    null,
  );
  const wrongLength = fileResponse('date,amount', 'csv', 'pay.csv');
  wrongLength.headers.set('content-length', '20');
  assert.equal(await verifiedWorkerStatementFile(wrongLength, 'csv'), null);
  const inline = fileResponse('date,amount', 'csv', 'pay.csv');
  inline.headers.set('content-disposition', 'inline; filename="pay.csv"');
  assert.equal(await verifiedWorkerStatementFile(inline, 'csv'), null);
});
