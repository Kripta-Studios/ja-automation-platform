import { constants } from 'node:fs';
import { open as openFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { AccessDeniedError, assertLiveSession } from '@ja/database';
import type { RequestHandler } from './$types';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  ownerTutorialAssetInfo,
  parseOwnerTutorialByteRange,
  type OwnerTutorialAssetInfo,
} from '$lib/server/owner-tutorial';
import { personaForPrincipal } from '$lib/server/manual-catalog';

function privateHeaders(): Record<string, string> {
  return {
    'cache-control': 'private, no-store',
    pragma: 'no-cache',
    expires: '0',
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
  };
}

function emptyResponse(status: number, additionalHeaders: Record<string, string> = {}): Response {
  return new Response(null, {
    status,
    headers: { ...privateHeaders(), ...additionalHeaders },
  });
}

function authorizeOwner(locals: App.Locals): Response | null {
  if (!locals.user || !locals.session) return emptyResponse(401);

  let context: ReturnType<typeof openPortalRepository> | undefined;
  let persona: ReturnType<typeof personaForPrincipal> = null;
  try {
    context = openPortalRepository(locals);
    assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
    persona = personaForPrincipal(context.sqlite, context.principal);
  } catch (cause) {
    if (cause instanceof AccessDeniedError) return emptyResponse(401);
    throw cause;
  } finally {
    context?.sqlite.close();
  }

  // A restricted supplier profile wins over the underlying Worker role in
  // personaForPrincipal, so a forged owner display role cannot reach this path.
  return persona === 'owner' ? null : emptyResponse(404);
}

function streamHeaders(asset: OwnerTutorialAssetInfo, start: number, end: number) {
  return {
    ...privateHeaders(),
    'content-type': asset.contentType,
    'content-length': String(end - start + 1),
    'content-disposition': `inline; filename="${asset.filename}"`,
    'accept-ranges': 'bytes',
  };
}

async function serveAsset(
  event: Parameters<RequestHandler>[0],
  method: 'GET' | 'HEAD',
): Promise<Response> {
  // Authenticate before looking up the requested key or touching the asset path.
  const authorizationFailure = authorizeOwner(event.locals);
  if (authorizationFailure) return authorizationFailure;

  const asset = ownerTutorialAssetInfo(event.params.asset);
  if (!asset) return emptyResponse(404);

  const rangeHeader = event.request.headers.get('range');
  const ifRange = event.request.headers.get('if-range');
  const range =
    method === 'GET' && !ifRange ? parseOwnerTutorialByteRange(rangeHeader, asset.size) : null;
  if (range === 'unsatisfiable') {
    return emptyResponse(416, {
      'content-type': asset.contentType,
      'content-length': '0',
      'accept-ranges': 'bytes',
      'content-range': `bytes */${asset.size}`,
    });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? asset.size - 1;
  const status = range ? 206 : 200;
  const headers: Record<string, string> = streamHeaders(asset, start, end);
  if (range) headers['content-range'] = `bytes ${start}-${end}/${asset.size}`;
  if (method === 'HEAD') return new Response(null, { status, headers });

  let fileStream: ReturnType<Awaited<ReturnType<typeof openFile>>['createReadStream']>;
  let fileHandle: Awaited<ReturnType<typeof openFile>> | undefined;
  try {
    fileHandle = await openFile(asset.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const openedStat = await fileHandle.stat();
    if (!openedStat.isFile() || openedStat.size !== asset.size) {
      await fileHandle.close();
      return emptyResponse(503);
    }
    fileStream = fileHandle.createReadStream({
      start,
      end,
      highWaterMark: 64 * 1024,
      autoClose: true,
    });
  } catch {
    await fileHandle?.close().catch(() => undefined);
    return emptyResponse(503);
  }

  const openedFileHandle = fileHandle;
  fileStream.once('close', () => {
    // Keep the FileHandle strongly reachable until the stream's auto-close finishes.
    void openedFileHandle.close().catch(() => undefined);
  });
  const abortStream = () => fileStream.destroy();
  fileStream.once('close', () => event.request.signal.removeEventListener('abort', abortStream));

  const response = new Response(
    Readable.toWeb(fileStream, {
      strategy: {
        highWaterMark: 64 * 1024,
        size: (chunk: Uint8Array) => chunk.byteLength,
      },
    }) as ReadableStream<Uint8Array>,
    {
      status,
      headers,
    },
  );
  event.request.signal.addEventListener('abort', abortStream, { once: true });
  if (event.request.signal.aborted) abortStream();
  return response;
}

export const GET: RequestHandler = (event) => serveAsset(event, 'GET');
export const HEAD: RequestHandler = (event) => serveAsset(event, 'HEAD');
