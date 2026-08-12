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
  agentBlockMs: 8_000, // the mason lays one block per ~8 seconds
  architectEpochs: 6, // the architect plans every 6 epochs (hourly at real cadence)
  crewBudgetUsdPerBlock: 40, // one blueprint block per $40 of trailing gross
  crewBudgetWindowMs: 10 * 60_000, // the trailing window that funds the crew
  crewBudgetIdleBelow: 12, // under this many funded blocks the crew idles + repairs
  crewBudgetMax: 600, // a single blueprint never exceeds this
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
