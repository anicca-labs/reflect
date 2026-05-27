import * as Sentry from "@sentry/react-native";
import { setupSentry } from "@sentry";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { TamaguiProvider } from "tamagui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useColorScheme, Platform } from "react-native";
import tamaguiConfig from "@default-tamagui-config";
import { LinguiClientProvider } from "@i18n";
import { useAuthSession, useCustomFonts , useToast } from "@hooks";
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

const getSplashStyle = (isDark: boolean) => ({
  backgroundColor: isDark ? themes.dark.splashBackground : themes.light.splashBackground,
});

export const unstable_settings = {
  anchor: "(tabs)",
};

function RootLayoutNav() {
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
      <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
    </Stack>
  );
}

function RootLayout() {
  const fontsLoaded = useCustomFonts();
  const colorScheme = useColorScheme() ?? "light";
  const isOSThemeDark = colorScheme === "dark";

  return (
    <QueryClientProvider client={queryClient}>
      <LinguiClientProvider>
        <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme}>
          <ThemeProvider value={isOSThemeDark ? DarkTheme : DefaultTheme}>
            <KeyboardProvider>
              {fontsLoaded ? <RootLayoutNav /> : null}
              <StatusBar style="auto" />
            </KeyboardProvider>
          </ThemeProvider>
        </TamaguiProvider>
      </LinguiClientProvider>
      <EnvBadge />
      <SplashView
        source={splash}
        style={getSplashStyle(isOSThemeDark)}
        // Android: 288dp matches imageWidth in app.config.ts — Android 12+ maximum before the icon clips.
        // Keeps Rive start frame visually aligned with the native splash icon for a seamless transition.
        // iOS: undefined — splash fills the full screen (enableFullScreenImage_legacy), Rive does the same via Fit.Contain.
        animationViewStyle={
          Platform.OS === "android" ? { width: 288, height: 288, alignSelf: "center" } : undefined
        }
        fadeOutDelay={1500}
        fadeOutDuration={500}
      />
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
