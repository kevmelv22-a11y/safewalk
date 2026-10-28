// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // React-Compiler-regels zijn adviserend (geen compiler in gebruik); TS controleert namespaces zelf
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'import/namespace': 'off',
    },
  },
  {
    ignores: ['dist/**', 'admin/**', 'convex/_generated/**', 'node_modules/**', '.expo/**', 'scripts/**', 'web-build/**'],
  },
]);
