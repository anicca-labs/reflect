import { create } from 'zustand';

type AppLockState = {
  isLocked: boolean;
  setLocked: (locked: boolean) => void;
  // Flips true once the launch splash animation has finished. The overlay holds
  // the cold-start biometric prompt until then, so Face ID doesn't interrupt the
  // Rive splash. Starts false each runtime; irrelevant to background→foreground
  // locks, which always happen long after the splash is gone.
  splashComplete: boolean;
  setSplashComplete: (done: boolean) => void;
  // True once the user dismisses/fails the OS biometric prompt without
  // authenticating — reveals the manual "Unlock" retry UI. Reset each time the
  // lock re-engages so a fresh cycle starts with just the OS prompt.
  retryVisible: boolean;
  setRetryVisible: (visible: boolean) => void;
};

/**
 * Biometric app-lock state. Intentionally NOT persisted: the lock is a
 * per-runtime gate. `useBiometricLock` engages it when the app leaves the
 * foreground (with an account session + enrolled biometrics) and
 * `BiometricLockOverlay` clears it after a successful Face ID / Touch ID /
 * fingerprint (or device-passcode fallback) on return to the foreground.
 * Persisting it would risk stranding a user behind a prompt across launches.
 */
const useAppLockStore = create<AppLockState>((set) => ({
  isLocked: false,
  // Re-engaging the lock resets the retry UI so each cycle starts with just the
  // branded cover + OS prompt (not our Unlock screen).
  setLocked: (locked) =>
    set(locked ? { isLocked: true, retryVisible: false } : { isLocked: false }),
  splashComplete: false,
  setSplashComplete: (done) => set({ splashComplete: done }),
  retryVisible: false,
  setRetryVisible: (visible) => set({ retryVisible: visible }),
}));

export { useAppLockStore };
