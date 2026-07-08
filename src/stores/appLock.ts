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
  setLocked: (locked) => set({ isLocked: locked }),
  splashComplete: false,
  setSplashComplete: (done) => set({ splashComplete: done }),
}));

export { useAppLockStore };
