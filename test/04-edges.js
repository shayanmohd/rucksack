/* The awkward inputs: empty, huge, zero, negative, a very long name, double
   taps on every primary button, and a fast rotation through the screens. */
const L = require('./lib');
const Store = { MAX: 120000 };

module.exports = async ({ page, shot, wait, click, text, log, errors }) => {
  /* Double taps on the onboarding buttons: the last one starts the app, and
     starting it twice would bind the map gestures twice. */
  await L.boot(page, { steps: 0 });
  await wait(500);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { const b = document.querySelector('#obNext'); b.click(); b.click(); });
    await wait(200);
  }
  await page.evaluate(() => { const b = document.querySelector('#obSensor'); b.click(); b.click(); });
  await wait(900);
  await page.evaluate(() => { const b = document.querySelector('#obNext'); b.click(); b.click(); b.click(); });
  await wait(900);
  const rushed = await page.evaluate(() => ({
    onboarded: Store.all().onboarded,
    tabsShown: !document.querySelector('#tabs').hidden,
    obHidden: document.querySelector('#onboard').hidden,
    step: document.querySelectorAll('.ob-card:not([hidden])').length
  }));
  log('onboarding double taps: ' + JSON.stringify(rushed));
  if (!rushed.onboarded || !rushed.tabsShown || !rushed.obHidden) throw new Error('double taps broke the onboarding');
  await shot('29-rushed-onboarding');

  await L.boot(page, { seed: L.crossing(L.todayYmd()), steps: 0, available: false });
  await wait(900);
  await click('.tab[data-view="ledger"]'); await wait(900);

  async function saveSteps(v) {
    await page.evaluate((v) => { document.querySelector('#manualSteps').value = v; }, v);
    await click('#manualSave'); await wait(240);
    return await page.evaluate(() => ({
      today: Store.stepsOn(Store.today()),
      err: document.querySelector('#manualErr').hidden ? null : document.querySelector('#manualErr').textContent
    }));
  }
  const before = await page.evaluate(() => Store.stepsOn(Store.today()));
  const r = {};
  r.empty = await saveSteps('');
  r.negative = await saveSteps('-500');
  r.zero = await saveSteps('0');
  r.huge = await saveSteps('999999999');
  r.junk = await saveSteps('12abc');
  r.decimal = await saveSteps('4500.7');
  for (const k in r) log(k.padEnd(9) + JSON.stringify(r[k]));
  await shot('30-ledger-after-edges');
  if (!r.empty.err) throw new Error('an empty step count saved silently');
  if (r.empty.today !== before) throw new Error('an empty step count changed the ledger');
  if (!r.huge.err) throw new Error('999,999,999 steps was accepted');
  if (r.huge.today > Store.MAX) throw new Error('an impossible step count was written');
  if (r.zero.err) throw new Error('zero steps was rejected, and a rest day is a real day');
  if (r.decimal.today !== 4500) throw new Error('4500.7 should count as 4,500 steps');

  const capped = await page.evaluate(() => {
    Store.setSteps(Store.today(), 999999999);
    return { km: Store.kmOn(Store.today()), capped: Store.dayOf(Store.today()).capped, total: Store.totalKm() };
  });
  log('cap holds: ' + JSON.stringify(capped));
  if (capped.km > 40.001) throw new Error('day cap breached');

  // a very long name, and an empty one
  await page.evaluate(() => { document.querySelector('#setName').value = 'A'.repeat(200); });
  await click('#setNameSave'); await wait(200);
  log('long name stored as: ' + JSON.stringify(await page.evaluate(() => Store.all().name)));
  await page.evaluate(() => { document.querySelector('#setName').value = '   '; });
  await click('#setNameSave'); await wait(200);
  log('blank name stored as: ' + JSON.stringify(await page.evaluate(() => Store.all().name)));
  await click('.tab[data-view="pack"]'); await wait(900);
  await shot('31-pack-blank-name');

  // rapid double taps on every primary button
  await click('.tab[data-view="camp"]'); await wait(700);
  const kmBefore = await page.evaluate(() => Store.totalKm());
  await page.evaluate(() => {
    const b = document.querySelector('#breakCamp');
    if (b && !document.querySelector('#arriveBox').hidden) { b.click(); b.click(); b.click(); }
  });
  await wait(700);
  const kmAfter = await page.evaluate(() => Store.totalKm());
  if (Math.abs(kmAfter - kmBefore) > 0.001) throw new Error('break camp changed the distance');
  log('triple break camp kept km at ' + kmAfter);

  // an encounter opened three times must be recorded once
  const dbl = await page.evaluate(() => {
    const e = Store.pendingEncounters()[0] || Encounters.LIST[0];
    App.openEncounter(e); App.openEncounter(e); App.openEncounter(e);
    App.closeSheet();
    return { id: e.id, met: Store.all().met[e.id], keeps: Object.keys(Store.all().keeps).length };
  });
  log('triple open: ' + JSON.stringify(dbl));

  // rotate through the screens fast
  await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) for (const v of ['camp', 'map', 'journal', 'pack', 'ledger']) App.go(v);
  });
  await wait(1200);
  await shot('32-after-fast-rotation');

  // double tap the tabs themselves
  for (const v of ['map', 'journal', 'pack', 'ledger', 'camp']) {
    await page.evaluate((v) => {
      const t = document.querySelector(`.tab[data-view="${v}"]`); t.click(); t.click();
    }, v);
    await wait(150);
  }
  await wait(900);
  await shot('33-after-double-tabs');

  // erase is two-step and really erases
  await click('.tab[data-view="ledger"]'); await wait(700);
  await click('#eraseBtn'); await wait(200);
  log('erase armed label: ' + (await page.evaluate(() => document.querySelector('#eraseBtn').textContent)));
  const stillThere = await L.db(page);
  if (!stillThere) throw new Error('one tap erased everything');
  await shot('34-erase-armed');

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
};
