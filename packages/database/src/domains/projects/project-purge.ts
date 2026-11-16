import type { DatabaseSync } from 'node:sqlite';

/**
 * Permanent (owner-approved) deletion of projects/clients and everything that
 * belongs to them.
 *
 * The owner decided on 2026-11-16 that an owner_admin may delete a project or
 * client completely, including issued financial history. The schema protects
 * that history with append-only triggers and RESTRICT foreign keys, so a purge
 * must be explicit and complete:
 *
 * 1. `planPurge` walks the reverse foreign-key graph (plus the few reviewed
 *    soft references that are stored without a declared foreign key) starting
 *    at the target project/client rows and collects every dependent row.
 * 2. `executePurge` runs inside the caller's IMMEDIATE transaction. It
 *    temporarily drops the guard triggers of the affected tables, defers
 *    foreign-key checks, detaches audit rows (audit history is kept, only its
 *    pointer to the deleted project becomes NULL), deletes the rows children
 *    first, and recreates the exact trigger SQL before the transaction commits.
 *    Any failure rolls back the deletes and the trigger DDL together.
 * 3. The caller removes private files listed in `storageKeys` after commit.
 */

export type PurgeTarget = Readonly<{
  projectIds: readonly string[];
  clientIds: readonly string[];
}>;

export type PurgeSummary = Readonly<{
  projects: number;
  clients: number;
  timeEntries: number;
  expenses: number;
  dailyReports: number;
  technicalReports: number;
  periodReports: number;
  invoices: number;
  payments: number;
  documents: number;
  assignments: number;
  planning: number;
  milestones: number;
  contacts: number;
  files: number;
  totalRows: number;
}>;

export type PurgePlan = Readonly<{
  rows: ReadonlyMap<string, readonly number[]>;
  nullings: ReadonlyArray<Readonly<{ table: string; column: string; rowids: readonly number[] }>>;
  storageKeys: readonly string[];
  summary: PurgeSummary;
}>;

type ForeignKey = Readonly<{
  child: string;
  childColumns: readonly string[];
  parent: string;
  parentColumns: readonly string[];
  nullable: boolean;
  onDelete: string;
  soft: boolean;
}>;

/** Rows in these tables are never removed by a purge; reaching them aborts. */
const PROTECTED_TABLES = new Set([
  'user',
  'legal_entity',
  'legal_entity_revision',
  'deployment_identity',
  'deployment_service_actor_binding',
  'service_actor',
  'audit_action_registry',
  'migration_contract_metadata',
  'tax_profile',
  'job',
  'job_run',
]);

/** History rows that are kept but detached from the deleted records. */
const DETACH_ONLY_TABLES = new Set(['audit_event']);

/** Columns without a declared FK that still point at a row of another table. */
const SOFT_REFERENCE_COLUMNS: Readonly<Record<string, string>> = {
  project_id: 'project',
  client_id: 'client',
  invoice_id: 'invoice',
  invoice_line_id: 'invoice_line',
  source_invoice_line_id: 'invoice_line',
};

/** Generic event columns that identify a subject by id only. */
const SUBJECT_COLUMNS = new Set(['entity_id', 'subject_id']);

const quote = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;

class PurgeSchemaError extends Error {}

