/* The step counter: a rising cumulative count, a reboot that resets it to a
   small number, a suspiciously enormous jump, and a phone with no counter. */
const L = require('./lib');

module.exports = async ({ page, shot, wait, click, text, log }) => {
  await L.boot(page, { steps: 0 });
  await L.onboard(page, click, wait, { name: 'Sam' });

  async function tick() { await page.evaluate(() => App.onResume()); await wait(250); }
  async function km() { return page.evaluate(() => Store.totalKm()); }
  async function todaySteps() { return page.evaluate(() => Store.stepsOn(Store.today())); }

  await L.walk(page, 2600); await tick();
  log('after 2,600 steps: ' + (await km()) + ' km, ' + (await todaySteps()) + ' steps');
  if (Math.abs((await km()) - 2) > 0.01) throw new Error('2,600 steps should be 2 km');

  await L.walk(page, 1300); await tick();
  log('after 3,900 total:  ' + (await km()) + ' km');
  if (Math.abs((await km()) - 3) > 0.01) throw new Error('cumulative counting is wrong');

  // the phone restarts: the counter starts again from a small number
  await L.reboot(page, 120);
  await tick();
  const afterReboot = await km();
  log('after a reboot to 120: ' + afterReboot + ' km, ' + (await todaySteps()) + ' steps');
  if (afterReboot < 3) throw new Error('a reboot lost distance already walked');
  if (afterReboot > 3.11) throw new Error('a reboot banked more than the post-reboot count');

  // and it keeps counting from the new baseline
  await L.walk(page, 1300); await tick();
  log('1,300 more after the reboot: ' + (await km()) + ' km');
  if (Math.abs((await km()) - (afterReboot + 1)) > 0.01) throw new Error('counting broke after a reboot');

  // a jump no human made
  const before = await km();
  await L.walk(page, 500000); await tick();
  log('after an impossible 500,000 step jump: ' + (await km()) + ' km (was ' + before + ')');
  const dayKm = await page.evaluate(() => Store.kmOn(Store.today()));
  if (dayKm > 40.001) throw new Error('day cap breached by a sensor jump');

  await click('.tab[data-view="ledger"]'); await wait(900);
  await shot('40-ledger-sensor');
  log(await text('#sourceCard'));

  // switch to writing them down and back again
  await click('#toManual'); await wait(500);
  await shot('41-ledger-manual');
  const manualVisible = await page.evaluate(() => !document.querySelector('#manualCard').hidden);
  if (!manualVisible) throw new Error('manual entry did not appear');
  await click('#toSensor'); await wait(900);
  const back = await page.evaluate(() => Store.all().mode);
  log('mode after switching back: ' + back);
  if (back !== 'sensor') throw new Error('could not switch back to the counter');
  await shot('42-ledger-sensor-again');

  // a device with no counter at all
  await L.boot(page, { available: false });
  await wait(600);
  await shot('43-no-sensor-onboard');
  log('sensor button: ' + (await text('#obSensor')));
  await L.onboard(page, click, wait, { manual: true, name: 'Ada' });
  await click('.tab[data-view="ledger"]'); await wait(800);
  await shot('44-no-sensor-ledger');
  log(await text('#sourceCard'));
};
