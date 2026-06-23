import { useState } from 'react';
import { YStack, Input, Spinner, styled } from 'tamagui';
import { DisplayLg, BodySm, LabelSm, LabelLg } from '@fonts';
import { Containers, KeyboardScrollView } from '@ksairi-org/ui-containers';
import { Trans, useLingui } from '@lingui/react/macro';
import { BaseTouchable } from '@ksairi-org/ui-touchables';
import { FormField } from '@atoms';
import { supabase } from '@/src/services/supabase';
import { useToast } from '@hooks';
import { HEADING_LETTER_SPACING } from '@constants';
import { sizes } from '@theme';
import { useRouter } from 'expo-router';

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
});

const LINK_PRESS_OPACITY = 0.7;

const ForgotPasswordScreen = () => {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useLingui();
  const { toast } = useToast();
  const router = useRouter();

  const validateEmail = () => {
    if (email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError(t`Please enter a valid email address`);
    } else {
      setEmailError(null);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.EXPO_PUBLIC_APP_SCHEMA}://`,
    });
    setLoading(false);

    if (error) {
      const lower = error.message.toLowerCase();
      const msg =
        lower.includes('email rate limit') || lower.includes('too many requests')
          ? t`Too many attempts. Please try again later`
          : lower.includes('user not found') || lower.includes('unable to validate')
            ? t`No account found with this email`
            : error.message;
      setEmailError(msg);
    } else {
      toast({
        title: t`Check your email`,
        message: t`We sent a password reset link to ${email}.`,
        preset: 'done',
        duration: 6,
      });
      router.replace('/sign-in');
    }
  };

  const isReady = email.trim().length > 0 && !emailError;

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
            <Trans>Enter your email to receive a reset link.</Trans>
          </BodySm>

          <FormField error={emailError}>
            <EmailInput
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setEmailError(null);
              }}
              onBlur={validateEmail}
              onSubmitEditing={() => isReady && handleSubmit()}
              returnKeyType="done"
              placeholder={t`Email`}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              size="$4"
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
                <Trans>Send reset link</Trans>
              </LabelLg>
            )}
          </BaseTouchable>

          <YStack items="center" mt="$5">
            <LabelSm
              color="$accentBackground"
              onPress={() => router.back()}
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

export { ForgotPasswordScreen };
