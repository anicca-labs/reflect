import { Platform, ToastAndroid } from 'react-native'
import * as Burnt from 'burnt'

type ToastPreset = 'done' | 'error' | 'none'

type ToastOptions = {
  title: string
  message?: string
  preset?: ToastPreset
  duration?: number
}

type AlertOptions = {
  title: string
  message?: string
  preset?: 'done' | 'heart' | 'error'
  duration?: number
}

type NotificationOptions = {
  title: string
  message?: string
  duration?: number
}

export function useToast() {
  function toast({ title, message, preset = 'done', duration = 5 }: ToastOptions) {
    if (Platform.OS === 'android') {
      ToastAndroid.showWithGravity(
        message ? `${title} — ${message}` : title,
        ToastAndroid.LONG,
        ToastAndroid.CENTER,
      )
    } else {
      Burnt.toast({ title, message, preset, duration })
    }
  }

  function alert({ title, message, preset = 'heart', duration = 6 }: AlertOptions) {
    if (Platform.OS === 'android') {
      ToastAndroid.showWithGravity(
        message ? `${title} — ${message}` : title,
        ToastAndroid.LONG,
        ToastAndroid.CENTER,
      )
    } else {
      Burnt.alert({ title, message, preset, duration })
    }
  }

  function notification({ title, message, duration = 6 }: NotificationOptions) {
    if (Platform.OS === 'android') {
      ToastAndroid.showWithGravity(
        message ? `${title} — ${message}` : title,
        ToastAndroid.LONG,
        ToastAndroid.TOP,
      )
    } else {
      Burnt.alert({
        title,
        message,
        preset: 'custom',
        icon: { ios: { name: 'bell.fill', color: '#007AFF' } },
        duration,
      })
    }
  }

  return { toast, alert, notification }
}
