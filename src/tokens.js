// Tokens - the "joker" layer. Order matters: they score left to right.
//
// Hooks (all optional):
//   resolve(ctx, tk)    - run before winners are locked in
//   score(ctx, tk)      - main scoring pass, only on a spin that won something
//   finalize(ctx, tk)   - after every token has scored
//   spinEnd(ctx, tk)    - after every spin, win or lose (commit phase only)
//   roundStart(rd, st, tk)
//   roundEnd(st, tk)
//   describe(tk, st)    - dynamic rules text

import { PRIMES } from './data.js';

export const RARITY = {
  common:    { name: 'Common',    colour: '#4b8bd6' },
  uncommon:  { name: 'Uncommon',  colour: '#2ea36a' },
  rare:      { name: 'Rare',      colour: '#d0483f' },
  legendary: { name: 'Legendary', colour: '#a457d4' }
};

const T = [];
const def = (o) => { T.push(o); return o; };

// --- flat stat sticks -------------------------------------------------------

def({ id: 'croupier', name: 'The Croupier', rarity: 'common', cost: 4,
  text: '+4 Mult',
  score: (c) => c.addMult(4) });

def({ id: 'fatstack', name: 'Fat Stack', rarity: 'common', cost: 4,
  text: '+50 Chips',
  score: (c) => c.addChips(50) });

def({ id: 'ivory', name: 'Ivory Ball', rarity: 'common', cost: 5,
  text: '+25 Chips for every chip you placed this spin',
  score: (c) => c.addChips(25 * c.chipsPlaced) });

def({ id: 'spread', name: 'Spread Bettor', rarity: 'common', cost: 5,
  text: '+2 Mult for each different spot you bet on this spin',
  score: (c) => c.addMult(2 * c.spotsUsed) });

// --- colour / parity payoffs ------------------------------------------------

def({ id: 'reddevil', name: 'Red Devil', rarity: 'common', cost: 5,
  text: 'x1.5 Mult if the result is red',
  score: (c) => { if (c.colour === 'red') c.xMult(1.5); } });

def({ id: 'blackwidow', name: 'Black Widow', rarity: 'common', cost: 5,
  text: '+70 Chips if the result is black',
  score: (c) => { if (c.colour === 'black') c.addChips(70); } });

def({ id: 'oddfellow', name: 'Odd Fellow', rarity: 'common', cost: 5,
  text: '+8 Mult if the result is odd',
  score: (c) => { if (c.result % 2 === 1) c.addMult(8); } });

def({ id: 'evensteven', name: 'Even Steven', rarity: 'common', cost: 5,
  text: '+8 Mult if the result is even (0 does not count)',
  score: (c) => { if (c.result !== 0 && c.result % 2 === 0) c.addMult(8); } });

def({ id: 'primetime', name: 'Prime Time', rarity: 'uncommon', cost: 6,
  text: '+13 Mult if the result is a prime number',
  score: (c) => { if (PRIMES.has(c.result)) c.addMult(13); } });

def({ id: 'luckyseven', name: 'Lucky Seven', rarity: 'uncommon', cost: 6,
  text: 'x2 Mult if the result contains a 7',
  score: (c) => { if (String(c.result).includes('7')) c.xMult(2); } });

def({ id: 'bakers', name: 'Bakers Dozen', rarity: 'uncommon', cost: 6,
  text: 'x13 Mult if the result is exactly 13',
  score: (c) => { if (c.result === 13) c.xMult(13); } });

def({ id: 'zerohour', name: 'Zero Hour', rarity: 'uncommon', cost: 7,
  text: 'If 0 hits: x4 Mult and earn $5',
  score: (c) => { if (c.result === 0) { c.xMult(4); c.addMoney(5); } } });

// --- bet-family payoffs -----------------------------------------------------

def({ id: 'dozendiver', name: 'Dozen Diver', rarity: 'common', cost: 4,
  text: '+35 Chips for each winning Dozen bet',
  score: (c) => { const n = c.countFamily('dozen'); if (n) c.addChips(35 * n); } });

