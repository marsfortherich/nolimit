// Game state, scoring pipeline and run flow.
//
// Nothing in this file touches the DOM. The whole game is drivable headlessly,
// which is how it gets tested and balanced.

import { makeRng, randomSeed } from './rng.js';
import {
  SPOTS, freshWheel, makePocket, ENHANCEMENTS, BLINDS, anteTarget
} from './data.js';
import { TOKENS, TOKENS_BY_ID, instantiate, tokenDef } from './tokens.js';
import { OMENS, OMENS_BY_ID, omenDef, instantiateOmen } from './omens.js';
import { BOSSES_BY_ID, pickBoss } from './bosses.js';
import { CHARTERS, CHARTERS_BY_ID } from './charters.js';
import { EDITIONS, rollEdition, editionPrice } from './editions.js';
import { stakeMods, rollSticker, stakeIndex, nextStake } from './stakes.js';
import { WHEELS_BY_ID, wheelMods, wheelsEarnedBy } from './wheels.js';
import { TAGS_BY_ID, rollTag, tagDef } from './tags.js';
import { PACKS_BY_ID, rollPackType, FATES_BY_ID, FATES } from './packs.js';
import { Profile, discoverToken, recordRun, unlockStake, unlockWheel } from './profile.js';

export const BASE_SPINS = 4;
export const BASE_CHIPS = 6;
export const BASE_NUDGES = 3;
export const FINAL_ANTE = 8;
export const FULL_WHEEL = 37;

const SAVE_KEY = 'no-limit-save-v2';

const round2 = (n) => Math.round(n * 100) / 100;

export function fmt(n) {
  if (n === undefined || n === null) return '0';
  if (!isFinite(n)) return '∞';
  if (Math.abs(n) >= 1e15) return n.toExponential(2).replace('e+', 'e');
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  return round2(n).toLocaleString('en-US');
}

// ---------------------------------------------------------------------------
// Scoring context
// ---------------------------------------------------------------------------

class Ctx {
  constructor(G, pocketIndex) {
    this.G = G;
    this.state = G;
    this.pocketIndex = pocketIndex;
    this.pocket = G.wheel[pocketIndex];
    this.result = this.pocket.n;
    this.colour = this.pocket.colour;
    this.spinNumber = G.round.spinNumber;
    this.spinsLeft = G.round.spinsLeft;
    this.bets = Object.entries(G.round.bets).map(([id, w]) => ({ spotId: id, wager: w, spot: SPOTS[id] }));
    this.chipsPlaced = this.bets.reduce((s, b) => s + b.wager, 0);
    this.spotsUsed = this.bets.length;
    this.nudges = G.round.nudgesThisSpin || 0;
    this.winners = [];
    this.chips = 0;
    this.mult = 1;
    this.money = 0;
    this.steps = [];
    this.effects = [];
    this.neighbours = false;
    this.rollIdx = 0;
    this.flags = G.round.bossFlags || {};
    this.cur = '';
    this.curTarget = null;

    const covered = new Set();
    for (const b of this.bets) for (const n of b.spot.numbers) covered.add(n);
    this.numbersCovered = covered.size;
  }

  roll() {
    const r = this.G.round.rolls;
    const v = r[this.rollIdx % r.length];
    this.rollIdx++;
    return v;
  }

  push(kind, text) {
    this.steps.push({
      src: this.cur, target: this.curTarget, text, kind,
      chips: this.chips, mult: this.mult
    });
  }

  note(src, text, kind = 'info') { const s = this.cur; this.cur = src; this.push(kind, text); this.cur = s; }
  addChips(n) { if (!n) return; this.chips += n; this.push('chips', `+${fmt(n)} Chips`); }
  addMult(n) { if (!n) return; this.mult += n; this.push('mult', `+${fmt(n)} Mult`); }
  xMult(x) { if (x === 1) return; this.mult = round2(this.mult * x); this.push('xmult', `x${round2(x)} Mult`); }
  addMoney(n) {
    if (!n || this.flags.noMoney) return;
    this.money += n;
    this.push('money', `+$${n}`);
  }

  countFamily(fam) { return this.winners.filter((w) => w.spot.family === fam && !w.dead).length; }
  chipsFromFamily(fam) { return this.winners.reduce((s, w) => s + (w.spot.family === fam ? w.chipsScored : 0), 0); }
  betOn(spotId) { return (this.G.round.bets[spotId] || 0) > 0; }
  enableNeighbours() { this.neighbours = true; }
  removeResultPocket() { this.effects.push({ type: 'removePocket', uid: this.pocket.uid }); }
  get won() { return this.score > 0; }
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

export class Game {
  constructor() { this.listeners = []; }

  // -- lifecycle -----------------------------------------------------------

