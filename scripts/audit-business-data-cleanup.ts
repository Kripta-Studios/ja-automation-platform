import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Row = Record<string, string | number | bigint | null>;
type Relation = { child: string; from: string; to: string };
export type CleanupEntity = {
  table: 'client' | 'project';
  id: string;
  rowDigest: string;
  classification: 'protected' | 'verified_fixture' | 'ambiguous_marker' | 'unclassified';
  reasons: string[];
  dependencyCounts: Record<string, number>;
  dependencyDigest: string;
  finalized: boolean;
};
export type CleanupInventory = {
  version: 1;
  entities: CleanupEntity[];
  protectedMailboxUserCount: number;
  allUserCount: number;
  incompleteRelations: string[];
};
export type CleanupDryRunReview = {
  kind: 'business_data_cleanup_dry_run';
  version: 1;
  snapshotDigest: string;
  protectedMailboxUserCount: number;
  allUserCount: number;
  incompleteRelations: string[];
  entries: Array<
    Pick<
      CleanupEntity,
      | 'table'
      | 'id'
      | 'rowDigest'
      | 'dependencyDigest'
      | 'classification'
      | 'dependencyCounts'
      | 'finalized'
    > & { blockers: string[]; eligibleForRehearsal: boolean }
  >;
};

const knownQaClientId = '01a0cf9b-bec4-72cd-a97d-8de393f89dd5';
const knownQaProjectId = '01a0cfae-9005-76a9-871a-8cf4edf877dd';
const knownProtectedClientIds = new Set(['client-020-impc']);
const knownProtectedProjectIds = new Set(['project-cp020-bbs-mexico']);
const marker = /\b(?:demo|test|fixture|sample|qa)\b/i;
const protectedNames = /\b(?:BBS|IMPC)\b/i;

function q(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function cleanupRowDigest(row: Row): string {
  return digest(
    Object.keys(row)
      .sort()
      .map((key) => {
        const value = row[key];
        return [key, value === null ? 'null' : typeof value, value === null ? null : String(value)];
      }),
  );
}

function tables(db: DatabaseSync): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  ).map((row) => row.name);
}

function columns(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${q(table)})`).all() as { name: string }[]).map(
    (row) => row.name,
  );
}

function relations(
  db: DatabaseSync,
  tableNames: string[],
): { edges: Map<string, Relation[]>; incomplete: string[] } {
  const edges = new Map<string, Relation[]>();
  const incomplete: string[] = [];
  const tableSet = new Set(tableNames);
  for (const child of tableNames) {
    const fks = db.prepare(`PRAGMA foreign_key_list(${q(child)})`).all() as Array<{
      id: number;
      table: string;
      from: string;
      to: string;
    }>;
    const groups = new Map<number, typeof fks>();
    for (const fk of fks) groups.set(fk.id, [...(groups.get(fk.id) ?? []), fk]);
    for (const group of groups.values()) {
      if (group.length !== 1 || !group[0]?.to) {
        incomplete.push(`${child}:composite-or-implicit-fk`);
        continue;
      }
      const fk = group[0];
      if (!tableSet.has(fk.table)) continue;
      edges.set(fk.table, [...(edges.get(fk.table) ?? []), { child, from: fk.from, to: fk.to }]);
    }
    const col = columns(db, child);
    for (const target of ['client', 'project']) {
      const from = `${target}_id`;
      if (!col.includes(from) || !tableSet.has(target)) continue;
      const existing = edges.get(target) ?? [];
      if (!existing.some((edge) => edge.child === child && edge.from === from))
        edges.set(target, [...existing, { child, from, to: 'id' }]);
    }
  }
  return { edges, incomplete };
}

function dependentRows(
  db: DatabaseSync,
  rootTable: string,
  rootId: string,
  edges: Map<string, Relation[]>,
): {
  counts: Record<string, number>;
  digest: string;
} {
  const seen = new Set<string>();
  const queue: Array<{ table: string; row: Row }> = [];
  const root = db.prepare(`SELECT * FROM ${q(rootTable)} WHERE id=?`).get(rootId) as
    | Row
    | undefined;
  if (!root) return { counts: {}, digest: digest([]) };
  queue.push({ table: rootTable, row: root });
  const identities: string[] = [];
  const counts: Record<string, number> = {};
  while (queue.length) {
    const next = queue.shift()!;
    const identity = `${next.table}:${cleanupRowDigest(next.row)}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    if (next.table !== rootTable || String(next.row.id ?? '') !== rootId) {
      counts[next.table] = (counts[next.table] ?? 0) + 1;
      identities.push(identity);
    }
    for (const edge of edges.get(next.table) ?? []) {
      const value = next.row[edge.to];
      if (value === null || value === undefined) continue;
      const children = db
        .prepare(`SELECT * FROM ${q(edge.child)} WHERE ${q(edge.from)}=?`)
        .all(value) as Row[];
      for (const child of children) queue.push({ table: edge.child, row: child });
    }
  }
  return { counts, digest: digest(identities.sort()) };
}

