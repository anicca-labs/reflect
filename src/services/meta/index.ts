import { Platform } from 'react-native';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { AppEventsLogger, Settings } from 'react-native-fbsdk-next';

// Meta (Facebook) SDK — powers App Promotion / app-install ad attribution.
// Gated entirely on EXPO_PUBLIC_FB_APP_ID so stg builds (or any env without
// Meta keys) silently no-op, mirroring the RevenueCat guard in @revenue-cat.
const FB_APP_ID = process.env.EXPO_PUBLIC_FB_APP_ID;

let initialized = false;

/**
 * Initialize the Meta SDK. Safe to call at app start — it does NOT present the iOS
 * ATT prompt (see requestTrackingConsent). Install/activate events still log via
 * autoLogAppEventsEnabled, so install attribution and SKAdNetwork are unaffected;
 * only IDFA-level matching waits for consent.
 */
const initializeMeta = async () => {
  if (initialized || !FB_APP_ID) return;

  try {
    Settings.initializeSDK();
    initialized = true;
  } catch (error) {
    // Never block app start on the ads SDK.
    console.warn('[Meta] SDK init failed', error);
  }
};

let trackingRequested = false;

/**
 * Ask for App Tracking Transparency, then enable advertiser tracking only if
 * granted (iOS 14.5+ requires that gate; Apple rejects builds without it).
 *
 * Deliberately NOT called at app start. It used to run from the root mount effect,
 * which made "Allow Reflect to track you across apps?" the literal first thing a new
 * iPhone user saw — a hostile system dialog landing on the splash before they had
 * written a word or seen what the app does. Now called after the first entry is
 * saved, once the person has actually got something out of it.
 *
 * Idempotent and safe to call on every save: iOS only ever shows the dialog once
 * per install, and the local guard avoids the repeat round-trip.
 */
const requestTrackingConsent = async () => {
  if (trackingRequested || !FB_APP_ID || Platform.OS !== 'ios') return;
  trackingRequested = true;

  try {
    const { status } = await requestTrackingPermissionsAsync();
    if (status === 'granted') {
      await Settings.setAdvertiserTrackingEnabled(true);
    }
  } catch (error) {
    console.warn('[Meta] tracking consent failed', error);
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

export { initializeMeta, requestTrackingConsent, logMetaEvent };
