/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

/** Unique per build; the running app compares it with the deployed version.json. */
const BUILD_ID = `${pkg.version}+${Date.now().toString(36)}`;

/** Writes version.json next to index.html so an open app can tell a newer deploy exists. */
function versionFile(): Plugin {
  return {
    name: 'dj-graphyla-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: pkg.version, build: BUILD_ID }) });
    },
  };
}

export default defineConfig({
  // Relative base so the build works on GitHub Pages (/DJ_Graphyla/) and any other host.
  base: './',
  plugins: [react(), versionFile()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
