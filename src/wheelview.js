// The wheel, as a live object rather than a picture.
//
// This owns one persistent <svg> and drives it from a requestAnimationFrame
// loop. `ui.render()` rebuilds the rest of the screen on every state change,
// which would destroy an animation in flight, so the element is cached and only
// rebuilt when the wheel's *shape* changes — a pocket excised, echoed,
// recoloured or enhanced.
//
// The geometry convention: angle 0 is 12 o'clock, positive is clockwise, and a
// spin finishes with the winning pocket under the pointer at the top. The ball
// travels the opposite way to the wheel, as a real one does.

import { ENHANCEMENTS } from './data.js';
import { Settings, ms } from './settings.js';

export const WHEEL_GEOM = {
  cx: 100, cy: 100,
  rHub: 50,        // inner edge of the pocket ring
  rRim: 92,        // outer edge of the pocket ring
  rBallTrack: 87,  // where the ball rides while it still has speed
  rBallRest: 71    // where it sits once it drops into a pocket
};

const IDLE_DEG_PER_SEC = -7;   // the croupier never quite stops the wheel

export const mod360 = (a) => ((a % 360) + 360) % 360;
const wvLerp = (a, b, t) => a + (b - a) * t;
const wvSmooth = (t) => t * t * (3 - 2 * t);
const wvClamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// ---------------------------------------------------------------------------
// pure motion maths — unit tested in test/run.mjs
// ---------------------------------------------------------------------------

/**
 * Where the wheel and ball must start and end for `pocketIndex` to finish under
 * the pointer. The wheel always travels backwards (anticlockwise) through at
 * least `wheelTurns` so it never visibly rewinds between spins.
 */
export function spinPlan(fromWheel, pocketIndex, pocketCount, opts = {}) {
  const seg = 360 / pocketCount;
  const wheelTurns = opts.wheelTurns === undefined ? 3 : opts.wheelTurns;
  const ballTurns = opts.ballTurns === undefined ? 5 : opts.ballTurns;

  let wheelTo = -pocketIndex * seg;
  while (wheelTo > fromWheel - 360 * wheelTurns) wheelTo -= 360;

  return {
    seg,
    wheelFrom: fromWheel,
    wheelTo,
    // The ball runs clockwise: it starts behind and sweeps forward to the top.
    ballFrom: -360 * ballTurns,
    ballTo: 0
  };
}

/** Ball distance from the hub over the course of a spin, 0..1. */
export function ballRadius(p, track = WHEEL_GEOM.rBallTrack, rest = WHEEL_GEOM.rBallRest) {
  if (p <= 0.5) return track;
  if (p < 0.82) return wvLerp(track, rest, wvSmooth((p - 0.5) / 0.32));
  // Dropping in: a few decaying bounces off the frets.
  const q = (p - 0.82) / 0.18;
  const decay = Math.max(0, 1 - q);
  return rest + Math.abs(Math.sin(q * Math.PI * 3)) * 6 * decay * decay;
}

/** Sideways rattle as the ball is captured, in degrees. Zero once settled. */
export function ballRattle(p, seg) {
  if (p < 0.82) return 0;
  const q = (p - 0.82) / 0.18;
  const decay = Math.max(0, 1 - q);
  return Math.sin(q * Math.PI * 5) * seg * 0.5 * decay * decay;
}

const wvEaseWheel = (p) => 1 - Math.pow(1 - p, 3);
const wvEaseBall = (p) => 1 - Math.pow(1 - p, 2.1);

// ---------------------------------------------------------------------------
// live state
// ---------------------------------------------------------------------------

let wvSvg = null;
let wvRotor = null;
let wvBall = null;
let wvSig = '';
let wvCount = 37;
let wvPocket = 0;
let wvWheelAngle = 0;
let wvBallAngle = 0;
let wvBallR = WHEEL_GEOM.rBallRest;
let wvAnim = null;      // { kind, t0, dur, plan, resolve, guard }
let wvRaf = 0;
let wvLast = 0;
let wvIdle = false;
let wvArmed = false;    // a spin is about to start; do not snap the ball

export const wheelIsBusy = () => !!wvAnim;

/** Called just before the engine resolves a spin, so the mount does not snap. */
export function wheelArm() { wvArmed = true; }
export function wheelDisarm() { wvArmed = false; }

function svgEl(tag, attrs, ...kids) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined) el.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

const wvSignature = (wheel) =>
  wheel.length + '|' + wheel.map((p) => `${p.n}${p.colour[0]}${p.enh || ''}`).join(',');

