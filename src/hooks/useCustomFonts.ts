import { useFonts } from 'expo-font'
import { fontAssets } from '@theme'

const useCustomFonts = (): boolean => {
  const [loaded, error] = useFonts(fontAssets)
  if (error) console.error('useCustomFonts:', error)
  return loaded
}

export { useCustomFonts }
