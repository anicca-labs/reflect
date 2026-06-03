import * as Sentry from "@sentry/react-native";
import { setupSentry } from "@sentry";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { TamaguiProvider, styled } from "tamagui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useColorScheme, Platform } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { tamaguiConfig } from "@default-tamagui-config";
import { LinguiClientProvider } from "@i18n";
import { useAuthSession, useCustomFonts, useToast } from "@hooks";
import { EnvBadge } from "@atoms";
import { subscribeToForegroundMessages } from "@firebase-messaging";
import { useEffect } from "react";
import { SplashView } from "@ksairi-org/react-native-splash-view";
import { themes } from "@theme";
import { configureRevenueCat } from "@revenue-cat";
import splash from "../assets/animations/splash.riv";

setupSentry(!__DEV__);

const queryClient = new QueryClient();

configureRevenueCat();

const GestureRoot = styled(GestureHandlerRootView, { flex: 1 })

const SPLASH_ANDROID_SIZE = 288   // matches imageWidth in app.config.ts — Android 12+ max before icon clips
const SPLASH_FADE_DELAY_MS = 1500
const SPLASH_FADE_DURATION_MS = 500

const getSplashStyle = (isDark: boolean) => ({
  backgroundColor: isDark ? themes.dark.splashBackground : themes.light.splashBackground,
});

// NOTE: Expo Router reads this named export at module scope — framework requirement
export const unstable_settings = {
  anchor: "(tabs)",
};

const RootLayoutNav = () => {
  useAuthSession();
  const { notification } = useToast();

  useEffect(() => {
    const unsubscribe = subscribeToForegroundMessages((title, body) => {
      notification({ title, message: body });
    });
    return unsubscribe;
  }, [notification]);

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="reset-password" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
    </Stack>
  );
}

const RootLayout = () => {
  const fontsLoaded = useCustomFonts();
  const colorScheme = useColorScheme() ?? "light";
  const isOSThemeDark = colorScheme === "dark";

  return (
    <QueryClientProvider client={queryClient}>
      <LinguiClientProvider>
        <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme}>
          <ThemeProvider value={isOSThemeDark ? DarkTheme : DefaultTheme}>
            <GestureRoot>
              <KeyboardProvider>
                {fontsLoaded ? <RootLayoutNav /> : null}
                <StatusBar style="auto" />
              </KeyboardProvider>
              <EnvBadge />
              {/* NOTE: SplashView style prop requires a plain object — no Tamagui equivalent */}
              <SplashView
                source={splash}
                style={getSplashStyle(isOSThemeDark)}
                // Android: SPLASH_ANDROID_SIZE matches imageWidth in app.config.ts — Android 12+ maximum before the icon clips.
                // Keeps Rive start frame visually aligned with the native splash icon for a seamless transition.
                // iOS: undefined — splash fills the full screen (enableFullScreenImage_legacy), Rive does the same via Fit.Contain.
                animationViewStyle={
                  Platform.OS === "android" ? { width: SPLASH_ANDROID_SIZE, height: SPLASH_ANDROID_SIZE, alignSelf: "center" } : undefined
                }
                fadeOutDelay={SPLASH_FADE_DELAY_MS}
                fadeOutDuration={SPLASH_FADE_DURATION_MS}
              />
            </GestureRoot>
          </ThemeProvider>
        </TamaguiProvider>
      </LinguiClientProvider>
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
