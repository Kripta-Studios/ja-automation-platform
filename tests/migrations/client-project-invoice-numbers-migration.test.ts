import { afterEach, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createDatabase, integrityCheck } from '@ja/database';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture';

const directories: string[] = [];
const fixtures: B5LifecycleSecurityFixture[] = [];
const original = process.env.JA_MIGRATIONS_PATH;
afterEach(() => {
  fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture);
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
  if (original === undefined) delete process.env.JA_MIGRATIONS_PATH;
  else process.env.JA_MIGRATIONS_PATH = original;
});

describe('client/project invoice numbers migration 91', () => {
  it('switches only the current J&A USD policy and leaves issued invoices untouched', () => {
    const prior = mkdtempSync(join(tmpdir(), 'ja-cp-schema90-'));
    directories.push(prior);
    for (const entry of readdirSync(resolve('migrations')))
      if (entry === 'contracts' || (/^\d{4}_.+\.sql$/.test(entry) && Number(entry.slice(0, 4)) <= 90))
        cpSync(join(resolve('migrations'), entry), join(prior, entry), { recursive: true });
    process.env.JA_MIGRATIONS_PATH = prior;
    const f = createB5LifecycleSecurityFixture();
    fixtures.push(f);
    const now = '2026-11-01T00:00:00.000Z';
    const ja = (
      f.sqlite.prepare("SELECT id FROM legal_entity WHERE code='JA-USA' AND currency='USD'").get() as {
        id: string;
      }
    ).id;
    const other = (
      f.sqlite.prepare("SELECT id FROM legal_entity WHERE code<>'JA-USA' LIMIT 1").get() as
        | { id: string }
        | undefined
    )?.id;
    const insert = f.sqlite.prepare(
      'INSERT INTO invoice_number_policy(id,legal_entity_id,prefix,digits,effective_from,effective_to,accountant_approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
    );
    insert.run('policy-ja-current', ja, '123', 6, '2026-10-01', null, now, now, now);
    insert.run('policy-ja-ended', ja, 'OLD', 6, '2025-01-01', '2025-12-31', now, now, now);
    if (other) insert.run('policy-other', other, 'OTH', 6, '2026-01-01', null, now, now, now);
    const invoices = f.sqlite.prepare('SELECT * FROM invoice ORDER BY rowid').all();
    f.sqlite.close();
    process.env.JA_MIGRATIONS_PATH = resolve('migrations');
    f.sqlite = createDatabase(join(f.directory, 'app.db')).sqlite;
    const formats = Object.fromEntries(
      (
        f.sqlite.prepare('SELECT id,number_format FROM invoice_number_policy').all() as Array<{
          id: string;
          number_format: string;
        }>
      ).map((row) => [row.id, row.number_format]),
    );
    expect(formats['policy-ja-current']).toBe('client_project_sequence');
    expect(formats['policy-ja-ended']).toBe('prefix_year_sequence');
    if (other) expect(formats['policy-other']).toBe('prefix_year_sequence');
    expect(f.sqlite.prepare('SELECT * FROM invoice ORDER BY rowid').all()).toEqual(invoices);
    expect(() =>
      f.sqlite.prepare("UPDATE invoice_number_policy SET number_format='weekly' WHERE id='policy-ja-current'").run(),
    ).toThrow();
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM project_invoice_number_series').get()).toEqual({ n: 0 });
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(integrityCheck(f.sqlite)).toBe('ok');
  });
});
