import { useEffect, useRef, useState } from 'react'
import { Alert, AppState, Linking } from 'react-native'
import { YStack, XStack, Spinner } from 'tamagui'
import { DisplayLg, BodySm, LabelMd, LabelLg } from '@fonts'
import { Containers } from '@ksairi-org/ui-containers'
import { BaseTouchable } from '@ksairi-org/ui-touchables'
import { SizingAnimatedButton } from '@ksairi-org/ui-button-animated'
import { Trans, useLingui } from '@lingui/react/macro'
import { supabase } from '@/src/services/supabase'
import { manageSubscriptions } from '@/src/services/revenue-cat'
import { useRevenueCat, useToast } from '@hooks'
import {
  requestNotificationPermission,
  getFCMToken,
  scheduleLocalNotification,
} from '@firebase-messaging'

type NotifScheduleState = 'idle' | 'scheduling' | 'scheduled'

export function SettingsScreen() {
  const { isPro, isLoading: rcLoading, customerInfo, presentPaywall } = useRevenueCat()
  const { t } = useLingui()
  const { alert } = useToast()
  const [notifPermission, setNotifPermission] = useState<boolean | null>(null)
  const [fcmToken, setFcmToken] = useState<string | null>(null)
  const [scheduleState, setScheduleState] = useState<NotifScheduleState>('idle')
  const openedSettings = useRef(false)

  async function checkPermission() {
    const granted = await requestNotificationPermission()
    setNotifPermission(granted)
    if (granted) getFCMToken().then(setFcmToken)
  }

  useEffect(() => {
    checkPermission()

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && openedSettings.current) {
        openedSettings.current = false
        checkPermission()
      }
    })
    return () => sub.remove()
  }, [])

  async function handlePermissionPress() {
    if (notifPermission) return
    openedSettings.current = true
    await Linking.openSettings()
  }

  async function handleTestNotification() {
    setScheduleState('scheduling')
    await scheduleLocalNotification(
      'Reflect reminder',
      "Time to jot down today's thoughts.",
      5,
    )
    setScheduleState('scheduled')
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
  const rcUserId = customerInfo?.originalAppUserId

  return (
    <Containers.Screen>
      <YStack flex={1} p="$6" gap="$6" justifyContent="space-between">
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

            {__DEV__ && rcUserId ? (
              <LabelMd color="$text-disabled" mb="$3" numberOfLines={1} selectable>
                {rcUserId}
              </LabelMd>
            ) : null}

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
                  if (purchased) alert({ title: t`Welcome to Pro ✦`, message: t`Unlimited entries unlocked. Keep writing.`, duration: 6 })
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

          {/* Push notifications */}
          <YStack bg="$surface-card" rounded="$4" p="$4" borderWidth={1} borderColor="$borderColor">
            <LabelMd color="$text-disabled" textTransform="uppercase" letterSpacing={0.9} mb="$3">
              <Trans>Push notifications</Trans>
            </LabelMd>

            <BaseTouchable
              onPress={handlePermissionPress}
              disabled={notifPermission !== false}
              mb="$3">
              <XStack items="center" justify="space-between">
                <BodySm color="$text-secondary">
                  <Trans>Permission</Trans>
                </BodySm>
                <LabelMd
                  color={notifPermission === null ? '$text-disabled' : notifPermission ? '$green10' : '$red10'}>
                  {notifPermission === null ? '—' : notifPermission ? 'Granted' : 'Denied — tap to open Settings'}
                </LabelMd>
              </XStack>
            </BaseTouchable>

            {fcmToken ? (
              <LabelMd color="$text-disabled" mb="$3" numberOfLines={1}>
                {fcmToken.slice(0, 24)}…
              </LabelMd>
            ) : null}

            <SizingAnimatedButton
              onPress={handleTestNotification}
              disabled={!notifPermission || scheduleState === 'scheduling'}
              loading={scheduleState === 'scheduling'}
              backgroundColor={notifPermission ? '$accentBackground' : '$surface-subtle'}
              spinnerBackgroundColor="$surface-subtle"
              spinnerPieceColor="$accentColor"
              height={40}>
              <LabelLg color={notifPermission ? '$accentColor' : '$text-disabled'}>
                {scheduleState === 'scheduled'
                  ? <Trans>Scheduled! (5 s)</Trans>
                  : <Trans>Send test notification</Trans>}
              </LabelLg>
            </SizingAnimatedButton>
          </YStack>
        </YStack>

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
    </Containers.Screen>
  )
}
