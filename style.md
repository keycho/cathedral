# style

the style bible. the architect receives this document with every cycle and
its blueprints are judged against it. src/api and the crew mirror what is
written here.

## the sentence

a voxel world grown by a market, architected by agents.

## the world

- a heightened natural world under a long golden hour: warm meadow greens,
  wildflower accents, cream stone, terracotta ridges. the sky is painterly,
  soft blue into warm haze, and distance fades into atmosphere, never into
  black. night is short, indigo and starred, and the world's own lights
  carry it.
- the air always moves: grass sways, seeds drift, clouds walk, stillwater
  shimmers. nothing in this world is a still image.
- lowercase everywhere. vt323 for every letter on screen. sharp corners.
  no em dashes. no exclamation marks. the hud keeps its warm-black
  terminal face; the world outside it is alive.
- geology speaks in exactly three strata tints: young green #8FBC66 when
  fresh, cream #FAF3E2 as it settles, sunwarm terracotta #C27A48 in the
  oldest, deepest layers. plus rubble's mossy earth and the ember of scars
  and burns. large holders' stone warms toward gold. geology never uses
  the crew's materials.
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
a new thing takes a swatch, or the palette gains a documented swatch
first. every swatch and its role:

| swatch | role |
| ------ | ---- |
| meadow | lit meadow grass, the world's ground note |
| meadowDeep | valley floors, shaded grass, the hemisphere's ground bounce |
| meadowPale | ridgelines and sun-bleached crowns |
| earth | dark warm soil under the grass, basin banks, the far floor |
| rust | exposed terrace rock, the warm counterweight to the greens |
| rustDeep | rust in shadow and at depth |
| scarmoss | old burns overgrown, wet low pockets |
| emberseam | rare hot cracks near a wound; the hollow's interior light |
| stillwater | pooled water, laid flat, never deeper than one |
| grass, reed, moss | the flora families, drawn from the ground's range |
| bloomCream, bloomRust, bloomMauve | wildflower drifts, muted, never candy |
| genesis | the founding stone |
| mass | fresh accretion |
| rubble | settled collapse |
| monument | a whale's monolith |
| seed | a new holder's block, and island fringes |
| strataYoung / strataSettled / strataOld | the age ramp through the mass |
| holdings | the warmth a large holder's stone carries |
| cream | coursed stone, the crew's formal body |
| creamWarm | warm coursed stone, the crew's domestic body |
| timber | dark timber: frames, braces, lintels |
| tile | fired tile: roofs and kiln work |
| lead | lead grey: gates, straps, lamp posts |
| teal | deep teal, a SPARING accent only, never a banded column |
| lantern | emissive amber, the crew's light |
| glasslight | emissive pale, translucent-reading |
| rise / fall | the price ribbon's ascent and descent |
| haze / dust / petal | the air: fog, impact dust, drifting seeds |
| skyZenith*, skyHorizon*, sun*, moon | the sky's cycle keys |
| bounceWarm / bounceCool / bounceNight | the sky's bounce into the world |
| shadowTint | violet-grey; shadows are never black |
| crew* | the three agents' own silhouettes |

## the grade

the world is judged THROUGH the grade, never raw. three luts (day, golden
hour, night) are built from these swatches' temperature and blended across
the sky's cycle; the post stack runs occlusion, then bloom on emissives
only, then tone mapping, then the grade with its depth haze, vignette and
grain. exposure is held down so highlights keep detail. shadows are long,
soft and violet-grey. distance dissolves into warm haze, so layered hills
read like a painted backdrop.

## the crew's vocabulary

agent architecture must read as ARCHITECTURE against raw strata at a
glance: dressed, cut, deliberate. the crew's materials, and only the
crew's:

- coursed stone: pale cut stone, the formal body of crew work
- warm coursed stone: sun-cream masonry, the domestic body; courtyards,
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
