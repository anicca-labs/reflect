// @openapi-internal — admin-only, not callable from app clients
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getFirebaseAccessToken, sendFcmMessage } from '../_shared/firebase.ts';

const ADMIN_SECRET = Deno.env.get('ADMIN_PUSH_SECRET')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const secret = req.headers.get('X-Admin-Secret');
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return new Response('Unauthorized', { status: 403, headers: CORS_HEADERS });
  }

  const body = (await req.json()) as {
    action?: string;
    title?: string;
    body?: string;
    user_id?: string;
  };

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'api' } },
  );

  if (body.action === 'list') {
    const { data: devices, error } = await supabase
      .from('device_tokens')
      .select('user_id, fcm_token, updated_at')
      .order('updated_at', { ascending: false });

    if (error) return new Response(error.message, { status: 500, headers: CORS_HEADERS });
    if (!devices?.length) return Response.json([], { headers: CORS_HEADERS });

    const {
      data: { users },
      error: authError,
    } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });
    if (authError) return new Response(authError.message, { status: 500, headers: CORS_HEADERS });

    const emailById = Object.fromEntries(users.map((u) => [u.id, u.email ?? u.id]));

    const result = devices.map((d) => ({
      user_id: d.user_id,
      email: emailById[d.user_id] ?? d.user_id,
      fcm_token: d.fcm_token,
      updated_at: d.updated_at,
    }));

    return Response.json(result, { headers: CORS_HEADERS });
  }

  const {
    title,
    body: msgBody,
    user_id,
  } = body as { title: string; body: string; user_id?: string };

  if (!title || !msgBody) {
    return new Response('title and body are required', { status: 400, headers: CORS_HEADERS });
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let query = supabase.from('device_tokens').select('fcm_token, user_id, firebase_project_id');
  if (user_id) {
    if (user_id.includes('@')) {
      const {
        data: { users: authUsers },
        error: authError,
      } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      if (authError) return new Response(authError.message, { status: 500, headers: CORS_HEADERS });
      const match = authUsers.find((u) => u.email === user_id);
      if (!match)
        return new Response(`No user found with email ${user_id}`, {
          status: 404,
          headers: CORS_HEADERS,
        });
      query = query.eq('user_id', match.id);
    } else if (UUID_RE.test(user_id)) {
      query = query.eq('user_id', user_id);
    } else {
      query = query.eq('fcm_token', user_id);
    }
  }

  const { data: devices, error } = await query;
  if (error) return new Response(error.message, { status: 500, headers: CORS_HEADERS });
  if (!devices?.length) {
    return new Response('No matching devices found', { status: 200, headers: CORS_HEADERS });
  }

  // Group by Firebase project to mint one access token per project
  const byProject = Map.groupBy(devices, (d) => d.firebase_project_id ?? 'reflect-8e62d');
  const allResults: {
    idx: number;
    result: { ok: boolean; unregistered?: boolean; error?: string };
  }[] = [];

  for (const [projectId, group] of byProject) {
    const accessToken = await getFirebaseAccessToken(projectId);
    const results = await Promise.allSettled(
      group.map((d) =>
        sendFcmMessage(d.fcm_token, projectId, accessToken, { title, body: msgBody }),
      ),
    );
    results.forEach((r, i) => {
      const idx = devices.indexOf(group[i]);
      allResults.push({
        idx,
        result: r.status === 'fulfilled' ? r.value : { ok: false, error: String(r.reason) },
      });
    });
  }

  allResults.sort((a, b) => a.idx - b.idx);
  const results = allResults.map((r) => r.result);

  const staleTokens = devices.filter((_, i) => results[i].unregistered).map((d) => d.fcm_token);
  if (staleTokens.length > 0) {
    await supabase.from('device_tokens').delete().in('fcm_token', staleTokens);
  }

  const sent = results.filter((r) => r.ok).length;
  const errors = results.flatMap((r, i) => {
    if (!r.ok && !r.unregistered) return [`${devices[i].user_id}: ${r.error}`];
    return [];
  });

  const message =
    errors.length > 0
      ? `Sent ${sent}/${devices.length} (${errors.length} failed)\n${errors.join('\n')}`
      : `Sent to ${sent} device${sent !== 1 ? 's' : ''}`;

  return new Response(message, { status: 200, headers: CORS_HEADERS });
});
