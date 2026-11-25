import { describe, expect, it } from 'vitest';
import { urlWithoutFormAction } from '../../apps/portal/src/lib/portal/ui/action-url';

describe('urlWithoutFormAction', () => {
  it('drops the raw action key a non-enhanced POST leaves in the address bar', () => {
    const url = new URL(
      'http://x/j-aautomation/app/supplier?/submitTime&projectId=p1&from=2026-11-01&workspaceAction=report#supplier-report',
    );
    const clean = urlWithoutFormAction(url);
    expect(clean?.pathname).toBe('/j-aautomation/app/supplier');
    expect(clean?.search).toBe('?projectId=p1&from=2026-11-01&workspaceAction=report');
    expect(clean?.hash).toBe('#supplier-report');
  });

  it('drops the re-encoded form a later searchParams rewrite produces', () => {
    const clean = urlWithoutFormAction(
      new URL('http://x/app/billing?%2FcreateInvoiceAdjustment=&invoice=inv-1'),
    );
    expect(clean?.search).toBe('?invoice=inv-1');
  });

  it('leaves ordinary URLs alone', () => {
    expect(urlWithoutFormAction(new URL('http://x/app/time?week=2026-11-16&lang=es'))).toBeNull();
    expect(urlWithoutFormAction(new URL('http://x/app/reports?q=%2Fpath'))).toBeNull();
  });
});
