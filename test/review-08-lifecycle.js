/* Review pass 8: pause and resume in every state, including during onboarding,
   and the empty journal's export. */
const L = require('./review-lib');

module.exports = async ({ page, shot, wait, click, log, errors }) => {
  const fail = [];

  /* onboarding: the plate must come back to life after a pause */
  await L.boot(page, { steps: 0 });
  await wait(600);
  await page.evaluate(() => App.onPause());
  await wait(300);
  const paused = await page.evaluate(() => ({ raf: !!window.__obAlive }));
  await page.evaluate(() => App.onResume());
  await wait(600);
  const moved = await page.evaluate(async () => {
    const cv = document.querySelector('#obCanvas');
    const c = cv.getContext('2d');
    const a = c.getImageData(0, 0, cv.width, cv.height).data.slice(0, 40000).join(',');
    await new Promise(r => setTimeout(r, 500));
    const b = c.getImageData(0, 0, cv.width, cv.height).data.slice(0, 40000).join(',');
    return a !== b;
  });
  log('onboarding plate alive after a pause and a resume: ' + moved);
  if (!moved) fail.push('the onboarding plate stayed frozen after a resume');
  await shot('r8-onboard-resumed');

  /* the empty journal offers nothing to export */
  await L.onboard(page, click, wait, { name: 'Ines' });
  await click('.tab[data-view="journal"]'); await wait(900);
  const exp0 = await page.evaluate(() => document.querySelector('#journalExport').hidden);
  log('export offered on an empty journal: ' + !exp0);
  if (!exp0) fail.push('an export button on a journal with nothing in it');
  await shot('r8-journal-empty');
  await page.evaluate(() => { Store.setSteps(Store.today(), 6000); App.refresh(); });
  await wait(600);
  const exp1 = await page.evaluate(() => document.querySelector('#journalExport').hidden);
  if (exp1) fail.push('the export button did not come back once a day was written');
  await shot('r8-journal-one-day');

  /* pause and resume on every screen, twice, with data */
  await page.evaluate(() => {
    const t = Store.today();
    for (let i = 70; i >= 0; i--) Store.setSteps(Store.addDays(t, -i), 9200);
    Store.all().camp = { km: Store.totalKm() - 5, d: t };
    Store.save();
  });
  for (const v of ['camp', 'map', 'journal', 'pack', 'ledger']) {
    await click(`.tab[data-view="${v}"]`); await wait(800);
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => App.onPause());
      await wait(150);
      await page.evaluate(() => App.onResume());
      await wait(350);
    }
    const ok = await page.evaluate((v) => !document.querySelector('#v-' + v).hidden, v);
    if (!ok) fail.push('screen ' + v + ' vanished across a pause and resume');
  }
  await shot('r8-after-lifecycle');

  // the camp painting must be animating again after the last resume
  await click('.tab[data-view="camp"]'); await wait(900);
  const campMoves = await page.evaluate(async () => {
    const cv = document.querySelector('#campCanvas');
    const c = cv.getContext('2d');
    const grab = () => { const d = c.getImageData(0, 0, cv.width, cv.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] * 3 + d[i + 2] * 7; return s; };
    const a = grab();
    await new Promise(r => setTimeout(r, 700));
    return { a: a, b: grab(), raf: !!window.__campRafSeen };
  });
  log('camp painting checksum before/after: ' + JSON.stringify(campMoves));
  if (campMoves.a === campMoves.b) fail.push('the camp painting stopped after a resume');

  // a pause during a toast, and a pause during the permission wait
  await page.evaluate(() => App.toast('hello'));
  await wait(150);
  await page.evaluate(() => App.onPause());
  await wait(200);
  const t = await page.evaluate(() => document.querySelector('#toast').classList.contains('on'));
  if (t) fail.push('the toast was left frozen on screen by onPause');
  await page.evaluate(() => App.onResume()); await wait(300);

  log('page errors: ' + errors.length);
  if (errors.length) fail.push(errors.length + ' page errors');
  if (fail.length) throw new Error('LIFECYCLE FAILURES: ' + fail.join(' | '));
};
