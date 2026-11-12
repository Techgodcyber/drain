import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'node:url';

const projectDirectory = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    testTimeout: 30000, // 30 seconds for API calls
  },
  resolve: {
    alias: {
      '@': path.resolve(projectDirectory, './src'),
    },
  },
});
