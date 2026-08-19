import { json } from '@sveltejs/kit';

export const GET = () =>
  json(
    { status: 'ok', time: new Date().toISOString() },
    { headers: { 'cache-control': 'no-store' } },
  );
