// @openapi-internal — called by the app (authenticated) after a purchase and on
// sign-in to sync entitlement state immediately, without waiting on the
// RevenueCat webhook. Invoked via supabase.functions.invoke, not the typed SDK.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchProState } from '../_shared/revenuecat.ts';

// Resolves the caller's Pro state from RevenueCat's authoritative API and mirrors
// it into api.entitlements. This is what makes "buy Pro → immediately add an
// entry" work: the server-side limit trigger reads api.entitlements, and the
// webhook that normally populates it lands seconds later — too late for the
// insert that fires right after purchase. This closes that gap synchronously.
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  // Resolve the caller from their JWT — never trust a client-supplied user id.
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) return new Response('Unauthorized', { status: 401 });

  const state = await fetchProState(user.id);
  if (!state) return new Response('RevenueCat unavailable', { status: 502 });

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    db: { schema: 'api' },
  });
  const { error } = await admin.from('entitlements').upsert(
    {
      user_id: user.id,
      is_pro: state.isPro,
      expires_at: state.expiresAt,
      event_type: 'client_refresh',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.error('[refresh-entitlement] upsert failed:', error.message);
    return new Response('Internal error', { status: 500 });
  }

  return new Response(JSON.stringify({ is_pro: state.isPro }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
