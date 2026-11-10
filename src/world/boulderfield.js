// The tops of the boulders, as a surface the tyres can ride over. Each boulder is a copy of one of a
// few shapes, set down by a matrix. When something first asks for the height over one, its triangles
// are flattened onto a fine grid of the highest point over each spot, and heights are read from that.

/** The most grid points along the longer side of a boulder, and the closest they are ever put (m). */
const GRID = 96;
const FINEST = 0.03;
/** Boulders are listed in the square cells their footprint touches, so a point only checks the few near it. */
const CELL = 4;
const cellKey = (cx, cz) => cx * 65536 + cz;

/** One boulder: its shape, where the matrix puts it, and (once wanted) the grid of its top. */
class Boulder {
  constructor(shape, elements) {
    this.shape = shape;
    this.e = Array.from(elements);
    const e = this.e;
    const p = shape.position;
    let [x0, x1, z0, z1, top, low] = [Infinity, -Infinity, Infinity, -Infinity, -Infinity, Infinity];
    for (let i = 0; i < p.length; i += 3) {
      const x = e[0] * p[i] + e[4] * p[i + 1] + e[8] * p[i + 2] + e[12];
      const y = e[1] * p[i] + e[5] * p[i + 1] + e[9] * p[i + 2] + e[13];
      const z = e[2] * p[i] + e[6] * p[i + 1] + e[10] * p[i + 2] + e[14];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
      if (y > top) top = y;
      if (y < low) low = y;
    }
    Object.assign(this, { x0, x1, z0, z1, top, low });
    this.grid = null;
  }

  /** Lays the triangles down on the grid, keeping the highest point over each grid point. */
  rasterise() {
    const { e, x0, z0 } = this;
    const { position: p, index } = this.shape;
    const d = Math.max(FINEST, Math.max(this.x1 - x0, this.z1 - z0) / GRID);
    const nx = Math.ceil((this.x1 - x0) / d) + 1;
    const nz = Math.ceil((this.z1 - z0) / d) + 1;
    const grid = new Float32Array(nx * nz).fill(NaN);
    const at = new Float64Array(p.length);
    for (let i = 0; i < p.length; i += 3) {
      at[i] = (e[0] * p[i] + e[4] * p[i + 1] + e[8] * p[i + 2] + e[12] - x0) / d;
      at[i + 1] = e[1] * p[i] + e[5] * p[i + 1] + e[9] * p[i + 2] + e[13];
      at[i + 2] = (e[2] * p[i] + e[6] * p[i + 1] + e[10] * p[i + 2] + e[14] - z0) / d;
    }
    for (let t = 0; t < index.length; t += 3) {
      const [a, b, c] = [index[t] * 3, index[t + 1] * 3, index[t + 2] * 3];
      const [ax, az, bx, bz, cx, cz] = [at[a], at[a + 2], at[b], at[b + 2], at[c], at[c + 2]];
      const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
      if (Math.abs(area) < 1e-12) continue;
      const i0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx)));
      const i1 = Math.min(nx - 1, Math.floor(Math.max(ax, bx, cx)));
      const j0 = Math.max(0, Math.ceil(Math.min(az, bz, cz)));
      const j1 = Math.min(nz - 1, Math.floor(Math.max(az, bz, cz)));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const wa = ((bx - i) * (cz - j) - (cx - i) * (bz - j)) / area;
          const wb = ((cx - i) * (az - j) - (ax - i) * (cz - j)) / area;
          const wc = 1 - wa - wb;
          if (wa < -1e-9 || wb < -1e-9 || wc < -1e-9) continue;
          const y = wa * at[a + 1] + wb * at[b + 1] + wc * at[c + 1];
          // A grid point nothing has landed on yet holds NaN, which nothing is higher than.
          if (!(y <= grid[j * nx + i])) grid[j * nx + i] = y;
        }
      }
    }
    this.grid = grid;
    this.d = d;
    this.nx = nx;
    this.nz = nz;
  }

  /**
   * The height of the top over (x, z), which must lie within the footprint, or -Infinity where
   * there is no stone near. Grid points that missed the stone are at the level of the ground there,
   * so the top falls to the ground within a grid step of its edge.
   */
  heightAt(x, z, groundAt) {
    if (this.grid === null) this.rasterise();
    const { grid, nx, nz, d } = this;
    const u = (x - this.x0) / d;
    const v = (z - this.z0) / d;
    const i = Math.min(nx - 2, Math.max(0, Math.floor(u)));
    const j = Math.min(nz - 2, Math.max(0, Math.floor(v)));
    const [s, t] = [u - i, v - j];
    const k = j * nx + i;
    let [a, b, c, e] = [grid[k], grid[k + 1], grid[k + nx], grid[k + nx + 1]];
    if (a !== a || b !== b || c !== c || e !== e) {
      if (a !== a && b !== b && c !== c && e !== e) return -Infinity;
      const ground = groundAt(x, z);
      if (a !== a) a = ground;
      if (b !== b) b = ground;
      if (c !== c) c = ground;
      if (e !== e) e = ground;
    }
    const near = a + (b - a) * s;
    const far = c + (e - c) * s;
    return near + (far - near) * t;
  }
}

