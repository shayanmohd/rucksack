/* Review pass 9: the map's camera. "All" must show the whole road inside the
   band that is actually visible between the region plate and the waypoint bar,
   with the safe-area insets set. */
const L = require('./review-lib');

module.exports = async ({ page, shot, wait, click, log, errors }) => {
  const fail = [];
  await L.boot(page, { steps: 0, sat: '48px', sab: '34px' });
  await L.onboard(page, click, wait, { name: 'Ines' });
  await page.evaluate(() => {
    const t = Store.today();
    for (let i = 300; i >= 0; i--) Store.setSteps(Store.addDays(t, -i), 9000);
    Store.all().camp = { km: Store.totalKm() - 5, d: t };
    Store.save();
  });
  await click('.tab[data-view="map"]'); await wait(1600);
  await click('#mapFit'); await wait(1600);
  await shot('r9-map-fit');

  const seen = await page.evaluate(() => {
    const out = { hidden: [], visible: 0 };
    for (let km = 0; km <= Content.TOTAL_KM; km += 25) {
      if (MapView.seesKm(km)) out.visible++; else out.hidden.push(km);
    }
    return out;
  });
  log('fit: ' + seen.visible + ' of ' + (seen.visible + seen.hidden.length) + ' sample points inside the visible band');
  if (seen.hidden.length) log('  outside at km: ' + seen.hidden.slice(0, 14).join(', '));
  if (seen.hidden.length) fail.push(seen.hidden.length + ' points of the road fall outside the visible band on "All"');

  // "me" must put the wanderer somewhere a thumb can see
  await click('#mapMe'); await wait(1200);
  await shot('r9-map-me');
  const me = await page.evaluate(() => ({ sees: MapView.seesKm(Store.totalKm()), scale: MapView.scale() }));
  log('wanderer visible after "me": ' + JSON.stringify(me));
  if (!me.sees) fail.push('the wanderer sits outside the visible band after "me"');

  // zoom in and out repeatedly: no errors, no runaway scale
  for (let i = 0; i < 6; i++) { await click('#mapIn'); await wait(120); }
  for (let i = 0; i < 12; i++) { await click('#mapOut'); await wait(120); }
  await wait(900);
  await shot('r9-map-zoomed-out');
  const sc = await page.evaluate(() => MapView.scale());
  log('scale after six in and twelve out: ' + sc);
  if (!(sc > 0.01 && sc < 100)) fail.push('the map scale ran away: ' + sc);

  log('page errors: ' + errors.length);
  if (errors.length) fail.push(errors.length + ' page errors');
  if (fail.length) throw new Error('MAP FAILURES: ' + fail.join(' | '));
};
