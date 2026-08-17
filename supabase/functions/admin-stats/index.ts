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

  const [stats, prev, writers, series] = await Promise.all([
    supabase.rpc('admin_day_stats', { p_day: day, p_tz: tz }),
    supabase.rpc('admin_day_stats', { p_day: prevDay, p_tz: tz }),
    supabase.rpc('admin_top_writers', { p_day: day, p_tz: tz, p_limit: limit }),
    supabase.rpc('admin_day_series', { p_end: day, p_days: days, p_tz: tz }),
  ]);

  const failed = [stats, prev, writers, series].find((r) => r.error);
  if (failed?.error) {
    return Response.json({ error: failed.error.message }, { status: 500, headers: CORS_HEADERS });
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
      stats: stats.data,
      prev: prev.data,
      top_writers: writers.data ?? [],
      series: series.data ?? [],
    },
    { headers: CORS_HEADERS },
  );
});
