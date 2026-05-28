import type { I18nProviderProps } from '@lingui/react'
import { useEffect, useState } from 'react'
import { NativeModules, Platform, Settings } from 'react-native'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { getLocales } from 'expo-localization'
import { setI18nLocale } from '../utils'

type LinguiClientProviderProps = {
  children: I18nProviderProps['children']
}

function detectLocale(): string {
  if (Platform.OS === 'ios') {
    const staleLanguages = NativeModules.SettingsManager?.settings?.AppleLanguages as string[] | undefined
    if (staleLanguages?.length) {
      // A stale app-specific language override exists in NSUserDefaults (written by a
      // previous bug). Clear it so future launches use the real system locale.
      Settings.set({ AppleLanguages: null })
      // getLocales() reads NSLocale.preferredLanguages which has its own cache and
      // won't see the clear until the next launch. Intl reads NSLocale.currentLocale
      // (region/format locale) which is NOT affected by the AppleLanguages override,
      // so it gives us the correct system language right now.
      try {
        return new Intl.DateTimeFormat().resolvedOptions().locale
      } catch {
        return 'en'
      }
    }
  }
  return getLocales()[0]?.languageTag ?? getLocales()[0]?.languageCode ?? 'en'
}

const LinguiClientProvider = ({ children }: LinguiClientProviderProps) => {
  const [isI18nReady, setIsI18nReady] = useState(false)

  useEffect(() => {
    setI18nLocale(detectLocale())
    setIsI18nReady(true)
  }, [])

  if (!isI18nReady) return null

  return <I18nProvider i18n={i18n}>{children}</I18nProvider>
}

export { LinguiClientProvider }
