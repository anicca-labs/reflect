import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Platform, StyleSheet } from 'react-native'
import { YStack, XStack, Input, Spinner } from 'tamagui'
import { DisplayLg, BodySm, LabelSm, LabelLg } from '@fonts'
import { Containers, KeyboardScrollView } from '@ksairi-org/ui-containers'
import { Trans, useLingui } from '@lingui/react/macro'
import { BaseTouchable } from '@ksairi-org/ui-touchables'
import { supabase } from '@/src/services/supabase'
import { sizes } from '@theme'

import {
  appleAuth,
  appleAuthAndroid,
  AppleButton,
  AppleButtonStyle,
  AppleButtonType,
} from '@invertase/react-native-apple-authentication'

import {
  GoogleSignin,
  GoogleSigninButton,
  isSuccessResponse,
  statusCodes,
  isErrorWithCode,
} from '@react-native-google-signin/google-signin'

type Mode = 'sign-in' | 'sign-up'

const styles = StyleSheet.create({
  appleButton: {
    width: '100%',
    height: 45,
  },
  googleButton: {
    width: '100%',
    height: 45,
  },
})

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})

export default function SignInScreen() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { t } = useLingui()

  const hasInitializedAppleSignIn = useRef(false)
  const prevAppState = useRef<string>('active')

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      // Re-trigger Apple sign-in after returning from the iOS credential picker
      if (
        Platform.OS === 'ios' &&
        prevAppState.current === 'background' &&
        nextState === 'active' &&
        hasInitializedAppleSignIn.current
      ) {
        handleAppleSignIn()
      }
      prevAppState.current = nextState
    })
    return () => subscription.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit() {
    setError(null)
    setLoading(true)

    const { error: authError } = mode === 'sign-in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })

    setLoading(false)
    if (authError) setError(authError.message)
  }

  const handleAppleSignIn = useCallback(async () => {
    hasInitializedAppleSignIn.current = true
    setError(null)
    setSocialLoading(true)

    try {
      let identityToken: string
      let nonce: string | undefined

      if (Platform.OS === 'ios') {
        const response = await appleAuth.performRequest({
          requestedOperation: appleAuth.Operation.LOGIN,
          requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
        })
        if (!response.identityToken) {
          throw new Error(t`Apple sign-in failed: no identity token`)
        }
        identityToken = response.identityToken
        nonce = response.nonce ?? undefined
      } else {
        if (
          !process.env.EXPO_PUBLIC_ANDROID_APPLE_SIGN_IN_CLIENT_ID ||
          !process.env.EXPO_PUBLIC_ANDROID_APPLE_CALLBACK
        ) {
          throw new Error(t`Apple sign-in is not configured for Android`)
        }
        appleAuthAndroid.configure({
          clientId: process.env.EXPO_PUBLIC_ANDROID_APPLE_SIGN_IN_CLIENT_ID,
          redirectUri: process.env.EXPO_PUBLIC_ANDROID_APPLE_CALLBACK,
          responseType: appleAuthAndroid.ResponseType.ALL,
          scope: appleAuthAndroid.Scope.ALL,
          nonce: `${Date.now()}`,
        })
        const response = await appleAuthAndroid.signIn()
        if (!response.id_token) {
          throw new Error(t`Apple sign-in failed: no identity token`)
        }
        identityToken = response.id_token
        nonce = response.nonce ?? undefined
      }

      const { error: authError } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: identityToken,
        nonce,
      })
      if (authError) throw authError
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      const isCancelledIOS = message.includes(
        'com.apple.AuthenticationServices.AuthorizationError error 1001',
      )
      const isCancelledAndroid = message.includes('E_SIGNIN_CANCELLED_ERROR')
      if (!isCancelledIOS && !isCancelledAndroid) {
        setError(message)
      }
    } finally {
      setSocialLoading(false)
    }
  }, [t])

  const handleGoogleSignIn = useCallback(async () => {
    setError(null)
    setSocialLoading(true)

    try {
      GoogleSignin.configure({
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        offlineAccess: false,
      })

      await GoogleSignin.hasPlayServices()
      const signInResult = await GoogleSignin.signIn()

      if (!isSuccessResponse(signInResult)) return

      const idToken = signInResult.data.idToken
      if (!idToken) throw new Error(t`Google sign-in failed: no identity token`)

      const { error: authError } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      })
      if (authError) throw authError
    } catch (err: unknown) {
      if (isErrorWithCode(err)) {
        const cancelled =
          err.code === statusCodes.SIGN_IN_CANCELLED ||
          err.code === statusCodes.IN_PROGRESS
        if (!cancelled) setError(err.message)
      } else if (err instanceof Error) {
        setError(err.message)
      }
    } finally {
      setSocialLoading(false)
    }
  }, [t])

  const isReady = email.trim().length > 0 && password.length >= 6

  return (
    <Containers.Screen shouldAutoResize={false}>
      <KeyboardScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: sizes.lg }}
        keyboardShouldPersistTaps="handled">
        <YStack gap="$0">
          <DisplayLg color="$color12" letterSpacing={-0.5} mb="$2">
            reflect
          </DisplayLg>
          <BodySm color="$color9" mb="$8">
            {mode === 'sign-in'
              ? <Trans>Welcome back.</Trans>
              : <Trans>Create your account.</Trans>}
          </BodySm>

          <Input
            value={email}
            onChangeText={setEmail}
            placeholder={t`Email`}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            size="$4"
            mb="$3"
            bg="$color2"
            borderColor="$borderColor"
            borderWidth={1}
            focusStyle={{ borderColor: '$accentBackground', outlineWidth: 0 }}
          />

          <Input
            value={password}
            onChangeText={setPassword}
            placeholder={t`Password`}
            secureTextEntry
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            size="$4"
            mb="$2"
            bg="$color2"
            borderColor="$borderColor"
            borderWidth={1}
            focusStyle={{ borderColor: '$accentBackground', outlineWidth: 0 }}
          />

          {error && (
            <LabelSm color="$red10" mb="$3">
              {error}
            </LabelSm>
          )}

          <BaseTouchable
            onPress={handleSubmit}
            disabled={!isReady || loading}
            bg={isReady ? '$accentBackground' : '$color3'}
            rounded="$4"
            py="$3"
            items="center"
            mt="$2">
            {loading
              ? <Spinner color={isReady ? '$accentColor' : '$color8'} />
              : <LabelLg color={isReady ? '$accentColor' : '$color8'}>
                  {mode === 'sign-in' ? <Trans>Sign in</Trans> : <Trans>Create account</Trans>}
                </LabelLg>
            }
          </BaseTouchable>

          <YStack gap="$3" mt="$6" opacity={socialLoading ? 0.6 : 1}>
            <AppleButton
              buttonStyle={AppleButtonStyle.BLACK}
              buttonType={AppleButtonType.SIGN_IN}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
            <GoogleSigninButton
              style={styles.googleButton}
              onPress={handleGoogleSignIn}
            />
          </YStack>

          <XStack justify="center" mt="$5">
            <BodySm
              color="$accentBackground"
              onPress={() => { setMode(m => m === 'sign-in' ? 'sign-up' : 'sign-in'); setError(null) }}
              pressStyle={{ opacity: 0.7 }}>
              {mode === 'sign-in'
                ? <Trans>Don&apos;t have an account? Sign up</Trans>
                : <Trans>Already have an account? Sign in</Trans>}
            </BodySm>
          </XStack>
        </YStack>
      </KeyboardScrollView>
    </Containers.Screen>
  )
}
