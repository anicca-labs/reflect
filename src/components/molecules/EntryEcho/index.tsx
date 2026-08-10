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
  // How many entries they've written without consenting — the repeat ask leans
  // on it, since "you've written 5 entries" is a far stronger reason to say yes
  // than a cold pitch.
  entriesSoFar: number;
  // Guests can't receive an echo (their entries never leave the device), so the card
  // becomes a sign-up pitch instead of a consent one.
  isGuest?: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onDismissLine: () => void;
};

const EntryEchoCards = ({
  line,
  loading,
  consentVisible,
  entriesSoFar,
  isGuest = false,
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
          {/* Framed around THIS entry, not an abstract permission. 20% of people who
              saw the old "Want your journal to write back? / Yes, write back" card said
              yes — reasonable, given it asked to open the most private thing on their
              phone before showing anything. Accepting already fetches the echo for the
              entry they just wrote (acceptConsent -> fetchEcho), so the value arrives
              in the same tap; the copy just never said so.
              The body states plainly that the entry is SENT to be read. Consent has to
              stay informed — a vague "see what happens" that quietly ships someone's
              journal would be a dark pattern, and privacy is the whole product. */}
          <YStack gap="$1">
            <BodyMdBold color="$text-emphasis">
              🍂{' '}
              {entriesSoFar <= 1 ? (
                <Trans>See what Reflect notices in this entry?</Trans>
              ) : entriesSoFar <= 3 ? (
                <Trans>That’s {entriesSoFar} entries — see what they add up to?</Trans>
              ) : (
                <Trans>You’ve written {entriesSoFar} entries. Ready to see your week?</Trans>
              )}
            </BodyMdBold>
            <BodySm color="$text-secondary">
              {isGuest ? (
                <Trans>
                  Your entry is sent to be read, and a line comes back — something you might not
                  have noticed yourself. Every Sunday, your week is written back to you. A free
                  account unlocks it, and brings your entries with you.
                </Trans>
              ) : (
                <Trans>
                  Your entry is sent to be read, and a line comes back — something you might not
                  have noticed yourself. Every Sunday, your week is written back to you. 4
                  reflections free.
                </Trans>
              )}
            </BodySm>
            <BodySm color="$text-disabled" style={{ lineHeight: 16 }}>
              <Trans>Never shown to another person, never sold, never used to train AI.</Trans>
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
              {/* Names the action and its object. "Yes, write back" asked for a standing
                  permission; this offers to do one concrete thing to the entry on screen. */}
              <LabelLg color="$accentColor">
                {isGuest ? <Trans>Create free account ✦</Trans> : <Trans>Read this entry ✦</Trans>}
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
