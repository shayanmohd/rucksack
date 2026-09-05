/* A believable eight-month crossing, built deterministically.
   Used for browser testing and for the store screenshots. Returns the whole
   localStorage record for rucksack.v1. */
function buildRucksack(todayYmd, opts) {
  var o = Object.assign({ days: 268, targetKm: 1368, name: 'Hana' }, opts || {});
  var s = 771453;
  function rnd() { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  var p = todayYmd.split('-').map(Number);
  var base = new Date(p[0], p[1] - 1, p[2]);

  /* A commuter's year: two rest days most weeks, a long weekend walk, one flu week. */
  var raw = [], i;
  for (i = o.days - 1; i >= 0; i--) {
    var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
    var dow = d.getDay();
    var x = rnd(), steps;
    if (i > 196 && i < 203) steps = Math.round(300 + rnd() * 500);            // a week off her feet
    else if (dow === 0 && x < 0.55) steps = Math.round(400 + rnd() * 700);    // hearth day
    else if (dow === 3 && x < 0.30) steps = Math.round(500 + rnd() * 600);    // hearth day
    else if (dow === 6) steps = Math.round(11000 + rnd() * 9000);             // the long Saturday
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

  /* Who she has met, dated by the day her distance passed them. */
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
    onboarded: true,
    name: o.name,
    start: raw[0].d,
    mode: 'manual',
    sensor: { raw: -1, at: 0 },
    days: days,
    met: met,
    keeps: keeps,
    flags: flags,
    camp: { km: Math.round((total - todayKm) * 1000) / 1000, d: raw[raw.length - 2].d },
    settings: { haptics: true, sound: false }
  };
}
