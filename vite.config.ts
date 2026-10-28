import { defineConfig } from 'vite'

// sqlite-wasm finds its .wasm file next to its own module, which Vite's
// dependency pre-bundling would move out from under it.
export default defineConfig({
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
})
