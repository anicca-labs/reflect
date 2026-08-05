import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

// Returning to the app after at least this long away = a natural session break,
// where a silent reload reads as a fresh launch instead of a rug-pull.
const AUTO_APPLY_MIN_BACKGROUND_MS = 5 * 60 * 1000;

type OtaUpdateOptions = {
  // Silently reloadAsync() when the app foregrounds after a real break and an
  // update is already downloaded. canAutoApply gates it (e.g. draft is empty) —
  // checked at apply time, so pass a callback reading current state.
  autoApply?: boolean;
  canAutoApply?: () => boolean;
};

type OtaUpdateState = {
  isUpdateReady: boolean;
  applyUpdate: () => Promise<void>;
};

const useOtaUpdate = (options?: OtaUpdateOptions): OtaUpdateState => {
  const [isUpdateReady, setIsUpdateReady] = useState(false);
  // Refs so the AppState listener (mounted once) always sees current values.
  const readyRef = useRef(false);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    if (__DEV__) return;

    const checkAndFetch = async () => {
      // Already downloaded and waiting to be applied — stop here. checkForUpdateAsync
      // compares against the RUNNING update, so a pending one keeps reporting as
      // available and we re-downloaded the identical bundle on every single
      // foreground: repeated hits on the self-hosted manifest function and the user's
      // cellular data, for nothing, until they happened to reload.
      if (readyRef.current) return;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;
        await Updates.fetchUpdateAsync();
        readyRef.current = true;
        setIsUpdateReady(true);
      } catch {
        // silently ignore — OTA failures should never surface to the user
      }
    };

    checkAndFetch();

    // Long-lived sessions (the app staying warm for days) never cold-start, so
    // they'd never pick up an OTA. Re-check on every foreground, and — when
    // opted in and safe — apply a ready update silently after a real break.
    let backgroundedAt: number | null = null;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundedAt = Date.now();
      if (state !== 'active') return;
      const awayMs = backgroundedAt ? Date.now() - backgroundedAt : 0;
      backgroundedAt = null;
      const opts = optionsRef.current;
      if (
        opts?.autoApply &&
        readyRef.current &&
        awayMs >= AUTO_APPLY_MIN_BACKGROUND_MS &&
        (opts.canAutoApply?.() ?? true)
      ) {
        Updates.reloadAsync().catch(() => {});
        return;
      }
      checkAndFetch();
    });
    return () => sub.remove();
  }, []);

  const applyUpdate = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      // Clear the flag so the banner stops advertising an update it can't apply —
      // it used to stay visible forever, doing nothing when tapped. The bundle is
      // still downloaded, so the next launch picks it up regardless.
      readyRef.current = false;
      setIsUpdateReady(false);
    }
  };

  return { isUpdateReady, applyUpdate };
};

export { useOtaUpdate };
