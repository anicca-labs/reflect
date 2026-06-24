// @expo/fingerprint config — keeps the OTA runtimeVersion stable against edits that
// don't affect the native binary. Changing this shifts the fingerprint baseline, so it
// must ship with a new full build (binary + OTAs adopt the new hash together).
// NOTE: .gitignore is excluded via .fingerprintignore (the config's ignorePaths does
// NOT reliably drop it); this file handles the non-file source skips.
/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  sourceSkips: ['PackageJsonScriptsAll'],
};
