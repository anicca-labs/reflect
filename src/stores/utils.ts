import { createMMKV, type Configuration } from 'react-native-mmkv'
import type { StateStorage } from 'zustand/middleware'

const createZustandMmkvStorage = (configuration?: Configuration): StateStorage => {
  const mmkvStorage = createMMKV(configuration)
  return {
    setItem: (name, value) => mmkvStorage.set(name, value),
    getItem: (name) => mmkvStorage.getString(name) ?? null,
    removeItem: (name) => { mmkvStorage.remove(name) },
  }
}

export { createZustandMmkvStorage }
