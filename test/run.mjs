// Headless test suite. Run with:  node test/run.mjs
//
// Nothing here touches the DOM, so the whole game is exercised in Node. The
// point is to catch a Token, Omen, Boss, Pack or Tag that throws — with this
// much content, a hand-played smoke test cannot cover it.

import { SPOTS, ENHANCEMENTS } from '../src/data.js';
import { Game, computeSpin, FULL_WHEEL } from '../src/engine.js';
import { TOKENS, TOKENS_BY_ID } from '../src/tokens.js';
import { OMENS } from '../src/omens.js';
import { BOSSES } from '../src/bosses.js';
import { CHARTERS } from '../src/charters.js';
import { TAGS } from '../src/tags.js';
import { PACKS, FATES } from '../src/packs.js';
import { STAKES } from '../src/stakes.js';
import { WHEELS } from '../src/wheels.js';
import { spinPlan, ballRadius, ballRattle, mod360, WHEEL_GEOM } from '../src/wheelview.js';
import { triggerFreq } from '../src/audio.js';

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}\n    ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e}`);
  }
}

const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || 'not equal'}: ${a} !== ${b}`); };

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function startedRun(seed = 'TEST', opts = {}) {
  const G = Game.newRun(seed, opts);
  G.startBlind();
  return G;
}

/** Put the game in a state where a spin can be scored, without any animation. */
function primeSpin(G, bets) {
  G.round.bets = { ...bets };
  G.round.spinNumber = Math.max(1, G.round.spinNumber);
  G.round.rolls = Array.from({ length: 10 }, (_, i) => (i % 3) / 3);
  return G;
}

const cycleBets = (ids) => (G) => {
  let i = 0, stall = 0;
  while (G.chipsLeft() > 0 && stall < ids.length) {
    const before = G.chipsLeft();
    G.placeChip(ids[i % ids.length]);
    stall = G.chipsLeft() === before ? stall + 1 : 0;
    i++;
  }
};

const spreadBet = cycleBets(['red', 'black', 'dz0', 'dz1', 'st3', 'n17', 'cl1', 'n7', 'odd', 'even', 'low', 'high', 'ln4']);

/** Play a whole run to its end with a fixed strategy. Returns a summary. */
function playRun(G, { buy = true, useOmens = true } = {}) {
  let guard = 0;
  while (guard++ < 2000) {
    if (G.screen === 'blind') {
      // Skip occasionally so Tags get exercised.
      if (G.blindIndex < 2 && G.rng() < 0.25) G.skipBlind();
      else G.startBlind();
      continue;
    }
    if (G.screen === 'play') {
      const rd = G.round;
      spreadBet(G);
      if (!G.chipsPlaced()) { G.placeChip('n0'); }
      G.spin();
      if (rd.phase === 'choosing') G.chooseCandidate(rd.candidates[0]);
      if (rd.phase === 'resolved' && rd.preview.score === 0) {
        for (let k = 0; k < 3 && G.canNudge(); k++) {
          G.nudge(1);
          if (rd.preview.score > 0) break;
        }
      }
      G.collect();
      continue;
    }
    if (G.screen === 'cashout') { G.toShop(); continue; }
    if (G.screen === 'pack') {
      const p = G.pendingPack;
      let progressed = false;
      for (const opt of p.options) {
        if (!G.packPickable(opt)) continue;
        const target = opt.kind === 'enh' ? G.rng.pick(G.wheel) : undefined;
        if (G.packPick(opt, target)) { progressed = true; break; }
      }
      if (!progressed) G.closePack();
      continue;
    }
    if (G.screen === 'shop') {
      if (buy) {
        let bought = true;
        while (bought) {
          bought = false;
          for (const item of G.shop.items) if (G.canBuy(item)) { G.buy(item); bought = true; break; }
          if (G.screen === 'pack') break;
          if (G.shop.charter && G.canBuy(G.shop.charter)) { G.buy(G.shop.charter); bought = true; }
        }
      }
      if (G.screen === 'pack') continue;
      if (useOmens) {
        for (let k = 0; k < 4; k++) {
          const i = G.omens.findIndex((_, idx) => G.omenUsable(idx));
          if (i < 0) break;
          const d = OMENS.find((o) => o.id === G.omens[i].id);
          const target = d.target === 'pocket' ? G.rng.pick(G.wheel)
            : d.target === 'token' ? G.tokens[0] : undefined;
          if (!G.useOmen(i, target)) break;
        }
      }
      G.nextBlind();
      continue;
    }
    if (G.screen === 'gameover' || G.screen === 'win') {
      return { ante: G.ante, won: G.screen === 'win', steps: guard };
    }
    throw new Error('unknown screen: ' + G.screen);
  }
  throw new Error('run did not terminate');
}

