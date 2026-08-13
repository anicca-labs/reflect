// @expo/fingerprint config — keeps the OTA runtimeVersion stable against edits that
// don't affect the native binary. Changing this shifts the fingerprint baseline, so it
// must ship with a new full build (binary + OTAs adopt the new hash together).
// NOTE: .gitignore is excluded via .fingerprintignore (the config's ignorePaths does
// NOT reliably drop it); this file handles the non-file source skips.
//
// 'ExpoConfigVersions' history — read this before touching the list:
//
// 2026-07-17: REMOVED. The skip is correct in principle, but it had been added and
// shipped via OTA rather than with a build. Changing this list re-hashes the SAME
// native layer, so every installed binary (all on the pre-change hash) was stranded
// from every OTA computed afterward. Reverting restored the installed fingerprint.
//
// 2026-08-10: RE-ADDED, on the branch that carries the next full build — the only
// safe way to do it. Rationale for wanting it at all: the fingerprint answers one
// question, "can this JS run on this binary?", which is about native capability.
// A marketing version string has no bearing on that, and including it conflates
// "which release is this" with "what native surface does it have". The version is
// already tracked unambiguously in CFBundleShortVersionString / versionName.
//
// Leaving it out cost real reach twice in one week with no safety benefit: bumping
// 1.2.0 -> 1.3.0 stranded the entire production fleet from OTAs (no incompatibility
// existed — the JS was fine), and did the same to a stg test device. The guardrail
// was firing on something it was never designed to guard.
//
// SEQUENCING IS NOT OPTIONAL: this config is shared by both channels, so turning it
// on strands whichever channel is NOT rebuilt. It must land in a coordinated stg AND
// prd release. Do not merge this branch and publish an OTA before both binaries ship.
/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  sourceSkips: ['PackageJsonScriptsAll', 'ExpoConfigVersions'],
};
