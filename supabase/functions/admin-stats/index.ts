// @openapi-internal — admin-only, not callable from app clients
//
// Daily stats for the admin console (docs/admin/stats.html): the headline numbers
// for one day, the same numbers for the day before (so the console can show a
// delta), the top writers of that day, and a trailing daily series for the chart.
//
// One call returns everything the page needs, because the page is a static file on
// GitHub Pages with no backend of its own. Auth is the SAME X-Admin-Secret as
// admin-push (ADMIN_PUSH_SECRET) — one admin credential for the console, not two.
//
// All aggregation happens in Postgres (api.admin_day_stats / admin_top_writers /
// admin_day_series, migration 20260817000000). This function only resolves the day
// window and shapes the response.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ADMIN_SECRET = Deno.env.get('ADMIN_PUSH_SECRET')!;

// Meta (Facebook) ads — install counts come from the Marketing API, because the
// FB SDK in the app reports attribution straight to Meta and nothing about it ever
// touches our database. Optional: without META_ADS_TOKEN the payload simply has no
// Meta numbers and the console shows no Meta tiles. The token is a System User
// token (business 868854396268027) with ads_read on the ad account.
const META_ADS_TOKEN = Deno.env.get('META_ADS_TOKEN');
// The Reflect ad account (not a secret — it's in every Ads Manager URL).
const META_AD_ACCOUNT = 'act_1019338787467273';

type MetaDay = { installs: number; spend: number };

// Per-day installs + spend for [since, until], keyed by YYYY-MM-DD. Days are cut in
// the AD ACCOUNT's timezone (Meta ignores everyone else's) and recent days keep
// growing for ~2 days as SKAdNetwork postbacks trickle in — both facts the console
// repeats to the human reading the tile.
async function fetchMetaAds(since: string, until: string): Promise<Map<string, MetaDay>> {
  const url = new URL(`https://graph.facebook.com/v23.0/${META_AD_ACCOUNT}/insights`);
  url.searchParams.set('level', 'account');
  url.searchParams.set('fields', 'spend,actions');
  url.searchParams.set('time_increment', '1');
  url.searchParams.set('time_range', JSON.stringify({ since, until }));
  // Default page size is 25 rows; a 90-day series needs one page, not four.
  url.searchParams.set('limit', '200');
  url.searchParams.set('access_token', META_ADS_TOKEN!);

  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error?.message ?? `Meta Graph API ${res.status}`);
  }

  const byDay = new Map<string, MetaDay>();
  type Row = {
    date_start: string;
    spend?: string;
    actions?: { action_type: string; value: string }[];
  };
  for (const row of (body?.data ?? []) as Row[]) {
    const find = (t: string) => row.actions?.find((a) => a.action_type === t)?.value;
    // mobile_app_install is the Ads Manager "App installs" column; omni_app_install
    // is the aggregated fallback on accounts that only report the omni event.
    const installs = Number(find('mobile_app_install') ?? find('omni_app_install') ?? 0);
    // Cents precision is enough and keeps float noise out of the console's deltas.
    const spend = Math.round(Number(row.spend ?? 0) * 100) / 100;
    byDay.set(row.date_start, { installs, spend });
  }
  return byDay;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

type Params = {
  // The day to report on, as YYYY-MM-DD in `tz`. Defaults to today in `tz`.
  day?: string;
  // IANA zone the day boundaries are cut in. The console sends the browser's zone;
  // an unknown name falls back to UTC inside the SQL (api.admin_tz).
  tz?: string;
  // Length of the trailing series ending on `day` (1–90, default 14).
  days?: number;
  // How many top writers to return (1–100, default 10).
  limit?: number;
};

