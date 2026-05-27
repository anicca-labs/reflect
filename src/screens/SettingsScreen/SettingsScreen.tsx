import { useEffect, useRef, useState } from 'react'
import { Alert, AppState, Linking, Modal, ScrollView, TouchableOpacity, FlatList } from 'react-native'
import { YStack, XStack, Spinner } from 'tamagui'
import { DisplayLg, BodySm, LabelMd, LabelLg } from '@fonts'
import { Containers } from '@ksairi-org/ui-containers'
import { BaseTouchable } from '@ksairi-org/ui-touchables'
import { SizingAnimatedButton } from '@ksairi-org/ui-button-animated'
import { Trans, useLingui } from '@lingui/react/macro'
import * as Device from 'expo-device'
import { supabase } from '@/src/services/supabase'
import { manageSubscriptions } from '@/src/services/revenue-cat'
import { useRevenueCat, useToast, useReminder } from '@hooks'
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  getFCMToken,
  type NotificationPermissionStatus,
} from '@firebase-messaging'
import { upsertDeviceToken } from '@/src/services/user-devices'

const REMINDER_HOURS = Array.from({ length: 18 }, (_, i) => i + 6) // 6 AM → 11 PM

function formatHour(h: number): string {
  const period = h < 12 ? 'AM' : 'PM'
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${display}:00 ${period}`
}

const isSimulator = !Device.isDevice

export function SettingsScreen() {
  const { isPro, isLoading: rcLoading, customerInfo, presentPaywall } = useRevenueCat()
  const { t } = useLingui()
  const { alert } = useToast()
  const { enabled: reminderEnabled, hour: reminderHour, loading: reminderLoading, toggle: toggleReminder, updateTime } = useReminder()
  const [notifPermission, setNotifPermission] = useState<NotificationPermissionStatus | null>(null)
  const [fcmToken, setFcmToken] = useState<string | null>(null)
  const [fcmTestState, setFcmTestState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [showTimePicker, setShowTimePicker] = useState(false)
  const openedSettings = useRef(false)

  function showSimulatorToast() {
    alert({ title: 'Physical device only', message: 'This feature is not available on the simulator.', preset: 'error', duration: 3 })
  }

  async function refreshPermissionStatus() {
    if (isSimulator) return
    const status = await getNotificationPermissionStatus()
    setNotifPermission(status)
    if (status === 'granted') {
      const token = await getFCMToken()
      setFcmToken(token)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) upsertDeviceToken(user.id)
    }
  }

  useEffect(() => {
    refreshPermissionStatus()

    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      if (openedSettings.current) {
        openedSettings.current = false
        refreshPermissionStatus()
      }
    })
    return () => sub.remove()
  }, [])

  async function handlePermissionPress() {
    if (isSimulator) { showSimulatorToast(); return }
    if (notifPermission === 'granted') return
    if (notifPermission === 'undetermined') {
      const granted = await requestNotificationPermission()
      setNotifPermission(granted ? 'granted' : 'denied')
      if (granted) {
        const token = await getFCMToken()
        setFcmToken(token)
        const { data: { user } } = await supabase.auth.getUser()
        if (user) upsertDeviceToken(user.id)
      }
      return
    }
    openedSettings.current = true
    await Linking.openSettings()
  }

  async function handleFcmTest() {
    if (!fcmToken) return
    setFcmTestState('sending')
    await supabase.functions.invoke('send-test-push', { body: { fcm_token: fcmToken } })
    setFcmTestState('sent')
  }

  function handleSignOut() {
    Alert.alert(
      t`Sign out`,
      t`Are you sure you want to sign out?`,
      [
        { text: t`Cancel`, style: 'cancel' },
        { text: t`Sign out`, style: 'destructive', onPress: () => supabase.auth.signOut() },
      ],
    )
  }

  const activeEntitlement = customerInfo?.entitlements.active['pro']
  const productId = activeEntitlement?.productIdentifier ?? ''
  const planLabel = productId.includes('annual') ? 'Pro Annual' : productId.includes('monthly') ? 'Pro Monthly' : 'Pro'

  function permissionLabel(): string {
    if (isSimulator) return 'Not available on simulator'
    if (notifPermission === null) return '—'
    if (notifPermission === 'granted') return t`Granted`
    if (notifPermission === 'undetermined') return t`Enable`
    return t`Denied — tap to open Settings`
  }

  function permissionColor() {
    if (isSimulator || notifPermission === null) return '$text-disabled'
    if (notifPermission === 'granted') return '$green10'
    if (notifPermission === 'undetermined') return '$accentBackground'
    return '$red10'
  }

  return (
    <Containers.Screen>
      <YStack flex={1}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 24, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
          <YStack gap="$6">
            <DisplayLg color="$text-emphasis" letterSpacing={-0.5}>
              <Trans>Settings</Trans>
            </DisplayLg>

            {/* Subscription */}
            <YStack bg="$surface-card" rounded="$4" p="$4" borderWidth={1} borderColor="$borderColor">
              <LabelMd color="$text-disabled" textTransform="uppercase" letterSpacing={0.9} mb="$3">
                <Trans>Subscription</Trans>
              </LabelMd>

              <XStack items="center" justify="space-between" mb="$3">
                <BodySm color="$text-secondary">
                  <Trans>Plan</Trans>
                </BodySm>
                {rcLoading
                  ? <Spinner size="small" color="$text-disabled" />
                  : <LabelMd color={isPro ? '$green10' : '$text-disabled'}>
                      {isPro ? planLabel : 'Free'}
                    </LabelMd>
                }
              </XStack>

              {!rcLoading && isPro && !__DEV__ ? (
                <BaseTouchable
                  onPress={manageSubscriptions}
                  bg="$surface-subtle"
                  rounded="$4"
                  py="$3"
                  items="center">
                  <LabelLg color="$text-secondary">
                    <Trans>Manage subscription</Trans>
                  </LabelLg>
                </BaseTouchable>
              ) : null}

              {!rcLoading && !isPro ? (
                <SizingAnimatedButton
                  onPress={async () => {
                    const purchased = await presentPaywall()
                    if (purchased) alert({ title: t`Welcome to Pro ✦`, message: t`Unlimited entries unlocked. Keep writing.`, duration: 4 })
                  }}
                  backgroundColor="$accentBackground"
                  spinnerBackgroundColor="$accentBackground"
                  spinnerPieceColor="$accentColor"
                  height={40}>
                  <LabelLg color="$accentColor">
                    <Trans>Upgrade to Pro ✦</Trans>
                  </LabelLg>
                </SizingAnimatedButton>
              ) : null}
            </YStack>

            {/* Daily reminder */}
            <YStack bg="$surface-card" rounded="$4" p="$4" borderWidth={1} borderColor="$borderColor">
              <LabelMd color="$text-disabled" textTransform="uppercase" letterSpacing={0.9} mb="$3">
                <Trans>Daily reminder</Trans>
              </LabelMd>

              <XStack items="center" justify="space-between" mb={reminderEnabled ? '$3' : '$0'}>
                <BodySm color="$text-secondary">
                  <Trans>Remind me to write</Trans>
                </BodySm>
                {reminderLoading ? (
                  <Spinner size="small" color="$text-disabled" />
                ) : (
                  <BaseTouchable
                    onPress={() => {
                      if (isSimulator) { showSimulatorToast(); return }
                      toggleReminder(notifPermission === 'granted')
                    }}
                    disabled={isSimulator ? false : notifPermission !== 'granted'}
                    opacity={isSimulator ? 1 : (notifPermission === 'granted' ? 1 : 0.4)}>
                    <YStack
                      bg={reminderEnabled ? '$accentBackground' : '$surface-subtle'}
                      rounded="$10"
                      width={44}
                      height={26}
                      justify="center"
                      px="$1">
                      <YStack
                        bg="white"
                        rounded="$10"
                        width={20}
                        height={20}
                        alignSelf={reminderEnabled ? 'flex-end' : 'flex-start'}
                      />
                    </YStack>
                  </BaseTouchable>
                )}
              </XStack>

              {reminderEnabled ? (
                <BaseTouchable onPress={() => setShowTimePicker(true)}>
                  <XStack justify="space-between" items="center">
                    <BodySm color="$text-secondary">
                      <Trans>Time</Trans>
                    </BodySm>
                    <LabelMd color="$accentBackground">
                      {formatHour(reminderHour)}
                    </LabelMd>
                  </XStack>
                </BaseTouchable>
              ) : null}

              {!isSimulator && notifPermission === 'denied' && (
                <BodySm color="$text-disabled" mt="$2">
                  <Trans>Enable notifications in Settings to use reminders.</Trans>
                </BodySm>
              )}
            </YStack>

            {/* Push notifications */}
            <YStack bg="$surface-card" rounded="$4" p="$4" borderWidth={1} borderColor="$borderColor">
              <LabelMd color="$text-disabled" textTransform="uppercase" letterSpacing={0.9} mb="$3">
                <Trans>Push notifications</Trans>
              </LabelMd>

              <BaseTouchable
                onPress={handlePermissionPress}
                disabled={notifPermission === 'granted'}
                mb="$3">
                <XStack items="center" justify="space-between">
                  <BodySm color="$text-secondary">
                    <Trans>Permission</Trans>
                  </BodySm>
                  <LabelMd color={permissionColor()}>
                    {permissionLabel()}
                  </LabelMd>
                </XStack>
              </BaseTouchable>

              {__DEV__ && fcmToken ? (
                <SizingAnimatedButton
                  onPress={handleFcmTest}
                  disabled={fcmTestState === 'sending'}
                  loading={fcmTestState === 'sending'}
                  backgroundColor="$surface-subtle"
                  spinnerBackgroundColor="$surface-subtle"
                  spinnerPieceColor="$accentColor"
                  height={40}
                  mt="$2">
                  <LabelLg color="$text-secondary">
                    {fcmTestState === 'sent' ? '✓ FCM push sent' : 'Send real FCM push (dev)'}
                  </LabelLg>
                </SizingAnimatedButton>
              ) : null}
            </YStack>

            {/* Sign out */}
            <BaseTouchable
              onPress={handleSignOut}
              bg="$surface-card"
              rounded="$4"
              py="$3"
              items="center"
              borderWidth={1}
              borderColor="$borderColor">
              <LabelLg color="$red10">
                <Trans>Sign out</Trans>
              </LabelLg>
            </BaseTouchable>
          </YStack>
        </ScrollView>
      </YStack>

      {/* Time picker modal */}
      <Modal
        visible={showTimePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTimePicker(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setShowTimePicker(false)}>
          <TouchableOpacity activeOpacity={1}>
            <YStack bg="$background" rounded="$4" p="$4" mx="$2" mb="$6">
              <LabelMd color="$text-disabled" textTransform="uppercase" letterSpacing={0.9} mb="$3">
                <Trans>Select reminder time</Trans>
              </LabelMd>
              <FlatList
                data={REMINDER_HOURS}
                keyExtractor={h => String(h)}
                style={{ maxHeight: 300 }}
                renderItem={({ item: h }) => (
                  <TouchableOpacity
                    onPress={() => { updateTime(h, 0); setShowTimePicker(false) }}
                    style={{ paddingVertical: 12, paddingHorizontal: 8 }}>
                    <LabelLg color={h === reminderHour ? '$accentBackground' : '$text-emphasis'}>
                      {formatHour(h)}
                    </LabelLg>
                  </TouchableOpacity>
                )}
              />
            </YStack>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </Containers.Screen>
  )
}
