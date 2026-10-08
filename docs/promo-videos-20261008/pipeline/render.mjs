import playwright from '/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { CHROME } from './rec-lib.mjs';

// usage: node render.mjs out.mp4 [from] [to]   |   node render.mjs --stills 3,10,20
const args = process.argv.slice(2);
const FPS = 30;
const tl = JSON.parse(fs.readFileSync('timeline.json', 'utf8'));
const browser = await playwright.chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--allow-file-access-from-files', '--disable-gpu', '--font-render-hinting=none'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() === 'error') console.log('PAGE', m.text()); });
page.on('pageerror', e => console.log('PAGEERR', e.message));
await page.goto('file://' + process.cwd() + '/compose.html');
await page.evaluate(() => window.composeReady);

if (args[0] === '--stills') {
  for (const t of args[1].split(',').map(Number)) {
    await page.evaluate(t => window.renderFrame(t), t);
    await page.screenshot({ path: `shots/still-${String(t).replace('.', '_')}.jpg`, type: 'jpeg', quality: 85 });
  }
  await browser.close();
  process.exit(0);
}

if (args[0] === '--frames') {
  const dir = args[3] || 'out/frames';
  fs.mkdirSync(dir, { recursive: true });
  const from = +(args[1] ?? 0), to = +(args[2] ?? tl.duration);
  const i0 = Math.round(from * FPS), i1 = Math.round(to * FPS);
  const t0 = Date.now();
  for (let i = i0; i < i1; i++) {
    const file = `${dir}/${String(i).padStart(5, '0')}.jpg`;
    if (fs.existsSync(file)) continue;
    await page.evaluate(t => window.renderFrame(t), i / FPS);
    fs.writeFileSync(file + '.tmp', await page.screenshot({ type: 'jpeg', quality: 98 }));
    fs.renameSync(file + '.tmp', file);
    if (i % 30 === 0) console.log(`frame ${i}/${i1} elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  await browser.close();
  console.log('frames done');
  process.exit(0);
}

const out = args[0];
const from = +(args[1] ?? 0), to = +(args[2] ?? tl.duration);
const n = Math.round((to - from) * FPS);
const ff = spawn('tools/ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  ...(args.includes('--no-audio') ? [] : ['-ss', String(from), '-i', 'audio/soundtrack.wav']),
  '-map', '0:v', ...(args.includes('--no-audio') ? [] : ['-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-af', `afade=t=out:st=${Math.max(0, to - from - 2)}:d=2`]),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS),
  '-movflags', '+faststart', '-t', String(to - from), out,
], { stdio: ['pipe', 'inherit', 'inherit'] });
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  const t = from + i / FPS;
  await page.evaluate(t => window.renderFrame(t), t);
  const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % 150 === 0) console.log(`frame ${i}/${n} t=${t.toFixed(1)} elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
await browser.close();
console.log('done', out, ((Date.now() - t0) / 1000).toFixed(0) + 's');
