import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as jose from 'https://esm.sh/jose@5'

const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID')!
const FIREBASE_CLIENT_EMAIL = Deno.env.get('FIREBASE_CLIENT_EMAIL')!
const FIREBASE_PRIVATE_KEY = Deno.env.get('FIREBASE_PRIVATE_KEY')!.replace(/\\n/g, '\n')
const ADMIN_SECRET = Deno.env.get('ADMIN_PUSH_SECRET')!

async function getFirebaseAccessToken(): Promise<string> {
  const privateKey = await jose.importPKCS8(FIREBASE_PRIVATE_KEY, 'RS256')
  const now = Math.floor(Date.now() / 1000)
  const jwt = await new jose.SignJWT({
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setIssuer(FIREBASE_CLIENT_EMAIL)
    .setAudience('https://oauth2.googleapis.com/token')
    .sign(privateKey)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const { access_token } = await res.json()
  return access_token
}

async function sendPush(
  fcmToken: string,
  accessToken: string,
  title: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: { token: fcmToken, notification: { title, body } } }),
    },
  )
  if (!res.ok) {
    const err = await res.text()
    return { ok: false, error: err }
  }
  return { ok: true }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const secret = req.headers.get('X-Admin-Secret')
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS })
  }

  const { title, body, user_id } = await req.json() as {
    title: string
    body: string
    user_id?: string
  }

  if (!title || !body) {
    return new Response('title and body are required', { status: 400, headers: CORS_HEADERS })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'api' } },
  )

  let query = supabase.from('device_tokens').select('fcm_token, user_id')
  if (user_id) query = query.eq('user_id', user_id)

  const { data: devices, error } = await query
  if (error) return new Response(error.message, { status: 500, headers: CORS_HEADERS })
  if (!devices?.length) {
    return new Response('No matching devices found', { status: 200, headers: CORS_HEADERS })
  }

  const accessToken = await getFirebaseAccessToken()
  const results = await Promise.allSettled(
    devices.map((d) => sendPush(d.fcm_token, accessToken, title, body)),
  )

  const sent = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length
  const failed = results.length - sent

  const message = failed > 0
    ? `Sent ${sent}/${devices.length} (${failed} failed)`
    : `Sent to ${sent} device${sent !== 1 ? 's' : ''}`

  return new Response(message, { status: 200, headers: CORS_HEADERS })
})
