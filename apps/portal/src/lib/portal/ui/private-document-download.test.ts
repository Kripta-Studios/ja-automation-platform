import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  documentDownloadFallback,
  documentDownloadProblem,
  privateDownloadFilename,
} from './private-document-download.ts';

test('accepts a typed document conflict and preserves only its permitted remedy', () => {
  const problem = documentDownloadProblem({
    code: 'DOCUMENT_DOWNLOAD_INTEGRITY_BLOCKED',
    messageKey: 'problem.document.downloadIntegrityBlocked',
    correlationId: 'document-reference-123',
    remedies: [{ id: 'contact_owner' }],
  });
  assert.equal(problem?.code, 'DOCUMENT_DOWNLOAD_INTEGRITY_BLOCKED');
  assert.deepEqual(problem?.remedies, [{ id: 'contact_owner' }]);
  assert.equal(problem?.correlationId, 'document-reference-123');
  assert.equal(
    documentDownloadProblem({
      code: 'DOCUMENT_DOWNLOAD_INTEGRITY_BLOCKED',
      messageKey: 'problem.document.downloadIntegrityBlocked',
      remedies: [{ id: 'review_restricted_settings' }],
    }),
    null,
  );
});

test('rejects an unknown or mismatched code and hides an unsafe reference', () => {
  assert.equal(
    documentDownloadProblem({
      code: 'DOCUMENT_DOWNLOAD_INTEGRITY_BLOCKED',
      messageKey: 'problem.document.downloadUnavailable',
      remedies: [],
    }),
    null,
  );
  assert.equal(documentDownloadFallback('network', '<script>').correlationId, '');
  assert.equal(documentDownloadFallback('popup').code, 'DOCUMENT_PREVIEW_POPUP_BLOCKED');
});

test('uses a semantic filename without path or control characters', () => {
  assert.equal(
    privateDownloadFilename(
      `attachment; filename="fallback.pdf"; filename*=UTF-8''Informe%20final.pdf`,
      'ignored.pdf',
    ),
    'Informe final.pdf',
  );
  assert.equal(privateDownloadFilename('attachment; filename="../secret\r.pdf"', ''), '.._secret_.pdf');
  assert.equal(privateDownloadFilename(null, '..'), 'document');
});
