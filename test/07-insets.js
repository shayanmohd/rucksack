/* Safe areas: a 48px status bar and a 34px gesture bar. Nothing may sit under
   either one, on any screen, including the onboarding and the sheet. */
const L = require('./lib');

const SAT = 48, SAB = 34;

module.exports = async ({ page, shot, wait, click, log }) => {
  await L.boot(page, { steps: 0, sat: SAT + 'px', sab: SAB + 'px' });
  await wait(600);
  await shot('50-inset-onboard');
  const obFoot = await page.evaluate(() => {
    const r = document.querySelector('.ob-foot').getBoundingClientRect();
    const b = document.querySelector('#obNext').getBoundingClientRect();
    return { footBottom: r.bottom, btnBottom: b.bottom, h: window.innerHeight };
  });
  log('onboard foot: ' + JSON.stringify(obFoot));
  if (obFoot.btnBottom > obFoot.h - SAB + 1) throw new Error('the onboarding button sits under the gesture bar');

  await L.onboard(page, click, wait, { name: 'Ines' });
  await page.evaluate(() => {
    const t = Store.today();
    for (let i = 40; i >= 0; i--) Store.setSteps(Store.addDays(t, -i), 8600);
    Store.all().camp = { km: Store.totalKm() - 5, d: t };
    Store.save();
    let g = 0; while (g++ < 40) { const p = Store.pendingEncounters(); if (!p.length) break; Store.meet(p[0]); }
    App.refresh();
  });
  await wait(900);

  const probes = [];
  for (const v of ['camp', 'map', 'journal', 'pack', 'ledger']) {
    await click(`.tab[data-view="${v}"]`); await wait(1200);
    await shot('51-inset-' + v);
    probes.push(await page.evaluate((v, SAT, SAB) => {
      const out = { view: v, under: [] };
      const H = window.innerHeight;
      const sel = {
        camp: ['.plate', '.camp-head h1', '.figs'],
        map: ['.map-top', '.map-tools', '.map-foot'],
        journal: ['.page-head h1'],
        pack: ['.wanderer'],
        ledger: ['.page-head h1']
      }[v];
      for (const s of sel) {
        const el = document.querySelector(s);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top < SAT - 0.5 && r.height > 0) out.under.push(s + ' top=' + Math.round(r.top));
        if (r.bottom > H - SAB + 0.5 && r.top < H - SAB) out.under.push(s + ' bottom=' + Math.round(r.bottom) + '/' + (H - SAB));
      }
      const tabs = document.querySelector('#tabs').getBoundingClientRect();
      const firstTab = document.querySelector('.tab').getBoundingClientRect();
      out.tabs = Math.round(tabs.bottom) + ' label bottom ' + Math.round(firstTab.bottom) + ' limit ' + (H - SAB);
      if (firstTab.bottom > H - SAB + 0.5) out.under.push('tab labels under the gesture bar');
      return out;
    }, v, SAT, SAB));
  }
  probes.forEach(p => log(JSON.stringify(p)));

  // the sheet
  await page.evaluate(() => { App.go('camp'); App.openEncounter(Encounters.LIST[1]); });
  await wait(600);
  await shot('52-inset-sheet');
  const sheet = await page.evaluate((SAB) => {
    const b = document.querySelector('#sheetClose').getBoundingClientRect();
    return { btnBottom: Math.round(b.bottom), limit: window.innerHeight - SAB };
  }, SAB);
  log('sheet close button: ' + JSON.stringify(sheet));
  if (sheet.btnBottom > sheet.limit + 0.5) throw new Error('the sheet button sits under the gesture bar');

  const bad = probes.filter(p => p.under.length);
  if (bad.length) throw new Error('content under a system bar: ' + JSON.stringify(bad));
};
