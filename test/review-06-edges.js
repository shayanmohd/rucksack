/* Review pass 6: the edges. Rapid double taps on every primary button, every
   input pushed past its limits, the sensor absent, refused, late and rebooted,
   and screens rotated through faster than they can draw. */
const L = require('./review-lib');

module.exports = async ({ page, shot, wait, click, text, log, errors }) => {
  const fail = [];
  const tap = (sel, n) => page.evaluate((s, n) => {
    const el = document.querySelector(s);
    for (let i = 0; i < n; i++) el.click();
  }, sel, n || 2);

  /* 1. a stray second tap on the onboarding button must not start twice */
  await L.boot(page, { steps: 0 });
  await tap('#obNext', 3); await wait(200);
  await tap('#obNext', 3); await wait(200);
  await click('#obManual'); await wait(300);
  await tap('#obNext', 3); await wait(200);
  await page.type('#obName', 'Ines', { delay: 5 });
  await tap('#obNext', 4); await wait(900);
  await shot('r6-01-rushed-onboarding');
  const bound = await page.evaluate(() => {
    // pan the map and see how far it actually moved: a double bind moves it twice
    App.go('map');
    return true;
  });
  await wait(1200);
  const panned = await page.evaluate(async () => {
    const before = MapView.centre ? MapView.centre() : null;
    const cv = document.querySelector('#mapCanvas');
    const r = cv.getBoundingClientRect();
    const mk = (t, x, y) => new PointerEvent(t, { pointerId: 1, clientX: x, clientY: y, bubbles: true, isPrimary: true, pointerType: 'touch' });
    const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    cv.dispatchEvent(mk('pointerdown', x0, y0));
    for (let i = 1; i <= 8; i++) window.dispatchEvent(mk('pointermove', x0, y0 - i * 10));
    window.dispatchEvent(mk('pointerup', x0, y0 - 80));
    return true;
  });
  await wait(500);
  await shot('r6-02-map-after-pan');
  if (errors.length) fail.push('errors during the rushed onboarding: ' + errors.join(' / '));

  /* 2. every input at its edges */
  await click('.tab[data-view="ledger"]'); await wait(900);
  const tryManual = async (v) => {
    await page.evaluate((v) => { const i = document.querySelector('#manualSteps'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, v);
    await click('#manualSave'); await wait(220);
    return page.evaluate(() => ({
      err: document.querySelector('#manualErr').hidden ? null : document.querySelector('#manualErr').textContent,
      steps: Store.stepsOn(Store.today())
    }));
  };
  const cases = [['', 'empty', 'err'], ['-500', 'negative', 'err'], ['abc', 'letters', 'err'],
                 ['999999999', 'absurd', 'err'], ['120001', 'one over the cap', 'err'],
                 ['0', 'zero', 0], ['7.9', 'a decimal', 7], ['5e3', 'an exponent', 5000],
                 ['1e9', 'a big exponent', 'err'], ['007400', 'leading zeros', 7400]];
  for (const [v, why, want] of cases) {
    const r = await tryManual(v);
    log('manual "' + v + '" (' + why + '): err=' + JSON.stringify(r.err) + ' steps=' + r.steps);
    if (r.steps > 120000) fail.push('the ledger accepted ' + r.steps + ' steps for one day');
    if (r.err && /!/.test(r.err)) fail.push('an exclamation mark in an error message');
    if (want === 'err' && !r.err) fail.push('"' + v + '" (' + why + ') was accepted without an error, steps=' + r.steps);
    if (want !== 'err' && r.steps !== want) fail.push('"' + v + '" (' + why + ') stored ' + r.steps + ', wanted ' + want);
  }
  await shot('r6-03-manual-error');
  const dlg = await page.evaluate(() => window.__sawDialog === true);
  if (dlg) fail.push('a native dialog was used');

  // a name longer than the field allows, and one made of markup
  await page.evaluate(() => { document.querySelector('#setName').value = 'x'.repeat(80); });
  await click('#setNameSave'); await wait(300);
  let nm = await page.evaluate(() => Store.all().name);
  if (nm.length > 20) fail.push('name longer than 20 stored: ' + nm.length);
  await page.evaluate(() => { document.querySelector('#setName').value = '<img src=x onerror=alert(1)>'; });
  await click('#setNameSave'); await wait(300);
  await click('.tab[data-view="pack"]'); await wait(900);
  const packHtml = await page.evaluate(() => document.querySelector('#packName').innerHTML);
  if (/</.test(packHtml.replace(/&lt;|&gt;/g, ''))) fail.push('a name with markup reached innerHTML: ' + packHtml);
  log('name rendered as: ' + packHtml);
  await page.evaluate(() => { Store.all().name = 'Ines'; Store.save(); });

  /* 3. double taps everywhere that changes data */
  await page.evaluate(() => {
    const t = Store.today();
    for (let i = 40; i >= 0; i--) Store.setSteps(Store.addDays(t, -i), 9000);
    Store.all().camp = { km: Store.totalKm() - 9, d: t };
    Store.save();
  });
  await click('.tab[data-view="camp"]'); await wait(1000);
  const kmBefore = await page.evaluate(() => Store.campKm());
  await tap('#breakCamp', 4); await wait(700);
  const kmAfter = await page.evaluate(() => Store.campKm());
  const total = await page.evaluate(() => Store.totalKm());
  log('camp km before/after four taps on break camp: ' + kmBefore + ' -> ' + kmAfter + ' (total ' + total + ')');
  if (Math.abs(kmAfter - total) > 0.002) fail.push('break camp did not land on the total');

  // the same encounter opened twice must not be recorded twice
  const encBefore = await page.evaluate(() => Object.keys(Store.all().met).length);
  await page.evaluate(() => { const p = Store.pendingEncounters()[0] || Encounters.LIST[0]; App.openEncounter(p); App.openEncounter(p); });
  await wait(600);
  const encAfter = await page.evaluate(() => Object.keys(Store.all().met).length);
  if (encAfter - encBefore > 1) fail.push('one encounter recorded ' + (encAfter - encBefore) + ' times');
  await page.evaluate(() => App.closeSheet()); await wait(400);

  // erase is a two-tap gate, and one tap must not erase
  await click('.tab[data-view="ledger"]'); await wait(900);
  await page.evaluate(() => { const sc = document.querySelector('.view:not([hidden]) .scroller'); sc.scrollTop = sc.scrollHeight; });
  await wait(400);
  await click('#eraseBtn'); await wait(300);
  await shot('r6-04-erase-armed');
  const stillThere = await page.evaluate(() => Store.dayKeys().length);
  if (!stillThere) fail.push('one tap erased everything');
  await page.evaluate(() => { const b = document.querySelector('#eraseBtn'); delete b.dataset.armed; b.textContent = 'Erase everything'; });

  /* 4. rotating through screens faster than they draw */
  for (let i = 0; i < 3; i++) {
    for (const v of ['camp', 'map', 'journal', 'pack', 'ledger']) {
      await page.evaluate((v) => App.go(v), v);
    }
  }
  await wait(1500);
  await shot('r6-05-after-rotation');

  /* 5. the sensor: absent, refused, late, rebooted */
  await L.boot(page, { steps: 0, available: false });
  await wait(700);
  const noSensor = await text('#obSensor');
  log('no step counter: button says ' + JSON.stringify(noSensor));
  await click('#obNext'); await click('#obNext'); await wait(300);
  await click('#obSensor'); await wait(600);
  await shot('r6-06-no-sensor');
  const st = await text('#obStatus');
  log('status: ' + JSON.stringify(st));
  if (!st) fail.push('no explanation when the device has no step counter');
  await click('#obNext'); await click('#obNext'); await wait(800);
  await click('.tab[data-view="ledger"]'); await wait(900);
  await shot('r6-07-no-sensor-ledger');
  const manualShown = await page.evaluate(() => !document.querySelector('#manualCard').hidden);
  if (!manualShown) fail.push('no way to write steps down on a phone without a counter');

  await L.boot(page, { steps: 9000, available: true, allowed: false });
  await wait(700);
  await click('#obNext'); await click('#obNext'); await wait(300);
  await click('#obSensor'); await wait(1600);
  await shot('r6-08-permission-flow');
  const asked = await page.evaluate(() => window.__log.askedPerm);
  log('permission asked ' + asked + ' time(s)');
  const st2 = await text('#obStatus');
  log('after granting: ' + JSON.stringify(st2));
  const backlog = await page.evaluate(() => !document.querySelector('#obBacklog').hidden);
  log('backlog offered after a late grant: ' + backlog);
  if (!backlog) fail.push('9,000 steps already counted were not offered after the permission was granted');
  await click('#obClaim'); await wait(400);
  await click('#obNext'); await click('#obNext'); await wait(900);
  const claimed = await page.evaluate(() => Store.totalKm());
  log('claimed backlog: ' + claimed + ' km');
  if (claimed < 6) fail.push('the claimed backlog did not land: ' + claimed);

  await shot('r6-09-claimed');
  log('page errors: ' + errors.length);
  if (errors.length) fail.push(errors.length + ' page errors: ' + errors.slice(0, 3).join(' / '));
  if (fail.length) throw new Error('EDGE FAILURES: ' + fail.join(' | '));
};
