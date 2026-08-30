// ESLint flat config. Replaces .eslintrc.cjs + .eslintignore: ESLint 10 removed
// eslintrc support, the --ext flag and the .eslintignore file.
//
// The .vue block names vue-eslint-parser explicitly. In ESLint 10 any later
// config that declares languageOptions resets `parser` to the default espree,
// so relying on the plugin preset to supply it silently turns every .vue file
// into "Parsing error: Unexpected token <".
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

// Previously the `globals` block in .eslintrc.cjs.
const projectGlobals = {
  ...globals.node,
  ...globals.browser,
  ga: 'readonly', // Google Analytics
  cordova: 'readonly',
  __statics: 'readonly',
  __QUASAR_SSR__: 'readonly',
  __QUASAR_SSR_SERVER__: 'readonly',
  __QUASAR_SSR_CLIENT__: 'readonly',
  __QUASAR_SSR_PWA__: 'readonly',
  process: 'readonly',
  Capacitor: 'readonly',
  chrome: 'readonly',
};

// Previously the `rules` block in .eslintrc.cjs.
const projectRules = {
  'prefer-promise-reject-errors': 'off',
  // allow debugger during development only
  'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
};

export default [
  {
    // Previously .eslintignore, kept to the same set: narrowing it would
    // silently drop functions/ and the browser extensions from linting.
    ignores: [
      'dist/**',
      '.quasar/**',
      'node_modules/**',
      'src-capacitor/**',
      'src-cordova/**',
      'quasar.config.*.temporary.compiled*',
    ],
  },

  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      // 'latest' rather than the old 2021: test/firestore-rules.test.mjs uses
      // top-level await, which is ES2022.
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: projectGlobals,
    },
    rules: projectRules,
  },

  {
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: projectGlobals,
    },
    rules: projectRules,
  },

  // Installs vue-eslint-parser for .vue — nothing after this may redefine
  // languageOptions.parser for those files.
  ...pluginVue.configs['flat/essential'],

  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: projectGlobals,
    },
    rules: projectRules,
  },

  {
    // Replaces the file's own /* eslint-env serviceworker */, which ESLint 9
    // stopped supporting. The service worker runs in a worker global scope.
    files: ['src-pwa/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.serviceworker, ...globals.browser },
    },
    rules: projectRules,
  },

  // Last, so formatting rules never fight Prettier.
  prettierConfig,
];
