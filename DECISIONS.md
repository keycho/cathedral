# decisions

the choices this world is built on, and the ones deliberately deferred.
rules live in RULES.md and are frozen; style lives in style.md; this file
is for engineering calls that a later session would otherwise re-litigate.

## one configuration, no menu

there is no quality menu and there will not be one. a visitor arriving at
a world should see the world, not a settings screen, and a 24/7 stream
cannot depend on anyone picking the right option. the world ships one
configuration and, when a machine cannot hold the frame, steps down a
ladder in silence (src/quality.ts). the ladder only ever descends: a world
that oscillates between settings is worse than one that settles a notch
low. resolution and shadow detail go first; the grade, which carries the
world's colour, goes last. the readout stays as a hidden debug instrument
on `p` and carries no controls.

## render budget (measured, not guessed)

the target is 60fps locked at orbit AND walking on a normal laptop gpu,
because a 24/7 stream and every mobile visitor depend on it.

measured on real hardware (not in the dev container, which is a software
rasterizer and cannot answer timing questions at all):

| combination | result |
| ----------- | ------ |
| low + shadows, pr 1 | 60fps locked, 16.7ms, worst 17, 98 draws, 900k tris |
| high + all effects + shadows, pr 2 | 60fps locked, 16.7ms, worst 18 |

so the full stack fits: high is the default on desktop. low and medium
exist for phones and thin machines and are auto-detected (mobile agent
goes low, four cores or fewer go medium).

**shadows are never optional.** they are on at every tier. the readout's
shadow switch is a debug affordance that freezes the shadow map's refresh;
it does NOT flip `light.castShadow`, because doing so changes three's
program cache key and forces every material in the scene to recompile
(measured: 52 programs to 61 on a single flip, 64 after flipping back, the
cache never shrinking). that recompile churn is why the no-shadow path
measured slower than the shadowed one.

instrumentation note: `renderer.info` resets on every `render()` call, and
the composer calls render once per pass, so reading it after
`composer.render()` reports the last fullscreen quad (draws 1, tris 0k).
the readout sets `info.autoReset = false` and resets once per frame, so the
numbers are whole-frame totals and comparable across tiers.

## the frame, cut to budget

