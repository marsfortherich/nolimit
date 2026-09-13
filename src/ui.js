// All rendering. The engine never touches the DOM; this module only mutates
// game state through Game methods.

import { SPOTS, ENHANCEMENTS, BLINDS, colourOf } from './data.js';
import { Game, fmt, FINAL_ANTE, FULL_WHEEL } from './engine.js';
import { TOKENS, TOKENS_BY_ID, RARITY, tokenDef, tokenText } from './tokens.js';
import { OMENS_BY_ID, omenDef } from './omens.js';
import { BOSSES_BY_ID } from './bosses.js';
import { CHARTERS_BY_ID } from './charters.js';
import { EDITIONS } from './editions.js';
import { STAKES, STAKES_BY_ID, STICKERS } from './stakes.js';
import { WHEELS, WHEELS_BY_ID } from './wheels.js';
import { tagDef } from './tags.js';
import { PACKS_BY_ID, FATES_BY_ID } from './packs.js';
import { Profile, loadProfile, stakeUnlocked, wheelUnlocked, dailySeed, resetProfile } from './profile.js';
import { Settings, loadSettings, setSetting } from './settings.js';
import { Sfx, resumeAudio, resetPitch, audioStats } from './audio.js';
import { fxFloat, fxFlash, fxShake, fxCountUp, fxPop, fxBurst, fxWait, fxClear } from './fx.js';
import {
  mountWheel, wheelSpinTo, wheelHopTo, wheelFinishNow, wheelArm, wheelDisarm,
  wheelReset, spinDuration
} from './wheelview.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// tiny DOM helper
// ---------------------------------------------------------------------------

