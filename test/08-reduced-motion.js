/* The whole happy path again with animations off. Motion should stop; nothing
   should disappear. Run with --reduced-motion. */
const L = require('./lib');

module.exports = async ({ page, shot, wait, click, log }) => {
  await L.boot(page, { seed: L.crossing(L.todayYmd()), steps: 0 });
  await wait(1400);
  await shot('60-rm-camp');

  // the fire is the app's heartbeat: it must still be drawn, just not flicker
  const frames = await page.evaluate(async () => {
    const cv = document.querySelector('#campCanvas');
    const grab = () => cv.toDataURL().length;
    const a = grab();
    await new Promise(r => setTimeout(r, 700));
    const b = grab();
    return { a: a, b: b, same: a === b };
  });
  log('camp canvas frames identical under reduced motion: ' + frames.same);

  // and the plate must not be blank
  const painted = await page.evaluate(() => {
    const cv = document.querySelector('#campCanvas');
    const c = cv.getContext('2d');
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 30) lit++;
    return lit;
  });
  log('lit samples on the camp plate: ' + painted);
  if (painted < 100) throw new Error('the camp vignette is blank under reduced motion');

  for (const v of ['map', 'journal', 'pack', 'ledger']) {
    await click(`.tab[data-view="${v}"]`); await wait(1300);
    await shot('60-rm-' + v);
  }
  await page.evaluate(() => { App.go('camp'); App.openEncounter(Encounters.LIST[1]); });
  await wait(500);
  await shot('61-rm-sheet');
  const sheetVisible = await page.evaluate(() => {
    const el = document.querySelector('.sheet-card');
    const s = getComputedStyle(el);
    return { opacity: s.opacity, transform: s.transform };
  });
  log('sheet under reduced motion: ' + JSON.stringify(sheetVisible));
  if (Number(sheetVisible.opacity) < 0.99) throw new Error('the sheet never becomes visible with animations off');
};
