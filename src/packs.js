// Booster packs: pick a few options out of several. Contents are rolled when
// the pack is opened, not when the shop is stocked, so rerolling the shop can
// never fish for pack contents.

import { ENHANCEMENTS } from './data.js';

export const PACKS = [
  { id: 'chip',        name: 'Chip Pack',        glyph: '◈', kind: 'omen',  size: 3, picks: 1, cost: 4, weight: 20 },
  { id: 'chip_jumbo',  name: 'Jumbo Chip Pack',  glyph: '◈', kind: 'omen',  size: 5, picks: 1, cost: 6, weight: 8 },
  { id: 'chip_mega',   name: 'Mega Chip Pack',   glyph: '◈', kind: 'omen',  size: 5, picks: 2, cost: 8, weight: 4 },
  { id: 'token',       name: 'Token Pack',       glyph: '❖', kind: 'token', size: 2, picks: 1, cost: 6, weight: 14 },
  { id: 'token_jumbo', name: 'Jumbo Token Pack', glyph: '❖', kind: 'token', size: 4, picks: 1, cost: 8, weight: 6 },
  { id: 'wheel',       name: 'Wheel Pack',       glyph: '⊚', kind: 'enh',   size: 3, picks: 1, cost: 4, weight: 16 },
  { id: 'wheel_jumbo', name: 'Jumbo Wheel Pack', glyph: '⊚', kind: 'enh',   size: 5, picks: 2, cost: 7, weight: 7 },
  { id: 'fate',        name: 'Fate Pack',        glyph: '✷', kind: 'fate',  size: 2, picks: 1, cost: 7, weight: 5 }
];

export const PACKS_BY_ID = Object.fromEntries(PACKS.map((p) => [p.id, p]));

export function rollPackType(rng) {
  const total = PACKS.reduce((s, p) => s + p.weight, 0);
  let r = rng() * total;
  for (const p of PACKS) { r -= p.weight; if (r <= 0) return p; }
  return PACKS[0];
}

// ---------------------------------------------------------------------------
// Fate cards — the chaotic ones. They act on the wheel or on your Tokens
// wholesale, and they resolve immediately with no target to pick.
// ---------------------------------------------------------------------------

export const FATES = [
  { id: 'reshuffle', name: 'Reshuffle', glyph: '↯',
    text: 'Scramble the order of every pocket on the wheel',
    use: (G) => { G.wheel = G.rng.shuffle(G.wheel); G.log('Reshuffle: the wheel is rebuilt in a new order.'); } },

  { id: 'cull', name: 'The Cull', glyph: '✂',
    text: 'Tear three random pockets out of the wheel',
    use: (G) => {
      for (let i = 0; i < 3; i++) {
        if (G.wheel.length <= 12) break;
        G.removePocket(G.rng.pick(G.wheel).uid);
      }
      G.log('The Cull: three pockets are gone.');
    } },

  { id: 'bloom', name: 'Bloom', glyph: '❁',
    text: 'Enhance three random pockets',
    use: (G) => { for (let i = 0; i < 3; i++) G.enhanceRandomPocket(); } },

  { id: 'brand', name: 'Brand', glyph: '▨',
    text: 'Give a random Token a random edition',
    use: (G) => {
      const plain = G.tokens.filter((t) => !t.edition);
      if (!plain.length) { G.gain(6, 'Brand (nothing to brand)'); return; }
      const tk = G.rng.pick(plain);
      tk.edition = G.rng.pick(['foil', 'holo', 'poly']);
      G.log(`Brand: a Token turns ${tk.edition}.`);
    } },

  { id: 'ankh', name: 'Ankh', glyph: '☥',
    text: 'Copy a random Token you own',
    use: (G) => {
      if (!G.tokens.length || G.tokenCount() >= G.maxTokens) { G.gain(6, 'Ankh (no room)'); return; }
      const tk = G.rng.pick(G.tokens);
      G.acquireToken(tk.id, { edition: tk.edition });
      G.log('Ankh: a Token is copied.');
    } },

  { id: 'immolate', name: 'Immolate', glyph: '🜂',
    text: 'Destroy five random pockets and earn $25',
    use: (G) => {
      for (let i = 0; i < 5; i++) {
        if (G.wheel.length <= 12) break;
        G.removePocket(G.rng.pick(G.wheel).uid);
      }
      G.gain(25, 'Immolate');
    } },

  { id: 'sigil', name: 'Sigil', glyph: '◑',
    text: 'Every non-zero pocket becomes the same colour',
    use: (G) => {
      const c = G.rng() < 0.5 ? 'red' : 'black';
      for (const p of G.wheel) if (p.n !== 0) p.colour = c;
      G.log(`Sigil: the whole wheel turns ${c}.`);
    } },

  { id: 'talisman', name: 'Talisman', glyph: '∞',
    text: 'A random Token becomes Eternal and gains +1 sell value',
    use: (G) => {
      if (!G.tokens.length) { G.gain(6, 'Talisman (no Tokens)'); return; }
      const tk = G.rng.pick(G.tokens);
      tk.sticker = 'eternal';
      G.log('Talisman: a Token is bound to you for the rest of the run.'); } }
];

export const FATES_BY_ID = Object.fromEntries(FATES.map((f) => [f.id, f]));

/** Human-readable label for one option inside an open pack. */
export function packOptionLabel(opt, lookups) {
  if (opt.kind === 'token') return lookups.token(opt.id).name;
  if (opt.kind === 'omen') return lookups.omen(opt.id).name;
  if (opt.kind === 'enh') return ENHANCEMENTS[opt.id].name;
  return FATES_BY_ID[opt.id].name;
}
