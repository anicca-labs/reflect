// @openapi-internal — deletes the authenticated user and all their data.
// Deployed with JWT verification ON: Supabase rejects unauthenticated callers
// before this runs. We still read the caller's JWT to resolve their user id,
// then use the service role to remove their data and auth record.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  // Resolve the caller from their JWT
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return new Response('Unauthorized', { status: 401 })

  // Service-role client to delete data + the auth user
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    db: { schema: 'api' },
  })

  const { error: entriesError } = await admin.from('journal_entries').delete().eq('user_id', user.id)
  if (entriesError) return new Response(entriesError.message, { status: 500 })

  const { error: devicesError } = await admin.from('device_tokens').delete().eq('user_id', user.id)
  if (devicesError) return new Response(devicesError.message, { status: 500 })

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) return new Response(deleteError.message, { status: 500 })

  return new Response('ok')
})
