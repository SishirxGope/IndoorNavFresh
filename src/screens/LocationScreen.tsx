/**
 * LocationScreen.tsx
 * Complete indoor positioning screen combining all features:
 *   • Prompt 2 — runtime location permission check
 *   • Prompt 3 — pinch-zoomable / pannable floor map with animated dot
 *   • Prompt 4 — __DEV__ test mode with real radiomap scan data
 *
 * Place floorplan.png in IndoorNav/assets/floorplan.png before running.
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
import axios from 'axios';
import WifiManager from 'react-native-wifi-reborn';

import { API_URL } from '@env';
import {
  checkLocationPermission,
  requestLocationPermission,
} from '../utils/PermissionsHelper';

// ── constants ─────────────────────────────────────────────────────────────────
const API_BASE    = API_URL ?? 'http://10.0.2.2:8000';
const POLL_MS     = 3_000;
const DOT_RADIUS  = 12;

// Actual grid dimensions from the radiomap dataset (rows 0–26, cols 0–7)
const GRID_ROWS   = 27;
const GRID_COLS   = 8;

// ── types ─────────────────────────────────────────────────────────────────────
interface ScanItem { bssid: string; rssi: number; }

interface LocateResponse {
  row:            number;
  col:            number;
  confidence:     number;
  nearby:         Array<{ row: number; col: number }>;
  matched_bssids: number;
  low_confidence: boolean;
}

interface MapSize { w: number; h: number; }

// ── test mode data ────────────────────────────────────────────────────────────
// Real mean RSSI fingerprints extracted from the radiomap for 5 grid positions.
// Used when test mode is active (__DEV__ only).
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
/**
 * Map grid (row, col) → pixel position inside the floor-map image container.
 *
 * The floor plan has rows on the Y axis (0 at top, GRID_ROWS-1 at bottom)
 * and cols on the X axis (0 at left, GRID_COLS-1 at right).
 */
function gridToPixel(row: number, col: number, mapSize: MapSize) {
  return {
    x: (col / (GRID_COLS - 1)) * mapSize.w,
    y: (row / (GRID_ROWS - 1)) * mapSize.h,
  };
}

