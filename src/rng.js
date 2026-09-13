// Seeded RNG so runs are reproducible and shareable.

export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function makeRng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashSeed(String(seed));
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (n) => Math.floor(rng() * n);
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.chance = (p) => rng() < p;
  rng.shuffle = (arr) => {
    const a2 = arr.slice();
    for (let i = a2.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a2[i], a2[j]] = [a2[j], a2[i]];
    }
    return a2;
  };
  rng.state = () => a;
  rng.setState = (s) => { a = s >>> 0; };
  return rng;
}

export function randomSeed() {
  const words = 'ACEBETCHIPDECKFELTGOLDHUSTINKJACKKEENLUCKMINTNOIRODDSPITQUIDRAKESPINTILTVOIDWAGERZERO';
  let s = '';
  for (let i = 0; i < 8; i++) s += words[Math.floor(Math.random() * words.length)];
  return s;
}
