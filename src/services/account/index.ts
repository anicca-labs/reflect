import { supabase } from '@/src/services/supabase'

// Permanently deletes the signed-in user's account and all their data via the
// `delete-account` edge function, then clears the local session.
const deleteAccount = async (): Promise<void> => {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' })
  if (error) throw error
  await supabase.auth.signOut()
}

export { deleteAccount }
