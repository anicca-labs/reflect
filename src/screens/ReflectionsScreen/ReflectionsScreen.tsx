import React, { useState, useEffect } from 'react'
import { useFocusEffect } from 'expo-router'
import { ScrollView, YStack, XStack, Spinner } from 'tamagui'
import { DisplayLg, BodySm, LabelMd, LabelLg } from '@fonts'
import { Trans } from '@lingui/react/macro'
import { SizingAnimatedButton } from '@ksairi-org/ui-button-animated'
import { Containers } from '@ksairi-org/ui-containers'
import { BaseIcon } from '@atoms'
import { sizes } from '@theme'
import { format } from 'date-fns'
import { getDateLocale } from '@/src/utils/date'
import type { JournalEntry } from '@/src/types/journal'
import {
  requestNotificationPermission,
  getFCMToken,
  scheduleLocalNotification,
} from '@firebase-messaging'
import { logScreenView } from '@analytics'
import { useJournalEntries, useRevenueCat } from '@hooks'
import { exportJournal } from '@export'

function formatDayLabel(iso: string) {
  const d = new Date(iso)
  const isThisYear = d.getFullYear() === new Date().getFullYear()
  return format(d, isThisYear ? 'EEEE, MMMM d' : 'EEEE, MMMM d, yyyy', { locale: getDateLocale() })
}

function formatTime(iso: string) {
  return format(new Date(iso), 'h:mm a', { locale: getDateLocale() })
}

function dateKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function groupByDay(entries: JournalEntry[]): { label: string; items: JournalEntry[] }[] {
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

export default function ReflectionsScreen() {
  const { data: entries = [], isLoading: loading, refetch } = useJournalEntries()
  const { isPro, presentPaywall } = useRevenueCat()
  const [exporting, setExporting] = useState(false)
  const [notifPermission, setNotifPermission] = useState<boolean | null>(null)
  const [fcmToken, setFcmToken] = useState<string | null>(null)
  const [scheduling, setScheduling] = useState(false)
  const [scheduled, setScheduled] = useState(false)

  useEffect(() => {
    requestNotificationPermission().then(granted => {
      setNotifPermission(granted)
      if (granted) getFCMToken().then(setFcmToken)
    })
  }, [])

  useFocusEffect(
    React.useCallback(() => {
      refetch()
      logScreenView('Reflections')
    }, [refetch])
  )

  async function handleTestNotification() {
    setScheduling(true)
    setScheduled(false)
    await scheduleLocalNotification(
      'Reflect reminder',
      "Time to jot down today's thoughts.",
      5,
    )
    setScheduling(false)
    setScheduled(true)
  }

  async function handleExport() {
    if (!isPro) {
      await presentPaywall()
      return
    }
    setExporting(true)
    await exportJournal(entries)
    setExporting(false)
  }

  const groups = groupByDay(entries)

  return (
    <Containers.Screen shouldAutoResize={false}>
      <ScrollView>
        <YStack p="$5">
          <XStack justify="space-between" items="center" mb="$6">
            <DisplayLg color="$text-emphasis" letterSpacing={-0.5}>
              <Trans>Reflections</Trans>
            </DisplayLg>
            {entries.length > 0 && (
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
            )}
          </XStack>

          {loading && !entries.length && (
            <YStack items="center" mt="$10">
              <Spinner color="$accentBackground" />
            </YStack>
          )}

          {!loading && !entries.length && (
            <BodySm color="$text-disabled" text="center" mt="$14">
              <Trans>No entries yet. Start writing in the Journal tab.</Trans>
            </BodySm>
          )}

          {groups.map(group => (
            <YStack key={group.label} mb="$7">
              <LabelMd
                color="$text-disabled"
                textTransform="uppercase"
                letterSpacing={0.9}
                mb="$3">
                {group.label}
              </LabelMd>
              {group.items.map(entry => (
                <YStack
                  key={entry.id}
                  bg="$surface-card"
                  rounded="$4"
                  p="$4"
                  mb="$2"
                  borderWidth={1}
                  borderColor="$borderColor">
                  <BodySm color="$text-emphasis">
                    {entry.content}
                  </BodySm>
                  <LabelMd color="$text-disabled" mt="$2">
                    {formatTime(entry.created_at)}
                  </LabelMd>
                </YStack>
              ))}
            </YStack>
          ))}

          {/* Notifications demo */}
          <YStack mt="$6" bg="$surface-card" rounded="$4" p="$4" borderWidth={1} borderColor="$borderColor">
            <LabelMd color="$text-disabled" textTransform="uppercase" letterSpacing={0.9} mb="$3">
              <Trans>Push notifications</Trans>
            </LabelMd>

            <XStack items="center" justify="space-between" mb="$3">
              <BodySm color="$text-secondary">
                <Trans>Permission</Trans>
              </BodySm>
              <LabelMd
                color={notifPermission === null ? '$text-disabled' : notifPermission ? '$green10' : '$red10'}>
                {notifPermission === null ? '—' : notifPermission ? 'Granted' : 'Denied'}
              </LabelMd>
            </XStack>

            {fcmToken && (
              <LabelMd color="$text-disabled" mb="$3" numberOfLines={1}>
                {fcmToken.slice(0, 24)}…
              </LabelMd>
            )}

            <SizingAnimatedButton
              onPress={handleTestNotification}
              disabled={!notifPermission || scheduling}
              loading={scheduling}
              backgroundColor={notifPermission ? '$accentBackground' : '$surface-subtle'}
              spinnerBackgroundColor="$surface-subtle"
              spinnerPieceColor="$accentColor"
              height={40}>
              <LabelLg color={notifPermission ? '$accentColor' : '$text-disabled'}>
                {scheduled
                  ? <Trans>Scheduled! (5 s)</Trans>
                  : <Trans>Send test notification</Trans>}
              </LabelLg>
            </SizingAnimatedButton>
          </YStack>
        </YStack>
      </ScrollView>
    </Containers.Screen>
  )
}
