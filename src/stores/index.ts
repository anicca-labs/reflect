import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createZustandMmkvStorage } from './utils'

type UserStoreKey = 'firstName' | 'lastName'

type UserStoreState = {
  firstName: string | null
  lastName: string | null
  setKeyValue: (key: UserStoreKey, value: string | null) => void
}

/**
 * Minimal user store that satisfies the `@stores` contract expected by
 * `@ksairi-org/react-native-auth-apple` and `@ksairi-org/react-native-auth-google`.
 * The library persistence hooks call `setKeyValue` after a successful social
 * sign-in to cache display-name data.
 */
const useUserStore = create<UserStoreState>((set) => ({
  firstName: null,
  lastName: null,
  setKeyValue: (key, value) => set({ [key]: value }),
}))

type TimeFormat = '12h' | '24h'

type PreferencesStoreState = {
  timeFormat: TimeFormat
  setTimeFormat: (format: TimeFormat) => void
}

type SwipeableStoreState = {
  activeDragCount: number
  startDrag: () => void
  endDrag: () => void
}

const useSwipeableStore = create<SwipeableStoreState>((set) => ({
  activeDragCount: 0,
  startDrag: () => set((s) => ({ activeDragCount: s.activeDragCount + 1 })),
  endDrag: () => set((s) => ({ activeDragCount: Math.max(0, s.activeDragCount - 1) })),
}))

const usePreferencesStore = create<PreferencesStoreState>()(
  persist(
    (set) => ({
      timeFormat: '12h',
      setTimeFormat: (format) => set({ timeFormat: format }),
    }),
    {
      name: 'reflect-preferences',
      storage: createJSONStorage(() => createZustandMmkvStorage()),
    },
  ),
)

export { useUserStore, useSwipeableStore, usePreferencesStore }
