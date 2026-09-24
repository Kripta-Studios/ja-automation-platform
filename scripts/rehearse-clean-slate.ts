/**
 * An intentionally isolated, fail-closed clean-slate rehearsal. This never accepts a
 * production database or artifact directory. The original copied database and every
 * copied artifact are archived and hashed before the rehearsal changes its copies.
 */
import { createHash } from 'node:crypto';
import {
  chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync,
  readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const CLIENT = 'client-020-impc';
const PROJECTS = ['project-cp020-bbs-mexico', 'project-cp020-dfw'] as const;
const PRODUCTION_ROOTS = ['/var/lib/jaautomation', '/opt/jaautomation'];
// Identity, mailbox and global configuration must survive byte-for-byte at row level.
const PRESERVE = new Set([
  'user', 'account', 'mail_identity', 'mailbox_external_command', 'session',
  'verification', 'two_factor', 'passkey', 'invitation',
  'deployment_identity', 'deployment_service_actor_binding', 'service_actor',
  'service_actor_binding_history', 'schema_migration', 'migration_contract_metadata',
  'audit_action_registry', 'finance_v2_cutover',
]);
const FINANCIAL_ARCHIVE_TABLES = [
  'invoice', 'invoice_line', 'invoice_source', 'invoice_event',
  'invoice_commercial_source_manifest', 'invoice_approved_supersession', 'payment',
  'compensation_settlement', 'worker_compensation_payment_event',
  'accounting_pack_run', 'accounting_pack_revision', 'period_report',
  'daily_report', 'technical_report', 'document',
];

type FK = { child: string; parent: string; from: string[]; to: string[] };
type Table = { name: string; columns: string[]; rowid: boolean; fks: FK[] };
export type CleanSlateReport = {
  kind: 'isolated_clean_slate_rehearsal';
  version: 1;
  status: 'applied' | 'already_applied';
  retained: { clientId: string; projectIds: readonly string[] };
  originalDatabaseSha256: string;
  archivedDatabaseSha256: string;
  archivedArtifactFiles: Array<{ path: string; sha256: string }>;
  retainedArtifactFiles: Array<{ path: string; sha256: string }>;
  retainedArtifactManifestSha256: string;
  archivedFinancialCounts: Record<string, number>;
  protectedTableDigests: Record<string, string>;
  postCleanManifestSha256: string;
  postCleanTableManifest: Record<string,{count:number;digest:string}>;
  before: Record<string, number>;
  after: Record<string, number>;
  deleted: Record<string, number>;
  artifactDeletionCandidates: string[];
  blockedReferences: string[];
  integrity: 'ok';
  foreignKeyFailures: 0;
};

function quote(s: string): string { return `"${s.replaceAll('"', '""')}"`; }
function sha(bytes: Buffer | string): string { return createHash('sha256').update(bytes).digest('hex'); }
function fileSha(path: string): string { return sha(readFileSync(path)); }
function inside(path: string, root: string): boolean { return path === root || path.startsWith(root + sep); }
function assertIsolated(path: string, suffix: string, directory = false): string {
  const requested = resolve(path);
  if (PRODUCTION_ROOTS.some((root) => inside(requested, root)))
    throw new Error('Production or release storage refused');
  if (lstatSync(requested).isSymbolicLink()) throw new Error('Isolated path symlink refused');
  const actual = realpathSync(requested);
  if (!basename(actual).endsWith(suffix)) throw new Error(`Expected ${suffix} isolated path`);
  if (PRODUCTION_ROOTS.some((root) => inside(actual, root)))
    throw new Error('Production or release storage refused');
  if (lstatSync(actual).isSymbolicLink() || (directory ? !statSync(actual).isDirectory() : !statSync(actual).isFile()))
    throw new Error('Isolated path type or symlink refused');
  return actual;
}
export function assertNotProductionInode(path: string, production = '/var/lib/jaautomation/data/jaautomation.sqlite'): void {
  if (!existsSync(production)) return;
  const a = statSync(path), b = statSync(production);
  if (a.dev === b.dev && a.ino === b.ino) throw new Error('Production database inode refused');
}
function walkFiles(root: string): Array<{ path: string; sha256: string }> {
  const result: Array<{ path: string; sha256: string }> = [];
  function visit(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Artifact symlink refused: ${relative(root, full)}`);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) result.push({ path: relative(root, full), sha256: fileSha(full) });
      else throw new Error(`Unexpected artifact type: ${relative(root, full)}`);
    }
  }
  visit(root);
  return result;
}
function assertArtifactSubset(actual: Array<{path:string;sha256:string}>, archive: Array<{path:string;sha256:string}>, exact: boolean): void {
  const expected = new Map(archive.map((entry)=>[entry.path,entry.sha256]));
  if (exact && actual.length !== archive.length) throw new Error('Working artifact manifest differs from original archive');
  for (const entry of actual) if (expected.get(entry.path)!==entry.sha256)
    throw new Error(`Working artifact added or changed after archive: ${entry.path}`);
}
function assertRetainedArtifacts(actual: Array<{path:string;sha256:string}>, expected: Array<{path:string;sha256:string}>): void {
  const present = new Map(actual.map((entry)=>[entry.path,entry.sha256]));
  for (const entry of expected) if (present.get(entry.path)!==entry.sha256)
    throw new Error(`Missing or changed retained artifact: ${entry.path}`);
}
function assertIntegrity(db: DatabaseSync, label: string): void {
  const result = db.prepare('PRAGMA integrity_check').get() as {integrity_check:string};
  if (result.integrity_check !== 'ok') throw new Error(`${label} integrity_check failed: ${result.integrity_check}`);
  if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error(`${label} foreign_key_check failed`);
}
function inventory(db: DatabaseSync): Table[] {
  const rows = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {name: string; sql: string}[];
  return rows.map(({name, sql}) => {
    const columns = (db.prepare(`PRAGMA table_info(${quote(name)})`).all() as {name: string}[]).map((r) => r.name);
    const raw = db.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all() as Array<{id: number; seq:number; table: string; from: string; to: string}>;
    const fks: FK[] = [];
    for (const id of new Set(raw.map((r) => r.id))) {
      const group = raw.filter((r) => r.id === id);
      group.sort((a,b)=>a.seq-b.seq);
      if (group.some((r)=>!r.to)) throw new Error(`Implicit FK requires review: ${name}:${id}`);
      fks.push({child: name, parent: group[0]!.table, from:group.map((r)=>r.from), to:group.map((r)=>r.to)});
    }
    return {name, columns, rowid: !/WITHOUT\s+ROWID/i.test(sql), fks};
  });
}
function counts(db: DatabaseSync, ts: Table[]): Record<string, number> {
  return Object.fromEntries(ts.map((t) => [t.name, Number((db.prepare(`SELECT COUNT(*) n FROM ${quote(t.name)}`).get() as {n:number}).n)]));
}
function tableDigest(db: DatabaseSync, table: string): string {
  const h = createHash('sha256');
  const rows = (db.prepare(`SELECT * FROM ${quote(table)}`).all() as Record<string,unknown>[])
    .map((row)=>JSON.stringify(row, (_, value) => typeof value === 'bigint' ? value.toString() : value)).sort();
  for (const row of rows) h.update(row).update('\n');
  return h.digest('hex');
}
function protectedDigests(db: DatabaseSync, ts: Table[]): Record<string, string> {
  return Object.fromEntries(ts.filter((t) => PRESERVE.has(t.name)).map((t) => [t.name, tableDigest(db, t.name)]));
}
function archiveEvidence(db: DatabaseSync, ts: Table[]): Record<string, number> {
  return Object.fromEntries(ts.filter((t) => FINANCIAL_ARCHIVE_TABLES.includes(t.name)).map((t) => [t.name, Number((db.prepare(`SELECT COUNT(*) n FROM ${quote(t.name)}`).get() as {n:number}).n)]));
}
function logicalManifest(db: DatabaseSync, ts: Table[]): Record<string,{count:number;digest:string}> {
  return Object.fromEntries(ts.filter((t)=>t.name!=='clean_slate_rehearsal_journal').map((t)=>[t.name,{count:Number((db.prepare(`SELECT COUNT(*) n FROM ${quote(t.name)}`).get() as {n:number}).n),digest:tableDigest(db,t.name)}]));
}
function keepName(table: string): string { return `keep_${table}`; }
function fkJoin(fk: FK): string { return fk.from.map((from,i)=>`c.${quote(from)}=p.${quote(fk.to[i]!)}`).join(' AND '); }
function populateKeep(db: DatabaseSync, ts: Table[]): void {
  const known = new Set(ts.map((t) => t.name));
  if (!known.has('client') || !known.has('project') || !known.has('user') || !known.has('mail_identity'))
    throw new Error('Expected client/project/user/mail schema is missing');
  for (const t of ts) {
    if (!t.rowid && !PRESERVE.has(t.name)) throw new Error(`Unknown WITHOUT ROWID table: ${t.name}`);
    if (t.rowid) db.exec(`CREATE TEMP TABLE ${quote(keepName(t.name))}(rid INTEGER PRIMARY KEY)`);
  }
  const clientFound = db.prepare('SELECT 1 FROM client WHERE id=?').get(CLIENT);
  if (!clientFound || PROJECTS.some((id) => !db.prepare('SELECT 1 FROM project WHERE id=? AND client_id=?').get(id, CLIENT)))
    throw new Error('Required BBS/IMPC example IDs or ownership changed');
  for (const t of ts) if (PRESERVE.has(t.name) && t.rowid)
    db.exec(`INSERT INTO ${quote(keepName(t.name))} SELECT rowid FROM ${quote(t.name)}`);
  // Retain real expertise attached to mailbox-backed workers. QA/demo catalog
  // entries are explicitly excluded, even if a test identity later gets mail.
  if (known.has('worker_skill') && known.has('skill')) {
    db.function('cleanup_is_test_expertise',{deterministic:true},(code,name)=>/(^|[\s_-])(qa|test|demo|fixture)(?=$|[\s_-])/i.test(`${String(code)} ${String(name)}`)?1:0);
    db.exec(`INSERT INTO ${quote(keepName('worker_skill'))}
      SELECT ws.rowid FROM worker_skill ws
      JOIN mail_identity mi ON mi.user_id=ws.worker_id
      JOIN skill s ON s.id=ws.skill_id
      WHERE cleanup_is_test_expertise(s.code,s.name)=0`);
  }
  db.prepare(`INSERT INTO ${quote(keepName('client'))} SELECT rowid FROM client WHERE id=?`).run(CLIENT);
  for (const id of PROJECTS) db.prepare(`INSERT INTO ${quote(keepName('project'))} SELECT rowid FROM project WHERE id=?`).run(id);
  // Downward closure starts only at the two project examples and their client.
  const roots = new Set(['client', 'project']);
  const reached = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of ts) for (const fk of t.fks) {
      if (!reached.has(fk.parent) || !t.rowid || !known.has(fk.parent) || PRESERVE.has(t.name)) continue;
      // Only the two explicitly named projects are examples, even if the IMPC
      // client has additional historical projects.
      if (t.name === 'project' && fk.parent === 'client') continue;
      const sql = `INSERT OR IGNORE INTO ${quote(keepName(t.name))} SELECT c.rowid FROM ${quote(t.name)} c JOIN ${quote(fk.parent)} p ON ${fkJoin(fk)} JOIN ${quote(keepName(fk.parent))} k ON k.rid=p.rowid`;
      const delta = db.prepare(sql).run().changes;
      if (delta) changed = true;
      reached.add(t.name);
    }
  }
  // Retained rows may need configuration parents. This does not fan out from users.
  changed = true;
  while (changed) {
    changed = false;
    for (const t of ts) for (const fk of t.fks) {
      const parent = ts.find((x) => x.name === fk.parent);
      if (!t.rowid || !parent?.rowid) continue;
      const sql = `INSERT OR IGNORE INTO ${quote(keepName(parent.name))} SELECT p.rowid FROM ${quote(t.name)} c JOIN ${quote(keepName(t.name))} k ON k.rid=c.rowid JOIN ${quote(parent.name)} p ON ${fkJoin(fk)}`;
      if (db.prepare(sql).run().changes) changed = true;
    }
  }
  if (known.has('number_sequence')) {
    const unknown = db.prepare("SELECT scope FROM number_sequence WHERE scope NOT IN ('client','project','invoice') LIMIT 1").get();
    if (unknown) throw new Error('Unknown numbering scope requires review');
    // Sequence history is retained only where its issuer/client/project still
    // exists. Global counters remain, avoiding number reuse after archiving.
    db.exec(`INSERT INTO ${quote(keepName('number_sequence'))}
      SELECT n.rowid FROM number_sequence n WHERE
        (n.scope_id='global') OR
        (n.scope='client' AND EXISTS(SELECT 1 FROM client c JOIN ${quote(keepName('client'))} k ON k.rid=c.rowid WHERE c.id=n.scope_id)) OR
        (n.scope='project' AND (EXISTS(SELECT 1 FROM client c JOIN ${quote(keepName('client'))} k ON k.rid=c.rowid WHERE c.id=n.scope_id)
          OR EXISTS(SELECT 1 FROM project p JOIN ${quote(keepName('project'))} k ON k.rid=p.rowid WHERE p.id=n.scope_id))) OR
        (n.scope='invoice' AND instr(n.scope_id,':')>1 AND EXISTS(SELECT 1 FROM legal_entity le JOIN ${quote(keepName('legal_entity'))} k ON k.rid=le.rowid WHERE le.id=substr(n.scope_id,1,instr(n.scope_id,':')-1)))`);
  }
  const keptProjects = db.prepare(`SELECT id FROM project WHERE rowid IN (SELECT rid FROM ${quote(keepName('project'))}) ORDER BY id`).all() as {id:string}[];
  const keptClients = db.prepare(`SELECT id FROM client WHERE rowid IN (SELECT rid FROM ${quote(keepName('client'))}) ORDER BY id`).all() as {id:string}[];
  if (keptProjects.map((r) => r.id).join('|') !== [...PROJECTS].sort().join('|') || keptClients.map((r) => r.id).join('|') !== CLIENT)
    throw new Error(`Protected closure would retain unexpected client/projects: ${JSON.stringify({keptProjects, keptClients})}`);
}
function softReferenceBlockers(db: DatabaseSync, ts: Table[]): string[] {
  // Every retained text identifier in an untyped *_id / entity_id column is checked
  // against deleted primary identifiers. A match needs a reviewed mapping, not guessing.
  const blockers: string[] = [];
  const ids = ts.filter((t) => t.rowid && t.columns.includes('id'));
  for (const t of ts.filter((t) => t.rowid)) {
    const declared = new Set(t.fks.flatMap((f) => f.from));
    for (const col of t.columns.filter((c) => (c.endsWith('_id') || ['entity_id','subject_id','target_id'].includes(c)) && !declared.has(c))) {
      for (const target of ids) {
        if (t.name === target.name && col === 'id') continue;
        const q = `SELECT 1 FROM ${quote(t.name)} c JOIN ${quote(keepName(t.name))} ck ON ck.rid=c.rowid JOIN ${quote(target.name)} p ON c.${quote(col)}=p.id LEFT JOIN ${quote(keepName(target.name))} pk ON pk.rid=p.rowid WHERE pk.rid IS NULL LIMIT 1`;
        if (db.prepare(q).get()) blockers.push(`${t.name}.${col}->${target.name}.id`);
      }
    }
  }
  return [...new Set(blockers)].sort();
}
function deletionOrder(ts: Table[]): string[] {
  const doomed = ts.filter((t) => t.rowid && !PRESERVE.has(t.name)).map((t) => t.name);
  const set = new Set(doomed), deps = new Map(doomed.map((t) => [t, new Set<string>()]));
  for (const t of ts) for (const fk of t.fks) {
    if (!set.has(t.name) || !set.has(fk.parent)) continue;
    // Known nullable cycle is detached for doomed jobs inside the transaction.
    if (t.name === 'job' && fk.from.length===1 && fk.from[0] === 'active_job_run_id' && fk.parent === 'job_run') continue;
    if (t.name === 'project' && fk.from.length===1 && fk.from[0] === 'expected_schedule_id' && fk.parent === 'schedule') continue;
    // A single DELETE statement removes the entire doomed self-chain. Retained
    // descendants already retain their ancestors through the upward closure.
    if (t.name === fk.parent) continue;
    deps.get(fk.parent)!.add(t.name);
  }
  const order: string[] = [];
  while (deps.size) {
    const ready = [...deps].filter(([, dep]) => dep.size === 0).map(([name]) => name).sort();
    if (!ready.length) throw new Error(`Unknown FK cleanup cycle: ${[...deps.keys()].join(',')}`);
    for (const name of ready) { order.push(name); deps.delete(name); }
    for (const dep of deps.values()) for (const name of ready) dep.delete(name);
  }
  return order;
}
function artifactCandidates(root: string, archived: Array<{path:string;sha256:string}>, db: DatabaseSync, ts: Table[]): string[] {
  const keys = new Set<string>();
  for (const t of ts.filter((t) => t.rowid)) for (const col of t.columns.filter((c) => c === 'storage_key' || c.endsWith('_storage_key'))) {
    for (const row of db.prepare(`SELECT ${quote(col)} k FROM ${quote(t.name)} WHERE rowid IN (SELECT rid FROM ${quote(keepName(t.name))}) AND ${quote(col)} IS NOT NULL`).all() as {k:string}[]) {
      const key = String(row.k).replaceAll('\\', '/').replace(/^\/+/, '');
      if (key.includes('..')) throw new Error(`Unsafe retained storage key: ${t.name}.${col}`);
      keys.add(key);
    }
  }
  return archived.map((x) => x.path).filter((path) => !keys.has(path) && !keys.has('/' + path) && !keys.has('files/' + path));
}

export function rehearseCleanSlate(databasePath: string, artifactPath: string, archivePath: string, testHooks: Readonly<{beforeCommit?:()=>void;afterCommit?:()=>void}> = {}): CleanSlateReport {
  const database = assertIsolated(databasePath, '.rehearsal.sqlite');
  const artifacts = assertIsolated(artifactPath, '.rehearsal-artifacts', true);
  assertNotProductionInode(database);
  const archive = resolve(archivePath);
  if (!basename(archive).endsWith('.rehearsal-archive') || PRODUCTION_ROOTS.some((root) => inside(archive, root)) || inside(archive, artifacts) || inside(archive, database))
    throw new Error('Archive must be a separate isolated *.rehearsal-archive directory');
  const archiveParent = realpathSync(dirname(archive));
  if (PRODUCTION_ROOTS.some((root)=>inside(archiveParent,root)) || (existsSync(archive) && (lstatSync(archive).isSymbolicLink() || PRODUCTION_ROOTS.some((root)=>inside(realpathSync(archive),root)))))
    throw new Error('Archive symlink or production parent refused');
  if (existsSync(archive)) {
    const existing = readFileSync(join(archive, 'evidence.json'), 'utf8');
    const evidence = JSON.parse(existing) as {databaseSha256:string; artifactFiles:Array<{path:string;sha256:string}>};
    if (fileSha(join(archive, 'original.sqlite')) !== evidence.databaseSha256 || JSON.stringify(walkFiles(join(archive, 'artifacts'))) !== JSON.stringify(evidence.artifactFiles))
      throw new Error('Immutable original archive hash verification failed');
  } else {
    mkdirSync(archive, {recursive:false, mode:0o700});
    copyFileSync(database, join(archive, 'original.sqlite'));
    cpSync(artifacts, join(archive, 'artifacts'), {recursive:true, force:false, errorOnExist:true});
    const evidence = {databaseSha256:fileSha(join(archive, 'original.sqlite')), artifactFiles:walkFiles(join(archive, 'artifacts'))};
    writeFileSync(join(archive, 'evidence.json'), JSON.stringify(evidence, null, 2));
    for (const file of walkFiles(join(archive, 'artifacts'))) chmodSync(join(archive, 'artifacts', file.path), 0o400);
    chmodSync(join(archive, 'original.sqlite'), 0o400);
    chmodSync(join(archive, 'evidence.json'), 0o400);
  }
  const archived = JSON.parse(readFileSync(join(archive, 'evidence.json'), 'utf8')) as {databaseSha256:string;artifactFiles:Array<{path:string;sha256:string}>};
  const workingArtifacts = walkFiles(artifacts);
  const original = new DatabaseSync(join(archive, 'original.sqlite'), {readOnly:true});
  const originalTables = inventory(original);
  const originalCounts = counts(original, originalTables);
  const originalProtected = protectedDigests(original, originalTables);
  const financialCounts = archiveEvidence(original, originalTables);
  assertIntegrity(original,'Original archive');
  original.close();
  const db = new DatabaseSync(database);
  try {
    db.exec('PRAGMA foreign_keys=ON');
    const ts = inventory(db);
    const before = counts(db, ts);
    const journalExists = ts.some((t) => t.name === 'clean_slate_rehearsal_journal');
    if (journalExists) {
      const journalColumns = new Set((db.prepare('PRAGMA table_info(clean_slate_rehearsal_journal)').all() as {name:string}[]).map((x)=>x.name));
      if (!['original_sha256','artifact_candidates_json','survivor_artifacts_json','survivor_artifacts_sha256','post_manifest_json','post_manifest_sha256'].every((x)=>journalColumns.has(x)))
        throw new Error('Legacy cleanup journal lacks recovery or expected survivor/post-clean manifest');
      const journal = db.prepare('SELECT original_sha256,artifact_candidates_json,survivor_artifacts_json,survivor_artifacts_sha256,post_manifest_json,post_manifest_sha256 FROM clean_slate_rehearsal_journal').get() as {original_sha256:string;artifact_candidates_json:string;survivor_artifacts_json:string;survivor_artifacts_sha256:string;post_manifest_json:string;post_manifest_sha256:string}|undefined;
      if (!journal || journal.original_sha256 !== archived.databaseSha256) throw new Error('Rehearsal journal/archive mismatch');
      if (typeof journal.artifact_candidates_json!=='string') throw new Error('Artifact recovery journal is incomplete');
      if (typeof journal.post_manifest_json!=='string' || sha(journal.post_manifest_json)!==journal.post_manifest_sha256)
        throw new Error('Expected post-clean manifest is missing or corrupted');
      const expectedManifest = JSON.parse(journal.post_manifest_json) as Record<string,{count:number;digest:string}>;
      if (JSON.stringify(logicalManifest(db,ts))!==journal.post_manifest_json)
        throw new Error('Working database differs from expected post-clean manifest');
      const planned = JSON.parse(journal.artifact_candidates_json) as unknown;
      const archivePaths = new Set(archived.artifactFiles.map((x)=>x.path));
      if (!Array.isArray(planned) || planned.some((path)=>typeof path!=='string' || !archivePaths.has(path)) || new Set(planned).size!==planned.length)
        throw new Error('Artifact recovery journal contains unreviewed paths');
      if (typeof journal.survivor_artifacts_json!=='string' || sha(journal.survivor_artifacts_json)!==journal.survivor_artifacts_sha256)
        throw new Error('Retained artifact manifest is missing or corrupted');
      const survivors = JSON.parse(journal.survivor_artifacts_json) as Array<{path:string;sha256:string}>;
      const expectedSurvivors = archived.artifactFiles.filter((entry)=>!new Set(planned).has(entry.path));
      if (JSON.stringify(survivors)!==JSON.stringify(expectedSurvivors))
        throw new Error('Retained artifact manifest does not partition archive');
      assertArtifactSubset(workingArtifacts,archived.artifactFiles,false);
      assertRetainedArtifacts(workingArtifacts,survivors);
      if (JSON.stringify(protectedDigests(db, ts)) !== JSON.stringify(originalProtected)) throw new Error('Protected rows changed after rehearsal');
      assertIntegrity(db,'Rehearsal rerun');
      const files = new Set(workingArtifacts.map((x)=>x.path));
      const remaining = planned.filter((path)=>files.has(path));
      for (const path of remaining) rmSync(join(artifacts,path));
      assertArtifactSubset(walkFiles(artifacts),survivors,true);
      return {kind:'isolated_clean_slate_rehearsal',version:1,status:'already_applied',retained:{clientId:CLIENT,projectIds:PROJECTS},originalDatabaseSha256:archived.databaseSha256,archivedDatabaseSha256:fileSha(join(archive,'original.sqlite')),archivedArtifactFiles:archived.artifactFiles,retainedArtifactFiles:survivors,retainedArtifactManifestSha256:journal.survivor_artifacts_sha256,archivedFinancialCounts:financialCounts,protectedTableDigests:originalProtected,postCleanManifestSha256:journal.post_manifest_sha256,postCleanTableManifest:expectedManifest,before:originalCounts,after:before,deleted:Object.fromEntries(Object.entries(originalCounts).map(([t,n])=>[t,n-(before[t]??0)])),artifactDeletionCandidates:remaining,blockedReferences:[],integrity:'ok',foreignKeyFailures:0};
    }
    if (fileSha(database)!==archived.databaseSha256)
      throw new Error('Working database bytes differ from original archive before mutation');
    assertArtifactSubset(workingArtifacts,archived.artifactFiles,true);
    if (JSON.stringify(before) !== JSON.stringify(originalCounts) || JSON.stringify(protectedDigests(db, ts)) !== JSON.stringify(originalProtected))
      throw new Error('Copied rehearsal database differs from immutable original archive');
    const order = deletionOrder(ts);
    // The copied schema has tens of thousands of mutually-referencing legacy
    // jobs. The row closure and a full FK check are authoritative here; per-row
    // immediate FK checks turn the isolated bulk deletion quadratic.
    db.exec('PRAGMA foreign_keys=OFF');
    db.exec('BEGIN IMMEDIATE');
    let after: Record<string,number>;
    let candidates: string[];
    let survivors: Array<{path:string;sha256:string}>;
    let survivorsJson: string;
    let postManifest: Record<string,{count:number;digest:string}>;
    let postManifestJson: string;
    try {
      populateKeep(db, ts);
      const blockedReferences = softReferenceBlockers(db, ts);
      if (blockedReferences.length) throw new Error(`Unreviewed retained soft references: ${blockedReferences.join(', ')}`);
      candidates = artifactCandidates(artifacts, archived.artifactFiles, db, ts);
      const candidateSet = new Set(candidates);
      survivors = archived.artifactFiles.filter((entry)=>!candidateSet.has(entry.path));
      survivorsJson = JSON.stringify(survivors);
      // Archived/finalized records in this *copy* have immutable-row triggers.
      // Drop and restore the exact trigger DDL inside this rollback-safe transaction;
      // no trigger is removed from the live database or the immutable archive.
      const triggers = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all() as {name:string;sql:string}[];
      for (const trigger of triggers) db.exec(`DROP TRIGGER ${quote(trigger.name)}`);
      if (ts.some((t)=>t.name==='job') && ts.some((t)=>t.name==='job_run'))
        db.exec(`UPDATE job SET active_job_run_id=NULL WHERE rowid NOT IN (SELECT rid FROM ${quote(keepName('job'))})`);
      if (ts.some((t)=>t.name==='schedule') && ts.some((t)=>t.name==='project'))
        db.exec(`UPDATE project SET expected_schedule_id=NULL WHERE rowid NOT IN (SELECT rid FROM ${quote(keepName('project'))})`);
      for (const name of order)
        db.exec(`DELETE FROM ${quote(name)} WHERE rowid NOT IN (SELECT rid FROM ${quote(keepName(name))})`);
      for (const trigger of triggers) db.exec(trigger.sql);
      const afterTriggers = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
      if (JSON.stringify(afterTriggers)!==JSON.stringify(triggers)) throw new Error('Trigger DDL changed during rehearsal');
      after = counts(db, ts);
      if (JSON.stringify(protectedDigests(db, ts)) !== JSON.stringify(originalProtected)) throw new Error('Protected table content changed');
      assertIntegrity(db,'Post-delete rehearsal');
      const clients = db.prepare('SELECT id FROM client ORDER BY id').all() as {id:string}[];
      const projects = db.prepare('SELECT id FROM project ORDER BY id').all() as {id:string}[];
      if (clients.map((x)=>x.id).join('|') !== CLIENT || projects.map((x)=>x.id).join('|') !== [...PROJECTS].sort().join('|'))
        throw new Error('Clean slate did not retain exactly the requested examples');
      postManifest = logicalManifest(db,ts);
      postManifestJson = JSON.stringify(postManifest);
      db.exec('CREATE TABLE clean_slate_rehearsal_journal(original_sha256 TEXT NOT NULL, applied_at TEXT NOT NULL, artifact_candidates_json TEXT NOT NULL, survivor_artifacts_json TEXT NOT NULL, survivor_artifacts_sha256 TEXT NOT NULL, post_manifest_json TEXT NOT NULL, post_manifest_sha256 TEXT NOT NULL) STRICT');
      db.prepare('INSERT INTO clean_slate_rehearsal_journal VALUES(?,?,?,?,?,?,?)').run(archived.databaseSha256,new Date().toISOString(),JSON.stringify(candidates),survivorsJson,sha(survivorsJson),postManifestJson,sha(postManifestJson));
      testHooks.beforeCommit?.();
      db.exec('COMMIT');
    } catch(error) { db.exec('ROLLBACK'); db.exec('PRAGMA foreign_keys=ON'); throw error; }
    // Artifact cleanup and evidence writes happen after commit, outside the
    // rollback handler. Their original errors must survive for recovery.
    testHooks.afterCommit?.();
    db.exec('PRAGMA foreign_keys=ON');
    for (const path of candidates) {
      const full = join(artifacts,path);
      if (existsSync(full)) rmSync(full);
    }
    assertArtifactSubset(walkFiles(artifacts),survivors,true);
    const report: CleanSlateReport = {kind:'isolated_clean_slate_rehearsal',version:1,status:'applied',retained:{clientId:CLIENT,projectIds:PROJECTS},originalDatabaseSha256:archived.databaseSha256,archivedDatabaseSha256:fileSha(join(archive,'original.sqlite')),archivedArtifactFiles:archived.artifactFiles,retainedArtifactFiles:survivors,retainedArtifactManifestSha256:sha(survivorsJson),archivedFinancialCounts:financialCounts,protectedTableDigests:originalProtected,postCleanManifestSha256:sha(postManifestJson),postCleanTableManifest:postManifest,before,after,deleted:Object.fromEntries(Object.entries(before).map(([t,n])=>[t,n-(after[t]??0)])),artifactDeletionCandidates:candidates,blockedReferences:[],integrity:'ok',foreignKeyFailures:0};
    writeFileSync(join(archive,'rehearsal-result.json'), JSON.stringify(report,null,2),{mode:0o400});
    return report;
  } finally { db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name:string) => {const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined};
  const database=arg('--database'), artifacts=arg('--artifacts'), archive=arg('--archive');
  if (!process.argv.includes('--rehearsal') || !database || !artifacts || !archive)
    throw new Error('Use --rehearsal --database <copy.rehearsal.sqlite> --artifacts <copy.rehearsal-artifacts> --archive <immutable.rehearsal-archive>');
  process.stdout.write(JSON.stringify(rehearseCleanSlate(database,artifacts,archive),null,2)+'\n');
}
