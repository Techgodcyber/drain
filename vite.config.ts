import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vinext from 'vinext';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'NEXT_PUBLIC_');
  const walletConnectProjectId = env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID;

  if (!walletConnectProjectId) {
    throw new Error(
      'NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID must be set to build the app',
    );
  }

  return {
    define: {
      'process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID': JSON.stringify(
        walletConnectProjectId,
      ),
    },
    plugins: [vinext(), cloudflare()],
    resolve: {
      alias: {
        'drain-runtime-env': fileURLToPath(
          new URL('./src/runtime-env.cloudflare.ts', import.meta.url),
        ),
      },
    },
  };
});