function softReferenceCounts(
  db: DatabaseSync,
  tableNames: string[],
  id: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of tableNames) {
    const refs = columns(db, table).filter((column) =>
      ['entity_id', 'target_id', 'subject_id'].includes(column),
    );
    if (!refs.length) continue;
    const where = refs.map((column) => `${q(column)}=?`).join(' OR ');
    const count = (
      db
        .prepare(`SELECT COUNT(*) count FROM ${q(table)} WHERE ${where}`)
        .get(...refs.map(() => id)) as { count: number }
    ).count;
    if (count) counts[`soft:${table}`] = count;
  }
  return counts;
}

function finalized(db: DatabaseSync, projectId: string): boolean {
  const invoice = db
    .prepare(
      "SELECT 1 FROM invoice WHERE project_id=? AND state NOT IN ('draft','approved') LIMIT 1",
    )
    .get(projectId);
  let closedPeriod = false;
  try {
    closedPeriod = Boolean(
      db
        .prepare(
          "SELECT 1 FROM billing_period WHERE project_id=? AND state IN ('closed','finalized') LIMIT 1",
        )
        .get(projectId),
    );
  } catch {
    /* older schema */
  }
  return Boolean(invoice || closedPeriod);
}

export function buildCleanupInventory(
  db: DatabaseSync,
  verifiedFixtureIds: ReadonlySet<string> = new Set(),
): CleanupInventory {
  const names = tables(db);
  const { edges, incomplete } = relations(db, names);
  const mailboxUsers = names.includes('mail_identity')
    ? new Set(
        (db.prepare('SELECT user_id FROM mail_identity').all() as { user_id: string }[]).map(
          (row) => row.user_id,
        ),
      )
    : new Set<string>();
  const userCount = (db.prepare('SELECT COUNT(*) count FROM user').get() as { count: number })
    .count;
  const clientRows = db.prepare('SELECT * FROM client ORDER BY id').all() as Row[];
  const projectRows = db.prepare('SELECT * FROM project ORDER BY id').all() as Row[];
  const protectedClientIds = new Set<string>();
  const protectedProjectIds = new Set<string>();
  for (const client of clientRows) {
    const id = String(client.id);
    if (
      knownProtectedClientIds.has(id) ||
      protectedNames.test([client.legal_name, client.display_name, client.client_number].join(' '))
    )
      protectedClientIds.add(id);
  }
  for (const project of projectRows) {
    const id = String(project.id);
    if (
      knownProtectedProjectIds.has(id) ||
      protectedNames.test([project.name, project.project_number].join(' ')) ||
      protectedClientIds.has(String(project.client_id))
    )
      protectedProjectIds.add(id);
  }
  // Every user identity is preserved. A project with a worker assignment therefore remains
  // protected, especially when the user is mailbox-backed. Never delete its assignment closure.
  const assignedProjects = new Set(
    (
      db.prepare('SELECT DISTINCT project_id FROM project_member').all() as { project_id: string }[]
    ).map((row) => row.project_id),
  );
  const entities: CleanupEntity[] = [];
  for (const row of clientRows) {
    const id = String(row.id);
    const dep = dependentRows(db, 'client', id, edges);
    const dependencyCounts = { ...dep.counts, ...softReferenceCounts(db, names, id) };
    const childProtected = projectRows.some(
      (project) =>
        String(project.client_id) === id &&
        (protectedProjectIds.has(String(project.id)) || assignedProjects.has(String(project.id))),
    );
    const reasons = [
      ...(protectedClientIds.has(id) ? ['BBS/IMPC protected client root'] : []),
      ...(childProtected ? ['contains protected or worker-assigned project'] : []),
      ...(id === knownQaClientId ? ['known QA client retained until acceptance'] : []),
    ];
    entities.push({
      table: 'client',
      id,
      rowDigest: cleanupRowDigest(row),
      classification: reasons.length
        ? 'protected'
        : verifiedFixtureIds.has(id)
          ? 'verified_fixture'
          : marker.test([row.legal_name, row.display_name].join(' '))
            ? 'ambiguous_marker'
            : 'unclassified',
      reasons,
      dependencyCounts,
      dependencyDigest: digest([dep.digest, dependencyCounts]),
      finalized: ['archived', 'closed'].includes(String(row.status ?? '')),
    });
  }
  for (const row of projectRows) {
    const id = String(row.id);
    const dep = dependentRows(db, 'project', id, edges);
    const dependencyCounts = { ...dep.counts, ...softReferenceCounts(db, names, id) };
    const reasons = [
      ...(protectedProjectIds.has(id) ? ['BBS/IMPC protected project root'] : []),
      ...(assignedProjects.has(id) ? ['worker assignment: user identities protected'] : []),
      ...(id === knownQaProjectId ? ['known QA project retained until acceptance'] : []),
    ];
    const isFinalized =
      finalized(db, id) || ['closing', 'closed', 'archived'].includes(String(row.status ?? ''));
    entities.push({
      table: 'project',
      id,
      rowDigest: cleanupRowDigest(row),
      classification: reasons.length
        ? 'protected'
        : verifiedFixtureIds.has(id)
          ? 'verified_fixture'
          : marker.test(String(row.name ?? ''))
            ? 'ambiguous_marker'
            : 'unclassified',
      reasons,
      dependencyCounts,
      dependencyDigest: digest([dep.digest, dependencyCounts]),
      finalized: isFinalized,
    });
  }
  return {
    version: 1,
    entities,
    protectedMailboxUserCount: mailboxUsers.size,
    allUserCount: userCount,
    incompleteRelations: incomplete,
  };
}

