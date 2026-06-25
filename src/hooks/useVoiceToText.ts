import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { getLocales } from 'expo-localization';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { usePreferencesStore } from '@/src/stores';

type UseVoiceToTextOptions = {
  // `replaces` is the running transcript for this session — swap it instead of appending.
  onResult: (transcript: string, replaces: string) => void;
  onError?: (message: string) => void;
  // Called when permission was previously denied and the OS won't show the dialog again.
  onPermissionDenied?: () => void;
};

const getLocale = (): string => {
  // expo-localization reads the device's preferred language list (cross-platform) and
  // returns BCP-47 tags. The previous NativeModules.SettingsManager path was iOS-only
  // (undefined on Android → always 'en-US') and preferred AppleLocale (region) over the
  // actual language, so a Spanish phone with a non-Spanish region dictated in English.
  const [primary] = getLocales();
  return primary?.languageTag ?? primary?.languageCode ?? 'en-US';
};

// The recognizer only accepts locales it has a model for (iOS validates strictly and
// throws "language-not-supported"). A device tag like "es-AR" often has no exact model,
// so map it to any supported variant of the same language — any Spanish is far better
// than silently dictating in English.
const resolveSupportedLocale = async (desired: string): Promise<string> => {
  let locales: string[] = [];
  try {
    ({ locales } = await ExpoSpeechRecognitionModule.getSupportedLocales({}));
  } catch {
    // Android <=12 returns empty (or throws without a service package) — can't validate.
  }
  if (!locales.length) return desired; // no list to check against; let the recognizer decide
  if (locales.some((l) => l.toLowerCase() === desired.toLowerCase())) return desired;
  const lang = desired.toLowerCase().split('-')[0];
  const sameLang = locales.find((l) => l.toLowerCase().split('-')[0] === lang);
  if (sameLang) return sameLang;
  // Last resort: keep English if present, else the first supported locale.
  return locales.find((l) => l.toLowerCase().startsWith('en')) ?? locales[0];
};

