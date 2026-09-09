import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { V3ConflictError } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';
import type { PortalActionEvent } from '../../apps/portal/src/lib/server/action-utils.js';

const context = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../../apps/portal/src/lib/server/portal-repository.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  openPortalRepository: () => context.current,
}));
import { expenseActions } from '../../apps/portal/src/lib/server/actions/expense-actions.js';
import { documentActions } from '../../apps/portal/src/lib/server/actions/document-actions.js';

let value: B5LifecycleSecurityFixture;
const originalRoot = process.env.JA_DOCUMENT_ROOT;
afterEach(() => {
  vi.restoreAllMocks();
  if (value) closeB5LifecycleSecurityFixture(value);
  if (originalRoot === undefined) delete process.env.JA_DOCUMENT_ROOT;
  else process.env.JA_DOCUMENT_ROOT = originalRoot;
});
function setup() {
  value = createB5LifecycleSecurityFixture();
  process.env.JA_DOCUMENT_ROOT = join(value.directory, 'files');
  // The action owns closing its request connection; retain this isolated test connection to inspect persisted effects.
  vi.spyOn(value.sqlite, 'close').mockImplementation(() => undefined);
  context.current = { ...value, principal: value.worker };
}
const bytes = Buffer.from('%PDF-1.4\nDuplicate receipt regression\n%%EOF\n');
function event(section: string, filename: string): PortalActionEvent {
  const form = new FormData();
  form.set('projectId', value.project.id);
  if (section === 'expenses') {
    for (const [key, data] of Object.entries({
      spentOn: new Date().toISOString().slice(0, 10),
      vendor: 'Receipt test vendor',
      category: 'meals',
      description: 'Regression receipt',
      currency: 'EUR',
      amount: '12.34',
      whoPaid: 'worker',
    }))
      form.set(key, data);
    form.set('receipt', new File([bytes], filename, { type: 'application/pdf' }));
  } else {
    form.set('artifactType', 'receipt');
    form.set('description', 'Private receipt');
    form.set('file', new File([bytes], filename, { type: 'application/pdf' }));
  }
  return {
    locals: {},
    params: { section },
    request: new Request('http://localhost/app/' + section, { method: 'POST', body: form }),
  } as PortalActionEvent;
}
function files(): string[] {
  const root = process.env.JA_DOCUMENT_ROOT!;
  return existsSync(root)
    ? readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name))
        .sort()
    : [];
}

describe('duplicate private uploads', () => {
  it.each(['expenses', 'documents'])(
    '%s returns a controlled conflict for renamed identical bytes and removes failed artifacts',
    async (section) => {
      setup();
      const action =
        section === 'expenses'
          ? expenseActions.createExpense
          : documentActions.uploadPrivateDocument;
      expect(await action(event(section, 'original.pdf'))).toMatchObject({ success: true });
      const original = value.sqlite.prepare('SELECT * FROM document').get();
      const originalFiles = files();
      expect(originalFiles).toHaveLength(1);
      const result = await action(event(section, 'renamed.pdf'));
      expect(result).toMatchObject({
        status: 409,
        data: { success: false, messageKey: 'action.error.conflict' },
      });
      expect(value.sqlite.prepare('SELECT * FROM document').all()).toEqual([original]);
      expect(files()).toEqual(originalFiles);
      expect(readFileSync(originalFiles[0]!)).toEqual(bytes);
      expect(value.sqlite.prepare('SELECT count(*) n FROM expense').get()).toEqual({
        n: section === 'expenses' ? 1 : 0,
      });
    },
  );

  it('never returns another project owner or document identity for a content collision', () => {
    setup();
    const project = value.repository.createProject(value.owner, {
      clientId: value.client.id,
      name: 'Other private project',
      timezone: 'Europe/Madrid',
      currency: 'EUR',
      billingModel: 'tm',
      startDate: '2026-01-01',
    });
    const original = value.v3.reserveUpload(value.owner, {
      projectId: project.id,
      originalFilename: 'secret-owner-file.pdf',
      artifactType: 'receipt',
      sensitivity: 'sensitive',
    });
    const content = {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      mediaType: 'application/pdf',
      byteLength: bytes.length,
    };
    value.v3.finalizeUpload(value.owner, original.reservationId, content);
    const duplicate = value.v3.reserveUpload(value.worker, {
      projectId: value.project.id,
      originalFilename: 'worker.pdf',
      artifactType: 'receipt',
    });
    expect(() => value.v3.finalizeUpload(value.worker, duplicate.reservationId, content)).toThrow(
      V3ConflictError,
    );
    try {
      value.v3.finalizeUpload(value.worker, duplicate.reservationId, content);
    } catch (error) {
      expect(String(error)).not.toContain(original.reservationId);
      expect(String(error)).not.toContain(project.id);
      expect(String(error)).not.toContain('secret-owner-file');
    }
    expect(() => value.v3.authorizeDocument(value.worker, original.reservationId)).toThrow();
    value.v3.cancelUploadReservation(value.worker, duplicate.reservationId);
    expect(value.sqlite.prepare('SELECT id FROM document').all()).toEqual([
      { id: original.reservationId },
    ]);
  });
});
