import { describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  seedB5User,
} from '../fixtures/b5-lifecycle-security-fixture.js';

describe('invoice list source presence', () => {
  it('projects exact child counts for authorized readers without changing invoice rows', () => {
    const value = createB5LifecycleSecurityFixture();
    try {
      const createdAt = '2026-09-27T12:00:00.000Z';
      for (const [id, timestamp] of [
        ['source-free-draft', createdAt],
        ['source-linked-draft', '2026-09-27T12:01:00.000Z'],
      ] as const) {
        value.sqlite
          .prepare(
            `INSERT INTO invoice(
               id,project_id,stream_type,state,currency,created_at,updated_at
             ) VALUES(?,?,'labor','draft','EUR',?,?)`,
          )
          .run(id, value.project.id, timestamp, timestamp);
      }
      for (const [sourceType, sourceId] of [
        ['time', 'source-presence-time'],
        ['expense', 'source-presence-expense'],
      ] as const) {
        value.sqlite
          .prepare(
            `INSERT INTO invoice_source(
               source_link_id,invoice_id,source_type,source_id,source_version
             ) VALUES(?,?,?,?,1)`,
          )
          .run(`source-presence-${sourceType}`, 'source-linked-draft', sourceType, sourceId);
      }
      value.sqlite
        .prepare(
          `INSERT INTO invoice_line(
             id,invoice_id,description,quantity_numerator,quantity_denominator,
             unit_price_minor,subtotal_minor,source_type,source_id,snapshot_json
           ) VALUES(?,'source-linked-draft','Test line',1,1,100,100,'time',?,'{}')`,
        )
        .run('source-presence-line', 'source-presence-time');

      seedB5User(value.sqlite, 'source-presence-auditor', 'auditor_read_only');
      const auditor = value.repository.principalFor('source-presence-auditor');
      const before = value.sqlite.prepare('SELECT * FROM invoice ORDER BY id').all();

      for (const principal of [value.owner, value.finance, auditor]) {
        const invoices = value.repository.listInvoices(principal);
        expect(invoices.map((invoice) => invoice.id)).toEqual([
          'source-linked-draft',
          'source-free-draft',
        ]);
        expect(invoices).toEqual([
          expect.objectContaining({
            id: 'source-linked-draft',
            invoice_source_count: 2,
            invoice_line_count: 1,
            paid_minor: '0',
          }),
          expect.objectContaining({
            id: 'source-free-draft',
            invoice_source_count: 0,
            invoice_line_count: 0,
            paid_minor: '0',
          }),
        ]);
      }
      for (const principal of [value.manager, value.worker, value.outsider]) {
        expect(() => value.repository.listInvoices(principal)).toThrow(AccessDeniedError);
      }
      expect(value.sqlite.prepare('SELECT * FROM invoice ORDER BY id').all()).toEqual(before);
    } finally {
      closeB5LifecycleSecurityFixture(value);
    }
  });
});
