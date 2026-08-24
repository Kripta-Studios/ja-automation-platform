import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const websiteRoot = fileURLToPath(new URL('../website/', import.meta.url));

const assets = [
  ...[
    'images/hero/hero-robotics',
    'images/hero/hero-food-beverage',
    'images/hero/hero-energy-process',
    'images/industries/automotive-body-shop',
    'images/industries/cosmetics-filling',
    'images/industries/robotics-cell-square',
    'images/capabilities/assembly-engines',
  ].map((basename) => ({
    source: `public/${basename}.jpg`,
    target: `public/${basename}.webp`,
    options: { width: 1920, quality: 82 },
  })),
  {
    source: 'public/brand/logo-jaautomation.png',
    target: 'public/brand/logo-jaautomation.webp',
    options: { width: 640, height: 640, fit: 'inside', quality: 90 },
  },
  ...[
    'ambev',
    'avon',
    'bmw',
    'campari',
    'coca-cola',
    'ford',
    'grupo-boticario',
    'heineken',
    'mercedes-benz',
    'petrobras',
    'sc-johnson',
    'unilever',
  ].map((name) => ({
    source: `public/brand/clients/${name}.png`,
    target: `public/brand/clients/${name}.webp`,
    options: { width: 640, height: 640, fit: 'inside', quality: 86 },
  })),
  {
    source: 'public/brand/lines.png',
    target: 'public/brand/lines.webp',
    options: { quality: 100 },
  },
];

for (const asset of assets) {
  const sourcePath = `${websiteRoot}${asset.source}`;
  const targetPath = `${websiteRoot}${asset.target}`;
  const pipeline = sharp(sourcePath);
  if (asset.options.width || asset.options.height) {
    pipeline.resize(asset.options);
  }
  const result = await pipeline
    .webp({ quality: asset.options.quality, effort: 6 })
    .toFile(targetPath);

  console.log(
    `${asset.source} -> ${asset.target}: ${result.width}x${result.height}, ${result.size} bytes`,
  );
}