/**
 * The boulders that tyres can ride over. `groundAt(x, z)` is the bare ground. A boulder's `climb`
 * is how high its top stands above the ground at its middle; those no higher than `limit` are
 * kept, in a cell index, and the rest are left to be solid. Nothing stands further than `half`
 * from the middle of the world. A flag for each cell says at once whether any boulder reaches it.
 */
export class BoulderField {
  constructor(groundAt, limit, half) {
    this.groundAt = groundAt;
    this.limit = limit;
    this.half = half;
    this.across = Math.ceil((2 * half) / CELL);
    this.reached = new Uint8Array(this.across * this.across);
    this.cells = new Map();
    this.boulders = [];
    this.shapes = new WeakMap();
  }

  /** What a geometry gives to work from: its corners and its triangles. */
  shapeOf(geometry) {
    let shape = this.shapes.get(geometry);
    if (shape === undefined) {
      shape = { position: geometry.attributes.position.array, index: geometry.index.array };
      this.shapes.set(geometry, shape);
    }
    return shape;
  }

  /** How high the top of `geometry` placed by the matrix `elements` stands above the ground at its middle. */
  climb(geometry, elements) {
    const e = elements;
    const p = this.shapeOf(geometry).position;
    let top = -Infinity;
    for (let i = 0; i < p.length; i += 3) top = Math.max(top, e[1] * p[i] + e[5] * p[i + 1] + e[9] * p[i + 2] + e[13]);
    return top - this.groundAt(e[12], e[14]);
  }

  /** Puts a boulder down, if it is low enough to ride over. Returns its climb either way. */
  add(geometry, elements) {
    const climb = this.climb(geometry, elements);
    if (climb > this.limit) return climb;
    const boulder = new Boulder(this.shapeOf(geometry), elements);
    this.boulders.push(boulder);
    const { half, across } = this;
    for (let cx = Math.floor((boulder.x0 + half) / CELL); cx <= Math.floor((boulder.x1 + half) / CELL); cx++) {
      for (let cz = Math.floor((boulder.z0 + half) / CELL); cz <= Math.floor((boulder.z1 + half) / CELL); cz++) {
        if (cx < 0 || cz < 0 || cx >= across || cz >= across) continue;
        const key = cellKey(cx, cz);
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(boulder);
        this.reached[cx * across + cz] = 1;
      }
    }
    return climb;
  }

  /** The height of the highest boulder top over (x, z), or -Infinity where there is none. */
  topAt(x, z) {
    const cx = Math.floor((x + this.half) / CELL);
    const cz = Math.floor((z + this.half) / CELL);
    if (cx < 0 || cz < 0 || cx >= this.across || cz >= this.across || this.reached[cx * this.across + cz] === 0)
      return -Infinity;
    const list = this.cells.get(cellKey(cx, cz));
    let top = -Infinity;
    for (const boulder of list) {
      if (x < boulder.x0 || x > boulder.x1 || z < boulder.z0 || z > boulder.z1) continue;
      const y = boulder.heightAt(x, z, this.groundAt);
      if (y > top) top = y;
    }
    return top;
  }
}
