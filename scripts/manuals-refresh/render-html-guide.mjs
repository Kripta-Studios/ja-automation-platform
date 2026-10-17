import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { launchManualChromium } from './chromium.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const docs = join(root, 'docs/manuals');
const name = process.argv[2];
if (!name || !/^[A-Za-z0-9_-]+$/u.test(name)) {
  throw new Error('Usage: node scripts/manuals-refresh/render-html-guide.mjs <guide-name>');
}

const htmlPath = join(docs, `${name}.html`);
const pdfPath = join(docs, `${name}.pdf`);
const browser = await launchManualChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(pathToFileURL(resolve(htmlPath)).href, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  const images = await page.evaluate(async () => {
    await Promise.all([...document.images].map((image) => image.decode()));
    return [...document.images]
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.src);
  });
  if (images.length) throw new Error(`Unreadable images in ${name}: ${images.join(', ')}`);
  await page.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true, outline: true });
  const [pdf, metadata] = await Promise.all([readFile(pdfPath), stat(pdfPath)]);
  const declaredPages = await page.locator('.page').count();
  console.log(
    JSON.stringify({
      source: `docs/manuals/${name}.html`,
      output: `docs/manuals/${name}.pdf`,
      declaredPages,
      bytes: metadata.size,
      sha256: createHash('sha256').update(pdf).digest('hex'),
      missingImages: 0,
    }),
  );
  await page.close();
} finally {
  await browser.close();
}
