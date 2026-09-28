import { json } from '@sveltejs/kit';
import { cachedOperationalReadiness } from '$lib/server/health-readiness';

export const GET = async () => {
  const readiness = await cachedOperationalReadiness();
  return json(
    { status: readiness.ok ? 'ok' : 'degraded' },
    { status: readiness.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
};
