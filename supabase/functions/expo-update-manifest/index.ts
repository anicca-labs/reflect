// @openapi-internal — device-facing OTA manifest server, not a client API endpoint
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

type Asset = {
  hash: string
  key: string
  contentType: string
  url: string
}

type ExpoUpdate = {
  id: string
  channel: string
  platform: string
  runtime_version: string
  created_at: string
  launch_asset: Asset
  assets: Asset[]
  extra: Record<string, unknown>
  active: boolean
}

function buildMultipart(
  boundary: string,
  parts: Array<{ name: string; contentType: string; body: string }>,
): string {
  const chunks = parts.flatMap((p) => [
    `--${boundary}`,
    `Content-Type: ${p.contentType}`,
    `Content-Disposition: form-data; name="${p.name}"`,
    '',
    p.body,
  ])
  chunks.push(`--${boundary}--`)
  // iOS expo-updates requires CRLF after the closing boundary
  return chunks.join('\r\n') + '\r\n'
}

function noUpdateResponse(): Response {
  const boundary = 'expo-update-boundary'
  return new Response(
    buildMultipart(boundary, [
      {
        name: 'directive',
        contentType: 'application/json',
        body: JSON.stringify({ type: 'noUpdateAvailable' }),
      },
    ]),
    {
      headers: {
        'expo-protocol-version': '1',
        'expo-sfv-version': '0',
        'cache-control': 'no-store, no-cache, must-revalidate',
        'pragma': 'no-cache',
        'expires': '0',
        'content-type': `multipart/mixed; boundary="${boundary}"`,
      },
    },
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const platform = req.headers.get('expo-platform')
  const runtimeVersion = req.headers.get('expo-runtime-version')
  const channel = req.headers.get('expo-channel-name') ?? 'prd'
  const currentUpdateId = req.headers.get('expo-current-update-id')

  if (!platform || !runtimeVersion) {
    return new Response('Missing expo-platform or expo-runtime-version header', { status: 400 })
  }

  if (platform !== 'ios' && platform !== 'android') {
    return new Response('Invalid expo-platform', { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: 'api' },
  })

  const { data: update } = await supabase
    .from('expo_updates')
    .select('*')
    .eq('channel', channel)
    .eq('platform', platform)
    .eq('runtime_version', runtimeVersion)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: ExpoUpdate | null }

  if (!update || update.id === currentUpdateId) {
    return noUpdateResponse()
  }

  const manifest = {
    id: update.id,
    createdAt: new Date(update.created_at).toISOString(),
    runtimeVersion,
    assets: update.assets,
    launchAsset: update.launch_asset,
    metadata: {},
    extra: update.extra,
  }

  const boundary = 'expo-update-boundary'
  return new Response(
    buildMultipart(boundary, [
      {
        name: 'manifest',
        contentType: 'application/json',
        body: JSON.stringify(manifest),
      },
    ]),
    {
      headers: {
        'expo-protocol-version': '1',
        'expo-sfv-version': '0',
        'cache-control': 'no-store, no-cache, must-revalidate',
        'pragma': 'no-cache',
        'expires': '0',
        'content-type': `multipart/mixed; boundary="${boundary}"`,
        'vary': 'expo-current-update-id, expo-channel-name, expo-platform',
      },
    },
  )
})
