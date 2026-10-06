// Read-only browser verification against the isolated BBS runtime. Credentials stay private.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const root = process.cwd();
const base = new URL(process.env.BBS_ROLE_QA_ORIGIN ?? 'http://127.0.0.1:5179');
if (base.hostname !== '127.0.0.1' || !['5179', '5180'].includes(base.port))
  throw new Error('Isolated runtime required');
const privateRoot = process.env.BBS_ROLE_QA_PRIVATE_ROOT;
if (!privateRoot)
  throw new Error('Set the private cookie directory; never place credentials in evidence');
const output = resolve(
  root,
  process.env.BBS_ROLE_QA_OUTPUT_ROOT ??
    (base.port === '5180'
      ? 'docs/evidence/bbs-planning-20261006/help'
      : 'docs/evidence/bbs-role-manuals-20261006/help'),
);
const specs = [
  ['owner', 'owner.cookies', 'bbs-owner-manual', 'BBS_Owner_Manual_EN.pdf'],
  ['finance', 'role-finance.cookies', 'bbs-finance-manual', 'BBS_Finance_Manual_EN.pdf'],
  ['manager', 'role-manager.cookies', 'bbs-manager-manual', 'BBS_Project_Manager_Manual_EN.pdf'],
  ['auditor', 'role-auditor.cookies', 'bbs-auditor-manual', 'BBS_Auditor_Manual_EN.pdf'],
  ['worker', 'worker1.cookies', 'bbs-worker-manual', 'BBS_Worker_Manual_EN.pdf'],
  ['chief', 'chief.cookies', 'bbs-chief-manual', 'BBS_Crew_Chief_Manual_EN.pdf'],
  [
    'supplier-coordinator',
    'role-supplier-coordinator.cookies',
    'bbs-supplier-coordinator-manual',
    'BBS_Supplier_Coordinator_Manual_EN.pdf',
  ],
  [
    'external-technician',
    'role-external-technician.cookies',
    'bbs-external-technician-manual',
    'BBS_External_Technician_Manual_EN.pdf',
  ],
];
const permitted = {
  owner: specs.map((s) => s[2]),
  finance: ['bbs-finance-manual'],
  manager: ['bbs-manager-manual'],
  auditor: ['bbs-auditor-manual'],
  worker: ['bbs-worker-manual', 'bbs-chief-manual'],
  chief: ['bbs-worker-manual', 'bbs-chief-manual'],
  'supplier-coordinator': ['bbs-supplier-coordinator-manual'],
  'external-technician': ['bbs-external-technician-manual'],
};
const sha = (b) => createHash('sha256').update(b).digest('hex');
async function cookies(filename) {
  return (await readFile(resolve(privateRoot, filename), 'utf8')).split('\n').flatMap((line) => {
    if (!line || (line.startsWith('#') && !line.startsWith('#HttpOnly_'))) return [];
    const parts = line.replace(/^#HttpOnly_/, '').split('\t');
    if (parts.length !== 7) return [];
    return [
      {
        name: parts[5].replace(/^__Secure-/, ''),
        value: parts[6],
        domain: base.hostname,
        path: parts[2],
        httpOnly: line.startsWith('#HttpOnly_'),
        secure: false,
        sameSite: 'Lax',
      },
    ];
  });
}
await mkdir(resolve(output, 'screenshots'), { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const results = [];
try {
  for (const [role, jar, id, filename] of specs) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    await ctx.addCookies(await cookies(jar));
    const page = await ctx.newPage();
    const result = { role, manual: id, widths: [], downloadMatrix: [] };
    const expected = await readFile(resolve(root, 'docs/manuals', filename));
    const response = await page.goto(`${base.origin}/j-aautomation/app/help?lang=en`);
    if (response.status() !== 200 || page.url().includes('/login'))
      throw new Error(`${role}: help access failed`);
    const cards = page.locator('.manual-card');
    await cards.first().waitFor();
    const ids = await cards.evaluateAll((nodes) => nodes.map((n) => n.dataset.manualId));
    const primary = role === 'chief' ? 'bbs-worker-manual' : id;
    if (ids[0] !== primary) throw new Error(`${role}: wrong primary manual`);
    if (
      JSON.stringify(
        ids.filter((v) => v.startsWith('bbs-') && v !== 'bbs-project-invoices-guide').sort(),
      ) !== JSON.stringify([...permitted[role]].sort())
    )
      throw new Error(`${role}: wrong role library`);
    result.library = ids;
    for (const width of [1440, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${base.origin}/j-aautomation/app/help?lang=en`);
      await cards.first().waitFor();
      const geometry = await page.evaluate(() => ({
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        clipped: [...document.querySelectorAll('.manual-card .download')].filter((n) => {
          const r = n.getBoundingClientRect();
          return r.left < 0 || r.right > innerWidth;
        }).length,
      }));
      if (geometry.documentWidth > width + 1 || geometry.clipped)
        throw new Error(`${role}: clipped Help at ${width}`);
      result.widths.push({ ...geometry, status: 'PASS' });
      if (width === 1440 || width === 390)
        await page.screenshot({ path: resolve(output, `screenshots/${role}-${width}.png`) });
    }
    // Exercise the actual browser control, including the fetch/blob download UI.
    const downloaded = page.waitForEvent('download');
    await page.locator(`[data-manual-id="${id}"] a.download`).click();
    const dl = await downloaded;
    const actual = await readFile(await dl.path());
    if (sha(actual) !== sha(expected) || actual.subarray(0, 5).toString() !== '%PDF-')
      throw new Error(`${role}: browser download differs`);
    result.uiDownload = {
      status: 'PASS',
      bytes: actual.length,
      sha256: sha(actual),
      suggestedFilename: dl.suggestedFilename(),
    };
    for (const [, , target, targetFile] of specs) {
      const r = await ctx.request.get(
        `${base.origin}/j-aautomation/app/help/${target}/download?lang=en`,
      );
      const allowed = permitted[role].includes(target);
      if (r.status() !== (allowed ? 200 : 404))
        throw new Error(`${role}: ${target} unexpected status ${r.status()}`);
      if (allowed) {
        if (sha(await r.body()) !== sha(await readFile(resolve(root, 'docs/manuals', targetFile))))
          throw new Error('Artifact mismatch');
        if (r.headers()['cache-control'] !== 'private, no-store')
          throw new Error('Manual privacy header missing');
      }
      result.downloadMatrix.push({
        target,
        status: r.status(),
        expected: allowed ? 'allowed' : 'denied',
      });
    }
    await page.goto(`${base.origin}/j-aautomation/app/help?lang=es`);
    await page.locator(`[data-manual-id="${id}"] .language-fallback`).waitFor();
    const fallback = await ctx.request.get(
      `${base.origin}/j-aautomation/app/help/${id}/download?lang=es`,
    );
    if (fallback.status() !== 200 || sha(await fallback.body()) !== sha(expected))
      throw new Error(`${role}: English fallback differs`);
    result.spanishHelpEnglishFallback = 'PASS';
    results.push(result);
    await ctx.close();
    console.log(`${role}: Help, browser download, role boundaries and four widths PASS`);
  }
  const anonymous = await browser.newContext();
  const unsigned = await anonymous.request.get(
    `${base.origin}/j-aautomation/app/help/bbs-owner-manual/download?lang=en`,
  );
  if (unsigned.status() !== 401) throw new Error('Anonymous PDF was not denied');
  await anonymous.close();
  await writeFile(
    resolve(output, 'verification.json'),
    JSON.stringify(
      {
        status: 'PASS',
        origin: base.origin,
        project: 'C-0050-P-20261005',
        checkedAt: new Date().toISOString(),
        anonymous: 401,
        results,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
}
