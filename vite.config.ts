/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/** Facebook's SDK is only loaded in the Instant Games build; the web build runs on the local platform. */
function fbInstantSdk(enabled: boolean): Plugin {
  return {
    name: 'fb-instant-sdk',
    transformIndexHtml(html) {
      return html.replace(
        '<!-- FBINSTANT -->',
        enabled ? '<script src="https://connect.facebook.net/en_US/fbinstant.7.1.js"></script>' : '',
      );
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Relative paths: Facebook serves the bundle from its own CDN path.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [fbInstantSdk(mode === 'fb')],
  build: {
    outDir: mode === 'fb' ? 'dist-fb' : 'dist',
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1024,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
