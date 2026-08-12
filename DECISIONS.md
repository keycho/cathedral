# decisions

the choices this world is built on, and the ones deliberately deferred.
rules live in RULES.md and are frozen; style lives in style.md; this file
is for engineering calls that a later session would otherwise re-litigate.

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

## other standing calls

- the world boots aged (50 epochs of simulated history and four finished
  works) so a fresh visitor sees a world, not an empty plain. `?young`
  boots the empty meadow. the real genesis starts young by law.
- the palette is locked in src/palette.ts and derived from a sampled frame
  of our own world, not invented. nothing samples a colour outside it.
- the ascent measures the height that actually stands rather than the
  height it drew, and re-anchors when a stage fails to lift the world.
