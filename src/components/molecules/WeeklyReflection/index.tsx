import { useState } from 'react';
import { Modal } from 'react-native';
import Animated, { FadeOutUp } from 'react-native-reanimated';
import { YStack, XStack, Spinner } from 'tamagui';
import { HeadingMd, BodyMdBold, BodySm, LabelMd, LabelLg } from '@fonts';
import { BaseTouchable } from '@anicca-labs/ui-touchables';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  useRevenueCat,
  useToast,
  useReflections,
  useGenerateReflection,
  useMarkReflectionSeen,
  reflectionMeta,
  type Reflection,
} from '@hooks';
import { HEADING_LETTER_SPACING, LABEL_LETTER_SPACING, DISABLED_OPACITY } from '@constants';
import { ReflectionReadModal } from './ReflectionReadModal';

const FREE_LIMIT = 3;
// The generate-reflection function needs at least this many entries to reflect on.
const MIN_ENTRIES = 2;

// ── Pro upsell (shown when generation hits the free limit) ───────────────────
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
  reflection: Reflection;
  onPress: () => void;
}) => {
  const meta = reflectionMeta(reflection);
  return (
    <BaseTouchable
      onPress={onPress}
      bg="$surface-card"
      rounded="$4"
      p="$4"
      mb="$2"
      borderWidth={1}
      borderColor="$borderColor"
    >
      <XStack justify="space-between" items="center" mb="$2">
        <BodyMdBold color="$text-emphasis">
          {meta.relKey === 'this-week' ? (
            <Trans>This week</Trans>
          ) : meta.relKey === 'last-week' ? (
            <Trans>Last week</Trans>
          ) : (
            meta.dateLabel
          )}
        </BodyMdBold>
        <LabelMd color="$text-disabled">{meta.rangeLabel}</LabelMd>
      </XStack>
      <BodySm color="$text-secondary" numberOfLines={2}>
        {meta.preview}
      </BodySm>
      <LabelLg color="$accentBackground" mt="$3">
        <Trans>Read →</Trans>
      </LabelLg>
    </BaseTouchable>
  );
};

// ── The section shown at the top of the Reflections tab ──────────────────────
const WeeklyReflectionsSection = ({ entryCount = 0 }: { entryCount?: number }) => {
  const { data: reflections = [], isLoading } = useReflections();
  const { isPro } = useRevenueCat();
  const markSeen = useMarkReflectionSeen();
  const generate = useGenerateReflection();
  const { alert } = useToast();
  const { t } = useLingui();
  const [reading, setReading] = useState<Reflection | null>(null);
  const [upsellOpen, setUpsellOpen] = useState(false);

  const atLimit = !isPro && reflections.length >= FREE_LIMIT;
  const isEmpty = !isLoading && reflections.length === 0;
  const canGenerate = entryCount >= MIN_ENTRIES;

  const openReflection = (r: Reflection) => {
    setReading(r);
    if (!r.seen_at) markSeen.mutate(r.id);
  };

  // First reflection on demand — don't make a new user wait until Sunday. The
  // self-generate path also records consent (opts them into the weekly cron).
  const handleFirstReflection = async () => {
    const res = await generate.mutateAsync('recent').catch(() => null);
    if (!res || res.status === 'error') {
      alert({ title: t`Couldn't generate`, message: t`Please try again.`, preset: 'error' });
    } else if (res.status === 'not_enough') {
      alert({
        title: t`A little more to reflect on`,
        message: t`Write a couple of entries and I'll reflect on your week.`,
      });
    }
    // 'ok' → the query invalidates and the reflection appears above.
  };

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

      {isLoading && reflections.length === 0 ? (
        <YStack items="center" py="$4">
          <Spinner color="$accentBackground" />
        </YStack>
      ) : null}

      {/* First-run activation: explain the feature and let them get their first
          reflection now (which opts them in), instead of waiting for Sunday. */}
      {isEmpty ? (
        <YStack
          bg="$surface-card"
          rounded="$4"
          p="$4"
          borderWidth={1}
          borderColor="$borderColor"
          gap="$3"
        >
          <YStack gap="$1">
            <BodyMdBold color="$text-emphasis">
              <Trans>Get your first reflection</Trans>
            </BodyMdBold>
            <BodySm color="$text-secondary">
              <Trans>
                AI reads your week and writes it back to you — in your own words. 3 free.
              </Trans>
            </BodySm>
          </YStack>

          {canGenerate ? (
            <>
              <BaseTouchable
                onPress={handleFirstReflection}
                disabled={generate.isPending}
                opacity={generate.isPending ? DISABLED_OPACITY : 1}
                bg="$accentBackground"
                rounded="$4"
                p="$4"
                items="center"
              >
                {generate.isPending ? (
                  <Spinner color="$accentColor" />
                ) : (
                  <LabelLg color="$accentColor">
                    <Trans>Write my first reflection ✦</Trans>
                  </LabelLg>
                )}
              </BaseTouchable>
              <BodySm color="$text-disabled" style={{ lineHeight: 16 }}>
                <Trans>
                  Your entries are sent securely to our AI to write it — never shown to anyone,
                  never sold, never used to train AI.
                </Trans>
              </BodySm>
            </>
          ) : (
            <BodySm color="$text-disabled">
              <Trans>Write a couple of entries first, then your first reflection unlocks. 🍂</Trans>
            </BodySm>
          )}
        </YStack>
      ) : null}

      {reflections.map((r) => (
        <WeeklyReflectionCard key={r.id} reflection={r} onPress={() => openReflection(r)} />
      ))}

      {atLimit ? (
        <YStack mt="$3" gap="$3">
          <XStack items="center" gap="$2" px="$1">
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
          <BaseTouchable
            onPress={() => setUpsellOpen(true)}
            bg="$accentBackground"
            rounded="$4"
            p="$4"
            items="center"
          >
            <LabelLg color="$accentColor">
              <Trans>Unlock with Pro ✦</Trans>
            </LabelLg>
          </BaseTouchable>
        </YStack>
      ) : null}

      <ReflectionReadModal reflection={reading} onClose={() => setReading(null)} />
      <ReflectionUpsellModal visible={upsellOpen} onClose={() => setUpsellOpen(false)} />
    </YStack>
  );
};

// ── The "your week is ready" nudge card on the Journal home ──────────────────
const WeeklyReflectionBanner = () => {
  const { data: reflections = [] } = useReflections();
  const markSeen = useMarkReflectionSeen();
  const [reading, setReading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const latest = reflections[0];
  const show = !!latest && !latest.seen_at && !dismissed;

  const open = () => {
    setReading(true);
    if (latest && !latest.seen_at) markSeen.mutate(latest.id);
  };
  const dismiss = () => {
    setDismissed(true);
    if (latest && !latest.seen_at) markSeen.mutate(latest.id);
  };

  return (
    <>
      {show ? (
        <Animated.View exiting={FadeOutUp.duration(220)}>
          <BaseTouchable
            onPress={open}
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
                onPress={dismiss}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <LabelLg color="$text-disabled">✕</LabelLg>
              </BaseTouchable>
            </XStack>
          </BaseTouchable>
        </Animated.View>
      ) : null}

      <ReflectionReadModal
        reflection={reading && latest ? latest : null}
        onClose={() => setReading(false)}
      />
    </>
  );
};

export { WeeklyReflectionsSection, WeeklyReflectionBanner };
