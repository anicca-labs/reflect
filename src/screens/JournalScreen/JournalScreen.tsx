import React, { useState, useRef, type ComponentRef } from 'react'
import { Alert, ScrollView } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { YStack, XStack, TextArea, Spinner } from 'tamagui'
import { DisplayLg, BodySm, LabelMd, LabelLg } from '@fonts'
import { Trans, useLingui } from '@lingui/react/macro'
import { BaseTouchable } from '@ksairi-org/ui-touchables'
import { Containers } from '@ksairi-org/ui-containers'
import { sizes } from '@theme'
import { format } from 'date-fns'
import { getDateLocale } from '@/src/utils/date'
import type { JournalEntry } from '@/src/types/journal'
import { logJournalEntryCreated, logJournalEntryDeleted, logScreenView } from '@analytics'
import { useJournalEntries, useCreateJournalEntry, useDeleteJournalEntry, useRevenueCat, useToast, useStreak } from '@hooks'

function formatTime(iso: string) {
  return format(new Date(iso), 'h:mm a', { locale: getDateLocale() })
}

function formatDateHeading(iso: string) {
  return format(new Date(iso), 'EEEE, MMMM d', { locale: getDateLocale() })
}

function isToday(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
}

interface EntryCardProps {
  entry: JournalEntry
  onDelete: (id: string) => void
}

function EntryCard({ entry, onDelete }: EntryCardProps) {
  const { t } = useLingui()

  function confirmDelete() {
    Alert.alert(
      t`Delete entry?`,
      t`This cannot be undone.`,
      [
        { text: t`Cancel`, style: 'cancel' },
        { text: t`Delete`, style: 'destructive', onPress: () => { onDelete(entry.id); logJournalEntryDeleted() } },
      ],
    )
  }

  return (
    <YStack bg="$surface-card" rounded="$4" p="$4" mb="$3" borderWidth={1} borderColor="$borderColor">
      <BodySm color="$text-emphasis" mb="$3">
        {entry.content}
      </BodySm>
      <XStack justify="space-between" items="center">
        <LabelMd color="$text-disabled">{formatTime(entry.created_at)}</LabelMd>
        <BaseTouchable onPress={confirmDelete} hitSlop={{ top: sizes.sm, bottom: sizes.sm, left: sizes.sm, right: sizes.sm }}>
          <LabelMd color="$red10"><Trans>Delete</Trans></LabelMd>
        </BaseTouchable>
      </XStack>
    </YStack>
  )
}

const FREE_ENTRY_LIMIT = 7

export function JournalScreen() {
  const [draft, setDraft] = useState('')
  const { data: entries = [], isLoading: loading, refetch } = useJournalEntries()
  const createMutation = useCreateJournalEntry()
  const deleteMutation = useDeleteJournalEntry()
  const { isPro, presentPaywall } = useRevenueCat()
  const { t } = useLingui()
  const { alert } = useToast()
  const inputRef = useRef<ComponentRef<typeof TextArea>>(null)

  useFocusEffect(
    React.useCallback(() => {
      refetch()
      logScreenView('Journal')
    }, [refetch])
  )

  const todayEntries = entries.filter(e => isToday(e.created_at))
  const streak = useStreak(entries)
  const hasContent = draft.trim().length > 0
  const remainingFree = Math.max(0, FREE_ENTRY_LIMIT - entries.length)
  const atLimit = !isPro && entries.length >= FREE_ENTRY_LIMIT
  const showHint = !isPro && entries.length >= FREE_ENTRY_LIMIT - 2 && entries.length < FREE_ENTRY_LIMIT

  async function handleSave() {
    const trimmed = draft.trim()
    if (!trimmed) return
    if (atLimit) {
      const purchased = await presentPaywall()
      if (!purchased) return
      alert({ title: t`Welcome to Pro ✦`, message: t`Unlimited entries unlocked. Keep writing.`, duration: 6 })
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
                  {streak} {streak === 1 ? <Trans>day streak</Trans> : <Trans>day streak</Trans>} 🔥
                </LabelMd>
              </YStack>
            ) : null}
          </XStack>

          <YStack bg="$surface-card" rounded="$4" borderWidth={1} borderColor="$borderColor" mb="$4">
            <TextArea
              ref={inputRef}
              value={draft}
              onChangeText={setDraft}
              placeholder={t`What's on your mind?`}
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
              <Trans>{"You've used all free entries. Tap Save to unlock unlimited writing ✦"}</Trans>
            </BodySm>
          ) : null}
        </YStack>

        <ScrollView keyboardShouldPersistTaps="handled">
          <YStack px="$5" pb="$8">
            {loading && !todayEntries.length ? (
              <YStack items="center" mt="$4">
                <Spinner color="$accentBackground" />
              </YStack>
            ) : null}

            {todayEntries.length > 0 ? (
              <YStack>
                <LabelMd color="$text-disabled" textTransform="uppercase" letterSpacing={0.9} mb="$3">
                  <Trans>Today · {todayEntries.length} {todayEntries.length === 1 ? 'entry' : 'entries'}</Trans>
                </LabelMd>
                {todayEntries.map(entry => (
                  <EntryCard key={entry.id} entry={entry} onDelete={(id) => deleteMutation.mutate(id)} />
                ))}
              </YStack>
            ) : null}
          </YStack>
        </ScrollView>
      </YStack>
    </Containers.Screen>
  )
}
