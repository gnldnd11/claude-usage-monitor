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
//   4. THREE KINDS OF CELL ARE TOLD APART. A drawing that can be chosen is a button; a PRICE is a
//      button too, and pressing it points the one control at that drawing (a ring says what is in
//      a scene, a bar under the price says what Buy pays, and no second colour is spent on the
//      difference); a drawing in a settled scene is not a button; an empty slot has NO PICTURE,
//      which is the one thing that separates it from a drawing nobody can press.
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
  // `shop` has to be able to buy the WHOLE shelf, because the last part of that run is what the
  // screen does once there is nothing left to sell. It is the shelf's own total plus room, read
  // here rather than written, so a new drawing on a higher rung does not quietly turn that last
  // part of the run into a purse that ran out. `shop-poor` is the opposite case on purpose: five
  // credits reaches nothing at all
  start: { shop: 50000, 'shop-poor': 5, 'shop-held': 1500 },
  // the two shop modes RESUME INTO THE SHOP, which also says that the stored door comes back
  state: {
    shop: { tab: 'games', door: 'shop', lastTab: 'usage' },
    'shop-poor': { tab: 'games', door: 'shop', lastTab: 'usage' }
  },

  run: function (h, MODE) {
    const { ok, advance, doc, $, showing, notShown, bodyTabs, openList, openShop, openGame, active, activeName } = h;
    // the catalog, which every mode now reads: the two short modes price their own refusal off it
    // rather than writing a figure that a drawing changing rung would silently falsify
    const shop = require(h.path.join(h.EXT, 'shop.js'));
    const css = () => doc.querySelector('style').textContent;
    const scenes = () => doc.querySelectorAll('#shSlots .sh-slot');
    const cells = () => doc.querySelectorAll('#shSlots .sh-cell');
    const cell = (key) => doc.querySelector('#shSlots .sh-cell[data-key="' + key + '"]');
    const soon = () => doc.querySelectorAll('#shSlots .sh-cell.soon');
    // the last row, which is NOT in #shSlots: a set rather than a scene, so it is its own block
    const rand = () => $('shRand');
    const randCells = () => doc.querySelectorAll('#shRand .sh-cell');
    const randSoon = () => doc.querySelectorAll('#shRand .sh-cell.soon');
    const poolCell = (key) => doc.querySelector('#shRand .sh-cell[data-pool="' + key + '"]');
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
      /\.cr-art\{[^}]*aspect-ratio:2\/1[^}]*max-height:72px/.test(css())
      && !/\.cr-art img\{[^}]*image-rendering/.test(css())
      && /\.sparkle\{[^}]*image-rendering:pixelated/.test(css()),
      (/\.cr-art\{[^}]*\}/.exec(css()) || [''])[0]);
    // each drawing fills the BOX, not its column: that is what puts the two on one height and
    // leaves the width neither of them needs as air around them (docs/shop-spec.md, section 2-2)
    ok('and each one is fitted whole into that box rather than stretched across its column',
      /\.cr-art img\{width:100%;height:100%;object-fit:contain;object-position:bottom/.test(css()),
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
      // NOTHING IS ASKED FOR UNTIL A PRICE IS PRESSED, so the refusal is not on the screen yet
      // either. The reader aims at something first, exactly as they would with a full purse
      ok('the shop opens with no button and so with nothing refused yet',
        $('shCtl').hidden && note().hidden, ($('shCtl').hidden ? 'no button' : 'button'));
      h.mouseClick(doc.querySelectorAll('#panelShop .sh-cell.buy')[0]); advance(40);
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
      // THE SHELF IS THE SCREEN, and it is all of the screen until a price is pressed: what is in
      // each moment is the point of this place whether anything can be afforded or not
      ok('five credits: the four scenes are still drawn, because what is in them is the point',
        scenes().length === 4 && $('shTry').hidden && $('shCtl').hidden,
        scenes().length + ' scene(s), ' + ($('shCtl').hidden ? 'no button' : 'button'));
      ok('nothing says it was bought', !doc.querySelector('#shSlots .sh-cell.owned .sh-tag[data-x]')
        && cells().every((c) => c.textContent !== 'own'),
        cells().map((c) => c.textContent).join(' '));
      // AIMING IS NOT AFFORDING, so a purse of five still aims. What it cannot do is press
      const want = doc.querySelectorAll('#panelShop .sh-cell.buy')[0];
      const wantKey = want && (want.getAttribute('data-key') || want.getAttribute('data-pool'));
      h.mouseClick(want); advance(40);
      ok('five credits: a price still aims, and then the button asks for that price and is off',
        btn().disabled && !note().hidden
        && note().textContent === 'You need ' + shop.itemOf(wantKey).price.toLocaleString('en-US') + ' credits.',
        JSON.stringify(note().textContent));
      ok('and the button is on the screen, because a price was pressed',
        !$('shCtl').hidden && btn().textContent === 'Buy', btn().textContent);
      // AIMING IS NOT AFFORDING. What the button is pointed at is the reader's, what it may be
      // pressed for is the host's, and a purse that cannot reach the price takes neither away
      // which cell that is comes from the shelf rather than from a name written here: the aim
      // falls on the first thing still for sale, and what stands first moved when a second
      // priced drawing went into an earlier scene (2026-11-20)
      {
        const forSale = cells().filter((c) => c.classList.contains('buy'));
        const first = forSale[0];
        ok('and the price is still a cell that can be pressed, and still the one aimed at',
          !!first && first.localName === 'button' && first.classList.contains('aim')
          && forSale.filter((c) => c.classList.contains('aim')).length === 1,
          (first ? first.localName + ' ' + (first.getAttribute('class') || '') : 'nothing for sale')
          + ' | for sale ' + forSale.length);
      }
      ok('no handler threw', h.errors.length === 0, h.errors.map((e) => e && e.message).join(' | '));
      return;
    }

    // ---------- 3. the shelf: four scenes ----------
    ok('the stored door comes back as the shop, and the list is not drawn under it',
      showing('panelShop') && !showing('panelGames') && !showing('panelCross'), bodyTabs());
    ok('and it asked the host once for what it sells',
      h.sent('shop').filter((m) => m.op === 'open').length === 1,
      h.sent('shop').map((m) => m.op).join(','));
    // the heading: one arrow, the shop's own glyph, and a corner that stays empty.
    // IT IS NAMED FOR WHAT IT SELLS. `Shop` is the DOOR's word, where it stands beside `Games` and
    // the two pictures say what each one is; the screen behind it has no picture to lean on and
    // sells one kind of thing, so it says which (docs/shop-spec.md, 1-1)
    ok('the heading is an arrow, a glyph and the name',
      !!$('shBack') && doc.querySelectorAll('#panelShop .bj-back').length === 1
      && !!doc.querySelector('#panelShop .ihead .it svg')
      && doc.querySelector('#panelShop .bj-ttl').textContent === 'Mascot shop'
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
    // every drawing the shelf shows anywhere: the four scenes, and the row under them that has no
    // scene. Both kinds take their picture from the ones the panel itself points at, so a cell can
    // never show something the crab box never draws
    const shelfItems = shop.ITEMS.filter((i) => shop.POOL.indexOf(i.key) < 0);
    ok('every drawing on the shelf is the picture the panel would draw',
      shelfItems.every((i) => picOf(cell(i.key)) === artOf(i.key))
      && shop.POOL.every((k) => picOf(poolCell(k)) === artOf(k)),
      shelfItems.concat(shop.POOL.map((k) => ({ key: k })))
        .map((i) => i.key + ((picOf(cell(i.key)) || picOf(poolCell(i.key))) === artOf(i.key) ? ' ok' : ' MISMATCH')).join(' '));
    // AN EMPTY SLOT HAS NO PICTURE. That is the separator that matters: it and the laptop crab are
    // both unpressable, so what tells them apart is that one of them has a crab in it
    ok('an empty slot carries no picture, no price and no name for what might go in it',
      soon().every((c) => !c.querySelector('img') && c.textContent.trim() === 'Soon'),
      soon().map((c) => JSON.stringify(c.textContent)).join(' '));
    ok('and a drawing that cannot be chosen is not an empty slot: it has its picture and its word',
      !!picOf(cell('idle')) && cell('idle').textContent.trim() === 'free'
      && !cell('idle').classList.contains('soon'),
      JSON.stringify(cell('idle') && cell('idle').textContent));
    // NOT PRESSABLE AND NOT IN THE TAB ORDER: something that cannot be chosen should not be
    // counted through by a reader on a keyboard
    ok('an empty slot is not a button',
      soon().every((c) => c.localName !== 'button' && !c.hasAttribute('tabindex')),
      soon().map((c) => c.localName).join(' '));
    // ...but A PRICE IS. The reported fault was a cell with a figure on it that did nothing when it
    // was pressed, and the answer is that pressing it aims the one control at that drawing
    ok('the unbought drawing is a button, because pressing a price points Buy at it',
      cell('float').localName === 'button' && !cell('float').hasAttribute('disabled'),
      cell('float').localName);
    ok('and an empty slot has no drawing to name, so there is nothing to send for it',
      soon().every((c) => !c.hasAttribute('data-key') && !c.hasAttribute('data-slot')),
      soon().map((c) => c.getAttribute('data-key') + '/' + c.getAttribute('data-slot')).join(' '));
    // A SCENE IS SETTLED UNTIL THE READER HAS TWO OF THEIR OWN IN IT, which is not the same as
    // its having two cells. Quiet shows the small crab beside a sleeping one that costs 1K, and
    // until that is bought there is still only one drawing to put in that moment, so its cell is
    // not a choosing button. Read off the catalog rather than named here, so a drawing changing
    // rung or scene moves this with it
    const settled = shop.SLOTS.filter((sc) => sc.opts.filter((k) => !shop.itemOf(k).price).length < 2);
    const choosable = shop.SLOTS.filter((sc) => sc.opts.filter((k) => !shop.itemOf(k).price).length > 1);
    ok('and nor is a drawing in a scene with nothing to choose between YET',
      settled.length > 0
      && settled.every((sc) => sc.opts.every((k) => cell(k).localName !== 'button' || cell(k).classList.contains('buy'))),
      settled.map((sc) => sc.id + ':' + sc.opts.map((k) => k + '=' + cell(k).localName
        + (cell(k).classList.contains('buy') ? '(buy)' : '')).join('/')).join(' '));
    // ...while a scene that HAS two free ones is pressable on both of them
    ok('a scene with two drawings of their own is pressable on both',
      choosable.length > 0 && choosable.every((sc) => sc.opts.every((k) => cell(k).localName === 'button')),
      choosable.map((sc) => sc.id + ':' + sc.opts.map((k) => k + '=' + cell(k).localName).join('/')).join(' '));
    // EVERY PRICE ON THE SHELF IS A RUNG OF THE LADDER and is written the way the stake chips
    // write a figure. Walked over the catalog so a new drawing on a higher rung is covered here
    // the day it lands, rather than the one priced drawing this used to name
    const forSaleKeys = shop.ITEMS.filter((i) => i.price).map((i) => i.key);
    ok('every unbought drawing says what it costs, as the stake chips write a figure',
      forSaleKeys.length > 1
      && forSaleKeys.every((k) => (cell(k) || poolCell(k)).textContent.trim()
        === (shop.itemOf(k).price / 1000) + 'K'),
      forSaleKeys.map((k) => k + ':' + (cell(k) || poolCell(k)).textContent.trim()).join(' '));
    ok('and every one of those prices is a rung of the ladder, not a number of its own',
      forSaleKeys.every((k) => shop.PRICES.indexOf(shop.itemOf(k).price) >= 0),
      forSaleKeys.map((k) => k + '@' + shop.itemOf(k).price).join(' ') + ' vs ' + shop.PRICES.join('/'));
    ok('and every cell says what it is for a reader who cannot see it',
      cells().every((c) => c.getAttribute('role') === 'img' || c.hasAttribute('aria-pressed'))
      && cells().every((c) => !!c.getAttribute('aria-label'))
      && cell('float').getAttribute('aria-label') === 'Floating crab, 1,000 credits',
      cells().map((c) => JSON.stringify(c.getAttribute('aria-label'))).join(' '));

    // ---------- 4a. the row that has no scene ----------
    // THE FIFTH ROW IS NOT A FIFTH SCENE, and the two reasons it is drawn apart are both checked
    // here. In meaning: it has no moment to belong to, so what it says under its name is the only
    // honest answer there is. Mechanically: the four above are a RECTANGLE sized by the widest
    // scene, so a four-cell row inside it would make all four of them four wide and eleven of the
    // twenty empty. It is out of that grid, under a hairline, in its own block.
    ok('the last row is outside the shelf’s rectangle, so the four scenes keep their two cells',
      !!rand() && !doc.querySelector('#shSlots [data-pool]')
      && scenes().every((s) => s.querySelectorAll('.sh-cell').length === widest),
      scenes().map((s) => s.querySelectorAll('.sh-cell').length).join(','));
    ok('and it is divided off with a hairline rather than a card or a second accent',
      /\.sh-rand\{[^}]*border-top:1px solid var\(--iborder\)/.test(css())
      && !/\.sh-rand\{[^}]*background/.test(css()),
      (/\.sh-rand\{[^}]*\}/.exec(css()) || ['(no rule)'])[0]);
    ok('it names itself and says when, with the only answer it has',
      rand().querySelector('.sh-sn').textContent === 'Random'
      && rand().querySelector('.sh-sw').textContent === 'Now and then',
      rand().querySelector('.sh-sn').textContent + '/' + rand().querySelector('.sh-sw').textContent);
    ok('it holds four cells, the spare ones empty, as the scenes’ spare ones are',
      randCells().length === 4 && randSoon().length === 4 - shop.POOL.length,
      randCells().length + ' cells, ' + randSoon().length + ' empty');
    // A CELL ON THIS ROW HAS TWO LIVES AND BOTH ARE PINNED. Unbought it is a price like every
    // other price on the shelf; bought it is the switch that is the whole of the off button.
    // This is the first life, because nothing on this row has been bought yet; the second is
    // checked where it exists, right after the purchase below.
    //
    // THE FIRST LIFE IS NOT A SPECIAL CASE. Same class, same word, same mark, same press: a
    // reader who learned the scenes' priced cells has nothing new to learn here, and a cell that
    // behaved differently would be a second vocabulary for one question
    const priced = shop.POOL.filter((k) => shop.itemOf(k).price);
    ok('the row has something priced on it, which is what the rest of this block is about',
      priced.length > 0, shop.POOL.map((k) => k + '@' + shop.itemOf(k).price).join(' '));
    ok('an unbought drawing in it wears its price, off the same ladder as the rest',
      priced.every((k) => poolCell(k).classList.contains('buy')
        && poolCell(k).textContent.trim() === (shop.itemOf(k).price / 1000) + 'K'
        && shop.PRICES.indexOf(shop.itemOf(k).price) >= 0),
      priced.map((k) => k + ':' + JSON.stringify(poolCell(k).textContent.trim())).join(' '));
    ok('and it is a button with the same state every priced cell carries, not a switch',
      priced.every((k) => poolCell(k).localName === 'button'
        && poolCell(k).hasAttribute('aria-pressed')
        && !/in play|, off$/.test(poolCell(k).getAttribute('aria-label'))),
      priced.map((k) => k + ':' + JSON.stringify(poolCell(k).getAttribute('aria-label'))).join(' '));
    // AND IT SAYS THE FIGURE OUT LOUD, because a reader who cannot see the tag is being asked to
    // spend. The tag is `10K` and the label is the whole number, which is the scenes' rule
    ok('and it reads out the price in full rather than the tag',
      priced.every((k) => poolCell(k).getAttribute('aria-label')
        === shop.itemOf(k).name + ', ' + shop.itemOf(k).price.toLocaleString('en-US') + ' credits'),
      priced.map((k) => JSON.stringify(poolCell(k).getAttribute('aria-label'))).join(' '));
    // NOTHING UNBOUGHT IS IN PLAY. The ring means "this one is showing" everywhere on this screen,
    // and a drawing nobody paid for showing up would be a teaser for something unsummonable
    ok('and nothing unbought wears the ring, because nothing unbought is in play',
      priced.every((k) => !poolCell(k).classList.contains('on')),
      priced.map((k) => k + ':' + (poolCell(k).getAttribute('class') || '')).join(' '));
    // ---------- 5. what is worn, and what is on sale ----------
    ok('one drawing is in use in every scene, and it is the four that come with the extension',
      worn().length === 4 && ['idle', 'coding', 'despair', 'stunned'].every((k) => cell(k).classList.contains('on')),
      cells().filter((c) => c.classList.contains('on')).map((c) => c.getAttribute('aria-label')).join(' | '));
    ok('and the one in use says so in words too, not only with a ring',
      cell('idle').getAttribute('aria-label') === 'Small crab, in use'
      && cell('working').getAttribute('aria-label') === 'Busy crab, yours',
      cell('idle').getAttribute('aria-label') + ' / ' + cell('working').getAttribute('aria-label'));
    // ---------- 5a. NOTHING IS AIMED UNTIL SOMETHING IS PRESSED ----------
    // The screen used to open with the first thing on the shelf already aimed at, so that a cell
    // being pressable was visible from the start. The reader threw it out, and the reason is the
    // better one: a live Buy on a screen nobody has touched is a button that will spend something
    // they did not choose, and what it was pointed at was a mark further up the shelf.
    const aimed = () => doc.querySelectorAll('#panelShop .sh-cell.aim');
    const forSale = () => doc.querySelectorAll('#panelShop .sh-cell.buy');
    // CHOOSING IS NOT AIMING, and this is the only place it can be seen: once a price has been
    // pressed the button is out and a choice could not be told from it. So it is checked here,
    // before anything has been pressed, and the scene is put back the way it was found.
    // A free cell has no price, nothing on this screen will ever charge for it, and a Buy button
    // appearing because somebody swapped which crab is in a moment would be a button offering to
    // sell them what they already have
    // the cell is named by its KEY and looked up again after the press: a press rebuilds the whole
    // shelf, so the node pressed is detached by the answer to its own press
    const pickFrom = cells().filter((c) => c.classList.contains('pick') && !c.classList.contains('on'))[0];
    const pickKey = pickFrom.getAttribute('data-key');
    const backKey = cells().filter((c) => c.classList.contains('on')
      && c.getAttribute('data-slot') === pickFrom.getAttribute('data-slot'))[0].getAttribute('data-key');
    h.mouseClick(pickFrom); advance(40);
    ok('pressing a drawing with no price changes the scene and brings no button out',
      cell(pickKey).classList.contains('on') && $('shCtl').hidden && $('shTry').hidden
      && doc.querySelectorAll('#panelShop .sh-cell.aim').length === 0,
      cell(pickKey).getAttribute('aria-label') + ' | '
      + ($('shCtl').hidden ? 'no button' : 'BUTTON') + ', ' + aimed().length + ' aimed');
    h.mouseClick(cell(backKey)); advance(40);   // put the scene back the way it was found
    ok('the shelf opens with things for sale on it and nothing aimed at',
      forSale().length === shop.ITEMS.filter((i) => i.price).length && aimed().length === 0,
      forSale().length + ' for sale, ' + aimed().length + ' aimed');
    ok('and so there is no block and no button, rather than a button nobody pointed',
      $('shTry').hidden && $('shCtl').hidden && note().hidden,
      ($('shTry').hidden ? 'no block' : 'block') + ', ' + ($('shCtl').hidden ? 'no button' : 'button'));
    // WHAT SAYS A CELL CAN BE PRESSED IS THE PRICE ON IT. That is the thing the old fallback was
    // there to replace, so it has to be on every one of them or the screen says nothing at all
    ok('what says a cell may be pressed is the price written on it',
      forSale().map((c) => c.textContent.trim()).every((t) => /^\d+K$/.test(t)),
      forSale().map((c) => (c.getAttribute('data-key') || c.getAttribute('data-pool')) + ':' + c.textContent.trim()).join(' '));
    // THE WHOLE SHELF IS ABOVE THE BUTTON, in DOM order, which is what makes a bar under a price
    // point DOWN at the button that pays it. The last row sat below the button for one version,
    // from when nothing in it had a price; a bar down there pointed up past the thing it meant
    const order = $('panelShop').children.map((e) => e.getAttribute('id') || e.getAttribute('class'));
    const at = (id) => order.indexOf(id);
    ok('the whole shelf, last row included, comes before the button in the page',
      at('shSlots') >= 0 && at('shRand') > at('shSlots')
      && at('shTry') > at('shRand') && at('shCtl') > at('shTry'),
      order.join(' > '));
    // ---------- 5b. ...AND THEN IT IS PRESSED ----------
    // WHICH CELL IS READ OFF THE SHELF, not written here: what stands first for sale moved the day
    // a second priced drawing went into an earlier scene (2026-11-20, the sleeping crab in quiet)
    h.mouseClick(forSale()[0]); advance(40);
    const aim0 = doc.querySelector('#panelShop .sh-cell.aim');
    const aim0Key = aim0 && (aim0.getAttribute('data-key') || aim0.getAttribute('data-pool'));
    ok('a press on a price is what brings the block and the button out',
      !$('shTry').hidden && !$('shCtl').hidden && !!aim0Key, aim0Key);
    ok('what is on sale sits next to the button that buys it, at its real size',
      !!aim0Key && srcOf($('shArt')) === artOf(aim0Key)
      && $('shName').textContent === shop.itemOf(aim0Key).name
      && $('shPrice').textContent.indexOf(shop.itemOf(aim0Key).price.toLocaleString('en-US')) >= 0,
      $('shName').textContent + ' ' + $('shPrice').textContent);
    // ONE MARK ON THE WHOLE SCREEN, and that means both rows: the last row's priced cells can be
    // aimed at too, so counting only the scenes would miss a second bar appearing down there
    ok('and the cell it was filled from is marked, so the two point at each other',
      !!aim0 && aim0.getAttribute('aria-pressed') === 'true'
      && doc.querySelectorAll('#panelShop .sh-cell.aim').length === 1,
      doc.querySelectorAll('#panelShop .sh-cell.aim')
        .map((c) => c.getAttribute('data-key') || c.getAttribute('data-pool')).join());
    // ONE ACCENT, TWO SHAPES. A ring encloses the cell and says what is in that scene; a bar lies
    // on the bottom edge and says what Buy pays. The screen gains no second colour for it, and the
    // bar is a fill rather than a lifted plate so the high-contrast theme still shows it
    ok('the two marks are one colour in two shapes, and neither is a new colour',
      /\.sh-cell\.on\{[^}]*box-shadow:inset 0 0 0 1\.5px #e8895a/.test(css())
      && /\.sh-cell\.aim::after\{[^}]*background:#e8895a/.test(css())
      && !/\.sh-cell\.aim[^}]*box-shadow/.test(css()),
      (/\.sh-cell\.aim::after\{[^}]*\}/.exec(css()) || ['(no rule)'])[0]);
    ok('and the worn ring and the aimed bar are never on one cell',
      cells().every((c) => !(c.classList.contains('on') && c.classList.contains('aim'))),
      cells().filter((c) => c.classList.contains('aim')).map((c) => c.getAttribute('class')).join(' | '));
    ok('and it is the mascot box to the pixel, so the preview and the panel cannot disagree',
      /\.sh-try img\{[^}]*width:88px/.test(css()) && /\.sh-try img\{[^}]*height:74px/.test(css())
      && /\.sh-try img\{[^}]*object-fit:contain/.test(css())
      && /\.sh-try img\{[^}]*object-position:bottom/.test(css()),
      (/\.sh-try img\{[^}]*\}/.exec(css()) || [''])[0]);
    ok('nothing is spent by arriving or by aiming', stored() === null, JSON.stringify(stored()));

    // ---------- 6. choosing, which is not buying ----------
    const ledger0 = JSON.stringify(h.gs.data.creditLedgerV1);
    const sent0 = h.sent('shop').length;
    // THE LAST ROW'S PRICE IS PRESSED THE WAY EVERY PRICE IS, because that is what it is until it
    // is bought: the press points the one button at it and sends nothing. The switch that cell
    // becomes afterwards is checked after the purchase, which is where it exists
    const poolBuy = shop.POOL.filter((k) => shop.itemOf(k).price)[0];
    h.mouseClick(poolCell(poolBuy)); advance(40);
    ok('a price on the last row aims the one button at itself, like every other price',
      poolCell(poolBuy).classList.contains('aim')
      && poolCell(poolBuy).getAttribute('aria-pressed') === 'true'
      && $('shName').textContent === shop.itemOf(poolBuy).name
      && doc.querySelectorAll('#panelShop .sh-cell.aim').length === 1,
      $('shName').textContent + ' | aim on ' + doc.querySelectorAll('#panelShop .sh-cell.aim')
        .map((c) => c.getAttribute('data-key') || c.getAttribute('data-pool')).join());
    ok('and it does not switch anything on, because nobody owns it yet',
      !poolCell(poolBuy).classList.contains('on') && h.sent('mascotPool').length === 0,
      JSON.stringify(h.sent('mascotPool')));
    ok('and aiming at it spent nothing and sent the host nothing',
      stored() === null && h.sent('shop').length === sent0, JSON.stringify(stored()));
    // ...and the aim goes back where it was, so the rest of this run reads the shelf as it found it
    h.mouseClick(cells().filter((c) => c.classList.contains('buy'))[0]); advance(40);
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

    // ---------- 7b. pressing a price, which is not buying either ----------
    // A PRESS IS ANSWERED EVEN WHEN THE SHELF HAS NOTHING TO MOVE: the cell pressed here is the
    // one already aimed at, and without this that press would look exactly like the fault that
    // was reported, a figure on a cell and nothing happening
    const ledger1 = JSON.stringify(h.gs.data.creditLedgerV1);
    const sent1a = h.sent('shop').length;
    $('shTry').classList.remove('ping');
    h.mouseClick(cell('float')); advance(20);
    ok('pressing the price answers in the block the price is in',
      $('shTry').classList.contains('ping') && srcOf($('shArt')) === artOf('float'),
      $('shTry').getAttribute('class') || '(no class)');
    ok('and the aim stays where it was, because there is nothing else to aim at',
      cell('float').classList.contains('aim')
      && doc.querySelectorAll('#panelShop .sh-cell.aim').length === 1, wornKeys().join(' '));
    ok('nothing was spent, nothing was sent and nothing was worn by it',
      JSON.stringify(h.gs.data.creditLedgerV1) === ledger1 && stored() === null
      && h.sent('shop').length === sent1a && !h.gs.data.mascotSlotsV1.burn,
      JSON.stringify(stored()) + ' / ' + JSON.stringify(h.gs.data.mascotSlotsV1));
    ok('and the keyboard is still on the cell that was pressed',
      active() === cell('float') && $('shSlots').contains(active()), activeName());
    // the one piece of motion on this screen, and it is off where a reader asked for no motion
    ok('the answer is a step of attention, and it is off under reduced motion',
      /\.sh-try\.ping\{animation:shPing/.test(css())
      && /@media \(prefers-reduced-motion:reduce\)\{\.sh-try\.ping\{animation:none/.test(css()),
      (/\.sh-try\.ping\{[^}]*\}/.exec(css()) || ['(no rule)'])[0]);

    // ---------- 8. the purchase ----------
    // EVERY PURCHASE IS TWO PRESSES: the cell, then the button. There is no aim until the first
    // of them, so this is the whole shape of buying anything now.
    // WHICH ITEM IS READ OFF THE SHELF, not written here. What stands first for sale moves
    // whenever a priced drawing joins an earlier scene (2026-11-20: the sleeping crab in quiet)
    const bal0 = h.ledgerBalance();
    // THE AIM IS A CURSOR AND IT SURVIVES until something is bought: a press put it here a few
    // blocks up and nothing since has taken it away, so the button is still on the screen
    const aimCell = doc.querySelector('#shSlots .sh-cell.aim');
    const aimKey = aimCell && aimCell.getAttribute('data-key');
    const aimSlot = aimCell && aimCell.getAttribute('data-slot');
    const price = aimKey ? shop.itemOf(aimKey).price : 0;
    ok('the press from a few blocks up is still aimed, and the button is still there for it',
      !!aimKey && price > 0 && !$('shCtl').hidden && !$('shTry').hidden, aimKey + ' at ' + price);
    ok('it can be afforded, which is what the next few checks need', !btn().disabled, btn().textContent);
    btn().click(); advance(20);
    ok('buying charges the price exactly once',
      h.ledgerBalance() === bal0 - price, bal0 + ' -> ' + h.ledgerBalance());
    ok('and the ledger holds the purchase and the money in ONE record',
      !!stored() && stored().spent === price
      && Object.keys(stored().owned).join() === shop.slotOf(aimKey) && stored().moves === 1,
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
    const aimFree = shop.SLOTS.filter((s) => s.id === aimSlot).map((s) => s.free)[0];
    ok('what was bought is in its scene without a second press',
      cell(aimKey).classList.contains('on') && !cell(aimFree).classList.contains('on'),
      wornKeys().join(' '));
    ok('and the scene it went into can now be pressed, because there are two of their own in it',
      cell(aimKey).localName === 'button' && cell(aimFree).localName === 'button'
      && cell(aimKey).textContent.trim() === 'own',
      cell(aimKey).localName + '/' + cell(aimFree).localName + ' ' + cell(aimKey).textContent);
    ok('it said so out loud, once',
      new RegExp(shop.itemOf(aimKey).name + ' bought').test($('shLive').textContent), $('shLive').textContent);
    // AND THE BUTTON LEAVES AGAIN, with priced cells still on the shelf. That is the half of the
    // new rule that cost something to get wrong: the aim is cleared by the purchase taking its
    // drawing off the sale list, so the NEXT purchase starts from a press exactly like this one
    ok('the button goes away again after one purchase, though there is still plenty for sale',
      $('shTry').hidden && $('shCtl').hidden
      && doc.querySelectorAll('#panelShop .sh-cell.aim').length === 0
      && doc.querySelectorAll('#panelShop .sh-cell.buy').length > 0,
      doc.querySelectorAll('#panelShop .sh-cell.buy').length + ' still for sale, '
      + ($('shCtl').hidden ? 'no button' : 'BUTTON STILL THERE'));
    // THE SHOP STOPS BEING A SHOP, but only once there is nothing left. Buy the rest the way the
    // reader has to: press a price, press the button, and count the pairs rather than the items
    let more = 0;
    while (doc.querySelectorAll('#panelShop .sh-cell.buy').length && more < 8) {
      h.mouseClick(doc.querySelectorAll('#panelShop .sh-cell.buy')[0]); advance(40);
      if ($('shCtl').hidden || btn().disabled) break;
      btn().click(); advance(20);
      more++;
    }
    ok('the rest of the shelf is bought the same way, a press on the cell and a press on the button',
      more === shop.ITEMS.filter((s) => s.price).length - 1, more + ' more purchase(s)');
    ok('with nothing left to sell, the sale block and the button leave together',
      $('shTry').hidden && $('shCtl').hidden && note().hidden,
      ($('shTry').hidden ? 'no block' : 'block') + ', ' + ($('shCtl').hidden ? 'no button' : 'button'));
    // ...and the mark that pointed at the button goes with them. A bar under a price with no
    // button under it would be a cursor on a control that is not there any more
    ok('and nothing anywhere on the screen is still a price or a mark',
      doc.querySelectorAll('#panelShop .sh-cell.aim').length === 0
      && doc.querySelectorAll('#panelShop .sh-cell.buy').length === 0,
      doc.querySelectorAll('#panelShop .sh-cell.aim,#panelShop .sh-cell.buy')
        .map((c) => c.getAttribute('data-key') || c.getAttribute('data-pool')).join());
    ok('and the stylesheet really hides a hidden sale block, which display:flex would not',
      /\.sh-try\[hidden\]\{display:none/.test(css()),
      (/\.sh-try\[hidden\][^}]*\}/.exec(css()) || ['(no rule)'])[0]);
    // WHAT THE WHOLE SHELF COST, summed off the catalog rather than written down, so a drawing
    // moving rung moves this with it
    const spentAll = shop.ITEMS.filter((i) => i.price).reduce((n, i) => n + i.price, 0);
    ok('the purse is down by the sum of the shelf and not a credit more',
      stored().spent === spentAll && h.ledgerBalance() === bal0 - spentAll,
      bal0 + ' -> ' + h.ledgerBalance() + ' against ' + spentAll);

    // ---------- 8a. THE SECOND LIFE OF A POOL CELL ----------
    // A cell on the last row was a price a moment ago and is a switch now. That is the whole
    // bargain of selling something nobody can summon: buying it is what puts it in play, and the
    // off switch is the thing bought rather than a setting somewhere else
    ok('a drawing on the last row is in play the moment it is bought, with no second press',
      poolCell(poolBuy).classList.contains('on')
      && poolCell(poolBuy).getAttribute('aria-label') === shop.itemOf(poolBuy).name + ', in play',
      poolCell(poolBuy).getAttribute('aria-label'));
    ok('and its cell stopped being a price and became a switch',
      !poolCell(poolBuy).classList.contains('buy') && !poolCell(poolBuy).classList.contains('aim')
      && poolCell(poolBuy).textContent.trim() === 'on',
      (poolCell(poolBuy).getAttribute('class') || '') + ' ' + JSON.stringify(poolCell(poolBuy).textContent.trim()));
    const spentBefore = stored().spent;
    poolCell(poolBuy).focus();
    poolCell(poolBuy).click(); advance(40);
    ok('one press takes it out of play, and the screen waits for the host to say so',
      !poolCell(poolBuy).classList.contains('on')
      && poolCell(poolBuy).getAttribute('aria-pressed') === 'false'
      && poolCell(poolBuy).textContent.trim() === 'off',
      poolCell(poolBuy).getAttribute('aria-label'));
    // A PRESS REBUILDS THE WHOLE SHELF, so the cell the keyboard was standing on is detached by
    // the answer to its own press. The scenes' cells are handed back by name and this row's have
    // to be too, or a reader on a keyboard is put back at the top of the panel every time
    ok('and the keyboard is handed back to the cell that was pressed, not to the top of the panel',
      doc.activeElement === poolCell(poolBuy),
      doc.activeElement && (doc.activeElement.getAttribute('aria-label') || doc.activeElement.localName));
    poolCell(poolBuy).click(); advance(40);
    ok('and a second press puts it back', poolCell(poolBuy).classList.contains('on'),
      poolCell(poolBuy).getAttribute('aria-label'));
    // SWITCHING IS NOT SELLING BACK. Taking it out of play must not look like a refund, or the
    // one-direction promise this shop makes is a lie (shop.js, there is no refund)
    ok('and switching it off and on neither charged nor refunded anything',
      stored().spent === spentBefore && h.ledgerBalance() === bal0 - spentAll
      && stored().owned[shop.slotOf(poolBuy)] === 1, JSON.stringify(stored()));

    // ...and a bought drawing can be taken back out of its scene, by name, which is what keeps an
    // explicit choice of the free drawing from being overruled by the purchase. Which scene that
    // is comes off the aim the run started with rather than a name written here
    cell(aimFree).click(); advance(20);
    ok('the bought drawing can be taken back out of its scene',
      cell(aimFree).classList.contains('on') && !cell(aimKey).classList.contains('on')
      && h.gs.data.mascotSlotsV1[aimSlot] === aimFree, wornKeys().join(' '));
    ok('and that did not refund anything',
      stored().spent === spentAll && h.ledgerBalance() === bal0 - spentAll, JSON.stringify(stored()));
    cell(aimKey).click(); advance(20);
    ok('and put back in', cell(aimKey).classList.contains('on'), wornKeys().join(' '));
    // the same press again is refused BY THE HOST, and the shelf does not move
    const ownedSig = Object.keys(stored().owned).sort().join();
    h.hostSend({ type: 'shop', op: 'buy', key: aimKey, n: 9001 }); advance(20);
    ok('the host refuses a second purchase of the same thing, and nothing is charged',
      stored().spent === spentAll && h.ledgerBalance() === bal0 - spentAll, JSON.stringify(stored()));
    // ...including, now, one of the last row's: it is sold like the rest, so it is refused like
    // the rest rather than through a rule of its own
    h.hostSend({ type: 'shop', op: 'buy', key: poolBuy, n: 9002 }); advance(20);
    ok('and a second purchase of the last row’s drawing is refused the same way',
      stored().spent === spentAll && Object.keys(stored().owned).sort().join() === ownedSig,
      JSON.stringify(stored()));
    for (const key of ['soon', 'witch', shop.slotOf(aimKey), '', shop.SLOTS[0].free]) {
      h.hostSend({ type: 'shop', op: 'buy', key, n: 9100 }); advance(20);
      ok('a message buying "' + key + '" buys nothing and costs nothing',
        stored().spent === spentAll && Object.keys(stored().owned).sort().join() === ownedSig
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