  static newRun(seed, opts = {}) {
    const G = new Game();
    G.seed = seed || randomSeed();
    G.rng = makeRng(G.seed);
    G.wheelId = opts.wheelId || 'house';
    G.stakeId = opts.stakeId || 'white';
    G.mods = { ...wheelMods(G.wheelId) };
    G.stake = stakeMods(G.stakeId);

    G.screen = 'blind';
    G.ante = 1;
    G.blindIndex = 0;
    G.money = G.mods.startMoney !== undefined ? G.mods.startMoney : 4;
    G.tokens = [];
    G.tokenSlots = 5 + (G.mods.tokenSlots || 0);
    G.omens = [];
    G.omenSlots = 2;
    G.charters = [];
    G.tags = [];
    G.wheel = freshWheel();
    G.bossesSeen = [];
    G.stats = { hits: {}, spins: 0, best: 0, roundsWon: 0, pocketsRemoved: 0, moneyEarned: 0, skips: 0 };
    G.messages = [];
    G.round = null;
    G.shop = null;
    G.shopFlags = {};
    G.pendingPack = null;
    G.pendingBoss = null;
    G.lastResult = null;
    G.lastColour = null;
    G.lastBets = null;
    G.endless = false;
    G.finished = false;
    G.rollBoss();

    const wheelDef = WHEELS_BY_ID[G.wheelId];
    if (wheelDef && wheelDef.setup) wheelDef.setup(G);
    return G;
  }

  on(fn) { this.listeners.push(fn); }
  emit() { for (const fn of this.listeners) fn(this); this.save(); }
  log(text) { this.messages.unshift(text); this.messages.length = Math.min(this.messages.length, 40); }

  // -- persistence ---------------------------------------------------------

  toJSON() {
    const { listeners, rng, round, ...rest } = this;
    // round.preview is a live scoring context holding a reference back to the
    // game, so it cannot be stringified. It is cheap to rebuild on load.
    const slimRound = round ? { ...round, preview: null } : null;
    return { ...rest, round: slimRound, rngState: this.rng.state() };
  }

