/**
 * PermissionsHelper.ts
 * Runtime location permission request for Android WiFi scanning.
 *
 * Android 9+ (API 28+) requires ACCESS_FINE_LOCATION to receive WiFi
 * scan results. This must be requested at runtime — the manifest entry
 * alone is not enough.
 */

import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';

/** Result of a permission request. */
export type PermissionStatus = 'granted' | 'denied' | 'never_ask_again';

/**
 * Request ACCESS_FINE_LOCATION on Android.
 * On iOS, WiFi scanning uses Core Location — handle separately.
 *
 * @returns `true` when the app has permission to scan WiFi.
 */
export async function requestLocationPermission(): Promise<boolean> {
  // iOS: react-native-wifi-reborn handles its own Core Location prompts.
  // WiFi scan results are available without additional runtime permission.
  if (Platform.OS === 'ios') {
    return true;
  }

  // Already granted — skip the dialog
  const already = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  if (already) return true;

  // Request the permission
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Location Permission Required',
      message:
        'IndoorNav needs access to your location to scan nearby WiFi ' +
        'networks and determine your position on the floor map.\n\n' +
        'Your location data is processed locally and never uploaded.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
      buttonNeutral:  'Ask Me Later',
    },
  );

  if (result === PermissionsAndroid.RESULTS.GRANTED) {
    return true;
  }

  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    // User tapped "Don't ask again" — guide them to Settings
    Alert.alert(
      'Permission Permanently Denied',
      'WiFi scanning requires Location permission. ' +
        'Please enable it in Settings → App permissions.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ],
    );
  }

  return false;
}

/**
 * Check current permission status without prompting.
 * Useful for revalidating on app resume.
 */
export async function checkLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'ios') return true;
  return PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
}
