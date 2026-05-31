import React, { useState, useRef, useEffect, useCallback, type ComponentRef, type ReactNode } from 'react'
import { Alert } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { ScrollView, YStack, XStack, Spinner, Input } from 'tamagui'
import { DisplayLg, BodySm, LabelMd, LabelLg } from '@fonts'
import { Trans, useLingui } from '@lingui/react/macro'
import { SizingAnimatedButton } from '@ksairi-org/ui-button-animated'
import { BaseTouchable } from '@ksairi-org/ui-touchables'
import { Containers } from '@ksairi-org/ui-containers'
import { BaseIcon } from '@atoms'
import { sizes } from '@theme'
import { format } from 'date-fns'
import { getDateLocale, formatEntryTime } from '@/src/utils/date'
import { usePreferencesStore } from '@/src/stores'
import type { JournalEntry } from '@/src/types/journal'
import { logScreenView, logJournalEntryDeleted } from '@analytics'
import { useJournalEntries, useToggleBookmark, useRevenueCat, useDeleteJournalEntry } from '@hooks'
import { exportJournal } from '@export'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, cancelAnimation } from 'react-native-reanimated'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import { Ionicons } from '@expo/vector-icons'

const formatDayLabel = (iso: string) => {
  const d = new Date(iso)
  const isThisYear = d.getFullYear() === new Date().getFullYear()
  return format(d, isThisYear ? 'EEEE, MMMM d' : 'EEEE, MMMM d, yyyy', { locale: getDateLocale() })
}

const dateKey = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

const groupByDay = (entries: JournalEntry[]): { label: string; items: JournalEntry[] }[] => {
  const map = new Map<string, { label: string; items: JournalEntry[] }>()
  for (const entry of entries) {
    const key = dateKey(entry.created_at)
    if (!map.has(key)) {
      map.set(key, { label: formatDayLabel(entry.created_at), items: [] })
    }
    map.get(key)!.items.push(entry)
  }
  return Array.from(map.values())
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
  <YStack bg="$red10" justify="center" items="center" width={72} mb="$2" rounded="$4">
    <Ionicons name="trash-outline" size={22} color="white" />
  </YStack>
)

interface EntryCardProps {
  entry: JournalEntry
  onToggleBookmark: (id: string, current: boolean) => void
}

const EntryCard = ({ entry, onToggleBookmark }: EntryCardProps) => {
  const timeFormat = usePreferencesStore((s) => s.timeFormat)
  return (
    <YStack
      bg="$surface-card"
      rounded="$4"
      p="$4"
      mb="$2"
      borderWidth={1}
      borderColor="$borderColor">
      <BodySm color="$text-emphasis">
        {entry.content}
      </BodySm>
      <XStack justify="space-between" items="center" mt="$2">
        <LabelMd color="$text-disabled">{formatEntryTime(entry.created_at, timeFormat === '24h')}</LabelMd>
        <BaseTouchable
          onPress={() => onToggleBookmark(entry.id, entry.is_bookmarked)}
          hitSlop={{ top: sizes.sm, bottom: sizes.sm, left: sizes.sm, right: sizes.sm }}>
          <LabelMd color={entry.is_bookmarked ? '$accentBackground' : '$text-disabled'}>
            {entry.is_bookmarked ? '★' : '☆'}
          </LabelMd>
        </BaseTouchable>
      </XStack>
    </YStack>
  )
}

interface SwipeableEntryCardProps extends EntryCardProps {
  onDelete: (id: string) => void
  closeKey: number
}

const SwipeableEntryCard = ({ entry, onToggleBookmark, onDelete, closeKey }: SwipeableEntryCardProps) => {
  const { t } = useLingui()
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
      <EntryCard entry={entry} onToggleBookmark={onToggleBookmark} />
    </ReanimatedSwipeable>
  )
}

const ReflectionsScreen = () => {
  const { data: entries = [], isLoading: loading, refetch } = useJournalEntries()
  const { isPro, presentPaywall } = useRevenueCat()
  const toggleBookmarkMutation = useToggleBookmark()
  const deleteMutation = useDeleteJournalEntry()
  const { t } = useLingui()
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false)
  const [closeKey, setCloseKey] = useState(0)
  const [animKey, setAnimKey] = useState(0)
  const hasAnimated = useRef(false)

  useFocusEffect(
    useCallback(() => {
      if (!hasAnimated.current) {
        hasAnimated.current = true
        setAnimKey(1)
      }
      refetch()
      logScreenView('Reflections')
      return () => setCloseKey(k => k + 1)
    }, [refetch])
  )

  const handleExport = async () => {
    if (!isPro) {
      await presentPaywall()
      return
    }
    setExporting(true)
    await exportJournal(entries)
    setExporting(false)
  }

  const query = search.trim().toLowerCase()
  const filtered = entries.filter(e => {
    if (showBookmarkedOnly && !e.is_bookmarked) return false
    if (query && !e.content.toLowerCase().includes(query)) return false
    return true
  })

  const groups = groupByDay(filtered)

  return (
    <Containers.Screen shouldAutoResize={false}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <YStack p="$5">
          <XStack justify="space-between" items="center" mb="$4">
            <DisplayLg color="$text-emphasis" letterSpacing={-0.5}>
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
                height={sizes.xl}>
                <XStack gap="$2" items="center">
                  <BaseIcon iconName="iconBook" width={sizes.sm} height={sizes.sm} color="$accentBackground" />
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
                height={44}
              />
              <BaseTouchable onPress={() => setShowBookmarkedOnly(v => !v)}>
                <XStack
                  bg={showBookmarkedOnly ? '$accentBackground' : '$surface-card'}
                  rounded="$4"
                  px="$3"
                  py="$2"
                  borderWidth={1}
                  borderColor={showBookmarkedOnly ? '$accentBackground' : '$borderColor'}
                  items="center"
                  gap="$2"
                  alignSelf="flex-start">
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

          {groups.map(group => (
            <YStack key={group.label} mb="$7">
              <LabelMd
                color="$text-disabled"
                textTransform="uppercase"
                letterSpacing={0.9}
                mb="$3">
                {group.label}
              </LabelMd>
              {group.items.map((entry, idx) => (
                <AnimatedEntry key={entry.id} index={idx} animKey={animKey}>
                  <SwipeableEntryCard
                    entry={entry}
                    onToggleBookmark={(id, current) => toggleBookmarkMutation.mutate({ id, is_bookmarked: !current })}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    closeKey={closeKey}
                  />
                </AnimatedEntry>
              ))}
            </YStack>
          ))}

        </YStack>
      </ScrollView>
    </Containers.Screen>
  )
}

export { ReflectionsScreen }
