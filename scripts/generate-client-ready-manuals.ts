/** Renders trilingual worker quick guides against the same synthetic capture manifest. */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { manualRevision } from '../apps/portal/src/lib/server/manual-catalog.ts';
import { readManualSourceIdentity } from './manual-source-identity.ts';

type Capture = Readonly<{
  role: 'owner' | 'worker';
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
  source: string;
  output: string;
  locale: string;
  title: string;
  revision: string;
  screenReferences: string;
  page: string;
  of: string;
  figureAltPrefix: string;
  syntheticCapture: string;
  figureAt: string;
  currentRoute: string;
  sourceIdentity: string;
  binding: string;
  labels: readonly [string, string][];
}>;
const root = process.cwd();
const manualsDir = resolve(root, 'docs/manuals');
const screenshotsDir = resolve(manualsDir, 'screenshots');
const sha256 = /^[a-f0-9]{64}$/u;
const manifestPath = (() => {
  const input = process.env.MANUAL_CAPTURE_MANIFEST?.trim();
  return !input
    ? resolve(manualsDir, 'validation/current-capture.json')
    : isAbsolute(input)
      ? input
      : resolve(root, input);
})();
const manuals: readonly Manual[] = [
  {
    source: 'Employee_Field_Guide_EN.md',
    output: 'Employee_Field_Guide_EN.pdf',
    locale: 'en',
    title: 'Employee field guide',
    revision: 'revision',
    screenReferences: 'Current screen references',
    page: 'Page',
    of: 'of',
    figureAltPrefix: 'Synthetic Worker portal',
    syntheticCapture: 'Synthetic capture',
    figureAt: 'at',
    currentRoute: 'current route',
    sourceIdentity: 'Current source identity',
    binding:
      'Figures are synthetic; portal authorization and current record state control the action.',
    labels: [
      ['/app', 'Today'],
      ['/app/time', 'Time'],
      ['/app/expenses', 'Expenses'],
      ['/app/reports', 'Reports'],
      ['/app/pay', 'My Pay'],
      ['/app/help', 'Help'],
    ],
  },
  {
    source: 'Employee_Field_Guide_ES.md',
    output: 'Employee_Field_Guide_ES.pdf',
    locale: 'es',
    title: 'Guía de campo para empleados',
    revision: 'revisión',
    screenReferences: 'Referencias actuales de pantalla',
    page: 'Página',
    of: 'de',
    figureAltPrefix: 'Portal sintético del trabajador',
    syntheticCapture: 'Captura sintética',
    figureAt: 'a',
    currentRoute: 'ruta actual',
    sourceIdentity: 'Identidad actual de la fuente',
    binding:
      'Las figuras son sintéticas; la autorización del portal y el estado actual del registro controlan la acción.',
    labels: [
      ['/app', 'Hoy (Today)'],
      ['/app/time', 'Tiempo (Time)'],
      ['/app/expenses', 'Gastos (Expenses)'],
      ['/app/reports', 'Informes (Reports)'],
      ['/app/pay', 'Mi pago (My Pay)'],
      ['/app/help', 'Ayuda (Help)'],
    ],
  },
  {
    source: 'Employee_Field_Guide_PT-BR.md',
    output: 'Employee_Field_Guide_PT-BR.pdf',
    locale: 'pt-BR',
    title: 'Guia de campo para colaboradores',
    revision: 'revisão',
    screenReferences: 'Referências atuais de tela',
    page: 'Página',
    of: 'de',
    figureAltPrefix: 'Portal sintético do colaborador',
    syntheticCapture: 'Captura sintética',
    figureAt: 'em',
    currentRoute: 'rota atual',
    sourceIdentity: 'Identidade atual da fonte',
    binding:
      'As figuras são sintéticas; a autorização do portal e o estado atual do registro controlam a ação.',
    labels: [
      ['/app', 'Hoje (Today)'],
      ['/app/time', 'Tempo (Time)'],
      ['/app/expenses', 'Despesas (Expenses)'],
      ['/app/reports', 'Relatórios (Reports)'],
      ['/app/pay', 'Meu pagamento (My Pay)'],
      ['/app/help', 'Ajuda (Help)'],
    ],
  },
];
function fail(message: string): never {
  throw new Error(`Quick-guide generation refused: ${message}`);
}
function escapeHtml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}
function inline(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/gu, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>');
}
function load(): { manifest: Manifest; source: ReturnType<typeof readManualSourceIdentity> } {
  if (!existsSync(manifestPath)) fail(`capture manifest is required: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  const source = readManualSourceIdentity(root);
  if (
    manifest.environment !== 'synthetic' ||
    !sha256.test(manifest.sourceDigest ?? '') ||
    manifest.sourceDigest !== source.sourceDigest
  )
    fail('capture manifest does not bind to current application source');
  if (!/^[a-f0-9]{7,64}$/u.test(manifest.sourceCommit ?? ''))
    fail('capture manifest sourceCommit is missing or invalid');
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
  for (const capture of manifest.screenshots) {
    const file = resolve(root, capture.path ?? '');
    if (
      (capture.role !== 'owner' && capture.role !== 'worker') ||
      !capture.route?.startsWith('/app') ||
      !Number.isInteger(capture.viewport?.width) ||
      !Number.isInteger(capture.viewport?.height) ||
      !sha256.test(capture.sha256 ?? '') ||
      !file.startsWith(`${screenshotsDir}/`) ||
      !existsSync(file) ||
      createHash('sha256').update(readFileSync(file)).digest('hex') !== capture.sha256
    )
      fail(`capture is invalid: ${capture.path}`);
  }
  return { manifest, source };
}
function captureFor(manifest: Manifest, route: string): Capture {
  const capture = manifest.screenshots.find(
    (entry) => entry.role === 'worker' && entry.route === route && entry.viewport.width >= 1000,
  );
  if (!capture) fail(`required Worker capture is absent for ${route}`);
  return capture;
}
function markdown(markdownSource: string): string {
  const lines = markdownSource.replace(/\r\n/gu, '\n').split('\n');
  const output: string[] = [];
  let list = false;
  const close = () => {
    if (list) output.push('</ul>');
    list = false;
  };
  for (const line of lines) {
    if (line.startsWith('# ')) {
      close();
      output.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else if (line.startsWith('## ')) {
      close();
      output.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith('- ')) {
      if (!list) output.push('<ul>');
      list = true;
      output.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line.startsWith('> ')) {
      close();
      output.push(`<aside>${inline(line.slice(2))}</aside>`);
    } else if (!line.trim()) {
      close();
    } else {
      close();
      output.push(`<p>${inline(line)}</p>`);
    }
  }
  close();
  return output.join('\n');
}
function html(
  manual: Manual,
  markdownSource: string,
  manifest: Manifest,
  source: ReturnType<typeof readManualSourceIdentity>,
): string {
  const figures = manual.labels
    .map(([route, label]) => {
      const capture = captureFor(manifest, route);
      const bytes = readFileSync(resolve(root, capture.path)).toString('base64');
      return `<figure><img src="data:image/png;base64,${bytes}" alt="${escapeHtml(manual.figureAltPrefix)}: ${escapeHtml(label)}"/><figcaption>${escapeHtml(label)}. ${escapeHtml(manual.syntheticCapture)} ${escapeHtml(manual.figureAt)} ${capture.viewport.width} × ${capture.viewport.height}; ${escapeHtml(manual.currentRoute)} ${escapeHtml(capture.route)}.</figcaption></figure>`;
    })
    .join('');
  return `<!doctype html><html lang="${manual.locale}"><head><meta charset="utf-8"><title>${escapeHtml(manual.title)}</title><style>@page{size:A4;margin:14mm 13mm}body{font-family:Arial,"Noto Sans",sans-serif;color:#172033;font-size:10pt;line-height:1.45}h1{font-size:20pt;color:#073b5c;border-bottom:3px solid #1597c5;padding-bottom:4mm;margin:0 0 4mm}h2{font-size:13pt;color:#073b5c;margin:7mm 0 2mm;break-after:avoid}p,li{margin:0 0 2mm}ul{padding-left:5mm}aside{background:#eef8fc;border-left:4px solid #1597c5;padding:3mm 4mm;margin:3mm 0}code{background:#edf0f3;padding:.4mm 1mm;border-radius:2px}figure{break-inside:avoid;margin:5mm 0;border:1px solid #cbd5e1;padding:2mm}figure img{display:block;width:100%;max-height:83mm;object-fit:contain;background:#f8fafc}figcaption{font-size:8pt;color:#475569;margin-top:1mm}.meta{font-size:8.5pt;color:#475569;border-bottom:1px solid #cbd5e1;padding-bottom:3mm;margin-bottom:4mm}.binding{font-size:8pt;color:#475569;margin-top:6mm}</style></head><body><div class="meta">J&amp;A Automation · ${escapeHtml(manual.title)} · ${escapeHtml(manual.revision)} ${escapeHtml(manualRevision)}</div>${markdown(markdownSource)}<h2>${escapeHtml(manual.screenReferences)}</h2>${figures}<p class="binding">${escapeHtml(manual.sourceIdentity)}: <code>${escapeHtml(source.sourceDigest)}</code>. ${escapeHtml(manual.binding)}</p></body></html>`;
}
export async function generateQuickGuides(): Promise<void> {
  const { manifest, source } = load();
  const browser = await chromium.launch({ headless: true });
  const outputs: Array<Record<string, unknown>> = [];
  try {
    for (const manual of manuals) {
      const sourcePath = resolve(manualsDir, manual.source);
      if (!existsSync(sourcePath)) fail(`manual source missing: ${manual.source}`);
      const page = await browser.newPage();
      await page.setContent(html(manual, readFileSync(sourcePath, 'utf8'), manifest, source), {
        waitUntil: 'networkidle',
      });
      const output = resolve(manualsDir, manual.output);
      await page.pdf({
        path: output,
        format: 'A4',
        printBackground: true,
        tagged: true,
        outline: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `<div style="font-size:7pt;color:#64748b;width:100%;text-align:center">J&amp;A Automation · ${escapeHtml(manual.page)} <span class="pageNumber"></span> ${escapeHtml(manual.of)} <span class="totalPages"></span></div>`,
        margin: { top: '14mm', right: '13mm', bottom: '14mm', left: '13mm' },
      });
      await page.close();
      const bytes = readFileSync(output);
      outputs.push({
        file: manual.output,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.byteLength,
      });
    }
  } finally {
    await browser.close();
  }
  const buildPath = resolve(manualsDir, 'manual-build.json');
  const previous = existsSync(buildPath) ? JSON.parse(readFileSync(buildPath, 'utf8')) : {};
  writeFileSync(
    buildPath,
    `${JSON.stringify({ ...previous, generatedAt: new Date().toISOString(), environment: manifest.environment, sourceCommit: manifest.sourceCommit, sourceDigest: source.sourceDigest, captureManifest: relative(root, manifestPath), capturedAt: manifest.capturedAt, checks: manifest.checks, screenshots: manifest.screenshots, outputs: [...(Array.isArray(previous.outputs) ? previous.outputs.filter((item: { file?: string }) => !manuals.some((manual) => manual.output === item.file)) : []), ...outputs] }, null, 2)}\n`,
  );
  for (const output of outputs)
    console.log(`${output.file} ${output.bytes} sha256=${output.sha256}`);
}
if (process.argv[1]?.includes('generate-client-ready-manuals'))
  generateQuickGuides().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
