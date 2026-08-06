import { useEffect, useRef, useState } from 'react';
import { Modal, Share, View, Text } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView, YStack, XStack } from 'tamagui';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { HeadingLg, BodyLg, LabelMd, LabelLg } from '@fonts';
import { BaseTouchable } from '@anicca-labs/ui-touchables';
import { Trans, useLingui } from '@lingui/react/macro';
import { HEADING_LETTER_SPACING, LABEL_LETTER_SPACING } from '@constants';
import { reflectionMeta, useReflectionFeedback, type Reflection } from '@hooks';
import { useAppLockStore } from '@/src/stores';
import { supabase } from '@/src/services/supabase';

// Metadata-only share signal: does anyone actually share? Answering that is what
// justifies (or kills) the richer image quote-card, which costs a store release.
// The shared preview is reflection content and is deliberately NOT recorded.
const logShareTap = () => {
  supabase.auth
    .getSession()
    .then(({ data: { session } }) => {
      const userId = session?.user?.id;
      if (!userId) return; // guests can't write (RLS) — same blind spot as paywall_views
      return supabase.from('share_taps').insert({ user_id: userId, source: 'reflection' });
    })
    .then(() => {})
    .catch(() => {});
};

interface ReflectionReadModalProps {
  reflection: Reflection | null;
  onClose: () => void;
  // The "Write what it stirs" CTA — in the real feature this drops into the
  // composer; here it just closes.
  onWrite?: () => void;
}

// 9:16 quote card, captured offscreen at 3x (≈1080×1920) for story-sized shares.
// Fixed warm palette — shares should look consistent regardless of app theme.
const CARD_W = 360;
const CARD_H = 640;
const CARD_BG = '#F7F2EA';
const CARD_INK = '#3B322A';
const CARD_SOFT = '#8A7B6B';
const CARD_ACCENT = '#C4631A';

// Full-screen, calm read of one weekly reflection. The reveal deserves space —
// its own surface, not a cramped list row.
const ReflectionReadModal = ({ reflection, onClose, onWrite }: ReflectionReadModalProps) => {
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const isLocked = useAppLockStore((s) => s.isLocked);
  const { rating, rate } = useReflectionFeedback(reflection?.id ?? null);
  // The "thanks" acknowledgement is a moment, not a fixture: shown ~3s right
  // after tapping, then gone. Already-rated reflections show nothing on reopen.
  const [justRated, setJustRated] = useState(false);
  useEffect(() => {
    if (!justRated) return;
    const timer = setTimeout(() => setJustRated(false), 3000);
    return () => clearTimeout(timer);
  }, [justRated]);
  const handleRate = (feltTrue: boolean) => {
    rate(feltTrue);
    setJustRated(true);
  };
  const cardRef = useRef<View>(null);
  const meta = reflection ? reflectionMeta(reflection) : null;
  const paragraphs = reflection ? reflection.body.split('\n\n') : [];

  // Share one line, not the whole (intimate) reflection — quote-card psychology.
  // Every share is an organic ad written by the product itself. Image card when
  // capture/sharing are available; text with the link otherwise.
  const handleShare = async () => {
    if (!meta) return;
    logShareTap();
    // The share sheet flips the app inactive/background without the user leaving
    // — suppress the biometric lock for the round trip (paywall-sheet pattern).
    const { openStoreSheet, closeStoreSheet } = useAppLockStore.getState();
    openStoreSheet();
    try {
      if (await Sharing.isAvailableAsync()) {
        const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
        await Sharing.shareAsync(uri.startsWith('file://') ? uri : `file://${uri}`, {
          mimeType: 'image/png',
          dialogTitle: 'Reflect',
        });
        return;
      }
      throw new Error('image sharing unavailable');
    } catch {
      // Any capture/share failure → plain text share, never a dead button.
      await Share.share({
        message: `“${meta.preview}”\n\n— ${t`my journal, via Reflect`} 🍂\nhttps://reflects.sytes.net/get`,
      }).catch(() => {});
    } finally {
      closeStoreSheet();
    }
  };

  return (
    <Modal
      // A native Modal renders in its own window ABOVE the biometric lock overlay
      // (which is a plain absolutely-positioned view, see BiometricLockOverlay), so
      // leaving it visible while locked would show the reflection — written verbatim
      // from the user's entries — to whoever picked up the phone, and put it in the
      // app-switcher snapshot. Hide it while locked; the modal state itself survives,
      // so it reopens on unlock.
      visible={!!reflection && !isLocked}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <YStack flex={1} bg="$background">
        {/* Offscreen quote card for image sharing — rendered but invisible.
            collapsable={false} is required for captureRef on Android. */}
        {meta ? (
          <View
            ref={cardRef}
            collapsable={false}
            style={{
              position: 'absolute',
              left: -9999,
              width: CARD_W,
              height: CARD_H,
              backgroundColor: CARD_BG,
              paddingHorizontal: 36,
              paddingVertical: 48,
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ fontSize: 13, letterSpacing: 2, color: CARD_ACCENT }}>
              🍂 {t`Weekly reflection`.toUpperCase()}
            </Text>
            <Text
              style={{
                fontSize: 30,
                lineHeight: 44,
                color: CARD_INK,
                fontWeight: '600',
              }}
            >
              “{meta.preview}”
            </Text>
            <View>
              <Text style={{ fontSize: 15, color: CARD_SOFT, marginBottom: 6 }}>
                — {t`my journal, via Reflect`}
              </Text>
              <Text style={{ fontSize: 13, color: CARD_ACCENT }}>reflects.sytes.net/get</Text>
            </View>
          </View>
        ) : null}

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
                    onPress={() => handleRate(true)}
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
                  <BaseTouchable onPress={() => handleRate(false)} px="$2" py="$2">
                    <LabelMd color="$text-disabled">
                      <Trans>Not quite</Trans>
                    </LabelMd>
                  </BaseTouchable>
                </XStack>
              ) : justRated ? (
                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(400)}>
                  <LabelMd color="$text-disabled" mt="$2" mb="$2">
                    <Trans>Thanks — this helps the next one. 🍂</Trans>
                  </LabelMd>
                </Animated.View>
              ) : null}
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
