#!/usr/bin/env node
// Reads expo export output from ./dist, uploads bundles + assets to Supabase Storage,
// and registers the update in the api.expo_updates table.
//
// Required env vars (injected by Doppler in CI, or a local .env):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   EXPO_UPDATE_CHANNEL   (stg | prd)
//   EXPO_RUNTIME_VERSION  (e.g. "1.0.0" — must match app.config.ts version)
//   DIST_DIR              (optional, defaults to ./dist)

import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { getConfig } = require('@expo/config');
import path from 'path';
import crypto from 'crypto';
import { pruneOtaUpdates } from './prune-ota-updates.mjs';

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const CHANNEL = requireEnv('EXPO_UPDATE_CHANNEL');
const RUNTIME_VERSION = requireEnv('EXPO_RUNTIME_VERSION');
const DIST_DIR = process.env.DIST_DIR ?? './dist';
const BUCKET = 'expo-updates';

function requireEnv(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function sha256b64(filePath) {
  const content = fs.readFileSync(filePath);
  // expo-updates compares this directly against toBase64Url(downloadedHash) — no sha256: prefix
  return crypto.createHash('sha256').update(content).digest('base64url');
}

function extToContentType(ext) {
  const map = {
    js: 'application/javascript',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ttf: 'font/ttf',
    otf: 'font/otf',
    woff: 'font/woff',
    woff2: 'font/woff2',
    json: 'application/json',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    riv: 'application/octet-stream',
  };
  return map[ext?.toLowerCase()] ?? 'application/octet-stream';
}

async function uploadFile(localPath, storagePath, contentType) {
  const body = fs.readFileSync(localPath);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Storage upload failed [${storagePath}]: ${res.status} ${text}`);
  }
  console.log(`  uploaded ${storagePath}`);
}

async function insertUpdate(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/expo_updates`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      'Content-Profile': 'api',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DB insert failed: ${res.status} ${text}`);
  }
}

async function pushPlatform(platform, metadata, updateId, expoConfig) {
  const platformMeta = metadata.fileMetadata?.[platform];
  if (!platformMeta?.bundle) {
    console.log(`  no ${platform} bundle in export, skipping`);
    return;
  }

  console.log(`\nPublishing ${platform} update ${updateId}...`);
  const prefix = `${CHANNEL}/${updateId}`;
  const storageBase = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;

  // Bundle
  const bundleLocalPath = path.join(DIST_DIR, platformMeta.bundle);
  await uploadFile(bundleLocalPath, `${prefix}/${platformMeta.bundle}`, 'application/javascript');

  // Assets
  const assets = [];
  for (const asset of platformMeta.assets ?? []) {
    const localPath = path.join(DIST_DIR, asset.path);
    if (!fs.existsSync(localPath)) {
      console.warn(`  warn: asset not found, skipping: ${localPath}`);
      continue;
    }
    const contentType = extToContentType(asset.ext);
    await uploadFile(localPath, `${prefix}/${asset.path}`, contentType);
    assets.push({
      hash: sha256b64(localPath),
      // expo-asset's getLocalAssetUri looks up localAssets by bare hash (e.g. "3698fdd…").
      // expo-updates keys localAssets by whatever key we put here, so we must strip the
      // "assets/" prefix — otherwise the key is "assets/3698fdd…" and the lookup misses.
      key: path.basename(asset.path),
      fileExtension: `.${asset.ext}`,
      contentType,
      url: `${storageBase}/${prefix}/${asset.path}`,
    });
  }

  await insertUpdate({
    id: updateId,
    channel: CHANNEL,
    platform,
    runtime_version: RUNTIME_VERSION,
    launch_asset: {
      hash: sha256b64(bundleLocalPath),
      key: platformMeta.bundle,
      fileExtension: path.extname(platformMeta.bundle) || '.bundle',
      contentType: 'application/javascript',
      url: `${storageBase}/${prefix}/${platformMeta.bundle}`,
    },
    assets,
    extra: { expoClient: expoConfig },
    active: true,
  });

  console.log(`  ✓ registered in DB`);
}

async function main() {
  const metadataPath = path.join(DIST_DIR, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    throw new Error(`${metadataPath} not found — run 'yarn expo export --output-dir dist' first`);
  }
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const { exp: expoConfig } = getConfig(process.cwd(), { skipSDKVersionRequirement: true });

  // Each platform gets its own update ID so the manifest server can serve them independently
  await pushPlatform('ios', metadata, crypto.randomUUID(), expoConfig);
  await pushPlatform('android', metadata, crypto.randomUUID(), expoConfig);

  // Prune superseded updates so the storage bucket can't grow unbounded (this is what
  // previously pushed the project over its storage quota). Keeps the newest few per
  // platform for rollback; override with OTA_RETAIN.
  await pruneOtaUpdates();

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
