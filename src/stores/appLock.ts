import { create } from 'zustand';

type AppLockState = {
  isLocked: boolean;
  setLocked: (locked: boolean) => void;
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
}));

export { useAppLockStore };
