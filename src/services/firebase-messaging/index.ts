import { getMessaging, AuthorizationStatus } from '@react-native-firebase/messaging'
import { getApp } from '@react-native-firebase/app'
import * as ExpoNotifications from 'expo-notifications'

ExpoNotifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

const messaging = getMessaging(getApp())

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await ExpoNotifications.requestPermissionsAsync()
  if (status !== 'granted') return false

  const authStatus = await messaging.requestPermission()
  const enabled =
    authStatus === AuthorizationStatus.AUTHORIZED ||
    authStatus === AuthorizationStatus.PROVISIONAL
  return enabled
}

export async function getFCMToken(): Promise<string | null> {
  try {
    const token = await messaging.getToken()
    return token
  } catch {
    return null
  }
}

export function subscribeToForegroundMessages(
  onMessage: (title: string, body: string) => void,
): () => void {
  return messaging.onMessage(async remoteMessage => {
    const title = remoteMessage.notification?.title ?? 'Reflect'
    const body = remoteMessage.notification?.body ?? ''
    onMessage(title, body)
  })
}

export async function scheduleLocalNotification(title: string, body: string, delaySeconds = 3) {
  await ExpoNotifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: { type: ExpoNotifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delaySeconds },
  })
}
