import { useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { syncReminderToBackend } from '@/src/services/user-devices'

const ENABLED_KEY = '@reflect/reminder_enabled'
const HOUR_KEY = '@reflect/reminder_hour'
const MINUTE_KEY = '@reflect/reminder_minute'

const DEFAULT_REMINDER_HOUR = 20
const DEFAULT_REMINDER_MINUTE = 0

const useReminder = () => {
  const [enabled, setEnabled] = useState(false)
  const [hour, setHour] = useState(DEFAULT_REMINDER_HOUR)
  const [minute, setMinute] = useState(DEFAULT_REMINDER_MINUTE)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
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

  const toggle = async (notifPermission: boolean) => {
    if (!notifPermission) return
    const next = !enabled
    setEnabled(next)
    await AsyncStorage.setItem(ENABLED_KEY, String(next))
    syncReminderToBackend(next, hour, minute)
  }

  const updateTime = async (newHour: number, newMinute: number) => {
    setHour(newHour)
    setMinute(newMinute)
    await Promise.all([
      AsyncStorage.setItem(HOUR_KEY, String(newHour)),
      AsyncStorage.setItem(MINUTE_KEY, String(newMinute)),
    ])
    if (enabled) {
      syncReminderToBackend(true, newHour, newMinute)
    }
  }

  return { enabled, hour, minute, loading, toggle, updateTime }
}

export { DEFAULT_REMINDER_HOUR, DEFAULT_REMINDER_MINUTE, useReminder }
