import { useState, useRef, useCallback } from 'react';
import { NativeModules } from 'react-native';
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
  const deviceLocale =
    NativeModules.SettingsManager?.settings?.AppleLocale ??
    NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] ??
    'en-US';
  return deviceLocale.replace('_', '-');
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
    pendingErrorRef.current = event.message ?? 'Speech recognition failed';
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
    ExpoSpeechRecognitionModule.start({
      lang: voiceLanguage ?? getLocale(),
      continuous: true,
      interimResults: true,
      volumeChangeEventOptions: { enabled: true, intervalMillis: 80 },
    });
  }, []);

  const stop = useCallback(() => {
    userStoppedRef.current = true;
    sessionTranscriptRef.current = '';
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return { isListening, start, stop };
};

export { useVoiceToText };
