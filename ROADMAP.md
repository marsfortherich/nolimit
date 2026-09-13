# Roadmap

## Honest baseline

Balatro is a commercial game with bespoke pixel art, an original soundtrack, and
years of tuning. Some of that gap is code and can be closed in an afternoon.
Some of it is art, music and playtest hours and cannot.

| Dimension | Before this pass | Target | Closable in code? |
|---|---|---|---|
| Core loop | works, verified | — | done |
| Game feel (juice) | static step list | per-trigger reveal, shake, tick | **yes** |
| Audio | none | synthesised SFX | **yes** |
| Decision depth per shop | buy 1 of 3 | editions, packs, tags | **yes** |
| Replayability | one difficulty, one wheel | stakes, wheels, unlocks | **yes** |
| Content volume | 44 tokens | 80+ tokens, 20 bosses | **yes** |
| Meta-progression | none | profile, unlocks, run history | **yes** |
| Art direction | CSS/SVG | hand-drawn | no — needs an artist |
| Music | none | original score | no — needs a composer |
| Tuning | one bot pass | telemetry over thousands of runs | partly |
| Platform | desktop browser | touch, packaging, cloud saves | later |

The one thing this game has that Balatro does not is the **wheel as a mutable
object**: Nudge, Excise and Echo mean the randomiser itself is a build target.
Everything below leans into that rather than away from it.

---

## P1 — Feel  ✅ shipped

The largest single gap. Balatro's appeal is tactile before it is strategic.

- [x] **Synthesised audio** (`src/audio.js`) — WebAudio oscillators and noise, no
      asset files, so the single-file build survives. Ball roll that pitches
      down as it slows, per-trigger blips rising by semitone, coin, boss sting.
- [x] **Per-trigger score reveal** — winning bets flash on the felt one at a
      time, the result pocket pulses, then Tokens fire left to right, each
      jiggling with its number floating off it and the counters ticking up.
- [x] **Screen shake** scaled to score-vs-target, and a slam when the target falls.
- [x] **Skippable** — any input jumps to the final number. Nothing blocks input.
- [x] **Settings** — volume, SFX toggle, animation speed, reduced motion,
      colourblind-safe palette, screen shake toggle. Persisted.
- [x] **An actually animated wheel** (`src/wheelview.js`) — *from playtest
      feedback: "it would be nice to have the roulette animated"*. The ball was
      a static dot that appeared at 12 o'clock once the result was known. It now
      rides the rim against the wheel's rotation, spirals inward, rattles
      between the frets and settles into the pocket; the wheel idles slowly
      while you bet; a Nudge is a visible hop. The result, the felt highlights
      and the score all stay hidden until the ball lands, so the spin carries
      the suspense it was supposed to.

### Fixed from playtest feedback

- [x] *"the sound bugs out really often"* — four causes, found by instrumenting
      the audio graph rather than guessing. Every noise burst read the **same
      slice** of the shared buffer from sample zero, so the 26 ball ticks in a
      spin were one 20 ms waveform repeated — a pitched buzz, not a rattle.
      Bursts now read from a random offset. Also: a skipped spin left the
      rattle playing under the score tally (there is a spin bus that gets cut);
      the context could not recover from a tab switch unless you pressed a key
      (`pointerdown` was registered `once`); and the mixer had no limiter and no
      voice budget. Measured after: peak 29 voices of 40, zero dropped, zero
      clipped frames at full volume, 172 distinct read offsets out of 174.
- [x] *"buying a negative token gives one extra token slot"* — correct, it gave
      two. `maxTokens` added a slot per Negative **and** `tokenCount` excluded
      Negatives from the count, so each one paid out twice: five base slots plus
      a Negative allowed seven Tokens instead of six. The test that covered this
      asserted the implementation rather than the rule, so it passed throughout;
      it now fills the board and checks that a Negative cannot open a slot for
      an ordinary Token.

## P2 — Decision depth  ✅ shipped

- [x] **Editions** on Tokens — Foil (+50 Chips), Holographic (+12 Mult),
      Polychrome (×1.5 Mult), Negative (free slot). Rare, visible, build-defining.
- [x] **Booster packs** — choose 1 of 3 / 1 of 5 / 2 of 5. Token, Omen and
      Wheel packs; Wheel packs apply an enhancement to a pocket you pick.
- [x] **Skip Tags** — skipping a Small or Big table now grants a Tag that fires
      later (free pack, guaranteed Rare, free rerolls, an edition on the next
      Token…), so skipping is a real strategic line rather than a consolation.
- [x] **Stickers** at higher stakes — Eternal (cannot be sold), Perishable
      (dies after 5 rounds), Rented ($3 per round).

## P3 — Replayability  ✅ shipped

- [x] **Stakes** — 8 difficulty tiers, each adding one rule; win to unlock the next.
- [x] **Wheels** — 8 starting variants that change the run's opening shape
      (a trimmed 31-pocket wheel, an American wheel with two zeros, a wheel
      that starts gilded…). Unlocked by play.
- [x] **Profile** — unlocks, run history, lifetime stats, Token discovery,
      persisted separately from the in-progress run so a run can be abandoned
      without losing meta-progress.
- [x] **Daily seed** — one deterministic seed per calendar day.

## P4 — Content mass  ✅ shipped

- [x] Tokens 44 → **86**, built around named archetypes (Colour, Parity,
      Straights, Outside, Economy, Wheelwright, Nudge) so shops offer synergy
      rather than noise.
- [x] Bosses 12 → **22**
- [x] Omens 14 → **22**
- [x] Charters 10 → **16**
- [x] Tags — **16** (new system)

## P5 — Not shipped, and honestly why

These are the remaining distance to Balatro, and none of them is a coding problem.

- **Original art direction.** CSS and SVG have taken this as far as taste allows.
  Real pixel art, card frames and animation need an artist. This is the single
  most visible remaining gap.
- **Original soundtrack.** Synthesised SFX land; synthesised *music* would be
  worse than silence. Needs a composer. The audio bus already has a music
  channel and a mute toggle wired for it.
- **Tuning at scale.** The bot in `test/` plays a fixed strategy. Real balance
  comes from telemetry across thousands of human runs — which token is bought,
  which is never bought, which boss ends runs. Instrument, then tune.
- **Touch and mobile layout.** The felt is a dense grid built for a mouse.
  A phone layout is a redesign, not a media query.
- **Challenge runs and dailies with leaderboards.** Challenges are local work;
  leaderboards need a backend and anti-cheat.
- **Localisation.** All copy is inline English. Needs extraction to a string table.
- **Packaging.** Electron/Tauri wrapper, achievements, cloud saves.

## Next three things I would do

1. **Instrument and tune.** Log every shop offer, purchase and run outcome to
   `localStorage`, then read it back. Right now balance rests on one bot.
2. **Art pass on the Tokens.** 86 cards that differ only by glyph is the thing
   that most reads as unfinished.
3. **Touch layout**, because a game like this lives or dies on being playable
   in a spare five minutes.
