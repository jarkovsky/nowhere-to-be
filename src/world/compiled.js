// The parts of the world that are worked out ahead of time: the height field, the ground's colours
// and where the long grass grows (see compile.js). They take the longest to work out and are the
// same on every visit, so when the game is built they are worked out once and kept in a file, and
// a page fetches the file. Where there is no file (in Node, for the tests and for making the file
// itself) or it can't be read, each part is worked out where it is first wanted, as it would be.
import { unpack } from './pack.js';

/* global __WORLD_PACK__ */

async function load() {
  // The address of the file is set when the page is built or served (see scripts/world.mjs).
  const address = typeof __WORLD_PACK__ === 'undefined' ? null : __WORLD_PACK__;
  if (!address || typeof document === 'undefined') return null;
  try {
    const response = await fetch(new URL(address, document.baseURI));
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    let bytes = new Uint8Array(await response.arrayBuffer());
    // The file is gzipped, unless whatever served it has unzipped it already.
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      const unzipped = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      bytes = new Uint8Array(await new Response(unzipped).arrayBuffer());
    }
    return unpack(bytes);
  } catch (error) {
    console.warn('The world is worked out here rather than loaded:', error);
    return null;
  }
}

/** The parts of the world worked out ahead of time, by name, or null where there are none. */
export const compiled = await load();
