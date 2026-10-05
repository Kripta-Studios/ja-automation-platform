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
  [
    'worker',
    undefined,
    ['bbs-worker-manual', 'bbs-chief-manual', 'employee-field-guide', 'work-projects-reference'],
  ],
  ['project_manager', undefined, ['bbs-manager-manual', 'work-projects-reference']],
  [
    'finance_admin',
    undefined,
    ['bbs-finance-manual', 'bbs-project-invoices-guide', 'administration-finance-reference'],
  ],
  ['auditor_read_only', undefined, ['bbs-auditor-manual', 'administration-finance-reference']],
  [
    'worker',
    'supplier_coordinator',
    ['bbs-supplier-coordinator-manual', 'supplier-operations-reference'],
  ],
  [
    'worker',
    'external_technician',
    ['bbs-external-technician-manual', 'supplier-operations-reference'],
  ],
] as const;

describe('Help manual catalog', () => {
  it('keeps seven personas, historical references and current BBS role courses', () => {
    expect(manualRevision).toBe('2026-09-22');
    expect(manualPersonas).toHaveLength(7);
    expect(manualAudiences).toEqual([
      'work-projects',
      'supplier-operations',
      'administration-finance',
    ]);
    expect(manualCatalog.map((manual) => manual.id)).toEqual([
      'employee-field-guide',
      ...references,
      'bbs-project-invoices-guide',
      'bbs-worker-manual',
      'bbs-chief-manual',
      'bbs-manager-manual',
      'bbs-finance-manual',
      'bbs-owner-manual',
      'bbs-auditor-manual',
      'bbs-supplier-coordinator-manual',
      'bbs-external-technician-manual',
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
      'bbs-owner-manual',
      'bbs-finance-manual',
      'bbs-auditor-manual',
      'bbs-worker-manual',
      'bbs-chief-manual',
      'bbs-manager-manual',
      'bbs-supplier-coordinator-manual',
      'bbs-external-technician-manual',
      'bbs-project-invoices-guide',
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

  it('allows the English BBS guide only for owner and Finance', async () => {
    const guide = manualForRole('bbs-project-invoices-guide', 'owner_admin');
    expect(guide?.locales).toEqual(['en']);
    expect(guide?.audience).toBe('administration-finance');
    expect(guide?.revision).toBe('2026-10-05');
    expect(guide?.description.en).toContain('final training invoices');
    expect(guide?.description.en).not.toContain('23-page');
    expect(manualForRole('bbs-project-invoices-guide', 'finance_admin')).toBeTruthy();
    for (const role of ['worker', 'project_manager', 'auditor_read_only'])
      expect(manualForRole('bbs-project-invoices-guide', role)).toBeNull();
    expect((await readManualPdf(guide!, 'en')).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('keeps current role PDFs within their persisted persona boundary', async () => {
    for (const [role, profile, ids] of roleMatrix) {
      for (const guide of manualCatalog.filter((item) => item.revision === '2026-10-06')) {
        const allowed = (ids as readonly string[]).includes(guide.id);
        expect(Boolean(manualForRole(guide.id, role, profile))).toBe(allowed);
        if (allowed) {
          expect(guide.locales).toEqual(['en']);
          expect((await readManualPdf(guide, 'en')).subarray(0, 5).toString()).toBe('%PDF-');
        }
      }
    }
    // A delegation guide is instructional; reading it never grants delegation.
    expect(manualForRole('bbs-chief-manual', 'worker')).toBeTruthy();
    expect(manualForRole('bbs-finance-manual', 'worker')).toBeNull();
    expect(manualForRole('bbs-worker-manual', 'worker', 'external_technician')).toBeNull();
    expect(
      manualForRole('bbs-supplier-coordinator-manual', 'worker', 'external_technician'),
    ).toBeNull();
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
