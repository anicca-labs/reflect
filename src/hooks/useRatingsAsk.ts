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

// Ask for a store rating exactly once, at a magic moment (right after the user
// closes their first AI reflection). The pre-prompt filters for happy users —
// only people who tap through land on the store.
const useRatingsAsk = () => {
  const { t } = useLingui();

  const maybeAsk = useCallback(async () => {
    const asked = await AsyncStorage.getItem(ASKED_KEY);
    if (asked) return;
    await AsyncStorage.setItem(ASKED_KEY, '1');
    Alert.alert(t`Enjoying Reflect?`, t`A quick rating helps other journalers find it. 🍂`, [
      { text: t`Not now`, style: 'cancel' },
      {
        text: t`Rate Reflect ✦`,
        onPress: () => {
          Linking.openURL(Platform.OS === 'ios' ? IOS_REVIEW_URL : ANDROID_REVIEW_URL).catch(
            () => {},
          );
        },
      },
    ]);
  }, [t]);

  return { maybeAsk };
};

export { useRatingsAsk };
