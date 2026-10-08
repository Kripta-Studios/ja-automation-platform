import { open, submitDraftReports } from './seed-lib.mjs';
const s = await open('worker-1');
await submitDraftReports(s.page);
await s.page.goto('https://j-aautomation.com/j-aautomation/app/reports?lang=en', { waitUntil: 'networkidle' });
console.log((await s.page.locator('main').innerText()).match(/DAILY[\s\S]*?Open report/g)?.join('\n---\n'));
await s.close();
