import { createHash } from 'node:crypto';
import { createDatabase } from '@ja/database';
import type { PageServerLoad } from './$types';

const TOKEN_SHAPE = /^\S{40,100}$/u;
// Mirrors the accept API: an unclaimed row, or a claim marker the API may still recover.
const RECOVERABLE_CLAIM = /^pending:/u;

/**
 * Check the link before showing the activation form, so a used, expired or
 * malformed link explains itself instead of failing after the person types.
 * The accept API remains the authority; this only decides which page to show.
 */
export const load: PageServerLoad = ({ params, setHeaders }) => {
  setHeaders({ 'cache-control': 'no-store' });
  const token = params.token.trim();
  if (!TOKEN_SHAPE.test(token)) return { token: params.token, valid: false };
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { sqlite } = createDatabase();
  try {
    const row = sqlite
      .prepare('SELECT used_at FROM invitation WHERE token_hash=? AND expires_at>?')
      .get(tokenHash, new Date().toISOString()) as { used_at: string | null } | undefined;
    const valid = Boolean(row && (row.used_at === null || RECOVERABLE_CLAIM.test(row.used_at)));
    return { token: params.token, valid };
  } finally {
    sqlite.close();
  }
};
