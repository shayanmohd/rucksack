/* Review pass 3: WCAG AA on every text and control that carries meaning.
   Colours are read from the real computed styles and composited against the
   real painted backgrounds, walking up the ancestors until something opaque. */
const L = require('./review-lib');

module.exports = async ({ page, wait, click, log }) => {
  await L.boot(page, { steps: 0 });
  await L.onboard(page, click, wait, { name: 'Ines' });
  await page.evaluate(() => {
    const t = Store.today();
    for (let i = 60; i >= 0; i--) Store.setSteps(Store.addDays(t, -i), i % 8 === 2 ? 200 : 9600 + (i % 5) * 800);
    Store.all().camp = { km: Store.totalKm() - 4, d: t };
    Store.save();
    let g = 0; while (g++ < 30) { const p = Store.pendingEncounters(); if (!p.length) break; Store.meet(p[0]); }
  });

  const measure = async (where) => page.evaluate((where) => {
    function parse(c) {
      const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
      const a = m[1].split(',').map(x => parseFloat(x));
      return { r: a[0], g: a[1], b: a[2], a: a.length > 3 ? a[3] : 1 };
    }
    function over(fg, bg) {
      const a = fg.a;
      return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
    }
    function lum(c) {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    }
    function ratio(a, b) { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); }
    /* Every colour an element is painted on: its own background-colour, every
       stop of a background gradient, and the same for each ancestor until one
       of them is opaque. A gradient stop that is not opaque is composited on
       what is under it, so a translucent bar over paper is measured honestly. */
    function stopsOf(st) {
      const out = [];
      const c = parse(st.backgroundColor);
      if (c && c.a > 0) out.push(c);
      const img = st.backgroundImage || '';
      if (img.indexOf('gradient') >= 0) {
        const m = img.match(/rgba?\([^)]+\)/g) || [];
        m.forEach((x) => { const p = parse(x); if (p && p.a > 0) out.push(p); });
      }
      return out;
    }
    function bgsOf(el) {
      let layers = [], n = el, floor = null;
      while (n && n !== document.documentElement) {
        const st = getComputedStyle(n);
        const s = stopsOf(st);
        if (s.length) layers.push(s);
        if (s.some(x => x.a === 1)) { floor = true; break; }
        n = n.parentElement;
      }
      if (!floor) layers.push([{ r: 242, g: 232, b: 211, a: 1 }]);
      // every combination is too many; take each layer's stops against the
      // composite of the opaque layers under it, which is the honest range
      let base = { r: 242, g: 232, b: 211, a: 1 };
      for (let i = layers.length - 1; i >= 1; i--) {
        const op = layers[i].filter(x => x.a === 1);
        if (op.length) { base = op[0]; }
        else base = over(layers[i][0], base);
      }
      return layers[0].map(s => (s.a === 1 ? s : over(s, base)));
    }
    const out = [];
    const sel = 'p, h1, h2, b, span, label, button, input, .fine, .k, .eyebrow, .lede, .ob-kicker, .chapter, .sect-note, .entry-body, .ribbon-ends, .mt-km, .lrow span';
    document.querySelectorAll(sel).forEach((el) => {
      let p = el; while (p) { if (p.hidden) return; p = p.parentElement; }
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      const txt = (el.textContent || '').trim();
      if (!txt && el.tagName !== 'INPUT') return;
      // only leaf-ish nodes, so a wrapper is not measured for its children's text
      if (el.children.length && el.tagName !== 'BUTTON' && el.tagName !== 'LABEL') {
        let own = ''; el.childNodes.forEach(n => { if (n.nodeType === 3) own += n.textContent.trim(); });
        if (!own) return;
      }
      const st = getComputedStyle(el);
      const fgc = parse(st.color); if (!fgc) return;
      const bgs = bgsOf(el);
      const px = parseFloat(st.fontSize);
      const wgt = parseInt(st.fontWeight, 10) || 400;
      const large = px >= 24 || (px >= 18.66 && wgt >= 700);
      const need = large ? 3 : 4.5;
      let cr = 99, bg = bgs[0];
      bgs.forEach((b) => { const r2 = ratio(over(fgc, b), b); if (r2 < cr) { cr = r2; bg = b; } });
      if (cr < need) {
        out.push({ where, sel: (el.id ? '#' + el.id : el.tagName + '.' + (typeof el.className === 'string' ? el.className : '')).slice(0, 48),
                   text: txt.slice(0, 34), px: px, ratio: +cr.toFixed(2), need: need,
                   color: st.color, on: 'rgb(' + [bg.r, bg.g, bg.b].map(Math.round).join(',') + ')' });
      }
    });
    return out;
  }, where);

  const bad = [];
  for (const v of ['camp', 'map', 'journal', 'pack', 'ledger']) {
    await click(`.tab[data-view="${v}"]`); await wait(1200);
    (await measure(v)).forEach(x => bad.push(x));
    // and the bottom of each scroller, where the settings and about text live
    await page.evaluate(() => { const sc = document.querySelector('.view:not([hidden]) .scroller'); if (sc) sc.scrollTop = sc.scrollHeight; });
    await wait(400);
    (await measure(v + '-bottom')).forEach(x => bad.push(x));
  }
  // the sheet
  await click('.tab[data-view="camp"]'); await wait(600);
  await page.evaluate(() => { const e = Store.pendingEncounters()[0] || Encounters.LIST[0]; App.openEncounter(e); });
  await wait(700);
  (await measure('sheet')).forEach(x => bad.push(x));
  await page.evaluate(() => App.closeSheet()); await wait(300);
  // the toast
  await page.evaluate(() => App.toast('measured'));
  await wait(300);
  (await measure('toast')).forEach(x => bad.push(x));

  const seen = new Set(), uniq = [];
  bad.forEach(b => { const k = b.sel + b.text + b.ratio; if (!seen.has(k)) { seen.add(k); uniq.push(b); } });
  uniq.forEach(b => log(JSON.stringify(b)));
  log('below AA: ' + uniq.length);
  if (uniq.length) throw new Error(uniq.length + ' contrast failures');
};