def({ id: 'columncult', name: 'Column Cult', rarity: 'common', cost: 5,
  text: 'x1.4 Mult for each winning Column bet',
  score: (c) => { for (let i = 0; i < c.countFamily('column'); i++) c.xMult(1.4); } });

def({ id: 'straightshooter', name: 'Straight Shooter', rarity: 'uncommon', cost: 7,
  text: '+200 Chips if a straight-up bet wins',
  score: (c) => { if (c.countFamily('straight')) c.addChips(200); } });

def({ id: 'streetrat', name: 'Street Rat', rarity: 'common', cost: 5,
  text: '+6 Mult for each winning Street or Line bet',
  score: (c) => { const n = c.countFamily('street') + c.countFamily('line'); if (n) c.addMult(6 * n); } });

def({ id: 'highroller', name: 'High Roller', rarity: 'uncommon', cost: 7,
  text: 'x3 Mult if every chip you placed sits on a single spot',
  score: (c) => { if (c.spotsUsed === 1 && c.chipsPlaced >= 2) c.xMult(3); } });

def({ id: 'shotgun', name: 'Shotgun', rarity: 'uncommon', cost: 6,
  text: 'x2 Mult if you placed chips on 5 or more different spots',
  score: (c) => { if (c.spotsUsed >= 5) c.xMult(2); } });

// --- economy ----------------------------------------------------------------

def({ id: 'greenfelt', name: 'Green Felt', rarity: 'uncommon', cost: 6,
  text: 'Earn $2 for every spin that scores',
  score: (c) => c.addMoney(2) });

def({ id: 'rake', name: 'The Rake', rarity: 'common', cost: 4,
  text: 'Earn $2 for every spin that scores nothing',
  spinEnd: (c) => { if (!c.won) c.addMoney(2); } });

def({ id: 'goldenchip', name: 'Golden Chip', rarity: 'common', cost: 5,
  text: '$4 at the end of every round',
  roundEnd: (st) => st.gain(4, 'Golden Chip') });

def({ id: 'nudger', name: 'The Nudger', rarity: 'common', cost: 4,
  text: '$3 for every Nudge left unused at the end of a round',
  roundEnd: (st) => { const n = st.round.nudgesLeft; if (n > 0) st.gain(3 * n, 'The Nudger'); } });

def({ id: 'compound', name: 'Compound', rarity: 'uncommon', cost: 6,
  text: 'Interest cap raised to $10',
  passive: { interestCap: 10 } });

def({ id: 'chipleader', name: 'Chip Leader', rarity: 'uncommon', cost: 6,
  text: '+2 Mult for every $5 you are holding',
  score: (c) => { const m = 2 * Math.floor(c.state.money / 5); if (m) c.addMult(m); },
  describe: (tk, st) => `+2 Mult per $5 held. Currently +${2 * Math.floor(st.money / 5)} Mult.` });

def({ id: 'broke', name: 'Stone Broke', rarity: 'uncommon', cost: 6,
  text: 'x5 Mult while you have $0',
  score: (c) => { if (c.state.money <= 0) c.xMult(5); } });

// --- stateful / scaling -----------------------------------------------------

def({ id: 'martingale', name: 'Martingale', rarity: 'uncommon', cost: 6,
  text: 'Gains +5 Mult for each spin lost in a row. Resets when a spin scores.',
  init: () => ({ n: 0 }),
  score: (c, tk) => { if (tk.st.n) c.addMult(5 * tk.st.n); },
  spinEnd: (c, tk) => { tk.st.n = c.won ? 0 : tk.st.n + 1; },
  roundStart: (rd, st, tk) => { tk.st.n = 0; },
  describe: (tk) => `Currently +${5 * tk.st.n} Mult. +5 more per losing spin, resets on a win.` });

