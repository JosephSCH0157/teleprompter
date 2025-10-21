// @ts-nocheck
/* eslint-env node */
// ESLint v9 flat config
/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  // Ignore patterns
  {
    ignores: ['releases/**', '**/*.min.js', 'node_modules/**', '.vscode/**'],
  },
  // TypeScript files: enable parser and rules for TS
  // Requires @typescript-eslint/parser and @typescript-eslint/eslint-plugin in devDependencies
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: { project: ['./tsconfig.json'] },
    },
    plugins: { '@typescript-eslint': require('@typescript-eslint/eslint-plugin') },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  },
  // Default: treat all .js files as ES modules so import/export parse by default.
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['warn', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'off',
      'no-restricted-globals': ['error', { name: 'event', message: 'Use explicit event param' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='preventDefault']",
          message: 'Avoid preventDefault unless absolutely necessary',
        },
      ],
      'no-unsafe-optional-chaining': 'error',
      'no-useless-return': 'warn',
    },
  },

  // Tools: Node scripts, CommonJS-style (allow require/process)
  {
    files: ['tools/**/*.js', 'tools/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        require: 'readonly',
        process: 'readonly',
        module: 'writable',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    rules: {
      'no-undef': 'off',
    },
  },

  // Legacy browser scripts: treat a small set of known legacy files as scripts with browser globals
  {
    files: [
      'teleprompter_pro.js',
      'display*.js',
    ],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        alert: 'readonly',
        URLSearchParams: 'readonly',
        IntersectionObserver: 'readonly',
        CSSStyleDeclaration: 'readonly',
        Element: 'readonly',
        Event: 'readonly',
        console: 'readonly',
        BroadcastChannel: 'readonly',
        HUD: 'readonly',
        debug: 'readonly',
        SpeechRecognition: 'writable',
        webkitSpeechRecognition: 'writable',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
      'no-undef': 'off',
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'off',
      'no-restricted-globals': ['error', { name: 'event', message: 'Use explicit event param' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='preventDefault']",
          message: 'Avoid preventDefault unless absolutely necessary',
        },
      ],
      'no-unsafe-optional-chaining': 'error',
      'no-useless-return': 'warn',
    },
  },
  // Config for the config files themselves - eslint.config.js is an ESM wrapper (module),
  // eslint.config.cjs is CommonJS (script)
  {
    files: ['eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        module: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      'no-undef': 'off',
    },
  },
  {
    files: ['eslint.config.cjs'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        module: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      'no-undef': 'off',
    },
  },
  // Note: default module rules above apply; special script overrides (tools, legacy files)
  // will adjust sourceType to 'script' where needed.
  // scroll-control.js: allow undefined (globals injected at runtime)
  // teleprompter_pro.js: allow undefined and some unused vars (special-case)
  {
    files: ['teleprompter_pro.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
      },
    },
    rules: {
      'no-undef': 'off',
      // legacy file uses preventDefault widely and other patterns we don't want to enforce
      'no-restricted-syntax': 'off',
      'no-unused-vars': [
        'warn',
        { varsIgnorePattern: '^_|^camAwaitingAnswer$|^log$', argsIgnorePattern: '^_' },
      ],
    },
  },

  // Legacy UI and helper files: relax the preventDefault restriction and similar
  {
    files: ['debug-tools.js', 'eggs.js', 'help.js', 'ui/**/*.js', 'utils/**/*.js'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
];
