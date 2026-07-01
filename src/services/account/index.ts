import { supabase } from '@/src/services/supabase';
import {
  usePendingJournalStore,
  usePendingDeletionsStore,
  usePendingBookmarksStore,
  useSessionStore,
} from '@/src/stores';

// Permanently deletes the signed-in user's account and all their data via the
// `delete-account` edge function, then clears the local session.
const deleteAccount = async (): Promise<void> => {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw error;
  // The account (and its server rows) are gone, so any queued offline work can
  // never sync — drop it and the owner stamp so nothing lingers in MMKV. The
  // outbox is otherwise PRESERVED across sign-out, so this explicit clear is
  // required for a deletion (not a plain sign-out).
  usePendingJournalStore.getState().clear();
  usePendingDeletionsStore.getState().clear();
  usePendingBookmarksStore.getState().clear();
  useSessionStore.getState().setOutboxOwnerId(null);
  await supabase.auth.signOut();
};

export { deleteAccount };
