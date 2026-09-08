import { describe, expect, it } from 'vitest';
import { notificationTargetPath } from '../../apps/portal/src/lib/notifications/target.ts';

describe('authorized notification destinations', () => {
  it('keeps nested report and invoice destinations and rejects external or traversal links', () => {
    for (const path of [
      '/app/time/entry-1',
      '/app/reports/period/report-1',
      '/app/billing/invoices/invoice-1',
      '/app/pay',
    ])
      expect(notificationTargetPath(path)).toBe(path);
    for (const path of [
      null,
      'https://example.test',
      '//example.test',
      '/app/projects/../profile',
      '/app/projects/%2e%2e',
      '/app/projects\\evil',
      '/app/projects/entry?redirect=https://example.test',
      '/app/profile',
      '/app/projects/entry\n',
    ])
      expect(notificationTargetPath(path)).toBeNull();
  });
});