function readSchema(sqlite: DatabaseSync) {
  const tables = (
    sqlite
      .prepare(
        "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string; sql: string }>
  ).map((row) => ({ name: row.name, withoutRowid: /WITHOUT\s+ROWID/iu.test(row.sql) }));
  const tableNames = new Set(tables.map((table) => table.name));
  const columns = new Map<string, Map<string, { notnull: boolean; pk: boolean }>>();
  const foreignKeys: ForeignKey[] = [];
  for (const table of tables) {
    const tableColumns = new Map(
      (
        sqlite.prepare(`PRAGMA table_info(${quote(table.name)})`).all() as Array<{
          name: string;
          notnull: number;
          pk: number;
        }>
      ).map((column) => [column.name, { notnull: column.notnull === 1, pk: column.pk > 0 }]),
    );
    columns.set(table.name, tableColumns);
    const grouped = new Map<
      number,
      { parent: string; from: string[]; to: (string | null)[]; onDelete: string }
    >();
    for (const row of sqlite.prepare(`PRAGMA foreign_key_list(${quote(table.name)})`).all() as Array<{
      id: number;
      table: string;
      from: string;
      to: string | null;
      on_delete: string;
    }>) {
      const entry = grouped.get(row.id) ?? {
        parent: row.table,
        from: [],
        to: [],
        onDelete: row.on_delete,
      };
      entry.from.push(row.from);
      entry.to.push(row.to);
      grouped.set(row.id, entry);
    }
    const declared = new Set<string>();
    for (const entry of grouped.values()) {
      if (!tableNames.has(entry.parent)) continue;
      const parentPk = [
        ...(columns.get(entry.parent) ??
          new Map(
            (
              sqlite.prepare(`PRAGMA table_info(${quote(entry.parent)})`).all() as Array<{
                name: string;
                pk: number;
              }>
            )
              .filter((column) => column.pk > 0)
              .map((column) => [column.name, { notnull: true, pk: true }]),
          )),
      ]
        .filter(([, column]) => column.pk)
        .map(([name]) => name);
      const parentColumns = entry.to.map((column, index) => column ?? parentPk[index] ?? 'id');
      entry.from.forEach((column) => declared.add(column));
      foreignKeys.push({
        child: table.name,
        childColumns: entry.from,
        parent: entry.parent,
        parentColumns,
        nullable: entry.from.some((column) => !tableColumns.get(column)?.notnull),
        onDelete: entry.onDelete.toUpperCase(),
        soft: false,
      });
    }
    for (const [column, info] of tableColumns) {
      if (declared.has(column)) continue;
      const parent = SOFT_REFERENCE_COLUMNS[column];
      if (parent && tableNames.has(parent) && parent !== table.name)
        foreignKeys.push({
          child: table.name,
          childColumns: [column],
          parent,
          parentColumns: ['id'],
          nullable: !info.notnull,
          onDelete: 'NO ACTION',
          soft: true,
        });
    }
  }
  const subjectColumns = tables.flatMap((table) =>
    [...(columns.get(table.name) ?? new Map()).keys()]
      .filter((column) => SUBJECT_COLUMNS.has(column) && !DETACH_ONLY_TABLES.has(table.name))
      .map((column) => ({ table: table.name, column })),
  );
  return { tables, columns, foreignKeys, subjectColumns };
}

const ids = (values: Iterable<number>): string => JSON.stringify([...values]);

export function planPurge(sqlite: DatabaseSync, target: PurgeTarget): PurgePlan {
  const schema = readSchema(sqlite);
  const withoutRowid = new Set(
    schema.tables.filter((table) => table.withoutRowid).map((table) => table.name),
  );
  const rows = new Map<string, Set<number>>();
  const add = (table: string, rowids: readonly number[]): number => {
    if (rowids.length === 0) return 0;
    if (PROTECTED_TABLES.has(table))
      throw new PurgeSchemaError(`Permanent deletion would remove protected ${table} rows`);
    if (withoutRowid.has(table))
      throw new PurgeSchemaError(`Permanent deletion does not support table ${table}`);
    let set = rows.get(table);
    if (!set) rows.set(table, (set = new Set()));
    let added = 0;
    for (const rowid of rowids)
      if (!set.has(rowid)) {
        set.add(rowid);
        added += 1;
      }
    return added;
  };
  const rowidsWhere = (table: string, where: string, ...params: string[]): number[] =>
    (
      sqlite.prepare(`SELECT rowid AS r FROM ${quote(table)} WHERE ${where}`).all(...params) as Array<{
        r: number;
      }>
    ).map((row) => row.r);

  const clientIds = JSON.stringify([...new Set(target.clientIds)]);
  add('client', rowidsWhere('client', 'id IN (SELECT value FROM json_each(?))', clientIds));
  add(
    'project',
    rowidsWhere(
      'project',
      'id IN (SELECT value FROM json_each(?)) OR client_id IN (SELECT value FROM json_each(?))',
      JSON.stringify([...new Set(target.projectIds)]),
      clientIds,
    ),
  );

  // Fixed point: every row that must reference a deleted row is deleted too.
  const detach = new Map<string, { table: string; column: string; rowids: Set<number> }>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const fk of schema.foreignKeys) {
      const parentRows = rows.get(fk.parent);
      if (!parentRows || parentRows.size === 0) continue;
      if (fk.child === fk.parent && !fk.soft) continue;
      const tuple =
        fk.childColumns.length === 1
          ? `c.${quote(fk.childColumns[0]!)}`
          : `(${fk.childColumns.map((column) => `c.${quote(column)}`).join(',')})`;
      const parentTuple = fk.parentColumns.map((column) => `p.${quote(column)}`).join(',');
      if (withoutRowid.has(fk.child)) {
        const referenced = sqlite
          .prepare(
            `SELECT 1 FROM ${quote(fk.child)} c WHERE ${tuple} IN (SELECT ${parentTuple} FROM ${quote(fk.parent)} p WHERE p.rowid IN (SELECT value FROM json_each(?))) LIMIT 1`,
          )
          .get(ids(parentRows));
        if (referenced)
          throw new PurgeSchemaError(`Permanent deletion does not support table ${fk.child}`);
        continue;
      }
      const childRowids = (
        sqlite
          .prepare(
            `SELECT c.rowid AS r FROM ${quote(fk.child)} c WHERE ${tuple} IN (SELECT ${parentTuple} FROM ${quote(fk.parent)} p WHERE p.rowid IN (SELECT value FROM json_each(?)))`,
          )
          .all(ids(parentRows)) as Array<{ r: number }>
      ).map((row) => row.r);
      if (childRowids.length === 0) continue;
      const ownership =
        !DETACH_ONLY_TABLES.has(fk.child) &&
        (!fk.nullable ||
          fk.onDelete === 'CASCADE' ||
          fk.parent === 'project' ||
          fk.parent === 'client');
      if (ownership) {
        if (add(fk.child, childRowids) > 0) changed = true;
      } else if (fk.childColumns.length === 1) {
        const key = `${fk.child}.${fk.childColumns[0]}`;
        const entry = detach.get(key) ?? {
          table: fk.child,
          column: fk.childColumns[0]!,
          rowids: new Set<number>(),
        };
        childRowids.forEach((rowid) => entry.rowids.add(rowid));
        detach.set(key, entry);
      } else {
        throw new PurgeSchemaError(`Permanent deletion cannot detach ${fk.child}`);
      }
    }
    // Event/notification rows that name a deleted record by id only.
    const deletedIds: string[] = [];
    for (const [table, set] of rows) {
      if (!schema.columns.get(table)?.has('id')) continue;
      for (const row of sqlite
        .prepare(
          `SELECT CAST(id AS TEXT) AS id FROM ${quote(table)} WHERE rowid IN (SELECT value FROM json_each(?))`,
        )
        .all(ids(set)) as Array<{ id: string }>)
        // Only globally unique (UUID-like) ids can be matched by value safely.
        if (row.id.length >= 16) deletedIds.push(row.id);
    }
    if (deletedIds.length > 0) {
      const payload = JSON.stringify(deletedIds);
      for (const subject of schema.subjectColumns) {
        if (withoutRowid.has(subject.table) || PROTECTED_TABLES.has(subject.table)) continue;
        const found = rowidsWhere(
          subject.table,
          `${quote(subject.column)} IN (SELECT value FROM json_each(?))`,
          payload,
        );
        if (add(subject.table, found) > 0) changed = true;
      }
    }
  }

  const nullings = [...detach.values()]
    .map((entry) => ({
      table: entry.table,
      column: entry.column,
      rowids: [...entry.rowids].filter((rowid) => !rows.get(entry.table)?.has(rowid)),
    }))
    .filter((entry) => entry.rowids.length > 0);

  const storageKeys = new Set<string>();
  for (const [table, set] of rows) {
    const keyColumns = [...(schema.columns.get(table) ?? new Map()).keys()].filter((column) =>
      /storage_key$/u.test(column),
    );
    for (const column of keyColumns)
      for (const row of sqlite
        .prepare(
          `SELECT ${quote(column)} AS k FROM ${quote(table)} WHERE rowid IN (SELECT value FROM json_each(?)) AND ${quote(column)} IS NOT NULL`,
        )
        .all(ids(set)) as Array<{ k: unknown }>)
        if (typeof row.k === 'string' && row.k.trim()) storageKeys.add(row.k);
  }

  const count = (table: string): number => rows.get(table)?.size ?? 0;
  const summary: PurgeSummary = {
    projects: count('project'),
    clients: count('client'),
    timeEntries: count('time_entry'),
    expenses: count('expense'),
    dailyReports: count('daily_report'),
    technicalReports: count('technical_report'),
    periodReports: count('period_report'),
    invoices: count('invoice'),
    payments: count('payment') + count('invoice_collection_allocation'),
    documents: count('document'),
    assignments: count('project_member'),
    planning: count('planning_assignment'),
    milestones: count('project_milestone'),
    contacts: count('client_contact'),
    files: storageKeys.size,
    totalRows: [...rows.values()].reduce((sum, set) => sum + set.size, 0),
  };
  return {
    rows: new Map([...rows].map(([table, set]) => [table, [...set]])),
    nullings,
    storageKeys: [...storageKeys],
    summary,
  };
}