function wvBuild(wheel) {
  const n = wheel.length;
  const seg = 360 / n;
  const { cx, cy, rHub, rRim } = WHEEL_GEOM;
  const rotor = [];

  for (let i = 0; i < n; i++) {
    const p = wheel[i];
    const a0 = (i * seg - seg / 2 - 90) * Math.PI / 180;
    const a1 = (i * seg + seg / 2 - 90) * Math.PI / 180;
    const pt = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
    const d = `M ${pt(rHub, a0)} L ${pt(rRim, a0)} A ${rRim} ${rRim} 0 0 1 ${pt(rRim, a1)} L ${pt(rHub, a1)} A ${rHub} ${rHub} 0 0 0 ${pt(rHub, a0)} Z`;
    const fill = p.colour === 'red' ? 'var(--red)' : p.colour === 'green' ? 'var(--green)' : '#23262c';
    rotor.push(svgEl('path', { d, fill, stroke: '#0b0d10', 'stroke-width': '.6' }));

    const am = (i * seg - 90) * Math.PI / 180;
    const tx = cx + 71 * Math.cos(am), ty = cy + 71 * Math.sin(am);
    rotor.push(svgEl('text', {
      x: tx.toFixed(2), y: ty.toFixed(2), fill: '#f0ece0',
      'font-size': n > 44 ? '6' : '8', 'text-anchor': 'middle', 'dominant-baseline': 'central',
      transform: `rotate(${i * seg} ${tx.toFixed(2)} ${ty.toFixed(2)})`
    }, String(p.n)));

    if (p.enh) {
      rotor.push(svgEl('text', {
        x: (cx + 57 * Math.cos(am)).toFixed(2), y: (cy + 57 * Math.sin(am)).toFixed(2),
        fill: '#f0d089', 'font-size': '7', 'text-anchor': 'middle', 'dominant-baseline': 'central'
      }, ENHANCEMENTS[p.enh].glyph));
    }
  }

  wvRotor = svgEl('g', { id: 'wheelRotor' }, ...rotor);
  wvBall = svgEl('g', { class: 'wheel-ball' },
    svgEl('circle', { r: 5.4, fill: '#fffaf0', stroke: '#8a6f26', 'stroke-width': '.8' }),
    svgEl('circle', { cx: -1.6, cy: -1.8, r: 1.7, fill: '#ffffff', opacity: '.85' }));

  wvSvg = svgEl('svg', { viewBox: '0 0 200 200', class: 'wheel-svg' },
    svgEl('circle', { cx, cy, r: 96, fill: '#1a1d22', stroke: '#b8973f', 'stroke-width': '3' }),
    wvRotor,
    // the track the ball rides before it drops
    svgEl('circle', { cx, cy, r: WHEEL_GEOM.rBallTrack, fill: 'none', stroke: 'rgba(255,255,255,.07)', 'stroke-width': '3.5' }),
    svgEl('circle', { cx, cy, r: 46, fill: '#12332a', stroke: '#b8973f', 'stroke-width': '2' }),
    svgEl('circle', { cx, cy, r: 20, fill: '#0d1015', stroke: '#8a6f26', 'stroke-width': '1.5' }),
    svgEl('path', { d: 'M 100 2 L 106 16 L 94 16 Z', fill: '#f0d089' }),
    wvBall);
  return wvSvg;
}

function wvApply() {
  if (!wvRotor) return;
  wvRotor.style.transform = `rotate(${wvWheelAngle.toFixed(2)}deg)`;
  const a = (wvBallAngle - 90) * Math.PI / 180;
  const x = WHEEL_GEOM.cx + wvBallR * Math.cos(a);
  const y = WHEEL_GEOM.cy + wvBallR * Math.sin(a);
  wvBall.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
}

function wvStart() {
  // Must not touch wvLast: the loop reschedules itself through here every
  // frame, and resetting the timestamp would leave dt permanently at zero.
  if (!wvRaf && typeof requestAnimationFrame === 'function') {
    wvRaf = requestAnimationFrame(wvTick);
  }
}

function wvStop() {
  if (wvRaf) cancelAnimationFrame(wvRaf);
  wvRaf = 0;
  wvLast = 0;   // a cold restart should not see the whole pause as one frame
}

function wvFinishAnim() {
  const a = wvAnim;
  wvAnim = null;
  if (!a) return;
  clearTimeout(a.guard);
  wvWheelAngle = a.plan.wheelTo;
  wvBallAngle = a.plan.ballTo;
  wvBallR = WHEEL_GEOM.rBallRest;
  wvApply();
  if (a.resolve) a.resolve();
}

function wvTick(now) {
  wvRaf = 0;
  if (!wvSvg || !wvSvg.isConnected) return;   // detached; mountWheel restarts us
  const dt = wvLast ? Math.min(0.05, (now - wvLast) / 1000) : 0;
  wvLast = now;

  if (wvAnim) {
    const a = wvAnim;
    const p = wvClamp01((now - a.t0) / a.dur);
    if (a.kind === 'spin') {
      wvWheelAngle = wvLerp(a.plan.wheelFrom, a.plan.wheelTo, wvEaseWheel(p));
      wvBallAngle = wvLerp(a.plan.ballFrom, a.plan.ballTo, wvEaseBall(p)) + ballRattle(p, a.plan.seg);
      wvBallR = ballRadius(p);
    } else {
      // A nudge: the ball lifts, the wheel turns one pocket beneath it, the
      // ball drops back onto the pointer.
      const e = wvSmooth(p);
      wvWheelAngle = wvLerp(a.plan.wheelFrom, a.plan.wheelTo, e);
      wvBallAngle = -a.dir * Math.sin(p * Math.PI) * a.plan.seg * 0.45;
      wvBallR = WHEEL_GEOM.rBallRest + Math.sin(p * Math.PI) * 9;
    }
    wvApply();
    if (p >= 1) { wvFinishAnim(); wvStart(); return; }
    wvStart();
    return;
  }

  if (wvIdle && !Settings.reducedMotion) {
    wvWheelAngle += IDLE_DEG_PER_SEC * dt;
    wvBallAngle = wvWheelAngle + wvPocket * (360 / wvCount);
    wvApply();
    wvStart();
    return;
  }

  // nothing to animate; the loop idles until something asks for it again
}

