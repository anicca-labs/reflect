import { Session } from '@supabase/supabase-js';
import { useRouter, useSegments } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/src/services/supabase';
import { encryptContent } from '@/src/services/crypto';
import { identifyRevenueCatUser, resetRevenueCatUser } from '@/src/services/revenue-cat';
import { upsertDeviceToken } from '@/src/services/user-devices';
import {
  useSessionStore,
  useAnonymousJournalStore,
  usePendingJournalStore,
  usePendingDeletionsStore,
  usePendingBookmarksStore,
} from '@/src/stores';
import { queryClient, persister } from '@/src/services/queryClient';
import {
  flushPendingJournalEntries,
  flushPendingDeletions,
  flushPendingBookmarks,
} from '@/src/services/journalSync';
import { refreshEntitlement } from '@/src/services/entitlements';
import type { JournalEntry } from '@/src/types/journal';

// Set before calling signOut() when the intent is to return to anonymous mode
// rather than navigate to the sign-in screen.
let _keepAnonymousOnSignOut = false;

const signOutToAnonymous = async () => {
  _keepAnonymousOnSignOut = true;
  await supabase.auth.signOut({ scope: 'local' });
};

const FREE_ENTRY_LIMIT = 7;

// iOS Keychain survives app deletion; AsyncStorage does not.
// On a fresh install, purge any stale Keychain session before restoring.
const clearStaleKeychainOnFreshInstall = async () => {
  const installed = await AsyncStorage.getItem('app_installed');
  if (!installed) {
    await supabase.auth.signOut({ scope: 'local' });
    await AsyncStorage.setItem('app_installed', '1');
  }
};

const getServerEntryCount = async (): Promise<number> => {
  const { count } = await supabase
    .from('journal_entries')
    .select('*', { count: 'exact', head: true });
  return count ?? 0;
};

const migrateEntriesToServer = async (entries: JournalEntry[], userId: string) => {
  if (!entries.length) return;
  const rows = [...entries].reverse().map((e) => ({
    user_id: userId,
    content: encryptContent(e.content),
    is_bookmarked: e.is_bookmarked,
    created_at: e.created_at,
    updated_at: e.updated_at,
  }));
  const { error } = await supabase.from('journal_entries').insert(rows);
  if (error) throw error;
};

// Coalesce overlapping runs (a cold-start INITIAL_SESSION and a SIGNED_IN could
// otherwise both fire the decision and double-migrate the same local entries).
let isReconcilingAnon = false;

/**
 * Reconcile anonymous (pre-sign-in) entries into the now-signed-in account.
 * Auto-migrates when the combined count fits the free limit; otherwise raises
 * the merge modal (via pendingMerge) so the user explicitly chooses what to keep.
 *
 * Runs on SIGNED_IN AND on cold-start INITIAL_SESSION. The second call site is
 * what makes the modal "sticky": if the user closes the app while the modal is
 * open (without choosing an option), their local entries are still in the
 * persisted anonymous store — re-running here re-surfaces the modal on the next
 * launch instead of silently defaulting to "keep account" and orphaning that
 * writing. It's a no-op once the merge is resolved (the anonymous store is
 * emptied) or the user returns to anonymous mode ("decide later").
 */
const reconcileAnonymousEntries = async (userId: string) => {
  if (isReconcilingAnon) return;
  const { pendingMerge, setPendingMerge } = useSessionStore.getState();
  if (pendingMerge) return; // modal already up — don't stack a second decision
  const { entries: localEntries } = useAnonymousJournalStore.getState();
  if (localEntries.length === 0) return;

  isReconcilingAnon = true;
  try {
    let serverCount: number;
    try {
      serverCount = await getServerEntryCount();
    } catch {
      // Offline / transient: we can't decide without the authoritative server
      // count. Leave the local entries untouched and re-attempt on the next
      // launch — nothing is migrated or discarded, so no writing is lost.
      return;
    }

    const combined = localEntries.length + serverCount;
    if (combined <= FREE_ENTRY_LIMIT) {
      try {
        await migrateEntriesToServer(localEntries, userId);
        useAnonymousJournalStore.getState().clearEntries();
        queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      } catch {
        // Migration failed (network). Fall back to the modal so the user can retry.
        setPendingMerge({ localCount: localEntries.length, serverCount });
      }
    } else {
      // Over the free limit — the user must explicitly choose what to keep.
      setPendingMerge({ localCount: localEntries.length, serverCount });
    }
  } finally {
    isReconcilingAnon = false;
  }
};

