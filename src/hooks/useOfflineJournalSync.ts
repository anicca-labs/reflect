import { useEffect } from 'react';
import { AppState } from 'react-native';
import { subscribeToOnline } from '@/src/services/network';
import {
  flushPendingJournalEntries,
  flushPendingDeletions,
  flushPendingBookmarks,
} from '@/src/services/journalSync';

/**
 * Drains the offline journal outbox (queued creations, deletions AND bookmark
 * toggles) to the server. Flushes once on mount (covers a cold start while online with
 * queued work), on every offline → online transition, and whenever the app
 * returns to the foreground (the device may have reconnected while backgrounded,
 * which NetInfo won't always report). Mount once, high in the tree.
 */
// Deletions go FIRST and are awaited: they free up room under the free-entry limit.
// Flushing concurrently let a queued create reach a server that still held the rows
// the queued deletes were about to remove, so the limit trigger rejected it and the
// create sat unsynced (silently) until the next foreground. Bookmarks are independent
// of the limit, so they can run alongside.
const flushAll = async () => {
  flushPendingBookmarks();
  try {
    await flushPendingDeletions();
  } catch {
    // Never block the creates on a failed delete flush — they retry next trigger.
  }
  await flushPendingJournalEntries();
};

const useOfflineJournalSync = () => {
  useEffect(() => {
    flushAll();

    const unsubscribeOnline = subscribeToOnline(() => {
      flushAll();
    });
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') flushAll();
    });

    return () => {
      unsubscribeOnline();
      appStateSub.remove();
    };
  }, []);
};

export { useOfflineJournalSync };
