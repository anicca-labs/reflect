import { useEffect } from 'react';
import { AppState } from 'react-native';
import { subscribeToOnline } from '@/src/services/network';
import { flushPendingJournalEntries } from '@/src/services/journalSync';

/**
 * Drains the offline journal outbox to the server. Flushes once on mount (covers
 * a cold start while already online with queued entries), on every offline →
 * online transition, and whenever the app returns to the foreground (the device
 * may have reconnected while backgrounded, which NetInfo won't always report).
 * Mount once, high in the tree.
 */
const useOfflineJournalSync = () => {
  useEffect(() => {
    flushPendingJournalEntries();

    const unsubscribeOnline = subscribeToOnline(flushPendingJournalEntries);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') flushPendingJournalEntries();
    });

    return () => {
      unsubscribeOnline();
      appStateSub.remove();
    };
  }, []);
};

export { useOfflineJournalSync };
