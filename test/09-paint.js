/* Every camp vignette, one per region, at three weathers each. Looking for the
   colour of the land rather than trusting the DOM: the far ridge must sit in
   the region's own hue, not in some colour a broken mix() invented. */
const L = require('./lib');

module.exports = async ({ page, shot, wait, log }) => {
  await L.boot(page, { seed: L.crossing(L.todayYmd()) });
  await wait(900);

  const report = await page.evaluate(() => {
    const cv = document.createElement('canvas');
    cv.width = 360; cv.height = 288;
    const c = cv.getContext('2d');
    const out = [];
    for (const reg of Content.REGIONS) {
      for (const date of ['2026-03-02', '2026-06-14', '2026-11-27']) {
        const km = (reg.from + reg.to) / 2;
        const wx = Content.weatherFor(date, km);
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, 360, 288);
        Paint.camp(c, 360, 288, { region: reg, weather: wx, km: km, date: date, t: 4000, gear: { cloak: true, staff: true }, biscuit: true });
        // just under the horizon, where the far country is drawn
        const d = c.getImageData(20, Math.round(288 * 0.56), 320, 6).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        r /= n; g /= n; b /= n;
        // blue swamping both other channels is the signature of the old bug
        const broken = b > r + 40 && b > g + 40;
        out.push({ reg: reg.id, wx: wx.id, rgb: [r, g, b].map(Math.round), broken: broken });
      }
    }
    return out;
  });

  const bad = report.filter(r => r.broken);
  report.forEach(r => log(r.reg.padEnd(8) + r.wx.padEnd(11) + JSON.stringify(r.rgb) + (r.broken ? '  BROKEN' : '')));
  if (bad.length) throw new Error(bad.length + ' vignettes render blue: ' + JSON.stringify(bad.slice(0, 4)));

  // and a contact sheet of all eleven, four to a screen, to look at
  await page.evaluate(() => {
    document.body.innerHTML = '<div id="sheetgrid" style="display:grid;grid-template-columns:1fr;gap:3px;background:#2B2823"></div>';
    const grid = document.getElementById('sheetgrid');
    Content.REGIONS.forEach((reg, i) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;height:208px';
      const cv = document.createElement('canvas');
      cv.width = 780; cv.height = 416; cv.style.cssText = 'width:100%;height:100%;display:block';
      const cap = document.createElement('p');
      cap.style.cssText = 'position:absolute;left:8px;top:6px;margin:0;color:#F3EEE0;font:12px system-ui;text-shadow:0 1px 3px #000';
      const date = ['2026-03-02', '2026-06-14', '2026-11-27'][i % 3];
      const km = (reg.from + reg.to) / 2;
      cap.textContent = reg.name + ' / ' + Content.weatherFor(date, km).name;
      wrap.appendChild(cv); wrap.appendChild(cap); grid.appendChild(wrap);
      const c = cv.getContext('2d');
      c.setTransform(2, 0, 0, 2, 0, 0);
      Paint.camp(c, 390, 208, { region: reg, weather: Content.weatherFor(date, km), km: km, date: date, t: 4000, gear: { cloak: true, staff: true, boots: true }, biscuit: i % 2 === 0 });
    });
  });
  await wait(400);
  for (let i = 0; i < 3; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * 844);
    await wait(200);
    await shot('70-vignettes-' + (i + 1));
  }
};
