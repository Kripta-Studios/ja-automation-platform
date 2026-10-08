import { launch, sleep } from './rec-lib.mjs';
const b = await launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('https://j-aautomation.com/j-aautomation/app/video2', { waitUntil: 'networkidle' });
await sleep(1200);
console.log(await p.evaluate(() => { const v = document.querySelector('video'); return { duration: v.duration, w: v.videoWidth, h: v.videoHeight, ready: v.readyState, title: document.title }; }));
await b.close();
