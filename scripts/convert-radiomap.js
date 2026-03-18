#!/usr/bin/env node
/**
 * scripts/convert-radiomap.js
 *
 * Floor 9 only. Reads wifi_radiomap (3).xlsx, computes mean + std per
 * (row, col, bssid), and writes src/data/radiomap.json.
 *
 * Output shape per entry:
 *   { floor: 9, row, col, fingerprints: { bssid: { m: mean, s: std } } }
 *
 * Usage:
 *   node scripts/convert-radiomap.js
 */

'use strict';

const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'src', 'data');
const OUTPUT  = path.join(OUT_DIR, 'radiomap.json');
const MIN_STD = 2.5;   // dBm — minimum std (empirical WiFi RSSI noise floor)

// Floor 9 only; cols 0-3 only (user confirmed 4×27 grid)
const SOURCES = [
  { file: 'wifi_radiomap (3).xlsx', floor: 9 },
];

// key: "row:col:bssid" → { sum, sumSq, count }
const accumulator = new Map();

for (const { file, floor } of SOURCES) {
  const filePath = path.join(ROOT, file);
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: File not found: ${filePath}`);
    process.exit(1);
  }
  console.log(`Reading floor ${floor}: ${file}`);
  const wb   = XLSX.readFile(filePath);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);

  let kept = 0, skipped = 0;

  for (const raw of rows) {
    const r     = Number(raw['row']   ?? raw['Row']   ?? NaN);
    const c     = Number(raw['col']   ?? raw['Col']   ?? NaN);
    const bssid = String(raw['bssid'] ?? raw['BSSID'] ?? '').toLowerCase().trim();
    const rssi  = Number(raw['rssi']  ?? raw['RSSI']  ?? NaN);

    // Skip invalid or out-of-range rows
    if (isNaN(r) || isNaN(c) || isNaN(rssi) || bssid === '') { skipped++; continue; }
    if (c > 3 || r > 26) { skipped++; continue; }  // floor 9: cols 0-3, rows 0-26

    const key = `${r}:${c}:${bssid}`;
    if (!accumulator.has(key)) accumulator.set(key, { sum: 0, sumSq: 0, count: 0, floor });
    const e = accumulator.get(key);
    e.sum   += rssi;
    e.sumSq += rssi * rssi;
    e.count += 1;
    kept++;
  }
  console.log(`  → ${rows.length} rows, ${kept} kept, ${skipped} filtered`);
}

// Build grid map: "row:col" → { floor, row, col, fingerprints }
const gridMap = new Map();
let singles = 0;

for (const [key, { sum, sumSq, count, floor }] of accumulator) {
  const parts   = key.split(':');
  const row     = Number(parts[0]);
  const col     = Number(parts[1]);
  const bssid   = parts.slice(2).join(':');   // re-join bssid (contains colons)
  const gridKey = `${row}:${col}`;

  const mean = sum / count;
  const variance = count > 1
    ? (sumSq / count) - (mean * mean)   // one-pass: E[X²] - (E[X])²
    : 0;
  const std  = Math.max(Math.sqrt(Math.max(variance, 0)), MIN_STD);

  if (count === 1) singles++;

  if (!gridMap.has(gridKey)) {
    gridMap.set(gridKey, { floor, row, col, fingerprints: {} });
  }
  gridMap.get(gridKey).fingerprints[bssid] = {
    m: Math.round(mean * 10) / 10,
    s: Math.round(std  * 10) / 10,
  };
}

// Sort: row asc, col asc
const result = Array.from(gridMap.values()).sort((a, b) =>
  a.row !== b.row ? a.row - b.row : a.col - b.col
);

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf8');

console.log(`\nDone! → ${OUTPUT}`);
console.log(`  Floor 9 grid positions : ${result.length}`);
console.log(`  Unique (row,col,bssid) : ${accumulator.size}`);
console.log(`  Single-reading (σ=MIN) : ${singles}`);
console.log(`  Avg BSSIDs per position: ${(accumulator.size / result.length).toFixed(1)}`);
