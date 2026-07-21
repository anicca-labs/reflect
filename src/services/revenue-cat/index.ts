import { Platform, Linking, LogBox } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { useAppLockStore } from '@/src/stores';

LogBox.ignoreLogs(['[RevenueCat]']);

const ANDROID_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';

const isSandbox = __DEV__ || process.env.EXPO_PUBLIC_ENV === 'stg';

const configureRevenueCat = () => {
  const testKey = process.env.EXPO_PUBLIC_RC_TEST_API_KEY;

  // Use Test Store key on simulator (__DEV__ + no physical device signal)
  // test_ keys simulate the full purchase sheet without StoreKit config or ios/ folder
  if (testKey && __DEV__) {
    if (isSandbox) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey: testKey });
    return;
  }

  const apiKey =
    Platform.OS === 'android' && process.env.EXPO_PUBLIC_RC_ANDROID_API_KEY
      ? process.env.EXPO_PUBLIC_RC_ANDROID_API_KEY
      : process.env.EXPO_PUBLIC_RC_API_KEY;

  if (!apiKey) {
    console.warn('[RevenueCat] RC API key is not set — IAP will not work');
    return;
  }

  if (isSandbox) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });
};

const identifyRevenueCatUser = async (userId: string) => {
  await Purchases.logIn(userId);
};

const resetRevenueCatUser = async () => {
  try {
    const info = await Purchases.getCustomerInfo();
    if (!info.originalAppUserId.startsWith('$RCAnonymousID:')) {
      await Purchases.logOut();
    }
  } catch {
    // RC not configured or already anonymous — nothing to reset
  }
};

const manageSubscriptions = async () => {
  // Android leaves for the Play Store — a genuine app exit, so the biometric
  // lock should engage. iOS presents an in-app sheet, which only *looks* like
  // backgrounding; flag it so returning doesn't demand Face ID.
  if (Platform.OS === 'android') {
    await Linking.openURL(ANDROID_SUBSCRIPTIONS_URL);
    return;
  }
  useAppLockStore.getState().openStoreSheet();
  try {
    await Purchases.showManageSubscriptions();
  } finally {
    useAppLockStore.getState().closeStoreSheet();
  }
};

export { configureRevenueCat, identifyRevenueCatUser, resetRevenueCatUser, manageSubscriptions };
