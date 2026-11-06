// The Sword Forge, end to end. The outcome of a press is chosen by searching forge.js for the seed
// that rolls it (_test.setFgSeeds), never by faking a reply, so every figure expected below is read
// back out of the engine's own table.
'use strict';

module.exports = {
  id: 'forge',
  // The forge's fees are tens to hundreds of credits where a card bet is ten, so its modes say what
  // they need. forge-poor has to sit UNDER the +0 fee for the short-purse screen to be the one that
  // shows, so it is read off the table rather than written down: the fee moved once already
  start: { forge: 50000, 'forge-reduce': 50000, 'forge-poor': require('../../../forge.js').TABLE[0].cost - 1 },
  // forge-row never opens the forge at all: it is the list row's figure, which has to be there
  // before the panel exists or it cannot be the reason the panel is opened
  modes: ['forge', 'forge-reduce', 'forge-poor', 'forge-row'],

  run: function (h, MODE) {
    const { ok, advance, later, doc, $, notShown, bodyTabs, inGames, atTable, gameRow,
        openList, openTable, reopenTable, dealerCards, allCards, isBack, lineText, hdrBal,
        latchIdle, active, activeName, mouseClick, ledgerBalance, useSeed, standOut, watch,
        noStaleTimer, toWebview, sentOps, sentHl, errors, hostLog, roCbs, ext, bj, credits,
        registry, gs, config, EXT, path } = h;
    const sentFg = h.sent('fg');   // the whole message: a move carries the level it was asked at
    const sentPk = h.sent('pk');

    // The real host and the real engine. The sword is the host's, and the outcome of a press is
    // chosen by searching forge.js for the seed that rolls it (_test.setFgSeeds), never by faking a
    // reply, so every figure expected below is read back out of the engine's own table.
    const forge = require(path.join(EXT, 'forge.js'));
    const R = MODE === 'forge-reduce';
    const FEE = forge.TABLE[0].cost;
    const WORD = { up: 'success', keep: 'no change', down: 'down a level', break: 'destroyed' };
    // The gauge moves the bands, so a seed that forces an outcome has to be searched for at the
    // heat the sword is really on. The heat is read off the SCREEN (the lit cells), which is also
    // what makes the gauge drawn below a measurement rather than a restatement
    function fgSeed(level, outcome, heat) {
      for (let i = 0; i < 20000; i++) {
        const s = 'fg-' + level + '-' + outcome + '-' + (heat || 0) + '-' + i;
        if (forge.outcomeAt(level, forge.rollOf(s), heat || 0) === outcome) return s;
      }
      throw new Error('no forge seed for ' + outcome + ' at +' + level + ' on heat ' + heat);
    }
    const money = (n) => Math.round(n).toLocaleString('en-US');
    const lv = () => Number($('fgLv').textContent);
    const heat = () => doc.querySelectorAll('#fgHeat i.on').length;
    const cells = () => doc.querySelectorAll('#fgHeat i').length;
    const press = (outcome) => {
      const at = lv(), hot = heat();
      ext._test.setFgSeeds(() => fgSeed(at, outcome, hot));
      $('fgEnhance').click(); advance(2);
    };
    const settle = () => advance(2500);   // past the longest press: the brink's beat plus a break's 1000ms
    const climb = (to) => { for (let g = 0; lv() < to && g < 40; g++) { press('up'); settle(); } return lv() === to; };
    const sword = () => $('fgSword').innerHTML;
    // the blade's own path: the glow ring draws from x=9 too, but with an opacity between fill and d
    const bladeLen = () => { const m = /fill="[^"]+" d="M9 (\d+)h6v(\d+)h-6z/.exec(sword()); return m ? Number(m[2]) : -1; };
    const rings = () => (sword().match(/opacity="[\d.]+"/g) || []).length;   // the heat glow, and only it
    const guardW = () => { const m = /M(\d+) 26h(\d+)v2h-\d+z/.exec(sword()); return m ? Number(m[2]) : -1; };
    const hasGem = () => sword().indexOf('M11 37h2v1h-2z') >= 0;
    const flames = () => sword().indexOf('M11 -1h2v2h-2z') >= 0 && sword().indexOf('M11 -3h2v2h-2z') >= 0;
    const drawn = () => /viewbox="0 -4 24 44"/i.test(sword());   // the grid reaches above the sword (minidom lowercases it)
    const barOf = () => doc.querySelectorAll('#fgBar i').map((e) => e.getAttribute('data-k') + ' ' + /width:([^;]+)/.exec(e.getAttribute('style'))[1]);
    // The bar is the row the next press is really rolled against, which is the HEATED one: a gauge
    // that filled without the green slice growing would be a bar that says nothing
    const barWant = (level, hot) => { const r = forge.oddsAt(level, hot || 0); return ['up', 'keep', 'down', 'break'].filter((k) => r[k] > 0).map((k) => k + ' ' + (r[k] * 100 / forge.DEN) + '%'); };
    const titleWant = (level, hot) => { const r = forge.oddsAt(level, hot || 0); return ['up', 'keep', 'down', 'break'].filter((k) => r[k] > 0).map((k) => r[k] + '% ' + WORD[k]).join(' · '); };
    const gain = () => ($('fgGain').hidden ? '' : $('fgGain').textContent);
    const chip = () => { const c = doc.querySelector('#fgLine .bj-chip'); return c ? c.className + ' ' + c.textContent : 'none'; };
    const btn = (id) => $(id).textContent.replace(/\s+/g, ' ').trim();
    const crab = () => { const c = doc.querySelector('#panelForge .bj-crab'); return c ? c.className + '|' + c.innerHTML : 'none'; };
    const ops = (from) => sentFg.slice(from == null ? 0 : from).map((m) => m.op).join();
    const noMoves = (from) => sentFg.slice(from).filter((m) => m.op !== 'open').length === 0;
    // What the panel says a press from a level is worth in time, read back out of its own timings
    // rather than written down twice. The beat class is the ritual's size and the test measures both
    const RITE = {
      calm: { ms: 120, cls: 'beat1' }, mid: { ms: 270, cls: 'beat3' },
      risk: { ms: 360, cls: 'beat4' }, brink: { ms: 450, cls: 'beat5', brace: 220 }
    };
    const riteOf = (level) => level >= forge.MAX_LEVEL - 2 ? RITE.brink
      : level >= forge.RISK_FROM ? RITE.risk
        : (forge.TABLE[level].down || forge.TABLE[level].break) ? RITE.mid : RITE.calm;
    // when the verdict of a press from `level` lands, and when the buttons come back after it
    const verdictAt = (level) => { const r = riteOf(level); return R ? 0 : r.ms + (r.brace || 0); };
    const unlockAt = (level) => verdictAt(level) + 150;
    // Every visible beat of one press, 1ms at a time from the moment the reply landed
    function show(ms) {
      const t0 = h.now, m = {};
      const mark = (k) => { if (m[k] == null) m[k] = h.now - t0; };
      for (let i = 0; i <= ms; i++) {
        const box = $('fgSword');
        ['beat1', 'beat3', 'beat4', 'beat5', 'brace', 'ember', 'pop', 'drop', 'gone', 'arrive']
          .forEach((c) => { if (box.classList.contains(c)) mark(c); });
        if (doc.querySelector('#fgHeat.lit')) mark('lit');
        if (doc.querySelector('#fgHeat.spent')) mark('spent');
        if (doc.querySelector('#fgSword .fg-flash.on')) mark('flash');
        if (doc.querySelector('#fgSword .fg-shard')) mark('shards');
        if ($('fgAnvil').classList.contains('broke')) mark('broke');
        else if (m.broke != null && m.brokeOff == null) m.brokeOff = h.now - t0;   // and when it comes off again
        if (!doc.querySelector('#fgSword svg')) mark('empty');
        if (doc.querySelector('#fgLine .bj-chip')) mark('chip');
        if (!$('fgEnhance').disabled) mark('unlock');
        advance(1);
      }
      return m;
    }

    // --- the list row's figure, for a window that never opens the forge ---------------------
    // The sword outlives the window, so its level is what makes the row worth opening, and a
    // figure that waits for the panel to be built is a figure nobody can be drawn in by. The host
    // answers its own data push with the stored sword (games/forge/meta.js, onPush) and the
    // panel's fig() writes it into a row that has existed since the first paint.
    //
    // THE FIGURE IS HUNG ON `tries` AND NOT ON THE LEVEL, which is what the three checks below are
    // in aid of. A figure on the row says something moved while the panel was shut
    // (docs/game-panels.md, section 7), so the shop's own +0 that nobody has forged puts nothing
    // there, and a sword that has been hammered back DOWN to +0 puts a +0 there and means it. The
    // level cannot tell those two apart and the attempt count can.
    if (MODE === 'forge-row') {
      // the host pushes its data on a 'ready' and on its own timer, and gamesAfterPush rides both.
      // The page has already sent one 'ready' of its own by the time this runs
      const pushed = () => { h.hostSend({ type: 'ready' }); advance(10); };
      const replied = () => hostLog.filter((l) => l.type === 'fg').length;
      openList();
      ok('this mode never builds the forge’s screen', !$('panelForge') && !$('fgEnhance'));
      // the reply is checked for as well as the empty slot: an empty row because nobody answered
      // would be a different bug wearing this one's result
      ok('the host says what is owned, and an untouched sword puts nothing on the row',
        replied() > 0 && $('fig-forge').textContent === '' && !$('panelForge'),
        JSON.stringify($('fig-forge').textContent) + ' after ' + replied() + ' replies');
      // a sword that was tried and is back where it started: touched, so the row carries its +0
      gs.data.creditLedgerV1 = Object.assign({}, gs.data.creditLedgerV1, {
        forge: forge.save(forge.load({ level: 0, moves: 3, tries: 3, best: 1, by: 'eeeeeeeeeeeeeeee' }))
      });
      pushed();
      ok('a sword hammered back down to +0 HAS been touched, so the row reads +0',
        $('fig-forge').textContent === '+0' && !$('panelForge'),
        JSON.stringify($('fig-forge').textContent) + ' after ' + replied() + ' replies');
      // a sword another window forged, written straight into the ledger every window shares
      gs.data.creditLedgerV1 = Object.assign({}, gs.data.creditLedgerV1, {
        forge: forge.save(forge.load({ level: 5, moves: 4, tries: 4, best: 5, by: 'ffffffffffffffff' }))
      });
      pushed();
      ok('and the row keeps up with the sword another window moved, with no screen to draw it on',
        $('fig-forge').textContent === '+5' && !$('panelForge'),
        JSON.stringify($('fig-forge').textContent) + ' panel ' + !!$('panelForge'));
      ok('the level is neither good news nor bad, so it carries no direction',
        !$('fig-forge').classList.contains('gm-up') && !$('fig-forge').classList.contains('gm-dn'),
        $('fig-forge').className);
      // the push runs on a timer, so it has to be silent when nothing moved or every window would
      // be answering a message nobody sent, twice a minute, forever
      const before = replied();
      pushed(); pushed();
      ok('a push with nothing moved says nothing at all',
        replied() === before && $('fig-forge').textContent === '+5', replied() + ' replies, was ' + before);
      ok('nothing threw drawing a row for a screen that does not exist', errors.length === 0,
        errors.map((e) => e && e.message).join(' | '));
      return;
    }

    openList();
    ok('the forge has no screen at all until it is opened', !$('panelForge') && !$('fgEnhance'));
    // the row builds the panel and asks the host, both at once: this is the state before the
    // answer lands (the reply is one tick of the fake clock behind the click)
    h.rowFor('forge').click();
    ok('before the host answers, the forge shows nothing and promises nothing',
      $('fgEnhance').hidden && $('fgSell').hidden && $('fgBar').innerHTML === '' && !doc.querySelector('#fgSword svg')
      && $('fgLv').textContent === '' && $('fgBest').textContent === '',
      'enhance hidden ' + $('fgEnhance').hidden + ' | bar ' + JSON.stringify($('fgBar').innerHTML) + ' | lv ' + JSON.stringify($('fgLv').textContent));
    advance(20);
    ok('the list row opens the forge and asks the host for the sword',
      doc.body.classList.contains('game-fg') && $('panelForge').style.display === '' && notShown('panelPoker')
      && ops() === 'open', ops() + ' ' + bodyTabs());
    ok('the forge has its own surface, not the card games’ felt',
      !!doc.querySelector('#panelForge .fg-anvil') && !doc.querySelector('#panelForge .bj-felt')
      && !!doc.querySelector('#panelForge .fg-stage .bj-crab img'), $('panelForge').className);

    if (MODE === 'forge-poor') {
      ok('not enough credits: Enhance is off and the note names the fee',
        $('fgEnhance').disabled && !$('fgNote').hidden && $('fgNote').textContent === 'You need ' + FEE + ' credits to enhance.',
        $('fgNote').textContent + ' | enhance disabled ' + $('fgEnhance').disabled);
      ok('a fee you cannot pay is not a secret: the odds are still drawn', barOf().join() === barWant(0).join(), barOf().join());
      ok('a +0 sword has nothing to sell', $('fgSell').hidden);
    } else {
      // --- the sword at rest
      ok('a fresh sword reads +0, with the record high under it and nothing behind it yet',
        lv() === 0 && $('fgBest').textContent === 'best +0', lv() + ' ' + $('fgBest').textContent);
      // the ceiling is a constant, and a constant printed beside a figure that moves every press is
      // wallpaper: it lives in the heading's tooltip instead, and that is the claim being kept here
      ok('the ceiling is not printed beside the level: the heading’s tooltip is where it says so',
        $('fgBest').textContent.indexOf('/') < 0
        && doc.querySelector('#panelForge .ihead .it').title.indexOf('Lv ' + forge.MAX_LEVEL) >= 0,
        $('fgBest').textContent + ' | ' + doc.querySelector('#panelForge .ihead .it').title);
      ok('the bar is the table’s own slices, and below the risk level there is no red',
        barOf().join() === barWant(0).join() && barOf().join().indexOf('break') < 0 && $('fgBar').title === titleWant(0),
        barOf().join() + ' | ' + $('fgBar').title);
      ok('the only figures spelled out are the chance it works and the chance it breaks',
        $('fgSucc').textContent === forge.TABLE[0].up + '% success' && $('fgRisk').textContent === '',
        $('fgSucc').textContent + ' | ' + JSON.stringify($('fgRisk').textContent));
      ok('the fee rides on the button, and a +0 sword has no price',
        btn('fgEnhance') === 'Enhance ' + FEE && $('fgSell').hidden, btn('fgEnhance'));
      // the heading's corner is one figure and the rule for it is "what is still there when you
      // come back": the swords this forge has destroyed. The rest stays in its title
      ok('the corner counts the swords destroyed, and the attempts are in its title',
        $('fgSide').textContent === '0 broken' && $('fgSide').title === '0 best · 0 destroyed · 0 attempts',
        $('fgSide').textContent + ' / ' + $('fgSide').title);
      ok('the gauge is there, empty, with a cell a bar of the engine’s own',
        cells() === forge.HEAT_MAX && heat() === 0 && !$('fgHeat').hidden, cells() + ' cells, ' + heat() + ' lit');
      ok('a cold gauge claims nothing: no points are printed beside the chance',
        gain() === '' && $('fgHeat').title.indexOf('0 of ' + forge.HEAT_MAX + ' heat') === 0, JSON.stringify(gain()) + ' | ' + $('fgHeat').title);
      ok('the sword is drawn to its level and read out by it',
        $('fgSword').getAttribute('aria-label') === 'Sword +0' && bladeLen() === 10 && rings() === 0 && !hasGem() && guardW() === 12 && drawn(),
        $('fgSword').getAttribute('aria-label') + ' blade ' + bladeLen() + ' guard ' + guardW());
      ok('no verdict before a press, and the focus is on Enhance', chip() === 'none' && active() === $('fgEnhance'), chip() + ' focus ' + activeName());

      // --- a press that changes nothing. The opening levels get ONE tap and the whole thing is over
      // inside 150ms: a 95% attempt that cannot cost more than its fee is not an event
      const crab0 = crab();
      press('keep');
      const keepT = show(600);
      ok('keep at +0: one tap, no hammering, and it is all over inside 150ms',
        (R ? keepT.beat1 == null : keepT.beat1 === 0) && keepT.beat3 == null && keepT.beat4 == null && keepT.beat5 == null
        && keepT.brace == null && keepT.ember == null && keepT.pop == null && keepT.drop == null && keepT.flash == null && keepT.shards == null
        && keepT.chip === verdictAt(0) && keepT.unlock === unlockAt(0) && verdictAt(0) < 150, JSON.stringify(keepT));
      ok('keep: the chip says what the stay bought, and the sword has not moved',
        chip() === 'bj-chip No change · heat 1 of ' + forge.HEAT_MAX && lv() === 0 && bladeLen() === 10, chip() + ' lv ' + lv());
      ok('keep: the gauge lit a bar, and it was seen lighting',
        heat() === 1 && (R ? keepT.lit == null : keepT.lit === verdictAt(0)) && !!doc.querySelector('#fgHeat i.on.tip'),
        heat() + ' lit at ' + keepT.lit);
      ok('and at +0 the gauge is worth nothing, because the chance is already at its ceiling',
        gain() === '' && $('fgSucc').textContent === forge.oddsAt(0, 1).up + '% success'
        && $('fgHeat').title.indexOf('ceiling') > 0, JSON.stringify(gain()) + ' | ' + $('fgSucc').textContent + ' | ' + $('fgHeat').title);
      ok('the crab stands there and does nothing: what gets hit is the sword', crab() === crab0, crab());

      // --- a press that works
      press('up');
      const upT = show(600);
      ok('up: the new sword lands with the flash and the pop',
        (R ? upT.pop == null && upT.flash == null : upT.pop === verdictAt(0) && upT.flash === verdictAt(0))
        && upT.chip === verdictAt(0) && upT.unlock === unlockAt(0), JSON.stringify(upT));
      ok('up: +1, two pixels longer, and the chip is what the sword is now WORTH',
        lv() === 1 && bladeLen() === 11 && chip() === 'bj-chip win Success · worth ' + money(forge.TABLE[1].sell), chip() + ' blade ' + bladeLen());
      ok('up: the gauge was spent, and it was seen going out',
        heat() === 0 && (R ? upT.spent == null : upT.spent === verdictAt(0)) && gain() === '', heat() + ' lit, spent at ' + upT.spent);
      ok('up: the level, what it is worth and the money are read out',
        $('fgLive').textContent.indexOf('Success. Sword +1, worth ' + money(forge.TABLE[1].sell) + '. −' + money(FEE) + '. Balance ') === 0,
        JSON.stringify($('fgLive').textContent));
      ok('up: the record high moves with it, under the sword rather than in the corner',
        $('fgBest').textContent === 'best +1' && $('fgSide').textContent === '0 broken'
        && $('fgSide').title.indexOf('1 best · 0 destroyed · 2 attempts') === 0,
        $('fgBest').textContent + ' | ' + $('fgSide').textContent + ' | ' + $('fgSide').title);
      ok('up: and the games list says what the window now owns, without being opened again',
        $('fig-forge').textContent === '+' + lv(), $('fig-forge').textContent + ' vs lv ' + lv());
      ok('the attempt named the level it was asked at: the fee on the button was that level’s',
        sentFg[sentFg.length - 1].op === 'enhance' && sentFg[sentFg.length - 1].level === 0,
        JSON.stringify(sentFg.map((m) => m.op + ':' + m.level)));

      // --- the sale asks twice
      const price1 = forge.TABLE[1].sell;
      ok('a sword worth something gets its price on the Sell row', !$('fgSell').hidden && btn('fgSell') === 'Sell ' + money(price1), btn('fgSell'));
      let n0 = sentFg.length;
      $('fgSell').click(); advance(2);
      ok('one tap arms the sale and sends nothing', btn('fgSell') === 'Tap again to sell' && sentFg.length === n0, btn('fgSell'));
      advance(2900);
      ok('still armed just short of three seconds', btn('fgSell') === 'Tap again to sell');
      advance(200);
      ok('and it goes back to the price after three seconds', btn('fgSell') === 'Sell ' + money(price1) && sentFg.length === n0, btn('fgSell'));
      const bal0 = ledgerBalance();
      $('fgSell').click(); advance(2); $('fgSell').click(); advance(2); settle();
      ok('two taps sell: one message, a +0 sword, the price in the chip and in the purse',
        ops(n0) === 'sell' && sentFg[n0].level === 1 && lv() === 0 && $('fgSell').hidden
        && chip() === 'bj-chip win Sold +' + money(price1) && ledgerBalance() === bal0 + price1,
        ops(n0) + ' | ' + chip() + ' | purse ' + (ledgerBalance() - bal0));

      // --- climbing towards the risk
      ok('one below the risk level there is still no red and no glow on the blade',
        climb(forge.RISK_FROM - 1) && barOf().join().indexOf('break') < 0 && rings() === 0 && $('fgRisk').textContent === '',
        'lv ' + lv() + ' | ' + barOf().join() + ' | rings ' + rings());
      ok('the hot tier starts where the engine says and brings the gem and the wider guard',
        bladeLen() === 10 + lv() && hasGem() === (lv() >= 6) && guardW() === (lv() >= 6 ? 14 : 12), 'lv ' + lv() + ' blade ' + bladeLen());

      // --- a press that falls back. This is a level that can drop, so the hammering is the middle
      // one: three taps, no ember, no held breath
      const dropFrom = lv();
      press('down');
      const dnT = show(600);
      ok('down: three taps and then the sword drops in one level shorter',
        (R ? dnT.beat3 == null && dnT.drop == null : dnT.beat3 === 0 && dnT.drop === verdictAt(dropFrom))
        && dnT.beat4 == null && dnT.beat5 == null && dnT.brace == null && dnT.ember == null
        && dnT.pop == null && dnT.flash == null
        && dnT.chip === verdictAt(dropFrom) && dnT.unlock === unlockAt(dropFrom), JSON.stringify(dnT));
      ok('down: the chip names where it landed AND what it is worth there now',
        lv() === forge.RISK_FROM - 2 && chip() === 'bj-chip lose Down to Lv ' + lv() + ' · ' + money(forge.TABLE[lv()].sell)
        && bladeLen() === 10 + lv(), chip() + ' blade ' + bladeLen());
      ok('down: a drop is a failure, so it lit a bar too', heat() === 1, heat() + ' lit');

      // --- the gauge where it is worth something: it moves the number next to it
      const warmAt = lv();
      const cold = forge.TABLE[warmAt].up;
      ok('a warm gauge raises the chance printed big and says what it added',
        $('fgSucc').textContent === forge.oddsAt(warmAt, 1).up + '% success' && gain() === '+' + forge.HEAT_STEP + ' from heat'
        && forge.oddsAt(warmAt, 1).up === cold + forge.HEAT_STEP,
        $('fgSucc').textContent + ' | ' + gain() + ' | cold was ' + cold + '%');
      ok('and the bar is the heated row, so the green slice really grew',
        barOf().join() === barWant(warmAt, 1).join() && $('fgBar').title === titleWant(warmAt, 1)
        && barOf().join() !== barWant(warmAt, 0).join(), barOf().join());
      // a second failure is a second bar and twice the points: the gauge is a ladder, not a flag
      press('keep'); settle();
      ok('every further failure is another bar and another step of points',
        heat() === 2 && gain() === '+' + (2 * forge.HEAT_STEP) + ' from heat'
        && $('fgSucc').textContent === forge.oddsAt(warmAt, 2).up + '% success', heat() + ' lit | ' + gain());
      ok('the gauge says what it is worth to a screen reader too, not only in colour',
        $('fgHeat').getAttribute('aria-label') === '2 of ' + forge.HEAT_MAX + ' heat, worth ' + (2 * forge.HEAT_STEP) + ' points',
        JSON.stringify($('fgHeat').getAttribute('aria-label')));
      press('up'); settle();
      ok('and a success empties it: the points it was worth go with it',
        heat() === 0 && gain() === '' && $('fgSucc').textContent === forge.oddsAt(lv(), 0).up + '% success',
        heat() + ' lit | ' + gain() + ' | ' + $('fgSucc').textContent);

      // --- at the risk level the only thing that changes is that there is red
      ok('at the risk level the bar grows a red slice, the second figure appears, the blade glows',
        climb(forge.RISK_FROM) && barOf().join() === barWant(forge.RISK_FROM).join() && $('fgBar').title === titleWant(forge.RISK_FROM)
        && $('fgRisk').textContent === forge.TABLE[forge.RISK_FROM].break + '% destroy' && rings() === 1,
        barOf().join() + ' | ' + $('fgBar').title + ' | ' + $('fgRisk').textContent + ' rings ' + rings());
      ok('the glow and the hot tier are different things: at the risk level the guard is still narrow',
        guardW() === 12 && !hasGem() && bladeLen() === 10 + forge.RISK_FROM, 'guard ' + guardW() + ' gem ' + hasGem());

      // --- the break: the one outcome with a story, counted from the end of the beat. From the
      // risk level up the hammering is four taps and the blade's heat ring breathes through it
      const atRisk = lv();
      const beat = verdictAt(atRisk);
      press('break');
      const brT = show(1900);
      ok('break at the risk level: four taps with the blade glowing, then the verdict at once',
        (R ? brT.beat4 == null && brT.ember == null && brT.broke == null && brT.shards == null
          : brT.beat4 === 0 && brT.ember === 0 && brT.broke === beat && brT.shards === beat)
        && brT.beat5 == null && brT.brace == null && brT.chip === beat, JSON.stringify(brT));
      ok('break: the flinch is a flinch, not a mark the anvil keeps',
        R ? brT.brokeOff == null : brT.brokeOff === beat + 160, 'off at ' + brT.brokeOff);
      ok('break: the sword goes, the anvil stands empty, and only then does the shop’s +0 arrive',
        (R ? brT.gone == null && brT.empty === 0 && brT.arrive == null
          : brT.gone === beat + 300 && brT.empty === beat + 460 && brT.arrive === beat + 760), JSON.stringify(brT));
      ok('break: the buttons are out of reach until the new sword is standing there',
        brT.unlock === (R ? 550 : beat + 1000) && brT.unlock > (R ? 400 : beat + 760) && brT.unlock > brT.empty, 'unlock at ' + brT.unlock);
      ok('break: the chip counts what the sword had eaten, which is the loss nobody used to see',
        /^bj-chip lose Destroyed · [\d,]+ fed$/.test(chip()) && Number(/· ([\d,]+) fed/.exec(chip())[1].replace(/,/g, '')) > forge.TABLE[atRisk].cost,
        chip() + ' | one attempt at +' + atRisk + ' costs ' + forge.TABLE[atRisk].cost);
      ok('break: a +0 sword, the gauge gone with it, and the best it reached kept',
        lv() === 0 && bladeLen() === 10 && rings() === 0 && heat() === 0
        && (R ? brT.spent == null : brT.spent === beat)
        && $('fgBest').textContent === 'best +' + atRisk && $('fgSide').textContent === '1 broken',
        chip() + ' lv ' + lv() + ' ' + $('fgBest').textContent + ' ' + $('fgSide').textContent);
      ok('break: the grave is counted on the heading and in its title, next to the record high',
        $('fgSide').title === atRisk + ' best · 1 destroyed · ' + Number(/· ([\d,]+) attempts/.exec($('fgSide').title)[1].replace(/,/g, '')) + ' attempts',
        $('fgSide').title);
      ok('break: it is read out with what was fed, not as a level',
        /^Destroyed\. [\d,]+ fed\. A new \+0 sword\. −/.test($('fgLive').textContent), JSON.stringify($('fgLive').textContent));

      // --- and a break cannot be leaned on: no press gets through mid-show
      climb(forge.RISK_FROM);
      const n2 = sentFg.length;
      press('break');
      let leaned = 0;
      for (let t = 0; t < (R ? 540 : beat + 990); t++) { $('fgEnhance').click(); doc.dispatchKey('e'); doc.pressKey('Enter', { target: doc.body }); if (sentFg.length > n2 + 1) leaned++; advance(1); }
      ok('break: neither the button nor the keys get through before the show ends',
        leaned === 0 && ops(n2) === 'enhance', leaned + ' through | ' + ops(n2));
      settle();
      ok('break: two swords lost now, and the corner says so', $('fgSide').textContent === '2 broken', $('fgSide').textContent);

      // --- the brink: the last two levels take longer and stop before the verdict
      ok('the brink is reached', climb(forge.MAX_LEVEL - 2), 'lv ' + lv());
      const brink = lv();
      ok('the brink is where the ritual is longest', riteOf(brink) === RITE.brink && riteOf(brink).ms > riteOf(forge.RISK_FROM).ms,
        riteOf(brink).ms + 'ms against ' + riteOf(forge.RISK_FROM).ms + 'ms at +' + forge.RISK_FROM);
      press('keep');
      const bkT = show(900);
      ok('brink: five taps, then the sword hangs there, and only then the verdict',
        (R ? bkT.beat5 == null && bkT.brace == null : bkT.beat5 === 0 && bkT.brace === RITE.brink.ms && bkT.ember === 0)
        && bkT.beat4 == null && bkT.chip === verdictAt(brink) && bkT.unlock === unlockAt(brink), JSON.stringify(bkT));
      ok('brink: the held breath is real time, not a redraw',
        R ? verdictAt(brink) === 0 : verdictAt(brink) === RITE.brink.ms + RITE.brink.brace && bkT.brace < bkT.chip,
        'brace at ' + bkT.brace + ', verdict at ' + bkT.chip);
      ok('brink: and it is more than twice the opening levels’ whole ritual',
        R || unlockAt(brink) > 2 * unlockAt(0), unlockAt(brink) + 'ms against ' + unlockAt(0) + 'ms');
      ok('brink: the gauge is worth the most here, where the chance is thinnest',
        gain() === '+' + forge.HEAT_STEP + ' from heat' && forge.oddsAt(brink, 1).up - forge.TABLE[brink].up === forge.HEAT_STEP,
        gain() + ' | cold ' + forge.TABLE[brink].up + '%');

      // --- the top of the ladder
      ok('a sword at the top has nothing left to forge and says nothing about money',
        climb(forge.MAX_LEVEL) && $('fgEnhance').disabled && btn('fgEnhance') === 'Enhance'
        && barOf().length === 0 && $('fgBar').title === '' && $('fgSucc').textContent === '' && $('fgRisk').textContent === '' && $('fgNote').hidden,
        'lv ' + lv() + ' | ' + btn('fgEnhance') + ' | slices ' + barOf().length + ' | note hidden ' + $('fgNote').hidden);
      ok('the top is the one level drawn with the flames and the double glow',
        rings() === 2 && flames() && drawn() && hasGem() && guardW() === 14 && bladeLen() === 20,
        'rings ' + rings() + ' flames ' + flames() + ' blade ' + bladeLen());
      ok('the top price is the engine’s own', btn('fgSell') === 'Sell ' + money(forge.TABLE[forge.MAX_LEVEL].sell), btn('fgSell'));
      $('fgSell').click(); advance(2); $('fgSell').click(); advance(2); settle();
      ok('selling the top sword starts the ladder again', lv() === 0 && $('fgSell').hidden && chip() === 'bj-chip win Sold +' + money(forge.TABLE[forge.MAX_LEVEL].sell), chip());
      // a million and a half credits arriving at once is still the game paying out, not an earning:
      // the header counts up to it with no coin flip, the way every other table's winnings do
      ok('a sale that big is counted up, not celebrated',
        !doc.querySelector('#hdCredits .cc-coin.flip') && hdrBal() === money(ledgerBalance()),
        hdrBal() + ' | ledger ' + money(ledgerBalance()) + ' | flip ' + !!doc.querySelector('#hdCredits .cc-coin.flip'));

      // --- the keys
      let n3 = sentFg.length;
      ext._test.setFgSeeds(() => fgSeed(0, 'up'));
      doc.dispatchKey('e'); advance(2);
      ok('E enhances', ops(n3) === 'enhance', ops(n3));
      settle();
      n3 = sentFg.length;
      doc.pressKey('Enter', { target: doc.body }); advance(2);
      ok('Enter enhances too', ops(n3) === 'enhance', ops(n3));
      settle();
      n3 = sentFg.length;
      doc.dispatchKey('s'); advance(2);
      ok('S on its own only arms the sale', btn('fgSell') === 'Tap again to sell' && sentFg.length === n3, btn('fgSell'));
      doc.dispatchKey('s'); advance(2);
      ok('S twice sells', ops(n3) === 'sell', ops(n3));
      settle();

      openList();
      n3 = sentFg.length;
      doc.dispatchKey('e'); doc.dispatchKey('s'); doc.pressKey('Enter', { target: doc.body }); advance(20);
      ok('guard: on the games list no forge key forges or sells', noMoves(n3), ops(n3));
      h.rowFor('poker').click(); advance(20);
      const pk0 = sentPk.length;
      doc.dispatchKey('e'); doc.dispatchKey('s'); advance(20);
      ok('guard: the forge keys do nothing at poker, and poker takes no forge message',
        noMoves(n3) && sentPk.length === pk0, ops(n3) + ' | pk ' + sentPk.length);
      $('pkBack').click(); advance(20);
      h.rowFor('forge').click(); advance(20);

      // --- coming back in is not the verdict happening again
      press('keep'); settle();
      const hotBefore = heat();
      ok('a verdict is on the line before leaving', chip() === 'bj-chip No change · heat ' + hotBefore + ' of ' + forge.HEAT_MAX, chip());
      $('fgBack').click(); advance(5);
      h.rowFor('forge').click(); advance(30);
      ok('re-entering shows the sword the host kept, with no verdict on it',
        chip() === 'none' && lv() === 0 && !$('fgEnhance').hidden && $('fgLive').textContent.indexOf('No change') === 0,
        chip() + ' | lv ' + lv());
      // the gauge is the sword's, so it survives walking out and back in: a bar bought with a fee
      // must not be lost to a panel being closed
      ok('and the gauge it was on comes back with it', heat() === hotBefore && hotBefore > 0, heat() + ' of ' + hotBefore);

      // --- a refused move: the host can turn a press down when another window spends the balance
      // first, and a refusal is not a verdict. The state it comes back with still carries the LAST
      // verdict, so anything read out here would be that one, said twice
      const bust = forge.view(forge.act(
        forge.load({ level: forge.RISK_FROM, moves: 9, tries: 9, spent: 0, best: forge.RISK_FROM, by: 't' }),
        { op: 'enhance', seed: fgSeed(forge.RISK_FROM, 'break') }), 0);
      const liveBefore = $('fgLive').textContent;
      h.intercept = (m) => {
        if (m.op !== 'enhance') return false;
        h.intercept = null;
        later(1, () => toWebview({ type: 'fg', n: m.n, state: bust, error: 'not enough credits', balance: ledgerBalance(), free: ledgerBalance() }));
        return true;
      };
      ext._test.setFgSeeds(() => fgSeed(0, 'up'));
      $('fgEnhance').click(); advance(3);
      let stirred = 0;
      for (let t = 0; t <= 1400; t++) {
        const box = $('fgSword');
        if (['beat', 'pop', 'drop', 'gone', 'arrive'].some((c) => box.classList.contains(c))) stirred++;
        if (doc.querySelector('#fgSword .fg-shard') || $('fgAnvil').classList.contains('broke')) stirred++;
        advance(1);
      }
      ok('a refused move: the notice shows and nothing on the anvil stirs', !$('fgErr').hidden && stirred === 0,
        $('fgErr').textContent + ' | stirred ' + stirred);
      ok('a refused move: the last verdict is not read out again, and no chip is put up for it',
        $('fgLive').textContent === liveBefore && $('fgLive').textContent.indexOf('Destroyed') < 0 && chip() === 'none',
        JSON.stringify($('fgLive').textContent) + ' | ' + chip());
      ok('a refused move: the screen says why it cannot forge rather than looking idle',
        $('fgEnhance').disabled && !$('fgNote').hidden, 'disabled ' + $('fgEnhance').disabled + ' note ' + $('fgNote').textContent);
      $('fgBack').click(); advance(5); h.rowFor('forge').click(); advance(30);

      // --- a press nobody answers
      h.intercept = (m) => { if (m.op !== 'enhance') return false; h.intercept = null; return true; };   // swallowed whole
      ext._test.setFgSeeds(() => fgSeed(lv(), 'up'));
      $('fgEnhance').click(); advance(5);
      ok('an unanswered press keeps the buttons out and says nothing yet', $('fgEnhance').disabled && $('fgErr').hidden);
      advance(3900);
      ok('still nothing just short of four seconds', $('fgErr').hidden, $('fgErr').textContent);
      advance(200);
      ok('at four seconds the forge admits it and hands the buttons back',
        !$('fgErr').hidden && $('fgErr').textContent.indexOf('respond') > 0 && !$('fgEnhance').disabled,
        $('fgErr').textContent + ' | enhance disabled ' + $('fgEnhance').disabled);
      $('fgBack').click(); advance(5); h.rowFor('forge').click(); advance(30);
      ok('and the notice goes when the next reply lands', $('fgErr').hidden, $('fgErr').textContent);

      // --- the sword is shared, so a move names the level it was asked at and the host may refuse it
      const asked = () => sentFg[sentFg.length - 1];
      const swallow = () => { h.intercept = (m) => { if (m.op === 'open') return false; h.intercept = null; return true; }; };
      const resync = () => { $('fgBack').click(); advance(5); h.rowFor('forge').click(); advance(30); };
      const moved7 = forge.view(forge.load({ level: 7, moves: 30, tries: 30, spent: 0, best: 7, earned: 0, by: 'ffffffffffffffff' }), 1e9);
      const liveMoved = $('fgLive').textContent;
      h.intercept = (m) => {
        if (m.op !== 'enhance') return false;
        h.intercept = null;
        later(1, () => toWebview({ type: 'fg', n: m.n, state: moved7, error: 'the sword has moved: it is +7 now', balance: ledgerBalance(), free: ledgerBalance() }));
        return true;
      };
      ext._test.setFgSeeds(() => fgSeed(lv(), 'up'));
      $('fgEnhance').click(); advance(1500);
      ok('a move the sword has outgrown: the sword that came back is drawn, fee and all',
        lv() === 7 && bladeLen() === 17 && btn('fgEnhance') === 'Enhance ' + money(forge.TABLE[7].cost)
        && barOf().join() === barWant(7).join() && !$('fgErr').hidden && $('fgErr').textContent.indexOf('+7') > 0,
        'lv ' + lv() + ' | ' + btn('fgEnhance') + ' | ' + $('fgErr').textContent);
      ok('and being told so is not a verdict: no chip, nothing read out',
        chip() === 'none' && $('fgLive').textContent === liveMoved, chip() + ' | ' + JSON.stringify($('fgLive').textContent));
      swallow(); $('fgEnhance').click(); advance(5);
      ok('the next press is asked at the level now on the screen, never at the one it set out with',
        asked().op === 'enhance' && asked().level === 7, JSON.stringify(asked()));
      advance(4100); resync();   // let the swallowed press time out, then take the host's truth back

      // --- the host's own broadcast: another window moved the sword and no request of ours is out
      const moved3 = forge.view(forge.load({ level: 3, moves: 40, tries: 40, spent: 0, best: 9, earned: 500, by: 'ffffffffffffffff' }), 1e9);
      const liveCast = $('fgLive').textContent;
      toWebview({ type: 'fg', state: moved3, balance: ledgerBalance(), free: ledgerBalance() });
      advance(20);
      ok('a reply with no request number redraws the sword where it stands now',
        lv() === 3 && bladeLen() === 13 && btn('fgEnhance') === 'Enhance ' + money(forge.TABLE[3].cost)
        && $('fgBest').textContent === 'best +9' && $('fgSide').textContent === '0 broken' && $('fgErr').hidden,
        'lv ' + lv() + ' | ' + btn('fgEnhance') + ' | ' + $('fgBest').textContent + ' | ' + $('fgSide').textContent);
      ok('and the list row follows a broadcast the same way the anvil does',
        $('fig-forge').textContent === '+3', $('fig-forge').textContent);
      ok('a broadcast is nobody’s move: no chip and nothing read out',
        chip() === 'none' && $('fgLive').textContent === liveCast, chip() + ' | ' + JSON.stringify($('fgLive').textContent));
      swallow(); $('fgEnhance').click(); advance(5);
      ok('and the press that follows it is asked at the level it brought',
        asked().level === 3, JSON.stringify(asked()));
      advance(4100); resync();
      ok('an open asks for the truth, so it names no level', sentFg.filter((m) => m.op === 'open').every((m) => m.level === undefined),
        JSON.stringify(sentFg.filter((m) => m.op === 'open').map((m) => m.level)));

      // --- while the host is thinking: the buttons are out and no second press leaves
      climb(1);
      h.hostDelay = 400;
      const n4 = sentFg.length;
      ext._test.setFgSeeds(() => fgSeed(lv(), 'up'));
      $('fgEnhance').click(); advance(5);
      ok('the buttons go out the moment a press leaves, not when the reply lands',
        $('fgEnhance').disabled && $('fgSell').disabled && !$('fgSell').hidden,
        'enhance ' + $('fgEnhance').disabled + ' sell ' + $('fgSell').disabled);
      $('fgEnhance').click(); doc.dispatchKey('e'); $('fgSell').click(); advance(5);
      ok('and nothing else gets through while it is in flight', ops(n4) === 'enhance', ops(n4));
      h.hostDelay = 1; settle();

      // --- walking out mid-press must not freeze the header, and must stop the forge's clock
      ext._test.setFgSeeds(() => fgSeed(lv(), 'up'));
      $('fgEnhance').click(); advance(2);
      $('hdCredits').click(); advance(5);
      toWebview({ type: 'data', data: { agents: [], agentActivity: { instances: [], stats: {} }, xp: {}, today: {}, count: 0, cfg: { panelHidden: [] }, credits: { balance: 4321, today: 777, frac: 0.5, perCredit: 100000, counting: false } } });
      advance(5);
      ok('leaving mid-press releases the header hold', /\+777 today/.test($('hdCredits').title) && hdrBal() === '4,321', JSON.stringify($('hdCredits').title) + ' ' + hdrBal());
      advance(3000);
      ok('and the press it walked out of never comes back to move the header',
        hdrBal() === '4,321' && $('fgErr').hidden, hdrBal() + ' err hidden ' + $('fgErr').hidden);
      ext._test.setFgSeeds(null);
    }
  }
};
