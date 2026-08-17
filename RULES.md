# rules

a voxel world grown by a market, architected by agents.

the constitution of kodō. this file is the human mirror of
src/rules.ts: every constant and rule below appears there verbatim. after
genesis this file is frozen. if the code and this file ever disagree, the
code is wrong.

## time

- a tick is 30 seconds. each tick aggregates the raw event feed into four
  numbers: netFlowUsd, grossVolumeUsd, uniqueWallets, largestTxUsd.
- an epoch is 20 ticks (10 minutes).
- strata are tinted by the epoch they were born in: sage while young, cream
  as they settle, orange in the oldest, deepest layers. older is deeper.

## geology

- r1, accretion. if a tick's netFlowUsd is positive, floor(netFlowUsd / 50)
  blocks accrete. growth is organic from the genesis block outward: each new
  block attaches to a weighted random exposed face of the existing mass, with
  an upward bias. every block permanently stores { wallet, txRef, epoch }.
  attribution is distributed across that tick's buying wallets in proportion
  to their usd volume, so a wallet's formation grows where its blocks landed.

- r2, collapse. if a tick's netFlowUsd is negative, floor(|netFlowUsd| / 50)
  frontier blocks destabilize. a destabilized block steps through damage
  tiers, then breaks off with physics, tumbles, and settles at the base as
  rubble. rubble is permanent and walkable. collapse targets the formations
  of that tick's selling wallets first.

- r2b, subsidence. after 12 consecutive negative ticks the whole structure
  sinks one block, exposing older strata at the peak.

- r3, burns. a burn of amountTokens carves a hollow sphere inside the mass,
  radius proportional to the amount. hollows are permanent, never re-accrete,
  are walkable, and their interior faces hold a dim orange emissive glow.

- r4, whale monument. a single transaction over $1000 immediately raises a
  two block bright monolith at the highest point of the frontier.

- r5, new holder. a wallet's first buy plants a seed block on empty ground
  within 20 blocks of the mass.

- r6, ambient. ash particle density and light warmth scale with the tick's
  grossVolumeUsd.

- fresh erosion scars glow ember and cool over roughly 2 hours.

## the place layer

- anyone may walk the world first person, including hollows and rubble. an
  orbit camera is always available. mobile is orbit only.
- witness marks: one lantern per visitor per day, anonymous device id,
  persistent, rendered for everyone.
- the bell: one object near the genesis block. anyone may ring it. one toll
  per minute globally. every toll is audible and visible to all connected
  visitors and is logged.
- wallet lens: a connected wallet highlights the blocks it built, the blocks
  of those that survive, and the region of its formation.
- gravestones: when a claimed wallet's sell erodes its own formation, the
  owner chooses once: a gravestone with a filtered message of at most 60
  characters, or silent collapse.
- presence: live visitors render as faint ash silhouettes, position only.
- plaques: any block can be inspected for its provenance: epoch, truncated
  wallet, txRef, and the tick it was born.

## the crew

agents build architecture above the geology, never instead of it.

- the crew is embodied: every block an agent lays is walked to and placed
  in the open, one block per ~8 seconds.
- the architect designs blueprints (up to 600 ordered blocks) against the
  style bible (style.md); the surveyor's public field notes and the
  market's aggregates are its only other inputs. the mason executes
  blueprints exactly.
- the crew is funded by trailing volume: one blueprint block per $40 of
  gross traded in the trailing 10 minutes. under 12 funded blocks the
  crew idles and repairs. a quiet market builds nothing new.
- market damage to crew structures is repaired before anything new is
  built.
- forbidden to the crew, always: the founding stone, burn hollows, another
  agent's territory, and every geology cell.
- geology speaks in its three strata tints only; the crew's materials are
  its own. grown and architected must read apart at a glance.
- humans are witnesses. humans never build.

## r1 growth shaping (frozen)

accretion is terrain: geology the crew architects on. candidate faces are
weighted at pick time:

| weight               | value |
| -------------------- | ----- |
| sprout up (top face) | 2.4   |
| lateral spread       | 1.0   |
| under overhang       | 0.22  |
| same-wallet bonus    | 1.3   |
| compactness (per extra neighbour) | 0.32 |
| organic jitter       | 0.3   |

## constants

| constant            | value          |
| ------------------- | -------------- |
| tick length         | 30 s           |
| ticks per epoch     | 20             |
| usd per block       | 50             |
| subsidence trigger  | 12 negative ticks in a row |
| whale threshold     | $1000 single tx |
| monument size       | 2 blocks       |
| seed distance       | within 20 blocks of mass |
| scar cooldown       | ~2 h           |
| lantern limit       | 1 per visitor per day |
| bell limit          | 1 toll per minute, global |
| gravestone message  | 60 chars, filtered |
| mason pace          | 1 block per ~8 s |
| architect cadence   | every 6 epochs |
| crew funding        | 1 block per $40 trailing 10 min gross |
| crew idle floor     | under 12 funded blocks |
| blueprint cap       | 600 blocks |

## immutability

these rules do not change after genesis. no rule may be added, removed or
retuned by anyone, human or agent. the agent crew reads the world these rules
produce and builds above it. it has no write access to the rules, the token,
the treasury, or production.
