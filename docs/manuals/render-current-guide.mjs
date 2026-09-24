/** Render the dated deployed-app manual without touching the portal's local-fixture PDF pipeline. */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = dirname(new URL(import.meta.url).pathname);
const base = 'Current_Deployed_Workflows_2026-09-24';
const source = readFileSync(join(directory, `${base}.md`), 'utf8');
const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const inline = (value) => {
  let output = escape(value);
  output = output.replace(/`([^`]+)`/gu, '<code>$1</code>');
  output = output.replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>');
  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/gu, (_, label, href) => /^https?:/u.test(href) ? `<a href="${href}">${label}</a>` : `<span class="link">${label}</span>`);
  return output;
};
const lines = source.split(/\r?\n/u);
let body = '';
let paragraph = [];
let list = null;
const flushParagraph = () => { if (paragraph.length) { body += `<p>${inline(paragraph.join(' '))}</p>\n`; paragraph = []; } };
const closeList = () => { if (list) { body += `</${list}>\n`; list = null; } };
for (let index = 0; index < lines.length; index++) {
  const line = lines[index];
  if (!line.trim()) { flushParagraph(); closeList(); continue; }
  const heading = /^(#{1,3})\s+(.+)$/u.exec(line);
  if (heading) { flushParagraph(); closeList(); const level = heading[1].length; body += `<h${level}>${inline(heading[2])}</h${level}>\n`; continue; }
  const picture = /^!\[([^\]]+)\]\(([^)]+)\)$/u.exec(line);
  if (picture) { flushParagraph(); closeList(); body += `<figure><img src="${picture[2]}" alt="${escape(picture[1])}"><figcaption>${inline(picture[1])}</figcaption></figure>\n`; continue; }
  if (line.startsWith('|')) {
    flushParagraph(); closeList(); const rows = [];
    while (index < lines.length && lines[index].startsWith('|')) { rows.push(lines[index].split('|').slice(1,-1).map(cell=>cell.trim())); index++; }
    index--; body += '<table>\n';
    rows.forEach((row, rowIndex) => { if (rowIndex===1 && row.every(cell=>/^:?-+:?$/u.test(cell))) return; const tag=rowIndex===0?'th':'td'; body += `<tr>${row.map(cell=>`<${tag}>${inline(cell)}</${tag}>`).join('')}</tr>\n`; });
    body += '</table>\n'; continue;
  }
  const ordered = /^\d+\.\s+(.+)$/u.exec(line);
  const unordered = /^[-*]\s+(.+)$/u.exec(line);
  if (ordered || unordered) { flushParagraph(); const tag=ordered?'ol':'ul'; if(list!==tag){closeList();body+=`<${tag}>\n`;list=tag;} body+=`<li>${inline((ordered||unordered)[1])}</li>\n`;continue; }
  paragraph.push(line.trim());
}
flushParagraph(); closeList();
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>J&A Automation — current deployed work guide</title><style>
@page {size:A4;margin:16mm 17mm 18mm;} html{font-family:Arial,Helvetica,sans-serif;color:#1e2933;font-size:10.3pt;line-height:1.42} body{margin:0} h1{font-size:27pt;color:#9f1f18;border-bottom:4px solid #b9261a;padding-bottom:8mm;margin:0 0 9mm} h2{font-size:17pt;color:#9f1f18;margin:10mm 0 3mm;page-break-after:avoid} h3{font-size:13pt;margin:8mm 0 2mm;page-break-after:avoid;color:#163e55} p{margin:0 0 3.7mm} strong{color:#152a36} a,.link{color:#1b5f84;text-decoration:none} code{font-family:monospace;font-size:9pt;background:#f2f4f5;padding:1px 3px} table{border-collapse:collapse;width:100%;margin:4mm 0 6mm;font-size:8.8pt;page-break-inside:avoid} th,td{border:1px solid #cdd5d8;padding:2.3mm;text-align:left;vertical-align:top} th{background:#edf2f3;color:#163e55} ol,ul{padding-left:7mm;margin:2mm 0 5mm} li{margin:1.8mm 0} figure{margin:4mm 0 6mm;page-break-inside:avoid} figure img{display:block;max-width:100%;max-height:145mm;object-fit:contain;border:1px solid #d6dadd} figcaption{font-size:8.5pt;color:#58636b;margin-top:1.5mm} h2,h3{break-after:avoid} p,li{orphans:3;widows:3}
</style></head><body>${body}</body></html>`;
const htmlPath=join(directory,`${base}.html`);
writeFileSync(htmlPath,html);
const browser=await chromium.launch({headless:true,args:process.getuid?.()===0?['--no-sandbox']:[]});
try { const page=await browser.newPage(); await page.goto(pathToFileURL(resolve(htmlPath)).href,{waitUntil:'load'}); await page.pdf({path:join(directory,`${base}.pdf`),format:'A4',printBackground:true,preferCSSPageSize:true}); } finally { await browser.close(); }
console.log(join(directory,`${base}.pdf`));