// ---------------------------------------------------------------------------
// scoring correctness
// ---------------------------------------------------------------------------

test('scorer matches a brute-force winner/total calculation', () => {
  const G = startedRun('INVARIANT');
  const ids = Object.keys(SPOTS);
  for (let t = 0; t < 20000; t++) {
    const bets = {};
    const k = 1 + G.rng.int(6);
    for (let j = 0; j < k; j++) bets[G.rng.pick(ids)] = 1 + G.rng.int(3);
    primeSpin(G, bets);
    G.round.rolls = Array(10).fill(0.9);   // suppress Lucky/Glass rolls
    const ctx = computeSpin(G, G.rng.int(G.wheel.length));

    const expect = Object.keys(bets).filter((id) => SPOTS[id].numbers.includes(ctx.result)).sort();
    const got = ctx.winners.map((w) => w.spotId).sort();
    assert(JSON.stringify(expect) === JSON.stringify(got),
      `winners differ on ${ctx.result}: ${expect} vs ${got}`);

    let chips = 0, mult = expect.length ? 1 : 0;
    for (const id of expect) { chips += SPOTS[id].chips * bets[id]; mult += SPOTS[id].mult; }
    eq(ctx.chips, chips, 'chips');
    eq(ctx.mult, mult, 'mult');
    eq(ctx.score, Math.floor(chips * mult), 'score');
  }
});

test('a spin with no winning bet scores exactly zero', () => {
  const G = startedRun('ZERO');
  primeSpin(G, { n1: 3 });
  const idx = G.wheel.findIndex((p) => p.n === 2);
  const ctx = computeSpin(G, idx);
  eq(ctx.score, 0, 'score');
  eq(ctx.chips, 0, 'chips');
});

test('every scoring step records running chips and mult in order', () => {
  const G = startedRun('STEPS');
  G.acquireToken('croupier');
  G.acquireToken('fatstack');
  primeSpin(G, { red: 2, odd: 1 });
  const idx = G.wheel.findIndex((p) => p.n === 1);   // red and odd
  const ctx = computeSpin(G, idx);
  assert(ctx.steps.length >= 4, 'expected a step per winner plus per token');
  const last = ctx.steps[ctx.steps.length - 1];
  eq(last.chips, ctx.chips, 'final step chips');
  eq(last.mult, ctx.mult, 'final step mult');
});

// ---------------------------------------------------------------------------
// content: nothing may throw
// ---------------------------------------------------------------------------

test('every Token can be owned and scored without throwing', () => {
  for (const def of TOKENS) {
    const G = startedRun('TK-' + def.id);
    G.tokenSlots = 20;
    G.acquireToken(def.id);
    G.money = 25;
    // score against several results so colour/parity branches all run
    for (const n of [0, 7, 13, 17, 22, 36]) {
      primeSpin(G, { red: 1, n17: 2, dz0: 1, st5: 1, cl1: 1, odd: 1, even: 1 });
      const idx = G.wheel.findIndex((p) => p.n === n);
      if (idx < 0) continue;
      const ctx = computeSpin(G, idx);
      assert(Number.isFinite(ctx.score), `${def.id} produced ${ctx.score}`);
      assert(ctx.score >= 0, `${def.id} scored negative`);
      G.round.preview = ctx;
      G.round.pocketIndex = idx;
      G.round.phase = 'resolved';
      G.collect();
      if (G.screen !== 'play') break;   // round ended; that is fine
    }
  }
});

