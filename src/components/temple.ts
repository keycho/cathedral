// cathedral - the temple register. the heights and the sky islands build
// in this: timber post and beam, bone plaster infill, dark charcoal tile
// stacked course by course with swept eaves and exposed bracket sets.
//
// the register's colour law: the BUILDINGS are dark tile, timber, plaster
// and a vermilion accent. green belongs to the grounds (moss, beds, canopy
// trees) and to verdigris on finials, bells and roof caps, so a temple
// reads AGAINST the green hillside instead of sinking into it.

import {
  BLOSSOM,
  FOLIAGE,
  FOLIAGESUN,
  LANTERN,
  PLASTER,
  STILLWATER,
  STONE,
  STONEDARK,
  TILECHARCOAL,
  TILERIDGE,
  TIMBERDARK,
  TIMBERLIGHT,
  TIMBERMID,
  VERDIGRIS,
  VERMILION,
} from "../palette";
import { beam, cell, column, hash, Part, ring, speckle } from "./kit";

// ---- structure -------------------------------------------------------------

// a stone podium: courses that step IN as they rise, so the edge is a
// layered line rather than a wall
export function podium(w: number, d: number, courses = 2): Part {
  const out: Part = [];
  for (let c = 0; c < courses; c++) {
    const inset = c;
    for (let x = inset; x < w - inset; x++) {
      for (let z = inset; z < d - inset; z++) {
        const edge = x === inset || z === inset || x === w - inset - 1 || z === d - inset - 1;
        // the face of a podium is coursed stone; its deck is paving
        out.push(cell(x, c, z, edge ? STONE : speckle(STONE, STONEDARK, x, c, z, 0.18)));
      }
    }
  }
  return out;
}

// a run of steps, each tread one course lower than the last
export function stair(width: number, steps: number, m = STONE): Part {
  const out: Part = [];
  for (let s = 0; s < steps; s++) {
    for (let x = 0; x < width; x++) {
      out.push(cell(x, s, steps - 1 - s, m));
      // the riser under the tread, so a stair is never a floating plane
      for (let y = 0; y < s; y++) out.push(cell(x, y, steps - 1 - s, m));
    }
  }
  return out;
}

// a structural post with its base stone and its head bracket
export function templeColumn(h: number): Part {
  const out: Part = [];
  out.push(cell(0, 0, 0, STONE)); // the footing
  out.push(...column(0, 0, 1, h - 1, TIMBERDARK));
  return out;
}

// the bracket set that carries an eave: three courses stepping outward,
// the detail that says temple more than anything else in the register
export function bracketSet(reach = 2): Part {
  const out: Part = [];
  for (let r = 0; r <= reach; r++) {
    out.push(cell(r, r, 0, TIMBERDARK));
    if (r > 0) {
      out.push(cell(r, r, 1, TIMBERMID));
      out.push(cell(r, r, -1, TIMBERMID));
    }
  }
  return out;
}

// a wall bay: posts at the edges, plaster infill between, a timber sill
// and head rail. never a flat panel.
export function wallPanel(width: number, h: number): Part {
  const out: Part = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < width; x++) {
      const post = x === 0 || x === width - 1;
      if (post) out.push(cell(x, y, 0, TIMBERDARK));
      else if (y === 0 || y === h - 1) out.push(cell(x, y, 0, TIMBERMID)); // sill and head
      else out.push(cell(x, y, 0, speckle(PLASTER, TIMBERLIGHT, x, y, 0, 0.06)));
    }
  }
  return out;
}

// a lattice window: a timber frame with a cross of muntins and the warm
// inside showing through
export function latticeWindow(width = 3, h = 3): Part {
  const out: Part = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < width; x++) {
      const frame = x === 0 || x === width - 1 || y === 0 || y === h - 1;
      const muntin = x === Math.floor(width / 2) || y === Math.floor(h / 2);
      out.push(cell(x, y, 0, frame ? TIMBERDARK : muntin ? TIMBERMID : LANTERN));
    }
  }
  return out;
}

// a door: a surround with a lintel, a vermilion threshold, and open air
// where a body walks through
export function door(width = 2, h = 3): Part {
  const out: Part = [];
  for (let y = 0; y <= h; y++) {
    out.push(cell(-1, y, 0, TIMBERDARK));
    out.push(cell(width, y, 0, TIMBERDARK));
  }
  for (let x = -1; x <= width; x++) out.push(cell(x, h + 1, 0, TIMBERMID)); // lintel
  for (let x = 0; x < width; x++) out.push(cell(x, -1, 0, VERMILION)); // threshold
  return out;
}

