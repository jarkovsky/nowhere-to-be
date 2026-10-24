import { appendFile, mkdir } from 'node:fs/promises';
import { defineConfig } from 'vite';

/**
 * While developing, notes written in the object viewer are added to artifacts/viewer-notes.md,
 * each with a link to the view it was written about and the problems the checks found there.
 */
function viewerNotes() {
  return {
    name: 'viewer-notes',
    configureServer(server) {
      server.middlewares.use('/__viewer-notes', (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          return response.end();
        }
        let body = '';
        request.on('data', chunk => (body += chunk));
        request.on('end', async () => {
          try {
            const { id, name, link, text, problems = [] } = JSON.parse(body);
            const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
            const found = problems.length ? problems.map(problem => `- ${problem}`).join('\n') : '- none found';
            await mkdir('artifacts', { recursive: true });
            await appendFile(
              'artifacts/viewer-notes.md',
              `## ${name} (${id}), ${when}\n\n${text}\n\n${link}\n\nThe checks found:\n${found}\n\n`,
            );
            response.end('saved');
          } catch (error) {
            response.statusCode = 400;
            response.end(error.message);
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [viewerNotes()],
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
