import { useState } from 'react';
import { Modal } from 'react-native';
import { YStack, XStack, Spinner } from 'tamagui';
import { DisplayLg, BodySm, LabelLg, LabelMd } from '@fonts';
import { BaseTouchable } from '@anicca-labs/ui-touchables';
import { Trans, useLingui } from '@lingui/react/macro';
import { useReminder, useToast } from '@hooks';
import {
  requestNotificationPermission,
  getNotificationPermissionStatus,
} from '@/src/services/firebase-messaging';
import { HEADING_LETTER_SPACING, DISABLED_OPACITY } from '@constants';
import { sizes } from '@theme';

interface ReminderPromptModalProps {
  visible: boolean;
  onClose: () => void;
}

// Shown once, right after the user's first entry. useReminder handles delivery for both
// account types (guests get an on-device schedule, signed-in users the server cron), so
// enabling here is just `toggle` — no branching needed.
const ReminderPromptModal = ({ visible, onClose }: ReminderPromptModalProps) => {
  const [loading, setLoading] = useState(false);
  const { enabled, hour, minute, toggle } = useReminder();
  const { alert } = useToast();
  const { t } = useLingui();

  const timeLabel = new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  const handleEnable = async () => {
    setLoading(true);
    try {
      const status = await getNotificationPermissionStatus();
      const granted = status === 'granted' ? true : await requestNotificationPermission();

      if (!granted) {
        // Denied at the OS level — don't leave them thinking it's on. Settings has the
        // full control (including the deep link) if they change their mind.
        alert({
          title: t`Notifications are off`,
          message: t`Turn them on in Settings whenever you'd like a daily nudge.`,
        });
        onClose();
        return;
      }

      // Guarded: toggle() flips, and we only surface this modal when reminders are off.
      if (!enabled) await toggle(true);
      alert({
        title: t`Reminder set ✦`,
        message: t`We'll nudge you at ${timeLabel}. Change it anytime in Settings.`,
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <YStack flex={1} bg="$background0" opacity={0.98} justify="center" px={sizes.xl}>
        <YStack
          bg="$surface-card"
          rounded="$5"
          p="$5"
          borderWidth={1}
          borderColor="$borderColor"
          gap="$4"
        >
          <YStack gap="$2">
            <DisplayLg color="$text-emphasis" letterSpacing={HEADING_LETTER_SPACING}>
              <Trans>Keep it going</Trans>
            </DisplayLg>
            <BodySm color="$text-secondary">
              <Trans>
                You wrote your first entry. A gentle daily nudge makes it far more likely to become
                a habit.
              </Trans>
            </BodySm>
          </YStack>

          <BaseTouchable
            onPress={handleEnable}
            disabled={loading}
            opacity={loading ? DISABLED_OPACITY : 1}
            bg="$accentBackground"
            rounded="$4"
            p="$4"
            gap="$1"
          >
            <XStack justify="space-between" items="center">
              <LabelLg color="$accentColor">
                <Trans>Remind me at {timeLabel}</Trans>
              </LabelLg>
              {loading ? <Spinner size="small" color="$accentColor" /> : null}
            </XStack>
            <BodySm color="$accentColor" opacity={0.85}>
              <Trans>One quiet reminder a day. Change the time or turn it off anytime.</Trans>
            </BodySm>
          </BaseTouchable>

          <BaseTouchable onPress={onClose} disabled={loading} py="$3" items="center">
            <LabelMd color="$text-secondary">
              <Trans>Not now</Trans>
            </LabelMd>
          </BaseTouchable>
        </YStack>
      </YStack>
    </Modal>
  );
};

export { ReminderPromptModal };