// Today's date in `tz` as YYYY-MM-DD. 'en-CA' formats as ISO, which is exactly the
// shape Postgres wants for a date literal.
function todayIn(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function shiftDay(day: string, deltaDays: number): string {
  // Anchored at noon UTC so a ±1 day step can't be swallowed by a DST transition.
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function readParams(req: Request, body: Params): Params {
  const url = new URL(req.url);
  const q = url.searchParams;
  const num = (v: string | null) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    day: body.day ?? q.get('day') ?? undefined,
    tz: body.tz ?? q.get('tz') ?? undefined,
    days: body.days ?? num(q.get('days')),
    limit: body.limit ?? num(q.get('limit')),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  const secret = req.headers.get('X-Admin-Secret');
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return new Response('Unauthorized', { status: 403, headers: CORS_HEADERS });
  }

  // GET carries its params in the query string; POST may send either (an empty POST
  // body is fine and means "today, browser default").
  let body: Params = {};
  if (req.method === 'POST') {
    try {
      body = (await req.json()) as Params;
    } catch {
      body = {};
    }
  }
  const params = readParams(req, body);

  const tz = params.tz?.trim() || 'UTC';
  const day = params.day?.trim() || todayIn(tz);
  if (!DAY_RE.test(day)) {
    return Response.json(
      { error: `Invalid day "${day}" — expected YYYY-MM-DD` },
      { status: 400, headers: CORS_HEADERS },
    );
  }
  const days = Math.min(Math.max(Math.trunc(params.days ?? 14), 1), 90);
  const limit = Math.min(Math.max(Math.trunc(params.limit ?? 10), 1), 100);
  const prevDay = shiftDay(day, -1);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'api' } },
  );

  // One Meta call covers the whole window the response needs: the series, plus
  // prevDay for the delta (inside the series except when days=1, hence the max).
  // A Meta failure must not take the database numbers down with it, so it resolves
  // to an error string instead of rejecting the Promise.all.
  const metaSince = shiftDay(day, -Math.max(days - 1, 1));
  const [stats, prev, writers, series, meta] = await Promise.all([
    supabase.rpc('admin_day_stats', { p_day: day, p_tz: tz }),
    supabase.rpc('admin_day_stats', { p_day: prevDay, p_tz: tz }),
    supabase.rpc('admin_top_writers', { p_day: day, p_tz: tz, p_limit: limit }),
    supabase.rpc('admin_day_series', { p_end: day, p_days: days, p_tz: tz }),
    META_ADS_TOKEN
      ? fetchMetaAds(metaSince, day).catch((e: Error) => ({ error: e.message }))
      : Promise.resolve(null),
  ]);

  const failed = [stats, prev, writers, series].find((r) => r.error);
  if (failed?.error) {
    return Response.json({ error: failed.error.message }, { status: 500, headers: CORS_HEADERS });
  }

  // Fold the Meta numbers into the same shapes the console already renders: two
  // keys on stats/prev (tiles + delta) and one on each series row (bar tooltips).
  let metaError: string | null = null;
  let statsOut = stats.data as Record<string, unknown> | null;
  let prevOut = prev.data as Record<string, unknown> | null;
  let seriesOut = (series.data ?? []) as Record<string, unknown>[];
  if (meta) {
    if (meta instanceof Map) {
      const at = (d: string) => meta.get(d) ?? { installs: 0, spend: 0 };
      if (statsOut) {
        statsOut = { ...statsOut, meta_installs: at(day).installs, meta_spend: at(day).spend };
      }
      if (prevOut) {
        prevOut = {
          ...prevOut,
          meta_installs: at(prevDay).installs,
          meta_spend: at(prevDay).spend,
        };
      }
      seriesOut = seriesOut.map((row) => ({
        ...row,
        meta_installs: at(String(row.day)).installs,
      }));
    } else {
      metaError = meta.error;
    }
  }

  return Response.json(
    {
      day,
      prev_day: prevDay,
      // The zone the SQL actually used — differs from the request when the name was
      // unknown and fell back to UTC, which the console surfaces.
      tz: (stats.data as { tz?: string } | null)?.tz ?? tz,
      requested_tz: tz,
      is_today: day === todayIn(tz),
      generated_at: new Date().toISOString(),
      stats: statsOut,
      prev: prevOut,
      top_writers: writers.data ?? [],
      series: seriesOut,
      // Set only when a token IS configured but the Graph call failed — the console
      // shows it so a dead token doesn't read as "zero installs, tiles gone".
      meta_ads_error: metaError,
    },
    { headers: CORS_HEADERS },
  );
});
