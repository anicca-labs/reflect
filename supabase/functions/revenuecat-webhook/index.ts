// @openapi-internal — called only by RevenueCat's webhook, not by app clients
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchProState } from '../_shared/revenuecat.ts';

// Mirrors RevenueCat entitlement state into api.entitlements so the database can
// enforce the free-entry limit (see the enforce_free_entry_limit trigger).
//
// Auth: RevenueCat sends a fixed `Authorization` header on every webhook; we
// compare it to REVENUECAT_WEBHOOK_TOKEN. That's the only gate, so this MUST be
// deployed with --no-verify-jwt (no Supabase JWT is present on a RevenueCat call).
//
// IMPORTANT: the webhook body is NOT cryptographically signed — RevenueCat only
// echoes the shared secret. So we do NOT trust the payload's entitlement claim.
// The event is used only to identify WHICH customer changed; we then re-query
// RevenueCat's authoritative API for that customer and write what IT reports.
// This means even a leaked token can't be used to forge a Pro grant.

type RevenueCatEvent = {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  // TRANSFER events carry no app_user_id — the two sides live here instead.
  transferred_from?: string[];
  transferred_to?: string[];
};

// Length-independent constant-time comparison (compares SHA-256 digests, which
// are fixed size, so the length of the expected token isn't leaked via timing).
const secretMatches = async (provided: string, expected: string): Promise<boolean> => {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(provided)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
};

// A RevenueCat app_user_id is this app's Supabase user id (Purchases.logIn).
// Anonymous ids ($RCAnonymousID:…) have no user to map to, so they're ignored.
//
// Returns EVERY affected user, because a TRANSFER changes two of them at once and
// carries no app_user_id at all — it names the parties in transferred_from /
// transferred_to. Those events used to resolve to nothing and be dropped with a 200,
// so a subscription moved between accounts (the normal outcome of restoring on a
// device already signed into another account) left the OLD account is_pro = true
// forever — unlimited entries and reflections without paying — while the new owner
// stayed blocked at the free limit server-side despite the app showing them as Pro.
const resolveUserIds = (event: RevenueCatEvent): string[] => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const candidates = [
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases ?? []),
    ...(event.transferred_from ?? []),
    ...(event.transferred_to ?? []),
  ];
  // Dedupe: aliases routinely repeat app_user_id, and both sides of a transfer can
  // appear more than once.
  return [...new Set(candidates.filter((id): id is string => !!id && uuid.test(id)))];
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const expected = Deno.env.get('REVENUECAT_WEBHOOK_TOKEN');
  const provided = req.headers.get('Authorization') ?? '';
  if (!expected || !(await secretMatches(provided, expected))) {
    return new Response('Unauthorized', { status: 401 });
  }

  let event: RevenueCatEvent;
  try {
    const parsed = await req.json();
    event = parsed?.event ?? {};
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const userIds = resolveUserIds(event);
  // 200 so RevenueCat doesn't retry an event we can't act on (anonymous / test).
  if (userIds.length === 0) return new Response('ignored: no resolvable user', { status: 200 });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'api' } },
  );
  const now = new Date().toISOString();

  // Re-query RevenueCat per user — never trust the (unsigned) payload for the grant.
  // On a transfer this asks about both sides independently, so the loser is written
  // back to not-Pro and the winner is granted, each from RevenueCat's own answer.
  for (const userId of userIds) {
    const state = await fetchProState(userId);
    // Bail on the whole event rather than write a partial result — RC retries, and a
    // half-applied transfer is worse than a late one.
    if (!state) return new Response('RevenueCat unavailable', { status: 502 });

    const { error } = await admin.from('entitlements').upsert(
      {
        user_id: userId,
        is_pro: state.isPro,
        expires_at: state.expiresAt,
        event_type: event.type ?? null,
        updated_at: now,
      },
      { onConflict: 'user_id' },
    );
    if (error) {
      console.error('[revenuecat-webhook] upsert failed for', userId, error.message);
      return new Response('Internal error', { status: 500 });
    }
  }

  return new Response(JSON.stringify({ ok: true, updated: userIds.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
