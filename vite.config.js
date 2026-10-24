import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works from any folder (e.g. GitHub Pages).
  base: './',
  server: { host: true },
  preview: { host: true },
  build: {
    rollupOptions: {
      // The game, and the object viewer for looking at everything in it on its own.
      input: { main: 'index.html', viewer: 'viewer.html' },
      // Three.js gets its own chunk so it stays cached between game updates.
      output: { manualChunks: { three: ['three'] } },
    },
    // Three.js alone is a little over 500 kB minified.
    chunkSizeWarningLimit: 700,
  },
});
