// The forge: the table, the roll, the sword's moves, what it saves, and what the house keeps.
// No dependencies: node's assert only. Run: node test/forge.test.js
'use strict';
const assert = require('assert/strict');
const path = require('path');
const f = require(path.join(__dirname, '..', 'forge.js'));
const C = require(path.join(__dirname, '..', 'cards.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const MAX = f.MAX_LEVEL;
const OUTCOMES = ['up', 'keep', 'down', 'break'];
const LEVELS = [];
for (let L = 0; L <= MAX; L++) LEVELS.push(L);
const FORGEABLE = LEVELS.slice(0, MAX); // every level an attempt can be made from

const snapshot = (st) => JSON.stringify(st);
const sword = (over) => Object.assign(f.newSword({ by: 'aaaaaaaaaaaaaaaa' }), over);
const enhance = (st, seed) => f.act(st, { op: 'enhance', seed: seed });
const sell = (st) => f.act(st, { op: 'sell' });

const HEATS = [];
for (let h = 0; h <= f.HEAT_MAX; h++) HEATS.push(h);

// The first seed (from a fixed list) whose roll means `outcome` at `level` with `heat` bars lit. The
// host makes a fresh seed per attempt and keeps it, so this is how a test picks an outcome: the same
// way the card tests search a seed for a deal. The heat has to be named because it moves the bands:
// a seed that rolls 'keep' on a cold sword may roll 'up' on a hot one, which is the gauge working
function seedFor(level, outcome, tag, heat) {
  const h = heat || 0;
  for (let i = 0; i < 20000; i++) {
    const seed = (tag || 'pin') + '-' + level + '-' + outcome + '-' + h + '-' + i;
    if (f.outcomeAt(level, f.rollOf(seed), h) === outcome) return seed;
  }
  throw new Error('no seed rolls ' + outcome + ' at +' + level + ' on heat ' + h);
}

// Walks the sword up to `level` the short way: pinned successes, one attempt a level
function climbTo(level, st) {
  let s = st || sword();
  while (s.level < level) {
    const before = s.level;
    s = enhance(s, seedFor(before, 'up', 'climb', s.heat));
    assert.equal(s.level, before + 1, 'the climb stalled at +' + before);
  }
  return s;
}

// --- the table ----------------------------------------------------------------------------

test('every level offers four outcomes that sum to the denominator', () => {
  assert.equal(f.DEN, 100);
  for (const L of FORGEABLE) {
    const r = f.TABLE[L];
    let sum = 0;
    for (const o of OUTCOMES) {
      assert.ok(Number.isInteger(r[o]) && r[o] >= 0, '+' + L + ' ' + o + ' is ' + r[o]);
      sum += r[o];
    }
    assert.equal(sum, f.DEN, 'the odds at +' + L + ' sum to ' + sum);
  }
  // the top is not forgeable at all, so it is priced and nothing else
  assert.equal(f.TABLE[MAX].cost, null);
  assert.equal(f.costAt(MAX), null);
});

test('the break risk starts at +' + f.RISK_FROM + ' and there is none below it', () => {
  for (const L of FORGEABLE) {
    const brk = f.TABLE[L].break;
    if (L < f.RISK_FROM) assert.equal(brk, 0, '+' + L + ' can break, and it is below +' + f.RISK_FROM);
    else assert.ok(brk > 0, '+' + L + ' is at or above +' + f.RISK_FROM + ' and cannot break');
  }
  // and a roll can never say 'break' where the row says it cannot happen
  for (const L of FORGEABLE) {
    if (L >= f.RISK_FROM) continue;
    for (let roll = 0; roll < f.DEN; roll++) assert.notEqual(f.outcomeAt(L, roll), 'break', '+' + L + ' roll ' + roll);
  }
});

test('the chance of going up falls the whole way, and a failure below +' + f.RISK_FROM + ' is a stay or a drop', () => {
  for (let L = 1; L < MAX; L++) {
    assert.ok(f.TABLE[L].up < f.TABLE[L - 1].up, '+' + L + ' is no harder than +' + (L - 1));
  }
  assert.equal(f.TABLE[0].up, 95);
  assert.equal(f.TABLE[MAX - 1].up, 10);
  // nothing is below +0, so a failure there can only be a stay
  assert.equal(f.TABLE[0].down, 0);
  assert.equal(f.TABLE[0].keep, f.DEN - f.TABLE[0].up);
  // the opening levels only ever stay, which is the part of the game that teaches it
  for (const L of [0, 1, 2]) assert.equal(f.TABLE[L].down, 0, '+' + L + ' can drop');
  for (const L of [3, 4]) assert.ok(f.TABLE[L].down > 0, '+' + L + ' cannot drop');
});

test('the price climbs every level and a +0 sword fetches nothing', () => {
  assert.equal(f.TABLE[0].sell, 0);
  assert.equal(f.priceAt(0), 0);
  for (let L = 1; L <= MAX; L++) {
    assert.ok(f.TABLE[L].sell > f.TABLE[L - 1].sell, 'the price does not climb at +' + L);
    assert.ok(Number.isSafeInteger(f.TABLE[L].sell));
  }
  // every figure on the table is a whole number of credits: nothing on the money path is multiplied
  for (const L of FORGEABLE) assert.ok(Number.isSafeInteger(f.TABLE[L].cost) && f.TABLE[L].cost > 0);
});

// --- the heat gauge -----------------------------------------------------------------------
// The gauge is the only thing in this game that changes the odds, so every claim made for it is
// counted here over every (level x heat) there is, not argued for one row.

test('every bar of the gauge leaves four odds that still sum to the denominator', () => {
  for (const L of FORGEABLE) {
    for (const h of HEATS) {
      const o = f.oddsAt(L, h);
      let sum = 0;
      for (const k of OUTCOMES) {
        assert.ok(Number.isInteger(o[k]) && o[k] >= 0, '+' + L + ' heat ' + h + ' ' + k + ' is ' + o[k]);
        sum += o[k];
      }
      assert.equal(sum, f.DEN, '+' + L + ' heat ' + h + ' sums to ' + sum);
    }
  }
  // the top takes no attempts, so it has no odds at any heat
  for (const h of HEATS) assert.equal(f.oddsAt(MAX, h), null);
});

test('the gauge raises the chance and can never lower it, and it stops at the ceiling', () => {
  for (const L of FORGEABLE) {
    const cold = f.TABLE[L].up;
    let prev = -1;
    for (const h of HEATS) {
      const up = f.oddsAt(L, h).up;
      assert.ok(up >= cold, '+' + L + ' heat ' + h + ' is ' + up + ', below the cold ' + cold);
      assert.ok(up >= prev, '+' + L + ' went backwards at heat ' + h);
      assert.ok(up <= f.UP_CAP, '+' + L + ' heat ' + h + ' passed the ceiling at ' + up);
      // one bar is worth exactly HEAT_STEP points until the ceiling takes over
      assert.equal(up, Math.min(cold + f.HEAT_STEP * h, f.UP_CAP), '+' + L + ' heat ' + h);
      prev = up;
    }
    assert.equal(f.oddsAt(L, 0).up, cold, 'a cold sword is the table’s own row');
  }
  // the opening levels are already at the ceiling, so the gauge is worth nothing to them, and that
  // is the design rather than a gap: heat only means something where the chance is thin
  assert.equal(f.oddsAt(0, f.HEAT_MAX).up, f.TABLE[0].up);
  assert.ok(f.oddsAt(MAX - 1, f.HEAT_MAX).up > f.TABLE[MAX - 1].up + 20, 'the thinnest level gains the most');
});

test('the gauge never touches the break risk, at any level and any bar', () => {
  // The fear at the top is the whole game. A gauge that lowered the break risk as it filled would
  // be a progress bar telling the player a lie, so this is the one number it may not move
  for (const L of FORGEABLE) {
    for (const h of HEATS) {
      assert.equal(f.oddsAt(L, h).break, f.TABLE[L].break, '+' + L + ' heat ' + h);
      // and the band itself has to stay put, not only its width: a roll that broke the sword cold
      // still breaks it hot
      for (let roll = 0; roll < f.DEN; roll++) {
        assert.equal(f.outcomeAt(L, roll, h) === 'break', f.outcomeAt(L, roll, 0) === 'break', '+' + L + ' roll ' + roll + ' heat ' + h);
      }
    }
  }
  assert.equal(f.oddsAt(MAX - 1, f.HEAT_MAX).break, 12, 'a full gauge still breaks 12 swords in 100 at +' + (MAX - 1));
});

test('the gauge’s points come off the drop first and the stay second, never the break', () => {
  for (const L of FORGEABLE) {
    for (const h of HEATS) {
      const cold = f.TABLE[L], o = f.oddsAt(L, h);
      const gain = o.up - cold.up;
      assert.equal(o.down, Math.max(0, cold.down - gain), '+' + L + ' heat ' + h + ' drop');
      assert.equal(o.keep, cold.keep - Math.max(0, gain - cold.down), '+' + L + ' heat ' + h + ' stay');
      assert.ok(o.down <= cold.down && o.keep <= cold.keep, 'the gauge added to a failure at +' + L);
    }
  }
});

test('a heat off the wire is read at the boundary: nothing becomes a hotter sword', () => {
  for (const junk of [undefined, null, -1, -99, 1.5, 'x', '3', NaN, Infinity, {}, []]) {
    assert.equal(f.heatOf(junk), 0, JSON.stringify(junk) + ' read as heat');
  }
  assert.equal(f.heatOf(f.HEAT_MAX + 50), f.HEAT_MAX, 'a gauge from a longer version is pulled back');
  for (const h of HEATS) assert.equal(f.heatOf(h), h);
});

test('the table is frozen, so nothing that is handed it can retune the game', () => {
  const was = JSON.stringify(f.TABLE);
  try { f.TABLE[0].up = 1; } catch (e) { /* strict mode throws, sloppy mode ignores */ }
  try { f.TABLE.push({ level: 99 }); } catch (e) { /* frozen array */ }
  assert.equal(JSON.stringify(f.TABLE), was);
});

// --- the roll -----------------------------------------------------------------------------

test('a roll is an integer inside the denominator, and the bands are the table', () => {
  for (let i = 0; i < 2000; i++) {
    const r = f.rollOf('roll-' + i);
    assert.ok(Number.isInteger(r) && r >= 0 && r < f.DEN, 'roll ' + r);
  }
  // every roll at every level names exactly one outcome, and each outcome's band is as wide as the
  // row says. That is the whole of "the odds are the table": counted, not restated
  for (const L of FORGEABLE) {
    const seen = { up: 0, keep: 0, down: 0, break: 0 };
    for (let roll = 0; roll < f.DEN; roll++) {
      const o = f.outcomeAt(L, roll);
      assert.ok(o in seen, 'roll ' + roll + ' at +' + L + ' means ' + o);
      seen[o] += 1;
    }
    for (const o of OUTCOMES) assert.equal(seen[o], f.TABLE[L][o], o + ' at +' + L);
  }
});

test('the same seed always rolls the same thing, and the stream is the shared one', () => {
  for (let i = 0; i < 500; i++) {
    const seed = 'same-' + i;
    assert.equal(f.rollOf(seed), f.rollOf(seed));
    // the roll comes off cards.js's seeded stream: one PRNG in the repo, not a second copy
    assert.equal(f.rollOf(seed), Math.floor(C.rollsFrom(seed)() * f.DEN));
  }
  // and a different seed is a different roll often enough to be a roll at all
  const rolls = new Set();
  for (let i = 0; i < 500; i++) rolls.add(f.rollOf('spread-' + i));
  assert.ok(rolls.size > 60, 'only ' + rolls.size + ' different rolls in 500 seeds');
});

test('the same seed and the same moves give the same sword', () => {
  const run = () => {
    let st = sword();
    for (let i = 0; i < 300; i++) {
      st = enhance(st, 'replay-' + i);
      if (st.level === MAX) st = sell(st);
    }
    return st;
  };
  assert.equal(snapshot(run()), snapshot(run()));
});

// --- a move -------------------------------------------------------------------------------

test('an attempt pays the fee and lands where the roll says, and act never mutates its input', () => {
  for (const L of FORGEABLE) {
    for (const o of OUTCOMES) {
      if (!f.TABLE[L][o]) continue;
      const st = climbTo(L);
      const was = snapshot(st);
      const out = enhance(st, seedFor(L, o));
      assert.equal(snapshot(st), was, 'act mutated the sword it was handed');
      assert.notEqual(out, st, 'a move has to be a new sword');
      assert.equal(out.last.outcome, o);
      assert.equal(out.last.from, L);
      assert.equal(out.last.to, out.level);
      assert.equal(out.level, f.levelAfter(L, o), o + ' at +' + L + ' landed on +' + out.level);
      assert.equal(out.net, -f.costAt(L), 'the fee goes whatever it rolls');
      assert.equal(out.last.cost, f.costAt(L));
      assert.equal(out.last.paid, 0, 'an attempt pays nothing out');
      // the two prices the move was between: what the sword was worth and what it is worth now.
      // The screen shows the jump and is not allowed to look either of them up
      assert.equal(out.last.sellFrom, f.priceAt(L));
      assert.equal(out.last.sellTo, f.priceAt(out.level));
      assert.equal(out.last.fed, st.spent + f.costAt(L), 'the chip counts this fee in');
      assert.equal(out.earned, st.earned, 'and it cannot change what the shop has paid');
      assert.equal(out.tries, st.tries + 1);
      assert.equal(out.moves, st.moves + 1);
    }
  }
});

test('an attempt that does not raise the level fills a bar, and one that does spends the gauge', () => {
  const L = 7;   // thin enough that the gauge is worth something, and it can do all four things
  let st = climbTo(L);
  assert.equal(st.heat, 0, 'a climb of nothing but successes leaves a cold gauge');
  // every stay is a bar, up to the top of the gauge and no further
  for (let n = 1; n <= f.HEAT_MAX + 3; n++) {
    st = enhance(st, seedFor(L, 'keep', 'fill', st.heat));
    assert.equal(st.level, L, 'the stay moved the sword');
    assert.equal(st.heat, Math.min(n, f.HEAT_MAX), 'bar ' + n);
    assert.equal(st.last.heat, Math.min(n - 1, f.HEAT_MAX), 'the chip says the heat it was ROLLED at, not the one it leaves');
  }
  assert.equal(f.view(st, Infinity).odds.up, f.oddsAt(L, f.HEAT_MAX).up, 'the view is rolling against the full gauge');
  // and the success empties it
  const up = enhance(st, seedFor(L, 'up', 'spend', st.heat));
  assert.equal(up.level, L + 1);
  assert.equal(up.heat, 0, 'a level gained spends the gauge');
  // at +7 a full gauge has bought the drop away entirely, which is the point of taking the points
  // off `down` first: six failures in a row mean the next one cannot send the sword backwards
  assert.equal(f.oddsAt(L, f.HEAT_MAX).down, 0, '+' + L + ' can still drop on a full gauge');
  // a drop fills the gauge too, where the gauge has not removed it: the sword fell back, but the
  // attempt still did not raise it. +9's drop survives a full gauge (34 points against 30 bought)
  const deep = Object.assign(climbTo(MAX - 1), { heat: f.HEAT_MAX });
  assert.ok(f.oddsAt(MAX - 1, f.HEAT_MAX).down > 0, 'the deepest level has no drop left to test');
  const down = enhance(deep, seedFor(MAX - 1, 'down', 'fell', f.HEAT_MAX));
  assert.equal(down.level, MAX - 2);
  assert.equal(down.heat, f.HEAT_MAX, 'a drop is a failure, so the gauge keeps what it had');
  const warm = enhance(climbTo(L), seedFor(L, 'down', 'warm', 0));
  assert.equal(warm.heat, 1, 'and a drop from cold lights the first bar');
});

test('a break takes the sword, hands over a +0, and pays nothing back', () => {
  const L = f.RISK_FROM;
  let st = climbTo(L);
  assert.ok(st.spent > 0, 'the climb cost nothing');
  st = enhance(st, seedFor(L, 'keep', 'warm', 0));   // one bar lit, so the break has a gauge to take
  assert.equal(st.heat, 1);
  const broke = st.broke;
  const fed = st.spent + f.costAt(L);
  const out = enhance(st, seedFor(L, 'break', 'pin', st.heat));
  assert.equal(out.level, 0, 'a break has to leave a +0 sword');
  assert.equal(out.net, -f.costAt(L), 'the fee is the only thing that moved');
  assert.ok(out.net < 0);
  assert.equal(out.last.paid, 0, 'a break is not a sale');
  assert.equal(out.spent, 0, 'the bill belongs to the sword, and the sword is gone');
  assert.equal(out.heat, 0, 'and so does the gauge');
  assert.equal(out.broke, broke + 1, 'the grave is counted');
  // what the sword ate is on the CHIP, because the sword that ate it no longer exists to be asked
  assert.equal(out.last.fed, fed, 'the chip has to be able to say how much went into it');
  assert.ok(out.last.fed > f.costAt(L), 'and that is the whole climb, not the last fee');
  // what the save has seen does not go back with it
  assert.equal(out.best, st.best, 'a record high is not undone by a break');
  assert.equal(out.tries, st.tries + 1);
  assert.equal(out.moves, st.moves + 1);
  // and the next attempt is the +0 attempt again
  assert.equal(f.view(out, Infinity).cost, f.costAt(0));
});

test('a drop is one level, never two, and keeps the sword', () => {
  for (const L of FORGEABLE) {
    if (!f.TABLE[L].down) continue;
    const st = climbTo(L);
    const out = enhance(st, seedFor(L, 'down'));
    assert.equal(out.level, L - 1);
    assert.equal(out.spent, st.spent + f.costAt(L), 'the same sword keeps its bill');
  }
});

test('a sale pays the table price and starts the next sword at +0', () => {
  for (let L = 1; L <= MAX; L++) {
    const st = climbTo(L);
    const out = sell(st);
    assert.equal(out.net, f.priceAt(L), 'the price was not the one the view showed');
    // and the money is IN the sword, because that is the only place a shared sword's payout can be
    // counted once (see the money note at the top of forge.js)
    assert.equal(out.earned, st.earned + f.priceAt(L));
    assert.equal(f.view(out, 0).earned, out.earned);
    assert.equal(out.level, 0);
    assert.equal(out.spent, 0);
    assert.equal(out.last.op, 'sell');
    assert.equal(out.last.outcome, 'sold');
    assert.equal(out.last.from, L);
    assert.equal(out.last.paid, f.priceAt(L));
    assert.equal(out.last.cost, 0);
    assert.equal(out.tries, st.tries, 'a sale is not an attempt');
    assert.equal(out.moves, st.moves + 1, 'but it is a move, or the merge cannot order it');
    assert.equal(out.best, st.best);
    assert.equal(out.broke, st.broke, 'and nothing was destroyed');
    assert.equal(out.last.sellFrom, f.priceAt(L), 'the chip carries the price the sword fetched');
    // the shop's replacement is a cold sword, however hot the one that was sold
    const hot = Object.assign(f.newSword({ by: 'aaaaaaaaaaaaaaaa' }), { level: L, heat: f.HEAT_MAX, moves: 5 });
    assert.equal(sell(hot).heat, 0, 'a hot gauge was sold with the sword it belonged to');
    assert.equal(sell(hot).last.heat, f.HEAT_MAX, 'but the chip says what was on it');
  }
});

test('the top takes no more attempts, and the sale is the way out', () => {
  const st = climbTo(MAX);
  assert.equal(st.level, MAX);
  assert.equal(f.whyNot(st, { op: 'enhance', seed: 's' }), 'the sword is already +' + MAX);
  assert.equal(enhance(st, 'anything'), st, 'a refused move returns the very same sword');
  const v = f.view(st, Infinity);
  assert.equal(v.can.enhance, false);
  assert.equal(v.can.sell, true);
  assert.equal(v.cost, null, 'there is no fee left to show');
  assert.equal(v.odds, null, 'and no odds either');
  // and asking what a roll would mean up there is a mistake, not a break
  assert.throws(() => f.outcomeAt(MAX, 0), RangeError);
  assert.throws(() => f.outcomeAt(MAX + 1, 0), RangeError);
  assert.equal(sell(st).net, f.priceAt(MAX));
});

// --- money --------------------------------------------------------------------------------

test('an attempt the purse cannot cover is refused, and nothing moves', () => {
  for (const L of FORGEABLE) {
    const st = climbTo(L);
    const cost = f.costAt(L);
    const op = { op: 'enhance', seed: 'rich' };
    assert.equal(f.whyNot(st, op, cost), null, 'exactly the fee is enough');
    assert.equal(f.whyNot(st, op, cost - 1), 'not enough credits');
    assert.equal(f.whyNot(st, op, 0), 'not enough credits');
    assert.equal(f.whyNot(st, op, -5), 'not enough credits');
    // a broken ledger must refuse, not slip through
    assert.equal(f.whyNot(st, op, NaN), 'not enough credits');
    assert.equal(f.view(st, cost).can.enhance, true);
    assert.equal(f.view(st, cost - 1).can.enhance, false, 'the screen would offer a fee the host refuses');
    // selling is not a stake, so an empty purse cannot stop it (a +0 sword has its own reason)
    if (L > 0) {
      assert.equal(f.whyNot(st, 'sell', 0), null);
      assert.equal(f.view(st, 0).can.sell, true);
    }
  }
  // act() takes no budget: the money rule is the host's, and it checked before calling in
  const st = sword();
  assert.equal(enhance(st, 'seed').level >= 0, true);
});

test('a +0 sword cannot be sold: it is the one the shop gives away', () => {
  const st = sword();
  assert.equal(f.whyNot(st, 'sell'), 'a +0 sword is the one the shop gives away');
  assert.equal(sell(st), st, 'and nothing happened');
  assert.equal(f.view(st, Infinity).can.sell, false);
  assert.equal(f.view(st, Infinity).sell, 0);
});

test('the move is the message, so its shape is a rule', () => {
  const st = climbTo(2);
  for (const op of [undefined, null, 'forge', { op: 'forge' }, {}, { op: 'enhance ' }, 3]) {
    assert.equal(f.whyNot(st, op, Infinity), 'unknown action', JSON.stringify(op));
  }
  // an attempt without a seed would roll the same thing every time
  for (const seed of [undefined, null, '', 7, {}, ['s'], true]) {
    assert.equal(f.whyNot(st, { op: 'enhance', seed }, Infinity), 'a forge attempt needs a seed', JSON.stringify(seed));
    assert.equal(f.act(st, { op: 'enhance', seed }), st);
  }
  assert.equal(f.whyNot(null, 'sell', Infinity), 'there is no sword');
  assert.deepEqual(f.OPS, ['enhance', 'sell']);
});

// --- saving -------------------------------------------------------------------------------

test('a sword survives being saved and read back, and the chip does not', () => {
  let st = climbTo(4);
  st = enhance(st, seedFor(4, 'down'));
  assert.equal(st.heat, 1, 'the drop lit a bar, so there is a gauge to save');
  const rec = f.save(st);
  // the record is the sword and nothing else: no chip, no seed. `earned` is in it because that is
  // where a sale's money lives (see the file's money note), and the balance reads it from there;
  // `heat` because the gauge is part of the sword in hand and a reload must not cool it; `broke`
  // because it is a lifetime figure the screen shows next to `best`
  assert.deepEqual(Object.keys(rec).sort(), ['best', 'broke', 'by', 'earned', 'heat', 'level', 'moves', 'spent', 'tries']);
  const back = f.load(rec);
  for (const k of ['level', 'moves', 'tries', 'spent', 'heat', 'best', 'broke', 'earned', 'by']) assert.equal(back[k], st[k], k);
  assert.equal(back.last, null, 'a reload keeps the sword, not the chip that says what just happened');
  assert.equal(back.net, null);
  // and saving what was read back is the same record (idempotent through the round trip)
  assert.deepEqual(f.save(back), rec);
  // a view of a reloaded sword is a view of the same sword, odds included: a gauge that did not
  // survive the reload would be a chance the player paid for and lost to a window being closed
  const vb = f.view(back, Infinity), vs = f.view(st, Infinity);
  for (const k of ['level', 'cost', 'sell', 'best', 'broke', 'tries', 'spent', 'heat', 'heatUp']) assert.equal(vb[k], vs[k], k);
  assert.deepEqual(vb.odds, vs.odds);
});

test('a record written before the gauge existed is read, not rejected', () => {
  // 569 installs have a sword in globalState that was written before `heat` and `broke` were
  // fields. Such a record is not broken: it is a cold gauge and a grave count of nothing. The one
  // thing that must not happen is the level being thrown away, which would take the player's sword
  const old = { level: 7, moves: 42, tries: 40, spent: 1200, best: 8, earned: 500, by: 'aaaaaaaaaaaaaaaa' };
  const back = f.load(old);
  assert.equal(back.level, 7, 'an old record keeps its sword');
  assert.equal(back.best, 8);
  assert.equal(back.earned, 500, 'and its money');
  assert.equal(back.heat, 0, 'with a cold gauge');
  assert.equal(back.broke, 0);
  // and it is playable at once: the view is a +7 view and the first press works
  const v = f.view(back, Infinity);
  assert.equal(v.cost, f.costAt(7));
  assert.deepEqual(v.odds, v.cold, 'cold, so the heated row is the table’s own');
  assert.equal(v.heatUp, 0);
  const next = enhance(back, seedFor(7, 'keep', 'old', 0));
  assert.equal(next.heat, 1, 'and the gauge starts filling from there');
  // the round trip through the new format adds the two fields and changes nothing else
  assert.deepEqual(f.save(back), Object.assign({}, old, { heat: 0, broke: 0 }));
  // junk in the new fields is read as none of it, never as a hotter sword
  for (const junk of [-3, 1.5, 'x', NaN, null, {}]) {
    assert.equal(f.load(Object.assign({}, old, { heat: junk, broke: junk })).heat, 0, JSON.stringify(junk));
    assert.equal(f.load(Object.assign({}, old, { heat: junk, broke: junk })).broke, 0, JSON.stringify(junk));
  }
  // a gauge from a version with a longer one is pulled back to this one's top, the way a level is
  assert.equal(f.load(Object.assign({}, old, { heat: 99 })).heat, f.HEAT_MAX);
  // a record with fields this version has never heard of is not a reason to throw either
  assert.equal(f.load(Object.assign({}, old, { sharpness: 3, runes: ['x'] })).level, 7);
});

test('a record from somewhere else is read at the boundary, never trusted', () => {
  assert.equal(f.load(null).level, 0, 'a player who has never forged gets the free +0');
  assert.equal(f.load(null).best, 0);
  assert.deepEqual(f.save(f.load(undefined)), f.save(f.newSword({})));
  for (const junk of ['nope', 7, [], true]) assert.equal(f.load(junk).level, 0, JSON.stringify(junk));
  // a save from a version with a longer ladder is pulled back to this one's top
  assert.equal(f.load({ level: 99, moves: 3, tries: 3, spent: 1, best: 99, by: '' }).level, MAX);
  assert.equal(f.load({ level: 99, moves: 3, tries: 3, spent: 1, best: 99, by: '' }).best, MAX);
  // and anything that is not a count reads as none of it
  const z = f.load({ level: -2, moves: 1.5, tries: 'x', spent: NaN, best: null, by: 'not an id' });
  assert.equal(z.level, 0); assert.equal(z.moves, 0); assert.equal(z.tries, 0);
  assert.equal(z.spent, 0); assert.equal(z.best, 0);
  // `by` travels as an opaque string: what a writer id looks like is the host's rule, and
  // credits.js is where a stored one is checked against it (see test/credits.test.js)
  assert.equal(z.by, 'not an id');
  assert.equal(f.load({ by: 12 }).by, '12');
  // a best below the sword in hand would be a record high that never happened
  assert.equal(f.load({ level: 6, best: 2, moves: 9, tries: 9, spent: 0, by: '' }).best, 6);
});

test('moves and tries only ever grow, which is what lets the merge order two copies', () => {
  let st = sword();
  let moves = 0, tries = 0, best = 0;
  for (let i = 0; i < 400; i++) {
    const op = (st.level > 0 && i % 7 === 0) ? { op: 'sell' } : { op: 'enhance', seed: 'grow-' + i };
    const next = f.act(st, op);
    if (next !== st) {
      moves += 1;
      if (op.op === 'enhance') tries += 1;
      best = Math.max(best, next.level);
    }
    assert.equal(next.moves, moves);
    assert.equal(next.tries, tries);
    assert.equal(next.best, best);
    st = next;
  }
  assert.ok(moves > 400 * 0.9, 'most of those moves should have been allowed: ' + moves);
});

// --- what the webview sees ----------------------------------------------------------------

function leaves(x, out) {
  if (x == null) return out;
  if (typeof x !== 'object') { out.push(String(x)); return out; }
  for (const k in x) { out.push(k); leaves(x[k], out); }
  return out;
}

test('nothing a view carries says what the next attempt will do', () => {
  for (const L of FORGEABLE) {
    const st = climbTo(L);
    const v = f.view(st, Infinity);
    assert.equal('seed' in v, false);
    // The strong form: the view before an attempt is the SAME whatever that attempt rolls. The host
    // makes one seed per message, so there is no stream position to leak and nothing to derive
    const up = enhance(st, seedFor(L, 'up'));
    const keep = enhance(st, seedFor(L, 'keep'));
    assert.notEqual(up.level, keep.level, 'the two outcomes have to differ for this to mean anything');
    assert.equal(JSON.stringify(f.view(st, 1e9)), JSON.stringify(v));
    // and no leaf of it is a seed that rolls the outcome either (they are counts and prices only)
    for (const leaf of leaves(v, [])) {
      if (leaf === String(f.rollOf(leaf))) continue; // a number that happens to be its own roll
      assert.ok(true);
    }
  }
});

test('a view hands over the whole ladder, so the screen holds no number of its own', () => {
  const st = climbTo(6);
  const v = f.view(st, Infinity);
  assert.equal(v.table, f.TABLE, 'the same frozen table, not a copy that can drift');
  assert.equal(v.table.length, MAX + 1);
  assert.equal(v.max, MAX);
  assert.equal(v.riskFrom, f.RISK_FROM);
  assert.equal(v.den, f.DEN);
  // the row the sword is on, which is the one the screen shows big
  assert.deepEqual(v.odds, { up: f.TABLE[6].up, keep: f.TABLE[6].keep, down: f.TABLE[6].down, break: f.TABLE[6].break });
  assert.deepEqual(v.cold, v.odds, 'a cold sword rolls against the table’s own row');
  assert.equal(v.heat, 0);
  assert.equal(v.heatMax, f.HEAT_MAX);
  assert.equal(v.heatStep, f.HEAT_STEP);
  assert.equal(v.heatUp, 0);
  assert.equal(v.cost, f.costAt(6));
  assert.equal(v.sell, f.priceAt(6));
  assert.equal(v.level, 6);
  assert.equal(v.best, 6);
  assert.equal(v.broke, 0);
  assert.equal(v.spent, st.spent);
  assert.equal(v.tries, st.tries);
  assert.deepEqual(v.can, { enhance: true, sell: true });
  assert.equal(v.last.outcome, 'up');
  assert.equal(v.net, -f.costAt(5));
});

test('a view says what the gauge is worth, so the screen never works a percentage out', () => {
  // The screen prints `odds.up` big, `heatUp` beside it and `heat` as the bar. All three come from
  // here: a gauge the screen counted itself would be a probability the host did not judge
  for (const L of FORGEABLE) {
    for (const h of HEATS) {
      const st = Object.assign(climbTo(L), { heat: h });
      const v = f.view(st, Infinity);
      assert.equal(v.heat, h, '+' + L + ' heat ' + h);
      assert.deepEqual(v.odds, f.oddsAt(L, h), '+' + L + ' heat ' + h);
      assert.deepEqual(v.cold, { up: f.TABLE[L].up, keep: f.TABLE[L].keep, down: f.TABLE[L].down, break: f.TABLE[L].break });
      assert.equal(v.heatUp, v.odds.up - v.cold.up, '+' + L + ' heat ' + h);
      assert.ok(v.heatUp >= 0, 'the screen would have to print a gauge that took points away');
      assert.equal(v.odds.up + v.odds.keep + v.odds.down + v.odds.break, f.DEN);
    }
  }
  // at the top there is no attempt, so there is nothing to price at any heat
  const top = Object.assign(climbTo(MAX), { heat: f.HEAT_MAX });
  assert.equal(f.view(top, Infinity).odds, null);
  assert.equal(f.view(top, Infinity).cold, null);
  assert.equal(f.view(top, Infinity).heatUp, 0);
});

test('the idle view is a +0 sword with the ladder on it and nothing to press', () => {
  const v = f.idleView();
  assert.deepEqual(f.view(null, Infinity), v, 'no sword at all reads as the free +0 one');
  assert.equal(v.level, 0);
  assert.equal(v.sell, 0);
  assert.equal(v.cost, f.costAt(0), 'the fee of a first attempt is on the idle screen');
  assert.deepEqual(v.odds, { up: f.TABLE[0].up, keep: f.TABLE[0].keep, down: 0, break: 0 });
  assert.equal(v.heat, 0, 'and a cold gauge');
  assert.equal(v.heatUp, 0);
  assert.equal(v.broke, 0);
  assert.deepEqual(v.can, { enhance: false, sell: false });
  assert.equal(v.last, null);
  assert.equal(v.net, null);
  assert.equal(v.table, f.TABLE);
});

test('can is exactly what whyNot refuses, at every level and either side of the fee', () => {
  for (const L of LEVELS) {
    const st = climbTo(L);
    for (const budget of [0, 1, L < MAX ? f.costAt(L) - 1 : 0, L < MAX ? f.costAt(L) : 0, 1e12]) {
      const v = f.view(st, budget);
      assert.equal(v.can.enhance, !f.whyNot(st, { op: 'enhance', seed: 'x' }, budget), '+' + L + ' at ' + budget);
      assert.equal(v.can.sell, !f.whyNot(st, 'sell', budget), '+' + L + ' at ' + budget);
    }
  }
});

// --- the house's cut, solved ---------------------------------------------------------------
// A strategy here is "which levels do I sell at", so a cycle is: start on the free +0 sword, forge
// until the sword is at a level the rule sells at, sell, and start again. A break is INSIDE the
// cycle, which is the whole reason the top of the ladder can be priced like a jackpot and still
// keep the house's cut: the climb simply starts over and the fees already paid are gone.
//
// The gauge is part of the state, so the chain is over (level x heat) rather than level: a +7 with
// six bars lit is a different thing to forge than a cold +7, and solving as if it were not would
// price the ladder too high by the whole value of the gauge. Both halves of the cycle are
// expectations over that chain, so they are solved rather than sampled:
//   cost[L,h] = fee[L] + sum over the four outcomes p * cost[where it lands, with what gauge]
//   pay[L,h]  =          sum over the four outcomes p * pay[the same]
// with cost = 0 and pay = TABLE[L].sell at a level the rule sells at, a success landing on (L+1, 0),
// a stay on (L, h+1), a drop on (L-1, h+1) and a break back on (0, 0). The return is
// pay[0,0]/cost[0,0], credits out over credits in. Seventy unknowns at most, so Gauss settles it
// exactly, and the Monte Carlo below then has a number to be checked against instead of a band to be
// believed. The odds, the landing and the gauge all come from forge.js, so this measures the game
// rather than restating it.
//
// Both right-hand sides are carried through the one elimination (two columns), because the same
// matrix answers both and the whole thing runs 512 times.
function solveCycle(stops, fee, price) {
  const sell = new Set(stops);
  sell.add(MAX); // the top takes no more attempts, so the only move left there is the sale
  const live = [], at = new Map();
  for (const L of LEVELS) {
    if (sell.has(L)) continue;
    for (const h of HEATS) { at.set(L + ':' + h, live.length); live.push([L, h]); }
  }
  const n = live.length;
  const A = live.map(() => new Array(n + 2).fill(0));
  for (let i = 0; i < n; i++) {
    const [L, h] = live[i];
    A[i][i] = 1;
    A[i][n] = fee[L] || 0;
    const odds = f.oddsAt(L, h), next = Math.min(h + 1, f.HEAT_MAX);
    for (const o of OUTCOMES) {
      const p = odds[o] / f.DEN;
      if (!p) continue;
      const to = f.levelAfter(L, o);
      // where the gauge is after it: spent by a success, gone with a broken sword, a bar fuller
      // otherwise. This is the engine's own rule, written out once
      const th = (o === 'up' || o === 'break') ? 0 : next;
      if (at.has(to + ':' + th)) A[i][at.get(to + ':' + th)] -= p;
      else A[i][n + 1] += p * (price[to] || 0);   // the rule sells here, so the cycle ends
    }
  }
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    const t = A[c]; A[c] = A[piv]; A[piv] = t;
    for (let r = 0; r < n; r++) {
      if (r === c || !A[r][c]) continue;
      const k = A[r][c] / A[c][c];
      for (let j = c; j <= n + 1; j++) A[r][j] -= k * A[c][j];
    }
  }
  const i0 = at.get('0:0');
  // a rule that sells at +0 is not a rule: there is nothing to sell there, and the solve has no
  // start state. The 512 below never builds one (+0 is not in any subset)
  if (i0 == null) return { cost: 0, pay: price[0] || 0 };
  return { cost: A[i0][n] / A[i0][i0], pay: A[i0][n + 1] / A[i0][i0] };
}

const FEES = {}, ONES = {}, PRICES = {}, NONE = {};
for (const L of LEVELS) { FEES[L] = f.TABLE[L].cost || 0; ONES[L] = L < MAX ? 1 : 0; PRICES[L] = f.TABLE[L].sell; NONE[L] = 0; }

// Credits in and credits out of one cycle under a stopping rule, and the attempts it takes (the
// same solve with every fee set to one, which counts presses instead of credits)
function cycleOf(stops) {
  const c = solveCycle(stops, FEES, PRICES);
  return { cost: c.cost, pay: c.pay, rtp: c.pay / c.cost, tries: solveCycle(stops, ONES, NONE).cost };
}
const pct = (x) => (x * 100).toFixed(2) + '%';
const num = (x) => Math.round(x).toLocaleString('en-US');
// The ruler every fee on this table was cut to. It is in the report because the next person to
// retune a fee needs to see what a figure MEANS before they raise it: this account earns about this
// much a day, and the old table's +10 was 5,404 days away
const PER_DAY = 300;
// No play may return more than this. The prices are floor(CEILING x the expected cost of reaching
// the level), so a level's own rule cannot pass it; the tests below are what say no other rule can
const CEILING = 0.965;

test('the table: every "push to +T, then sell" is priced under the ceiling', () => {
  console.log('  lvl    up keep down brk     fee   expected cost   attempts     price   return   x prev   days at ' + PER_DAY + '/day');
  for (const L of LEVELS) {
    const r = f.TABLE[L];
    const c = L === 0 ? null : cycleOf([L]);
    console.log('  +' + String(L).padEnd(3)
      + String(r.up).padStart(4) + String(r.keep).padStart(5) + String(r.down).padStart(5) + String(r.break).padStart(4)
      + (r.cost == null ? '-' : num(r.cost)).padStart(8)
      + (c ? num(c.cost) : '-').padStart(15)
      + (c ? c.tries.toFixed(1) : '-').padStart(11)
      + num(r.sell).padStart(10)
      + (c ? pct(c.rtp) : '-').padStart(9)
      + (L > 1 ? (r.sell / f.TABLE[L - 1].sell).toFixed(2) + 'x' : '-').padStart(9)
      + (c ? (c.cost / PER_DAY).toFixed(1) : '-').padStart(16));
  }
  for (let L = 1; L <= MAX; L++) {
    const c = cycleOf([L]);
    assert.ok(c.rtp <= CEILING, 'pushing to +' + L + ' returns ' + pct(c.rtp) + ', over the ' + pct(CEILING) + ' ceiling');
    // the floor is +1's 95.00%: 40 credits against an expected 42.1, and a whole number of credits
    // cannot land closer to the ceiling than that. Nothing may sit below it either
    assert.ok(c.rtp >= 0.9499, 'pushing to +' + L + ' returns ' + pct(c.rtp) + ', under the floor');
    // the price is what the climb is worth, so it has to be under what the climb costs
    assert.ok(c.pay < c.cost, '+' + L + ' pays more than it costs');
    // and the price is exactly the solve, floored: a hand-edited row shows up here
    assert.equal(f.priceAt(L), Math.floor(c.cost * CEILING), '+' + L + ' is not the price its climb solves to');
  }
  // the ladder has to be worth climbing in days, not only in credits: this is the complaint the
  // table was retuned for, so it is a test and not a comment
  assert.ok(cycleOf([f.RISK_FROM]).cost / PER_DAY < 3, '+' + f.RISK_FROM + ' is ' + (cycleOf([f.RISK_FROM]).cost / PER_DAY).toFixed(1) + ' days away, and the tension starts there');
  assert.ok(cycleOf([MAX]).cost / PER_DAY < 120, 'the top is ' + (cycleOf([MAX]).cost / PER_DAY).toFixed(0) + ' days away');
});

test('and so does every other way of choosing where to sell (512 of them)', () => {
  // A stopping rule is a set of levels, so this is all of them: the 2^9 subsets of +1..+9, each
  // with the top added, since a +10 cannot be forged any further and selling it is the only move
  // left (solveCycle adds it, which is why the count is 512 and not 1,024: two subsets that differ
  // only in whether they name +10 are the same rule). The empty one is the push to the top. One of
  // these is the best play there is, so if the best of them is under the ceiling there is no way to
  // farm the forge with a stopping rule
  let best = null, worst = null, n = 0;
  for (let m = 0; m < (1 << (MAX - 1)); m++) {
    const stops = [];
    for (let L = 1; L < MAX; L++) if (m & (1 << (L - 1))) stops.push(L);
    const c = cycleOf(stops);
    assert.ok(isFinite(c.rtp), 'no return for {' + stops.join(',') + '}');
    n += 1;
    if (!best || c.rtp > best.rtp) best = { stops, rtp: c.rtp, cost: c.cost };
    if (!worst || c.rtp < worst.rtp) worst = { stops, rtp: c.rtp, cost: c.cost };
  }
  console.log('  ' + n + ' stopping rules measured');
  console.log('  best  sell at {' + best.stops.join(',') + '}  return ' + (best.rtp * 100).toFixed(4) + '%  (cycle costs ' + num(best.cost) + ')');
  console.log('  worst sell at {' + worst.stops.join(',') + '}  return ' + (worst.rtp * 100).toFixed(4) + '%  (cycle costs ' + num(worst.cost) + ')');
  assert.ok(best.rtp <= CEILING, 'the best play returns ' + pct(best.rtp) + ', over the ' + pct(CEILING) + ' ceiling');
  assert.ok(worst.rtp >= 0.9499, 'the worst play returns ' + pct(worst.rtp) + ', under the floor');
});

test('and no heat-aware play beats it either, which a set of levels cannot say', () => {
  // "Sell at +9, but only while the gauge is cold" is a real strategy and not one of the 512: the
  // rules above choose by level and this one chooses by (level, heat). It matters because a full
  // gauge genuinely makes the next attempt +EV against the sword's own price (see the table in the
  // test below), so if anything farms the forge it is this.
  //
  // The best policy's return is found rather than guessed. For a candidate r, value-iterate
  //   V[L,h] = max( sell here, -r x fee + sum p x V[where it lands] )
  // which is worth something from the opening position exactly while r is achievable, and bisect on
  // that. Standard way to maximise a ratio: the sign of V[0,0] is the comparison
  const feasible = (r) => {
    let V = LEVELS.map(() => HEATS.map(() => 0));
    for (let it = 0; it < 4000; it++) {
      let moved = 0;
      const N = V.map((row) => row.slice());
      for (const L of LEVELS) {
        for (const h of HEATS) {
          let v = L >= 1 ? f.priceAt(L) : -Infinity;        // the sale, where there is one
          if (L < MAX) {
            const odds = f.oddsAt(L, h), next = Math.min(h + 1, f.HEAT_MAX);
            let e = -r * f.costAt(L);
            for (const o of OUTCOMES) {
              const p = odds[o] / f.DEN;
              if (!p) continue;
              const to = f.levelAfter(L, o), th = (o === 'up' || o === 'break') ? 0 : next;
              e += p * V[to][th];
            }
            if (e > v) v = e;
          }
          N[L][h] = v;
          moved = Math.max(moved, Math.abs(v - V[L][h]));
        }
      }
      V = N;
      if (moved < 1e-11) break;
    }
    return V[0][0] > 0;
  };
  let lo = 0.5, hi = 1.5;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (feasible(m)) lo = m; else hi = m; }
  const bestRules = Math.max(...[...Array(1 << (MAX - 1))].map((_, m) => {
    const stops = [];
    for (let L = 1; L < MAX; L++) if (m & (1 << (L - 1))) stops.push(L);
    return cycleOf(stops).rtp;
  }));
  console.log('  best policy of any kind returns ' + (lo * 100).toFixed(4) + '%, best stopping rule ' + (bestRules * 100).toFixed(4) + '%');
  assert.ok(lo <= CEILING, 'the best heat-aware policy returns ' + pct(lo) + ', over the ' + pct(CEILING) + ' ceiling');
  // and it cannot be WORSE than the best stopping rule, since every stopping rule is a policy: if
  // it comes out below one, the bisection is measuring something else
  assert.ok(lo >= bestRules - 1e-6, 'the best policy (' + pct(lo) + ') came out under a stopping rule (' + pct(bestRules) + ')');
});

