import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, AppState, Linking, Modal } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { ScrollView, YStack, XStack, Spinner, type YStackProps } from 'tamagui'
import type { User } from '@supabase/supabase-js'
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect'
import { DisplayLg, BodySm, LabelMd, LabelLg } from '@fonts'
import { Containers } from '@ksairi-org/ui-containers'
import { BaseTouchable } from '@ksairi-org/ui-touchables'
import { SizingAnimatedButton } from '@ksairi-org/ui-button-animated'
import { Trans, useLingui } from '@lingui/react/macro'
import { FlashList } from '@shopify/flash-list'
import * as Device from 'expo-device'
import { supabase } from '@/src/services/supabase'
import { usePreferencesStore, useSessionStore } from '@/src/stores'
import { manageSubscriptions } from '@/src/services/revenue-cat'
import { useRevenueCat, useToast, useReminder, useOtaUpdate } from '@hooks'
import { sizes } from '@theme'
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  type NotificationPermissionStatus,
} from '@firebase-messaging'
import { upsertDeviceToken } from '@/src/services/user-devices'
import { HEADING_LETTER_SPACING, LABEL_LETTER_SPACING, DISABLED_OPACITY, PAYWALL_SUCCESS_ALERT_DURATION, SIMULATOR_TOAST_DURATION } from '@constants'
import { AnimatedEntry } from '@molecules'

const REMINDER_HOUR_START = 6
const REMINDER_HOUR_COUNT = 18
const REMINDER_HOURS = Array.from({ length: REMINDER_HOUR_COUNT }, (_, i) => i + REMINDER_HOUR_START)
const TIME_PICKER_ITEM_PY = 12
const TOGGLE_TRACK_WIDTH = 44
const TOGGLE_TRACK_HEIGHT = 26
const TOGGLE_THUMB_SIZE = 20
const TIME_PICKER_MAX_HEIGHT = 300
const UPGRADE_BUTTON_HEIGHT = 40

