import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createZustandMmkvStorage } from './utils';

// Tombstones for server entries an authenticated user deleted — held in MMKV so
// the deletion survives a refetch, a background/foreground cycle, and an app
// restart, and is flushed to Supabase by journalSync once connectivity returns.
//
// Why a durable store and not just React Query's optimistic update: while
// offline the actual DELETE is paused, so the only thing removing the row is an
// in-memory cache edit. The next server refetch (on reconnect/focus/restart)
// re-fetches the still-present row and the "deleted" entry reappears. The
// screens filter out any id listed here, so a deleted row stays gone no matter
// what a refetch returns, until the server delete is confirmed and the id is
// dropped.
type PendingDeletionsStore = {
  ids: string[];
  add: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const usePendingDeletionsStore = create<PendingDeletionsStore>()(
  persist(
    (set) => ({
      ids: [],
      add: (id) => set((s) => (s.ids.includes(id) ? {} : { ids: [id, ...s.ids] })),
      remove: (id) => set((s) => ({ ids: s.ids.filter((x) => x !== id) })),
      clear: () => set({ ids: [] }),
    }),
    {
      name: 'reflect-pending-deletions',
      storage: createJSONStorage(() => createZustandMmkvStorage()),
    },
  ),
);

export { usePendingDeletionsStore };
