import ts from 'typescript-eslint';
import globals from 'globals';
export default ts.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/public/runtime/**',
      '**/public/engine-worker.js',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  ...ts.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.worker } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
