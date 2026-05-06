import React, { useState, useEffect } from 'react'
import { useFocusEffect } from 'expo-router'
import { ScrollView, YStack, XStack, Text, Spinner } from 'tamagui'
import { Trans } from '@lingui/react/macro'
import { SizingAnimatedButton } from '@ksairi-org/ui-button-animated'
import { Containers } from '@ksairi-org/ui-containers'
import type { JournalEntry } from '@/src/types/journal'
import {
  requestNotificationPermission,
  getFCMToken,
  scheduleLocalNotification,
} from '@firebase-messaging'
import { logScreenView } from '@analytics'
import { useJournalEntries } from '@hooks'

function formatDayLabel(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const isThisYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(isThisYear ? {} : { year: 'numeric' }),
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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

  const groups = groupByDay(entries)

  return (
    <Containers.Screen shouldAutoResize={false}>
      <ScrollView>
        <YStack p="$5">
          <Text fontSize="$9" fontWeight="700" color="$color12" letterSpacing={-0.5} mb="$6">
            <Trans>Reflections</Trans>
          </Text>

          {loading && !entries.length && (
            <YStack items="center" mt="$10">
              <Spinner color="$accentBackground" />
            </YStack>
          )}

          {!loading && !entries.length && (
            <Text color="$color8" fontSize="$2" text="center" mt="$14">
              <Trans>No entries yet. Start writing in the Journal tab.</Trans>
            </Text>
          )}

          {groups.map(group => (
            <YStack key={group.label} mb="$7">
              <Text
                fontSize="$1"
                color="$color8"
                textTransform="uppercase"
                letterSpacing={0.9}
                mb="$3">
                {group.label}
              </Text>
              {group.items.map(entry => (
                <YStack
                  key={entry.id}
                  bg="$color2"
                  rounded="$4"
                  p="$4"
                  mb="$2"
                  borderWidth={1}
                  borderColor="$borderColor">
                  <Text fontSize="$2" color="$color12">
                    {entry.content}
                  </Text>
                  <Text fontSize="$1" color="$color8" mt="$2">
                    {formatTime(entry.created_at)}
                  </Text>
                </YStack>
              ))}
            </YStack>
          ))}

          {/* Notifications demo */}
          <YStack mt="$6" bg="$color2" rounded="$4" p="$4" borderWidth={1} borderColor="$borderColor">
            <Text fontSize="$1" color="$color8" textTransform="uppercase" letterSpacing={0.9} mb="$3">
              <Trans>Push notifications</Trans>
            </Text>

            <XStack items="center" justify="space-between" mb="$3">
              <Text fontSize="$2" color="$color11">
                <Trans>Permission</Trans>
              </Text>
              <Text
                fontSize="$1"
                fontWeight="600"
                color={notifPermission === null ? '$color8' : notifPermission ? '$green10' : '$red10'}>
                {notifPermission === null ? '—' : notifPermission ? 'Granted' : 'Denied'}
              </Text>
            </XStack>

            {fcmToken && (
              <Text fontSize="$1" color="$color8" mb="$3" numberOfLines={1}>
                {fcmToken.slice(0, 24)}…
              </Text>
            )}

            <SizingAnimatedButton
              onPress={handleTestNotification}
              disabled={!notifPermission || scheduling}
              loading={scheduling}
              backgroundColor={notifPermission ? '$accentBackground' : '$color3'}
              spinnerBackgroundColor="$color3"
              spinnerPieceColor="$accentColor"
              height={40}>
              <Text color={notifPermission ? '$accentColor' : '$color8'} fontWeight="600" fontSize="$2">
                {scheduled
                  ? <Trans>Scheduled! (5 s)</Trans>
                  : <Trans>Send test notification</Trans>}
              </Text>
            </SizingAnimatedButton>
          </YStack>
        </YStack>
      </ScrollView>
    </Containers.Screen>
  )
}