a regression to 11fps was reported at the richest setting, with 198 draws
and 2,052k triangles against an earlier 98 draws / 900k. the first
question was whether geometry had doubled or the counters had been
undercounting. an a/b of the same protocol against the pre-crew build
answered it: 74,155 field instances and 291 draws before, 72,965 and 290
after. the crew commit added two meshes (the keeper's body and head) and
four lights. nothing doubled.

the old 98 draws / 900k was a SINGLE-PASS count at the lowest setting,
where the composer is bypassed. the richest setting was rendering the
scene three times per frame: colour, the occlusion pass's depth/normal
prepass, and the shadow pass.

three cuts, measured on the aged world:

| | draws | triangles |
| --- | --- | --- |
| before | 290 | 2,297k |
| ground-truth occlusion removed | 111 | 785k |
| chunk size 32 to 64 | **71** | **900k** |

- the occlusion pass is gone for good. it rendered every chunk a second
  time for depth and normals, roughly a third of the frame, and it washed
  out the sun's own shadows on the way (compared side by side). contact
  darkening is not worth a third of the budget.
- the sun's shadow frustum tightened to 48 blocks, which culls most chunks
  out of the shadow pass.
- CHUNK went from 32 to 64, so the field is 16 meshes instead of 64. every
  chunk mesh costs at least two draw calls because the frame is drawn at
  least twice, so coarser frustum culling is the cheaper trade: triangles
  rose 785k to 900k while draws fell 111 to 71.

## known headroom: the ground is 68k instanced cubes

the frame audit on the aged world:

| | count |
| --- | --- |
| instanced cubes in the field | 73,647 |
| of which ground | 68,435 |
| of which market blocks | 5,212 |
| geometry triangles | ~884k, drawn again by the shadow pass |
| flora instances | 11,624 across 4 meshes |
| particles | 2,434 points across 3 clouds |

the meadow is a heightfield rendered as one cube per exposed column. the
lever, if mobile struggles later, is to rebuild the ground surface as a
merged quad mesh (top face plus step sides) instead of cubes, which should
cut ground triangles roughly six to tenfold and shrink the shadow pass with
it. NOT done: the full stack already holds 60fps, and the rewrite touches
the engine's core. this is the first place to look for frames.

## the geology was reselected, the ramp was not

the strata ramp was the last thing in the world still derived for the
ashfall palette: olive meadow, warm rust terraces, sunwarm terracotta in
the deepest layers. against the temple register those greens read yellow
and that stone read dry. the ramp MECHANIC is untouched (two spans, eight
epochs to settled and twenty-four more to deep, plus the holdings aura);
only the three colours it ramps through were reselected, to moss, pale
granite and a cold blue.

two things fell out of it that were not obvious from a swatch card:

- **a ramp between a yellow-leaning green and a light neutral crosses acid
  yellow at its midpoint,** and the midpoint is where most of the mass sits
  most of the time. measured over the aged world's 6,000 registered strata,
  the mean colour at age 4 was `#84957a` only after the young stop was
  rebalanced to carry as much blue as red; before that the whole middle of
  the ramp was a sick olive. a swatch is not a ramp: check the midpoints.
- **the crew's legacy cream stone had to move with the ground.** it was
  chosen to read as sunlit stone in a warm world; under the same golden sun
  over cool ground it read as gold plating. it was re-derived cooler and
  kept lighter than any stratum, because architecture reading as
  architecture against raw stone is the property that matters, not the
  warmth.

the golden hour's sun is strongly orange, so a swatch meant to read cool
has to be pushed further blue than it looks on a card: a neutral grey cliff
lit by that sun came back khaki. the swatches are chosen against the
identity light, not against white.

## water reflects the sky without rendering the world twice

a planar reflection is a second full scene render. that is the same cost
that got the occlusion pass deleted, and it would have bought back the
frames the whole performance pass spent. so the water does not reflect the
world at all: it reflects the SKY, rebuilt analytically in the fragment
shader from the four gradient keys the sky already publishes every frame,
through a schlick fresnel with water's real normal reflectance and the
sun's specular path added on top. one draw call. the reflection is correct
for the hour of the day, and nothing in the world appears in it.

what actually made it read as water was not the reflection. it was
BREAKING the reflection:

- the shading normal is tilted far harder than the geometry is displaced.
  the first version leaned about six degrees, took one uniform band of sky
  across the whole pool, and read as poured milk. measured: the fresnel
  term was 0.2 flat everywhere and the band it sampled was the sky's
  brightest key.
- the wave is five trains at unrelated angles. a sum of sines all keyed to
  the wind direction is corduroy, which is the failure mode.
- the swell only ever rises. the surface sits four thousandths above the
  top water cube, so a trough would z-fight it; clamped upward, the trough
  rests on the block.

the valley mist takes the opposite lesson: it is the one effect that needed
to know WHERE it is rather than only how far. it reconstructs a world
position from the existing depth buffer against a camera ray basis and
pools by altitude, so a temple on a shoulder stands out of the mist the
water below is drowned in. it costs nothing extra: the grade pass was
already sampling depth.

## the rim was a grey pavement, and the palette exposed it

the terrain tapered its HEIGHT toward the world's edge but kept the
material the ridge generator had already assigned, so a flat plain of bare
rock ringed the world. it had always been there; under warm rust it read as
a desert and nobody looked twice, and under cool cliff stone it read as
poured concrete. the crest boost now fades with the same rim term that
flattens the land, so the rock and the height go together. a palette change
is a good way to find out what your geometry was getting away with.

## the clock left the browser

phase 1 ran a synthetic feed and a tick engine inside every browser, so
every visitor was watching a different world and none of them could be
wrong about it. that is fine for a world nobody shares and it is not what
this is: two people watching the same token have to see the same hall go
up. the tick engine now accepts an authoritative summary
(`applyExternal`) and takes exactly the same path a locally closed tick
takes — the rules must not be able to tell where a tick came from.

## a tick is derived, not accumulated

the browser engine summed events as they arrived and closed on a timer,
which works exactly until the process restarts: the accumulator is empty
and the half-finished tick is gone. the server closes tick n by asking the
log what happened between two timestamps, so a restart recomputes it, a
late trade corrects it, and running the ticker twice writes the same row.
that one property is what makes every other guarantee possible —
reconciliation, repair, and a client that can check itself.

## the transaction id is the whole deduplication strategy

the indexer's windows OVERLAP on purpose. a cursor that only moves
forward loses whatever arrived late or out of order, and a chain does
both. the overlap costs duplicate rows, and the duplicates are eaten by a
primary key on the transaction the chain minted rather than by application
logic that has to be right every time. this is also why the phase-1
synthetic feed has carried a `tx` on every event since the beginning: so
that when the real one arrived, nothing downstream had to change.

## the law is one file, in plain javascript

`src/market/law.js` is imported by the vite app through a sibling
declaration and read off disk by the node service. it is not typescript
and not in the app's type graph, because every other way of sharing it —
a copy in the server, a build step, a package — ends with the two sides
disagreeing about what a tick is. `src/rules.ts` imports the cadence from
it rather than restating it.

## a gap is not drift

a missing tick means the ticker was down for that window and the log can
be replayed into it. a differing tick means two parties computed different
answers from the same events, and something is actually wrong. the audit
reports them as separate lists, because the repair is the same call but
the diagnosis is not.

## known limits of the phase 2 groundwork

- **the token is a stand-in.** `STANDIN_MINT` is deliberately unmistakable
  rather than plausible, and the service says so on every start. the real
  adapter (`HttpSource`) is written against the same one-method interface
  the stand-in implements, so swapping it is a line in `openSource`.
- **a new visitor replays rather than loads a snapshot.** the client pulls
  the tick log from 1 and applies it in batches of 200 per poll, which is
  correct but gets slower as the world ages. the fix is a snapshot
  endpoint — the voxel field plus the tick it was taken at — with replay
  as the fallback for the tail. that is the next piece, not this one.
- **the client trusts the server's arithmetic, and checks it.** it cannot
  prove a summary from the log itself (it does not hold the events), so
  reconciliation catches divergence rather than fraud. proving would mean
  shipping the event log to the browser, which is a different product.

## the world floats on a cloud sea (was: the edge falls into void)

resolved. the "brown void" below the horizon turned out to be a literal
4000-unit plane of flat earth (`buildVoidFloor`) left from early
development — it had been every orbit frame's background, and it silently
covered the first attempt at a cloud sea, which was built eleven units
beneath it and never seen. found by hiding scene children one at a time
and measuring the frame, after three reasoned theories about domes and
gradients went nowhere. the floor is gone; the world now floats on an
infinite camera-following cloud sea (src/cloudsea.ts) that takes its
colour from the sky's own published light, and the slab's cut side is a
skirt of carved strata — topsoil, roots, clay, cliff bands, bedrock —
built from the terrain's own edge heights. the sea laps the skirt from
low angles, which reads as shoreline rather than as a hidden cliff.

- **the post chain cannot read its own depth texture.** found while
  masking the dither out of the sky: the shared depth texture reads as its
  exact clear value from every hand-driven tail pass, at every camera, to
  every target, under the swiftshader stack the captures run on — while
  scene occlusion (which uses the same attachment as a depth BUFFER) works
  fine. one real fault was found and fixed on the way (OutputPass writes
  depth 0.0 across the whole frame into the shared attachment — its
  fullscreen triangle sits at window depth zero with depthWrite on), but
  the reads stayed at clear value even after. consequence: the DOF's
  circle of confusion, the altitude mist and the grade's depth haze have
  been computing from a constant all along — their looks pass because
  uniform near-blur reads as strong DOF and the scene fog stands in for
  the haze. the dither's sky mask now uses local contrast instead of
  depth and is verified; the depth-dependent effects need a real fix
  (likely: render linear depth to a colour target ourselves) before DOF
  or mist can be called working. verify on real hardware too — this may
  be a swiftshader-only behaviour.

## other standing calls

- the world boots aged (50 epochs of simulated history and four finished
  works) so a fresh visitor sees a world, not an empty plain. `?young`
  boots the empty meadow. the real genesis starts young by law.
- the palette is locked in src/palette.ts and derived from a sampled frame
  of our own world, not invented. nothing samples a colour outside it.
- the ascent measures the height that actually stands rather than the
  height it drew, and re-anchors when a stage fails to lift the world.
