import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { randomUUID } from 'expo-crypto';
import { createZustandMmkvStorage } from './utils';
import type { JournalEntry } from '@/src/types/journal';

// Entries an authenticated user saved while the server was unreachable (e.g.
// offline). Held in MMKV so they survive app restarts, and flushed to Supabase
// by journalSync once connectivity returns.
//
// Each entry is assigned a real UUID up front (the journal_entries.id column is
// a plain uuid with a default, so a client-supplied id is accepted on insert).
// Keeping the id stable across the pending → synced transition lets the UI reuse
// the same React element when the entry lands on the server — no remount, no
// re-animation, no flicker.
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
          id: randomUUID(),
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
      // v0 queued entries used a non-UUID `pending-…` id, which the server's
      // uuid column rejects on upsert. Reissue a real UUID for any such entry so
      // it can sync instead of wedging the queue.
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as { entries?: JournalEntry[] } | undefined;
        if (version < 1 && state?.entries) {
          state.entries = state.entries.map((e) =>
            /^[0-9a-f-]{36}$/i.test(e.id) ? e : { ...e, id: randomUUID() },
          );
        }
        return state as PendingJournalStore;
      },
      storage: createJSONStorage(() => createZustandMmkvStorage()),
    },
  ),
);

export { usePendingJournalStore };
