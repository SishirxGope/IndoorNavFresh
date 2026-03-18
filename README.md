# IndoorNavFresh

Standalone Android indoor navigation app using WiFi fingerprinting. All positioning runs on-device — no server or PC required.

## Features

- **Gaussian MLE positioning** — scores radiomap candidates using mean/std RSSI per BSSID, more robust than basic KNN
- **Bayesian smoothing** — temporal constraint using previous position to reduce jitter
- **Multi-floor support** — Floor 8 and Floor 9, with discrete floor detection
- **Amber terminal UI** — radar-HUD aesthetic with WebGL shader background, animated position dot, pan/pinch zoom
- **Test mode** — 5 hardcoded WiFi scans for dev testing without walking around (dev builds only)

## Architecture

```
App.tsx                          Root navigator (single "Location" route)
src/
  screens/LocationScreen.tsx     Main UI — floor map, position dot, info card, WiFi polling
  services/LocalLocator.ts       Positioning engine (Gaussian MLE + Bayesian smoothing)
  utils/PermissionsHelper.ts     Android runtime permission helpers
  components/ShaderBackground.tsx WebGL shader for animated phosphor-ring background
  data/radiomap.json             Pre-computed fingerprint database (bundled into APK)
scripts/
  convert-radiomap.js            Excel → JSON radiomap converter
assets/
  floorplan_floor8.png           Floor 8 plan image
  floorplan_floor9.png           Floor 9 plan image
```

## Prerequisites

- Node.js >= 18
- Android SDK configured ([React Native environment setup](https://reactnative.dev/docs/environment-setup))
- Physical Android device (WiFi scanning does not work on emulators)

## Getting Started

```bash
npm install

# Terminal 1 — start Metro bundler
npm start

# Terminal 2 — build and install on connected device
npm run android
```

## Radiomap Generation

The radiomap is pre-generated from Excel survey files. Re-run the converter if the Excel files change:

```bash
node scripts/convert-radiomap.js
```

**Source files:**

| Floor | Excel file             | Rows  |
|-------|------------------------|-------|
| 8     | wifi_radiomap (5).xlsx | 6,582 |
| 9     | wifi_radiomap (3).xlsx | 3,304 |

**Output:** `src/data/radiomap.json` — 218 grid positions (109 per floor), bundled into the APK via `require()`.

## Grid Layout

- **Grid:** 27 rows x 8 columns per floor
- **Positions:** 109 per floor, 218 total across both floors
- Floor plan images in `assets/` (replace with real per-floor images as needed)

## Positioning Algorithm

1. Scan WiFi APs every 3 seconds via `react-native-wifi-reborn`
2. For each radiomap position, compute **Gaussian log-likelihood** over shared BSSIDs:
   `score = (1/n) * sum[ -0.5 * (rssi - mean)^2 / std^2 - ln(std) ]`
3. Discard candidates with fewer than 3 shared BSSIDs
4. Apply **Bayesian smoothing** — prefer candidates within 5 cells (Manhattan distance) of previous position, same floor
5. Select **top K=3** candidates, compute weighted average position (`weight = exp(score)`)
6. Floor is taken from the best candidate (discrete, not averaged)

**Key constants:** `K=3`, `MIN_MATCHED=3`, `PRIOR_RADIUS=5`, `MIN_STD=2.5 dBm`

## Test Mode

In `__DEV__` builds, a toggle button (bottom-right) switches between live WiFi scanning and 5 hardcoded test scans that cycle automatically. All test BSSIDs are from the real radiomap.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Metro bundler |
| `npm run android` | Build and install on Android device |
| `npm test` | Run Jest tests |
| `npm run lint` | Run ESLint |
| `node scripts/convert-radiomap.js` | Regenerate radiomap.json from Excel |
