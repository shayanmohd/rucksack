/* Review pass 5: upgrade from 1.0.0.
   The seed is not hand-typed: it is the record the shipped 1.0.0 build actually
   wrote in review-04, plus four hand-made records that a 1.0.0 phone could also
   hold (a clock that moved backwards, no camp, a half-written record, rubbish). */
const fs = require('fs');
const L = require('./review-lib');

const REAL = JSON.parse(fs.readFileSync(__dirname + '/review-100-record.json', 'utf8'));

module.exports = async ({ page, shot, wait, click, text, log, errors }) => {
  const fail = [];
  const days = Object.keys(REAL.days).sort();
  const kmOf = (d) => REAL.days[d].km;
  const totalBefore = days.reduce((a, d) => a + kmOf(d), 0);

  /* 1. the real 1.0.0 record */
  await L.boot(page, { seed: REAL, steps: REAL.sensor.raw });
  await wait(1200);
  const after = await L.db(page);
  const live = await page.evaluate(() => ({
    total: Store.totalKm(), first: Store.firstDay(), day: Store.dayNumber(Store.today()),
    name: Store.all().name, mode: Store.all().mode, streak: Store.streak().current
  }));
  if (after.name !== REAL.name) fail.push('name lost');
  if (after.start !== REAL.start) fail.push('start moved: ' + REAL.start + ' -> ' + after.start);
  if (after.mode !== REAL.mode) fail.push('mode lost');
  if (Object.keys(after.days).length !== days.length) fail.push('days lost: ' + days.length + ' -> ' + Object.keys(after.days).length);
  let stepsChanged = [];
  days.forEach((d) => {
    const a = after.days[d], b = REAL.days[d];
    if (!a) { fail.push('day ' + d + ' gone'); return; }
    if (Math.abs(a.km - b.km) > 0.0005) fail.push('km changed on ' + d + ': ' + b.km + ' -> ' + a.km);
    if (!!a.capped !== !!b.capped) fail.push('cap flag changed on ' + d);
    if (a.steps !== b.steps) stepsChanged.push(d + ': ' + b.steps + ' -> ' + a.steps);
  });
  log('step counts rewritten on load: ' + JSON.stringify(stepsChanged));
  Object.keys(REAL.met).forEach((m) => {
    if (!after.met[m] || after.met[m].km !== REAL.met[m].km || after.met[m].d !== REAL.met[m].d) fail.push('encounter ' + m + ' misread');
  });
  Object.keys(REAL.keeps).forEach((k) => { if (after.keeps[k] !== REAL.keeps[k]) fail.push('keepsake ' + k + ' lost'); });
  if (JSON.stringify(after.flags) !== JSON.stringify(REAL.flags)) fail.push('flags changed');
  if (!after.camp || after.camp.km !== REAL.camp.km || after.camp.d !== REAL.camp.d) fail.push('camp moved');
  if (after.settings.haptics !== REAL.settings.haptics) fail.push('haptics flipped');
  if (Math.abs(live.total - totalBefore) > 0.002) fail.push('total km changed: ' + totalBefore.toFixed(3) + ' -> ' + live.total);
  if (live.day < 1) fail.push('day number went below one: ' + live.day);
  log('upgraded: ' + live.total.toFixed(1) + ' km, day ' + live.day + ', streak ' + live.streak + ', kept since ' + live.first);

  await shot('r5-upgrade-camp');
  for (const v of ['map', 'journal', 'pack', 'ledger']) {
    await click(`.tab[data-view="${v}"]`); await wait(1300);
    await shot('r5-upgrade-' + v);
  }
  const led = await text('#ledgerList');
  if (/999,999,999/.test(led)) fail.push('an impossible 1.0.0 step count is still shown in the ledger');
  log('journal: ' + (await text('#journalLede')));

  /* the 1.0.0 baseline must not be banked again, and a reboot of the phone
     while the app was closed must not invent a walk */
  const kmA = await page.evaluate(() => Store.totalKm());
  await page.evaluate(() => App.onResume()); await wait(700);
  const kmB = await page.evaluate(() => Store.totalKm());
  if (Math.abs(kmA - kmB) > 0.001) fail.push('resume re-banked the 1.0.0 sensor baseline: ' + kmA + ' -> ' + kmB);
  // today in this record is the capped 999,999,999 day, where more steps can
  // change nothing, so bring it back to an ordinary day before testing the reboot
  await page.evaluate(() => { Store.setSteps(Store.today(), 3000); App.refresh(); });
  await wait(400);
  const stepsA = await page.evaluate(() => Store.stepsOn(Store.today()));
  await L.reboot(page, 40);
  await page.evaluate(() => App.onResume()); await wait(700);
  const stepsB = await page.evaluate(() => Store.stepsOn(Store.today()));
  log('today steps before / after the reboot: ' + stepsA + ' / ' + stepsB);
  if (stepsB - stepsA > 40) fail.push('a phone reboot banked more than the 40 steps it had counted: +' + (stepsB - stepsA));
  await L.walk(page, 2600);
  await page.evaluate(() => App.onResume()); await wait(700);
  const stepsC = await page.evaluate(() => Store.stepsOn(Store.today()));
  if (stepsC - stepsB < 2600) fail.push('steps after a reboot were not counted: ' + stepsB + ' -> ' + stepsC);
  log('today steps after walking 2,600 past the reboot: ' + stepsC);
  const kmE = await page.evaluate(() => Store.totalKm());
  log('total km once today is an ordinary day again: ' + kmE.toFixed(3));

  /* 2. a clock that moved backwards: start later than the earliest day */
  const back = JSON.parse(JSON.stringify(REAL));
  back.start = days[days.length - 1];
  await L.boot(page, { seed: back, steps: 500 });

  await wait(1200);
  const bh = await page.evaluate(() => ({ day: Store.dayNumber(Store.today()), first: Store.firstDay(), head: document.querySelector('#campDay').textContent }));
  log('clock moved back: ' + JSON.stringify(bh));
  if (bh.day < 1) fail.push('day number negative after a backwards clock');
  if (bh.first !== days[0]) fail.push('firstDay did not heal: ' + bh.first);
  if (/-/.test(bh.head.replace(/\d{4}/, ''))) fail.push('camp header shows a negative day: ' + bh.head);
  await shot('r5-clock-moved-back');
  const jt = await page.evaluate(() => { App.go('journal'); return document.querySelector('#journalList').innerText; });
  await wait(500);
  if (/Day -/.test(jt)) fail.push('journal shows a negative day number');

  /* 3. a 1.0.0 record with no camp and nothing given */
  const bare = { onboarded: true, name: 'Sam', start: '2026-03-01', mode: 'manual',
                 sensor: { raw: -1, at: 0 },
                 days: { '2026-03-01': { steps: 4000, km: 3.077, capped: false } },
                 met: {}, keeps: {}, flags: {}, camp: null, settings: { haptics: true, sound: false } };
  await L.boot(page, { seed: bare, steps: 0 });
  await wait(1000);
  const bareOk = await page.evaluate(() => ({ km: Store.totalKm(), camp: Store.campKm(), place: document.querySelector('#campPlace').textContent }));
  log('bare record: ' + JSON.stringify(bareOk));
  if (Math.abs(bareOk.km - 3.077) > 0.002) fail.push('bare record km wrong');
  await shot('r5-bare-record');
  for (const v of ['map', 'journal', 'pack', 'ledger']) { await click(`.tab[data-view="${v}"]`); await wait(900); }

  /* 4. a half-written record and 5. rubbish: neither may throw or wipe silently */
  await L.boot(page, { rawSeed: '{"onboarded":true,"name":"Half","days":{"2026-02-02":{"steps":"5000"}},"met":{"road":{"km":3}}}', steps: 0 });
  await wait(1000);
  const half = await page.evaluate(() => ({ km: Store.totalKm(), onboard: document.querySelector('#onboard').hidden }));
  log('half record: ' + JSON.stringify(half));
  if (Math.abs(half.km - 3.846) > 0.01) fail.push('a string step count was not read: ' + half.km);
  await shot('r5-half-record');

  await L.boot(page, { rawSeed: 'not json at all', steps: 0 });
  await wait(1000);
  const junk = await page.evaluate(() => document.querySelector('#onboard').hidden);
  if (junk) fail.push('a corrupt record did not fall back to onboarding');
  await shot('r5-corrupt-record');

  log('page errors across the upgrade run: ' + errors.length);
  if (errors.length) fail.push(errors.length + ' page errors');
  if (fail.length) throw new Error('UPGRADE FAILURES: ' + fail.join(' | '));
};
