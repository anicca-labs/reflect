import { useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { scheduleDailyReminder, cancelDailyReminder } from '@firebase-messaging'

const ENABLED_KEY = '@reflect/reminder_enabled'
const HOUR_KEY = '@reflect/reminder_hour'
const MINUTE_KEY = '@reflect/reminder_minute'

export const DEFAULT_REMINDER_HOUR = 20
export const DEFAULT_REMINDER_MINUTE = 0

export function useReminder() {
  const [enabled, setEnabled] = useState(false)
  const [hour, setHour] = useState(DEFAULT_REMINDER_HOUR)
  const [minute, setMinute] = useState(DEFAULT_REMINDER_MINUTE)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [enabledVal, hourVal, minuteVal] = await Promise.all([
        AsyncStorage.getItem(ENABLED_KEY),
        AsyncStorage.getItem(HOUR_KEY),
        AsyncStorage.getItem(MINUTE_KEY),
      ])
      setEnabled(enabledVal === 'true')
      setHour(hourVal ? parseInt(hourVal, 10) : DEFAULT_REMINDER_HOUR)
      setMinute(minuteVal ? parseInt(minuteVal, 10) : DEFAULT_REMINDER_MINUTE)
      setLoading(false)
    }
    load()
  }, [])

  async function toggle(notifPermission: boolean) {
    if (!notifPermission) return
    const next = !enabled
    setEnabled(next)
    await AsyncStorage.setItem(ENABLED_KEY, String(next))
    if (next) {
      await scheduleDailyReminder(hour, minute)
    } else {
      await cancelDailyReminder()
    }
  }

  async function updateTime(newHour: number, newMinute: number) {
    setHour(newHour)
    setMinute(newMinute)
    await Promise.all([
      AsyncStorage.setItem(HOUR_KEY, String(newHour)),
      AsyncStorage.setItem(MINUTE_KEY, String(newMinute)),
    ])
    if (enabled) {
      await scheduleDailyReminder(newHour, newMinute)
    }
  }

  return { enabled, hour, minute, loading, toggle, updateTime }
}
