import { Modal, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView, YStack, XStack } from 'tamagui';
import { HeadingLg, BodyLg, LabelMd, LabelLg } from '@fonts';
import { BaseTouchable } from '@anicca-labs/ui-touchables';
import { Trans, useLingui } from '@lingui/react/macro';
import { HEADING_LETTER_SPACING, LABEL_LETTER_SPACING } from '@constants';
import { reflectionMeta, useReflectionFeedback, type Reflection } from '@hooks';
import { useAppLockStore } from '@/src/stores';

interface ReflectionReadModalProps {
  reflection: Reflection | null;
  onClose: () => void;
  // The "Write what it stirs" CTA — in the real feature this drops into the
  // composer; here it just closes.
  onWrite?: () => void;
}

// Full-screen, calm read of one weekly reflection. The reveal deserves space —
// its own surface, not a cramped list row.
const ReflectionReadModal = ({ reflection, onClose, onWrite }: ReflectionReadModalProps) => {
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const { rating, rate } = useReflectionFeedback(reflection?.id ?? null);
  const meta = reflection ? reflectionMeta(reflection) : null;
  const paragraphs = reflection ? reflection.body.split('\n\n') : [];

  // Share one line, not the whole (intimate) reflection — quote-card psychology.
  // Every share is an organic ad written by the product itself.
  const handleShare = async () => {
    if (!meta) return;
    // The share sheet flips the app inactive/background without the user leaving
    // — suppress the biometric lock for the round trip (paywall-sheet pattern).
    const { openStoreSheet, closeStoreSheet } = useAppLockStore.getState();
    openStoreSheet();
    try {
      await Share.share({
        message: `“${meta.preview}”\n\n— ${t`my journal, via Reflect`} 🍂\nhttps://reflects.sytes.net/get`,
      });
    } catch {
      // sharing is best-effort
    } finally {
      closeStoreSheet();
    }
  };

  return (
    <Modal
      visible={!!reflection}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <YStack flex={1} bg="$background">
        <XStack
          justify="space-between"
          items="center"
          px="$4"
          style={{ paddingTop: insets.top + 8 }}
        >
          <BaseTouchable
            onPress={handleShare}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            px="$2"
            py="$1"
          >
            <LabelLg color="$accentBackground">
              <Trans>Share ↗</Trans>
            </LabelLg>
          </BaseTouchable>
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
          {reflection && meta ? (
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
                {meta.relKey === 'this-week' ? (
                  <Trans>This week</Trans>
                ) : meta.relKey === 'last-week' ? (
                  <Trans>Last week</Trans>
                ) : (
                  meta.dateLabel
                )}
              </HeadingLg>
              <LabelMd color="$text-disabled" mt="$1" mb="$6">
                {meta.rangeLabel} · <Trans>{reflection.entry_count} entries</Trans>
              </LabelMd>

              {paragraphs.map((p, i) => (
                <BodyLg key={i} color="$text-emphasis" mb="$4" style={{ lineHeight: 28 }}>
                  {p}
                </BodyLg>
              ))}

              {/* One-tap quality signal — content-free by design (no text input). */}
              {rating === null ? (
                <XStack items="center" gap="$3" mt="$2" mb="$2" flexWrap="wrap">
                  <LabelMd color="$text-disabled">
                    <Trans>Did this feel true to your week?</Trans>
                  </LabelMd>
                  <BaseTouchable
                    onPress={() => rate(true)}
                    bg="$surface-card"
                    rounded="$4"
                    px="$3"
                    py="$2"
                    borderWidth={1}
                    borderColor="$borderColor"
                  >
                    <LabelMd color="$accentBackground">
                      🍂 <Trans>Yes, deeply</Trans>
                    </LabelMd>
                  </BaseTouchable>
                  <BaseTouchable onPress={() => rate(false)} px="$2" py="$2">
                    <LabelMd color="$text-disabled">
                      <Trans>Not quite</Trans>
                    </LabelMd>
                  </BaseTouchable>
                </XStack>
              ) : (
                <LabelMd color="$text-disabled" mt="$2" mb="$2">
                  <Trans>Thanks — this helps the next one. 🍂</Trans>
                </LabelMd>
              )}
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