// ---- the roof --------------------------------------------------------------

// a tiled roof: courses stepping in and up, corners lifted so the eave
// sweeps, hip ridges picked out a value lighter, and an eave course that
// overhangs the body it covers
export function sweptRoof(span: number, courses: number): Part {
  const out: Part = [];
  const c0 = Math.floor(span / 2);
  for (let c = 0; c < courses; c++) {
    const w = span - c * 2;
    if (w < 1) break;
    const y = c;
    const x0 = c;
    const z0 = c;
    const isEave = c === 0;
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < w; z++) {
        const gx = x0 + x;
        const gz = z0 + z;
        const edge = x === 0 || z === 0 || x === w - 1 || z === w - 1;
        // only the outer two courses are hollow: the cap is solid so no
        // daylight shows through the crown
        if (!edge && c < courses - 3) continue;
        // the hip ridge runs corner to apex on both diagonals
        const onHip = Math.abs(gx - c0) === Math.abs(gz - c0);
        let m = onHip ? TILERIDGE : TILECHARCOAL;
        if (isEave && edge) m = speckle(TILECHARCOAL, TILERIDGE, gx, y, gz, 0.18);
        out.push(cell(gx, y, gz, m));
        // the sweep: the eave course lifts at the four corners
        if (isEave && x % (w - 1) === 0 && z % (w - 1) === 0) {
          out.push(cell(gx, y + 1, gz, TILERIDGE));
          out.push(cell(gx, y + 2, gz, VERMILION)); // the corner's small flame
        }
      }
    }
  }
  return out;
}

// the eave course proper: the overhanging lip a roof needs so it does not
// sit flush on its walls
export function eaveCourse(span: number): Part {
  return ring(span, span, 0, TILECHARCOAL).map((c) => ({ ...c, m: speckle(TILECHARCOAL, TILERIDGE, c.dx, c.dy, c.dz, 0.2) }));
}

// a finial: the one place the temple buildings are allowed green
export function finial(h = 4): Part {
  const out: Part = [];
  out.push(cell(0, 0, 0, STONE));
  for (let y = 1; y < h - 1; y++) out.push(cell(0, y, 0, VERDIGRIS));
  out.push(cell(0, h - 1, 0, LANTERN));
  return out;
}

// ---- the grounds -----------------------------------------------------------

// paving that is never one colour: a coursed pattern with worn stones
export function courtyardPaving(w: number, d: number): Part {
  const out: Part = [];
  for (let x = 0; x < w; x++) {
    for (let z = 0; z < d; z++) {
      const band = (x + z) % 7 === 0;
      out.push(cell(x, 0, z, band ? TIMBERLIGHT : speckle(STONE, TILERIDGE, x, 0, z, 0.14)));
    }
  }
  return out;
}

// a wall with a tile cap: stone body, a timber string course, tile on top
export function wallWithCap(len: number, h = 3, axis: "x" | "z" = "x"): Part {
  const out: Part = [];
  for (let i = 0; i < len; i++) {
    for (let y = 0; y < h; y++) {
      const m = y === h - 1 ? TIMBERMID : speckle(STONE, PLASTER, i, y, 0, 0.18);
      out.push(axis === "x" ? cell(i, y, 0, m) : cell(0, y, i, m));
    }
    // the cap overhangs both faces, which is what makes it read as a cap
    const capY = h;
    if (axis === "x") {
      out.push(cell(i, capY, 0, TILECHARCOAL));
      out.push(cell(i, capY, -1, TILERIDGE));
      out.push(cell(i, capY, 1, TILERIDGE));
    } else {
      out.push(cell(0, capY, i, TILECHARCOAL));
      out.push(cell(-1, capY, i, TILERIDGE));
      out.push(cell(1, capY, i, TILERIDGE));
    }
  }
  return out;
}

// the gate: two vermilion posts, a stepped lintel above them, a tie beam
// below it. the silhouette that says where the temple ground begins.
export function gate(width = 5, h = 5): Part {
  const out: Part = [];
  for (let y = 0; y < h; y++) {
    out.push(cell(0, y, 0, VERMILION));
    out.push(cell(width - 1, y, 0, VERMILION));
  }
  for (let x = 0; x < width; x++) out.push(cell(x, h - 2, 0, TIMBERDARK)); // tie beam
  for (let x = -1; x <= width; x++) out.push(cell(x, h, 0, VERMILION)); // lintel
  for (let x = -2; x <= width + 1; x++) out.push(cell(x, h + 1, 0, TILECHARCOAL)); // its cap
  out.push(cell(-2, h + 2, 0, TILERIDGE));
  out.push(cell(width + 1, h + 2, 0, TILERIDGE));
  return out;
}

