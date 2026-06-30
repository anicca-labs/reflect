import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createZustandMmkvStorage } from './utils';
import type { JournalEntry } from '@/src/types/journal';

// Entries an authenticated user saved while the server was unreachable (e.g.
// offline). Held in MMKV so they survive app restarts, and flushed to Supabase
// by journalSync once connectivity returns. IDs carry a recognisable prefix so
// the UI can tell a not-yet-synced entry from a server one.
const PENDING_ID_PREFIX = 'pending-';

const isPendingId = (id: string): boolean => id.startsWith(PENDING_ID_PREFIX);

type PendingJournalStore = {
  entries: JournalEntry[];
  enqueue: (content: string) => JournalEntry;
  remove: (id: string) => void;
  toggleBookmark: (id: string) => void;
  clear: () => void;
};

const usePendingJournalStore = create<PendingJournalStore>()(
  persist(
    (set) => ({
      entries: [],
      enqueue: (content) => {
        const now = new Date().toISOString();
        const entry: JournalEntry = {
          id: `${PENDING_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          user_id: 'pending',
          content,
          is_bookmarked: false,
          created_at: now,
          updated_at: now,
        };
        set((s) => ({ entries: [entry, ...s.entries] }));
        return entry;
      },
      remove: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
      toggleBookmark: (id) =>
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === id ? { ...e, is_bookmarked: !e.is_bookmarked } : e,
          ),
        })),
      clear: () => set({ entries: [] }),
    }),
    {
      name: 'reflect-pending-journal',
      storage: createJSONStorage(() => createZustandMmkvStorage()),
    },
  ),
);

export { usePendingJournalStore, isPendingId, PENDING_ID_PREFIX };
