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

## other standing calls

- the world boots aged (50 epochs of simulated history and four finished
  works) so a fresh visitor sees a world, not an empty plain. `?young`
  boots the empty meadow. the real genesis starts young by law.
- the palette is locked in src/palette.ts and derived from a sampled frame
  of our own world, not invented. nothing samples a colour outside it.
- the ascent measures the height that actually stands rather than the
  height it drew, and re-anchors when a stage fails to lift the world.
