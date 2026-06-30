import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createZustandMmkvStorage } from './utils';

type PendingMerge = { localCount: number; serverCount: number };

type SessionStoreState = {
  isAnonymous: boolean;
  setAnonymous: () => void;
  clearAnonymous: () => void;
  pendingMerge: PendingMerge | null;
  setPendingMerge: (v: PendingMerge | null) => void;
};

const useSessionStore = create<SessionStoreState>()(
  persist(
    (set) => ({
      isAnonymous: false,
      setAnonymous: () => set({ isAnonymous: true }),
      clearAnonymous: () => set({ isAnonymous: false }),
      pendingMerge: null,
      setPendingMerge: (v) => set({ pendingMerge: v }),
    }),
    {
      name: 'reflect-session',
      storage: createJSONStorage(() => createZustandMmkvStorage()),
      partialize: (state) => ({ isAnonymous: state.isAnonymous }),
    },
  ),
);

type UserStoreKey = 'firstName' | 'lastName';

type UserStoreState = {
  firstName: string | null;
  lastName: string | null;
  setKeyValue: (key: UserStoreKey, value: string | null) => void;
};

/**
 * Minimal user store that satisfies the `@stores` contract expected by
 * `@ksairi-org/react-native-auth-apple` and `@ksairi-org/react-native-auth-google`.
 * The library persistence hooks call `setKeyValue` after a successful social
 * sign-in to cache display-name data.
 */
const useUserStore = create<UserStoreState>((set) => ({
  firstName: null,
  lastName: null,
  setKeyValue: (key, value) => set({ [key]: value }),
}));

type TimeFormat = '12h' | '24h';

type PreferencesStoreState = {
  timeFormat: TimeFormat;
  setTimeFormat: (format: TimeFormat) => void;
  voiceLanguage: string | null;
  setVoiceLanguage: (lang: string | null) => void;
};

type SwipeableStoreState = {
  activeDragCount: number;
  startDrag: () => void;
  endDrag: () => void;
};

const useSwipeableStore = create<SwipeableStoreState>((set) => ({
  activeDragCount: 0,
  startDrag: () => set((s) => ({ activeDragCount: s.activeDragCount + 1 })),
  endDrag: () => set((s) => ({ activeDragCount: Math.max(0, s.activeDragCount - 1) })),
}));

const usePreferencesStore = create<PreferencesStoreState>()(
  persist(
    (set) => ({
      timeFormat: '12h',
      setTimeFormat: (format) => set({ timeFormat: format }),
      voiceLanguage: null,
      setVoiceLanguage: (lang) => set({ voiceLanguage: lang }),
    }),
    {
      name: 'reflect-preferences',
      storage: createJSONStorage(() => createZustandMmkvStorage()),
    },
  ),
);

type PeekStoreState = {
  pendingPeekEntryId: string | null;
  setPendingPeekEntryId: (id: string | null) => void;
};

const usePeekStore = create<PeekStoreState>((set) => ({
  pendingPeekEntryId: null,
  setPendingPeekEntryId: (id) => set({ pendingPeekEntryId: id }),
}));

export { useUserStore, useSwipeableStore, usePreferencesStore, useSessionStore, usePeekStore };
export type { PendingMerge };
export { useAnonymousJournalStore } from './anonymousJournal';
export { usePendingJournalStore, isPendingId, PENDING_ID_PREFIX } from './pendingJournal';
