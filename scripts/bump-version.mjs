#!/usr/bin/env node
// Bump the marketing version in package.json. app.config.ts reads it via
// `config.version`, so this is the single source of truth for the store-facing
// version (CFBundleShortVersionString / versionName).
//
// Usage: node scripts/bump-version.mjs <patch|minor|major>
//
// Run this on `stg` when you start a release; the bump then flows to `main` via
// your normal stg->main merge and triggers the prd store build (package.json is a
// trigger path). versionCode / buildNumber are auto-incremented by EAS
// (eas.json: appVersionSource "remote" + autoIncrement), so you never touch those.
//
// Safe for OTA: fingerprint.config.js skips `ExpoConfigVersions`, so bumping the
// version does NOT change the OTA runtimeVersion fingerprint.
import { readFileSync, writeFileSync } from 'node:fs';

const level = process.argv[2];
if (!['patch', 'minor', 'major'].includes(level)) {
  console.error('Usage: node scripts/bump-version.mjs <patch|minor|major>');
  process.exit(1);
}

const url = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(url, 'utf8'));

const parts = pkg.version.split('.').map(Number);
if (parts.length !== 3 || parts.some(Number.isNaN)) {
  console.error(`Cannot parse semver version: "${pkg.version}"`);
  process.exit(1);
}

const [major, minor, patch] = parts;
const next = {
  patch: [major, minor, patch + 1],
  minor: [major, minor + 1, 0],
  major: [major + 1, 0, 0],
}[level].join('.');

pkg.version = next;
writeFileSync(url, JSON.stringify(pkg, null, 2) + '\n');
console.log(`version: ${pkg.name} ${major}.${minor}.${patch} -> ${next}`);
