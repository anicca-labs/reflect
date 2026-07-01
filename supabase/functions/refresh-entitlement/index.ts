// @openapi-internal — called by the app (authenticated) after a purchase and on
// sign-in to sync entitlement state immediately, without waiting on the
// RevenueCat webhook. Invoked via supabase.functions.invoke, not the typed SDK.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PRO_ENTITLEMENT = 'pro';

// Resolves the caller's Pro state from RevenueCat's authoritative API and mirrors
// it into api.entitlements. This is what makes "buy Pro → immediately add a
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

  const rcKey = Deno.env.get('REVENUECAT_API_KEY');
  const projectId = Deno.env.get('REVENUECAT_PROJECT_ID');
  if (!rcKey || !projectId) return new Response('RevenueCat not configured', { status: 500 });

  // The RevenueCat app_user_id is the Supabase user id (Purchases.logIn(userId)).
  const rcRes = await fetch(
    `https://api.revenuecat.com/v2/projects/${projectId}/customers/${user.id}/active_entitlements`,
    { headers: { Authorization: `Bearer ${rcKey}` } },
  );
  if (!rcRes.ok) {
    // 404 = customer not seen by RevenueCat yet (never purchased). Treat as free.
    if (rcRes.status !== 404) return new Response('RevenueCat error', { status: 502 });
  }
  const body = rcRes.ok ? await rcRes.json() : { items: [] };
  const pro = (body.items ?? []).find(
    (e: { entitlement_id?: string; lookup_key?: string }) =>
      e.entitlement_id === PRO_ENTITLEMENT || e.lookup_key === PRO_ENTITLEMENT,
  ) as { expires_at?: number | string | null } | undefined;

  const isPro = !!pro;
  // active_entitlements only returns currently-active grants, so isPro is already
  // authoritative. Parse expires_at when present (RC V2 uses epoch ms); fall back
  // to null (= no known expiry) rather than risk a bad past date that would wrongly
  // block a paying user. The webhook keeps the precise expiry current afterward.
  let expiresAt: string | null = null;
  if (pro?.expires_at != null) {
    const d = new Date(pro.expires_at);
    if (!Number.isNaN(d.getTime())) expiresAt = d.toISOString();
  }

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    db: { schema: 'api' },
  });
  const { error } = await admin.from('entitlements').upsert(
    {
      user_id: user.id,
      is_pro: isPro,
      expires_at: expiresAt,
      event_type: 'client_refresh',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) return new Response(error.message, { status: 500 });

  return new Response(JSON.stringify({ is_pro: isPro }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
