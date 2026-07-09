import { useRef, useState } from 'react';
import { YStack, Spinner } from 'tamagui';
import { DisplayLg, BodySm, LabelSm, LabelLg } from '@fonts';
import { Containers, KeyboardScrollView } from '@anicca-labs/ui-containers';
import { Trans, useLingui } from '@lingui/react/macro';
import { BaseTouchable } from '@anicca-labs/ui-touchables';
import { PasswordInput, PasswordInputHandle, FormField } from '@atoms';
import { supabase } from '@/src/services/supabase';
import { useToast } from '@hooks';
import { HEADING_LETTER_SPACING } from '@constants';
import { sizes } from '@theme';
import { useRouter } from 'expo-router';

const MIN_PASSWORD_LENGTH = 6;
const LINK_PRESS_OPACITY = 0.7;

const ResetPasswordScreen = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useLingui();
  const { toast } = useToast();
  const router = useRouter();
  const confirmPasswordRef = useRef<PasswordInputHandle>(null);

  const checkPasswordMatch = () => {
    if (password.length > 0 && confirmPassword.length > 0 && password !== confirmPassword) {
      setPasswordError(t`Passwords do not match`);
    } else {
      setPasswordError(null);
    }
  };

  const handleSubmit = async () => {
    if (password !== confirmPassword) {
      setPasswordError(t`Passwords do not match`);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      const lower = error.message.toLowerCase();
      const msg = lower.includes('password should be at least')
        ? t`Password must be at least 6 characters`
        : lower.includes('same password')
          ? t`New password must be different from your current password`
          : error.message;
      setPasswordError(msg);
    } else {
      await supabase.auth.signOut();
      toast({
        title: t`Password updated`,
        message: t`Sign in with your new password.`,
        preset: 'done',
        duration: 4,
      });
      router.replace('/sign-in');
    }
  };

  const isReady =
    password.length >= MIN_PASSWORD_LENGTH &&
    confirmPassword.length >= MIN_PASSWORD_LENGTH &&
    !passwordError;

  return (
    <Containers.Screen shouldAutoResize={false}>
      <KeyboardScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: sizes.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <YStack gap="$0">
          <DisplayLg color="$text-emphasis" letterSpacing={HEADING_LETTER_SPACING} mb="$2">
            reflect
          </DisplayLg>
          <BodySm color="$text-placeholder" mb="$8">
            <Trans>Choose a new password.</Trans>
          </BodySm>

          <FormField error={passwordError}>
            <PasswordInput
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setPasswordError(null);
              }}
              onBlur={checkPasswordMatch}
              onSubmitEditing={() => confirmPasswordRef.current?.focus()}
              returnKeyType="next"
              placeholder={t`New password`}
              autoComplete="new-password"
            />
          </FormField>

          <FormField error={null}>
            <PasswordInput
              ref={confirmPasswordRef}
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                setPasswordError(null);
              }}
              onBlur={checkPasswordMatch}
              onSubmitEditing={() => isReady && handleSubmit()}
              returnKeyType="done"
              placeholder={t`Confirm new password`}
              autoComplete="new-password"
            />
          </FormField>

          <BaseTouchable
            onPress={handleSubmit}
            disabled={!isReady || loading}
            bg={isReady ? '$accentBackground' : '$surface-subtle'}
            rounded="$4"
            py="$3"
            items="center"
            mt="$2"
          >
            {loading ? (
              <Spinner color={isReady ? '$accentColor' : '$text-disabled'} />
            ) : (
              <LabelLg color={isReady ? '$accentColor' : '$text-disabled'}>
                <Trans>Set new password</Trans>
              </LabelLg>
            )}
          </BaseTouchable>

          <YStack items="center" mt="$5">
            <LabelSm
              color="$accentBackground"
              onPress={() => router.replace('/sign-in')}
              pressStyle={{ opacity: LINK_PRESS_OPACITY }}
            >
              <Trans>Back to sign in</Trans>
            </LabelSm>
          </YStack>
        </YStack>
      </KeyboardScrollView>
    </Containers.Screen>
  );
};

export { ResetPasswordScreen };