const useAuthSession = () => {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const isRecoveryMode = useRef(false);
  const router = useRouter();
  const segments = useSegments();
  const { isAnonymous, clearAnonymous } = useSessionStore();

  const handleAuthUrl = useCallback(
    async (url: string) => {
      // PKCE flow: Supabase sends ?code= in query params
      const queryParams = new URLSearchParams(url.split('?')[1] ?? '');
      const code = queryParams.get('code');
      const queryType = queryParams.get('type');
      if (code) {
        if (queryType === 'recovery') {
          isRecoveryMode.current = true;
          router.replace('/reset-password');
        }
        await supabase.auth.exchangeCodeForSession(code);
        return;
      }
      // Implicit flow: tokens in hash fragment
      const hashParams = new URLSearchParams(url.split('#')[1] ?? '');
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');
      if (accessToken && refreshToken) {
        if (type === 'recovery') {
          isRecoveryMode.current = true;
          router.replace('/reset-password');
        }
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }
    },
    [router],
  );

  useEffect(() => {
    const init = async () => {
      // Resolve initial URL first — if it's a recovery link, set the flag before
      // setSession(null) triggers the routing effect, preventing a sign-in flash
      const initialUrl = await Linking.getInitialURL();

      const isRecoveryUrl =
        !!initialUrl &&
        (new URLSearchParams(initialUrl.split('#')[1] ?? '').get('type') === 'recovery' ||
          new URLSearchParams(initialUrl.split('?')[1] ?? '').get('type') === 'recovery');

      if (isRecoveryUrl) {
        isRecoveryMode.current = true;
        // Navigate immediately so the reset-password screen shows before the async
        // code exchange — prevents the journal from flashing during cold start
        router.replace('/reset-password');
      }

      // Skip on recovery links: clearStaleKeychainOnFreshInstall fires SIGNED_OUT
      // asynchronously which resets isRecoveryMode even after we re-assert it.
      // Recovery creates a fresh session anyway so clearing stale tokens is unnecessary.
      if (!isRecoveryUrl) await clearStaleKeychainOnFreshInstall();

      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      setSession(s);

      if (initialUrl) await handleAuthUrl(initialUrl);
    };
    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s);

      // Keep the offline outbox keyed to its owner for EVERY session-bearing
      // event (INITIAL_SESSION on cold start, SIGNED_IN, TOKEN_REFRESHED…), not
      // just SIGNED_IN — otherwise a restored session never stamps an owner and a
      // later different sign-in could inherit the previous user's queued work. If
      // a different account appears, drop that work before adopting the outbox.
      if (s?.user) {
        const uid = s.user.id;
        const owner = useSessionStore.getState().outboxOwnerId;
        if (owner && owner !== uid) {
          usePendingJournalStore.getState().clear();
          usePendingDeletionsStore.getState().clear();
          usePendingBookmarksStore.getState().clear();
        }
        useSessionStore.getState().setOutboxOwnerId(uid);
        // Keep this user's server-side entitlement current on cold start
        // (INITIAL_SESSION) as well as sign-in — not just SIGNED_IN — so a
        // returning Pro user whose webhook was ever missed self-heals before the
        // limit trigger sees them. Skipped on TOKEN_REFRESHED to avoid hammering.
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') refreshEntitlement();
        // Re-surface any unresolved anonymous→account merge on cold start. If the
        // user closed the app while the merge modal was open (without choosing),
        // their local entries are still queued in the anonymous store; re-running
        // here re-prompts instead of silently keeping the account copy and
        // orphaning that writing. (SIGNED_IN handles the interactive path below.)
        if (event === 'INITIAL_SESSION') reconcileAnonymousEntries(uid);
      }

      if (event === 'SIGNED_OUT') {
        isRecoveryMode.current = false;
        if (_keepAnonymousOnSignOut) {
          _keepAnonymousOnSignOut = false;
          useSessionStore.getState().setAnonymous();
        } else {
          clearAnonymous();
        }
        resetRevenueCatUser();
        // The offline outbox (unsynced creates/deletes/bookmarks) is intentionally
        // PRESERVED across sign-out. An involuntary sign-out (an expired/revoked
        // refresh token) fires SIGNED_OUT too, and wiping here would silently
        // destroy a user's unsynced writing. It stays keyed to its owner
        // (outboxOwnerId) and is reconciled when the next session appears —
        // flushed if the same user returns, cleared if a different account signs
        // in — and the flushes refuse to sync an outbox owned by another user.
        // Drop the previous user's cached journal entries. Besides not leaking
        // stale data into a signed-out session, this is what makes the memory
        // notification replay land after login: with the cache cleared, the
        // post-login refetch repopulates `entries` (undefined → data), which
        // re-fires the tab-switch effect *after* the auth transition. Without it
        // `entries` never changes across login, the effect doesn't re-run, and
        // the user is left on the journal tab with the peek open out of view.
        queryClient.removeQueries({ queryKey: ['journal-entries'] });
        // Wipe the on-disk copy too. The persister writes on a throttle, so an
        // app kill right after sign-out could otherwise leave the previous
        // user's entries on disk to restore on next launch.
        persister.removeClient();
        return;
      }

      if (event === 'SIGNED_IN' && s?.user) {
        const userId = s.user.id;
        identifyRevenueCatUser(userId);
        upsertDeviceToken(userId);

        // The outbox owner and entitlement refresh are handled in the
        // session-bearing block above. Signing in doesn't trip the periodic flush
        // triggers, so drain any outbox this returning user kept from a previous
        // (e.g. expired) session now.
        flushPendingJournalEntries();
        flushPendingDeletions();
        flushPendingBookmarks();

        // Leaving anonymous mode: reconcile any locally-saved entries into the
        // account — auto-migrate under the free limit, else raise the merge modal.
        clearAnonymous();
        await reconcileAnonymousEntries(userId);
      }
    });

    const linkingSub = Linking.addEventListener('url', ({ url }) => handleAuthUrl(url));

    return () => {
      subscription.unsubscribe();
      linkingSub.remove();
    };
  }, [handleAuthUrl, clearAnonymous, router]);

  useEffect(() => {
    if (session === undefined) return;
    const inAuth =
      segments[0] === 'sign-in' ||
      segments[0] === 'forgot-password' ||
      segments[0] === 'reset-password';
    if (!session && !inAuth && !isAnonymous && !isRecoveryMode.current) router.replace('/sign-in');
    else if (session && inAuth && !isRecoveryMode.current) router.replace('/(tabs)');
  }, [session, segments, router, isAnonymous]);

  return { session };
};

export { useAuthSession, migrateEntriesToServer, signOutToAnonymous };
