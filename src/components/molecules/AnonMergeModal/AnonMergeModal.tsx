import { useState } from 'react';
import { Alert, Modal } from 'react-native';
import { YStack, XStack, Spinner } from 'tamagui';
import { DisplayLg, BodySm, LabelLg, LabelMd } from '@fonts';
import { BaseTouchable } from '@anicca-labs/ui-touchables';
import { Trans, useLingui } from '@lingui/react/macro';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/services/supabase';
import { useRevenueCat, useToast } from '@hooks';
import { useAnonymousJournalStore, useSessionStore } from '@/src/stores';
import { migrateEntriesToServer, signOutToAnonymous } from '@/src/hooks/useAuthSession';
import { refreshEntitlement } from '@/src/services/entitlements';
import {
  HEADING_LETTER_SPACING,
  PAYWALL_SUCCESS_ALERT_DURATION,
  DISABLED_OPACITY,
} from '@constants';
import { sizes } from '@theme';

const FREE_ENTRY_LIMIT = 7;

interface AnonMergeModalProps {
  visible: boolean;
  localCount: number;
  serverCount: number;
  onClose: () => void;
}

const AnonMergeModal = ({ visible, localCount, serverCount, onClose }: AnonMergeModalProps) => {
  const [loading, setLoading] = useState<'pro' | 'local' | 'server' | 'abort' | null>(null);
  const { isPro, presentPaywall } = useRevenueCat();
  const { alert } = useToast();
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const { entries: localEntries, clearEntries } = useAnonymousJournalStore();
  const { setPendingMerge } = useSessionStore();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['journal-entries'] });

  const close = () => {
    setPendingMerge(null);
    onClose();
  };

  const handleKeepAll = async () => {
    setLoading('pro');
    try {
      if (!isPro) {
        const purchased = await presentPaywall();
        if (!purchased) {
          setLoading(null);
          return;
        }
        alert({
          title: t`Welcome to Pro ✦`,
          message: t`Unlimited entries unlocked. Keep writing.`,
          duration: PAYWALL_SUCCESS_ALERT_DURATION,
        });
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      // Sync Pro into api.entitlements before migrating — the server limit trigger
      // reads it, and the webhook that normally writes it lands too late for the
      // bulk insert that follows. Without this the "merge all" over-limit insert
      // is rejected right after a successful purchase.
      await refreshEntitlement();
      await migrateEntriesToServer(localEntries, user.id);
      clearEntries();
      invalidate();
      close();
    } catch {
      // keep modal open so user can retry
    } finally {
      setLoading(null);
    }
  };

  const handleKeepLocal = () => {
    Alert.alert(
      t`Delete account entries?`,
      t`Your ${serverCount} account ${serverCount === 1 ? 'entry' : 'entries'} will be permanently deleted and replaced with your ${localCount} local ${localCount === 1 ? 'entry' : 'entries'}.`,
      [
        { text: t`Cancel`, style: 'cancel' },
        {
          text: t`Delete & keep local`,
          style: 'destructive',
          onPress: async () => {
            setLoading('local');
            try {
              const {
                data: { user },
              } = await supabase.auth.getUser();
              if (!user) return;
              await supabase.from('journal_entries').delete().eq('user_id', user.id);
              await migrateEntriesToServer(localEntries, user.id);
              clearEntries();
              invalidate();
              close();
            } catch {
              // keep modal open
            } finally {
              setLoading(null);
            }
          },
        },
      ],
    );
  };

  const handleKeepServer = () => {
    clearEntries();
    close();
  };

  const handleDecideLater = async () => {
    setLoading('abort');
    try {
      await signOutToAnonymous();
      close();
    } finally {
      setLoading(null);
    }
  };

  const combined = localCount + serverCount;
  const overBy = combined - FREE_ENTRY_LIMIT;
  const isLoading = loading !== null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <YStack flex={1} bg="$background0" opacity={0.98} justify="center" px={sizes.xl}>
        <YStack
          bg="$surface-card"
          rounded="$5"
          p="$5"
          borderWidth={1}
          borderColor="$borderColor"
          gap="$4"
        >
          <YStack gap="$1">
            <DisplayLg color="$text-emphasis" letterSpacing={HEADING_LETTER_SPACING}>
              <Trans>One more thing</Trans>
            </DisplayLg>
            <BodySm color="$text-secondary">
              <Trans>
                You have {localCount} local {localCount === 1 ? 'entry' : 'entries'} and{' '}
                {serverCount} in your account — {combined} total, {overBy} over the free limit of{' '}
                {FREE_ENTRY_LIMIT}.
              </Trans>
            </BodySm>
          </YStack>

          {/* Option 1: Keep everything (Pro) */}
          <BaseTouchable
            onPress={handleKeepAll}
            disabled={isLoading}
            opacity={isLoading && loading !== 'pro' ? DISABLED_OPACITY : 1}
            bg="$accentBackground"
            rounded="$4"
            p="$4"
            gap="$1"
          >
            <XStack justify="space-between" items="center">
              <LabelLg color="$accentColor">
                {isPro ? <Trans>Merge all</Trans> : <Trans>Keep everything ✦</Trans>}
              </LabelLg>
              {loading === 'pro' ? <Spinner size="small" color="$accentColor" /> : null}
            </XStack>
            <BodySm color="$accentColor" opacity={0.85}>
              {isPro ? (
                <Trans>Merge all {combined} entries into your account.</Trans>
              ) : (
                <Trans>
                  Upgrade to Pro to merge all {combined} entries and write without limits.
                </Trans>
              )}
            </BodySm>
          </BaseTouchable>

          {/* Option 2: Keep local, delete server */}
          <BaseTouchable
            onPress={handleKeepLocal}
            disabled={isLoading}
            opacity={isLoading && loading !== 'local' ? DISABLED_OPACITY : 1}
            bg="$surface-subtle"
            rounded="$4"
            p="$4"
            borderWidth={1}
            borderColor="$borderColor"
            gap="$1"
          >
            <XStack justify="space-between" items="center">
              <LabelLg color="$text-emphasis">
                <Trans>Keep local entries</Trans>
              </LabelLg>
              {loading === 'local' ? <Spinner size="small" color="$text-disabled" /> : null}
            </XStack>
            <BodySm color="$text-secondary">
              <Trans>
                Delete your {serverCount} account {serverCount === 1 ? 'entry' : 'entries'} and keep
                your {localCount} local {localCount === 1 ? 'one' : 'ones'}.
              </Trans>
            </BodySm>
          </BaseTouchable>

          {/* Option 3: Keep server, discard local */}
          <BaseTouchable
            onPress={handleKeepServer}
            disabled={isLoading}
            opacity={isLoading ? DISABLED_OPACITY : 1}
            bg="$surface-subtle"
            rounded="$4"
            p="$4"
            borderWidth={1}
            borderColor="$borderColor"
            gap="$1"
          >
            <LabelLg color="$text-emphasis">
              <Trans>Keep account entries</Trans>
            </LabelLg>
            <BodySm color="$text-secondary">
              <Trans>
                Discard your {localCount} local {localCount === 1 ? 'entry' : 'entries'} and
                continue with your {serverCount} saved {serverCount === 1 ? 'one' : 'ones'}.
              </Trans>
            </BodySm>
          </BaseTouchable>

          {/* Option 4: Decide later */}
          <BaseTouchable
            onPress={handleDecideLater}
            disabled={isLoading}
            opacity={isLoading && loading !== 'abort' ? DISABLED_OPACITY : 1}
            py="$3"
            items="center"
          >
            <XStack gap="$2" items="center">
              {loading === 'abort' ? <Spinner size="small" color="$text-disabled" /> : null}
              <LabelMd color="$text-disabled">
                <Trans>Decide later — review local entries first</Trans>
              </LabelMd>
            </XStack>
          </BaseTouchable>
        </YStack>
      </YStack>
    </Modal>
  );
};

export { AnonMergeModal };
