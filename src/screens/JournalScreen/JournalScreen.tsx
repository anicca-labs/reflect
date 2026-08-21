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
import { useFocusEffect, useRouter, useIsFocused } from 'expo-router';
import { ScrollView, YStack, XStack, TextArea, Spinner, useTheme } from 'tamagui';
import { DisplayLg, BodySm, BodyMdBold, LabelMd, LabelLg } from '@fonts';
import { Trans, useLingui } from '@lingui/react/macro';
import { BaseTouchable } from '@anicca-labs/ui-touchables';
import { Containers } from '@anicca-labs/ui-containers';
import { sizes } from '@theme';
import { format } from 'date-fns';
import { getDateLocale, formatEntryTime } from '@/src/utils/date';
import {
  usePreferencesStore,
  useSwipeableStore,
  useSessionStore,
  useAnonymousJournalStore,
  usePendingJournalStore,
  usePendingDeletionsStore,
  usePendingBookmarksStore,
  useComposeStore,
  useAppLockStore,
} from '@/src/stores';
import type { JournalEntry } from '@/src/types/journal';
import { isOnline } from '@/src/services/network';
import { refreshEntitlement } from '@/src/services/entitlements';
import { logJournalEntryCreated, logScreenView } from '@analytics';
import { markFirstEntryWritten } from '@/src/services/user-devices';
import { isFreeLimitError } from '@/src/services/journalSync';
import { requestTrackingConsent } from '@meta';
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
  useReminderPrompt,
  useEntryEcho,
  useOtaUpdate,
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
  ReminderPromptModal,
  WeeklyReflectionBanner,
  EntryEchoCards,
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

// Keep in sync with api.enforce_free_entry_limit (migration 20260821000000) —
// the trigger is the authoritative gate; this only drives the UX.
const FREE_ENTRY_LIMIT = 30;

