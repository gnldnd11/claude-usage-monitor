// Roll Under, end to end. The rolls are found by searching the engine for a seed, so the number the
// screen is checked against is the number the host will really roll.
//
// The claim this file exists for: THE STEM AND THE BRIGHT ZONE ARE ON ONE SCALE. The lane's fill, the
// target's own figure and the roll's stem are all placed by the same map, and the file checks that
// the stem stands left of the fill's edge exactly when the host says the roll won. That is the whole
// screen: if those two could disagree the picture would be lying about the ledger.
//
// The second claim is the one the games that left the floor could not make: the deal changes the
// felt. The shelf under the lane is 54px of nothing before the first roll and carries a cream plaque
// after it. And a negative claim: the roll's CHANCE is nowhere on the screen, folded table included.
'use strict';

module.exports = {
  id: 'dice',
  modes: ['dice', 'dice-reduce', 'dice-poor'],
  start: { 'dice-poor': 60 },

  run: function (h, MODE) {
    const { ok, advance, later, doc, $, openGame, bodyTabs, ledgerBalance, hdrBal,
      active, activeName, toWebview, errors, ext, EXT, path } = h;

    const engine = require(path.join(EXT, 'dice.js'));
    const R = MODE === 'dice-reduce';
    const BET = engine.MIN_BET;             // 100: this table's floor
    const sent = h.sent('dc');
    const DROP = 220, CHIP = 340;           // games/dice/panel.js, DC_T

    // the lane's one map, written out here rather than imported: a panel is webview-side
    const frac = (v) => ((v - engine.MIN_TARGET) / (engine.MAX_TARGET - engine.MIN_TARGET)).toFixed(5);
    const mapCss = (v) => 'calc(11px + (100% - 22px) * ' + frac(v) + ')';
    const clampCss = (mid, w) => 'clamp(0px, calc(' + mid + ' - ' + (w / 2) + 'px), calc(100% - ' + w + 'px))';

    const lane = () => $('dcLane');
    const fill = () => $('dcFill').style.width || '';
    const head = () => $('dcTarget');
    const plaque = () => doc.querySelector('#dcShelf .dc-plaque');
    const stem = () => doc.querySelector('#dcShelf .dc-stem');
    const shelf = () => $('dcShelf').innerHTML;
    const line = () => $('dcLine').textContent;
    const chip = () => { const c = doc.querySelector('#dcLine .bj-chip'); return c ? c.className + ' ' + c.textContent : 'none'; };
    const said = () => $('dcLive').textContent;
    const panelText = () => $('panel-dice').textContent;
    const money = (n) => Math.round(n).toLocaleString('en-US');
    const xOf = (m100) => m100 >= 1000 ? '×' + Math.floor(m100 / 100) : '×' + Math.floor(m100 / 100) + '.' + ('0' + (m100 % 100)).slice(-2);
    // the one input this screen has, moved the way a drag moves it
    const setLane = (v) => {
      const r = lane();
      r.value = String(v);
      r.dispatchEvent({ type: 'input', preventDefault() {}, stopPropagation() {} });
      advance(5);
    };

    function dcSeed(want, tag, t) {
      for (let i = 0; i < 60000; i++) {
        const seed = tag + i;
        const st = engine.newRound({ seed, id: 't', bet: BET, target: t });
        if (want(st)) { ext._test.setSeeds('dc', () => seed); return st; }
      }
      throw new Error('no dice seed for ' + tag);
    }

    openGame('dice');
    ok('the Roll Under row opens the lane and asks the host for its state',
      doc.body.classList.contains('game-dc') && $('panel-dice').style.display === ''
      && sent.map((m) => m.op).join() === 'open',
      bodyTabs() + ' ' + sent.map((m) => m.op).join());
    ok('the list row and the heading both call it Roll Under, which is the one screen with no die',
      h.registry.BY_ID.dice.name === 'Roll Under'
      && doc.querySelector('#panelGames .gm-open[data-game="dice"] .gm-nm').textContent === 'Roll Under'
      && panelText().indexOf('Roll Under') >= 0,
      h.registry.BY_ID.dice.name);

    // --- THE BET SCREEN IS A LANE WITH A SIDE ALREADY FILLED ----------------------------------
    const open = engine.DEFAULT_TARGET;
    ok('the lane opens on the host’s own default line, with the winning side filled',
      fill() === mapCss(open) && Number(lane().value) === open
      && lane().getAttribute('min') === String(engine.MIN_TARGET)
      && lane().getAttribute('max') === String(engine.MAX_TARGET),
      fill() + ' value ' + lane().value);
    ok('the line’s own figure travels with the handle, clamped into the lane',
      head().textContent === String(open) && head().style.left === clampCss(mapCss(open), 40),
      head().textContent + ' at ' + head().style.left);
    ok('THE SHELF IS EMPTY: 54px of nothing, and no figure put there to fill it',
      shelf() === '' && plaque() === null && stem() === null, JSON.stringify(shelf()));
    ok('the lane is a real range input, so the cursor, the arrow keys and aria-valuenow come free',
      lane().localName === 'input' && lane().getAttribute('type') === 'range'
      && lane().getAttribute('aria-label') === 'Roll under'
      && lane().getAttribute('aria-valuetext') === 'Under ' + open,
      lane().getAttribute('aria-valuetext'));

    if (MODE === 'dice-poor') {
      ok('this table starts at 100: the 10 chip is shut and says so',
        doc.querySelector('#dcStakes button[data-v="10"]').disabled
        && doc.querySelector('#dcStakes button[data-v="10"]').title === 'This table starts at 100',
        doc.querySelector('#dcStakes button[data-v="10"]').title);
      ok('sixty credits is not enough: Roll is off and the note asks for 100',
        $('dcDeal').disabled && !$('dcNote').hidden && $('dcNote').textContent === 'You need 100 credits to play.',
        $('dcNote').textContent);
      return;
    }

    ok('the chips open on 100, Roll is ready and focused',
      doc.querySelector('#dcLine .hl-pot.preview b').textContent === '100'
      && !$('dcDeal').disabled && active() === $('dcDeal'), line() + ' focus ' + activeName());

    // --- the folded table, and the figure that is NOT on the screen ----------------------------
    $('dcWhy').click(); advance(2);
    const box = () => $('dcPays').textContent;
    ok('what is behind the ? is the one fact the ninety-six rows are made of',
      !$('dcPays').hidden
      && box().indexOf('the same ' + money(engine.HOUSE) + ' of every 100 staked') >= 0
      && box().indexOf('Under ' + open + ' pays ' + xOf(engine.ROW[open].mult100)) >= 0,
      JSON.stringify(box()));
    ok('THE CHANCE IS NOWHERE ON THE SCREEN: not on the felt and not behind the ? either',
      panelText().indexOf(money(engine.FACES)) < 0
      && panelText().indexOf(money(engine.ROW[open].chance.num)) < 0
      && panelText().indexOf(' of 100') < 0,
      'looked for ' + money(engine.FACES) + ' and ' + money(engine.ROW[open].chance.num));
    $('dcWhy').click(); advance(2);

    // --- drawing the line ----------------------------------------------------------------------
    setLane(12);
    ok('drawing the line moves the bright zone and its figure together, and sends nothing',
      fill() === mapCss(12) && head().textContent === '12'
      && head().style.left === clampCss(mapCss(12), 40)
      && sent.filter((m) => m.op === 'deal').length === 0,
      fill() + ' ' + head().textContent);
    ok('and a narrower line is a shorter bright zone: the picture is the only chance figure there is',
      Number(frac(12)) < Number(frac(open)), frac(12) + ' < ' + frac(open));

    // --- a roll that WINS: the stem stands left of the edge --------------------------------------
    setLane(80);
    const won = dcSeed((st) => st.win && st.roll < 7000, 'dc-win-', 80);
    doc.pressKey('Enter'); advance(2);
    ok('the deal carried the line to the host',
      sent.filter((m) => m.op === 'deal').pop().target === 80,
      JSON.stringify(sent.filter((m) => m.op === 'deal').pop()));

    const at = {};
    for (let t = 0; t <= CHIP + 200; t++) {
      if (at.drop == null && plaque()) at.drop = t;
      if (at.chip == null && doc.querySelector('#dcLine .bj-chip')) { at.chip = t; at.bal = hdrBal(); }
      advance(1);
    }
    ok('the plaque comes down onto the shelf, then the figure follows it',
      R ? (at.drop <= 2 && at.chip <= 2) : (at.drop === 0 && at.chip === CHIP),
      'plaque at ' + at.drop + ' figure at ' + at.chip);
    ok('THE DEAL CHANGED THE FELT: the shelf now carries the roll, with the point put in here',
      plaque().textContent === (won.roll / 100).toFixed(2)
      && plaque().getAttribute('aria-label') === 'Rolled ' + (won.roll / 100).toFixed(2),
      plaque().textContent + ' from roll ' + won.roll);
    ok('the plaque is clamped into the shelf and the stem keeps the real place',
      plaque().style.left === clampCss(mapCss(won.roll / 100), 72)
      && stem().style.left === clampCss(mapCss(won.roll / 100), 2),
      plaque().style.left + ' | ' + stem().style.left);
    ok('ONE SCALE: the stem stands LEFT of the bright zone’s edge, and the host says it won',
      Number(frac(won.roll / 100)) < Number(frac(80)) && won.win === true
      && won.roll < engine.PER_PERCENT * 80,
      frac(won.roll / 100) + ' < ' + frac(80) + ', host says win ' + won.win);
    ok('the line is what was paid and the multiple the balance really moved by',
      chip().indexOf('win') >= 0 && chip().indexOf(xOf(won.mult100)) >= 0
      && line().indexOf(money(won.payout)) >= 0, line() + ' | ' + chip());
    ok('the roll is read out with the line it was rolled against',
      said() === 'Rolled ' + (won.roll / 100).toFixed(2) + ', under 80. Under, ' + xOf(won.mult100)
        + ', pays ' + money(won.payout) + '. +' + money(won.net) + '. Balance ' + at.bal + '.',
      JSON.stringify(said()));

    // --- a roll that LOSES: the stem stands right of the edge ------------------------------------
    setLane(5);
    const lost = dcSeed((st) => !st.win, 'dc-lose-', 5);
    doc.pressKey('Enter'); advance(CHIP + 200);
    ok('ONE SCALE, the other way: the stem stands RIGHT of the edge, and the host says it lost',
      Number(frac(lost.roll / 100)) > Number(frac(5)) && lost.win === false
      && lost.roll >= engine.PER_PERCENT * 5,
      frac(lost.roll / 100) + ' > ' + frac(5) + ', host says win ' + lost.win);
    ok('a loss shows no payout at all, only what it cost',
      chip().indexOf('lose') >= 0 && chip().indexOf('Over −' + money(BET)) >= 0
      && line().indexOf('Over') >= 0, line() + ' | ' + chip());

    // --- the clamp, at the very bottom of the lane -----------------------------------------------
    const low = dcSeed((st) => st.roll < 400, 'dc-low-', 5);
    doc.pressKey('Enter'); advance(CHIP + 200);
    ok('a roll at the bottom of the lane clamps the plaque to the edge and leaves the stem behind it',
      plaque().style.left === clampCss(mapCss(low.roll / 100), 72)
      && plaque().style.left.indexOf('clamp(0px') === 0
      && stem().style.left !== plaque().style.left,
      'roll ' + low.roll + ' plaque ' + plaque().style.left);

    // --- a line off the dial is refused before anything is staked --------------------------------
    const purse = ledgerBalance();
    h.hostSend({ type: 'dc', op: 'deal', bet: BET, target: 97, n: 941 });
    advance(10);
    ok('a line off the dial is refused in the engine’s own words, and nothing is staked for it',
      !$('dcErr').hidden && /the target runs from 1 to 96/.test($('dcErr').textContent)
      && ledgerBalance() === purse,
      $('dcErr').textContent + ' purse ' + purse + ' -> ' + ledgerBalance());
    ok('and the shelf did not move', plaque().textContent === (low.roll / 100).toFixed(2), plaque().textContent);

    // --- a broadcast is drawn where it stands -----------------------------------------------------
    const cast = engine.newRound({ seed: 'dc-cast', id: 'c', bet: BET, target: 40 });
    toWebview({ type: 'dc', state: engine.view(cast, 1e9), balance: ledgerBalance(), free: ledgerBalance() }); // no n
    advance(5);
    ok('a broadcast is drawn at once: the plaque where it fell, nothing paced',
      plaque().textContent === (cast.roll / 100).toFixed(2) && fill() === mapCss(40) && h.pending(50) === 0,
      plaque().textContent + ' pending ' + h.pending(50));
    ok('no webview exception anywhere in this mode', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
  }
};
