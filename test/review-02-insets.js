/* Review pass 2: --sat 48px and --sab 34px.
   Scrolling content is allowed to pass under the bars while it scrolls; what is
   not allowed is content that can never be brought clear of them. So the audit
   scrolls each screen to the very top and to the very bottom and measures the
   first and last thing on it, plus every piece of floating chrome. */
const L = require('./review-lib');

module.exports = async ({ page, shot, wait, click, log, errors }) => {
  const SAT = 48, SAB = 34;
  await L.boot(page, { steps: 0, sat: SAT + 'px', sab: SAB + 'px' });
  const fail = [];
  const push = (a) => a.forEach(x => fail.push(x));

  /* floating chrome: nothing fixed or absolutely placed may overlap a bar */
  const chrome = async (where, sels) => page.evaluate((SAT, SAB, where, sels) => {
    const bad = [], vh = window.innerHeight;
    sels.forEach((s) => {
      document.querySelectorAll(s).forEach((el) => {
        let p = el; while (p) { if (p.hidden) return; p = p.parentElement; }
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        // a bar may reach the screen edge as long as its padding keeps its own
        // content clear of the inset, which is exactly what the recipe asks for
        const st = getComputedStyle(el);
        const padTop = parseFloat(st.paddingTop) || 0, padBot = parseFloat(st.paddingBottom) || 0;
        if (r.top + padTop < SAT) bad.push(where + ' TOP ' + s + ' ink top=' + (r.top + padTop).toFixed(1));
        if (r.bottom - padBot > vh - SAB) bad.push(where + ' BOTTOM ' + s + ' ink bottom=' + (r.bottom - padBot).toFixed(1) + '/' + vh);
      });
    });
    return bad;
  }, SAT, SAB, where, sels);

  /* scroller ends: at scrollTop 0 the first child must clear the status bar,
     at the bottom the last child must clear the navigation bar */
  const ends = async (where) => {
    const r = await page.evaluate((SAT, SAB, where) => {
      const sc = document.querySelector('.view:not([hidden]) .scroller');
      if (!sc) return [];
      const bad = [], vh = window.innerHeight;
      sc.scrollTop = 0;
      const first = sc.firstElementChild;
      if (first) {
        const fr = first.getBoundingClientRect();
        if (fr.top < SAT - 0.5) bad.push(where + ' TOP first child top=' + fr.top.toFixed(1));
      }
      sc.scrollTop = sc.scrollHeight;
      let last = sc.lastElementChild;
      while (last && (last.hidden || last.getBoundingClientRect().height < 2)) last = last.previousElementSibling;
      if (last) {
        const lr = last.getBoundingClientRect();
        if (lr.bottom > vh - SAB + 0.5) bad.push(where + ' BOTTOM last child bottom=' + lr.bottom.toFixed(1) + '/' + vh);
      }
      sc.scrollTop = 0;
      return bad;
    }, SAT, SAB, where);
    return r;
  };

  await shot('r2-onboard-inset');
  push(await chrome('onboard-1', ['.ob-plate', '.ob-foot', '.ob-foot .btn', '.ob-dots']));
  await click('#obNext'); await click('#obNext'); await wait(300);
  await shot('r2-onboard3-inset');
  push(await chrome('onboard-3', ['.ob-foot .btn', '#obSensor', '#obManual']));

  await click('#obSensor'); await wait(800);
  const bl = await page.$('#obBacklog:not([hidden])'); if (bl) await click('#obSkip');
  await click('#obNext'); await page.type('#obName', 'Ines', { delay: 5 });
  await click('#obNext'); await wait(800);

  await page.evaluate(() => {
    const t = Store.today();
    for (let i = 90; i >= 0; i--) Store.setSteps(Store.addDays(t, -i), 9400 + (i % 5) * 700);
    Store.all().camp = { km: Store.totalKm() - 5, d: t };
    Store.save();
    let g = 0; while (g++ < 40) { const p = Store.pendingEncounters(); if (!p.length) break; Store.meet(p[0]); }
  });

  for (const v of ['camp', 'map', 'journal', 'pack', 'ledger']) {
    await click(`.tab[data-view="${v}"]`); await wait(1300);
    await shot('r2-' + v + '-inset');
    push(await ends(v));
    push(await chrome(v, ['#tabs .tab']));
    if (v === 'map') push(await chrome('map', ['.map-top', '.map-tools', '.tool', '.map-foot']));
  }

  // scrolled-to-the-bottom pictures, which is where a bottom inset bug shows
  for (const v of ['camp', 'journal', 'pack', 'ledger']) {
    await click(`.tab[data-view="${v}"]`); await wait(900);
    await page.evaluate(() => { const sc = document.querySelector('.view:not([hidden]) .scroller'); sc.scrollTop = sc.scrollHeight; });
    await wait(500);
    await shot('r2-' + v + '-inset-bottom');
  }

  await click('.tab[data-view="camp"]'); await wait(600);
  await page.evaluate(() => { const e = Store.pendingEncounters()[0] || Encounters.LIST[0]; App.openEncounter(e); });
  await wait(700);
  await shot('r2-sheet-inset');
  push(await chrome('sheet', ['.sheet-card', '#sheetClose']));
  await page.evaluate(() => App.closeSheet()); await wait(400);
  await page.evaluate(() => App.toast('the toast sits above the navigation bar'));
  await wait(400);
  await shot('r2-toast-inset');
  push(await chrome('toast', ['#toast']));

  log('inset problems: ' + fail.length);
  fail.slice(0, 24).forEach(f => log('  ' + f));
  log('page errors: ' + errors.length);
  if (fail.length) throw new Error(fail.length + ' safe-area problems');
};