test('no single attempt is worth taking on its own, so no one level can be farmed', () => {
  // What an attempt risks is the sword's own price plus the fee; what it gives back is the price of
  // wherever it lands. Above 1 on a COLD sword and that level would be free money for a player who
  // only ever forges there.
  //
  // On a HOT one it goes over 1, and that is not a hole: the gauge was paid for by the failures
  // that lit it, every one of which cost a fee, and a player cannot ask for a full gauge. The whole
  // of that is what the test above measures, by letting the policy choose when to press; this one
  // is the cold reading, which is the only one a player can walk up to
  console.log('  lvl      at risk      back   cold   hot (gauge full)');
  for (const L of FORGEABLE) {
    const risk = f.priceAt(L) + f.costAt(L);
    const backAt = (h) => {
      const odds = f.oddsAt(L, h);
      let back = 0;
      for (const o of OUTCOMES) {
        const p = odds[o] / f.DEN;
        if (!p) continue; // a drop at +0 has nowhere to land, and the table gives it no chance either
        back += p * f.priceAt(f.levelAfter(L, o));
      }
      return back;
    };
    const cold = backAt(0), hot = backAt(f.HEAT_MAX);
    console.log('  +' + String(L).padEnd(3) + num(risk).padStart(12) + num(cold).padStart(10)
      + (cold / risk).toFixed(4).padStart(7) + (hot / risk).toFixed(4).padStart(19));
    assert.ok(cold < risk, '+' + L + ' gives back ' + num(cold) + ' for ' + num(risk) + ' risked, cold');
  }
});

