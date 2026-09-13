// Starting wheels — the "deck" choice. Each one changes the opening shape of a
// run rather than just its numbers, so the first shop already plays differently.
//
// `setup(G)` runs once, after G.wheel exists and before the first table.
// `mods` are read by the Game getters (spins, chips, slots, economy).

import { ENHANCEMENTS } from './data.js';

export const WHEELS = [
  { id: 'house', name: 'House Wheel', glyph: '⊚',
    text: 'The standard single-zero wheel. Nothing up anyone\'s sleeve.',
    unlockText: 'Available from the start' },

  { id: 'trimmed', name: 'Trimmed Wheel', glyph: '✂',
    text: 'Six pockets have already been pried out. One fewer spin each round.',
    mods: { spins: -1 },
    unlockText: 'Reach Ante 2',
    setup: (G) => {
      for (let i = 0; i < 6; i++) {
        const p = G.rng.pick(G.wheel.filter((x) => x.n !== 0));
        if (p) G.removePocket(p.uid);
      }
    } },

  { id: 'loaded', name: 'Loaded Wheel', glyph: '❐',
    text: 'Three numbers are set into the wheel twice. One extra chip to place.',
    mods: { chips: 1 },
    unlockText: 'Reach Ante 3',
    setup: (G) => {
      for (let i = 0; i < 3; i++) {
        const p = G.rng.pick(G.wheel.filter((x) => x.n !== 0));
        if (p) G.clonePocket(p);
      }
    } },

  { id: 'american', name: 'American Wheel', glyph: '≡',
    text: 'A second zero, as the house prefers it. One extra Token slot.',
    mods: { tokenSlots: 1 },
    unlockText: 'Reach Ante 4',
    setup: (G) => G.addPocketNumber(0) },

  { id: 'gilded', name: 'Gilded Wheel', glyph: '◆',
    text: 'Four pockets are already worked. You start broke.',
    mods: { startMoney: 0 },
    unlockText: 'Reach Ante 5',
    setup: (G) => {
      const kinds = Object.keys(ENHANCEMENTS);
      for (let i = 0; i < 4; i++) {
        const p = G.rng.pick(G.wheel.filter((x) => !x.enh));
        if (p) p.enh = G.rng.pick(kinds);
      }
    } },

  { id: 'pauper', name: "Pauper's Wheel", glyph: '☘',
    text: 'Start with two random Common Tokens. You earn no interest, ever.',
    mods: { noInterest: true },
    unlockText: 'Reach Ante 6',
    setup: (G) => { G.grantRandomToken('common'); G.grantRandomToken('common'); } },

  { id: 'chartered', name: 'Chartered Wheel', glyph: '✦',
    text: 'Start with a random Charter. Shops stock one fewer item.',
    mods: { shopSlots: -1 },
    unlockText: 'Win a run',
    setup: (G) => G.grantRandomCharter() },

  { id: 'bare', name: 'Bare Wheel', glyph: '○',
    text: 'Every bet pays 30% more Chips. One fewer chip to place.',
    mods: { chips: -1, chipBonus: 1.3 },
    unlockText: 'Win a run on Red Stake or higher' }
];

export const WHEELS_BY_ID = Object.fromEntries(WHEELS.map((w) => [w.id, w]));

export function wheelMods(id) {
  return (WHEELS_BY_ID[id] || {}).mods || {};
}

/**
 * Unlocks earned by a finished run. Kept here so the condition sits next to
 * the thing it unlocks.
 */
export function wheelsEarnedBy(summary) {
  const got = [];
  if (summary.ante >= 2) got.push('trimmed');
  if (summary.ante >= 3) got.push('loaded');
  if (summary.ante >= 4) got.push('american');
  if (summary.ante >= 5) got.push('gilded');
  if (summary.ante >= 6) got.push('pauper');
  if (summary.won) got.push('chartered');
  if (summary.won && summary.stake !== 'white') got.push('bare');
  return got;
}
