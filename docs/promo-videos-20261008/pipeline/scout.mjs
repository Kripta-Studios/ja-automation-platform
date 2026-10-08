import fs from 'node:fs';
import { BASE, launch, newCtx, settle } from './rec-lib.mjs';
const [role, ...paths] = process.argv.slice(2);
const b = await launch();
const ctx = await newCtx(b, { state: `state/${role}.json` });
const p = await ctx.newPage();
for (const path of paths) {
  await p.goto(`${BASE}${path}${path.includes('?') ? '&' : '?'}lang=en`, { waitUntil: 'domcontentloaded' });
  await settle(p, 1200);
  const slug = `${role}-${path.replace(/\W+/g, '_').slice(0, 60)}`;
  await p.screenshot({ path: `shots/${slug}.png`, fullPage: process.env.FULL === '1' });
  const text = (await p.locator('main').innerText().catch(() => p.locator('body').innerText())).replace(/\n{2,}/g, '\n');
  console.log(`===== ${role} ${path} -> ${p.url()}\n${text.slice(0, +(process.env.MAX || 2500))}`);
  if (process.env.LINKS === '1') console.log((await p.$$eval('main a', as => [...new Set(as.map(a => `${a.innerText.trim().replace(/\s+/g, ' ').slice(0, 80)} -> ${a.getAttribute('href')}`))])).join('\n'));
}
await ctx.storageState({ path: `state/${role}.json` });
await b.close();
