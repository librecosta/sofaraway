const SEED_COUNT = 0xffffffff;
export const CAPTURE_RUN_SEED = 0;

export function createRunSeed(): number {
  const word = new Uint32Array(1);
  do { crypto.getRandomValues(word); } while (word[0] === SEED_COUNT);
  return word[0];
}

function mix(word: number, stream: number): number {
  let value = word ^ stream;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

/** Each stream permutes the seed domain independently, without a shared cursor. */
export function runRandomWord(seed: number, stream: number): number {
  const value = mix((seed >>> 0) % SEED_COUNT, stream);
  // Keep 2^32 - 1 equally likely outputs, which divide evenly into three kinds.
  return value === SEED_COUNT ? mix(value, stream) : value;
}
