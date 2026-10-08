import { BASE, launch, newCtx, settle, keepAlive } from './rec-lib.mjs';
const P = '01a10c51-a391-7288-aad1-cb38be43f496';
const shots = [
  ['owner', '/'], ['finance', `/finance?view=economic&project=${P}`], ['project-manager', '/'], ['auditor', '/audit'],
  ['crew-chief', '/crew'], ['supplier-coordinator', '/supplier'], ['external-technician', '/time'], ['worker-2', '/reports'],
];
const b = await launch();
for (const [role, path] of shots) {
  const ctx = await newCtx(b, { state: `state/${role}.json` });
  const p = await ctx.newPage();
  await p.goto(`${BASE}${path}${path.includes('?') ? '&' : '?'}lang=en`, { waitUntil: 'domcontentloaded' });
  await settle(p, 1500);
  await p.evaluate(() => document.getElementById('__promo_cursor')?.remove());
  if (role === 'finance') { const k = p.locator('main').getByText('DIRECT PROJECT RESULT').first(); const bb = await k.boundingBox(); await p.mouse.wheel(0, bb.y - 260); await settle(p, 600); }
  await p.screenshot({ path: `shots/role-${role}.jpg`, type: 'jpeg', quality: 90 });
  console.log(role, p.url());
  await ctx.storageState({ path: `state/${role}.json` });
  await ctx.close();
}
await b.close();
