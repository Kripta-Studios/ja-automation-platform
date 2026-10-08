import { open, approveItem } from './seed-lib.mjs';
const s = await open('project-manager');
await approveItem(s.page, '/approvals?lang=en', 'BBS DEMO - Tecnico 1 · 2026-10-06');
await approveItem(s.page, '/approvals?lang=en', 'BBS DEMO - Tecnico 2 · 2026-10-06');
await s.page.goto('https://j-aautomation.com/j-aautomation/app/approvals?lang=en&view=reports', { waitUntil: 'networkidle' });
const t = (await s.page.locator('main').innerText()).replace(/\n+/g, '\n');
console.log(t.slice(t.indexOf('Action queue'), t.indexOf('Action queue') + 1500));
await s.close();
