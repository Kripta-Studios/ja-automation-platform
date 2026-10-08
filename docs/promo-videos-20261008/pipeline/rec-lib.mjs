import playwright from '/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js';
import fs from 'node:fs';

export const BASE = 'https://j-aautomation.com/j-aautomation/app';
export const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

const CURSOR_JS = `
(() => {
  const install = () => {
    if (document.getElementById('__promo_cursor')) return;
    const c = document.createElement('div');
    c.id = '__promo_cursor';
    c.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.6 14.8 L11.6 21.6 L14.6 20.3 L11.7 13.6 L18 13.6 Z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0px', top: '0px', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-4px,-2px)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))', transition: 'none' });
    document.documentElement.appendChild(c);
    if (/iPhone/.test(navigator.userAgent)) {
      c.innerHTML = '';
      Object.assign(c.style, { width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(30,30,30,.22)', border: '3px solid rgba(255,255,255,.95)', boxShadow: '0 2px 8px rgba(0,0,0,.35)', transform: 'translate(-22px,-22px)', filter: 'none' });
    }
    const pos = window.__promoPos || { x: -100, y: -100 };
    c.style.left = pos.x + 'px'; c.style.top = pos.y + 'px';
    addEventListener('mousemove', e => { window.__promoPos = { x: e.clientX, y: e.clientY }; c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', e => {
      const r = document.createElement('div');
      Object.assign(r.style, { position: 'fixed', left: (e.clientX - 22) + 'px', top: (e.clientY - 22) + 'px', width: '44px', height: '44px', borderRadius: '50%', border: '3px solid rgba(214,40,40,.9)', background: 'rgba(214,40,40,.18)', zIndex: 2147483646, pointerEvents: 'none', transform: 'scale(.3)', opacity: '1', transition: 'transform .45s ease-out, opacity .45s ease-out' });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.5)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 600);
    }, true);
    const st = document.createElement('style');
    st.textContent = 'html{scroll-behavior:smooth} ::-webkit-scrollbar{width:0!important;height:0!important}';
    document.documentElement.appendChild(st);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
`;

export async function launch({ mobile = false } = {}) {
  const dsf = mobile ? '2.5' : '1.3333333';
  return playwright.chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--font-render-hinting=none', `--force-device-scale-factor=${dsf}`] });
}

export async function newCtx(browser, { state, mobile = false } = {}) {
  const opts = mobile
    ? { viewport: { width: 400, height: 860 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: false, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }
    : { viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3 };
  const ctx = await browser.newContext({ ...opts, locale: 'en-US', timezoneId: 'Europe/Madrid', ...(state ? { storageState: state } : {}) });
  await ctx.addInitScript(CURSOR_JS);
  return ctx;
}

/** Records page frames via CDP screencast into dir/frames, with timestamps and markers in dir/index.json. */
export async function startRecording(page, dir, { mobile = false } = {}) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(`${dir}/frames`, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  const markers = [];
  let t0 = null;
  let n = 0;
  let running = true;
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    if (!running) return;
    const ts = metadata.timestamp;
    if (t0 === null) t0 = ts;
    const file = `${String(n++).padStart(5, '0')}.jpg`;
    fs.writeFileSync(`${dir}/frames/${file}`, Buffer.from(data, 'base64'));
    frames.push({ t: +(ts - t0).toFixed(4), file });
  });
  const size = mobile ? { maxWidth: 1000, maxHeight: 2150 } : { maxWidth: 1920, maxHeight: 1080 };
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1, ...size });
  const wall0 = Date.now();
  return {
    mark(name) { markers.push({ name, t: (Date.now() - wall0) / 1000 }); console.log('  mark', name, ((Date.now() - wall0) / 1000).toFixed(2)); },
    async stop() {
      running = false;
      await cdp.send('Page.stopScreencast').catch(() => {});
      fs.writeFileSync(`${dir}/index.json`, JSON.stringify({ frames, markers, duration: (Date.now() - wall0) / 1000 }, null, 1));
      console.log(`  ${dir}: ${frames.length} frames over ${((Date.now() - wall0) / 1000).toFixed(1)}s`);
    },
  };
}

/** Keeps the screencast producing frames even when the page is static (screencast only emits on repaint). */
export async function keepAlive(page) {
  await page.evaluate(() => {
    if (document.getElementById('__promo_tick')) return;
    const d = document.createElement('div');
    d.id = '__promo_tick';
    Object.assign(d.style, { position: 'fixed', right: '0', bottom: '0', width: '1px', height: '1px', zIndex: 2147483647, pointerEvents: 'none' });
    document.documentElement.appendChild(d);
    let i = 0;
    setInterval(() => { d.style.opacity = (i++ % 2) ? '0.01' : '0.02'; }, 33);
  }).catch(() => {});
}

export async function moveTo(page, target, { steps = 28, pause = 120 } = {}) {
  let x, y;
  if (typeof target === 'string' || target?.boundingBox) {
    const loc = typeof target === 'string' ? page.locator(target).first() : target;
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const b = await loc.boundingBox();
    if (!b) throw new Error('no box for ' + target);
    x = b.x + Math.min(b.width / 2, 60 + b.width * 0.15);
    y = b.y + b.height / 2;
  } else ({ x, y } = target);
  const from = await page.evaluate(() => window.__promoPos || { x: 720, y: 400 });
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await sleep(14);
  }
  await sleep(pause);
  return { x, y };
}

export async function clickOn(page, target, opts = {}) {
  await moveTo(page, target, opts);
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
}

export async function typeSlow(page, text, delay = 55) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(delay + Math.random() * 40);
  }
}

export async function smoothScroll(page, dy, ms = 1200) {
  const steps = Math.round(ms / 16);
  let done = 0;
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const e = (1 - Math.cos(Math.PI * k)) / 2;
    const target = Math.round(dy * e);
    await page.mouse.wheel(0, target - done);
    done = target;
    await sleep(16);
  }
}

export async function settle(page, ms = 600) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await sleep(ms);
}
