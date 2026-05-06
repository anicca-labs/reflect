import { create } from 'zustand'

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
export const useUserStore = create<UserStoreState>((set) => ({
  firstName: null,
  lastName: null,
  setKeyValue: (key, value) => set({ [key]: value }),
}))
