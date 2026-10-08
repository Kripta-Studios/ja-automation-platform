import { launch, sleep } from './rec-lib.mjs';
const b = await launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('https://j-aautomation.com/j-aautomation/app/video', { waitUntil: 'networkidle' });
await sleep(1500);
console.log(await p.evaluate(() => { const v = document.querySelector('video'); return { duration: v.duration, w: v.videoWidth, h: v.videoHeight, ready: v.readyState }; }));
await p.screenshot({ path: 'shots/video-page.jpg', type: 'jpeg', quality: 80 });
await b.close();
