import { Platform, ToastAndroid } from 'react-native'
import * as Burnt from 'burnt'

type ToastPreset = 'done' | 'error' | 'none'

type ToastOptions = {
  title: string
  message?: string
  preset?: ToastPreset
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

  return { toast }
}
