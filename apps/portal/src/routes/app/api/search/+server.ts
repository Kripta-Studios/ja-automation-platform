import { json, type RequestHandler } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';
import { projectManagerSearchProjection } from '../../[section]/role-projections';

/**
 * Ctrl/⌘ K record search, loaded on demand instead of shipping record lists
 * with every page. Same authorized repository search (and Project Manager
 * projection) as the ?q= results page; operational supplier accounts get none.
 */
export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user || !locals.session)
    return json({ records: [] }, { status: 401, headers: { 'cache-control': 'private, no-store' } });
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 120);
  if (query.length < 2)
    return json({ records: [] }, { headers: { 'cache-control': 'private, no-store' } });
  const context = openPortalRepository(locals);
  try {
    const restricted = context.sqlite
      .prepare('SELECT 1 FROM supplier_user_profile WHERE user_id=?')
      .get(context.principal.userId);
    if (restricted)
      return json({ records: [] }, { headers: { 'cache-control': 'private, no-store' } });
    const rows = context.repository.search(context.principal, query, {
      includeArchived: url.searchParams.get('includeArchived') === '1',
    });
    const records = (
      context.principal.role === 'project_manager' ? projectManagerSearchProjection(rows) : rows
    ).slice(0, 30);
    return json({ records }, { headers: { 'cache-control': 'private, no-store' } });
  } finally {
    context.sqlite.close();
  }
};
