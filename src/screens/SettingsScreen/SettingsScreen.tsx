import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Modal } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ScrollView, YStack, XStack, Spinner, type YStackProps } from 'tamagui';
import type { User } from '@supabase/supabase-js';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { DisplayLg, BodySm, LabelMd, LabelLg } from '@fonts';
import { Containers } from '@anicca-labs/ui-containers';
import { BaseTouchable } from '@anicca-labs/ui-touchables';
import { SizingAnimatedButton } from '@anicca-labs/ui-button-animated';
import { Trans, useLingui } from '@lingui/react/macro';
import { FlashList } from '@shopify/flash-list';
import * as Device from 'expo-device';
import { supabase } from '@/src/services/supabase';
import { isOnline } from '@/src/services/network';
import { deleteAccount } from '@/src/services/account';
import { usePreferencesStore, useSessionStore } from '@/src/stores';
import { manageSubscriptions } from '@/src/services/revenue-cat';
import { refreshEntitlement } from '@/src/services/entitlements';
import {
  useRevenueCat,
  useToast,
  useReminder,
  useOtaUpdate,
  useAiReflectionsSetting,
} from '@hooks';
import { sizes } from '@theme';
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  type NotificationPermissionStatus,
} from '@firebase-messaging';
import { captureDeviceToken } from '@/src/services/user-devices';
import {
  HEADING_LETTER_SPACING,
  LABEL_LETTER_SPACING,
  DISABLED_OPACITY,
  PAYWALL_SUCCESS_ALERT_DURATION,
  SIMULATOR_TOAST_DURATION,
} from '@constants';
import { AnimatedEntry } from '@molecules';
import { Toggle } from '@atoms';

const REMINDER_HOUR_START = 6;
const REMINDER_HOUR_COUNT = 18;
const REMINDER_HOURS = Array.from(
  { length: REMINDER_HOUR_COUNT },
  (_, i) => i + REMINDER_HOUR_START,
);
const REMINDER_MINUTES = [0, 15, 30, 45];
const REMINDER_SLOTS = REMINDER_HOURS.flatMap((h) =>
  REMINDER_MINUTES.map((m) => ({ hour: h, minute: m })),
);
const TIME_PICKER_ITEM_PY = 12;

// AI Weekly Reflections backend lives on stg only for now.
const isStg = process.env.EXPO_PUBLIC_ENV === 'stg';
const TIME_PICKER_MAX_HEIGHT = 300;
const UPGRADE_BUTTON_HEIGHT = 40;

const formatTime = (h: number, m: number, use24h: boolean): string => {
  const mm = String(m).padStart(2, '0');
  if (use24h) return `${String(h).padStart(2, '0')}:${mm}`;
  const period = h < 12 ? 'AM' : 'PM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${mm} ${period}`;
};

const isSimulator = !Device.isDevice;

type SettingsCardProps = {
  children: React.ReactNode;
  gap?: YStackProps['gap'];
  hasGlass: boolean;
};

const SettingsCard = ({ children, gap, hasGlass }: SettingsCardProps) => {
  if (hasGlass) {
    return (
      <GlassView style={{ borderRadius: 12, padding: sizes.lg, overflow: 'hidden' }}>
        <YStack gap={gap}>{children}</YStack>
      </GlassView>
    );
  }
  return (
    <YStack
      bg="$surface-card"
      rounded="$4"
      p="$4"
      borderWidth={1}
      borderColor="$borderColor"
      gap={gap}
    >
      {children}
    </YStack>
  );
};

