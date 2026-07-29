import { AppState } from 'react-native';
import { create } from 'zustand';

type AppLockState = {
  isLocked: boolean;
  setLocked: (locked: boolean) => void;
  // True while an in-app store sheet (RevenueCat paywall, StoreKit purchase /
  // Apple ID auth) owns the screen. Those sheets push the app through
  // inactive/background even though the user never left it, so the lock ignores
  // AppState while this is set — otherwise dismissing the paywall drops the user
  // straight into a Face ID prompt.
  storeSheetOpen: boolean;
  openStoreSheet: () => void;
  closeStoreSheet: () => void;
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
  storeSheetOpen: false,
  openStoreSheet: () => set({ storeSheetOpen: true }),
  // Clear only once the sheet's AppState round trip has actually finished.
  //
  // Two timing shapes reach this call:
  //  - resolve while inactive/background (iOS paywall dismissing): clear on the
  //    next return to `active`.
  //  - resolve while still `active` (Android's Share.share resolves when the
  //    sheet OPENS, before any backgrounding): give the imminent transition a
  //    short grace window. If it arrives, keep suppressing through the cycle and
  //    clear on return — unless the user genuinely left for a while (e.g. jumped
  //    into the app they shared to), in which case re-engage the lock: the
  //    nuisance we're removing is the quick sheet round trip, not real absence.
  closeStoreSheet: () => {
    // Timing realities this has to survive:
    //  - Android resolves Share.share() when the sheet OPENS (long before any
    //    backgrounding), and the user can dwell in the sheet indefinitely — so
    //    the suppression must span the whole interaction, not a transition.
    //  - The sheet can FLAP active↔background repeatedly while the user
    //    interacts with it (expanding, previews, picking a target) — so the
    //    first return to `active` must NOT finalize; only a settled foreground
    //    does (ACTIVE_SETTLE_MS with no new backgrounding).
    // Security holds regardless: a cycle away longer than REAL_DEPARTURE_MS
    // re-engages the lock once the user is really back.
    const SHEET_TRANSITION_GRACE_MS = 120_000;
    const REAL_DEPARTURE_MS = 30_000;
    const ACTIVE_SETTLE_MS = 1_200;

    let backgroundedAt: number | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    // If nothing ever backgrounds us (sheet dismissed with no AppState churn),
    // clear after the grace window — there was no cycle to ride out.
    const graceTimer = setTimeout(() => {
      if (backgroundedAt === null) {
        sub.remove();
        set({ storeSheetOpen: false });
      }
    }, SHEET_TRANSITION_GRACE_MS);

    const finalize = () => {
      sub.remove();
      clearTimeout(graceTimer);
      const awayMs = backgroundedAt ? Date.now() - ACTIVE_SETTLE_MS - backgroundedAt : 0;
      set(
        awayMs > REAL_DEPARTURE_MS
          ? { storeSheetOpen: false, isLocked: true, retryVisible: false }
          : { storeSheetOpen: false },
      );
    };

    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        backgroundedAt = backgroundedAt ?? Date.now();
        // Mid-sheet flap — cancel any pending finalize and keep suppressing.
        if (settleTimer) {
          clearTimeout(settleTimer);
          settleTimer = null;
        }
        return;
      }
      if (next !== 'active') return;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(finalize, ACTIVE_SETTLE_MS);
    });

    // Called while already away (e.g. iOS paywall resolving mid-dismissal):
    // treat the current absence as the cycle start.
    if (AppState.currentState !== 'active') {
      backgroundedAt = Date.now();
    }
  },
  splashComplete: false,
  setSplashComplete: (done) => set({ splashComplete: done }),
  retryVisible: false,
  setRetryVisible: (visible) => set({ retryVisible: visible }),
}));

export { useAppLockStore };
