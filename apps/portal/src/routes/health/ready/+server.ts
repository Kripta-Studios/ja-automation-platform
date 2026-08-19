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
    { status: readiness.ok ? 'ok' : 'degraded' },
    { status: readiness.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
};
