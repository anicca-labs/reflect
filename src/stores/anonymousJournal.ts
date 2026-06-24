import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createZustandMmkvStorage } from './utils';
import type { JournalEntry } from '@/src/types/journal';

type AnonymousJournalStore = {
  entries: JournalEntry[];
  addEntry: (content: string) => JournalEntry;
  deleteEntry: (id: string) => void;
  toggleBookmark: (id: string) => void;
  clearEntries: () => void;
};

const useAnonymousJournalStore = create<AnonymousJournalStore>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (content) => {
        const entry: JournalEntry = {
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          user_id: 'anonymous',
          content,
          is_bookmarked: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        set((s) => ({ entries: [entry, ...s.entries] }));
        return entry;
      },
      deleteEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
      toggleBookmark: (id) =>
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === id ? { ...e, is_bookmarked: !e.is_bookmarked } : e,
          ),
        })),
      clearEntries: () => set({ entries: [] }),
    }),
    {
      name: 'reflect-anonymous-journal',
      storage: createJSONStorage(() => createZustandMmkvStorage()),
    },
  ),
);

export { useAnonymousJournalStore };
