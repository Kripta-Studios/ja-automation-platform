import type { DatabaseSync } from 'node:sqlite';

export function nextNumberSequence(sqlite: DatabaseSync, scope: string, scopeId: string): number {
  const row = sqlite
    .prepare('SELECT next_value FROM number_sequence WHERE scope=? AND scope_id=?')
    .get(scope, scopeId) as { next_value: number } | undefined;
  if (!row) {
    sqlite
      .prepare('INSERT INTO number_sequence(scope,scope_id,next_value,version) VALUES(?,?,2,1)')
      .run(scope, scopeId);
    return 1;
  }
  sqlite
    .prepare(
      'UPDATE number_sequence SET next_value=?,version=version+1 WHERE scope=? AND scope_id=?',
    )
    .run(row.next_value + 1, scope, scopeId);
  return row.next_value;
}
