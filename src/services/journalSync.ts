import { supabase } from '@/src/services/supabase';
import { encryptContent } from '@/src/services/crypto';
import { queryClient } from '@/src/services/queryClient';
import { isTransientNetworkError } from '@/src/services/supabase/fetchWithRetry';
import { usePendingJournalStore } from '@/src/stores';
import type { JournalEntry } from '@/src/types/journal';

const QUERY_KEY = ['journal-entries'] as const;

// A single in-flight flush at a time. The reconnect listener, the app-state
// listener and the on-mount call can all fire near-simultaneously; without this
// guard they'd race and double-insert the same queued entry.
let isFlushing = false;

/**
 * Push queued offline entries to Supabase, oldest first so server ordering
 * matches the order they were written. On the first network failure we stop and
 * leave this entry (and the rest) queued for the next attempt — nothing is
 * dropped. Safe to call repeatedly; concurrent calls are coalesced.
 */
const flushPendingJournalEntries = async (): Promise<void> => {
  if (isFlushing) return;
  if (usePendingJournalStore.getState().entries.length === 0) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return; // signed out — nothing to sync against

  isFlushing = true;
  try {
    // Snapshot oldest-first; re-check membership each iteration in case the
    // entry was deleted from the queue while we were flushing.
    const ordered = [...usePendingJournalStore.getState().entries].reverse();
    for (const item of ordered) {
      if (!usePendingJournalStore.getState().entries.some((e) => e.id === item.id)) continue;
      try {
        const { data, error } = await supabase
          .from('journal_entries')
          .insert({
            content: encryptContent(item.content),
            user_id: user.id,
            is_bookmarked: item.is_bookmarked,
            created_at: item.created_at,
            updated_at: item.updated_at,
          })
          .select()
          .single();
        if (error) throw error;

        const synced: JournalEntry = { ...data, content: item.content };
        usePendingJournalStore.getState().remove(item.id);
        queryClient.setQueryData<JournalEntry[]>(QUERY_KEY, (old) => {
          const list = old ?? [];
          if (list.some((e) => e.id === synced.id)) return list;
          return [synced, ...list].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          );
        });
      } catch (err) {
        // Keep this and the remaining entries queued; retry on the next trigger.
        if (!isTransientNetworkError(err)) {
          console.error('[journal-sync] flush halted on non-transient error:', err);
        }
        break;
      }
    }
  } finally {
    isFlushing = false;
  }
};

export { flushPendingJournalEntries };
