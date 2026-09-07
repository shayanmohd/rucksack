/* Upgrade from 1.0.0.
   The record below is exactly what the shipped 1.0.0 store module wrote
   (git show ceffc1f:web/js/store.js): the same keys, the same shapes, including
   a sensor baseline mid-flight and a capped day. Nothing may be lost or misread. */
const L = require('./lib');

const V1 = {
  onboarded: true,
  name: 'Derek',
  start: '2026-01-06',
  mode: 'sensor',
  sensor: { raw: 48213, at: 1767700000000 },
  days: {
    '2026-01-06': { steps: 8400, km: 6.462, capped: false },
    '2026-01-07': { steps: 12900, km: 9.923, capped: false },
    '2026-01-08': { steps: 400, km: 0.308, capped: false },
    '2026-01-09': { steps: 9100, km: 7, capped: false },
    '2026-01-10': { steps: 60000, km: 40, capped: true },
    '2026-01-11': { steps: 0, km: 0, capped: false },
    '2026-01-12': { steps: 7300, km: 5.615, capped: false }
  },
  met: {
    road: { d: '2026-01-06', km: 3 },
    marn1: { d: '2026-01-07', km: 22 },
    sef1: { d: '2026-01-08', km: 34 },
    oro1: { d: '2026-01-10', km: 61 }
  },
  keeps: { button: '2026-01-07', rope: '2026-01-08' },
  flags: {},
  camp: { km: 62.3, d: '2026-01-11' },
  settings: { haptics: false, sound: false }
};

module.exports = async ({ page, shot, wait, click, text, log }) => {
  await L.boot(page, { seed: V1, steps: 48213 });
  await wait(1200);

  const after = await L.db(page);
  const problems = [];
  if (after.name !== 'Derek') problems.push('name lost');
  if (after.start !== '2026-01-06') problems.push('start lost');
  if (after.mode !== 'sensor') problems.push('mode lost');
  if (Object.keys(after.days).length !== 7) problems.push('days lost: ' + Object.keys(after.days).length);
  for (const d in V1.days) {
    if (!after.days[d]) { problems.push('day ' + d + ' gone'); continue; }
    if (after.days[d].steps !== V1.days[d].steps) problems.push('steps changed on ' + d);
    if (Math.abs(after.days[d].km - V1.days[d].km) > 0.002) problems.push('km changed on ' + d + ': ' + V1.days[d].km + ' -> ' + after.days[d].km);
    if (!!after.days[d].capped !== !!V1.days[d].capped) problems.push('cap changed on ' + d);
  }
  for (const m in V1.met) {
    if (!after.met[m] || after.met[m].km !== V1.met[m].km || after.met[m].d !== V1.met[m].d) problems.push('encounter ' + m + ' misread');
  }
  for (const k in V1.keeps) if (after.keeps[k] !== V1.keeps[k]) problems.push('keepsake ' + k + ' lost');
  if (!after.camp || after.camp.km !== 62.3 || after.camp.d !== '2026-01-11') problems.push('camp moved');
  if (after.settings.haptics !== false) problems.push('haptics setting flipped');
  log('total km after upgrade: ' + (await page.evaluate(() => Store.totalKm())));
  log('problems: ' + JSON.stringify(problems));
  if (problems.length) throw new Error('1.0.0 data was not carried forward: ' + problems.join('; '));

  // and it must render, not just parse
  await shot('20-upgrade-camp');
  for (const v of ['map', 'journal', 'pack', 'ledger']) {
    await click(`.tab[data-view="${v}"]`); await wait(1300);
    await shot('20-upgrade-' + v);
  }
  log('journal: ' + (await text('#journalLede')));

  // the sensor baseline from 1.0.0 must not be re-banked as new steps
  const before = await page.evaluate(() => Store.totalKm());
  await page.evaluate(() => App.onResume());
  await wait(400);
  const same = await page.evaluate(() => Store.totalKm());
  log('km before/after resume: ' + before + ' / ' + same);
  if (Math.abs(same - before) > 0.001) throw new Error('resume re-banked the old sensor baseline');
};
