import { Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView, YStack, XStack } from 'tamagui';
import { HeadingLg, BodyLg, LabelMd, LabelLg } from '@fonts';
import { BaseTouchable } from '@anicca-labs/ui-touchables';
import { Trans } from '@lingui/react/macro';
import { HEADING_LETTER_SPACING, LABEL_LETTER_SPACING } from '@constants';
import type { WeeklyReflection } from '@/src/data/mockWeeklyReflections';

interface ReflectionReadModalProps {
  reflection: WeeklyReflection | null;
  onClose: () => void;
  // Fired by the "Write what it stirs" CTA — in the real feature this drops the
  // user into the composer. In the preview it just closes.
  onWrite?: () => void;
}

// Full-screen, calm read of one weekly reflection. The reveal deserves space —
// so it's its own surface, not a cramped list row.
const ReflectionReadModal = ({ reflection, onClose, onWrite }: ReflectionReadModalProps) => {
  const insets = useSafeAreaInsets();
  const paragraphs = reflection ? reflection.body.split('\n\n') : [];

  return (
    <Modal
      visible={!!reflection}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <YStack flex={1} bg="$background">
        <XStack justify="flex-end" items="center" px="$4" style={{ paddingTop: insets.top + 8 }}>
          <BaseTouchable
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            px="$2"
            py="$1"
          >
            <LabelLg color="$text-disabled">✕</LabelLg>
          </BaseTouchable>
        </XStack>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24 }}>
          {reflection ? (
            <YStack>
              <LabelMd
                color="$accentBackground"
                textTransform="uppercase"
                letterSpacing={LABEL_LETTER_SPACING}
                mb="$3"
              >
                🍂 <Trans>Weekly reflection</Trans>
              </LabelMd>

              <HeadingLg color="$text-emphasis" letterSpacing={HEADING_LETTER_SPACING}>
                {reflection.relativeLabel}
              </HeadingLg>
              <LabelMd color="$text-disabled" mt="$1" mb="$6">
                {reflection.rangeLabel} · <Trans>{reflection.entryCount} entries</Trans>
              </LabelMd>

              {paragraphs.map((p, i) => (
                <BodyLg key={i} color="$text-emphasis" mb="$4" style={{ lineHeight: 28 }}>
                  {p}
                </BodyLg>
              ))}
            </YStack>
          ) : null}
        </ScrollView>

        <YStack
          px="$5"
          pt="$3"
          borderTopWidth={1}
          borderTopColor="$borderColor"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <BaseTouchable
            onPress={onWrite ?? onClose}
            bg="$accentBackground"
            rounded="$4"
            p="$4"
            items="center"
          >
            <LabelLg color="$accentColor">
              <Trans>Write what it stirs →</Trans>
            </LabelLg>
          </BaseTouchable>
        </YStack>
      </YStack>
    </Modal>
  );
};

export { ReflectionReadModal };
