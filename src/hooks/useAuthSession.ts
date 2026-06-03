import { Session } from '@supabase/supabase-js'
import { useRouter, useSegments } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as Linking from 'expo-linking'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/src/services/supabase'
import { identifyRevenueCatUser, resetRevenueCatUser } from '@/src/services/revenue-cat'
import { upsertDeviceToken } from '@/src/services/user-devices'

// iOS Keychain survives app deletion; AsyncStorage does not.
// On a fresh install, purge any stale Keychain session before restoring.
const clearStaleKeychainOnFreshInstall = async () => {
  const installed = await AsyncStorage.getItem('app_installed')
  if (!installed) {
    await supabase.auth.signOut({ scope: 'local' })
    await AsyncStorage.setItem('app_installed', '1')
  }
}

const useAuthSession = () => {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const isRecoveryMode = useRef(false)
  const router = useRouter()
  const segments = useSegments()

  const handleAuthUrl = useCallback(async (url: string) => {
    // PKCE flow: Supabase sends ?code= in query params
    const queryParams = new URLSearchParams(url.split('?')[1] ?? '')
    const code = queryParams.get('code')
    const queryType = queryParams.get('type')
    if (code) {
      await supabase.auth.exchangeCodeForSession(code)
      // detectSessionInUrl: false means PASSWORD_RECOVERY never fires — check type ourselves
      if (queryType === 'recovery') {
        isRecoveryMode.current = true
        router.replace('/reset-password')
      }
      return
    }
    // Implicit flow: tokens in hash fragment
    const hashParams = new URLSearchParams(url.split('#')[1] ?? '')
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')
    const type = hashParams.get('type')
    if (accessToken && refreshToken) {
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      // setSession fires SIGNED_IN not PASSWORD_RECOVERY — detect recovery from URL type param
      if (type === 'recovery') {
        isRecoveryMode.current = true
        router.replace('/reset-password')
      }
    }
  }, [router])

  useEffect(() => {
    const init = async () => {
      // Resolve initial URL first — if it's a recovery link, set the flag before
      // setSession(null) triggers the routing effect, preventing a sign-in flash
      const initialUrl = await Linking.getInitialURL()
      if (initialUrl) {
        const hashType = new URLSearchParams(initialUrl.split('#')[1] ?? '').get('type')
        const queryType = new URLSearchParams(initialUrl.split('?')[1] ?? '').get('type')
        if (hashType === 'recovery' || queryType === 'recovery') {
          isRecoveryMode.current = true
        }
      }

      await clearStaleKeychainOnFreshInstall()
      const { data: { session: s } } = await supabase.auth.getSession()
      setSession(s)

      if (initialUrl) await handleAuthUrl(initialUrl)
    }
    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_OUT') {
        isRecoveryMode.current = false
        resetRevenueCatUser()
        return
      }
      if (s?.user) {
        identifyRevenueCatUser(s.user.id)
        upsertDeviceToken(s.user.id)
      }
    })

    const linkingSub = Linking.addEventListener('url', ({ url }) => handleAuthUrl(url))

    return () => {
      subscription.unsubscribe()
      linkingSub.remove()
    }
  }, [handleAuthUrl])

  useEffect(() => {
    if (session === undefined) return
    const inAuth = segments[0] === 'sign-in' || segments[0] === 'forgot-password' || segments[0] === 'reset-password'
    if (!session && !inAuth && !isRecoveryMode.current) router.replace('/sign-in')
    else if (session && inAuth && !isRecoveryMode.current) router.replace('/(tabs)')
  }, [session, segments, router])

  return { session }
}

export { useAuthSession }
