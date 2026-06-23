import { useState, useRef, useCallback, useEffect, type RefObject } from 'react';
import { View, ScrollView as RNScrollView } from 'react-native';
import { BlurTargetView } from 'expo-blur';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScrollView, YStack, XStack, Spinner, Input } from 'tamagui';
import { DisplayLg, BodySm, LabelMd, LabelLg } from '@fonts';
import { Trans, useLingui } from '@lingui/react/macro';
import { SizingAnimatedButton } from '@ksairi-org/ui-button-animated';
import { BaseTouchable } from '@ksairi-org/ui-touchables';
import { Containers } from '@ksairi-org/ui-containers';
import { BaseIcon } from '@atoms';
import { sizes } from '@theme';
import { format } from 'date-fns';
import { getDateLocale, formatEntryTime } from '@/src/utils/date';
import {
  usePreferencesStore,
  useSwipeableStore,
  useSessionStore,
  useAnonymousJournalStore,
  usePeekStore,
} from '@/src/stores';
import type { JournalEntry } from '@/src/types/journal';
import { logScreenView } from '@analytics';
import { useJournalEntries, useToggleBookmark, useRevenueCat, useDeleteJournalEntry } from '@hooks';
import { HEADING_LETTER_SPACING, LABEL_LETTER_SPACING } from '@constants';
import { exportJournal } from '@export';
import {
  AnimatedEntry,
  SwipeableDeleteWrapper,
  EntryPeekModal,
  type SwipeableDeleteWrapperHandle,
} from '@molecules';

const SEARCH_INPUT_HEIGHT = 44;

const formatDayLabel = (iso: string) => {
  const d = new Date(iso);
  const isThisYear = d.getFullYear() === new Date().getFullYear();
  return format(d, isThisYear ? 'EEEE, MMMM d' : 'EEEE, MMMM d, yyyy', { locale: getDateLocale() });
};

const dateKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

const groupByDay = (entries: JournalEntry[]): { label: string; items: JournalEntry[] }[] => {
  const map = new Map<string, { label: string; items: JournalEntry[] }>();
  for (const entry of entries) {
    const key = dateKey(entry.created_at);
    const existing = map.get(key);
    if (existing) {
      existing.items.push(entry);
    } else {
      map.set(key, { label: formatDayLabel(entry.created_at), items: [entry] });
    }
  }
  return Array.from(map.values());
};

const TRUNCATE_LENGTH = 250;

interface EntryCardProps {
  entry: JournalEntry;
  index: number;
  onToggleBookmark: (id: string, current: boolean) => void;
  onDelete: (id: string) => void;
  onPeek: (entry: JournalEntry) => void;
  closeKey: number;
}

const EntryCard = ({
  entry,
  index,
  onToggleBookmark,
  onDelete,
  onPeek,
  closeKey,
}: EntryCardProps) => {
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
        mb="$2"
        borderWidth={1}
        borderColor="$borderColor"
      >
        <BodySm color="$text-emphasis">{displayContent}</BodySm>
        <XStack justify="space-between" items="center" mt="$2">
          <LabelMd color="$text-disabled">
            {formatEntryTime(entry.created_at, timeFormat === '24h')}
          </LabelMd>
          <BaseTouchable
            onPress={() => onToggleBookmark(entry.id, entry.is_bookmarked)}
            hitSlop={{ top: sizes.sm, bottom: sizes.sm, left: sizes.sm, right: sizes.sm }}
          >
            <LabelMd color={entry.is_bookmarked ? '$accentBackground' : '$text-disabled'}>
              {entry.is_bookmarked ? '★' : '☆'}
            </LabelMd>
          </BaseTouchable>
        </XStack>
      </BaseTouchable>
    </SwipeableDeleteWrapper>
  );
};

