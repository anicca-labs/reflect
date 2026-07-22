import { useState } from 'react';
import { Modal } from 'react-native';
import { YStack, XStack } from 'tamagui';
import { HeadingMd, BodyMdBold, BodySm, LabelMd, LabelLg } from '@fonts';
import { BaseTouchable } from '@anicca-labs/ui-touchables';
import { Trans } from '@lingui/react/macro';
import { useRevenueCat } from '@hooks';
import { HEADING_LETTER_SPACING, LABEL_LETTER_SPACING } from '@constants';
import { MOCK_WEEKLY_REFLECTIONS, type WeeklyReflection } from '@/src/data/mockWeeklyReflections';
import { ReflectionReadModal } from './ReflectionReadModal';

// ── Pro upsell (shown when a locked reflection is tapped) ────────────────────
const ReflectionUpsellModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const { presentPaywall } = useRevenueCat();

  const handleGoPro = async () => {
    await presentPaywall();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <YStack flex={1} justify="center" px="$4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <YStack
          bg="$surface-card"
          rounded="$6"
          p="$5"
          borderWidth={1}
          borderColor="$borderColor"
          gap="$4"
        >
          <YStack gap="$2">
            <HeadingMd color="$text-emphasis" letterSpacing={HEADING_LETTER_SPACING}>
              <Trans>You’ve read your 3 free reflections</Trans>
            </HeadingMd>
            <BodySm color="$text-secondary">
              <Trans>
                Reflect Pro gives you a new reflection every Sunday — plus your whole archive to
                look back on.
              </Trans>
            </BodySm>
          </YStack>

          <BaseTouchable
            onPress={handleGoPro}
            bg="$accentBackground"
            rounded="$4"
            p="$4"
            items="center"
          >
            <LabelLg color="$accentColor">
              <Trans>Go Pro ✦</Trans>
            </LabelLg>
          </BaseTouchable>

          <BaseTouchable onPress={onClose} py="$2" items="center">
            <LabelMd color="$text-secondary">
              <Trans>Not now</Trans>
            </LabelMd>
          </BaseTouchable>
        </YStack>
      </YStack>
    </Modal>
  );
};

// ── One card in the archive list ────────────────────────────────────────────
const WeeklyReflectionCard = ({
  reflection,
  onPress,
}: {
  reflection: WeeklyReflection;
  onPress: () => void;
}) => {
  const { locked } = reflection;
  return (
    <BaseTouchable
      onPress={onPress}
      bg="$surface-card"
      rounded="$4"
      p="$4"
      mb="$2"
      borderWidth={1}
      borderColor="$borderColor"
      opacity={locked ? 0.7 : 1}
    >
      <XStack justify="space-between" items="center" mb="$2">
        <BodyMdBold color="$text-emphasis">{reflection.relativeLabel}</BodyMdBold>
        {locked ? (
          <XStack bg="$accentBackground" rounded="$10" px="$2" py="$1" items="center" gap="$1">
            <LabelMd color="$accentColor">
              🔒 <Trans>Pro</Trans>
            </LabelMd>
          </XStack>
        ) : (
          <LabelMd color="$text-disabled">{reflection.rangeLabel}</LabelMd>
        )}
      </XStack>
      <BodySm color={locked ? '$text-disabled' : '$text-secondary'} numberOfLines={2}>
        {reflection.preview}
      </BodySm>
      {!locked ? (
        <LabelLg color="$accentBackground" mt="$3">
          <Trans>Read →</Trans>
        </LabelLg>
      ) : null}
    </BaseTouchable>
  );
};

// ── The section shown at the top of the Reflections tab ──────────────────────
const WeeklyReflectionsSection = () => {
  const [reading, setReading] = useState<WeeklyReflection | null>(null);
  const [upsellOpen, setUpsellOpen] = useState(false);

  const onCardPress = (r: WeeklyReflection) => {
    if (r.locked) setUpsellOpen(true);
    else setReading(r);
  };

  const freeCount = MOCK_WEEKLY_REFLECTIONS.filter((r) => !r.locked).length;

  return (
    <YStack mb="$7">
      <YStack mb="$4" gap="$1">
        <HeadingMd color="$text-emphasis" letterSpacing={HEADING_LETTER_SPACING}>
          🍂 <Trans>Weekly Reflections</Trans>
        </HeadingMd>
        <BodySm color="$text-disabled">
          <Trans>Every Sunday, a look back at your week — in your own words.</Trans>
        </BodySm>
      </YStack>

      {MOCK_WEEKLY_REFLECTIONS.map((r, i) => (
        <YStack key={r.id}>
          <WeeklyReflectionCard reflection={r} onPress={() => onCardPress(r)} />
          {i === freeCount - 1 ? (
            <XStack items="center" gap="$2" my="$3" px="$1">
              <YStack flex={1} height={1} bg="$borderColor" />
              <LabelMd
                color="$text-disabled"
                textTransform="uppercase"
                letterSpacing={LABEL_LETTER_SPACING}
              >
                <Trans>3 free · Pro unlocks the rest</Trans>
              </LabelMd>
              <YStack flex={1} height={1} bg="$borderColor" />
            </XStack>
          ) : null}
        </YStack>
      ))}

      <ReflectionReadModal reflection={reading} onClose={() => setReading(null)} />
      <ReflectionUpsellModal visible={upsellOpen} onClose={() => setUpsellOpen(false)} />
    </YStack>
  );
};

// ── The "your week is ready" nudge card on the Journal home ──────────────────
const WeeklyReflectionBanner = () => {
  const [dismissed, setDismissed] = useState(false);
  const [reading, setReading] = useState(false);
  const latest = MOCK_WEEKLY_REFLECTIONS[0];

  if (dismissed) return null;

  return (
    <>
      <BaseTouchable
        onPress={() => setReading(true)}
        bg="$surface-card"
        rounded="$4"
        p="$4"
        mb="$4"
        borderWidth={1}
        borderColor="$accentBackground"
      >
        <XStack justify="space-between" items="flex-start" gap="$3">
          <YStack flex={1} gap="$1">
            <BodyMdBold color="$text-emphasis">
              🍂 <Trans>Your week is ready</Trans>
            </BodyMdBold>
            <BodySm color="$text-secondary">
              <Trans>A look back at your last 7 days — tap to read.</Trans>
            </BodySm>
          </YStack>
          <BaseTouchable
            onPress={() => setDismissed(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <LabelLg color="$text-disabled">✕</LabelLg>
          </BaseTouchable>
        </XStack>
      </BaseTouchable>

      <ReflectionReadModal reflection={reading ? latest : null} onClose={() => setReading(false)} />
    </>
  );
};

export { WeeklyReflectionsSection, WeeklyReflectionBanner };
