import { useState, useRef, useCallback, useEffect, type ComponentRef } from 'react'
import { Alert, Linking, View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated'
import { useSpeechRecognitionEvent } from 'expo-speech-recognition'
import { BlurTargetView } from 'expo-blur'
import { useFocusEffect, useRouter } from 'expo-router'
import { ScrollView, YStack, XStack, TextArea, Spinner, useTheme } from 'tamagui'
import { DisplayLg, BodySm, LabelMd, LabelLg } from '@fonts'
import { Trans, useLingui } from '@lingui/react/macro'
import { BaseTouchable } from '@ksairi-org/ui-touchables'
import { Containers } from '@ksairi-org/ui-containers'
import { sizes } from '@theme'
import { format } from 'date-fns'
import { getDateLocale, formatEntryTime } from '@/src/utils/date'
import { usePreferencesStore, useSwipeableStore, useSessionStore, useAnonymousJournalStore } from '@/src/stores'
import type { JournalEntry } from '@/src/types/journal'
import { logJournalEntryCreated, logScreenView } from '@analytics'
import { useJournalEntries, useCreateJournalEntry, useDeleteJournalEntry, useToggleBookmark, useRevenueCat, useToast, useStreak, getDailyPromptIndex, useVoiceToText } from '@hooks'
import { HEADING_LETTER_SPACING, LABEL_LETTER_SPACING, DISABLED_OPACITY, PAYWALL_SUCCESS_ALERT_DURATION } from '@constants'
import { AnimatedEntry, SwipeableDeleteWrapper, EntryPeekModal, type SwipeableDeleteWrapperHandle } from '@molecules'
import { BaseIcon } from '@/src/components/atoms/icons'

const formatDateHeading = (iso: string) =>
  format(new Date(iso), 'EEEE, MMMM d', { locale: getDateLocale() })

const isToday = (iso: string) => {
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
}

const TRUNCATE_LENGTH = 250
const STREAK_LETTER_SPACING = -0.3

interface EntryCardProps {
  entry: JournalEntry
  index: number
  onDelete: (id: string) => void
  onPeek: (entry: JournalEntry) => void
  closeKey: number
}

const EntryCard = ({ entry, index, onDelete, onPeek, closeKey }: EntryCardProps) => {
  const timeFormat = usePreferencesStore((s) => s.timeFormat)
  const swipeRef = useRef<SwipeableDeleteWrapperHandle>(null)
  const isTruncated = entry.content.length > TRUNCATE_LENGTH
  const displayContent = isTruncated
    ? entry.content.slice(0, TRUNCATE_LENGTH) + '…'
    : entry.content

  return (
    <SwipeableDeleteWrapper ref={swipeRef} entryId={entry.id} onDelete={onDelete} closeKey={closeKey} index={index}>
      <BaseTouchable
        onPress={() => onPeek(entry)}
        onLongPress={() => swipeRef.current?.open()}
        bg="$surface-card"
        rounded="$4"
        p="$4"
        borderWidth={1}
        borderColor="$borderColor">
        <BodySm color="$text-emphasis" mb="$3">
          {displayContent}
        </BodySm>
        <LabelMd color="$text-disabled">{formatEntryTime(entry.created_at, timeFormat === '24h')}</LabelMd>
      </BaseTouchable>
    </SwipeableDeleteWrapper>
  )
}

const FREE_ENTRY_LIMIT = 7

const JournalScreen = () => {
  const [draft, setDraft] = useState('')
  const [closeKey, setCloseKey] = useState(0)
  const [animKey, setAnimKey] = useState(0)
  const [peekEntryId, setPeekEntryId] = useState<string | null>(null)

  const handlePeek = (entry: JournalEntry) => {
    setCloseKey(k => k + 1)
    setPeekEntryId(entry.id)
  }
  const blurTargetRef = useRef<View>(null)
  const hasAnimated = useRef(false)
  const router = useRouter()

  const { isAnonymous } = useSessionStore()
  const { entries: localEntries, addEntry: addLocalEntry, deleteEntry: deleteLocalEntry } = useAnonymousJournalStore()

  const { data: serverEntries = [], isLoading: serverLoading, refetch } = useJournalEntries()
  const createMutation = useCreateJournalEntry()
  const deleteMutation = useDeleteJournalEntry()
  const toggleBookmarkMutation = useToggleBookmark()
  const { isPro, presentPaywall } = useRevenueCat()
  const { t } = useLingui()
  const { alert } = useToast()
  const inputRef = useRef<ComponentRef<typeof TextArea>>(null)

  const handleStopListening = () => {
    stopListening()
    setDraft((prev) => {
      const trimmed = prev.trimEnd()
      if (!trimmed || /[.!?,;:]$/.test(trimmed)) return prev
      return trimmed + '.'
    })
  }

  const { isListening, start: startListening, stop: stopListening } = useVoiceToText({
    onResult: (transcript, replaces) => {
      setDraft((prev) => {
        if (replaces) {
          const idx = prev.lastIndexOf(replaces)
          if (idx !== -1) return prev.slice(0, idx) + transcript
        }
        const separator = prev.trim().length > 0 ? ' ' : ''
        return prev + separator + transcript
      })
    },
    onError: () => alert({ title: t`Voice recognition failed`, preset: 'error' }),
    onPermissionDenied: () =>
      Alert.alert(
        t`Microphone access required`,
        t`To use voice input, enable microphone access for Reflect in Settings.`,
        [
          { text: t`Cancel`, style: 'cancel' },
          { text: t`Open Settings`, onPress: () => Linking.openSettings() },
        ],
      ),
  })

  const theme = useTheme()
  const ringScale = useSharedValue(0)
  const ringOpacity = useSharedValue(0)

  useSpeechRecognitionEvent('volumechange', (event) => {
    const vol = Math.max(0, (event.value + 2) / 12)
    ringScale.value = withSpring(1 + vol * 0.7, { damping: 10, stiffness: 180 })
  })

  useEffect(() => {
    if (isListening) {
      ringScale.value = withSpring(1, { damping: 10 })
      ringOpacity.value = withRepeat(
        withSequence(withTiming(0.35, { duration: 700 }), withTiming(0.15, { duration: 700 })),
        -1,
        true,
      )
    } else {
      cancelAnimation(ringScale)
      cancelAnimation(ringOpacity)
      ringScale.value = withTiming(0, { duration: 200 })
      ringOpacity.value = withTiming(0, { duration: 200 })
    }
  }, [isListening, ringScale, ringOpacity])

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }))

  const handleClearDraft = () => {
    setDraft('')
  }

  const entries = isAnonymous ? localEntries : serverEntries
  const loading = isAnonymous ? false : serverLoading
  const peekEntry = peekEntryId ? (entries.find(e => e.id === peekEntryId) ?? null) : null

  useFocusEffect(
    useCallback(() => {
      if (!hasAnimated.current) {
        hasAnimated.current = true
        setAnimKey(1)
      }
      if (!isAnonymous) refetch()
      logScreenView('Journal')
      return () => setCloseKey(k => k + 1)
    }, [refetch, isAnonymous])
  )

  const hasOpenCard = useSwipeableStore((s) => s.activeDragCount > 0)
  const dismissOpenCard = () => { if (hasOpenCard) setCloseKey(k => k + 1) }

  const todayEntries = entries.filter(e => isToday(e.created_at))
  const streak = useStreak(entries)
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
  ]
  const prompt = prompts[getDailyPromptIndex(prompts.length)]
  const hasContent = draft.trim().length > 0
  const remainingFree = Math.max(0, FREE_ENTRY_LIMIT - entries.length)
  const atLimit = !isPro && entries.length >= FREE_ENTRY_LIMIT
  const showHint = !isPro && entries.length >= FREE_ENTRY_LIMIT - 2 && entries.length < FREE_ENTRY_LIMIT

  const handleSave = async () => {
    if (isListening) stopListening()
    const trimmed = draft.trim()
    if (!trimmed) return

    if (atLimit) {
      if (isAnonymous) {
        // Anonymous user hit the limit — send them to sign up for Pro
        router.push('/sign-in')
        return
      }
      const purchased = await presentPaywall()
      if (!purchased) return
      alert({ title: t`Welcome to Pro ✦`, message: t`Unlimited entries unlocked. Keep writing.`, duration: PAYWALL_SUCCESS_ALERT_DURATION })
    }

    setDraft('')

    if (isAnonymous) {
      addLocalEntry(trimmed)
      logJournalEntryCreated(trimmed.split(/\s+/).length)
      return
    }

    await createMutation.mutateAsync(trimmed)
    logJournalEntryCreated(trimmed.split(/\s+/).length)
  }

  const handleDelete = (id: string) => {
    if (isAnonymous) {
      deleteLocalEntry(id)
    } else {
      deleteMutation.mutate(id)
    }
  }

  return (
    <Containers.Screen shouldAutoResize={false}>
      <BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
      <YStack flex={1}>
        <YStack p="$5" pb="$4" onTouchStart={dismissOpenCard}>
          <LabelMd color="$text-disabled" mb="$1" textTransform="uppercase" letterSpacing={LABEL_LETTER_SPACING}>
            {formatDateHeading(new Date().toISOString())}
          </LabelMd>
          <XStack justify="space-between" items="flex-end" mb="$6">
            <DisplayLg color="$text-emphasis" letterSpacing={HEADING_LETTER_SPACING}>
              <Trans>Journal</Trans>
            </DisplayLg>
            {streak > 0 ? (
              <YStack items="flex-end">
                <LabelMd color="$accentBackground" letterSpacing={STREAK_LETTER_SPACING}>
                  {streak} {streak === 1 ? <Trans>day streak</Trans> : <Trans>days streak</Trans>} 🔥
                </LabelMd>
              </YStack>
            ) : null}
          </XStack>

          <YStack bg="$surface-card" rounded="$4" borderWidth={1} borderColor="$borderColor" mb="$4">
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
                  hitSlop={12}>
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

          <BaseTouchable
            onPress={handleSave}
            disabled={!hasContent || createMutation.isPending}
            bg="$accentBackground"
            opacity={hasContent ? 1 : DISABLED_OPACITY}
            rounded="$4"
            py="$3"
            items="center"
            alignSelf="stretch"
            mb={showHint || atLimit ? '$2' : '$0'}>
            {createMutation.isPending
              ? <Spinner color="$accentColor" />
              : <LabelLg color="$accentColor">
                  {atLimit ? <Trans>Save entry ✦</Trans> : <Trans>Save entry</Trans>}
                </LabelLg>
            }
          </BaseTouchable>

          {showHint ? (
            <BodySm color="$text-disabled" text="center" mt="$2">
              {isAnonymous
                ? remainingFree === 1
                  ? <Trans>1 free entry left — sign up to keep writing</Trans>
                  : <Trans>{remainingFree} free entries left — sign up to keep writing</Trans>
                : remainingFree === 1
                  ? <Trans>1 free entry left — upgrade to keep writing</Trans>
                  : <Trans>{remainingFree} free entries left — upgrade to keep writing</Trans>}
            </BodySm>
          ) : null}

          {atLimit ? (
            <BodySm color="$accentBackground" text="center" mt="$2">
              {isAnonymous
                ? <Trans>Entry limit reached — sign up for Pro to keep writing</Trans>
                : <Trans>Entry limit reached — upgrade to keep writing</Trans>}
            </BodySm>
          ) : null}
        </YStack>

        {/* NOTE: contentContainerStyle on ScrollView requires a plain style object */}
        <ScrollView flex={1} contentContainerStyle={{ paddingHorizontal: sizes.xl, paddingBottom: sizes.xl }} onTouchStart={dismissOpenCard}>
          {loading && !todayEntries.length ? (
            <YStack items="center" mt="$4">
              <Spinner color="$accentBackground" />
            </YStack>
          ) : null}

          {todayEntries.length > 0 ? (
            <YStack gap="$3">
              <LabelMd color="$text-disabled" textTransform="uppercase" letterSpacing={LABEL_LETTER_SPACING}>
                {todayEntries.length === 1
                  ? <Trans>Today · 1 entry</Trans>
                  : <Trans>Today · {todayEntries.length} entries</Trans>}
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
        onToggleBookmark={isAnonymous ? undefined : (id, current) => toggleBookmarkMutation.mutate({ id, is_bookmarked: !current })}
      />
    </Containers.Screen>
  )
}

export { JournalScreen }
