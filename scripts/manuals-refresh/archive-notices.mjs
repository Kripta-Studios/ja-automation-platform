/** Add an unmistakable archive cover while retaining every original content page. */
import { chromium } from 'playwright';
import { mkdtemp, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const dir = await mkdtemp(join(tmpdir(), 'ja-archive-notice-'));
const copy = {
  en: [
    'Historical manual',
    'Reviewed 11 October 2026',
    'The following pages describe an earlier release. Screen layout, navigation, approvals and digital workflows have changed. Use the current role manual before performing a task.',
    'Current manuals: Owner, Finance, Project Manager, Auditor, Worker, Crew chief, Supplier Coordinator and External Technician. The current role PDFs are English; Help identifies the language fallback.',
    'Earlier screenshots, examples and their original page numbers are retained as historical evidence. This cover does not certify those instructions against today’s application.',
    'Open current Help and role manuals',
  ],
  es: [
    'Manual histórico',
    'Revisado el 11 de octubre de 2026',
    'Las páginas siguientes describen una versión anterior. Han cambiado las pantallas, la navegación, las aprobaciones y los flujos digitales. Consulta el manual actual de tu perfil antes de realizar una tarea.',
    'Los manuales actuales cubren los ocho perfiles de acceso y están en inglés. Ayuda indica el idioma del PDF antes de descargarlo.',
    'Las capturas, ejemplos y números de página originales se conservan como evidencia histórica. Esta portada no certifica las instrucciones antiguas para la aplicación actual.',
    'Abrir Ayuda y los manuales actuales',
  ],
  pt: [
    'Manual histórico',
    'Revisado em 11 de outubro de 2026',
    'As páginas seguintes descrevem uma versão anterior. As telas, a navegação, as aprovações e os fluxos digitais mudaram. Consulte o manual atual do seu perfil antes de executar uma tarefa.',
    'Os manuais atuais abrangem os oito perfis de acesso e estão em inglês. A Ajuda informa o idioma do PDF antes do download.',
    'As capturas, os exemplos e a numeração de páginas originais são preservados como evidência histórica. Esta capa não certifica as instruções antigas para o aplicativo atual.',
    'Abrir Ajuda e os manuais atuais',
  ],
};
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  for (const [lang, c] of Object.entries(copy)) {
    const p = await browser.newPage();
    await p.setContent(
      `<html lang="${lang}"><head><meta charset="utf-8"><style>@page{size:A4;margin:25mm}body{font:14pt/1.6 Arial;color:#183047}h1{font-size:32pt;color:#226b75}a{color:#145986}p{margin:8mm 0}</style></head><body><p>J&A Automation · ${c[2 - 1]}</p><h1>${c[0]}</h1><p>${c[2]}</p><p>${c[3]}</p><p><a href="https://j-aautomation.com/j-aautomation/app/help">${c[5]}</a></p><p>${c[4]}</p></body></html>`,
    );
    await p.pdf({ path: join(dir, lang + '.pdf'), preferCSSPageSize: true, printBackground: true });
    await p.close();
  }
} finally {
  await browser.close();
}
const files = (await readdir('docs/manuals')).filter(
  (x) =>
    x.endsWith('.pdf') &&
    !x.startsWith('BBS_') &&
    ![
      'Role_Workflows.pdf',
      'Digital_Workers.pdf',
      'Project_to_Invoice_Quick_Guide_EN.pdf',
    ].includes(x) &&
    !x.startsWith('bbs-'),
);
await writeFile(join(dir, 'files.json'), JSON.stringify(files));
const result = spawnSync(
  process.env.JA_MANUAL_PYTHON ?? 'python3',
  [resolve('scripts/manuals-refresh/archive-notices.py'), dir],
  { stdio: 'inherit' },
);
if (result.status) process.exit(result.status);
