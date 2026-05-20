import React, { useState, useRef, type ComponentRef } from 'react'
import { Alert } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { YStack, XStack, TextArea, Spinner } from 'tamagui'
import { DisplayLg, BodySm, LabelMd, LabelLg } from '@fonts'
import { Trans, useLingui } from '@lingui/react/macro'
import { BaseTouchable } from '@ksairi-org/ui-touchables'
import { CTAButton } from '@ksairi-org/ui-button'
import { Containers , KeyboardScrollView } from '@ksairi-org/ui-containers'
import { sizes } from '@theme'
import { format } from 'date-fns'
import { getDateLocale } from '@/src/utils/date'
import type { JournalEntry } from '@/src/types/journal'
import { logJournalEntryCreated, logJournalEntryDeleted, logScreenView } from '@analytics'
import { useJournalEntries, useCreateJournalEntry, useDeleteJournalEntry } from '@hooks'

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
        contentContainerStyle={{ padding: sizes.lg }}
        keyboardShouldPersistTaps="handled">
        <YStack>
          <LabelMd color="$text-disabled" mb="$1" textTransform="uppercase" letterSpacing={0.9}>
            {formatDateHeading(new Date().toISOString())}
          </LabelMd>
          <DisplayLg color="$text-emphasis" letterSpacing={-0.5} mb="$6">
            <Trans>Journal</Trans>
          </DisplayLg>

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

          <CTAButton
            onPress={handleSave}
            disabled={!hasContent}
            loading={createMutation.isPending}
            background={hasContent ? '$accentBackground' : '$surface-subtle'}
            pressStyle={{ opacity: 0.75 }}
            borderRadius="$4"
            mb="$8">
            <LabelLg color={hasContent ? '$accentColor' : '$text-disabled'}>
              <Trans>Save entry</Trans>
            </LabelLg>
          </CTAButton>

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
