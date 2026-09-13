// Omens - single-use consumables. Some retune the wheel permanently,
// some are pulled out mid-round to save a losing hand.

const O = [];
const defOmen = (o) => { O.push(o); return o; };

const enhancer = (id, name, glyph, enh, text) => defOmen({
  id, name, glyph, cost: 4, target: 'pocket', text,
  use: (st, pocket) => { pocket.enh = enh; st.log(`${name}: ${pocket.n} is now ${enh}.`); }
});

enhancer('gild',    'Gild',    '◆', 'gilded', 'Make one pocket Gilded (+50 Chips when it hits)');
enhancer('anoint',  'Anoint',  '+', 'bonus',  'Make one pocket Bonus (+30 Chips when it hits)');
enhancer('charge',  'Charge',  '⚡', 'mult',   'Make one pocket Charged (+4 Mult when it hits)');
enhancer('temper',  'Temper',  '▣', 'steel',  'Make one pocket Steel (x1.5 Mult when it hits)');
enhancer('fracture','Fracture','◈', 'glass',  'Make one pocket Glass (x3 Mult, 1 in 4 to shatter)');
enhancer('fortune', 'Fortune', '☘', 'lucky',  'Make one pocket Lucky (1 in 3 for x2 Mult, 1 in 6 for $4)');

defOmen({ id: 'excise', name: 'Excise', glyph: '✂', cost: 5, target: 'pocket',
  text: 'Remove one pocket from the wheel, permanently',
  enabled: (st) => st.wheel.length > 12,
  use: (st, pocket) => { st.removePocket(pocket.uid); st.log(`Excise: pocket ${pocket.n} pried out of the wheel.`); } });

defOmen({ id: 'echo', name: 'Echo', glyph: '❐', cost: 5, target: 'pocket',
  text: 'Add a second copy of one pocket to the wheel, doubling how often it lands',
  use: (st, pocket) => { st.clonePocket(pocket); st.log(`Echo: a second ${pocket.n} is set into the wheel.`); } });

defOmen({ id: 'recolour', name: 'Recolour', glyph: '◐', cost: 3, target: 'pocket',
  text: 'Flip one pocket between red and black',
  use: (st, pocket) => {
    pocket.colour = pocket.colour === 'red' ? 'black' : 'red';
    st.log(`Recolour: pocket ${pocket.n} is now ${pocket.colour}.`);
  } });

defOmen({ id: 'windfall', name: 'Windfall', glyph: '$', cost: 3, target: 'none',
  text: 'Earn $9',
  use: (st) => st.gain(9, 'Windfall') });

defOmen({ id: 'broker', name: 'The Broker', glyph: '☎', cost: 6, target: 'none',
  text: 'Gain a random Token',
  enabled: (st) => st.tokens.length < st.tokenSlots,
  use: (st) => st.grantRandomToken() });

defOmen({ id: 'thecut', name: 'The Cut', glyph: '†', cost: 3, target: 'token',
  text: 'Destroy one of your Tokens and earn $10',
  enabled: (st) => st.tokens.length > 0,
  use: (st, tk) => { st.destroyToken(tk); st.gain(10, 'The Cut'); } });

defOmen({ id: 'secondsight', name: 'Second Sight', glyph: '◉', cost: 5, target: 'none',
  text: 'This round: the next 2 spins are rolled twice and you choose which result to keep',
  roundOnly: true,
  enabled: (st) => !!st.round,
  use: (st) => { st.round.secondSight += 2; st.log('Second Sight: the next 2 spins are yours to choose.'); } });

defOmen({ id: 'tilt', name: 'Tilt', glyph: '⇘', cost: 6, target: 'none',
  text: 'Lower this round target by 25%',
  roundOnly: true,
  enabled: (st) => !!st.round,
  use: (st) => {
    st.round.target = Math.max(1, Math.round(st.round.target * 0.75));
    st.log('Tilt: the table drops its demand.');
  } });

defOmen({ id: 'purge', name: 'Purge', glyph: '⊘', cost: 6, target: 'pocket',
  text: 'Remove every pocket sharing this number from the wheel',
  enabled: (st) => st.wheel.length > 14,
  use: (st, pocket) => {
    const n = pocket.n;
    for (const p of st.wheel.filter((x) => x.n === n)) st.removePocket(p.uid);
    st.log(`Purge: every ${n} is gone from the wheel.`);
  } });

defOmen({ id: 'anneal', name: 'Anneal', glyph: '⌇', cost: 3, target: 'pocket',
  text: 'Strip a pocket of its enhancement and earn $8',
  use: (st, pocket) => { pocket.enh = null; st.gain(8, 'Anneal'); } });

defOmen({ id: 'mint', name: 'Mint', glyph: '⛁', cost: 5, target: 'none',
  text: 'Earn $15',
  use: (st) => st.gain(15, 'Mint') });

defOmen({ id: 'blessing', name: 'Blessing', glyph: '❁', cost: 5, target: 'none',
  text: 'Enhance two random pockets',
  use: (st) => { st.enhanceRandomPocket(); st.enhanceRandomPocket(); } });

defOmen({ id: 'fortify', name: 'Fortify', glyph: '▨', cost: 6, target: 'token',
  text: 'Give one of your Tokens a random edition',
  enabled: (st) => st.tokens.some((t) => !t.edition),
  use: (st, tk) => {
    tk.edition = st.rng.pick(['foil', 'holo', 'poly']);
    st.log(`Fortify: a Token turns ${tk.edition}.`);
  } });

defOmen({ id: 'chisel', name: 'Chisel', glyph: '⧗', cost: 7, target: 'none',
  text: 'Lower this round target by 40%',
  roundOnly: true,
  enabled: (st) => !!st.round,
  use: (st) => {
    st.round.target = Math.max(1, Math.round(st.round.target * 0.6));
    st.log('Chisel: the table shaves its demand.');
  } });

defOmen({ id: 'doubledown', name: 'Doubling Down', glyph: '⧓', cost: 7, target: 'none',
  text: 'Your next scoring spin this round pays twice',
  roundOnly: true,
  enabled: (st) => !!st.round,
  use: (st) => { st.round.doubleNext += 1; st.log('Doubling Down: the next spin pays double.'); } });

defOmen({ id: 'wager', name: 'Raise', glyph: '⊕', cost: 4, target: 'none',
  text: '+3 chips to place for the rest of this round',
  roundOnly: true,
  enabled: (st) => !!st.round,
  use: (st) => { st.round.chipsTotal += 3; st.log('Raise: three more chips on the table.'); } });

export const OMENS = O;
export const OMENS_BY_ID = Object.fromEntries(O.map((o) => [o.id, o]));
export const omenDef = (om) => OMENS_BY_ID[om.id];
export const instantiateOmen = (id) => ({ id });
