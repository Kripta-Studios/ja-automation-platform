/** Renders detailed guides from role-aware Markdown and fresh synthetic evidence. */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { readManualSourceIdentity } from './manual-source-identity.ts';

type Role = 'owner' | 'worker';
type Capture = Readonly<{
  role: Role;
  key?: string;
  name?: string;
  route: string;
  path: string;
  sha256: string;
  viewport: Readonly<{ width: number; height: number }>;
}>;
type Manifest = Readonly<{
  sourceCommit: string;
  sourceDigest: string;
  capturedAt: string;
  environment: 'synthetic';
  screenshots: readonly Capture[];
  checks: readonly Readonly<{ name: string; status: string }>[];
}>;
type Manual = Readonly<{
  id: string;
  role: Role;
  source: string;
  output: string;
  title: string;
  subtitle: string;
}>;
const root = process.cwd();
const manualsDir = resolve(root, 'docs/manuals');
const screenshotsDir = resolve(manualsDir, 'screenshots');
const defaultManifest = resolve(manualsDir, 'validation/current-capture.json');
const sha256 = /^[a-f0-9]{64}$/u;
const manuals: readonly Manual[] = [
  {
    id: 'owner-reference',
    role: 'owner',
    source: 'Owner_User_Guide.md',
    output: 'Owner_User_Guide.pdf',
    title: 'Owner and Finance user guide',
    subtitle: 'Operational administration, finance, customer evidence and controlled closeout',
  },
  {
    id: 'worker-reference',
    role: 'worker',
    source: 'Worker_User_Guide.md',
    output: 'Worker_User_Guide.pdf',
    title: 'Worker user guide',
    subtitle: 'Assigned work, factual records, private files and personal compensation',
  },
];
function fail(message: string): never {
  throw new Error(`Manual generation refused: ${message}`);
}
function escapeHtml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}
function routeKey(route: string): string {
  const bare = route.replace(/^https?:\/\/[^/]+/u, '').replace(/^\/j-aautomation/u, '');
  const [pathname, query = ''] = bare.split('?', 2);
  const normalized = pathname
    .replace(/\/projects\/[^/]+\/closeout$/u, '/projects/:id/closeout')
    .replace(/\/reports\/period\/[^/]+$/u, '/reports/period/:id');
  return `${normalized}${query ? `?${query}` : ''}`;
}
function resolveManifestPath(): string {
  const configured = process.env.MANUAL_CAPTURE_MANIFEST?.trim();
  return !configured
    ? defaultManifest
    : isAbsolute(configured)
      ? configured
      : resolve(root, configured);
}
function loadManifest(): {
  manifest: Manifest;
  manifestPath: string;
  source: ReturnType<typeof readManualSourceIdentity>;
} {
  const manifestPath = resolveManifestPath();
  if (!existsSync(manifestPath)) fail(`capture manifest is required: ${manifestPath}`);
  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  } catch (error) {
    fail(
      `capture manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (manifest.environment !== 'synthetic') fail('capture manifest environment must be synthetic');
  if (!/^[a-f0-9]{7,64}$/u.test(manifest.sourceCommit ?? ''))
    fail('capture manifest sourceCommit is missing or invalid');
  if (!sha256.test(manifest.sourceDigest ?? ''))
    fail('capture manifest sourceDigest is missing or invalid');
  if (!manifest.capturedAt || Number.isNaN(Date.parse(manifest.capturedAt)))
    fail('capture manifest capturedAt is missing or invalid');
  if (!Array.isArray(manifest.screenshots) || !manifest.screenshots.length)
    fail('capture manifest needs at least one screenshot');
  if (
    !Array.isArray(manifest.checks) ||
    !manifest.checks.length ||
    !manifest.checks.every((check) => /^(passed|pass|ok)$/iu.test(String(check.status)))
  )
    fail('every capture manifest validation check must pass');
  const source = readManualSourceIdentity(root);
  if (source.sourceDigest !== manifest.sourceDigest)
    fail('capture manifest sourceDigest differs from current application source');
  const seen = new Set<string>();
  for (const capture of manifest.screenshots) {
    if (capture.role !== 'owner' && capture.role !== 'worker')
      fail('capture screenshot role must be owner or worker');
    if (!capture.route?.startsWith('/app')) fail('capture screenshot route must be an app route');
    if (!capture.path || isAbsolute(capture.path) || !sha256.test(capture.sha256 ?? ''))
      fail(`capture record is invalid: ${capture.path}`);
    if (!Number.isInteger(capture.viewport?.width) || !Number.isInteger(capture.viewport?.height))
      fail(`capture viewport is invalid: ${capture.path}`);
    const file = resolve(root, capture.path);
    if (!file.startsWith(`${screenshotsDir}/`) || !existsSync(file))
      fail(`capture file is unavailable: ${capture.path}`);
    if (createHash('sha256').update(readFileSync(file)).digest('hex') !== capture.sha256)
      fail(`capture hash mismatch: ${capture.path}`);
    const duplicate = capture.path;
    if (seen.has(duplicate)) fail(`duplicate capture path: ${duplicate}`);
    seen.add(duplicate);
  }
  return { manifest, manifestPath, source };
}
function figureFor(captures: readonly Capture[], role: Role, reference: string): Capture {
  const [route, requestedKey] = reference.split('#', 2);
  const capture = captures.find(
    (item) =>
      item.role === role &&
      routeKey(item.route) === routeKey(route) &&
      (!requestedKey || item.key === requestedKey || item.name === requestedKey),
  );
  if (!capture) fail(`required ${role} capture is absent for ${reference}`);
  return capture;
}
function image(capture: Capture): string {
  return `data:image/png;base64,${readFileSync(resolve(root, capture.path)).toString('base64')}`;
}
function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/(^-|-$)/gu, '') || 'section'
  );
}
function inline(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/gu, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gu, '<a href="$2">$1</a>');
}
function splitTable(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/gu, '')
    .split('|')
    .map((value) => value.trim());
}
function isTableRule(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(line);
}
function renderMarkdown(
  markdown: string,
  captures: readonly Capture[],
): { body: string; toc: string } {
  const lines = markdown.replace(/\r\n/gu, '\n').split('\n');
  const out: string[] = [];
  const entries: Array<{ level: number; id: string; title: string }> = [];
  let unordered = false;
  let ordered = false;
  const closeLists = () => {
    if (unordered) out.push('</ul>');
    if (ordered) out.push('</ol>');
    unordered = false;
    ordered = false;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const figure = line.match(/^:::figure\s+(owner|worker)\s+(\S+)\s+(.+)$/u);
    if (figure) {
      closeLists();
      const capture = figureFor(captures, figure[1] as Role, figure[2]);
      const caption = figure[3].replace(/[. ]+$/u, '');
      out.push(
        `<figure><img src="${image(capture)}" alt="Synthetic ${escapeHtml(caption)}" /><figcaption>${inline(caption)}. Synthetic capture at ${capture.viewport.width} × ${capture.viewport.height}; route ${inline(capture.route)}.</figcaption></figure>`,
      );
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/u);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      const title = heading[2].trim();
      const id = slug(title);
      if (level > 1) entries.push({ level, id, title });
      out.push(`<h${level} id="${id}">${inline(title)}</h${level}>`);
      continue;
    }
    if (index + 1 < lines.length && line.includes('|') && isTableRule(lines[index + 1])) {
      closeLists();
      const header = splitTable(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(splitTable(lines[index]));
        index += 1;
      }
      index -= 1;
      out.push(
        `<table><thead><tr>${header.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${header.map((_, cell) => `<td>${inline(row[cell] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
      );
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/u);
    if (bullet) {
      if (ordered) {
        out.push('</ol>');
        ordered = false;
      }
      if (!unordered) {
        out.push('<ul>');
        unordered = true;
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    const numbered = line.match(/^\d+\.\s+(.+)$/u);
    if (numbered) {
      if (unordered) {
        out.push('</ul>');
        unordered = false;
      }
      if (!ordered) {
        out.push('<ol>');
        ordered = true;
      }
      out.push(`<li>${inline(numbered[1])}</li>`);
      continue;
    }
    if (line.startsWith('> ')) {
      closeLists();
      out.push(`<aside>${inline(line.slice(2))}</aside>`);
      continue;
    }
    if (!line.trim()) {
      closeLists();
      continue;
    }
    closeLists();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeLists();
  return {
    body: out.join('\n'),
    toc: `<nav class="toc" aria-label="Table of contents"><h2>Contents</h2><ol>${entries.map((entry) => `<li class="toc-${entry.level}"><a href="#${entry.id}">${escapeHtml(entry.title)}</a></li>`).join('')}</ol></nav>`,
  };
}
function documentHtml(
  manual: Manual,
  source: ReturnType<typeof readManualSourceIdentity>,
  manifest: Manifest,
  body: string,
  toc: string,
): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(manual.title)}</title><style>@page{size:A4;margin:17mm 15mm 18mm}body{font-family:Arial,"Noto Sans",sans-serif;color:#162235;font-size:9.7pt;line-height:1.47}h1,h2,h3{color:#073b5c;break-after:avoid}h1{font-size:22pt;border-bottom:3px solid #1597c5;padding-bottom:3mm;margin:0 0 5mm}h2{font-size:14pt;margin:9mm 0 3mm;padding-top:1mm}h3{font-size:11pt;margin:5mm 0 2mm}p,li{margin:0 0 2.2mm}ol,ul{padding-left:6mm;margin:2mm 0 4mm}.cover{min-height:235mm;display:flex;flex-direction:column;justify-content:space-between;page-break-after:always}.cover h1{font-size:32pt;border:0;margin-top:70mm}.cover .subtitle{font-size:16pt;color:#41566e;max-width:125mm}.meta{border-top:2px solid #1597c5;padding-top:4mm;color:#52677f;font-size:8.5pt}.toc{page-break-after:always}.toc h2{font-size:20pt}.toc ol{list-style:none;padding:0}.toc li{margin:2.4mm 0}.toc .toc-3{margin-left:6mm;font-size:9pt}.toc a,a{color:#075d88;text-decoration:none}figure{break-inside:avoid;margin:6mm 0;border:1px solid #cbd5e1;padding:3mm;background:#f8fafc}figure img{display:block;width:100%;max-height:100mm;object-fit:contain;background:white}figcaption{font-size:8.2pt;color:#53677d;margin-top:2mm}table{width:100%;border-collapse:collapse;margin:4mm 0 5mm;break-inside:avoid;font-size:8.5pt}th,td{border:1px solid #cbd5e1;padding:2mm;vertical-align:top;text-align:left}th{background:#eaf5f9;color:#073b5c}aside{background:#eef8fc;border-left:4px solid #1597c5;padding:3mm 4mm;margin:4mm 0;color:#29465c}code{background:#edf1f4;border-radius:2px;padding:.3mm .8mm;font-size:8.5pt}.revision{font-size:8.3pt;color:#52677f;border-top:1px solid #cbd5e1;margin-top:10mm;padding-top:3mm}</style></head><body><section class="cover"><div><small>J&amp;A Automation · role-aware operational reference</small><h1>${escapeHtml(manual.title)}</h1><p class="subtitle">${escapeHtml(manual.subtitle)}</p></div><div class="meta"><p>Validated synthetic capture: ${escapeHtml(manifest.capturedAt)}</p><p>Application source identity: <code>${escapeHtml(source.sourceDigest.slice(0, 16))}</code></p><p>This guide contains no production data. Role authorization and displayed record state remain authoritative.</p></div></section>${toc}<main>${body}<p class="revision">Current validated application identity: <code>${escapeHtml(source.sourceDigest.slice(0, 16))}</code>.</p></main></body></html>`;
}
export async function generateManuals(): Promise<void> {
  const { manifest, manifestPath, source } = loadManifest();
  mkdirSync(manualsDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const outputs: Array<Record<string, unknown>> = [];
  try {
    for (const manual of manuals) {
      const markdownPath = resolve(manualsDir, manual.source);
      if (!existsSync(markdownPath)) fail(`manual source is missing: ${manual.source}`);
      const rendered = renderMarkdown(readFileSync(markdownPath, 'utf8'), manifest.screenshots);
      const page = await browser.newPage();
      await page.setContent(documentHtml(manual, source, manifest, rendered.body, rendered.toc), {
        waitUntil: 'networkidle',
      });
      const output = resolve(manualsDir, manual.output);
      await page.pdf({
        path: output,
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        tagged: true,
        outline: true,
        headerTemplate: `<div style="font-family:Arial,sans-serif;font-size:7pt;color:#52677f;width:100%;padding-left:15mm">J&amp;A Automation · ${escapeHtml(manual.title)}</div>`,
        footerTemplate:
          '<div style="font-family:Arial,sans-serif;font-size:7pt;color:#52677f;width:100%;text-align:center">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
        margin: { top: '17mm', bottom: '18mm', left: '15mm', right: '15mm' },
      });
      await page.close();
      const bytes = readFileSync(output);
      const digest = createHash('sha256').update(bytes).digest('hex');
      outputs.push({ id: manual.id, file: manual.output, sha256: digest, bytes: bytes.byteLength });
      console.log(`${manual.output} ${bytes.byteLength} sha256=${digest}`);
    }
  } finally {
    await browser.close();
  }
  writeFileSync(
    resolve(manualsDir, 'manual-build.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), environment: manifest.environment, sourceCommit: manifest.sourceCommit, sourceDigest: source.sourceDigest, captureManifest: relative(root, manifestPath), capturedAt: manifest.capturedAt, checks: manifest.checks, screenshots: manifest.screenshots, outputs }, null, 2)}\n`,
  );
}
if (process.argv[1]?.includes('generate-user-manuals'))
  generateManuals().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
