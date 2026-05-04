import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
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
    bundleIdentifier: process.env.APP_IDENTIFIER ?? "com.marianoksairi.reflect",
    buildNumber: "1",
    googleServicesFile: process.env.GOOGLE_SERVICES_INFOPLIST_PATH,
    infoPlist: {
      UIBackgroundModes: ["fetch", "remote-notification"],
      ITSAppUsesNonExemptEncryption: false,
    },
    entitlements: {
      "aps-environment": "production",
    },
  },
  android: {
    package: process.env.APP_IDENTIFIER ?? "com.marianoksairi.reflect",
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
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
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
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
