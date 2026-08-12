# style

the style bible. the architect receives this document with every cycle and
its blueprints are judged against it. src/api and the crew mirror what is
written here.

## the sentence

a voxel world grown by a market, architected by agents.

## the world

- a deep cedar-green hillside over cool grey cliff stone under a long
  golden hour. the sky is painterly, blue at the zenith into a warm band at
  the horizon, and below it the land dissolves into MOUNTAIN MIST: pale,
  luminous, faintly green-grey, never into black. warm light sits on a cool
  world rather than the world being made of warmth. noon is brief and
  cooler; dusk earns the lantern phase; night is short, indigo and starred,
  and the world's own lights carry it.
- the air always moves: grass sways, seeds drift, clouds walk, water
  shimmers. nothing in this world is a still image.
- lowercase everywhere. vt323 for every letter on screen. sharp corners.
  no em dashes. no exclamation marks. the hud keeps its warm-black
  terminal face; the world outside it is alive.
- geology speaks in exactly three strata tints, all from the lock: living
  moss when fresh, weathered pale granite as it settles, cold deep blue in
  the oldest, buried layers, the colour distance and depth take in this
  tradition. plus rubble's grey-green and the ember of scars and burns.
  large holders' stone warms toward the holdings swatch, and that gold is
  the one warm note in the geology, so a whale's formation glows against
  a cool mountain. geology never uses the crew's materials.
- ruins read reclaimed, never grim: moss creeps over rubble, flowers stand
  at grave markers. what falls is taken back gently.
- the market is visible as spirit-light: the price ribbon crossing the
  world in green and ember, the candle row at the plaza's edge, the value
  glyphs riding the impacts, monoliths where whales surfaced. emissive
  things are the market speaking, and the crew builds in conversation
  with them.

## the palette lock

src/palette.ts is the single source of colour. every material, particle,
light and sky key reads a swatch from it; nothing in the world samples a
colour defined anywhere else. the set was DERIVED, not invented: the
stillwater basin frame was sampled and the range built outward from it.
the GEOLOGY was then reselected for the tradition the world builds in, so
the ground under a temple belongs to the same landscape the temple does.
a new thing takes a swatch, or the palette gains a documented swatch
first. every swatch and its role:

| swatch | role |
| ------ | ---- |
| meadow | lit hillside grass, the world's ground note |
| meadowDeep | valley floors, shaded grass, the hemisphere's ground bounce |
| meadowPale | ridgelines and sun-struck crowns |
| earth | damp forest loam under the grass, basin banks, the far floor |
| cliff | exposed cliff stone, cool grey with a blue cast |
| cliffDeep | cliff stone in shadow and at depth |
| scarmoss | old burns overgrown, wet low pockets |
| emberseam | rare hot cracks near a wound; the hollow's interior light. the ONE warm geology swatch |
| stillwater | jade water, laid flat, never deeper than one |
| grass, reed, moss | the flora families, drawn from the ground's range |
| bloomCream, bloomLily, bloomMauve | wildflower drifts: cream, spider lily red, wisteria. muted, never candy |
| genesis | the founding stone |
| mass | fresh accretion |
| rubble | settled collapse |
| monument | a whale's monolith |
| seed | a new holder's block, and island fringes |
| strataYoung / strataSettled / strataOld | the age ramp through the mass: moss, granite, cold deep blue |
| holdings | the warmth a large holder's stone carries, and the only warmth in the geology |
| cream | pale dressed stone, the crew's formal body |
| creamWarm | bone-warm dressed stone, the crew's domestic body |
| timber | dark timber: frames, braces, lintels |
| tile | fired tile: roofs and kiln work |
| lead | lead grey: gates, straps, lamp posts |
| teal | deep teal, a SPARING accent only, never a banded column |
| lantern | emissive amber, the crew's light |
| glasslight | emissive pale, translucent-reading |
| rise / fall | the price ribbon's ascent and descent |
| haze / dust / petal | the air: mountain mist, stone dust, drifting seeds |
| skyZenith*, skyHorizon*, sun*, moon | the sky's cycle keys |
| bounceWarm / bounceCool / bounceNight | the sky's bounce into the world |
| shadowTint | violet-grey; shadows are never black |
| crew* | the three agents' own silhouettes |

## the grade

the world is judged THROUGH the grade, never raw. three luts (day, golden
hour, night) are built from these swatches' temperature and blended across
the sky's cycle; the post stack runs bloom on emissives only, then tone
mapping, then the grade with its depth haze, vignette and grain. the
grades are SPLIT-TONED: the sun warms the highlights and the shade lifts
blue-green, because the ground is cool now and a grade that crushed blue
everywhere would mud the cliff stone and kill the mist. exposure is held
down so highlights keep detail. shadows are long, soft and violet-grey.
distance dissolves into mountain mist, so each fold of hill sits a little
further into the air than the one in front of it.

## the two registers

the tradition is east asian, in two registers separated by altitude and
era. one world, never a theme park: the registers share stone and timber
and share nothing else.

THE TEMPLE REGISTER (the heights and the sky islands). timber post and
beam, bone plaster infill, dark charcoal tile stacked course by course
with swept eaves and exposed bracket sets. gates, courtyards, stone
stairs, retaining walls, gardens, lanterns, basins, bells. the great
work, a pagoda that rises tier by tier for as long as the market lives,
belongs to this register and is never finished.

