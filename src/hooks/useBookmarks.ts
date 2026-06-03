import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = '@reflect/bookmarks'

const useBookmarks = () => {
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set())

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val) {
        const parsed: unknown = JSON.parse(val)
        if (Array.isArray(parsed)) {
          setBookmarked(new Set(parsed.filter((x): x is string => typeof x === 'string')))
        }
      }
    })
  }, [])

  const toggle = useCallback(async (id: string) => {
    setBookmarked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }, [])

  const isBookmarked = useCallback((id: string) => bookmarked.has(id), [bookmarked])

  return { isBookmarked, toggle }
}

export { useBookmarks }