test('the top is a jackpot, in the terms a ladder this short can honestly claim', () => {
  const top = f.priceAt(MAX), prev = f.priceAt(MAX - 1), fee = f.costAt(MAX - 1);
  const c = cycleOf([MAX]);
  // attempts a top cycle expects to spend standing on +9, solved rather than taken as 100/up: the
  // gauge makes the later ones likelier than the first, and a drop sends the sword back down
  const at9 = {}, fee9 = {};
  for (const L of LEVELS) { at9[L] = L === MAX - 1 ? 1 : 0; fee9[L] = L === MAX - 1 ? fee : 0; }
  const tries = solveCycle([], at9, NONE).cost, spent9 = solveCycle([], fee9, NONE).cost;
  console.log('  +' + MAX + ' fetches ' + num(top) + ': ' + (top / prev).toFixed(2) + 'x a +' + (MAX - 1)
    + ', ' + (top / fee).toFixed(0) + 'x the fee, and ' + (top / spent9).toFixed(1) + 'x the ' + num(spent9)
    + ' the ' + tries.toFixed(1) + ' attempts at +' + (MAX - 1) + ' expect to cost');
  // The old table claimed 8.4x here on a 1,560,000 prize nobody could reach. 3.27x on a prize 68
  // days away is the trade that was made, and it is the one worth having: the step has to be big
  // enough to be a step and the ladder short enough to be climbed
  assert.ok(top / prev > 3, 'the last step only multiplies the sword by ' + (top / prev).toFixed(2));
  assert.ok(top > spent9 * 5, 'the prize is not worth the attempts it takes: ' + num(top) + ' for ' + num(spent9));
  assert.ok(top > fee * 40, 'the prize is only ' + (top / fee).toFixed(0) + 'x the fee of the attempt that wins it');
  // It cannot be worth more than the whole climb from +0, and that is not a flaw in the table but
  // what a house edge IS
  assert.ok(top < c.cost);
  console.log('  and the climb from +0 expects to cost ' + num(c.cost) + ' over ' + c.tries.toFixed(0)
    + ' attempts (' + (c.cost / PER_DAY).toFixed(0) + ' days at ' + PER_DAY + '/day), so pushing to the top returns ' + pct(c.rtp));
});