def({ id: 'hotstreak', name: 'Hot Streak', rarity: 'uncommon', cost: 6,
  text: 'x0.4 Mult more for each consecutive scoring spin this round',
  init: () => ({ n: 0 }),
  score: (c, tk) => { if (tk.st.n) c.xMult(1 + 0.4 * tk.st.n); },
  spinEnd: (c, tk) => { tk.st.n = c.won ? tk.st.n + 1 : 0; },
  roundStart: (rd, st, tk) => { tk.st.n = 0; },
  describe: (tk) => `Currently x${(1 + 0.4 * tk.st.n).toFixed(1)} Mult.` });

def({ id: 'shark', name: 'The Shark', rarity: 'rare', cost: 8,
  text: 'x1 Mult, gains x0.3 for every round you beat',
  init: () => ({ x: 1 }),
  score: (c, tk) => { if (tk.st.x > 1) c.xMult(tk.st.x); },
  roundEnd: (st, tk) => { tk.st.x = Math.round((tk.st.x + 0.3) * 10) / 10; },
  describe: (tk) => `Currently x${tk.st.x.toFixed(1)} Mult.` });

def({ id: 'memory', name: 'Photographic Memory', rarity: 'uncommon', cost: 6,
  text: '+3 Mult for every previous time this number has hit in the run',
  score: (c) => { const n = c.state.stats.hits[c.result] || 0; if (n) c.addMult(3 * n); } });

def({ id: 'ledger', name: 'The Ledger', rarity: 'rare', cost: 8,
  text: 'Gains +30 Chips every time a spin scores nothing',
  init: () => ({ c: 0 }),
  score: (c, tk) => { if (tk.st.c) c.addChips(tk.st.c); },
  spinEnd: (c, tk) => { if (!c.won) tk.st.c += 30; },
  describe: (tk) => `Currently +${tk.st.c} Chips.` });

// --- wheel manipulation -----------------------------------------------------

def({ id: 'neighbour', name: 'The Neighbour', rarity: 'rare', cost: 9,
  text: 'Bets also win on the pockets either side of the result, at half value',
  resolve: (c) => c.enableNeighbours() });

def({ id: 'voidpocket', name: 'Void Pocket', rarity: 'rare', cost: 8,
  text: 'When a spin scores nothing, that pocket is removed from the wheel forever',
  spinEnd: (c) => { if (!c.won) c.removeResultPocket(); } });

def({ id: 'doublezero', name: 'Double Zero', rarity: 'uncommon', cost: 6,
  text: 'Adds a second 0 to the wheel. x2 Mult when 0 hits.',
  onAcquire: (st) => st.addPocketNumber(0),
  score: (c) => { if (c.result === 0) c.xMult(2); } });

def({ id: 'wheelwright', name: 'The Wheelwright', rarity: 'uncommon', cost: 7,
  text: 'At the end of each round, enhance a random pocket',
  roundEnd: (st) => st.enhanceRandomPocket() });

def({ id: 'deeppockets', name: 'Deep Pockets', rarity: 'rare', cost: 8,
  text: 'The result pocket triggers its enhancement twice',
  passive: { retriggerEnh: true } });

def({ id: 'bias', name: 'Biased Wheel', rarity: 'rare', cost: 10,
  text: 'Every spin is rolled twice - the result better for you is kept',
  passive: { doubleRoll: true } });

// --- resources --------------------------------------------------------------

def({ id: 'sleeve', name: 'The Sleeve', rarity: 'uncommon', cost: 6,
  text: '+1 chip to place each round',
  passive: { chips: 1 } });

def({ id: 'extraspin', name: 'Overtime', rarity: 'rare', cost: 9,
  text: '+1 spin each round',
  passive: { spins: 1 } });

def({ id: 'extranudge', name: 'Heavy Thumb', rarity: 'uncommon', cost: 6,
  text: '+2 Nudges each round',
  passive: { nudges: 2 } });

def({ id: 'pitboss', name: 'The Pit Boss', rarity: 'rare', cost: 9,
  text: 'Boss Table targets are 25% lower',
  passive: { bossDiscount: 0.75 } });

