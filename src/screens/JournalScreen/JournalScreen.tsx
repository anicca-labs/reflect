import React, { useState, useRef, type ComponentRef } from 'react'
import { Alert } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { YStack, XStack, Text, TextArea, Spinner } from 'tamagui'
import { Trans, useLingui } from '@lingui/react/macro'
import { BaseTouchable } from '@ksairi-org/ui-touchables'
import { CTAButton } from '@ksairi-org/ui-button'
import { Containers , KeyboardScrollView } from '@ksairi-org/ui-containers'
import type { JournalEntry } from '@/src/types/journal'
import { logJournalEntryCreated, logJournalEntryDeleted, logScreenView } from '@analytics'
import { useJournalEntries, useCreateJournalEntry, useDeleteJournalEntry } from '@hooks'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDateHeading(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
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
    <YStack bg="$color2" rounded="$4" p="$4" mb="$3" borderWidth={1} borderColor="$borderColor">
      <Text fontSize={15} color="$color12" mb="$3">
        {entry.content}
      </Text>
      <XStack justify="space-between" items="center">
        <Text fontSize={12} color="$color8">{formatTime(entry.created_at)}</Text>
        <BaseTouchable onPress={confirmDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text fontSize={12} color="$red10"><Trans>Delete</Trans></Text>
        </BaseTouchable>
      </XStack>
    </YStack>
  )
}

export default function JournalScreen() {
  const [draft, setDraft] = useState('')
  const { data: entries = [], isLoading: loading, refetch } = useJournalEntries()
  const createMutation = useCreateJournalEntry()
  const deleteMutation = useDeleteJournalEntry()
  const { t } = useLingui()
  const inputRef = useRef<ComponentRef<typeof TextArea>>(null)

  useFocusEffect(
    React.useCallback(() => {
      refetch()
      logScreenView('Journal')
    }, [refetch])
  )

  const todayEntries = entries.filter(e => isToday(e.created_at))
  const hasContent = draft.trim().length > 0

  async function handleSave() {
    const trimmed = draft.trim()
    if (!trimmed) return
    setDraft('')
    await createMutation.mutateAsync(trimmed)
    logJournalEntryCreated(trimmed.split(/\s+/).length)
  }

  return (
    <Containers.Screen shouldAutoResize={false}>
      <KeyboardScrollView
        contentContainerStyle={{ padding: 20 }}
        keyboardShouldPersistTaps="handled">
        <YStack>
          <Text fontSize={12} color="$color8" mb="$1" textTransform="uppercase" letterSpacing={0.9}>
            {formatDateHeading(new Date().toISOString())}
          </Text>
          <Text fontSize={30} fontWeight="700" color="$color12" letterSpacing={-0.5} mb="$6">
            <Trans>Journal</Trans>
          </Text>

          <YStack bg="$color2" rounded="$4" borderWidth={1} borderColor="$borderColor" mb="$4">
            <TextArea
              ref={inputRef}
              value={draft}
              onChangeText={setDraft}
              placeholder={t`What's on your mind?`}
              minH={110}
              bg="transparent"
              borderWidth={0}
              focusStyle={{ outlineWidth: 0 }}
              fontSize={16}
              color="$color12"
            />
          </YStack>

          <CTAButton
            onPress={handleSave}
            disabled={!hasContent}
            loading={createMutation.isPending}
            background={hasContent ? '$accentBackground' : '$color3'}
            pressStyle={{ opacity: 0.75 }}
            borderRadius="$4"
            mb="$8">
            <Text color={hasContent ? '$accentColor' : '$color8'} fontWeight="600" fontSize={15}>
              <Trans>Save entry</Trans>
            </Text>
          </CTAButton>

          {loading && !todayEntries.length && (
            <YStack items="center" mt="$4">
              <Spinner color="$accentBackground" />
            </YStack>
          )}

          {todayEntries.length > 0 && (
            <YStack>
              <Text fontSize={12} color="$color8" textTransform="uppercase" letterSpacing={0.9} mb="$3">
                <Trans>Today · {todayEntries.length} {todayEntries.length === 1 ? 'entry' : 'entries'}</Trans>
              </Text>
              {todayEntries.map(entry => (
                <EntryCard key={entry.id} entry={entry} onDelete={(id) => deleteMutation.mutate(id)} />
              ))}
            </YStack>
          )}
        </YStack>
      </KeyboardScrollView>
    </Containers.Screen>
  )
}