/** Order tables so RESTRICT children are deleted before their parents. */
function deletionOrder(sqlite: DatabaseSync, tables: readonly string[]): string[] {
  const inSet = new Set(tables);
  const parentsOf = new Map<string, Set<string>>();
  for (const table of tables) {
    const parents = new Set<string>();
    for (const row of sqlite.prepare(`PRAGMA foreign_key_list(${quote(table)})`).all() as Array<{
      table: string;
    }>)
      if (inSet.has(row.table) && row.table !== table) parents.add(row.table);
    parentsOf.set(table, parents);
  }
  // A table can be deleted once no remaining table lists it as a parent.
  const remaining = new Set(tables);
  const order: string[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining].filter(
      (table) => ![...remaining].some((other) => other !== table && parentsOf.get(other)!.has(table)),
    );
    // Cycles only exist through deferred NO ACTION keys; any order works there.
    const next = ready.length > 0 ? ready : [[...remaining].sort()[0]!];
    for (const table of next.sort()) {
      order.push(table);
      remaining.delete(table);
    }
  }
  return order;
}

/** Must run inside an open transaction owned by the caller. */
export function executePurge(sqlite: DatabaseSync, plan: PurgePlan): void {
  if (!(sqlite as DatabaseSync & { readonly isTransaction: boolean }).isTransaction)
    throw new Error('Permanent deletion requires an open transaction');
  const touched = new Set<string>([...plan.rows.keys(), ...plan.nullings.map((n) => n.table)]);
  const triggers = (
    sqlite
      .prepare(
        `SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name IN (SELECT value FROM json_each(?)) ORDER BY name`,
      )
      .all(JSON.stringify([...touched])) as Array<{ name: string; sql: string | null }>
  ).filter((row): row is { name: string; sql: string } => Boolean(row.sql));
  sqlite.exec('PRAGMA defer_foreign_keys=ON');
  for (const trigger of triggers) sqlite.exec(`DROP TRIGGER ${quote(trigger.name)}`);
  try {
    for (const nulling of plan.nullings)
      sqlite
        .prepare(
          `UPDATE ${quote(nulling.table)} SET ${quote(nulling.column)}=NULL WHERE rowid IN (SELECT value FROM json_each(?))`,
        )
        .run(JSON.stringify(nulling.rowids));
    for (const table of deletionOrder(sqlite, [...plan.rows.keys()])) {
      const rowids = plan.rows.get(table)!;
      sqlite
        .prepare(`DELETE FROM ${quote(table)} WHERE rowid IN (SELECT value FROM json_each(?))`)
        .run(JSON.stringify(rowids));
    }
  } finally {
    // Recreated even on failure so a savepoint rollback never loses guards;
    // the enclosing transaction rolls everything back on error anyway.
    for (const trigger of triggers) {
      const exists = sqlite
        .prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?")
        .get(trigger.name);
      if (!exists) sqlite.exec(trigger.sql);
    }
  }
}
