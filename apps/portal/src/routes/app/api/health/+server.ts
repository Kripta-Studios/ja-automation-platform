import { openDatabase, readinessCheck } from '@ja/database';
import { json } from '@sveltejs/kit';
export const GET = () => {
  const db = openDatabase();
  let readiness;
  try {
    readiness = readinessCheck(db);
  } finally {
    db.close();
  }
  return json(
    {
      status: readiness?.ok ? 'ok' : 'degraded',
      database: readiness?.integrity ?? 'unavailable',
      migration: readiness
        ? { current: readiness.migrationVersion, expected: readiness.expectedMigrationVersion }
        : undefined,
      writableDirectories: readiness?.writableDirectories ?? false,
      writeReady: readiness?.writeReady ?? false,
      disk: {
        freeBytes: readiness?.diskFreeBytes ?? null,
        minimumBytes: readiness?.diskFreeThresholdBytes ?? null,
      },
      time: new Date().toISOString(),
    },
    { status: readiness?.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
};
