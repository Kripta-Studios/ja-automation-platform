import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Document scanning is a service-only scanner capability dispatched by the
 * durable jobs runner. Human HTTP requests have no transition authority.
 */
export const POST: RequestHandler = async () =>
  json({ error: 'Scanner service-only endpoint' }, { status: 404 });
