import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works from any folder (e.g. GitHub Pages).
  base: './',
  server: { host: true },
  preview: { host: true },
  build: {
    // Three.js gets its own chunk so it stays cached between game updates.
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
    // Three.js alone is a little over 500 kB minified.
    chunkSizeWarningLimit: 700,
  },
});
