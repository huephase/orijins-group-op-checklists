import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'public/sw.js'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['public/**/*.js'], languageOptions: { globals: globals.browser } },
  {
    languageOptions: { globals: globals.node },
    rules: { '@typescript-eslint/consistent-type-imports': 'error' },
  },
);