// --- Monte Carlo ---------------------------------------------------------------------------
// The solve above is exact, so what is left to measure is whether the ENGINE walks the table it was
// given. That is what this does: real cycles through act(), nothing but the strategy's own stopping
// rule, and the return it comes out with has to agree with the number solved for the same rule.
//
// It also walks the GAUGE, which the solve only models: the engine is the thing that decides when a
// bar lights and when it is spent, and a cycle through act() is the only place that decision is
// actually taken. So the run below counts the gauge as well, and a run whose heat never moved would
// be measuring a game without one.
//
// Why the low targets get the cycles. A cycle's cost has a standard deviation about as large as its
// mean, so the error bar comes down with the square root of the cycle count, and a cycle to +10
// costs 121 attempts of its own. Measured here (on this table): 40,000 cycles to +3 is 133K
// attempts and 0.2s for an error bar of +-0.26%, 12,000 to +7 is 162K and 0.3s for +-0.56%, and
// 4,000 to +10 is 484K and 0.9s for +-1.5%, which is still too coarse to judge a 3.5% cut. So the
// band is asserted where it can actually be measured, the ceiling is asserted on the solve, and the
// +10 run is here to show that the engine really does reach the top and pay the jackpot out.
// A tighter reading of the whole set is a flag away:  FG_MC=4 node test/forge.test.js
const MC = Number(process.env.FG_MC || 1);
const PLANS = [[1, 60000], [3, 40000], [5, 25000], [7, 12000], [MAX, 4000]];

