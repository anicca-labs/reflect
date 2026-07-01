import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createZustandMmkvStorage } from './utils';

// Desired bookmark state for server entries toggled while offline (or in the
// window before the write reaches the server). Held in MMKV so the toggle
// survives a refetch, a background/foreground cycle and an app restart, and is
// flushed to Supabase by journalSync. The screens apply these values over the
// server rows, so a refetch can't momentarily revert the star (no flicker) and a
// paused write can't be lost on app kill. Each id is dropped once its write is
// confirmed on the server.
type PendingBookmarksStore = {
  values: Record<string, boolean>;
  set: (id: string, value: boolean) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const usePendingBookmarksStore = create<PendingBookmarksStore>()(
  persist(
    (set) => ({
      values: {},
      set: (id, value) => set((s) => ({ values: { ...s.values, [id]: value } })),
      remove: (id) =>
        set((s) => {
          if (!(id in s.values)) return {};
          const rest = { ...s.values };
          delete rest[id];
          return { values: rest };
        }),
      clear: () => set({ values: {} }),
    }),
    {
      name: 'reflect-pending-bookmarks',
      storage: createJSONStorage(() => createZustandMmkvStorage()),
    },
  ),
);

export { usePendingBookmarksStore };
