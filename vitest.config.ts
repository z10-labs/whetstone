import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests run in plain Node. Nothing under test touches Electron at import
 * time — modules that need `app` only call it inside functions the tests never
 * reach — so no Electron shim is needed.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
