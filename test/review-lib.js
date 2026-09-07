/* The reviewer's own harness, deliberately not sharing code with test/lib.js so
   a bug in the improver's helpers cannot hide a bug in the app.

   The fake pedometer lives in localStorage rather than on `window`, so a reload
   is a real reload: the page comes back with the same counter and the same
   record, and nothing is quietly reseeded behind the test's back. */
const URL = 'http://127.0.0.1:8924/index.html';
const KEY = 'rucksack.v1';

async function install(page) {
  if (page.__reviewMock) return;
  page.__reviewMock = true;
  await page.evaluateOnNewDocument(() => {
    const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
    const num = (k, d) => +get(k, d);
    const on = (k) => get(k, '1') === '1';
    window.__log = { saved: [], vibrated: [], askedPerm: 0 };
    Object.defineProperty(window, '__steps', {
      get: function () { return num('__revSteps', 0); },
      set: function (v) { try { localStorage.setItem('__revSteps', String(v)); } catch (e) {} }
    });
    window.Native = {
      isNative: function () { return true; },
      vibrate: function (ms, amp) { window.__log.vibrated.push([ms, amp]); },
      vibratePattern: function () {}, hasAmplitudeControl: function () { return true; },
      cancelVibration: function () {}, keepAwake: function () {},
      saveFile: function (name, mime, b64) {
        window.__log.saved.push({ name: name, mime: mime, text: decodeURIComponent(escape(atob(b64))) });
        return 'content://downloads/' + name;
      },
      shareText: function () {}, shareUri: function () {},
      stepCount: function () { return on('__revAvail') ? num('__revSteps', 0) : -1; },
      stepsAvailable: function () { return on('__revAvail'); },
      stepsAllowed: function () { return on('__revAvail') && on('__revAllowed'); },
      requestStepsPermission: function () { window.__log.askedPerm++; try { localStorage.setItem('__revAllowed', '1'); } catch (e) {} }
    };
    if (!on('__revAvail')) delete window.Native.stepCount;
    document.addEventListener('DOMContentLoaded', function () {
      const sat = get('__revSat', ''), sab = get('__revSab', '');
      if (sat) document.documentElement.style.setProperty('--sat', sat);
      if (sab) document.documentElement.style.setProperty('--sab', sab);
    });
  });
}

/** Wipe, seed and load. A later page.reload() keeps everything this wrote. */
async function boot(page, opts) {
  opts = opts || {};
  await install(page);
  if (!/^http/.test(page.url())) await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate((c) => {
    localStorage.clear();
    localStorage.setItem('__revSteps', String(c.steps));
    localStorage.setItem('__revAvail', c.available ? '1' : '0');
    localStorage.setItem('__revAllowed', c.allowed ? '1' : '0');
    if (c.sat) localStorage.setItem('__revSat', c.sat);
    if (c.sab) localStorage.setItem('__revSab', c.sab);
    if (c.seed) localStorage.setItem(c.key, JSON.stringify(c.seed));
    if (c.rawSeed !== null && c.rawSeed !== undefined) localStorage.setItem(c.key, c.rawSeed);
  }, {
    steps: opts.steps === undefined ? 0 : opts.steps,
    available: opts.available !== false,
    allowed: opts.allowed !== false,
    seed: opts.seed || null,
    rawSeed: opts.rawSeed === undefined ? null : opts.rawSeed,
    sat: opts.sat || null, sab: opts.sab || null, key: KEY
  });
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
}

const walk = (page, n) => page.evaluate((n) => { window.__steps = window.__steps + n; }, n);
/** A phone restart: TYPE_STEP_COUNTER begins again from a small number. */
const reboot = (page, n) => page.evaluate((n) => { window.__steps = n; }, n === undefined ? 40 : n);
const db = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);

async function onboard(page, click, wait, opts) {
  opts = opts || {};
  await click('#obNext');
  await click('#obNext');
  await click(opts.manual ? '#obManual' : '#obSensor');
  await wait(800);
  if (opts.claim) { const c = await page.$('#obClaim'); if (c) await click('#obClaim'); await wait(200); }
  else { const has = await page.$('#obBacklog:not([hidden])'); if (has) await click('#obSkip'); }
  await click('#obNext');
  if (opts.name) await page.type('#obName', opts.name, { delay: 6 });
  await click('#obNext');
  await wait(600);
}

function ymd(d) { const p = (x) => String(x).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
const todayYmd = () => ymd(new Date());
function shiftYmd(s, n) { const a = s.split('-').map(Number); const d = new Date(a[0], a[1] - 1, a[2]); d.setDate(d.getDate() + n); return ymd(d); }

module.exports = { URL, KEY, boot, walk, reboot, db, onboard, todayYmd, shiftYmd, ymd };
