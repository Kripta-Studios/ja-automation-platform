import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  manualForRole,
  manualRevision,
  manualsForRole,
  normalizeManualLocale,
  readManualPdf,
} from '../../apps/portal/src/lib/server/manual-catalog.ts';

describe('ASTRA Help manual catalog', () => {
  it('keeps the revision and locale aliases deterministic', () => {
    expect(manualRevision).toBe('2026-09-10');
    expect(normalizeManualLocale(undefined)).toBe('en');
    expect(normalizeManualLocale('ES-es')).toBe('es');
    expect(normalizeManualLocale('pt_BR')).toBe('pt');
    expect(normalizeManualLocale('fr')).toBeNull();
  });

  it('gives every known authenticated role the worker guides but protects the owner reference', () => {
    for (const role of [
      'worker',
      'project_manager',
      'finance_admin',
      'owner_admin',
      'auditor_read_only',
    ]) {
      expect(manualsForRole(role).map((manual) => manual.id)).toEqual(
        role === 'finance_admin' || role === 'owner_admin'
          ? ['employee-field-guide', 'worker-reference', 'owner-reference']
          : ['employee-field-guide', 'worker-reference'],
      );
    }
    expect(manualsForRole('worker').map((manual) => [manual.id, manual.revision])).toEqual([
      ['employee-field-guide', '2026-09-10'],
      ['worker-reference', '2026-09-10'],
    ]);
    expect(manualsForRole('owner_admin').map((manual) => [manual.id, manual.revision])).toEqual([
      ['employee-field-guide', '2026-09-10'],
      ['worker-reference', '2026-09-10'],
      ['owner-reference', '2026-09-10'],
    ]);
    expect(manualsForRole('unknown')).toEqual([]);
    expect(manualForRole('owner-reference', 'worker')).toBeNull();
    expect(manualForRole('owner-reference', 'auditor_read_only')).toBeNull();
    expect(manualForRole('owner-reference', 'finance_admin')).toMatchObject({
      audience: 'owner',
      locales: ['en', 'pt'],
    });
  });

  it('reads the allowlisted localized PDF rather than a caller-supplied path', async () => {
    const manual = manualForRole('employee-field-guide', 'worker');
    if (!manual) throw new Error('worker quick guide is missing');
    const bytes = await readManualPdf(manual, 'es');
    expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(100_000);
  });

  it.each(['worker-reference', 'owner-reference'])(
    'serves the distinct Brazilian Portuguese %s PDF',
    async (id) => {
      const manual = manualForRole(id, 'owner_admin');
      if (!manual) throw new Error('Detailed reference is missing');
      expect(manual.locales).toContain('pt');
      expect(manual.assets.pt?.sourceName).toMatch(/_PT-BR\.pdf$/);
      const [english, portuguese] = await Promise.all([
        readManualPdf(manual, 'en'),
        readManualPdf(manual, 'pt'),
      ]);
      expect(portuguese.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(portuguese.equals(english)).toBe(false);
    },
  );

  it('resolves checked-in manuals when the portal starts from its package directory', async () => {
    const originalCwd = process.cwd();
    const configuredRoot = process.env.JA_MANUAL_ROOT;
    delete process.env.JA_MANUAL_ROOT;
    process.chdir(join(originalCwd, 'apps/portal'));
    try {
      const manual = manualForRole('employee-field-guide', 'worker');
      if (!manual) throw new Error('worker quick guide is missing');
      const bytes = await readManualPdf(manual, 'en');
      expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    } finally {
      process.chdir(originalCwd);
      if (configuredRoot === undefined) delete process.env.JA_MANUAL_ROOT;
      else process.env.JA_MANUAL_ROOT = configuredRoot;
    }
  });
});
