// Charters - permanent run upgrades, offered after each Boss Table.

export const CHARTERS = [
  { id: 'comped',    name: 'Comped Suite',  glyph: '♠', cost: 10, text: '+1 chip to place every round' },
  { id: 'whale',     name: 'Whale Status',  glyph: '≋', cost: 12, text: '+1 spin every round' },
  { id: 'overtime',  name: 'Late Shift',    glyph: '☾', cost: 8,  text: '+2 Nudges every round' },
  { id: 'deeptable', name: 'Deep Table',    glyph: '▤', cost: 10, text: '+1 Token slot' },
  { id: 'salon',     name: 'Private Salon', glyph: '◇', cost: 8,  text: '+1 Omen slot' },
  { id: 'houseedge', name: 'House Edge',    glyph: '%', cost: 8,  text: 'Shop rerolls cost $3 less' },
  { id: 'marked',    name: 'Marked Deck',   glyph: '⁂', cost: 10, text: 'The shop stocks 1 extra item' },
  { id: 'discount',  name: 'Comp Ticket',   glyph: '✦', cost: 10, text: 'Everything in the shop costs $1 less' },
  { id: 'credit',    name: 'Credit Line',   glyph: '§', cost: 10, text: 'Interest cap raised by $5' },
  { id: 'reserve',   name: 'The Reserve',   glyph: '⬢', cost: 12, text: 'Rare Tokens appear far more often in the shop' },

  { id: 'ballroom',    name: 'The Ballroom',  glyph: '◫', cost: 10, text: 'The shop stocks 1 extra item' },
  { id: 'tipster',     name: 'The Tipster',   glyph: '☞', cost: 8,  text: '+$2 at the end of every round' },
  { id: 'fixer',       name: 'The Fixer',     glyph: '⇔', cost: 12, text: 'Nudges can move the ball two pockets at a time' },
  { id: 'silvertongue', name: 'Silver Tongue', glyph: '❞', cost: 10, text: 'Skipping a table grants two Tags instead of one' },
  { id: 'connoisseur', name: 'Connoisseur',   glyph: '▨', cost: 12, text: 'Editions appear four times as often' },
  { id: 'bulkbuyer',   name: 'Bulk Buyer',    glyph: '⊞', cost: 10, text: 'Booster packs contain one extra option' }
];

export const CHARTERS_BY_ID = Object.fromEntries(CHARTERS.map((c) => [c.id, c]));
