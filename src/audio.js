// Every sound in the game is synthesised at runtime. No audio files means the
// bundled index.html stays a single self-contained document.
//
// Browsers refuse to start an AudioContext before a user gesture, so the
// context is created lazily on the first interaction and everything before that
// is silently dropped.
//
// Signal path:  voices -> (spin bus) -> master -> limiter -> destination
// The limiter exists so that stacking sounds can never clip, and the spin bus
// exists so the ball rattle can be cut short when a spin is skipped.

import { Settings } from './settings.js';

let auCtx = null;
let auMaster = null;
let auLimiter = null;
let auSpinBus = null;
let auNoiseBuf = null;
let auBroken = false;

// Each voice is 2-3 nodes. Past this many at once the audio thread starts to
// struggle on modest hardware and the result is crackle, so new voices are
// dropped instead. Sized from measurement: heavy play peaks around 24, and a
// scheduled-but-not-yet-sounding burst holds its slot for the whole delay, so
// the ceiling sits above the observed peak to avoid swallowing scoring blips.
const MAX_VOICES = 40;
let auVoices = 0;
let auDropped = 0;

export function initAudio() {
  if (auCtx || auBroken) return auCtx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { auBroken = true; return null; }
    auCtx = new AC();

    auLimiter = auCtx.createDynamicsCompressor();
    auLimiter.threshold.value = -3;
    auLimiter.knee.value = 0;
    auLimiter.ratio.value = 20;
    auLimiter.attack.value = 0.002;
    auLimiter.release.value = 0.18;
    auLimiter.connect(auCtx.destination);

    auMaster = auCtx.createGain();
    auMaster.gain.value = 0.9;
    auMaster.connect(auLimiter);

    auSpinBus = auCtx.createGain();
    auSpinBus.gain.value = 1;
    auSpinBus.connect(auMaster);

    // Two seconds of white noise. Bursts read from a random offset into this,
    // so repeated percussive sounds are never the same waveform twice — playing
    // the identical slice over and over turns a rattle into a pitched buzz.
    const len = auCtx.sampleRate * 2;
    auNoiseBuf = auCtx.createBuffer(1, len, auCtx.sampleRate);
    const d = auNoiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) {
    auBroken = true;
  }
  return auCtx;
}

/** Safe to call from any interaction; browsers suspend contexts on their own. */
export function resumeAudio() {
  initAudio();
  if (auCtx && auCtx.state === 'suspended') auCtx.resume().catch(() => {});
}

const auOn = () => auCtx && !auBroken && Settings.sfx && Settings.volume > 0;
const auVol = (g) => g * Settings.volume;
const auNow = () => auCtx.currentTime;

/**
 * Count a voice and tear it down when it finishes. Returns false if the mixer
 * is already full, in which case the caller should not build the nodes at all.
 */
function auTrack(source, gainNode, seconds) {
  auVoices++;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    auVoices--;
    try { gainNode.disconnect(); } catch (e) { /* already torn down */ }
  };
  source.onended = release;
  // onended does not always fire (a suspended context, a dropped tab), so a
  // timer guarantees the voice is eventually given back.
  setTimeout(release, Math.max(80, seconds * 1000 + 400));
}

function auTone({ freq, to, type = 'triangle', dur = 0.12, gain = 0.2, delay = 0, attack = 0.005, bus = null }) {
  if (!auOn()) return;
  if (auVoices >= MAX_VOICES) { auDropped++; return; }
  if (!isFinite(freq) || freq <= 0) return;
  const t0 = auNow() + delay;
  const osc = auCtx.createOscillator();
  const g = auCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to && to !== freq && isFinite(to)) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, auVol(gain)), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(bus || auMaster);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  auTrack(osc, g, delay + dur);
}

function auNoise({ dur = 0.1, freq = 1200, q = 1, gain = 0.2, delay = 0, to = null, type = 'bandpass', bus = null }) {
  if (!auOn()) return;
  if (auVoices >= MAX_VOICES) { auDropped++; return; }
  const t0 = auNow() + delay;
  const src = auCtx.createBufferSource();
  src.buffer = auNoiseBuf;
  src.loop = true;
  const f = auCtx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  if (to) f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
  f.Q.value = q;
  const g = auCtx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, auVol(gain)), t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(bus || auMaster);
  // A random read offset keeps repeated bursts from being the same waveform.
  src.start(t0, Math.random() * (auNoiseBuf.duration - dur - 0.05));
  src.stop(t0 + dur + 0.02);
  auTrack(src, g, delay + dur);
}

// ---------------------------------------------------------------------------
// the kit
// ---------------------------------------------------------------------------

let auStep = 0;
/** Reset the rising-pitch ladder used while a score is being tallied. */
export function resetPitch() { auStep = 0; }

const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
const MAX_EXTRA_SEMIS = 12;

/**
 * Pitch for the nth scoring trigger. The ladder climbs the scale and then
 * stops climbing: an unbounded one walks straight past the top of hearing and
 * aliases into noise on a long reveal.
 */
export function triggerFreq(step, kind) {
  const base = (kind === 'mult' || kind === 'xmult') ? 330 : 262;
  const i = Math.min(Math.max(0, step), MAJOR.length - 1);
  const extra = Math.min(Math.max(0, step - (MAJOR.length - 1)), MAX_EXTRA_SEMIS);
  return base * Math.pow(2, (MAJOR[i] + extra) / 12);
}

