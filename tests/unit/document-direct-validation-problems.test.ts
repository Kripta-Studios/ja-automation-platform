import { describe, expect, it } from 'vitest';
import { documentActions } from '../../apps/portal/src/lib/server/actions/document-actions';

function event(section: string, action: string, fields: Record<string, string | File>) {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return {
    params: { section },
    request: new Request(`https://example.test/app/${section}?/${action}`, {
      method: 'POST',
      body,
    }),
    locals: {},
  } as Parameters<(typeof documentActions)[keyof typeof documentActions]>[0];
}

describe('document action input problems', () => {
  it('identifies missing upload metadata and retains only safe scalar entries', async () => {
    const result = await documentActions.uploadPrivateDocument(
      event('documents', 'uploadPrivateDocument', {
        projectId: '',
        artifactType: '',
        description: 'Private inspection report',
        sensitivity: 'internal',
        file: new File(['private bytes'], 'secret.txt', { type: 'text/plain' }),
      }),
    );
    expect(result.status).toBe(400);
    expect(result.data).toMatchObject({
      code: 'DOCUMENT_METADATA_REQUIRED',
      messageKey: 'problem.document.metadataRequired',
      actionName: 'uploadPrivateDocument',
      values: { description: 'Private inspection report', sensitivity: 'internal' },
      fieldErrors: {
        projectId: ['problem.document.metadataRequired'],
        artifactType: ['problem.document.metadataRequired'],
      },
      remedies: [{ id: 'correct_fields' }],
    });
    expect(JSON.stringify(result.data)).not.toContain('private bytes');
    expect(JSON.stringify(result.data)).not.toContain('secret.txt');
  });

  it('keeps the selected document and reason with an archive reason error', async () => {
    const result = await documentActions.archiveDocument(
      event('documents', 'archiveDocument', {
        documentId: 'doc-1',
        reason: 'No',
      }),
    );
    expect(result.status).toBe(400);
    expect(result.data).toMatchObject({
      code: 'DOCUMENT_ARCHIVE_REASON_REQUIRED',
      actionName: 'archiveDocument',
      values: { documentId: 'doc-1', reason: 'No' },
      fieldErrors: { reason: ['problem.document.archiveReasonRequired'] },
    });
  });

  it('requires a selected document for deletion', async () => {
    const result = await documentActions.deleteDocument(
      event('documents', 'deleteDocument', { documentId: '' }),
    );
    expect(result.status).toBe(400);
    expect(result.data).toMatchObject({
      code: 'DOCUMENT_ID_REQUIRED',
      fieldErrors: { documentId: ['problem.document.idRequired'] },
      remedies: [{ id: 'correct_fields' }],
    });
  });
});
