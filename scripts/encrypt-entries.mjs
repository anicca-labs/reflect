// One-time migration: encrypts all plaintext journal entries using the app's AES-256-CTR key.
// Run per environment:
//   stg: doppler run --project mobile --config stg -- node scripts/encrypt-entries.mjs
//   prd: doppler run --project mobile --config prd -- node scripts/encrypt-entries.mjs

import { createRequire } from 'module'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const require = createRequire(import.meta.url)
const aesjs = require('aes-js')

const PREFIX = 'enc:v1:'
const IV_BYTES = 16

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const KEY_B64 = process.env.EXPO_PUBLIC_ENTRIES_ENCRYPTION_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !KEY_B64) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EXPO_PUBLIC_ENTRIES_ENCRYPTION_KEY')
  process.exit(1)
}

const encKey = Array.from(Buffer.from(KEY_B64, 'base64'))

const encryptContent = (plaintext) => {
  const iv = crypto.randomBytes(IV_BYTES)
  const counter = new aesjs.Counter(Array.from(iv))
  const aesCtr = new aesjs.ModeOfOperation.ctr(encKey, counter)
  const cipherBytes = aesCtr.encrypt(aesjs.utils.utf8.toBytes(plaintext))
  const combined = Buffer.concat([iv, Buffer.from(cipherBytes)])
  return PREFIX + combined.toString('base64')
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  db: { schema: 'api' },
  auth: { persistSession: false },
})

const { data: entries, error } = await supabase
  .from('journal_entries')
  .select('id, content')
  .not('content', 'like', `${PREFIX}%`)

if (error) { console.error('Fetch failed:', error.message); process.exit(1) }
if (!entries?.length) { console.log('Nothing to encrypt — all done!'); process.exit(0) }

console.log(`Encrypting ${entries.length} entries...\n`)

let ok = 0, fail = 0
for (const entry of entries) {
  const { error: err } = await supabase
    .from('journal_entries')
    .update({ content: encryptContent(entry.content) })
    .eq('id', entry.id)
  if (err) { console.error(`  ✗ ${entry.id}: ${err.message}`); fail++ }
  else { console.log(`  ✓ ${entry.id}`); ok++ }
}

console.log(`\n${ok} encrypted, ${fail} failed`)
