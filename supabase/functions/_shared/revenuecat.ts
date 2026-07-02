// Authoritative Pro state from RevenueCat's V2 API. Shared by revenuecat-webhook
// and refresh-entitlement so the "is this customer Pro?" logic can't drift.
//
// Reads REVENUECAT_API_KEY (V2 secret) and REVENUECAT_PROJECT_ID from the
// function env.
const PRO_ENTITLEMENT = 'pro';

// The /active_entitlements endpoint reports each grant by its INTERNAL id
// (e.g. "entla32e7d9c28"), NOT by the "pro" lookup key. So we resolve the id of
// the entitlement whose lookup_key is "pro" once (cached across warm invocations)
// and match against it. If that resolution ever fails transiently we fall back to
// "any active entitlement" — this app sells a single 'pro' entitlement, so any
// active grant is pro; the fallback keeps a paying user unblocked.
let proEntitlementId: string | null = null;

const resolveProEntitlementId = async (
  projectId: string,
  rcKey: string,
): Promise<string | null> => {
  if (proEntitlementId) return proEntitlementId;
  try {
    const res = await fetch(`https://api.revenuecat.com/v2/projects/${projectId}/entitlements`, {
      headers: { Authorization: `Bearer ${rcKey}` },
    });
    if (!res.ok) return null;
    const body = await res.json();
    const pro = (body.items ?? []).find(
      (e: { lookup_key?: string }) => e.lookup_key === PRO_ENTITLEMENT,
    ) as { id?: string } | undefined;
    proEntitlementId = pro?.id ?? null;
    return proEntitlementId;
  } catch {
    return null;
  }
};

export type ProState = { isPro: boolean; expiresAt: string | null };

// Returns null on a transient RevenueCat failure (caller should 502 / not write).
export const fetchProState = async (userId: string): Promise<ProState | null> => {
  const rcKey = Deno.env.get('REVENUECAT_API_KEY');
  const projectId = Deno.env.get('REVENUECAT_PROJECT_ID');
  if (!rcKey || !projectId) return null;

  const res = await fetch(
    `https://api.revenuecat.com/v2/projects/${projectId}/customers/${userId}/active_entitlements`,
    { headers: { Authorization: `Bearer ${rcKey}` } },
  );
  // 404 = RevenueCat has never seen this customer → definitively not Pro.
  if (!res.ok) return res.status === 404 ? { isPro: false, expiresAt: null } : null;

  const body = await res.json();
  const items = (body.items ?? []) as {
    entitlement_id?: string;
    expires_at?: number | string | null;
  }[];

  const proId = await resolveProEntitlementId(projectId, rcKey);
  const pro = proId ? items.find((e) => e.entitlement_id === proId) : items[0];
  if (!pro) return { isPro: false, expiresAt: null };

  // active_entitlements only returns currently-active grants, so isPro is
  // authoritative. Only trust a future expires_at; otherwise leave it null
  // (= active) so a mis-parse can't mark a paying user expired.
  let expiresAt: string | null = null;
  if (pro.expires_at != null) {
    const d = new Date(pro.expires_at);
    if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) expiresAt = d.toISOString();
  }
  return { isPro: true, expiresAt };
};
