/** Replace dated archive notice covers while retaining every historical page. */
import { chromium } from 'playwright';
import { mkdtemp, mkdir, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const helpUrl = process.env.JA_MANUAL_CURRENT_HELP_URL ?? 'https://j-aautomation.com/j-aautomation/app/help';
const workRoot = process.env.JA_MANUAL_ARCHIVE_WORK_DIR;
if (workRoot) await mkdir(workRoot, { recursive: true });
const dir = await mkdtemp(join(workRoot ?? tmpdir(), 'ja-archive-notice-'));
const chromiumPath =
  process.env.JA_MANUAL_CHROMIUM_EXECUTABLE_PATH ??
  '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';

const copy = {
  en: {
    eyebrow: 'J&A Automation · Current Help revision 17 October 2026',
    title: 'Historical manual',
    body: 'The following pages document an earlier release. Screen layout, navigation, approvals and digital workflows have changed. Consult your current role manual before completing a task.',
    fallback: 'Current role manuals are available in Help. The eight current role manuals are in English; Help identifies this language before a PDF is downloaded from another interface language.',
    link: 'Open current Help · revision 17 October 2026',
    history: 'Earlier screenshots, examples and original page numbers are preserved as historical reference. This notice does not validate old procedures against the current application.',
  },
  es: {
    eyebrow: 'J&A Automation · Revisión de Ayuda actual: 17 de octubre de 2026',
    title: 'Manual histórico',
    body: 'Las páginas siguientes documentan una versión anterior. Han cambiado las pantallas, la navegación, las aprobaciones y los flujos digitales. Consulta el manual actual de tu perfil antes de realizar una tarea.',
    fallback: 'Los manuales actuales por perfil están disponibles en Ayuda. Los ocho manuales actuales están en inglés; Ayuda indica este idioma cuando se descarga un PDF desde otra lengua de interfaz.',
    link: 'Abrir Ayuda actual · revisión del 17 de octubre de 2026',
    history: 'Las capturas, los ejemplos y la paginación originales se conservan como referencia histórica. Esta portada no valida los procedimientos anteriores para la aplicación actual.',
  },
  pt: {
    eyebrow: 'J&A Automation · Revisão da Ajuda atual: 17 de outubro de 2026',
    title: 'Manual histórico',
    body: 'As páginas seguintes documentam uma versão anterior. As telas, a navegação, as aprovações e os fluxos digitais mudaram. Consulte o manual atual do seu perfil antes de executar uma tarefa.',
    fallback: 'Os manuais atuais por perfil estão disponíveis na Ajuda. Os oito manuais atuais estão em inglês; a Ajuda informa esse idioma quando um PDF é baixado em outra língua da interface.',
    link: 'Abrir a Ajuda atual · revisão de 17 de outubro de 2026',
    history: 'As capturas, os exemplos e a numeração de páginas originais são preservados como referência histórica. Esta capa não valida os procedimentos antigos para o aplicativo atual.',
  },
};

const browser = await chromium.launch({ executablePath: chromiumPath, args: ['--no-sandbox'] });
try {
  for (const [lang, c] of Object.entries(copy)) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1414 }, deviceScaleFactor: 1 });
    const escapeHtml = (value) =>
      value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    await page.setContent(
      `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
        @page { size: A4; margin: 24mm; }
        * { box-sizing: border-box; }
        body { margin: 0; color: #183047; font: 14pt/1.58 Arial, sans-serif; }
        .eyebrow { margin: 0 0 17mm; color: #52697b; font-size: 11pt; font-weight: 600; }
        h1 { margin: 0 0 12mm; color: #226b75; font-size: 31pt; line-height: 1.15; }
        p { margin: 0 0 8mm; }
        a { color: #145986; font-weight: 700; text-decoration: underline; }
        .history { margin-top: 14mm; color: #52697b; font-size: 11pt; }
        .rule { width: 24mm; height: 2mm; margin: 0 0 8mm; background: #e69c39; }
      </style></head><body>
        <p class="eyebrow">${escapeHtml(c.eyebrow)}</p><div class="rule"></div>
        <h1>${escapeHtml(c.title)}</h1>
        <p>${escapeHtml(c.body)}</p>
        <p>${escapeHtml(c.fallback)}</p>
        <p><a href="${escapeHtml(helpUrl)}">${escapeHtml(c.link)}</a></p>
        <p class="history">${escapeHtml(c.history)}</p>
      </body></html>`,
    );
    await page.screenshot({ path: join(dir, `${lang}-cover-preview.png`), fullPage: true });
    await page.pdf({
      path: join(dir, `${lang}.pdf`),
      preferCSSPageSize: true,
      printBackground: true,
    });
    await page.close();
  }
} finally {
  await browser.close();
}

const files = (await readdir('docs/manuals')).filter(
  (name) =>
    name.endsWith('.pdf') &&
    !name.startsWith('BBS_') &&
    !['Role_Workflows.pdf', 'Digital_Workers.pdf', 'Project_to_Invoice_Quick_Guide_EN.pdf'].includes(name) &&
    !name.startsWith('bbs-'),
).sort();
await writeFile(join(dir, 'files.json'), JSON.stringify(files));

const result = spawnSync(
  process.env.JA_MANUAL_PYTHON ?? 'python3',
  [resolve('scripts/manuals-refresh/archive-notices.py'), dir],
  { stdio: 'inherit', env: process.env },
);
if (result.error) throw result.error;
if (result.status) process.exit(result.status);
console.log(`Cover previews and PDFs: ${dir}`);
