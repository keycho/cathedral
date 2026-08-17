// kodo - the component kit. every structure in this world is
// ASSEMBLED from parameterised parts, never placed freeform and never as
// slabs. a part returns cells in its own local space; a composition
// offsets parts into a build and the kit dedupes, so a roof laid over a
// wall never fights it.
//
// the rule the whole library exists to enforce: no flat untextured face
// anywhere. a wall is posts and infill with a course line; a roof is
// courses stepped one at a time; an edge is layered. if a part can be
// described by a single box, it is not a part yet.

export interface Cell {
  dx: number;
  dy: number;
  dz: number;
  m: number;
}

export type Part = Cell[];

// a build under assembly: parts go in with an offset, cells come out
// deduped in placement order (foundations first, crowns last).
export class Build {
  private cells: Cell[] = [];
  private seen = new Set<string>();
  readonly used = new Map<string, number>(); // component name -> instances

  add(name: string, part: Part, ox = 0, oy = 0, oz = 0): this {
    this.used.set(name, (this.used.get(name) ?? 0) + 1);
    for (const c of part) {
      const x = c.dx + ox;
      const y = c.dy + oy;
      const z = c.dz + oz;
      const k = x + "," + y + "," + z;
      if (this.seen.has(k)) continue;
      this.seen.add(k);
      this.cells.push({ dx: x, dy: y, dz: z, m: c.m });
    }
    return this;
  }

  // the mason lays what it is given in order, so sort by height: nobody
  // builds a roof before its columns
  get ordered(): Cell[] {
    return this.cells.slice().sort((a, b) => a.dy - b.dy);
  }
  get count(): number {
    return this.cells.length;
  }
  // what went into this build, for the record and for the journal
  get manifest(): { component: string; instances: number }[] {
    return [...this.used.entries()]
      .map(([component, instances]) => ({ component, instances }))
      .sort((a, b) => b.instances - a.instances);
  }
}

// ---- primitives ------------------------------------------------------------

export function cell(dx: number, dy: number, dz: number, m: number): Cell {
  return { dx, dy, dz, m };
}

// a filled rectangle on one level
export function slab(w: number, d: number, y: number, m: number, x0 = 0, z0 = 0): Part {
  const out: Part = [];
  for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) out.push(cell(x0 + x, y, z0 + z, m));
  return out;
}

// the outline of a rectangle: the workhorse, because a ring reads as an
// edge and a slab reads as a slab
export function ring(w: number, d: number, y: number, m: number, x0 = 0, z0 = 0): Part {
  const out: Part = [];
  for (let x = 0; x < w; x++) {
    out.push(cell(x0 + x, y, z0, m));
    out.push(cell(x0 + x, y, z0 + d - 1, m));
  }
  for (let z = 1; z < d - 1; z++) {
    out.push(cell(x0, y, z0 + z, m));
    out.push(cell(x0 + w - 1, y, z0 + z, m));
  }
  return out;
}

export function column(x: number, z: number, y0: number, h: number, m: number): Part {
  const out: Part = [];
  for (let i = 0; i < h; i++) out.push(cell(x, y0 + i, z, m));
  return out;
}

export function beam(x0: number, z0: number, x1: number, z1: number, y: number, m: number): Part {
  const out: Part = [];
  const dx = Math.sign(x1 - x0);
  const dz = Math.sign(z1 - z0);
  let x = x0;
  let z = z0;
  out.push(cell(x, y, z, m));
  while (x !== x1 || z !== z1) {
    if (x !== x1) x += dx;
    if (z !== z1) z += dz;
    out.push(cell(x, y, z, m));
  }
  return out;
}

// a deterministic hash so a "random" detail is the same every session
export function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

// alternate two materials so no face of a wall or a pavement is one flat
// colour across its whole span
export function speckle(a: number, b: number, x: number, y: number, z: number, p = 0.25): number {
  return hash(x, y, z) < p ? b : a;
}