// --- copies & legendaries ---------------------------------------------------

def({ id: 'mirrorball', name: 'Mirror Ball', rarity: 'rare', cost: 9,
  text: 'Copies the ability of the Token directly to its right',
  isMirror: true });

def({ id: 'loadedwheel', name: 'Loaded Wheel', rarity: 'legendary', cost: 20,
  text: 'The first two Nudges of every round are free',
  roundStart: (rd) => { rd.freeNudges = (rd.freeNudges || 0) + 2; } });

def({ id: 'thehouse', name: 'The House', rarity: 'legendary', cost: 20,
  text: 'x1.5 Mult. On every 3rd spin of a round, x5 Mult instead.',
  score: (c) => { c.xMult(c.spinNumber % 3 === 0 ? 5 : 1.5); } });

def({ id: 'obsidian', name: 'Obsidian Ball', rarity: 'legendary', cost: 20,
  text: 'Chips are squared, then Mult is halved (rounded up)',
  finalize: (c) => {
    c.chips = c.chips * c.chips;
    c.mult = Math.ceil(c.mult / 2);
    c.note('Obsidian Ball', 'chips squared, mult halved');
  } });

// ===========================================================================
// Archetypes. Each cluster below is a build the shop can hand you: colour,
// parity, straights, outside bets, wheel-carving, nudging, economy.
// ===========================================================================

// --- colour -----------------------------------------------------------------

def({ id: 'rougeetnoir', name: 'Rouge et Noir', rarity: 'uncommon', cost: 7,
  text: 'x2 Mult if the result matches the colour of the previous spin',
  score: (c) => { if (c.state.lastColour && c.colour === c.state.lastColour) c.xMult(2); } });

def({ id: 'crimson', name: 'Crimson Tide', rarity: 'uncommon', cost: 6,
  text: 'Red results give +3 Mult. Gains +3 more every time it triggers.',
  init: () => ({ m: 3 }),
  score: (c, tk) => { if (c.colour === 'red') c.addMult(tk.st.m); },
  spinEnd: (c, tk) => { if (c.won && c.colour === 'red') tk.st.m += 3; },
  describe: (tk) => `Red results: +${tk.st.m} Mult, and it keeps climbing.` });

def({ id: 'inkwell', name: 'Inkwell', rarity: 'uncommon', cost: 6,
  text: 'Black results give +40 Chips. Gains +40 more every time it triggers.',
  init: () => ({ c: 40 }),
  score: (c, tk) => { if (c.colour === 'black') c.addChips(tk.st.c); },
  spinEnd: (c, tk) => { if (c.won && c.colour === 'black') tk.st.c += 40; },
  describe: (tk) => `Black results: +${tk.st.c} Chips, and it keeps climbing.` });

def({ id: 'spectrum', name: 'Spectrum', rarity: 'rare', cost: 8,
  text: 'x1.2 Mult for every 6 red pockets on the wheel',
  score: (c) => {
    const reds = c.state.wheel.filter((p) => p.colour === 'red').length;
    for (let i = 0; i < Math.floor(reds / 6); i++) c.xMult(1.2);
  } });

// --- parity and pattern -----------------------------------------------------

def({ id: 'hedge', name: 'The Hedge', rarity: 'uncommon', cost: 6,
  text: 'x2 Mult if you placed chips on both ODD and EVEN',
  score: (c) => { if (c.betOn('odd') && c.betOn('even')) c.xMult(2); } });

def({ id: 'twins', name: 'The Twins', rarity: 'uncommon', cost: 6,
  text: 'x4 Mult if the result is 11, 22 or 33',
  score: (c) => { if (c.result === 11 || c.result === 22 || c.result === 33) c.xMult(4); } });

