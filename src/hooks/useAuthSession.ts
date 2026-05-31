import { Session } from '@supabase/supabase-js'
import { useRouter, useSegments } from 'expo-router'
import { useEffect, useState } from 'react'
import * as Linking from 'expo-linking'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/src/services/supabase'
import { identifyRevenueCatUser, resetRevenueCatUser } from '@/src/services/revenue-cat'
import { upsertDeviceToken } from '@/src/services/user-devices'

const handleAuthUrl = async (url: string) => {
  // PKCE flow: Supabase sends ?code= in query params
  const queryParams = new URLSearchParams(url.split('?')[1] ?? '')
  const code = queryParams.get('code')
  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
    return
  }
  // Implicit flow: tokens in hash fragment
  const hashParams = new URLSearchParams(url.split('#')[1] ?? '')
  const accessToken = hashParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token')
  if (accessToken && refreshToken) {
    await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
  }
}

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
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    const init = async () => {
      await clearStaleKeychainOnFreshInstall()
      const { data: { session: s } } = await supabase.auth.getSession()
      setSession(s)
    }
    init()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (s?.user) {
        identifyRevenueCatUser(s.user.id)
        upsertDeviceToken(s.user.id)
      } else if (event === 'SIGNED_OUT') resetRevenueCatUser()
    })

    Linking.getInitialURL().then((url) => { if (url) handleAuthUrl(url) })
    const linkingSub = Linking.addEventListener('url', ({ url }) => handleAuthUrl(url))

    return () => {
      subscription.unsubscribe()
      linkingSub.remove()
    }
  }, [])

  useEffect(() => {
    if (session === undefined) return
    const inAuth = segments[0] === 'sign-in'
    if (!session && !inAuth) router.replace('/sign-in')
    else if (session && inAuth) router.replace('/(tabs)')
  }, [session, segments, router])

  return { session }
}

export { useAuthSession }
