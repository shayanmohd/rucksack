/* Shared bits for the Rucksack drive scripts.
   Rucksack's only native dependency is the step counter, so every script that
   wants a realistic run installs a fake window.Native with a rising cumulative
   count. `reboot()` drops the count back to a small number the way a real
   phone's TYPE_STEP_COUNTER does when it restarts. */

const URL = 'http://127.0.0.1:8824/index.html';
const KEY = 'rucksack.v1';

/** Install a mock Native + optional seed + optional safe-area insets, then reload. */
async function boot(page, opts) {
  opts = opts || {};
  const cfg = {
    steps: opts.steps === undefined ? 0 : opts.steps,
    available: opts.available !== false,
    allowed: opts.allowed !== false,
    seed: opts.seed || null,
    sat: opts.sat || null,
    sab: opts.sab || null,
    key: KEY
  };
  await page.evaluateOnNewDocument((c) => {
    window.__nativeLog = { saved: [], shared: [], vibrated: [], askedPerm: 0 };
    window.__steps = c.steps;
    window.__allowed = c.allowed;
    window.Native = {
      isNative: function () { return true; },
      vibrate: function (ms, amp) { window.__nativeLog.vibrated.push([ms, amp]); },
      vibratePattern: function () {},
      hasAmplitudeControl: function () { return true; },
      cancelVibration: function () {},
      keepAwake: function () {},
      saveFile: function (name, mime, b64) {
        window.__nativeLog.saved.push({ name: name, mime: mime, text: decodeURIComponent(escape(atob(b64))) });
        return 'content://downloads/' + name;
      },
      shareText: function (s, t) { window.__nativeLog.shared.push([s, t]); },
      shareUri: function () {},
      stepCount: function () { return c.available ? window.__steps : -1; },
      stepsAvailable: function () { return c.available; },
      stepsAllowed: function () { return c.available && window.__allowed; },
      requestStepsPermission: function () { window.__nativeLog.askedPerm++; window.__allowed = true; }
    };
    if (!c.available) { delete window.Native.stepCount; window.Native.stepsAvailable = function () { return false; }; }
    try { localStorage.clear(); } catch (e) {}
    if (c.seed) { try { localStorage.setItem(c.key, JSON.stringify(c.seed)); } catch (e) {} }
    if (c.sat || c.sab) {
      document.addEventListener('DOMContentLoaded', function () {
        document.documentElement.style.setProperty('--sat', c.sat || '0px');
        document.documentElement.style.setProperty('--sab', c.sab || '0px');
      });
    }
  }, cfg);
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
}

/** Move the fake pedometer forward. */
async function walk(page, n) {
  await page.evaluate((n) => { window.__steps += n; }, n);
}
/** A phone restart: the cumulative counter starts again from a small number. */
async function reboot(page, n) {
  await page.evaluate((n) => { window.__steps = n; }, n === undefined ? 40 : n);
}

async function db(page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
}

/** Onboard through all four cards using the phone counter. */
async function onboard(page, click, wait, opts) {
  opts = opts || {};
  await click('#obNext');
  await click('#obNext');
  await click(opts.manual ? '#obManual' : '#obSensor');
  await wait(700);
  if (opts.claim) { await click('#obClaim'); await wait(200); }
  else if (opts.skipBacklog) { const has = await page.$('#obBacklog:not([hidden])'); if (has) await click('#obSkip'); }
  await click('#obNext');
  if (opts.name) await page.type('#obName', opts.name, { delay: 8 });
  await click('#obNext');
  await wait(500);
}

/* A believable eight-month crossing, in exactly the shape the shipped 1.0.0 wrote.
   Kept here as well as in store/shots.json so the upgrade test has a fixed target. */
function crossing(todayYmd, opts) {
  var o = Object.assign({ days: 268, targetKm: 1368, name: 'Hana' }, opts || {});
  var s = 771453;
  function rnd() { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  var p = todayYmd.split('-').map(Number);
  var base = new Date(p[0], p[1] - 1, p[2]);
  var raw = [], i;
  for (i = o.days - 1; i >= 0; i--) {
    var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
    var dow = d.getDay();
    var x = rnd(), steps;
    if (i > 196 && i < 203) steps = Math.round(300 + rnd() * 500);
    else if (dow === 0 && x < 0.55) steps = Math.round(400 + rnd() * 700);
    else if (dow === 3 && x < 0.30) steps = Math.round(500 + rnd() * 600);
    else if (dow === 6) steps = Math.round(11000 + rnd() * 9000);
    else steps = Math.round(6200 + rnd() * 5200);
    raw.push({ d: ymd(d), steps: steps });
  }
  var sum = 0;
  for (i = 0; i < raw.length; i++) sum += raw[i].steps;
  var scale = (o.targetKm * 1300) / sum;
  var days = {}, total = 0, run = [];
  for (i = 0; i < raw.length; i++) {
    var st = Math.round(raw[i].steps * scale);
    var km = Math.round((st / 1300) * 1000) / 1000;
    if (km > 40) km = 40;
    days[raw[i].d] = { steps: st, km: km, capped: km >= 40 };
    total += km;
    run.push({ d: raw[i].d, at: Math.round(total * 1000) / 1000 });
  }
  var TRIG = [
    ['road', 3], ['marn1', 22, 'button'], ['sef1', 34, 'rope'], ['oro1', 61],
    ['marn2', 118], ['chapel', 140], ['ferry2', 205], ['mill', 308],
    ['halda1', 356, 'charcoal'], ['dog1', 430], ['dog2', 447], ['chapel2', 488],
    ['oroA', 556], ['ivo1', 664, 'salt'], ['caravan', 738], ['bone', 776],
    ['white', 924], ['oro2', 1001], ['ket1', 1042, 'fleece'], ['stones', 1078],
    ['horse', 1220]
  ];
  function dayAt(km) {
    for (var j = 0; j < run.length; j++) if (run[j].at >= km) return run[j].d;
    return null;
  }
  var met = {}, keeps = {}, flags = {};
  for (i = 0; i < TRIG.length; i++) {
    var t = TRIG[i], when = dayAt(t[1]);
    if (!when) continue;
    met[t[0]] = { d: when, km: t[1] };
    if (t[2]) keeps[t[2]] = when;
    if (t[0] === 'dog2') flags.biscuit = when;
  }
  var todayKm = days[todayYmd] ? days[todayYmd].km : 0;
  return {
    onboarded: true, name: o.name, start: raw[0].d, mode: 'manual',
    sensor: { raw: -1, at: 0 }, days: days, met: met, keeps: keeps, flags: flags,
    camp: { km: Math.round((total - todayKm) * 1000) / 1000, d: raw[raw.length - 2].d },
    settings: { haptics: true, sound: false }
  };
}

function todayYmd() {
  const n = new Date(), p = (x) => String(x).padStart(2, '0');
  return n.getFullYear() + '-' + p(n.getMonth() + 1) + '-' + p(n.getDate());
}

module.exports = { URL, KEY, boot, walk, reboot, db, onboard, crossing, todayYmd };