const useVoiceToText = ({ onResult, onError, onPermissionDenied }: UseVoiceToTextOptions) => {
  const [isListening, setIsListening] = useState(false);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const onPermissionDeniedRef = useRef(onPermissionDenied);
  // "Latest ref" pattern: keep the freshest callbacks for the async speech-event
  // handlers below. These are only read inside async listeners, never during render.
  /* eslint-disable react-hooks/refs */
  onResultRef.current = onResult;
  onErrorRef.current = onError;
  onPermissionDeniedRef.current = onPermissionDenied;
  /* eslint-enable react-hooks/refs */

  const sessionTranscriptRef = useRef('');
  const sessionEndedRef = useRef(false);
  const userStoppedRef = useRef(false);
  const pendingErrorRef = useRef<string | null>(null);
  // iOS dedup: on stop(), iOS fires the same isFinal transcript a second time. Track the last
  // committed final so we can skip it if it arrives again before `end` fires.
  const lastFinalRef = useRef('');
  // First-grant handling (iOS only): the first session right after the user grants the mic +
  // speech-recognition dialogs fails with a transient error because authorization hasn't
  // propagated to the Speech framework yet — the mic works fine on the next tap. While this
  // window is open we (a) delay the first start to let iOS settle, and (b) never surface an
  // error: we retry a few times, and if it still won't start we stay silent so the user just
  // taps the mic again instead of seeing a false-negative modal. Genuine errors still surface
  // on that next tap, which is a normal (non-fresh-grant) start.
  const justGrantedRef = useRef(false);
  const freshGrantRetriesRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const FRESH_GRANT_MAX_RETRIES = 3;
  const FRESH_GRANT_SETTLE_MS = 600;

  // Resolve the locale and kick off the native session. Shared by the initial start and the
  // first-grant auto-retry, so it's reachable from the 'end' handler. Stable identity (no
  // deps), so the event closures never go stale referencing it.
  const beginSession = useCallback(async () => {
    const voiceLanguage = usePreferencesStore.getState().voiceLanguage;
    try {
      const lang = await resolveSupportedLocale(voiceLanguage ?? getLocale());
      ExpoSpeechRecognitionModule.start({
        lang,
        continuous: true,
        interimResults: true,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 80 },
      });
    } catch (e) {
      // A synchronous native throw (e.g. no recognition service on the device) would
      // otherwise surface as an unhandled rejection. Route it through onError so the
      // user sees a real message instead of a crash.
      const message = e instanceof Error ? e.message : String(e);
      onErrorRef.current?.(`start failed: ${message}`);
    }
  }, []);

  useSpeechRecognitionEvent('start', () => {
    sessionEndedRef.current = false;
    userStoppedRef.current = false;
    pendingErrorRef.current = null;
    sessionTranscriptRef.current = '';
    lastFinalRef.current = '';
    // A real session started — the fresh-grant retry window is over.
    justGrantedRef.current = false;
    freshGrantRetriesRef.current = 0;
    setIsListening(true);
  });

  useSpeechRecognitionEvent('end', () => {
    sessionEndedRef.current = true;
    sessionTranscriptRef.current = '';
    lastFinalRef.current = '';
    setIsListening(false);
    const pendingError = pendingErrorRef.current;
    pendingErrorRef.current = null;
    if (!pendingError || userStoppedRef.current) return;
    // Inside the fresh-grant window (iOS), never surface the transient error: retry a few
    // times with a settle delay, and once retries are exhausted stay silent — the user's
    // next manual tap will work since authorization has settled by then.
    if (justGrantedRef.current) {
      if (freshGrantRetriesRef.current < FRESH_GRANT_MAX_RETRIES) {
        freshGrantRetriesRef.current += 1;
        retryTimeoutRef.current = setTimeout(() => beginSession(), FRESH_GRANT_SETTLE_MS);
      }
      return;
    }
    onErrorRef.current?.(pendingError);
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (sessionEndedRef.current || userStoppedRef.current) return;
    const transcript = event.results[0]?.transcript;
    if (!transcript) return;
    if (event.isFinal) {
      if (transcript === lastFinalRef.current) return;
      lastFinalRef.current = transcript;
      onResultRef.current(transcript, sessionTranscriptRef.current);
      sessionTranscriptRef.current = '';
    } else {
      // Non-final means a new utterance is forming — reset the dedup window.
      lastFinalRef.current = '';
      // Android cumulative transcripts only grow within a segment. If the new transcript is
      // shorter than what we tracked, the engine restarted internally after a natural pause
      // without firing end/start — treat it as a fresh segment so we append, not replace.
      if (transcript.length < sessionTranscriptRef.current.length) {
        sessionTranscriptRef.current = '';
      }
      onResultRef.current(transcript, sessionTranscriptRef.current);
      sessionTranscriptRef.current = transcript;
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    // Include the error code (e.g. "language-not-supported", "service-not-allowed")
    // alongside the message — on a release build this is the only way to see why
    // recognition failed without device logs.
    const code = event.error ? `[${event.error}] ` : '';
    pendingErrorRef.current = `${code}${event.message ?? 'Speech recognition failed'}`;
  });

  const start = useCallback(async () => {
    const current = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    if (!current.granted && !current.canAskAgain) {
      // Already denied — OS won't show the dialog again. Let the caller handle it.
      onPermissionDeniedRef.current?.();
      return;
    }
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      // User just denied the dialog — do nothing, don't redirect anywhere.
      return;
    }
    // First grant = we didn't already hold permission. On iOS, delay the first start so the
    // Speech framework has time to pick up the just-granted authorization (starting
    // immediately throws a transient error). Android settles synchronously, so start now.
    const freshGrant = !current.granted;
    justGrantedRef.current = freshGrant && Platform.OS === 'ios';
    freshGrantRetriesRef.current = 0;
    if (justGrantedRef.current) {
      retryTimeoutRef.current = setTimeout(() => beginSession(), FRESH_GRANT_SETTLE_MS);
    } else {
      beginSession();
    }
  }, [beginSession]);

  const stop = useCallback(() => {
    userStoppedRef.current = true;
    sessionTranscriptRef.current = '';
    ExpoSpeechRecognitionModule.stop();
  }, []);

  // Safety net: if the consumer unmounts while a session is live, stop the native
  // recognition so the mic doesn't keep recording in the background.
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      ExpoSpeechRecognitionModule.stop();
    };
  }, []);

  return { isListening, start, stop };
};

export { useVoiceToText };
