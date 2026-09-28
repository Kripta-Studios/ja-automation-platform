import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { projects } from '../../website/content/projects';

const read = (path: string): string =>
  readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const locales = ['en', 'es', 'pt'] as const;

describe('ASTRA Aquarex website packet', () => {
  it('wires the localized form to durable Aquarex intake with truthful queued states', () => {
    const page = read('website/app/[locale]/solutions/aquarex/page.tsx');
    const form = read('website/components/aquarex/AquarexDatasheetForm.tsx');

    expect(page).toContain('AquarexDatasheetForm');
    expect(form).toContain("publicApiPath('api/public/aquarex')");
    expect(form).toContain("'Idempotency-Key'");
    expect(form).toContain("status === 'submitting'");
    expect(form).toContain("setStatus('queued')");
    expect(form).toContain("page('queuedStatus')");
    expect(form).toContain('name="firstName"');
    expect(form).toContain('name="lastName"');
    expect(form).toContain('name="email"');
    expect(form).toContain('name="company"');
    expect(form).toContain('name="site"');
    expect(form).toContain("setErrorMessage(page('errorBody'))");
  });

  it('keeps localized copy structurally aligned and removes unsupported Aquarex precision', () => {
    const catalogs = locales.map(
      (locale) =>
        JSON.parse(read(`website/content/locales/${locale}.json`)) as Record<string, unknown>,
    );
    const aquarexKeys = locales.map((_, index) =>
      Object.keys(catalogs[index].aquarex as Record<string, unknown>).sort(),
    );
    for (const keys of aquarexKeys.slice(1)) expect(keys).toEqual(aquarexKeys[0]);

    for (const catalog of catalogs) {
      const copy = catalog.aquarex as Record<string, string>;
      expect(copy.queuedStatus).toMatch(/queued|cola|fila/i);
      expect(copy.datasheetBody).toMatch(/automatically|automáticamente|automaticamente/i);
      const serialized = JSON.stringify(copy);
      expect(serialized).not.toMatch(
        /40%|ISA\s*18\.2|reverse osmosis|ósmosis inversa|osmose reversa|ultrafiltration|ultrafiltración|ultrafiltração/i,
      );
    }

    const fispal = projects.find((project) => project.id === 'fispal-tecnologia-showcase-2026');
    expect(fispal?.kind).toBe('event');
    expect(fispal?.technologies).not.toContain('Aquarex RO Controls');
  });

  it('records the complete recent source register and approval gaps', () => {
    const provenance = read('website/docs/content-provenance.md');
    const recent = projects.filter((project) => project.source === 'new-ja-data');
    expect(recent).toHaveLength(9);
    for (const project of recent) expect(provenance).toContain(project.id);
    expect(provenance).toContain('Source URL/document');
    expect(provenance).toContain('Current EN/ES/PT wording');
    expect(provenance).toContain('Image-rights evidence');
    expect(provenance).toContain('Event participation and wording approval not attached');
    expect(provenance).toContain('Named approver and approval date not recorded');
    expect(provenance).toContain('no `1,000+ projects completed` wording retained');
  });
});