// How long the save button may stay blocked waiting for the server entry count
// before giving up and letting the save through (the DB trigger enforces the
// limit regardless). Long enough for a normal cold fetch, short enough that it
// never reads as a frozen app.
const COUNT_GUARD_TIMEOUT_MS = 5000;

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

  const { isAnonymous, setProIntent, proIntent, pendingMerge } = useSessionStore();
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
  const { isPro, isLoading: rcLoading, presentPaywall } = useRevenueCat();
  const { t } = useLingui();
  const { alert } = useToast();
  // Offers a daily reminder after an entry is saved — self-gates to fire only once, and
  // never for someone who already has one set.
  const {
    visible: reminderPromptVisible,
    suggested: suggestedReminderTime,
    maybePrompt: maybePromptReminder,
    dismiss: dismissReminderPrompt,
  } = useReminderPrompt();
  const echo = useEntryEcho();
  const inputRef = useRef<ComponentRef<typeof TextArea>>(null);

  // Auto-present the paywall for a user who tapped "Sign in for Pro" while
  // anonymous. The intent survived the sign-in round trip; now that they've
  // landed on the journal, honour it instead of dropping it silently.
  //
  // Gated so it never collides with the anonymous→account merge: an over-limit
  // user gets the merge modal (whose "Keep everything ✦" IS the Pro path), and
  // while reconciliation is still in flight the anonymous store is non-empty —
  // both cases hold `localEntries.length > 0` / `pendingMerge`, so we wait. Once
  // the store is empty and no merge is pending, the Pro intent stands alone.
  useEffect(() => {
    if (!proIntent || rcLoading || isPro || isAnonymous) return;
    if (pendingMerge || localEntries.length > 0) return;

    setProIntent(false); // one-shot: flip before the async so it can't re-fire
    (async () => {
      const purchased = await presentPaywall('pro-intent');
      if (!purchased) return;
      await refreshEntitlement();
      alert({
        title: t`Welcome to Pro ✦`,
        message: t`Unlimited entries unlocked. Keep writing.`,
        duration: PAYWALL_SUCCESS_ALERT_DURATION,
      });
    })();
  }, [
    proIntent,
    rcLoading,
    isPro,
    isAnonymous,
    pendingMerge,
    localEntries.length,
    setProIntent,
    presentPaywall,
    alert,
    t,
  ]);

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
  // Hide rows the user deleted offline; the tombstone outlives a server refetch
  // so they can't reappear before the delete reaches the server. Apply pending
  // bookmark toggles over the server rows so the star can't flicker on refetch.
  const deletedIds = usePendingDeletionsStore((s) => s.ids);
  const bookmarkPatches = usePendingBookmarksStore((s) => s.values);
  const tombstoned = new Set(deletedIds);
  const visibleServerEntries = serverEntries
    .filter((e) => !tombstoned.has(e.id))
    .map((e) => (e.id in bookmarkPatches ? { ...e, is_bookmarked: bookmarkPatches[e.id] } : e));
  const serverIds = new Set(visibleServerEntries.map((e) => e.id));
  const unsyncedEntries = pendingEntries.filter((e) => !serverIds.has(e.id));
  const pendingIds = new Set(unsyncedEntries.map((e) => e.id));
  const entries = isAnonymous ? localEntries : [...unsyncedEntries, ...visibleServerEntries];
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

  // A tapped daily-reminder routes here and sets pendingCompose; focus the composer
  // once the Journal is the active tab so the user lands ready to write. Clear the
  // flag so it fires once; the short delay lets the tab transition settle before the
  // keyboard opens.
  const pendingCompose = useComposeStore((s) => s.pendingCompose);
  const setPendingCompose = useComposeStore((s) => s.setPendingCompose);
  const isScreenFocused = useIsFocused();
  useEffect(() => {
    if (!pendingCompose || !isScreenFocused) return;
    setPendingCompose(false);
    const timer = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, [pendingCompose, isScreenFocused, setPendingCompose]);

  // First-run activation: drop a brand-new guest with an empty journal straight
  // into a ready-to-type composer so writing entry #1 is zero-friction. Fires once
  // per launch and only while the journal is still empty, so it never nags an
  // established writer.
  const didFirstRunFocus = useRef(false);
  // Wait for the splash to fully fade before focusing. The keyboard renders in its
  // own native window ABOVE the splash overlay, so focusing at +400ms had it visibly
  // sliding up over the Rive animation mid-fade on every fresh install — the app's
  // literal first frame looked broken.
  const splashComplete = useAppLockStore((s) => s.splashComplete);
  useEffect(() => {
    if (didFirstRunFocus.current || !isScreenFocused || !splashComplete) return;
    if (!isAnonymous || entries.length > 0) return;
    didFirstRunFocus.current = true;
    const timer = setTimeout(() => inputRef.current?.focus(), 400);
    return () => clearTimeout(timer);
  }, [isScreenFocused, isAnonymous, entries.length, splashComplete]);

  // iOS ATT, asked once the journal is actually on screen — NOT at app start and no
  // longer only after a save.
  //
  // Deferring it to the first save meant it was invisible to anyone who never wrote,
  // which cost us twice. App Review rejected 1.3 under Guideline 2.1 ("unable to
  // locate the App Tracking Transparency permission request") because the reviewer
  // opened the app without creating an entry — and until the prompt fires even once,
  // the app never appears under Settings > Privacy & Security > Tracking, so there
  // was nothing for them to find. It also meant ad-sourced installs that bounce
  // before writing were never counted, which is exactly the cohort Meta attribution
  // needs to measure.
  //
  // Gated on splashComplete for the same reason as the autofocus above: the prompt is
  // a system alert, and firing it while the splash overlay is still fading either
  // covers the app's first frame or gets suppressed outright. requestTrackingConsent
  // is idempotent (iOS shows the dialog once per install and there's a local guard),
  // so the ref is belt-and-braces.
  const didRequestTracking = useRef(false);
  useEffect(() => {
    if (didRequestTracking.current || !isScreenFocused || !splashComplete) return;
    didRequestTracking.current = true;
    requestTrackingConsent();
  }, [isScreenFocused, splashComplete]);

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
  // Someone returning the day after writing used to find a completely empty Journal —
  // their entry was still there, but only on the Reflections tab, which nothing on
  // this screen points to. That blank screen lands exactly at the entry-1 → entry-2
  // drop-off. When there's nothing today, show the last few so the writing they
  // already did is visible and the streak chip has something to refer to.
  const RECENT_FALLBACK_COUNT = 3;
  const recentEntries = todayEntries.length === 0 ? entries.slice(0, RECENT_FALLBACK_COUNT) : [];
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
  // Keep long-lived sessions on the latest OTA: silently apply a downloaded
  // update when the app returns from a real break — but never mid-write.
  const hasContentRef = useRef(false);
  const setHasDraft = useComposeStore((s) => s.setHasDraft);
  useEffect(() => {
    hasContentRef.current = hasContent || isListening;
    // Publish it so other screens can refuse to reload the app mid-write — tabs
    // never unmount, so an unsaved draft survives a tab switch and would otherwise
    // be destroyed by Settings' update banner.
    setHasDraft(hasContent || isListening);
  }, [hasContent, isListening, setHasDraft]);
  const { isUpdateReady: otaReady, applyUpdate: applyOta } = useOtaUpdate({
    autoApply: true,
    canAutoApply: () => !hasContentRef.current,
  });
  const remainingFree = Math.max(0, FREE_ENTRY_LIMIT - entries.length);
  const atLimit = !isPro && entries.length >= FREE_ENTRY_LIMIT;
  // Until the server list has loaded at least once (no cache yet, still
  // fetching), `entries` undercounts to just the pending queue — a free user
  // would slip past the limit. Hold saves until the real count is known.
  const countUnknown = !isPro && !isAnonymous && serverLoading && serverEntries.length === 0;
  // ...but NEVER indefinitely. Reported from a real device: the button sat
  // disabled behind a spinner for minutes, swallowed every tap, and then the
  // spinner vanished — which reads exactly like a successful save, except the
  // entry was never written and the draft was still sitting in the input. The
  // spinner is shared with `createMutation.isPending`, so "blocked" and "saving"
  // are visually identical and the user has no way to tell them apart.
  //
  // It happens whenever the entries query is slow with an empty cache: clearing
  // storage or an OTA reload drops the persisted cache, and a phone waking from
  // sleep then makes React Query retry with backoff while `serverLoading` stays
  // true. Blocking is a nice-to-have — api.enforce_free_entry_limit is the actual
  // authority — so after this long, let the save through and let the server say
  // no. The catch already handles `free_entry_limit_reached` by presenting the
  // paywall and retrying, which is a far better outcome than a dead button.
  const [countGuardExpired, setCountGuardExpired] = useState(false);
  useEffect(() => {
    if (!countUnknown) return;
    const timer = setTimeout(() => setCountGuardExpired(true), COUNT_GUARD_TIMEOUT_MS);
    // Reset in cleanup, not in the effect body: a synchronous setState there
    // cascades renders (react-hooks/set-state-in-effect). Cleanup runs when the
    // count resolves, which is exactly when the next episode should start fresh —
    // otherwise a stale `true` would let the following cold fetch skip the guard.
    return () => {
      clearTimeout(timer);
      setCountGuardExpired(false);
    };
  }, [countUnknown]);
  const countPending = countUnknown && !countGuardExpired;
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
        // Anonymous user hit the limit — send them to sign up for Pro, and
        // remember that intent so the paywall auto-presents once they land back
        // on the journal signed in.
        setProIntent(true);
        router.push('/sign-in');
        return;
      }
      // Upgrading needs the store (StoreKit / Play Billing), which can't
      // complete a purchase offline. Presenting the paywall here would be a dead
      // end, so tell the user to reconnect instead.
      if (!(await isOnline())) {
        alert({
          title: t`You're offline`,
          message: t`Reconnect to upgrade to Pro and keep writing.`,
          preset: 'error',
        });
        return;
      }
      const purchased = await presentPaywall('entry-limit');
      if (!purchased) return;
      // Sync Pro to the server before saving this entry — the limit trigger reads
      // api.entitlements, and the webhook that writes it lands after this insert.
      await refreshEntitlement();
      alert({
        title: t`Welcome to Pro ✦`,
        message: t`Unlimited entries unlocked. Keep writing.`,
        duration: PAYWALL_SUCCESS_ALERT_DURATION,
      });
    }

    setDraft('');
    Keyboard.dismiss();

    // Entries BEFORE this save. The reminder prompt is held back on someone's very
    // first entry: both asks used to fire together there, and the reminder is a
    // near-opaque full-screen modal while the echo consent is an inline card — so
    // the modal covered it, and the weaker ask visually beat the one that predicts
    // a second entry 91% vs 10%. Consent owns the first save; the reminder gets
    // every save after it (and keeps its own re-ask schedule).
    const priorEntryCount = isAnonymous ? localEntries.length : entries.length;
    // Gating the reminder on "not the first entry" wasn't enough: BOTH schedules
    // include save 2, so the collision simply moved there. The echo hooks now report
    // whether they put the card up, and the reminder only asks when they didn't.
    const askForReminderUnless = (consentShown: boolean) => {
      if (!consentShown && priorEntryCount > 0) maybePromptReminder();
    };

    if (isAnonymous) {
      addLocalEntry(trimmed);
      logJournalEntryCreated(trimmed.split(/\s+/).length);
      // Guest entries stay on-device, so this is the only server-side record that this
      // device activated. Fire-and-forget: it must never delay or fail the save.
      markFirstEntryWritten();
      // Guests get no echo (their entries are device-local, so there's no server row
      // to read) — but they can still be told the feature exists. Deliberately not on
      // their first entry: guest-first exists so that one is unmolested.
      askForReminderUnless(echo.onGuestSaved(priorEntryCount + 1));
      return;
    }

    try {
      const { queued, entry } = await createMutation.mutateAsync(trimmed);
      logJournalEntryCreated(trimmed.split(/\s+/).length);
      markFirstEntryWritten();
      // Echo needs the server row — queued (offline) saves have none yet.
      const consentShown = !queued && entry?.id ? await echo.onSaved(entry.id) : false;
      askForReminderUnless(consentShown);
      if (queued) {
        alert({
          title: t`Saved offline`,
          message: t`This entry will sync automatically when you're back online.`,
        });
      }
    } catch (err) {
      // Always restore the draft first — the user's writing must never be lost.
      setDraft(trimmed);
      // The server's free-entry-limit trigger. Reachable even when the UI says a
      // slot is free: the client count excludes tombstoned rows whose deletion
      // hasn't flushed yet, while the server counts what's actually there. Without
      // this branch it fell into the generic error below — a dead end with no
      // explanation and no upgrade path, where retrying always fails.
      if (isFreeLimitError(err)) {
        const purchased = await presentPaywall('entry-limit');
        if (purchased) {
          // Push Pro into api.entitlements BEFORE retrying — the limit trigger reads
          // that table, and the RevenueCat webhook lands too late. Without it the
          // retry hits the same trigger and re-presents the paywall to someone who
          // just paid. Then actually save the entry they were writing: they came here
          // from a failed save, so a purchase that leaves the draft unsaved and the
          // paywall ready to reappear is the worst possible outcome.
          await refreshEntitlement();
          try {
            const { queued, entry } = await createMutation.mutateAsync(trimmed);
            setDraft('');
            logJournalEntryCreated(trimmed.split(/\s+/).length);
            // The retried entry is a real entry: it must get the same treatment as
            // one saved normally, or the person who just paid is the only user who
            // never gets an echo for what they wrote.
            markFirstEntryWritten();
            if (!queued && entry?.id) await echo.onSaved(entry.id);
            alert({
              title: t`Welcome to Pro ✦`,
              message: t`Unlimited entries unlocked. Keep writing.`,
              duration: PAYWALL_SUCCESS_ALERT_DURATION,
            });
          } catch {
            // Congratulating someone whose entry is still sitting unsaved reads as
            // the app losing their writing. Say what actually happened instead —
            // Pro IS active, so their retry will go through.
            alert({
              title: t`Welcome to Pro ✦`,
              message: t`Tap save again to keep this entry.`,
              duration: PAYWALL_SUCCESS_ALERT_DURATION,
            });
          }
        }
        return;
      }
      // Unexpected (non-network) failure — let them retry.
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
                disabled={!hasContent || createMutation.isPending || countPending}
                bg="$accentBackground"
                // countPending must LOOK disabled too — it blocks taps (the free-limit
                // gate needs the server count before allowing a save), and rendering
                // the button full-colour while silently ignoring presses read as the
                // app being broken for the first seconds of every fresh-cache launch.
                opacity={hasContent && !countPending ? 1 : DISABLED_OPACITY}
                rounded="$4"
                py="$3"
                items="center"
                alignSelf="stretch"
                mb={showHint || atLimit ? '$2' : '$0'}
              >
                {createMutation.isPending || (countPending && hasContent) ? (
                  <Spinner color="$accentColor" />
                ) : (
                  <LabelLg color="$accentColor">
                    {atLimit ? <Trans>Save entry ✦</Trans> : <Trans>Save entry</Trans>}
                  </LabelLg>
                )}
              </BaseTouchable>

              {/* The spinner alone is ambiguous — identical to a save in flight — so
                  name what's happening. Without this, a blocked button that later
                  clears looks like the entry saved when it never did. */}
              {countPending && hasContent ? (
                <BodySm color="$text-disabled" text="center" mt="$2">
                  <Trans>Checking your account…</Trans>
                </BodySm>
              ) : null}

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
                  {/* Sell what Pro IS, not just the unblock — by the time someone
                      fills 30 free entries they have a real journal and (if opted
                      in) a month of Sunday reflections behind them. */}
                  {isAnonymous ? (
                    <Trans>
                      You’ve filled your free journal — sign up and go Pro to keep it growing
                    </Trans>
                  ) : (
                    <Trans>
                      You’ve filled your free journal — Pro keeps it growing, with weekly
                      reflections and export
                    </Trans>
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
            {/* AI reflection "your week is ready" nudge. Lives inside the scroll area
                (not the fixed header block) so it scrolls with the entries and never
                shrinks the list. Renders null when there's no unseen reflection. */}
            {/* Soft OTA nudge — same strings as the Settings banner, hidden while
                writing. The silent auto-apply above catches most users; this is
                the one-tap fallback for whoever it misses. */}
            {otaReady && !hasContent ? (
              <BaseTouchable onPress={applyOta} bg="$accentBackground" rounded="$4" p="$4" mb="$4">
                <BodyMdBold color="$accentColor">
                  <Trans>Update ready</Trans>
                </BodyMdBold>
                <BodySm color="$accentColor" opacity={0.85} mt="$1">
                  <Trans>Tap to restart and apply the latest update.</Trans>
                </BodySm>
              </BaseTouchable>
            ) : null}

            <EntryEchoCards
              line={echo.line}
              loading={echo.loading}
              consentVisible={echo.consentVisible}
              entriesSoFar={echo.entriesSoFar}
              isGuest={isAnonymous}
              onAccept={
                isAnonymous
                  ? () => {
                      // No consent to record for a guest — the AI needs a server row,
                      // which only exists once they have an account. Entries merge on
                      // sign-in, so nothing they've written is lost.
                      echo.declineConsent();
                      setProIntent(false);
                      router.push('/sign-in');
                    }
                  : echo.acceptConsent
              }
              onDecline={echo.declineConsent}
              onDismissLine={echo.dismissLine}
            />
            <WeeklyReflectionBanner />

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

            {recentEntries.length > 0 ? (
              <YStack gap="$3">
                <LabelMd
                  color="$text-disabled"
                  textTransform="uppercase"
                  letterSpacing={LABEL_LETTER_SPACING}
                >
                  <Trans>Recently</Trans>
                </LabelMd>
                {recentEntries.map((entry, index) => (
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
      <ReminderPromptModal
        visible={reminderPromptVisible}
        suggested={suggestedReminderTime}
        onClose={dismissReminderPrompt}
      />
    </Containers.Screen>
  );
};

export { JournalScreen };
