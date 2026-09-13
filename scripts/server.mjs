// Starts a Vite dev server for the browser test and the screenshot script.
import { createServer } from 'vite';

export async function startServer() {
  const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await server.listen();
  const { port } = server.httpServer.address();
  return { url: `http://127.0.0.1:${port}/`, close: () => server.close() };
}
