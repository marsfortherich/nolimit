// Stakes are difficulty tiers. Each one adds its rule on top of every rule
// below it, and beating a run unlocks the next.

export const STAKES = [
  { id: 'white',  name: 'White Stake',  colour: '#e8e6df', text: 'The base game.' },
  { id: 'red',    name: 'Red Stake',    colour: '#c0392b', text: 'Small Tables pay no reward.',
    mods: { noSmallReward: true } },
  { id: 'green',  name: 'Green Stake',  colour: '#2ea36a', text: 'Score targets scale faster.',
    mods: { targetScale: 1.10 } },
  { id: 'black',  name: 'Black Stake',  colour: '#4a4f58', text: 'Shops can stock Eternal Tokens, which cannot be sold.',
    mods: { sticker_eternal: 0.28 } },
  { id: 'blue',   name: 'Blue Stake',   colour: '#4b8bd6', text: 'One fewer Nudge each round.',
    mods: { nudges: -1 } },
  { id: 'purple', name: 'Purple Stake', colour: '#a457d4', text: 'Score targets scale faster still.',
    mods: { targetScale: 1.10 } },
  { id: 'orange', name: 'Orange Stake', colour: '#e08a2e', text: 'Shops can stock Perishable Tokens, which die after 5 rounds.',
    mods: { sticker_perishable: 0.28 } },
  { id: 'gold',   name: 'Gold Stake',   colour: '#d9b45b', text: 'Shops can stock Rented Tokens: $3 every round, no sell value.',
    mods: { sticker_rented: 0.28 } }
];

export const STAKES_BY_ID = Object.fromEntries(STAKES.map((s) => [s.id, s]));
export const stakeIndex = (id) => Math.max(0, STAKES.findIndex((s) => s.id === id));

/** Every rule from this stake and all lower ones, folded together. */
export function stakeMods(id) {
  const out = { targetScale: 1, nudges: 0 };
  for (let i = 0; i <= stakeIndex(id); i++) {
    const m = STAKES[i].mods;
    if (!m) continue;
    for (const [k, v] of Object.entries(m)) {
      if (k === 'targetScale') out.targetScale *= v;
      else if (typeof v === 'number' && typeof out[k] === 'number') out[k] += v;
      else out[k] = v;
    }
  }
  return out;
}

export const nextStake = (id) => STAKES[stakeIndex(id) + 1] || null;

// --- stickers -------------------------------------------------------------

export const STICKERS = {
  eternal:    { id: 'eternal',    name: 'Eternal',    glyph: '∞', text: 'Cannot be sold or destroyed' },
  perishable: { id: 'perishable', name: 'Perishable', glyph: '☠', text: 'Stops working after 5 more rounds' },
  rented:     { id: 'rented',     name: 'Rented',     glyph: '§', text: 'Costs $3 each round, sells for nothing' }
};

/** At most one sticker per Token, rolled when the shop stocks it. */
export function rollSticker(rng, mods) {
  for (const id of ['eternal', 'perishable', 'rented']) {
    const p = mods['sticker_' + id];
    if (p && rng() < p) return id;
  }
  return null;
}
