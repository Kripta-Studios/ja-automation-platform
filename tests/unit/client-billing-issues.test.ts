import { describe, expect, it } from 'vitest';
import {
  clientBillingIssueText,
  clientBillingIssues,
  isOwnDomainEmail,
} from '../../apps/portal/src/lib/portal/client-billing-issues';

describe('clientBillingIssues', () => {
  it('names exactly which client billing fields are missing', () => {
    const issues = clientBillingIssues({ billing_address: 'Main St 1', billing_email: '', tax_id: null });
    expect(issues).toEqual([{ code: 'missing_fields', fields: ['billingEmail', 'taxId'] }]);
    expect(clientBillingIssueText('en-US', issues[0]!)).toBe(
      'Client details missing: billing email and tax ID',
    );
    expect(clientBillingIssueText('es-ES', issues[0]!)).toContain('email de facturación y NIF');
  });

  it('accepts the camelCase invoice-screen shape and passes complete clients', () => {
    expect(
      clientBillingIssues({ billingAddress: 'A 1', billingEmail: 'ap@client.test', taxId: 'DE1' }),
    ).toEqual([]);
  });

  it('warns about a J&A billing email', () => {
    expect(isOwnDomainEmail('Field.Ops@J-AAutomation.com')).toBe(true);
    expect(isOwnDomainEmail('ap@client.test')).toBe(false);
    const issues = clientBillingIssues({
      billing_address: 'A 1',
      billing_email: 'field.operations@j-aautomation.com',
      tax_id: 'X',
    });
    expect(issues.map((issue) => issue.code)).toEqual(['own_domain_email']);
  });

  it('warns when the project PO is just the project name', () => {
    expect(clientBillingIssues(null, { name: 'BBS Mexico', po_number: 'bbs-mexico' })).toEqual([
      { code: 'po_equals_project_name', po: 'bbs-mexico' },
    ]);
    expect(clientBillingIssues(null, { name: 'BBS Mexico', po_number: 'PO-4500123' })).toEqual([]);
    expect(clientBillingIssues(null, { name: 'BBS Mexico', po_number: '' })).toEqual([]);
  });
});
