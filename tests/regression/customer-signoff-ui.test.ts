import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pagePath = resolve(
  process.cwd(),
  'apps/portal/src/routes/app/reports/period/[id]/+page.svelte',
);

const readPage = (): string => readFileSync(pagePath, 'utf8');

describe('period report customer sign-off surface', () => {
  it('keeps client sign-off first-class with truthful lifecycle states and role-safe actions', () => {
    const source = readPage();

    expect(source).toContain('data-customer-signoff');
    expect(source).toContain("const customerAudience = $derived(audience === 'customer')");
    expect(source).toContain("t('Needs report')");
    expect(source).toContain("t('Ready for signature')");
    expect(source).toContain("t('Signed')");
    expect(source).toContain("t('Invalid / superseded')");
    expect(source).toContain('data-signoff-state={signoffState}');
    expect(source).toContain("data-report-lifecycle-state={String(report.state ?? '')}");
    expect(source).toContain('action="?/sign"');
    expect(source).toContain('action="?/invalidateSignoff"');
    expect(source).toContain("userRole === 'owner_admin' || userRole === 'finance_admin'");
    expect(source).toContain('reportReadyForSignoff');
    expect(source).toContain('hasActiveCustomerConformity');
    expect(source).toContain('name="signerName"');
    expect(source).toContain('name="signerIdentity"');
    expect(source).toContain('name="reason"');
    expect(source).toContain('Signed record is immutable');
    expect(source).not.toContain('signatureDocumentId');
    expect(source).not.toContain('signatureFile');
  });

  it('gates operational customer-report approval by audience, state, role and exact snapshot binding', () => {
    const source = readPage();
    const approvalGateStart = source.indexOf('const canApproveCustomerReport');
    const approvalGateEnd = source.indexOf('const reportReadyForSignoff', approvalGateStart);
    const approvalGate = source.slice(approvalGateStart, approvalGateEnd);
    expect(approvalGate).toContain('customerAudience');
    expect(approvalGate).toContain("String(report.state) === 'review'");
    expect(approvalGate).toContain(
      "['owner_admin', 'finance_admin', 'project_manager'].includes(userRole)",
    );
    expect(approvalGate).toContain('report.snapshotVersion');
    expect(approvalGate).toContain('report.snapshotSha256');
    expect(approvalGate).not.toContain("'worker'");
    expect(approvalGate).not.toContain("'auditor_read_only'");

    const approvalMarker = source.indexOf('data-period-report-approval');
    const approvalStart = source.lastIndexOf('<form', approvalMarker);
    const approvalEnd = source.indexOf('</form>', approvalStart);
    const approvalMarkup = source.slice(approvalStart, approvalEnd);
    expect(approvalMarkup).toContain('action="?/approve"');
    expect(approvalMarkup).toContain('name="expectedSnapshotVersion"');
    expect(approvalMarkup).toContain('value={report.snapshotVersion}');
    expect(approvalMarkup).toContain('name="expectedSnapshotSha256"');
    expect(approvalMarkup).toContain('value={report.snapshotSha256}');
    for (const forbidden of [
      'signerName',
      'signerIdentity',
      'clientRate',
      'internalCost',
      'tax',
      'margin',
      'billing',
      'money(',
    ]) {
      expect(approvalMarkup, `approval markup must not contain ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });

  it('keeps the customer branch free of monetary and internal financial rendering', () => {
    const source = readPage();
    const customerStart = source.indexOf('{#if customerAudience}');
    const internalStart = source.indexOf('{#if internal}', customerStart);
    expect(customerStart).toBeGreaterThanOrEqual(0);
    expect(internalStart).toBeGreaterThan(customerStart);

    const customerBranch = source.slice(customerStart, internalStart);
    for (const forbidden of [
      'money(',
      'commercialSummary',
      'financialSummary',
      'contribution',
      'margin',
      'clientRate',
      'internalCost',
      'workerCompensation',
    ]) {
      expect(customerBranch, `customer branch must not contain ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });

  it('uses accessible responsive actions without decorative all-property transitions', () => {
    const source = readPage();
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('aria-describedby="customer-signoff-signer-help"');
    expect(source).toContain('required');
    expect(source).toContain('min-height: 2.75rem');
    expect(source).toContain('@media (max-width: 760px)');
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
    expect(source).not.toMatch(/transition\s*:\s*all/);
  });
});
