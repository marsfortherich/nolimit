// Boss Tables - the third round of every ante, each one breaking a rule.
// `setup` mutates the round before play; `flags` are read by the scorer.

export const BOSSES = [
  { id: 'auditor', name: 'The Auditor', glyph: '☰', minAnte: 1,
    text: 'You have 2 fewer chips to place',
    setup: (rd) => { rd.chipsTotal = Math.max(2, rd.chipsTotal - 2); } },

  { id: 'clock', name: 'The Clock', glyph: '⏱', minAnte: 1,
    text: '1 fewer spin',
    setup: (rd) => { rd.spinsLeft = Math.max(1, rd.spinsLeft - 1); rd.spinsTotal = rd.spinsLeft; } },

  { id: 'mirror', name: 'The Mirror', glyph: '◑', minAnte: 1,
    text: 'Red results score no Chips',
    flags: { deadColour: 'red' } },

  { id: 'shadow', name: 'The Shadow', glyph: '◒', minAnte: 1,
    text: 'Black results score no Chips',
    flags: { deadColour: 'black' } },

  { id: 'anchor', name: 'The Anchor', glyph: '⚓', minAnte: 1,
    text: 'Your first spin scores no Chips',
    flags: { deadSpins: 1 } },

  { id: 'croupier', name: 'The Croupier', glyph: '⛊', minAnte: 2,
    text: 'Outside bets (even-money, dozens, columns) score no Chips',
    flags: { deadFamilies: ['even', 'dozen', 'column'] } },

  { id: 'skinner', name: 'The Skinner', glyph: '✖', minAnte: 2,
    text: 'Straight-up bets score no Chips',
    flags: { deadFamilies: ['straight'] } },

  { id: 'needle', name: 'The Needle', glyph: '↓', minAnte: 2,
    text: 'Only straight-up bets score Chips',
    flags: { deadFamilies: ['even', 'dozen', 'column', 'street', 'line'] } },

  { id: 'cage', name: 'The Cage', glyph: '⛓', minAnte: 2,
    text: 'Nudges are disabled',
    setup: (rd) => { rd.nudgesLeft = 0; rd.freeNudges = 0; },
    flags: { noNudge: true } },

  { id: 'drought', name: 'The Drought', glyph: '◌', minAnte: 2,
    text: 'You cannot earn money this round',
    flags: { noMoney: true } },

  { id: 'fog', name: 'The Fog', glyph: '☁', minAnte: 3,
    text: 'Pocket enhancements do nothing',
    flags: { noEnhancements: true } },

  { id: 'wall', name: 'The Wall', glyph: '▦', minAnte: 3,
    text: 'Target is 40% higher',
    targetMult: 1.4 },

  { id: 'gale', name: 'The Gale', glyph: '≈', minAnte: 3,
    text: 'Every spin loses 6 Mult',
    flags: { multPenalty: 6 } },

  { id: 'tithe', name: 'The Tithe', glyph: '⅋', minAnte: 3,
    text: 'Each spin costs $1 per chip placed',
    flags: { tithe: true } },

  { id: 'magnet', name: 'The Magnet', glyph: '⊙', minAnte: 4,
    text: 'You may place at most 1 chip on any single spot',
    flags: { maxPerSpot: 1 } },

  { id: 'serpent', name: 'The Serpent', glyph: '§', minAnte: 4,
    text: 'After each spin, the spot you loaded heaviest is locked for the round',
    flags: { lockHeaviest: true } },

  { id: 'whisper', name: 'The Whisper', glyph: '?', minAnte: 4,
    text: 'The result stays hidden until you Collect',
    flags: { hideResult: true } },

  { id: 'twin', name: 'The Twin', glyph: '⧉', minAnte: 4,
    text: 'Every spin is rolled twice and the worse result is kept',
    flags: { worstOfTwo: true } },

  { id: 'grinder', name: 'The Grinder', glyph: '⊗', minAnte: 5,
    text: 'Your leftmost Token is disabled',
    flags: { disableLeftmost: true } },

  { id: 'bind', name: 'The Bind', glyph: '⊘', minAnte: 5,
    text: 'Tokens do not trigger on your first spin',
    flags: { noTokenSpins: 1 } },

  { id: 'vault', name: 'The Vault', glyph: '▤', minAnte: 5,
    text: 'Mult cannot go above 12',
    flags: { multCap: 12 } },

  { id: 'wheelbreaker', name: 'The Wheelbreaker', glyph: '✂', minAnte: 6,
    text: 'After every spin, a random pocket is torn out of the wheel',
    flags: { wheelbreak: true } }
];

export const BOSSES_BY_ID = Object.fromEntries(BOSSES.map((b) => [b.id, b]));

export function pickBoss(rng, ante, seen) {
  const pool = BOSSES.filter((b) => b.minAnte <= ante && !seen.includes(b.id));
  const from = pool.length ? pool : BOSSES.filter((b) => b.minAnte <= ante);
  return rng.pick(from);
}
