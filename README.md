# Rucksack

Every step is a step somewhere. An Android walking game in which your real steps carry a small hooded
wanderer across Elsewhere, a hand-drawn continent of 3,500 kilometres with eleven regions, 109 named
places, forty one authored encounters and an ending you can actually reach.

- **Play listing:** https://play.google.com/store/apps/details?id=com.mohdshayan.rucksack
- **Site:** https://shayanmohd.github.io/rucksack/
- **Walk it in a browser:** https://shayanmohd.github.io/rucksack/play/
- **Privacy policy:** https://shayanmohd.github.io/rucksack/privacy-policy.html

## The honest mechanic

Rucksack reads one number: Android's `TYPE_STEP_COUNTER`, which reports how many steps the phone has
counted since it last started. On every open the app reads that number, works out how much is new since
its last reading, and banks it into today. It converts at a flat 1,300 steps to a kilometre and caps a
single day at 40 km, so a walking marathon counts in full and a phone that spent the afternoon in a car
mostly does not.

The sensor cannot report a route, a speed, a time of day or an activity type, and the app never asks for
location, so there is nothing to leak. If the phone restarts, the steps taken between the restart and the
next time the app is opened are lost; the step ledger screen says so rather than guessing. On a device
with no step sensor, or if the permission is declined, the ledger takes a hand-written daily number
instead and the road moves the same way.

The weather at your camp is Elsewhere's own, derived from the date and the region you are standing in.
That is why the app needs neither a forecast service nor your position.

## How it is built

`web/` is the whole app: plain HTML, CSS and JavaScript, no build step, no framework, no dependencies and
no network. All state lives in `localStorage` under one key, `rucksack.v1`.

- `js/content.js` is the authored world: eleven regions with their climates and asset kits, 109
  waypoints, eleven weather types, twelve pieces of streak-forged gear and the journal's phrase banks.
- `js/encounters.js` is the writing: forty one encounters, fourteen recurring characters and twelve
  keepsakes, triggered by kilometres walked or by a run of consecutive days.
- `js/store.js` is the only thing that touches storage. It holds the daily ledger of steps and does the
  conversion. Streaks, forge dates and the current position are recomputed from the ledger on every read,
  so a gap or a hand-edited import heals itself instead of corrupting a save.
- `js/atlas.js` turns the region spines into the continent: an arc-length parameterised road, a coastline
  built as the union of circles along it, watercolour washes, and about 1,700 ink glyphs scattered
  deterministically from each region's kit.
- `js/mapview.js` is the map screen: pan, pinch, a cached painted layer that re-renders only when the
  zoom bucket or the viewport changes, cartographer's fog over ground you have not reached, and label
  placement that refuses to collide.
- `js/paint.js` paints the camp vignettes. Each one is composed from its region's terrain, the day's
  weather and a seed taken from the date and the kilometre, so a given camp always looks the same.
- `js/app.js` is the five screens, the daily break-camp ritual, the journal composer and the exports.

`android/` is a thin Kotlin WebView shell that serves `web/` from an app-private https origin through
`WebViewAssetLoader`. It adds amplitude haptics, file export through the share sheet and the step-counter
bridge, declares only `ACTIVITY_RECOGNITION` and `VIBRATE`, and sets `allowBackup="false"` so the journey
is not copied into cloud backup. The web core is copied into the app's assets by the `syncWebAssets`
Gradle task on every build.

`docs/` is the GitHub Pages site: the landing page, the privacy policy and a playable copy of the app.

## Build

```sh
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew --offline bundleRelease assembleRelease
```

Release signing reads `android/keystore.properties`, which is not in the repository.

## Store assets

`store/brand.json` is the icon, drawn from primitives:

```sh
python _shiptools/brand.py store/brand.json --out store --res android/app/src/main/res
```

`store/shots.json` drives the six 1080x1920 screenshots through `_shiptools/shots.js`, seeded from
`store/seed.js` with a believable eight month crossing so the pictures show a populated app rather than
an empty one.
