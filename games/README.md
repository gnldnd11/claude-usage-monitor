# Adding a game to the crab's casino

> This is the contract. A game that keeps it needs **no change** to `extension.js`, `webview.js`,
> `html.js`, `styles.js` or `games/registry.js`. **A game is a directory and nothing else.**
> Where it sits on the list is a number in its own `meta.js`, so two people can add two games in
> the same minute without either of them touching a line the other is editing.

The stack is the extension's: **plain JavaScript, no dependencies, no build step.** No TypeScript,
no bundler, no new package. That is deliberate (see the project `CLAUDE.md`) and a change to it is
rejected before the code is read.

---

## 1. What you write

```
blackjack.js            the ENGINE, at the repository root beside the others
games/<id>/meta.js      node side: the list row, the host wiring, the game's CSS
games/<id>/panel.js     webview side: the screen
test/<id>.test.js       the engine's own tests, including the return band
test/webview/games/<id>.js   the screen's own check (section 8)
package.json            your suite added to `scripts.test`
```

The engine stays at the **root**, not in `games/<id>/`. The suites address engines there and moving
them doubles every diff for nothing. Everything else lives in your directory.

**There is no list to join.** `games/registry.js` reads this directory: a directory holding a
`meta.js` is a game. Nothing in it names any game, which is the point of it, because an array with
one line per game is one line four writers edit at the same minute and a lost line is a game that
is simply not there with nothing to say why.

`id` is the list row, the stored view and the panel. `key` is the message type on the wire and the
prefix on your element ids. For a new game, make them the same string unless you have a reason.

---

## 2. The engine

The host owns every ruling, and the engine is where a ruling is made. It is a **pure module**: no
`vscode`, no `fs`, no clock, no randomness of its own. A round is a value; a move returns the next
value.

```js
MIN_BET                      // or a cost table, if the game has no bet
OPS                          // ['hit','stand',...]: every move that is not open or deal
newRound({ seed, id, bet })  // -> round. Also newRun / newHand: name it after the thing
act(round, op)               // -> the next round. Never mutates its argument
whyNot(round, op, budget)    // -> null, or the sentence the player is shown
view(round, budget)          // -> what the webview is allowed to see
idleView()                   // -> the same shape with nothing in play
stake(round)                 // optional: what a live round has riding, if a move can grow it
```

### Seeds are the whole game, so they are secrets

- **The host makes the seed, one per round, and it never leaves the host.** `seed` goes into
  `newRound` and stays in the round. The `id` the webview sees is a *separate* random value.
- `view()` may put `seed` in its result **only when `phase === 'done'`.** A seed on a live round is
  the rest of the deck: a webview holding it can read the next card. This has happened (the round
  `id` was the seed once, and the whole deck leaked); the review caught it and the test for it is
  in every engine suite. Do not undo it.
- The same seed must always deal the same round. Everything random comes from
  `cards.js` (`shuffledShoe`, `rollsFrom`) or your own seeded derivation of it, never `Math.random`.

### Phases

A round is in exactly one phase, and there are **two shapes of game**, not one:

```
a round the player plays     your live phase -> done      blackjack, high-low, poker, red dog,
                                                          the wheel, the scratch card
a round born settled         done                         the slots, the plinko drop
```

The second shape is not a special case to be worked around. A spin of the slots has nothing to
decide after the press: the deal **is** the round, so `newRound` returns `phase: 'done'` and the
engine's `OPS` is empty. There is no bet phase in either shape; `idleView()` is what the screen
shows before a round exists.

For the first shape, the live phase's name is yours (`player`, `play`, `draw`, `scratch`, `spin`)
and `table.livePhase` tells the driver which it is. For the second, **leave `livePhase`
out.** Naming `'done'` there would deal exactly one round per window and refuse every deal after it
with "a round is already in progress", forever; the driver refuses that spec at load (`whyNotSpec`)
rather than letting it ship, and the two halves are checked against each other: a live phase with
no `OPS` can never be left, and `OPS` with no live phase can never be played.

`done` is where the money moves, and it may happen exactly once per round.

---

## 3. `games/<id>/meta.js` (node)