// `tag` is emmet-ish: "div", "button.btn.sm", "div#readout.readout".
const TAG_RE = /^([a-z0-9-]*)(?:#([^.#]+))?((?:\.[^.#]+)*)$/i;

export function h(tag, attrs, ...kids) {
  const m = TAG_RE.exec(tag);
  if (!m) throw new Error('bad tag: ' + tag);
  const el = document.createElement(m[1] || 'div');
  if (m[2]) el.id = m[2];
  if (m[3]) el.className = m[3].slice(1).split('.').join(' ');
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'style') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'tip') tip(el, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v);
    }
  }
  for (const kid of kids.flat(3)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// ---------------------------------------------------------------------------
// tooltips
// ---------------------------------------------------------------------------

function tip(el, data) {
  el.addEventListener('mouseenter', () => {
    const t = $('tooltip');
    t.replaceChildren();
    t.append(h('h4', null, data.title));
    if (data.rarity) t.append(h('div.rare', { style: { color: RARITY[data.rarity].colour } }, RARITY[data.rarity].name));
    if (data.sub) t.append(h('div.tsub', null, data.sub));
    if (data.body) t.append(h('div', { style: { marginTop: '5px' } }, data.body));
    for (const line of data.lines || []) {
      t.append(h('div.tline', { style: { color: line.colour || '#f0d089' } }, line.text));
    }
    if (data.foot) t.append(h('div.tfoot', null, data.foot));
    t.hidden = false;
    place(el);
  });
  el.addEventListener('mousemove', () => place(el));
  el.addEventListener('mouseleave', () => { $('tooltip').hidden = true; });

  function place(target) {
    const t = $('tooltip');
    const r = target.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    let top = r.top - tr.height - 10;
    if (top < 8) top = r.bottom + 10;
    t.style.left = Math.max(8, Math.min(r.left + r.width / 2 - tr.width / 2, window.innerWidth - tr.width - 8)) + 'px';
    t.style.top = Math.max(8, Math.min(top, window.innerHeight - tr.height - 8)) + 'px';
  }
}

function hideTip() { const t = $('tooltip'); if (t) t.hidden = true; }

/** The shared arcade buttons, for this game's own title and end screens. */
function arcadeRow() {
  const arcade = typeof globalThis !== 'undefined' ? globalThis.Arcade : null;
  return arcade && arcade.ui ? arcade.ui.inlineActions({ gameId: 'nolimit' }) : null;
}

// ---------------------------------------------------------------------------
// module state
// ---------------------------------------------------------------------------

let G = null;
let revealToken = 0;
let revealPending = false;          // ball in the air: the result is not the player's yet                 // bumped to cancel an in-flight reveal
let reveal = null;                   // { chips, mult, upto, done }
let hiddenShown = false;             // The Whisper: has the result been revealed?

export function attach(game) {
  loadSettings();
  loadProfile();
  // Shared account + leaderboard layer: resolves who is signed in before the
  // title screen draws.
  const arcade = typeof globalThis !== 'undefined' ? globalThis.Arcade : null;
  if (arcade) arcade.init({ gameId: 'nolimit' });
  bindGame(game);
}

function bindGame(game) {
  G = game;
  if (G) {
    G.listeners = [];
    G.on(render);
  }
  wheelReset();
  revealToken++; reveal = null; revealPending = false; hiddenShown = false;
  fxClear();
  render();
}

// ---------------------------------------------------------------------------
// top level
// ---------------------------------------------------------------------------

export function render() {
  const side = $('sidebar'), centre = $('centre');
  const tokenbar = $('tokenbar'), actionbar = $('actionbar');

  if (!G) {
    side.hidden = true;
    $('app').style.gridTemplateColumns = '1fr';
    tokenbar.hidden = true;
    actionbar.hidden = true;
    centre.replaceChildren(titleScreen());
    return;
  }

  side.hidden = false;
  $('app').style.gridTemplateColumns = '272px 1fr';
  tokenbar.hidden = false;
  side.replaceChildren(...sidebar());
  tokenbar.replaceChildren(...tokenBar());

  const view = {
    blind: blindSelect, play: playScreen, cashout: cashoutScreen, shop: shopScreen,
    pack: packScreen, gameover: gameOverScreen, win: winScreen
  }[G.screen];
  centre.replaceChildren(view ? view() : h('div'));

  const acts = actions();
  actionbar.hidden = !acts.length;
  actionbar.replaceChildren(...acts);

  if (G.screen === 'play') paintReadout();
}

// ---------------------------------------------------------------------------
// sidebar
// ---------------------------------------------------------------------------

function sidebar() {
  const out = [h('div.brand', null, 'No Limit')];
  const rd = G.round;
  const stake = STAKES_BY_ID[G.stakeId];

  if (rd) {
    const boss = rd.bossId ? BOSSES_BY_ID[rd.bossId] : null;
    out.push(h('div.blindcard' + (boss ? '.boss' : ''), null,
      h('h2', null, rd.blindName),
      boss && h('div.bosstext', null, boss.text),
      h('div.target', null,
        h('div.lbl', null, 'Score at least'),
        h('div.val', null, fmt(rd.target)))));

    const pct = Math.min(100, (rd.score / rd.target) * 100);
    out.push(h('div.scorebox', null,
      h('div.lbl', null, 'Round score'),
      h('div#roundScore.val', null, fmt(rd.score)),
      h('div.progress', null, h('i', { style: { width: pct + '%' } }))));
  } else {
    out.push(h('div.blindcard', null,
      h('h2', null, `Ante ${G.ante}`),
      h('div.bosstext', { style: { color: 'var(--ink-dim)' } },
        G.screen === 'shop' ? 'The dealer takes a break.' : 'Choose your table.')));
  }

  out.push(h('div.statgrid', null,
    stat('spins', 'Spins', rd ? rd.spinsLeft : G.spinsPerRound),
    stat('nudges', 'Nudges', rd ? rd.nudgesLeft + (rd.freeNudges || 0) : G.nudgesPerRound),
    stat('money', 'Purse', '$' + G.money),
    stat('ante', 'Ante', `${G.ante}/${G.endless ? '∞' : FINAL_ANTE}`)));

  out.push(h('div.section-h', null, h('span', null, 'Omens'), h('span', null, `${G.omens.length}/${G.maxOmens}`)));
  const omenRow = h('div.slotrow');
  G.omens.forEach((om, i) => omenRow.append(omenCard(om, i)));
  for (let i = G.omens.length; i < G.maxOmens; i++) omenRow.append(h('div.slot-empty.small'));
  out.push(omenRow);

  if (G.tags.length) {
    out.push(h('div.section-h', null, h('span', null, 'Tags')));
    out.push(h('div.slotrow', null, ...G.tags.map((tag) => {
      const d = tagDef(tag);
      return h('div.tagchip', { tip: { title: d.name, body: d.text, foot: whenLabel(d.when) } }, d.glyph);
    })));
  }

  if (G.charters.length) {
    out.push(h('div.section-h', null, h('span', null, 'Charters')));
    out.push(h('div.slotrow', null, ...G.charters.map((id) => {
      const c = CHARTERS_BY_ID[id];
      return h('div.tagchip.gold', { tip: { title: c.name, body: c.text } }, c.glyph);
    })));
  }

  out.push(h('div.section-h', null, h('span', null, 'Wheel'), h('span', null, `${G.wheel.length} pockets`)));
  out.push(h('div.sidebtns', null,
    h('button.btn.sm', { onclick: showWheelSheet }, 'Wheel'),
    h('button.btn.sm', { onclick: showSettings }, 'Options')));

  if (G.messages.length) {
    out.push(h('div.section-h', null, h('span', null, 'Table talk')));
    out.push(h('div.log', null, ...G.messages.slice(0, 10).map((m) => h('div', null, m))));
  }

  out.push(h('div', { style: { flex: '1' } }));
  out.push(h('div.runmeta', null,
    h('span', { style: { color: stake.colour }, tip: { title: stake.name, body: stake.text } }, '● ' + stake.name.replace(' Stake', '')),
    h('span', { tip: { title: WHEELS_BY_ID[G.wheelId].name, body: WHEELS_BY_ID[G.wheelId].text } }, WHEELS_BY_ID[G.wheelId].name)));
  out.push(h('div.seed', { tip: { title: 'Seed', body: 'Runs are deterministic. Start a new run with this seed to replay it exactly.' } }, 'SEED ' + G.seed));
  out.push(h('button.btn.sm', {
    onclick: () => { if (confirm('Abandon this run? Unlocks you have already earned are kept.')) { Game.clearSave(); bindGame(null); } }
  }, 'Abandon run'));
  return out;
}

const whenLabel = (w) => ({
  now: 'Fires immediately', shop: 'Fires at the next shop',
  round: 'Fires at the next table', boss: 'Fires after the next Boss Table'
}[w] || '');

const stat = (cls, lbl, val) => h('div.stat.' + cls, null, h('div.lbl', null, lbl), h('div.val', null, val));

// ---------------------------------------------------------------------------
// token bar
// ---------------------------------------------------------------------------

function tokenBar() {
  const out = [h('div.bar-label', null, `Tokens ${G.tokenCount()}/${G.maxTokens}`)];
  const disabledLeft = G.round && G.round.bossFlags.disableLeftmost;

  G.tokens.forEach((tk, i) => {
    const d = tokenDef(tk);
    const ed = tk.edition && EDITIONS[tk.edition];
    const sk = tk.sticker && STICKERS[tk.sticker];
    const off = (disabledLeft && i === 0) || tk.dead;
    const lines = [];
    if (ed) lines.push({ text: `${ed.name}: ${ed.text}` });
    if (sk) lines.push({ text: `${sk.name}: ${sk.text}${tk.sticker === 'perishable' && tk.life ? ` (${tk.life} rounds left)` : ''}`, colour: '#e0574a' });

    const card = h('div.card' + (off ? '.disabled' : '') + (ed ? '.ed-' + tk.edition : ''), {
      'data-token': String(i),
      draggable: 'true',
      tip: {
        title: d.name, rarity: d.rarity, body: tokenText(tk, G), lines,
        foot: tk.dead ? 'Perished — no longer works'
          : off ? 'Disabled by The Grinder'
          : (G.canSellToken(i) ? `Sell $${tk.sellValue} · drag to reorder` : 'Eternal — cannot be sold')
      },
      ondragstart: (e) => { e.dataTransfer.setData('text/plain', String(i)); hideTip(); },
      ondragover: (e) => e.preventDefault(),
      ondrop: (e) => { e.preventDefault(); Sfx.chip(); G.moveToken(Number(e.dataTransfer.getData('text/plain')), i); },
      oncontextmenu: (e) => {
        e.preventDefault();
        if (G.tokens[i] !== tk || !G.canSellToken(i)) { Sfx.deny(); return; }
        if (confirm(`Sell ${d.name} for $${tk.sellValue}?`)) { Sfx.coin(); G.sellToken(i); }
      }
    },
      h('div.cname', null, d.name),
      h('div.cglyph', null, glyphFor(d)),
      h('div.ctag', null, RARITY[d.rarity].name),
      sk && h('div.sticker', null, sk.glyph));
    card.style.setProperty('--rarity', RARITY[d.rarity].colour);
    out.push(card);
  });

  for (let i = G.tokenCount(); i < G.maxTokens; i++) out.push(h('div.slot-empty'));
  return out;
}

const GLYPH_BY_RARITY = { common: '◆', uncommon: '❖', rare: '✦', legendary: '★' };
const glyphFor = (d) => d.glyph || GLYPH_BY_RARITY[d.rarity];

function omenCard(om, i) {
  const d = omenDef(om);
  const usable = G.omenUsable(i);
  return h('div.card.small.omen' + (usable ? '' : '.disabled'), {
    tip: { title: d.name, body: d.text, foot: usable ? 'Click to use · right-click to sell' : 'Cannot be used right now' },
    onclick: () => { if (usable) { Sfx.ui(); beginOmen(i); } else Sfx.deny(); },
    oncontextmenu: (e) => {
      e.preventDefault();
      if (G.omens[i] === om && confirm(`Sell ${d.name}?`)) { Sfx.coin(); G.sellOmen(i); }
    }
  }, h('div.cglyph', null, d.glyph), h('div.cname', null, d.name));
}

// ---------------------------------------------------------------------------
// title
// ---------------------------------------------------------------------------

let titleWheel = 'house';
let titleStake = 'white';

function titleScreen() {
  const saved = Game.load();
  if (!wheelUnlocked(titleWheel)) titleWheel = 'house';
  if (!stakeUnlocked(titleStake)) titleStake = 'white';

  const seedInput = h('input.seedinput', { placeholder: 'seed (optional)' });

  const wheelRow = h('div.pickrow', null, ...WHEELS.map((w) => {
    const locked = !wheelUnlocked(w.id);
    return h('div.pick' + (titleWheel === w.id ? '.on' : '') + (locked ? '.locked' : ''), {
      tip: { title: w.name, body: locked ? 'Locked.' : w.text, foot: locked ? w.unlockText : null },
      onclick: () => { if (locked) { Sfx.deny(); return; } titleWheel = w.id; Sfx.ui(); render(); }
    }, h('div.pickglyph', null, locked ? '·' : w.glyph), h('div.picklbl', null, locked ? 'Locked' : w.name));
  }));

  const stakeRow = h('div.pickrow', null, ...STAKES.map((s) => {
    const locked = !stakeUnlocked(s.id);
    return h('div.pick.stake' + (titleStake === s.id ? '.on' : '') + (locked ? '.locked' : ''), {
      style: { '--stake': s.colour },
      tip: { title: s.name, body: locked ? 'Locked.' : s.text, foot: locked ? 'Win a run on the stake below to unlock this one' : null },
      onclick: () => { if (locked) { Sfx.deny(); return; } titleStake = s.id; Sfx.ui(); render(); }
    }, h('div.stakedot'), h('div.picklbl', null, s.name.replace(' Stake', '')));
  }));

  const start = (seed) => bindGame(Game.newRun(seed, { wheelId: titleWheel, stakeId: titleStake }));

  return h('div.centered', null,
    h('h1.bigtitle', null, 'No Limit'),
    h('div.subtitle', null, 'a roulette roguelike'),
    h('div.titleblurb', null,
      'Place your chips, spin, and beat the table. Build a machine out of Tokens, ' +
      'carve up the wheel itself, and take eight antes off the house.'),

    h('div.panel.titlepanel', null,
      h('div.section-h', null, h('span', null, 'Wheel')), wheelRow,
      h('div.section-h', { style: { marginTop: '12px' } }, h('span', null, 'Stake')), stakeRow),

    seedInput,
    h('div.btnrow', null,
      saved && h('button.btn.big.gold', { onclick: () => bindGame(saved) }, 'Continue run'),
      h('button.btn.big.primary', { onclick: () => start(seedInput.value.trim() || undefined) }, 'New run'),
      h('button.btn.big', {
        onclick: () => start(dailySeed()),
        tip: { title: 'Daily run', body: 'A seed fixed to today’s date: ' + dailySeed() }
      }, 'Daily')),
    h('div.btnrow', null,
      h('button.btn.sm', { onclick: showProfile }, 'Records'),
      h('button.btn.sm', { onclick: showCollection }, `Collection ${Object.keys(Profile.seenTokens).length}/${TOKENS.length}`),
      h('button.btn.sm', { onclick: showSettings }, 'Options')),
    arcadeRow(),
    h('div.hint', null, 'Click a spot to add a chip · right-click to take one back · Space to spin'));
}

// ---------------------------------------------------------------------------
// blind select
// ---------------------------------------------------------------------------

function blindSelect() {
  const boss = BOSSES_BY_ID[G.pendingBoss];
  const tiles = BLINDS.map((b, i) => {
    const isBoss = i === 2;
    const done = i < G.blindIndex;
    const current = i === G.blindIndex;
    return h('div.blind-tile' + (done ? '.done' : '') + (current ? '.current' : '') + (isBoss ? '.bossTile' : ''), null,
      h('div.glyph', null, isBoss ? boss.glyph : ['●', '◍', '◉'][i]),
      h('h3', null, isBoss ? boss.name : b.name),
      h('div.bosstext', null, isBoss ? boss.text : ''),
      h('div.req', null, 'Score at least', h('b', null, fmt(G.targetFor(i)))),
      h('div.rew', null, G.stake.noSmallReward && b.key === 'small'
        ? 'No reward on this stake'
        : `Reward $${b.reward} + $1 per unused spin`),
      current
        ? h('div.btnrow', null,
            h('button.btn.gold', { onclick: () => { resumeAudio(); if (isBoss) Sfx.boss(); else Sfx.ui(); G.startBlind(); } }, 'Play'),
            !isBoss && h('button.btn.sm', {
              onclick: () => { resumeAudio(); Sfx.pack(); G.skipBlind(); },
              tip: { title: 'Walk away', body: 'Skip this table and take a Tag instead. No money, no shop.' }
            }, 'Skip'))
        : h('div.tilefoot', null, done ? 'cleared' : 'later'));
  });
  return h('div.panel', null,
    h('p.screen-title', null, `Ante ${G.ante} — choose your table`),
    h('div.blind-choices', null, ...tiles));
}

// ---------------------------------------------------------------------------
// play screen
// ---------------------------------------------------------------------------

function playScreen() {
  return h('div.play-grid', null, wheelPanel(), h('div', null, feltTable(), betHint()));
}

function resultHidden() {
  const rd = G.round;
  return !!rd && rd.phase === 'resolved' && !!rd.bossFlags.hideResult && !hiddenShown;
}

/**
 * Whether the player is allowed to see the result yet. The engine resolves a
 * spin synchronously, so without this the felt, the badge and the score would
 * all give the answer away while the ball was still running.
 */
function resultVisible() {
  const rd = G.round;
  if (!rd || rd.phase !== 'resolved' || resultHidden()) return false;
  return !(revealPending && !reveal);
}

function betHint() {
  const rd = G.round;
  const left = G.chipsLeft();
  const txt = rd.phase === 'betting'
    ? (left > 0 ? `${left} chip${left === 1 ? '' : 's'} left to place` : 'All chips down — spin the wheel')
    : rd.phase === 'choosing' ? 'Second Sight: choose the result you want'
    : resultHidden() ? 'The Whisper hides the result — nudge blind, then reveal'
    : !resultVisible() ? 'The ball is still running…'
    : 'Nudge the ball, or collect';
  return h('div.bethint', null, txt);
}

function wheelPanel() {
  const rd = G.round;
  const wrap = h('div.wheel-wrap');
  // The same element every render: rebuilding it would kill any spin in flight.
  wrap.append(mountWheel(G.wheel, {
    idle: rd.phase === 'betting',
    restIndex: rd.phase === 'resolved' ? rd.pocketIndex : null
  }));

  if (rd.phase === 'choosing') {
    wrap.append(h('div.candidates', null, ...rd.candidates.map((idx) => {
      const p = G.wheel[idx];
      return h('div.candidate', null,
        h('div.result-badge.' + p.colour, null, String(p.n)),
        h('button.btn.sm.gold', { onclick: () => takeCandidate(idx) }, 'Take it'));
    })));
    return wrap;
  }

  const p = resultVisible() ? G.wheel[rd.pocketIndex] : null;
  if (resultHidden()) wrap.append(h('div.result-badge.idle', null, '?'));
  else if (p) wrap.append(h('div.result-badge.' + p.colour, null, String(p.n)));
  else wrap.append(h('div.result-badge.idle', null, rd.phase === 'betting' ? 'READY' : '···'));

  if (p && p.enh) {
    const e = ENHANCEMENTS[p.enh];
    wrap.append(h('div.enhnote', { tip: { title: e.name + ' pocket', body: e.text } }, `${e.glyph} ${e.name} pocket`));
  }

  wrap.append(h('div#readout.readout'));
  wrap.append(h('div#steps.steps'));
  return wrap;
}

// ---------------------------------------------------------------------------
// the felt
// ---------------------------------------------------------------------------

function feltTable() {
  const info = new Map();
  for (const p of G.wheel) {
    const cur = info.get(p.n) || { count: 0, enh: null, colour: p.colour };
    cur.count++;
    if (p.enh && !cur.enh) cur.enh = p.enh;
    info.set(p.n, cur);
  }

  const grid = h('div.felt-grid');

  const strip = h('div.strip', { style: { gridColumn: '2 / span 12', gridRow: '1' } });
  for (let i = 0; i < 12; i++) strip.append(betCell('st' + i, { gridColumn: `${2 * i + 1} / span 2`, gridRow: '1' }));
  for (let i = 0; i < 11; i++) strip.append(betCell('ln' + i, { gridColumn: `${2 * i + 2} / span 2`, gridRow: '2' }));
  grid.append(strip);

  grid.append(numberCell(0, { gridColumn: '1', gridRow: '2 / span 3' }, info, 'zero'));
  for (let num = 1; num <= 36; num++) {
    const street = Math.floor((num - 1) / 3);
    grid.append(numberCell(num, { gridColumn: String(2 + street), gridRow: String(4 - ((num - 1) % 3)) }, info));
  }

  [2, 1, 0].forEach((c, k) => grid.append(betCell('cl' + c, { gridColumn: '14', gridRow: String(2 + k) }, 'colbet')));
  for (let d = 0; d < 3; d++) grid.append(betCell('dz' + d, { gridColumn: `${2 + d * 4} / span 4`, gridRow: '5' }));
  ['low', 'even', 'red', 'black', 'odd', 'high'].forEach((id, i) =>
    grid.append(betCell(id, { gridColumn: `${2 + i * 2} / span 2`, gridRow: '6' })));

  return h('div.felt', null, grid);
}

function numberCell(num, style, info, extra = '') {
  const meta = info.get(num);
  const colour = meta ? meta.colour : colourOf(num);
  const cell = betCell('n' + num, style, extra + ' ' + colour);
  if (!meta) {
    cell.append(h('div.gone', null, '✕'));
    cell.classList.add('locked');
  } else {
    if (meta.enh) cell.append(h('div.enh', null, ENHANCEMENTS[meta.enh].glyph));
    if (meta.count > 1) cell.append(h('div.dupe', null, '×' + meta.count));
  }
  return cell;
}

function betCell(spotId, style, extra = '') {
  const rd = G.round;
  const spot = SPOTS[spotId];
  const wager = rd.bets[spotId] || 0;
  const locked = rd.locked.includes(spotId);
  const outside = spot.family !== 'straight';
  const hit = resultVisible() && spot.numbers.includes(rd.preview.result);
  const onWheel = G.wheel.filter((p) => spot.numbers.includes(p.n)).length;

  const cls = ['bet', extra.trim(), outside ? 'outside' : '', locked ? 'locked' : '', hit ? 'hit' : '']
    .filter(Boolean).join('.');

  const el = h('div.' + cls, {
    style,
    'data-spot': spotId,
    onclick: () => { resumeAudio(); if (G.placeChip(spotId)) Sfx.chip(); else Sfx.deny(); },
    oncontextmenu: (e) => { e.preventDefault(); if (G.removeChip(spotId)) Sfx.unchip(); },
    tip: {
      title: spot.family === 'straight' ? `Straight up — ${spot.label}` : spot.label,
      sub: `${spot.numbers.length} number${spot.numbers.length === 1 ? '' : 's'} · ${spot.family} · ${((onWheel / G.wheel.length) * 100).toFixed(1)}% of the wheel`,
      body: `${fmt(spot.chips)} Chips per chip wagered, +${spot.mult} Mult`,
      foot: locked ? 'Locked by The Serpent' : null
    }
  }, spot.label);

  if (wager) el.append(h('div.chipstack', null, String(wager)));
  return el;
}

// ---------------------------------------------------------------------------
// score readout and the reveal sequence
// ---------------------------------------------------------------------------

function paintReadout() {
  const rd = G.round;
  const ro = $('readout'), st = $('steps');
  if (!ro || !st) return;
  ro.replaceChildren();
  st.replaceChildren();
  if (!rd || rd.phase !== 'resolved' || !rd.preview || resultHidden()) return;
  if (!resultVisible()) return;   // no peeking while the ball is still running

  const r = reveal || { chips: rd.preview.chips, mult: rd.preview.mult, upto: rd.preview.steps.length, done: true };
  const total = r.done ? rd.preview.score : Math.floor(r.chips * r.mult);

  ro.append(
    h('div#roChips.chips', null, fmt(r.chips)),
    h('div.x', null, '×'),
    h('div#roMult.mult', null, fmt(r.mult)),
    h('div.x', null, '='),
    h('div#roTotal.total', null, fmt(total)));

  for (const s of rd.preview.steps.slice(0, r.upto)) {
    st.append(h('div.step.' + s.kind, null, h('b', null, s.src || ''), h('span', null, s.text)));
  }
  st.scrollTop = st.scrollHeight;
}

function targetEl(target) {
  if (!target) return $('readout');
  if (target.k === 'bet') return document.querySelector(`#centre [data-spot="${target.id}"]`);
  if (target.k === 'token') return document.querySelector(`#tokenbar [data-token="${target.i}"]`);
  if (target.k === 'pocket') return document.querySelector('.result-badge');
  return $('readout');
}

/** Walk the scoring steps one at a time, lighting up whatever produced each. */
async function startReveal(ctx, delay = 0) {
  const my = ++revealToken;
  revealPending = false;
  reveal = { chips: 0, mult: ctx.steps.length ? 1 : 0, upto: 0, done: false };
  resetPitch();
  paintReadout();
  await fxWait(delay);
  if (my !== revealToken) return;

  const gap = ctx.steps.length > 14 ? 110 : 190;
  for (const step of ctx.steps) {
    if (my !== revealToken) return;
    const el = targetEl(step.target);
    if (el) { fxFlash(el, step.kind); fxFloat(el, step.text, step.kind); }
    Sfx.trigger(step.kind);

    const fromChips = reveal.chips, fromMult = reveal.mult;
    reveal.chips = step.chips;
    reveal.mult = step.mult;
    reveal.upto++;
    paintReadout();
    const cEl = $('roChips'), mEl = $('roMult');
    if (cEl && fromChips !== step.chips) { fxCountUp(cEl, fromChips, step.chips, gap * 0.8, (v) => fmt(Math.round(v))); fxPop(cEl); }
    if (mEl && fromMult !== step.mult) { fxCountUp(mEl, fromMult, step.mult, gap * 0.8, (v) => fmt(Math.round(v * 100) / 100)); fxPop(mEl, 1.35); }
    await fxWait(gap);
  }

  if (my !== revealToken) return;
  landReveal(true);
}

/** Jump straight to the final numbers. Returns true if it interrupted a reveal. */
function landReveal(natural) {
  const rd = G.round;
  revealPending = false;
  if (!rd || !rd.preview) return false;
  const wasMid = !!reveal && !reveal.done;
  revealToken++;
  reveal = { chips: rd.preview.chips, mult: rd.preview.mult, upto: rd.preview.steps.length, done: true };
  paintReadout();
  if ((wasMid || natural) && rd.preview.score > 0) {
    const tEl = $('roTotal');
    if (tEl) fxPop(tEl, 1.4);
    const power = Math.min(1, rd.preview.score / Math.max(1, rd.target));
    Sfx.slam(power);
    fxShake(power);
  }
  return wasMid && !natural;
}

// ---------------------------------------------------------------------------
// action bar
// ---------------------------------------------------------------------------

function actions() {
  const rd = G.round;
  if (G.screen === 'play' && rd) {
    if (rd.phase === 'betting') {
      const canSpin = G.chipsPlaced() > 0;
      return [
        h('button.btn.big.primary', { disabled: !canSpin, onclick: doSpin }, 'Spin  ▸'),
        h('button.btn', { disabled: !canSpin, onclick: () => { Sfx.unchip(); G.clearBets(); } }, 'Clear'),
        h('button.btn', { disabled: !G.lastBets, onclick: repeatLast }, 'Repeat')
      ];
    }
    if (rd.phase === 'resolved') {
      const nud = G.canNudge();
      const btns = [];
      if (G.nudgeStep === 2) btns.push(h('button.btn.purple.sm', { disabled: !nud, onclick: () => doNudge(-2) }, '◀◀'));
      btns.push(h('button.btn.purple', {
        disabled: !nud, onclick: () => doNudge(-1),
        tip: { title: 'Nudge back', body: 'Move the ball one pocket anticlockwise on the physical wheel.' }
      }, '◀ Nudge'));
      btns.push(h('button.btn.big.gold', { onclick: doCollect }, resultHidden() ? 'Reveal' : 'Collect'));
      btns.push(h('button.btn.purple', {
        disabled: !nud, onclick: () => doNudge(1),
        tip: { title: 'Nudge on', body: 'Move the ball one pocket clockwise on the physical wheel.' }
      }, 'Nudge ▶'));
      if (G.nudgeStep === 2) btns.push(h('button.btn.purple.sm', { disabled: !nud, onclick: () => doNudge(2) }, '▶▶'));
      return btns;
    }
  }
  if (G.screen === 'cashout') return [h('button.btn.big.gold', { onclick: () => { Sfx.ui(); G.toShop(); } }, 'Visit the shop')];
  if (G.screen === 'shop') return [h('button.btn.big.primary', { onclick: () => { Sfx.ui(); G.nextBlind(); } }, 'Next table  ▸')];
  if (G.screen === 'pack') {
    const p = G.pendingPack;
    return [h('button.btn', { onclick: () => { Sfx.ui(); G.closePack(); } }, p && p.picksLeft > 0 ? 'Skip the rest' : 'Continue')];
  }
  return [];
}

function doSpin() {
  const rd = G.round;
  resumeAudio();
  G.lastBets = { ...rd.bets };
  hiddenShown = false;
  // Arm first: G.spin() resolves synchronously and emits, and the render that
  // follows must neither snap the ball nor show the answer before the wheel
  // has moved.
  revealPending = true;
  wheelArm();
  if (!G.spin()) { wheelDisarm(); revealPending = false; render(); return; }
  if (G.round.phase !== 'resolved') { wheelDisarm(); revealPending = false; render(); return; }  // Second Sight

  const dur = spinDuration();
  if (dur > 300) Sfx.spin(dur / 1000);
  spinAndReveal(dur);
}

/** Run the ball, then tally the score once it has settled. */
function spinAndReveal(dur) {
  const rd = G.round;
  wheelSpinTo(rd.pocketIndex, G.wheel.length).then(() => {
    // Always cut the rattle: if the spin was skipped it would otherwise keep
    // playing underneath the landing thud and the score tally.
    Sfx.stopSpin();
    if (!G.round || G.round.phase !== 'resolved') return;
    if (dur > 300) Sfx.land();
    // Order matters: publish the result, arm the reveal at zero, then repaint.
    // Rendering before startReveal would flash the final score for a frame.
    revealPending = false;
    if (!resultHidden()) startReveal(G.round.preview, 120);
    render();
  });
}

function takeCandidate(idx) {
  revealPending = true;
  wheelArm();
  G.chooseCandidate(idx);
  const dur = spinDuration();
  if (dur > 300) Sfx.spin(dur / 1000);
  spinAndReveal(dur);
}

function doNudge(steps) {
  revealToken++;
  reveal = null;
  revealPending = true;
  Sfx.nudge();
  wheelArm();
  if (!G.nudge(steps)) { wheelDisarm(); revealPending = false; return; }
  wheelHopTo(G.round.pocketIndex, G.wheel.length).then(() => {
    if (!G.round || G.round.phase !== 'resolved') return;
    revealPending = false;
    if (!resultHidden()) startReveal(G.round.preview, 60);
    render();
  });
}

function doCollect() {
  const rd = G.round;
  // First press lands the ball early; the spin's own callback then reveals.
  if (wheelFinishNow()) return;
  if (resultHidden()) {          // The Whisper: first press reveals, second banks
    hiddenShown = true;
    Sfx.land();
    render();
    startReveal(rd.preview, 200);
    return;
  }
  if (landReveal(false)) return; // first press skips the animation
  revealToken++;
  reveal = null;
  revealPending = false;
  hiddenShown = false;
  const before = rd.score;
  G.collect();
  if (G.round && G.round.score !== before) {
    const el = $('roundScore');
    if (el) { fxCountUp(el, before, G.round.score, 500, (v) => fmt(Math.round(v))); fxPop(el); }
  }
  if (G.screen === 'cashout') {
    Sfx.win();
    setTimeout(() => fxBurst(document.querySelector('#centre .panel') || $('centre'), 26), 60);
  } else if (G.screen === 'gameover') Sfx.lose();
}

function repeatLast() {
  const rd = G.round;
  if (!G.lastBets) return;
  rd.bets = {};
  for (const [id, w] of Object.entries(G.lastBets)) {
    for (let i = 0; i < w; i++) if (G.canPlace(id)) rd.bets[id] = (rd.bets[id] || 0) + 1;
  }
  Sfx.chip();
  G.emit();
}

// ---------------------------------------------------------------------------
// cashout / shop / packs
// ---------------------------------------------------------------------------

function cashoutScreen() {
  const c = G.cashout;
  const line = (label, value) => h('div.cashline', null, h('span', null, label), h('b', null, '$' + value));
  return h('div.panel', null,
    h('p.screen-title', null, `${c.blind} — cleared`),
    h('div.cashlines', null,
      line('Table reward', c.reward),
      c.spinsBonus > 0 && line(`${c.spinsBonus} unused spin${c.spinsBonus === 1 ? '' : 's'}`, c.spinsBonus),
      c.interest > 0 && line(`Interest (cap $${G.interestCap})`, c.interest),
      c.extra !== 0 && line('Tokens and charters', c.extra),
      h('div.cashline.total', null, h('span', null, 'Purse'), h('b', null, '$' + G.money))));
}

function shopScreen() {
  const shop = G.shop;
  const rc = G.rerollCost();
  const body = h('div', null,
    h('div.shop-grid', null, ...shop.items.map(shopCard)),
    h('div.shopfoot', null,
      h('button.btn', { disabled: G.money < rc, onclick: () => { Sfx.ui(); G.reroll(); } }, `Reroll  $${rc}`),
      G.shopFlags.free ? h('span.tagnote', null, 'Coupon Tag: everything is free') : null));

  if (shop.charter) {
    body.append(
      h('p.screen-title', { style: { marginTop: '20px' } }, 'Charter — a permanent upgrade'),
      h('div.shop-grid', null, shopCard(shop.charter)));
  }
  return h('div.panel', null, h('p.screen-title', null, `The shop — you hold $${G.money}`), body);
}

function shopCard(item) {
  let name, text, rarity = null, glyph, cls = '.card.shop-card';
  const lines = [];
  if (item.kind === 'token') {
    const d = TOKENS_BY_ID[item.id];
    name = d.name; text = d.text; rarity = d.rarity; glyph = glyphFor(d);
    if (item.edition) { cls += '.ed-' + item.edition; lines.push({ text: `${EDITIONS[item.edition].name}: ${EDITIONS[item.edition].text}` }); }
    if (item.sticker) lines.push({ text: `${STICKERS[item.sticker].name}: ${STICKERS[item.sticker].text}`, colour: '#e0574a' });
  } else if (item.kind === 'omen') {
    const d = OMENS_BY_ID[item.id];
    name = d.name; text = d.text; glyph = d.glyph; cls += '.omen';
  } else if (item.kind === 'pack') {
    const d = PACKS_BY_ID[item.id];
    const what = { enh: 'pocket enhancements', fate: 'Fates', token: 'Tokens', omen: 'Omens' }[d.kind];
    name = d.name; glyph = d.glyph; cls += '.pack';
    text = `Choose ${d.picks} of ${d.size} ${what}`;
  } else {
    const d = CHARTERS_BY_ID[item.id];
    name = d.name; text = d.text; glyph = d.glyph; cls += '.charter';
  }

  const can = G.canBuy(item);
  const reason = item.sold ? 'Sold'
    : G.money < item.price ? 'Not enough money'
    : item.kind === 'token' && G.tokenCount() >= G.maxTokens && item.edition !== 'negative' ? 'No Token slots free'
    : item.kind === 'omen' && G.omens.length >= G.maxOmens ? 'No Omen slots free' : null;

  const card = h(cls + (item.sold ? '.sold' : can ? '' : '.disabled'), {
    tip: { title: name, rarity, body: text, lines, foot: reason },
    onclick: () => { if (!can) { Sfx.deny(); return; } Sfx.buy(); G.buy(item); }
  },
    h('div.cname', null, name),
    h('div.cglyph', null, glyph),
    h('div.ctext', null, text),
    h('div.cprice', null, item.sold ? '—' : item.price === 0 ? 'FREE' : '$' + item.price));
  if (rarity) card.style.setProperty('--rarity', RARITY[rarity].colour);
  return card;
}

function packScreen() {
  const p = G.pendingPack;
  if (!p) return h('div');
  const def = PACKS_BY_ID[p.packId];

  const cards = p.options.map((opt) => {
    let name, text, glyph, rarity = null, cls = '.card.shop-card';
    const lines = [];
    if (opt.kind === 'token') {
      const d = TOKENS_BY_ID[opt.id];
      name = d.name; text = d.text; rarity = d.rarity; glyph = glyphFor(d);
      if (opt.edition) { cls += '.ed-' + opt.edition; lines.push({ text: `${EDITIONS[opt.edition].name}: ${EDITIONS[opt.edition].text}` }); }
    } else if (opt.kind === 'omen') {
      const d = OMENS_BY_ID[opt.id];
      name = d.name; text = d.text; glyph = d.glyph; cls += '.omen';
    } else if (opt.kind === 'enh') {
      const d = ENHANCEMENTS[opt.id];
      name = d.name; text = d.text; glyph = d.glyph; cls += '.enh-card';
    } else {
      const d = FATES_BY_ID[opt.id];
      name = d.name; text = d.text; glyph = d.glyph; cls += '.fate';
    }
    const ok = G.packPickable(opt);
    return h(cls + (opt.taken ? '.sold' : ok ? '' : '.disabled'), {
      tip: { title: name, rarity, body: text, lines, foot: opt.taken ? 'Taken' : ok ? null : 'No room for this' },
      onclick: () => { if (ok) pickFromPack(opt); else Sfx.deny(); }
    },
      h('div.cname', null, name),
      h('div.cglyph', null, glyph),
      h('div.ctext', null, text));
  });

  return h('div.panel', null,
    h('p.screen-title', null, `${def.name} — ${p.picksLeft} pick${p.picksLeft === 1 ? '' : 's'} left`),
    h('div.shop-grid', null, ...cards));
}

function pickFromPack(opt) {
  if (opt.kind === 'enh') {
    openPocketPicker(`Apply ${ENHANCEMENTS[opt.id].name}`, ENHANCEMENTS[opt.id].text,
      (pocket) => { Sfx.buy(); G.packPick(opt, pocket); });
    return;
  }
  Sfx.buy();
  G.packPick(opt);
}

// ---------------------------------------------------------------------------
// endings
// ---------------------------------------------------------------------------

function unlockNotes() {
  if (!G.unlocked || !G.unlocked.length) return null;
  return h('div.unlocks', null, ...G.unlocked.map((u) => h('div.unlockline', null,
    'Unlocked: ' + (u.kind === 'wheel' ? WHEELS_BY_ID[u.id].name : STAKES_BY_ID[u.id].name))));
}

function gameOverScreen() {
  const rd = G.round;
  return h('div.centered', null,
    h('h1.bigtitle.lose', null, 'Wiped out'),
    h('div.subtitle', null, `${rd.blindName} · Ante ${G.ante} · ${STAKES_BY_ID[G.stakeId].name}`),
    h('div.bigline', null, `You scored ${fmt(rd.score)} of ${fmt(rd.target)}.`),
    h('div.dim', null,
      `${G.stats.roundsWon} tables cleared · ${G.stats.spins} spins · best single spin ${fmt(G.stats.best)}`),
    unlockNotes(),
    h('div.btnrow', null,
      h('button.btn.big.primary', { onclick: () => bindGame(Game.newRun(undefined, { wheelId: G.wheelId, stakeId: G.stakeId })) }, 'New run'),
      h('button.btn.big', { onclick: () => bindGame(Game.newRun(G.seed, { wheelId: G.wheelId, stakeId: G.stakeId })) }, 'Retry seed')),
    h('button.btn.sm', { onclick: () => bindGame(null) }, 'Back to title'),
    arcadeRow());
}

function winScreen() {
  return h('div.centered', null,
    h('h1.bigtitle', null, 'The house folds'),
    h('div.subtitle', null, `Ante ${FINAL_ANTE} cleared · ${STAKES_BY_ID[G.stakeId].name}`),
    h('div.dim', { style: { maxWidth: '460px' } },
      `You walked out with $${G.money}, ${G.tokens.length} Tokens and a wheel of ${G.wheel.length} pockets. ` +
      `Best single spin: ${fmt(G.stats.best)}.`),
    unlockNotes(),
    h('div.btnrow', null,
      h('button.btn.big.gold', { onclick: () => { Sfx.ui(); G.goEndless(); } }, 'Keep playing'),
      h('button.btn.big', { onclick: () => bindGame(null) }, 'Back to title')),
    arcadeRow());
}

// ---------------------------------------------------------------------------
// modals
// ---------------------------------------------------------------------------

function closeModal() { const m = $('modal'); m.hidden = true; m.replaceChildren(); }

function openModal(node) {
  const m = $('modal');
  m.hidden = false;
  m.replaceChildren(node);
  m.onclick = (e) => { if (e.target === m) closeModal(); };
}

const modalBox = (title, ...body) => h('div.panel.modal-box', null,
  h('p.screen-title', null, title), ...body,
  h('div.modalfoot', null, h('button.btn.sm', { onclick: closeModal }, 'Close')));

function openPocketPicker(title, subtitle, onPick) {
  const picker = h('div.pocket-picker');
  G.wheel.forEach((p) => {
    picker.append(h('div.pocket-pick.' + p.colour, {
      onclick: () => { onPick(p); closeModal(); },
      tip: p.enh
        ? { title: `Pocket ${p.n} — ${ENHANCEMENTS[p.enh].name}`, body: ENHANCEMENTS[p.enh].text }
        : { title: 'Pocket ' + p.n, body: 'No enhancement.' }
    }, String(p.n), p.enh && h('div.enh', null, ENHANCEMENTS[p.enh].glyph)));
  });
  openModal(modalBox(title, h('div.modalsub', null, subtitle), picker));
}

function beginOmen(i) {
  // The index is captured at render time; using an omen reshuffles the list, so
  // re-check before acting on a click that raced a re-render.
  if (!G.omenUsable(i)) return;
  const d = omenDef(G.omens[i]);
  if (d.target === 'none') { G.useOmen(i); return; }
  if (d.target === 'pocket') {
    openPocketPicker(`${d.name} — choose a pocket`, d.text, (p) => G.useOmen(i, p));
  } else if (d.target === 'token') {
    const row = h('div.shop-grid');
    G.tokens.forEach((tk) => {
      const td = tokenDef(tk);
      row.append(h('div.card', { onclick: () => { G.useOmen(i, tk); closeModal(); } },
        h('div.cname', null, td.name), h('div.cglyph', null, glyphFor(td)), h('div.ctag', null, RARITY[td.rarity].name)));
    });
    openModal(modalBox(`${d.name} — choose a Token`, row));
  }
}

function showWheelSheet() {
  const counts = new Map();
  for (const p of G.wheel) counts.set(p.n, (counts.get(p.n) || 0) + 1);
  const picker = h('div.pocket-picker');
  G.wheel.forEach((p) => {
    picker.append(h('div.pocket-pick.' + p.colour, {
      tip: {
        title: 'Pocket ' + p.n,
        sub: `${((counts.get(p.n) / G.wheel.length) * 100).toFixed(1)}% of the wheel`,
        body: p.enh ? `${ENHANCEMENTS[p.enh].name}: ${ENHANCEMENTS[p.enh].text}` : 'No enhancement.'
      }
    }, String(p.n), p.enh && h('div.enh', null, ENHANCEMENTS[p.enh].glyph)));
  });
  openModal(modalBox(`The wheel — ${G.wheel.length} pockets, in spin order`,
    h('div.modalsub', null, `${Math.max(0, FULL_WHEEL - G.wheel.length)} removed from a standard wheel`), picker));
}

function showSettings() {
  const row = (label, control) => h('div.setrow', null, h('span', null, label), control);
  const toggle = (key) => {
    const b = h('button.btn.sm' + (Settings[key] ? '.green' : ''), null, Settings[key] ? 'On' : 'Off');
    b.addEventListener('click', () => {
      setSetting(key, !Settings[key]);
      Sfx.ui();
      b.className = 'btn sm' + (Settings[key] ? ' green' : '');
      b.textContent = Settings[key] ? 'On' : 'Off';
    });
    return b;
  };

  const vol = h('input', { type: 'range', min: '0', max: '1', step: '.05', value: String(Settings.volume) });
  vol.addEventListener('input', () => setSetting('volume', Number(vol.value)));
  vol.addEventListener('change', () => { resumeAudio(); Sfx.coin(); });

  const speed = h('select.sel');
  [['0.5', 'Languid'], ['1', 'Normal'], ['2', 'Brisk'], ['4', 'Instant']].forEach(([v, l]) => {
    const o = h('option', { value: v }, l);
    if (Number(v) === Settings.speed) o.selected = true;
    speed.append(o);
  });
  speed.addEventListener('change', () => setSetting('speed', Number(speed.value)));

  openModal(modalBox('Options',
    row('Volume', vol),
    row('Sound effects', toggle('sfx')),
    row('Animation speed', speed),
    row('Screen shake', toggle('shake')),
    row('Reduced motion', toggle('reducedMotion')),
    row('Colourblind palette', toggle('colourblind')),
    h('div.modalsub', { style: { marginTop: '14px' } },
      'Every sound is synthesised at runtime — there are no audio files. A soundtrack is still on the roadmap.'),
    // Kept visually distinct and out of .modalfoot: it must never be mistaken
    // for the Close button sitting directly below it.
    h('div.dangerzone', null,
      h('span', null, 'Erase every unlock, record and setting'),
      h('button.btn.sm.danger', {
        onclick: () => {
          if (!confirm('Erase ALL unlocks, records and settings? This cannot be undone.')) return;
          if (!confirm('Really erase everything? Your unlocked wheels and stakes will be gone.')) return;
          resetProfile();
          closeModal();
          render();
        }
      }, 'Erase'))));
}

function showProfile() {
  const t = Profile.totals;
  const stats = h('div.cashlines', null,
    ...[['Runs played', t.runs], ['Runs won', t.wins],
      ['Win rate', t.runs ? Math.round((t.wins / t.runs) * 100) + '%' : '—'],
      ['Spins', t.spins], ['Best single spin', fmt(t.bestScore)],
      ['Furthest ante', t.bestAnte || '—'], ['Money earned', '$' + t.moneyEarned]]
      .map(([k, v]) => h('div.cashline', null, h('span', null, k), h('b', null, String(v)))));

  const rows = Profile.history.length
    ? Profile.history.slice(0, 12).map((r) => h('div.histrow' + (r.won ? '.won' : ''), null,
        h('span', null, r.won ? 'WIN' : 'Ante ' + r.ante),
        h('span', null, (WHEELS_BY_ID[r.wheel] || {}).name || r.wheel),
        h('span', { style: { color: (STAKES_BY_ID[r.stake] || {}).colour } }, ((STAKES_BY_ID[r.stake] || {}).name || r.stake).replace(' Stake', '')),
        h('span', null, fmt(r.bestScore)),
        h('span.seedcell', null, r.seed)))
    : [h('div.dim', null, 'No runs recorded yet.')];

  openModal(modalBox('Records', stats,
    h('div.section-h', { style: { marginTop: '14px' } }, h('span', null, 'Recent runs')),
    h('div.histtable', null, ...rows)));
}

function showCollection() {
  const grid = h('div.collection');
  for (const d of TOKENS) {
    const seen = !!Profile.seenTokens[d.id];
    const card = h('div.card.small' + (seen ? '' : '.unseen'), {
      tip: seen ? { title: d.name, rarity: d.rarity, body: d.text } : { title: '???', body: 'Not yet discovered.' }
    }, h('div.cglyph', null, seen ? glyphFor(d) : '?'), h('div.cname', null, seen ? d.name : '???'));
    if (seen) card.style.setProperty('--rarity', RARITY[d.rarity].colour);
    grid.append(card);
  }
  openModal(modalBox(`Collection — ${Object.keys(Profile.seenTokens).length} of ${TOKENS.length} Tokens found`, grid));
}

// ---------------------------------------------------------------------------
// keyboard
// ---------------------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'Escape') {
    if (!$('modal').hidden) closeModal();
    else if (G && G.round && G.round.phase === 'betting') G.clearBets();
    return;
  }
  if (!G) return;
  resumeAudio();
  if (e.code === 'Space') {
    e.preventDefault();
    if (G.screen !== 'play' || !G.round) return;
    if (G.round.phase === 'betting' && G.chipsPlaced()) doSpin();
    else if (G.round.phase === 'resolved') doCollect();
    return;
  }
  if (e.key === 'r' && G.screen === 'shop') G.reroll();
  if (G.round && G.round.phase === 'resolved') {
    if (e.key === 'ArrowLeft') doNudge(-1);
    if (e.key === 'ArrowRight') doNudge(1);
  }
});

// Not `once`: browsers suspend the context whenever the tab loses focus, and
// only some controls call resumeAudio themselves. Without this, coming back to
// the tab and playing with the mouse alone leaves the game silent.
window.addEventListener('pointerdown', resumeAudio);

// Handy when chasing an audio report; harmless otherwise.
if (typeof window !== 'undefined') window.__audioStats = audioStats;
