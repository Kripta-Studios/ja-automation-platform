import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildCleanupDryRunReview,
  buildCleanupInventory,
  cleanupRowDigest,
  type CleanupEntity,
} from '../../scripts/audit-business-data-cleanup';
import {
  applyCleanupRehearsal,
  type ReviewedCleanupEntry,
  type ReviewedCleanupManifest,
} from '../../scripts/apply-business-data-cleanup';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ja-cleanup-rehearsal-'));
  roots.push(root);
  const path = join(root, 'copy.rehearsal.sqlite');
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE client(id TEXT PRIMARY KEY, client_number TEXT, legal_name TEXT, display_name TEXT, status TEXT);
    CREATE TABLE project(id TEXT PRIMARY KEY, client_id TEXT REFERENCES client(id), project_number TEXT, name TEXT, status TEXT);
    CREATE TABLE user(id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE mail_identity(user_id TEXT PRIMARY KEY REFERENCES user(id));
    CREATE TABLE project_member(id TEXT PRIMARY KEY, project_id TEXT REFERENCES project(id), user_id TEXT REFERENCES user(id));
    CREATE TABLE invoice(id TEXT PRIMARY KEY, project_id TEXT REFERENCES project(id), state TEXT);
  `);
  return { db, path };
}

function entry(entity: CleanupEntity): ReviewedCleanupEntry {
  return {
    table: entity.table,
    id: entity.id,
    rowDigest: entity.rowDigest,
    dependencyDigest: entity.dependencyDigest,
    provenanceEvidence: `fixture-ledger:${entity.id}`,
  };
}

function manifest(entries: ReviewedCleanupEntry[]): ReviewedCleanupManifest {
  return { version: 1, rehearsalOnly: true, reviewedBy: 'isolated-test-review', entries };
}

describe('business data cleanup safety', () => {
  it('fingerprints null, empty text, numeric and text values distinctly', () => {
    expect(cleanupRowDigest({ id: 'a', note: null })).not.toBe(
      cleanupRowDigest({ id: 'a', note: '' }),
    );
    expect(cleanupRowDigest({ id: 'a', amount: 0 })).not.toBe(
      cleanupRowDigest({ id: 'a', amount: '0' }),
    );
  });

  it('makes a non-applicable dry-run review with explicit blockers', () => {
    const { db, path } = fixture();
    try {
      db.exec(`
        INSERT INTO client VALUES('c','C','Client','Client','active');
        INSERT INTO project VALUES('candidate','c','P1','Candidate','draft');
      `);
      const unverified = buildCleanupDryRunReview(buildCleanupInventory(db));
      expect(unverified.entries.find((row) => row.id === 'candidate')?.blockers).toContain(
        'no positive fixture attestation',
      );
      expect(unverified.entries.every((row) => !row.eligibleForRehearsal)).toBe(true);
      const verified = buildCleanupDryRunReview(buildCleanupInventory(db, new Set(['candidate'])));
      expect(verified.entries.find((row) => row.id === 'candidate')?.eligibleForRehearsal).toBe(
        true,
      );
      db.close();
      expect(() =>
        applyCleanupRehearsal(path, unverified as unknown as ReviewedCleanupManifest),
      ).toThrow(/reviewed rehearsal manifest/);
    } finally {
      if (db.isOpen) db.close();
    }
  });

  it('protects BBS, IMPC, known QA records and mailbox-backed worker assignment closure', () => {
    const { db } = fixture();
    try {
      db.exec(`
        INSERT INTO client VALUES('client-020-impc','IMPC','IMPC','IMPC','active');
        INSERT INTO client VALUES('client-bbs','BBS','BBS','BBS','active');
        INSERT INTO client VALUES('client-other','OTHER','Other','Other','active');
        INSERT INTO client VALUES('01a0cf9b-bec4-72cd-a97d-8de393f89dd5','QA','QA','QA','active');
        INSERT INTO project VALUES('project-cp020-bbs-mexico','client-bbs','BBS-P','BBS work','active');
        INSERT INTO project VALUES('project-with-worker','client-other','O-P','Field work','active');
        INSERT INTO project VALUES('01a0cfae-9005-76a9-871a-8cf4edf877dd','01a0cf9b-bec4-72cd-a97d-8de393f89dd5','QA-P','QA project','active');
        INSERT INTO user VALUES('worker-mail','Mailbox worker');
        INSERT INTO mail_identity VALUES('worker-mail');
        INSERT INTO project_member VALUES('membership','project-with-worker','worker-mail');
      `);
      const inventory = buildCleanupInventory(db);
      for (const id of [
        'client-020-impc',
        'project-cp020-bbs-mexico',
        '01a0cf9b-bec4-72cd-a97d-8de393f89dd5',
        '01a0cfae-9005-76a9-871a-8cf4edf877dd',
        'project-with-worker',
      ])
        expect(inventory.entities.find((row) => row.id === id)?.classification).toBe('protected');
      expect(
        inventory.entities.find((row) => row.id === 'project-with-worker')?.dependencyCounts,
      ).toMatchObject({ project_member: 1 });
      expect(inventory.protectedMailboxUserCount).toBe(1);
    } finally {
      db.close();
    }
  });

  it('refuses ambiguous provenance, finalized invoices and production-path targets', () => {
    const { db, path } = fixture();
    try {
      db.exec(`
        INSERT INTO client VALUES('c','C','Client','Client','active');
        INSERT INTO project VALUES('demo','c','P1','Demo project','draft');
        INSERT INTO project VALUES('issued','c','P2','Issued project','draft');
        INSERT INTO project VALUES('closed','c','P3','Closed project','closed');
        INSERT INTO invoice VALUES('i','issued','issued');
      `);
      const inventory = buildCleanupInventory(db);
      expect(inventory.entities.find((row) => row.id === 'demo')?.classification).toBe(
        'ambiguous_marker',
      );
      const demo = inventory.entities.find((row) => row.id === 'demo')!;
      const issued = inventory.entities.find((row) => row.id === 'issued')!;
      const closed = inventory.entities.find((row) => row.id === 'closed')!;
      db.close();
      expect(() =>
        applyCleanupRehearsal(path, manifest([{ ...entry(demo), provenanceEvidence: '' }])),
      ).toThrow(/fixture-ledger evidence/);
      expect(() => applyCleanupRehearsal(path, manifest([entry(issued)]))).toThrow(
        /Finalized record refused/,
      );
      expect(() => applyCleanupRehearsal(path, manifest([entry(closed)]))).toThrow(
        /Finalized record refused/,
      );
      expect(() =>
        applyCleanupRehearsal(
          '/var/lib/jaautomation/data/jaautomation.sqlite',
          manifest([entry(demo)]),
        ),
      ).toThrow(/rehearsal/);
    } finally {
      if (db.isOpen) db.close();
    }
  });

  it('rolls back stale multi-record manifests and is idempotent after a safe rehearsal deletion', () => {
    const { db, path } = fixture();
    try {
      db.exec(`
        INSERT INTO client VALUES('c','C','Client','Client','active');
        INSERT INTO project VALUES('empty-a','c','P1','Empty A','draft');
        INSERT INTO project VALUES('empty-b','c','P2','Empty B','planned');
        INSERT INTO user VALUES('mail-worker','Mailbox worker');
        INSERT INTO mail_identity VALUES('mail-worker');
      `);
      const inventory = buildCleanupInventory(db, new Set(['empty-a', 'empty-b', 'c']));
      const a = inventory.entities.find((row) => row.id === 'empty-a')!;
      const b = inventory.entities.find((row) => row.id === 'empty-b')!;
      const client = inventory.entities.find((row) => row.id === 'c')!;
      db.close();
      expect(() => applyCleanupRehearsal(path, manifest([entry(client)]))).toThrow(
        /Dependent records require separate classification/,
      );
      expect(() =>
        applyCleanupRehearsal(
          path,
          manifest([
            {
              ...entry(a),
              id: 'never-existed',
            },
          ]),
        ),
      ).toThrow(/without a matching cleanup journal/);
      expect(() =>
        applyCleanupRehearsal(
          path,
          manifest([entry(a), { ...entry(b), rowDigest: '0'.repeat(64) }]),
        ),
      ).toThrow(/changed since review/);
      const check = new DatabaseSync(path, { readOnly: true });
      expect(
        (check.prepare('SELECT COUNT(*) count FROM project').get() as { count: number }).count,
      ).toBe(2);
      check.close();
      expect(applyCleanupRehearsal(path, manifest([entry(a)]))).toEqual({
        status: 'deleted',
        deleted: 1,
      });
      expect(applyCleanupRehearsal(path, manifest([entry(a)]))).toEqual({
        status: 'already_applied',
        deleted: 0,
      });
      const preserved = new DatabaseSync(path, { readOnly: true });
      expect(
        (preserved.prepare('SELECT COUNT(*) count FROM mail_identity').get() as { count: number })
          .count,
      ).toBe(1);
      preserved.close();
    } finally {
      if (db.isOpen) db.close();
    }
  });

  it('blocks deletion when any database relationship has an unresolved composite key', () => {
    const { db, path } = fixture();
    try {
      db.exec(`
        INSERT INTO client VALUES('c','C','Client','Client','active');
        INSERT INTO project VALUES('empty','c','P1','Empty','draft');
        CREATE TABLE composite_parent(a TEXT, b TEXT, PRIMARY KEY(a,b));
        CREATE TABLE composite_child(a TEXT, b TEXT, FOREIGN KEY(a,b) REFERENCES composite_parent(a,b));
      `);
      const inventory = buildCleanupInventory(db, new Set(['empty']));
      expect(inventory.incompleteRelations).toContain('composite_child:composite-or-implicit-fk');
      const target = inventory.entities.find((row) => row.id === 'empty')!;
      db.close();
      expect(() => applyCleanupRehearsal(path, manifest([entry(target)]))).toThrow(
        /Incomplete dependency relationships block cleanup/,
      );
      const preserved = new DatabaseSync(path, { readOnly: true });
      expect(preserved.prepare("SELECT id FROM project WHERE id='empty'").get()).toBeTruthy();
      preserved.close();
    } finally {
      if (db.isOpen) db.close();
    }
  });
});
