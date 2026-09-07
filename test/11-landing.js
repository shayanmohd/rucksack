/* The landing page, at desktop and phone width. Not the app, but it ships with it. */
module.exports = async ({ page, shot, wait, log, errors }) => {
  const url = 'file:///Users/sherry/Documents/DEVPROJECTS/rucksack/docs/index.html';
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'load' });
  await wait(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('90-landing-top');
  const gallery = await page.evaluate(() => {
    document.querySelector('.gallery').scrollIntoView();
    return null;
  });
  await wait(900);
  await shot('91-landing-gallery');
  await page.evaluate(() => document.querySelector('.counting').scrollIntoView());
  await wait(800);
  await shot('92-landing-counting');
  const broken = await page.evaluate(() => Array.prototype.slice.call(document.images)
    .filter(i => !i.complete || i.naturalWidth === 0).map(i => i.getAttribute('src')));
  log('broken images: ' + JSON.stringify(broken));
  if (broken.length) throw new Error('broken images on the landing page');

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  await page.goto(url, { waitUntil: 'load' });
  await wait(800);
  await shot('93-landing-phone');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  log('horizontal overflow at 390px: ' + overflow);
  if (overflow > 1) throw new Error('the landing page scrolls sideways on a phone');
  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
};
