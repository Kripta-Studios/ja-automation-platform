import { BASE, launch, newCtx, settle } from './rec-lib.mjs';
const [role, path, clickText] = process.argv.slice(2);
const b = await launch(); const ctx = await newCtx(b, { state: `state/${role}.json` }); const p = await ctx.newPage();
await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }); await settle(p, 1000);
if (clickText) { await p.getByRole(/^(button|link)$/.test('x') ? 'button' : 'button', { name: clickText }).first().click().catch(async () => p.getByText(clickText, { exact: true }).first().click()); await settle(p, 1200); }
console.log('URL', p.url());
const out = await p.$$eval('form', fs => fs.filter(f => f.offsetParent !== null).map(f => ({
  action: f.getAttribute('action'), id: f.id, cls: f.className.slice(0, 50),
  fields: [...f.querySelectorAll('input,select,textarea,button')].filter(e => e.type !== 'hidden' || e.name).map(e => {
    const lab = e.labels?.[0]?.innerText?.trim().replace(/\s+/g, ' ') || e.getAttribute('aria-label') || e.placeholder || '';
    const opts = e.tagName === 'SELECT' ? [...e.options].map(o => `${o.value}=${o.text.trim()}`).slice(0, 12).join(' | ') : '';
    return `${e.tagName.toLowerCase()}[${e.type || ''}] name=${e.name} val=${(e.value || '').slice(0, 40)} vis=${e.offsetParent !== null} :: ${lab.slice(0, 70)} ${opts ? '{' + opts + '}' : ''} ${e.tagName === 'BUTTON' ? '<' + e.innerText.trim().slice(0, 40) + '>' : ''}`;
  }),
})));
for (const f of out) { if (f.fields.length < 2) continue; console.log(`--- form action=${f.action} id=${f.id} cls=${f.cls}`); console.log(f.fields.join('\n')); }
await p.screenshot({ path: `shots/form-${role}.png`, fullPage: false });
await b.close();
