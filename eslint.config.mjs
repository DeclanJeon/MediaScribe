import { defineConfig } from 'eslint/config';
import next from 'eslint-config-next';

export default defineConfig([
  {
    ignores: ['dist/**', 'out/**', 'node_modules/**'],
  },
  {
    extends: [...next],
  },
]);