```js
'use strict';
const engine = require('../../mygame');

module.exports = {
  id: 'mygame',
  key: 'mg',                      // the message type, and your element prefix
  name: 'My Game',                // the list row
  sub: 'Min bet 10',              // the line under it
  icon: 'cards',                  // a key in icons.js (add one there if nothing fits)
  thumb: 'game-mygame.png',       // 96px art in the repository ROOT (media/** is not published)
  title: 'My Game',               // the panel heading
  hint: 'how the game pays',      // the heading's tooltip: the rules in one line
  panel: 'games/mygame/panel.js',
  cls: 'mg',                      // goes on the panel element next to .inner
  order: 70,                      // WHERE ON THE LIST. See below
  group: '',                      // optional heading the list may group under. See below
  rowTitle: '',                   // optional tooltip on the list row

  // EITHER a round-based game (games/tables.js drives it)...
  table: {
    key: 'mg', id: 'mygame', engine: engine, minBet: 10,
    livePhase: 'play',            // the phase that means "a round is in progress". LEFT OUT by a
                                  // game born 'done' (the slots, the plinko drop): see section 2
    noun: 'round',                // the refusals read "a <noun> is already in progress"
    start: (a, carry) => engine.newRound({ seed: a.seed, id: a.id, bet: a.bet }),
    stakeOf: (st) => st.bet,      // what a LIVE round holds back from the other games
    carryOf: (st) => engine.remaining(st), // optional: what the next round starts from (a shoe)
    opArg: (m) => m.op,           // optional: what whyNot/act are handed (poker sends hold flags)
    startArg: (m) => ({}),        // optional: what the DEAL chose. See "the deal's selection"
    badStart: (a) => null         // optional: why that selection is refused. See the same section
  },

  // ...OR a game that settles on the press and has no round. See games/forge/meta.js
  // createHandler(deps) { return { key, handle(m), held(), onPush?(), setSeeds(fn) }; },

  css: `
  /* only your own selectors. The shared chrome is games/casino.js */
  .mg-thing{color:var(--felt-ink);}
`
};
```

**Prefer `table`.** `createHandler` is for a game whose settlement is genuinely not a round (the
forge pays its fee the instant it is pressed and its sword is stored), and it then has to keep every
rule in section 6 by hand.

### `order` and `group`: where it goes on the list

`order` is a number, and the register sorts on it. **The existing games are spaced by ten**
(blackjack 10, high-low 20, poker 30, the forge 40), so a game that belongs between two of them
takes 15 and nothing is renumbered. A game with no `order` goes after every game that has one. Two
games on the same number are ordered by their `id`, alphabetically, never by the directory: the file
system's order differs between APFS, ext4 and a `.vsix` unpacked by another version, and a list that
is in a different order in every window is a list nobody can learn.

`group` is an optional string, and it is the heading your row sits under. Three things hang off it
now, so it is worth getting right:

- the list draws one heading wherever `group` changes down the already-sorted rows, so **`order` has
  to keep a group contiguous.** A group that comes back later prints its heading twice
- the heading is the button that folds its block away, and the fold is remembered **by this string**.
  Renaming a group forgets whether it was folded, which is the cheaper of the two mistakes
- a game the player has starred leaves the block, and a block the stars empty draws no heading at all

Leave it `''` if you are not sure: a row with no group keeps its place in `order` and simply has no
heading over it.

### What the register does with it

`games/registry.js` reads this directory once, at require time, and from then on it concatenates
`games/casino.js`'s CSS and every game's `css` into the page's stylesheet, builds the list rows,
emits one `<script src>` per `panel`, and builds one handler per game.

What it does when something is wrong matters more than what it does when nothing is:

- a `meta.js` that throws, is missing a field the list needs, names a panel that is not there, or
  carries a table spec the driver cannot run **costs that one game its row.** It does not throw.
  569 installs load this file and a throw here is a sidebar that never draws, usage monitor included
- what dropped out is in `registry.PROBLEMS`, which `extension.js` copies into the output channel at
  activation, and which `test/registry.test.js` asserts is **empty**. That assertion is what keeps
  "it drops quietly" from meaning "nobody finds out"
- a directory with no `meta.js` is not a game and says nothing: a leftover branch copy or a game's
  own assets are simply skipped

### The deal's selection: `startArg` and `badStart`

Some games let the player choose something **before the round exists**: which board, how steep the
prices are, what the bead is dropped through. That choice has to reach `newRound`, and the webview
sends it on the `deal` message. Two hooks carry it, and the shape is `opArg`'s:

