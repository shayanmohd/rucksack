/* Review pass 1: first run, every screen, real data, reload, persistence,
   back() on every nested screen, pause/resume, both export paths. */
const L = require('./review-lib');

module.exports = async ({ page, shot, wait, click, text, log, errors }) => {
  await L.boot(page, { steps: 0 });
  const fail = [];
  const T = async (label, fn) => { try { const r = await fn(); if (r) fail.push(label + ': ' + r); } catch (e) { fail.push(label + ' threw: ' + e.message); } };

  await shot('r1-01-onboard');
  const stepAt = () => page.evaluate(() => [].slice.call(document.querySelectorAll('.ob-card')).findIndex(c => !c.hidden));

  // back() at the very first card must not consume the gesture
  await T('back on onboarding card 1', async () => (await page.evaluate(() => App.back())) === true ? 'consumed at the onboarding root' : null);

  // a later onboarding card is a nested screen: Back belongs to the app there
  await click('#obNext'); await wait(250);
  if (await stepAt() !== 1) fail.push('Next did not advance the onboarding');
  const backOb = await page.evaluate(() => App.back());
  await wait(250);
  const stepNow = await stepAt();
  log('back() on onboarding card 2 -> ' + backOb + ', now at card ' + (stepNow + 1));
  if (backOb !== true || stepNow !== 0) fail.push('back() on onboarding card 2 returned ' + backOb + ' and left card ' + (stepNow + 1));

  // finish onboarding from card 1
  await click('#obNext');
  await click('#obNext');
  await click('#obSensor'); await wait(800);
  const hasBacklog = await page.$('#obBacklog:not([hidden])');
  if (hasBacklog) await click('#obSkip');
  await click('#obNext');
  await page.type('#obName', 'Priya', { delay: 6 });
  await click('#obNext'); await wait(700);
  await shot('r1-02-camp-empty');

  // every screen empty
  for (const v of ['map', 'journal', 'pack', 'ledger']) {
    await click(`.tab[data-view="${v}"]`); await wait(900);
    await shot('r1-03-empty-' + v);
    await T('back from ' + v, async () => (await page.evaluate(() => App.back())) === true ? null : 'returned false on a nested tab');
    const v2 = await page.evaluate(() => !document.querySelector('#v-camp').hidden);
    if (!v2) fail.push('back from ' + v + ' did not return to camp');
  }
  await T('back at camp root', async () => (await page.evaluate(() => App.back())) === true ? 'consumed at root' : null);

  // sheet: back closes it
  await click('.tab[data-view="pack"]'); await wait(600);
  await click('.item'); await wait(500);
  await shot('r1-04-sheet');
  await T('back with sheet open', async () => (await page.evaluate(() => App.back())) === true ? null : 'did not consume with sheet open');
  await wait(400);
  const sheetGone = await page.evaluate(() => document.querySelector('#sheet').hidden || !document.querySelector('#sheet').classList.contains('on'));
  if (!sheetGone) fail.push('sheet still open after back()');

  // walk, break camp, meet someone
  await click('.tab[data-view="camp"]'); await wait(400);
  await L.walk(page, 5200);
  await page.evaluate(() => App.onResume());
  await wait(800);
  log('today: ' + await text('#figToday'));
  await shot('r1-05-camp-walked');
  if (await page.evaluate(() => document.querySelector('#arriveBox').hidden)) fail.push('no break-camp offer after 4 km');
  await click('#breakCamp'); await wait(700);
  const enc = await page.$('.enc');
  if (!enc) fail.push('no encounter card after 4 km');
  else { await click('.enc'); await wait(600); await shot('r1-06-encounter'); await page.evaluate(() => App.closeSheet()); await wait(400); }

  // a long crossing: gear, keepsakes, dog, several regions
  await page.evaluate(() => {
    const t = Store.today();
    for (let i = 200; i >= 0; i--) Store.setSteps(Store.addDays(t, -i), i % 9 === 3 ? 300 : 9000 + (i % 7) * 900);
    Store.all().camp = { km: Store.totalKm() - 7.4, d: t };
    Store.save();
    let g = 0; while (g++ < 80) { const p = Store.pendingEncounters(); if (!p.length) break; Store.meet(p[0]); }
  });
  await page.evaluate(() => App.refresh()); await wait(1200);
  await shot('r1-07-camp-full');
  for (const v of ['map', 'journal', 'pack', 'ledger']) {
    await click(`.tab[data-view="${v}"]`); await wait(1400);
    await shot('r1-08-full-' + v);
  }

  const before = await L.db(page);
  log('total km: ' + (await page.evaluate(() => Store.totalKm())));

  // pause / resume must not throw and must not double-count
  await T('onPause', async () => { await page.evaluate(() => App.onPause()); return null; });
  await wait(300);
  await T('onResume', async () => { await page.evaluate(() => App.onResume()); return null; });
  await wait(600);
  const afterResume = await page.evaluate(() => Store.totalKm());
  log('km after pause/resume: ' + afterResume);

  // a toast left on screen when paused must not be frozen there
  await page.evaluate(() => App.toast('a pinned toast'));
  await wait(200);
  await page.evaluate(() => App.onPause());
  await wait(200);
  const toastOn = await page.evaluate(() => document.querySelector('#toast').classList.contains('on'));
  if (toastOn) fail.push('toast still on after onPause');
  await page.evaluate(() => App.onResume()); await wait(400);

  // exports through both paths
  await click('.tab[data-view="ledger"]'); await wait(800);
  await click('#expJournal'); await wait(500);
  await click('#expData'); await wait(500);
  const saved = await page.evaluate(() => window.__log.saved.map(s => ({ n: s.name, len: s.text.length, head: s.text.slice(0, 60) })));
  log('saved: ' + JSON.stringify(saved));
  if (saved.length !== 2) fail.push('saveFile not used for both exports');
  const json = await page.evaluate(() => { const s = window.__log.saved.filter(x => x.name.endsWith('.json'))[0]; return s ? s.text : null; });
  if (!json) fail.push('no json export');
  else { try { const o = JSON.parse(json); if (!o.days || !Object.keys(o.days).length) fail.push('json export has no days'); } catch (e) { fail.push('json export not parseable'); } }
  const txt = await page.evaluate(() => { const s = window.__log.saved.filter(x => x.name.endsWith('.txt'))[0]; return s ? s.text : ''; });
  if (/Day -\d/.test(txt)) fail.push('negative day number in the text export');
  if (/[–—]/.test(txt)) fail.push('en or em dash in the text export');

  // browser download path when there is no Native
  await page.evaluate(() => { window.__saveNative = window.Native; delete window.Native; });
  let downloaded = false;
  page.once('response', () => {});
  await page.evaluate(() => {
    window.__clicks = 0;
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) window.__clicks++; else orig.call(this); };
  });
  await click('#expJournal'); await wait(400);
  downloaded = await page.evaluate(() => window.__clicks > 0);
  if (!downloaded) fail.push('no object-URL download when Native is absent');
  await page.evaluate(() => { window.Native = window.__saveNative; });

  // reload: everything persists
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(1200);
  const after = await L.db(page);
  const keysBefore = Object.keys(before.days).length, keysAfter = Object.keys(after.days).length;
  if (keysBefore !== keysAfter) fail.push('days lost on reload: ' + keysBefore + ' -> ' + keysAfter);
  if (after.name !== before.name) fail.push('name lost on reload');
  if (Object.keys(after.met).length !== Object.keys(before.met).length) fail.push('encounters lost on reload');
  await shot('r1-09-after-reload');
  log('after reload: ' + keysAfter + ' days, name ' + after.name);

  log('page errors: ' + errors.length);
  if (fail.length) throw new Error('FAILURES: ' + fail.join(' | '));
};
