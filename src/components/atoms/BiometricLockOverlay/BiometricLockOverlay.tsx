import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { YStack, Spinner } from 'tamagui';
import * as LocalAuthentication from 'expo-local-authentication';
import { BaseTouchable } from '@anicca-labs/ui-touchables';
import { Trans, useLingui } from '@lingui/react/macro';
import { DisplayLg, BodySm, LabelLg } from '@fonts';
import { useAppLockStore } from '@/src/stores';

/**
 * Full-screen cover shown while `useAppLockStore().isLocked` is true. Presents the
 * biometric prompt (Face ID / Touch ID / fingerprint, with device-passcode
 * fallback) and clears the lock on success. Rendered at the root so it sits above
 * all app content — and, because the lock engages on background/inactive, it's
 * already covering the UI in the OS app-switcher snapshot.
 *
 * Auto-prompts once per lock engagement. The biometric system UI itself flips the
 * app to `inactive`/`active`, so re-prompting on every `active` transition would
 * loop; instead we prompt once when a lock is freshly engaged and let the user tap
 * "Unlock" to retry. A successful unlock clears the lock, so the next
 * background→foreground cycle re-engages and re-prompts naturally.
 */
const BiometricLockOverlay = () => {
  const { t } = useLingui();
  const isLocked = useAppLockStore((s) => s.isLocked);
  const setLocked = useAppLockStore((s) => s.setLocked);
  const splashComplete = useAppLockStore((s) => s.splashComplete);
  const [authenticating, setAuthenticating] = useState(false);
  const inFlight = useRef(false);
  const autoPrompted = useRef(false);

  const authenticate = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setAuthenticating(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t`Unlock Reflect`,
        cancelLabel: t`Cancel`,
        // Keep the device-passcode fallback so a failed/unavailable biometric
        // never permanently strands the user out of their own journal.
        disableDeviceFallback: false,
      });
      if (result.success) setLocked(false);
    } finally {
      setAuthenticating(false);
      inFlight.current = false;
    }
  }, [t, setLocked]);

  useEffect(() => {
    if (!isLocked) return;
    // Fresh lock engagement — allow exactly one auto-prompt for this cycle.
    autoPrompted.current = false;

    const tryAutoPrompt = () => {
      if (AppState.currentState !== 'active') return;
      // Hold the cold-start prompt until the splash animation has finished so
      // Face ID doesn't cut over the Rive splash. On resume this is already true.
      if (!useAppLockStore.getState().splashComplete) return;
      if (autoPrompted.current || inFlight.current) return;
      autoPrompted.current = true;
      authenticate();
    };

    // Prompt now if we're already foreground and past the splash; otherwise wait
    // for the return to `active` or for the splash to finish (splashComplete dep).
    tryAutoPrompt();
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') tryAutoPrompt();
    });
    return () => sub.remove();
  }, [isLocked, splashComplete, authenticate]);

  if (!isLocked) return null;

  // Absolute full-screen cover (NOT a Modal): a Modal renders above everything
  // and would hide the splash + can block the Face ID presentation. zIndex 9999
  // sits above the app content but below the splash (zIndex 10000), so the Rive
  // splash plays on top and, once it fades out, reveals this cover underneath —
  // then the prompt fires (gated on splashComplete).
  return (
    <YStack
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      zIndex={9999}
      items="center"
      justify="center"
      bg="$background"
      gap="$3"
      px="$6"
    >
      <DisplayLg>Reflect</DisplayLg>
      <BodySm color="$text-secondary" text="center">
        <Trans>Locked. Verify your identity to continue.</Trans>
      </BodySm>
      <BaseTouchable
        onPress={authenticate}
        disabled={authenticating}
        bg="$accentBackground"
        rounded="$4"
        py="$3"
        px="$6"
        items="center"
        mt="$4"
      >
        {authenticating ? (
          <Spinner color="$accentColor" />
        ) : (
          <LabelLg color="$accentColor">
            <Trans>Unlock</Trans>
          </LabelLg>
        )}
      </BaseTouchable>
    </YStack>
  );
};

export { BiometricLockOverlay };
