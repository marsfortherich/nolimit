# No Limit — a roulette roguelike

A browser roguelite built on the bones of European roulette, with Balatro's run
structure: beat escalating score targets, and between rounds buy the passive
engine that lets you beat the next one.

No build step to play, no dependencies, no asset files. One HTML document.

## Running it

**Double-click `index.html`.** One self-contained file — you can move or copy it
anywhere on its own and it still works. Every sound is synthesised at runtime,
so there is nothing else to ship alongside it.

It saves to `localStorage`. Safari blocks that for local files, in which case
the game plays normally but forgets your run and unlocks between sessions.

## Putting it on GitHub Pages

`deploy/` holds everything the site needs: the bundled game, a `404.html`, and
a `.nojekyll` marker. Because the page has no relative asset paths, it works
unchanged at a domain root, in a `/repo/` subpath, or off the filesystem.

Push the repo, then in **Settings → Pages** set **Source** to **GitHub Actions**.
The included workflow runs the tests, rebuilds the bundle and publishes
`deploy/` on every push to `main` or `master`.

```bash
git init -b main
git add .
git commit -m "No Limit — a roulette roguelike"
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

The site lands at `https://<you>.github.io/<repo>/`. The first deploy takes a
minute or two; watch it under the repo's **Actions** tab.

### Why a workflow, and the alternative

GitHub's branch-based Pages deploy can only serve the repository **root** or
**`/docs`** — a folder called `deploy` is not one of the choices, which is what
the workflow is for.

If you would rather not use Actions, `index.html` at the repo root is the same
file, so **Settings → Pages → Deploy from a branch → `main` / `(root)`** serves
the game with no workflow at all. Renaming `deploy/` to `docs/` (and the `path:`
in the workflow) is the third option.

Either way `index.html` and `deploy/index.html` are build artifacts that are
committed on purpose — it keeps the repo double-clickable and lets a plain
branch deploy work with no build step. Run `python build.py` after changing
anything in `src/` or `styles.css`; CI warns if you forget.

## The loop

You play **8 antes**. Each is three tables — Small, Big, and a **Boss Table**
that breaks one of the rules — and each is a score target to reach within a
fixed number of spins.

Each round you get **spins** (4), **chips to place** (6) and **Nudges** (3).

1. Click spots on the felt to place chips. Right-click takes one back.
   Stacking chips on one spot multiplies that bet's Chips contribution.
2. **Spin.** The wheel turns, the ball runs the other way around the rim,
   spirals in, rattles between the frets and drops into a pocket. Only then do
   you see the result and the score it *would* pay.
3. **Nudge** (optional) moves the ball one pocket clockwise or anticlockwise
   along the *physical wheel* — not the table layout. A miss by one pocket on
   the felt is often nowhere near on the wheel, and vice versa.
4. **Collect** banks the score and burns a spin.

Clear the target and you cash out — table reward, $1 per unused spin, and
interest of $1 per $5 held — then visit the shop.

You may **skip** a Small or Big table to take a **Tag** instead: a free pack, a
guaranteed Rare, free rerolls, an edition on the next Token. Skipping is a real
strategic line, not a consolation prize.

### Scoring

Score is **Chips × Mult**. Every winning bet contributes both:

| Bet | Covers | Chips (per chip wagered) | Mult |
|---|---|---|---|
| Straight up | 1 number | 150 | +4 |
| Street | 3 | 85 | +2 |
| Line | 6 | 44 | +2 |
| Dozen / Column | 12 | 32 | +1 |
| Even-money (red/black, odd/even, 1-18/19-36) | 18 | 22 | +1 |

Mult starts at 1 and every winning bet adds to it, so spreading chips across
several spots buys Mult while stacking them on one spot buys Chips. The
families are tuned to near-identical expected value per spin — what differs is
variance, and which Tokens they turn on.

If nothing wins, the spin scores zero no matter what you own.

## What you collect

**Tokens** (86) are the passive engine. They score left to right and the order
matters: `Mirror Ball` copies the Token to its right, `Understudy` copies the
one to its left, `Encore` retriggers your leftmost, and `Obsidian Ball` squares
your Chips after everything else has run. Drag to reorder, right-click to sell.

**Editions** sit on top of a Token — Foil (+50 Chips), Holographic (+12 Mult),
Polychrome (×1.5 Mult), Negative (costs no Token slot).

**Omens** (22) are single-use. Most permanently modify the wheel: enhance a
pocket, **Excise** one out of the wheel forever, or **Echo** one to add a second
copy and double how often it lands. A 30-pocket wheel with three copies of 17 in
it is a very different game from the one you started with.

**Booster packs** offer a choice of 1-of-3 up to 2-of-5 — Tokens, Omens, pocket
enhancements, or **Fates**, which act on the whole wheel at once (scramble it,
tear five pockets out, turn every pocket one colour).

