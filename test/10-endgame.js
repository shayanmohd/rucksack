/* The far end of the road, and the clock behaving badly.
   Walking all 3,500 km is the whole promise of the app, so the arrival has to
   render: no NaN, no blank map, no waypoint that is still "ahead". Then a
   phone whose clock has been set backwards, and a very long ledger. */
const L = require('./lib');

module.exports = async ({ page, shot, wait, click, text, log, errors }) => {
  await L.boot(page, { seed: L.crossing(L.todayYmd()), steps: 0 });
  await wait(900);

  // walk the whole continent and a little past it
  await page.evaluate(() => {
    const t = Store.today();
    for (let i = 340; i >= 0; i--) Store.setSteps(Store.addDays(t, -i), 14000);
    Store.all().camp = { km: Store.totalKm(), d: t };
    Store.save();
    let g = 0; while (g++ < 90) { const p = Store.pendingEncounters(); if (!p.length) break; Store.meet(p[0]); }
    App.refresh();
  });
  await wait(1300);
  const end = await page.evaluate(() => ({
    total: Store.totalKm(),
    place: document.querySelector('#campPlace').textContent,
    ahead: document.querySelector('#aheadLine').textContent,
    pct: document.querySelector('#ribbonPct').textContent,
    forge: document.querySelector('#forgeLine').textContent,
    region: Content.regionAt(Store.totalKm()).name
  }));
  log('end of the road: ' + JSON.stringify(end));
  if (end.total < 3500) throw new Error('the seed did not reach the end');
  if (/NaN|undefined/.test(JSON.stringify(end))) throw new Error('the arrival renders NaN');
  if (!/finished|walked all of it/i.test(end.ahead)) throw new Error('a waypoint is still ahead past the end: ' + end.ahead);
  await shot('80-end-camp');

  await click('.tab[data-view="map"]'); await wait(1500);
  const map = await page.evaluate(() => {
    const p = Atlas.at(Store.totalKm());
    return { you: [Math.round(p.x), Math.round(p.y)], km: document.querySelector('#mapKm').textContent,
             foot: document.querySelector('#mapFoot').textContent };
  });
  log('map at the end: ' + JSON.stringify(map));
  if (!isFinite(map.you[0]) || !isFinite(map.you[1])) throw new Error('the wanderer is nowhere on the map');
  if (/3,5\d\d of 3,500/.test(map.km) === false && !/^3,500 of 3,500/.test(map.km)) throw new Error('km readout past the end: ' + map.km);
  await shot('81-end-map');
  await click('#mapFit'); await wait(1400);
  await shot('82-end-map-fit');

  for (const v of ['journal', 'pack', 'ledger']) {
    await click(`.tab[data-view="${v}"]`); await wait(1500);
    await shot('83-end-' + v);
  }
  const pack = await text('#packLine');
  log('pack at the end: ' + pack);

  // a clock set backwards: today is earlier than the first day on the road
  await page.evaluate(() => {
    const t = Store.today();
    Store.all().start = Store.addDays(t, 400);
    Store.save();
    App.go('camp'); App.refresh();
  });
  await wait(900);
  const back = await page.evaluate(() => ({
    day: document.querySelector('#campDay').textContent,
    streak: document.querySelector('#figStreak').textContent,
    st: Store.streak().current
  }));
  log('clock set backwards: ' + JSON.stringify(back));
  if (/NaN/.test(back.day) || /NaN/.test(back.streak)) throw new Error('a backwards clock renders NaN');
  await shot('84-clock-backwards');

  // and a ledger with a gap of years in it
  await page.evaluate(() => {
    Store.all().start = null;
    Store.setSteps('2019-04-02', 9000);
    Store.setSteps(Store.today(), 7000);
    Store.save();
    App.refresh();
  });
  await wait(1200);
  const old = await page.evaluate(() => ({ start: Store.all().start, streak: Store.streak().current, days: Store.dayKeys().length }));
  log('six year gap: ' + JSON.stringify(old));
  await click('.tab[data-view="journal"]'); await wait(1400);
  await shot('85-long-gap-journal');
  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
};
