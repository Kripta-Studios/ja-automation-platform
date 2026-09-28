import { describe, expect, it } from 'vitest';
import { reportGuidanceFor } from '../../apps/portal/src/lib/portal/report-guidance';

describe('reportGuidanceFor', () => {
  it.each(['en', 'es', 'pt'] as const)(
    'keeps customer and internal audiences distinct in %s',
    (locale) => {
      const finance = reportGuidanceFor(locale, 'finance_admin');
      expect(finance.audiences).toMatch(/customer|cliente/u);
      expect(finance.audiences).toMatch(/internal|interno/u);
    },
  );

  it('gives workers only their own compensation route', () => {
    const worker = reportGuidanceFor('en', 'worker');
    expect(worker.audiences).toContain('your own compensation');
    expect(worker.audiences).toContain('My Pay');
  });

  it.each(
    (['supplier_coordinator', 'external_technician'] as const).flatMap((profile) =>
      (['en', 'es', 'pt'] as const).map((locale) => ({ locale, profile })),
    ),
  )('does not direct a restricted $profile profile to My Pay in $locale', ({ locale, profile }) => {
    const worker = reportGuidanceFor(locale, 'worker', profile);
    expect(worker.audiences).not.toMatch(/My Pay|Mi pago|Meu pagamento/u);
  });

  it('separates a project manager own pay from other workers compensation', () => {
    const manager = reportGuidanceFor('en', 'project_manager');
    expect(manager.audiences).toContain('Other workers’ compensation stays restricted');
    expect(manager.audiences).toContain('your own compensation');
    expect(manager.audiences).toContain('My Pay');
  });

  it('uses read-only guidance for auditors and a safe worker fallback', () => {
    expect(reportGuidanceFor('en', 'auditor_read_only').title).toBe('Read-only audit view');
    expect(reportGuidanceFor('en', 'unknown').title).toBe('Your report workflow');
  });
});
