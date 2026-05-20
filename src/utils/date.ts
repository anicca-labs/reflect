import { getLocales } from 'expo-localization'
import { enUS } from 'date-fns/locale'
import type { Locale } from 'date-fns'

const localeMap: Record<string, Locale> = {
  en: enUS,
}

export function getDateLocale(): Locale {
  const tag = getLocales()[0]?.languageCode ?? 'en'
  return localeMap[tag] ?? enUS
}