  save() {
    if (this.finished) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.toJSON())); } catch (e) { /* no storage */ }
  }

  static clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* no storage */ } }

  static load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      const G = new Game();
      Object.assign(G, data);
      G.rng = makeRng(0);
      G.rng.setState(data.rngState);
      G.mods = G.mods || {};
      G.stake = G.stake || stakeMods(G.stakeId || 'white');
      G.shopFlags = G.shopFlags || {};
      G.tags = G.tags || [];
      if (G.round && G.round.phase === 'resolved') G.round.preview = computeSpin(G, G.round.pocketIndex);
      return G;
    } catch (e) { return null; }
  }

  // -- derived stats -------------------------------------------------------

  /** Sum a numeric passive across every live Token. */
  passive(key, base = 0) {
    let v = base;
    for (const tk of this.liveTokens()) {
      const p = tokenDef(tk).passive;
      if (p && p[key] !== undefined) v = typeof p[key] === 'number' ? v + p[key] : p[key];
    }
    return v;
  }

  hasPassive(key) {
    return this.liveTokens().some((tk) => (tokenDef(tk).passive || {})[key]);
  }

  hasCharter(id) { return this.charters.includes(id); }

  /** Tokens that still function: not debuffed by a dead Perishable sticker. */
  liveTokens() { return this.tokens.filter((tk) => !tk.dead); }

  /** Tokens that also survive the boss's interference, in scoring order. */
  activeTokens() {
    let list = this.liveTokens();
    if (this.round && this.round.bossFlags.disableLeftmost) list = list.slice(1);
    return list;
  }

  /**
   * How many Token cards are on the board — all of them, Negatives included.
   * A Negative pays for itself through `maxTokens` below; excluding it here as
   * well would hand out the slot twice.
   */
  tokenCount() { return this.tokens.length; }

  get spinsPerRound() {
    return Math.max(1, BASE_SPINS + this.passive('spins') + (this.mods.spins || 0)
      + (this.hasCharter('whale') ? 1 : 0));
  }

  get chipsPerRound() {
    return Math.max(1, BASE_CHIPS + this.passive('chips') + (this.mods.chips || 0)
      + (this.hasCharter('comped') ? 1 : 0));
  }

  get nudgesPerRound() {
    return Math.max(0, BASE_NUDGES + this.passive('nudges') + (this.stake.nudges || 0)
      + (this.hasCharter('overtime') ? 2 : 0));
  }

  get nudgeStep() {
    return (this.hasCharter('fixer') || this.hasPassive('nudge2')) ? 2 : 1;
  }

  get noInterest() { return !!this.mods.noInterest || this.hasPassive('noInterest'); }

  get interestCap() {
    let cap = Math.max(5, this.passive('interestCap', 5));
    if (this.hasCharter('credit')) cap += 5;
    return cap;
  }

  /** Each Negative raises the cap by one and then fills that one itself. */
  get maxTokens() { return this.tokenSlots + (this.hasCharter('deeptable') ? 1 : 0) + this.negativeSlots(); }
  negativeSlots() { return this.tokens.filter((tk) => tk.edition === 'negative').length; }
  get maxOmens() { return this.omenSlots + (this.hasCharter('salon') ? 1 : 0); }

  get editionBoost() { return this.hasCharter('connoisseur') ? 4 : 1; }

  get pocketsMissing() { return Math.max(0, FULL_WHEEL - this.wheel.length); }

  gain(n, src) {
    if (!n) return;
    if (this.round && this.round.bossFlags.noMoney && n > 0) {
      this.log('The Drought swallows the money.');
      return;
    }
    this.money += n;
    if (n > 0) this.stats.moneyEarned += n;
    if (src) this.log(`${src}: ${n < 0 ? '-' : '+'}$${Math.abs(n)}`);
  }

  spend(n) { this.money -= n; }

  // -- wheel helpers -------------------------------------------------------

  removePocket(uid) {
    const i = this.wheel.findIndex((p) => p.uid === uid);
    if (i >= 0 && this.wheel.length > 6) {
      this.wheel.splice(i, 1);
      this.stats.pocketsRemoved++;
      return true;
    }
    return false;
  }

  clonePocket(pocket) {
    const i = this.wheel.findIndex((p) => p.uid === pocket.uid);
    const copy = makePocket(pocket.n, pocket.enh);
    copy.colour = pocket.colour;
    this.wheel.splice(i >= 0 ? i + 1 : this.wheel.length, 0, copy);
  }

  addPocketNumber(n) {
    const idx = this.wheel.findIndex((p) => p.n === n);
    this.wheel.splice(idx >= 0 ? idx + 1 : this.wheel.length, 0, makePocket(n));
  }

  enhanceRandomPocket(kind) {
    const plain = this.wheel.filter((p) => !p.enh);
    if (!plain.length) return null;
    const p = this.rng.pick(plain);
    p.enh = kind || this.rng.pick(Object.keys(ENHANCEMENTS));
    this.log(`Pocket ${p.n} becomes ${ENHANCEMENTS[p.enh].name}.`);
    return p;
  }

  // -- token helpers -------------------------------------------------------

  grantRandomToken(rarity) {
    if (this.tokenCount() >= this.maxTokens) return null;
    const owned = new Set(this.tokens.map((t) => t.id));
    let pool = TOKENS.filter((t) => !owned.has(t.id) && t.rarity !== 'legendary');
    if (rarity) pool = pool.filter((t) => t.rarity === rarity);
    if (!pool.length) return null;
    const d = this.rng.pick(pool);
    this.acquireToken(d.id);
    this.log(`Gained ${d.name}.`);
    return d.id;
  }

  grantRandomCharter() {
    const avail = CHARTERS.filter((c) => !this.charters.includes(c.id));
    if (!avail.length) return;
    const c = this.rng.pick(avail);
    this.charters.push(c.id);
    this.log(`Signed the ${c.name}.`);
  }

  acquireToken(id, opts = {}) {
    const tk = instantiate(id);
    if (opts.edition) tk.edition = opts.edition;
    if (opts.sticker) tk.sticker = opts.sticker;
    if (tk.sticker === 'rented') tk.sellValue = 0;
    if (tk.sticker === 'perishable') tk.life = 5;
    this.tokens.push(tk);
    discoverToken(id);
    const d = TOKENS_BY_ID[id];
    if (d.onAcquire) d.onAcquire(this);
    return tk;
  }

  canSellToken(i) {
    const tk = this.tokens[i];
    return !!tk && tk.sticker !== 'eternal';
  }

  sellToken(i) {
    if (!this.canSellToken(i)) return;
    const tk = this.tokens[i];
    this.gain(tk.sellValue);
    this.tokens.splice(i, 1);
    this.log(`Sold ${tokenDef(tk).name} for $${tk.sellValue}.`);
    this.emit();
  }

  destroyToken(tk) {
    if (tk.sticker === 'eternal') return false;
    const i = this.tokens.indexOf(tk);
    if (i >= 0) this.tokens.splice(i, 1);
    return true;
  }

  sellOmen(i) {
    const om = this.omens[i];
    if (!om) return;
    this.gain(Math.max(1, Math.floor(omenDef(om).cost / 2)));
    this.omens.splice(i, 1);
    this.emit();
  }

  moveToken(from, to) {
    if (to < 0 || to >= this.tokens.length || from === to) return;
    const [tk] = this.tokens.splice(from, 1);
    this.tokens.splice(to, 0, tk);
    this.emit();
  }

  // -- blind selection -----------------------------------------------------

  rollBoss() {
    this.pendingBoss = pickBoss(this.rng, this.ante, this.bossesSeen).id;
  }

  currentBlind() { return BLINDS[this.blindIndex]; }

  targetFor(blindIndex) {
    let t = anteTarget(this.ante, blindIndex);
    t = Math.round(t * Math.pow(this.stake.targetScale || 1, this.ante - 1));
    if (blindIndex === 2) {
      const boss = BOSSES_BY_ID[this.pendingBoss];
      if (boss && boss.targetMult) t = Math.round(t * boss.targetMult);
      const disc = this.passive('bossDiscount', 1);
      if (disc !== 1) t = Math.round(t * disc);
    }
    return t;
  }

  currentTarget() { return this.targetFor(this.blindIndex); }

  startBlind() {
    const blind = this.currentBlind();
    const boss = this.blindIndex === 2 ? BOSSES_BY_ID[this.pendingBoss] : null;
    const rd = {
      blindKey: blind.key,
      blindName: boss ? boss.name : blind.name,
      bossId: boss ? boss.id : null,
      bossFlags: boss && boss.flags ? { ...boss.flags } : {},
      target: this.currentTarget(),
      reward: this.stake.noSmallReward && blind.key === 'small' ? 0 : blind.reward,
      score: 0,
      spinsLeft: this.spinsPerRound,
      spinsTotal: this.spinsPerRound,
      nudgesLeft: this.nudgesPerRound,
      freeNudges: 0,
      nudgesThisSpin: 0,
      nudgesThisRound: 0,
      chipsTotal: this.chipsPerRound,
      bets: {},
      locked: [],
      phase: 'betting',
      spinNumber: 0,
      secondSight: 0,
      doubleNext: 0,
      pocketsAtStart: this.wheel.length,
      preview: null,
      candidates: null,
      rolls: []
    };
    if (boss && boss.setup) boss.setup(rd, this);

    // Tags queued for the start of a round.
    this.tags = this.tags.filter((tag) => {
      const d = tagDef(tag);
      if (d.when !== 'round') return true;
      d.apply(this, rd);
      this.log(`${d.name} fires.`);
      return false;
    });

    for (const tk of this.liveTokens()) {
      const d = tokenDef(tk);
      if (d.roundStart) d.roundStart(rd, this, tk);
    }

    // Rent is due whether or not the round goes well.
    for (const tk of this.tokens) {
      if (tk.sticker === 'rented') this.gain(-3, `Rent on ${tokenDef(tk).name}`);
    }

    this.round = rd;
    this.screen = 'play';
    this.emit();
  }

  skipBlind() {
    if (this.blindIndex === 2) return;
    this.stats.skips++;
    const count = this.hasCharter('silvertongue') ? 2 : 1;
    for (let i = 0; i < count; i++) this.takeTag(rollTag(this.rng));
    this.blindIndex++;
    if (this.screen !== 'pack') this.screen = 'blind';
    this.emit();
  }

  takeTag(tag) {
    const d = tagDef(tag);
    this.log(`Took the ${d.name}.`);
    if (d.when === 'now') {
      if (d.grantsPack) { this.openPack(d.grantsPack, true); return; }
      d.apply(this);
      return;
    }
    this.tags.push(tag);
  }

  // -- betting -------------------------------------------------------------

  chipsPlaced() { return Object.values(this.round.bets).reduce((s, w) => s + w, 0); }
  chipsLeft() { return this.round.chipsTotal - this.chipsPlaced(); }

  canPlace(spotId) {
    const rd = this.round;
    if (!rd || rd.phase !== 'betting') return false;
    if (rd.locked.includes(spotId)) return false;
    if (this.chipsLeft() <= 0) return false;
    const max = rd.bossFlags.maxPerSpot;
    if (max && (rd.bets[spotId] || 0) >= max) return false;
    return true;
  }

  placeChip(spotId) {
    if (!this.canPlace(spotId)) return false;
    this.round.bets[spotId] = (this.round.bets[spotId] || 0) + 1;
    this.emit();
    return true;
  }

  removeChip(spotId) {
    const rd = this.round;
    if (!rd || rd.phase !== 'betting' || !rd.bets[spotId]) return false;
    rd.bets[spotId]--;
    if (!rd.bets[spotId]) delete rd.bets[spotId];
    this.emit();
    return true;
  }

  clearBets() {
    if (this.round.phase !== 'betting') return;
    this.round.bets = {};
    this.emit();
  }

  // -- spinning ------------------------------------------------------------

  spin() {
    const rd = this.round;
    if (rd.phase !== 'betting' || !this.chipsPlaced()) return false;
    rd.spinNumber++;
    rd.nudgesThisSpin = 0;
    rd.rolls = Array.from({ length: 10 }, () => this.rng());

    if (rd.bossFlags.tithe) this.gain(-this.chipsPlaced(), 'The Tithe');

    const a = this.rng.int(this.wheel.length);
    const wantsTwo = rd.secondSight > 0 || this.hasPassive('doubleRoll') || rd.bossFlags.worstOfTwo;
    let b = a;
    if (wantsTwo && this.wheel.length > 1) { do { b = this.rng.int(this.wheel.length); } while (b === a); }

    if (rd.secondSight > 0 && wantsTwo) {
      rd.secondSight--;
      rd.candidates = [a, b];
      rd.phase = 'choosing';
      rd.preview = null;
    } else if (wantsTwo) {
      const sa = computeSpin(this, a).score;
      const sb = computeSpin(this, b).score;
      const keepA = rd.bossFlags.worstOfTwo ? sa <= sb : sa >= sb;
      this.setResult(keepA ? a : b);
    } else {
      this.setResult(a);
    }
    this.emit();
    return true;
  }

  setResult(pocketIndex) {
    const rd = this.round;
    rd.pocketIndex = pocketIndex;
    rd.phase = 'resolved';
    rd.candidates = null;
    rd.preview = computeSpin(this, pocketIndex);
  }

  chooseCandidate(pocketIndex) {
    if (this.round.phase !== 'choosing') return;
    this.setResult(pocketIndex);
    this.emit();
  }

  freeNudgeAvailable() {
    const rd = this.round;
    if (rd.freeNudges > 0) return true;
    return this.hasPassive('freeNudgePerSpin') && rd.nudgesThisSpin === 0;
  }

  canNudge() {
    const rd = this.round;
    if (!rd || rd.phase !== 'resolved' || rd.bossFlags.noNudge) return false;
    return this.freeNudgeAvailable() || rd.nudgesLeft > 0;
  }

  nudge(steps) {
    const rd = this.round;
    if (!this.canNudge()) return false;
    if (rd.freeNudges > 0) rd.freeNudges--;
    else if (this.hasPassive('freeNudgePerSpin') && rd.nudgesThisSpin === 0) { /* free */ }
    else rd.nudgesLeft--;
    rd.nudgesThisSpin++;
    rd.nudgesThisRound++;
    const n = this.wheel.length;
    rd.pocketIndex = ((rd.pocketIndex + steps) % n + n) % n;
    rd.preview = computeSpin(this, rd.pocketIndex);
    this.emit();
    return true;
  }

  collect() {
    const rd = this.round;
    if (rd.phase !== 'resolved') return;
    const ctx = rd.preview;

    let gained = ctx.score;
    if (rd.doubleNext > 0 && gained > 0) { gained *= 2; rd.doubleNext--; this.log('Doubling Down: the spin pays twice.'); }

    rd.score += gained;
    this.stats.spins++;
    this.stats.hits[ctx.result] = (this.stats.hits[ctx.result] || 0) + 1;
    this.stats.best = Math.max(this.stats.best, gained);

    for (const tk of this.activeTokens()) {
      const d = tokenDef(tk);
      if (d.spinEnd) { ctx.cur = d.name; d.spinEnd(ctx, tk); }
    }
    if (ctx.money) this.gain(ctx.money);

    for (const e of ctx.effects) {
      if (e.type === 'removePocket' || e.type === 'shatter') {
        if (e.type === 'shatter' && this.hasPassive('noShatter')) continue;
        const p = this.wheel.find((x) => x.uid === e.uid);
        if (this.removePocket(e.uid) && p) {
          this.log(e.type === 'shatter'
            ? `Glass pocket ${p.n} shatters out of the wheel.`
            : `Pocket ${p.n} is gone from the wheel.`);
        }
      }
    }

    if (rd.bossFlags.wheelbreak && this.wheel.length > 12) {
      const p = this.rng.pick(this.wheel);
      this.removePocket(p.uid);
      this.log(`The Wheelbreaker prises out pocket ${p.n}.`);
    }

    if (rd.bossFlags.lockHeaviest) {
      const entries = Object.entries(rd.bets).sort((x, y) => y[1] - x[1]);
      if (entries.length) {
        rd.locked.push(entries[0][0]);
        this.log(`The Serpent locks ${SPOTS[entries[0][0]].label}.`);
      }
    }

    this.lastResult = ctx.result;
    this.lastColour = ctx.colour;
    rd.spinsLeft--;
    rd.bets = {};
    rd.preview = null;
    rd.nudgesThisSpin = 0;
    rd.phase = 'betting';

    if (rd.score >= rd.target) this.winRound();
    else if (rd.spinsLeft <= 0) this.loseRound();
    this.emit();
  }

  // -- round resolution ----------------------------------------------------

  winRound() {
    const rd = this.round;
    this.stats.roundsWon++;
    const before = this.money;
    const spinsBonus = rd.spinsLeft;
    const interest = this.noInterest ? 0 : Math.min(Math.floor(Math.max(0, this.money) / 5), this.interestCap);
    this.money += rd.reward + spinsBonus + interest;
    this.stats.moneyEarned += rd.reward + spinsBonus + interest;

    for (const tk of this.liveTokens()) {
      const d = tokenDef(tk);
      if (d.roundEnd) d.roundEnd(this, tk);
    }
    if (this.hasCharter('tipster')) this.gain(2, 'Tipster');

    // Perishable Tokens age out.
    for (const tk of this.tokens) {
      if (tk.sticker === 'perishable' && !tk.dead) {
        tk.life = (tk.life || 5) - 1;
        if (tk.life <= 0) { tk.dead = true; this.log(`${tokenDef(tk).name} has perished.`); }
      }
    }

    if (rd.bossId) {
      this.tags = this.tags.filter((tag) => {
        const d = tagDef(tag);
        if (d.when !== 'boss') return true;
        d.apply(this);
        this.log(`${d.name} fires.`);
        return false;
      });
    }

    this.cashout = {
      blind: rd.blindName,
      reward: rd.reward,
      spinsBonus,
      interest,
      extra: this.money - before - rd.reward - spinsBonus - interest
    };
    rd.phase = 'won';
    this.screen = 'cashout';
  }

  loseRound() {
    this.round.phase = 'lost';
    this.screen = 'gameover';
    this.finishRun(false);
  }

  finishRun(won) {
    if (this.finished) return;
    this.finished = true;
    Game.clearSave();
    const summary = {
      seed: this.seed, wheel: this.wheelId, stake: this.stakeId,
      ante: this.ante, won, spins: this.stats.spins,
      bestScore: this.stats.best, money: this.stats.moneyEarned,
      tokens: this.tokens.map((t) => t.id)
    };
    this.unlocked = [];
    for (const id of wheelsEarnedBy(summary)) {
      if (unlockWheel(id)) this.unlocked.push({ kind: 'wheel', id });
    }
    if (won) {
      const nxt = nextStake(this.stakeId);
      if (nxt && unlockStake(nxt.id)) this.unlocked.push({ kind: 'stake', id: nxt.id });
    }
    recordRun(summary);

    // Post the run to the arcade. No Limit is ranked by best single spin, the
    // number the game already treats as its headline score. Fire-and-forget:
    // the engine stays DOM-free and never waits on the network.
    const arcade = typeof globalThis !== 'undefined' ? globalThis.Arcade : null;
    if (arcade) {
      arcade.submitScore('nolimit', summary.bestScore, {
        ante: summary.ante,
        won: !!won,
        wheel: summary.wheel,
        stake: summary.stake,
        spins: summary.spins,
        seed: summary.seed
      });
    }
  }

  toShop() {
    this.buildShop();
    this.screen = 'shop';
    this.emit();
  }

  nextBlind() {
    const wasBoss = this.blindIndex === 2;
    this.round = null;
    this.shop = null;
    if (wasBoss) {
      this.bossesSeen.push(this.pendingBoss);
      if (this.ante >= FINAL_ANTE && !this.endless) {
        this.screen = 'win';
        this.finishRun(true);
        this.emit();
        return;
      }
      this.ante++;
      this.blindIndex = 0;
      this.rollBoss();
    } else {
      this.blindIndex++;
    }
    this.screen = 'blind';
    this.emit();
  }

  goEndless() {
    this.endless = true;
    this.finished = false;
    this.ante++;
    this.blindIndex = 0;
    this.rollBoss();
    this.screen = 'blind';
    this.emit();
  }

  // -- shop ----------------------------------------------------------------

  priceOf(base) {
    if (this.shopFlags.free) return 0;
    return Math.max(0, base - (this.hasCharter('discount') ? 1 : 0));
  }

  rerollCost() {
    if (this.shopFlags.freeRerolls) return 0;
    const c = 4 + (this.shop ? this.shop.rerolls : 0) - (this.hasCharter('houseedge') ? 3 : 0);
    return Math.max(1, c);
  }

  rollShopItem(force = {}) {
    const owned = new Set(this.tokens.map((t) => t.id));
    const r = this.rng();
    if (!force.token && r > 0.86) {
      const p = rollPackType(this.rng);
      return { kind: 'pack', id: p.id, price: this.priceOf(p.cost) };
    }
    if (force.token || r < 0.62) {
      const weights = force.rare
        ? { common: 0, uncommon: 0, rare: 100, legendary: 3 }
        : this.hasCharter('reserve')
          ? { common: 38, uncommon: 32, rare: 25, legendary: 5 }
          : { common: 60, uncommon: 27, rare: 11, legendary: 2 };
      const pool = TOKENS.filter((t) => !owned.has(t.id) && weights[t.rarity] > 0);
      if (pool.length) {
        const total = pool.reduce((s, t) => s + weights[t.rarity], 0);
        let pick = this.rng() * total;
        for (const t of pool) {
          pick -= weights[t.rarity];
          if (pick <= 0) {
            const edition = force.edition || rollEdition(this.rng, this.editionBoost);
            const sticker = rollSticker(this.rng, this.stake);
            return {
              kind: 'token', id: t.id, edition, sticker,
              price: Math.max(1, this.priceOf(t.cost + editionPrice(edition)) - (sticker === 'rented' ? 2 : 0))
            };
          }
        }
      }
    }
    const o = this.rng.pick(OMENS);
    return { kind: 'omen', id: o.id, price: this.priceOf(o.cost) };
  }

  buildShop() {
    // Tags queued for a shop fire before it is stocked, so they can change it.
    this.shopFlags = {};
    this.tags = this.tags.filter((tag) => {
      const d = tagDef(tag);
      if (d.when !== 'shop') return true;
      d.apply(this);
      this.log(`${d.name} fires.`);
      return false;
    });

    let slots = 3 + (this.hasCharter('marked') ? 1 : 0) + (this.mods.shopSlots || 0)
      + (this.hasCharter('ballroom') ? 1 : 0);
    slots = Math.max(2, slots);

    const items = [];
    if (this.shopFlags.forceRare) items.push(this.rollShopItem({ token: true, rare: true }));
    if (this.shopFlags.forceEdition) items.push(this.rollShopItem({ token: true, edition: this.shopFlags.forceEdition }));
    while (items.length < slots) items.push(this.rollShopItem());

    let charter = null;
    const avail = CHARTERS.filter((c) => !this.charters.includes(c.id));
    if ((this.blindIndex === 2 || this.shopFlags.forceCharter) && avail.length) {
      const c = this.rng.pick(avail);
      charter = { kind: 'charter', id: c.id, price: this.priceOf(c.cost) };
    }
    this.shop = { items, charter, rerolls: 0 };
  }

  reroll() {
    const cost = this.rerollCost();
    if (this.money < cost) return;
    this.spend(cost);
    this.shop.rerolls++;
    this.shop.items = this.shop.items.map(() => this.rollShopItem());
    this.emit();
  }

  canBuy(item) {
    if (!item || item.sold) return false;
    if (this.money < item.price) return false;
    if (item.kind === 'token') return this.tokenCount() < this.maxTokens || item.edition === 'negative';
    if (item.kind === 'omen') return this.omens.length < this.maxOmens;
    return true;
  }

  buy(item) {
    if (!this.canBuy(item)) return false;
    this.spend(item.price);
    item.sold = true;
    if (item.kind === 'token') {
      this.acquireToken(item.id, { edition: item.edition, sticker: item.sticker });
      this.log(`Bought ${TOKENS_BY_ID[item.id].name}.`);
    } else if (item.kind === 'omen') {
      this.omens.push(instantiateOmen(item.id));
      this.log(`Bought ${OMENS_BY_ID[item.id].name}.`);
    } else if (item.kind === 'charter') {
      this.charters.push(item.id);
      this.log(`Signed the ${CHARTERS_BY_ID[item.id].name}.`);
    } else if (item.kind === 'pack') {
      this.openPack(item.id, false);
    }
    this.emit();
    return true;
  }

  // -- booster packs -------------------------------------------------------

  openPack(packId, free) {
    const def = PACKS_BY_ID[packId];
    if (!def) return;
    const size = def.size + (this.hasCharter('bulkbuyer') ? 1 : 0);
    const owned = new Set(this.tokens.map((t) => t.id));
    const options = [];
    const enhKinds = Object.keys(ENHANCEMENTS);

    for (let i = 0; i < size; i++) {
      if (def.kind === 'token') {
        const pool = TOKENS.filter((t) => !owned.has(t.id) && !options.some((o) => o.id === t.id));
        if (!pool.length) break;
        const weights = { common: 55, uncommon: 30, rare: 13, legendary: 2 };
        const total = pool.reduce((s, t) => s + weights[t.rarity], 0);
        let pick = this.rng() * total;
        let chosen = pool[0];
        for (const t of pool) { pick -= weights[t.rarity]; if (pick <= 0) { chosen = t; break; } }
        options.push({ kind: 'token', id: chosen.id, edition: rollEdition(this.rng, this.editionBoost * 2) });
      } else if (def.kind === 'omen') {
        options.push({ kind: 'omen', id: this.rng.pick(OMENS).id });
      } else if (def.kind === 'enh') {
        options.push({ kind: 'enh', id: this.rng.pick(enhKinds) });
      } else {
        const pool = FATES.filter((f) => !options.some((o) => o.id === f.id));
        options.push({ kind: 'fate', id: this.rng.pick(pool.length ? pool : FATES).id });
      }
    }

    this.pendingPack = {
      packId, options, picksLeft: Math.min(def.picks, options.length),
      free: !!free, returnTo: this.screen
    };
    this.screen = 'pack';
    this.emit();
  }

  packPickable(opt) {
    const p = this.pendingPack;
    if (!p || p.picksLeft <= 0 || opt.taken) return false;
    if (opt.kind === 'token') return this.tokenCount() < this.maxTokens || opt.edition === 'negative';
    if (opt.kind === 'omen') return this.omens.length < this.maxOmens;
    return true;
  }

  /** For 'enh' options the caller supplies the pocket the player picked. */
  packPick(opt, target) {
    if (!this.packPickable(opt)) return false;
    if (opt.kind === 'enh' && !target) return false;
    if (opt.kind === 'token') this.acquireToken(opt.id, { edition: opt.edition });
    else if (opt.kind === 'omen') this.omens.push(instantiateOmen(opt.id));
    else if (opt.kind === 'enh') { target.enh = opt.id; this.log(`Pocket ${target.n} becomes ${ENHANCEMENTS[opt.id].name}.`); }
    else FATES_BY_ID[opt.id].use(this);
    opt.taken = true;
    this.pendingPack.picksLeft--;
    if (this.pendingPack.picksLeft <= 0) this.closePack();
    else this.emit();
    return true;
  }

  closePack() {
    const back = this.pendingPack ? this.pendingPack.returnTo : 'shop';
    this.pendingPack = null;
    this.screen = back === 'pack' ? 'shop' : back;
    this.emit();
  }

  // -- omens ---------------------------------------------------------------

  omenUsable(i) {
    const om = this.omens[i];
    if (!om) return false;
    const d = omenDef(om);
    if (d.roundOnly && !(this.round && this.round.phase === 'betting')) return false;
    if (!['shop', 'play', 'blind', 'cashout'].includes(this.screen)) return false;
    if (d.enabled && !d.enabled(this)) return false;
    return true;
  }

  useOmen(i, target) {
    if (!this.omenUsable(i)) return false;
    const d = omenDef(this.omens[i]);
    if (d.target !== 'none' && !target) return false;
    d.use(this, target);
    this.omens.splice(i, 1);
    if (this.round && this.round.phase === 'resolved') {
      this.round.preview = computeSpin(this, this.round.pocketIndex);
    }
    this.emit();
    return true;
  }
}

