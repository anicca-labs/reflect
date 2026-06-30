import { useState, useRef, useCallback, useEffect, type ComponentRef } from 'react';
import { Alert, Keyboard, Linking, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { BlurTargetView } from 'expo-blur';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScrollView, YStack, XStack, TextArea, Spinner, useTheme } from 'tamagui';
import { DisplayLg, BodySm, LabelMd, LabelLg } from '@fonts';
import { Trans, useLingui } from '@lingui/react/macro';
import { BaseTouchable } from '@ksairi-org/ui-touchables';
import { Containers } from '@ksairi-org/ui-containers';
import { sizes } from '@theme';
import { format } from 'date-fns';
import { getDateLocale, formatEntryTime } from '@/src/utils/date';
import {
  usePreferencesStore,
  useSwipeableStore,
  useSessionStore,
  useAnonymousJournalStore,
  usePendingJournalStore,
} from '@/src/stores';
import type { JournalEntry } from '@/src/types/journal';
import { logJournalEntryCreated, logScreenView } from '@analytics';
import {
  useJournalEntries,
  useCreateJournalEntry,
  useDeleteJournalEntry,
  useToggleBookmark,
  useRevenueCat,
  useToast,
  useStreak,
  getDailyPromptIndex,
  useVoiceToText,
} from '@hooks';
import {
  HEADING_LETTER_SPACING,
  LABEL_LETTER_SPACING,
  DISABLED_OPACITY,
  PAYWALL_SUCCESS_ALERT_DURATION,
} from '@constants';
import {
  AnimatedEntry,
  SwipeableDeleteWrapper,
  EntryPeekModal,
  type SwipeableDeleteWrapperHandle,
} from '@molecules';
import { BaseIcon } from '@/src/components/atoms/icons';

const formatDateHeading = (iso: string) =>
  format(new Date(iso), 'EEEE, MMMM d', { locale: getDateLocale() });

const isToday = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
};

const TRUNCATE_LENGTH = 250;
const STREAK_LETTER_SPACING = -0.3;

interface EntryCardProps {
  entry: JournalEntry;
  index: number;
  onDelete: (id: string) => void;
  onPeek: (entry: JournalEntry) => void;
  closeKey: number;
}

const EntryCard = ({ entry, index, onDelete, onPeek, closeKey }: EntryCardProps) => {
  const timeFormat = usePreferencesStore((s) => s.timeFormat);
  const swipeRef = useRef<SwipeableDeleteWrapperHandle>(null);
  const isTruncated = entry.content.length > TRUNCATE_LENGTH;
  const displayContent = isTruncated
    ? entry.content.slice(0, TRUNCATE_LENGTH) + '…'
    : entry.content;

  return (
    <SwipeableDeleteWrapper
      ref={swipeRef}
      entryId={entry.id}
      onDelete={onDelete}
      closeKey={closeKey}
      index={index}
    >
      <BaseTouchable
        onPress={() => onPeek(entry)}
        onLongPress={() => swipeRef.current?.open()}
        bg="$surface-card"
        rounded="$4"
        p="$4"
        borderWidth={1}
        borderColor="$borderColor"
      >
        <BodySm color="$text-emphasis" mb="$3">
          {displayContent}
        </BodySm>
        <LabelMd color="$text-disabled">
          {formatEntryTime(entry.created_at, timeFormat === '24h')}
        </LabelMd>
      </BaseTouchable>
    </SwipeableDeleteWrapper>
  );
};

const FREE_ENTRY_LIMIT = 7;