export function openCleanupInventory(path: string): CleanupInventory {
  const db = new DatabaseSync(resolve(path), { readOnly: true });
  try {
    db.exec('PRAGMA query_only=ON');
    return buildCleanupInventory(db);
  } finally {
    db.close();
  }
}

/** A review artifact only; it lacks the attestation fields required by the rehearsal applier. */
export function buildCleanupDryRunReview(inventory: CleanupInventory): CleanupDryRunReview {
  const entries = inventory.entities.map((entity) => {
    const dependencyCount = Object.values(entity.dependencyCounts).reduce(
      (sum, count) => sum + count,
      0,
    );
    const blockers = [
      ...entity.reasons,
      ...(entity.classification !== 'verified_fixture' ? ['no positive fixture attestation'] : []),
      ...(entity.finalized ? ['finalized or archived business state'] : []),
      ...(dependencyCount
        ? [`${dependencyCount} linked records require individual classification`]
        : []),
      ...(inventory.incompleteRelations.length
        ? [`${inventory.incompleteRelations.length} unresolved database relationships`]
        : []),
    ];
    return {
      table: entity.table,
      id: entity.id,
      rowDigest: entity.rowDigest,
      dependencyDigest: entity.dependencyDigest,
      classification: entity.classification,
      dependencyCounts: entity.dependencyCounts,
      finalized: entity.finalized,
      blockers,
      eligibleForRehearsal: blockers.length === 0,
    };
  });
  return {
    kind: 'business_data_cleanup_dry_run',
    version: 1,
    snapshotDigest: digest([
      entries,
      inventory.incompleteRelations,
      inventory.protectedMailboxUserCount,
      inventory.allUserCount,
    ]),
    protectedMailboxUserCount: inventory.protectedMailboxUserCount,
    allUserCount: inventory.allUserCount,
    incompleteRelations: inventory.incompleteRelations,
    entries,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = process.argv[process.argv.indexOf('--database') + 1];
  if (!process.argv.includes('--database') || !path)
    throw new Error('Use --database <sqlite path>');
  const result = openCleanupInventory(path);
  const counts = result.entities.reduce(
    (acc, row) => {
      acc[row.classification] = (acc[row.classification] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  if (process.argv.includes('--review')) {
    process.stdout.write(JSON.stringify(buildCleanupDryRunReview(result), null, 2) + '\n');
  } else if (process.argv.includes('--summary')) {
    process.stdout.write(
      JSON.stringify(
        {
          clients: result.entities.filter((row) => row.table === 'client').length,
          projects: result.entities.filter((row) => row.table === 'project').length,
          classifications: counts,
          protectedMailboxUserCount: result.protectedMailboxUserCount,
          allUserCount: result.allUserCount,
          incompleteRelationCount: result.incompleteRelations.length,
        },
        null,
        2,
      ) + '\n',
    );
  } else process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
