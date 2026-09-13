// Static game data: the wheel, the betting layout, pocket enhancements.

/** Physical pocket order of a European single-zero wheel, clockwise from 0. */
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

export const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const PRIMES = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31]);

export function colourOf(n) {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

let pocketUid = 0;
export function makePocket(n, enh = null) {
  return { uid: 'p' + (pocketUid++), n, colour: colourOf(n), enh };
}

export function freshWheel() {
  return WHEEL_ORDER.map((n) => makePocket(n));
}

// ---------------------------------------------------------------------------
// Pocket enhancements
// ---------------------------------------------------------------------------

export const ENHANCEMENTS = {
  gilded: { id: 'gilded', name: 'Gilded', glyph: '◆', text: '+50 Chips when this pocket hits' },
  bonus:  { id: 'bonus',  name: 'Bonus',  glyph: '+', text: '+30 Chips when this pocket hits' },
  mult:   { id: 'mult',   name: 'Charged',glyph: '⚡', text: '+4 Mult when this pocket hits' },
  steel:  { id: 'steel',  name: 'Steel',  glyph: '▣', text: 'x1.5 Mult when this pocket hits' },
  glass:  { id: 'glass',  name: 'Glass',  glyph: '◈', text: 'x3 Mult when this pocket hits, 1 in 4 to shatter' },
  lucky:  { id: 'lucky',  name: 'Lucky',  glyph: '☘', text: '1 in 3 for x2 Mult, 1 in 6 for $4' }
};

// ---------------------------------------------------------------------------
// Betting layout
// ---------------------------------------------------------------------------

/**
 * Every clickable betting spot.
 *   chips / mult are the *base* contribution of a winning bet.
 *   chips is multiplied by the number of chips wagered; mult is not.
 */
export const SPOTS = {};

function spot(id, label, numbers, chips, mult, family) {
  SPOTS[id] = { id, label, numbers, chips, mult, family };
}

for (let n = 0; n <= 36; n++) spot('n' + n, String(n), [n], 150, 4, 'straight');

export const STREETS = [];
for (let i = 0; i < 12; i++) {
  const nums = [3 * i + 1, 3 * i + 2, 3 * i + 3];
  STREETS.push(nums);
  spot('st' + i, `${nums[0]}-${nums[2]}`, nums, 85, 2, 'street');
}

for (let i = 0; i < 11; i++) {
  const nums = STREETS[i].concat(STREETS[i + 1]);
  spot('ln' + i, `${nums[0]}-${nums[5]}`, nums, 44, 2, 'line');
}

for (let d = 0; d < 3; d++) {
  const nums = [];
  for (let k = 1; k <= 12; k++) nums.push(d * 12 + k);
  spot('dz' + d, ['1st 12', '2nd 12', '3rd 12'][d], nums, 32, 1, 'dozen');
}

for (let c = 0; c < 3; c++) {
  const nums = [];
  for (let n = 1; n <= 36; n++) if (n % 3 === (c + 1) % 3) nums.push(n);
  spot('cl' + c, '2:1', nums, 32, 1, 'column');
}

const reds = [], blacks = [], odds = [], evens = [], lows = [], highs = [];
for (let n = 1; n <= 36; n++) {
  (RED_NUMBERS.has(n) ? reds : blacks).push(n);
  (n % 2 ? odds : evens).push(n);
  (n <= 18 ? lows : highs).push(n);
}
// Chip values are tuned so every family has near-identical expected value per
// spin; what differs is variance. Outside bets are the reliable floor, a
// straight-up is the lottery ticket that Tokens turn into a build.
spot('low',   '1-18',  lows,   22, 1, 'even');
spot('even',  'EVEN',  evens,  22, 1, 'even');
spot('red',   'RED',   reds,   22, 1, 'even');
spot('black', 'BLACK', blacks, 22, 1, 'even');
spot('odd',   'ODD',   odds,   22, 1, 'even');
spot('high',  '19-36', highs,  22, 1, 'even');

export const OUTSIDE_FAMILIES = new Set(['dozen', 'column', 'even']);

export function isOutside(spotDef) { return OUTSIDE_FAMILIES.has(spotDef.family); }

// ---------------------------------------------------------------------------
// Ante targets
// ---------------------------------------------------------------------------

// Tuned against the bot in test/. The early steps are deliberately gentler:
// a wall at ante 2 lands before any build has come online, which reads as
// unfairness rather than difficulty.
export const ANTE_BASE = [120, 200, 450, 1050, 2450, 5600, 12500, 27000];

export const BLINDS = [
  { key: 'small', name: 'Small Table',  mult: 1,   reward: 4 },
  { key: 'big',   name: 'Big Table',    mult: 1.5, reward: 5 },
  { key: 'boss',  name: 'Boss Table',   mult: 2,   reward: 8 }
];

export function anteTarget(ante, blindIndex) {
  const base = ANTE_BASE[Math.min(ante, ANTE_BASE.length) - 1] * Math.pow(1.9, Math.max(0, ante - ANTE_BASE.length));
  return Math.round(base * BLINDS[blindIndex].mult);
}
