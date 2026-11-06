// Crash, end to end. The three endings (a target that comes in, one that does not, and the 3 in
// 100 that burst before 1.00x) are made by searching the engine for a seed, never by faking a
// reply: the host deals the round the search found, so the figures below are exact.
'use strict';

module.exports = {
  id: 'crash',
  modes: ['crash', 'crash-reduce', 'crash-poor'],
  start: { 'crash-poor': 5 },
  // the remembered target, as a reload would hand it back: 2.0x, where the odds are a coin toss
  state: { crash: { crTicks: 20 }, 'crash-reduce': { crTicks: 20 } },

  run: function (h, MODE) {
    const { ok, advance, doc, $, openGame, openList, hdrBal, ledgerBalance, toWebview, ext, EXT, path } = h;
    const crash = require(path.join(EXT, 'crash.js'));
    const R = MODE === 'crash-reduce';
    const BET = 10;
    const sent = h.sent('cr');
    const money = (n) => Math.round(n).toLocaleString('en-US');
    // the same integer formatting the panel uses: the engine's hundredths, decimal point moved
    const mult = (m) => m >= 10000 ? '×' + Math.floor(m / 100) : '×' + Math.floor(m / 100) + '.' + ('0' + (m % 100)).slice(-2);
    const pct = (c) => { const t = Math.round(1000 * c.num / c.den); return Math.floor(t / 10) + '.' + (t % 10) + '%'; };
    const hero = () => $('crNum').textContent;
    const heroCls = () => $('crNum').className;
    const fill = () => $('crFill').style.width;
    const line = () => $('crLine').textContent;
    const chip = () => { const c = doc.querySelector('#crLine .bj-chip'); return c ? c.className + ' ' + c.textContent : 'none'; };
    const said = () => $('crLive').textContent;
    const cap = () => $('crCap').textContent;
    // The replay: 1,400 of climb, 220 of burst and 120 for the money. A settle shorter than the
    // round would leave the next situation measured against the last one's number
    const RISE = 1400, CHIP = 1740;
    const settle = () => advance(CHIP + 460);
    // the slider is the one control this screen has before the launch
    const slide = (ticks) => {
      const s = $('crSlide');
      s.value = String(ticks);
      s.dispatchEvent({ type: 'input', target: s, defaultPrevented: false, preventDefault() {}, stopPropagation() {} });
      advance(2);
    };
    function seed(want, tag, ticks) {
      for (let i = 0; i < 40000; i++) {
        const s = tag + i;
        const r = crash.newRound({ seed: s, id: 't', bet: BET, ticks: ticks });
        const after = crash.act(r, 'launch');
        if (want(after, crash.view(after, 1e9))) { ext._test.setSeeds('cr', () => s); return after; }
      }
      throw new Error('no crash seed for ' + tag);
    }

    openGame('crash');
    ok('the Crash row opens its screen and asks the host for its state',
      doc.body.classList.contains('game-cr') && $('panel-crash').style.display === '' && sent.map((m) => m.op).join() === 'open',
      h.bodyTabs() + ' ' + sent.map((m) => m.op).join());
    ok('there is exactly one multiple on the screen and one slider to aim it with',
      doc.querySelectorAll('#panel-crash .cr-num').length === 1 && doc.querySelectorAll('#panel-crash .cr-slide').length === 1
      && $('crSlide').getAttribute('type') === 'range',
      doc.querySelectorAll('#panel-crash .cr-num').length + ' numbers, ' + doc.querySelectorAll('#panel-crash .cr-slide').length + ' sliders');
    ok('the dial is the engine’s range, in whole tenths',
      $('crSlide').getAttribute('min') === String(crash.MIN_TICKS) && $('crSlide').getAttribute('max') === String(crash.MAX_TICKS)
      && $('crSlide').getAttribute('step') === '1',
      $('crSlide').getAttribute('min') + '..' + $('crSlide').getAttribute('max') + ' step ' + $('crSlide').getAttribute('step'));
    // the one thing this screen must never grow: a way out of a round that is already settled
    ok('there is no mid-round control anywhere: this is a replay, not a live game',
      doc.querySelectorAll('#panel-crash [data-op]').length === 1
      && doc.querySelector('#panel-crash [data-op]').getAttribute('data-op') === 'launch',
      doc.querySelectorAll('#panel-crash [data-op]').map((b) => b.getAttribute('data-op')).join());

    if (MODE === 'crash-poor') {
      ok('not enough credits: chips off, Deal off, note shown',
        doc.querySelectorAll('#crStakes button').every((b) => b.disabled) && $('crDeal').disabled
        && !$('crNote').hidden && $('crNote').textContent === 'You need 10 credits to play.',
        $('crNote').textContent);
      return;
    }

    ok('the remembered target is the one the dial opens on, and the number is it',
      $('crSlide').value === '20' && hero() === '×2.00' && $('crSlide').getAttribute('aria-valuetext') === '×2.00',
      $('crSlide').value + ' ' + hero() + ' ' + $('crSlide').getAttribute('aria-valuetext'));
    ok('before a bet there is no price on screen, because there is no payout anybody is owed',
      $('crPays').textContent === '', JSON.stringify($('crPays').textContent));
    // WHAT THE ONE NUMBER IS, which is the price of putting the target and the burst in one place.
    // Before the launch the 34px figure is an order the player is placing, and the bet screen has
    // nothing else on it: no price, an empty bar and a slider with no end labels
    ok('the bet screen says what its one number is: the target, not a result',
      cap() === 'Cash out at' && doc.querySelectorAll('#panel-crash .cr-cap').length === 1,
      JSON.stringify(cap()));

    const quiet = sent.length;
    slide(124);
    ok('moving the dial with no round open shows the target at once and sends nothing',
      hero() === '×12.40' && $('crSlide').getAttribute('aria-valuetext') === '×12.40' && sent.length === quiet,
      hero() + ', ' + (sent.length - quiet) + ' messages');

    // --- a target that comes in -----------------------------------------------------------------
    const won = seed((st) => st.won && st.at > 2000, 'cr-win-', 124);
    const vWon = crash.view(won, 1e9);
    const vArm = crash.view(crash.newRound({ seed: 'x', id: 't', bet: BET, ticks: 124 }), 1e9);
    doc.pressKey('Enter'); settle();
    ok('the deal carries the target the dial was on',
      sent[sent.length - 1].op === 'deal' && sent[sent.length - 1].bet === BET && sent[sent.length - 1].ticks === 124,
      JSON.stringify(sent[sent.length - 1]));
    ok('armed: the number is the multiple the payout really is, and the price beside it is the host’s',
      hero() === mult(vArm.bar100) && $('crPays').textContent === 'Pays ' + money(vArm.payout) + ' · ' + pct(vArm.chance),
      hero() + ' | ' + $('crPays').textContent + ' | engine bar ' + vArm.bar100 + ' pays ' + vArm.payout);
    ok('armed: one button, and it is Launch',
      !$('crPlay').hidden && $('crBet').hidden && doc.querySelectorAll('#crPlay .bj-btn').length === 1
      && !$('crLaunch').disabled, doc.querySelectorAll('#crPlay .bj-btn').length + ' buttons');
    ok('armed: the target is read out with its price', said().indexOf('Target ' + mult(vArm.bar100)) === 0, JSON.stringify(said()));
    ok('armed: the number is still the target, and the line above it still says so', cap() === 'Cash out at', JSON.stringify(cap()));

    // re-aiming is one message per drag, not one per tenth
    const beforeAim = sent.length;
    slide(100); slide(110); slide(120); slide(130);
    ok('a drag across the dial shows every step but holds the price back until the host answers',
      hero() === '×13.00' && $('crPays').classList.contains('stale') && sent.length === beforeAim,
      hero() + ' stale ' + $('crPays').classList.contains('stale') + ', ' + (sent.length - beforeAim) + ' messages');
    advance(200);
    ok('and then one aim goes out for the whole drag',
      sent.length === beforeAim + 1 && sent[sent.length - 1].op === 'aim' && sent[sent.length - 1].ticks === 130,
      (sent.length - beforeAim) + ' messages: ' + JSON.stringify(sent.slice(beforeAim)));
    ok('the price comes back from the host, not from here',
      !$('crPays').classList.contains('stale') && $('crPays').textContent.indexOf('Pays ') === 0,
      $('crPays').textContent);
    slide(124); advance(400);   // back to the target the seed was found for

    // --- the launch -----------------------------------------------------------------------------
    doc.pressKey('l'); advance(2);
    const marks = { moved: null, top: null, green: null, chip: null, named: null };
    for (let t = 0; t <= CHIP + 160; t++) {
      if (marks.named == null && cap() === 'Burst at') marks.named = t;
      if (marks.moved == null && hero() !== '×1.00') marks.moved = t;
      if (marks.top == null && hero() === mult(vWon.at)) marks.top = t;
      if (marks.green == null && heroCls().indexOf('won') >= 0) marks.green = t;
      if (marks.chip == null && doc.querySelector('#crLine .bj-chip')) marks.chip = t;
      advance(1);
    }
    ok('the climb starts at 1.00 and reaches the burst point at ' + RISE + 'ms, whatever that point is',
      R ? (marks.top <= 1) : (marks.moved === Math.round(RISE / 36) && marks.top === RISE),
      'first move at ' + marks.moved + 'ms, burst point at ' + marks.top + 'ms (engine at ' + vWon.at + ')');
    ok('the order fills on the way up, before the burst',
      R ? marks.green <= 1 : (marks.green > 0 && marks.green < RISE), 'order filled at ' + marks.green + 'ms');
    ok('the money lands after the burst', R ? marks.chip <= 1 : marks.chip === CHIP, 'chip at ' + marks.chip + 'ms');
    // the same figure in the same place changed its meaning, so the line above it changed with it,
    // and it did so as the climb STARTED rather than once it had landed: the number on the way up
    // is already the burst point being approached and not an order anybody can still move
    ok('the line above the number turns over with it: a target becomes where it burst',
      R ? marks.named <= 1 : marks.named <= 2, 'renamed at ' + marks.named + 'ms, now ' + JSON.stringify(cap()));
    ok('a win: the number is where it burst, in the win colour, with the engine’s net on the line',
      hero() === mult(vWon.at) && heroCls().indexOf('won') >= 0 && cap() === 'Burst at'
      && chip() === 'bj-chip win Cashed +' + money(vWon.net),
      hero() + ' ' + heroCls() + ' ' + cap() + ' ' + chip() + ' engine net ' + vWon.net);
    settle();
    ok('a win is read out with where it burst and the balance',
      said() === 'Burst at ' + mult(vWon.at) + '. Cashed +' + money(vWon.net) + '. Balance ' + hdrBal() + '.',
      JSON.stringify(said()));

    // --- a target that does not come in ---------------------------------------------------------
    const lost = seed((st) => !st.won && st.at >= 100, 'cr-lose-', 124);
    const vLost = crash.view(lost, 1e9);
    doc.pressKey('Enter'); settle();
    doc.pressKey('l'); settle();
    ok('a loss: the number stops where it burst, short of the order, in the lose colour',
      hero() === mult(vLost.at) && heroCls().indexOf('lost') >= 0 && vLost.at < vLost.bar100
      && chip() === 'bj-chip lose Busted −' + money(BET),
      hero() + ' ' + heroCls() + ' ' + chip() + ' engine at ' + vLost.at + ' bar ' + vLost.bar100);

    // --- the 3 in 100 that never got off the ground ---------------------------------------------
    const flat = seed((st) => st.at < 100, 'cr-instant-', 124);
    const vFlat = crash.view(flat, 1e9);
    doc.pressKey('Enter'); settle();
    doc.pressKey('l'); advance(2);
    const inst = { moved: null, red: null };
    for (let t = 0; t <= 600; t++) {
      if (inst.moved == null && hero() !== '×1.00') inst.moved = t;
      if (inst.red == null && heroCls().indexOf('lost') >= 0) inst.red = t;
      advance(1);
    }
    ok('an instant burst: the number never moves off 1.00 and goes red where it stands',
      inst.moved == null && (R ? inst.red <= 1 : inst.red === 220) && vFlat.instant === true,
      'moved at ' + inst.moved + 'ms, red at ' + inst.red + 'ms, hero ' + hero());
    settle();
    ok('an instant burst says so rather than naming a multiple nobody reached',
      said().indexOf('Burst before 1.00') === 0 && chip() === 'bj-chip lose Busted −' + money(BET),
      JSON.stringify(said()) + ' ' + chip());

    // --- a refused launch moves nothing ---------------------------------------------------------
    doc.pressKey('Enter'); settle();
    const armedView = crash.view(crash.newRound({ seed: 'y', id: 't', bet: BET, ticks: 124 }), 1e9);
    const shot = { hero: hero(), fill: fill(), pays: $('crPays').textContent };
    h.intercept = (m) => {
      if (m.op !== 'launch') return false;
      h.intercept = null;
      h.later(1, () => toWebview({ type: 'cr', n: m.n, state: armedView, error: 'the round is over', balance: ledgerBalance(), free: ledgerBalance() }));
      return true;
    };
    doc.pressKey('l'); advance(5);
    ok('a refused launch: the reason shows and the number did not climb',
      !$('crErr').hidden && hero() === shot.hero && heroCls().indexOf('burst') < 0,
      JSON.stringify($('crErr').textContent) + ' hero ' + hero() + ' vs ' + shot.hero);
    advance(1600);
    ok('a refused launch: the price is untouched and Launch comes back',
      $('crPays').textContent === shot.pays && !$('crLaunch').disabled, $('crPays').textContent);

    // --- a reply with no state keeps what is drawn (games/README.md, section 5) ------------------
    h.intercept = (m) => {
      if (m.op !== 'launch') return false;
      h.intercept = null;
      h.later(1, () => toWebview({ type: 'cr', n: m.n, error: 'the table could not be shown', balance: ledgerBalance(), free: ledgerBalance() }));
      return true;
    };
    doc.pressKey('l'); advance(5);
    ok('a reply with no state: the reason shows and the dial stays where it is',
      !$('crErr').hidden && hero() === shot.hero && fill() === shot.fill && $('crPays').textContent === shot.pays,
      JSON.stringify($('crErr').textContent) + ' | ' + hero() + ' ' + fill());
    advance(5000);
    ok('a reply with no state releases the wait: no "didn’t respond" five seconds later',
      $('crErr').textContent.indexOf('respond') < 0 && !$('crLaunch').disabled, $('crErr').textContent);

    // --- an armed round survives walking out of it and back in ----------------------------------
    openList(); advance(5); openGame('crash');
    ok('back from the list mid-round: the same number and price, Launch live, the bet row still away',
      hero() === shot.hero && $('crPays').textContent === shot.pays && !$('crPlay').hidden && $('crBet').hidden
      && !$('crLaunch').disabled,
      hero() + ' | ' + $('crPays').textContent);
    ok('back from the list mid-round: nothing launched itself on the way', heroCls().indexOf('burst') < 0, heroCls());

    // --- this game's keys belong to this game only ----------------------------------------------
    const silent = sent.length;
    openList(); doc.pressKey('l'); doc.pressKey('Enter', { target: doc.body }); advance(5);
    ok('guard: the Crash keys do nothing on the list', sent.length === silent, sent.slice(silent).map((m) => m.op).join());

    // --- a late reply is drawn as it stands, with no pacing --------------------------------------
    openGame('crash');
    const late = crash.act(crash.newRound({ seed: 'cr-late', id: 'x', bet: BET, ticks: 200 }), 'launch');
    const vLate = crash.view(late, 1e9);
    toWebview({ type: 'cr', state: vLate }); // no n: a reply nobody is waiting for
    advance(5);
    ok('a reply nobody asked for is drawn as it stands, with no climb',
      hero() === mult(vLate.instant ? 100 : vLate.at) && heroCls().indexOf('burst') < 0
      && chip().indexOf(vLate.won ? 'win' : 'lose') >= 0,
      hero() + ' ' + heroCls() + ' ' + chip());

    // --- the whole dial: the number on screen is never a promise the payout cannot keep ---------
    // Every tenth from 1.1x to 50.0x at the minimum bet. The engine floors the payout and rounds
    // the bar UP out of it, so the figure printed can only be LOWER than the dial, never higher
    const bad = [];
    for (let t = crash.MIN_TICKS; t <= crash.MAX_TICKS; t++) {
      const v = crash.view(crash.newRound({ seed: 'sweep', id: 's', bet: BET, ticks: t }), 1e9);
      toWebview({ type: 'cr', state: v });
      advance(2);
      if (hero() !== mult(v.bar100)) bad.push(t + ': shows ' + hero() + ', should show ' + mult(v.bar100));
      if (v.bar100 > t * crash.TICK_PER) bad.push(t + ': the bar is above the dial (' + v.bar100 + ' > ' + t * crash.TICK_PER + ')');
    }
    ok('every target on the dial: the number shown is the multiple the payout really is',
      bad.length === 0, bad.slice(0, 4).join(' | '));
  }
};