const JournalScreen = () => {
  const [draft, setDraft] = useState('');
  const [closeKey, setCloseKey] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [peekEntryId, setPeekEntryId] = useState<string | null>(null);

  const handlePeek = (entry: JournalEntry) => {
    setCloseKey((k) => k + 1);
    setPeekEntryId(entry.id);
  };
  const blurTargetRef = useRef<View>(null);
  const hasAnimated = useRef(false);
  const router = useRouter();

  const { isAnonymous } = useSessionStore();
  const {
    entries: localEntries,
    addEntry: addLocalEntry,
    deleteEntry: deleteLocalEntry,
  } = useAnonymousJournalStore();
  // Authenticated entries saved offline, awaiting sync. Shown above server
  // entries so the user sees their writing immediately, even after a restart.
  const pendingEntries = usePendingJournalStore((s) => s.entries);
  const removePendingEntry = usePendingJournalStore((s) => s.remove);
  const togglePendingBookmark = usePendingJournalStore((s) => s.toggleBookmark);

  const { data: serverEntries = [], isLoading: serverLoading, refetch } = useJournalEntries();
  const createMutation = useCreateJournalEntry();
  const deleteMutation = useDeleteJournalEntry();
  const toggleBookmarkMutation = useToggleBookmark();
  const { isPro, presentPaywall } = useRevenueCat();
  const { t } = useLingui();
  const { alert } = useToast();
  const inputRef = useRef<ComponentRef<typeof TextArea>>(null);

  // Voice transcripts arrive without terminal punctuation, so close the
  // dictated draft with a period when it doesn't already end in punctuation.
  const withClosingPunctuation = (text: string) => {
    const trimmed = text.trimEnd();
    if (!trimmed || /[.!?,;:]$/.test(trimmed)) return trimmed;
    return trimmed + '.';
  };

  const handleStopListening = () => {
    stopListening();
    setDraft(withClosingPunctuation);
  };

  const {
    isListening,
    start: startListening,
    stop: stopListening,
    clear: clearListening,
  } = useVoiceToText({
    onResult: (transcript, replaces) => {
      setDraft((prev) => {
        if (replaces) {
          const idx = prev.lastIndexOf(replaces);
          if (idx !== -1) return prev.slice(0, idx) + transcript;
        }
        const separator = prev.trim().length > 0 ? ' ' : '';
        return prev + separator + transcript;
      });
    },
    onError: (message) => alert({ title: t`Voice recognition failed`, message, preset: 'error' }),
    onPermissionDenied: () =>
      Alert.alert(
        t`Microphone access required`,
        t`To use voice input, enable microphone access for Reflect in Settings.`,
        [
          { text: t`Cancel`, style: 'cancel' },
          { text: t`Open Settings`, onPress: () => Linking.openSettings() },
        ],
      ),
  });

  const theme = useTheme();
  const ringScale = useSharedValue(0);
  const ringOpacity = useSharedValue(0);

  useSpeechRecognitionEvent('volumechange', (event) => {
    const vol = Math.max(0, (event.value + 2) / 12);
    ringScale.value = withSpring(1 + vol * 0.7, { damping: 10, stiffness: 180 });
  });

  useEffect(() => {
    // Reanimated shared values are mutated via `.value` by design; the
    // immutability rule flags this as a false positive for the listening ring.
    /* eslint-disable react-hooks/immutability */
    if (isListening) {
      ringScale.value = withSpring(1, { damping: 10 });
      ringOpacity.value = withRepeat(
        withSequence(withTiming(0.35, { duration: 700 }), withTiming(0.15, { duration: 700 })),
        -1,
        true,
      );
    } else {
      cancelAnimation(ringScale);
      cancelAnimation(ringOpacity);
      ringScale.value = withTiming(0, { duration: 200 });
      ringOpacity.value = withTiming(0, { duration: 200 });
    }
    /* eslint-enable react-hooks/immutability */
  }, [isListening, ringScale, ringOpacity]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const handleClearDraft = () => {
    setDraft('');
    // Discard any in-flight dictation too, so the cleared words aren't re-prefixed to
    // the next utterance while recording continues.
    clearListening();
  };

  // Once a pending entry syncs, its server row (same id) lands in the cache.
  // Drop the pending copy so the list keeps a single, stable-keyed element —
  // React updates it in place instead of remounting, so there's no flicker.
  const serverIds = new Set(serverEntries.map((e) => e.id));
  const unsyncedEntries = pendingEntries.filter((e) => !serverIds.has(e.id));
  const pendingIds = new Set(unsyncedEntries.map((e) => e.id));
  const entries = isAnonymous ? localEntries : [...unsyncedEntries, ...serverEntries];
  const loading = isAnonymous ? false : serverLoading;
  const peekEntry = peekEntryId ? (entries.find((e) => e.id === peekEntryId) ?? null) : null;

  useFocusEffect(
    useCallback(() => {
      if (!hasAnimated.current) {
        hasAnimated.current = true;
        setAnimKey(1);
      }
      if (!isAnonymous) refetch();
      logScreenView('Journal');
      return () => {
        setCloseKey((k) => k + 1);
        // Stop dictation when leaving the screen (tabs stay mounted with lazy:false,
        // so without this the mic keeps recording in the background).
        stopListening();
      };
    }, [refetch, isAnonymous, stopListening]),
  );

  const hasOpenCard = useSwipeableStore((s) => s.activeDragCount > 0);
  const dismissOpenCard = () => {
    if (hasOpenCard) setCloseKey((k) => k + 1);
  };
  // Tap-outside handler for areas that do NOT contain the TextArea (header, entries list).
  // Putting this on the input's own ancestor would dismiss the keyboard mid-typing.
  const dismissOutside = () => {
    Keyboard.dismiss();
    dismissOpenCard();
  };

  const todayEntries = entries.filter((e) => isToday(e.created_at));
  const streak = useStreak(entries);
  const prompts = [
    t`What's on your mind?`,
    t`What made you smile today?`,
    t`What are you grateful for today?`,
    t`What's one thing you want to remember about today?`,
    t`What are you avoiding?`,
    t`What would make today a good day?`,
    t`How are you really feeling right now?`,
    t`What would you tell your past self today?`,
    t`What's something small that brought you joy recently?`,
  ];
  const prompt = prompts[getDailyPromptIndex(prompts.length)];
  const hasContent = draft.trim().length > 0;
  const remainingFree = Math.max(0, FREE_ENTRY_LIMIT - entries.length);
  const atLimit = !isPro && entries.length >= FREE_ENTRY_LIMIT;
  const showHint =
    !isPro && entries.length >= FREE_ENTRY_LIMIT - 2 && entries.length < FREE_ENTRY_LIMIT;

  const handleSave = async () => {
    // Saving mid-dictation: close the transcript with punctuation before
    // stopping, matching what the mic-button stop does.
    const source = isListening ? withClosingPunctuation(draft) : draft;
    if (isListening) stopListening();
    const trimmed = source.trim();
    if (!trimmed) return;

    if (atLimit) {
      if (isAnonymous) {
        // Anonymous user hit the limit — send them to sign up for Pro
        router.push('/sign-in');
        return;
      }
      const purchased = await presentPaywall();
      if (!purchased) return;
      alert({
        title: t`Welcome to Pro ✦`,
        message: t`Unlimited entries unlocked. Keep writing.`,
        duration: PAYWALL_SUCCESS_ALERT_DURATION,
      });
    }

    setDraft('');
    Keyboard.dismiss();

    if (isAnonymous) {
      addLocalEntry(trimmed);
      logJournalEntryCreated(trimmed.split(/\s+/).length);
      return;
    }

    try {
      const { queued } = await createMutation.mutateAsync(trimmed);
      logJournalEntryCreated(trimmed.split(/\s+/).length);
      if (queued) {
        alert({
          title: t`Saved offline`,
          message: t`This entry will sync automatically when you're back online.`,
        });
      }
    } catch {
      // Unexpected (non-network) failure — restore the draft so the user's
      // writing isn't lost, and let them retry.
      setDraft(trimmed);
      alert({
        title: t`Couldn't save entry`,
        message: t`Something went wrong. Please try again.`,
        preset: 'error',
      });
    }
  };

  const handleDelete = (id: string) => {
    if (isAnonymous) {
      deleteLocalEntry(id);
    } else if (pendingIds.has(id)) {
      // Not on the server yet — just drop it from the offline outbox.
      removePendingEntry(id);
    } else {
      deleteMutation.mutate(id);
    }
  };

  return (
    <Containers.Screen shouldAutoResize={false}>
      <BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
        <YStack flex={1}>
          <YStack p="$5" pb="$4" onTouchStart={dismissOpenCard}>
            {/* Header sits outside the TextArea, so tapping it dismisses the keyboard. */}
            <YStack onTouchStart={dismissOutside}>
              <LabelMd
                color="$text-disabled"
                mb="$1"
                textTransform="uppercase"
                letterSpacing={LABEL_LETTER_SPACING}
              >
                {formatDateHeading(new Date().toISOString())}
              </LabelMd>
              <XStack justify="space-between" items="flex-end" mb="$6">
                <DisplayLg color="$text-emphasis" letterSpacing={HEADING_LETTER_SPACING}>
                  <Trans>Journal</Trans>
                </DisplayLg>
                {streak > 0 ? (
                  <YStack items="flex-end">
                    <LabelMd color="$accentBackground" letterSpacing={STREAK_LETTER_SPACING}>
                      {streak}{' '}
                      {streak === 1 ? <Trans>day streak</Trans> : <Trans>days streak</Trans>} 🔥
                    </LabelMd>
                  </YStack>
                ) : null}
              </XStack>
            </YStack>

            <YStack
              bg="$surface-card"
              rounded="$4"
              borderWidth={1}
              borderColor="$borderColor"
              mb="$4"
            >
              <TextArea
                ref={inputRef}
                value={draft}
                onChangeText={setDraft}
                placeholder={prompt}
                minH={sizes['3xl']}
                bg="$background0"
                borderWidth={0}
                focusStyle={{ outlineWidth: 0 }}
                fontSize="$3"
                color="$text-emphasis"
              />
              <XStack justify="space-between" items="center" px="$3" pb="$3">
                {hasContent ? (
                  <BaseTouchable onPress={handleClearDraft} rounded="$full" p="$2" hitSlop={12}>
                    <BaseIcon iconName="iconTrash" color="$text-disabled" width={16} height={16} />
                  </BaseTouchable>
                ) : (
                  <View />
                )}
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <Animated.View
                    style={[
                      {
                        position: 'absolute',
                        width: 52,
                        height: 52,
                        borderRadius: 26,
                        backgroundColor: theme.accentBackground?.val,
                      },
                      ringStyle,
                    ]}
                  />
                  <BaseTouchable
                    onPress={isListening ? handleStopListening : startListening}
                    bg={isListening ? '$accentBackground' : '$surface-subtle'}
                    rounded="$full"
                    p="$2"
                    hitSlop={12}
                  >
                    <BaseIcon
                      iconName="iconMic"
                      color={isListening ? '$accentColor' : '$text-disabled'}
                      width={18}
                      height={18}
                    />
                  </BaseTouchable>
                </View>
              </XStack>
            </YStack>

            {/* Below the textbox: tapping here (incl. the disabled Save button or hints)
                dismisses the keyboard. Wrapped separately so it doesn't include the TextArea. */}
            <YStack onTouchStart={dismissOutside}>
              <BaseTouchable
                onPress={handleSave}
                disabled={!hasContent || createMutation.isPending}
                bg="$accentBackground"
                opacity={hasContent ? 1 : DISABLED_OPACITY}
                rounded="$4"
                py="$3"
                items="center"
                alignSelf="stretch"
                mb={showHint || atLimit ? '$2' : '$0'}
              >
                {createMutation.isPending ? (
                  <Spinner color="$accentColor" />
                ) : (
                  <LabelLg color="$accentColor">
                    {atLimit ? <Trans>Save entry ✦</Trans> : <Trans>Save entry</Trans>}
                  </LabelLg>
                )}
              </BaseTouchable>

              {showHint ? (
                <BodySm color="$text-disabled" text="center" mt="$2">
                  {isAnonymous ? (
                    remainingFree === 1 ? (
                      <Trans>1 free entry left — sign up to keep writing</Trans>
                    ) : (
                      <Trans>{remainingFree} free entries left — sign up to keep writing</Trans>
                    )
                  ) : remainingFree === 1 ? (
                    <Trans>1 free entry left — upgrade to keep writing</Trans>
                  ) : (
                    <Trans>{remainingFree} free entries left — upgrade to keep writing</Trans>
                  )}
                </BodySm>
              ) : null}

              {atLimit ? (
                <BodySm color="$accentBackground" text="center" mt="$2">
                  {isAnonymous ? (
                    <Trans>Entry limit reached — sign up for Pro to keep writing</Trans>
                  ) : (
                    <Trans>Entry limit reached — upgrade to keep writing</Trans>
                  )}
                </BodySm>
              ) : null}
            </YStack>
          </YStack>

          {/* NOTE: contentContainerStyle on ScrollView requires a plain style object */}
          <ScrollView
            flex={1}
            contentContainerStyle={{ paddingHorizontal: sizes.xl, paddingBottom: sizes.xl }}
            keyboardShouldPersistTaps="handled"
            onTouchStart={dismissOutside}
          >
            {loading && !todayEntries.length ? (
              <YStack items="center" mt="$4">
                <Spinner color="$accentBackground" />
              </YStack>
            ) : null}

            {todayEntries.length > 0 ? (
              <YStack gap="$3">
                <LabelMd
                  color="$text-disabled"
                  textTransform="uppercase"
                  letterSpacing={LABEL_LETTER_SPACING}
                >
                  {todayEntries.length === 1 ? (
                    <Trans>Today · 1 entry</Trans>
                  ) : (
                    <Trans>Today · {todayEntries.length} entries</Trans>
                  )}
                </LabelMd>
                {todayEntries.map((entry, index) => (
                  <AnimatedEntry key={entry.id} index={index} animKey={animKey}>
                    <EntryCard
                      entry={entry}
                      index={index}
                      onDelete={handleDelete}
                      onPeek={handlePeek}
                      closeKey={closeKey}
                    />
                  </AnimatedEntry>
                ))}
              </YStack>
            ) : null}
          </ScrollView>
        </YStack>
      </BlurTargetView>
      <EntryPeekModal
        entry={peekEntry}
        onClose={() => setPeekEntryId(null)}
        blurTargetRef={blurTargetRef}
        onToggleBookmark={
          isAnonymous
            ? undefined
            : (id, current) =>
                pendingIds.has(id)
                  ? togglePendingBookmark(id)
                  : toggleBookmarkMutation.mutate({ id, is_bookmarked: !current })
        }
      />
    </Containers.Screen>
  );
};

export { JournalScreen };