def({ id: 'mirrorimage', name: 'Mirror Image', rarity: 'uncommon', cost: 6,
  text: '+10 Mult if the result reversed is also a pocket on the wheel, like 12 and 21',
  score: (c) => {
    const rev = Number(String(c.result).split('').reverse().join(''));
    if (rev !== c.result && c.state.wheel.some((p) => p.n === rev)) c.addMult(10);
  } });

// --- straights --------------------------------------------------------------

def({ id: 'sniper', name: 'Sniper', rarity: 'common', cost: 5,
  text: 'Each winning straight-up bet gives +3 Mult',
  score: (c) => { const n = c.countFamily('straight'); if (n) c.addMult(3 * n); } });

def({ id: 'colddeck', name: 'Cold Deck', rarity: 'uncommon', cost: 7,
  text: 'x2.5 Mult if exactly one of your bets wins',
  score: (c) => { if (c.winners.length === 1) c.xMult(2.5); } });

def({ id: 'pinpoint', name: 'Pinpoint', rarity: 'rare', cost: 8,
  text: 'Winning straight-up bets score their Chips a second time',
  score: (c) => c.addChips(c.chipsFromFamily('straight')) });

def({ id: 'bullseye', name: 'Bullseye', rarity: 'uncommon', cost: 7,
  text: 'x3 Mult if a straight-up bet with 3 or more chips on it wins',
  score: (c) => { if (c.winners.some((w) => w.spot.family === 'straight' && w.wager >= 3)) c.xMult(3); } });

// --- outside ----------------------------------------------------------------

def({ id: 'steadyhand', name: 'Steady Hand', rarity: 'common', cost: 5,
  text: 'Each winning even-money bet gives +45 Chips',
  score: (c) => { const n = c.countFamily('even'); if (n) c.addChips(45 * n); } });

def({ id: 'widenet', name: 'Wide Net', rarity: 'uncommon', cost: 6,
  text: '+1 Mult for every number your chips cover this spin',
  score: (c) => c.addMult(c.numbersCovered) });

def({ id: 'insurance', name: 'Insurance', rarity: 'uncommon', cost: 6,
  text: 'When a spin scores nothing, earn $3 and this gains +5 Mult permanently',
  init: () => ({ m: 0 }),
  score: (c, tk) => { if (tk.st.m) c.addMult(tk.st.m); },
  spinEnd: (c, tk) => { if (!c.won) { tk.st.m += 5; c.addMoney(3); } },
  describe: (tk) => `Currently +${tk.st.m} Mult. Pays out when a spin misses.` });

// --- the wheelwright's kit --------------------------------------------------

def({ id: 'pocketwatch', name: 'Pocket Watch', rarity: 'uncommon', cost: 7,
  text: '+7 Mult for each enhanced pocket on the wheel',
  score: (c) => { const n = c.state.wheel.filter((p) => p.enh).length; if (n) c.addMult(7 * n); } });

def({ id: 'jeweller', name: 'The Jeweller', rarity: 'uncommon', cost: 6,
  text: '+90 Chips if the result pocket is Gilded or Bonus',
  score: (c) => { if (c.pocket.enh === 'gilded' || c.pocket.enh === 'bonus') c.addChips(90); } });

def({ id: 'glazier', name: 'The Glazier', rarity: 'uncommon', cost: 6,
  text: 'Glass pockets never shatter',
  passive: { noShatter: true } });

def({ id: 'violet', name: 'Shrinking Violet', rarity: 'rare', cost: 9,
  text: 'x1.1 Mult for every pocket missing from a full wheel of 37',
  score: (c) => { for (let i = 0; i < c.state.pocketsMissing; i++) c.xMult(1.1); },
  describe: (tk, st) => `x1.1 Mult per missing pocket. ${st.pocketsMissing} missing right now.` });

def({ id: 'surveyor', name: 'The Surveyor', rarity: 'uncommon', cost: 6,
  text: '+4 Mult for every pocket missing from a full wheel of 37',
  score: (c) => { if (c.state.pocketsMissing) c.addMult(4 * c.state.pocketsMissing); } });

