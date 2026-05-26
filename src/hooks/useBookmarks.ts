import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = '@reflect/bookmarks'

export function useBookmarks() {
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set())

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val) setBookmarked(new Set(JSON.parse(val) as string[]))
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
