import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

export default defineConfig({
  // Bungie sends the login back only to an https address: the dev app's is
  // https://localhost:5173/, served with a self-signed certificate (the
  // browser warns once).
  plugins: [basicSsl()],
  server: { port: 5173, strictPort: true },
  // Two pages: the report, and the settings page that edits what it's built
  // from.
  build: { rolldownOptions: { input: ['index.html', 'settings.html'] } },
  // The report's worker is a module worker: sqlite-wasm and minijinja-js
  // start up with a top-level await, which a classic script can't hold.
  worker: { format: 'es' },
  // sqlite-wasm finds its .wasm file next to its own module, which Vite's
  // dependency pre-bundling would move out from under it.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
})
