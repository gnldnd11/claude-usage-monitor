// Red dog: the table, the rank arithmetic, the two settled-at-the-deal branches, and what the
// house keeps over every way of playing it. No dependencies: node's assert only.
// Run: node test/reddog.test.js
'use strict';
const assert = require('assert/strict');
const path = require('path');
const rd = require(path.join(__dirname, '..', 'reddog.js'));
const C = require(path.join(__dirname, '..', 'cards.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const MAX = rd.MAX_SPREAD;
const LEFT = rd.LEFT;
const PER = rd.PER_RANK;
const SPREADS = [];
for (let s = 1; s <= MAX; s++) SPREADS.push(s);

const snapshot = (st) => JSON.stringify(st);
const pct = (n) => (n * 100).toFixed(4) + '%';
const num = (n) => n.toLocaleString('en-US');
const raise = (st) => rd.act(st, { op: 'raise' });
const stand = (st) => rd.act(st, { op: 'stand' });

// A card name for a rank order (0 is a two, 12 is an ace), so a test can name an opening by its
// spread instead of by its ranks
function nameOf(order, suit) {
  return C.RANKS[(order + 1) % 13] + (suit || 'S');
}
// A shoe stacked to give exactly this opening and this third card
function stacked(o1, o2, o3) {
  return [nameOf(o1, 'S'), nameOf(o2, 'H'), nameOf(o3, 'D')];
}
const dealStack = (stack, bet) => rd.newRound({ seed: 'stack', id: 'round-1', bet: bet == null ? 10 : bet, stack });
const deal = (bet, seed) => rd.newRound({ seed: seed == null ? 'seed' : seed, id: 'round-1', bet: bet == null ? 10 : bet });

// --- the exact solve ---------------------------------------------------------------------------
//
// Every figure below is an integer. One "unit" is one two-card opening paired with one of the LEFT
// cards that could follow it, so an opening of count c contributes c * LEFT units however it ends.
// A strategy is a set of spreads the player raises on, and the raise doubles both what is staked
// and what comes back, which is why it is a reweighting rather than a separate bet.
function solve(mask, pairOdds, spreadOdds) {
  const pairCt = rd.dealChance('pair').num;
  const consecCt = rd.dealChance('consecutive').num;
  let staked = (pairCt + consecCt) * LEFT;
  // a pair: the matching third card pays, every other third card pushes the wager back
  let paid = consecCt * LEFT + pairCt * ((PER - 2) * (1 + pairOdds) + (LEFT - (PER - 2)) * 1);
  for (const s of SPREADS) {
    const ct = rd.dealChance('spread', s).num;
    const w = (mask & (1 << (s - 1))) ? 2 : 1;
    const inside = PER * s;
    staked += ct * LEFT * w;
    paid += ct * inside * w * (1 + spreadOdds[s - 1]);
  }
  return { paid, staked, rtp: paid / staked };
}
const TABLE_ODDS = rd.SPREAD_ODDS.slice();

// --- the table ---------------------------------------------------------------------------------

test('the table is a row per spread, and the odds never climb with the spread', () => {
  assert.equal(rd.DECKS, 6);
  assert.equal(rd.SHOE, 312);
  assert.equal(PER, 24);
  assert.equal(LEFT, 310);
  assert.equal(MAX, 11);
  assert.equal(rd.COMBOS, 48516);
  assert.equal(rd.PAIR_ODDS, 9);
  assert.deepEqual(TABLE_ODDS, [5, 4, 2, 1, 1, 1, 1, 1, 1, 1, 1]);
  for (const s of SPREADS) {
    const o = rd.oddsAt(s);
    assert.ok(Number.isSafeInteger(o) && o >= 1, 'spread ' + s + ' pays ' + o);
    if (s > 1) assert.ok(o <= rd.oddsAt(s - 1), 'the odds climb at spread ' + s);
    // the chance is exact and never a certainty
    const c = rd.chanceAt(s);
    assert.deepEqual(c, { num: PER * s, den: LEFT });
    assert.ok(c.num < c.den, 'spread ' + s + ' cannot miss');
  }
  assert.equal(rd.oddsAt(0), null);
  assert.equal(rd.oddsAt(MAX + 1), null);
  assert.equal(rd.chanceAt(0), null);
});

test('rank order puts the ace on top and the two at the bottom', () => {
  const seen = new Set();
  for (let i = 0; i < 13; i++) {
    const code = C.codeOf(C.RANKS[i] + 'S');
    const o = rd.orderOf(code);
    assert.ok(Number.isInteger(o) && o >= 0 && o < 13, C.RANKS[i] + ' -> ' + o);
    seen.add(o);
  }
  assert.equal(seen.size, 13, 'two ranks share an order');
  assert.equal(rd.orderOf(C.codeOf('2S')), 0);
  assert.equal(rd.orderOf(C.codeOf('10S')), 8);
  assert.equal(rd.orderOf(C.codeOf('JS')), 9);
  assert.equal(rd.orderOf(C.codeOf('AS')), 12);
  // suits never matter
  for (const s of C.SUITS) assert.equal(rd.orderOf(C.codeOf('QS')), rd.orderOf(C.codeOf('Q' + s)));
  // and the spread between two cards is the ranks strictly between them, -1 for a pair
  assert.equal(rd.spreadOf(C.codeOf('2S'), C.codeOf('AS')), 11);
  assert.equal(rd.spreadOf(C.codeOf('AS'), C.codeOf('2S')), 11);
  assert.equal(rd.spreadOf(C.codeOf('5S'), C.codeOf('6H')), 0);
  assert.equal(rd.spreadOf(C.codeOf('5S'), C.codeOf('7H')), 1);
  assert.equal(rd.spreadOf(C.codeOf('KS'), C.codeOf('AH')), 0);
  assert.equal(rd.spreadOf(C.codeOf('QS'), C.codeOf('AH')), 1);
  assert.equal(rd.spreadOf(C.codeOf('9S'), C.codeOf('9H')), -1);
});

test('the openings are counted, not assumed', () => {
  // The solve weighs every opening by how many two-card combinations make it. This counts them by
  // walking every pair in a real 312-card shoe, so a wrong count anywhere cannot match
  const shoe = C.freshShoe();
  assert.equal(shoe.length, rd.SHOE);
  const seen = { pair: 0, consecutive: 0 };
  for (const s of SPREADS) seen[s] = 0;
  let total = 0;
  for (let i = 0; i < shoe.length; i++) {
    for (let j = i + 1; j < shoe.length; j++) {
      const sp = rd.spreadOf(shoe[i], shoe[j]);
      if (sp < 0) seen.pair += 1;
      else if (sp === 0) seen.consecutive += 1;
      else seen[sp] += 1;
      total += 1;
    }
  }
  assert.equal(total, rd.COMBOS);
  assert.equal(seen.pair, rd.dealChance('pair').num, 'pairs');
  assert.equal(seen.consecutive, rd.dealChance('consecutive').num, 'consecutive');
  for (const s of SPREADS) assert.equal(seen[s], rd.dealChance('spread', s).num, 'spread ' + s);
  console.log('  ' + num(total) + ' openings: ' + pct(seen.pair / total) + ' pairs, '
    + pct(seen.consecutive / total) + ' consecutive, the rest a spread');
});

test('the win chance of a spread is counted off a real shoe', () => {
  // Claimed: PER * spread of the LEFT cards, because neither card that is up can be a rank between
  // them. Counted here for every rank pair there is
  for (let lo = 0; lo < 13; lo++) {
    for (let hi = lo + 2; hi < 13; hi++) {
      const spread = hi - lo - 1;
      const a = C.codeOf(nameOf(lo, 'S')), b = C.codeOf(nameOf(hi, 'H'));
      let inside = 0, left = 0;
      const shoe = C.freshShoe();
      let droppedA = false, droppedB = false;
      for (const code of shoe) {
        if (!droppedA && code === a) { droppedA = true; continue; }
        if (!droppedB && code === b) { droppedB = true; continue; }
        left += 1;
        const o = rd.orderOf(code);
        if (o > lo && o < hi) inside += 1;
      }
      assert.equal(left, LEFT, 'the shoe left the wrong number of cards');
      assert.deepEqual({ num: inside, den: left }, rd.chanceAt(spread), 'spread ' + spread);
    }
  }
  // and a pair's third card: PER - 2 of the LEFT, since two of that rank are already up
  assert.deepEqual(rd.PAYS[0].chance, { num: PER - 2, den: LEFT });
});

// --- what the house keeps ----------------------------------------------------------------------

test('every spread\'s return per credit staked, and why raising is a choice at all', () => {
  // A round at spread s returns (1 + odds) * chance per credit staked, whether or not it was
  // raised. Those numbers are what the raise decision is about, and the table prints them
  console.log('  spread  odds   win chance   per credit staked   share of rounds');
  for (const s of SPREADS) {
    const c = rd.chanceAt(s);
    const r = ((1 + rd.oddsAt(s)) * c.num) / c.den;
    const d = rd.dealChance('spread', s);
    console.log('  ' + String(s).padStart(5) + String(rd.oddsAt(s) + ':1').padStart(7)
      + pct(c.num / c.den).padStart(13) + pct(r).padStart(20) + pct(d.num / d.den).padStart(18)
      + (r > 1 ? '   worth raising' : ''));
    // raising is worth it exactly where this is over 1, and that is spread 7 up
    assert.equal(r > 1, s >= 7, 'spread ' + s + ' returns ' + pct(r));
  }
  const pairR = ((PER - 2) * (1 + rd.PAIR_ODDS) + (LEFT - (PER - 2))) / LEFT;
  console.log('  a pair returns ' + pct(pairR) + ' per credit staked (a match pays, a miss pushes), '
    + 'and a consecutive pair returns exactly 100%');
  assert.ok(pairR > 1, 'the pair branch is the player\'s side of this game');
});

test('all 2,048 ways of choosing where to raise, solved exactly', () => {
  // The pass condition for this game. Every subset of the eleven spreads is a strategy; the best
  // one must land inside the casino's band, and no strategy may do better than the band's top
  const seen = [];
  let best = null, worst = null, inBand = 0;
  for (let mask = 0; mask < (1 << MAX); mask++) {
    const r = solve(mask, rd.PAIR_ODDS, TABLE_ODDS);
    assert.ok(Number.isSafeInteger(r.paid) && Number.isSafeInteger(r.staked), 'the solve left integer arithmetic');
    seen.push(r.rtp);
    if (100 * r.paid >= 96 * r.staked && 100 * r.paid <= 97 * r.staked) inBand += 1;
    if (!best || r.rtp > best.rtp) best = Object.assign({ mask }, r);
    if (!worst || r.rtp < worst.rtp) worst = Object.assign({ mask }, r);
  }
  assert.equal(seen.length, 2048);
  const spreadsOf = (mask) => SPREADS.filter((s) => mask & (1 << (s - 1)));
  console.log('  best   raise {' + spreadsOf(best.mask).join(',') + '}  returns ' + pct(best.rtp));
  console.log('  worst  raise {' + spreadsOf(worst.mask).join(',') + '}  returns ' + pct(worst.rtp));
  console.log('  ' + inBand + ' of 2048 strategies land inside the band');
  // THE assertion: no play beats the band's top, and the best play is not under its floor
  assert.ok(100 * best.paid <= 97 * best.staked, 'the best play returns ' + pct(best.rtp) + ', over the band');
  assert.ok(100 * best.paid >= 96 * best.staked, 'the best play returns ' + pct(best.rtp) + ', under the band');
  // and it is the traditional line: raise from spread 7 up, which is where the per-credit return
  // crosses 1 in the table above
  assert.deepEqual(spreadsOf(best.mask), [7, 8, 9, 10, 11]);
  // The worst play is NOT raising everything, which is worth knowing: raising a spread pulls the
  // whole return toward that spread's own, so the worst play raises exactly the spreads that return
  // less than the result does. Spread 6 returns 92.9%, which is above this 82.1%, so raising it
  // helps even the player trying hardest to lose
  assert.deepEqual(spreadsOf(worst.mask), [1, 2, 3, 4, 5]);
  for (const s of spreadsOf(worst.mask)) {
    const c = rd.chanceAt(s);
    assert.ok(((1 + rd.oddsAt(s)) * c.num) / c.den < worst.rtp, 'spread ' + s + ' should drag the return down');
  }
  for (const s of SPREADS.filter((s2) => spreadsOf(worst.mask).indexOf(s2) < 0)) {
    const c = rd.chanceAt(s);
    assert.ok(((1 + rd.oddsAt(s)) * c.num) / c.den > worst.rtp, 'spread ' + s + ' should lift the return');
  }
  // The floor is NOT asserted over every strategy, and this is the number that says why: raising a
  // narrow spread is a bad bet at posted odds, and no whole-number table can make it otherwise
  // (see the flattening test below). What the game owes the player is the posted chance before the
  // choice, which view() carries
  assert.ok(worst.rtp < 0.96, 'if the worst play were in the band this test should be tightened');
});

test('a pair at 11 to 1 would be over the band, which is why it pays 9', () => {
  // The one place the traditional figure and the band disagree. Solved for each pair payout, with
  // the spread table left exactly traditional
  console.log('  pair odds   best play    in band');
  const inBand = [];
  for (let p = 6; p <= 12; p++) {
    let best = null;
    for (let mask = 0; mask < (1 << MAX); mask++) {
      const r = solve(mask, p, TABLE_ODDS);
      if (!best || r.rtp > best.rtp) best = r;
    }
    const ok = 100 * best.paid >= 96 * best.staked && 100 * best.paid <= 97 * best.staked;
    if (ok) inBand.push(p);
    console.log('  ' + String(p + ':1').padStart(9) + pct(best.rtp).padStart(12) + (ok ? '      yes' : '       no'));
  }
  assert.deepEqual(inBand, [8, 9], 'only 8 and 9 should keep the band');
  assert.ok(inBand.indexOf(rd.PAIR_ODDS) >= 0);
  assert.equal(rd.PAIR_ODDS, Math.max.apply(null, inBand), 'take the most generous of the two');
});

test('flattening the odds so every strategy is in the band costs the house the game', () => {
  // The header claims this, so it is measured rather than asserted by hand. The smallest whole
  // odds that bring spreads 1 to 4 near the band are 11, 5, 3 and 2. Those four spreads are 45% of
  // all rounds, and the result is a casino that pays out more than it takes even when a pair pays
  // nothing at all
  const FLAT = [11, 5, 3, 2, 1, 1, 1, 1, 1, 1, 1];
  for (const p of [0, rd.PAIR_ODDS]) {
    let best = null, worst = null;
    for (let mask = 0; mask < (1 << MAX); mask++) {
      const r = solve(mask, p, FLAT);
      if (!best || r.rtp > best.rtp) best = r;
      if (!worst || r.rtp < worst.rtp) worst = r;
    }
    console.log('  flattened, a pair paying ' + p + ':1 -> best ' + pct(best.rtp) + ', worst ' + pct(worst.rtp));
    assert.ok(best.rtp > 1, 'the flattened table would be beatable, so it is not an option');
  }
  // the share of rounds those four spreads carry, which is why the flattening is so expensive
  let share = 0;
  for (const s of [1, 2, 3, 4]) share += rd.dealChance('spread', s).num;
  console.log('  spreads 1 to 4 are ' + pct(share / rd.COMBOS) + ' of all rounds');
  assert.ok(share / rd.COMBOS > 0.4);
});

test('Monte Carlo: the engine plays the game the solve describes', () => {
  // The solve believes the table and the shoe. This is the check that the engine's own shuffles
  // really deal those openings and settle them that way. Fixed seeds, so the figures repeat
  const N = 200000;
  const BIG = 1000000;   // big enough that a whole-number payout is not the thing being measured
  const plans = [
    { name: 'raise 7 and up', mask: 0b11111000000 },
    { name: 'never raise', mask: 0 },
    { name: 'always raise', mask: 0b11111111111 }
  ];
  console.log('  strategy           rounds      measured       solved    off by');
  for (const plan of plans) {
    let paid = 0, staked = 0;
    const each = [];
    for (let i = 0; i < N; i++) {
      let st = deal(BIG, 'mc-' + plan.mask + '-' + i);
      const wager0 = rd.stake(st);
      if (st.phase === 'play') st = (plan.mask & (1 << (st.spread - 1))) ? raise(st) : stand(st);
      assert.equal(st.phase, 'done');
      paid += st.paid;
      staked += st.wager;
      each.push(st.paid / wager0);
      assert.equal(st.net, st.paid - st.wager);
    }
    const rtp = paid / staked;
    const exact = solve(plan.mask, rd.PAIR_ODDS, TABLE_ODDS).rtp;
    const mean = each.reduce((a, b) => a + b, 0) / N;
    let v = 0;
    for (const x of each) v += (x - mean) * (x - mean);
    const se = (rtp * (Math.sqrt(v / (N - 1)) / Math.sqrt(N))) / mean;
    console.log('  ' + plan.name.padEnd(18) + num(N).padStart(8)
      + (pct(rtp) + ' +-' + pct(se)).padStart(22) + pct(exact).padStart(13)
      + (Math.abs(rtp - exact) / se).toFixed(1).padStart(8) + ' SE');
    assert.ok(Math.abs(rtp - exact) < 4 * se + 1e-9, plan.name + ': measured ' + pct(rtp) + ' against ' + pct(exact));
  }
});

// --- the branches ------------------------------------------------------------------------------

test('consecutive ranks push at the deal, and no third card is dealt at all', () => {
  const st = dealStack([nameOf(5, 'S'), nameOf(6, 'H'), nameOf(0, 'D')]);
  assert.equal(st.kind, 'consecutive');
  assert.equal(st.spread, 0);
  assert.equal(st.phase, 'done');
  assert.equal(st.result, 'push');
  assert.equal(st.cards.length, 2, 'a third card was dealt for a push');
  assert.equal(st.pos, 2, 'the shoe moved further than the two cards it dealt');
  assert.equal(st.paid, 10);
  assert.equal(st.net, 0);
  assert.equal(rd.view(st).mult, 1);
  // there is nothing to decide, so both moves are refused
  assert.equal(rd.whyNot(st, 'raise'), 'the round is over');
  assert.equal(rd.whyNot(st, 'stand'), 'the round is over');
  // and an ace is consecutive with a king, not with a two
  assert.equal(dealStack([nameOf(11, 'S'), nameOf(12, 'H'), nameOf(0, 'D')]).kind, 'consecutive');
  assert.equal(dealStack([nameOf(12, 'S'), nameOf(0, 'H'), nameOf(5, 'D')]).spread, 11);
});

test('a pair deals its third card at once: its rank pays, anything else pushes', () => {
  const hit = dealStack([nameOf(7, 'S'), nameOf(7, 'H'), nameOf(7, 'D')]);
  assert.equal(hit.kind, 'pair');
  assert.equal(hit.spread, null);
  assert.equal(hit.phase, 'done');
  assert.equal(hit.result, 'win');
  assert.equal(hit.odds, rd.PAIR_ODDS);
  assert.equal(hit.cards.length, 3);
  assert.equal(hit.paid, 10 * (1 + rd.PAIR_ODDS));
  assert.equal(hit.net, 10 * rd.PAIR_ODDS);
  assert.equal(rd.view(hit).mult, 1 + rd.PAIR_ODDS);
  const miss = dealStack([nameOf(7, 'S'), nameOf(7, 'H'), nameOf(8, 'D')]);
  assert.equal(miss.result, 'push');
  assert.equal(miss.odds, null);
  assert.equal(miss.paid, 10);
  assert.equal(miss.net, 0);
  assert.equal(rd.view(miss).mult, 1);
  // a pair never offers the raise: there is nothing to decide, so the round is already over
  assert.equal(rd.whyNot(miss, 'raise'), 'the round is over');
  assert.equal(rd.view(miss).can.raise, false);
});

test('a spread pays its row inside and takes the wager outside, raised or not', () => {
  for (const s of SPREADS) {
    const lo = 0, hi = s + 1;
    const insideOrder = lo + 1;                       // always a rank between them
    const outsideOrder = hi + 1 <= 12 ? hi + 1 : lo - 1 >= 0 ? lo - 1 : 12;
    const odds = rd.oddsAt(s);
    // stand, and the third card lands inside
    const a = dealStack(stacked(lo, hi, insideOrder));
    assert.equal(a.kind, 'spread');
    assert.equal(a.spread, s);
    assert.equal(a.phase, 'play');
    assert.equal(rd.stake(a), 10);
    const aDone = stand(a);
    assert.equal(aDone.raised, false);
    assert.equal(aDone.wager, 10);
    assert.equal(aDone.result, 'win');
    assert.equal(aDone.paid, 10 * (1 + odds), 'spread ' + s + ' stood and won');
    assert.equal(aDone.net, 10 * odds);
    assert.equal(rd.view(aDone).mult, 1 + odds);
    // raise, and the same third card pays on the whole wager
    const bDone = raise(dealStack(stacked(lo, hi, insideOrder)));
    assert.equal(bDone.raised, true);
    assert.equal(bDone.wager, 20);
    assert.equal(bDone.paid, 20 * (1 + odds), 'spread ' + s + ' raised and won');
    assert.equal(bDone.net, 20 * odds);
    assert.equal(rd.view(bDone).mult, 1 + odds);
    // outside, and the wager is gone. Nothing else is: the loss is the wager, never more
    const cDone = stand(dealStack(stacked(lo, hi, outsideOrder)));
    assert.equal(cDone.result, 'lose');
    assert.equal(cDone.paid, 0);
    assert.equal(cDone.net, -10);
    assert.equal(rd.view(cDone).mult, 0);
    const dDone = raise(dealStack(stacked(lo, hi, outsideOrder)));
    assert.equal(dDone.paid, 0);
    assert.equal(dDone.net, -20);
  }
});

test('a third card equal to one of the two is outside, not inside', () => {
  // The spread is the ranks STRICTLY between, so matching one of the cards up is a loss. Easy to
  // get wrong, and a shoe has 23 more of each
  const lo = 3, hi = 8;
  for (const o of [lo, hi]) {
    const done = stand(dealStack(stacked(lo, hi, o)));
    assert.equal(done.spread, hi - lo - 1);
    assert.equal(done.result, 'lose', 'a third card of the same rank as a card up');
    assert.equal(done.paid, 0);
  }
  // and the ranks just inside both ends do win
  for (const o of [lo + 1, hi - 1]) {
    assert.equal(stand(dealStack(stacked(lo, hi, o))).result, 'win');
  }
});

// --- the state machine -------------------------------------------------------------------------

test('a fresh shoe every round, and nothing carries out of one', () => {
  const a = deal(10, 'shoe');
  assert.equal(a.shoe.length, rd.SHOE, 'the round did not get a whole shoe');
  assert.equal(new Set(a.shoe).size, 52, 'a 6-deck shoe is 52 distinct codes, six of each');
  // the same seed deals the same shoe, every time, with nothing left over from the last round
  assert.deepEqual(deal(10, 'shoe').cards, a.cards);
  assert.deepEqual(deal(10, 'shoe').shoe, a.shoe);
  // and the engine takes no shoe from the caller: the only way in is a stack, which is for tests
  const b = rd.newRound({ seed: 'shoe', bet: 10, deck: [1, 2, 3], carry: [1, 2, 3] });
  assert.deepEqual(b.shoe, a.shoe, 'something other than the seed decided the shoe');
  // the settled round hands back no shoe either, so a host cannot carry one by accident
  const done = stand(deal(10, 'spread-seed'));
  assert.equal('shoe' in rd.view(done), false);
  assert.equal('deck' in rd.view(done), false);
  assert.equal('pos' in rd.view(done), false);
});

test('act() never touches its input and hands the same object back when the move is refused', () => {
  // find a seed that opens on a spread, so there is something to decide
  let st = null;
  for (let i = 0; i < 1000 && !st; i++) {
    const s = deal(10, 'live-' + i);
    if (s.phase === 'play') st = s;
  }
  assert.ok(st, 'no seed in 1000 opened on a spread');
  const before = snapshot(st);
  raise(st);
  stand(st);
  assert.equal(snapshot(st), before, 'the live round was mutated');
  for (const op of [{ op: 'hit' }, 'fold', { op: 'raise', bet: 999 }]) {
    const why = rd.whyNot(st, op);
    if (why) assert.equal(rd.act(st, op), st, 'refused but returned a new state: ' + JSON.stringify(op));
  }
  assert.equal(rd.whyNot(st, 'hit'), 'unknown action');
  assert.equal(rd.whyNot(st, { op: 'fold' }), 'unknown action');
  assert.equal(rd.whyNot(null, 'raise'), 'the round is over');
  // both spellings of a move work, because the host may pass the op along either way
  assert.equal(rd.act(st, 'stand').phase, 'done');
  assert.equal(rd.act(st, { op: 'stand' }).phase, 'done');
  assert.equal(snapshot(st), before);
});

test('the raise is refused when the credits for it are not there', () => {
  const st = dealStack(stacked(0, 5, 1), 100);
  assert.equal(st.phase, 'play');
  assert.equal(rd.stake(st), 100);
  // the round's own wager is not yet out of the balance, so the room for a raise is budget - wager
  assert.equal(rd.whyNot(st, 'raise', 200), null);
  assert.equal(rd.whyNot(st, 'raise', 199), 'not enough credits');
  assert.equal(rd.whyNot(st, 'raise', 100), 'not enough credits');
  assert.equal(rd.whyNot(st, 'raise', NaN), 'not enough credits', 'a broken ledger must refuse');
  assert.equal(rd.whyNot(st, 'raise'), null, 'no budget given means no limit');
  // standing never costs anything, so it is never refused for money
  assert.equal(rd.whyNot(st, 'stand', 0), null);
  const v = rd.view(st, 199);
  assert.equal(v.can.raise, false);
  assert.equal(v.can.stand, true);
  // and once raised the wager is what the round holds
  const raised = raise(st);
  assert.equal(raised.wager, 200);
  assert.equal(rd.stake(raised), 200);
});

test('a bet too big to pay the top row exactly is refused', () => {
  const top = 2 * (1 + Math.max(rd.PAIR_ODDS, rd.SPREAD_ODDS[0]));
  const cap = Math.floor(Number.MAX_SAFE_INTEGER / top);
  assert.equal(deal(cap).bet, cap);
  assert.throws(() => deal(cap + 1), RangeError);
  assert.ok(Number.isSafeInteger(cap * top));
  for (const bad of [0, -1, 1.5, NaN, Infinity, '10', null, undefined]) {
    assert.throws(() => rd.newRound({ seed: 's', bet: bad }), RangeError, String(bad));
  }
});

// --- what the webview sees ---------------------------------------------------------------------

test('the seed is not in the view until the round is over, and the id is not the seed', () => {
  // a spread opening, so the round is live and the third card is still in the shoe
  let st = null;
  for (let i = 0; i < 1000 && !st; i++) {
    const s = rd.newRound({ seed: 'the-whole-shoe-' + i, id: 'public-name', bet: 10 });
    if (s.phase === 'play') st = s;
  }
  assert.ok(st);
  const live = rd.view(st);
  assert.equal('seed' in live, false, 'the seed was handed over while the round was live');
  assert.equal(live.id, 'public-name');
  assert.equal(JSON.stringify(live).indexOf('the-whole-shoe'), -1, 'the seed leaked through some other field');
  assert.equal(live.cards.length, 2, 'the third card does not exist yet');
  assert.equal(live.result, null);
  assert.equal(live.paid, null);
  assert.equal(live.mult, null);
  const done = rd.view(stand(st));
  assert.equal(done.seed, st.seed);
  assert.equal(done.cards.length, 3);
});

test('the view carries the whole rulebook and the row in hand', () => {
  for (const v of [rd.idleView(), rd.view(null), rd.view(dealStack(stacked(0, 5, 1))), rd.view(stand(dealStack(stacked(0, 5, 1))))]) {
    assert.equal(v.decks, 6);
    assert.equal(v.left, LEFT);
    assert.equal(v.pays.length, MAX + 2, 'a row per spread, plus the pair and the consecutive pair');
    let spreads = 0;
    for (const row of v.pays) {
      assert.ok(row.deal.den === rd.COMBOS, 'the deal chance is over every opening there is');
      if (row.kind === 'spread') {
        spreads += 1;
        assert.equal(row.odds, rd.oddsAt(row.spread));
        assert.deepEqual(row.chance, rd.chanceAt(row.spread));
      }
    }
    assert.equal(spreads, MAX);
    // every opening accounts for every two-card combination there is
    let openings = 0;
    for (const row of v.pays) openings += row.deal.num;
    assert.equal(openings, rd.COMBOS, 'the openings do not add up to a whole shoe');
  }
  // the row in hand is the one the player is deciding against
  const live = rd.view(dealStack(stacked(2, 6, 3)));
  assert.equal(live.spread, 3);
  assert.equal(live.row.kind, 'spread');
  assert.equal(live.row.spread, 3);
  assert.equal(live.row.odds, rd.oddsAt(3));
  assert.equal(rd.view(dealStack([nameOf(4, 'S'), nameOf(4, 'H'), nameOf(9, 'D')])).row.kind, 'pair');
  assert.equal(rd.view(dealStack([nameOf(4, 'S'), nameOf(5, 'H'), nameOf(9, 'D')])).row.kind, 'consecutive');
  const idle = rd.idleView();
  assert.equal(idle.phase, 'bet');
  assert.equal(idle.can.raise, false);
  assert.equal(idle.can.stand, false);
});

test('the multiplier in the view is read back out of the payout', () => {
  // A screen that prints a multiplier the payout does not support is the bug this closes, so the
  // view divides rather than copies. Walked over every row at an odd bet, raised and not
  const bet = 13;
  for (const s of SPREADS) {
    for (const act of [stand, raise]) {
      const won = act(dealStack(stacked(0, s + 1, 1), bet));
      const v = rd.view(won);
      assert.equal(v.mult, won.paid / won.wager);
      assert.equal(v.mult, 1 + rd.oddsAt(s), 'spread ' + s);
      assert.equal(won.paid, won.wager * v.mult);
      assert.ok(Number.isSafeInteger(won.paid));
      const lost = act(dealStack(stacked(0, s + 1, s + 2 <= 12 ? s + 2 : 12), bet));
      assert.equal(rd.view(lost).mult, 0);
    }
  }
  assert.equal(rd.view(dealStack([nameOf(3, 'S'), nameOf(3, 'H'), nameOf(3, 'D')], bet)).mult, 1 + rd.PAIR_ODDS);
  assert.equal(rd.view(dealStack([nameOf(3, 'S'), nameOf(4, 'H'), nameOf(9, 'D')], bet)).mult, 1);
});

test('the view is JSON and the table it hands over is frozen', () => {
  const v = rd.view(stand(dealStack(stacked(0, 5, 1))));
  assert.deepEqual(JSON.parse(JSON.stringify(v)), JSON.parse(JSON.stringify(v)));
  assert.ok(Object.isFrozen(v.pays));
  assert.ok(Object.isFrozen(v.pays[0]));
  assert.throws(() => { v.pays[2].odds = 999; }, TypeError);
  assert.throws(() => { rd.SPREAD_ODDS[0] = 999; }, TypeError);
  // the cards are copies, so a webview cannot edit the round it was shown
  v.cards[0].r = 'A';
  assert.notEqual(rd.view(stand(dealStack(stacked(0, 5, 1)))).cards[0].r, 'A');
});

test('the engine knows nothing but cards.js', () => {
  // Pure: no vscode, no ledger. The one import is the shared seeded source, and what it uses from
  // it is a SHUFFLE, not a roll stream: cards.js's rule is that a seed is one or the other
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'reddog.js'), 'utf8');
  const requires = src.match(/require\(([^)]*)\)/g) || [];
  assert.deepEqual(requires, ["require('./cards')"]);
  assert.ok(src.indexOf('C.shuffledShoe(') > 0, 'the deal should come off a shuffled shoe');
  assert.equal(src.indexOf('rollsFrom'), -1, 'a shoe must not also be rolled against');
  assert.equal(rd.MIN_BET, 10);
  assert.deepEqual(rd.OPS, ['raise', 'stand']);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + ((e && e.stack) || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
