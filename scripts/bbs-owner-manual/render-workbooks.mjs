import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const directory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../docs/manuals/bbs-illustrated-en-v2',
);
const manifest = JSON.parse(readFileSync(join(directory, 'workbook-previews.json')));
const browser = await chromium.launch({
  headless: true,
  args: process.getuid?.() === 0 ? ['--no-sandbox'] : [],
});
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  await page.goto(pathToFileURL(join(directory, 'workbook-previews.html')).href);
  for (const view of manifest.views)
    await page
      .locator(`[id="${view.key}"]`)
      .screenshot({ path: join(directory, `${view.key}.png`) });
  console.log(
    JSON.stringify({
      nativeWorkbooks: manifest.downloads.length,
      landscapePreviews: manifest.views.length,
    }),
  );
} finally {
  await browser.close();
}
