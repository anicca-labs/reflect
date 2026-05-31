import { useState, useRef, useEffect, useCallback, type ComponentRef, type ReactNode } from 'react'
import { Alert } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { ScrollView, YStack, XStack, TextArea, Spinner } from 'tamagui'
import { DisplayLg, BodySm, LabelMd, LabelLg } from '@fonts'
import { Trans, useLingui } from '@lingui/react/macro'
import { BaseTouchable } from '@ksairi-org/ui-touchables'
import { Containers } from '@ksairi-org/ui-containers'
import { sizes } from '@theme'
import { format } from 'date-fns'
import { getDateLocale, formatEntryTime } from '@/src/utils/date'
import { usePreferencesStore } from '@/src/stores'
import type { JournalEntry } from '@/src/types/journal'
import { logJournalEntryCreated, logJournalEntryDeleted, logScreenView } from '@analytics'
import { useJournalEntries, useCreateJournalEntry, useDeleteJournalEntry, useRevenueCat, useToast, useStreak, getDailyPromptIndex } from '@hooks'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, cancelAnimation } from 'react-native-reanimated'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import { Ionicons } from '@expo/vector-icons'

const formatDateHeading = (iso: string) =>
  format(new Date(iso), 'EEEE, MMMM d', { locale: getDateLocale() })

const isToday = (iso: string) => {
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
}

interface AnimatedEntryProps {
  children: ReactNode
  index: number
  animKey: number
}

const AnimatedEntry = ({ children, index, animKey }: AnimatedEntryProps) => {
  const tx = useSharedValue(index % 2 === 0 ? -40 : 40)
  const opacity = useSharedValue(0)

  useEffect(() => {
    cancelAnimation(tx)
    cancelAnimation(opacity)
    tx.value = index % 2 === 0 ? -40 : 40
    opacity.value = 0
    const delay = index * 100
    tx.value = withDelay(delay, withTiming(0, { duration: 500 }))
    opacity.value = withDelay(delay, withTiming(1, { duration: 500 }))
  }, [animKey])

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
    opacity: opacity.value,
  }))

  return <Animated.View style={style}>{children}</Animated.View>
}

const DeleteAction = () => (
  <YStack bg="$red10" justify="center" items="center" width={72} mb="$3" rounded="$4">
    <Ionicons name="trash-outline" size={22} color="white" />
  </YStack>
)

interface EntryCardProps {
  entry: JournalEntry
  onDelete: (id: string) => void
  closeKey: number
}

const EntryCard = ({ entry, onDelete, closeKey }: EntryCardProps) => {
  const { t } = useLingui()
  const timeFormat = usePreferencesStore((s) => s.timeFormat)
  const ref = useRef<ComponentRef<typeof ReanimatedSwipeable>>(null)

  useEffect(() => {
    if (closeKey > 0) ref.current?.reset()
  }, [closeKey])

  const handleSwipeOpen = (direction: 'left' | 'right') => {
    if (direction !== 'right') return
    Alert.alert(
      t`Delete entry?`,
      t`This cannot be undone.`,
      [
        { text: t`Cancel`, style: 'cancel', onPress: () => ref.current?.close() },
        { text: t`Delete`, style: 'destructive', onPress: () => { onDelete(entry.id); logJournalEntryDeleted() } },
      ],
    )
  }

  return (
    <ReanimatedSwipeable
      ref={ref}
      renderRightActions={() => <DeleteAction />}
      onSwipeableOpen={handleSwipeOpen}
      rightThreshold={60}
    >
      <YStack bg="$surface-card" rounded="$4" p="$4" mb="$3" borderWidth={1} borderColor="$borderColor">
        <BodySm color="$text-emphasis" mb="$3">
          {entry.content}
        </BodySm>
        <LabelMd color="$text-disabled">{formatEntryTime(entry.created_at, timeFormat === '24h')}</LabelMd>
      </YStack>
    </ReanimatedSwipeable>
  )
}

const FREE_ENTRY_LIMIT = 7