// ── component ─────────────────────────────────────────────────────────────────
export default function LocationScreen(): React.JSX.Element {
  // ── state ──────────────────────────────────────────────────────────────────
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [location,      setLocation]      = useState<LocateResponse | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [mapSize,       setMapSize]       = useState<MapSize>({ w: 0, h: 0 });

  // Test mode — only relevant in __DEV__ builds
  const [testMode,      setTestMode]      = useState(false);
  const testIndexRef = useRef(0);

  // Bayesian smoothing: remember last fix
  const previousRef = useRef<{ row: number; col: number } | undefined>(undefined);

  // ── Reanimated shared values ───────────────────────────────────────────────

  // Map pan/pinch transform
  const scale      = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTx    = useSharedValue(0);
  const savedTy    = useSharedValue(0);

  // Dot position (in map-container local pixels)
  const dotLeft    = useSharedValue(-DOT_RADIUS);
  const dotTop     = useSharedValue(-DOT_RADIUS);

  // Dot pulse ring scale
  const pulseScale = useSharedValue(1);

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

  // ── update dot when location or map size changes ───────────────────────────
  useEffect(() => {
    if (!location || mapSize.w === 0) return;
    const { x, y } = gridToPixel(location.row, location.col, mapSize);
    dotLeft.value = withSpring(x - DOT_RADIUS, { damping: 18, stiffness: 120 });
    dotTop.value  = withSpring(y - DOT_RADIUS, { damping: 18, stiffness: 120 });
  }, [location, mapSize, dotLeft, dotTop]);

  // ── gesture handlers ────────────────────────────────────────────────────────
  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(5, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

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

  // Double-tap to reset zoom
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

  const composed = Gesture.Simultaneous(pinchGesture, panGesture);
  const gestures = Gesture.Race(doubleTap, composed);

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

  // ── permission check on mount & app-resume ─────────────────────────────────
  useEffect(() => {
    requestLocationPermission().then(setHasPermission);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next: AppStateStatus) => {
      if (next === 'active') {
        const ok = await checkLocationPermission();
        setHasPermission(ok);
      }
    });
    return () => sub.remove();
  }, []);

  // ── scan + locate ───────────────────────────────────────────────────────────
  const scanAndLocate = useCallback(async () => {
    setLoading(true);
    try {
      let scans: ScanItem[];

      if (__DEV__ && testMode) {
        // Test mode: cycle through hardcoded scans
        const entry = TEST_SCANS[testIndexRef.current % TEST_SCANS.length];
        scans = entry.scans;
        testIndexRef.current += 1;
      } else {
        // Real WiFi scan
        if (Platform.OS === 'android') {
          const nets = await WifiManager.loadWifiList();
          scans = (nets as any[]).map((n) => ({
            bssid: (n.BSSID as string)?.toLowerCase() ?? '',
            rssi:  n.level as number ?? -100,
          }));
        } else {
          // iOS: WifiManager.getCurrentWifiSSID() gives only the connected AP.
          // For full scan support on iOS, a custom native module is required.
          Toast.show({
            type:  'info',
            text1: 'iOS scanning limited',
            text2: 'Use Test Mode or a real Android device for full WiFi scanning.',
          });
          return;
        }
      }

      if (scans.length === 0) {
        Toast.show({ type: 'info', text1: 'No WiFi networks in scan' });
        return;
      }

      const body: Record<string, unknown> = { scans };
      if (previousRef.current) body.previous = previousRef.current;

      const { data } = await axios.post<LocateResponse>(`${API_BASE}/locate`, body, {
        timeout: 5_000,
      });

      setLocation(data);
      previousRef.current = { row: data.row, col: data.col };

      if (data.low_confidence) {
        Toast.show({
          type:  'info',
          text1: 'Low confidence',
          text2: `Only ${data.matched_bssids} known APs matched`,
          visibilityTime: 2000,
        });
      }
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err)
          ? (err.response?.data?.detail ?? err.message)
          : String(err);
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
  const pct   = location ? Math.round(location.confidence * 100) : 0;
  const color  =
    pct >= 70 ? '#22c55e' :
    pct >= 40 ? '#f59e0b' : '#ef4444';

  // ── render — permission denied ──────────────────────────────────────────────
  if (hasPermission === false) {
    return (
      <View style={styles.centred}>
        <Text style={styles.permTitle}>Location Permission Required</Text>
        <Text style={styles.permBody}>
          WiFi scanning on Android needs Location permission. Please allow it in
          your device Settings → Apps → IndoorNav → Permissions.
        </Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => requestLocationPermission().then(setHasPermission)}
        >
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── render — waiting for permission response ────────────────────────────────
  if (hasPermission === null) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.permBody}>Requesting permission…</Text>
      </View>
    );
  }

  // ── render — main screen ────────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* ── Test Mode banner (DEV only) ── */}
      {__DEV__ && testMode && (
        <View style={styles.testBanner}>
          <Text style={styles.testBannerText}>
            TEST MODE — simulated scans (cycle {(testIndexRef.current % TEST_SCANS.length) + 1}/
            {TEST_SCANS.length})
          </Text>
        </View>
      )}

      {/* ── Zoomable floor map ── */}
      <View style={styles.mapWrapper}>
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
            {/* Floor plan image */}
            <Animated.Image
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              source={require('../../assets/floorplan.png')}
              style={styles.mapImage}
              resizeMode="contain"
            />

            {/* Location dot — absolutely positioned inside the map container */}
            {location && (
              <Animated.View style={[styles.dotWrapper, dotContainerStyle]}>
                {/* Pulse ring */}
                <Animated.View style={[styles.dotPulse, pulseStyle]} />
                {/* Core dot */}
                <View style={styles.dotCore} />
              </Animated.View>
            )}
          </Animated.View>
        </GestureDetector>

        {/* Zoom hint */}
        <Text style={styles.zoomHint}>Pinch to zoom · Double-tap to reset</Text>

        {/* Loading spinner */}
        {loading && (
          <View style={styles.loadingBadge}>
            <ActivityIndicator size="small" color="#3b82f6" />
          </View>
        )}
      </View>

      {/* ── Info card ── */}
      <View style={styles.card}>
        {location ? (
          <>
            <Text style={styles.cardTitle}>
              You are at Zone ({Math.round(location.row)}, {Math.round(location.col)})
            </Text>

            <View style={styles.cardRow}>
              <Text style={styles.label}>Confidence</Text>
              <Text style={[styles.value, { color }]}>{pct}%</Text>
            </View>

            <View style={styles.cardRow}>
              <Text style={styles.label}>Matched APs</Text>
              <Text style={styles.value}>{location.matched_bssids}</Text>
            </View>

            {location.nearby.length > 0 && (
              <View style={styles.cardRow}>
                <Text style={styles.label}>Nearby zones</Text>
                <Text style={styles.value}>
                  {location.nearby
                    .map((p) => `(${Math.round(p.row)},${Math.round(p.col)})`)
                    .join('  ')}
                </Text>
              </View>
            )}

            {location.low_confidence && (
              <Text style={styles.lowConfBadge}>⚠ Low confidence — move closer to known APs</Text>
            )}
          </>
        ) : (
          <View style={styles.cardRow}>
            <ActivityIndicator size="small" color="#3b82f6" />
            <Text style={[styles.label, { marginLeft: 8 }]}>Scanning…</Text>
          </View>
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
            {testMode ? '🔴 TEST MODE ON' : '🧪 Test Mode'}
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
    backgroundColor: '#f1f5f9',
  },

  // Permission denied
  centred: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    padding:        32,
    backgroundColor: '#f1f5f9',
  },
  permTitle: {
    fontSize:     18,
    fontWeight:   '700',
    color:        '#1e293b',
    textAlign:    'center',
    marginBottom: 12,
  },
  permBody: {
    fontSize:   14,
    color:      '#64748b',
    textAlign:  'center',
    lineHeight: 22,
  },
  retryBtn: {
    marginTop:       24,
    paddingVertical: 10,
    paddingHorizontal: 28,
    backgroundColor: '#3b82f6',
    borderRadius:    8,
  },
  retryBtnText: {
    color:      '#fff',
    fontWeight: '600',
    fontSize:   15,
  },

  // Test mode banner
  testBanner: {
    backgroundColor: '#fef08a',
    paddingVertical: 6,
    alignItems:      'center',
  },
  testBannerText: {
    fontSize:   12,
    fontWeight: '700',
    color:      '#713f12',
  },

  // Map
  mapWrapper: {
    flex:         1,
    margin:       12,
    borderRadius: 12,
    overflow:     'hidden',
    backgroundColor: '#ffffff',
    elevation:    3,
    shadowColor:  '#000',
    shadowOpacity: 0.08,
    shadowRadius:  6,
  },
  mapContainer: {
    flex: 1,
  },
  mapImage: {
    width:  '100%',
    height: '100%',
  },

  // Dot
  dotWrapper: {
    position:       'absolute',
    width:          DOT_RADIUS * 2,
    height:         DOT_RADIUS * 2,
    alignItems:     'center',
    justifyContent: 'center',
  },
  dotPulse: {
    position:     'absolute',
    width:        DOT_RADIUS * 2,
    height:       DOT_RADIUS * 2,
    borderRadius: DOT_RADIUS,
    backgroundColor: 'rgba(59,130,246,0.35)',
  },
  dotCore: {
    width:        14,
    height:       14,
    borderRadius: 7,
    backgroundColor: '#3b82f6',
    borderWidth:  2.5,
    borderColor:  '#ffffff',
    elevation:    5,
    shadowColor:  '#1d4ed8',
    shadowOpacity: 0.4,
    shadowRadius:  4,
  },

  // Overlays
  loadingBadge: {
    position:        'absolute',
    top:             10,
    right:           10,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius:    14,
    padding:         6,
  },
  zoomHint: {
    position:   'absolute',
    bottom:     6,
    alignSelf:  'center',
    fontSize:   11,
    color:      '#94a3b8',
  },

  // Info card
  card: {
    margin:          12,
    marginTop:       0,
    padding:         16,
    borderRadius:    12,
    backgroundColor: '#ffffff',
    elevation:       3,
    shadowColor:     '#000',
    shadowOpacity:   0.06,
    shadowRadius:    6,
  },
  cardTitle: {
    fontSize:     16,
    fontWeight:   '700',
    color:        '#1e293b',
    marginBottom: 10,
  },
  cardRow: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    marginVertical:  3,
  },
  label: {
    fontSize: 13,
    color:    '#64748b',
  },
  value: {
    fontSize:   13,
    fontWeight: '600',
    color:      '#1e293b',
  },
  lowConfBadge: {
    marginTop:  10,
    fontSize:   12,
    fontWeight: '600',
    color:      '#f59e0b',
  },

  // Test toggle button (floating)
  testToggle: {
    position:        'absolute',
    bottom:          140,
    right:           16,
    backgroundColor: '#e2e8f0',
    borderRadius:    20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    elevation:       4,
    shadowColor:     '#000',
    shadowOpacity:   0.12,
    shadowRadius:    4,
  },
  testToggleActive: {
    backgroundColor: '#fef08a',
  },
  testToggleText: {
    fontSize:   12,
    fontWeight: '700',
    color:      '#1e293b',
  },
});
