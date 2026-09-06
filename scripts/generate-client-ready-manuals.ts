/**
 * Builds the small, worker-only release manual PDFs from editable Markdown.
 *
 * This is deliberately a local, offline renderer. It does not authenticate to
 * a portal, start a service, use production configuration, or embed a secret.
 * Screenshots must have been captured with the guarded synthetic-candidate
 * procedure before this command is used for a release.
 *
 * Run with the repository Node 24 runtime:
 *   JA_MANUAL_CANDIDATE_SHA=<sha> node --experimental-strip-types scripts/generate-client-ready-manuals.ts
 */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const root = process.cwd();
const manualsDir = resolve(root, 'docs/manuals');
const screenshotsDir = resolve(manualsDir, 'screenshots');
const candidate = process.env.JA_MANUAL_CANDIDATE_SHA?.trim() || 'UNBOUND-CANDIDATE';
const generatedAt = process.env.JA_MANUAL_DATE?.trim() || '2026-09-06';

type Manual = Readonly<{ source: string; pdf: string; locale: string; title: string }>;

const manuals: readonly Manual[] = [
  {
    source: 'Employee_Field_Guide_EN.md',
    pdf: 'Employee_Field_Guide_EN.pdf',
    locale: 'en',
    title: 'Employee field guide',
  },
  {
    source: 'Employee_Field_Guide_ES.md',
    pdf: 'Employee_Field_Guide_ES.pdf',
    locale: 'es',
    title: 'Guía de campo para empleados',
  },
  {
    source: 'Employee_Field_Guide_PT-BR.md',
    pdf: 'Employee_Field_Guide_PT-BR.pdf',
    locale: 'pt-BR',
    title: 'Guia de campo para colaboradores',
  },
];

function escapeHtml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}

function screenshotData(path: string): string {
  const target = resolve(screenshotsDir, path);
  if (!existsSync(target)) throw new Error(`Required synthetic screenshot is missing: ${target}`);
  const data = readFileSync(target).toString('base64');
  return `data:image/png;base64,${data}`;
}

function inline(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/gu, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>');
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/gu, '\n').split('\n');
  const output: string[] = [];
  let list = false;
  const closeList = () => {
    if (list) output.push('</ul>');
    list = false;
  };
  for (const line of lines) {
    if (line.startsWith('# ')) {
      closeList();
      output.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else if (line.startsWith('## ')) {
      closeList();
      output.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith('### ')) {
      closeList();
      output.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith('- ')) {
      if (!list) output.push('<ul>');
      list = true;
      output.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line.startsWith('> ')) {
      closeList();
      output.push(`<aside>${inline(line.slice(2))}</aside>`);
    } else if (!line.trim()) {
      closeList();
    } else {
      closeList();
      output.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return output.join('\n');
}

function documentHtml(manual: Manual, markdown: string): string {
  // These are worker-scoped candidate captures. The renderer never reads a
  // document store, so a private receipt or another worker's pay cannot enter
  // the PDF through this path.
  const shots = [
    ['worker/01_worker_home.png', 'Today'],
    ['worker/02_time_logging.png', 'Time'],
    ['worker/04_expense_submission.png', 'Expenses'],
    ['worker/03_field_report_submission.png', 'Reports'],
    ['worker/05_compensation_statement.png', 'My Pay'],
    ['worker/08_worker_mobile_view.png', 'Mobile Time'],
  ] as const;
  const figures = shots
    .map(
      ([path, label]) =>
        `<figure><img src="${screenshotData(path)}" alt="Synthetic worker candidate capture: ${label}" /><figcaption>${label} — synthetic worker candidate capture.</figcaption></figure>`,
    )
    .join('\n');
  return `<!doctype html><html lang="${manual.locale}"><head><meta charset="utf-8" />
<title>${escapeHtml(manual.title)}</title><style>
@page { size:A4; margin:14mm 13mm 14mm 13mm; }
body{font-family:Arial,"Noto Sans",sans-serif;color:#172033;font-size:10pt;line-height:1.45}
h1{font-size:20pt;color:#073b5c;border-bottom:3px solid #1597c5;padding-bottom:4mm;margin:0 0 4mm}
h2{font-size:13pt;color:#073b5c;margin:7mm 0 2mm;break-after:avoid}h3{font-size:11pt;margin:4mm 0 1mm}
p,li{margin:0 0 2mm}ul{padding-left:5mm}aside{background:#eef8fc;border-left:4px solid #1597c5;padding:3mm 4mm;margin:3mm 0}
code{background:#edf0f3;padding:.4mm 1mm;border-radius:2px}figure{break-inside:avoid;margin:5mm 0;border:1px solid #cbd5e1;padding:2mm}
figure img{display:block;width:100%;max-height:83mm;object-fit:contain;background:#f8fafc}figcaption{font-size:8pt;color:#475569;margin-top:1mm}
.meta{font-size:8.5pt;color:#475569;border-bottom:1px solid #cbd5e1;padding-bottom:3mm;margin-bottom:4mm}.safety{font-size:8.5pt;color:#475569;margin-top:7mm}
</style></head><body><div class="meta">J&amp;A Automation · ${escapeHtml(candidate)} · ${escapeHtml(generatedAt)} · synthetic candidate evidence only</div>
${markdownToHtml(markdown)}<h2>Screen references</h2>${figures}
<p class="safety">This guide is for the tested release candidate named above. It contains synthetic examples only. It does not authorize customer acceptance, alter approved history, or replace the support channel named in the employee invitation.</p>
</body></html>`;
}

async function main(): Promise<void> {
  mkdirSync(manualsDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const manual of manuals) {
      const sourcePath = resolve(manualsDir, manual.source);
      if (!existsSync(sourcePath)) throw new Error(`Manual source is missing: ${sourcePath}`);
      const markdown = readFileSync(sourcePath, 'utf8');
      const page = await browser.newPage();
      await page.setContent(documentHtml(manual, markdown), { waitUntil: 'networkidle' });
      const output = resolve(manualsDir, manual.pdf);
      await page.pdf({
        path: output,
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate:
          '<div style="font-size:7pt;color:#64748b;width:100%;text-align:center">J&amp;A Automation · Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
        margin: { top: '14mm', right: '13mm', bottom: '14mm', left: '13mm' },
      });
      await page.close();
      const bytes = readFileSync(output);
      console.log(
        `${basename(output)} ${bytes.length} sha256=${createHash('sha256').update(bytes).digest('hex')}`,
      );
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.includes('generate-client-ready-manuals'))
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
