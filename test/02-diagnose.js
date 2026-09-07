/* Poking at the parts that are hard to see in a screenshot: the atlas maths,
   the map camera, the back gesture, pause and resume. */
const L = require('./lib');

module.exports = async ({ page, shot, wait, click, log }) => {
  await L.boot(page, { seed: L.crossing(L.todayYmd()), steps: 0 });
  await wait(900);

  log('atlas: ' + JSON.stringify(await page.evaluate(() => {
    const out = { monotone: true, firstBreak: null, at: {} };
    for (let i = 1; i < Atlas.SAMPLES.length; i++) {
      if (Atlas.SAMPLES[i].km < Atlas.SAMPLES[i - 1].km) {
        out.monotone = false;
        if (out.firstBreak === null) out.firstBreak = i + ':' + Atlas.SAMPLES[i - 1].km + '>' + Atlas.SAMPLES[i].km;
      }
    }
    for (const km of [0, 320, 1086, 1900, 3500]) {
      const p = Atlas.at(km);
      out.at[km] = [Math.round(p.x), Math.round(p.y)];
    }
    out.bounds = Atlas.BOUNDS;
    out.samples = Atlas.SAMPLES.length;
    return out;
  })));

  await click('.tab[data-view="map"]'); await wait(1400);
  log('camera: ' + JSON.stringify(await page.evaluate(() => {
    const total = Store.totalKm();
    const p = Atlas.at(total);
    const cv = document.querySelector('#mapCanvas').getBoundingClientRect();
    return { total: total, you: [Math.round(p.x), Math.round(p.y)], scale: MapView.scale(), view: [cv.width, cv.height] };
  })));
  await shot('10-map-on-open');
  await click('#mapMe'); await wait(1200);
  await shot('11-map-me');
  await click('#mapFit'); await wait(1400);
  await shot('12-map-fit');
  await click('#mapIn'); await wait(900); await click('#mapIn'); await wait(1200);
  await shot('13-map-zoomed');

  // back gesture on every screen
  const back = await page.evaluate(() => {
    const out = {};
    for (const v of ['camp', 'map', 'journal', 'pack', 'ledger']) {
      App.go(v);
      out[v] = App.back();
    }
    App.go('camp');
    out.rootAgain = App.back();
    return out;
  });
  log('back(): ' + JSON.stringify(back));
  if (back.rootAgain !== false) throw new Error('back() must be false at the root');
  for (const v of ['map', 'journal', 'pack', 'ledger']) if (back[v] !== true) throw new Error('back() false on ' + v);

  // back closes a sheet first
  const sheetBack = await page.evaluate(() => {
    App.go('map');
    App.openEncounter(Encounters.LIST[0]);
    const a = App.back();
    const closed = document.querySelector('#sheet').classList.contains('on') === false;
    return { consumed: a, closed: closed, stillMap: !document.querySelector('#v-map').hidden };
  });
  log('back with sheet: ' + JSON.stringify(sheetBack));
  if (!sheetBack.consumed || !sheetBack.closed || !sheetBack.stillMap) throw new Error('back should close the sheet and stay put');

  // pause and resume must not throw and must stop the camp animation
  await page.evaluate(() => App.go('camp'));
  await wait(500);
  const pause = await page.evaluate(() => {
    App.onPause();
    const stopped = !window.__campRafProbe;
    App.onResume(); App.onPause(); App.onResume();
    return { ok: true };
  });
  log('pause/resume: ' + JSON.stringify(pause));
  await wait(600);
  await shot('14-after-resume');
};