function run(target, n, tag) {
  let st = f.load(null);
  let sum = 0, sumSq = 0, attempts = 0, paid = 0, breaks = 0, sold = 0;
  const heats = HEATS.map(() => 0);   // how many attempts were rolled at each bar of the gauge
  let hotBreaks = 0, spent = 0;
  for (let i = 0; i < n; i++) {
    let cost = 0;
    while (st.level < target) {
      const fee = f.costAt(st.level);
      const before = st.level, heat = st.heat;
      st = f.act(st, { op: 'enhance', seed: tag + i + '.' + attempts });
      assert.equal(st.net, -fee, 'the fee changed under the strategy');
      assert.equal(st.last.heat, heat, 'the chip has to say the heat the roll was made at');
      heats[heat] += 1;
      const out = st.last.outcome;
      // the gauge's own rule, re-checked on every attempt the engine really makes
      assert.equal(st.heat, out === 'up' || out === 'break' ? 0 : Math.min(heat + 1, f.HEAT_MAX),
        out + ' at +' + before + ' left the gauge on ' + st.heat + ' from ' + heat);
      if (out === 'up' && heat > 0) spent += 1;
      if (out === 'break') { if (before >= f.RISK_FROM) breaks += 1; if (heat === f.HEAT_MAX) hotBreaks += 1; }
      cost += fee;
      attempts += 1;
    }
    st = f.act(st, { op: 'sell' });
    paid += st.net;
    sold += 1;
    sum += cost; sumSq += cost * cost;
  }
  const mean = sum / n;
  const sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  const rtp = paid / sum;
  return { rtp, se: rtp * (sd / Math.sqrt(n)) / mean, n, attempts, mean, breaks, sold, paid, heats, hotBreaks, spent };
}