// ---------------------------------------------------------------------------
// The scoring pipeline
// ---------------------------------------------------------------------------

function applyEdition(ctx, tk) {
  const ed = tk.edition && EDITIONS[tk.edition];
  if (!ed) return;
  const label = ctx.cur;
  ctx.cur = `${ed.name} ${label}`;
  if (ed.chips) ctx.addChips(ed.chips);
  if (ed.mult) ctx.addMult(ed.mult);
  if (ed.xmult) ctx.xMult(ed.xmult);
  ctx.cur = label;
}

function runToken(ctx, tk, i, tokens) {
  const d = tokenDef(tk);
  ctx.cur = d.name;
  ctx.curTarget = { k: 'token', i: ctx.G.tokens.indexOf(tk) };

  if (d.isMirror || d.isMirrorLeft) {
    const other = tokens[i + (d.isMirror ? 1 : -1)];
    if (other && tokenDef(other).score) {
      ctx.cur = `${d.name} (${tokenDef(other).name})`;
      tokenDef(other).score(ctx, other);
    }
  } else if (d.score) {
    d.score(ctx, tk);
  }
  applyEdition(ctx, tk);
}

export function computeSpin(G, pocketIndex) {
  const rd = G.round;
  const ctx = new Ctx(G, pocketIndex);
  const tokens = G.activeTokens();

  for (const tk of tokens) {
    const d = tokenDef(tk);
    if (d.resolve) d.resolve(ctx, tk);
  }

  // --- which bets won? ---
  const hitNumbers = new Map([[ctx.result, 1]]);
  if (ctx.neighbours) {
    const n = G.wheel.length;
    for (const off of [-1, 1]) {
      const p = G.wheel[(pocketIndex + off + n) % n];
      if (!hitNumbers.has(p.n)) hitNumbers.set(p.n, 0.5);
    }
  }
  for (const b of ctx.bets) {
    let best = 0;
    for (const [num, weight] of hitNumbers) if (b.spot.numbers.includes(num)) best = Math.max(best, weight);
    if (best > 0) ctx.winners.push({ ...b, weight: best, chipsScored: 0 });
  }

  // --- base chips and mult from the winning bets ---
  const deadFams = ctx.flags.deadFamilies || [];
  const deadColour = ctx.flags.deadColour;
  const deadSpin = ctx.flags.deadSpins && ctx.spinNumber <= ctx.flags.deadSpins;
  const chipBonus = G.mods.chipBonus || 1;

  for (const w of ctx.winners) {
    const blocked = deadFams.includes(w.spot.family) || deadColour === ctx.colour || deadSpin;
    let chips = Math.floor(w.spot.chips * w.wager * w.weight * chipBonus);
    let mult = Math.floor(w.spot.mult * w.weight * 10) / 10;
    if (blocked) { chips = 0; w.dead = true; }
    w.chipsScored = chips;
    ctx.chips += chips;
    ctx.mult += mult;
    ctx.cur = w.spot.label + (w.weight < 1 ? ' (neighbour)' : '');
    ctx.curTarget = { k: 'bet', id: w.spotId };
    ctx.push(blocked ? 'dead' : 'bet', blocked ? `blocked — +${mult} Mult only` : `+${fmt(chips)} Chips  +${mult} Mult`);
  }

  ctx.score = 0;
  if (!ctx.winners.length) {
    ctx.chips = 0;
    ctx.mult = 0;
    ctx.cur = 'No winning bets';
    ctx.curTarget = null;
    ctx.push('dead', 'the table takes it');
    return finishSpin(ctx);
  }

  // --- the result pocket's own enhancement ---
  const enh = ctx.flags.noEnhancements ? null : ctx.pocket.enh;
  if (enh) {
    ctx.curTarget = { k: 'pocket' };
    const times = G.hasPassive('retriggerEnh') ? 2 : 1;
    for (let t = 0; t < times; t++) applyEnhancement(ctx, enh);
  }

  // --- tokens, left to right ---
  const silenced = ctx.flags.noTokenSpins && ctx.spinNumber <= ctx.flags.noTokenSpins;
  if (!silenced) {
    const repeats = G.hasPassive('perpetual') && ctx.spinNumber % 4 === 0 ? 2 : 1;
    for (let pass = 0; pass < repeats; pass++) {
      for (let i = 0; i < tokens.length; i++) {
        runToken(ctx, tokens[i], i, tokens);
        if (i === 0 && G.hasPassive('retriggerFirst')) runToken(ctx, tokens[i], i, tokens);
      }
    }
  }

  for (const tk of tokens) {
    const d = tokenDef(tk);
    if (d.finalize) { ctx.cur = d.name; ctx.curTarget = { k: 'token', i: G.tokens.indexOf(tk) }; d.finalize(ctx, tk); }
  }

  return finishSpin(ctx);
}