const ReflectionsScreen = () => {
  const { isAnonymous } = useSessionStore();
  const {
    entries: localEntries,
    deleteEntry: deleteLocalEntry,
    toggleBookmark: toggleLocalBookmark,
  } = useAnonymousJournalStore();
  const { data: serverEntries = [], isLoading: serverLoading, refetch } = useJournalEntries();
  const entries = isAnonymous ? localEntries : serverEntries;
  const loading = isAnonymous ? false : serverLoading;
  const { isPro, presentPaywall } = useRevenueCat();
  const toggleBookmarkMutation = useToggleBookmark();
  const deleteMutation = useDeleteJournalEntry();
  const { t } = useLingui();
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);
  const [closeKey, setCloseKey] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [peekEntry, setPeekEntry] = useState<JournalEntry | null>(null);
  const blurTargetRef = useRef<View>(null);
  const scrollViewRef = useRef<RNScrollView>(null);
  const groupYPositions = useRef<Map<string, number>>(new Map());
  const entryYPositions = useRef<Map<string, number>>(new Map());
  const hasAnimated = useRef(false);

  const handlePeek = (entry: JournalEntry) => {
    setCloseKey((k) => k + 1);
    setPeekEntry(entry);
  };

  const pendingPeekEntryId = usePeekStore((s) => s.pendingPeekEntryId);
  const clearPendingPeekEntryId = usePeekStore((s) => s.setPendingPeekEntryId);

  useEffect(() => {
    if (!pendingPeekEntryId || !entries.length) return;
    const entry = entries.find((e) => e.id === pendingPeekEntryId);
    if (entry) {
      // Opening the peek modal in response to an external navigation request
      // (e.g. tapping a memory notification) is the intended effect here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handlePeek(entry);
      clearPendingPeekEntryId(null);
      setTimeout(() => {
        const groupLabel = formatDayLabel(entry.created_at);
        const groupY = groupYPositions.current.get(groupLabel) ?? 0;
        const entryY = entryYPositions.current.get(entry.id) ?? 0;
        scrollViewRef.current?.scrollTo({ y: Math.max(0, groupY + entryY - 80), animated: true });
      }, 50);
    }
  }, [pendingPeekEntryId, entries, clearPendingPeekEntryId]);

  useFocusEffect(
    useCallback(() => {
      if (!hasAnimated.current) {
        hasAnimated.current = true;
        setAnimKey(1);
      }
      if (!isAnonymous) refetch();
      logScreenView('Reflections');
      return () => setCloseKey((k) => k + 1);
    }, [refetch, isAnonymous]),
  );

  const handleExport = async () => {
    if (isAnonymous) {
      router.push('/sign-in');
      return;
    }
    if (!isPro) {
      await presentPaywall();
      return;
    }
    setExporting(true);
    await exportJournal(entries);
    setExporting(false);
  };

  const query = search.trim().toLowerCase();
  const filtered = entries.filter((e) => {
    if (showBookmarkedOnly && !e.is_bookmarked) return false;
    if (query && !e.content.toLowerCase().includes(query)) return false;
    return true;
  });

  const hasOpenCard = useSwipeableStore((s) => s.activeDragCount > 0);
  const dismissOpenCard = () => {
    if (hasOpenCard) setCloseKey((k) => k + 1);
  };

  const groups = groupByDay(filtered);

  return (
    <Containers.Screen shouldAutoResize={false}>
      <BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollViewRef as RefObject<RNScrollView>}
          keyboardShouldPersistTaps="handled"
          onTouchStart={dismissOpenCard}
        >
          <YStack p="$5">
            <XStack justify="space-between" items="center" mb="$4">
              <DisplayLg color="$text-emphasis" letterSpacing={HEADING_LETTER_SPACING}>
                <Trans>Reflections</Trans>
              </DisplayLg>
              {entries.length > 0 ? (
                <SizingAnimatedButton
                  onPress={handleExport}
                  disabled={exporting}
                  loading={exporting}
                  backgroundColor="$surface-card"
                  spinnerBackgroundColor="$surface-card"
                  spinnerPieceColor="$accentBackground"
                  height={sizes.xl}
                >
                  <XStack gap="$2" items="center">
                    <BaseIcon
                      iconName="iconBook"
                      width={sizes.sm}
                      height={sizes.sm}
                      color="$accentBackground"
                    />
                    <LabelLg color="$accentBackground">
                      {isPro ? <Trans>Export</Trans> : <Trans>Export ✦</Trans>}
                    </LabelLg>
                  </XStack>
                </SizingAnimatedButton>
              ) : null}
            </XStack>

            {entries.length > 0 ? (
              <YStack mb="$4" gap="$2">
                <Input
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t`Search entries…`}
                  bg="$surface-card"
                  borderWidth={1}
                  borderColor="$borderColor"
                  focusStyle={{ outlineWidth: 0 }}
                  fontSize="$3"
                  color="$text-emphasis"
                  rounded="$4"
                  px="$4"
                  height={SEARCH_INPUT_HEIGHT}
                />
                <BaseTouchable onPress={() => setShowBookmarkedOnly((v) => !v)}>
                  <XStack
                    bg={showBookmarkedOnly ? '$accentBackground' : '$surface-card'}
                    rounded="$4"
                    px="$3"
                    py="$2"
                    borderWidth={1}
                    borderColor={showBookmarkedOnly ? '$accentBackground' : '$borderColor'}
                    items="center"
                    gap="$2"
                    alignSelf="flex-start"
                  >
                    <LabelMd color={showBookmarkedOnly ? '$accentColor' : '$text-disabled'}>
                      {'★ '}
                      <Trans>Bookmarked</Trans>
                    </LabelMd>
                  </XStack>
                </BaseTouchable>
              </YStack>
            ) : null}

            {loading && !entries.length ? (
              <YStack items="center" mt="$10">
                <Spinner color="$accentBackground" />
              </YStack>
            ) : null}

            {!loading && !entries.length ? (
              <BodySm color="$text-disabled" text="center" mt="$14">
                <Trans>No entries yet. Start writing in the Journal tab.</Trans>
              </BodySm>
            ) : null}

            {!loading && entries.length > 0 && filtered.length === 0 ? (
              <BodySm color="$text-disabled" text="center" mt="$14">
                <Trans>No entries match your search.</Trans>
              </BodySm>
            ) : null}

            {groups.map((group) => (
              <YStack
                key={group.label}
                mb="$7"
                onLayout={(e) => groupYPositions.current.set(group.label, e.nativeEvent.layout.y)}
              >
                <LabelMd
                  color="$text-disabled"
                  textTransform="uppercase"
                  letterSpacing={LABEL_LETTER_SPACING}
                  mb="$3"
                >
                  {group.label}
                </LabelMd>
                {group.items.map((entry, idx) => (
                  <AnimatedEntry key={entry.id} index={idx} animKey={animKey}>
                    <View
                      onLayout={(e) =>
                        entryYPositions.current.set(entry.id, e.nativeEvent.layout.y)
                      }
                    >
                      <EntryCard
                        entry={entry}
                        index={idx}
                        onToggleBookmark={(id, current) =>
                          isAnonymous
                            ? toggleLocalBookmark(id)
                            : toggleBookmarkMutation.mutate({ id, is_bookmarked: !current })
                        }
                        onDelete={(id) =>
                          isAnonymous ? deleteLocalEntry(id) : deleteMutation.mutate(id)
                        }
                        onPeek={handlePeek}
                        closeKey={closeKey}
                      />
                    </View>
                  </AnimatedEntry>
                ))}
              </YStack>
            ))}
          </YStack>
        </ScrollView>
      </BlurTargetView>
      <EntryPeekModal
        entry={peekEntry}
        onClose={() => setPeekEntry(null)}
        onToggleBookmark={(id: string, current: boolean) =>
          isAnonymous
            ? toggleLocalBookmark(id)
            : toggleBookmarkMutation.mutate({ id, is_bookmarked: !current })
        }
        blurTargetRef={blurTargetRef}
      />
    </Containers.Screen>
  );
};

export { ReflectionsScreen };
