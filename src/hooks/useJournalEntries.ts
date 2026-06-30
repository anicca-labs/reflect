import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/services/supabase';
import { isTransientNetworkError } from '@/src/services/supabase/fetchWithRetry';
import { encryptContent, decryptContent, PREFIX } from '@/src/services/crypto';
import { isOnline } from '@/src/services/network';
import type { JournalEntry } from '@/src/types/journal';
import {
  useSessionStore,
  usePendingJournalStore,
  usePendingDeletionsStore,
  usePendingBookmarksStore,
} from '@/src/stores';
import { flushPendingDeletions, flushPendingBookmarks } from '@/src/services/journalSync';

const QUERY_KEY = ['journal-entries'] as const;

// One-shot guard: the legacy plaintext→encrypted migration must not re-fire on
// every refetch (the read query should stay a pure read). Reset on failure so a
// transient error can retry on the next fetch.
let plaintextMigrationAttempted = false;

const useJournalEntries = () => {
  const isAnonymous = useSessionStore((s) => s.isAnonymous);
  return useQuery({
    queryKey: QUERY_KEY,
    enabled: !isAnonymous,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const raw = data ?? [];

      // Background-migrate any plaintext entries left over from before encryption was added
      const toMigrate = raw.filter((e) => !e.content.startsWith(PREFIX));
      if (toMigrate.length > 0 && !plaintextMigrationAttempted) {
        plaintextMigrationAttempted = true;
        Promise.all(
          toMigrate.map(async (e) => {
            const encrypted = encryptContent(e.content);
            const { error } = await supabase
              .from('journal_entries')
              .update({ content: encrypted })
              .eq('id', e.id);
            if (error) console.error('[encrypt-migration] update failed:', error.message);
          }),
        ).catch((err) => {
          plaintextMigrationAttempted = false;
          console.error('[encrypt-migration] failed:', err);
        });
      }

      return raw.map((e) => ({ ...e, content: decryptContent(e.content) })) as JournalEntry[];
    },
  });
};

type CreateResult = { entry: JournalEntry; queued: boolean };

const useCreateJournalEntry = () => {
  const queryClient = useQueryClient();
  return useMutation({
    // This mutation handles connectivity itself (checks isOnline and queues to
    // the offline outbox). Without 'always', React Query's onlineManager pauses
    // it while offline, so the offline-save code never runs and the Save button
    // spins forever. 'always' lets it run regardless of network state.
    networkMode: 'always',
    mutationFn: async (content: string): Promise<CreateResult> => {
      // Hold the entry locally so it isn't lost; journalSync pushes it once
      // connectivity returns.
      const enqueueOffline = (): CreateResult => ({
        entry: usePendingJournalStore.getState().enqueue(content),
        queued: true,
      });

      // Skip the round-trip when we already know we're offline.
      if (!(await isOnline())) return enqueueOffline();

      try {
        // Resolve the user from the locally-persisted session rather than
        // getUser(): getUser() makes a network round-trip and returns a null
        // user when connectivity is flaky (NetInfo can still report "online"),
        // which surfaced as a spurious "Not authenticated" (REFLECT-A) and
        // dropped the entry. getSession() reads from storage and works offline.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user;
        // No resolvable user (signed out, or session not yet rehydrated): keep
        // the entry in the offline outbox and let the sync flush attach it once
        // a valid session is available, instead of throwing and losing it.
        if (!user) return enqueueOffline();
        const { data, error } = await supabase
          .from('journal_entries')
          .insert({ content: encryptContent(content), user_id: user.id })
          .select()
          .single();
        if (error) throw error;
        return { entry: { ...data, content }, queued: false };
      } catch (err) {
        // Lost the connection mid-save — queue it rather than drop the entry.
        if (isTransientNetworkError(err)) return enqueueOffline();
        throw err;
      }
    },
    onSuccess: ({ entry, queued }) => {
      // Queued entries are surfaced via the pending store + screen merge; only
      // server-confirmed entries belong in the read-query cache.
      if (!queued) {
        queryClient.setQueryData<JournalEntry[]>(QUERY_KEY, (old) => [entry, ...(old ?? [])]);
      }
    },
  });
};

const useUpdateJournalEntry = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase
        .from('journal_entries')
        .update({ content: encryptContent(content), updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, content }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<JournalEntry[]>(QUERY_KEY);
      queryClient.setQueryData<JournalEntry[]>(QUERY_KEY, (old) =>
        (old ?? []).map((e) =>
          e.id === id ? { ...e, content, updated_at: new Date().toISOString() } : e,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
};

const useToggleBookmark = () => {
  return useMutation({
    // Runs regardless of connectivity (it records a durable desired value), so
    // it must never be paused by the offline manager.
    networkMode: 'always',
    mutationFn: async (_vars: { id: string; is_bookmarked: boolean }) => {
      await flushPendingBookmarks();
    },
    onMutate: ({ id, is_bookmarked }) => {
      // Record the desired value; the screens apply it over the server row, so
      // the star flips instantly and a refetch can't revert it (no flicker).
      // flushPendingBookmarks (in mutationFn) writes it to the server when online
      // and drops it once confirmed.
      usePendingBookmarksStore.getState().set(id, is_bookmarked);
    },
  });
};

const useDeleteJournalEntry = () => {
  const queryClient = useQueryClient();
  return useMutation({
    // Runs regardless of connectivity (it records a durable tombstone), so it
    // must never be paused by the offline manager.
    networkMode: 'always',
    mutationFn: async (id: string) => {
      // Tombstone first: this is what makes the delete stick. It survives a
      // refetch, background/foreground and restart, and the screens filter it
      // out — so the row can't be resurrected by a server read before the
      // delete reaches the server. flushPendingDeletions does the actual DELETE
      // now if we're online, or leaves it queued for journalSync otherwise.
      usePendingDeletionsStore.getState().add(id);
      await flushPendingDeletions();
    },
    onMutate: async (id) => {
      // Immediate optimistic removal so the card disappears the instant it's
      // swiped, before the (async) tombstone write settles.
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      queryClient.setQueryData<JournalEntry[]>(QUERY_KEY, (old) =>
        (old ?? []).filter((e) => e.id !== id),
      );
    },
    // No onError revert and no onSettled invalidate: the tombstone keeps the row
    // hidden and retries on the next flush, so reverting would wrongly re-show a
    // row the user deleted, and an invalidate-refetch would just return it
    // (harmless — the screens filter it — but a needless round-trip).
  });
};

export {
  useJournalEntries,
  useCreateJournalEntry,
  useUpdateJournalEntry,
  useToggleBookmark,
  useDeleteJournalEntry,
};
