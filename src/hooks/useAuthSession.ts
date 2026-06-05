import { Session } from '@supabase/supabase-js'
import { useRouter, useSegments } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as Linking from 'expo-linking'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/src/services/supabase'
import { identifyRevenueCatUser, resetRevenueCatUser } from '@/src/services/revenue-cat'
import { upsertDeviceToken } from '@/src/services/user-devices'
import { useSessionStore, useAnonymousJournalStore } from '@/src/stores'
import { queryClient } from '@/src/services/queryClient'
import type { JournalEntry } from '@/src/types/journal'

// Set before calling signOut() when the intent is to return to anonymous mode
// rather than navigate to the sign-in screen.
let _keepAnonymousOnSignOut = false

const signOutToAnonymous = async () => {
  _keepAnonymousOnSignOut = true
  await supabase.auth.signOut({ scope: 'local' })
}

const FREE_ENTRY_LIMIT = 7

// iOS Keychain survives app deletion; AsyncStorage does not.
// On a fresh install, purge any stale Keychain session before restoring.
const clearStaleKeychainOnFreshInstall = async () => {
  const installed = await AsyncStorage.getItem('app_installed')
  if (!installed) {
    await supabase.auth.signOut({ scope: 'local' })
    await AsyncStorage.setItem('app_installed', '1')
  }
}

const getServerEntryCount = async (): Promise<number> => {
  const { count } = await supabase
    .from('journal_entries')
    .select('*', { count: 'exact', head: true })
  return count ?? 0
}

const migrateEntriesToServer = async (entries: JournalEntry[], userId: string) => {
  if (!entries.length) return
  const rows = [...entries].reverse().map((e) => ({
    user_id: userId,
    content: e.content,
    is_bookmarked: e.is_bookmarked,
    created_at: e.created_at,
    updated_at: e.updated_at,
  }))
  const { error } = await supabase.from('journal_entries').insert(rows)
  if (error) throw error
}

const useAuthSession = () => {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const isRecoveryMode = useRef(false)
  const router = useRouter()
  const segments = useSegments()
  const { isAnonymous, clearAnonymous, setPendingMerge } = useSessionStore()

  const handleAuthUrl = useCallback(async (url: string) => {
    // PKCE flow: Supabase sends ?code= in query params
    const queryParams = new URLSearchParams(url.split('?')[1] ?? '')
    const code = queryParams.get('code')
    const queryType = queryParams.get('type')
    if (code) {
      // Set recovery flag BEFORE exchange so the SIGNED_IN nav effect sees it
      if (queryType === 'recovery') isRecoveryMode.current = true
      await supabase.auth.exchangeCodeForSession(code)
      if (queryType === 'recovery') router.replace('/reset-password')
      return
    }
    // Implicit flow: tokens in hash fragment
    const hashParams = new URLSearchParams(url.split('#')[1] ?? '')
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')
    const type = hashParams.get('type')
    if (accessToken && refreshToken) {
      // Set recovery flag BEFORE setSession so the SIGNED_IN nav effect sees it
      if (type === 'recovery') isRecoveryMode.current = true
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      if (type === 'recovery') router.replace('/reset-password')
    }
  }, [router])

  useEffect(() => {
    const init = async () => {
      // Resolve initial URL first — if it's a recovery link, set the flag before
      // setSession(null) triggers the routing effect, preventing a sign-in flash
      const initialUrl = await Linking.getInitialURL()

      const isRecoveryUrl = !!initialUrl && (
        new URLSearchParams(initialUrl.split('#')[1] ?? '').get('type') === 'recovery' ||
        new URLSearchParams(initialUrl.split('?')[1] ?? '').get('type') === 'recovery'
      )

      if (isRecoveryUrl) isRecoveryMode.current = true

      // Skip on recovery links: clearStaleKeychainOnFreshInstall fires SIGNED_OUT
      // asynchronously which resets isRecoveryMode even after we re-assert it.
      // Recovery creates a fresh session anyway so clearing stale tokens is unnecessary.
      if (!isRecoveryUrl) await clearStaleKeychainOnFreshInstall()

      const { data: { session: s } } = await supabase.auth.getSession()
      setSession(s)

      if (initialUrl) await handleAuthUrl(initialUrl)
    }
    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s)

      if (event === 'SIGNED_OUT') {
        isRecoveryMode.current = false
        if (_keepAnonymousOnSignOut) {
          _keepAnonymousOnSignOut = false
          useSessionStore.getState().setAnonymous()
        } else {
          clearAnonymous()
        }
        resetRevenueCatUser()
        return
      }

      if (event === 'SIGNED_IN' && s?.user) {
        const userId = s.user.id
        identifyRevenueCatUser(userId)
        upsertDeviceToken(userId)

        // Migrate any locally-saved anonymous entries
        const { entries: localEntries } = useAnonymousJournalStore.getState()
        clearAnonymous()

        if (localEntries.length > 0) {
          const serverCount = await getServerEntryCount()
          const combined = localEntries.length + serverCount

          if (combined <= FREE_ENTRY_LIMIT) {
            try {
              await migrateEntriesToServer(localEntries, userId)
              useAnonymousJournalStore.getState().clearEntries()
              queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
            } catch {
              // Migration failed (network error). Fall back to merge modal so user can retry.
              setPendingMerge({ localCount: localEntries.length, serverCount })
            }
          } else {
            // Conflict: combined exceeds free limit — let user decide
            setPendingMerge({ localCount: localEntries.length, serverCount })
          }
        }
      }
    })

    const linkingSub = Linking.addEventListener('url', ({ url }) => handleAuthUrl(url))

    return () => {
      subscription.unsubscribe()
      linkingSub.remove()
    }
  }, [handleAuthUrl, clearAnonymous, setPendingMerge])

  useEffect(() => {
    if (session === undefined) return
    const inAuth = segments[0] === 'sign-in' || segments[0] === 'forgot-password' || segments[0] === 'reset-password'
    if (!session && !inAuth && !isAnonymous && !isRecoveryMode.current) router.replace('/sign-in')
    else if (session && inAuth && !isRecoveryMode.current) router.replace('/(tabs)')
  }, [session, segments, router, isAnonymous])

  return { session }
}

export { useAuthSession, migrateEntriesToServer, signOutToAnonymous }
