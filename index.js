import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging'
import * as ExpoNotifications from 'expo-notifications'
import { Platform } from 'react-native'

// Must be registered at module level before React mounts.
// FCM automatically displays notification-payload messages — only handle data-only messages here.
setBackgroundMessageHandler(getMessaging(), async remoteMessage => {
  if (remoteMessage.notification) return

  const title = remoteMessage.data?.title
  const body = remoteMessage.data?.body
  if (!title && !body) return

  if (Platform.OS === 'android') {
    await ExpoNotifications.scheduleNotificationAsync({
      content: { title: title ?? 'Reflect', body: body ?? '' },
      trigger: null,
    })
  }
})

import 'expo-router/entry'