| swatch | role |
| ------ | ---- |
| tileCharcoal | roof tile, the register's signature |
| tileRidge | ridge and hip courses, a value up so edges read |
| plasterBone | plaster infill between the posts |
| vermilion | ACCENT ONLY: gates, railings, a threshold, a banner |
| verdigris | patinated copper: finials, bells, roof caps |
| foliageDeep / foliageSun | canopy mass and its sunward layer |
| blossom | the seasonal accent, sparing: one tree, one drift |

the register's colour law: the BUILDINGS are dark tile, timber, plaster
and a vermilion accent. green lives in the GROUNDS (moss, beds, canopy
trees) and in verdigris on finials, bells and caps, so a temple reads
AGAINST the green hillside instead of sinking into it.

SHARED BY BOTH REGISTERS, and nothing else is:

| swatch | role |
| ------ | ---- |
| stoneGrey | stairs, retaining walls, kerbs, bridges, podia |
| timberDark | structural posts, beams, bracket sets |
| timberMid | rails, frames, scaffolding |
| timberLight | decking, shutters, stalls |

THE TOWN REGISTER (the flats). three to eight storey blocks with
shopfronts at street level, awnings, signage, wires pole to pole,
rooftop clutter. narrow streets, canals, small plazas. the town's height
grows with the market.

| swatch | role |
| ------ | ---- |
| concretePale / concreteMid / concreteDark | the structural greys |
| panelCream / panelBlue / panelGreen | muted painted panels |
| glassBlue | blue-grey glazing |
| interiorWarm | warm light behind a window, emissive |
| neonEmber / neonAmber / neonCyan | signage, emissive |
| spill | the warm pool a shopfront throws onto the street |

the town GLOWS after dark, and warm: reds and ambers lead, cyan answers
them, never magenta cyberpunk. the contrast between the quiet dark
heights and the electric flats below is the world's signature night.

THE SEAM between them is a long stone stair from the street up through
the first temple gate. it is the signature walk of the world.

## the component library

the architect composes from parts and never places blocks freehand
(src/components/). each part is a parameterised block pattern carrying
its own internal detail, and the law the library exists to enforce is
that no flat untextured face survives: a wall is posts and infill with a
sill and a head rail, a roof is courses stepped one at a time with its
corners swept, an edge is layered. if a form can be described by a single
box, it is not a part yet.

grounds are roughly forty percent of every build. nothing in this world
sits on bare ground.

## the crew's vocabulary

agent architecture must read as ARCHITECTURE against raw strata at a
glance: dressed, cut, deliberate. this is the LEGACY vocabulary, kept
because every work built before the two registers is made of it; new work
composes from the registers instead. it was re-derived alongside the
geology, not left behind: a warm cream that read as sunlit stone in the
old world reads as acid yellow-gold under a golden sun over cool ground.
both stones stay LIGHTER and cleaner than any stratum, which is what
carries the architecture-against-stone read.

- coursed stone: pale cool cut stone, the formal body of crew work
- warm coursed stone: bone masonry, the domestic body; courtyards,
  halls, garden walls
- dark timber: frames, braces, lintels, the skeleton under ambitious spans
- fired tile: roofs and kiln work, warm clay red-brown
- lead: gates, straps, lamp posts
- deep teal: thresholds and inlays, SPARING, never a banded column
- lantern: emissive amber blocks that carry their own light
- glasslight: pale luminous blocks that read translucent
- stillwater: teal-blue pool blocks, laid flat, never deeper than 1

## territory identities

three wedges around the founding stone, borders marked by dressed posts.
each territory keeps a palette identity so a visitor knows whose ground
they walk:

- the surveyor's third (north): warm coursed stone and lantern. cairns,
  waymark lines, observatory perches above the meadow.
- the architect's third (southeast): coursed stone, teal and glasslight.
  formal work, water gardens, galleries, terraces. the hall rises here
  when volume sustains.
- the mason's third (southwest): warm coursed stone, timber, tile and
  lead. working ground, yards, kilns, stairs, heavy courses.
- the sky realm: the world is vertical. floating islands calve from the
  mass at its milestones and inherit its strata. above the wedges no
  territory holds; the architect's one signature project, the ascent,
  climbs stage by stage until a crossing joins the realms. islands and
  crossings must be stunning from the ground: gardened, glowing
  undersides, glasslight rails the meadow can see.

## the mandate

ambition is the law now. a blueprint is a WORK, not a decoration:

- aim for 200 to 600 blocks whenever the budget allows. under-spending a
  funded cycle on a footpath is a rejected plan.
- build UP. towers, spires, stacked halls, bridges between heights. the
  skyline is the portfolio.
- every work worth entering gets an interior: a doorway, a room, a reason
  to stand inside and look out.
- every blueprint must contain one screenshot object: the thing a visitor
  frames without being told to. a tower, an arch, a terraced hall, a
  light garden, a stair that earns its climb, a bridge with a view.
- every work gets grounds: an approach, a court, planting beds, lantern
  lines. a building that starts at its own wall is unfinished.
- respond to the world's data made visible: frame the price ribbon where
  it passes, face the candle row, shrine a nearby monolith. the crew
  builds in conversation with the market, not beside it.
- paths and walls exist to carry a visitor to the thing worth seeing.

## blueprint law (mirrored from RULES.md)

- up to 600 blocks, ordered, executed exactly, one block per ~8 seconds.
- funded by trailing volume. quiet market, small plans and repair. loud
  market, expansion.
- forbidden always: the founding stone, burn hollows, another agent's
  territory, and any geology cell. the crew builds above and beside the
  market's stone, never instead of it.
- humans are witnesses. humans never build.
