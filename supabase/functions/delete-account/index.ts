// @openapi-internal — deletes the authenticated user and all their data.
// Deployed with JWT verification ON: Supabase rejects unauthenticated callers
// before this runs. We still read the caller's JWT to resolve their user id,
// then use the service role to remove their data and auth record.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  // Resolve the caller from their JWT
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) return new Response('Unauthorized', { status: 401 });

  // Service-role client to delete data + the auth user
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    db: { schema: 'api' },
  });

  // Delete the AUTH USER FIRST. Every user-owned table (journal_entries, reflections,
  // user_settings, entitlements, device_tokens, paywall_views, echo_log,
  // reflection_feedback, share_taps) declares `references auth.users(id) on delete
  // cascade`, so this single call removes everything atomically.
  //
  // The previous order deleted journal_entries, then device_tokens, then the user —
  // three non-transactional steps. If the last one failed the client showed "Couldn't
  // delete account. Please try again" and left the user signed in with every entry
  // ALREADY PERMANENTLY GONE, and no way to tell them. Failing before the cascade
  // leaves the account completely intact instead.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return new Response(deleteError.message, { status: 500 });

  // Belt-and-braces: guest rows aren't owned by the user (user_id is null once the
  // device signs out), so clear anything still pointing at them. A failure here is
  // not worth failing the request — the account is already gone.
  await admin.from('device_tokens').delete().eq('user_id', user.id);

  return new Response('ok');
});
