import { open, createTime } from './seed-lib.mjs';
const s = await open('worker-1');
await createTime(s.page, { date: '2026-10-06', hours: 8, category: 'commissioning', summary: 'Line 3 packaging cell: PLC I/O checkout of conveyor drives and safety light curtains with the site electrician.' });
await s.page.screenshot({ path: 'shots/seed-test.png' });
console.log((await s.page.locator('main').innerText()).slice(0, 1800));
await s.close();
