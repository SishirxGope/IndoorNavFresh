/**
 * LocalLocator.ts — Gaussian Maximum Likelihood Estimation (MLE) indoor positioning.
 *
 * Algorithm:
 *   For each radiomap position p, compute the average per-BSSID log-likelihood:
 *
 *     score(p) = (1/n) × Σ [ -0.5 × (rssi - μ)² / σ² - ln(σ) ]
 *
 *   where n = number of shared BSSIDs between live scan and position p.
 *
 *   This is more robust than KNN because:
 *   - σ automatically down-weights noisy/unstable APs
 *   - Dynamic RSSI that falls within the natural spread scores well
 *   - Normalization by n makes positions comparable regardless of AP count
 *
 *   Top-K positions (by score) are weighted by exp(score) for final position estimate.
 *
 * Floor 9 only. Single-floor mode.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RADIOMAP_DATA = require('../data/radiomap.json') as RadiomapEntry[];

// ── Constants ──────────────────────────────────────────────────────────────
const K            = 3;
const MIN_MATCHED  = 3;    // minimum shared BSSIDs — consistent with low_confidence
const PRIOR_RADIUS = 5;    // Manhattan-distance radius for Bayesian smoothing

// ── Types ──────────────────────────────────────────────────────────────────
export interface ScanItem {
  bssid: string;
  rssi:  number;
}

export interface PreviousPosition {
  floor: number;
  row:   number;
  col:   number;
}

export interface LocateResponse {
  floor:          number;
  row:            number;
  col:            number;
  confidence:     number;    // 0–1: fraction of this position's known APs we observed
  nearby:         Array<{ floor: number; row: number; col: number }>;
  matched_bssids: number;
  low_confidence: boolean;
}

interface FingerprintStats {
  m: number;   // mean RSSI (dBm)
  s: number;   // standard deviation (dBm, min 2.5)
}

interface RadiomapEntry {
  floor:        number;
  row:          number;
  col:          number;
  fingerprints: Record<string, FingerprintStats>;
}

interface Candidate {
  floor:    number;
  row:      number;
  col:      number;
  score:    number;    // normalized log-likelihood (higher = better)
  matched:  number;    // shared BSSIDs count
  totalFps: number;    // total fingerprints at this position
}

// ── Zero result helper ─────────────────────────────────────────────────────
const ZERO: LocateResponse = {
  floor: 9, row: 0, col: 0, confidence: 0, nearby: [], matched_bssids: 0, low_confidence: true,
};

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Locate the device using the live WiFi scan and an optional previous fix.
 *
 * @param scans    Array of {bssid, rssi} from react-native-wifi-reborn
 * @param previous Optional previous fix for Bayesian smoothing
 */
export function locate(
  scans:    ScanItem[],
  previous?: PreviousPosition,
): LocateResponse {
  if (scans.length === 0) return ZERO;

  // ── 1. Build live scan map with NaN / empty guard ──────────────────────
  const scanMap = new Map<string, number>();
  for (const s of scans) {
    const bssid = s.bssid.toLowerCase().trim();
    if (bssid === '' || !isFinite(s.rssi)) continue;
    scanMap.set(bssid, s.rssi);
  }
  if (scanMap.size === 0) return ZERO;

  // ── 2. Score every radiomap position with Gaussian log-likelihood ──────
  const candidates: Candidate[] = [];

  for (const entry of RADIOMAP_DATA) {
    const fps         = entry.fingerprints;
    const sharedBssids = Object.keys(fps).filter(b => scanMap.has(b));

    if (sharedBssids.length < MIN_MATCHED) continue;

    let logL = 0.0;
    for (const b of sharedBssids) {
      const { m: mu, s: sigma } = fps[b];
      const delta = (scanMap.get(b) as number) - mu;
      // Gaussian log-likelihood per BSSID (ln(2π)/2 constant omitted — same for all)
      logL += -0.5 * (delta * delta) / (sigma * sigma) - Math.log(sigma);
    }

    // Normalize by count: gives average per-BSSID likelihood
    // Prevents positions with fewer shared BSSIDs from winning by default
    const normalizedScore = logL / sharedBssids.length;

    candidates.push({
      floor:    entry.floor,
      row:      entry.row,
      col:      entry.col,
      score:    normalizedScore,
      matched:  sharedBssids.length,
      totalFps: Object.keys(fps).length,
    });
  }

  if (candidates.length === 0) return ZERO;

  // ── 3. Bayesian smoothing: prefer same floor + nearby positions ────────
  let pool = candidates;
  if (previous !== undefined && candidates.length > K) {
    const constrained = candidates.filter(
      c =>
        c.floor === previous.floor &&
        Math.abs(c.row - previous.row) + Math.abs(c.col - previous.col) <= PRIOR_RADIUS,
    );
    if (constrained.length >= K) pool = constrained;
  }

  // ── 4. Sort DESCENDING by score (highest likelihood = best match) ──────
  pool.sort((a, b) => b.score - a.score);
  const topK = pool.slice(0, K);

  // ── 5. Floor from best single candidate (discrete — do not average) ────
  const detectedFloor = topK[0].floor;

  // ── 6. Weighted mean (row, col) using exp(score) as weight ────────────
  // exp(score) maps log-likelihood to (0,1] — proper probabilistic weight
  let weightSum   = 0.0;
  let rowWeighted = 0.0;
  let colWeighted = 0.0;

  for (const c of topK) {
    const w = Math.exp(c.score);
    weightSum   += w;
    rowWeighted += w * c.row;
    colWeighted += w * c.col;
  }

  const estimatedRow = rowWeighted / weightSum;
  const estimatedCol = colWeighted / weightSum;

  // ── 7. Confidence = fraction of best position's known APs we observed ──
  const best           = topK[0];
  const confidence     = best.matched / best.totalFps;
  const low_confidence = best.matched < MIN_MATCHED || confidence < 0.25;

  // ── 8. Nearby: runner-up positions ────────────────────────────────────
  const nearby = topK.slice(1).map(c => ({ floor: c.floor, row: c.row, col: c.col }));

  return {
    floor:          detectedFloor,
    row:            Math.round(estimatedRow * 10) / 10,
    col:            Math.round(estimatedCol * 10) / 10,
    confidence,
    nearby,
    matched_bssids: best.matched,
    low_confidence,
  };
}
