// The crossroads and the shop: the two screens the coin button now leads to.
//
// Neither is a game, which is why this file is named for what it is rather than for an id in the
// register (there is no entry there and there must not be one: docs/shop-spec.md, section 4-5). It
// lives beside the games because the harness reads one directory and because every mode here is
// the same thing the games' modes are: one page, one script, one process.
//
// WHAT IS PINNED HERE, and why each one would be expensive to get wrong:
//   1. the coin opens a CHOICE, not a screen: two doors, no numbers, no arrow, and leaving forgets
//      which door was taken, because what the reader asked for is the two ways in.
//   2. ONE ARROW IS ONE STEP, from four depths: a game's own depth, a game, the list, the shop.
//   3. the shelf is the FOUR SCENES, every one of them showing the same number of cells, and the
//      shop prices nothing: each cell arrives with its price, whether it is owned and whether a
//      press on it could change anything.
//   4. THREE KINDS OF CELL ARE TOLD APART. A drawing that can be chosen is a button; a drawing
//      that cannot (nothing to choose between, or not bought yet) is not; an empty slot has NO
//      PICTURE, which is the one thing that separates it from a drawing nobody can press.
//   5. A PURCHASE IS CHARGED ONCE AND IS NOT A WIN. The balance falls by the price, the ledger
//      holds the purchase and the money in one record, and the header does not celebrate it.
//   6. what cannot be afforded SAYS WHY, and says which of the two reasons it is: there are none,
//      or a table is holding them.
//   7. CHOOSING IS NOT BUYING. The host refuses a drawing nobody bought and one that does not
//      belong to the scene, and the money record does not move for a choice at all.
'use strict';

