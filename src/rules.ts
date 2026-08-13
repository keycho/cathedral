// cathedral - the constitution's constants, in one object, mirrored word
// for word by RULES.md (if they ever disagree, this file is wrong). frozen
// at genesis. the deterministic rule LOGIC (tick aggregation, r1-r6
// application) lands here in phase 1d; until then the synthetic feed
// drives the geology primitives directly through these same constants.

export const RULES = {
  // time
  tickMs: 30_000, // a tick is 30 seconds
  ticksPerEpoch: 20, // an epoch is 20 ticks (10 minutes)

  // r1 accretion / r2 collapse
  usdPerBlock: 50, // floor(|netFlowUsd| / 50) blocks per tick

  // r2b subsidence
  subsidenceTicks: 12, // consecutive negative ticks before the mass sinks 1

  // r3 burns
  burnRadiusMin: 2, // hollow radius bounds (radius ~ amountTokens)
  burnRadiusMax: 6.5,

  // r4 whale monument
  whaleUsd: 1000, // single tx over this raises a monolith
  monumentBlocks: 2,

  // r5 new holder
  seedRadius: 20, // seed block lands within this of the mass

  // look constants named by the rules
  scarCoolMs: 2 * 60 * 60 * 1000, // erosion scars cool over ~2h

  // the place layer
  lanternsPerVisitorPerDay: 1,
  bellCooldownMs: 60_000, // one toll per minute, global
  gravestoneChars: 60,

  // the crew (agents build above the geology, never instead of it)
  //
  // THE WORLD HAS TO VISIBLY FINISH THINGS. at eight seconds a stone a
  // full six hundred block blueprint took eighty minutes, so an ordinary
  // building was never done inside an hour and a visitor only ever saw
  // scaffolding. five seconds puts a full ordinary work at fifty minutes
  // and a thousand-block great-work tier at about eighty-five, which is
  // the one-to-two hours the great work is supposed to take. it is still
  // a stone you can watch land.
  agentBlockMs: 5_000,
  // AT ONE STONE A BEAT THE MASON LAYS 720 AN HOUR, and a single work may
  // now be three thousand. left alone the world would sit four hours behind
  // one building and permanently behind the market — and because the
  // architect's throttle then refuses to plan, the market's money would buy
  // nothing at all on every cycle it was skipped.
  //
  // the last stones of any work are laid one at a time — a queue shrinks
  // past this threshold on its way down, so every building FINISHES at the
  // watchable pace and the last seventeen minutes of it are a stone you
  // can follow. past the threshold the crew sets more per beat.
  //
  // the threshold has to be small or it becomes the whole cost: at 700 the
  // tail alone was an hour and nothing could finish inside one however fast
  // the rest went. at 200 and twelve a side, a 3000-block work lands in
  // ~56 minutes and a full two-work yard in ~1h15 rather than eight hours.
  masonWatchableBacklog: 200,
  masonBatchMax: 12,
  // and a hard stop on how deep the yard may get before the architect stops
  // drawing. at this depth the batch is maxed, so the ceiling is about
  // twenty-five minutes of laying however big the works that filled it were.
  masonBacklogCeiling: 3_500,
  architectEpochs: 6, // the architect plans every 6 epochs (hourly at real cadence)
  crewBudgetUsdPerBlock: 40, // one blueprint block per $40 of trailing gross
  crewBudgetWindowMs: 10 * 60_000, // the trailing window that funds the crew
  crewBudgetIdleBelow: 12, // under this many funded blocks the crew idles + repairs
  // A SIGNIFICANT WORK IS A SIGNIFICANT WORK. six hundred blocks is a
  // pavilion, and a world of pavilions is what six hundred blocks buys. a
  // hall wants fifteen hundred and a great hall two and a half thousand,
  // which at five seconds a stone is two to four hours of laying — the same
  // pacing the great work runs at, and the right pacing for a building you
  // are meant to watch go up.
  //
  // this is a CEILING, not a target. the architect picks the scale from
  // what it is building: a wayside shrine is two hundred, a gate complex
  // eight hundred, a hall fifteen hundred. the catalogue quotes every
  // part's cost at three sizes now, so it can sum before it commits, and a
  // design that overreaches still degrades to a coherent prefix.
  crewBudgetMax: 2400,

  // A STREET IS A BIGGER OBJECT THAN A HALL, and the same allowance for
  // both is why town designs arrived half-built: one composition wrote 48
  // parts and lost 24 of them, another wrote 32 and lost 23. that is not
  // over-reach, it is arithmetic — a hall is a podium, four columns, a
  // roof and a finial, while a street is a row of shopfronts AND the road
  // AND the kerb AND everything left lying on it, and the town's parts are
  // small (an ac unit is 6 blocks, a bicycle 5). a street that loses half
  // its clutter is not a street.
  //
  // 900 at five seconds a stone is seventy-five minutes: still inside the
  // hour-and-a-bit an ordinary work is supposed to take.
  crewBudgetTownMax: 3000,

  // THE GREAT WORK IS NOT AN ORDINARY BLUEPRINT. a tier of it is around a
  // thousand blocks, which no single cycle's trailing volume will ever
  // fund, so squeezing it into one cycle's allowance is how a cathedral
  // becomes a shed. it draws on a STANDING budget instead: every funded
  // cycle puts a share aside, the pot persists across cycles, and a tier
  // is authorised when the pot can pay for it.
  //
  // sized in HOURS. at five seconds a stone a 1200-block ceiling is a
  // hundred minutes of continuous laying — one tier, one afternoon. the
  // pot fills in about eight ordinary cycles, so a tier lands roughly
  // every couple of hours of a busy market rather than every few weeks.
  greatWorkBlocks: 4000, // the ceiling for one tier of the great work — above any ordinary work, which is the point of it
  greatWorkShare: 0.5, // the share of each funded cycle that accrues to it
} as const;

// r1 growth shaping, frozen after judging (accretion is terrain: geology
// the crew architects on; it does not need to be interesting alone).
// weights are per candidate face at pick time; see src/growth.ts.
export const GROW = {
  wBelow: 2.4, // sprouting up off a top face
  wSide: 1.0, // spreading laterally off a wall
  wAbove: 0.22, // hanging under an overhang (rare)
  wSameWallet: 1.3, // added per neighbour owned by the same wallet
  wCompact: 0.32, // added per structure neighbour beyond the first
  jitter: 0.3, // organic wobble on every weight
  margin: 8, // keep growth off the grid rim
  maxPerFrame: 5, // drain cap during heavy backlog
};

export const EPOCH_MS = RULES.tickMs * RULES.ticksPerEpoch;
