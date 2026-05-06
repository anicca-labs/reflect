import * as Sentry from '@sentry/react-native'
import { setupSentry } from '@sentry'
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import 'react-native-reanimated'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { TamaguiProvider } from 'tamagui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useColorScheme } from 'react-native'
import tamaguiConfig from '@default-tamagui-config'
import { LinguiClientProvider } from '@i18n'
import { useAuthSession, useCustomFonts } from '@hooks'
import {
  requestNotificationPermission,
  getFCMToken,
  subscribeToForegroundMessages,
} from '@firebase-messaging'
import { useEffect } from 'react'
import { SplashView } from '@ksairi-org/react-native-splash-view'
import { themes } from '@theme'
import { configureRevenueCat } from '@revenue-cat'
import splash from '../assets/animations/splash.riv'

setupSentry(!__DEV__)

const queryClient = new QueryClient()

configureRevenueCat()

const getSplashStyle = (isDark: boolean) => ({
  backgroundColor: isDark ? themes.dark.splashBackground : themes.light.splashBackground,
})

export const unstable_settings = {
  anchor: '(tabs)',
}

function RootLayoutNav() {
  useAuthSession()

  useEffect(() => {
    requestNotificationPermission().then((granted) => {
      if (granted) getFCMToken().then((token) => token && console.log('[FCM token]', token))
    })
    const unsubscribe = subscribeToForegroundMessages((title, body) => {
      console.log('[FCM foreground]', title, body)
    })
    return unsubscribe
  }, [])

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
    </Stack>
  )
}

function RootLayout() {
  const fontsLoaded = useCustomFonts()
  const colorScheme = useColorScheme() ?? 'light'
  const isOSThemeDark = colorScheme === 'dark'

  if (!fontsLoaded) return null

  return (
    <QueryClientProvider client={queryClient}>
      <LinguiClientProvider>
        <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme}>
          <ThemeProvider value={isOSThemeDark ? DarkTheme : DefaultTheme}>
            <KeyboardProvider>
              <RootLayoutNav />
              <StatusBar style="auto" />
            </KeyboardProvider>
          </ThemeProvider>
        </TamaguiProvider>
      </LinguiClientProvider>
      <SplashView source={splash} style={getSplashStyle(isOSThemeDark)} />
    </QueryClientProvider>
  )
}

export default Sentry.wrap(RootLayout)