test('every Token survives a full round-start and round-end cycle', () => {
  for (const def of TOKENS) {
    const G = Game.newRun('CY-' + def.id);
    G.tokenSlots = 20;
    G.acquireToken(def.id);
    G.startBlind();
    G.round.score = G.round.target;      // force a clean win
    G.winRound();
    assert(Number.isFinite(G.money), `${def.id} broke the purse`);
  }
});

test('every Omen applies without throwing', () => {
  for (const def of OMENS) {
    const G = startedRun('OM-' + def.id);
    G.tokenSlots = 20;
    G.acquireToken('croupier');
    G.money = 30;
    G.omens = [{ id: def.id }];
    if (!G.omenUsable(0)) continue;
    const target = def.target === 'pocket' ? G.wheel[3] : def.target === 'token' ? G.tokens[0] : undefined;
    assert(G.useOmen(0, target), `${def.id} refused to apply`);
    assert(G.wheel.length >= 6, `${def.id} emptied the wheel`);
  }
});

test('every Boss Table can be set up and played', () => {
  for (const boss of BOSSES) {
    const G = Game.newRun('BOSS-' + boss.id);
    G.ante = Math.max(1, boss.minAnte);
    G.blindIndex = 2;
    G.pendingBoss = boss.id;
    G.acquireToken('croupier');
    G.acquireToken('fatstack');
    G.startBlind();
    eq(G.round.bossId, boss.id, 'boss id');
    assert(G.round.spinsLeft >= 1, `${boss.id} left no spins`);
    assert(G.round.chipsTotal >= 1, `${boss.id} left no chips`);
    for (let s = 0; s < 4 && G.screen === 'play'; s++) {
      spreadBet(G);
      if (!G.chipsPlaced()) break;
      G.spin();
      if (G.round.phase === 'choosing') G.chooseCandidate(G.round.candidates[0]);
      assert(Number.isFinite(G.round.preview.score), `${boss.id} produced a bad score`);
      G.collect();
    }
  }
});

test('every Tag fires without throwing', () => {
  for (const tag of TAGS) {
    const G = Game.newRun('TAG-' + tag.id);
    G.money = 20;
    G.takeTag({ id: tag.id });
    if (G.screen === 'pack') {
      const opt = G.pendingPack.options.find((o) => G.packPickable(o));
      if (opt) G.packPick(opt, opt.kind === 'enh' ? G.wheel[0] : undefined);
      if (G.pendingPack) G.closePack();
    }
    if (tag.when === 'shop') { G.buildShop(); assert(G.shop.items.length >= 2, 'shop too small'); }
    if (tag.when === 'round') { G.startBlind(); assert(G.round.chipsTotal >= 1, 'no chips'); }
    if (tag.when === 'boss') { G.blindIndex = 2; G.startBlind(); G.round.score = G.round.target; G.winRound(); }
    assert(Number.isFinite(G.money), `${tag.id} broke the purse`);
  }
});

test('every pack type opens and every option can be taken', () => {
  for (const pack of PACKS) {
    const G = startedRun('PK-' + pack.id);
    G.tokenSlots = 30;
    G.omenSlots = 30;
    G.openPack(pack.id, true);
    assert(G.pendingPack, `${pack.id} did not open`);
    assert(G.pendingPack.options.length > 0, `${pack.id} was empty`);
    let guard = 0;
    while (G.pendingPack && G.pendingPack.picksLeft > 0 && guard++ < 10) {
      const opt = G.pendingPack.options.find((o) => G.packPickable(o));
      if (!opt) break;
      G.packPick(opt, opt.kind === 'enh' ? G.rng.pick(G.wheel) : undefined);
    }
    if (G.pendingPack) G.closePack();
    assert(G.screen !== 'pack', `${pack.id} never closed`);
  }
});

test('every Fate resolves without throwing', () => {
  for (const fate of FATES) {
    const G = startedRun('FT-' + fate.id);
    G.tokenSlots = 20;
    G.acquireToken('croupier');
    G.acquireToken('fatstack');
    fate.use(G);
    assert(G.wheel.length >= 6, `${fate.id} emptied the wheel`);
    assert(Number.isFinite(G.money), `${fate.id} broke the purse`);
  }
});

