import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actions } from '../../apps/portal/src/routes/app/projects/[id]/closeout/+page.server';

const repository = {
  prepareProjectCloseout: vi.fn(),
  refreshProjectCloseoutDraft: vi.fn(),
  confirmProjectCloseoutClientPublication: vi.fn(),
  finalizeProjectCloseoutRevision: vi.fn(),
  reopenProjectCloseout: vi.fn(),
};
const close = vi.fn();
let revisionProjectId = 'project-1';
const prepare = vi.fn(() => ({ get: () => ({ project_id: revisionProjectId }) }));

function request(entries: Array<[string, string]> = []) {
  const form = new FormData();
  for (const [key, value] of entries) form.append(key, value);
  return new Request('http://local.test/action', { method: 'POST', body: form });
}

async function submit(
  action: keyof typeof actions,
  entries: Array<[string, string]>,
  role = 'finance_admin',
) {
  const handler = actions[action];
  if (!handler) throw new Error(`Missing action ${action}`);
  return handler({
    locals: { user: { id: 'user-1', role } },
    params: { id: 'project-1' },
    request: request(entries),
  } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  revisionProjectId = 'project-1';
  vi.mocked(openPortalRepository).mockReturnValue({
    sqlite: { close, prepare },
    principal: { userId: 'user-1', role: 'finance_admin' },
    repository,
  } as unknown as ReturnType<typeof openPortalRepository>);
});

