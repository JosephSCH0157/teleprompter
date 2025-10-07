// @ts-nocheck
/* eslint-env node */
// ESLint v9 flat config
/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    ignores: ['releases/**', '**/*.min.js', 'node_modules/**', '.vscode/**'],
  },
  {
    files: ['eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
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
    files: ['**/*.js'],
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
      'no-undef': 'error',
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'off',
      // Teleprompter-specific sanity rules
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
  {
    files: [
      'scroll-helpers.js',
      'scroll-control.js',
      'io-anchor.js',
      'help.js',
      'eggs.js',
      'recorders.js',
      'adapters/**/*.js',
    ],
    languageOptions: {
      sourceType: 'module',
    },
  },
  {
    files: ['scroll-control.js'],
    rules: {
      'no-undef': 'off',
    },
  },
  {
    files: ['teleprompter_pro.js'],
    rules: {
      // Large browser IIFE with many window-attached globals
      'no-undef': 'off',
      'no-unused-vars': [
        'warn',
        { varsIgnorePattern: '^_|^camAwaitingAnswer$|^log$', argsIgnorePattern: '^_' },
      ],
    },
  },
];