test('every starting wheel builds a legal run', () => {
  for (const w of WHEELS) {
    const G = Game.newRun('WH-' + w.id, { wheelId: w.id });
    assert(G.wheel.length >= 12, `${w.id} produced ${G.wheel.length} pockets`);
    assert(G.spinsPerRound >= 1, `${w.id} left no spins`);
    assert(G.chipsPerRound >= 1, `${w.id} left no chips`);
    G.startBlind();
    spreadBet(G);
    assert(G.chipsPlaced() > 0, `${w.id} could not place a chip`);
  }
});

test('every stake produces sane targets and resources', () => {
  for (const s of STAKES) {
    const G = Game.newRun('ST-' + s.id, { stakeId: s.id });
    assert(G.nudgesPerRound >= 0, `${s.id} gave negative nudges`);
    for (let ante = 1; ante <= 8; ante++) {
      G.ante = ante;
      for (let b = 0; b < 3; b++) {
        const t = G.targetFor(b);
        assert(Number.isFinite(t) && t > 0, `${s.id} ante ${ante} target ${t}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// systems
// ---------------------------------------------------------------------------

test('editions add their bonus on top of the Token that carries them', () => {
  const base = (() => {
    const G = startedRun('ED');
    G.acquireToken('croupier');
    primeSpin(G, { red: 1 });
    return computeSpin(G, G.wheel.findIndex((p) => p.n === 1));
  })();
  const foiled = (() => {
    const G = startedRun('ED');
    G.acquireToken('croupier', { edition: 'foil' });
    primeSpin(G, { red: 1 });
    return computeSpin(G, G.wheel.findIndex((p) => p.n === 1));
  })();
  eq(foiled.chips - base.chips, 50, 'Foil should add 50 chips');
});

test('a Negative Token is free but does not widen the board', () => {
  // The previous version of this test asserted the implementation (that a
  // Negative was excluded from the count) rather than the rule, so it passed
  // while the game handed out one slot too many.
  const G = Game.newRun('NEG');
  const base = G.tokenSlots;
  const normal = { kind: 'token', id: 'sniper', price: 0 };

  for (let i = 0; i < base; i++) G.acquireToken(TOKENS[i].id);
  assert(!G.canBuy(normal), 'the board should be full at ' + base);
  assert(G.canBuy({ kind: 'token', id: 'vig', price: 0, edition: 'negative' }),
    'a Negative should still fit on a full board');

  G.acquireToken('vig', { edition: 'negative' });
  eq(G.tokens.length, base + 1, 'the Negative should be on the board');
  eq(G.maxTokens, base + 1, 'capacity should rise by exactly one');
  eq(G.tokenCount(), base + 1, 'the Negative should be counted, not hidden');
  assert(!G.canBuy(normal), 'a Negative must not open a slot for an ordinary Token');
  eq(G.tokens.filter((t) => t.edition !== 'negative').length, base,
    'still only the base number of ordinary Tokens');

  // and a second Negative is likewise free, not cumulative slack
  G.acquireToken('croupier', { edition: 'negative' });
  eq(G.maxTokens, base + 2, 'second Negative should add exactly one more');
  assert(!G.canBuy(normal), 'two Negatives must still not free an ordinary slot');
});

test('the scoring pitch ladder stays inside the audible band', () => {
  // An unbounded ladder walks past Nyquist on a long reveal and aliases into
  // noise, which is what a very wide board can produce.
  for (const kind of ['chips', 'mult', 'xmult']) {
    let prev = 0;
    for (let step = 0; step < 400; step++) {
      const f = triggerFreq(step, kind);
      assert(isFinite(f) && f > 0, `step ${step} produced ${f}`);
      assert(f < 6000, `step ${step} reached ${f.toFixed(0)}Hz, well past musical`);
      assert(f >= prev - 1e-9, `ladder went down at step ${step}`);
      prev = f;
    }
  }
  assert(triggerFreq(5, 'chips') > triggerFreq(0, 'chips'), 'the ladder should climb at all');
});

test('Eternal Tokens cannot be sold or destroyed', () => {
  const G = Game.newRun('ETERNAL');
  G.acquireToken('croupier', { sticker: 'eternal' });
  assert(!G.canSellToken(0), 'eternal token was sellable');
  G.sellToken(0);
  eq(G.tokens.length, 1, 'eternal token was sold anyway');
  eq(G.destroyToken(G.tokens[0]), false, 'eternal token was destroyed');
});

test('Perishable Tokens die after five rounds', () => {
  const G = Game.newRun('PERISH');
  G.acquireToken('croupier', { sticker: 'perishable' });
  for (let i = 0; i < 5; i++) {
    G.startBlind();
    G.round.score = G.round.target;
    G.winRound();
    G.round = null;
  }
  assert(G.tokens[0].dead, 'perishable token survived five rounds');
  eq(G.liveTokens().length, 0, 'dead token still counted as live');
});

test('nudging moves along the physical wheel and rescores', () => {
  const G = startedRun('NUDGE');
  primeSpin(G, { n17: 1 });
  const idx = G.wheel.findIndex((p) => p.n === 17);
  G.setResult((idx + 3) % G.wheel.length);
  eq(G.round.preview.score, 0, 'should be a miss before nudging');
  G.round.nudgesLeft = 5;
  for (let i = 0; i < 3; i++) G.nudge(-1);
  eq(G.wheel[G.round.pocketIndex].n, 17, 'did not land back on 17');
  assert(G.round.preview.score > 0, 'nudged onto the number but scored nothing');
});

test('a saved run round-trips through JSON', () => {
  const G = startedRun('SAVE');
  G.acquireToken('shark', { edition: 'poly' });
  G.acquireToken('martingale');
  G.omens = [{ id: 'gild' }];
  G.tags = [{ id: 'coupon' }];
  primeSpin(G, { red: 2, n7: 1 });
  G.setResult(G.wheel.findIndex((p) => p.n === 7));

  const json = JSON.parse(JSON.stringify(G.toJSON()));
  assert(json.round.preview === null, 'preview should not be serialised');
  const H = new Game();
  Object.assign(H, json);
  H.rng = G.rng;
  eq(H.tokens.length, 2, 'tokens lost');
  eq(H.tokens[0].edition, 'poly', 'edition lost');
  eq(H.tags.length, 1, 'tags lost');
  eq(H.wheel.length, G.wheel.length, 'wheel lost');
  const ctx = computeSpin(H, H.round.pocketIndex);
  eq(ctx.score, G.round.preview.score, 'rebuilt preview differs');
});

test('the wheel can never be emptied below its floor', () => {
  const G = startedRun('FLOOR');
  for (let i = 0; i < 200; i++) G.removePocket(G.wheel[0].uid);
  assert(G.wheel.length >= 6, `wheel fell to ${G.wheel.length}`);
});

test('pocket enhancements all resolve', () => {
  for (const id of Object.keys(ENHANCEMENTS)) {
    const G = startedRun('ENH-' + id);
    G.wheel[5].enh = id;
    primeSpin(G, { ['n' + G.wheel[5].n]: 2 });
    for (const r of [0.1, 0.5, 0.9]) {
      G.round.rolls = Array(10).fill(r);
      const ctx = computeSpin(G, 5);
      assert(Number.isFinite(ctx.score) && ctx.score > 0, `${id} scored ${ctx.score}`);
    }
  }
});

// ---------------------------------------------------------------------------
// wheel animation maths
// ---------------------------------------------------------------------------

test('a spin always parks the winning pocket under the pointer', () => {
  for (const n of [12, 31, 37, 38, 45, 60]) {
    const seg = 360 / n;
    for (let i = 0; i < n; i++) {
      for (const from of [0, -17.5, -360.4, 123, -5000]) {
        const plan = spinPlan(from, i, n);
        const atTop = mod360(plan.wheelTo + i * seg);
        const off = Math.min(atTop, 360 - atTop);
        assert(off < 1e-9, `n=${n} pocket=${i} from=${from} ended ${off}deg off the pointer`);
      }
    }
  }
});

test('a spin always travels backwards through at least three turns', () => {
  for (const n of [31, 37, 45]) {
    for (let i = 0; i < n; i++) {
      const from = -i * 13.7;
      const plan = spinPlan(from, i, n);
      assert(plan.wheelTo <= from - 360 * 3,
        `n=${n} pocket=${i} only travelled ${(from - plan.wheelTo).toFixed(1)}deg`);
      // and never more than one extra turn beyond that, so it is not a marathon
      assert(plan.wheelTo > from - 360 * 5,
        `n=${n} pocket=${i} travelled ${(from - plan.wheelTo).toFixed(1)}deg, too far`);
    }
  }
});

test('the ball ends on the pointer, having run opposite the wheel', () => {
  const plan = spinPlan(0, 5, 37);
  eq(plan.ballTo, 0, 'ball should finish at 12 o\'clock');
  assert(plan.ballFrom < 0, 'ball should start behind the pointer');
  assert(plan.ballTo > plan.ballFrom, 'ball should travel clockwise');
  assert(plan.wheelTo < plan.wheelFrom, 'wheel should travel anticlockwise');
});

test('the ball starts on the rim and finishes in the pocket ring', () => {
  const track = WHEEL_GEOM.rBallTrack, rest = WHEEL_GEOM.rBallRest;
  eq(ballRadius(0), track, 'radius at rest position 0');
  eq(ballRadius(0.4), track, 'ball should hold the rim while it has speed');
  const end = ballRadius(1);
  assert(Math.abs(end - rest) < 1e-9, `ball settled at ${end}, expected ${rest}`);
  for (let p = 0; p <= 1.0001; p += 0.005) {
    const r = ballRadius(p);
    assert(r <= track + 1e-9 && r >= rest - 1e-9, `radius ${r} out of range at p=${p}`);
  }
});

test('the ball spirals inward without jumping', () => {
  let prev = ballRadius(0);
  for (let p = 0; p <= 1.0001; p += 0.002) {
    const r = ballRadius(p);
    assert(Math.abs(r - prev) < 2.5, `radius jumped ${Math.abs(r - prev).toFixed(2)} at p=${p}`);
    prev = r;
  }
});

test('the fret rattle decays to nothing by the time the ball settles', () => {
  const seg = 360 / 37;
  eq(ballRattle(0.5, seg), 0, 'no rattle before the drop');
  eq(ballRattle(0.81, seg), 0, 'no rattle before the drop');
  assert(Math.abs(ballRattle(1, seg)) < 1e-9, 'rattle must be zero once settled');
  let peak = 0;
  for (let p = 0.82; p <= 1; p += 0.002) peak = Math.max(peak, Math.abs(ballRattle(p, seg)));
  assert(peak > 0.5, 'rattle should actually be visible');
  assert(peak < seg, 'rattle should stay within one pocket');
});

// ---------------------------------------------------------------------------
// full runs
// ---------------------------------------------------------------------------

test('120 full runs complete without throwing', () => {
  for (let i = 0; i < 120; i++) {
    const wheel = WHEELS[i % WHEELS.length].id;
    const stake = STAKES[i % STAKES.length].id;
    const G = Game.newRun('RUN' + i, { wheelId: wheel, stakeId: stake });
    const r = playRun(G);
    assert(r.ante >= 1, 'run ended before ante 1');
  }
});

test('an endless run keeps going past ante 8', () => {
  const G = Game.newRun('ENDLESS');
  G.ante = 8;
  G.blindIndex = 2;
  G.startBlind();
  G.round.score = G.round.target;
  G.winRound();
  G.toShop();
  G.nextBlind();
  eq(G.screen, 'win', 'should have won at ante 8');
  G.goEndless();
  eq(G.ante, 9, 'endless did not advance the ante');
  assert(G.targetFor(0) > 0, 'ante 9 has no target');
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log('\n  FAIL  ' + f);
process.exit(failures.length ? 1 : 0);
