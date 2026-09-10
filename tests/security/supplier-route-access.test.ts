import { describe, expect, it } from 'vitest';
import { supplierRouteAllowed } from '../../apps/portal/src/lib/server/supplier-route-access';
import { supplierCsvCell, supplierCsv } from '../../apps/portal/src/lib/server/supplier-csv';
import { portalNavigationForRole } from '../../apps/portal/src/lib/portal-navigation';

describe('supplier operational surface', () => {
  it.each([
    '/pay',
    '/my-pay',
    '/expenses',
    '/documents',
    '/notifications',
    '/finance',
    '/reports/period',
    '/reports/period/other',
    '/reports/review',
    '/api/worker-statement',
    '/api/reports/other/pdf',
    '/api/documents/other/download',
    '/my-pay/__data.json',
    '/supplier/admin',
    '/api/offline/sync',
  ])('denies financial and unapproved surface %s', (path) => {
    expect(supplierRouteAllowed(path)).toBe(false);
  });
  it.each([
    '/time',
    '/time/own-id',
    '/help/employee-field-guide/download',
    '/help/worker-reference/download',
    '/reports/own-id',
    '/supplier',
    '/supplier/report',
    '/supplier/report.csv',
    '/time/__data.json',
    '/api/localized-pdf',
    '/api/reports/own-id/attachments',
    '/profile',
    '/service-worker.js',
    '/manifest.webmanifest',
    '/icon-192.png',
    '/icon-512.png',
  ])('permits operational route with downstream object authorization %s', (path) => {
    expect(supplierRouteAllowed(path)).toBe(true);
  });
  it('removes financial navigation for external technicians and enables coordinator team management', () => {
    const external = JSON.stringify(
      portalNavigationForRole('/app', 'worker', 'external_technician'),
    );
    const coordinator = JSON.stringify(
      portalNavigationForRole('/app', 'worker', 'supplier_coordinator'),
    );
    expect(external).not.toContain('My Pay');
    expect(external).not.toContain('expenses');
    expect(coordinator).toContain('/supplier');
    expect(JSON.stringify(portalNavigationForRole('/app', 'worker'))).toContain('My Pay');
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
  });
});
