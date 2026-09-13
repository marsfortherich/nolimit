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

export const Settings = { ...DEFAULTS };

export function loadSettings() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { /* no storage */ }
  Object.assign(Settings, DEFAULTS, stored);
  /* Reduced motion is off unless the player asks for it here.
     It used to default to the OS `prefers-reduced-motion` setting, which is
     the textbook behaviour but wrong for this game: the wheel spin is not
     decoration, it is how a result is delivered, and switching it off by
     default left players watching a wheel that never moved. The toggle is
     one click away in Options for anyone who wants it. */
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
