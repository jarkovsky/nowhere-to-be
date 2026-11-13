// Works out the parts of the world that are plain data ahead of time (see src/world/compile.js)
// and hands them to the page as one gzipped file, so a visit loads them rather than working them
// out again. As a Vite plugin: while developing, the file is made when the page asks for it and
// made again once anything it is worked out from has changed; in a build it goes out with the
// rest, named after what is in it, so a browser can keep it for good. The file is worked out in a
// Node process of its own each time, which starts with nothing left over from the time before.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';

const here = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(here), '..');
/** Where the page asks for the file while developing. */
const DEV_ADDRESS = '__world.bin';

/** Every file under `folder` whose name ends in .js, in a settled order. */
async function sources(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const found = await Promise.all(
    entries.map(entry => {
      const path = join(folder, entry.name);
      return entry.isDirectory() ? sources(path) : entry.name.endsWith('.js') ? [path] : [];
    }),
  );
  return found.flat().sort();
}

/** A name for the world as it stands: it changes when anything the file is worked out from does. */
async function fingerprint(root) {
  const files = [
    ...(await sources(join(root, 'src/world'))),
    ...(await sources(join(root, 'src/core'))),
    join(root, 'package-lock.json'),
    here,
  ];
  const hash = createHash('sha256');
  for (const file of files) hash.update(file.slice(root.length)).update(await readFile(file));
  return hash.digest('hex').slice(0, 12);
}

/** Works the world out and writes it, gzipped, to `file`. */
async function write(root, file) {
  const from = path => import(pathToFileURL(join(root, path)).href);
  const [{ compileWorld }, { pack }] = await Promise.all([from('src/world/compile.js'), from('src/world/pack.js')]);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, gzipSync(pack(compileWorld()), { level: 9 }));
  // The ones made for the world as it was before are no use any more.
  for (const name of await readdir(dirname(file))) {
    if (name.startsWith('world-') && join(dirname(file), name) !== file) await rm(join(dirname(file), name));
  }
}

const making = new Map();

/**
 * The path of the file holding the world of the project at `root` as it stands now. It is kept
 * from one run to the next, and only worked out again once its sources have changed.
 */
export async function compiledWorldFile(root = ROOT) {
  const file = join(root, 'node_modules/.cache/world', `world-${await fingerprint(root)}.bin`);
  if (existsSync(file)) return file;
  // Asked for again while it is being made, the same making answers both.
  if (!making.has(file)) {
    const run = promisify(execFile)(process.execPath, [here, root, file]).then(() => file);
    making.set(
      file,
      run.finally(() => making.delete(file)),
    );
  }
  return making.get(file);
}

/** The Vite plugin: serves the file while developing, and adds it to a build. */
export function compiledWorld() {
  let root = ROOT;
  let built = null;
  return {
    name: 'compiled-world',
    async config(config, { command }) {
      root = resolve(config.root ?? process.cwd());
      if (command !== 'build') return { define: { __WORLD_PACK__: JSON.stringify(DEV_ADDRESS) } };
      // Named after what is in it: while the world stays as it is, so does the name, whatever else changes.
      const source = await readFile(await compiledWorldFile(root));
      const name = createHash('sha256').update(source).digest('hex').slice(0, 12);
      built = { source, fileName: `assets/world-${name}.bin` };
      return { define: { __WORLD_PACK__: JSON.stringify(built.fileName) } };
    },
    configureServer(server) {
      server.middlewares.use(`/${DEV_ADDRESS}`, async (_request, response) => {
        try {
          const source = await readFile(await compiledWorldFile(root));
          response.setHeader('Content-Type', 'application/octet-stream');
          response.setHeader('Cache-Control', 'no-store');
          response.end(source);
        } catch (error) {
          // The page works the world out for itself instead (see src/world/compiled.js).
          server.config.logger.error(
            `The world could not be worked out ahead of time:\n${error.stderr ?? error.stack}`,
          );
          response.statusCode = 500;
          response.end();
        }
      });
    },
    generateBundle() {
      if (built) this.emitFile({ type: 'asset', ...built });
    },
    // The game and the object viewer start fetching the file at once, alongside their scripts.
    transformIndexHtml(_html, { filename }) {
      if (!/(index|viewer)\.html$/.test(filename)) return [];
      const href = built ? built.fileName : DEV_ADDRESS;
      return [{ tag: 'link', attrs: { rel: 'preload', as: 'fetch', href, crossorigin: '' }, injectTo: 'head' }];
    },
  };
}

// Run by itself: node scripts/world.mjs <project folder> <file to write>.
if (process.argv[1] === here) {
  const [root = ROOT, file] = process.argv.slice(2);
  if (!file) throw new Error('Usage: node scripts/world.mjs <project folder> <file to write>');
  await write(resolve(root), resolve(file));
}