export const Sfx = {
  ui:      () => auTone({ freq: 520, type: 'square', dur: 0.04, gain: 0.06 }),
  chip:    () => { auTone({ freq: 900, to: 700, type: 'triangle', dur: 0.06, gain: 0.13 }); auNoise({ dur: 0.05, freq: 2600, q: 2, gain: 0.07 }); },
  unchip:  () => auTone({ freq: 420, to: 300, type: 'triangle', dur: 0.06, gain: 0.1 }),
  deny:    () => auTone({ freq: 180, to: 120, type: 'sawtooth', dur: 0.14, gain: 0.09 }),

  // The ball: a band of noise sweeping down as it loses speed, with the rattle
  // of pockets going past. Routed through its own bus so a skipped spin can
  // cut it rather than leaving the ball rattling after it has landed.
  spin: (seconds = 2.2) => {
    if (!auOn()) return;
    auSpinBus.gain.cancelScheduledValues(auNow());
    auSpinBus.gain.setValueAtTime(1, auNow());
    auNoise({ dur: seconds, freq: 2400, to: 380, q: 6, gain: 0.13, bus: auSpinBus });
    // Scale the rattle with the spin, and keep it well inside the voice budget.
    const ticks = Math.max(5, Math.min(14, Math.round(seconds * 6)));
    for (let i = 0; i < ticks; i++) {
      const p = i / ticks;
      auNoise({
        dur: 0.022, freq: 3000 - 1200 * p, q: 8, gain: 0.05, bus: auSpinBus,
        delay: seconds * (p * p * 0.85 + p * 0.15)
      });
    }
  },
  /** Cut the ball rattle: the spin ended early. */
  stopSpin: () => {
    if (!auCtx || !auSpinBus) return;
    const t = auNow();
    auSpinBus.gain.cancelScheduledValues(t);
    auSpinBus.gain.setValueAtTime(auSpinBus.gain.value, t);
    auSpinBus.gain.linearRampToValueAtTime(0.0001, t + 0.06);
  },

  land: () => {
    auTone({ freq: 260, to: 90, type: 'sine', dur: 0.22, gain: 0.28 });
    auNoise({ dur: 0.09, freq: 900, q: 1, gain: 0.14 });
  },
  nudge: () => { auTone({ freq: 700, to: 980, type: 'square', dur: 0.05, gain: 0.1 }); auNoise({ dur: 0.04, freq: 3200, q: 3, gain: 0.06 }); },

  /** One scoring trigger. Each successive call climbs the scale, as in Balatro. */
  trigger: (kind) => {
    const freq = triggerFreq(auStep, kind);
    auStep++;
    auTone({ freq, type: kind === 'xmult' ? 'sawtooth' : 'triangle', dur: kind === 'xmult' ? 0.2 : 0.11, gain: kind === 'xmult' ? 0.16 : 0.12 });
    if (kind === 'xmult') auTone({ freq: freq * 1.5, type: 'triangle', dur: 0.18, gain: 0.07, delay: 0.03 });
  },
  tick: () => auTone({ freq: 1500, type: 'square', dur: 0.015, gain: 0.03 }),

  slam: (power = 1) => {
    auTone({ freq: 150 * (1 + power * 0.3), to: 50, type: 'sine', dur: 0.4, gain: 0.32 });
    auNoise({ dur: 0.25, freq: 700, to: 120, q: 1, gain: 0.16 });
  },
  coin:  () => { auTone({ freq: 1180, type: 'square', dur: 0.05, gain: 0.09 }); auTone({ freq: 1760, type: 'square', dur: 0.08, gain: 0.08, delay: 0.05 }); },
  buy:   () => { Sfx.coin(); auNoise({ dur: 0.07, freq: 2000, q: 2, gain: 0.07 }); },
  pack:  () => { auNoise({ dur: 0.3, freq: 500, to: 3000, q: 0.7, gain: 0.16 }); auTone({ freq: 400, to: 900, type: 'triangle', dur: 0.25, gain: 0.1 }); },

  win: () => [0, 4, 7, 12].forEach((s, i) =>
    auTone({ freq: 392 * Math.pow(2, s / 12), type: 'triangle', dur: 0.5, gain: 0.16, delay: i * 0.075 })),
  lose: () => [0, -3, -7, -12].forEach((s, i) =>
    auTone({ freq: 330 * Math.pow(2, s / 12), type: 'sawtooth', dur: 0.6, gain: 0.13, delay: i * 0.12 })),
  boss: () => {
    auTone({ freq: 110, to: 82, type: 'sawtooth', dur: 1.1, gain: 0.14 });
    auTone({ freq: 111.5, to: 83, type: 'sawtooth', dur: 1.1, gain: 0.12, delay: 0.02 });
    auNoise({ dur: 1.0, freq: 220, to: 90, q: 2, gain: 0.08 });
  },
  unlock: () => [0, 7, 12, 16, 19].forEach((s, i) =>
    auTone({ freq: 523 * Math.pow(2, s / 12), type: 'triangle', dur: 0.4, gain: 0.12, delay: i * 0.06 }))
};

/** Diagnostics, used by the test page and worth keeping honest. */
export const audioStats = () => ({ voices: auVoices, peakMax: MAX_VOICES, dropped: auDropped, state: auCtx && auCtx.state });
