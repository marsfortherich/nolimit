// Editions sit on top of a Token and add a flat bonus whenever it triggers.
// They are the cheapest way to make an ordinary Token exciting to find.

export const EDITIONS = {
  foil:     { id: 'foil',     name: 'Foil',         text: '+50 Chips',  chips: 50 },
  holo:     { id: 'holo',     name: 'Holographic',  text: '+12 Mult',   mult: 12 },
  poly:     { id: 'poly',     name: 'Polychrome',   text: 'x1.5 Mult',  xmult: 1.5 },
  negative: { id: 'negative', name: 'Negative',     text: 'Takes no Token slot', slot: 1 }
};

// Base odds per shop Token. Tags and Charters push these up.
const BASE_ODDS = [
  ['foil', 0.020],
  ['holo', 0.014],
  ['poly', 0.007],
  ['negative', 0.003]
];

export function rollEdition(rng, boost = 1) {
  for (const [id, p] of BASE_ODDS) {
    if (rng() < p * boost) return id;
  }
  return null;
}

export const editionDef = (id) => (id ? EDITIONS[id] : null);

/** Price bump so an edition is worth something when it shows up in the shop. */
export function editionPrice(id) {
  return { foil: 2, holo: 3, poly: 4, negative: 5 }[id] || 0;
}
