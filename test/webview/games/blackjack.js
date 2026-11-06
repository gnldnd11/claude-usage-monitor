// Blackjack, end to end: entry with the mouse and the keyboard, the deal's pacing, a stand through
// the dealer's draws, a split, the key guards, an open that resumes, a held data push, walking out
// mid-deal, a late reply, a reply that cannot be drawn, and the two short purses.
'use strict';

module.exports = {
  id: 'blackjack',
  modes: ['normal', 'reduce', 'poor50', 'poor5'],
  start: { poor50: 50, poor5: 5 },

  run: function (h, MODE) {
    const { ok, advance, later, doc, $, notShown, bodyTabs, inGames, atTable, gameRow,
        openList, openTable, reopenTable, dealerCards, allCards, isBack, lineText, hdrBal,
        latchIdle, active, activeName, mouseClick, ledgerBalance, useSeed, standOut, watch,
        noStaleTimer, toWebview, sentOps, sentHl, errors, hostLog, roCbs, ext, bj, credits,
        registry, gs, config, EXT, path } = h;

    if (MODE === 'poor50' || MODE === 'poor5') {
    openTable();
    const bs = [...doc.querySelectorAll('#bjStakes button')].map((b) => b.getAttribute('data-v') + (b.disabled ? ':off' : ':on') + (b.classList.contains('on') ? '*' : ''));
    const note = $('bjNote');
    if (MODE === 'poor50') {
      ok('50 credits: 10 on and picked, 100 and 1K off', bs.join(' ') === '10:on* 100:off 1000:off', bs.join(' '));
      ok('50 credits: deal enabled with bet 10, no note', !$('bjDeal').disabled && $('bjDeal').getAttribute('data-bet') === '10' && note.hidden);
      ok('disabled chip says why', doc.querySelector('#bjStakes button[data-v="100"]').title === 'Not enough credits');
    } else {
      ok('5 credits: every stake off, nothing picked', bs.join(' ') === '10:off 100:off 1000:off', bs.join(' '));
      ok('5 credits: deal disabled, note shown', $('bjDeal').disabled && !note.hidden && note.textContent === 'You need 10 credits to play.', note.textContent);
    }
    } else {
    const R = MODE === 'reduce';
    // ---------- entry with the mouse, then Enter ----------
    ok('initial: tab-usage on body', bodyTabs() === 'tab-usage', bodyTabs());
    ok('header shows the balance', hdrBal() === '1,000', hdrBal());
    mouseClick($('hdCredits')); advance(20);
    ok('credits click opens the games list, not a game', $('panelGames').style.display === '' && notShown('panelTable') && $('panelUsage').style.display === 'none' && bodyTabs() === 'tab-games' && $('hdCredits').getAttribute('aria-pressed') === 'true', bodyTabs());
    // the register is the expectation: every game it lists has a row, in that order, carrying that
    // game's own name and line. A game added to games/registry.js is checked here by being there
    ok('the list has every registered game, in order, with its name',
      doc.querySelectorAll('#panelGames .gm-row').map((r) => r.getAttribute('data-game')).join() === registry.GAMES.map((g) => g.id).join()
      && doc.querySelectorAll('#panelGames .gm-nm').map((e) => e.textContent).join() === registry.GAMES.map((g) => g.name).join(),
      doc.querySelectorAll('#panelGames .gm-row').map((r) => r.getAttribute('data-game')).join());
    // a second line only where it says something. Twelve rows reading "Min bet 10" is wallpaper,
    // and the same line on two rows out of fourteen is "this one is expensive"
    ok('the second line is drawn only for the games that have one',
      doc.querySelectorAll('#panelGames .gm-sub').map((e) => e.textContent).join()
        === registry.GAMES.filter((g) => g.sub).map((g) => g.sub).join(),
      doc.querySelectorAll('#panelGames .gm-sub').map((e) => e.textContent).join());
    ok('the four games this build opened with are all still listed',
      ['blackjack', 'hilo', 'poker', 'forge'].every((id) => !!registry.BY_ID[id]), registry.GAMES.map((g) => g.id).join());
    // A row's picture is painted art (an <img>, four games) or a drawn tile (an inline <svg
    // class="gm-tile">, the other ten), never both. Either way it sits OVER the glyph and the glyph
    // stays: an alt="" image that fails to load draws nothing, so the glyph underneath is what shows
    ok('every row carries one picture, decorative, over a glyph that stays',
      doc.querySelectorAll('#panelGames .gm-ic img').map((e) => /[^/]+$/.exec(e.getAttribute('src'))[0]).join()
        === registry.GAMES.filter((g) => g.thumb).map((g) => g.thumb).join()
      && doc.querySelectorAll('#panelGames .gm-ic img').every((e) => e.getAttribute('alt') === '')
      && doc.querySelectorAll('#panelGames .gm-ic .gm-tile').length === registry.GAMES.filter((g) => g.tile).length
      && doc.querySelectorAll('#panelGames .gm-ic svg:not(.gm-tile)').length === registry.GAMES.length,
      doc.querySelectorAll('#panelGames .gm-ic img').map((e) => /[^/]+$/.exec(e.getAttribute('src'))[0] + ' alt=' + JSON.stringify(e.getAttribute('alt'))).join(' '));
    // One heading where the group changes, and a group that comes back would print its heading
    // twice: see test/registry.test.js, which is where that mistake is named.
    // Favourites is a fifth heading, in the page from the first paint and hidden with its block
    // while nothing is starred (test/webview/games/_chrome.js, the favs mode, is where that lives)
    ok('one heading per family, in the order the register sorted them, under an empty Favourites',
      doc.querySelectorAll('#panelGames .gm-sec').map((e) => e.textContent).join()
        === ['Favourites'].concat(registry.GAMES.map((g) => g.group).filter((g, i, a) => g && g !== a[i - 1])).join()
      && $('gmFavs').hidden && doc.querySelectorAll('#panelGames .gm-row.fav').length === 0,
      doc.querySelectorAll('#panelGames .gm-sec').map((e) => e.textContent).join());
    // the figure slot is in the page from the first paint, because the two games that fill it
    // (the market's profit, the forge's level) have to be able to fill it before they are opened:
    // the host answers its own first data push with the stored sword, so the forge could put a
    // level on its row before anyone has opened it (games/forge/meta.js, onPush).
    //
    // ON A FRESH INSTALL IT PUTS NOTHING THERE, and that is the rule rather than a gap in it. The
    // figure's whole job is to have MOVED while the panel was shut (docs/game-panels.md, section 7)
    // and the stored sword here is the shop's own +0 that nobody has forged, so a `+0` on the row
    // would be a number on the one row where nothing has happened. The reply is checked for as well
    // as the empty slot: an empty row because the host never answered would be a different bug
    // wearing this one's result. The other half of the rule (a sword that HAS been touched fills
    // the row, +0 included) is the forge's own, in test/webview/games/forge.js's forge-row mode
    ok('every row has its figure slot, and the untouched sword leaves the forge’s empty',
      doc.querySelectorAll('#panelGames .gm-fig').length === registry.GAMES.length
      && hostLog.filter((l) => l.type === 'fg').length > 0
      && doc.querySelectorAll('#panelGames .gm-fig').every((e) => e.textContent === ''),
      doc.querySelectorAll('#panelGames .gm-fig').map((e) => JSON.stringify(e.textContent)).join()
        + ' after ' + hostLog.filter((l) => l.type === 'fg').length + ' forge replies');
    ok('the list takes the focus', active() === gameRow(), 'focus on ' + activeName());
    ok('no felt on the games list', !doc.querySelector('#panelGames .bj-felt') && !$('panelGames').classList.contains('bj-felt'), $('panelGames').className);
    const opens0 = sentOps.filter((o) => o === 'open').length;
    gameRow().click(); advance(5);
    ok('a list row opens that game and asks the host for its state', atTable() && $('panelTable').style.display === '' && $('panelGames').style.display === 'none' && sentOps.filter((o) => o === 'open').length === opens0 + 1, bodyTabs());
    $('bjBack').click(); advance(5);
    ok('back returns to the list', inGames() && !atTable() && $('panelGames').style.display === '' && notShown('panelTable'), bodyTabs());
    ok('back leaves the focus on the list', active() === gameRow(), 'focus on ' + activeName());
    $('hdCredits').click(); advance(5);
    ok('credits click from the list leaves for the last tab', bodyTabs() === 'tab-usage', bodyTabs());
    openTable();
    // the felt is the table surface: dealer, rule, hands and net sit on it, the controls do not
    const felt = doc.querySelector('#panelTable .bj-felt');
    const onFelt = (sel) => { const e = doc.querySelector(sel); return !!e && felt.contains(e); };
    ok('the felt holds the dealer row, the rule, the hands and the net',
      !!felt && onFelt('#panelTable .bj-dealer') && onFelt('#panelTable .bj-rule') && onFelt('#bjHands') && onFelt('#bjNet'));
    ok('the heading, the warning and the controls stay off the felt',
      !felt.contains(doc.querySelector('#panelTable .ihead')) && !felt.contains($('bjErr')) && !felt.contains($('bjBet')) && !felt.contains($('bjPlay')) && !felt.contains($('bjNote')));
    ok('the dealer is drawn from the crab asset', /crab\.png$/.test($('bjCrab').getAttribute('src')), $('bjCrab').getAttribute('src'));
    ok('betting: the player sits at the table with a dim stake under them',
      doc.querySelectorAll('#bjHands .bj-hero').length === 1 && doc.querySelector('#bjHands .bj-p[data-h="0"] .bj-hero') && doc.querySelector('#bjHands .bj-stake').classList.contains('preview'),
      doc.querySelector('#bjHands .bj-who').innerHTML.slice(0, 60));
    ok('empty seat with stake preview 10, deal enabled', doc.querySelectorAll('#bjHands .bj-p').length === 1 && doc.querySelector('#bjHands .bj-stake.preview b').textContent === '10' && !$('bjDeal').disabled);
    ok('focus moved from the header button to Deal', active() === $('bjDeal'), 'focus on ' + activeName());

    // ---------- deal (by Enter on the focused Deal) ----------
    const liveSeed = useSeed((st) => st.phase === 'player' && bj.act(st, 'stand').dealer.cards.length >= 4 && bj.act(st, 'stand').net !== 0, 'live-');
    doc.pressKey('Enter'); advance(1); // default action presses Deal, message to the host
    advance(1);                        // reply back
    const w = watch(1200, (marks, t) => { if (!$('bjPlay').hidden && !doc.querySelector('#bjPlay [data-op="stand"]').disabled && marks.unlock == null) marks.unlock = t; });
    ok('Enter dealt and stayed at the table', sentOps[sentOps.length - 1] === 'deal' && bodyTabs() === 'tab-games game-bj', sentOps.slice(-2).join(',') + ' ' + bodyTabs());
    const deal = ['P0.0', 'D0', 'P0.1', 'D1'].map((k) => w.seen[k]);
    if (!R) ok('deal: four cards in at 0/250/500/750ms', JSON.stringify(deal) === '[0,250,500,750]', JSON.stringify(deal));
    else ok('reduced motion: all four cards at once', JSON.stringify(deal) === '[0,0,0,0]', JSON.stringify(deal));
    ok('deal: the hole is a card back', isBack(dealerCards()[1]) && dealerCards()[1].classList.contains('down'));
    ok('deal: totals only after the cards (settle at 750+200+50)', R ? w.lines.p0 <= 1 : w.lines.p0 === 1000, 'player total at ' + w.lines.p0 + 'ms');
    ok('deal: dealer total hidden while the hole is down', !$('bjDTot').textContent);
    ok('deal: actions unlock at settle', R ? w.marks.unlock <= 1 : w.marks.unlock === 1000, 'unlock ' + w.marks.unlock);
    ok('deal: focus on the first action', active() && active().getAttribute('data-op') === 'hit', 'focus on ' + activeName());
    ok('deal: dealer label says the hole is face down', /face down$/.test($('bjDFan').getAttribute('aria-label')), $('bjDFan').getAttribute('aria-label'));

    // ---------- stand: reveal, dealer draws, settle, header ----------
    const before = hdrBal();
    const expect = bj.act(bj.newRound({ seed: liveSeed, bet: 10 }), 'stand');
    const tweenSeen = new Set();
    doc.dispatchKey('s'); advance(1); advance(1);
    const w2 = watch(3000, (marks, t) => {
      tweenSeen.add(hdrBal());
      if (hdrBal() !== before && marks.hdr == null) marks.hdr = t;
      if ($('hdCredits').querySelector('.cc-coin').classList.contains('flip')) marks.coinFlip = true;
      if ($('ccBal').classList.contains('roll')) marks.roll = true;
    });
    const draws = expect.dealer.cards.length - 2;
    const dT = [...Array(draws)].map((_, i) => w2.seen['D' + (i + 2)]);
    const settleAt = 150 + 550 * draws + 200 + 300; // flip at 150, a draw every 550, card-in 200, settle 300
    if (!R) {
      ok('stand: hole flips at 150ms, face swaps at 300ms', w2.flips.D1 === 150 && w2.faces.D1 === 300, 'flip ' + w2.flips.D1 + ' face ' + w2.faces.D1);
      ok('stand: dealer draws every 550ms after the flip', JSON.stringify(dT) === JSON.stringify(dT.map((_, i) => 150 + 550 * (i + 1))), JSON.stringify(dT));
      ok('stand: totals and chips wait for the last card', w2.lines.d === settleAt, 'dealer total at ' + w2.lines.d + ', expected ' + settleAt);
      ok('stand: header held while dealing, moves at settle', w2.marks.hdr === settleAt, 'header moved at ' + w2.marks.hdr);
      ok('stand: header counts up/down (tween), no coin flip, no roll', tweenSeen.size > 3 && !w2.marks.coinFlip && !w2.marks.roll, 'distinct header values ' + tweenSeen.size);
    } else {
      ok('reduced motion stand: final at once', w2.lines.d <= 1 && dealerCards().length === expect.dealer.cards.length && !isBack(dealerCards()[1]), 'dealer total at ' + w2.lines.d);
      ok('reduced motion: header jumps straight, no flip', !w2.marks.coinFlip && tweenSeen.size <= 2, 'distinct ' + tweenSeen.size);
    }
    ok('stand: the dealer stays on the idle image, win or lose', $('bjCrab').getAttribute('src') === h.idleSrc && $('bjCrab').attrs['data-despair'] === undefined, $('bjCrab').getAttribute('src'));
    const finalBal = (h.START + expect.net).toLocaleString('en-US');
    ok('stand: header ends at start + net', hdrBal() === finalBal, hdrBal() + ' vs ' + finalBal);
    ok('stand: result chip matches the engine', lineText(0).includes({ win: 'Win', lose: 'Lose', push: 'Push', bust: 'Bust', blackjack: 'Blackjack' }[expect.hands[0].result]), lineText(0));
    ok('stand: bet controls back, focus on Deal', !$('bjBet').hidden && $('bjPlay').hidden && !$('bjDeal').disabled && active() === $('bjDeal'), 'focus on ' + activeName());
    ok('reply went before the data push', (() => { const i = hostLog.map((m) => m.type); const k = i.lastIndexOf('bj'); return i.indexOf('data', k) > k; })(), hostLog.slice(-4).map((m) => m.type).join(','));
    ok('stand: result read out', /^(Win|Lose|Push|Bust|Blackjack).*Balance [\d,]+\.$/.test($('bjLive').textContent), JSON.stringify($('bjLive').textContent));
    ok('stand: dealer label gives the total', /, total \d+$/.test($('bjDFan').getAttribute('aria-label')), $('bjDFan').getAttribute('aria-label'));
    // a resize redraw repeats the result without popping the chips again
    const bodyRo = roCbs.find((r) => r.targets.includes(doc.body));
    bodyRo.cb(); advance(200);
    const chips = doc.querySelectorAll('#bjHands .bj-chip');
    ok('resize redraw: chips drawn still', chips.length > 0 && chips.every((c) => c.classList.contains('still')), chips.map((c) => c.className).join('|'));
    noStaleTimer('stand');

    // ---------- a stake chip picked with the mouse, then Enter deals ----------
    const splitSeed = useSeed((st) => st.phase === 'player' && bj.whyNot(st, 'split') == null && st.hands[0].cards[0].r !== 'A' && bj.act(st, 'split').phase === 'player', 'split-');
    const afterSplit = bj.act(bj.newRound({ seed: splitSeed, bet: 10 }), 'split');
    const wantDim = afterSplit.hands.map((h, i) => (i === afterSplit.active ? 'on' : 'dim')).join(',');
    mouseClick(doc.querySelector('#bjStakes button[data-v="10"]')); advance(1);
    ok('after picking a stake, focus is on Deal', active() === $('bjDeal'), 'focus on ' + activeName());
    doc.pressKey('Enter'); advance(2); advance(1200);
    ok('Enter after a stake pick deals', sentOps[sentOps.length - 1] === 'deal' && !$('bjPlay').hidden, sentOps.slice(-2).join(','));

    // ---------- split ----------
    ok('split offered', !doc.querySelector('#bjPlay [data-op="split"]').hidden && !doc.querySelector('#bjPlay [data-op="split"]').disabled);
    doc.dispatchKey('p'); advance(2);
    const w3 = watch(1500);
    ok('split: two rows', doc.querySelectorAll('#bjHands .bj-p').length === 2);
    ok('split: still one player, on the first row only', doc.querySelectorAll('#bjHands .bj-hero').length === 1 && !!doc.querySelector('#bjHands .bj-p[data-h="0"] .bj-hero'), doc.querySelectorAll('#bjHands .bj-hero').length + ' heroes');
    if (!R) ok('split: new cards at 0 (hand 1) and 250ms (hand 2)', w3.seen['P0.1'] === 0 && w3.seen['P1.1'] === 250, 'P0.1 ' + w3.seen['P0.1'] + ' P1.1 ' + w3.seen['P1.1']);
    const rows = () => [...doc.querySelectorAll('#bjHands .bj-p')].map((r) => r.classList.contains('dim') ? 'dim' : 'on').join(',');
    ok('split: the hand not in play is dimmed', rows() === wantDim, rows() + ' want ' + wantDim);
    ok('split: the round ends within four stands', standOut(4));
    ok('split done: nothing dimmed, net line shown', rows() === 'on,on' && !$('bjNet').hidden && /^Net /.test($('bjNet').textContent), rows() + ' ' + $('bjNet').textContent);
    noStaleTimer('split');

    // ---------- key guards ----------
    useSeed((st) => st.phase === 'player', 'guard-');
    $('bjDeal').click(); advance(2); advance(1200);
    const ops0 = sentOps.length;
    doc.pressKey('s', { target: $('amNick') });
    advance(5); ok('guard: a key typed into an input does not play', sentOps.length === ops0);
    $('settingsSheet').hidden = false; doc.dispatchKey('s'); advance(5); $('settingsSheet').hidden = true;
    ok('guard: an open sheet blocks the keys', sentOps.length === ops0);
    doc.pressKey('s', { target: doc.body, repeat: true }); advance(5);
    ok('guard: a held key (repeat) does not play', sentOps.length === ops0);
    $('tabUsage').click(); advance(2); doc.dispatchKey('s'); doc.dispatchKey('h'); doc.pressKey('Enter', { target: doc.body }); advance(5);
    ok('guard: keys do nothing outside the games area', sentOps.length === ops0 && bodyTabs() === 'tab-usage');
    openList(); doc.dispatchKey('s'); doc.pressKey('Enter', { target: doc.body }); advance(5);
    ok('guard: keys do nothing on the games list either', sentOps.length === ops0, bodyTabs());
    gameRow().click(); advance(5);
    ok('back at the table the hand is still live', !$('bjPlay').hidden, sentOps.slice(-1).join());
    ok('guard: a plain key still plays', standOut(4) && sentOps.slice(ops0).includes('stand'), sentOps.slice(ops0).join(','));

    // ---------- open resumes at once ----------
    useSeed((st) => st.phase === 'player', 'open-');
    $('bjDeal').click(); advance(2); advance(1200);
    const cardsBefore = allCards().length;
    $('hdCredits').click(); advance(5);
    ok('credits click again leaves the game for the last tab', bodyTabs() === 'tab-usage' && notShown('panelTable') && $('panelGames').style.display === 'none', bodyTabs());
    openTable(); advance(2);
    ok('reopen: the live round is drawn at once, nothing pending', allCards().length === cardsBefore && allCards().every((c) => !c.el.classList.contains('pending')) && lineText(0), 'cards ' + allCards().length + ', line ' + lineText(0));
    ok('reopen: actions live again, focus on the first action', !$('bjPlay').hidden && !doc.querySelector('#bjPlay [data-op="stand"]').disabled && active() && active().getAttribute('data-op') === 'hit', 'focus on ' + activeName());
    // an open reply that (wrongly) carries a seq is still drawn at once
    const fake = bj.view(bj.newRound({ seed: 'fake-open', bet: 10 }), 1000);
    h.intercept = (m) => { if (m.op !== 'open') return false; h.intercept = null; later(1, () => toWebview({ type: 'bj', n: m.n, state: fake, balance: ledgerBalance() })); return true; };
    reopenTable(); advance(3);
    ok('open with a seq: nothing pending, nothing paced', fake.seq.length > 0 && allCards().every((c) => !c.el.classList.contains('pending')), 'seq ' + fake.seq.length);
    reopenTable(); // re-sync with the host's real round
    ok('the host’s round ends within four stands', standOut(4));
    noStaleTimer('open');

    // ---------- a data push during the deal is held, then applied in full ----------
    useSeed((st) => st.phase === 'player' && bj.act(st, 'stand').net !== 0, 'hold-');
    $('bjDeal').click(); advance(2); advance(1200);
    const b0 = hdrBal();
    const dataOf = (today, frac) => ({ agents: [], agentActivity: { instances: [], stats: {} }, xp: {}, today: {}, count: 0, cfg: { panelHidden: [] }, credits: { balance: ledgerBalance(), today, frac, perCredit: 100000, counting: false } });
    const rowsLit = () => doc.querySelectorAll('#hdCredits .cc-r.on').length;
    doc.dispatchKey('s'); advance(1); advance(2); // stand reaches the host; its reply and data push come back
    toWebview({ type: 'data', data: dataOf(777, 0.5) }); advance(5); // a push only this test sends: today 777, three coin rows
    if (R) {
      ok('reduced motion: nothing held, the push shows at once', /\+777 today/.test($('hdCredits').title) && rowsLit() === 3, JSON.stringify($('hdCredits').title));
    } else {
      ok('mid-deal: header number and title held', hdrBal() === b0 && !/\+777 today/.test($('hdCredits').title), hdrBal() + ' ' + JSON.stringify($('hdCredits').title));
      advance(4000);
      ok('after settle the held push applies in full (today 777, three coin rows)', /\+777 today/.test($('hdCredits').title) && rowsLit() === 3 && hdrBal() === ledgerBalance().toLocaleString('en-US'), JSON.stringify($('hdCredits').title) + ' rows ' + rowsLit());
    }
    toWebview({ type: 'data', data: dataOf(888, 0) }); advance(5);
    ok('the hold is released: the next push shows at once', /\+888 today/.test($('hdCredits').title), JSON.stringify($('hdCredits').title));
    noStaleTimer('hold');

    // ---------- walking out mid-deal must not freeze the header ----------
    useSeed((st) => st.phase === 'player' && bj.act(st, 'stand').net !== 0, 'leave-');
    openTable(); $('bjDeal').click(); advance(2); advance(1200);
    doc.dispatchKey('s'); advance(1); advance(2); // the reply is in and the cards are still coming
    const paced = () => h.pending(50); // pacing and settle timers still to fire
    const pacedBefore = paced();
    $('hdCredits').click(); advance(5);           // walk out of the games area mid-deal
    ok('leaving mid-deal drops the pacing timers', (MODE === 'reduce' || pacedBefore > 0) && paced() === 0, pacedBefore + ' -> ' + paced());
    ok('leaving mid-deal: out of the games area', bodyTabs() === 'tab-usage', bodyTabs());
    toWebview({ type: 'data', data: dataOf(555, 0.5) }); advance(5);
    ok('leaving mid-deal releases the hold: the header moves again, quietly', /\+555 today/.test($('hdCredits').title) && hdrBal() === ledgerBalance().toLocaleString('en-US')
      && !$('hdCredits').querySelector('.cc-coin').classList.contains('flip') && !$('ccBal').classList.contains('roll'), JSON.stringify($('hdCredits').title) + ' ' + hdrBal());
    advance(5000);
    ok('leaving mid-deal: no stale notice, and the table opens clean again', $('bjErr').hidden && (openTable() || atTable()), bodyTabs());

    // ---------- a late reply (after the no-reply timeout) is drawn without pacing or reactions ----------
    useSeed((st) => st.phase === 'player' && bj.act(st, 'stand').dealer.cards.length >= 3 && bj.act(st, 'stand').net > 0, 'late-');
    $('bjDeal').click(); advance(2); advance(1200);
    const liveBefore = $('bjLive').textContent;
    h.hostDelay = 5000;
    doc.dispatchKey('s'); advance(2); h.hostDelay = 1;
    advance(4001);
    ok('late: the no-reply notice shows at 4s', !$('bjErr').hidden);
    advance(1000);
    ok('late reply: drawn at once, nothing pending, notice cleared', allCards().every((c) => !c.el.classList.contains('pending')) && $('bjErr').hidden && !$('bjDFan').children[1].classList.contains('down'));
    advance(2000);
    ok('late reply: not read out, dealer image untouched', $('bjLive').textContent === liveBefore && $('bjCrab').getAttribute('src') === h.idleSrc, JSON.stringify($('bjLive').textContent));
    ok('late reply: header moved quietly', !$('hdCredits').querySelector('.cc-coin').classList.contains('flip') && !$('ccBal').classList.contains('roll'));

    // ---------- the table never locks up on a reply it cannot draw ----------
    const answerOpen = (state) => { h.intercept = (m) => { if (m.op !== 'open') return false; h.intercept = null; later(1, () => toWebview({ type: 'bj', n: m.n, state, balance: ledgerBalance() })); return true; }; };
    const odd = { r: 'Z', s: 'X' };
    answerOpen({ id: 'x', phase: 'done', bet: 10, hands: [{ cards: [odd, { r: '9', s: 'S' }], total: 19, soft: false, bet: 10, done: true, result: 'win' }], active: 0, dealer: { cards: [odd, { r: '5', s: 'H' }], hole: false, total: 15 }, can: { hit: false, stand: false, double: false, split: false }, net: 10, seq: [] });
    const e0 = errors.length;
    reopenTable();
    ok('an unknown card is drawn as a back, no error', errors.length === e0 && isBack(dealerCards()[0]) && !$('bjDeal').disabled, errors.slice(e0).map((e) => e.message).join('; '));
    answerOpen({ id: 'y', phase: 'player', bet: 10, hands: [{ bet: 10 }], active: 0, dealer: { cards: [], hole: true, total: null }, can: { hit: true, stand: true, double: false, split: false }, net: null, seq: [] });
    reopenTable(); advance(50);
    ok('a state that breaks the drawing throws inside the handler', errors.length > e0, errors.slice(e0).map((e) => e.message).join('; '));
    const opens = sentOps.filter((o) => o === 'open').length;
    reopenTable();
    ok('...and the table is not locked: the next open still goes out and redraws', sentOps.filter((o) => o === 'open').length === opens + 1 && !$('bjDeal').disabled, 'opens ' + opens + ' -> ' + sentOps.filter((o) => o === 'open').length);

    // ---------- Credits hidden while at the table ----------
    openTable();
    ok('at the table again', atTable(), bodyTabs());
    config['panel.hidden'] = ['credits'];
    h.hostSend({ type: 'ready' }); advance(5);
    ok('hiding Credits leaves the games area for the last tab', bodyTabs() === 'tab-usage' && notShown('panelTable') && $('panelGames').style.display === 'none' && $('hdCredits').style.display === 'none', bodyTabs());
    $('hdCredits').click(); advance(5);
    ok('with Credits hidden the games list does not open', bodyTabs() === 'tab-usage', bodyTabs());
    config['panel.hidden'] = [];
    }
  }
};