```js
// plinko: the player picks a board before the bead exists (games/plinko/meta.js)
table: {
  key: 'pl', id: 'plinko', engine: engine, minBet: engine.MIN_BET,
  noun: 'drop',
  // read off the deal message, and ONLY the fields you name. The driver writes `seed`, `id` and
  // `bet` over whatever this returns, so nothing off the wire can reach them
  startArg: (m) => ({ risk: m.risk }),
  // ...and why that selection is refused, asked BEFORE anything is staked and before the purse is
  // read. Call the engine's own check where it exports one; the sentence is shown to the player
  badStart: (a) => engine.badRisk(a.risk),
  start: (a) => engine.newRound({ seed: a.seed, id: a.id, bet: a.bet, risk: a.risk }),
  // a drop settles on the press, so a round is never live. See the shapes above
  stakeOf: () => 0
}
```

A choice that travels with a **move** rather than with the deal uses `opArg` instead, which is what
poker's hold flags already do. Which of the two a game uses is the engine's decision and not a
style choice: read where the engine takes the field.

| game | what is chosen | how it travels | the check to call first |
|---|---|---|---|
| plinko | `risk`: mild, medium, spicy | `startArg` -> `newRound` | **`badRisk(risk)`** |
| wheel | `risk`: mild, medium, wild | `opArg` with `spin` | `badRisk()`, inside its own `whyNot` |
| scratch card | `cell`: 0 to 8, one a move | `opArg` with `scratch` | `badCell()`, inside its own `whyNot` |
| poker | `hold`: five flags | `opArg` with `draw` | inside its own `whyNot` |
| slots, red dog | nothing | - | - |

The four dice games are not in this table yet: their engines are being written and no `meta.js`
names them.

**A game whose move carries a field needs `opArg` spelled out**, and that is easy to miss: the
default is `(m) => m.op`, which hands the engine the bare string and drops the field with it. The
refusal that comes back then names something the message *did* carry, which reads like a bad message
rather than a missing hook. The wheel is the live example and its own header says so: without
`opArg: (m) => ({ op: m.op, risk: m.risk })` the engine is handed `'spin'` and answers "pick a
wheel: mild, medium, wild" for a message that named one. The scratch card carries `cell` the same
way. A game that chooses before the deal *and* on the move needs both hooks.

**A game that exports no check of its own leaves the engine to throw instead, and that path is
handled rather than avoided.** `newRound` raises a `RangeError` whose message is already the
sentence the player should read. The driver catches every
call into an engine for exactly that reason: an uncaught throw leaves the message with **no reply**,
and the panel then sits out its four-second no-reply timeout, which the player reads as a hang. A
caught `RangeError` is passed through as the refusal; anything else is a fault rather than a ruling,
so the player gets one plain sentence and the log gets the detail. Either way the round is left
exactly as it was.

The reply's own `view()` is caught the same way, one layer out, in `extension.js`'s `gameReply()`:
there is no round to refuse by then, so the reply goes out **without `state`**. See section 5.

So `badStart` is not how a bad selection is *caught*; it is how a bad selection is **refused like a
bad bet**, before the purse is read and before a bank key is minted. Write it where the engine gives
you something to call.

### A game that stores something: the ledger

A round lives in memory and a reload voids it, which is why the card games need none of this. A
game whose state is the player's **property** (the forge's sword, the market's coin positions) is
stored in the credit ledger instead, several windows share one copy, and it keeps its own handler
(`createHandler`) rather than running on the driver. The rules, in the order they bite:

1. **The record's own rules live with the game, not in `credits.js`.** `market.js` exports
   `clean`, `newer`, `merge`, `same`, `save`, `load`, `kept` and `netOf`; `credits.js` calls them.
   A record whose merge is written twice is a record with two answers.
2. **`credits.js` wires three lines per stored game** and nothing else: `normalizeLedger` cleans the
   key at the storage boundary, `mergeLedger` merges it and asks `same()` whether there is a write
   to make, and `creditSummary` adds its `netOf` to the balance. That is where the market is wired;
   copy those three lines.
3. **Money that can be taken back goes IN the record.** The bank (`credits.js`'s grow-only counters
   per window) is right for a fee: a window that paid for an attempt paid for it, whichever copy the
   merge keeps. It is wrong for anything a dropped move has to undo. A sale banked per window pays
   twice when two windows sell one thing, and it has: **one sword once minted 372,000 credits.**
   The market puts *both* halves of a trade in the record (`staked` and `earned`) because a dropped
   buy would otherwise charge a stake that can be the whole purse and hand back nothing.
