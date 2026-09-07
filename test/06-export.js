/* Export both ways: through Native.saveFile and through the browser download
   path, and a round trip of the JSON back into a fresh install. */
const L = require('./lib');

module.exports = async ({ page, wait, click, log }) => {
  const seed = L.crossing(L.todayYmd());
  await L.boot(page, { seed: seed });
  await wait(900);
  await click('.tab[data-view="ledger"]'); await wait(700);

  await click('#expJournal'); await wait(400);
  await click('#expData'); await wait(400);
  const saved = await page.evaluate(() => window.__nativeLog.saved.map(s => ({ name: s.name, mime: s.mime, len: s.text.length, head: s.text.slice(0, 60) })));
  log('saveFile: ' + JSON.stringify(saved, null, 1));
  if (saved.length !== 2) throw new Error('expected two native saves, got ' + saved.length);
  if (!/rucksack-journal\.txt/.test(saved[0].name) || saved[0].len < 500) throw new Error('journal export is empty');
  if (!/rucksack-data\.json/.test(saved[1].name)) throw new Error('data export missing');

  const json = await page.evaluate(() => window.__nativeLog.saved[1].text);
  const parsed = JSON.parse(json);
  if (Object.keys(parsed.days).length !== Object.keys(seed.days).length) throw new Error('exported ledger is short');
  log('exported ' + Object.keys(parsed.days).length + ' days, ' + Object.keys(parsed.met).length + ' encounters');

  // the browser path: no Native at all
  await page.evaluateOnNewDocument(() => {
    delete window.Native;
    window.__downloads = [];
    const realCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (b) { window.__downloads.push(b.size); return realCreate(b); };
  });
  await page.goto(L.URL, { waitUntil: 'networkidle0' });
  await wait(900);
  await click('.tab[data-view="ledger"]'); await wait(700);
  await click('#expData'); await wait(500);
  const dl = await page.evaluate(() => window.__downloads);
  log('object-url downloads: ' + JSON.stringify(dl));
  if (!dl.length || dl[0] < 200) throw new Error('the browser download path produced nothing');

  // round trip: the exported record loaded as a fresh install must be identical
  await L.boot(page, { seed: parsed });
  await wait(900);
  const restored = await page.evaluate(() => ({ km: Store.totalKm(), days: Store.dayKeys().length, name: Store.all().name }));
  log('restored: ' + JSON.stringify(restored));
  if (restored.days !== Object.keys(seed.days).length) throw new Error('round trip lost days');
  if (restored.name !== seed.name) throw new Error('round trip lost the name');
};
