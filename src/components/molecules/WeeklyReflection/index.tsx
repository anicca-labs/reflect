import { useEffect, useState } from 'react';
import { Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useSessionStore, useReflectionOpenStore, useAppLockStore } from '@/src/stores';
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
  useRatingsAsk,
  reflectionMeta,
  type Reflection,
} from '@hooks';
import { HEADING_LETTER_SPACING, LABEL_LETTER_SPACING, DISABLED_OPACITY } from '@constants';
import { refreshEntitlement } from '@/src/services/entitlements';
import { ReflectionReadModal } from './ReflectionReadModal';

// Keep in sync with FREE_REFLECTION_LIMIT in the generate-reflection edge fn —
// the server is the real gate, this only drives the UI.
const FREE_LIMIT = 4;
// The generate-reflection function needs at least this many entries to reflect on.
const MIN_ENTRIES = 2;

// ── Pro upsell (shown when generation hits the free limit) ───────────────────
const ReflectionUpsellModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const { presentPaywall } = useRevenueCat();
  // Native Modals render in their own window ABOVE the biometric lock overlay (a
  // plain positioned view). No journal content here, but its buttons would be
  // tappable without Face ID and it reads as broken floating over the lock. Same
  // gate as ReflectionReadModal/AnonMergeModal; state survives, reopens on unlock.
  const isLocked = useAppLockStore((s) => s.isLocked);
  const handleGoPro = async () => {
    const purchased = await presentPaywall('reflection-limit');
    // generate-reflection gates on api.entitlements, which the purchase hasn't
    // written yet — without this, generating right after paying returns 'limit' and
    // re-shows this very upsell to a paying user until the webhook lands.
    if (purchased) await refreshEntitlement();
    onClose();
  };
  return (
    <Modal
      visible={visible && !isLocked}
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
              <Trans>You’ve read your 4 free reflections</Trans>
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
  const { data: reflections = [], isLoading, isSuccess } = useReflections();
  const { isPro } = useRevenueCat();
  const isAnonymous = useSessionStore((s) => s.isAnonymous);
  const router = useRouter();
  const markSeen = useMarkReflectionSeen();
  const generate = useGenerateReflection();
  const { alert } = useToast();
  const { t } = useLingui();
  const [reading, setReading] = useState<Reflection | null>(null);
  const [upsellOpen, setUpsellOpen] = useState(false);

  const atLimit = !isPro && reflections.length >= FREE_LIMIT;
  // isSuccess, not !isLoading: this query is NOT persisted across launches, so on an
  // offline cold start it errors with no data — and "no data" was indistinguishable
  // from "never generated one", showing a Pro user with a whole archive the
  // first-run "Get your first reflection ✦" pitch. Guests keep the pitch (their
  // query is disabled, so isSuccess never fires, and the card is their signup path).
  const isEmpty = isAnonymous ? true : isSuccess && reflections.length === 0;
  const canGenerate = entryCount >= MIN_ENTRIES;
  const { maybeAsk: maybeAskRating } = useRatingsAsk();
  // Days until the next Sunday delivery (0 = today is Sunday).
  const daysToSunday = (7 - new Date().getDay()) % 7;

  const openReflection = (r: Reflection) => {
    setReading(r);
    if (!r.seen_at) markSeen.mutate(r.id);
  };

  // First reflection on demand — don't make a new user wait until Sunday. The
  // self-generate path also records consent (opts them into the weekly cron).
  const handleFirstReflection = async () => {
    // Guest entries live on-device only — the AI needs them server-side, so the
    // path to a first reflection runs through creating an account (entries merge
    // on sign-in). Without this, the call would just 401.
    if (isAnonymous) {
      router.push('/sign-in');
      return;
    }
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
        {/* The ritual made visible between Sundays — anticipation is the hook.
            Hidden once they're at the free limit: the Sunday cron skips them, so
            promising a delivery would be a lie told directly above the Pro CTA. */}
        {reflections.length > 0 && !atLimit ? (
          <BodySm color="$accentBackground" mt="$1">
            {daysToSunday === 0 ? (
              <Trans>Your next reflection arrives today 🍂</Trans>
            ) : daysToSunday === 1 ? (
              <Trans>Your next reflection arrives tomorrow 🍂</Trans>
            ) : (
              <Trans>Your next reflection arrives Sunday — in {daysToSunday} days 🍂</Trans>
            )}
          </BodySm>
        ) : null}
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
                AI reads your week and writes it back to you — in your own words. 4 free.
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
                {isAnonymous ? (
                  <Trans>
                    Takes a minute — a free account brings your entries with you, private as always.
                  </Trans>
                ) : (
                  <Trans>
                    Your entries are sent securely to our AI to write it — never shown to anyone,
                    never sold, never used to train AI.
                  </Trans>
                )}
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
              <Trans>4 free · Pro unlocks the rest</Trans>
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

      <ReflectionReadModal
        reflection={reading}
        onClose={() => {
          setReading(null);
          // The moment right after reading a reflection is the app's warmest —
          // the (once-ever) rating ask lands here.
          maybeAskRating();
        }}
      />
      <ReflectionUpsellModal visible={upsellOpen} onClose={() => setUpsellOpen(false)} />
    </YStack>
  );
};

// ── The "your week is ready" nudge card on the Journal home ──────────────────
const WeeklyReflectionBanner = () => {
  const { data: reflections = [] } = useReflections();
  const markSeen = useMarkReflectionSeen();
  const { maybeAsk: maybeAskRating } = useRatingsAsk();
  const [reading, setReading] = useState(false);
  // Keyed to the reflection, not a bare boolean: dismissing must hide THIS week's
  // banner, not suppress every future one. As a boolean it silenced the banner for
  // the rest of the session, so a reflection arriving later (Sunday's push, or one
  // generated while the app is open) had nowhere to surface.
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const latest = reflections[0];
  const show = !!latest && !latest.seen_at && dismissedId !== latest.id;

  // A tapped "your week is ready" push lands here. The modal's open-state is
  // DERIVED from the store flag (not copied into local state) so it survives
  // the cold-start churn behind the biometric lock — auth settling can remount
  // this component, and a consumed-flag-plus-lost-local-state would leave the
  // user on a bare Journal. The flag is only cleared when the reflection is
  // explicitly closed.
  const pendingReflectionOpen = useReflectionOpenStore((s) => s.pendingReflectionOpen);
  const setPendingReflectionOpen = useReflectionOpenStore((s) => s.setPendingReflectionOpen);
  const openedFromPush = pendingReflectionOpen && !!latest;
  useEffect(() => {
    if (openedFromPush && latest && !latest.seen_at) markSeen.mutate(latest.id);
    // markSeen is a stable mutation object from React Query; depending on it
    // would re-run the effect every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedFromPush, latest?.id]);

  const open = () => {
    setReading(true);
    if (latest && !latest.seen_at) markSeen.mutate(latest.id);
  };
  const dismiss = () => {
    if (!latest) return;
    setDismissedId(latest.id);
    if (!latest.seen_at) markSeen.mutate(latest.id);
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
        reflection={(reading || openedFromPush) && latest ? latest : null}
        onClose={() => {
          setReading(false);
          setPendingReflectionOpen(false);
          maybeAskRating();
        }}
      />
    </>
  );
};

export { WeeklyReflectionsSection, WeeklyReflectionBanner };