const SettingsScreen = () => {
  const { isUpdateReady, applyUpdate } = useOtaUpdate();
  const { isPro, isLoading: rcLoading, customerInfo, presentPaywall } = useRevenueCat();
  const { t } = useLingui();
  const voiceLanguages: { code: string; label: string }[] = [
    { code: 'en-US', label: t`English` },
    { code: 'es-ES', label: t`Spanish` },
    { code: 'fr-FR', label: t`French` },
    { code: 'pt-BR', label: t`Portuguese` },
    { code: 'de-DE', label: t`German` },
    { code: 'it-IT', label: t`Italian` },
    { code: 'ar', label: t`Arabic` },
    { code: 'zh-CN', label: t`Chinese` },
    { code: 'ja-JP', label: t`Japanese` },
    { code: 'ko-KR', label: t`Korean` },
    { code: 'ru-RU', label: t`Russian` },
    { code: 'hi-IN', label: t`Hindi` },
    { code: 'nl-NL', label: t`Dutch` },
    { code: 'tr-TR', label: t`Turkish` },
  ];
  const { alert } = useToast();
  const router = useRouter();
  const { isAnonymous, setProIntent } = useSessionStore();
  const {
    enabled: reminderEnabled,
    hour: reminderHour,
    minute: reminderMinute,
    loading: reminderLoading,
    toggle: toggleReminder,
    disable: disableReminder,
    updateTime,
  } = useReminder();
  const {
    enabled: aiEnabled,
    isLoading: aiLoading,
    setEnabled: setAiEnabled,
  } = useAiReflectionsSetting();
  const timeFormat = usePreferencesStore((s) => s.timeFormat);
  const setTimeFormat = usePreferencesStore((s) => s.setTimeFormat);
  const voiceLanguage = usePreferencesStore((s) => s.voiceLanguage);
  const setVoiceLanguage = usePreferencesStore((s) => s.setVoiceLanguage);
  const [hasGlass] = useState(() => isGlassEffectAPIAvailable());
  const [animKey, setAnimKey] = useState(0);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const hasAnimated = useRef(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermissionStatus | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const openedSettings = useRef(false);
  const prevIsProRef = useRef(isPro);

  useEffect(() => {
    if (!prevIsProRef.current && isPro) {
      router.navigate('/');
    }
    prevIsProRef.current = isPro;
  }, [isPro, router]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user));
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!hasAnimated.current) {
        hasAnimated.current = true;
        setAnimKey(1);
      }
    }, []),
  );

  const showSimulatorToast = () => {
    alert({
      title: t`Physical device only`,
      message: t`This feature is not available on the simulator.`,
      preset: 'error',
      duration: SIMULATOR_TOAST_DURATION,
    });
  };

  const refreshPermissionStatus = useCallback(async () => {
    if (isSimulator) return;
    const status = await getNotificationPermissionStatus();
    setNotifPermission(status);
    if (status === 'granted') {
      // Signed-in or guest — captureDeviceToken picks the right path and records the
      // token so we can reach them with push (reminder and/or re-engagement).
      captureDeviceToken();
    } else {
      disableReminder();
    }
  }, [disableReminder]);

  useEffect(() => {
    // Mount-time permission check + re-check when returning from system settings;
    // the async status update is the intended effect of this subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshPermissionStatus();

    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (openedSettings.current) {
        openedSettings.current = false;
        refreshPermissionStatus();
      }
    });
    return () => sub.remove();
  }, [refreshPermissionStatus]);

  const handlePermissionPress = async () => {
    if (isSimulator) {
      showSimulatorToast();
      return;
    }
    if (notifPermission === 'granted') return;
    if (notifPermission === 'undetermined') {
      const granted = await requestNotificationPermission();
      setNotifPermission(granted ? 'granted' : 'denied');
      if (granted) captureDeviceToken();
      return;
    }
    openedSettings.current = true;
    try {
      await Linking.openSettings();
    } catch {
      openedSettings.current = false;
      alert({
        title: t`Couldn't open Settings`,
        message: t`Please open Settings manually to manage notifications.`,
        preset: 'error',
      });
    }
  };

  // Several actions here need the server (purchases, token revocation, account
  // deletion). Offline they'd either dead-end or, for sign-out, wipe the
  // unsynced offline outbox. Gate them behind a connectivity check + toast.
  const requireOnline = async (message: string): Promise<boolean> => {
    if (await isOnline()) return true;
    alert({ title: t`You're offline`, message, preset: 'error' });
    return false;
  };

  const handleSignOut = async () => {
    if (!(await requireOnline(t`Reconnect to sign out.`))) return;
    Alert.alert(t`Sign out`, t`Are you sure you want to sign out?`, [
      { text: t`Cancel`, style: 'cancel' },
      { text: t`Sign out`, style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  const getLanguageLabel = (code: string): string =>
    voiceLanguages.find((l) => l.code === code)?.label ?? code;

  const handleDeleteAccount = async () => {
    if (!(await requireOnline(t`Reconnect to delete your account.`))) return;
    const subscriptionNote = isPro
      ? '\n\n' +
        t`Deleting your account does not cancel your subscription. Manage it in the App Store to avoid further charges.`
      : '';
    Alert.alert(
      t`Delete account`,
      t`This permanently deletes your account and all your journal entries. This cannot be undone.` +
        subscriptionNote,
      [
        { text: t`Cancel`, style: 'cancel' },
        {
          text: t`Delete account`,
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t`Are you sure?`,
              t`Your account and journal entries will be permanently deleted.`,
              [
                { text: t`Cancel`, style: 'cancel' },
                {
                  text: t`Delete`,
                  style: 'destructive',
                  onPress: async () => {
                    setIsDeleting(true);
                    try {
                      await deleteAccount();
                    } catch {
                      setIsDeleting(false);
                      alert({
                        title: t`Couldn't delete account`,
                        message: t`Something went wrong. Please try again.`,
                        preset: 'error',
                      });
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const activeEntitlement = customerInfo?.entitlements.active['pro'];
  const productId = activeEntitlement?.productIdentifier ?? '';
  const planLabel = productId.includes('annual')
    ? t`Pro Annual`
    : productId.includes('monthly')
      ? t`Pro Monthly`
      : t`Pro`;

  const permissionLabel = (): string => {
    if (isSimulator) return 'Not available on simulator'; // dev/simulator-only — not wrapped per coding standards
    if (notifPermission === null) return '—';
    if (notifPermission === 'granted') return t`Granted`;
    if (notifPermission === 'undetermined') return t`Enable`;
    return t`Denied — tap to open Settings`;
  };

  const permissionColor = () => {
    if (isSimulator || notifPermission === null) return '$text-disabled';
    if (notifPermission === 'granted') return '$green10';
    if (notifPermission === 'undetermined') return '$accentBackground';
    return '$red10';
  };

  return (
    <Containers.Screen shouldAutoResize={false}>
      <YStack
        position="absolute"
        top={0}
        left={0}
        right={0}
        height={280}
        bg="$accentBackground"
        opacity={0.18}
      />
      <YStack flex={1}>
        {/* NOTE: contentContainerStyle on ScrollView requires a plain style object */}
        <ScrollView
          contentContainerStyle={{ padding: sizes.lg, gap: sizes.lg, paddingBottom: sizes.lg * 2 }}
          showsVerticalScrollIndicator={false}
        >
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
                  <LabelMd
                    color="$text-disabled"
                    textTransform="uppercase"
                    letterSpacing={LABEL_LETTER_SPACING}
                    mb="$3"
                  >
                    <Trans>Account</Trans>
                  </LabelMd>
                  <BodySm color="$text-secondary" mb="$3">
                    <Trans>
                      You&apos;re using reflect as a guest. Sign in to sync your journal across
                      devices and unlock Pro.
                    </Trans>
                  </BodySm>
                  <BaseTouchable
                    onPress={() => router.push('/sign-in')}
                    bg="$accentBackground"
                    rounded="$4"
                    py="$3"
                    items="center"
                  >
                    <LabelLg color="$accentColor">
                      <Trans>Sign in or create account</Trans>
                    </LabelLg>
                  </BaseTouchable>
                </SettingsCard>
              ) : currentUser ? (
                <SettingsCard hasGlass={hasGlass}>
                  <LabelMd
                    color="$text-disabled"
                    textTransform="uppercase"
                    letterSpacing={LABEL_LETTER_SPACING}
                    mb="$3"
                  >
                    <Trans>Account</Trans>
                  </LabelMd>
                  {currentUser.user_metadata?.full_name || currentUser.user_metadata?.name ? (
                    <XStack items="center" justify="space-between" gap="$3" mb="$2">
                      <BodySm color="$text-secondary" flexShrink={0}>
                        <Trans>Name</Trans>
                      </BodySm>
                      <LabelMd
                        color="$text-emphasis"
                        flex={1}
                        textAlign="right"
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {currentUser.user_metadata.full_name ?? currentUser.user_metadata.name}
                      </LabelMd>
                    </XStack>
                  ) : null}
                  <XStack items="center" justify="space-between" gap="$3">
                    <BodySm color="$text-secondary" flexShrink={0}>
                      <Trans>Email</Trans>
                    </BodySm>
                    <LabelMd
                      color="$text-secondary"
                      flex={1}
                      textAlign="right"
                      numberOfLines={1}
                      ellipsizeMode="middle"
                    >
                      {currentUser.email}
                    </LabelMd>
                  </XStack>
                </SettingsCard>
              ) : (
                <YStack />
              )}
            </AnimatedEntry>

            {/* Subscription */}
            <AnimatedEntry index={2} animKey={animKey}>
              <SettingsCard hasGlass={hasGlass}>
                <LabelMd
                  color="$text-disabled"
                  textTransform="uppercase"
                  letterSpacing={LABEL_LETTER_SPACING}
                  mb="$3"
                >
                  <Trans>Subscription</Trans>
                </LabelMd>

                <XStack items="center" justify="space-between" mb="$3">
                  <BodySm color="$text-secondary">
                    <Trans>Plan</Trans>
                  </BodySm>
                  {rcLoading ? (
                    <Spinner size="small" color="$text-disabled" />
                  ) : (
                    <LabelMd color={isPro ? '$green10' : '$text-disabled'}>
                      {isPro ? planLabel : <Trans>Free</Trans>}
                    </LabelMd>
                  )}
                </XStack>

                {!rcLoading && isPro && !__DEV__ ? (
                  <BaseTouchable
                    onPress={manageSubscriptions}
                    bg="$surface-subtle"
                    rounded="$4"
                    py="$3"
                    items="center"
                  >
                    <LabelLg color="$text-secondary">
                      <Trans>Manage subscription</Trans>
                    </LabelLg>
                  </BaseTouchable>
                ) : null}

                {!rcLoading && !isPro && isAnonymous ? (
                  <BaseTouchable
                    onPress={() => {
                      // Remember the Pro intent so the paywall auto-presents once
                      // they finish signing in and land on the journal.
                      setProIntent(true);
                      router.push('/sign-in');
                    }}
                    bg="$accentBackground"
                    rounded="$4"
                    py="$3"
                    items="center"
                  >
                    <LabelLg color="$accentColor">
                      <Trans>Sign in for Pro ✦</Trans>
                    </LabelLg>
                  </BaseTouchable>
                ) : null}

                {!rcLoading && !isPro && !isAnonymous ? (
                  <SizingAnimatedButton
                    onPress={async () => {
                      if (!(await requireOnline(t`Reconnect to upgrade to Pro and keep writing.`)))
                        return;
                      const purchased = await presentPaywall();
                      if (purchased) {
                        await refreshEntitlement();
                        alert({
                          title: t`Welcome to Pro ✦`,
                          message: t`Unlimited entries unlocked. Keep writing.`,
                          duration: PAYWALL_SUCCESS_ALERT_DURATION,
                        });
                      }
                    }}
                    backgroundColor="$accentBackground"
                    spinnerBackgroundColor="$accentBackground"
                    spinnerPieceColor="$accentColor"
                    height={UPGRADE_BUTTON_HEIGHT}
                  >
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
                <LabelMd
                  color="$text-disabled"
                  textTransform="uppercase"
                  letterSpacing={LABEL_LETTER_SPACING}
                  mb="$3"
                >
                  <Trans>Daily reminder</Trans>
                </LabelMd>

                <XStack items="center" justify="space-between" mb={reminderEnabled ? '$3' : '$0'}>
                  <BodySm color="$text-secondary">
                    <Trans>Remind me to write</Trans>
                  </BodySm>
                  {reminderLoading ? (
                    <Spinner size="small" color="$text-disabled" />
                  ) : (
                    <Toggle
                      value={reminderEnabled}
                      onPress={() => {
                        if (isSimulator) {
                          showSimulatorToast();
                          return;
                        }
                        toggleReminder(notifPermission === 'granted');
                      }}
                      disabled={isSimulator ? false : notifPermission !== 'granted'}
                      opacity={
                        isSimulator ? 1 : notifPermission === 'granted' ? 1 : DISABLED_OPACITY
                      }
                    />
                  )}
                </XStack>

                {reminderEnabled ? (
                  <BaseTouchable onPress={() => setShowTimePicker(true)}>
                    <XStack justify="space-between" items="center">
                      <BodySm color="$text-secondary">
                        <Trans>Time</Trans>
                      </BodySm>
                      <LabelMd color="$accentBackground">
                        {formatTime(reminderHour, reminderMinute, timeFormat === '24h')}
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
                <LabelMd
                  color="$text-disabled"
                  textTransform="uppercase"
                  letterSpacing={LABEL_LETTER_SPACING}
                  mb="$3"
                >
                  <Trans>Push notifications</Trans>
                </LabelMd>

                <BaseTouchable
                  onPress={handlePermissionPress}
                  disabled={notifPermission === 'granted'}
                >
                  <XStack items="center" justify="space-between">
                    <BodySm color="$text-secondary">
                      <Trans>Permission</Trans>
                    </BodySm>
                    <LabelMd color={permissionColor()}>{permissionLabel()}</LabelMd>
                  </XStack>
                </BaseTouchable>
              </SettingsCard>
            </AnimatedEntry>

            {/* AI Weekly Reflections (stg only) */}
            {isStg ? (
              <AnimatedEntry index={5} animKey={animKey}>
                <SettingsCard hasGlass={hasGlass}>
                  <LabelMd
                    color="$text-disabled"
                    textTransform="uppercase"
                    letterSpacing={LABEL_LETTER_SPACING}
                    mb="$3"
                  >
                    <Trans>Weekly reflections</Trans>
                  </LabelMd>

                  <XStack items="center" justify="space-between" gap="$4" mb="$3">
                    <BodySm color="$text-secondary" flex={1}>
                      <Trans>Let AI write a weekly reflection from your entries</Trans>
                    </BodySm>
                    {aiLoading ? (
                      <Spinner size="small" color="$text-disabled" />
                    ) : (
                      <Toggle value={aiEnabled} onPress={() => setAiEnabled(!aiEnabled)} />
                    )}
                  </XStack>

                  <BodySm color="$text-disabled" style={{ lineHeight: 18 }}>
                    <Trans>
                      When this is on, your entries are sent securely to our AI (Anthropic’s Claude)
                      to write your reflection. They’re never shown to another person, never used
                      for ads, never sold, and never used to train AI. You can turn it off anytime.
                    </Trans>
                  </BodySm>
                </SettingsCard>
              </AnimatedEntry>
            ) : null}

            {/* Preferences */}
            <AnimatedEntry index={5} animKey={animKey}>
              <SettingsCard hasGlass={hasGlass}>
                <LabelMd
                  color="$text-disabled"
                  textTransform="uppercase"
                  letterSpacing={LABEL_LETTER_SPACING}
                  mb="$3"
                >
                  <Trans>Preferences</Trans>
                </LabelMd>

                <BodySm color="$text-secondary" mb="$2">
                  <Trans>Time format</Trans>
                </BodySm>
                <XStack gap="$2" mb="$4">
                  {(['12h', '24h'] as const).map((fmt) => (
                    <BaseTouchable
                      key={fmt}
                      onPress={() => setTimeFormat(fmt)}
                      flex={1}
                      bg={timeFormat === fmt ? '$accentBackground' : '$surface-subtle'}
                      rounded="$4"
                      py="$3"
                      items="center"
                    >
                      <LabelMd color={timeFormat === fmt ? '$accentColor' : '$text-secondary'}>
                        {fmt === '12h' ? <Trans>12-hour</Trans> : <Trans>24-hour</Trans>}
                      </LabelMd>
                    </BaseTouchable>
                  ))}
                </XStack>

                <BaseTouchable onPress={() => setShowLanguagePicker(true)}>
                  <XStack items="center" justify="space-between">
                    <BodySm color="$text-secondary">
                      <Trans>Voice language</Trans>
                    </BodySm>
                    <LabelMd color="$accentBackground">
                      {voiceLanguage ? getLanguageLabel(voiceLanguage) : t`Auto`}
                    </LabelMd>
                  </XStack>
                </BaseTouchable>
              </SettingsCard>
            </AnimatedEntry>

            {/* Sign out / Sign in */}
            <AnimatedEntry index={6} animKey={animKey}>
              {isAnonymous ? (
                <YStack />
              ) : (
                <YStack gap="$3">
                  <BaseTouchable
                    onPress={handleSignOut}
                    bg="$surface-card"
                    rounded="$4"
                    py="$3"
                    items="center"
                    borderWidth={1}
                    borderColor="$borderColor"
                  >
                    <LabelLg color="$red10">
                      <Trans>Sign out</Trans>
                    </LabelLg>
                  </BaseTouchable>

                  <BaseTouchable
                    onPress={handleDeleteAccount}
                    disabled={isDeleting}
                    py="$3"
                    items="center"
                    opacity={isDeleting ? DISABLED_OPACITY : 1}
                  >
                    {isDeleting ? (
                      <Spinner size="small" color="$red10" />
                    ) : (
                      <LabelLg color="$red10">
                        <Trans>Delete account</Trans>
                      </LabelLg>
                    )}
                  </BaseTouchable>
                </YStack>
              )}
            </AnimatedEntry>
          </YStack>
        </ScrollView>
      </YStack>

      {/* Language picker modal */}
      <Modal
        visible={showLanguagePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLanguagePicker(false)}
      >
        <BaseTouchable
          flex={1}
          bg="$peekDim"
          justify="flex-end"
          onPress={() => setShowLanguagePicker(false)}
        >
          <BaseTouchable>
            <YStack bg="$background" rounded="$4" p="$4" mx="$2" mb="$6">
              <LabelMd
                color="$text-disabled"
                textTransform="uppercase"
                letterSpacing={LABEL_LETTER_SPACING}
                mb="$3"
              >
                <Trans>Voice language</Trans>
              </LabelMd>
              <YStack height={TIME_PICKER_MAX_HEIGHT}>
                <FlashList
                  data={[{ code: null, label: t`Auto (device language)` }, ...voiceLanguages]}
                  keyExtractor={(item) => item.code ?? 'auto'}
                  renderItem={({ item }) => {
                    const isSelected = item.code === voiceLanguage;
                    return (
                      <BaseTouchable
                        onPress={() => {
                          setVoiceLanguage(item.code);
                          setShowLanguagePicker(false);
                        }}
                        py={TIME_PICKER_ITEM_PY}
                        px={sizes.sm}
                      >
                        <LabelLg color={isSelected ? '$accentBackground' : '$text-emphasis'}>
                          {item.label}
                        </LabelLg>
                      </BaseTouchable>
                    );
                  }}
                />
              </YStack>
            </YStack>
          </BaseTouchable>
        </BaseTouchable>
      </Modal>

      {/* Time picker modal */}
      <Modal
        visible={showTimePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTimePicker(false)}
      >
        <BaseTouchable
          flex={1}
          bg="$peekDim"
          justify="flex-end"
          onPress={() => setShowTimePicker(false)}
        >
          <BaseTouchable>
            <YStack bg="$background" rounded="$4" p="$4" mx="$2" mb="$6">
              <LabelMd
                color="$text-disabled"
                textTransform="uppercase"
                letterSpacing={LABEL_LETTER_SPACING}
                mb="$3"
              >
                <Trans>Select reminder time</Trans>
              </LabelMd>
              <YStack height={TIME_PICKER_MAX_HEIGHT}>
                <FlashList
                  data={REMINDER_SLOTS}
                  // Open scrolled to the current selection (the Modal remounts this
                  // list each time it's shown, so this re-applies on every open).
                  initialScrollIndex={Math.max(
                    0,
                    REMINDER_SLOTS.findIndex(
                      (s) => s.hour === reminderHour && s.minute === reminderMinute,
                    ),
                  )}
                  keyExtractor={(s) => `${s.hour}:${s.minute}`}
                  renderItem={({ item: s }) => (
                    <BaseTouchable
                      onPress={() => {
                        updateTime(s.hour, s.minute);
                        setShowTimePicker(false);
                      }}
                      py={TIME_PICKER_ITEM_PY}
                      px={sizes.sm}
                    >
                      <LabelLg
                        color={
                          s.hour === reminderHour && s.minute === reminderMinute
                            ? '$accentBackground'
                            : '$text-emphasis'
                        }
                      >
                        {formatTime(s.hour, s.minute, timeFormat === '24h')}
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
  );
};

export { SettingsScreen };
