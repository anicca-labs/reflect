import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Platform, useColorScheme } from 'react-native'
import { YStack, XStack, Input, Spinner, styled } from 'tamagui'
import { useRouter } from 'expo-router'
import { DisplayLg, BodySm, LabelSm, LabelLg } from '@fonts'
import { Containers, KeyboardScrollView } from '@ksairi-org/ui-containers'
import { Trans, useLingui } from '@lingui/react/macro'
import { BaseTouchable } from '@ksairi-org/ui-touchables'
import { PasswordInput, PasswordInputHandle, FormField } from '@atoms'
import { supabase } from '@/src/services/supabase'
import { useToast } from '@hooks'
import { useSessionStore } from '@/src/stores'
import { HEADING_LETTER_SPACING } from '@constants'
import { sizes } from '@theme'

import {
  appleAuth,
  appleAuthAndroid,
  AppleButton,
  AppleError,
} from '@invertase/react-native-apple-authentication'

import {
  GoogleSignin,
  isSuccessResponse,
  statusCodes,
  isErrorWithCode,
} from '@react-native-google-signin/google-signin'
import Svg, { Path } from 'react-native-svg'
import { FontAwesome } from '@expo/vector-icons'

type Mode = 'sign-in' | 'sign-up'

const APPLE_ICON_SIZE = 20
const GOOGLE_ICON_SIZE = 18
const MIN_PASSWORD_LENGTH = 6
const LINK_PRESS_OPACITY = 0.7

const socialButtonStyle = {
  button: { width: '100%', height: sizes.xl },
} as const

const EmailInput = styled(Input, {
  bg: '$surface-card',
  color: '$text-emphasis',
  placeholderTextColor: '$placeholderColor',
  borderColor: '$borderColor',
  borderWidth: 1,
  focusStyle: {
    borderColor: '$accentBackground',
    outlineWidth: 0,
  },
})

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})

