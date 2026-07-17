import { I18nProvider, type I18nProviderProps } from '@lingui/react';
import { useEffect, useState } from 'react';
import { AppState, NativeModules, Platform, Settings } from 'react-native';
import { i18n } from '@lingui/core';
import { getLocales } from 'expo-localization';
import { resolveLocale, setI18nLocale } from '../utils';

type LinguiClientProviderProps = {
  children: I18nProviderProps['children'];
};

const detectLocale = (): string => {
  if (Platform.OS === 'ios') {
    const raw: unknown = NativeModules.SettingsManager?.settings?.AppleLanguages;
    const staleLanguages: string[] | undefined = Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === 'string')
      : undefined;
    if (staleLanguages?.length) {
      // A stale app-specific language override exists in NSUserDefaults (written by a
      // previous bug). Clear it so future launches use the real system locale.
      Settings.set({ AppleLanguages: null });
      // getLocales() reads NSLocale.preferredLanguages which has its own cache and
      // won't see the clear until the next launch. Intl reads NSLocale.currentLocale
      // (region/format locale) which is NOT affected by the AppleLanguages override,
      // so it gives us the correct system language right now.
      try {
        return new Intl.DateTimeFormat().resolvedOptions().locale;
      } catch {
        return 'en';
      }
    }
  }
  return getLocales()[0]?.languageTag ?? getLocales()[0]?.languageCode ?? 'en';
};

const LinguiClientProvider = ({ children }: LinguiClientProviderProps) => {
  const [isI18nReady, setIsI18nReady] = useState(false);

  useEffect(() => {
    // One-time mount init: detectLocale() has side effects (reads/clears native
    // settings) so it can't run during render; flipping ready state here is intended.
    setI18nLocale(detectLocale());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsI18nReady(true);
  }, []);

  useEffect(() => {
    // Android keeps the JS process alive in the background, so a system language
    // change while backgrounded never re-runs mount detection — the UI would stay
    // in the old language until a full restart. Re-detect on foreground and
    // re-activate Lingui if the resolved locale changed. I18nProvider subscribes to
    // the i18n instance, so loadAndActivate re-renders the tree without a restart.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const next = resolveLocale(detectLocale());
      if (next !== i18n.locale) setI18nLocale(next);
    });
    return () => subscription.remove();
  }, []);

  if (!isI18nReady) return null;

  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
};

export { LinguiClientProvider };
