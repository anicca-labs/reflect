import { i18n } from '@lingui/core'
import type { Messages } from '@lingui/core'
import { defaultFallbackLocale } from './config/constants'
import * as enMessages from './locales/compiled/en'
import * as esMessages from './locales/compiled/es'
import * as ptBRMessages from './locales/compiled/pt-BR'
import * as frMessages from './locales/compiled/fr'
import * as idMessages from './locales/compiled/id'
import * as arMessages from './locales/compiled/ar'

const messagesByLocale: Record<string, Messages> = {
  en: enMessages.messages,
  es: esMessages.messages,
  'pt-BR': ptBRMessages.messages,
  fr: frMessages.messages,
  id: idMessages.messages,
  ar: arMessages.messages,
}

const resolveLocale = (value: string | null | undefined): string => {
  if (!value) return defaultFallbackLocale
  if (Object.keys(messagesByLocale).includes(value)) return value
  // e.g. 'pt-PT' → try 'pt-BR'; 'zh-Hant-TW' → try 'zh'
  const languageCode = value.split('-')[0]
  const match = Object.keys(messagesByLocale).find(key => key.split('-')[0] === languageCode)
  return match ?? defaultFallbackLocale
}

const setI18nLocale = (locale: string) => {
  const validLocale = resolveLocale(locale)
  const messages = messagesByLocale[validLocale] ?? messagesByLocale[defaultFallbackLocale]
  i18n.loadAndActivate({ locale: validLocale, messages })
}

export { setI18nLocale }