const SignInScreen = () => {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const { t } = useLingui()

  const translateAuthError = useCallback((message: string): string => {
    const lower = message.toLowerCase()
    if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) return t`Invalid email or password`
    if (lower.includes('email not confirmed')) return t`Please confirm your email before signing in`
    if (lower.includes('user already registered')) return t`An account with this email already exists`
    if (lower.includes('password should be at least')) return t`Password must be at least 6 characters`
    if (lower.includes('unable to validate email address')) return t`Please enter a valid email address`
    if (lower.includes('email rate limit exceeded') || lower.includes('too many requests')) return t`Too many attempts. Please try again later`
    return message
  }, [t])

  const { toast } = useToast()
  const router = useRouter()
  const { setAnonymous } = useSessionStore()
  const isDark = useColorScheme() === 'dark'
  const hasInitializedAppleSignIn = useRef(false)
  const prevAppState = useRef<string>('active')
  const passwordRef = useRef<PasswordInputHandle>(null)
  const confirmPasswordRef = useRef<PasswordInputHandle>(null)

  const validateEmail = () => {
    if (email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError(t`Please enter a valid email address`)
    } else {
      setEmailError(null)
    }
  }

  const checkPasswordMatch = () => {
    if (mode === 'sign-up' && password.length > 0 && confirmPassword.length > 0 && password !== confirmPassword) {
      setPasswordError(t`Passwords do not match`)
    } else {
      setPasswordError(null)
    }
  }

  const clearErrors = () => {
    setEmailError(null)
    setPasswordError(null)
    setAuthError(null)
  }

  const switchMode = () => {
    setMode(m => m === 'sign-in' ? 'sign-up' : 'sign-in')
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    clearErrors()
  }

  const handleSubmit = async () => {
    if (mode === 'sign-up' && password !== confirmPassword) {
      setPasswordError(t`Passwords do not match`)
      return
    }
    setAuthError(null)
    setLoading(true)

    const { error } = mode === 'sign-in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${process.env.EXPO_PUBLIC_APP_SCHEMA}://`,
          },
        })

    setLoading(false)
    if (error) {
      setAuthError(translateAuthError(error.message))
    } else if (mode === 'sign-up') {
      toast({
        title: t`Check your email`,
        message: t`We sent a confirmation link to ${email}.`,
        preset: 'done',
        duration: 6,
      })
      setMode('sign-in')
      setEmail('')
      setPassword('')
      setConfirmPassword('')
    }
  }

  const handleAppleSignIn = useCallback(async () => {
    hasInitializedAppleSignIn.current = true
    clearErrors()
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

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: identityToken,
        nonce,
      })
      if (error) throw error
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      const errCode = (err as { code?: string })?.code
      const isCancelledIOS =
        errCode === AppleError.CANCELED ||
        errCode === AppleError.UNKNOWN ||
        message.includes('com.apple.AuthenticationServices.AuthorizationError error 1001')
      const isCancelledAndroid = message.includes('E_SIGNIN_CANCELLED_ERROR')
      if (!isCancelledIOS && !isCancelledAndroid) setAuthError(message)
    } finally {
      setSocialLoading(false)
    }
  }, [t])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
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
  }, [handleAppleSignIn])

  const handleGoogleSignIn = useCallback(async () => {
    clearErrors()
    setSocialLoading(true)

    try {
      GoogleSignin.configure({
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
        offlineAccess: false,
      })

      await GoogleSignin.hasPlayServices()
      const signInResult = await GoogleSignin.signIn()

      if (!isSuccessResponse(signInResult)) return

      const idToken = signInResult.data.idToken
      if (!idToken) throw new Error(t`Google sign-in failed: no identity token`)

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      })
      if (error) throw error
    } catch (err: unknown) {
      if (isErrorWithCode(err)) {
        const cancelled = err.code === statusCodes.SIGN_IN_CANCELLED || err.code === statusCodes.IN_PROGRESS
        if (!cancelled) setAuthError(err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE ? t`Google Play Services not available` : translateAuthError(err.message))
      } else if (err instanceof Error) {
        setAuthError(translateAuthError(err.message))
      }
    } finally {
      setSocialLoading(false)
    }
  }, [t, translateAuthError])

  const isReady = email.trim().length > 0 && password.length >= MIN_PASSWORD_LENGTH &&
    (mode === 'sign-in' || confirmPassword.length >= MIN_PASSWORD_LENGTH)

  return (
    <Containers.Screen shouldAutoResize={false}>
      {/* NOTE: contentContainerStyle on KeyboardScrollView requires a plain style object */}
      <KeyboardScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: sizes.lg }}
        keyboardShouldPersistTaps="handled">
        <YStack gap="$0">
          <DisplayLg color="$text-emphasis" letterSpacing={HEADING_LETTER_SPACING} mb="$2">
            reflect
          </DisplayLg>
          <BodySm color="$text-placeholder" mb="$8">
            {mode === 'sign-in'
              ? <Trans>Welcome back.</Trans>
              : <Trans>Create your account.</Trans>}
          </BodySm>

          <FormField error={emailError}>
            <EmailInput
              value={email}
              onChangeText={(text) => { setEmail(text); setEmailError(null) }}
              onBlur={validateEmail}
              onSubmitEditing={() => isReady ? handleSubmit() : passwordRef.current?.focus()}
              returnKeyType={isReady ? 'done' : 'next'}
              placeholder={t`Email`}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              size="$4"
            />
          </FormField>

          <FormField error={passwordError}>
            <PasswordInput
              ref={passwordRef}
              value={password}
              onChangeText={(text) => { setPassword(text); setPasswordError(null) }}
              onBlur={checkPasswordMatch}
              onSubmitEditing={() => isReady ? handleSubmit() : confirmPasswordRef.current?.focus()}
              returnKeyType={isReady ? 'done' : mode === 'sign-up' ? 'next' : 'done'}
              placeholder={t`Password`}
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            />
          </FormField>

          {mode === 'sign-up' ? (
            <FormField error={null}>
              <PasswordInput
                ref={confirmPasswordRef}
                value={confirmPassword}
                onChangeText={(text) => { setConfirmPassword(text); setPasswordError(null) }}
                onBlur={checkPasswordMatch}
                onSubmitEditing={() => isReady && handleSubmit()}
                returnKeyType="done"
                placeholder={t`Confirm password`}
                autoComplete="new-password"
              />
            </FormField>
          ) : null}

          {authError ? (
            <LabelSm color="$red10" mb="$3">{authError}</LabelSm>
          ) : null}

          <BaseTouchable
            onPress={handleSubmit}
            disabled={!isReady || loading}
            bg={isReady ? '$accentBackground' : '$surface-subtle'}
            rounded="$4"
            py="$3"
            items="center"
            mt="$2">
            {loading
              ? <Spinner color={isReady ? '$accentColor' : '$text-disabled'} />
              : <LabelLg color={isReady ? '$accentColor' : '$text-disabled'}>
                  {mode === 'sign-in' ? <Trans>Sign in</Trans> : <Trans>Create account</Trans>}
                </LabelLg>
            }
          </BaseTouchable>

          {mode === 'sign-in' ? (
            <XStack justify="flex-end" mt="$2">
              <BodySm
                color="$accentBackground"
                onPress={() => router.push('/forgot-password')}
                pressStyle={{ opacity: LINK_PRESS_OPACITY }}>
                <Trans>Forgot password?</Trans>
              </BodySm>
            </XStack>
          ) : null}

          {mode === 'sign-in' ? (
            <YStack gap="$3" mt="$6" opacity={socialLoading ? 0.6 : 1}>
            {Platform.OS === 'ios' && appleAuth.isSupported ? (
              <AppleButton
                style={socialButtonStyle.button}
                buttonStyle={isDark ? AppleButton.Style.WHITE : AppleButton.Style.BLACK}
                buttonType={AppleButton.Type.SIGN_IN}
                onPress={handleAppleSignIn}
              />
            ) : null}
            {Platform.OS === 'android' && !!process.env.EXPO_PUBLIC_ANDROID_APPLE_SIGN_IN_CLIENT_ID ? (
              // NOTE: Apple brand colors require black/white — no semantic token equivalent
              <BaseTouchable
                onPress={handleAppleSignIn}
                style={socialButtonStyle.button}
                bg={isDark ? '$white' : '$black'}
                rounded="$4"
                items="center"
                justify="center"
                flexDirection="row"
                gap="$2">
                {/* NOTE: FontAwesome color prop is a native string, not a Tamagui token */}
                <FontAwesome name="apple" size={APPLE_ICON_SIZE} color={isDark ? 'black' : 'white'} />
                <LabelLg color={isDark ? '$black' : '$white'}><Trans>Sign in with Apple</Trans></LabelLg>
              </BaseTouchable>
            ) : null}
            <BaseTouchable
              onPress={handleGoogleSignIn}
              style={socialButtonStyle.button}
              bg="$surface-app"
              rounded="$4"
              borderWidth={1}
              borderColor="$borderColor"
              items="center"
              justify="center"
              flexDirection="row"
              gap="$2">
              <Svg width={GOOGLE_ICON_SIZE} height={GOOGLE_ICON_SIZE} viewBox="0 0 48 48">
                <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                <Path fill="none" d="M0 0h48v48H0z" />
              </Svg>
              <LabelLg color="$text-secondary">
                <Trans>Sign in</Trans>
              </LabelLg>
            </BaseTouchable>
          </YStack>
          ) : null}

          <XStack justify="center" mt="$5">
            <BodySm
              color="$accentBackground"
              onPress={switchMode}
              pressStyle={{ opacity: LINK_PRESS_OPACITY }}>
              {mode === 'sign-in'
                ? <Trans>Don&apos;t have an account? Sign up</Trans>
                : <Trans>Already have an account? Sign in</Trans>}
            </BodySm>
          </XStack>

          <XStack justify="center" mt="$4">
            <BodySm
              color="$text-disabled"
              onPress={() => { setAnonymous(); router.replace('/(tabs)') }}
              pressStyle={{ opacity: LINK_PRESS_OPACITY }}>
              <Trans>Continue without an account</Trans>
            </BodySm>
          </XStack>
        </YStack>
      </KeyboardScrollView>
    </Containers.Screen>
  )
}

export { SignInScreen }
