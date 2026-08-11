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
} as const;

export const EPOCH_MS = RULES.tickMs * RULES.ticksPerEpoch;
