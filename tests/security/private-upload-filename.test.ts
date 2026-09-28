import { afterEach, describe, expect, it, vi } from 'vitest';
const openPortalRepository = vi.fn();
vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository,
}));
const { documentActions } =
  await import('../../apps/portal/src/lib/server/actions/document-actions.ts');
const { POST: offlineUpload } =
  await import('../../apps/portal/src/routes/app/api/sync/attachment/+server.ts');
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe('Generic private-upload filename boundary', () => {
  it('rejects an executable extension on an offline receipt before opening storage', async () => {
    vi.stubEnv('JA_OFFLINE_ENABLED', 'true');
    const form = new FormData();
    form.set('projectId', '11111111-1111-4111-8111-111111111111');
    form.set('attachmentId', '22222222-2222-4222-8222-222222222222');
    form.set(
      'file',
      new File(['%PDF-1.7\nprivate\n%%EOF\n'], 'receipt.exe', { type: 'application/pdf' }),
    );
    const response = await offlineUpload({
      locals: { user: { id: 'test-worker' }, session: { id: 'test-session' } },
      request: new Request('http://localhost/app/api/sync/attachment', {
        method: 'POST',
        body: form,
      }),
    } as never);
    expect(response.status).toBe(400);
    expect(openPortalRepository).not.toHaveBeenCalled();
  });

  it.each([
    ['invoice.exe', 'application/pdf', '%PDF-1.7\nprivate\n%%EOF\n'],
    ['receipt.cmd', 'text/plain', '@echo private'],
    ['receipt.png', 'application/pdf', '%PDF-1.7\nprivate\n%%EOF\n'],
  ])('rejects %s before opening storage', async (filename, mime, content) => {
    const form = new FormData();
    form.set('projectId', 'test-project');
    form.set('artifactType', 'report');
    form.set('description', 'Private upload regression');
    form.set('file', new File([content], filename, { type: mime }));
    const result = await documentActions.uploadPrivateDocument({
      locals: {},
      params: { section: 'documents' },
      request: new Request('http://localhost/app/documents', { method: 'POST', body: form }),
    } as never);
    expect(result).toMatchObject({ status: 400 });
    expect(openPortalRepository).not.toHaveBeenCalled();
  });
});
