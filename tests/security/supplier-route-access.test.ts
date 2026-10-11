import { describe, expect, it } from 'vitest';
import { supplierRouteAllowed } from '../../apps/portal/src/lib/server/supplier-route-access';
import {
  supplierCsvCell,
  supplierCsv,
  supplierHoursFromMinutes,
} from '../../apps/portal/src/lib/server/supplier-csv';
import { portalNavigationForRole } from '../../apps/portal/src/lib/portal-navigation';

describe('supplier operational surface', () => {
  const profiles = ['external_technician', 'supplier_coordinator'] as const;

  it.each(profiles)('denies financial and unapproved surface for %s', (profile) => {
    for (const path of [
      '/my-pay',
      '/pay',
      '/api/worker-statement',
      '/api/worker-statement/pdf',
      '/documents',
      '/notifications',
      '/finance',
      '/expenses/export',
      '/reports/period',
      '/reports/period/other',
      '/reports/review',
      '/api/reports/other/pdf',
      '/api/documents/other/download',
      '/api/documents',
      '/api/documents/id/metadata',
      '/reports/period/preview',
      '/reports/review/preview',
      '/reports/export/preview',
      '/reports/period/other/preview',
      '/my-pay/__data.json',
      '/supplier/admin',
      '/crew/admin',
      '/crew/time/other/more',
      '/api/expenses/other',
      '/api/expenses/description-default/other',
      '/api/offline/sync',
      '/workflow/cases/other',
      '/workflow/capture/nested',
      '/api/workflow/cases/other',
    ]) {
      expect(supplierRouteAllowed(path, profile)).toBe(false);
    }
  });

  it.each(profiles)('preserves existing operational routes for %s', (profile) => {
    for (const path of [
      '/time',
      '/time/own-id',
      '/crew',
      '/crew/__data.json',
      '/crew/time/own-id',
      '/expenses',
      '/expenses/own-id',
      '/help/employee-field-guide/download',
      '/help/worker-reference/download',
      '/reports/own-id',
      '/reports/own-id/preview',
      '/api/documents/own-id',
      '/supplier',
      '/supplier/report',
      '/supplier/report.csv',
      '/time/__data.json',
      '/api/localized-pdf',
      '/api/expenses/crew-workers',
      '/api/expenses/time-options',
      '/api/expenses/description-default',
      '/api/reports/own-id/attachments',
      '/profile',
      '/service-worker.js',
      '/manifest.webmanifest',
      '/icon-192.png',
      '/icon-512.png',
    ]) {
      expect(supplierRouteAllowed(path, profile)).toBe(true);
    }
  });

  it('allows Digital Workers capture only for external technicians', () => {
    for (const path of [
      '/workflow',
      '/workflow/__data.json',
      '/workflow/capture',
      '/workflow/capture/__data.json',
      '/api/workflow/extract',
    ]) {
      expect(supplierRouteAllowed(path, 'external_technician')).toBe(true);
      expect(supplierRouteAllowed(path, 'supplier_coordinator')).toBe(false);
    }
  });
  it('keeps external accounts operational-only while enabling coordinator team management', () => {
    const external = portalNavigationForRole('/app', 'worker', 'external_technician');
    const coordinator = portalNavigationForRole('/app', 'worker', 'supplier_coordinator');
    expect(JSON.stringify(external)).not.toContain('My Pay');
    expect(JSON.stringify(external)).toContain('expenses');
    expect(JSON.stringify(external)).not.toContain('Finance Overview');
    expect(JSON.stringify(coordinator)).toContain('/supplier');
    expect(JSON.stringify(coordinator)).not.toContain('My Pay');
    expect(external.primary.map((item) => item.section)).toContain('workflow');
    expect(coordinator.primary.map((item) => item.section)).not.toContain('workflow');
    expect(JSON.stringify(portalNavigationForRole('/app', 'worker'))).toContain('My Pay');
  });
  it('preserves whole-minute precision using decimal hours without a minute column', () => {
    expect(supplierHoursFromMinutes(1)).toBe('0.0167');
    expect(supplierHoursFromMinutes(7)).toBe('0.1167');
    expect(supplierHoursFromMinutes(450)).toBe('7.50');
    for (let minutes = 0; minutes <= 1440; minutes += 1)
      expect(Math.round(Number(supplierHoursFromMinutes(minutes)) * 60)).toBe(minutes);
    expect(supplierHoursFromMinutes(null)).toBe('');
  });

  it('exports quoted UTF-8 CSV and neutralizes formulas without dropping work descriptions', () => {
    for (const value of ['=HYPERLINK("https://example.invalid")', ' +cmd', '\t@SUM(A1)', '-1'])
      expect(supplierCsvCell(value)).toMatch(/^"'/);
    expect(supplierCsvCell('Instalação, "A"\nline 2')).toBe('"Instalação, ""A""\nline 2"');
    expect(
      supplierCsv([
        ['Técnico', 'Minutos'],
        ['José', 60],
      ]),
    ).toBe('\uFEFF"Técnico","Minutos"\r\n"José","60"\r\n');
    expect(supplierHoursFromMinutes(75)).toBe('1.25');
    expect(supplierHoursFromMinutes(30)).toBe('0.50');
    expect(supplierHoursFromMinutes(-1)).toBe('');
  });
});