describe('project closeout action problems', () => {
  it('keeps the successful prepare response on the shared action path', async () => {
    const result = await submit('prepare', [['documentId', 'doc-1']]);
    expect(result).toMatchObject({
      success: true,
      messageKey: 'action.closeout.draftPrepared',
    });
    expect(repository.prepareProjectCloseout).toHaveBeenCalledWith(expect.anything(), {
      projectId: 'project-1',
      clientDocumentIds: ['doc-1'],
    });
  });

  it.each([
    ['Customer attachment selection is invalid', 'CLOSEOUT_DOCUMENT_SELECTION_INVALID'],
    ['Document doc-1 is not authorized for customer closeout', 'CLOSEOUT_DOCUMENT_UNAVAILABLE'],
    [
      'Customer attachment selection exceeds the 100 MB closeout limit',
      'CLOSEOUT_PACKAGE_TOO_LARGE',
    ],
    [
      'Client snapshot contains a recognized monetary pattern and needs review before publication',
      'CLOSEOUT_CLIENT_SNAPSHOT_FINANCIAL_REVIEW',
    ],
    ['A closeout draft is already active', 'CLOSEOUT_DRAFT_ALREADY_ACTIVE'],
    ['Only an active closeout draft can be refreshed', 'CLOSEOUT_ACTIVE_DRAFT_REQUIRED'],
    ['Selected customer document source changed; prepare a fresh draft', 'CLOSEOUT_SOURCE_CHANGED'],
    ['Accepted customer conformity evidence is unavailable or stale', 'CLOSEOUT_SOURCE_INVALID'],
    ['Selected document doc-1 failed integrity verification', 'CLOSEOUT_DOCUMENT_INTEGRITY_FAILED'],
    ['Closeout artifact write did not complete', 'CLOSEOUT_ARTIFACT_WRITE_INCOMPLETE'],
    ['Only a closed project can be reopened', 'CLOSEOUT_REOPEN_UNAVAILABLE'],
  ])('maps known repository blocker %s', async (message, code) => {
    repository.prepareProjectCloseout.mockImplementation(() => {
      throw new ConflictError(message);
    });
    const result = await submit('prepare', [['documentId', 'doc-1']]);
    expect(result).toMatchObject({ data: { code } });
    expect((result as { data: { messageKey: string } }).data.messageKey).toMatch(
      /^problem\.closeout\./u,
    );
  });

  it('retains selected documents when one becomes unavailable', async () => {
    repository.prepareProjectCloseout.mockImplementation(() => {
      throw new ValidationError('A selected customer document is unavailable');
    });
    const result = await submit('prepare', [
      ['documentId', 'doc-1'],
      ['documentId', 'doc-2'],
    ]);
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'CLOSEOUT_DOCUMENT_UNAVAILABLE',
        messageKey: 'problem.closeout.documentUnavailable',
        actionName: 'prepare',
        values: { documentId: ['doc-1', 'doc-2'] },
        remedies: [{ id: 'review_closeout_documents', projectId: 'project-1' }],
      },
    });
    expect(
      (result as { data: { fieldErrors: Record<string, string[]> } }).data.fieldErrors.documentId,
    ).toHaveLength(1);
    expect(close).toHaveBeenCalledOnce();
  });

  it('reports a stale refresh and retains the replacement selection', async () => {
    repository.refreshProjectCloseoutDraft.mockImplementation(() => {
      throw new ConflictError('Closeout draft changed concurrently');
    });
    const result = await submit('refresh', [
      ['revisionId', 'revision-1'],
      ['replaceSelection', 'true'],
      ['documentId', 'doc-1'],
      ['expectedClientSnapshotHash', 'client-hash'],
      ['expectedInternalSnapshotHash', 'internal-hash'],
      ['expectedConfirmationHash', ''],
      ['expectedUpdatedAt', '2026-09-25T12:00:00.000Z'],
    ]);
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'CLOSEOUT_DRAFT_CHANGED',
        actionName: 'refresh',
        values: { revisionId: 'revision-1', replaceSelection: true, documentId: ['doc-1'] },
      },
    });
    expect(repository.refreshProjectCloseoutDraft).toHaveBeenCalledWith(expect.anything(), {
      revisionId: 'revision-1',
      clientDocumentIds: ['doc-1'],
      expectedState: {
        clientSnapshotHash: 'client-hash',
        internalSnapshotHash: 'internal-hash',
        confirmationHash: '',
        updatedAt: '2026-09-25T12:00:00.000Z',
      },
    });
  });

  it('rejects a revision from another route project before any mutation', async () => {
    revisionProjectId = 'project-2';
    const result = await submit('finalize', [['revisionId', 'revision-from-project-2']]);
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'CLOSEOUT_REVISION_NOT_FOUND',
        remedies: [{ id: 'review_closeout', projectId: 'project-1' }],
      },
    });
    expect(repository.finalizeProjectCloseoutRevision).not.toHaveBeenCalled();
  });

  it('requires review of the exact current client snapshot after a stale confirmation', async () => {
    repository.confirmProjectCloseoutClientPublication.mockImplementation(() => {
      throw new ConflictError(
        'Client publication confirmation is stale; review the exact current snapshot',
      );
    });
    const result = await submit('confirmClient', [
      ['revisionId', 'revision-1'],
      ['clientSnapshotHash', 'a'.repeat(64)],
      ['confirmationChecked', 'yes'],
    ]);
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'CLOSEOUT_CLIENT_CONFIRMATION_STALE',
        actionName: 'confirmClient',
        values: { revisionId: 'revision-1', clientSnapshotHash: 'a'.repeat(64) },
        remedies: [{ id: 'review_closeout', projectId: 'project-1' }],
      },
    });
  });

  it('requires explicit client snapshot review before confirming it', async () => {
    const result = await submit('confirmClient', [
      ['revisionId', 'revision-1'],
      ['clientSnapshotHash', 'a'.repeat(64)],
    ]);
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'CLOSEOUT_CONFIRMATION_CHECK_REQUIRED',
        fieldErrors: { confirmationChecked: ['problem.closeout.confirmationCheckRequired'] },
      },
    });
    expect(repository.confirmProjectCloseoutClientPublication).not.toHaveBeenCalled();
  });

  it('does not finalize a draft without exact publication confirmation', async () => {
    repository.finalizeProjectCloseoutRevision.mockImplementation(() => {
      throw new ConflictError(
        'Draft requires exact client publication confirmation before finalization',
      );
    });
    const result = await submit('finalize', [['revisionId', 'revision-1']]);
    expect(result).toMatchObject({
      status: 409,
      data: { code: 'CLOSEOUT_CONFIRMATION_REQUIRED', actionName: 'finalize' },
    });
  });

  it('retains the reopen reason and only offers owner-safe guidance on permission denial', async () => {
    const result = await submit('reopen', [
      ['revisionId', 'revision-1'],
      ['reason', 'Customer correction'],
    ]);
    expect(result).toMatchObject({
      status: 403,
      data: {
        code: 'CLOSEOUT_OWNER_ROLE_REQUIRED',
        values: { reason: 'Customer correction' },
        remedies: [{ id: 'contact_owner', projectId: 'project-1' }],
      },
    });
    expect(repository.reopenProjectCloseout).not.toHaveBeenCalled();
  });

  it('reports a missing reopen reason beside the field', async () => {
    repository.reopenProjectCloseout.mockImplementation(() => {
      throw new ValidationError('Reopen reason is required');
    });
    const result = await submit('reopen', [['revisionId', 'revision-1']], 'owner_admin');
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'CLOSEOUT_REOPEN_REASON_REQUIRED',
        actionName: 'reopen',
        fieldErrors: { reason: ['problem.closeout.reopenReasonRequired'] },
      },
    });
  });

  it('keeps unexpected exceptions generic and logs a reference', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    repository.prepareProjectCloseout.mockImplementation(() => {
      throw new Error('private filesystem path');
    });
    const result = await submit('prepare', [['documentId', 'doc-1']]);
    expect(result).toMatchObject({ status: 500, data: { code: 'UNEXPECTED_ERROR' } });
    expect(JSON.stringify(result)).not.toContain('private filesystem path');
    expect(log).toHaveBeenCalled();
  });

  it('does not classify an unexpected exception solely by matching message text', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    repository.prepareProjectCloseout.mockImplementation(() => {
      throw new Error('A closeout draft is already active');
    });
    const result = await submit('prepare', []);
    expect(result).toMatchObject({ status: 500, data: { code: 'UNEXPECTED_ERROR' } });
    expect(log).toHaveBeenCalled();
  });

  it('maps repository role changes without exposing owner controls', async () => {
    repository.prepareProjectCloseout.mockImplementation(() => {
      throw new AccessDeniedError('Active Finance role required');
    });
    const result = await submit('prepare', []);
    expect(result).toMatchObject({
      status: 403,
      data: {
        code: 'CLOSEOUT_FINANCE_ROLE_REQUIRED',
        remedies: [{ id: 'contact_owner', projectId: 'project-1' }],
      },
    });
  });
});
