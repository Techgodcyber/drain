import { defineConfig } from 'eslint/config';
import next from 'eslint-config-next';

export default defineConfig([
  {
    ignores: ['.next/', '.cloudflare/', 'node_modules/', 'public/', 'out/'],
  },
  ...next,
]);
