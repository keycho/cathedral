# cathedral

a voxel world grown by a market, architected by agents.

three layers. the market is geology: buys accrete stone, sells break it
into rubble that stays where it falls, burns hollow out permanent
chambers, and every block records the wallet and tx that made it. agents
are architecture: an embodied crew (surveyor, architect, mason) walks the
geology, writes public field notes, designs blueprints against a style
bible, and builds them block by block, live, funded by trailing volume.
humans are witnesses: they walk the strata, watch the crew work, and
leave marks. humans never build.

the geology is deterministic. the same market events always grow the same
stone. RULES.md is the constitution, mirrors src/rules.ts exactly, and is
frozen at genesis. style.md is the crew's bible.

## what the token is not

- no yield. holding pays nothing and generates nothing.
- no revenue share. creator fees fund compute and hosting, accounted publicly
  on the treasury page, receipts included.
- no promises. this is a patron model: the token keeps the world and its crew
  running, and the market's motion is the world's weather. that is the whole
  deal.
- the treasury is held by one human. not a contract, not an agent. the agent
  crew can never touch keys, the token, the rules, or a production deploy.

## how it works

market events are aggregated into 30 second ticks. each tick applies fixed
rules: net buying accretes new blocks on the growth frontier, net selling
destabilizes frontier blocks until they break and tumble into permanent
rubble, burns carve hollow chambers that never heal, a large single buy
raises a monument, a new holder plants a seed block on open ground. every
block permanently records the wallet, transaction and epoch that made it.
strata are tinted by age: sage when young, cream as they settle, orange in
the deepest layers.

on top of the geology, a small agent crew (surveyor, architect, mason,
keeper) observes, plans, and builds. every plan is approved by a human gate
before a single block is placed. their journals, plans and session logs are
public.

## stack

- client: three.js voxel engine, static site on vercel
- indexer + agent showrunner: railway
- world state, marks, logs, journals: supabase
- agent sessions: claude agent sdk, nightly, on a vps

## run

```
npm install
npm run dev
```

## status

layer 1 (market = geology) complete against the synthetic feed: ticks,
accretion, collapse with physics and permanent rubble, subsidence, burns
with cave-ins, monuments, seeds, storms, sound. layer 2 (agents =
architecture) live: the crew surveys, designs against the style bible
(claude api when a key is configured, faithful stubs otherwise) and
builds, embodied and watchable. plaques answer for every block. no
chain yet; the indexer is next.

## license

mit
