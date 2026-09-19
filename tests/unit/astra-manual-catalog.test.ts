import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
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
  'worker-reference',
  'project-manager-reference',
  'finance-reference',
  'owner-reference',
  'auditor-reference',
  'supplier-coordinator-reference',
  'external-technician-reference',
];

describe('Help manual catalog', () => {
  it('uses seven distinct operational personas and current EN/PT-BR assets', () => {
    expect(manualRevision).toBe('2026-09-19');
    expect(manualPersonas).toHaveLength(7);
    for (const id of references) {
      const manual = manualCatalog.find((item) => item.id === id);
      expect(manual?.locales).toEqual(['en', 'pt']);
      expect(manual?.assets.en?.sourceName).toMatch(/\.pdf$/u);
      expect(manual?.assets.pt?.sourceName).toMatch(/_PT-BR\.pdf$/u);
      expect(manual?.assets.en?.sourceName).not.toBe(manual?.assets.pt?.sourceName);
    }
    expect(normalizeManualLocale('pt_BR')).toBe('pt');
    expect(normalizeManualLocale('ES-es')).toBe('es');
    expect(normalizeManualLocale('fr')).toBeNull();
  });

  it('assigns the right guide and does not leak Worker/My Pay or Owner-only instructions', () => {
    const matrix = [
      ['worker', undefined, ['employee-field-guide', 'worker-reference']],
      ['project_manager', undefined, ['project-manager-reference']],
      ['finance_admin', undefined, ['finance-reference']],
      ['auditor_read_only', undefined, ['auditor-reference']],
      ['worker', 'supplier_coordinator', ['supplier-coordinator-reference']],
      ['worker', 'external_technician', ['external-technician-reference']],
    ] as const;
    for (const [role, profile, ids] of matrix) {
      expect(manualsForRole(role, profile).map((manual) => manual.id)).toEqual(ids);
      for (const id of references)
        expect(Boolean(manualForRole(id, role, profile))).toBe(
          (ids as readonly string[]).includes(id),
        );
      expect(personaForRole(role, profile)).toBeTruthy();
    }
    expect(manualsForRole('owner_admin').map((manual) => manual.id)).toEqual([
      'owner-reference',
      'worker-reference',
      'project-manager-reference',
      'finance-reference',
      'auditor-reference',
      'supplier-coordinator-reference',
      'external-technician-reference',
    ]);
    expect(manualForRole('employee-field-guide', 'owner_admin')).toBeNull();
    expect(manualsForRole('unknown')).toEqual([]);
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
