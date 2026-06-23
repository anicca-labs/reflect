import type { Locale } from 'expo-localization';

const locales: Record<string, string> = {
  en: 'English',
  es: 'Español',
  'pt-BR': 'Português (Brasil)',
  fr: 'Français',
  id: 'Bahasa Indonesia',
  ar: 'العربية',
};

const defaultFallbackLocale: Locale['languageTag'] = 'en';

export { locales, defaultFallbackLocale };
