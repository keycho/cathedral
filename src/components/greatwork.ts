// kodo - THE GREAT WORK. the world had no hero and nothing to navigate
// by: a hundred buildings of roughly one size, every one of them plausible,
// placed by rules that are individually correct and collectively generic. a
// place is not made legible by the quality of its average building. it is
// made legible by one thing being obviously more important than everything
// else, and by everything else being arranged with respect to it.
//
// this is that thing. a seven storey pagoda on the highest ground in the
// world, four to five times the height of an ordinary hall, sited so it
// closes the view from the plaza, the quarter and the approach.
//
// it is composed from the same tier pieces every other temple work uses —
// podium, body, roof, finial — so it belongs to the same architecture rather
// than being a special-cased monument. what makes it the great work is the
// COUNT and the SPAN TAPER, not a different vocabulary.

import { Build } from "./kit";
import { tierBody, tierPodium } from "./compose";
import {
  finial,
  gate,
  gardenBed,
  ornamentalTree,
  stair,
  stoneLantern,
  sweptRoof,
  wallWithCap,
} from "./temple";
import { torii } from "./town";

export interface GreatWork {
  build: Build;
  height: number;
  footprint: number;
  tiers: number;
}

// A PAGODA ROOF IS SHALLOW AND WIDE. tierRoof builds a full pyramid — it
// passes ceil(roofSpan / 2) courses, so a span 21 tier carries a fourteen
// block roof and one storey costs twenty-four. seven of those is a hundred
// and forty block tower against a ninety-six block world ceiling, which is
// exactly what the first build did: it clipped, and the measured top came
// back at MAXY.
//
// the roof that makes a pagoda read is a broad flared eave three or four
// courses deep, with the next storey rising out of it. that is both the
// correct form and the only one that fits.
const ROOF_COURSES = 4;
function roofHeight(): number {
  return ROOF_COURSES;
}

// A PAGODA IS A TAPER, NOT A STACK. every storey is narrower than the one
// under it, and the rate of the taper is what decides whether the thing
// reads as a tower or as a wedding cake. two blocks a storey, and the
// storeys get shorter as they climb.
export function greatWorkPagoda(tiers = 6, baseSpan = 19, seed = 3, ceiling = 78): GreatWork {
  const b = new Build();
  const t = Math.max(3, Math.min(9, tiers));
  const span0 = Math.max(13, Math.min(27, baseSpan));

  // the podium is wide and low, and the whole thing stands on it
  const podCourses = 3;
  b.add("tier podium", tierPodium(span0, podCourses).ordered, 0, 0, 0);
  let y = podCourses;
  let span = span0;
  let x = 2;
  let z = 2;
  let top = y;

  let built = 0;
  for (let i = 0; i < t; i++) {
    // storeys shorten with height: a six at the bottom and a four at the
    // top reads as perspective even when you are looking at it flat on
    const storey = Math.max(4, 6 - Math.floor((i * 2) / t));
    const tierH = storey + 3 + ROOF_COURSES;
    // and it stops rather than punching through the world's own ceiling
    if (y + tierH + 8 > ceiling) break;
    b.add("tier body", tierBody(span, storey).ordered, x, y, z);
    const roofY = y + storey + 3;
    // the roof overhangs three every side and flares four courses
    b.add("roof (swept)", sweptRoof(span + 6, ROOF_COURSES), x - 3, roofY, z - 3);
    top = roofY + roofHeight();
    // the next storey sits ON that roof, two narrower, centred
    y = top;
    span = Math.max(7, span - 2);
    x += 1;
    z += 1;
    built++;
  }

  // the crown. a finial on the great work is taller than a finial anywhere
  // else, because it is the last thing in the silhouette.
  b.add("finial", finial(8), x + Math.floor(span / 2), y, z + Math.floor(span / 2));
  const height = top + 8;

  // ---- the grounds, which are what make it read as approached ------------
  // a stair on the entrance face, a gate at its foot, and a torii beyond
  // that: three thresholds before you are inside, which is the whole
  // grammar of arriving somewhere important.
  const cx = Math.floor((span0 + 4) / 2);
  b.add("stair", stair(7, podCourses + 2), cx - 3, 0, -4);
  b.add("gate", gate(7, 6), cx - 3, 0, -8);
  b.add("torii", torii(5, 6), cx - 2, 0, -14);

  // lanterns down the approach, in pairs, which is the motif that will
  // repeat across the rest of the world
  for (let i = 0; i < 4; i++) {
    b.add("stone lantern", stoneLantern(), cx - 6, 0, -6 - i * 3);
    b.add("stone lantern", stoneLantern(), cx + 5, 0, -6 - i * 3);
  }

  // a low wall enclosing the precinct, open on the approach face
  const w = span0 + 4;
  b.add("wall + tile cap", wallWithCap(w + 8, 3, "x"), -4, 0, w + 2);
  b.add("wall + tile cap", wallWithCap(w + 6, 3, "z"), -4, 0, -3);
  b.add("wall + tile cap", wallWithCap(w + 6, 3, "z"), w + 3, 0, -3);

  // planting at the corners, and a specimen tree either side of the stair
  b.add("garden bed", gardenBed(6, 5), -3, 0, w - 4);
  b.add("garden bed", gardenBed(6, 5), w - 2, 0, w - 4);
  b.add("ornamental tree", ornamentalTree(9, 3, true), -2, 0, -2 + (seed % 2));
  b.add("ornamental tree", ornamentalTree(9, 3, true), w + 1, 0, -2);

  return { build: b, height, footprint: w + 8, tiers: built };
}
