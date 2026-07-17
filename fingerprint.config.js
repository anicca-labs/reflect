// @expo/fingerprint config — keeps the OTA runtimeVersion stable against edits that
// don't affect the native binary. Changing this shifts the fingerprint baseline, so it
// must ship with a new full build (binary + OTAs adopt the new hash together).
// NOTE: .gitignore is excluded via .fingerprintignore (the config's ignorePaths does
// NOT reliably drop it); this file handles the non-file source skips.
// 2026-07-17: 'ExpoConfigVersions' was temporarily REMOVED. It's a good idea (it stops a
// marketing version bump from moving the fingerprint), BUT it had been added and shipped
// via OTA — not with a new build. Changing this list re-hashes the SAME native layer, so
// every already-installed binary (all on the pre-change hash) got stranded from every OTA
// computed afterward. Reverting restores the installed builds' fingerprint so today's JS
// can reach them. Re-add 'ExpoConfigVersions' ONLY together with the next full build, so
// the binary and its OTAs adopt the new hash from day one.
/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  sourceSkips: ['PackageJsonScriptsAll'],
};
