import type { ConfigContext, ExpoConfig } from 'expo/config';

const SPLASH_IMAGE = './assets/images/splash.png';
const SPLASH_BG_LIGHT = '#F5F0E8';
const SPLASH_BG_DARK = '#110f0e';
// 288dp is the Android 12+ maximum for windowSplashScreenAnimatedIcon — the system
// clips the icon to a circle at this size. Must match animationViewStyle in _layout.tsx
// so the Rive animation starts at the same visual size as the native splash icon.
const ANDROID_SPLASH_SIZE = 288;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  owner: 'anicca-labs',
  name: process.env.DISPLAY_NAME ?? 'reflect',
  slug: 'reflect',
  version: config.version,
  // Fingerprint policy: the runtimeVersion is a hash of the native layer (native
  // deps, config plugins, entitlements, build properties, patches). Adding or
  // changing native code automatically changes it, so an OTA can never be served
  // to a binary that lacks the native module it needs — no manual version bumping.
  runtimeVersion: {
    policy: 'fingerprint',
  },
  updates: {
    url: process.env.EXPO_UPDATE_URL,
    checkAutomatically: 'ON_LOAD',
    requestHeaders: {
      'expo-channel-name': process.env.EXPO_UPDATE_CHANNEL ?? 'prd',
    },
  },
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: process.env.EXPO_PUBLIC_APP_SCHEMA ?? 'reflect',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: process.env.APP_IDENTIFIER ?? 'com.reflect.prod',
    googleServicesFile: process.env.GOOGLE_SERVICES_INFOPLIST_PATH,
    infoPlist: {
      UIBackgroundModes: ['fetch', 'remote-notification'],
      ITSAppUsesNonExemptEncryption: false,
      // Required by Apple (ITMS-90683): bundled SDKs reference Photo Library
      // APIs, so a purpose string must be present even though the app itself
      // only touches photos when you attach one to an entry.
      NSPhotoLibraryUsageDescription:
        'Reflect uses your photo library so you can add photos to your journal entries.',
      // Meta's SKAdNetwork IDs — let the App Store attribute Meta-sourced
      // installs to your ad campaigns even when ATT is denied (privacy-safe
      // aggregate attribution). NSUserTrackingUsageDescription is injected by
      // the react-native-fbsdk-next plugin via iosUserTrackingPermission below.
      SKAdNetworkItems: [
        { SKAdNetworkIdentifier: 'v9wttpbfk9.skadnetwork' },
        { SKAdNetworkIdentifier: 'n38lu8286q.skadnetwork' },
      ],
    },
    entitlements: {
      'aps-environment': 'production',
      'com.apple.developer.applesignin': ['Default'],
      ...(process.env.EXPO_PUBLIC_APPLE_MERCHANT_ID
        ? { 'com.apple.developer.in-app-payments': [process.env.EXPO_PUBLIC_APPLE_MERCHANT_ID] }
        : {}),
    },
  },
  android: {
    package: process.env.APP_IDENTIFIER ?? 'com.reflect.prod',
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: SPLASH_BG_LIGHT,
    },
    predictiveBackGestureEnabled: false,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON_PATH,
    permissions: ['android.permission.POST_NOTIFICATIONS'],
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    [
      'expo-splash-screen',
      {
        backgroundColor: SPLASH_BG_LIGHT,
        image: SPLASH_IMAGE,
        dark: {
          backgroundColor: SPLASH_BG_DARK,
        },
        ios: {
          // Full-screen legacy mode — no size constraint; image fills the screen.
          // No imageWidth needed: iOS Rive animation also fills full screen via Fit.Contain.
          enableFullScreenImage_legacy: true,
        },
        android: {
          imageWidth: ANDROID_SPLASH_SIZE,
        },
      },
    ],
    'expo-router',
    [
      '@sentry/react-native/expo',
      {
        organization: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
      },
    ],
    '@react-native-firebase/app',
    [
      'expo-notifications',
      {
        icon: './assets/images/notification-icon.png',
        enableBackgroundRemoteNotifications: true,
      },
    ],
    [
      'expo-build-properties',
      {
        android: { minSdkVersion: 24 },
        ios: {
          useFrameworks: 'static',
          forceStaticLinking: ['RNFBApp', 'RNFBAnalytics', 'RNFBMessaging'],
        },
      },
    ],
    'expo-secure-store',
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'Reflect uses Face ID to unlock your private journal.',
      },
    ],
    'expo-updates',
    'expo-font',
    'expo-image',
    'expo-localization',
    'expo-status-bar',
    'expo-web-browser',
    [
      'expo-speech-recognition',
      {
        microphonePermission:
          'Reflect uses your microphone to let you dictate journal entries by voice.',
        speechRecognitionPermission:
          'Reflect uses speech recognition to transcribe your voice into text.',
      },
    ],
    // Meta (Facebook) SDK for App Promotion / app-install attribution. Only
    // included when an FB App ID is configured, so stg / un-keyed builds stay
    // tracking-free. iosUserTrackingPermission injects NSUserTrackingUsageDescription
    // (the #1 cause of ATT-related App Store rejections). advertiserIDCollection
    // is enabled, but advertiser tracking is gated on ATT consent at runtime
    // (see src/services/meta).
    ...(process.env.EXPO_PUBLIC_FB_APP_ID
      ? ([
          [
            'react-native-fbsdk-next',
            {
              appID: process.env.EXPO_PUBLIC_FB_APP_ID,
              clientToken: process.env.EXPO_PUBLIC_FB_CLIENT_TOKEN,
              displayName: process.env.DISPLAY_NAME ?? 'Reflect',
              scheme: `fb${process.env.EXPO_PUBLIC_FB_APP_ID}`,
              advertiserIDCollectionEnabled: true,
              autoLogAppEventsEnabled: true,
              isAutoInitEnabled: true,
              iosUserTrackingPermission:
                'Reflect uses this to measure ad performance and show you more relevant ads. Your journal entries are always private and never shared.',
            },
          ],
        ] as [string, Record<string, unknown>][])
      : []),
  ],
  extra: {
    eas: {
      projectId: 'ffe92c43-db25-4566-b08e-b8dee91b107b',
    },
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