module.exports = {
  id: 'shop',
  modes: ['cross', 'shop', 'shop-poor', 'shop-held'],
  // 3,000 buys the one thing on the shelf and leaves something over. 5 is a purse that cannot
  // reach it, and 1,500 is a purse that can until a table is holding 1,000 of it, which is what
  // the two different short-purse sentences need
  start: { shop: 3000, 'shop-poor': 5, 'shop-held': 1500 },
  // the two shop modes RESUME INTO THE SHOP, which also says that the stored door comes back
  state: {
    shop: { tab: 'games', door: 'shop', lastTab: 'usage' },
    'shop-poor': { tab: 'games', door: 'shop', lastTab: 'usage' }
  },

  run: function (h, MODE) {
    const { ok, advance, doc, $, showing, notShown, bodyTabs, openList, openShop, openGame, active, activeName } = h;
    const css = () => doc.querySelector('style').textContent;
    const scenes = () => doc.querySelectorAll('#shSlots .sh-slot');
    const cells = () => doc.querySelectorAll('#shSlots .sh-cell');
    const cell = (key) => doc.querySelector('#shSlots .sh-cell[data-key="' + key + '"]');
    const soon = () => doc.querySelectorAll('#shSlots .sh-cell.soon');
    const worn = () => cells().filter((c) => c.classList.contains('on'));
    const wornKeys = () => worn().map((c) => c.getAttribute('data-key') || (c.querySelector('.sh-pic') || {}).src || '?');
    const btn = () => $('shAct');
    const note = () => $('shNote');
    const stored = () => h.gs.data.creditLedgerV1.shop || null;
    const srcOf = (e) => e && e.getAttribute('src');
    const picOf = (c) => srcOf(c && c.querySelector('.sh-pic'));
    const artOf = (key) => $('mascot').getAttribute('data-' + key);

    if (MODE === 'cross') {
    // ---------- 1. the coin opens a choice ----------
    ok('the page starts on Usage, as it always has', bodyTabs() === 'tab-usage', bodyTabs());
    $('hdCredits').click(); advance(20);
    ok('the coin opens the crossroads and neither of the two screens behind it',
      showing('panelCross') && !showing('panelGames') && !showing('panelShop')
      && notShown('panelTable') && bodyTabs() === 'tab-games', bodyTabs());
    const doors = doc.querySelectorAll('#panelCross .cr-door');
    ok('two doors, each a picture with its name under it',
      doors.length === 2
      && doors.map((d) => d.querySelector('.cr-cap').textContent).join() === 'Games,Shop'
      && doors.every((d) => !!d.querySelector('.cr-art img')),
      doors.map((d) => d.querySelector('.cr-cap').textContent).join());
    ok('and they are the two drawings, not a glyph or a tile',
      doors.map((d) => /[^/]+$/.exec(d.querySelector('.cr-art img').getAttribute('src'))[0]).join()
        === 'hero-games.png,hero-shop.png',
      doors.map((d) => d.querySelector('.cr-art img').getAttribute('src')).join(' '));
    // NO NUMBERS. The balance is in the button directly above this screen, and a figure here would
    // be the same number twice (docs/shop-spec.md, section 2-1)
    ok('there is not one digit on the screen', !/\d/.test($('panelCross').textContent),
      JSON.stringify($('panelCross').textContent.trim()));
    // NO ARROW either: the way out is the same button that was pressed to come in, and a second
    // control for one step is what section 4-2 refuses
    ok('and no second way back: the coin is the only one', !doc.querySelector('#panelCross .bj-back'));
    ok('the first door takes the focus', active() === $('crDoorGames'), activeName());
    // the pictures have no pixel grid to preserve, so nearest-neighbour would drop their outlines
    ok('the heroes are scaled smoothly while the pixel art is not',
      /\.cr-art img\{[^}]*max-height:120px/.test(css())
      && !/\.cr-art img\{[^}]*image-rendering/.test(css())
      && /\.sparkle\{[^}]*image-rendering:pixelated/.test(css()),
      (/\.cr-art img\{[^}]*\}/.exec(css()) || [''])[0]);

    // ---------- 2. one arrow is one step, from every depth ----------
    $('crDoorGames').click(); advance(20);
    ok('the Games door opens the list', showing('panelGames') && !showing('panelCross'), bodyTabs());
    ok('and the list carries the arrow back to the crossroads', !!$('gmBack'));
    $('gmBack').click(); advance(20);
    ok('which is one step up, not out of the area', showing('panelCross') && bodyTabs() === 'tab-games', bodyTabs());
    $('crDoorShop').click(); advance(20);
    ok('the Shop door opens the shop', showing('panelShop') && !showing('panelCross') && !showing('panelGames'), bodyTabs());
    $('shBack').click(); advance(20);
    ok('and its arrow climbs to the same place', showing('panelCross'), bodyTabs());
    // a game is one step further in, and the arrow unwinds one depth at a time
    openGame('blackjack'); advance(20);
    ok('a game opens from the list, two steps in', h.atTable(), bodyTabs());
    $('bjBack').click(); advance(20);
    ok('its arrow goes to the list', showing('panelGames') && !h.atTable(), bodyTabs());
    $('gmBack').click(); advance(20);
    ok('and the next press to the crossroads', showing('panelCross'), bodyTabs());

    // ---------- the door is not remembered ----------
    $('crDoorShop').click(); advance(20);
    $('hdCredits').click(); advance(20);
    ok('the coin leaves for the tab it was pressed from', bodyTabs() === 'tab-usage', bodyTabs());
    $('hdCredits').click(); advance(20);
    ok('and coming back shows the choice again, not the door last taken',
      showing('panelCross') && !showing('panelShop'), bodyTabs());

    // ---------- Escape takes the same step the arrow does ----------
    $('crDoorGames').click(); advance(20);
    doc.pressKey('Escape'); advance(20);
    ok('Escape in the list climbs to the crossroads', showing('panelCross'), bodyTabs());
    doc.pressKey('Escape'); advance(20);
    ok('and Escape on the crossroads leaves the area, like the coin', bodyTabs() === 'tab-usage', bodyTabs());

    ok('no handler threw', h.errors.length === 0, h.errors.map((e) => e && e.message).join(' | '));
    return;
    }

    // ---------- the shop ----------
    if (MODE === 'shop-held') {
      // 6. THE CREDITS ARE THERE AND STILL CANNOT BE SPENT, which is a different sentence from
      // having none. A bet of 1,000 against a purse of 1,500 leaves 500 free and the one thing on
      // the shelf out of reach, while the header still reads 1,500
      h.openTable();
      h.useSeed((st) => st.phase === 'player', 'held-');
      doc.querySelector('#bjStakes button[data-v="1000"]').click(); advance(5);
      $('bjDeal').click(); advance(2); advance(1200);
      ok('a round is live and holding its stake of 1,000',
        !$('bjPlay').hidden && h.sent('bj').filter((m) => m.op === 'deal').pop().bet === 1000, bodyTabs());
      openShop(); advance(20);
      ok('the purchase the balance covers is still refused', btn().disabled && !$('shCtl').hidden,
        btn().textContent + (btn().disabled ? ' (off)' : ' (on)'));
      ok('and the reason given is the table holding them, not an empty purse',
        !note().hidden && note().textContent === 'Another table is holding these credits.',
        JSON.stringify(note().textContent));
      ok('nothing was bought', stored() === null, JSON.stringify(stored()));
      ok('no handler threw', h.errors.length === 0, h.errors.map((e) => e && e.message).join(' | '));
      return;
    }

    if (MODE === 'shop-poor') {
      ok('the stored door comes back as the shop', showing('panelShop') && bodyTabs() === 'tab-games', bodyTabs());
      ok('five credits: the four scenes are still drawn, because what is in them is the point',
        scenes().length === 4 && !$('shTry').hidden, scenes().length + ' scene(s)');
      ok('nothing says it was bought', !doc.querySelector('#shSlots .sh-cell.owned .sh-tag[data-x]')
        && cells().every((c) => c.textContent !== 'own'),
        cells().map((c) => c.textContent).join(' '));
      ok('five credits: the one thing on sale is off and asks for its own price',
        btn().disabled && !note().hidden && note().textContent === 'You need 1,000 credits.',
        JSON.stringify(note().textContent));
      ok('and the button is still on the screen, because there is still something to buy',
        !$('shCtl').hidden && btn().textContent === 'Buy', btn().textContent);
      ok('no handler threw', h.errors.length === 0, h.errors.map((e) => e && e.message).join(' | '));
      return;
    }

    // ---------- 3. the shelf: four scenes ----------
    const shop = require(h.path.join(h.EXT, 'shop.js'));
    ok('the stored door comes back as the shop, and the list is not drawn under it',
      showing('panelShop') && !showing('panelGames') && !showing('panelCross'), bodyTabs());
    ok('and it asked the host once for what it sells',
      h.sent('shop').filter((m) => m.op === 'open').length === 1,
      h.sent('shop').map((m) => m.op).join(','));
    // the heading: one arrow, the shop's own glyph, and a corner that stays empty
    ok('the heading is an arrow, a glyph and the name',
      !!$('shBack') && doc.querySelectorAll('#panelShop .bj-back').length === 1
      && !!doc.querySelector('#panelShop .ihead .it svg')
      && doc.querySelector('#panelShop .bj-ttl').textContent === 'Shop'
      && doc.querySelector('#panelShop .bj-side').textContent === '',
      doc.querySelector('#panelShop .ihead').textContent.trim());
    ok('the shelf is the four scenes, named, each saying which moment it is',
      scenes().length === shop.SLOTS.length
      && scenes().map((s) => s.querySelector('.sh-sn').textContent).join() === shop.SLOTS.map((s) => s.name).join()
      && scenes().every((s) => !!s.querySelector('.sh-sw').textContent),
      scenes().map((s) => s.querySelector('.sh-sn').textContent + '/' + s.querySelector('.sh-sw').textContent).join(' '));
    // A RECTANGLE: every scene shows as many cells as the widest one has, so a scene with one
    // drawing is not a short row that reads as broken
    const widest = Math.max.apply(null, shop.SLOTS.map((s) => s.opts.length));
    ok('every scene shows the same number of cells, which is the widest scene’s',
      scenes().every((s) => s.querySelectorAll('.sh-cell').length === widest),
      scenes().map((s) => s.querySelectorAll('.sh-cell').length).join(','));
    ok('and the spare ones are empty slots, which is where the next drawing goes',
      soon().length === shop.SLOTS.reduce((n, s) => n + (widest - s.opts.length), 0) && soon().length > 0,
      soon().length + ' empty');

    // ---------- 4. three kinds of cell ----------
    // a drawing with a picture: its own, out of the ones the panel itself points at
    ok('every drawing on the shelf is the picture the panel would draw',
      shop.ITEMS.every((i) => picOf(cell(i.key)) === artOf(i.key)),
      shop.ITEMS.map((i) => i.key + (picOf(cell(i.key)) === artOf(i.key) ? ' ok' : ' MISMATCH')).join(' '));
    // AN EMPTY SLOT HAS NO PICTURE. That is the separator that matters: it and the laptop crab are
    // both unpressable, so what tells them apart is that one of them has a crab in it
    ok('an empty slot carries no picture, no price and no name for what might go in it',
      soon().every((c) => !c.querySelector('img') && c.textContent.trim() === 'Soon'),
      soon().map((c) => JSON.stringify(c.textContent)).join(' '));
    ok('and a drawing that cannot be chosen is not an empty slot: it has its picture and its word',
      !!picOf(cell('idle')) && cell('idle').textContent.trim() === 'free'
      && !cell('idle').classList.contains('soon'),
      JSON.stringify(cell('idle') && cell('idle').textContent));
    // NOT PRESSABLE AND NOT IN THE TAB ORDER, for both of those kinds: something that cannot be
    // chosen should not be counted through by a reader on a keyboard
    ok('neither an empty slot nor the unbought drawing is a button',
      soon().every((c) => c.localName !== 'button' && !c.hasAttribute('tabindex'))
      && cell('float').localName !== 'button' && !cell('float').hasAttribute('tabindex'),
      soon().map((c) => c.localName).join(' ') + ' / ' + cell('float').localName);
    ok('and an empty slot has no drawing to name, so there is nothing to send for it',
      soon().every((c) => !c.hasAttribute('data-key') && !c.hasAttribute('data-slot')),
      soon().map((c) => c.getAttribute('data-key') + '/' + c.getAttribute('data-slot')).join(' '));
    ok('and nor is a drawing in a scene with nothing to choose between',
      cell('idle').localName !== 'button' && cell('stunned').localName !== 'button'
      && cell('despair').localName !== 'button',
      ['idle', 'stunned', 'despair'].map((k) => k + ':' + cell(k).localName).join(' '));
    // ...while the scene that HAS two of their own is pressable on both of them
    ok('the scene with two drawings of their own is pressable on both',
      cell('coding').localName === 'button' && cell('working').localName === 'button',
      'coding:' + cell('coding').localName + ' working:' + cell('working').localName);
    ok('the unbought drawing says what it costs, as the stake chips write a figure',
      cell('float').textContent.trim() === '1K', cell('float').textContent);
    ok('and every cell says what it is for a reader who cannot see it',
      cells().every((c) => c.getAttribute('role') === 'img' || c.hasAttribute('aria-pressed'))
      && cells().every((c) => !!c.getAttribute('aria-label'))
      && cell('float').getAttribute('aria-label') === 'Floating crab, 1,000 credits',
      cells().map((c) => JSON.stringify(c.getAttribute('aria-label'))).join(' '));

    // ---------- 5. what is worn, and what is on sale ----------
    ok('one drawing is in use in every scene, and it is the four that come with the extension',
      worn().length === 4 && ['idle', 'coding', 'despair', 'stunned'].every((k) => cell(k).classList.contains('on')),
      cells().filter((c) => c.classList.contains('on')).map((c) => c.getAttribute('aria-label')).join(' | '));
    ok('and the one in use says so in words too, not only with a ring',
      cell('idle').getAttribute('aria-label') === 'Small crab, in use'
      && cell('working').getAttribute('aria-label') === 'Busy crab, yours',
      cell('idle').getAttribute('aria-label') + ' / ' + cell('working').getAttribute('aria-label'));
    ok('what is on sale sits next to the button that buys it, at its real size',
      !$('shTry').hidden && srcOf($('shArt')) === artOf('float')
      && $('shName').textContent === 'Floating crab' && /1,000/.test($('shPrice').textContent),
      $('shName').textContent + ' ' + $('shPrice').textContent);
    ok('and it is the mascot box to the pixel, so the preview and the panel cannot disagree',
      /\.sh-try img\{[^}]*width:88px/.test(css()) && /\.sh-try img\{[^}]*height:74px/.test(css())
      && /\.sh-try img\{[^}]*object-fit:contain/.test(css())
      && /\.sh-try img\{[^}]*object-position:bottom/.test(css()),
      (/\.sh-try img\{[^}]*\}/.exec(css()) || [''])[0]);
    ok('nothing is spent by arriving', stored() === null, JSON.stringify(stored()));
    ok('the button takes the focus, because it is what a reader came to press',
      active() === btn(), activeName());

    // ---------- 6. choosing, which is not buying ----------
    const ledger0 = JSON.stringify(h.gs.data.creditLedgerV1);
    const sent0 = h.sent('shop').length;
    h.mouseClick(cell('working')); advance(20);   // a real press focuses the button it presses
    ok('a choice swaps the drawing in that scene',
      cell('working').classList.contains('on') && !cell('coding').classList.contains('on')
      && cell('working').getAttribute('aria-pressed') === 'true'
      && cell('coding').getAttribute('aria-pressed') === 'false',
      wornKeys().join(' '));
    ok('and it is stored where the nicknames are, not in the ledger',
      h.gs.data.mascotSlotsV1 && h.gs.data.mascotSlotsV1.typing === 'working',
      JSON.stringify(h.gs.data.mascotSlotsV1));
    // THE MONEY DID NOT MOVE. Not the record, not the balance, and not one shop message either:
    // a choice is a preference and it does not go through the shop's own channel at all
    ok('the money record did not move for it',
      JSON.stringify(h.gs.data.creditLedgerV1) === ledger0 && stored() === null,
      JSON.stringify(stored()));
    ok('and no shop message was sent for it', h.sent('shop').length === sent0,
      (h.sent('shop').length - sent0) + ' new shop message(s)');
    // the shelf is replaced wholesale by the repaint, so the cell the press was on is a DETACHED
    // node afterwards: what is read here is that the focus came back to the new one and not that
    // it was merely left on something with the same name
    ok('the keyboard lands back on the cell that was pressed, which is a new node',
      active() === cell('working') && $('shSlots').contains(active()),
      'on ' + (active() && active().getAttribute('data-key'))
      + (active() && $('shSlots').contains(active()) ? ', attached' : ', DETACHED'));
    cell('coding').click(); advance(20);
    ok('and choosing the other one back is the same move the other way',
      cell('coding').classList.contains('on') && !cell('working').classList.contains('on')
      && h.gs.data.mascotSlotsV1.typing === 'coding', wornKeys().join(' '));
    // 7. REFUSED BY THE HOST, not by the screen: a drawing that does not belong to the scene, one
    // nobody bought, and a scene that does not exist
    const wornBefore = wornKeys().join(' ');
    for (const [slot, key] of [['burn', 'float'], ['quiet', 'float'], ['burn', 'coding'],
      ['spent', 'working'], ['nope', 'idle'], ['typing', 'nothing'], ['typing', '']]) {
      h.hostSend({ type: 'mascotSlot', slot, key }); advance(20);
      ok('the host refuses ' + slot + ' <- "' + key + '", and nothing moves',
        wornKeys().join(' ') === wornBefore && JSON.stringify(h.gs.data.creditLedgerV1) === ledger0,
        wornKeys().join(' '));
    }

    // ---------- 8. the purchase ----------
    const price = shop.itemOf('float').price;
    const bal0 = h.ledgerBalance();
    ok('it can be afforded, which is what the next few checks need', !btn().disabled, btn().textContent);
    btn().click(); advance(20);
    ok('buying charges the price exactly once',
      h.ledgerBalance() === bal0 - price, bal0 + ' -> ' + h.ledgerBalance());
    ok('and the ledger holds the purchase and the money in ONE record',
      !!stored() && stored().spent === price
      && Object.keys(stored().owned).join() === 'mascot:float' && stored().moves === 1,
      JSON.stringify(stored()));
    advance(700);   // the header counts down to its new figure; this is past the end of that
    ok('the header says the same thing the record does',
      h.hdrBal() === (bal0 - price).toLocaleString('en-US'), h.hdrBal());
    // A PURCHASE IS NOT AN EARNING: the coin does not flip and the figure does not roll, which is
    // what setCreditsQuiet is for (webview.js)
    ok('and the header does not celebrate it',
      !$('ccBal').classList.contains('roll')
      && !doc.querySelector('#hdCredits .cc-coin').classList.contains('flip'),
      $('ccBal').getAttribute('class') || '(no class)');
    // IT IS WORN AT ONCE. A purchase that showed nothing until a second press would read as
    // nothing having happened
    ok('what was bought is in its scene without a second press',
      cell('float').classList.contains('on') && !cell('despair').classList.contains('on'),
      wornKeys().join(' '));
    ok('and the scene it went into can now be pressed, because there are two of their own in it',
      cell('float').localName === 'button' && cell('despair').localName === 'button'
      && cell('float').textContent.trim() === 'own',
      cell('float').localName + '/' + cell('despair').localName + ' ' + cell('float').textContent);
    ok('it said so out loud, once', /Floating crab bought/.test($('shLive').textContent), $('shLive').textContent);
    // and the shop stops being a shop: nothing left to sell, so the block and the button go
    ok('with nothing left to sell, the sale block and the button leave together',
      $('shTry').hidden && $('shCtl').hidden && note().hidden,
      ($('shTry').hidden ? 'no block' : 'block') + ', ' + ($('shCtl').hidden ? 'no button' : 'button'));
    ok('and the stylesheet really hides a hidden sale block, which display:flex would not',
      /\.sh-try\[hidden\]\{display:none/.test(css()),
      (/\.sh-try\[hidden\][^}]*\}/.exec(css()) || ['(no rule)'])[0]);
    // ...and it can be taken back out, by name, which is what keeps an explicit choice of the free
    // drawing from being overruled by the purchase
    cell('despair').click(); advance(20);
    ok('the bought drawing can be taken back out of its scene',
      cell('despair').classList.contains('on') && !cell('float').classList.contains('on')
      && h.gs.data.mascotSlotsV1.burn === 'despair', wornKeys().join(' '));
    ok('and that did not refund anything', stored().spent === price && h.ledgerBalance() === bal0 - price,
      JSON.stringify(stored()));
    cell('float').click(); advance(20);
    ok('and put back in', cell('float').classList.contains('on'), wornKeys().join(' '));
    // the same press again is refused BY THE HOST, and the shelf does not move
    const spent1 = stored().spent;
    h.hostSend({ type: 'shop', op: 'buy', key: 'float', n: 9001 }); advance(20);
    ok('the host refuses a second purchase of the same thing, and nothing is charged',
      stored().spent === spent1 && h.ledgerBalance() === bal0 - price, JSON.stringify(stored()));
    for (const key of ['soon', 'witch', 'mascot:float', '', 'idle']) {
      h.hostSend({ type: 'shop', op: 'buy', key, n: 9100 }); advance(20);
      ok('a message buying "' + key + '" buys nothing and costs nothing',
        stored().spent === spent1 && Object.keys(stored().owned).join() === 'mascot:float'
        && !$('shErr').hidden, JSON.stringify(stored()) + ' / ' + $('shErr').textContent);
    }

    // ---------- the choice survives leaving the screen ----------
    openList(); advance(20); openShop(); advance(20);
    ok('coming back to the shop shows the same drawings in the same scenes',
      cell('float').classList.contains('on') && cell('coding').classList.contains('on')
      && worn().length === 4, wornKeys().join(' '));

    // ---------- the keyboard: this screen repaints on other windows' purchases ----------
    // The market's reported bug in this screen's shape. It re-asks the host whenever a push says
    // the shelf moved, and a repaint that pulls the keyboard out of the editor while somebody is
    // typing is exactly what CUC.refocus exists to prevent (webview.js, refocusIn)
    h.hasFocus = false;
    const moves0 = (doc.focusLog || []).length;
    h.hostSend({ type: 'shop', op: 'open', n: 9003 }); advance(20);
    ok('a repaint while the editor holds the focus takes nothing',
      (doc.focusLog || []).length === moves0 && active() === doc.body,
      ((doc.focusLog || []).length - moves0) + ' focus move(s), on ' + activeName());
    h.hasFocus = true;
    h.hostSend({ type: 'shop', op: 'open', n: 9004 }); advance(20);
    ok('and the same repaint hands it back once the webview holds it',
      $('panelShop').contains(active()), activeName());

    // ---------- a reply that cannot describe the shelf ----------
    // the shelf is drawn from the last reply that had one, so a reply that is only a reason leaves
    // what is on the screen exactly where it is (games/README.md, section 5)
    const shelf0 = cells().length;
    h.intercept = (m) => {
      if (m.type !== 'shop') return false;
      h.toWebview({ type: 'shop', n: m.n, balance: h.ledgerBalance(), free: h.ledgerBalance(), error: 'the shelf could not be read' });
      return true;
    };
    openList(); advance(20); openShop(); advance(20);
    ok('a reply with no shelf shows the reason and keeps what is drawn',
      !$('shErr').hidden && /could not be read/.test($('shErr').textContent) && cells().length === shelf0,
      $('shErr').textContent);
    // and when nothing answers at all, it says so
    h.intercept = (m) => m.type === 'shop';
    openList(); advance(20); openShop(); advance(5);
    ok('a message nobody answers leaves a clock running', h.pending() > 0, h.pending() + ' timer(s)');
    advance(4100);
    ok('and four seconds later the screen says so', /respond/.test($('shErr').textContent), $('shErr').textContent);
    // ---------- walking out with a message in flight ----------
    // A game drops its clock when it is left, and this screen has one too: without that, leaving
    // while a message is out there leaves it locked for the rest of the four seconds, and a reader
    // who comes straight back gets the stale shelf and nothing asked for a new one
    h.intercept = (m) => m.type === 'shop';
    openList(); advance(20); openShop(); advance(5);
    h.intercept = null;
    const asked = h.sent('shop').filter((m) => m.op === 'open').length;
    openList(); advance(20);          // out of the shop, one step up and across
    openShop(); advance(20);
    ok('leaving and coming back asks the host again rather than sitting out the wait',
      h.sent('shop').filter((m) => m.op === 'open').length === asked + 1 && $('shErr').hidden,
      (h.sent('shop').filter((m) => m.op === 'open').length - asked) + ' new ask(s), warning bar '
        + ($('shErr').hidden ? 'clear' : 'showing'));
    // the bar is HIDDEN rather than emptied, so what is read here is that state and not its text:
    // the sentence from four seconds ago is still in the element and says nothing about now
    advance(5000);
    ok('and the clock it left behind cannot fire into the new screen', $('shErr').hidden,
      $('shErr').hidden ? 'clear' : $('shErr').textContent);
    ok('nothing is still waiting to fire', h.pending() === 0, h.pending() + ' timer(s)');

    ok('no handler threw', h.errors.length === 0, h.errors.map((e) => e && e.message).join(' | '));
  }
};
