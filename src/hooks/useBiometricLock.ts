import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { supabase } from '@/src/services/supabase';
import { usePreferencesStore, useAppLockStore } from '@/src/stores';

/**
 * Engages the biometric app-lock in two situations, for account sessions only:
 *
 *  1. Cold start with an auto-restored session — the app was killed and reopened
 *     while signed in (the session came back from the Keychain, the user did NOT
 *     just type a password). Re-verifying here closes the force-quit bypass.
 *  2. Return from background — the app left and re-entered the foreground.
 *
 * Locking on the way *out* (background / inactive) also means the sensitive
 * content is already covered in the OS app-switcher snapshot before it's captured.
 *
 * `BiometricLockOverlay` presents the actual Face ID / Touch ID / fingerprint
 * prompt (with device-passcode fallback) whenever the lock is engaged and the app
 * is in the foreground.
 *
 * NOT locked: a fresh interactive sign-in (`SIGNED_IN` — they just authenticated),
 * anonymous (account-less) mode, or a device with no enrolled biometrics (which
 * would otherwise strand the user behind a prompt they can't pass).
 */
const useBiometricLock = () => {
  const setLocked = useAppLockStore((s) => s.setLocked);

  // Read via refs inside the AppState listener so it never needs re-subscribing
  // when the session or capability changes.
  const hasSession = useRef(false);
  const capable = useRef(false);

  useEffect(() => {
    let mounted = true;

    // Resolve device capability and the initial (auto-restored) session, then
    // lock on cold start if we came back already signed in. Ordering matters:
    // we must know `capable` before deciding to lock so we never lock a device
    // that has no way to unlock.
    (async () => {
      const [hasHardware, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!mounted) return;
      capable.current = hasHardware && enrolled;

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      hasSession.current = !!data.session?.user;

      if (
        hasSession.current &&
        capable.current &&
        usePreferencesStore.getState().biometricLockEnabled
      ) {
        setLocked(true);
      }
    })();

    // Keep the session flag current for the AppState listener, and clear the lock
    // on sign-out so the sign-in screen stays reachable. Interactive sign-in
    // (`SIGNED_IN`) deliberately does NOT lock — the user just authenticated.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      hasSession.current = !!session?.user;
      if (!session?.user) setLocked(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [setLocked]);

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next !== 'background' && next !== 'inactive') return;
      if (
        usePreferencesStore.getState().biometricLockEnabled &&
        hasSession.current &&
        capable.current
      ) {
        setLocked(true);
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [setLocked]);
};

export { useBiometricLock };
