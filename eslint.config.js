const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const prettier = require('eslint-config-prettier');

module.exports = defineConfig([
  {
    ignores: ['dist/*', '.expo', 'node_modules', 'src/i18n/locales/compiled/**'],
  },
  expoConfig,
  {
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      'import/prefer-default-export': 'off',
    },
  },
  // Must be last — disables ESLint rules that conflict with Prettier formatting
  prettier,
]);