function applyEnhancement(ctx, enh) {
  const e = ENHANCEMENTS[enh];
  ctx.cur = `${e.name} pocket`;
  if (enh === 'gilded') ctx.addChips(50);
  else if (enh === 'bonus') ctx.addChips(30);
  else if (enh === 'mult') ctx.addMult(4);
  else if (enh === 'steel') ctx.xMult(1.5);
  else if (enh === 'glass') {
    ctx.xMult(3);
    if (ctx.roll() < 0.25 && !ctx.G.hasPassive('noShatter')) {
      ctx.effects.push({ type: 'shatter', uid: ctx.pocket.uid });
      ctx.push('warn', 'will shatter');
    }
  } else if (enh === 'lucky') {
    if (ctx.roll() < 1 / 3) ctx.xMult(2); else ctx.push('dead', 'no luck');
    if (ctx.roll() < 1 / 6) ctx.addMoney(4);
  }
}

function finishSpin(ctx) {
  const f = ctx.flags;
  if (f.multPenalty) ctx.mult = Math.max(1, ctx.mult - f.multPenalty);
  if (f.multCap) ctx.mult = Math.min(ctx.mult, f.multCap);
  ctx.mult = Math.max(0, round2(ctx.mult));
  ctx.chips = Math.max(0, Math.floor(ctx.chips));
  ctx.score = Math.floor(ctx.chips * ctx.mult);
  return ctx;
}
