import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { projects } from '../website/content/projects';

type Messages = Record<string, unknown>;

const locales = ['en', 'es', 'pt'] as const;

function loadMessages(locale: (typeof locales)[number]): Messages {
  return JSON.parse(
    readFileSync(new URL(`../website/content/locales/${locale}.json`, import.meta.url), 'utf8'),
  ) as Messages;
}

function leafPaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('public website localization catalogs', () => {
  it('keeps the three catalogs structurally identical', () => {
    const paths = locales.map((locale) => new Set(leafPaths(loadMessages(locale))));

    for (const catalog of paths.slice(1)) {
      expect([...catalog].sort()).toEqual([...paths[0]].sort());
    }
  });

  it('contains translated content for every project record', () => {
    for (const locale of locales) {
      const catalog = loadMessages(locale);
      const projectCatalog = catalog.projectCatalog as Record<string, Record<string, string>>;

      expect(Object.keys(projectCatalog)).toHaveLength(projects.length);

      for (const project of projects) {
        const copy = projectCatalog[project.id];
        expect(copy?.title, `${locale}:${project.id} title`).toBeTruthy();
        expect(copy?.scope, `${locale}:${project.id} scope`).toBeTruthy();
        expect(copy?.displayDate, `${locale}:${project.id} date`).toBeTruthy();
      }
    }
  });

  it('exposes Brazilian Portuguese selector labels', () => {
    const portuguese = loadMessages('pt');
    const nav = portuguese.nav as Record<string, unknown>;

    expect((nav.languageLabels as Record<string, string>).pt).toBe('PT-BR');
    expect((nav.languageNames as Record<string, string>).pt).toBe('português do Brasil');
  });
});
