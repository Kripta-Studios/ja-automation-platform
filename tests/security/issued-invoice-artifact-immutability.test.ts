import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { servePrivateArtifact } from '../../apps/portal/src/lib/server/private-artifact-access';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
} from '../fixtures/b5-lifecycle-security-fixture';

let fixture: ReturnType<typeof createB5LifecycleSecurityFixture>;
let principal: ReturnType<typeof stepUpB5Principal>;
let originalRoot: string | undefined;
let ordinal = 0;

beforeAll(() => {
  fixture = createB5LifecycleSecurityFixture();
  principal = stepUpB5Principal(fixture.sqlite, fixture.finance, 'immutable-invoice-download');
  originalRoot = process.env.JA_DOCUMENT_ROOT;
  process.env.JA_DOCUMENT_ROOT = join(fixture.directory, 'documents');
  mkdirSync(join(process.env.JA_DOCUMENT_ROOT, 'invoices'), { recursive: true });
});

afterAll(() => {
  if (originalRoot === undefined) delete process.env.JA_DOCUMENT_ROOT;
  else process.env.JA_DOCUMENT_ROOT = originalRoot;
  closeB5LifecycleSecurityFixture(fixture);
});

function invoice(state: string) {
  const id = `immutable-invoice-${++ordinal}`;
  const master = Buffer.from(`%PDF-1.7\noriginal-issued-layout-${id}\n%%EOF\n`, 'ascii');
  const storageKey = `invoices/${id}.pdf`;
  const now = new Date().toISOString();
  const preview = state === 'draft' || state === 'approved';
  fixture.sqlite
    .prepare(
      `INSERT INTO invoice(
        id,project_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,
        total_minor,snapshot_json,issued_at,created_at,updated_at,pdf_status,
        pdf_storage_key,pdf_sha256,pdf_byte_length,pdf_generated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      fixture.project.id,
      preview ? null : `BBS-TEST-${ordinal}`,
      'labor',
      state,
      'EUR',
      100,
      0,
      100,
      '{}',
      preview ? null : now,
      now,
      now,
      'ready',
      storageKey,
      createHash('sha256').update(master).digest('hex'),
      master.byteLength,
      now,
    );
  const path = join(process.env.JA_DOCUMENT_ROOT!, storageKey);
  writeFileSync(path, master);
  const renderer = vi.fn(() => Buffer.from('%PDF-1.7\nnew-layout\n%%EOF\n', 'ascii'));
  return {
    id,
    path,
    renderer,
    master,
    options: {
      sqlite: fixture.sqlite,
      principal,
      kind: 'invoice' as const,
      id,
      expectedMediaType: 'application/pdf',
      loadMetadata: () => fixture.v3.invoicePdfMetadata(principal, id),
      generateBytes: renderer,
    },
  };
}

describe('issued invoice download preserves the stored artifact', () => {
  it.each(['issued', 'sent', 'partially_paid', 'paid', 'overdue', 'void', 'credited'])(
    'returns byte-identical stored PDF for %s despite a supplied newer renderer',
    async (state) => {
      const value = invoice(state);
      const response = await servePrivateArtifact(value.options);
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(value.master);
      expect(response.headers.get('content-length')).toBe(String(value.master.byteLength));
      expect(value.renderer).not.toHaveBeenCalled();
      expect(readFileSync(value.path)).toEqual(value.master);
    },
  );

  it.each(['draft', 'approved'])('permits an explicit preview renderer for %s', async (state) => {
    const value = invoice(state);
    const response = await servePrivateArtifact(value.options);
    expect(response.status).toBe(200);
    expect(value.renderer).toHaveBeenCalledOnce();
    expect(Buffer.from(await response.arrayBuffer())).not.toEqual(value.master);
    expect(readFileSync(value.path)).toEqual(value.master);
  });

  it('blocks a corrupted terminal PDF rather than silently rerendering it', async () => {
    const value = invoice('issued');
    writeFileSync(value.path, Buffer.from('%PDF-1.7\ncorrupted-issued-file\n%%EOF\n', 'ascii'));
    const response = await servePrivateArtifact(value.options);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'INVOICE_PDF_INTEGRITY_BLOCKED' });
    expect(value.renderer).not.toHaveBeenCalled();
  });

  it('checks stored length before serving a terminal invoice', async () => {
    const value = invoice('paid');
    const response = await servePrivateArtifact({
      ...value.options,
      loadMetadata: () => ({
        ...value.options.loadMetadata(),
        byteLength: value.master.byteLength + 1,
      }),
    });
    expect(response.status).toBe(409);
    expect(value.renderer).not.toHaveBeenCalled();
  });
});
