import { afterEach, describe, expect, it } from 'vitest';
import { SupplierWorkforceRepository, V3Repository, V3AccessDeniedError } from '@ja/database';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});
describe('live supplier financial restriction', () => {
  it('disables worker compensation for both external profiles and restores only by Owner decision', () => {
    const fixture = createB5LifecycleSecurityFixture();
    fixtures.push(fixture);
    const stamp = new Date().toISOString();
    fixture.sqlite
      .prepare(
        "INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES('supplier-fixture-login',?,'credential',?,'isolated-test-hash',?,?)",
      )
      .run(fixture.worker.userId, fixture.worker.userId, stamp, stamp);
    const entry = fixture.repository.createTimeEntry(fixture.worker, {
      projectId: fixture.project.id,
      workDate: '2026-08-03',
      category: 'regular',
      minutes: 60,
      summary: 'Operational privacy regression',
    });
    const supplier = new SupplierWorkforceRepository(fixture.sqlite);
    const finance = new V3Repository(fixture.sqlite);
    const company = supplier.createSupplier(fixture.owner, {
      name: 'No financial access supplier',
    });
    for (const profile of ['external_technician', 'supplier_coordinator'] as const) {
      supplier.setAccountProfile(fixture.owner, {
        userId: fixture.worker.userId,
        supplierId: company.id,
        profile,
      });
      const principal =
        profile === 'supplier_coordinator'
          ? (() => {
              supplier.grantProject(fixture.owner, {
                supplierId: company.id,
                projectId: fixture.project.id,
                coordinatorId: fixture.worker.userId,
                startsOn: '2026-01-01',
              });
              return stepUpB5Principal(fixture.sqlite, fixture.worker, 'supplier-financial');
            })()
          : fixture.worker;
      const payloads = [
        fixture.repository.listOwnTime(principal),
        fixture.repository.listTimeForScope(principal),
        fixture.repository.timeDetail(principal, entry.id),
        fixture.repository.listOwnTimeWeek(principal, '2026-08-03'),
      ];
      for (const payload of payloads)
        expect(JSON.stringify(payload)).not.toMatch(
          /billability|invoice_id|billable_minutes|client_rate|compensation_amount|internal_cost|billing_status|currency/,
        );
      expect(() => finance.workerPay(principal, '2026-08-01', '2026-08-31')).toThrow(
        V3AccessDeniedError,
      );
      expect(() =>
        supplier.setAccountProfile(fixture.worker, {
          userId: fixture.worker.userId,
          profile: 'standard',
        }),
      ).toThrow();
    }
    supplier.setAccountProfile(fixture.owner, {
      userId: fixture.worker.userId,
      profile: 'standard',
    });
    expect(() => finance.workerPay(fixture.worker, '2026-08-01', '2026-08-31')).not.toThrow();
  });
});