def({ id: 'hollowpoint', name: 'Hollow Point', rarity: 'common', cost: 5,
  text: 'Earn $4 for every pocket that left the wheel during a round',
  roundEnd: (st) => {
    const gone = st.round.pocketsAtStart - st.wheel.length;
    if (gone > 0) st.gain(4 * gone, 'Hollow Point');
  } });

// --- the thumb --------------------------------------------------------------

def({ id: 'thumbscrew', name: 'Thumbscrew', rarity: 'uncommon', cost: 6,
  text: '+18 Mult for each Nudge used on this spin',
  score: (c) => { if (c.nudges) c.addMult(18 * c.nudges); } });

def({ id: 'secondthoughts', name: 'Second Thoughts', rarity: 'uncommon', cost: 6,
  text: 'The first Nudge of every spin is free',
  passive: { freeNudgePerSpin: true } });

def({ id: 'gyroscope', name: 'Gyroscope', rarity: 'rare', cost: 8,
  text: 'Nudges can move the ball two pockets at a time',
  passive: { nudge2: true } });

// --- economy ----------------------------------------------------------------

def({ id: 'vig', name: 'The Vig', rarity: 'common', cost: 4,
  text: 'Earn $1 for each winning bet',
  score: (c) => c.addMoney(c.winners.length) });

def({ id: 'tipjar', name: 'Tip Jar', rarity: 'common', cost: 5,
  text: '$1 for every Token you own, at the end of each round',
  roundEnd: (st) => st.gain(st.tokens.length, 'Tip Jar') });

def({ id: 'bank', name: 'The Bank', rarity: 'uncommon', cost: 7,
  text: '+3 Mult for every $5 you hold, but you earn no interest',
  passive: { noInterest: true },
  score: (c) => { const m = 3 * Math.floor(c.state.money / 5); if (m) c.addMult(m); },
  describe: (tk, st) => `+3 Mult per $5 held (currently +${3 * Math.floor(st.money / 5)}). No interest.` });

def({ id: 'whale', name: 'The Whale', rarity: 'rare', cost: 8,
  text: 'x3 Mult while you hold $50 or more',
  score: (c) => { if (c.state.money >= 50) c.xMult(3); } });

def({ id: 'loanshark', name: 'Loan Shark', rarity: 'uncommon', cost: 6,
  text: '$9 when a round begins, $11 when it ends',
  roundStart: (rd, st) => st.gain(9, 'Loan Shark'),
  roundEnd: (st) => st.gain(-11, 'Loan Shark collects') });

def({ id: 'skimmer', name: 'The Skimmer', rarity: 'common', cost: 4,
  text: 'Earn $1 for every 3 chips you place on a spin',
  score: (c) => c.addMoney(Math.floor(c.chipsPlaced / 3)) });

def({ id: 'comp', name: 'Comped', rarity: 'common', cost: 4,
  text: '+35 Chips for each Omen you are holding',
  score: (c) => { if (c.state.omens.length) c.addChips(35 * c.state.omens.length); } });

// --- copies and retriggers --------------------------------------------------

def({ id: 'understudy', name: 'Understudy', rarity: 'rare', cost: 9,
  text: 'Copies the ability of the Token directly to its left',
  isMirrorLeft: true });

def({ id: 'encore', name: 'Encore', rarity: 'rare', cost: 9,
  text: 'Your leftmost Token triggers twice',
  passive: { retriggerFirst: true } });

def({ id: 'wildcard', name: 'Wildcard', rarity: 'rare', cost: 10,
  text: 'Each round, acts as a copy of a random Token you own',
  init: () => ({ copy: null }),
  // Only ever copies stateless Tokens, so it can never read another Token's
  // private bookkeeping and produce nonsense.
  roundStart: (rd, st, tk) => {
    const pool = st.tokens.filter((t) => t.id !== 'wildcard' && TOKENS_BY_ID[t.id].score && !TOKENS_BY_ID[t.id].init);
    tk.st.copy = pool.length ? st.rng.pick(pool).id : null;
  },
  score: (c, tk) => {
    const d = tk.st.copy && TOKENS_BY_ID[tk.st.copy];
    if (d && d.score) d.score(c, tk);
  },
  describe: (tk) => (tk.st.copy
    ? `Acting as ${TOKENS_BY_ID[tk.st.copy].name} this round.`
    : 'Copies a random Token you own at the start of each round.') });

