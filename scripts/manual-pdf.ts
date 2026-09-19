/** Render role manuals from reviewed Markdown and fresh, authenticated synthetic browser captures. */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import {
  manualCatalog,
  manualPersonas,
  manualRevision,
  type ManualPersona,
} from '../apps/portal/src/lib/server/manual-catalog.ts';
import { readManualSourceIdentity } from './manual-source-identity.ts';

type Capture = Readonly<{
  persona: ManualPersona;
  locale: 'en' | 'pt';
  key: string;
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
type Source = ReturnType<typeof readManualSourceIdentity>;
const root = process.cwd();
const manualsDir = resolve(root, 'docs/manuals');
const screenshotsRoot = resolve(manualsDir, 'screenshots/current');
const defaultManifest = resolve(manualsDir, 'validation/current-capture.json');
const sha256 = /^[a-f0-9]{64}$/u;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function loadFreshManualCapture(): {
  manifest: Manifest;
  source: Source;
  manifestPath: string;
} {
  const configured = process.env.MANUAL_CAPTURE_MANIFEST?.trim();
  const manifestPath = configured
    ? isAbsolute(configured)
      ? configured
      : resolve(root, configured)
    : defaultManifest;
  if (!existsSync(manifestPath))
    throw new Error(`Manual capture manifest missing: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  const source = readManualSourceIdentity(root);
  if (
    manifest.environment !== 'synthetic' ||
    !sha256.test(manifest.sourceDigest ?? '') ||
    source.sourceDigest !== manifest.sourceDigest
  )
    throw new Error('Manual capture is not bound to the current application source');
  if (
    !/^[a-f0-9]{7,64}$/u.test(manifest.sourceCommit ?? '') ||
    !manifest.capturedAt ||
    !Number.isFinite(Date.parse(manifest.capturedAt))
  )
    throw new Error('Manual capture source or time is invalid');
  if (
    !Array.isArray(manifest.checks) ||
    !manifest.checks.length ||
    !manifest.checks.every((check) => /^(passed|pass|ok)$/iu.test(String(check.status)))
  )
    throw new Error('Manual capture checks have not all passed');
  if (!Array.isArray(manifest.screenshots)) throw new Error('Manual screenshots are missing');
  const seen = new Set<string>();
  for (const shot of manifest.screenshots) {
    if (
      !manualPersonas.includes(shot.persona) ||
      !['en', 'pt'].includes(shot.locale) ||
      !shot.key?.trim() ||
      !shot.route?.startsWith('/app') ||
      !sha256.test(shot.sha256 ?? '') ||
      !Number.isInteger(shot.viewport?.width) ||
      !Number.isInteger(shot.viewport?.height) ||
      shot.viewport.width < 320 ||
      shot.viewport.height < 500 ||
      !shot.path?.startsWith('docs/manuals/screenshots/current/') ||
      isAbsolute(shot.path)
    )
      throw new Error(`Manual screenshot metadata invalid: ${shot.path}`);
    const path = resolve(root, shot.path);
    if (!path.startsWith(`${screenshotsRoot}/`) || !existsSync(path) || seen.has(path))
      throw new Error(`Manual screenshot missing, duplicate or outside capture root: ${shot.path}`);
    const bytes = readFileSync(path);
    if (
      !bytes.subarray(0, 8).equals(pngSignature) ||
      createHash('sha256').update(bytes).digest('hex') !== shot.sha256
    )
      throw new Error(`Manual screenshot PNG/hash mismatch: ${shot.path}`);
    seen.add(path);
  }
  for (const persona of manualPersonas)
    for (const locale of ['en', 'pt'] as const)
      if (!manifest.screenshots.some((shot) => shot.persona === persona && shot.locale === locale))
        throw new Error(`Fresh browser screenshot missing for ${persona}/${locale}`);
  return { manifest, source, manifestPath };
}

function escape(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}
function inline(value: string): string {
  return escape(value)
    .replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>')
    .replace(/`([^`]+)`/gu, '<code>$1</code>');
}
function markdown(value: string): string {
  const output: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const close = () => {
    if (list) output.push(`</${list}>`);
    list = null;
  };
  for (const raw of value.split(/\r?\n/gu)) {
    const line = raw.trim();
    if (!line) {
      close();
      continue;
    }
    if (line.startsWith('> ')) {
      close();
      output.push(`<aside>${inline(line.slice(2))}</aside>`);
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/u.exec(line);
    if (heading) {
      close();
      if (heading[1].length === 1) continue; // Title belongs to the cover.
      const anchor = heading[2]
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/gu, '')
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, '');
      output.push(
        `<h${heading[1].length} id="${anchor}">${inline(heading[2])}</h${heading[1].length}>`,
      );
      continue;
    }
    const item = /^(?:([-*])|(\d+)\.)\s+(.+)$/u.exec(line);
    if (item) {
      const desired = item[2] ? 'ol' : 'ul';
      if (list !== desired) {
        close();
        output.push(`<${desired}>`);
        list = desired;
      }
      output.push(`<li>${inline(item[3])}</li>`);
      continue;
    }
    close();
    output.push(`<p>${inline(line)}</p>`);
  }
  close();
  return output.join('\n');
}

const captureCaptions: Record<string, Readonly<{ en: string; pt: string; es: string }>> = {
  home: {
    en: 'Start here: navigation and work available to this account',
    pt: 'Comece aqui: navegação e trabalho disponível para esta conta',
    es: 'Empieza aquí: navegación y trabajo disponible para esta cuenta',
  },
  'home-phone': {
    en: 'Mobile home: the same authorized navigation on a narrow screen',
    pt: 'Tela inicial no celular: a mesma navegação autorizada',
    es: 'Inicio móvil: la misma navegación autorizada',
  },
  help: {
    en: 'Help: download the guide assigned to this account',
    pt: 'Ajuda: baixe o guia atribuído a esta conta',
    es: 'Ayuda: descarga la guía asignada a esta cuenta',
  },
  profile: {
    en: 'Profile: language, own identity and security settings',
    pt: 'Perfil: idioma, identidade própria e opções de segurança',
    es: 'Perfil: idioma, identidad propia y opciones de seguridad',
  },
  'planning-month': {
    en: 'Planning: choose a month and inspect the selected day’s shifts',
    pt: 'Planejamento: escolha o mês e confira turnos do dia selecionado',
    es: 'Planificación: elige el mes y revisa turnos del día seleccionado',
  },
  'planning-editor': {
    en: 'Planning: selecting a day prepares the new shift form in UTC',
    pt: 'Planejamento: selecionar um dia prepara o novo turno em UTC',
    es: 'Planificación: seleccionar un día prepara el nuevo turno en UTC',
  },
  'availability-month': {
    en: 'Availability: month view and agenda of existing windows',
    pt: 'Disponibilidade: mês e agenda das janelas existentes',
    es: 'Disponibilidad: mes y agenda de las ventanas existentes',
  },
  'availability-editor': {
    en: 'Availability: selecting a day opens the dated UTC entry form',
    pt: 'Disponibilidade: selecionar um dia abre o formulário UTC com a data',
    es: 'Disponibilidad: seleccionar un día abre el formulario UTC con fecha',
  },
  'projects-month': {
    en: 'Projects: select a day to inspect its authorized project agenda',
    pt: 'Projetos: selecione um dia para consultar a agenda autorizada',
    es: 'Proyectos: selecciona un día para consultar la agenda autorizada',
  },
  'supplier-team': {
    en: 'Supplier team: authorized installation and technician work',
    pt: 'Equipe do fornecedor: instalação autorizada e trabalho dos técnicos',
    es: 'Equipo del proveedor: instalación autorizada y trabajo de los técnicos',
  },
  time: {
    en: 'Time: enter only your own factual operational work',
    pt: 'Horas: registre somente seu trabalho operacional real',
    es: 'Tiempo: registra solo tu trabajo operativo real',
  },
  finance: {
    en: 'Finance: review the permitted financial source and status',
    pt: 'Financeiro: revise a fonte e o estado financeiro permitido',
    es: 'Finanzas: revisa la fuente y el estado financiero permitido',
  },
  audit: {
    en: 'Audit: trace append-only events in a read-only view',
    pt: 'Auditoria: rastreie eventos de acréscimo em consulta somente leitura',
    es: 'Auditoría: sigue eventos inmutables en una vista de solo lectura',
  },
};
function screenshotHtml(captures: readonly Capture[], locale: 'en' | 'pt' | 'es'): string {
  const heading =
    locale === 'pt'
      ? 'Telas reais do aplicativo com dados fictícios'
      : locale === 'es'
        ? 'Pantallas reales de la aplicación con datos ficticios'
        : 'Real application screens with synthetic data';
  const context =
    locale === 'pt'
      ? 'Capturadas com login do perfil indicado em uma instância isolada; não mostram dados de clientes.'
      : locale === 'es'
        ? 'Capturadas con el perfil indicado en una instancia aislada; las pantallas de ejemplo están en inglés y no muestran datos de clientes.'
        : 'Captured with this role signed into an isolated application; no customer data is shown.';
  return `<section class="screens"><h2>${heading}</h2><p>${context}</p>${captures
    .map((shot) => {
      const png = readFileSync(resolve(root, shot.path)).toString('base64');
      const label = captureCaptions[shot.key]?.[locale] ?? shot.key.replace(/[-_]/gu, ' ');
      return `<figure class="${shot.viewport.width < 600 ? 'phone' : 'desktop'}"><img alt="${escape(label)}" src="data:image/png;base64,${png}"><figcaption><strong>${escape(label)}</strong><br><code>${escape(shot.route)}</code> · ${shot.viewport.width} × ${shot.viewport.height}</figcaption></figure>`;
    })
    .join('')}</section>`;
}

type PdfInput = Readonly<{
  id?: string;
  persona: ManualPersona;
  locale: 'en' | 'pt' | 'es';
  sourceName: string;
  outputName: string;
  title: string;
}>;
function html(input: PdfInput, source: Source, manifest: Manifest): string {
  const sourcePath = resolve(manualsDir, input.sourceName);
  if (!existsSync(sourcePath)) throw new Error(`Manual Markdown missing: ${input.sourceName}`);
  const shots = manifest.screenshots.filter(
    (shot) =>
      shot.persona === input.persona &&
      shot.locale === (input.locale === 'es' ? 'en' : input.locale),
  );
  const sourceText = readFileSync(sourcePath, 'utf8');
  const contents = markdown(sourceText);
  const toc = [...sourceText.matchAll(/^##\s+(.+)$/gmu)]
    .map((match) => {
      const anchor = match[1]
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/gu, '')
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, '');
      return `<li><a href="#${anchor}">${inline(match[1])}</a></li>`;
    })
    .join('');
  const captureLabel =
    input.locale === 'pt'
      ? 'Captura validada'
      : input.locale === 'es'
        ? 'Captura validada'
        : 'Validated capture';
  const revisionLabel =
    input.locale === 'pt' ? 'Revisão' : input.locale === 'es' ? 'Revisión' : 'Revision';
  const contentsLabel =
    input.locale === 'pt' ? 'Conteúdo' : input.locale === 'es' ? 'Contenido' : 'Contents';
  const syntheticLabel =
    input.locale === 'pt'
      ? 'Telas reais do aplicativo com dados fictícios; nenhuma informação de cliente.'
      : input.locale === 'es'
        ? 'Pantallas reales de la aplicación con datos ficticios; sin información de clientes.'
        : 'Real application screens with synthetic data; no customer information.';
  return `<!doctype html><html lang="${input.locale === 'pt' ? 'pt-BR' : input.locale}"><head><meta charset="utf-8"><title>${escape(input.title)}</title><style>
  @page{size:A4;margin:16mm 15mm}body{font-family:Arial,"Noto Sans",sans-serif;color:#172033;font-size:10pt;line-height:1.48}
  h1,h2,h3{color:#073b5c;break-after:avoid}h1{font-size:23pt;border-bottom:3px solid #1597c5;padding-bottom:3mm}h2{font-size:14pt;margin-top:8mm}h3{font-size:11pt}
  p,li{margin:0 0 2.5mm}ul,ol{padding-left:6mm}code{font-family:monospace;background:#edf1f4;padding:0.3mm 0.7mm}
  aside{background:#eef8fc;border-left:4px solid #1597c5;padding:3mm 4mm;margin:4mm 0}
  .cover{min-height:245mm;display:flex;flex-direction:column;justify-content:space-between;page-break-after:always}
  .cover h1{font-size:30pt;margin-top:66mm}.meta{color:#52677f;font-size:9pt;border-top:2px solid #1597c5;padding-top:4mm}
  .toc{page-break-after:always}.toc h2{font-size:20pt}.toc li{margin:3mm 0}.toc a{color:#075d88;text-decoration:none}
  .screens{page-break-before:always}
  figure{break-inside:avoid;margin:6mm 0;border:1px solid #cbd5e1;padding:2mm;background:#f8fafc}
  figure img{display:block;width:100%;height:auto;max-height:174mm;object-fit:contain;background:white}
  figure.phone{max-width:90mm;margin-left:auto;margin-right:auto}
  figcaption{font-size:8pt;color:#52677f;margin-top:1mm;overflow-wrap:anywhere}</style></head><body>
  <section class="cover"><div><p>J&amp;A Automation</p><h1>${escape(input.title)}</h1><p>${syntheticLabel}</p></div>
  <div class="meta">${revisionLabel} ${manualRevision} · ${captureLabel}: ${escape(manifest.capturedAt)}</div></section>
  <nav class="toc"><h2>${contentsLabel}</h2><ol>${toc}</ol></nav>
  <main>${contents}${screenshotHtml(shots, input.locale)}</main>
  <p style="font-size:7pt;color:#52677f">${input.locale === 'pt' ? 'Origem' : input.locale === 'es' ? 'Fuente' : 'Source'} ${escape(source.sourceDigest.slice(0, 16))}</p></body></html>`;
}

export async function generateRoleManuals(locale: 'en' | 'pt'): Promise<void> {
  const { manifest, source, manifestPath } = loadFreshManualCapture();
  const manuals: PdfInput[] = manualCatalog
    .filter((manual) => manual.audience !== 'quick-start')
    .map((manual) => ({
      id: manual.id,
      persona: manual.audience as ManualPersona,
      locale,
      sourceName: `Role_Guide_${manual.audience}_${locale === 'pt' ? 'PT-BR' : 'EN'}.md`,
      outputName: manual.assets[locale]!.sourceName,
      title: manual.title[locale],
    }));
  const browser = await chromium.launch({ headless: true });
  const outputs: Array<{
    id: string;
    file: string;
    source: string;
    sourceSha256: string;
    sha256: string;
    bytes: number;
  }> = [];
  try {
    for (const manual of manuals) {
      const page = await browser.newPage();
      await page.setContent(html(manual, source, manifest), { waitUntil: 'networkidle' });
      const file = resolve(manualsDir, manual.outputName);
      await page.pdf({
        path: file,
        format: 'A4',
        printBackground: true,
        tagged: true,
        outline: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `<div style="font:7pt Arial,sans-serif;color:#52677f;width:100%;text-align:center">J&amp;A Automation · <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
        margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' },
      });
      await page.close();
      const bytes = readFileSync(file);
      outputs.push({
        id: manual.id!,
        file: manual.outputName,
        source: manual.sourceName,
        sourceSha256: createHash('sha256')
          .update(readFileSync(resolve(manualsDir, manual.sourceName)))
          .digest('hex'),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
      });
      console.log(`${manual.outputName} ${bytes.length} sha256=${outputs.at(-1)!.sha256}`);
    }
  } finally {
    await browser.close();
  }
  const buildPath = resolve(
    manualsDir,
    locale === 'en' ? 'manual-build.json' : 'manual-build-PT-BR.json',
  );
  const previous = existsSync(buildPath)
    ? (JSON.parse(readFileSync(buildPath, 'utf8')) as { outputs?: Array<{ file: string }> })
    : {};
  writeFileSync(
    buildPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        environment: manifest.environment,
        sourceCommit: manifest.sourceCommit,
        sourceDigest: source.sourceDigest,
        captureManifest: relative(root, manifestPath),
        capturedAt: manifest.capturedAt,
        checks: manifest.checks,
        screenshots: manifest.screenshots,
        outputs: [
          ...(previous.outputs ?? []).filter(
            (old) => !outputs.some((item) => item.file === old.file),
          ),
          ...outputs,
        ],
      },
      null,
      2,
    )}\n`,
  );
}

export async function generateQuickGuides(): Promise<void> {
  const { manifest, source, manifestPath } = loadFreshManualCapture();
  const guide = manualCatalog.find((manual) => manual.id === 'employee-field-guide')!;
  const guides = [
    {
      locale: 'en' as const,
      sourceName: 'Employee_Field_Guide_EN.md',
      outputName: guide.assets.en!.sourceName,
      title: guide.title.en,
    },
    {
      locale: 'pt' as const,
      sourceName: 'Employee_Field_Guide_PT-BR.md',
      outputName: guide.assets.pt!.sourceName,
      title: guide.title.pt,
    },
    {
      locale: 'es' as const,
      sourceName: 'Employee_Field_Guide_ES.md',
      outputName: guide.assets.es!.sourceName,
      title: guide.title.es,
    },
  ];
  const browser = await chromium.launch({ headless: true });
  const outputs: Array<{
    file: string;
    source: string;
    sourceSha256: string;
    sha256: string;
    bytes: number;
  }> = [];
  try {
    for (const guide of guides) {
      const page = await browser.newPage();
      await page.setContent(html({ ...guide, persona: 'worker' }, source, manifest), {
        waitUntil: 'networkidle',
      });
      const file = resolve(manualsDir, guide.outputName);
      await page.pdf({
        path: file,
        format: 'A4',
        printBackground: true,
        tagged: true,
        outline: true,
        margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' },
      });
      await page.close();
      const bytes = readFileSync(file);
      outputs.push({
        file: guide.outputName,
        source: guide.sourceName,
        sourceSha256: createHash('sha256')
          .update(readFileSync(resolve(manualsDir, guide.sourceName)))
          .digest('hex'),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
      });
    }
  } finally {
    await browser.close();
  }
  const buildPath = resolve(manualsDir, 'manual-build.json');
  const previous = existsSync(buildPath)
    ? (JSON.parse(readFileSync(buildPath, 'utf8')) as { outputs?: Array<{ file: string }> })
    : {};
  writeFileSync(
    buildPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        environment: manifest.environment,
        sourceCommit: manifest.sourceCommit,
        sourceDigest: source.sourceDigest,
        captureManifest: relative(root, manifestPath),
        capturedAt: manifest.capturedAt,
        checks: manifest.checks,
        screenshots: manifest.screenshots,
        outputs: [
          ...(previous.outputs ?? []).filter(
            (old) => !outputs.some((item) => item.file === old.file),
          ),
          ...outputs,
        ],
      },
      null,
      2,
    )}\n`,
  );
}
