/**
 * Builds the small, worker-only release manual PDFs from editable Markdown.
 *
 * This is deliberately a local, offline renderer. It does not authenticate to
 * a portal, start a service, use production configuration, or embed a secret.
 * Screenshots must have been captured with the guarded synthetic-candidate
 * procedure before this command is used for a release.
 *
 * Run with the repository Node 24 runtime:
 *   JA_MANUAL_DATE=2026-09-08 node --experimental-strip-types scripts/generate-client-ready-manuals.ts
 */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const root = process.cwd();
const manualsDir = resolve(root, 'docs/manuals');
const screenshotsDir = resolve(manualsDir, 'screenshots');
const generatedAt = process.env.JA_MANUAL_DATE?.trim() || '2026-09-08';

type Shot = readonly [path: string, label: string];
type Manual = Readonly<{
  source: string;
  pdf: string;
  locale: string;
  title: string;
  revisionLabel: string;
  screenReferences: string;
  figureAltPrefix: string;
  figureCaptionSuffix: string;
  safety: string;
  pageLabel: string;
  ofLabel: string;
  shots: readonly Shot[];
}>;

const manuals: readonly Manual[] = [
  {
    source: 'Employee_Field_Guide_EN.md',
    pdf: 'Employee_Field_Guide_EN.pdf',
    locale: 'en',
    title: 'Employee field guide',
    revisionLabel: 'revision',
    screenReferences: 'Screen references',
    figureAltPrefix: 'Example portal screen',
    figureCaptionSuffix: 'example portal screen',
    safety:
      'Examples in this guide are fictional. Follow the portal instructions and use the verified support route named in your invitation. Do not sign for a customer or change approved history outside the correction flow.',
    pageLabel: 'Page',
    ofLabel: 'of',
    shots: [
      ['worker/01_worker_home.png', 'Today'],
      ['worker/02_time_logging.png', 'Time'],
      ['worker/04_expense_submission.png', 'Expenses'],
      ['worker/03_field_report_submission.png', 'Reports'],
      ['worker/05_compensation_statement.png', 'My Pay'],
      ['worker/08_worker_mobile_view.png', 'Mobile Time'],
    ],
  },
  {
    source: 'Employee_Field_Guide_ES.md',
    pdf: 'Employee_Field_Guide_ES.pdf',
    locale: 'es',
    title: 'Guía de campo para empleados',
    revisionLabel: 'revisión',
    screenReferences: 'Referencias de pantalla',
    figureAltPrefix: 'Ejemplo de pantalla del portal',
    figureCaptionSuffix: 'ejemplo de pantalla del portal',
    safety:
      'Los ejemplos de esta guía son ficticios. Sigue las instrucciones del portal y utiliza el canal de soporte verificado indicado en tu invitación. No firmes por un cliente ni cambies el historial aprobado fuera del flujo de corrección.',
    pageLabel: 'Página',
    ofLabel: 'de',
    shots: [
      ['worker/01_worker_home.png', 'Hoy (Today)'],
      ['worker/02_time_logging.png', 'Tiempo (Time)'],
      ['worker/04_expense_submission.png', 'Gastos (Expenses)'],
      ['worker/03_field_report_submission.png', 'Informes (Reports)'],
      ['worker/05_compensation_statement.png', 'Mi pago (My Pay)'],
      ['worker/08_worker_mobile_view.png', 'Tiempo móvil (Mobile Time)'],
    ],
  },
  {
    source: 'Employee_Field_Guide_PT-BR.md',
    pdf: 'Employee_Field_Guide_PT-BR.pdf',
    locale: 'pt-BR',
    title: 'Guia de campo para colaboradores',
    revisionLabel: 'revisão',
    screenReferences: 'Referências de tela',
    figureAltPrefix: 'Exemplo de tela do portal',
    figureCaptionSuffix: 'exemplo de tela do portal',
    safety:
      'Os exemplos deste guia são fictícios. Siga as instruções do portal e use o canal de suporte verificado indicado no convite. Não assine pelo cliente nem altere o histórico aprovado fora do fluxo de correção.',
    pageLabel: 'Página',
    ofLabel: 'de',
    shots: [
      ['worker/01_worker_home.png', 'Hoje (Today)'],
      ['worker/02_time_logging.png', 'Tempo (Time)'],
      ['worker/04_expense_submission.png', 'Despesas (Expenses)'],
      ['worker/03_field_report_submission.png', 'Relatórios (Reports)'],
      ['worker/05_compensation_statement.png', 'Meu pagamento (My Pay)'],
      ['worker/08_worker_mobile_view.png', 'Tempo no celular (Mobile Time)'],
    ],
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
  const figures = manual.shots
    .map(
      ([path, label]) =>
        `<figure><img src="${screenshotData(path)}" alt="${escapeHtml(manual.figureAltPrefix)}: ${escapeHtml(label)}" /><figcaption>${escapeHtml(label)} — ${escapeHtml(manual.figureCaptionSuffix)}.</figcaption></figure>`,
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
</style></head><body><div class="meta">J&amp;A Automation · ${escapeHtml(manual.title)} · ${escapeHtml(manual.revisionLabel)} ${escapeHtml(generatedAt)}</div>
${markdownToHtml(markdown)}<h2>${escapeHtml(manual.screenReferences)}</h2>${figures}
<p class="safety">${escapeHtml(manual.safety)}</p>
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
        footerTemplate: `<div style="font-size:7pt;color:#64748b;width:100%;text-align:center">J&amp;A Automation · ${escapeHtml(manual.pageLabel)} <span class="pageNumber"></span> ${escapeHtml(manual.ofLabel)} <span class="totalPages"></span></div>`,
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
