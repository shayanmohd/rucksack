/* First run: empty state, onboarding with the phone counter, then walking far
   enough to create real data on every screen. */
const L = require('./lib');

module.exports = async ({ page, shot, wait, click, text, log }) => {
  await L.boot(page, { steps: 0 });

  await shot('01-ob-1');
  await click('#obNext'); await wait(300); await shot('01-ob-2');
  await click('#obNext'); await wait(300); await shot('01-ob-3');

  // no backlog offer should appear when the phone has counted nothing
  await click('#obSensor'); await wait(900);
  log('status: ' + (await text('#obStatus')));
  const backlogShown = await page.evaluate(() => !document.querySelector('#obBacklog').hidden);
  if (backlogShown) throw new Error('backlog offered on a phone that has counted nothing');
  await shot('01-ob-3-sensor');

  await click('#obNext'); await wait(200);
  await page.type('#obName', 'Priya', { delay: 8 });
  await shot('01-ob-4');
  await click('#obNext'); await wait(700);

  // empty state on every screen before a single step
  await shot('02-camp-empty');
  for (const v of ['map', 'journal', 'pack', 'ledger']) {
    await click(`.tab[data-view="${v}"]`); await wait(900);
    await shot('02-' + v + '-empty');
  }

  // walk: the poll timer is 30s, so nudge it the way onResume would
  await click('.tab[data-view="camp"]'); await wait(300);
  await L.walk(page, 5200);
  await page.evaluate(() => App.onResume());
  await wait(900);
  log('today: ' + (await text('#figToday')) + ' km');
  await shot('03-camp-first-steps');

  const arrive = await page.evaluate(() => !document.querySelector('#arriveBox').hidden);
  if (!arrive) throw new Error('no break-camp offer after walking 4 km');
  await click('#breakCamp'); await wait(900);
  await shot('04-camp-broken');

  // an encounter should be waiting at km 3
  const pend = await page.evaluate(() => Store.pendingEncounters().map(e => e.id));
  log('pending: ' + JSON.stringify(pend));
  if (!pend.length) throw new Error('no encounter pending after 4 km');
  await click('.enc'); await wait(600);
  await shot('05-encounter');
  await page.evaluate(() => App.closeSheet()); await wait(400);

  // walk far enough for gear, a dog and several regions
  await page.evaluate(() => {
    const t = Store.today();
    for (let i = 120; i >= 0; i--) Store.setSteps(Store.addDays(t, -i), 9000 + (i % 7) * 900);
    Store.all().camp = { km: Store.totalKm() - 6, d: t };
    Store.save();
    // meet everyone the distance has passed, the way a user tapping through would
    let guard = 0;
    while (guard++ < 60) { const p = Store.pendingEncounters(); if (!p.length) break; Store.meet(p[0]); }
  });
  await page.evaluate(() => App.refresh());
  await wait(1200);
  await shot('06-camp-full');
  for (const v of ['map', 'journal', 'pack', 'ledger']) {
    await click(`.tab[data-view="${v}"]`); await wait(1400);
    await shot('06-' + v + '-full');
  }
  log('total: ' + (await page.evaluate(() => Store.totalKm())) + ' km');
};
