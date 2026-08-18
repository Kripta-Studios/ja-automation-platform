import { openDatabase, integrityCheck } from '@ja/database';
import { json } from '@sveltejs/kit';
export const GET = () => {
  const db = openDatabase();
  let database = 'unavailable';
  try {
    database = integrityCheck(db);
  } finally {
    db.close();
  }
  return json(
    { status: database === 'ok' ? 'ok' : 'degraded', database, time: new Date().toISOString() },
    { status: database === 'ok' ? 200 : 503 },
  );
};
