import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  owner: "ksairi-org",
  name: process.env.DISPLAY_NAME ?? "reflect",
  slug: "reflect",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: process.env.APP_SCHEMA ?? "reflect",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: process.env.APP_IDENTIFIER ?? "com.reflect.prod",
    buildNumber: "1",
    googleServicesFile: process.env.GOOGLE_SERVICES_INFOPLIST_PATH,
    infoPlist: {
      UIBackgroundModes: ["fetch", "remote-notification"],
      ITSAppUsesNonExemptEncryption: false,
    },
    entitlements: {
      "aps-environment": "production",
      "com.apple.developer.sign-in-with-apple": "enabled" as const,
      ...(process.env.EXPO_PUBLIC_APPLE_MERCHANT_ID
        ? { "com.apple.developer.in-app-payments": [process.env.EXPO_PUBLIC_APPLE_MERCHANT_ID] }
        : {}),
    },
  },
  android: {
    package: process.env.APP_IDENTIFIER ?? "com.reflect.prod",
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#F5F0E8",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON_PATH,
    permissions: ["android.permission.POST_NOTIFICATIONS"],
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "@react-native-firebase/app",
    [
      "expo-notifications",
      {
        enableBackgroundRemoteNotifications: true,
      },
    ],
    [
      "expo-build-properties",
      {
        android: { minSdkVersion: 24, kotlinVersion: "2.0.21" },
        ios: {
          useFrameworks: "static",
          forceStaticLinking: ["RNFBApp", "RNFBAnalytics", "RNFBMessaging"],
        },
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#F5F0E8",
      },
    ],
    "expo-secure-store",
  ],
  extra: {
    eas: {
      projectId: "ffe92c43-db25-4566-b08e-b8dee91b107b",
    },
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
