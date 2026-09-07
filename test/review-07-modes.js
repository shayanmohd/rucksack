/* Review pass 7: the same populated app under whatever media the drive sets.
   Run once plain, once with --dark and once with --reduced-motion. Under
   reduced motion the pictures must still be pictures: motion stops, nothing
   is deleted. */
const L = require('./review-lib');

module.exports = async ({ page, shot, wait, click, log, errors }) => {
  const tag = process.argv.includes('--dark') ? 'dark' : (process.argv.includes('--reduced-motion') ? 'rm' : 'plain');
  await L.boot(page, { steps: 0 });
  await shot('r7-' + tag + '-onboard');
  await L.onboard(page, click, wait, { name: 'Ines' });
  await page.evaluate(() => {
    const t = Store.today();
    for (let i = 130; i >= 0; i--) Store.setSteps(Store.addDays(t, -i), i % 9 === 3 ? 260 : 9200 + (i % 6) * 900);
    Store.all().camp = { km: Store.totalKm() - 6.2, d: t };
    Store.save();
    let g = 0; while (g++ < 50) { const p = Store.pendingEncounters(); if (!p.length) break; Store.meet(p[0]); }
  });
  for (const v of ['camp', 'map', 'journal', 'pack', 'ledger']) {
    await click(`.tab[data-view="${v}"]`); await wait(1400);
    await shot('r7-' + tag + '-' + v);
  }
  // the camp painting must not be blank when motion is off
  await click('.tab[data-view="camp"]'); await wait(1200);
  const ink = await page.evaluate(() => {
    const cv = document.querySelector('#campCanvas');
    const c = cv.getContext('2d');
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    const seen = {};
    for (let i = 0; i < d.length; i += 4 * 97) {
      const k = (d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4);
      seen[k] = (seen[k] || 0) + 1;
    }
    return Object.keys(seen).length;
  });
  log(tag + ': distinct colours in the camp painting: ' + ink);
  if (ink < 12) throw new Error('the camp painting collapsed under ' + tag + ': only ' + ink + ' colours');
  // and the ribbon must still be drawn
  const rib = await page.evaluate(() => {
    const w = document.querySelector('.ribbon-walked');
    return { d: (w.getAttribute('d') || '').length, contours: document.querySelectorAll('.ribbon-contours path').length,
             sun: !!document.querySelector('.ribbon-sun') };
  });
  log(tag + ': ribbon ' + JSON.stringify(rib));
  if (rib.d < 40 || rib.contours < 5 || !rib.sun) throw new Error('the ribbon lost its geometry under ' + tag);
  log(tag + ' page errors: ' + errors.length);
  if (errors.length) throw new Error(errors.length + ' page errors under ' + tag);
};
