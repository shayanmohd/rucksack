/* Makes the fixture that review-05 upgrades from, by driving the shipped 1.0.0
   build rather than hand-typing what it might have written:

     git archive ceffc1f web | tar -x -C /tmp/v100
     python3 -m http.server 8924 --directory /tmp/v100/web
     node _shiptools/drive.js http://127.0.0.1:8924/index.html \
          rucksack/test/review-04-make-100-record.js --out rucksack/test/shots-review

   It onboards with the phone counter, walks a long crossing, meets everyone by
   tapping, writes the absurd manual step count that 1.0.0 accepted without a
   cap, and leaves a sensor baseline mid-flight. The result is written to
   test/review-100-record.json, which is committed so the upgrade test has a
   fixed target. Running this against the 1.0.1 build would overwrite the
   fixture with a 1.0.1 record and prove nothing. */
const fs = require('fs');
const L = require('./review-lib');

module.exports = async ({ page, wait, click, log, errors }) => {
  await L.boot(page, { steps: 1200 });
  await L.onboard(page, click, wait, { name: 'Derek', claim: true });

  // a crossing written through 1.0.0's own setSteps, then everybody met by hand
  await page.evaluate(() => {
    const t = Store.today();
    for (let i = 140; i >= 1; i--) Store.setSteps(Store.addDays(t, -i), i % 11 === 4 ? 250 : 8200 + (i % 6) * 1100);
  });
  await page.evaluate(() => { let g = 0; while (g++ < 40) { const p = Store.pendingEncounters(); if (!p.length) break; App.openEncounter(p[0]); App.closeSheet(); } });
  await wait(600);

  // 1.0.0 let a mistyped step count straight into the ledger
  await page.evaluate(() => { App.go('ledger'); });
  await wait(600);
  await page.evaluate(() => { Store.useManual(); });
  await page.evaluate(() => { App.refresh(); });
  await wait(400);
  await page.evaluate(() => { document.querySelector('#manualSteps').value = '999999999'; });
  await click('#manualSave'); await wait(400);

  // back to the counter so the record carries a live baseline, then break camp
  await page.evaluate(() => { Store.startSensor(false); Store.pitchCamp(); Store.all().settings.haptics = false; Store.save(); });
  await wait(300);

  const rec = await page.evaluate(() => localStorage.getItem('rucksack.v1'));
  fs.writeFileSync(__dirname + '/review-100-record.json', rec);
  const o = JSON.parse(rec);
  log('1.0.0 record: ' + Object.keys(o.days).length + ' days, ' + Object.keys(o.met).length + ' met, ' +
      Object.keys(o.keeps).length + ' keeps, mode ' + o.mode + ', sensor raw ' + o.sensor.raw +
      ', today steps ' + o.days[Object.keys(o.days).sort().pop()].steps);
  log('page errors on 1.0.0: ' + errors.length);
};
