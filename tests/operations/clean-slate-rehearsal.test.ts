import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, copyFileSync, linkSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { rehearseCleanSlate, assertNotProductionInode } from '../../scripts/rehearse-clean-slate';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, {recursive:true, force:true}); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(),'ja-clean-slate-'));
  roots.push(root);
  const database = join(root,'copy.rehearsal.sqlite');
  const artifacts = join(root,'copy.rehearsal-artifacts');
  const archive = join(root,'original.rehearsal-archive');
  mkdirSync(join(artifacts,'invoices'),{recursive:true});
  mkdirSync(join(artifacts,'reports'),{recursive:true});
  writeFileSync(join(artifacts,'invoices','issued-demo.pdf'),Buffer.from('%PDF-1.7 issued DEMO'));
  writeFileSync(join(artifacts,'reports','bbs.pdf'),Buffer.from('%PDF-1.7 retained BBS'));
  const db = new DatabaseSync(database);
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE client(id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE user(id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE account(id TEXT PRIMARY KEY, user_id TEXT REFERENCES user(id), password_hash TEXT);
    CREATE TABLE mail_identity(user_id TEXT PRIMARY KEY REFERENCES user(id), mailbox TEXT);
    CREATE TABLE project(id TEXT PRIMARY KEY, client_id TEXT REFERENCES client(id), name TEXT);
    CREATE TABLE project_member(id TEXT PRIMARY KEY, project_id TEXT REFERENCES project(id), user_id TEXT REFERENCES user(id));
    CREATE TABLE invoice(id TEXT PRIMARY KEY, project_id TEXT REFERENCES project(id), state TEXT, pdf_storage_key TEXT);
    CREATE TABLE invoice_line(id TEXT PRIMARY KEY, invoice_id TEXT REFERENCES invoice(id), amount_minor TEXT);
    CREATE TABLE payment(id TEXT PRIMARY KEY, invoice_id TEXT REFERENCES invoice(id), amount_minor TEXT);
    CREATE TABLE daily_report(id TEXT PRIMARY KEY, project_id TEXT REFERENCES project(id));
    CREATE TABLE document(id TEXT PRIMARY KEY, project_id TEXT REFERENCES project(id), storage_key TEXT);
    CREATE TABLE legal_entity(id TEXT PRIMARY KEY, code TEXT);
    CREATE TABLE tax_profile(id TEXT PRIMARY KEY, legal_entity_id TEXT REFERENCES legal_entity(id), name TEXT);
    CREATE TABLE tax_component(id TEXT PRIMARY KEY, tax_profile_id TEXT REFERENCES tax_profile(id));
    CREATE TABLE invoice_number_policy(id TEXT PRIMARY KEY, legal_entity_id TEXT REFERENCES legal_entity(id));
    CREATE TABLE supplier(id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE supplier_user_profile(user_id TEXT REFERENCES user(id), supplier_id TEXT REFERENCES supplier(id));
    CREATE TABLE supplier_user_profile_period(id TEXT PRIMARY KEY, user_id TEXT REFERENCES user(id), supplier_id TEXT REFERENCES supplier(id));
    CREATE TABLE skill(id TEXT PRIMARY KEY, code TEXT, name TEXT);
    CREATE TABLE worker_skill(worker_id TEXT REFERENCES user(id), skill_id TEXT REFERENCES skill(id));
    CREATE TABLE number_sequence(scope TEXT, scope_id TEXT, next_value INTEGER, PRIMARY KEY(scope,scope_id));
    CREATE TRIGGER invoice_no_delete BEFORE DELETE ON invoice BEGIN SELECT RAISE(ABORT,'issued history immutable'); END;
    INSERT INTO client VALUES('client-020-impc','IMPC'),('demo-client','DEMO');
    INSERT INTO user VALUES('owner','Owner'),('mail-worker','Mailbox worker');
    INSERT INTO account VALUES('a','mail-worker','original-password-hash'),('a-owner','owner','owner-password-hash');
    INSERT INTO mail_identity VALUES('mail-worker','mail-worker@j-aautomation.com');
    INSERT INTO project VALUES('project-cp020-bbs-mexico','client-020-impc','BBS Mexico'),('project-cp020-dfw','client-020-impc','Junkers DFW'),('extra-impc','client-020-impc','Other IMPC'),('demo','demo-client','DEMO');
    INSERT INTO project_member VALUES('demo-worker','demo','mail-worker');
    INSERT INTO invoice VALUES('issued-demo','demo','issued','invoices/issued-demo.pdf');
    INSERT INTO invoice_line VALUES('line','issued-demo','10000');
    INSERT INTO payment VALUES('payment','issued-demo','10000');
    INSERT INTO daily_report VALUES('report','demo');
    INSERT INTO document VALUES('bbs-document','project-cp020-bbs-mexico','reports/bbs.pdf');
    INSERT INTO legal_entity VALUES('demo-entity','DEMO'),('qa-entity','QA-EUR-TEST');
    INSERT INTO tax_profile VALUES('demo-tax','demo-entity','Demo tax'),('qa-tax','qa-entity','QA tax');
    INSERT INTO tax_component VALUES('demo-component','demo-tax'),('qa-component','qa-tax');
    INSERT INTO invoice_number_policy VALUES('demo-policy','demo-entity');
    INSERT INTO supplier VALUES('account-linked','TEST supplier role access'),('unused-demo','DEMO supplier');
    INSERT INTO supplier_user_profile VALUES('owner','account-linked');
    INSERT INTO supplier_user_profile_period VALUES('period','owner','account-linked');
    INSERT INTO skill VALUES('real-skill','PLC-COMM','PLC commissioning'),('qa-skill','QA-INSTALL-SUPERVISION','QA installation supervision');
    INSERT INTO worker_skill VALUES('mail-worker','real-skill'),('owner','qa-skill');
    INSERT INTO number_sequence VALUES('client','global',31),('project','client-020-impc',3),('project','demo-client',7),('invoice','demo-entity:2026',10);
  `);
  db.close();
  return {root,database,artifacts,archive};
}

describe('isolated clean-slate rehearsal', () => {
  it('archives issued financial history and artifacts, preserves identities and only two examples, and is idempotent', () => {
    const f=fixture();
    const first=rehearseCleanSlate(f.database,f.artifacts,f.archive);
    expect(first.status).toBe('applied');
    expect(first.before).toMatchObject({client:2,project:4,user:2,mail_identity:1,invoice:1,payment:1,daily_report:1});
    expect(first.after).toMatchObject({client:1,project:2,user:2,mail_identity:1,invoice:0,payment:0,daily_report:0});
    expect(first.after).toMatchObject({legal_entity:0,tax_profile:0,tax_component:0,invoice_number_policy:0,supplier:0,supplier_user_profile:0,supplier_user_profile_period:0,skill:1,worker_skill:1,number_sequence:2});
    expect(first.deleted).toMatchObject({client:1,project:2,invoice:1,invoice_line:1,payment:1,daily_report:1,project_member:1});
    expect(first.archivedFinancialCounts).toMatchObject({invoice:1,invoice_line:1,payment:1,daily_report:1});
    expect(first.archivedArtifactFiles).toHaveLength(2);
    expect(first.retainedArtifactFiles).toEqual([expect.objectContaining({path:'reports/bbs.pdf'})]);
    expect(first.retainedArtifactManifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(join(f.artifacts,'invoices','issued-demo.pdf'))).toBe(false);
    expect(readFileSync(join(f.artifacts,'reports','bbs.pdf'),'utf8')).toContain('retained BBS');
    expect(readFileSync(join(f.archive,'artifacts','invoices','issued-demo.pdf'),'utf8')).toContain('issued DEMO');
    const original=new DatabaseSync(join(f.archive,'original.sqlite'),{readOnly:true});
    expect(original.prepare('SELECT state FROM invoice WHERE id=?').get('issued-demo')).toMatchObject({state:'issued'});
    expect(original.prepare('SELECT amount_minor FROM payment WHERE id=?').get('payment')).toMatchObject({amount_minor:'10000'});
    original.close();
    const active=new DatabaseSync(f.database,{readOnly:true});
    expect(active.prepare('PRAGMA integrity_check').get()).toMatchObject({integrity_check:'ok'});
    expect(active.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(active.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='invoice_no_delete'").get()).toMatchObject({name:'invoice_no_delete'});
    expect(active.prepare('SELECT id FROM project ORDER BY id').all()).toEqual([
      expect.objectContaining({id:'project-cp020-bbs-mexico'}),
      expect.objectContaining({id:'project-cp020-dfw'}),
    ]);
    expect(active.prepare("SELECT password_hash FROM account WHERE user_id='mail-worker'").get()).toMatchObject({password_hash:'original-password-hash'});
    expect(active.prepare('SELECT id FROM supplier').all()).toEqual([]);
    expect(active.prepare('SELECT scope,scope_id FROM number_sequence ORDER BY scope,scope_id').all()).toEqual([
      expect.objectContaining({scope:'client',scope_id:'global'}),
      expect.objectContaining({scope:'project',scope_id:'client-020-impc'}),
    ]);
    expect(active.prepare('SELECT code FROM skill').all()).toEqual([expect.objectContaining({code:'PLC-COMM'})]);
    active.close();
    const second=rehearseCleanSlate(f.database,f.artifacts,f.archive);
    expect(second.status).toBe('already_applied');
    expect(second.archivedDatabaseSha256).toBe(first.archivedDatabaseSha256);
    expect(readFileSync(join(f.artifacts,'reports','bbs.pdf'),'utf8')).toContain('retained BBS');
  });

  it('recovers interrupted artifact deletion using a mandatory candidate journal', () => {
    const f=fixture();
    rehearseCleanSlate(f.database,f.artifacts,f.archive);
    copyFileSync(join(f.archive,'artifacts','invoices','issued-demo.pdf'),join(f.artifacts,'invoices','issued-demo.pdf'));
    const recovered=rehearseCleanSlate(f.database,f.artifacts,f.archive);
    expect(recovered.status).toBe('already_applied');
    expect(recovered.artifactDeletionCandidates).toEqual(['invoices/issued-demo.pdf']);
    expect(existsSync(join(f.artifacts,'invoices','issued-demo.pdf'))).toBe(false);
    expect(existsSync(join(f.artifacts,'reports','bbs.pdf'))).toBe(true);
  });

  it('fails a rerun when a retained BBS artifact is missing', () => {
    const f=fixture();
    rehearseCleanSlate(f.database,f.artifacts,f.archive);
    rmSync(join(f.artifacts,'reports','bbs.pdf'));
    expect(()=>rehearseCleanSlate(f.database,f.artifacts,f.archive)).toThrow(/Missing or changed retained artifact: reports\/bbs.pdf/);
  });

  it('removes even account-linked supplier profiles while keeping every user/account row', () => {
    const f=fixture();
    const db=new DatabaseSync(f.database);
    db.exec("INSERT INTO user VALUES('orphan-user','No portal account'); INSERT INTO supplier_user_profile VALUES('orphan-user','unused-demo')");
    db.close();
    const result=rehearseCleanSlate(f.database,f.artifacts,f.archive);
    expect(result.after).toMatchObject({user:3,account:2,supplier:0,supplier_user_profile:0,supplier_user_profile_period:0});
    const active=new DatabaseSync(f.database,{readOnly:true});
    expect(active.prepare("SELECT id FROM user WHERE id='orphan-user'").get()).toBeTruthy();
    expect(active.prepare('SELECT supplier_id FROM supplier_user_profile').all()).toEqual([]);
    active.close();
  });

  it('keeps an invoice sequence only when its issuer survives with a retained example', () => {
    const f=fixture();
    const db=new DatabaseSync(f.database);
    db.exec(`
      CREATE TABLE billing_rule(id TEXT PRIMARY KEY, project_id TEXT REFERENCES project(id), legal_entity_id TEXT REFERENCES legal_entity(id));
      INSERT INTO legal_entity VALUES('bbs-issuer','BBS');
      INSERT INTO billing_rule VALUES('bbs-rule','project-cp020-bbs-mexico','bbs-issuer');
      INSERT INTO number_sequence VALUES('invoice','bbs-issuer:2026',4);
    `);
    db.close();
    const result=rehearseCleanSlate(f.database,f.artifacts,f.archive);
    expect(result.after).toMatchObject({legal_entity:1,billing_rule:1,number_sequence:3});
    const active=new DatabaseSync(f.database,{readOnly:true});
    expect(active.prepare("SELECT scope_id FROM number_sequence WHERE scope='invoice'").all()).toEqual([expect.objectContaining({scope_id:'bbs-issuer:2026'})]);
    expect(active.prepare("SELECT code FROM legal_entity").all()).toEqual([expect.objectContaining({code:'BBS'})]);
    active.close();
  });

  it('stops on an unrecognized numbering scope', () => {
    const f=fixture();
    const db=new DatabaseSync(f.database);
    db.exec("INSERT INTO number_sequence VALUES('mystery','global',1)");
    db.close();
    expect(()=>rehearseCleanSlate(f.database,f.artifacts,f.archive)).toThrow(/Unknown numbering scope/);
  });

  it('detects any post-clean client/project addition or edit to a retained BBS example', () => {
    const f=fixture();
    const first=rehearseCleanSlate(f.database,f.artifacts,f.archive);
    expect(first.postCleanManifestSha256).toMatch(/^[0-9a-f]{64}$/);
    const db=new DatabaseSync(f.database);
    db.exec("INSERT INTO client VALUES('new-client','New'); INSERT INTO project VALUES('new-project','new-client','New')");
    db.close();
    expect(()=>rehearseCleanSlate(f.database,f.artifacts,f.archive)).toThrow(/expected post-clean manifest/);
    const repair=new DatabaseSync(f.database);
    repair.exec("DELETE FROM project WHERE id='new-project'; DELETE FROM client WHERE id='new-client'");
    repair.prepare('UPDATE project SET name=? WHERE id=?').run('Edited BBS','project-cp020-bbs-mexico');
    repair.close();
    expect(()=>rehearseCleanSlate(f.database,f.artifacts,f.archive)).toThrow(/expected post-clean manifest/);
  });

  it('rolls back rows and trigger DDL after a post-deletion/pre-commit failure', () => {
    const f=fixture();
    expect(()=>rehearseCleanSlate(f.database,f.artifacts,f.archive,{beforeCommit:()=>{throw new Error('injected pre-commit failure')}})).toThrow('injected pre-commit failure');
    const db=new DatabaseSync(f.database,{readOnly:true});
    expect((db.prepare('SELECT COUNT(*) n FROM project').get() as {n:number}).n).toBe(4);
    expect((db.prepare('SELECT COUNT(*) n FROM invoice').get() as {n:number}).n).toBe(1);
    expect(db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='invoice_no_delete'").get()).toBeTruthy();
    expect(db.prepare('PRAGMA integrity_check').get()).toMatchObject({integrity_check:'ok'});
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    db.close();
    expect(rehearseCleanSlate(f.database,f.artifacts,f.archive).status).toBe('applied');
  });

  it('preserves the original post-commit failure for idempotent recovery', () => {
    const f=fixture();
    expect(()=>rehearseCleanSlate(f.database,f.artifacts,f.archive,{afterCommit:()=>{throw new Error('artifact storage unavailable')}})).toThrow('artifact storage unavailable');
    const db=new DatabaseSync(f.database,{readOnly:true});
    expect((db.prepare('SELECT COUNT(*) n FROM invoice').get() as {n:number}).n).toBe(0);
    db.close();
    expect(existsSync(join(f.artifacts,'invoices','issued-demo.pdf'))).toBe(true);
    expect(rehearseCleanSlate(f.database,f.artifacts,f.archive).status).toBe('already_applied');
    expect(existsSync(join(f.artifacts,'invoices','issued-demo.pdf'))).toBe(false);
  });

  it('rejects legacy recovery journals and changed working artifact subsets', () => {
    const f=fixture();
    rehearseCleanSlate(f.database,f.artifacts,f.archive);
    writeFileSync(join(f.artifacts,'reports','extra.pdf'),'unarchived');
    expect(()=>rehearseCleanSlate(f.database,f.artifacts,f.archive)).toThrow(/Working artifact added or changed/);
    rmSync(join(f.artifacts,'reports','extra.pdf'));
    const db=new DatabaseSync(f.database);
    db.exec(`DROP TABLE clean_slate_rehearsal_journal; CREATE TABLE clean_slate_rehearsal_journal(original_sha256 TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT;`);
    db.close();
    expect(()=>rehearseCleanSlate(f.database,f.artifacts,f.archive)).toThrow(/Legacy cleanup journal/);
  });

  it('matches exact working database and artifact hashes before mutation', () => {
    const f=fixture();
    const db=new DatabaseSync(f.database);
    db.exec('ALTER TABLE project ADD COLUMN linked_invoice_id TEXT');
    db.prepare('UPDATE project SET linked_invoice_id=? WHERE id=?').run('issued-demo','project-cp020-dfw');
    db.close();
    expect(()=>rehearseCleanSlate(f.database,f.artifacts,f.archive)).toThrow(/Unreviewed retained soft references/);
    const modified=new DatabaseSync(f.database);
    modified.prepare('UPDATE client SET name=? WHERE id=?').run('Modified after archive','demo-client');
    modified.close();
    expect(()=>rehearseCleanSlate(f.database,f.artifacts,f.archive)).toThrow(/Working database bytes differ/);
  });

  it('rolls back every deletion when an unknown retained soft reference points to a doomed row', () => {
    const f=fixture();
    const db=new DatabaseSync(f.database);
    db.exec('ALTER TABLE project ADD COLUMN linked_invoice_id TEXT');
    db.prepare('UPDATE project SET linked_invoice_id=? WHERE id=?').run('issued-demo','project-cp020-dfw');
    db.close();
    expect(()=>rehearseCleanSlate(f.database,f.artifacts,f.archive)).toThrow(/Unreviewed retained soft references/);
    const check=new DatabaseSync(f.database,{readOnly:true});
    expect((check.prepare('SELECT COUNT(*) n FROM invoice').get() as {n:number}).n).toBe(1);
    expect((check.prepare('SELECT COUNT(*) n FROM project').get() as {n:number}).n).toBe(4);
    check.close();
  });

  it('fails closed on unreviewed foreign-key cycles and never targets production paths', () => {
    const f=fixture();
    const db=new DatabaseSync(f.database);
    db.exec('CREATE TABLE cycle_a(id TEXT PRIMARY KEY,b_id TEXT REFERENCES cycle_b(id)); CREATE TABLE cycle_b(id TEXT PRIMARY KEY,a_id TEXT REFERENCES cycle_a(id));');
    db.close();
    expect(()=>rehearseCleanSlate(f.database,f.artifacts,f.archive)).toThrow(/Unknown FK cleanup cycle/);
    expect(()=>rehearseCleanSlate('/var/lib/jaautomation/data/jaautomation.sqlite',f.artifacts,join(f.root,'other.rehearsal-archive'))).toThrow(/Production or release storage refused/);
  });

  it('refuses a tampered original archive before an idempotent rerun', () => {
    const f=fixture();
    rehearseCleanSlate(f.database,f.artifacts,f.archive);
    writeFileSync(join(f.archive,'artifacts','invoices','issued-demo.pdf'),'tampered');
    expect(()=>rehearseCleanSlate(f.database,f.artifacts,f.archive)).toThrow(/archive hash verification failed/);
  });

  it('refuses production-root spelling, hardlink aliases, artifact and archive symlinks, and storage-key traversal', () => {
    const f=fixture();
    expect(()=>rehearseCleanSlate('/var/lib/jaautomation/copy.rehearsal.sqlite',f.artifacts,f.archive)).toThrow(/Production or release storage refused/);
    const alias=join(f.root,'alias.rehearsal.sqlite');
    linkSync(f.database,alias);
    expect(()=>assertNotProductionInode(alias,f.database)).toThrow(/production database inode/i);
    const artifactLink=join(f.artifacts,'reports','linked.pdf');
    symlinkSync(join(f.artifacts,'reports','bbs.pdf'),artifactLink);
    expect(()=>rehearseCleanSlate(f.database,f.artifacts,f.archive)).toThrow(/Artifact symlink refused/);
    rmSync(artifactLink);
    rmSync(f.archive,{recursive:true,force:true});
    symlinkSync(f.root,f.archive);
    expect(()=>rehearseCleanSlate(f.database,f.artifacts,f.archive)).toThrow(/Archive symlink/);
    rmSync(f.archive);
    const db=new DatabaseSync(f.database);
    db.prepare('UPDATE document SET storage_key=? WHERE id=?').run('../escape.pdf','bbs-document');
    db.close();
    expect(()=>rehearseCleanSlate(f.database,f.artifacts,f.archive)).toThrow(/Unsafe retained storage key/);
  });
});
