import React, { useState } from 'react'
import { YStack, XStack, Text, Input, Spinner } from 'tamagui'
import { Containers , KeyboardScrollView } from '@ksairi-org/ui-containers'
import { Trans, useLingui } from '@lingui/react/macro'
import { BaseTouchable } from '@ksairi-org/ui-touchables'
import { supabase } from '@/src/services/supabase'
import { sizes } from '@theme'

type Mode = 'sign-in' | 'sign-up'

export default function SignInScreen() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { t } = useLingui()

  async function handleSubmit() {
    setError(null)
    setLoading(true)

    const { error: authError } = mode === 'sign-in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })

    setLoading(false)
    if (authError) setError(authError.message)
  }

  const isReady = email.trim().length > 0 && password.length >= 6

  return (
    <Containers.Screen shouldAutoResize={false}>
      <KeyboardScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: sizes.lg }}
        keyboardShouldPersistTaps="handled">
        <YStack gap="$0">
          <Text
            fontFamily="$heading"
            fontSize="$9"
            fontWeight="700"
            color="$color12"
            letterSpacing={-0.5}
            mb="$2">
            reflect
          </Text>
          <Text fontSize="$2" color="$color9" mb="$8">
            {mode === 'sign-in'
              ? <Trans>Welcome back.</Trans>
              : <Trans>Create your account.</Trans>}
          </Text>

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
            <Text color="$red10" fontSize="$1" mb="$3">
              {error}
            </Text>
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
              : <Text color={isReady ? '$accentColor' : '$color8'} fontWeight="600" fontSize="$2">
                  {mode === 'sign-in' ? <Trans>Sign in</Trans> : <Trans>Create account</Trans>}
                </Text>
            }
          </BaseTouchable>

          <XStack justify="center" mt="$5">
            <Text
              color="$accentBackground"
              fontSize="$2"
              onPress={() => { setMode(m => m === 'sign-in' ? 'sign-up' : 'sign-in'); setError(null) }}
              pressStyle={{ opacity: 0.7 }}>
              {mode === 'sign-in'
                ? <Trans>Don&apos;t have an account? Sign up</Trans>
                : <Trans>Already have an account? Sign in</Trans>}
            </Text>
          </XStack>
        </YStack>
      </KeyboardScrollView>
    </Containers.Screen>
  )
}
