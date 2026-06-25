import { Platform } from 'react-native';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { AppEventsLogger, Settings } from 'react-native-fbsdk-next';

// Meta (Facebook) SDK — powers App Promotion / app-install ad attribution.
// Gated entirely on EXPO_PUBLIC_FB_APP_ID so stg builds (or any env without
// Meta keys) silently no-op, mirroring the RevenueCat guard in @revenue-cat.
const FB_APP_ID = process.env.EXPO_PUBLIC_FB_APP_ID;

let initialized = false;

/**
 * Initialize the Meta SDK and resolve advertiser tracking via App Tracking
 * Transparency. MUST run after the app is active (call from a mount effect,
 * not module scope) so the iOS ATT system prompt can present.
 *
 * iOS 14.5+ requires ATT consent before any advertiser (IDFA) tracking. We
 * request consent first, then enable advertiser tracking only when granted —
 * Apple rejects builds that collect the IDFA without this gate.
 */
const initializeMeta = async () => {
  if (initialized || !FB_APP_ID) return;

  try {
    if (Platform.OS === 'ios') {
      const { status } = await requestTrackingPermissionsAsync();
      Settings.initializeSDK();
      if (status === 'granted') {
        await Settings.setAdvertiserTrackingEnabled(true);
      }
    } else {
      Settings.initializeSDK();
    }
    initialized = true;
  } catch (error) {
    // Never block app start on the ads SDK.
    console.warn('[Meta] SDK init failed', error);
  }
};

/**
 * Log a custom Meta app event (e.g. for conversion optimization). No-ops when
 * Meta is not configured. The standard install/activate event is logged
 * automatically via autoLogAppEventsEnabled in app.config.ts.
 */
const logMetaEvent = (name: string, params?: Record<string, string | number>) => {
  if (!FB_APP_ID) return;
  if (params) {
    AppEventsLogger.logEvent(name, params);
  } else {
    AppEventsLogger.logEvent(name);
  }
};

export { initializeMeta, logMetaEvent };
