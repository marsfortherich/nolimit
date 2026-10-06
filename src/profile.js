// Meta-progression: what the player has unlocked and how their runs have gone.
// Kept in its own storage key so abandoning a run never costs progress.

export const PROFILE_KEY = 'no-limit-profile-v1';

const EMPTY = {
  version: 1,
  stakesUnlocked: { white: true },
  wheelsUnlocked: { house: true },
  seenTokens: {},        // token id -> true, for a "discovered" collection
  history: [],           // most recent runs first, capped
  totals: { runs: 0, wins: 0, spins: 0, bestScore: 0, bestAnte: 0, moneyEarned: 0 }
};

export const Profile = structuredCloneish(EMPTY);

function structuredCloneish(o) { return JSON.parse(JSON.stringify(o)); }

export function loadProfile() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch (e) { /* no storage */ }
  Object.assign(Profile, structuredCloneish(EMPTY), stored || {});
  // Merge rather than replace, so a save written by an older build keeps its
  // unlocks when new default keys appear.
  Profile.stakesUnlocked = { ...EMPTY.stakesUnlocked, ...(stored?.stakesUnlocked || {}) };
  Profile.wheelsUnlocked = { ...EMPTY.wheelsUnlocked, ...(stored?.wheelsUnlocked || {}) };
  Profile.totals = { ...EMPTY.totals, ...(stored?.totals || {}) };
  return Profile;
}

export function saveProfile() {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(Profile)); } catch (e) { /* no storage */ }
}

export function resetProfile() {
  Object.assign(Profile, structuredCloneish(EMPTY));
  saveProfile();
}

export const stakeUnlocked = (id) => !!Profile.stakesUnlocked[id];
export const wheelUnlocked = (id) => !!Profile.wheelsUnlocked[id];

export function unlockStake(id) {
  if (Profile.stakesUnlocked[id]) return false;
  Profile.stakesUnlocked[id] = true;
  saveProfile();
  return true;
}

export function unlockWheel(id) {
  if (Profile.wheelsUnlocked[id]) return false;
  Profile.wheelsUnlocked[id] = true;
  saveProfile();
  return true;
}

export function discoverToken(id) {
  if (Profile.seenTokens[id]) return;
  Profile.seenTokens[id] = true;
  saveProfile();
}

/** Called once when a run ends, win or lose. Returns anything newly unlocked. */
export function recordRun(summary) {
  const t = Profile.totals;
  t.runs++;
  if (summary.won) t.wins++;
  t.spins += summary.spins || 0;
  t.bestScore = Math.max(t.bestScore, summary.bestScore || 0);
  t.bestAnte = Math.max(t.bestAnte, summary.ante || 0);
  t.moneyEarned += summary.money || 0;

  Profile.history.unshift({
    at: Date.now(),
    seed: summary.seed,
    wheel: summary.wheel,
    stake: summary.stake,
    ante: summary.ante,
    won: !!summary.won,
    bestScore: summary.bestScore || 0,
    tokens: summary.tokens || []
  });
  Profile.history.length = Math.min(Profile.history.length, 30);
  saveProfile();
}

/**
 * An endless run ending. It was counted once already, when it was won, so this
 * raises the bests and adds only what the endless antes added — never a second
 * run, win or history row. `already` is the spins and money the first count
 * took; without it (an endless run saved before this existed) nothing is added
 * rather than everything twice.
 */
export function extendRun(summary, already) {
  const t = Profile.totals;
  const base = already || { spins: summary.spins || 0, money: summary.money || 0 };
  t.spins += Math.max(0, (summary.spins || 0) - base.spins);
  t.moneyEarned += Math.max(0, (summary.money || 0) - base.money);
  t.bestScore = Math.max(t.bestScore, summary.bestScore || 0);
  t.bestAnte = Math.max(t.bestAnte, summary.ante || 0);

  const row = Profile.history.find((r) => r.seed === summary.seed && r.won);
  if (row) {
    row.ante = summary.ante;
    row.bestScore = Math.max(row.bestScore || 0, summary.bestScore || 0);
    row.tokens = summary.tokens || [];
  }
  saveProfile();
}

/** A stable seed for the calendar day, so "daily run" means the same to everyone. */
export function dailySeed(date = new Date()) {
  // UTC, not the player's own calendar: a local date gave players in
  // different time zones different "daily" runs for part of every day.
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `DAILY-${y}${m}${d}`;
}
