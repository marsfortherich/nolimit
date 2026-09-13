// User preferences. Persisted separately from any run so they survive an
// abandoned run, and read synchronously by the audio and effects layers.

const SETTINGS_KEY = 'no-limit-settings-v1';

const DEFAULTS = {
  volume: 0.6,
  sfx: true,
  music: false,       // reserved: there is no soundtrack yet, see ROADMAP P5
  speed: 1,           // 0.5 = languid, 1 = normal, 2 = brisk, 4 = instant
  reducedMotion: false,
  shake: true,
  colourblind: false
};

function detectReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (e) { return false; }
}

export const Settings = { ...DEFAULTS };

export function loadSettings() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { /* no storage */ }
  Object.assign(Settings, DEFAULTS, stored);
  // Honour the OS preference unless the player has said otherwise here.
  if (stored.reducedMotion === undefined && detectReducedMotion()) Settings.reducedMotion = true;
  applyBodyFlags();
  return Settings;
}

export function setSetting(key, value) {
  Settings[key] = value;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(Settings)); } catch (e) { /* no storage */ }
  applyBodyFlags();
}

function applyBodyFlags() {
  const b = document.body;
  if (!b) return;
  b.classList.toggle('cb', !!Settings.colourblind);
  b.classList.toggle('no-motion', !!Settings.reducedMotion);
}

/** Animation durations run through here so one slider retimes the whole game. */
export function ms(base) {
  if (Settings.reducedMotion) return 0;
  return Math.round(base / (Settings.speed || 1));
}
