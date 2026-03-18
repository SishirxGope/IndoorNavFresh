/**
 * LocationScreen.tsx
 * Amber terminal / radar-HUD indoor positioning screen.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Toast from 'react-native-toast-message';
import WifiManager from 'react-native-wifi-reborn';

import {
  checkLocationPermission,
  requestLocationPermission,
} from '../utils/PermissionsHelper';
import { locate, type PreviousPosition } from '../services/LocalLocator';
import { ShaderBackground } from '../components/ShaderBackground';

// ── Amber terminal palette ────────────────────────────────────────────────────
const C_AMBER     = '#f59e0b';
const C_AMBER_DIM = 'rgba(245,158,11,0.45)';
const C_AMBER_FNT = 'rgba(245,158,11,0.12)';
const C_AMBER_BRD = 'rgba(245,158,11,0.22)';
const C_WHITE     = '#fef9ed';
const C_DIM_TEXT  = 'rgba(254,249,237,0.45)';
const C_CARD_BG   = 'rgba(5,4,0,0.88)';
const C_MAP_BG    = 'rgba(10,8,2,0.92)';
const C_WARN      = '#fbbf24';

// ── constants ─────────────────────────────────────────────────────────────────
const POLL_MS     = 3_000;
const DOT_RADIUS  = 12;
const GRID_ROWS   = 27;
const GRID_COLS   = 4;   // Floor 9: cols 0, 1, 2, 3
const MAP_PADDING = 20;


// ── types ─────────────────────────────────────────────────────────────────────
interface ScanItem { bssid: string; rssi: number; }

interface LocateResponse {
  floor:          number;
  row:            number;
  col:            number;
  confidence:     number;
  nearby:         Array<{ floor: number; row: number; col: number }>;
  matched_bssids: number;
  low_confidence: boolean;
}

interface MapSize { w: number; h: number; }

// ── test mode data ────────────────────────────────────────────────────────────
const TEST_SCANS: Array<{ label: string; row: number; col: number; scans: ScanItem[] }> = [
  {
    label: 'Zone (2, 1)  — top-left area',
    row: 2, col: 1,
    scans: [
      { bssid: 'b0:a7:b9:cc:08:5e', rssi: -70.0 },
      { bssid: 'b0:a7:b9:cc:08:5f', rssi: -70.8 },
      { bssid: '36:e9:6a:b1:79:e5', rssi: -71.0 },
      { bssid: 'b0:a7:b9:cb:ff:d4', rssi: -77.0 },
      { bssid: 'a4:2a:95:36:ed:56', rssi: -59.0 },
      { bssid: 'a4:2a:95:2c:69:dc', rssi: -70.3 },
      { bssid: '9e:c8:08:0c:54:ef', rssi: -75.0 },
      { bssid: 'c2:18:03:9f:dd:a8', rssi: -72.5 },
    ],
  },
  {
    label: 'Zone (8, 0)  — upper corridor',
    row: 8, col: 0,
    scans: [
      { bssid: 'b0:a7:b9:cc:08:5e', rssi: -63.0 },
      { bssid: 'b0:a7:b9:cc:08:5f', rssi: -54.7 },
      { bssid: '36:e9:6a:b1:79:e5', rssi: -56.3 },
      { bssid: 'b0:a7:b9:cb:ff:d4', rssi: -69.0 },
      { bssid: 'a4:2a:95:36:ed:56', rssi: -65.7 },
      { bssid: 'a4:2a:95:2c:69:dc', rssi: -74.7 },
      { bssid: '9e:c8:08:0c:54:ef', rssi: -74.3 },
      { bssid: 'c2:18:03:9f:dd:a8', rssi: -69.0 },
      { bssid: 'e6:8f:f5:39:17:37', rssi: -85.0 },
    ],
  },
  {
    label: 'Zone (14, 2) — centre',
    row: 14, col: 2,
    scans: [
      { bssid: 'b0:a7:b9:cc:08:5e', rssi: -35.0 },
      { bssid: 'b0:a7:b9:cc:08:5f', rssi: -42.0 },
      { bssid: '36:e9:6a:b1:79:e5', rssi: -60.0 },
      { bssid: 'b0:a7:b9:cb:ff:d4', rssi: -66.0 },
      { bssid: 'a4:2a:95:36:ed:56', rssi: -74.0 },
      { bssid: 'a4:2a:95:2c:69:dc', rssi: -54.0 },
      { bssid: '9e:c8:08:0c:54:ef', rssi: -78.0 },
      { bssid: 'fe:a1:22:cd:ed:a2', rssi: -70.0 },
      { bssid: 'c2:18:03:9f:dd:a8', rssi: -85.0 },
      { bssid: 'e6:8f:f5:39:17:37', rssi: -83.0 },
    ],
  },
  {
    label: 'Zone (20, 0) — lower-left',
    row: 20, col: 0,
    scans: [
      { bssid: 'b0:a7:b9:cc:08:5e', rssi: -47.3 },
      { bssid: 'b0:a7:b9:cc:08:5f', rssi: -47.0 },
      { bssid: '36:e9:6a:b1:79:e5', rssi: -69.0 },
      { bssid: 'b0:a7:b9:cb:ff:d4', rssi: -64.7 },
      { bssid: 'a4:2a:95:36:ed:56', rssi: -79.0 },
      { bssid: 'a4:2a:95:2c:69:dc', rssi: -81.5 },
      { bssid: '9e:c8:08:0c:54:ef', rssi: -85.0 },
      { bssid: 'e6:8f:f5:39:17:37', rssi: -72.7 },
    ],
  },
  {
    label: 'Zone (25, 3) — bottom area',
    row: 25, col: 3,
    scans: [
      { bssid: 'b0:a7:b9:cc:08:5e', rssi: -55.7 },
      { bssid: 'b0:a7:b9:cc:08:5f', rssi: -51.3 },
      { bssid: '36:e9:6a:b1:79:e5', rssi: -71.3 },
      { bssid: 'b0:a7:b9:cb:ff:d4', rssi: -73.0 },
      { bssid: 'a4:2a:95:36:ed:56', rssi: -85.0 },
      { bssid: 'a4:2a:95:2c:69:dc', rssi: -84.0 },
      { bssid: '9e:c8:08:0c:54:ef', rssi: -88.0 },
      { bssid: 'c2:18:03:9f:dd:a8', rssi: -79.0 },
    ],
  },
];

// ── helpers ───────────────────────────────────────────────────────────────────
// Square cell size — use the smaller dimension so cells are never stretched
function gridLayout(mapSize: MapSize) {
  const usableW = mapSize.w - 2 * MAP_PADDING;
  const usableH = mapSize.h - 2 * MAP_PADDING;
  const cell = Math.min(usableW / GRID_COLS, usableH / GRID_ROWS);
  const gridW = cell * GRID_COLS;
  const gridH = cell * GRID_ROWS;
  return {
    cell,
    offsetX: (mapSize.w - gridW) / 2,
    offsetY: (mapSize.h - gridH) / 2,
  };
}

// Data points sit at cell centres
function gridToPixel(row: number, col: number, mapSize: MapSize) {
  const { cell, offsetX, offsetY } = gridLayout(mapSize);
  return {
    x: offsetX + (col + 0.5) * cell,
    y: offsetY + (row + 0.5) * cell,
  };
}

// Cell-boundary intersection (corners of each cell)
function boundaryToPixel(bRow: number, bCol: number, mapSize: MapSize) {
  const { cell, offsetX, offsetY } = gridLayout(mapSize);
  return {
    x: offsetX + bCol * cell,
    y: offsetY + bRow * cell,
  };
}

// ── component ─────────────────────────────────────────────────────────────────
export default function LocationScreen(): React.JSX.Element {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [location,      setLocation]      = useState<LocateResponse | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [mapSize,       setMapSize]       = useState<MapSize>({ w: 0, h: 0 });

  const [testMode,      setTestMode]      = useState(false);
  const testIndexRef = useRef(0);
  const previousRef  = useRef<PreviousPosition | undefined>(undefined);

  // ── Reanimated shared values ───────────────────────────────────────────────
  const scale      = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTx    = useSharedValue(0);
  const savedTy    = useSharedValue(0);

  const dotLeft    = useSharedValue(-DOT_RADIUS);
  const dotTop     = useSharedValue(-DOT_RADIUS);
  const pulseScale = useSharedValue(1);

  // Blinking scan indicator
  const scanOpacity = useSharedValue(1);

  // ── pulse animation ────────────────────────────────────────────────────────
  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.8, { duration: 900 }),
        withTiming(1.0, { duration: 900 }),
      ),
      -1,
    );
  }, [pulseScale]);

  // ── scan blink animation ───────────────────────────────────────────────────
  useEffect(() => {
    scanOpacity.value = withRepeat(
      withSequence(
        withTiming(0.15, { duration: 400 }),
        withTiming(1.0,  { duration: 400 }),
      ),
      -1,
    );
  }, [scanOpacity]);

  // ── update dot position ────────────────────────────────────────────────────
  useEffect(() => {
    if (!location || mapSize.w === 0) return;
    const { x, y } = gridToPixel(location.row, location.col, mapSize);
    dotLeft.value = withSpring(x - DOT_RADIUS, { damping: 18, stiffness: 120 });
    dotTop.value  = withSpring(y - DOT_RADIUS, { damping: 18, stiffness: 120 });
  }, [location, mapSize, dotLeft, dotTop]);

  // ── gesture handlers ────────────────────────────────────────────────────────
  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => { scale.value = Math.max(1, Math.min(5, savedScale.value * e.scale)); })
    .onEnd(()    => { savedScale.value = scale.value; });

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .onUpdate((e) => {
      translateX.value = savedTx.value + e.translationX;
      translateY.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = translateX.value;
      savedTy.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value      = withSpring(1);
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      savedScale.value = 1;
      savedTx.value    = 0;
      savedTy.value    = 0;
    });

  const gestures = Gesture.Race(doubleTap, Gesture.Simultaneous(pinchGesture, panGesture));

  // ── animated styles ─────────────────────────────────────────────────────────
  const mapAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const dotContainerStyle = useAnimatedStyle(() => ({
    left: dotLeft.value,
    top:  dotTop.value,
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity:   withTiming(pulseScale.value > 1.3 ? 0 : 0.5),
  }));

  const scanBlinkStyle = useAnimatedStyle(() => ({ opacity: scanOpacity.value }));

  // ── permission ─────────────────────────────────────────────────────────────
  useEffect(() => {
    requestLocationPermission().then(setHasPermission);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next: AppStateStatus) => {
      if (next === 'active') setHasPermission(await checkLocationPermission());
    });
    return () => sub.remove();
  }, []);

  // ── scan + locate ───────────────────────────────────────────────────────────
  const scanAndLocate = useCallback(async () => {
    setLoading(true);
    try {
      let scans: ScanItem[];

      if (__DEV__ && testMode) {
        const entry = TEST_SCANS[testIndexRef.current % TEST_SCANS.length];
        scans = entry.scans;
        testIndexRef.current += 1;
      } else {
        if (Platform.OS === 'android') {
          const nets = await WifiManager.loadWifiList();
          scans = (nets as any[])
            .map((n) => ({
              bssid: (n.BSSID as string)?.toLowerCase() ?? '',
              rssi:  typeof n.level === 'number' && isFinite(n.level) ? n.level : -100,
            }))
            .filter((s) => s.bssid !== '');
        } else {
          Toast.show({ type: 'info', text1: 'iOS scanning limited',
            text2: 'Use Test Mode or Android for full WiFi scanning.' });
          return;
        }
      }

      if (scans.length === 0) {
        Toast.show({ type: 'info', text1: 'No WiFi networks in scan' });
        return;
      }

      const data = locate(scans, previousRef.current);
      setLocation(data);
      previousRef.current = { floor: data.floor, row: data.row, col: data.col };

      if (data.low_confidence) {
        Toast.show({
          type: 'info', text1: 'Low confidence',
          text2: `Only ${data.matched_bssids} known APs matched`,
          visibilityTime: 2000,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Toast.show({ type: 'error', text1: 'Location error', text2: msg });
    } finally {
      setLoading(false);
    }
  }, [testMode]);

  // ── polling loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (hasPermission !== true) return;
    scanAndLocate();
    const id = setInterval(scanAndLocate, POLL_MS);
    return () => clearInterval(id);
  }, [hasPermission, testMode, scanAndLocate]);

  // ── derived display values ──────────────────────────────────────────────────
  const pct = location ? Math.round(location.confidence * 100) : 0;


  // ── render — permission denied ──────────────────────────────────────────────
  if (hasPermission === false) {
    return (
      <View style={styles.centred}>
        <ShaderBackground />
        <Text style={styles.permTitle}>&gt;&gt; PERMISSION REQUIRED</Text>
        <Text style={styles.permBody}>
          WiFi scanning on Android requires Location permission.{'\n'}
          Settings → Apps → IndoorNav → Permissions
        </Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => requestLocationPermission().then(setHasPermission)}
        >
          <Text style={styles.retryBtnText}>RETRY</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── render — awaiting permission ────────────────────────────────────────────
  if (hasPermission === null) {
    return (
      <View style={styles.centred}>
        <ShaderBackground />
        <ActivityIndicator size="large" color={C_AMBER} />
        <Text style={[styles.permBody, { marginTop: 16 }]}>Requesting permission…</Text>
      </View>
    );
  }

  // ── render — main screen ────────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* ── Shader background ── */}
      <ShaderBackground />

      {/* ── Test mode banner ── */}
      {__DEV__ && testMode && (
        <View style={styles.testBanner}>
          <Text style={styles.testBannerText}>
            {`>> TEST MODE  ·  SCAN ${(testIndexRef.current % TEST_SCANS.length) + 1} / ${TEST_SCANS.length}`}
          </Text>
        </View>
      )}

      {/* ── Zoomable floor map ── */}
      <View style={styles.mapWrapper}>
        {/* Corner brackets — targeting reticle */}
        <View style={[styles.corner, styles.cornerTL]} pointerEvents="none">
          <View style={styles.cornerH} />
          <View style={styles.cornerV} />
        </View>
        <View style={[styles.corner, styles.cornerTR]} pointerEvents="none">
          <View style={styles.cornerH} />
          <View style={[styles.cornerV, { right: 0 }]} />
        </View>
        <View style={[styles.corner, styles.cornerBL]} pointerEvents="none">
          <View style={styles.cornerH} />
          <View style={styles.cornerV} />
        </View>
        <View style={[styles.corner, styles.cornerBR]} pointerEvents="none">
          <View style={styles.cornerH} />
          <View style={[styles.cornerV, { right: 0 }]} />
        </View>

        <GestureDetector gesture={gestures}>
          <Animated.View
            style={[styles.mapContainer, mapAnimStyle]}
            onLayout={(e) =>
              setMapSize({
                w: e.nativeEvent.layout.width,
                h: e.nativeEvent.layout.height,
              })
            }
          >
            {/* ── Tactical grid ── */}
            {mapSize.w > 0 && (
              <>
                {/* Vertical boundary lines */}
                {Array.from({ length: GRID_COLS + 1 }).map((_, c) => {
                  const top = boundaryToPixel(0, c, mapSize);
                  const bot = boundaryToPixel(GRID_ROWS, c, mapSize);
                  return (
                    <View
                      key={`v${c}`}
                      style={[styles.gridLineV, {
                        left: top.x,
                        top: top.y,
                        height: bot.y - top.y,
                      }]}
                    />
                  );
                })}
                {/* Horizontal boundary lines */}
                {Array.from({ length: GRID_ROWS + 1 }).map((_, r) => {
                  const left = boundaryToPixel(r, 0, mapSize);
                  const right = boundaryToPixel(r, GRID_COLS, mapSize);
                  return (
                    <View
                      key={`h${r}`}
                      style={[styles.gridLineH, {
                        top: left.y,
                        left: left.x,
                        width: right.x - left.x,
                      }]}
                    />
                  );
                })}
                {/* Corner crosshairs */}
                {Array.from({ length: GRID_ROWS + 1 }).flatMap((_, r) =>
                  Array.from({ length: GRID_COLS + 1 }).map((_, c) => {
                    const { x, y } = boundaryToPixel(r, c, mapSize);
                    return (
                      <React.Fragment key={`g${r}-${c}`}>
                        <View style={[styles.crossH, { left: x - 6, top: y - 0.5 }]} />
                        <View style={[styles.crossV, { left: x - 0.5, top: y - 6 }]} />
                      </React.Fragment>
                    );
                  })
                )}
              </>
            )}

            {location && (
              <Animated.View style={[styles.dotWrapper, dotContainerStyle]}>
                <Animated.View style={[styles.dotPulse, pulseStyle]} />
                <View style={styles.dotCore} />
              </Animated.View>
            )}
          </Animated.View>
        </GestureDetector>

        {/* Zoom hint */}
        <Text style={styles.zoomHint}>&gt;&gt; PINCH · DBL-TAP RESET</Text>

        {/* Scan indicator */}
        {loading && (
          <Animated.View style={[styles.scanBadge, scanBlinkStyle]}>
            <Text style={styles.scanBadgeText}>&gt;&gt; SCAN</Text>
          </Animated.View>
        )}
      </View>

      {/* ── Info card — terminal readout ── */}
      <View style={styles.card}>
        {location ? (
          <>
            <Text style={styles.cardHeader}>&gt;&gt; POSITION LOCK</Text>
            <View style={styles.cardDivider} />

            <View style={styles.termRow}>
              <Text style={styles.termLabel}>FLOOR</Text>
              <Text style={styles.termValue}>F {location.floor}</Text>
            </View>

            <View style={styles.termRow}>
              <Text style={styles.termLabel}>ZONE</Text>
              <Text style={styles.termValue}>
                R{String(Math.round(location.row)).padStart(2, '0')} / C{location.col}
              </Text>
            </View>

            <View style={styles.termRow}>
              <Text style={styles.termLabel}>SIGNAL</Text>
              <Text style={styles.termValue}>{location.matched_bssids} AP</Text>
            </View>

            <View style={styles.termRow}>
              <Text style={styles.termLabel}>CONF</Text>
              <View style={styles.confBar}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <View
                    key={i}
                    style={[styles.confSeg, i < Math.round(pct / 10) && styles.confSegFill]}
                  />
                ))}
                <Text style={styles.confPct}>{pct}%</Text>
              </View>
            </View>

            {location.low_confidence && (
              <Text style={styles.warnText}>&gt; LOW SIGNAL — REPOSITION</Text>
            )}
          </>
        ) : (
          <Text style={styles.cardHeader}>&gt;&gt; SCANNING...</Text>
        )}
      </View>

      {/* ── Test mode toggle (DEV only) ── */}
      {__DEV__ && (
        <TouchableOpacity
          style={[styles.testToggle, testMode && styles.testToggleActive]}
          onPress={() => {
            testIndexRef.current = 0;
            previousRef.current  = undefined;
            setLocation(null);
            setTestMode((v) => !v);
          }}
        >
          <Text style={styles.testToggleText}>
            {testMode ? '◉ ACTIVE' : '>> TEST'}
          </Text>
        </TouchableOpacity>
      )}

      <Toast />
    </View>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: 'transparent',
  },

  // Permission / loading screens
  centred: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    padding:         32,
    backgroundColor: 'transparent',
  },
  permTitle: {
    fontFamily:    'monospace',
    fontSize:      15,
    fontWeight:    '700',
    color:         C_AMBER,
    textAlign:     'center',
    marginBottom:  14,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  permBody: {
    fontFamily:    'monospace',
    fontSize:      13,
    color:         C_DIM_TEXT,
    textAlign:     'center',
    lineHeight:    22,
    letterSpacing: 0.5,
  },
  retryBtn: {
    marginTop:         24,
    paddingVertical:   12,
    paddingHorizontal: 32,
    backgroundColor:   'rgba(245,158,11,0.15)',
    borderRadius:      2,
    borderWidth:       1,
    borderColor:       C_AMBER_BRD,
  },
  retryBtnText: {
    fontFamily:    'monospace',
    color:         C_AMBER,
    fontWeight:    '700',
    fontSize:      13,
    letterSpacing: 3,
  },

  // Test mode banner
  testBanner: {
    backgroundColor:   C_AMBER_FNT,
    borderBottomWidth: 1,
    borderBottomColor: C_AMBER_BRD,
    paddingVertical:   7,
    alignItems:        'center',
  },
  testBannerText: {
    fontFamily:    'monospace',
    fontSize:      11,
    fontWeight:    '700',
    color:         C_AMBER,
    letterSpacing: 1.5,
  },

  // Map
  mapWrapper: {
    flex:            1,
    margin:          12,
    marginBottom:    6,
    borderRadius:    4,
    overflow:        'hidden',
    backgroundColor: C_MAP_BG,
    borderWidth:     1,
    borderColor:     C_AMBER_BRD,
    elevation:       8,
    shadowColor:     C_AMBER,
    shadowOpacity:   0.15,
    shadowRadius:    12,
  },
  mapContainer: {
    flex: 1,
  },
  gridLineH: {
    position:        'absolute',
    height:          StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(245,158,11,0.12)',
  },
  gridLineV: {
    position:        'absolute',
    width:           StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(245,158,11,0.12)',
  },
  crossH: {
    position:        'absolute',
    width:           12,
    height:          1,
    backgroundColor: 'rgba(245,158,11,0.35)',
  },
  crossV: {
    position:        'absolute',
    width:           1,
    height:          12,
    backgroundColor: 'rgba(245,158,11,0.35)',
  },

  // Corner bracket decorations
  corner: {
    position: 'absolute',
    width:    16,
    height:   16,
    zIndex:   10,
  },
  cornerTL: { top: 8, left: 8 },
  cornerTR: { top: 8, right: 8 },
  cornerBL: { bottom: 8, left: 8 },
  cornerBR: { bottom: 8, right: 8 },
  cornerH: {
    position:        'absolute',
    height:          1.5,
    width:           16,
    backgroundColor: C_AMBER,
    top:             0,
    left:            0,
  },
  cornerV: {
    position:        'absolute',
    width:           1.5,
    height:          16,
    backgroundColor: C_AMBER,
    top:             0,
    left:            0,
  },

  // Location dot
  dotWrapper: {
    position:       'absolute',
    width:          DOT_RADIUS * 2,
    height:         DOT_RADIUS * 2,
    alignItems:     'center',
    justifyContent: 'center',
  },
  dotPulse: {
    position:        'absolute',
    width:           DOT_RADIUS * 2,
    height:          DOT_RADIUS * 2,
    borderRadius:    DOT_RADIUS,
    backgroundColor: 'rgba(245,158,11,0.35)',
  },
  dotCore: {
    width:           14,
    height:          14,
    borderRadius:    7,
    backgroundColor: C_AMBER,
    borderWidth:     2,
    borderColor:     C_WHITE,
    elevation:       6,
    shadowColor:     C_AMBER,
    shadowOpacity:   0.7,
    shadowRadius:    6,
  },

  // Overlays
  scanBadge: {
    position:        'absolute',
    top:             10,
    right:           10,
    backgroundColor: C_AMBER_FNT,
    borderRadius:    2,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderWidth:     1,
    borderColor:     C_AMBER_BRD,
  },
  scanBadgeText: {
    fontFamily:    'monospace',
    fontSize:      10,
    fontWeight:    '700',
    color:         C_AMBER,
    letterSpacing: 2,
  },
  zoomHint: {
    position:      'absolute',
    bottom:        6,
    alignSelf:     'center',
    fontFamily:    'monospace',
    fontSize:      10,
    color:         C_AMBER_DIM,
    letterSpacing: 1.2,
  },

  // Info card — terminal readout
  card: {
    margin:          12,
    marginTop:       6,
    padding:         16,
    borderRadius:    4,
    backgroundColor: C_CARD_BG,
    borderWidth:     1,
    borderColor:     C_AMBER_BRD,
    elevation:       10,
    shadowColor:     C_AMBER,
    shadowOpacity:   0.2,
    shadowRadius:    12,
  },
  cardHeader: {
    fontFamily:    'monospace',
    fontSize:      13,
    fontWeight:    '700',
    color:         C_AMBER,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom:  10,
  },
  cardDivider: {
    height:          1,
    backgroundColor: C_AMBER_BRD,
    marginBottom:    10,
  },
  termRow: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingVertical:   5,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245,158,11,0.08)',
  },
  termLabel: {
    fontFamily:    'monospace',
    fontSize:      11,
    color:         C_DIM_TEXT,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  termValue: {
    fontFamily:    'monospace',
    fontSize:      13,
    fontWeight:    '700',
    color:         C_WHITE,
    letterSpacing: 0.5,
  },
  warnText: {
    fontFamily:    'monospace',
    fontSize:      11,
    color:         C_WARN,
    marginTop:     10,
    letterSpacing: 1,
  },

  // Confidence bar
  confBar: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           3,
  },
  confSeg: {
    width:       10,
    height:      12,
    borderWidth: 1,
    borderColor: C_AMBER_BRD,
    borderRadius: 1,
  },
  confSegFill: {
    backgroundColor: C_AMBER,
    borderColor:     C_AMBER,
  },
  confPct: {
    fontFamily:    'monospace',
    fontSize:      11,
    color:         C_AMBER,
    marginLeft:    6,
    fontWeight:    '700',
  },

  // Test toggle
  testToggle: {
    position:          'absolute',
    bottom:            148,
    right:             16,
    backgroundColor:   C_AMBER_FNT,
    borderRadius:      2,
    paddingVertical:   9,
    paddingHorizontal: 14,
    borderWidth:       1,
    borderColor:       C_AMBER_BRD,
    elevation:         6,
    shadowColor:       C_AMBER,
    shadowOpacity:     0.2,
    shadowRadius:      6,
  },
  testToggleActive: {
    backgroundColor: 'rgba(245,158,11,0.22)',
    borderColor:     C_AMBER,
  },
  testToggleText: {
    fontFamily:    'monospace',
    fontSize:      11,
    fontWeight:    '700',
    color:         C_AMBER,
    letterSpacing: 1.5,
  },
});