**Charters** (16) are permanent run upgrades, offered after each Boss Table.

**Boss Tables** (22) each disable something: red results score no Chips, outside
bets are dead, your leftmost Token is switched off, the result stays hidden
until you Collect. You can see which boss is coming from the table-select
screen, so you can shop for it.

## Between runs

**Stakes** — 8 difficulty tiers, each adding a rule on top of the last (Small
Tables stop paying, targets scale faster, shops start stocking Eternal /
Perishable / Rented Tokens). Win to unlock the next.

**Wheels** — 8 starting variants that change a run's opening shape: a trimmed
31-pocket wheel that costs you a spin, an American wheel with two zeros and an
extra Token slot, a wheel that starts already gilded but leaves you broke.
Unlocked by how far you get.

**Records** track unlocks, run history, lifetime stats and Token discovery,
stored separately from the in-progress run so abandoning a run costs no
progress. There is a **Daily** seed fixed to the calendar date.

## Keys

`Space` spin / collect · `←` `→` nudge · `Esc` clear bets · `R` reroll the shop

Pressing Collect while the ball is still running lands it immediately; pressing
again skips the score tally. Runs are seeded and deterministic; the seed is at
the bottom of the sidebar.

Options cover volume, animation speed, reduced motion, screen shake and a
colourblind palette that turns red into blue rather than another shade of red.

## Layout

```
index.html      the game — generated, self-contained, double-clickable
deploy/         what GitHub Pages publishes (index.html, 404.html, .nojekyll)
dev.html        same page, but loading src/*.js as ES modules
build.py        inlines styles.css + src/*.js into index.html and deploy/
serve.py        static dev server (no-cache, so edits show on refresh)
styles.css
test/run.mjs    headless test suite
.github/workflows/pages.yml   test, rebuild and publish deploy/ on push
src/
  rng.js        seeded PRNG
  data.js       wheel order, betting layout, payout table, ante targets
  settings.js   user preferences
  profile.js    unlocks, run history, lifetime stats
  editions.js   Token editions
  stakes.js     difficulty tiers and stickers
  wheels.js     starting wheel variants
  tokens.js     Token definitions and their scoring hooks
  omens.js      consumables
  charters.js   permanent upgrades
  bosses.js     Boss Table modifiers
  tags.js       skip rewards
  packs.js      booster packs and Fates
  audio.js      synthesised sound effects
  fx.js         floating numbers, flashes, shake, counters
  wheelview.js  the wheel and ball, animated on a rAF loop
  engine.js     game state, the scoring pipeline, run flow
  ui.js         all rendering
  main.js       bootstrap
```

`engine.js` never touches the DOM and `ui.js` only mutates state through `Game`
methods, so the whole game is drivable headlessly — which is how it is tested
and balanced.

### Editing it

`index.html` is a build artifact. Edit `styles.css` and `src/*.js`, then:

```bash
python build.py
```

To iterate without rebuilding, run `python serve.py` and open
<http://localhost:8123/dev.html>, which loads the modules directly. (Modules
need HTTP — browsers refuse to load them from a `file://` path, which is the
whole reason `build.py` exists.)

The bundle shares one scope, so `build.py` refuses to build if two modules
declare the same top-level name rather than letting one silently shadow the
other.

### Tests

```bash
node test/run.mjs
```

22 tests, no dependencies. Alongside the scoring invariants they walk every
Token, Omen, Boss, Tag, pack, Fate, wheel and stake, and play 120 complete runs
across every wheel/stake pairing. With this much content a hand-played smoke
test cannot cover it.

## Balance notes

Tuned against the bot in the test suite. A bot that plays a fixed spread, buys
whatever it can afford, and never uses Omens or picks synergies wins **~5.5%**
of runs on White Stake, with deaths spread fairly evenly across antes 2-6 — and
0-2% on the higher stakes, so the ladder bites. Playing greedily beats hoarding
(a thrifty variant of the same bot wins less), which is the intended shape.

The scorer is cross-checked against a brute-force winner/total calculation over
20,000 randomised bet layouts on every test run.

Everything worth tuning lives in two places: the payout table and `ANTE_BASE`
in `src/data.js`.

See [ROADMAP.md](ROADMAP.md) for what is built, what is not, and why.

## Part of the Roguelike Arcade

No Limit shares a design system, a sign-in and a leaderboard with the other games
in the arcade. That layer lives in `shared/` and is a synced copy — edit the
canonical one at the arcade root and run `python tools/sync-shared.py`, then `python build.py` to re-inline it. See
`ARCADE.md` at the arcade root for the full picture, including Firebase setup.

Without a Firebase config the arcade reports "Offline" and the game plays exactly
as it always has, entirely from `localStorage`.
