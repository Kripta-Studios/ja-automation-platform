import { describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  seedB5User,
} from '../fixtures/b5-lifecycle-security-fixture.js';

describe('invoice list project filtering', () => {
  it('retains stable project identity for authorized filtering without exposing finance to operational roles', () => {
    const value = createB5LifecycleSecurityFixture();
    try {
      const secondProject = value.repository.createProject(value.owner, {
        costCenterCode: 'QA-INVOICE-LIST-PROJECT-FILTER-TEST-1',
        clientId: value.client.id,
        name: 'B5 lifecycle fixture',
        timezone: 'Europe/Madrid',
        currency: 'EUR',
        billingModel: 'tm',
        startDate: '2026-01-01',
      });
      const now = new Date().toISOString();
      for (const [id, projectId, amount] of [
        ['invoice-first-project', value.project.id, 125],
        ['invoice-second-project', secondProject.id, 250],
      ] as const) {
        value.sqlite
          .prepare(
            `INSERT INTO invoice(
               id,project_id,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,created_at,updated_at
             ) VALUES(?,?,'labor','draft','EUR',?,0,?,?,?)`,
          )
          .run(id, projectId, amount, amount, now, now);
      }
      seedB5User(value.sqlite, 'invoice-list-auditor', 'auditor_read_only');
      const auditor = value.repository.principalFor('invoice-list-auditor');
      const before = value.sqlite.prepare('SELECT * FROM invoice ORDER BY id').all();

      for (const principal of [value.owner, value.finance, auditor]) {
        const invoices = value.repository.listInvoices(principal);
        expect(invoices).toHaveLength(2);
        expect(invoices.filter((invoice) => invoice.project_id === value.project.id)).toEqual([
          expect.objectContaining({
            id: 'invoice-first-project',
            project_id: value.project.id,
            total_minor: 125,
            paid_minor: '0',
          }),
        ]);
        expect(invoices.filter((invoice) => invoice.project_id === secondProject.id)).toEqual([
          expect.objectContaining({
            id: 'invoice-second-project',
            project_id: secondProject.id,
            total_minor: 250,
            paid_minor: '0',
          }),
        ]);
        for (const invoice of invoices) {
          expect(invoice).not.toHaveProperty('snapshot_json');
          expect(invoice).not.toHaveProperty('pdf_storage_key');
        }
      }
      for (const principal of [value.worker, value.manager, value.outsider]) {
        expect(() => value.repository.listInvoices(principal)).toThrow(AccessDeniedError);
      }
      expect(value.sqlite.prepare('SELECT * FROM invoice ORDER BY id').all()).toEqual(before);
    } finally {
      closeB5LifecycleSecurityFixture(value);
    }
  });
});
