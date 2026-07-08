import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { supabase } from '@/src/services/supabase';
import { usePreferencesStore, useAppLockStore } from '@/src/stores';

/**
 * Engages the biometric app-lock whenever the app leaves the foreground while a
 * real account session is active, biometric lock is enabled, and the device has
 * enrolled biometrics. `BiometricLockOverlay` presents the unlock prompt on the
 * way back to the foreground.
 *
 * Locking on the way *out* (background / inactive) means the sensitive content is
 * already covered in the OS app-switcher snapshot before the OS captures it.
 *
 * Anonymous (account-less) mode is never locked: there is no server-side data to
 * protect, and a user with no enrolled biometrics must not be stranded behind a
 * prompt they can't pass (they'd have no account to recover to anyway).
 */
const useBiometricLock = () => {
  const biometricLockEnabled = usePreferencesStore((s) => s.biometricLockEnabled);
  const setLocked = useAppLockStore((s) => s.setLocked);

  // Read via refs inside the AppState listener so it never needs re-subscribing
  // when the session or capability changes.
  const hasSession = useRef(false);
  const capable = useRef(false);

  // Track whether a real account session exists (anonymous mode has none).
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      hasSession.current = !!data.session?.user;
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      hasSession.current = !!session?.user;
      // Signing out must clear any active lock so the sign-in screen is reachable.
      if (!session?.user) setLocked(false);
    });
    return () => subscription.unsubscribe();
  }, [setLocked]);

  // Only lock when biometrics are actually enrolled — otherwise there'd be no way
  // to unlock (device-passcode fallback still applies at prompt time).
  useEffect(() => {
    let active = true;
    (async () => {
      const [hasHardware, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (active) capable.current = hasHardware && enrolled;
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next !== 'background' && next !== 'inactive') return;
      if (biometricLockEnabled && hasSession.current && capable.current) {
        setLocked(true);
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [biometricLockEnabled, setLocked]);
};

export { useBiometricLock };
