import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const docs = join(root, 'docs/manuals');
const html = join(docs, 'BBS_Project_to_Client_Invoices_Guide_EN.html');
const layout = JSON.parse(readFileSync(join(docs, 'bbs-manual-layout.json')));
const browser = await chromium.launch({
  headless: true,
  args: process.getuid?.() === 0 ? ['--no-sandbox'] : [],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
  const result = await page.evaluate(() => {
    const missing = [...document.images]
      .filter((img) => !img.complete || !img.naturalWidth)
      .map((img) => img.src);
    const pages = [...document.querySelectorAll('.page')].map((section) => {
      const footerTop = section.querySelector('.footer').getBoundingClientRect().top;
      const content = section.querySelector('.content');
      const children = [...content.querySelectorAll('p,table,ol,aside,figure,.route,.toc')];
      const contentBottom = Math.max(
        content.getBoundingClientRect().bottom,
        ...children.map((e) => e.getBoundingClientRect().bottom),
      );
      const overflow = Math.max(0, contentBottom - footerTop);
      return {
        key: section.id,
        title: section.querySelector('h1').textContent,
        overflowPixels: Math.round(overflow * 100) / 100,
      };
    });
    return {
      missingImages: missing,
      pages,
      appendixLinks: [...document.querySelectorAll('a[href^="#native-"]')].map((a) => {
        const r = a.getBoundingClientRect();
        const s = a.closest('.page').getBoundingClientRect();
        return {
          target: a.getAttribute('href').slice(1),
          contentsPage: [...document.querySelectorAll('.page')].indexOf(a.closest('.page')),
          rect: [r.x - s.x, r.y - s.y, r.width, r.height],
        };
      }),
    };
  });
  const failures = result.pages.filter((p) => p.overflowPixels > 1);
  const proof = {
    bodyPages: layout.guidePages,
    missingImages: result.missingImages,
    overflows: failures,
    appendixLinks: result.appendixLinks,
  };
  writeFileSync(
    join(docs, 'bbs-manual-browser-layout.json'),
    JSON.stringify(proof, null, 2) + '\n',
  );
  if (result.missingImages.length || failures.length) throw new Error(JSON.stringify(proof));
  await page.pdf({
    path: join(docs, 'bbs-manual-body.pdf'),
    printBackground: true,
    preferCSSPageSize: true,
    outline: true,
  });
  console.log(JSON.stringify({ bodyPages: layout.guidePages, missingImages: 0, overflows: 0 }));
} finally {
  await browser.close();
}
