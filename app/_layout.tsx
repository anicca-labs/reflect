import '@tamagui/native/setup-zeego'
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
import { useAuthSession } from '@hooks'
import {
  requestNotificationPermission,
  getFCMToken,
  subscribeToForegroundMessages,
} from '@firebase-messaging'
import { useEffect } from 'react'

const queryClient = new QueryClient()

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

export default function RootLayout() {
  const colorScheme = useColorScheme() ?? 'light'

  return (
    <QueryClientProvider client={queryClient}>
      <LinguiClientProvider>
        <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme}>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <KeyboardProvider>
              <RootLayoutNav />
              <StatusBar style="auto" />
            </KeyboardProvider>
          </ThemeProvider>
        </TamaguiProvider>
      </LinguiClientProvider>
    </QueryClientProvider>
  )
}
