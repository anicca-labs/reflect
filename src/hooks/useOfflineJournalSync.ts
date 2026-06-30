import { useEffect } from 'react';
import { AppState } from 'react-native';
import { subscribeToOnline } from '@/src/services/network';
import { flushPendingJournalEntries, flushPendingDeletions } from '@/src/services/journalSync';

/**
 * Drains the offline journal outbox (queued creations AND deletions) to the
 * server. Flushes once on mount (covers a cold start while already online with
 * queued work), on every offline → online transition, and whenever the app
 * returns to the foreground (the device may have reconnected while backgrounded,
 * which NetInfo won't always report). Mount once, high in the tree.
 */
const flushAll = () => {
  flushPendingJournalEntries();
  flushPendingDeletions();
};

const useOfflineJournalSync = () => {
  useEffect(() => {
    flushAll();

    const unsubscribeOnline = subscribeToOnline(flushAll);
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
