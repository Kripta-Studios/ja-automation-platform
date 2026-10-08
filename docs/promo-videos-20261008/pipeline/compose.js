/* Deterministic frame renderer: window.renderFrame(t) lays out the whole trailer at time t (seconds). */
const W = 1920, H = 1080;
const T = window.TIMELINE;
const REC = window.RECORDINGS;
const stage = document.getElementById('stage');

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = k => 1 - Math.pow(1 - clamp(k), 3);
const easeInOut = k => { k = clamp(k); return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
const easeBack = k => { k = clamp(k); const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

function frameFor(rec, rt) {
  const fr = REC[rec].frames;
  let lo = 0, hi = fr.length - 1;
  if (rt <= fr[0][0]) return fr[0][1];
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (fr[mid][0] <= rt) lo = mid; else hi = mid - 1; }
  return fr[lo][1];
}

function recTime(s, lt) {
  const m = s.remap;
  if (!m) return (s.from || 0) + lt * (s.speed || 1);
  if (lt <= m[0][0]) return m[0][1];
  for (let i = 0; i < m.length - 1; i++) if (lt <= m[i + 1][0]) return lerp(m[i][1], m[i + 1][1], (lt - m[i][0]) / (m[i + 1][0] - m[i][0]));
  return m[m.length - 1][1] + (lt - m[m.length - 1][0]);
}

function keyed(keys, t) {
  // keys: [[time, ...values]]; eased interpolation between neighbours
  if (!keys || !keys.length) return null;
  if (t <= keys[0][0]) return keys[0].slice(1);
  for (let i = 0; i < keys.length - 1; i++) {
    const [ta, ...a] = keys[i], [tb, ...b] = keys[i + 1];
    if (t <= tb) { const k = easeInOut((t - ta) / (tb - ta)); return a.map((v, j) => lerp(v, b[j], k)); }
  }
  return keys[keys.length - 1].slice(1);
}

// ---------- background ----------
const bg = el('div', 'bg');
const g1 = el('div', 'glow'), g2 = el('div', 'glow'), grid = el('div', 'grid');
g1.style.background = 'radial-gradient(circle, rgba(214,42,42,.30), transparent 62%)';
g2.style.background = 'radial-gradient(circle, rgba(255,214,170,.12), transparent 62%)';
bg.append(grid, g1, g2);
stage.append(bg);
function renderBg(t) {
  g1.style.transform = `translate(${-300 + 260 * Math.sin(t * .23)}px, ${-200 + 180 * Math.cos(t * .17)}px)`;
  g2.style.transform = `translate(${900 + 240 * Math.cos(t * .19)}px, ${300 + 160 * Math.sin(t * .21)}px)`;
  grid.style.transform = `translate(${(t * 12) % 80}px, ${(t * 7) % 80}px)`;
}
if (T.brand === 'evocon') {
  document.documentElement.style.setProperty('--red', '#ff9347');
  document.documentElement.style.setProperty('--bg', '#141218');
  g1.style.background = 'radial-gradient(circle, rgba(255,147,71,.34), transparent 62%)';
  g2.style.background = 'radial-gradient(circle, rgba(120,96,160,.28), transparent 62%)';
  const extra = document.createElement('style');
  extra.textContent = '.title .kicker{color:#ff9347}.logo-card{width:1040px;height:220px;border-radius:32px}.logo-card img{width:960px;height:auto}.cta{background:#ff9347}.url-big{letter-spacing:0;font-size:36px;color:#ffd2b0}';
  document.head.appendChild(extra);
}

// ---------- segment builders ----------
function wordsHTML(text) {
  return text.split(' ').map(w => `<span>${w.replace(/\*(.+?)\*/g, '<em class="red" style="font-style:normal">$1</em>')}</span>`).join(' ');
}

function buildCaption(s) {
  if (!s.title) return null;
  const c = el('div', 'caption');
  c.innerHTML = `${s.chip ? `<span class="chip">${s.chip}</span>` : ''}<h2>${s.title}</h2>${s.sub ? `<p>${s.sub}</p>` : ''}`;
  if (s.captionRight) { c.style.left = 'auto'; c.style.right = '70px'; }
  return c;
}

function animateCaption(c, lt, dur) {
  if (!c) return;
  const kIn = easeOut((lt - 0.35) / 0.6), kOut = easeOut((dur - lt - 0.05) / 0.35);
  const k = Math.min(kIn, kOut);
  c.style.opacity = k;
  c.style.transform = `translateY(${(1 - kIn) * 50}px)`;
  const kids = c.children;
  for (let i = 0; i < kids.length; i++) {
    const ki = easeOut((lt - 0.45 - i * 0.12) / 0.55);
    kids[i].style.opacity = ki;
    kids[i].style.transform = `translateY(${(1 - ki) * 22}px)`;
  }
}

const builders = {
  scene(s) {
    const root = el('div', 'layer');
    const win = el('div', 'win');
    const ww = s.sharp ? W : (s.winW || 1600), vh = s.sharp ? H : ww * 9 / 16;
    Object.assign(win.style, { width: ww + 'px', height: (s.sharp ? vh : vh + 46) + 'px', left: (W - ww) / 2 + 'px', top: (H - (s.sharp ? vh : vh + 46)) / 2 + 'px', borderRadius: s.sharp ? '0' : '18px' });
    const bar = el('div', 'bar', `<i class="dot" style="background:#ee5f57"></i><i class="dot" style="background:#f5bd30"></i><i class="dot" style="background:#5fc93f"></i><div class="url">&#128274; <b>https://</b>${s.url || ''}</div>`);
    if (s.sharp) bar.style.display = 'none';
    const view = el('div', 'view'); view.style.top = s.sharp ? '0' : '46px';
    const img = el('img'); view.append(img);
    const blurs = (s.blur || []).map(b => { const d = el('div', 'blurbox'); view.append(d); return [b, d]; });
    win.append(bar, view);
    root.append(win);
    const cap = buildCaption(s);
    if (cap) root.append(cap);
    const vs = ww / W;
    return {
      root, async render(lt, dur) {
        const rt = recTime(s, lt);
        const src = `rec/${s.rec}/frames/${frameFor(s.rec, rt)}`;
        if (img.getAttribute('src') !== src) { img.src = src; await img.decode().catch(() => {}); }
        const z = keyed(s.zoom, rt) || [1, W / 2, H / 2];
        const [zs, zx, zy] = z;
        const sc = vs * zs;
        const vw = ww, vhh = vh;
        let ox = vw / 2 - zx * sc, oy = vhh / 2 - zy * sc;
        ox = clamp(ox, vw - W * sc, 0); oy = clamp(oy, vhh - H * sc, 0);
        img.style.transform = `translate(${ox}px, ${oy}px) scale(${sc})`;
        for (const [b, d] of blurs) {
          const on = rt >= (b.from ?? -1) && rt <= (b.to ?? 1e9);
          d.style.display = on ? 'block' : 'none';
          Object.assign(d.style, { left: ox + b.x * sc + 'px', top: oy + b.y * sc + 'px', width: b.w * sc + 'px', height: b.h * sc + 'px' });
        }
        if (!s.sharp) {
          const kin = easeOut(lt / 0.9);
          const push = 1 + 0.025 * (lt / dur);
          win.style.transform = `perspective(2400px) rotateX(${(1 - kin) * 10}deg) translateY(${(1 - kin) * 60}px) scale(${(0.94 + 0.06 * kin) * push})`;
        }
        animateCaption(cap, lt, dur);
      },
    };
  },

  phone(s) {
    const root = el('div', 'layer');
    const ph = el('div', 'phone');
    Object.assign(ph.style, { left: (s.phoneX ?? 1260) + 'px', top: (H - 920) / 2 + 'px' });
    const scr = el('div', 'screen'); const notch = el('div', 'notch');
    const img = el('img'); scr.append(img); ph.append(notch, scr);
    const txt = el('div', 'side-text');
    Object.assign(txt.style, { left: '150px', top: '250px' });
    txt.innerHTML = `${s.chip ? `<span class="chip">${s.chip}</span>` : ''}<h2 style="margin-top:26px">${s.title}</h2>${s.sub ? `<p>${s.sub}</p>` : ''}${s.bullets ? `<ul>${s.bullets.map(b => `<li><i></i>${b}</li>`).join('')}</ul>` : ''}`;
    root.append(txt, ph);
    return {
      root, async render(lt, dur) {
        const rt = recTime(s, lt);
        const src = `rec/${s.rec}/frames/${frameFor(s.rec, rt)}`;
        if (img.getAttribute('src') !== src) { img.src = src; await img.decode().catch(() => {}); }
        const k = easeOut(lt / 1.0);
        ph.style.transform = `translateY(${(1 - k) * 260}px) rotate(${(1 - k) * 6 + Math.sin(lt * .8) * .6}deg)`;
        ph.style.opacity = clamp(lt / .4);
        const kids = txt.children;
        for (let i = 0; i < kids.length; i++) {
          const ki = easeOut((lt - .3 - i * .15) / .6);
          kids[i].style.opacity = ki; kids[i].style.transform = `translateX(${(1 - ki) * -50}px)`;
        }
        const lis = txt.querySelectorAll('li');
        lis.forEach((li, i) => { const ki = easeOut((lt - 1.2 - i * .35) / .5); li.style.opacity = ki; li.style.transform = `translateX(${(1 - ki) * -30}px)`; });
      },
    };
  },

  title(s) {
    const root = el('div', 'layer');
    const box = el('div', 'title');
    if (s.logo) { const lc = el('div', 'logo-card', `<img src="${T.brand === 'evocon' ? 'assets/logo-evocon.png' : 'assets/logo.png'}">`); lc.style.marginBottom = '50px'; box.append(lc); }
    if (s.kicker) box.append(el('div', 'kicker', s.kicker));
    for (const line of s.lines || []) { const l = el('div', 'line', wordsHTML(line)); if (s.size) l.style.fontSize = s.size + 'px'; box.append(l); }
    if (s.sub) box.append(el('div', 'sub', s.sub));
    if (s.url) box.append(el('div', 'url-big', s.url));
    if (s.cta) box.append(el('div', 'cta', s.cta));
    root.append(box);
    const words = [...box.querySelectorAll('.line span')];
    const others = [...box.children].filter(c => !c.classList.contains('line'));
    return {
      root, async render(lt, dur) {
        words.forEach((w, i) => {
          const k = easeOut((lt - .15 - i * (s.stagger ?? .09)) / .55);
          w.style.opacity = k; w.style.transform = `translateY(${(1 - k) * 70}px)`; w.style.filter = `blur(${(1 - k) * 14}px)`;
        });
        others.forEach((o, i) => {
          const base = o.classList.contains('logo-card') ? 0 : o.classList.contains('kicker') ? .05 : .5 + words.length * (s.stagger ?? .09) + i * .15;
          const k = o.classList.contains('logo-card') ? easeBack((lt - base) / .8) : easeOut((lt - base) / .6);
          o.style.opacity = clamp(k); o.style.transform = o.classList.contains('logo-card') ? `scale(${.4 + .6 * k}) rotate(${(1 - k) * -8}deg)` : `translateY(${(1 - k) * 30}px)`;
        });
        const out = clamp((dur - lt) / .35);
        box.style.opacity = s.noFadeOut ? 1 : out;
        box.style.transform = `scale(${1 + .03 * lt / dur})`;
      },
    };
  },

  stats(s) {
    const root = el('div', 'layer');
    const head = el('div', 'heading', s.heading); head.style.top = '150px';
    const wrap = el('div', 'stats'); wrap.style.top = '120px';
    const items = s.items.map(([n, l]) => { const c = el('div', 'stat', `<div class="n">0</div><div class="l">${l}</div>`); wrap.append(c); return [c, n]; });
    const sub = el('div', 'heading', s.sub || ''); Object.assign(sub.style, { top: '860px', fontSize: '30px', fontWeight: 500, color: '#cfcac0', letterSpacing: '.01em', fontFamily: "'Geist Mono', monospace" });
    root.append(head, wrap, sub);
    return {
      root, async render(lt, dur) {
        const hk = easeOut(lt / .6); head.style.opacity = hk; head.style.transform = `translateY(${(1 - hk) * 40}px)`;
        const sk = easeOut((lt - 2.6) / .7); sub.style.opacity = sk; sub.style.transform = `translateY(${(1 - sk) * 20}px)`;
        items.forEach(([c, n], i) => {
          const st = .3 + i * .45, k = easeBack((lt - st) / .7);
          c.style.opacity = clamp((lt - st) / .3); c.style.transform = `translateY(${(1 - k) * 120}px) scale(${.85 + .15 * k})`;
          const cnt = easeOut((lt - st) / 1.6);
          c.querySelector('.n').textContent = Math.round(n * cnt);
        });
        root.style.opacity = clamp((dur - lt) / .3);
      },
    };
  },

  roles(s) {
    const root = el('div', 'layer');
    const head = el('div', 'heading', s.heading); head.style.top = '110px';
    const grid = el('div', 'roles');
    const cards = s.items.map(([img, tag]) => { const c = el('div', 'role', `<img src="${img}"><div class="tag">${tag}</div>`); grid.append(c); return c; });
    root.append(head, grid);
    return {
      root, async render(lt, dur) {
        const hk = easeOut(lt / .6); head.style.opacity = hk; head.style.transform = `translateY(${(1 - hk) * 40}px)`;
        cards.forEach((c, i) => {
          const k = easeBack((lt - .2 - i * .12) / .7);
          c.style.opacity = clamp((lt - .2 - i * .12) / .25);
          c.style.transform = `translateY(${(1 - k) * 160 + Math.sin(lt * 1.2 + i) * 4}px) rotate(${(1 - k) * (i % 2 ? 4 : -4)}deg) scale(${.9 + .1 * k})`;
        });
        root.style.opacity = clamp((dur - lt) / .3);
      },
    };
  },
};

const segs = T.segments.map(s => { const b = builders[s.type](s); b.root.style.display = 'none'; stage.append(b.root); return { s, ...b }; });
const flash = el('div', 'flash'); stage.append(flash);
const fadeBlack = el('div', 'flash'); fadeBlack.style.background = '#000'; stage.append(fadeBlack);

window.renderFrame = async function (t) {
  renderBg(t);
  const jobs = [];
  for (const g of segs) {
    const { s } = g;
    const on = t >= s.start && t < s.end;
    g.root.style.display = on ? 'block' : 'none';
    if (!on) continue;
    const lt = t - s.start, dur = s.end - s.start;
    const tin = s.tin ?? .45;
    const k = easeOut(lt / tin);
    const style = s.enter || 'zoom';
    g.root.style.opacity = style === 'cut' ? 1 : clamp(lt / tin);
    g.root.style.transform = style === 'slide' ? `translateX(${(1 - k) * 220}px)` : style === 'zoom' ? `scale(${1.06 - .06 * k})` : '';
    g.root.style.filter = style === 'cut' || k >= 1 ? '' : `blur(${(1 - k) * 10}px)`;
    jobs.push(g.render(lt, dur));
  }
  await Promise.all(jobs);
  let f = 0;
  for (const ft of T.flashes || []) if (t >= ft && t < ft + .5) f = Math.max(f, .55 * (1 - (t - ft) / .5));
  flash.style.opacity = f;
  fadeBlack.style.opacity = clamp((t - (T.duration - 1.6)) / 1.6) + clamp(1 - t / .6);
};
window.composeReady = document.fonts.ready.then(() => true);
