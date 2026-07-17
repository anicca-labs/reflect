// @expo/fingerprint config — keeps the OTA runtimeVersion stable against edits that
// don't affect the native binary. Changing this shifts the fingerprint baseline, so it
// must ship with a new full build (binary + OTAs adopt the new hash together).
// NOTE: .gitignore is excluded via .fingerprintignore (the config's ignorePaths does
// NOT reliably drop it); this file handles the non-file source skips.
/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  sourceSkips: [
    'PackageJsonScriptsAll',
    // Exclude version / android.versionCode / ios.buildNumber from the fingerprint.
    // The runtimeVersion must track the NATIVE layer only — a marketing version bump
    // (e.g. 1.1.0 -> 1.2.0) must NOT change it, otherwise OTAs computed after the bump
    // land on a fingerprint no installed binary has and silently reach nobody. Only
    // real native changes (SDK/native deps, plugins, patches) should move the hash.
    'ExpoConfigVersions',
  ],
};
