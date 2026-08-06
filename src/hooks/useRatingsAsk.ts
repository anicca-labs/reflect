import { useCallback } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLingui } from '@lingui/react/macro';

// Store review deep links. iOS opens the write-review sheet directly; Android
// opens the Play listing. (The native in-app rating sheet needs expo-store-review,
// a native module — swap to it with the next binary; this version is OTA-safe.)
const IOS_REVIEW_URL = 'https://apps.apple.com/app/id6767607183?action=write-review';
const ANDROID_REVIEW_URL = `market://details?id=${process.env.APP_IDENTIFIER ?? 'com.reflect.prod'}`;

const ASKED_KEY = 'ratings:asked';

// The caller fires this from a Modal's onClose, i.e. while that modal is mid-
// dismissal — and on iOS an Alert presented from a dismissing view controller can
// be torn down with it. Wait out the dismissal before presenting.
const PRESENT_AFTER_MODAL_DISMISS_MS = 700;

// A same-session re-entry guard so the delay can't let two calls both pass the
// AsyncStorage check before either records the ask.
let askInFlight = false;

// Ask for a store rating exactly once, at a magic moment (right after the user
// closes their first AI reflection). The pre-prompt filters for happy users —
// only people who tap through land on the store.
const useRatingsAsk = () => {
  const { t } = useLingui();

  const maybeAsk = useCallback(async () => {
    if (askInFlight) return;
    const asked = await AsyncStorage.getItem(ASKED_KEY);
    if (asked) return;
    askInFlight = true;
    setTimeout(() => {
      Alert.alert(t`Enjoying Reflect?`, t`A quick rating helps other journalers find it. 🍂`, [
        {
          text: t`Not now`,
          style: 'cancel',
          // The once-ever flag is written when the alert is ANSWERED, not before
          // it's shown — writing it up front meant a swallowed alert (torn down
          // with the dismissing modal) burned the only ask forever.
          onPress: () => AsyncStorage.setItem(ASKED_KEY, '1'),
        },
        {
          text: t`Rate Reflect ✦`,
          onPress: () => {
            AsyncStorage.setItem(ASKED_KEY, '1');
            Linking.openURL(Platform.OS === 'ios' ? IOS_REVIEW_URL : ANDROID_REVIEW_URL).catch(
              () => {},
            );
          },
        },
      ]);
      askInFlight = false;
    }, PRESENT_AFTER_MODAL_DISMISS_MS);
  }, [t]);

  return { maybeAsk };
};

export { useRatingsAsk };
