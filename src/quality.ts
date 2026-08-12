// cathedral - quality tiers and the bisect harness. the render budget is
// the product: a 24/7 stream and every mobile visitor depend on the aged
// world holding 60fps at orbit and on foot. so the tier is not decoration,
// it is the contract, and every expensive thing in the world hangs off it.
//
// LOW is the default until a real gpu says otherwise. nothing in the post
// stack is on by default; the world renders straight.
//
// every effect can be switched independently at runtime (hud buttons or
// ?fx=), so the cost of each can be measured on real hardware one at a
// time instead of guessed at in a software rasterizer.

export type Tier = "low" | "medium" | "high";

export interface Effects {
  gtao: boolean; // ground-truth ambient occlusion (the usual killer)
  bloom: boolean; // emissive halo
  grade: boolean; // lut + vignette + grain (one fullscreen pass)
  haze: boolean; // depth-based atmospheric scattering (inside the grade pass)
}

export interface Quality {
  tier: Tier;
  fx: Effects;
  pixelRatio: number; // hard cap; the composer pays for every pixel twice over
  shadowMapSize: number;
  shadowRadius: number;
  driftLayers: number; // particle layers (1..3)
  stars: number;
  floraShadows: boolean;
  shadowFrustum: number; // half-width of the sun's shadow camera, in blocks
  shadowEvery: number; // refresh the shadow map every n frames (the sun crawls)
}

const TIERS: Record<Tier, Omit<Quality, "tier" | "fx">> = {
  // resolution stays measurable on its own axis (the readout carries a pr
  // control), but the tier still picks a sane default: high was measured
  // at 60fps locked with the full stack at pr 2.
  low: { pixelRatio: 1, shadowMapSize: 1024, shadowRadius: 2, driftLayers: 1, stars: 500, floraShadows: false, shadowFrustum: 40, shadowEvery: 4 },
  medium: { pixelRatio: 1.25, shadowMapSize: 2048, shadowRadius: 3, driftLayers: 2, stars: 900, floraShadows: false, shadowFrustum: 55, shadowEvery: 2 },
  high: { pixelRatio: 2, shadowMapSize: 4096, shadowRadius: 4.5, driftLayers: 3, stars: 1500, floraShadows: true, shadowFrustum: 70, shadowEvery: 1 },
};

const FX: Record<Tier, Effects> = {
  low: { gtao: false, bloom: false, grade: true, haze: true },
  medium: { gtao: false, bloom: true, grade: true, haze: true },
  high: { gtao: true, bloom: true, grade: true, haze: true },
};

const STORE_KEY = "cathedral.quality";

// what the machine can be expected to hold. the full stack was measured at
// 60fps locked on a normal laptop gpu, so a desktop starts at high and only
// phones and thin machines start lower.
export function detectTier(): Tier {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (mobile) return "low";
  const cores = navigator.hardwareConcurrency ?? 4;
  if (cores <= 4) return "medium";
  return "high";
}

// url wins, then whatever was last chosen in the hud, then the machine.
export function initialQuality(): Quality {
  const params = new URLSearchParams(location.search);
  const urlTier = params.get("tier") as Tier | null;
  let tier: Tier = detectTier();
  if (urlTier === "low" || urlTier === "medium" || urlTier === "high") tier = urlTier;
  else {
    try {
      const saved = localStorage.getItem(STORE_KEY) as Tier | null;
      if (saved === "low" || saved === "medium" || saved === "high") tier = saved;
    } catch {
      // storage blocked: the detected tier stands
    }
  }
  const q: Quality = { tier, fx: { ...FX[tier] }, ...TIERS[tier] };

  // ?fx=gtao,bloom overrides the tier's effect set exactly, so a single
  // effect can be measured on its own
  const fxParam = params.get("fx");
  if (fxParam !== null) {
    const want = new Set(fxParam.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
    q.fx = {
      gtao: want.has("gtao"),
      bloom: want.has("bloom"),
      grade: want.has("grade"),
      haze: want.has("haze"),
    };
  }
  const pr = params.get("pr");
  if (pr) q.pixelRatio = Math.max(0.5, Math.min(3, Number(pr) || q.pixelRatio));
  return q;
}

export function qualityFor(tier: Tier): Quality {
  return { tier, fx: { ...FX[tier] }, ...TIERS[tier] };
}

export function rememberTier(tier: Tier) {
  try {
    localStorage.setItem(STORE_KEY, tier);
  } catch {
    // storage blocked: the url still works
  }
}
