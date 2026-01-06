export type RngState = {
  seed: number;
  state: number;
  calls: number;
};

const fallbackSeed = 0x6d2b79f5;

const normalizeSeed = (seed?: number) => {
  const base = Number.isFinite(seed) ? Math.floor(seed as number) : Date.now();
  const normalized = (base >>> 0) || fallbackSeed;
  return normalized;
};

export const createRngState = (seed?: number): RngState => {
  const normalized = normalizeSeed(seed);
  return { seed: normalized, state: normalized, calls: 0 };
};

export const nextFloat = (rng: RngState) => {
  let value = rng.state >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  rng.state = value >>> 0;
  rng.calls += 1;
  return (rng.state >>> 0) / 0x100000000;
};

export const nextInt = (rng: RngState, min: number, max: number) => {
  if (max <= min) return min;
  return Math.floor(nextFloat(rng) * (max - min + 1)) + min;
};