// --- scaling ----------------------------------------------------------------

def({ id: 'snowball', name: 'Snowball', rarity: 'uncommon', cost: 6,
  text: 'Gains +12 Chips permanently after every spin',
  init: () => ({ c: 0 }),
  score: (c, tk) => { if (tk.st.c) c.addChips(tk.st.c); },
  spinEnd: (c, tk) => { tk.st.c += 12; },
  describe: (tk) => `Currently +${tk.st.c} Chips.` });

def({ id: 'accrual', name: 'Accrual', rarity: 'rare', cost: 8,
  text: 'x1.1 Mult, gains x0.06 more for every round you beat',
  init: () => ({ x: 1.1 }),
  score: (c, tk) => c.xMult(tk.st.x),
  roundEnd: (st, tk) => { tk.st.x = Math.round((tk.st.x + 0.06) * 100) / 100; },
  describe: (tk) => `Currently x${tk.st.x.toFixed(2)} Mult.` });

def({ id: 'collector', name: 'The Collector', rarity: 'uncommon', cost: 7,
  text: '+4 Mult for each different number that has landed this run',
  score: (c) => { const n = Object.keys(c.state.stats.hits).length; if (n) c.addMult(4 * n); },
  describe: (tk, st) => `+4 Mult per distinct number landed. ${Object.keys(st.stats.hits).length} so far.` });

def({ id: 'marathon', name: 'Marathon', rarity: 'common', cost: 5,
  text: '+1 Mult for every spin played this run',
  score: (c) => { if (c.state.stats.spins) c.addMult(c.state.stats.spins); } });

// --- heavy ------------------------------------------------------------------

def({ id: 'thepit', name: 'The Pit', rarity: 'rare', cost: 9,
  text: 'x2.5 Mult, but you have one fewer spin each round',
  passive: { spins: -1 },
  score: (c) => c.xMult(2.5) });

def({ id: 'greenbaize', name: 'Green Baize', rarity: 'uncommon', cost: 6,
  text: '+150 Chips if the result pocket is green',
  score: (c) => { if (c.colour === 'green') c.addChips(150); } });

def({ id: 'lastcall', name: 'Last Call', rarity: 'uncommon', cost: 7,
  text: 'x3 Mult on the last spin of a round',
  score: (c) => { if (c.spinsLeft <= 1) c.xMult(3); } });

def({ id: 'ledgerbook', name: 'The Ledger Book', rarity: 'legendary', cost: 20,
  text: 'x Mult equal to 1 plus a quarter of the pockets missing from the wheel',
  score: (c) => c.xMult(1 + c.state.pocketsMissing / 4),
  describe: (tk, st) => `Currently x${(1 + st.pocketsMissing / 4).toFixed(2)} Mult.` });

def({ id: 'perpetual', name: 'Perpetual Motion', rarity: 'legendary', cost: 20,
  text: 'On every 4th spin of a round, every Token triggers twice',
  passive: { perpetual: true } });

export const TOKENS = T;
export const TOKENS_BY_ID = Object.fromEntries(T.map((t) => [t.id, t]));

export function instantiate(id) {
  const d = TOKENS_BY_ID[id];
  return { id, st: d.init ? d.init() : {}, sellValue: Math.max(1, Math.floor(d.cost / 2)) };
}

export function tokenDef(tk) { return TOKENS_BY_ID[tk.id]; }

export function tokenText(tk, state) {
  const d = tokenDef(tk);
  return d.describe ? d.describe(tk, state) : d.text;
}
