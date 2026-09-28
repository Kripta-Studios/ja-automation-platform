import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { buildCleanupInventory, type CleanupEntity } from './audit-business-data-cleanup.ts';

export type ReviewedCleanupEntry = {
  table: 'client' | 'project';
  id: string;
  rowDigest: string;
  dependencyDigest: string;
  provenanceEvidence: string;
};
export type ReviewedCleanupManifest = {
  version: 1;
  rehearsalOnly: true;
  reviewedBy: string;
  entries: ReviewedCleanupEntry[];
};

function assertRehearsalPath(path: string): string {
  const actual = realpathSync(resolve(path));
  if (!basename(actual).endsWith('.rehearsal.sqlite'))
    throw new Error('Cleanup can run only on an isolated *.rehearsal.sqlite copy');
  if (actual.startsWith('/var/lib/jaautomation/') || actual.startsWith('/opt/jaautomation/'))
    throw new Error('Production and release storage are never rehearsal targets');
  const productionPath = '/var/lib/jaautomation/data/jaautomation.sqlite';
  try {
    const prod = statSync(productionPath);
    const target = statSync(actual);
    if (prod.dev === target.dev && prod.ino === target.ino)
      throw new Error('Rehearsal target is the production database inode');
  } catch (error) {
    if (error instanceof Error && error.message.includes('production database inode')) throw error;
  }
  return actual;
}

function assertManifest(value: ReviewedCleanupManifest): void {
  if (
    value.version !== 1 ||
    value.rehearsalOnly !== true ||
    !value.reviewedBy?.trim() ||
    !Array.isArray(value.entries) ||
    !value.entries.length
  )
    throw new Error('A nonempty reviewed rehearsal manifest is required');
  const keys = new Set<string>();
  for (const entry of value.entries) {
    if (
      !['client', 'project'].includes(entry.table) ||
      !entry.id?.trim() ||
      !/^[0-9a-f]{64}$/.test(entry.rowDigest) ||
      !/^[0-9a-f]{64}$/.test(entry.dependencyDigest) ||
      !entry.provenanceEvidence?.startsWith('fixture-ledger:')
    )
      throw new Error(
        'Each deletion needs a stable ID, matching digests and fixture-ledger evidence',
      );
    const key = `${entry.table}:${entry.id}`;
    if (keys.has(key)) throw new Error('Duplicate manifest ID');
    keys.add(key);
  }
}

function assertDeletable(
  entity: CleanupEntity,
  entry: ReviewedCleanupEntry,
  incomplete: string[],
): void {
  if (entity.classification !== 'verified_fixture' || entity.reasons.length)
    throw new Error(`Protected or ambiguous record refused: ${entry.table}:${entry.id}`);
  if (entity.finalized) throw new Error(`Finalized record refused: ${entry.table}:${entry.id}`);
  if (entity.rowDigest !== entry.rowDigest || entity.dependencyDigest !== entry.dependencyDigest)
    throw new Error(`Record changed since review: ${entry.table}:${entry.id}`);
  if (Object.values(entity.dependencyCounts).some((count) => count > 0))
    throw new Error(
      `Dependent records require separate classification: ${entry.table}:${entry.id}`,
    );
  // A composite or implicit relation anywhere in a descendant table can hide a dependency.
  // Until every relationship is understood, the rehearsal must remain read-only.
  if (incomplete.length)
    throw new Error(`Incomplete dependency relationships block cleanup: ${incomplete.length}`);
}

/** No production path is accepted. Deletes only dependency-free, positively attested fixtures. */
export function applyCleanupRehearsal(
  path: string,
  manifest: ReviewedCleanupManifest,
): {
  status: 'deleted' | 'already_applied';
  deleted: number;
} {
  const actual = assertRehearsalPath(path);
  assertManifest(manifest);
  const manifestDigest = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  const db = new DatabaseSync(actual);
  try {
    db.exec('PRAGMA foreign_keys=ON');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS cleanup_rehearsal_journal(
        manifest_digest TEXT PRIMARY KEY, deleted_count INTEGER NOT NULL, applied_at TEXT NOT NULL
      ) STRICT`);
      const present = manifest.entries.map((entry) =>
        Boolean(db.prepare(`SELECT 1 FROM "${entry.table}" WHERE id=?`).get(entry.id)),
      );
      if (present.every((value) => !value)) {
        const applied = db
          .prepare('SELECT 1 FROM cleanup_rehearsal_journal WHERE manifest_digest=?')
          .get(manifestDigest);
        if (!applied)
          throw new Error(
            'Missing records without a matching cleanup journal are not idempotent proof',
          );
        db.exec('ROLLBACK');
        return { status: 'already_applied', deleted: 0 };
      }
      if (present.some((value) => !value)) throw new Error('Partially applied manifest refused');
      const verifiedIds = new Set(manifest.entries.map((entry) => entry.id));
      const inventory = buildCleanupInventory(db, verifiedIds);
      for (const entry of manifest.entries) {
        const entity = inventory.entities.find(
          (row) => row.table === entry.table && row.id === entry.id,
        );
        if (!entity) throw new Error(`Missing manifest entity: ${entry.table}:${entry.id}`);
        assertDeletable(entity, entry, inventory.incompleteRelations);
      }
      // A client can be deleted only after all its project references disappear. The preflight
      // deliberately rejects clients with projects, so this order is defensive rather than a cascade.
      for (const entry of [...manifest.entries].sort((a, b) =>
        a.table === b.table ? 0 : a.table === 'project' ? -1 : 1,
      )) {
        const result = db.prepare(`DELETE FROM "${entry.table}" WHERE id=?`).run(entry.id);
        if (result.changes !== 1)
          throw new Error(`Concurrent cleanup change: ${entry.table}:${entry.id}`);
      }
      const fkFailures = db.prepare('PRAGMA foreign_key_check').all();
      if (fkFailures.length) throw new Error('Foreign-key validation failed; cleanup rolled back');
      db.prepare('INSERT INTO cleanup_rehearsal_journal VALUES(?,?,?)').run(
        manifestDigest,
        manifest.entries.length,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
      return { status: 'deleted', deleted: manifest.entries.length };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } finally {
    db.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dbArg = process.argv[process.argv.indexOf('--database') + 1];
  const manifestArg = process.argv[process.argv.indexOf('--manifest') + 1];
  if (
    !process.argv.includes('--database') ||
    !process.argv.includes('--manifest') ||
    !process.argv.includes('--rehearsal') ||
    !dbArg ||
    !manifestArg
  )
    throw new Error(
      'Use --database <copy.rehearsal.sqlite> --manifest <reviewed.json> --rehearsal',
    );
  const manifest = JSON.parse(
    readFileSync(resolve(manifestArg), 'utf8'),
  ) as ReviewedCleanupManifest;
  process.stdout.write(JSON.stringify(applyCleanupRehearsal(dbArg, manifest)) + '\n');
}
