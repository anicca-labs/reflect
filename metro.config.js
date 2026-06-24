const { getDefaultConfig } = require('expo/metro-config');
const { mergeConfig } = require('metro-config');

const defaultConfig = getDefaultConfig(__dirname);
const { assetExts, sourceExts } = defaultConfig.resolver;

/** @type {import('expo/metro-config').MetroConfig} */
const customConfig = {
  resolver: {
    // Remove svg from assets so Metro processes it as source via babel-plugin-inline-import.
    // Add riv for Rive animations.
    assetExts: [...assetExts.filter((ext) => ext !== 'svg'), 'riv'],
    sourceExts: [...sourceExts, 'svg'],
    unstable_enablePackageExports: true,
  },
};

module.exports = mergeConfig(defaultConfig, customConfig);
