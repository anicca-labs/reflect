import { supabase } from '@/src/services/supabase';

/**
 * Ask the server to sync this user's Pro state from RevenueCat into
 * api.entitlements *now*, rather than waiting on the async RevenueCat webhook.
 *
 * The free-entry-limit trigger reads api.entitlements. Right after a purchase the
 * client knows it's Pro (RevenueCat SDK) but the webhook that writes the
 * entitlement row lands a few seconds later — too late for the insert/migrate
 * that fires immediately after buying. Calling this first closes that gap so a
 * user can use what they just paid for without a spurious "limit reached".
 *
 * Best-effort: callers should proceed even if it throws (the webhook remains the
 * eventual backstop). Uses the caller's session automatically.
 */
export const refreshEntitlement = async (): Promise<void> => {
  try {
    await supabase.functions.invoke('refresh-entitlement', { method: 'POST' });
  } catch {
    // Non-fatal — the RevenueCat webhook reconciles entitlement state anyway.
  }
};