// ---------------------------------------------------------------------------
// public surface
// ---------------------------------------------------------------------------

/**
 * Returns the persistent <svg>, building it only when the wheel's shape has
 * changed. `restIndex` is where the ball belongs when nothing is animating.
 */
export function mountWheel(wheel, opts = {}) {
  const sig = wvSignature(wheel);
  if (sig !== wvSig) {
    wvSig = sig;
    wvBuild(wheel);
  }
  wvCount = wheel.length;
  wvIdle = !!opts.idle;

  if (!wvAnim && !wvArmed && opts.restIndex !== null && opts.restIndex !== undefined) {
    if (opts.restIndex !== wvPocket) wheelSettle(opts.restIndex, wheel.length);
  }
  if (wvPocket >= wvCount) wvPocket = 0;

  wvApply();
  wvStart();
  return wvSvg;
}

/** Snap straight to the finished position, with no animation. */
export function wheelSettle(pocketIndex, pocketCount) {
  wvCount = pocketCount || wvCount;
  wvPocket = pocketIndex;
  wvWheelAngle = -pocketIndex * (360 / wvCount);
  wvBallAngle = 0;
  wvBallR = WHEEL_GEOM.rBallRest;
  wvArmed = false;
  if (wvAnim) { const a = wvAnim; wvAnim = null; clearTimeout(a.guard); if (a.resolve) a.resolve(); }
  wvApply();
}

/** Duration a full spin will take, so the caller can match the sound to it. */
export const spinDuration = () => ms(2600);

export function wheelSpinTo(pocketIndex, pocketCount) {
  wvArmed = false;
  wvIdle = false;
  wvCount = pocketCount;
  wvPocket = pocketIndex;
  const dur = spinDuration();
  if (!dur) { wheelSettle(pocketIndex, pocketCount); return Promise.resolve(); }

  const plan = spinPlan(wvWheelAngle, pocketIndex, pocketCount);
  return new Promise((resolve) => {
    wvAnim = { kind: 'spin', t0: performance.now(), dur, plan, resolve, guard: 0 };
    // A backgrounded tab stops firing rAF, which would leave this promise —
    // and the score reveal waiting on it — hanging forever.
    wvAnim.guard = setTimeout(() => { if (wvAnim) wvFinishAnim(); }, dur + 1500);
    wvStart();
  });
}

export function wheelHopTo(pocketIndex, pocketCount) {
  wvArmed = false;
  wvIdle = false;
  wvCount = pocketCount;
  const prev = wvPocket;
  wvPocket = pocketIndex;
  const dur = ms(380);
  if (!dur) { wheelSettle(pocketIndex, pocketCount); return Promise.resolve(); }

  const seg = 360 / pocketCount;
  // Take the short way round so a one-pocket nudge is not a full revolution.
  let to = -pocketIndex * seg;
  while (to - wvWheelAngle > 180) to -= 360;
  while (to - wvWheelAngle < -180) to += 360;

  const plan = { seg, wheelFrom: wvWheelAngle, wheelTo: to, ballFrom: wvBallAngle, ballTo: 0 };
  const dir = Math.sign(to - wvWheelAngle) || (pocketIndex > prev ? 1 : -1) || 1;
  return new Promise((resolve) => {
    wvAnim = { kind: 'hop', t0: performance.now(), dur, plan, dir, resolve, guard: 0 };
    wvAnim.guard = setTimeout(() => { if (wvAnim) wvFinishAnim(); }, dur + 1200);
    wvStart();
  });
}

/** Land the ball right now. Returns true if it actually interrupted something. */
export function wheelFinishNow() {
  if (!wvAnim) return false;
  wvFinishAnim();
  return true;
}

export function wheelReset() {
  wvStop();
  if (wvAnim) { const a = wvAnim; wvAnim = null; clearTimeout(a.guard); if (a.resolve) a.resolve(); }
  wvSig = '';
  wvSvg = wvRotor = wvBall = null;
  wvWheelAngle = 0; wvBallAngle = 0; wvBallR = WHEEL_GEOM.rBallRest;
  wvPocket = 0; wvIdle = false; wvArmed = false;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) wvStop();
    else wvStart();
  });
}
