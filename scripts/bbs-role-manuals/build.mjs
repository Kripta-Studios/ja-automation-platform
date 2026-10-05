import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, 'docs/manuals');
const input = resolve(root, 'scripts/bbs-role-manuals/content');
const escape = (s) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const labels = {
  owner: 'Owner',
  worker: 'Worker',
  chief: 'Crew_Chief',
  manager: 'Project_Manager',
  finance: 'Finance',
  auditor: 'Auditor',
  'supplier-coordinator': 'Supplier_Coordinator',
  'external-technician': 'External_Technician',
};
const css = `
@page {size:A4;margin:0} @page wide {size:A4 landscape;margin:0}
*{box-sizing:border-box}body{margin:0;color:#182b38;background:#e8edf1;font:11pt/1.5 Arial,sans-serif}
.page{position:relative;width:210mm;height:297mm;background:white;break-after:page;overflow:hidden;margin:0 auto}
.wide{width:297mm;height:210mm;page:wide}
header{position:absolute;left:17mm;right:17mm;top:12mm;border-bottom:1px solid #d2dfe5;padding-bottom:3mm}
.eyebrow{font-size:8pt;text-transform:uppercase;letter-spacing:.07em;color:#226b75;margin-bottom:2mm}
h1{font-size:22pt;line-height:1.18;margin:0;color:#113f54}main{position:absolute;left:17mm;right:17mm;top:46mm;bottom:22mm}
p{margin:0 0 3.5mm}h2{font-size:13pt;margin:5mm 0 2mm;color:#226b75}.route,.context{font-size:9pt;color:#425764;border-left:3px solid #40a8a3;padding:2mm 3mm;margin-bottom:4mm;background:#f0f7f7}
ol,ul{margin:0 0 3mm;padding-left:7mm}li{padding-left:1mm;margin-bottom:2mm}
footer{position:absolute;left:17mm;right:17mm;bottom:9mm;font-size:8pt;border-top:1px solid #d2dfe5;padding-top:3mm;display:flex;justify-content:space-between;color:#647580}
figure{margin:0;display:flex;flex-direction:column;height:100%;gap:3mm}figure img{object-fit:contain;object-position:center top;width:100%;min-height:0;flex:1}figcaption{font-size:10pt;line-height:1.4;color:#425764;flex:none;max-height:35mm}
.toc p{display:flex;justify-content:space-between;gap:4mm;font-size:10pt;margin:0 0 2.5mm}.toc a{color:#113f54;text-decoration:none}.lead{font-size:16pt;color:#226b75}.callout{padding:4mm;background:#eef6f7;border-left:4px solid #226b75}
@media screen{.page{margin:12px auto;box-shadow:0 2px 12px #8885}}@media print{body{background:white}.page{margin:0;box-shadow:none}}
`;
function components(chapter) {
  const parts = [];
  if (chapter.context) parts.push(`<div class="context">${escape(chapter.context)}</div>`);
  if (chapter.route)
    parts.push(`<div class="route"><strong>Go here:</strong> ${escape(chapter.route)}</div>`);
  for (const p of chapter.paragraphs ?? []) parts.push(`<p>${escape(p)}</p>`);
  for (const [key, heading, ordered] of [
    ['steps', 'Do the task', true],
    ['checks', 'Verify the result', false],
    ['recovery', 'If you get stuck', false],
  ]) {
    if (!chapter[key]?.length) continue;
    chapter[key].forEach((item, i) => {
      const tag = ordered ? 'ol' : 'ul';
      parts.push(
        `<div>${i === 0 ? `<h2>${heading}</h2>` : ''}<${tag}${ordered ? ` start="${i + 1}"` : ''}><li>${escape(item)}</li></${tag}></div>`,
      );
    });
  }
  return parts;
}
const shared = {
  id: 'practice',
  title: 'Before you practise · access and scope',
  paragraphs: [
    'This English guide uses BBS · Ejemplo de manual, project C-0050-P-20261005. The screenshots were taken using the stated role in an isolated database running the application. Training entries, payments, approvals and documents are fictional. They do not prove a real bank transfer, accountant approval or customer acceptance.',
    'The company portal at https://j-aautomation.com/j-aautomation/app is LIVE. Training uses a separate URL and database. Before practising, obtain the isolated URL, your own role account and permitted exercises from the company administrator; verify the BBS project number. Without isolated access, treat these screenshots as read-only demonstrations and perform only authorized real work.',
    'Use your own credentials. Do not borrow an Owner, Finance or colleague account. A platform role, project assignment, review permission, supplier authorization and dated crew delegation are separate requirements. Changing one does not automatically grant the others.',
    'Select English in the workspace language control to follow the labels used here. Some saved BBS record names remain in their original language. On a phone open the navigation drawer to see full workspace names. Recheck the selected project and date range after every navigation.',
    'The eight Worker test accounts in the private credentials document use the same Worker workflow. Crew chief is a dated delegation attached to a Worker account. Supplier Coordinator and External Technician are restricted profiles attached to Worker accounts. This guide never includes account passwords.',
    'Each screenshot is an exercise checkpoint. Later fictional role entries and financial events are additional to the original October 1–5 workbook totals. Reopening the project or selecting the same dates does not restore that checkpoint. Read captions before comparing amounts or states.',
  ],
  checks: [
    'Confirm your displayed account, role or supplier profile, the project number and the dates before saving.',
    'For training access, scope or reset help, contact the company administrator at admin@j-aautomation.com. Include the role, route, project number, time and visible error; omit passwords, cookies and private customer or worker documents.',
  ],
  recovery: [
    'An empty project selector often means missing or expired assignment or authorization. Ask the Owner to check coverage for the date you are entering; do not create a duplicate project.',
    'A form shown in a screenshot can depend on role, source state or effective date. Use the documented role handoff when a control is absent.',
  ],
};
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const reports = [];
try {
  await mkdir(output, { recursive: true });
  for (const file of (await readdir(input)).filter((f) => f.endsWith('.json')).sort()) {
    const data = JSON.parse(await readFile(resolve(input, file), 'utf8'));
    if (!labels[data.role]) throw new Error(`Unsupported persona: ${data.role}`);
    const stem = `BBS_${labels[data.role]}_Manual_EN`;
    const chapters = [shared, ...data.chapters];
    const figures = [];
    const units = [];
    for (const chapter of chapters) {
      units.push({ key: chapter.id, title: chapter.title, parts: components(chapter), toc: true });
      for (const [i, figure] of (chapter.figures ?? []).entries()) {
        const full = resolve(root, figure.src);
        if (!full.startsWith(root + '/')) throw new Error('Figure outside repository');
        const hash = createHash('sha256')
          .update(await readFile(full))
          .digest('hex');
        figures.push({ path: relative(root, full), sha256: hash });
        units.push({
          key: `${chapter.id}-figure-${i + 1}`,
          title: figure.title ?? chapter.title,
          wide: figure.orientation !== 'portrait',
          figure: true,
          parts: [
            `<figure><img src="${escape(pathToFileURL(full).href)}"><figcaption>${escape(figure.caption)}</figcaption></figure>`,
          ],
        });
      }
    }
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    // Establish a file origin before loading the authenticated screenshot assets.
    await page.goto(pathToFileURL(resolve(input, file)).href);
    await page.setContent(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(data.title)}</title><style>${css}</style></head><body></body></html>`,
    );
    await page.emulateMedia({ media: 'print' });
    const layout = await page.evaluate(
      ({ units, title, subtitle }) => {
        const make = (key, heading, wide = false) => {
          const section = document.createElement('section');
          section.className = `page${wide ? ' wide' : ''}`;
          section.id = key;
          const header = document.createElement('header');
          const eyebrow = document.createElement('div');
          eyebrow.className = 'eyebrow';
          eyebrow.textContent = 'J&A Automation · BBS role manual · 6 October 2026';
          const h1 = document.createElement('h1');
          h1.textContent = heading;
          header.append(eyebrow, h1);
          const main = document.createElement('main');
          const footer = document.createElement('footer');
          section.append(header, main, footer);
          document.body.append(section);
          return { section, main, header, footer };
        };
        const cover = make('cover', title);
        const lead = document.createElement('p');
        lead.className = 'lead';
        lead.textContent =
          subtitle ?? 'An illustrated role operating guide using the BBS training project.';
        cover.main.append(lead);
        for (const text of [
          'Actual role sessions · Exact controls · Saved outcomes · Recovery and handoffs',
          'Project: BBS · Ejemplo de manual\nNumber: C-0050-P-20261005',
          'Read Before you practise before following any financial or operational training exercise. The training database is separate from the live portal.',
        ]) {
          const p = document.createElement('p');
          p.textContent = text;
          cover.main.append(p);
        }
        const entries = [];
        for (const unit of units) {
          let current = make(unit.key, unit.title, unit.wide);
          if (unit.toc) entries.push({ key: unit.key, title: unit.title });
          let continuation = 0;
          for (const html of unit.parts) {
            const template = document.createElement('template');
            template.innerHTML = html;
            const node = template.content.firstElementChild;
            current.main.append(node);
            if (
              !unit.figure &&
              node.getBoundingClientRect().bottom > current.main.getBoundingClientRect().bottom + 1
            ) {
              node.remove();
              if (!current.main.children.length)
                throw new Error(`A content block is too long: ${unit.key}`);
              current = make(
                `${unit.key}-continued-${++continuation}`,
                `${unit.title} · continued`,
                unit.wide,
              );
              current.main.append(node);
              if (
                node.getBoundingClientRect().bottom >
                current.main.getBoundingClientRect().bottom + 1
              )
                throw new Error(`A content block is too long: ${unit.key}`);
            }
          }
        }
        let toc = make('contents-1', 'Contents');
        toc.section.classList.add('toc');
        const tocPages = [toc.section];
        let tocNo = 1;
        for (const item of entries) {
          const row = document.createElement('p');
          const link = document.createElement('a');
          link.href = `#${item.key}`;
          link.textContent = item.title;
          const n = document.createElement('span');
          n.dataset.target = item.key;
          row.append(link, n);
          toc.main.append(row);
          if (row.getBoundingClientRect().bottom > toc.main.getBoundingClientRect().bottom) {
            row.remove();
            toc = make(`contents-${++tocNo}`, 'Contents · continued');
            toc.section.classList.add('toc');
            toc.main.append(row);
            tocPages.push(toc.section);
          }
        }
        let previous = cover.section;
        for (const section of tocPages) {
          previous.after(section);
          previous = section;
        }
        const all = [...document.querySelectorAll('.page')];
        for (const n of document.querySelectorAll('[data-target]'))
          n.textContent = String(all.findIndex((p) => p.id === n.dataset.target) + 1);
        all.forEach((s, i) => {
          const a = document.createElement('span');
          a.textContent = title;
          const n = document.createElement('span');
          n.textContent = `${i + 1} / ${all.length}`;
          s.querySelector('footer').append(a, n);
        });
        return {
          pages: all.length,
          landscape: all.filter((s) => s.classList.contains('wide')).length,
        };
      },
      { units, title: data.title, subtitle: data.subtitle },
    );
    await page.evaluate(() =>
      Promise.all(
        [...document.images].map(async (i) => {
          try {
            await i.decode();
          } catch {
            throw new Error(`Unreadable screenshot: ${i.src}`);
          }
        }),
      ),
    );
    const verification = await page.evaluate(() => ({
      missing: [...document.images].filter((i) => !i.complete || !i.naturalWidth).length,
      overflows: [...document.querySelectorAll('.page')].flatMap((s) => {
        const main = s.querySelector('main');
        const bottom = main.getBoundingClientRect().bottom;
        const nodes = [...main.children];
        const bad =
          nodes.some((n) => n.getBoundingClientRect().bottom > bottom + 1) ||
          s.querySelector('header').getBoundingClientRect().bottom >
            main.getBoundingClientRect().top;
        return bad ? [s.id] : [];
      }),
    }));
    const requiredText = chapters.flatMap((ch) => [
      ...(ch.paragraphs ?? []),
      ...(ch.steps ?? []),
      ...(ch.checks ?? []),
      ...(ch.recovery ?? []),
      ...(ch.figures ?? []).map((f) => f.caption),
    ]);
    const omitted = await page.evaluate((required) => {
      const normalize = (s) => s.replace(/\s+/gu, ' ').trim();
      const body = normalize(document.body.textContent);
      return required.filter((s) => !body.includes(normalize(s)));
    }, requiredText);
    if (omitted.length)
      throw new Error(`${data.role}: ${omitted.length} missing instruction blocks`);
    if (verification.missing || verification.overflows.length)
      throw new Error(JSON.stringify({ role: data.role, ...verification }));
    let portableHtml = await page.content();
    for (const figure of figures)
      portableHtml = portableHtml.replaceAll(
        pathToFileURL(resolve(root, figure.path)).href,
        relative(output, resolve(root, figure.path)),
      );
    await writeFile(resolve(output, `${stem}.html`), portableHtml);
    const markdown = [
      `# ${data.title}`,
      '',
      data.subtitle ?? '',
      '',
      ...chapters.flatMap((ch) => [
        `## ${ch.title}`,
        '',
        ...(ch.route ? [`Go here: ${ch.route}`, ''] : []),
        ...(ch.context ? [`Context: ${ch.context}`, ''] : []),
        ...(ch.paragraphs ?? []).flatMap((p) => [p, '']),
        ...['steps', 'checks', 'recovery'].flatMap((k) =>
          ch[k]?.length
            ? [
                `### ${{ steps: 'Do the task', checks: 'Verify the result', recovery: 'If you get stuck' }[k]}`,
                '',
                ...ch[k].map((p, i) => `${k === 'steps' ? `${i + 1}.` : '-'} ${p}`),
                '',
              ]
            : [],
        ),
        ...(ch.figures ?? []).flatMap((f) => [
          `![${f.caption}](${relative(output, resolve(root, f.src))})`,
          '',
        ]),
      ]),
    ].join('\n');
    await writeFile(resolve(output, `${stem}.md`), markdown);
    await page.pdf({
      path: resolve(output, `${stem}.pdf`),
      printBackground: true,
      preferCSSPageSize: true,
      outline: true,
    });
    const pdf = await readFile(resolve(output, `${stem}.pdf`));
    reports.push({
      role: data.role,
      filename: `${stem}.pdf`,
      ...layout,
      ...verification,
      instructionBlocks: requiredText.length,
      instructionText: 'PASS',
      bytes: pdf.length,
      sha256: createHash('sha256').update(pdf).digest('hex'),
      figures,
    });
    await page.close();
    console.log(`${data.role}: ${layout.pages} pages, ${figures.length} figures`);
  }
  await writeFile(
    resolve(output, 'bbs-role-manuals-build.json'),
    JSON.stringify({ revision: '2026-10-06', project: 'C-0050-P-20261005', reports }, null, 2) +
      '\n',
  );
} finally {
  await browser.close();
}
