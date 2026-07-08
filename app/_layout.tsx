import * as Sentry from '@sentry/react-native';
import { setupSentry } from '@sentry';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { TamaguiProvider, styled } from 'tamagui';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persister, CACHE_MAX_AGE } from '@/src/services/queryClient';
import { useColorScheme, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { tamaguiConfig } from '@default-tamagui-config';
import { LinguiClientProvider } from '@i18n';
import {
  useAuthSession,
  useCustomFonts,
  useToast,
  useMemoryNotification,
  useOfflineJournalSync,
  useBiometricLock,
} from '@hooks';
import { EnvBadge, NetworkStatusBanner, BiometricLockOverlay } from '@atoms';
import { AnonMergeModal } from '@molecules';
import { useSessionStore } from '@/src/stores';
import { subscribeToForegroundMessages } from '@firebase-messaging';
import { useEffect } from 'react';
import { SplashView } from '@anicca-labs/react-native-splash-view';
import { configureRevenueCat } from '@revenue-cat';
import { initializeMeta } from '@meta';
import splash from '../assets/animations/splash.riv';
import splashImage from '../assets/images/splash.png';

setupSentry(!__DEV__);

configureRevenueCat();

const GestureRoot = styled(GestureHandlerRootView, { flex: 1 });

const SPLASH_ANDROID_SIZE = 288; // matches imageWidth in app.config.ts — Android 12+ max before icon clips
const SPLASH_FADE_DELAY_MS = 1500;
const SPLASH_FADE_DURATION_MS = 500;

const getSplashStyle = (isDark: boolean) => ({
  // Use the same hex values as SPLASH_BG_LIGHT/DARK in app.config.ts so
  // the Animated.View background matches the native splash exactly.
  backgroundColor: isDark ? '#110f0e' : '#F5F0E8',
});

// NOTE: Expo Router reads this named export at module scope — framework requirement
export const unstable_settings = {
  anchor: '(tabs)',
};

const RootLayoutNav = () => {
  useAuthSession();
  useMemoryNotification();
  useOfflineJournalSync();
  const { notification } = useToast();
  const { pendingMerge, setPendingMerge } = useSessionStore();

  useEffect(() => {
    const unsubscribe = subscribeToForegroundMessages((title, body) => {
      notification({ title, message: body });
    });
    return unsubscribe;
  }, [notification]);

  // Runs once the app is active (after fonts load) so the iOS ATT prompt can
  // present. Requests tracking consent, then initializes the Meta SDK.
  useEffect(() => {
    initializeMeta();
  }, []);

  return (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      {pendingMerge ? (
        <AnonMergeModal
          visible
          localCount={pendingMerge.localCount}
          serverCount={pendingMerge.serverCount}
          onClose={() => setPendingMerge(null)}
        />
      ) : null}
    </>
  );
};

const RootLayout = () => {
  const fontsLoaded = useCustomFonts();
  const colorScheme = useColorScheme() ?? 'light';
  const isOSThemeDark = colorScheme === 'dark';

  // Engages the biometric lock when the app backgrounds while signed in; the
  // overlay below presents the unlock prompt on return to the foreground.
  useBiometricLock();

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        // Only the journal list is worth keeping on disk; everything else
        // (paywall state, etc.) stays in-memory and refetches on launch.
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => query.queryKey[0] === 'journal-entries',
        },
      }}
    >
      <LinguiClientProvider>
        <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme}>
          <ThemeProvider value={isOSThemeDark ? DarkTheme : DefaultTheme}>
            <GestureRoot>
              <KeyboardProvider>
                {fontsLoaded ? <RootLayoutNav /> : null}
                <StatusBar style="auto" />
              </KeyboardProvider>
              <NetworkStatusBanner />
              <EnvBadge />
              <BiometricLockOverlay />
              {/* NOTE: SplashView style prop requires a plain object — no Tamagui equivalent */}
              <SplashView
                source={splash}
                launchImageUrl={splashImage}
                style={getSplashStyle(isOSThemeDark)}
                // Android: SPLASH_ANDROID_SIZE matches imageWidth in app.config.ts — Android 12+ maximum before the icon clips.
                // Keeps Rive start frame visually aligned with the native splash icon for a seamless transition.
                // iOS: undefined — splash fills the full screen (enableFullScreenImage_legacy), Rive does the same via Fit.Contain.
                animationViewStyle={
                  Platform.OS === 'android'
                    ? { width: SPLASH_ANDROID_SIZE, height: SPLASH_ANDROID_SIZE }
                    : undefined
                }
                fadeOutDelay={SPLASH_FADE_DELAY_MS}
                fadeOutDuration={SPLASH_FADE_DURATION_MS}
              />
            </GestureRoot>
          </ThemeProvider>
        </TamaguiProvider>
      </LinguiClientProvider>
    </PersistQueryClientProvider>
  );
};

export default Sentry.wrap(RootLayout);