const formatHour = (h: number, use24h: boolean): string => {
  if (use24h) return `${String(h).padStart(2, '0')}:00`
  const period = h < 12 ? 'AM' : 'PM'
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${display}:00 ${period}`
}

const isSimulator = !Device.isDevice

type SettingsCardProps = {
  children: React.ReactNode
  gap?: YStackProps['gap']
  hasGlass: boolean
}

const SettingsCard = ({ children, gap, hasGlass }: SettingsCardProps) => {
  if (hasGlass) {
    return (
      <GlassView style={{ borderRadius: 12, padding: sizes.lg, overflow: 'hidden' }}>
        <YStack gap={gap}>{children}</YStack>
      </GlassView>
    )
  }
  return (
    <YStack bg="$surface-card" rounded="$4" p="$4" borderWidth={1} borderColor="$borderColor" gap={gap}>
      {children}
    </YStack>
  )
}

const SettingsScreen = () => {
  const { isUpdateReady, applyUpdate } = useOtaUpdate()
  const { isPro, isLoading: rcLoading, customerInfo, presentPaywall } = useRevenueCat()
  const { t } = useLingui()
  const { alert } = useToast()
  const router = useRouter()
  const { isAnonymous } = useSessionStore()
  const { enabled: reminderEnabled, hour: reminderHour, loading: reminderLoading, toggle: toggleReminder, disable: disableReminder, updateTime } = useReminder()
  const timeFormat = usePreferencesStore((s) => s.timeFormat)
  const setTimeFormat = usePreferencesStore((s) => s.setTimeFormat)
  const [hasGlass] = useState(() => isGlassEffectAPIAvailable())
  const [animKey, setAnimKey] = useState(0)
  const hasAnimated = useRef(false)
  const [notifPermission, setNotifPermission] = useState<NotificationPermissionStatus | null>(null)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const openedSettings = useRef(false)
  const prevIsProRef = useRef(isPro)

  useEffect(() => {
    if (!prevIsProRef.current && isPro) {
      router.navigate('/')
    }
    prevIsProRef.current = isPro
  }, [isPro, router])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user))
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!hasAnimated.current) {
        hasAnimated.current = true
        setAnimKey(1)
      }
    }, [])
  )

  const showSimulatorToast = () => {
    alert({ title: t`Physical device only`, message: t`This feature is not available on the simulator.`, preset: 'error', duration: SIMULATOR_TOAST_DURATION })
  }

  const refreshPermissionStatus = useCallback(async () => {
    if (isSimulator) return
    const status = await getNotificationPermissionStatus()
    setNotifPermission(status)
    if (status === 'granted') {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) upsertDeviceToken(user.id)
    } else {
      disableReminder()
    }
  }, [disableReminder])

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
  }, [refreshPermissionStatus])

  const handlePermissionPress = async () => {
    if (isSimulator) { showSimulatorToast(); return }
    if (notifPermission === 'granted') return
    if (notifPermission === 'undetermined') {
      const granted = await requestNotificationPermission()
      setNotifPermission(granted ? 'granted' : 'denied')
      if (granted) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) upsertDeviceToken(user.id)
      }
      return
    }
    openedSettings.current = true
    try {
      await Linking.openSettings()
    } catch {
      openedSettings.current = false
      alert({ title: t`Couldn't open Settings`, message: t`Please open Settings manually to manage notifications.`, preset: 'error' })
    }
  }

  const handleSignOut = () => {
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
  const planLabel = productId.includes('annual') ? t`Pro Annual` : productId.includes('monthly') ? t`Pro Monthly` : t`Pro`

  const permissionLabel = (): string => {
    if (isSimulator) return 'Not available on simulator' // dev/simulator-only — not wrapped per coding standards
    if (notifPermission === null) return '—'
    if (notifPermission === 'granted') return t`Granted`
    if (notifPermission === 'undetermined') return t`Enable`
    return t`Denied — tap to open Settings`
  }

  const permissionColor = () => {
    if (isSimulator || notifPermission === null) return '$text-disabled'
    if (notifPermission === 'granted') return '$green10'
    if (notifPermission === 'undetermined') return '$accentBackground'
    return '$red10'
  }

  return (
    <Containers.Screen shouldAutoResize={false}>
      <YStack position="absolute" top={0} left={0} right={0} height={280} bg="$accentBackground" opacity={0.18} />
      <YStack flex={1}>
        {/* NOTE: contentContainerStyle on ScrollView requires a plain style object */}
        <ScrollView
          contentContainerStyle={{ padding: sizes.lg, gap: sizes.lg, paddingBottom: sizes.lg * 2 }}
          showsVerticalScrollIndicator={false}>
          <YStack gap="$6">
            <DisplayLg color="$text-emphasis" letterSpacing={HEADING_LETTER_SPACING}>
              <Trans>Settings</Trans>
            </DisplayLg>

            {/* OTA update banner */}
            {isUpdateReady ? (
              <AnimatedEntry index={0} animKey={animKey}>
                <BaseTouchable onPress={applyUpdate}>
                  <YStack bg="$accentBackground" rounded="$4" p="$4" gap="$1">
                    <LabelMd color="$accentColor">
                      <Trans>Update ready</Trans>
                    </LabelMd>
                    <BodySm color="$accentColor" opacity={0.8}>
                      <Trans>Tap to restart and apply the latest update.</Trans>
                    </BodySm>
                  </YStack>
                </BaseTouchable>
              </AnimatedEntry>
            ) : null}

            {/* Account */}
            <AnimatedEntry index={1} animKey={animKey}>
            {isAnonymous ? (
              <SettingsCard hasGlass={hasGlass}>
                <LabelMd color="$text-disabled" textTransform="uppercase" letterSpacing={LABEL_LETTER_SPACING} mb="$3">
                  <Trans>Account</Trans>
                </LabelMd>
                <BodySm color="$text-secondary" mb="$3">
                  <Trans>You&apos;re using reflect as a guest. Sign in to sync your journal across devices and unlock Pro.</Trans>
                </BodySm>
                <BaseTouchable
                  onPress={() => router.push('/sign-in')}
                  bg="$accentBackground"
                  rounded="$4"
                  py="$3"
                  items="center">
                  <LabelLg color="$accentColor">
                    <Trans>Sign in or create account</Trans>
                  </LabelLg>
                </BaseTouchable>
              </SettingsCard>
            ) : currentUser ? (
              <SettingsCard hasGlass={hasGlass}>
                <LabelMd color="$text-disabled" textTransform="uppercase" letterSpacing={LABEL_LETTER_SPACING} mb="$3">
                  <Trans>Account</Trans>
                </LabelMd>
                {(currentUser.user_metadata?.full_name || currentUser.user_metadata?.name) ? (
                  <XStack items="center" justify="space-between" mb="$2">
                    <BodySm color="$text-secondary">
                      <Trans>Name</Trans>
                    </BodySm>
                    <LabelMd color="$text-emphasis">
                      {currentUser.user_metadata.full_name ?? currentUser.user_metadata.name}
                    </LabelMd>
                  </XStack>
                ) : null}
                <XStack items="center" justify="space-between">
                  <BodySm color="$text-secondary">
                    <Trans>Email</Trans>
                  </BodySm>
                  <LabelMd color="$text-secondary">{currentUser.email}</LabelMd>
                </XStack>
              </SettingsCard>
            ) : <YStack />}
            </AnimatedEntry>

            {/* Subscription */}
            <AnimatedEntry index={2} animKey={animKey}>
            <SettingsCard hasGlass={hasGlass}>
              <LabelMd color="$text-disabled" textTransform="uppercase" letterSpacing={LABEL_LETTER_SPACING} mb="$3">
                <Trans>Subscription</Trans>
              </LabelMd>

              <XStack items="center" justify="space-between" mb="$3">
                <BodySm color="$text-secondary">
                  <Trans>Plan</Trans>
                </BodySm>
                {rcLoading
                  ? <Spinner size="small" color="$text-disabled" />
                  : <LabelMd color={isPro ? '$green10' : '$text-disabled'}>
                      {isPro ? planLabel : <Trans>Free</Trans>}
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

              {!rcLoading && !isPro && isAnonymous ? (
                <BaseTouchable
                  onPress={() => router.push('/sign-in')}
                  bg="$accentBackground"
                  rounded="$4"
                  py="$3"
                  items="center">
                  <LabelLg color="$accentColor">
                    <Trans>Sign in for Pro ✦</Trans>
                  </LabelLg>
                </BaseTouchable>
              ) : null}

              {!rcLoading && !isPro && !isAnonymous ? (
                <SizingAnimatedButton
                  onPress={async () => {
                    const purchased = await presentPaywall()
                    if (purchased) {
                      alert({ title: t`Welcome to Pro ✦`, message: t`Unlimited entries unlocked. Keep writing.`, duration: PAYWALL_SUCCESS_ALERT_DURATION })
                    }
                  }}
                  backgroundColor="$accentBackground"
                  spinnerBackgroundColor="$accentBackground"
                  spinnerPieceColor="$accentColor"
                  height={UPGRADE_BUTTON_HEIGHT}>
                  <LabelLg color="$accentColor">
                    <Trans>Upgrade to Pro ✦</Trans>
                  </LabelLg>
                </SizingAnimatedButton>
              ) : null}
            </SettingsCard>
            </AnimatedEntry>

            {/* Daily reminder */}
            <AnimatedEntry index={3} animKey={animKey}>
            <SettingsCard hasGlass={hasGlass}>
              <LabelMd color="$text-disabled" textTransform="uppercase" letterSpacing={LABEL_LETTER_SPACING} mb="$3">
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
                    opacity={isSimulator ? 1 : (notifPermission === 'granted' ? 1 : DISABLED_OPACITY)}>
                    <YStack
                      bg={reminderEnabled ? '$accentBackground' : '$surface-subtle'}
                      rounded="$10"
                      width={TOGGLE_TRACK_WIDTH}
                      height={TOGGLE_TRACK_HEIGHT}
                      justify="center"
                      px="$1">
                      <YStack
                        bg="$white"
                        rounded="$10"
                        width={TOGGLE_THUMB_SIZE}
                        height={TOGGLE_THUMB_SIZE}
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
                      {formatHour(reminderHour, timeFormat === '24h')}
                    </LabelMd>
                  </XStack>
                </BaseTouchable>
              ) : null}

              {!isSimulator && notifPermission === 'denied' ? (
                <BodySm color="$text-disabled" mt="$2">
                  <Trans>Enable notifications in Settings to use reminders.</Trans>
                </BodySm>
              ) : null}
            </SettingsCard>
            </AnimatedEntry>

            {/* Push notifications */}
            <AnimatedEntry index={4} animKey={animKey}>
            <SettingsCard hasGlass={hasGlass}>
              <LabelMd color="$text-disabled" textTransform="uppercase" letterSpacing={LABEL_LETTER_SPACING} mb="$3">
                <Trans>Push notifications</Trans>
              </LabelMd>

              <BaseTouchable
                onPress={handlePermissionPress}
                disabled={notifPermission === 'granted'}>
                <XStack items="center" justify="space-between">
                  <BodySm color="$text-secondary">
                    <Trans>Permission</Trans>
                  </BodySm>
                  <LabelMd color={permissionColor()}>
                    {permissionLabel()}
                  </LabelMd>
                </XStack>
              </BaseTouchable>

            </SettingsCard>
            </AnimatedEntry>

            {/* Time format */}
            <AnimatedEntry index={5} animKey={animKey}>
            <SettingsCard hasGlass={hasGlass}>
              <LabelMd color="$text-disabled" textTransform="uppercase" letterSpacing={LABEL_LETTER_SPACING} mb="$3">
                <Trans>Time format</Trans>
              </LabelMd>
              <XStack gap="$2">
                {(['12h', '24h'] as const).map((fmt) => (
                  <BaseTouchable
                    key={fmt}
                    onPress={() => setTimeFormat(fmt)}
                    flex={1}
                    bg={timeFormat === fmt ? '$accentBackground' : '$surface-subtle'}
                    rounded="$4"
                    py="$3"
                    items="center">
                    <LabelMd color={timeFormat === fmt ? '$accentColor' : '$text-secondary'}>
                      {fmt === '12h' ? <Trans>12-hour</Trans> : <Trans>24-hour</Trans>}
                    </LabelMd>
                  </BaseTouchable>
                ))}
              </XStack>
            </SettingsCard>
            </AnimatedEntry>

            {/* Sign out / Sign in */}
            <AnimatedEntry index={6} animKey={animKey}>
            {isAnonymous ? <YStack /> : (
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
            )}
            </AnimatedEntry>
          </YStack>
        </ScrollView>
      </YStack>

      {/* Time picker modal */}
      <Modal
        visible={showTimePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTimePicker(false)}>
        <BaseTouchable
          flex={1}
          bg="$peekDim"
          justify="flex-end"
          onPress={() => setShowTimePicker(false)}>
          <BaseTouchable>
            <YStack bg="$background" rounded="$4" p="$4" mx="$2" mb="$6">
              <LabelMd color="$text-disabled" textTransform="uppercase" letterSpacing={LABEL_LETTER_SPACING} mb="$3">
                <Trans>Select reminder time</Trans>
              </LabelMd>
              <YStack height={TIME_PICKER_MAX_HEIGHT}>
                <FlashList
                  data={REMINDER_HOURS}
                  keyExtractor={h => String(h)}
                  renderItem={({ item: h }) => (
                    <BaseTouchable
                      onPress={() => { updateTime(h, 0); setShowTimePicker(false) }}
                      py={TIME_PICKER_ITEM_PY}
                      px={sizes.sm}>
                      <LabelLg color={h === reminderHour ? '$accentBackground' : '$text-emphasis'}>
                        {formatHour(h, timeFormat === '24h')}
                      </LabelLg>
                    </BaseTouchable>
                  )}
                />
              </YStack>
            </YStack>
          </BaseTouchable>
        </BaseTouchable>
      </Modal>
    </Containers.Screen>
  )
}

export { SettingsScreen }
