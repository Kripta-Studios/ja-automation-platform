import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { open as openFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { json, type RequestHandler } from '@sveltejs/kit';
import { AccessDeniedError, ConflictError } from '@ja/database';
import { localizedPdfProblem } from '$lib/server/localized-pdf-api';
import { openPortalRepository } from '$lib/server/portal-repository';
import { semanticFilenamePart } from '$lib/server/report-export-request';

function privateArtifactHeaders(): Record<string, string> {
  return {
    'cache-control': 'private, no-store',
    pragma: 'no-cache',
    expires: '0',
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
    'content-security-policy': 'sandbox',
  };
}

function notFound(): Response {
  // Missing and unauthorized variants intentionally share the same response to prevent IDOR
  // discovery. No filesystem access occurs before repository authorization succeeds.
  return problemResponse('unavailable', 404);
}

function problemResponse(
  kind: Parameters<typeof localizedPdfProblem>[0],
  status: number,
  owner = false,
): Response {
  return json(localizedPdfProblem(kind, { owner }), {
    status,
    headers: privateArtifactHeaders(),
  });
}

function pdfMagicValid(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 8) return false;
  const header = Buffer.from(bytes.subarray(0, 5)).toString('ascii');
  const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.byteLength - 1024))).toString('latin1');
  return header === '%PDF-' && tail.includes('%%EOF');
}

