import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { YStack, XStack, Spinner } from 'tamagui';
import { BodySm, BodyMdBold, LabelMd, LabelLg } from '@fonts';
import { BaseTouchable } from '@anicca-labs/ui-touchables';
import { Trans } from '@lingui/react/macro';

// The post-save companion cards for the entry echo (see useEntryEcho):
// - consent: shown once after the first online save, asking to let the AI write back
// - line: the one-line echo itself, shown after each save once consented
// Rendered at the top of the Journal scroll area, above the weekly banner.

type EntryEchoCardsProps = {
  line: string | null;
  loading: boolean;
  consentVisible: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onDismissLine: () => void;
};

const EntryEchoCards = ({
  line,
  loading,
  consentVisible,
  onAccept,
  onDecline,
  onDismissLine,
}: EntryEchoCardsProps) => {
  if (consentVisible) {
    return (
      <Animated.View entering={FadeInDown.duration(260)} exiting={FadeOutUp.duration(220)}>
        <YStack
          bg="$surface-card"
          rounded="$4"
          p="$4"
          mb="$4"
          borderWidth={1}
          borderColor="$accentBackground"
          gap="$3"
        >
          <YStack gap="$1">
            <BodyMdBold color="$text-emphasis">
              🍂 <Trans>Want your journal to write back?</Trans>
            </BodyMdBold>
            <BodySm color="$text-secondary">
              <Trans>
                One gentle line after you write — and your whole week, every Sunday. Never shown to
                anyone, never sold, never used to train AI.
              </Trans>
            </BodySm>
          </YStack>
          <XStack gap="$3" items="center">
            <BaseTouchable
              onPress={onAccept}
              bg="$accentBackground"
              rounded="$4"
              px="$4"
              py="$3"
              items="center"
              flex={1}
            >
              <LabelLg color="$accentColor">
                <Trans>Yes, write back ✦</Trans>
              </LabelLg>
            </BaseTouchable>
            <BaseTouchable onPress={onDecline} px="$3" py="$3">
              <LabelMd color="$text-secondary">
                <Trans>Not now</Trans>
              </LabelMd>
            </BaseTouchable>
          </XStack>
        </YStack>
      </Animated.View>
    );
  }

  if (loading) {
    return (
      <XStack items="center" gap="$2" mb="$4" px="$2">
        <Spinner size="small" color="$accentBackground" />
        <BodySm color="$text-disabled">
          <Trans>Reading…</Trans>
        </BodySm>
      </XStack>
    );
  }

  if (line) {
    return (
      <Animated.View entering={FadeInDown.duration(320)} exiting={FadeOutUp.duration(220)}>
        <BaseTouchable onPress={onDismissLine}>
          <YStack
            bg="$surface-card"
            rounded="$4"
            p="$4"
            mb="$4"
            borderWidth={1}
            borderColor="$borderColor"
          >
            <XStack justify="space-between" items="flex-start" gap="$3">
              <BodySm color="$text-emphasis" flex={1} style={{ lineHeight: 20 }}>
                🍂 {line}
              </BodySm>
              <LabelMd color="$text-disabled">✕</LabelMd>
            </XStack>
          </YStack>
        </BaseTouchable>
      </Animated.View>
    );
  }

  return null;
};

export { EntryEchoCards };
