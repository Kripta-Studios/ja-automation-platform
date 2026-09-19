import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  manualAliases,
  manualAudiences,
  manualCatalog,
  manualForRole,
  manualPersonas,
  manualRevision,
  manualsForRole,
  normalizeManualLocale,
  personaForRole,
  readManualPdf,
} from '../../apps/portal/src/lib/server/manual-catalog.ts';

const references = [
  'work-projects-reference',
  'supplier-operations-reference',
  'administration-finance-reference',
] as const;
const roleMatrix = [
  ['worker', undefined, ['employee-field-guide', 'work-projects-reference']],
  ['project_manager', undefined, ['work-projects-reference']],
  ['finance_admin', undefined, ['administration-finance-reference']],
  ['auditor_read_only', undefined, ['administration-finance-reference']],
  ['worker', 'supplier_coordinator', ['supplier-operations-reference']],
  ['worker', 'external_technician', ['supplier-operations-reference']],
] as const;

describe('Help manual catalog', () => {
  it('keeps seven personas but publishes three shared references with exact EN/PT-BR assets', () => {
    expect(manualRevision).toBe('2026-09-19');
    expect(manualPersonas).toHaveLength(7);
    expect(manualAudiences).toEqual([
      'work-projects',
      'supplier-operations',
      'administration-finance',
    ]);
    expect(manualCatalog.map((manual) => manual.id)).toEqual([
      'employee-field-guide',
      ...references,
    ]);
    expect(manualCatalog[0]?.locales).toEqual(['en', 'es', 'pt']);
    for (const [id, audience, stem, personas] of [
      ['work-projects-reference', 'work-projects', 'Work_Projects_Guide', ['worker', 'manager']],
      [
        'supplier-operations-reference',
        'supplier-operations',
        'Supplier_Operations_Guide',
        ['supplier-coordinator', 'external-technician'],
      ],
      [
        'administration-finance-reference',
        'administration-finance',
        'Administration_Finance_Guide',
        ['owner', 'finance', 'auditor'],
      ],
    ] as const) {
      const manual = manualCatalog.find((item) => item.id === id);
      expect(manual?.audience).toBe(audience);
      expect(manual?.allowedPersonas).toEqual(personas);
      expect(manual?.locales).toEqual(['en', 'pt']);
      expect(manual?.assets).toEqual({
        en: { sourceName: `${stem}.pdf` },
        pt: { sourceName: `${stem}_PT-BR.pdf` },
      });
    }
    expect(normalizeManualLocale('pt_BR')).toBe('pt');
    expect(normalizeManualLocale('ES-es')).toBe('es');
    expect(normalizeManualLocale('fr')).toBeNull();
  });

  it('lists one canonical group per member and checks aliases against that same group', () => {
    for (const [role, profile, ids] of roleMatrix) {
      expect(manualsForRole(role, profile).map((manual) => manual.id)).toEqual(ids);
      for (const id of references)
        expect(Boolean(manualForRole(id, role, profile))).toBe(
          (ids as readonly string[]).includes(id),
        );
      for (const [alias, canonical] of Object.entries(manualAliases))
        expect(manualForRole(alias, role, profile)?.id ?? null).toBe(
          (ids as readonly string[]).includes(canonical) ? canonical : null,
        );
      expect(personaForRole(role, profile)).toBeTruthy();
    }
    expect(manualsForRole('owner_admin').map((manual) => manual.id)).toEqual([
      'administration-finance-reference',
      'work-projects-reference',
      'supplier-operations-reference',
    ]);
    for (const [alias, canonical] of Object.entries(manualAliases))
      expect(manualForRole(alias, 'owner_admin')?.id).toBe(canonical);
    expect(manualForRole('employee-field-guide', 'owner_admin')).toBeNull();
    expect(manualsForRole('unknown')).toEqual([]);
    expect(manualForRole('does-not-exist', 'worker')).toBeNull();
  });

  it('reads allowlisted PDFs from the portal working directory', async () => {
    const cwd = process.cwd();
    const configured = process.env.JA_MANUAL_ROOT;
    delete process.env.JA_MANUAL_ROOT;
    process.chdir(join(cwd, 'apps/portal'));
    try {
      for (const id of references) {
        const manual = manualForRole(id, 'owner_admin');
        if (!manual) throw new Error(`Missing guide ${id}`);
        const [english, portuguese] = await Promise.all([
          readManualPdf(manual, 'en'),
          readManualPdf(manual, 'pt'),
        ]);
        expect(english.subarray(0, 5).toString('ascii')).toBe('%PDF-');
        expect(portuguese.subarray(0, 5).toString('ascii')).toBe('%PDF-');
        expect(english.equals(portuguese)).toBe(false);
      }
    } finally {
      process.chdir(cwd);
      if (configured === undefined) delete process.env.JA_MANUAL_ROOT;
      else process.env.JA_MANUAL_ROOT = configured;
    }
  });
});
