import { describe, expect, it, vi } from 'vitest';
import { V3AccessDeniedError, V3ConflictError } from '@ja/database';

const archiveDocument = vi.fn();
const close = vi.fn();
vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: () => ({
    v3: { archiveDocument },
    principal: { userId: 'owner-1', role: 'owner_admin' },
    sqlite: { close },
  }),
}));

const { documentActions } =
  await import('../../apps/portal/src/lib/server/actions/document-actions');

describe('archive document state problem', () => {
  it('asks for sign-in when the live document session expires', async () => {
    archiveDocument.mockReset();
    close.mockReset();
    archiveDocument.mockImplementation(() => {
      throw new V3AccessDeniedError('Live authenticated session required');
    });
    const body = new FormData();
    body.set('documentId', 'document-1');
    body.set('reason', 'Superseded by corrected inspection');
    const result = await documentActions.archiveDocument({
      locals: {},
      params: { section: 'documents' },
      request: new Request('https://example.test/app/documents?/archiveDocument', {
        method: 'POST',
        body,
      }),
    } as never);
    expect(result).toMatchObject({
      status: 401,
      data: {
        code: 'DOCUMENT_SESSION_EXPIRED',
        messageKey: 'problem.document.sessionExpired',
        actionName: 'archiveDocument',
        values: { documentId: 'document-1', reason: 'Superseded by corrected inspection' },
        remedies: [{ id: 'sign_in_again' }],
      },
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('retains the selected document and reason when the repository blocks an obsolete state', async () => {
    archiveDocument.mockReset();
    close.mockReset();
    archiveDocument.mockImplementation(() => {
      throw new V3ConflictError('Only a current committed document can be archived');
    });
    const body = new FormData();
    body.set('documentId', 'document-1');
    body.set('reason', 'Superseded by corrected inspection');
    const result = await documentActions.archiveDocument({
      locals: {},
      params: { section: 'documents' },
      request: new Request('https://example.test/app/documents?/archiveDocument', {
        method: 'POST',
        body,
      }),
    } as never);
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      success: false,
      code: 'DOCUMENT_ARCHIVE_REQUIRES_CURRENT_COMMITTED',
      messageKey: 'problem.document.archiveRequiresCurrentCommitted',
      actionName: 'archiveDocument',
      values: {
        documentId: 'document-1',
        reason: 'Superseded by corrected inspection',
      },
      fieldErrors: {},
      remedies: [{ id: 'review_documents' }],
      correlationId: expect.any(String),
    });
    expect(archiveDocument).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
