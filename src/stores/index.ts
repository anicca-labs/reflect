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
  // Set when an anonymous user taps a "Sign in for Pro" CTA. Carries that intent
  // across the sign-in round trip so the paywall auto-presents once they land on
  // the journal, instead of the Pro intent being silently dropped at sign-in.
  // Intentionally NOT persisted: an app kill mid-flow should drop it rather than
  // pop an unexpected paywall on some later, unrelated sign-in.
  proIntent: boolean;
  setProIntent: (v: boolean) => void;
  // The user id that owns the persisted offline outbox (pending creates/deletes/
  // bookmarks). Lets the outbox survive an involuntary sign-out (expired token)
  // and sync when the same user returns, while never leaking into a different
  // account signed in on the same device.
  outboxOwnerId: string | null;
  setOutboxOwnerId: (id: string | null) => void;
};

const useSessionStore = create<SessionStoreState>()(
  persist(
    (set) => ({
      isAnonymous: false,
      setAnonymous: () => set({ isAnonymous: true }),
      clearAnonymous: () => set({ isAnonymous: false }),
      pendingMerge: null,
      setPendingMerge: (v) => set({ pendingMerge: v }),
      proIntent: false,
      setProIntent: (v) => set({ proIntent: v }),
      outboxOwnerId: null,
      setOutboxOwnerId: (id) => set({ outboxOwnerId: id }),
    }),
    {
      name: 'reflect-session',
      storage: createJSONStorage(() => createZustandMmkvStorage()),
      partialize: (state) => ({
        isAnonymous: state.isAnonymous,
        outboxOwnerId: state.outboxOwnerId,
      }),
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
export { usePendingJournalStore } from './pendingJournal';
export { usePendingDeletionsStore } from './pendingDeletions';
export { usePendingBookmarksStore } from './pendingBookmarks';
