import { getLocales } from 'expo-localization'
import { format } from 'date-fns'
import { ar, enUS, es, fr, id, ptBR } from 'date-fns/locale'
import type { Locale } from 'date-fns'

const localeMap: Record<string, Locale> = {
  en: enUS,
  es,
  fr,
  id,
  ar,
  'pt-BR': ptBR,
}

const getDateLocale = (): Locale => {
  const languageTag = getLocales()[0]?.languageTag ?? ''
  const languageCode = getLocales()[0]?.languageCode ?? 'en'
  return localeMap[languageTag] ?? localeMap[languageCode] ?? enUS
}

const formatEntryTime = (iso: string, use24h: boolean): string =>
  format(new Date(iso), use24h ? 'HH:mm' : 'h:mm a', { locale: getDateLocale() })

export { getDateLocale, formatEntryTime }
