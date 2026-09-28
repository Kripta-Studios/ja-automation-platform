import { json } from '@sveltejs/kit';
import { cachedOperationalReadiness } from '$lib/server/health-readiness';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user || !['owner_admin', 'auditor_read_only'].includes(locals.user.role ?? ''))
    return json({ status: 'ok' }, { status: 200, headers: { 'cache-control': 'no-store' } });

  const readiness = await cachedOperationalReadiness();
  return json(
    {
      status: readiness?.ok ? 'ok' : 'degraded',
      database: readiness.integrity === 'ok' ? 'ok' : 'unavailable',
      migration: readiness
        ? { current: readiness.migrationVersion, expected: readiness.expectedMigrationVersion }
        : undefined,
      writableDirectories: readiness?.writableDirectories ?? false,
      writeReady: readiness?.writeReady ?? false,
      scanner: { configured: Boolean(process.env.JA_MALWARE_SCANNER_URL) },
      pdf: { renderer: 'server-side' },
      job: { queue: 'sqlite' },
      storage: {
        rootConfigured: Boolean(process.env.JA_DOCUMENT_ROOT ?? process.env.JA_FILES_ROOT),
      },
      disk: {
        freeBytes: readiness.diskFreeBytes,
        minimumBytes: readiness.diskFreeThresholdBytes,
      },
      time: new Date().toISOString(),
    },
    { status: readiness.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
};
