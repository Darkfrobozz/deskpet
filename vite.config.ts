import { defineConfig } from 'vite';

// The webview loads either the dev server (tauri dev) or ../dist (tauri build).
// No framework plugin: the pet is a canvas plus a couple of DOM nodes.
export default defineConfig({
  clearScreen: false,
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**', '**/target/**'] },
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    minify: false,
  },
});