4. **Read the stored record before every message**, because another window may have moved it since
   the last one this window answered. `extension.js` hands you the door: `deps.storedForge()`,
   `deps.storedMarket()`. Take the stored copy when it is the later one (`newer`).
5. **Write, read the merged record back, and only then let the move stand.** One forced
   `deps.record(net, { <key>: mine })` carries the state and the money together, and it returns the
   merged ledger. `kept(mine, landed)` says whether your record survived; it compares `(moves, by)`
   and **nothing else**, because a window writes exactly one record per move count so that pair is
   the record's name. Comparing `earned` answers a different question, and comparing the whole
   record answers no when the merge merely raised a lifetime figure.
6. **`held()` is 0.** A stake that has already left the balance is not riding on anything, so it
   holds nothing back from the other games. The forge answers 0 in both directions and so does the
   market: a coin bought is paid for the instant it is bought.
7. **`onPush()`** redraws when another window moved the shared state. The push already runs on a
   timer, so it costs nothing, and it says nothing when nothing moved.

`games/forge/meta.js` is the worked example. Its `settle()` is points 4, 5 and the reply-before-push
rule in twenty lines.

---

## 4. `games/<id>/panel.js` (webview)

```js
(function () {
  var CUC = window.CUC;
  var el = CUC.el;
  var mg = { st: null, busy: false, op: null, n: 0, timers: CUC.timers(), to: null };
  var SU = CUC.stakeUi('mg');          // the chips, Deal, and the "not enough credits" note

  CUC.game('mygame', {
    key: 'mg',
    cls: 'mg',
    markup: function () {              // built the first time the game is opened
      return CUC.frame('mygame')       // heading: back arrow, glyph, title, the side corner
        + '<div class="bj-felt">...</div>'
        + '<div class="bj-sr" id="mgLive" aria-live="polite"></div>'
        + '<div class="bj-note" id="mgNote" hidden></div>'
        + '<div class="warnbar" id="mgErr" hidden></div>'
        + '<div class="bj-ctl" id="mgBet">' + CUC.stakesHtml('mg')
        + '<button type="button" class="bj-btn primary" id="mgDeal" title="Deal (Enter)">Deal</button></div>';
    },
    init: function () { /* listeners, once the markup is in the document */ },
    enter: function () { /* the screen was opened: ask the host, take the focus */ },
    leave: function () { /* drop your timers and your in-flight request */ },
    receive: function (m) { /* a reply or a broadcast of your message type */ },
    keys: function (e) { /* only called while YOUR game is the open one */ },
    credits: function () { /* optional: a credit minted while the bet screen is up */ },
    resize: function () { /* optional: the panel's width changed */ }
  });
})();
```

`markup()` is called once; `panelId` defaults to `panel-<id>`. **Do not put your markup in
`html.js`.** Fourteen panels in the first paint is the thing this structure exists to prevent.

### What `window.CUC` gives you

