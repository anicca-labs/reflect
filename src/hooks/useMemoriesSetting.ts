import { useEffect } from 'react';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cancelMemoryNotifications } from '@/src/services/firebase-messaging';

const ENABLED_KEY = '@reflect/memories_enabled';
// Re-exported so useMemoryNotification can gate scheduling on the same key.
const MEMORIES_ENABLED_KEY = ENABLED_KEY;

// Memory notifications ("Remember this?") resurface an OLD entry on the lock
// screen. They shipped always-on with no control, sharing the single Daily
// reminder toggle — but a user wanted the "go write" reminder WITHOUT the
// "here's something you wrote" one (resurfacing a low day unprompted). This is
// their independent switch. Default ON to preserve existing behavior; turning it
// off cancels the whole scheduled batch immediately.
type MemoriesStoreState = {
  enabled: boolean;
  loading: boolean;
  set: (patch: Partial<Omit<MemoriesStoreState, 'set'>>) => void;
};

// Shared store, same reasoning as useReminder: Journal and Settings are sibling
// tabs mounted at once, so a per-hook useState would leave one screen stale.
const useMemoriesStore = create<MemoriesStoreState>((set) => ({
  enabled: true,
  loading: true,
  set: (patch) => set(patch),
}));

let hydrating: Promise<void> | null = null;
const hydrate = (): Promise<void> => {
  if (hydrating) return hydrating;
  hydrating = (async () => {
    const v = await AsyncStorage.getItem(ENABLED_KEY);
    // Absent = never set = default ON (the historical behavior).
    useMemoriesStore.getState().set({ enabled: v !== 'false', loading: false });
  })();
  return hydrating;
};

const useMemoriesSetting = () => {
  const enabled = useMemoriesStore((s) => s.enabled);
  const loading = useMemoriesStore((s) => s.loading);

  useEffect(() => {
    hydrate();
  }, []);

  const setEnabled = async (next: boolean) => {
    useMemoriesStore.getState().set({ enabled: next });
    await AsyncStorage.setItem(ENABLED_KEY, String(next));
    // Turning off must take effect now — up to 30 memory notifications are already
    // scheduled on the device. Turning on reschedules via useMemoryNotification's
    // effect (it re-reads this flag when entries/enabled change).
    if (!next) await cancelMemoryNotifications();
  };

  return { enabled, loading, setEnabled };
};

export { useMemoriesSetting, MEMORIES_ENABLED_KEY };
