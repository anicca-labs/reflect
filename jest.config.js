/** @type {import('jest-expo').JestExpoConfig} */
module.exports = {
  preset: 'jest-expo',
  // RNTL v12.4+ includes its Jest matchers automatically — no extend-expect setup needed.
  transformIgnorePatterns: [
    'node_modules/(?!' +
      [
        '(jest-)?react-native',
        '@react-native(-community)?',
        'expo(nent)?',
        '@expo(nent)?/.*',
        '@expo-google-fonts/.*',
        'react-navigation',
        '@react-navigation/.*',
        '@unimodules/.*',
        'unimodules',
        'sentry-expo',
        '@sentry/.*',
        'native-base',
        'react-native-svg',
        'tamagui',
        '@tamagui/.*',
        'moti',
        '@motify/.*',
        '@gorhom/.*',
        '@shopify/.*',
        'burnt',
        'rive-react-native',
        '@stripe/stripe-react-native',
        '@dev-plugins/.*',
        '@anicca-labs/.*',
      ].join('|') +
      ')',
  ],
  moduleNameMapper: {
    '\\.svg$': '<rootDir>/src/__mocks__/fileMock.js',
  },
};
