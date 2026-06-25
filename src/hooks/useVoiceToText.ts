import { useState, useRef, useCallback, useEffect } from 'react';
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

  useSpeechRecognitionEvent('start', () => {
    sessionEndedRef.current = false;
    userStoppedRef.current = false;
    pendingErrorRef.current = null;
    sessionTranscriptRef.current = '';
    lastFinalRef.current = '';
    setIsListening(true);
  });

  useSpeechRecognitionEvent('end', () => {
    sessionEndedRef.current = true;
    sessionTranscriptRef.current = '';
    lastFinalRef.current = '';
    setIsListening(false);
    if (pendingErrorRef.current && !userStoppedRef.current) {
      onErrorRef.current?.(pendingErrorRef.current);
    }
    pendingErrorRef.current = null;
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
    const voiceLanguage = usePreferencesStore.getState().voiceLanguage;
    try {
      ExpoSpeechRecognitionModule.start({
        lang: voiceLanguage ?? getLocale(),
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

  const stop = useCallback(() => {
    userStoppedRef.current = true;
    sessionTranscriptRef.current = '';
    ExpoSpeechRecognitionModule.stop();
  }, []);

  // Safety net: if the consumer unmounts while a session is live, stop the native
  // recognition so the mic doesn't keep recording in the background.
  useEffect(() => {
    return () => {
      ExpoSpeechRecognitionModule.stop();
    };
  }, []);

  return { isListening, start, stop };
};

export { useVoiceToText };