// a stone lantern: base, post, light chamber, tile cap. four courses of
// detail in a footprint one block wide.
export function stoneLantern(): Part {
  return [
    cell(0, 0, 0, STONE),
    cell(0, 1, 0, TIMBERDARK),
    cell(0, 2, 0, STONE),
    cell(0, 3, 0, LANTERN),
    cell(0, 4, 0, TILECHARCOAL),
    cell(-1, 4, 0, TILERIDGE),
    cell(1, 4, 0, TILERIDGE),
    cell(0, 4, -1, TILERIDGE),
    cell(0, 4, 1, TILERIDGE),
    cell(0, 5, 0, VERDIGRIS),
  ];
}

// a water basin: a stone rim holding one course of water, with a bamboo
// spout over it
export function basin(r = 2): Part {
  const out: Part = [];
  const w = r * 2 + 1;
  out.push(...ring(w, w, 0, STONE));
  for (let x = 1; x < w - 1; x++) for (let z = 1; z < w - 1; z++) out.push(cell(x, 0, z, STILLWATER));
  out.push(cell(0, 1, 0, TIMBERMID));
  out.push(cell(0, 2, 0, TIMBERMID));
  out.push(cell(1, 2, 0, TIMBERLIGHT));
  return out;
}

// a bell under a small frame: two posts, a beam, patinated bronze
export function bell(): Part {
  return [
    ...column(0, 0, 0, 4, TIMBERDARK),
    ...column(2, 0, 0, 4, TIMBERDARK),
    ...beam(0, 0, 2, 0, 4, TIMBERMID),
    cell(1, 3, 0, VERDIGRIS),
    cell(1, 2, 0, VERDIGRIS),
    cell(1, 5, 0, TILECHARCOAL),
    cell(0, 5, 0, TILERIDGE),
    cell(2, 5, 0, TILERIDGE),
  ];
}

// a garden bed: an edged bed of moss and planting, where the register's
// green actually lives
export function gardenBed(w: number, d: number): Part {
  const out: Part = [];
  out.push(...ring(w, d, 0, STONE));
  for (let x = 1; x < w - 1; x++) {
    for (let z = 1; z < d - 1; z++) {
      const h = hash(x, 7, z);
      out.push(cell(x, 0, z, h < 0.18 ? FOLIAGESUN : FOLIAGE));
      if (h > 0.93) out.push(cell(x, 1, z, BLOSSOM));
    }
  }
  return out;
}

// an ornamental tree: a real form, trunk and layered canopy, not a tuft
export function ornamentalTree(height = 5, spread = 2, blossoming = false): Part {
  const out: Part = [];
  for (let y = 0; y < height; y++) out.push(cell(0, y, 0, TIMBERDARK));
  const leaf = blossoming ? BLOSSOM : FOLIAGE;
  const leafSun = blossoming ? BLOSSOM : FOLIAGESUN;
  // three layers, each smaller than the one below, edges broken so the
  // silhouette is never a cube
  const layers = [
    { y: height - 1, r: spread },
    { y: height, r: spread },
    { y: height + 1, r: Math.max(1, spread - 1) },
    { y: height + 2, r: Math.max(1, spread - 2) },
  ];
  for (const l of layers) {
    for (let x = -l.r; x <= l.r; x++) {
      for (let z = -l.r; z <= l.r; z++) {
        const d = Math.hypot(x, z);
        if (d > l.r + 0.35) continue;
        if (d > l.r - 0.5 && hash(x, l.y, z) < 0.4) continue; // broken edge
        out.push(cell(x, l.y, z, hash(x, l.y + 1, z) < 0.3 ? leafSun : leaf));
      }
    }
  }
  return out;
}

// a retaining wall: battered stone with weep courses, what holds a terrace
// up on a hillside
export function retainingWall(len: number, h: number, axis: "x" | "z" = "x"): Part {
  const out: Part = [];
  for (let i = 0; i < len; i++) {
    for (let y = 0; y < h; y++) {
      const back = Math.floor((h - y) / 3); // the batter: it leans back as it rises
      const m = y % 4 === 3 ? TILERIDGE : speckle(STONE, PLASTER, i, y, back, 0.2);
      out.push(axis === "x" ? cell(i, y, back, m) : cell(back, y, i, m));
    }
  }
  return out;
}