function contentDispositionFilename(filename: string): string {
  const fallback = filename.replace(/[\r\n"]/gu, '_').replace(/[^A-Za-z0-9._-]/gu, '_');
  const encoded = encodeURIComponent(filename).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

async function assertNoSymlinkParents(root: string, directory: string): Promise<void> {
  const rootPath = resolve(root);
  const targetDirectory = resolve(directory);
  const relativeDirectory = relative(rootPath, targetDirectory);
  if (
    relativeDirectory.split(/[\\/]/u).some((segment) => segment === '..') ||
    relativeDirectory.startsWith('/') ||
    relativeDirectory.startsWith('\\')
  )
    throw new Error('Localized PDF path escaped private root');
  const rootStats = await lstat(rootPath);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory())
    throw new Error('Localized PDF root must be a real directory');
  let cursor = rootPath;
  for (const component of relativeDirectory.split(/[\\/]/u).filter(Boolean)) {
    cursor = resolve(cursor, component);
    const stats = await lstat(cursor);
    if (stats.isSymbolicLink() || !stats.isDirectory())
      throw new Error('Localized PDF parent must be a real directory');
  }
}

async function readRegularFileNoFollow(path: string): Promise<Buffer> {
  const noFollow = (fsConstants as typeof fsConstants & { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
  const handle = await openFile(path, fsConstants.O_RDONLY | noFollow);
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) throw new Error('Localized PDF destination is not a regular file');
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user || !locals.session) return problemResponse('signInRequired', 401);
  const variantId = params.variantId?.trim() ?? '';
  if (!variantId) return notFound();
  const context = openPortalRepository(locals);
  try {
    let metadata;
    try {
      metadata = context.localizedPdf.resolveLocalizedPdfDownload(context.principal, variantId);
    } catch (cause) {
      if (cause instanceof AccessDeniedError) return notFound();
      if (cause instanceof ConflictError) {
        // resolveLocalizedPdfDownload has already checked this principal's access before
        // reaching a conflict. Read only the authorized projection to explain current state.
        let current;
        try {
          current = context.localizedPdf
            .listLocalizedPdfVariants?.(context.principal)
            .find((variant) => variant.variantId === variantId);
        } catch {
          // A concurrent role or source change must not become a metadata oracle.
        }
        const kind = current?.integrityBlocked
          ? 'downloadIntegrity'
          : current?.status === 'queued' || current?.status === 'running'
            ? 'downloadPending'
            : current?.status === 'failed'
              ? 'downloadFailed'
              : 'downloadStale';
        return problemResponse(kind, 409, context.principal.role === 'owner_admin');
      }
      throw cause;
    }

    const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
    const target = resolve(root, metadata.storageKey);
    const relativeTarget = relative(root, target);
    if (
      !relativeTarget ||
      relativeTarget.split(/[\\/]/u).includes('..') ||
      relativeTarget.startsWith('\\') ||
      relativeTarget.startsWith('/')
    )
      return problemResponse('downloadIntegrity', 409, context.principal.role === 'owner_admin');
    try {
      await assertNoSymlinkParents(root, dirname(target));
      const stat = await lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink())
        return problemResponse('downloadIntegrity', 409, context.principal.role === 'owner_admin');
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT')
        return problemResponse('downloadStale', 409);
      throw cause;
    }
    let bytes: Buffer;
    try {
      bytes = await readRegularFileNoFollow(target);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT')
        return problemResponse('downloadStale', 409);
      throw cause;
    }
    if (
      bytes.byteLength !== metadata.byteLength ||
      createHash('sha256').update(bytes).digest('hex') !== metadata.contentSha256 ||
      !pdfMagicValid(bytes)
    ) {
      // Re-enter the repository verifier so a race between its check and this final read also
      // records the integrity incident and atomically blocks the ready manifest.
      try {
        context.localizedPdf.resolveLocalizedPdfDownload(context.principal, variantId);
      } catch {
        // The public response remains a generic conflict regardless of the internal race cause.
      }
      return problemResponse('downloadIntegrity', 409, context.principal.role === 'owner_admin');
    }
    let downloadFilename = metadata.semanticFilename;
    if (metadata.ownerType === 'daily_report' || metadata.ownerType === 'technical_report') {
      // File reads above yield to concurrent report edits. Recheck the immutable variant's
      // source revision in the same query that reads its operational naming fields.
      const daily = metadata.ownerType === 'daily_report';
      const source = context.sqlite
        .prepare(
          daily
            ? `SELECT p.project_number,d.work_date report_date,d.summary report_title,d.version
             FROM daily_report d JOIN project p ON p.id=d.project_id
             JOIN localized_pdf_variant v ON v.owner_type='daily_report' AND v.owner_id=d.id
             WHERE v.variant_id=? AND d.id=? AND v.owner_revision_id=d.id||':v'||d.version`
            : `SELECT p.project_number,t.report_date,t.system_name report_title,t.version
             FROM technical_report t JOIN project p ON p.id=t.project_id
             JOIN localized_pdf_variant v ON v.owner_type='technical_report' AND v.owner_id=t.id
             WHERE v.variant_id=? AND t.id=? AND v.owner_revision_id=t.id||':v'||t.version`,
        )
        .get(variantId, metadata.ownerId) as
        | {
            project_number: string;
            report_date: string | null;
            report_title: string | null;
            version: number;
          }
        | undefined;
      if (!source) return notFound();
      const titles = {
        en: daily ? 'Daily-report' : 'Technical-report',
        es: daily ? 'Informe-diario' : 'Informe-tecnico',
        pt: daily ? 'Relatorio-diario' : 'Relatorio-tecnico',
      };
      const title = titles[metadata.locale];
      const date = /^\d{4}-\d{2}-\d{2}$/.test(source.report_date ?? '')
        ? source.report_date!
        : { en: 'Undated', es: 'Sin-fecha', pt: 'Sem-data' }[metadata.locale];
      downloadFilename =
        [
          title,
          semanticFilenamePart(source.project_number, 'Project').slice(0, 40),
          date,
          semanticFilenamePart(source.report_title, title).slice(0, 50),
          `v${source.version}`,
          metadata.localeTag,
        ].join('-') + '.pdf';
    }
    // Copy into a standalone ArrayBuffer so the Fetch body cannot retain a Node Buffer's
    // pooled/shared backing memory (and stays compatible with the DOM BodyInit type).
    const responseBytes = new Uint8Array(bytes.byteLength);
    responseBytes.set(bytes);
    return new Response(responseBytes.buffer as ArrayBuffer, {
      headers: {
        'content-type': metadata.mediaType,
        'content-length': String(bytes.byteLength),
        'content-disposition': contentDispositionFilename(downloadFilename),
        ...privateArtifactHeaders(),
      },
    });
  } catch (cause) {
    const problem = localizedPdfProblem('unexpected', {
      correlationId: locals.correlationId,
    });
    console.error('Unexpected localized PDF download failure', {
      correlationId: problem.correlationId,
      cause,
    });
    return json(problem, { status: 503, headers: privateArtifactHeaders() });
  } finally {
    context.sqlite.close();
  }
};
