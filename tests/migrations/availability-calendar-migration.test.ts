import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDatabase, integrityCheck } from '@ja/database';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const migrations = resolve(process.cwd(), 'migrations');

describe('0049 availability calendar audit migration', () => {
  it('upgrades populated schema 48 preserving records, audits, metadata and closed guards', () => {
    const migrationDirectory = mkdtempSync(join(tmpdir(), 'ja-availability-schema48-'));
    const previousPath = process.env.JA_MIGRATIONS_PATH;
    for (const entry of readdirSync(migrations)) {
      if (
        entry === 'contracts' ||
        (/^\d{4}_.+\.sql$/.test(entry) && Number(entry.slice(0, 4)) <= 48)
      )
        cpSync(join(migrations, entry), join(migrationDirectory, entry), { recursive: true });
    }
    process.env.JA_MIGRATIONS_PATH = migrationDirectory;
    const value = createB5LifecycleSecurityFixture();
    try {
      const created = value.repository.setWorkerAvailability(value.worker, {
        workerId: value.worker.userId,
        startsAt: '2026-09-21T08:00:00.000Z',
        endsAt: '2026-09-21T16:00:00.000Z',
        availability: 'available',
        note: 'Preserve historical window',
      });
      expect(
        value.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get(),
      ).toEqual({ version: 48 });
      const tables = [
        'user',
        'client',
        'project',
        'project_member',
        'worker_availability',
        'audit_event',
        'migration_contract_metadata',
        'finance_v2_cutover',
        'audit_action_registry',
      ];
      const orderBy = (table: string) =>
        table === 'audit_action_registry' ? 'contract_version,action,entity_type,actor_kind' : '1';
      const originalColumns = Object.fromEntries(
        tables.map((table) => [
          table,
          (
            value.sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
          ).map((column) => column.name),
        ]),
      ) as Record<string, string[]>;
      const before = Object.fromEntries(
        tables.map((table) => [
          table,
          value.sqlite.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy(table)}`).all(),
        ]),
      );
      value.sqlite.close();
      process.env.JA_MIGRATIONS_PATH = migrations;
      value.sqlite = createDatabase(join(value.directory, 'app.db')).sqlite;
      const originalActions = (before.audit_action_registry as Array<{ action: string }>).map(
        (row) => row.action,
      );
      for (const table of tables) {
        const where =
          table === 'migration_contract_metadata'
            ? ' WHERE migration_version<=48'
            : table === 'audit_action_registry'
              ? ` WHERE action IN (${originalActions.map(() => '?').join(',')})`
              : '';
        expect(
          value.sqlite
            .prepare(
              `SELECT ${originalColumns[table].join(',')} FROM ${table}${where} ORDER BY ${orderBy(table)}`,
            )
            .all(...(table === 'audit_action_registry' ? originalActions : [])),
          table,
        ).toEqual(before[table]);
      }
      expect(
        value.sqlite
          .prepare('SELECT expense_budget_minor FROM project WHERE id=?')
          .get(value.project.id),
      ).toEqual({ expense_budget_minor: null });
      expect(
        value.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get(),
      ).toEqual({ version: 64 });
      expect(
        value.sqlite
          .prepare(
            "SELECT action,entity_type,actor_kind FROM audit_action_registry WHERE action='worker_availability.update'",
          )
          .get(),
      ).toEqual({
        action: 'worker_availability.update',
        entity_type: 'worker_availability',
        actor_kind: 'user',
      });
      expect(() =>
        value.sqlite
          .prepare(
            "INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification) VALUES('B5-R4','forged.action','worker_availability','user','CE-CORE02','restricted')",
          )
          .run(),
      ).toThrow(/reviewed manifest/);
      expect(() =>
        value.sqlite
          .prepare(
            "UPDATE audit_action_registry SET owner_packet='forged' WHERE action='worker_availability.update'",
          )
          .run(),
      ).toThrow(/immutable/);
      expect(() =>
        value.sqlite
          .prepare('DELETE FROM migration_contract_metadata WHERE migration_version=49')
          .run(),
      ).toThrow(/immutable/);
      expect(
        value.sqlite.prepare('SELECT version FROM worker_availability WHERE id=?').get(created.id),
      ).toEqual({ version: 1 });
      expect(value.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(integrityCheck(value.sqlite)).toBe('ok');
    } finally {
      closeB5LifecycleSecurityFixture(value);
      if (previousPath === undefined) delete process.env.JA_MIGRATIONS_PATH;
      else process.env.JA_MIGRATIONS_PATH = previousPath;
      rmSync(migrationDirectory, { recursive: true, force: true });
    }
  });
});
