import { supabase } from '@/src/services/supabase';
import { encryptContent } from '@/src/services/crypto';
import { queryClient } from '@/src/services/queryClient';
import { isTransientNetworkError } from '@/src/services/supabase/fetchWithRetry';
import { usePendingJournalStore } from '@/src/stores';
import type { JournalEntry } from '@/src/types/journal';

const QUERY_KEY = ['journal-entries'] as const;

// The server-side limit trigger raises this exact message; PostgREST surfaces it
// in the error. Used to tell "limit reached" apart from a transient failure.
const isFreeLimitError = (err: unknown): boolean =>
  typeof (err as { message?: unknown })?.message === 'string' &&
  (err as { message: string }).message.includes('free_entry_limit_reached');

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

  // Resolve the user from the local session (no network round-trip); getUser()
  // can return null on a flaky connection and needlessly skip a flush.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return; // signed out — nothing to sync against

  isFlushing = true;
  try {
    // Snapshot oldest-first; re-check membership each iteration in case the
    // entry was deleted from the queue while we were flushing.
    const ordered = [...usePendingJournalStore.getState().entries].reverse();
    for (const item of ordered) {
      if (!usePendingJournalStore.getState().entries.some((e) => e.id === item.id)) continue;
      try {
        // Upsert on the client-assigned id so a retried flush (e.g. the app
        // died after inserting but before dequeuing) is idempotent rather than
        // failing on a duplicate-key violation.
        const { data, error } = await supabase
          .from('journal_entries')
          .upsert(
            {
              id: item.id,
              content: encryptContent(item.content),
              user_id: user.id,
              is_bookmarked: item.is_bookmarked,
              created_at: item.created_at,
              updated_at: item.updated_at,
            },
            { onConflict: 'id' },
          )
          .select()
          .single();
        if (error) throw error;

        const synced: JournalEntry = { ...data, content: item.content };
        // Add the server row to the cache *before* dequeuing. The screens dedupe
        // pending vs. server by id, so while both briefly hold this id only one
        // stable-keyed card renders — no blank frame, no remount, no flicker.
        queryClient.setQueryData<JournalEntry[]>(QUERY_KEY, (old) => {
          const list = old ?? [];
          if (list.some((e) => e.id === synced.id)) return list;
          return [synced, ...list].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          );
        });
        usePendingJournalStore.getState().remove(item.id);
      } catch (err) {
        // The server enforces the free-entry limit (enforce_free_entry_limit
        // trigger). A free user who got entries into the outbox beyond the limit
        // (e.g. their Pro lapsed while offline) will be rejected here. That's not
        // transient and won't resolve by retrying, so stop without logging it as
        // an error — the entries stay queued and will sync if they upgrade.
        if (isFreeLimitError(err)) break;
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
