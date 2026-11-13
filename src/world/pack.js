// Plain data, with the long runs of numbers in it kept as typed arrays, as one block of bytes and
// back again: how the parts of the world worked out ahead of time (see compile.js) are stored in a
// file and read by the page (see compiled.js). The block starts with its size and a description
// in JSON, in which each typed array is a note of its kind and where its bytes lie further on.

const KINDS = { Float32Array, Float64Array, Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array };
const MAGIC = 0x4c57424e;

/**
 * The bytes of an array of numbers gathered by their place in each number, all the first bytes
 * and then all the second ones, or put back as they were. Numbers close to one another, as
 * heights along a row are, share their leading bytes, so gathered they compress to far less.
 */
function gather(bytes, width, back = false) {
  const count = bytes.length / width;
  const out = new Uint8Array(bytes.length);
  for (let k = 0; k < width; k++) {
    for (let i = 0; i < count; i++) {
      if (back) out[i * width + k] = bytes[k * count + i];
      else out[k * count + i] = bytes[i * width + k];
    }
  }
  return out;
}

/** `value` as bytes. Anything JSON can hold, with typed arrays anywhere inside it. */
export function pack(value) {
  const blocks = [];
  let offset = 0;
  const described = JSON.stringify(value, (_key, item) => {
    if (!ArrayBuffer.isView(item)) return item;
    const kind = item.constructor.name;
    if (!KINDS[kind]) throw new Error(`Cannot pack a ${kind}`);
    const width = item.BYTES_PER_ELEMENT;
    const bytes = new Uint8Array(item.buffer, item.byteOffset, item.byteLength);
    blocks.push(width > 1 ? gather(bytes, width) : bytes);
    const note = { $array: kind, offset, length: item.length };
    offset += item.byteLength;
    return note;
  });
  const header = new TextEncoder().encode(described);
  const out = new Uint8Array(8 + header.length + offset);
  const view = new DataView(out.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, header.length, true);
  out.set(header, 8);
  let at = 8 + header.length;
  for (const block of blocks) {
    out.set(block, at);
    at += block.length;
  }
  return out;
}

/** What pack() was given, from its bytes (an ArrayBuffer or a Uint8Array). */
export function unpack(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 8 || view.getUint32(0, true) !== MAGIC) throw new Error('Not packed world data');
  const size = view.getUint32(4, true);
  const start = 8 + size;
  return JSON.parse(new TextDecoder().decode(bytes.subarray(8, start)), (_key, item) => {
    if (!item || typeof item !== 'object' || !item.$array) return item;
    const Kind = KINDS[item.$array];
    const width = Kind.BYTES_PER_ELEMENT;
    const block = bytes.subarray(start + item.offset, start + item.offset + item.length * width);
    // A copy, so the array starts on a boundary of its own and the file's bytes can be let go of.
    const own = width > 1 ? gather(block, width, true) : block.slice();
    return new Kind(own.buffer, 0, item.length);
  });
}