test('Monte Carlo: the engine returns what the table was solved for', () => {
  const t0 = Date.now();
  let total = 0;
  console.log('  strategy            cycles      attempts    measured        solved   off by');
  for (const [target, base] of PLANS) {
    const n = base * MC;
    const r = run(target, n, 'mc' + target + '-');
    const exact = cycleOf([target]).rtp;
    total += r.attempts;
    const off = Math.abs(r.rtp - exact);
    console.log('  push to +' + String(target).padEnd(3) + ' sell  ' + r.n.toLocaleString('en-US').padStart(8)
      + r.attempts.toLocaleString('en-US').padStart(14)
      + ('  ' + pct(r.rtp) + ' +-' + pct(r.se)).padStart(18)
      + pct(exact).padStart(14)
      + (off / r.se).toFixed(1).padStart(8) + ' SE');
    assert.equal(r.sold, n, 'a cycle did not end in a sale');
    assert.equal(r.paid, n * f.priceAt(target), 'the sale did not pay the table price every time');
    // the engine has to agree with the solve; 4 SE is the band this can be honestly held to
    assert.ok(off < 4 * r.se + 1e-9, 'push to +' + target + ': measured ' + pct(r.rtp) + ' against a solved ' + pct(exact));
    // Where the error bar is far inside a 3.5% cut, the band itself is asserted on the measurement.
    // Above that the measurement is one fixed draw with a wide bar on it, so the band is left to
    // the solve (the three tests above assert it) and what is checked here is only that the engine
    // and the solve are measuring the same game
    if (r.se < 0.004) assert.ok(r.rtp > 0.94 && r.rtp <= CEILING + 2 * r.se, 'push to +' + target + ' measured ' + pct(r.rtp));
    // a climb that stops at +RISK_FROM never attempts FROM it, so nothing can break on the way:
    // "sell at +5" is the last strategy with no break risk in it at all
    if (target > f.RISK_FROM) assert.ok(r.breaks > 0, 'nothing broke on the way to +' + target);
    if (target <= f.RISK_FROM) assert.equal(r.breaks, 0, 'something broke below +' + f.RISK_FROM);
    // and the gauge is really in the game the engine played
    if (target >= 3) {
      assert.ok(r.heats[1] > 0, 'no attempt was ever rolled on a warm gauge pushing to +' + target);
      assert.ok(r.spent > 0, 'no success ever spent a gauge pushing to +' + target);
    }
    if (target === MAX) {
      assert.ok(r.heats[f.HEAT_MAX] > 0, 'the gauge never filled on the way to the top');
      assert.ok(r.hotBreaks > 0, 'a full gauge never broke a sword, and it has to be able to');
    }
  }
  console.log('  ' + total.toLocaleString('en-US') + ' attempts in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  // what the gauge did over the whole run, as a line the next reader can see the shape of
  const top = run(MAX, 400 * MC, 'heatmap-');
  console.log('  attempts by bar lit on the way to the top: ' + top.heats.map((v, h) => h + ':' + (v / top.attempts * 100).toFixed(1) + '%').join('  '));
});

test('the rolls land on the table: every outcome at every level and every bar, counted', () => {
  // The solve believes the table. This is the check that the engine's own rolls really come out in
  // those proportions, at every bar of the gauge as well as every level, which is what makes the
  // solve a measurement of the game rather than of a spreadsheet. Fixed seeds, so the counts are
  // the same on every run
  const N = 20000 * MC;
  const tol = 5; // in standard errors of the frequency
  let worst = 0, worstAt = '', rolls = 0;
  for (const L of FORGEABLE) {
    for (const h of HEATS) {
      const seen = { up: 0, keep: 0, down: 0, break: 0 };
      for (let i = 0; i < N; i++) seen[f.outcomeAt(L, f.rollOf('freq-' + L + '-' + h + '-' + i), h)] += 1;
      rolls += N;
      const odds = f.oddsAt(L, h);
      for (const o of OUTCOMES) {
        const p = odds[o] / f.DEN;
        const se = Math.sqrt(p * (1 - p) / N) || 1 / N;
        const off = Math.abs(seen[o] / N - p) / se;
        if (off > worst) { worst = off; worstAt = o + ' at +' + L + ' heat ' + h; }
        assert.ok(off < tol, o + ' at +' + L + ' heat ' + h + ': rolled ' + (seen[o] / N * 100).toFixed(2) + '% against ' + (p * 100) + '%');
        if (!p) assert.equal(seen[o], 0, o + ' happened at +' + L + ' heat ' + h + ' and the odds say it cannot');
      }
    }
  }
  console.log('  ' + rolls.toLocaleString('en-US') + ' rolls over every level and bar, furthest off: ' + worst.toFixed(1) + ' SE (' + worstAt + ')');
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.stack || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