const JournalScreen = () => {
  const [draft, setDraft] = useState('')
  const [closeKey, setCloseKey] = useState(0)
  const [animKey, setAnimKey] = useState(0)
  const hasAnimated = useRef(false)
  const { data: entries = [], isLoading: loading, refetch } = useJournalEntries()
  const createMutation = useCreateJournalEntry()
  const deleteMutation = useDeleteJournalEntry()
  const { isPro, presentPaywall } = useRevenueCat()
  const { t } = useLingui()
  const { alert } = useToast()
  const inputRef = useRef<ComponentRef<typeof TextArea>>(null)

  useFocusEffect(
    useCallback(() => {
      if (!hasAnimated.current) {
        hasAnimated.current = true
        setAnimKey(1)
      }
      refetch()
      logScreenView('Journal')
      return () => setCloseKey(k => k + 1)
    }, [refetch])
  )

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
  ]
  const prompt = prompts[getDailyPromptIndex(prompts.length)]
  const hasContent = draft.trim().length > 0
  const remainingFree = Math.max(0, FREE_ENTRY_LIMIT - entries.length)
  const atLimit = !isPro && entries.length >= FREE_ENTRY_LIMIT
  const showHint = !isPro && entries.length >= FREE_ENTRY_LIMIT - 2 && entries.length < FREE_ENTRY_LIMIT

  const handleSave = async () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    if (atLimit) {
      const purchased = await presentPaywall()
      if (!purchased) return
      alert({ title: t`Welcome to Pro ✦`, message: t`Unlimited entries unlocked. Keep writing.`, duration: 4 })
    }
    setDraft('')
    await createMutation.mutateAsync(trimmed)
    logJournalEntryCreated(trimmed.split(/\s+/).length)
  }

  return (
    <Containers.Screen shouldAutoResize={false}>
      <YStack flex={1}>
        <YStack p="$5" pb="$4">
          <LabelMd color="$text-disabled" mb="$1" textTransform="uppercase" letterSpacing={0.9}>
            {formatDateHeading(new Date().toISOString())}
          </LabelMd>
          <XStack justify="space-between" items="flex-end" mb="$6">
            <DisplayLg color="$text-emphasis" letterSpacing={-0.5}>
              <Trans>Journal</Trans>
            </DisplayLg>
            {streak > 0 ? (
              <YStack items="flex-end">
                <LabelMd color="$accentBackground" letterSpacing={-0.3}>
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
          </YStack>

          <BaseTouchable
            onPress={handleSave}
            disabled={!hasContent || createMutation.isPending}
            bg="$accentBackground"
            opacity={hasContent ? 1 : 0.4}
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
              {remainingFree === 1
                ? <Trans>1 free entry left — upgrade to keep writing</Trans>
                : <Trans>{remainingFree} free entries left — upgrade to keep writing</Trans>}
            </BodySm>
          ) : null}

          {atLimit ? (
            <BodySm color="$accentBackground" text="center" mt="$2">
              <Trans>Entry limit reached — upgrade to keep writing</Trans>
            </BodySm>
          ) : null}
        </YStack>

        <ScrollView flex={1} contentContainerStyle={{ paddingHorizontal: sizes.xl, paddingBottom: sizes.xl }}>
          {loading && !todayEntries.length && (
            <YStack items="center" mt="$4">
              <Spinner color="$accentBackground" />
            </YStack>
          )}

          {todayEntries.length > 0 && (
            <YStack>
              <LabelMd color="$text-disabled" textTransform="uppercase" letterSpacing={0.9} mb="$3">
                <Trans>Today · {todayEntries.length} {todayEntries.length === 1 ? 'entry' : 'entries'}</Trans>
              </LabelMd>
              {todayEntries.map((entry, index) => (
                <AnimatedEntry key={entry.id} index={index} animKey={animKey}>
                  <EntryCard entry={entry} onDelete={(id) => deleteMutation.mutate(id)} closeKey={closeKey} />
                </AnimatedEntry>
              ))}
            </YStack>
          )}
        </ScrollView>
      </YStack>
    </Containers.Screen>
  )
}

export { JournalScreen }
