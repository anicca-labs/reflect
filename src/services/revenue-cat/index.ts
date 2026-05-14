import { Platform } from 'react-native'
import Purchases, { LOG_LEVEL } from 'react-native-purchases'

const isSandbox = __DEV__ || process.env.EXPO_PUBLIC_ENV === 'stg'

const configureRevenueCat = () => {
  const apiKey =
    Platform.OS === 'android' && process.env.EXPO_PUBLIC_RC_ANDROID_API_KEY
      ? process.env.EXPO_PUBLIC_RC_ANDROID_API_KEY
      : process.env.EXPO_PUBLIC_RC_API_KEY

  if (!apiKey) {
    console.warn('[RevenueCat] RC API key is not set — IAP will not work')
    return
  }

  if (isSandbox) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG)
  }

  Purchases.configure({ apiKey })
}

export { configureRevenueCat }