| | |
|---|---|
| `game(id, def)` | register this panel |
| `frame(id)`, `stakesHtml(key)`, `stakeUi(key, extra)` | the shared markup and the chips' config. `extra.min` is **this table's floor** (your engine's `MIN_BET`): it closes every chip under it, opens the screen on the lowest chip at or above it, and asks for that figure in the short-purse note. Leave it out and the chips are 10/100/1000 with no minimum |
| `el(id)`, `esc(s)` | elements and escaping (**escape everything you interpolate**) |
| `fmtInt(n)`, `signed(n)` | numbers the way the rest of the panel writes them |
| `coin()`, `pot(v, preview)` | the pixel coin, and the pot line every game shares |
| `cardFace(c, cell)`, `cardBack()`, `cardWord(c)` | the pixel cards and their names |
| `symWord(sym, n)` | the ten sea symbols' names, singular or plural. `n` is not an `s` rule: four of them do not take one |
| `xMult(m)`, `xMult100(m100)` | a multiple printed from the host's own figure: as a ratio, or as hundredths |
| `npc(key, px)` | a still frame of an agent sprite, for whoever sits at your table |
| `crab()` | the dealer image |
| `stake(ui)`, `renderStakes(ui, locked)`, `wireStakes(ui, redraw)` | the bet controls |
| `setHeld(key, m)`, `heldElsewhere`, `balance()` | the purse: see section 6 |
| `live(id, text)`, `err(id, msg)`, `note(id, text)` | the read-out line, the warning bar, the note |
| `rowFig(id, text, dir)` | the one figure a list row may carry. See section 7 of `docs/game-panels.md`: it is for what MOVED while the panel was shut, so `null` is the answer whenever nothing has |
| `why(whyId, paysId)` | wires the folded paytable's `?` toggle (`.bj-why` / `.bj-pays`). One call in `init()`, and `aria-expanded` and `aria-controls` are kept for you |
| `post(key, op, extra)` | a message to the host. **The request number is added for you**; keep what it returns |
| `hold()`, `settle(m)` | the header balance waits, then lands. See section 6 |
| `timers()` | one bag of pacing timers: `at(ms, fn)` and `clear()` |
| `reduceMotion()` | true: draw the final state at once, no pacing |
| `press(e, panelSel, op, dealId, betId)` | the shared key press (an action, or Enter deals) |
| `current()` | the open game's id |
| `state()`, `setState(s)` | the webview's own memory, if your game has a choice to remember |

This list is what the games actually use, no more. Something you need that is missing belongs in the
floor (`webview.js`, the `window.CUC` block) rather than copied into two panels, and that is the one
case where editing it is right. Adding it there is also how it reaches this table.

**Two panels is the threshold, in both directions.** A thing one game uses stays in that game, or
the floor becomes the games' lumber room; a thing two games use goes here, even when the second
copy was only three lines. Half this table arrived the second way: the chips' `min`, `symWord`,
`xMult`, `xMult100` and `why` were each written twice in two panels before they were written once
here, and the copies had already started to differ by the time they were collected.

The back arrow is wired for you. `aria-live`, `aria-label` and `title` are not decoration here: the
cards are drawn as `aria-hidden` art, so whatever shows a card has to carry its name.

---

## 5. Timing and feel

The host answers in a millisecond; the pacing is the panel's. Read one existing panel before
inventing your own timings, and keep the numbers in one `*_T` object at the top, with a comment
naming any CSS animation that has to match. Every panel does this:

- 4,000 ms with no reply: say so, hand the buttons back (`noReply`).
- A reply that is not the one awaited (a late one, or a broadcast) is drawn **as it stands**: no
  pacing, nothing read out, no reaction. Pacing it would deal the same cards a second time.
- A refused move changed nothing, so nothing moves.
- A reply with **no `state`** is a reason, not a table: show it and keep what is drawn (below).
- `reduceMotion()` skips the pacing and keeps the state.

### A reply with no `state`

**A reply may arrive without `state`, and that is not a broken message.** It means *the host cannot
describe the table right now, and this is why*: `view()` threw, or answered with nothing. The round
itself is untouched, because it is the describing that failed and not the playing, and the next
message finds the round exactly where it was.

Such a reply carries `{ type, error, balance, free, n }`. The money on it is still true, so the
purse and the header take it as they would any other. What it does not carry is any claim about the
table, so the panel:

- **shows the `error`** in its warning bar, and moves nothing else
- **keeps what is drawn.** Cards, chips, pot, marks, the sword: all of it stays. A screen wiped back
  to an empty table is the one reading the player cannot tell from "my round is gone"
- **keeps the state it already had.** `st` is not set from `m.state`, because there is none to set
  it from, and every redraw after this one is then still drawn against the round the host holds
- **releases the wait.** The no-reply timer is cleared and the buttons come back, or the panel sits
  out its four seconds and reads as exactly the hang this rule exists to prevent
- **paces nothing, and does not touch the pacing already running.** For a reply nobody asked for,
  that pacing is drawing a state this reply says nothing about, so it is left to finish

`state` and `error` are two separate facts on one reply, and the pair of them is the whole contract:

| `state` | `error` | what it says | what the screen does |
|---|---|---|---|
| yes | no | here is the table | draw it, pace it |
| yes | yes | your move was refused, here is the table as it still stands | show the reason, move nothing |
| no | yes | I cannot show you the table, and this is why | show the reason, keep what is drawn |

A refusal is a ruling and a state-less reply is a fault, and the sentence the player reads is split
the same way in both places: `games/tables.js`'s `refusal()` is the one place that split is written,
and `extension.js`'s `gameReply()` calls it for a `view()` that throws. A `RangeError` is an
engine's own ruling, so its message is shown as it stands; anything else is a fault, so the player
gets one plain sentence and the log keeps the original with its stack. **A fault's own message is
never shown to the player**: `view()` throwing is a defect here, not something they did.

**This rule is measured for every screen at once**, in `test/webview/games/_fault.js` (the
`stateless` mode): it is the floor's rule, so a page per game would be fourteen pages proving one
thing. Your game is a row in that file's `GAMES` list and nothing else, and it is not optional:
this is the rule whose absence cost a four-second freeze. Do not measure it a second time in your
own mode file, because the second copy of a rule is where the two copies start to differ.

---

## 6. The five rules a review will check

1. **The host judges.** A panel never computes a result, a payout or a probability. If the screen
   needs a number, the host's `view()` sends it.
2. **No seed on a live round.** `view()` carries `seed` only at `phase === 'done'`.
3. **Reply first, `push()` after.** The host's reply goes out before the data push, or the header
   balance tells the player the result before the cards do. The driver does this; a
   `createHandler` game must do it itself.
4. **Stakes move only at settlement**, and a live round's stake is held back from the other games
   (`stakeOf` -> `held()` -> every other game's budget). Never measure a bet against the header
   balance: use the `free` the reply carries (`CUC.setHeld`).
5. **One ledger write per move.** A fee and a state change that happen together go in one
   `recordGameResult(net, extra)`.

And on the webview side: `CUC.hold()` before you pace a reply, `CUC.settle(m)` at the end of it.
Between those two the header is frozen, which is what stops a win being celebrated as earned
credits.

**Also rejected:** emojis anywhere (icons are inline SVG), em dashes, a new npm dependency, markup
in `html.js`, game CSS in `styles.js`, a `game-<key>` body class used to route keys, and a game that
has to be named in `games/registry.js` to appear.

---

## 7. Proving the return

A game that pays out needs its band proved, not asserted. The house keeps **3 to 4%**: the return to
the player lands in **96 to 97%**, the band every game with a pay table sits in.

**Two games are outside it, and neither is a bug.** Blackjack under basic strategy is about 99.5%
(`test/blackjack.test.js`), and the market charges **0.5%** on a round trip. The market's case is
structural: it has no round, so "the return of one play" is not defined for it, and what is proved
instead is that the price is a supermartingale, which makes every rule for selling worth the same.
Its fee is then solved against how far a price moves while a position is held, not against this band.
Do not drag either game back into 96 to 97% on the strength of this paragraph.

**Enumerate if you can. Sample only what you cannot enumerate.** This is the order, and it is not a
preference: an enumeration is a proof of the pay table and a simulation is a measurement of it with
an error bar, so where both are available the error bar is a weaker statement about the same fact.
Every engine in the table below is proved that way; the market is the one newer engine that cannot
be, and the paragraph above says why.

### Enumeration, which is what most games can do

The outcome space is usually small enough to walk whole:

| game | what is enumerated | how many |
|---|---|---|
| slots | every stop of three rings | 13,824 |
| plinko | every walk of the bead | 4,096 |
| wheel | every slice of every wheel, by width | exact fraction, no count needed |
| scratch card | every tally of nine draws | 48,620, as an exact `BigInt` fraction |
| red dog | every opening and third card, and all 2,048 ways to choose where to raise | 48,516 |

What that buys: the return comes out as an exact rational rather than a figure with a `+-` on it, so
the assertion is an equality and the test does not get slower as the claim gets tighter. Keep the
arithmetic in integers (`BigInt` where it overflows) and print the per-row breakdown: a jackpot row
that is most of the return is a design fact worth seeing, and the test should also show the return
holds up without it.

### Sampling, for the one thing an enumeration cannot see

An enumeration believes something it cannot check: that the engine's own dealer really produces the
distribution the enumeration assumed. A shoe that is not shuffled, a wheel whose stops are not
uniform in the slices' widths, a seed that correlates two rounds, all of these leave the enumerated
table exactly as it is and change what the game pays. **That** is what a Monte Carlo is for here,
and it is the only thing it is for. `test/reddog.test.js` keeps the model of it: beside the exact
solve of 48,516 openings it plays 200,000 rounds from fixed seeds under three strategies and holds
the measured return against the solved one, which is a check on the shuffle rather than on the
table.

Where sampling is the only option (`test/market.test.js`, whose price is a random walk with no
finite outcome space), the shape is:

- play N trips from fixed seeds (`tag + '-' + i`) with the best strategy a player would use, and sum
  what comes back per credit staked
- report the **standard error** with the mean: `se = sqrt((sumSq/n - rtp*rtp)/n)`
- assert the error bar is small enough to judge the claim *before* asserting the claim:
  `assert.ok(se <= want)` then `assert.ok(rtp - 4 * se <= FEE)`. Write the bound against the engine's
  own fee rather than against a literal: the market's round trip is **0.5%**, not the 96 to 97% band
  above, because there is no round to return a percentage of, and an assertion written as `rtp < 0.98`
  would have quietly gone from a check to a tautology when that fee moved
- pick N as the smallest count that clears the band, and write the measured numbers in a comment so
  the next reader does not have to re-run it. Poker needed 1,500,000 hands for 97.24% +-0.26%
- make the count an env override (`PK_MC_HANDS`, `HL_MC_RUNS`, and `MK_MC` as a multiplier) so a
  tighter reading is one flag away
- measure separate histories rather than slices of one. Trips cut from a single walk are not
  independent, and an error bar read off them as if they were is a fiction

### And in every suite

Every move's refusal sentence, that a settled round cannot be settled twice, that the same seed
deals the same round, and that `view()` carries no seed while the round is live.

**Your suite has to be in `package.json`'s `scripts.test`.** A suite outside the gate catches
nothing; ten of them were outside it at once and a pay table typo would have shipped. The webview
suite (`test/webview/run.js`) stays **last**.

---

## 8. Running it

```bash
npm test          # every suite. Nothing is built; there is nothing to build
```

Then load the extension and look at the screen. `npm test` does not prove a layout.

### The webview suite

`test/webview/run.js` runs one **mode** per process, each with a 60-second limit. A mode is one page:
`table.test.js` loads the real `renderHtml`, the real host and every registered panel into a small DOM
on a fake clock, then hands a **handle** to the file that owns that mode. It reads the script tags out
of the HTML, so your panel is loaded there the moment it is in the register.

**Your screen's check is its own file: `test/webview/games/<id>.js`.** Nothing else is touched. The
register (`test/webview/modes.js`) reads that directory, `run.js` runs every mode it finds, and
`table.test.js` dispatches to the file that claims the name. Neither of those two files has a list in
it, which is the point: they used to, and every new game had to queue there.

There is **one** shared page, and it is a rule rather than a game: `games/_fault.js` holds the
state-less reply contract for every screen at once (section 5). Add your row there as well as
writing your own file.

```js
'use strict';
module.exports = {
  id: 'mygame',
  modes: ['mygame', 'mygame-reduce', 'mygame-poor'],   // unique across every file; a clash throws
  start: { 'mygame-poor': 5 },      // credits the ledger starts with, by mode. 1,000 if left out
  // state: { 'mygame': {...} },    // optional: what the webview had STORED when the page loaded
  // html: (html, mode) => html,    // optional: break the page before it is parsed
  run: function (h, MODE) {
    const { ok, advance, doc, $, openList, bodyTabs, ext, EXT, path } = h;
    const engine = require(path.join(EXT, 'mygame.js'));
    const sent = h.sent('mg');      // every message this panel posted, whole
    h.openGame('mygame');           // the list row, found by id and not by its place in the list
    ok('what you are claiming', /* the condition */ true, 'what it actually was');
  }
};
```

A mode ending `-reduce` is served `prefers-reduced-motion`, so that is the name to use for it.

`h` is everything the page has: `ok`, `advance`, `later`, `doc`, `$`, the navigation (`openGame`,
`openList`, `rowFor`, `bodyTabs`), the purse (`ledgerBalance`, `hdrBal`), the host (`ext`, `gs`,
`config`, `hostSend`, `toWebview`), `h.sent(key)` for your own messages, `h.pending(ms)` for pacing
timers still to fire, and four that move under you: `h.now` (the fake clock), `h.idleSrc`, and the two
you ASSIGN to, `h.intercept = fn` (answer a message yourself) and `h.hostDelay = ms` (stretch the
host's replies). The handle's own comment in `table.test.js` is the full list.

Copy the nearest existing file rather than starting from this sketch. `games/forge.js` is the one to
read if your game stores something; `games/blackjack.js` if it paces a deal.
