import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { industries } from '../website/content/industries';
import { projects } from '../website/content/projects';
import { services } from '../website/content/services';

type Messages = Record<string, unknown>;

const websiteRoot = fileURLToPath(new URL('../website/', import.meta.url));

const locales = ['en', 'es', 'pt'] as const;

function loadMessages(locale: (typeof locales)[number]): Messages {
  return JSON.parse(
    readFileSync(new URL(`../website/content/locales/${locale}.json`, import.meta.url), 'utf8'),
  ) as Messages;
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
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

  it('keeps the published industry, capability and project graph linked', () => {
    const industryIds = new Set(industries.map((industry) => industry.id));
    const capabilityIds = new Set(services.map((service) => service.id));

    expect(new Set(industries.map((industry) => industry.slug)).size).toBe(industries.length);
    expect(new Set(services.map((service) => service.slug)).size).toBe(services.length);
    expect(new Set(projects.map((project) => project.slug)).size).toBe(projects.length);

    for (const project of projects) {
      expect(industryIds.has(project.industry), `${project.id} industry`).toBe(true);
      for (const capability of project.capabilities) {
        expect(capabilityIds.has(capability), `${project.id} capability ${capability}`).toBe(true);
      }
    }

    expect(industries.find((industry) => industry.id === 'warehouse-logistics')).toMatchObject({
      slug: 'warehouse-logistics',
      imageKey: 'warehouseLogistics',
    });
    expect(services.find((service) => service.id === 'installation')).toMatchObject({
      slug: 'electromechanical-installation',
      icon: 'Wrench',
    });
    expect(projects.filter((project) => project.industry === 'warehouse-logistics')).toHaveLength(
      3,
    );
    expect(
      projects.filter((project) => project.capabilities.includes('installation')),
    ).toHaveLength(3);
  });

  it('keeps the approved logistics assets in the optimizer manifest without enlargement', async () => {
    const optimizer = readFileSync(
      fileURLToPath(new URL('../scripts/optimize-website-images.mjs', import.meta.url)),
      'utf8',
    );
    expect(optimizer).toContain("'images/industries/warehouse-logistics'");
    expect(optimizer).toContain("'amazon'");
    expect(optimizer).toContain("'mercado-libre'");
    expect(optimizer).toContain("'shopee'");
    expect(optimizer).toContain('withoutEnlargement: true');

    const pairs = [
      [
        'public/images/industries/warehouse-logistics.jpg',
        'public/images/industries/warehouse-logistics.webp',
      ],
      ['public/brand/clients/amazon.png', 'public/brand/clients/amazon.webp'],
      ['public/brand/clients/mercado-libre.png', 'public/brand/clients/mercado-libre.webp'],
      ['public/brand/clients/shopee.png', 'public/brand/clients/shopee.webp'],
    ] as const;

    for (const [source, target] of pairs) {
      const sourcePath = `${websiteRoot}${source}`;
      const targetPath = `${websiteRoot}${target}`;
      expect(existsSync(sourcePath), source).toBe(true);
      expect(existsSync(targetPath), target).toBe(true);
      const [sourceMetadata, targetMetadata] = await Promise.all([
        sharp(sourcePath).metadata(),
        sharp(targetPath).metadata(),
      ]);
      expect(targetMetadata.format, target).toBe('webp');
      expect(targetMetadata.width, target).toBeLessThanOrEqual(sourceMetadata.width ?? 0);
      expect(targetMetadata.height, target).toBeLessThanOrEqual(sourceMetadata.height ?? 0);
    }
  });

  it('pins approved logistics asset bytes to the provenance record', async () => {
    const provenance = readFileSync(
      fileURLToPath(new URL('../website/docs/content-provenance.md', import.meta.url)),
      'utf8',
    );
    const assets = [
      {
        source: 'public/brand/clients/amazon.png',
        target: 'public/brand/clients/amazon.webp',
        sourceHash: 'f2fc212a44188f7e0e2cd2a55d839bc396b4020171f0c6eac7eac954ef1c3a7e',
        targetHash: 'bc4e3e898554152f634659431629a813159cc69d5bb6b66ea196ad20d441ffa4',
      },
      {
        source: 'public/brand/clients/mercado-libre.png',
        target: 'public/brand/clients/mercado-libre.webp',
        sourceHash: 'c998ce722147ae8c047b70db428db959b6f868b49a42a6725399b4f4fd9791ef',
        targetHash: 'c7350168b210d38c988491aba99819341bf8103fc11b63f9cb3bd863ae6e983f',
      },
      {
        source: 'public/brand/clients/shopee.png',
        target: 'public/brand/clients/shopee.webp',
        sourceHash: 'f808241761847a7a85fc4cc7848f91a7dd903b68fca88cd3ec707e90ac03b7d8',
        targetHash: '96065ef4049b3bafc4ff2e2537b4ff080565f05bd0557498e6d1a73855497839',
      },
      {
        source: 'public/images/industries/warehouse-logistics.jpg',
        target: 'public/images/industries/warehouse-logistics.webp',
        sourceHash: 'c0566ab1e8947602ac8d4fbda6a7efdb9b2660167eda66c955291f3a7dfe5714',
        targetHash: 'f9dab02954520d68e300727d15b25260a763e81d4227d2f2843e64b8d0915195',
      },
    ] as const;

    for (const asset of assets) {
      const sourcePath = `${websiteRoot}${asset.source}`;
      const targetPath = `${websiteRoot}${asset.target}`;
      expect(sha256(sourcePath), `${asset.source} SHA-256`).toBe(asset.sourceHash);
      expect(sha256(targetPath), `${asset.target} SHA-256`).toBe(asset.targetHash);
      expect(provenance).toContain(asset.sourceHash);
      expect(provenance).toContain(asset.targetHash);
    }

    for (const logo of assets.slice(0, 3)) {
      for (const path of [logo.source, logo.target]) {
        const raw = await sharp(`${websiteRoot}${path}`).ensureAlpha().raw().toBuffer();
        expect(
          raw.some((value, index) => index % 4 === 3 && value === 0),
          `${path} transparency`,
        ).toBe(true);
      }
    }
  });

  it('contains localized labels for the new logistics routes and contact choices', () => {
    for (const locale of locales) {
      const catalog = loadMessages(locale);
      const capabilities = catalog.capabilities as Record<string, unknown>;
      const projectFilters = catalog.projectFilters as Record<string, unknown>;
      const serviceOptions = catalog.serviceOptions as Record<string, unknown>;
      const contact = catalog.contact as Record<string, unknown>;

      expect(capabilities.installation, `${locale}: installation capability`).toBeTruthy();
      expect(projectFilters.installation, `${locale}: installation filter`).toBeTruthy();
      expect(projectFilters.warehouseLogistics, `${locale}: logistics filter`).toBeTruthy();
      expect(serviceOptions.installation, `${locale}: installation service option`).toBeTruthy();
      expect(
        contact.industryWarehouseLogistics,
        `${locale}: logistics contact option`,
      ).toBeTruthy();
    }
  });
});
