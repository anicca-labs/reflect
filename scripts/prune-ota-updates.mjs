#!/usr/bin/env node
// Deletes old OTA updates so the expo-updates bucket doesn't grow unbounded.
//
// The manifest server (supabase/functions/expo-update-manifest) only ever serves the
// single latest active update per (channel, platform, runtime_version). Every older
// update — its bundle + its full copy of every asset — is dead weight in storage.
// This prunes everything except the newest RETAIN updates per platform, removing both
// the storage objects and the api.expo_updates rows.
//
// Runs standalone:
//   doppler run --project mobile --config stg -- node scripts/prune-ota-updates.mjs
//   doppler run --project mobile --config prd -- node scripts/prune-ota-updates.mjs
// and is also invoked automatically at the end of push-ota-update.mjs.
//
// Required env vars (injected by Doppler):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   EXPO_UPDATE_CHANNEL          (stg | prd)
// Optional:
//   OTA_RETAIN                   how many recent updates to keep per platform (default 2)

const BUCKET = 'expo-updates';

function requireEnv(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const CHANNEL = requireEnv('EXPO_UPDATE_CHANNEL');
// Keep a couple by default so there's a rollback target; set OTA_RETAIN=1 to keep only
// the live update.
const RETAIN = Math.max(1, parseInt(process.env.OTA_RETAIN ?? '2', 10));

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    apikey: SERVICE_ROLE_KEY,
    ...extra,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The storage API occasionally returns 504/429 under load; retry transient failures with
// exponential backoff so a single slow request doesn't abort a long prune.
async function fetchRetry(url, opts, tries = 5) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, opts);
      if (res.status < 500 && res.status !== 429) return res;
      lastErr = new Error(`${res.status} ${await res.text()}`);
    } catch (err) {
      lastErr = err;
    }
    if (attempt < tries) await sleep(500 * 2 ** (attempt - 1));
  }
  throw lastErr;
}

// Returns the update IDs to delete: every update for this channel except the newest
// RETAIN per platform.
async function staleUpdateIds() {
  const res = await fetchRetry(
    `${SUPABASE_URL}/rest/v1/expo_updates?channel=eq.${CHANNEL}&select=id,platform,created_at&order=created_at.desc`,
    { headers: authHeaders({ 'Accept-Profile': 'api' }) },
  );
  if (!res.ok) throw new Error(`Failed to list updates: ${res.status} ${await res.text()}`);
  const rows = await res.json();

  const keptPerPlatform = {};
  const stale = [];
  for (const row of rows) {
    const seen = (keptPerPlatform[row.platform] ??= 0);
    if (seen < RETAIN) keptPerPlatform[row.platform] = seen + 1;
    else stale.push(row.id);
  }
  return stale;
}

// All storage object paths under a folder, walked recursively. The Storage list API is
// non-recursive (folders come back with id === null), so we descend into each one. The
// storage schema isn't exposed via PostgREST, so this native API is the only option.
async function listObjectsRecursive(prefix) {
  const out = [];
  const limit = 1000;
  let offset = 0;
  for (;;) {
    const res = await fetchRetry(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefix, limit, offset }),
    });
    if (!res.ok) throw new Error(`Failed to list objects: ${res.status} ${await res.text()}`);
    const items = await res.json();
    for (const item of items) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) out.push(...(await listObjectsRecursive(full)));
      else out.push(full);
    }
    if (items.length < limit) break;
    offset += limit;
  }
  return out;
}

const objectPathsForUpdate = (updateId) => listObjectsRecursive(`${CHANNEL}/${updateId}`);

async function deleteObjects(paths) {
  // Storage bulk-delete removes both the row and the backing bytes (a raw DELETE on
  // storage.objects would orphan the file in the storage backend).
  for (let i = 0; i < paths.length; i += 1000) {
    const batch = paths.slice(i, i + 1000);
    const res = await fetchRetry(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: batch }),
    });
    if (!res.ok) throw new Error(`Storage delete failed: ${res.status} ${await res.text()}`);
  }
}

async function deleteUpdateRow(updateId) {
  const res = await fetchRetry(`${SUPABASE_URL}/rest/v1/expo_updates?id=eq.${updateId}`, {
    method: 'DELETE',
    headers: authHeaders({ 'Content-Profile': 'api', Prefer: 'return=minimal' }),
  });
  if (!res.ok) throw new Error(`DB delete failed: ${res.status} ${await res.text()}`);
}

export async function pruneOtaUpdates() {
  const stale = await staleUpdateIds();
  if (stale.length === 0) {
    console.log(`OTA prune (${CHANNEL}): nothing to remove (retain=${RETAIN}).`);
    return;
  }

  console.log(
    `OTA prune (${CHANNEL}): removing ${stale.length} update(s), keeping newest ${RETAIN}/platform...`,
  );
  let objCount = 0;
  let done = 0;
  for (const id of stale) {
    const paths = await objectPathsForUpdate(id);
    if (paths.length) {
      await deleteObjects(paths);
      objCount += paths.length;
    }
    // Delete the row only after its objects are gone, so an interrupted run can be
    // safely re-run: remaining rows still point at whatever objects survived.
    await deleteUpdateRow(id);
    done += 1;
    if (done % 25 === 0) console.log(`  ...${done}/${stale.length} updates pruned`);
  }
  console.log(
    `OTA prune (${CHANNEL}): deleted ${objCount} storage object(s) and ${done} DB row(s).`,
  );
}

// Run directly (not when imported by push-ota-update.mjs).
if (import.meta.url === `file://${process.argv[1]}`) {
  pruneOtaUpdates().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
