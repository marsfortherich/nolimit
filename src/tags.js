// Tags turn "skip this table" from a consolation prize into a real line of play.
// Each fires at a named moment rather than immediately, so skipping is a bet on
// the shop or the round that follows.
//
//   when: 'now'   applied the instant you take it
//         'shop'  consumed while the next shop is being stocked
//         'round' consumed when the next table starts
//         'boss'  consumed after the next Boss Table falls

const G_TAGS = [];
const defTag = (o) => { G_TAGS.push(o); return o; };

defTag({ id: 'coupon', name: 'Coupon Tag', glyph: '✁', when: 'shop',
  text: 'Everything in the next shop is free',
  apply: (G) => { G.shopFlags.free = true; } });

defTag({ id: 'voucher', name: 'Charter Tag', glyph: '✦', when: 'shop',
  text: 'The next shop also stocks a Charter',
  apply: (G) => { G.shopFlags.forceCharter = true; } });

defTag({ id: 'rare', name: 'Rare Tag', glyph: '★', when: 'shop',
  text: 'The next shop stocks a guaranteed Rare Token',
  apply: (G) => { G.shopFlags.forceRare = true; } });

defTag({ id: 'foil', name: 'Foil Tag', glyph: '▨', when: 'shop',
  text: 'A Token in the next shop is Foil',
  apply: (G) => { G.shopFlags.forceEdition = 'foil'; } });

defTag({ id: 'holo', name: 'Holo Tag', glyph: '◨', when: 'shop',
  text: 'A Token in the next shop is Holographic',
  apply: (G) => { G.shopFlags.forceEdition = 'holo'; } });

defTag({ id: 'poly', name: 'Polychrome Tag', glyph: '◧', when: 'shop',
  text: 'A Token in the next shop is Polychrome',
  apply: (G) => { G.shopFlags.forceEdition = 'poly'; } });

defTag({ id: 'negative', name: 'Negative Tag', glyph: '◩', when: 'shop',
  text: 'A Token in the next shop is Negative',
  apply: (G) => { G.shopFlags.forceEdition = 'negative'; } });

defTag({ id: 'd6', name: 'Loaded Dice Tag', glyph: '⚄', when: 'shop',
  text: 'Rerolls are free in the next shop',
  apply: (G) => { G.shopFlags.freeRerolls = true; } });

defTag({ id: 'investment', name: 'Investment Tag', glyph: '$', when: 'boss',
  text: 'Earn $20 after the next Boss Table falls',
  apply: (G) => G.gain(20, 'Investment Tag') });

defTag({ id: 'juggle', name: 'Juggle Tag', glyph: '⁙', when: 'round',
  text: '+3 chips to place next round',
  apply: (G, rd) => { rd.chipsTotal += 3; } });

defTag({ id: 'thumb', name: 'Thumb Tag', glyph: '☟', when: 'round',
  text: '+3 Nudges next round',
  apply: (G, rd) => { rd.nudgesLeft += 3; } });

defTag({ id: 'handy', name: 'Overtime Tag', glyph: '⏱', when: 'round',
  text: '+1 spin next round',
  apply: (G, rd) => { rd.spinsLeft += 1; rd.spinsTotal += 1; } });

defTag({ id: 'speed', name: 'Speed Tag', glyph: '»', when: 'now',
  text: 'Earn $5 for every ante you have reached',
  apply: (G) => G.gain(5 * G.ante, 'Speed Tag') });

defTag({ id: 'economy', name: 'Economy Tag', glyph: '⊕', when: 'now',
  text: 'Double your money, up to $40',
  apply: (G) => G.gain(Math.min(40, Math.max(0, G.money)), 'Economy Tag') });

defTag({ id: 'charm', name: 'Charm Tag', glyph: '☾', when: 'now',
  text: 'Opens a free Mega Chip Pack',
  grantsPack: 'chip_mega' });

defTag({ id: 'buffoon', name: 'Buffoon Tag', glyph: '☻', when: 'now',
  text: 'Opens a free Token Pack',
  grantsPack: 'token_jumbo' });

defTag({ id: 'meteor', name: 'Meteor Tag', glyph: '✷', when: 'now',
  text: 'Opens a free Wheel Pack',
  grantsPack: 'wheel_jumbo' });

defTag({ id: 'bossreroll', name: 'Croupier Tag', glyph: '↺', when: 'now',
  text: 'Deals a different Boss Table for this ante',
  apply: (G) => { G.rollBoss(); } });

export const TAGS = G_TAGS;
export const TAGS_BY_ID = Object.fromEntries(G_TAGS.map((t) => [t.id, t]));
export const tagDef = (t) => TAGS_BY_ID[t.id];

export function rollTag(rng) {
  return { id: rng.pick(G_TAGS).id };
}
