// The keyboard: a panel may hand the focus back to itself, and it may never TAKE it from the editor.
//
// ONE PAGE FOR ALL FIVE SCREENS, because the rule is the floor's and not any one game's: it lives in
// webview.js's refocusIn, which every panel's own <key>FocusAfter() calls. A sixth game is a row in
// GAMES below and nothing else.
//
// What it is protecting, and why it is worth a page: every screen wants the keyboard back after a
// repaint that moved the control it was sitting on, and the decision used to be made from
// `document.activeElement`. Body, hidden, disabled or outside the panel was read as "my focus was
// lost, hand it back". That reading cannot tell two situations apart, because `document.body` is the
// answer in both:
//
//   1. the focus WAS in the panel and the panel's own repaint dropped it  -> handing it back is right
//   2. the focus is in the editor and this document does not hold it      -> taking it is theft
//
// The second one shipped and was reported as not being able to type: the market repaints once a
// second on its own beat, so every tick pulled the keyboard out of Claude Code's chat input while
// the user was mid-sentence. `document.hasFocus()` is what separates the two.
//
// Each screen is therefore asked four things, and the third is what keeps the first two honest:
//
//   1. opened from inside the webview, the screen still takes the keyboard (the feature works)
//   2. a repaint nobody asked for, while the editor holds the focus, moves NOTHING
//   3. the same repaint, once the webview holds the focus again, DOES hand the keyboard back
//   4. and that hand-back does not SCROLL the sidebar to what it focused
//
// Without 3 a panel that simply stopped calling focus() would pass 2, and so would a repaint that
// never reached <key>FocusAfter() at all.
//
// 4 is the half of the same report that is about the mouse rather than the keyboard: a bare
// `focus()` rolls the page until the element is in view, so the market handing the keyboard back
// once a second kept walking the sidebar out from under the pointer. `preventScroll` is the ask,
// and doc.focusLog records it.
//
// `focus-untouched` is the other half of 2, which `document.hasFocus()` does not cover: a coin
// screen open and beating in a panel the focus has NEVER BEEN IN, with this document holding the
// focus (anything in the sidebar pressed once is enough). `activeElement` is body there exactly as
// it is after a repaint drops the focus, so a panel that reads only the body fallback steals the
// keyboard every beat from a reader who never touched it. It is a mode of its own and not a block
// in `focus` below, because "never been in" is a property of the whole page's history: the five
// screens above each take the focus legitimately first, and nothing can un-visit them.
//
// The repaint nobody asked for is a real reply from the real host, fetched by sending `open` with a
// request number no panel is waiting on: that is what a late reply, another window's broadcast and
// the market's own beat all look like on the wire, and it is the path the five receive() bodies
// treat as "draw it as it stands".
'use strict';

module.exports = {
  id: 'focus',
  modes: ['focus', 'focus-boot-list', 'focus-boot-game', 'focus-untouched'],
  // Five tables on one purse. Nothing here is refused for money: what is being measured is the
  // keyboard, and a refused deal would be a different reply with a different rule.
  // `focus-untouched` is on the same purse so that its coin screen has a live Buy button to steal
  // the keyboard WITH: a screen whose every control is disabled would pass that mode by accident
  start: { focus: 20000, 'focus-untouched': 20000 },
  // The two boot modes open on a stored tab with the editor's focus somewhere else, which is the
  // startup half of the same defect: `wantFocus` is set by entering a game, and entering happens on
  // a restored tab as well as on a press
  state: {
    // the LIST, which is behind the Games door of the crossroads (docs/shop-spec.md, section 4-4)
    'focus-boot-list': { tab: 'games', door: 'games' },
    'focus-boot-game': { tab: 'games', game: 'blackjack' }
  },
  // and `focus-untouched` loads the same way, so that opening the market cannot focus anything on
  // the way in: every refocusIn on that path is refused while the editor holds the focus
  focused: { 'focus-boot-list': false, 'focus-boot-game': false, 'focus-untouched': false },

  run: function (h, MODE) {
    const { ok, advance, doc, $, openGame, activeName, errors } = h;
    const active = () => doc.activeElement;
    // Every focus() that actually moved the focus, since the page loaded. Counting the moves is what
    // says "nothing was taken" even when the thing taken would have been what already had it
    const moves = () => (doc.focusLog || []).length;
    // the asks made since `from`, which is how a hand-back is read rather than guessed at: an
    // assertion about the last entry would pass on the ask that OPENED the screen
    const asksSince = (from) => (doc.focusLog || []).slice(from);
    const atBody = () => active() === doc.body;

    // --- the two boot modes: a window opening on a stored tab, focus elsewhere in the editor ------
    if (MODE === 'focus-boot-list') {
      ok('the stored games list is drawn', !!h.rowFor('blackjack') && h.inGames(), h.bodyTabs());
      ok('a window opening on the list takes no keyboard from the editor', moves() === 0 && atBody(),
        moves() + ' focus move(s), on ' + activeName());
      // and the list still takes it when the webview is the thing being used
      h.hasFocus = true;
      $('tabUsage').click(); advance(5);
      h.openList();   // the coin opens the crossroads, and the list is through the Games door
      ok('and the list still takes the focus when the webview holds it',
        active() === h.rowFor('blackjack'), activeName());
      ok('no handler threw', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
      return;
    }
    if (MODE === 'focus-boot-game') {
      advance(3000);   // the stored game's enter() asked the host; let its reply and pacing land
      ok('the stored game is open', h.atTable() && !!$('bjDeal'), h.bodyTabs());
      // enter() sets wantFocus, and this is the one case where that ask must be refused: the window
      // opened on a tab the user did not press, and the keyboard is in the editor
      ok('a window opening on a game takes no keyboard from the editor', moves() === 0 && atBody(),
        moves() + ' focus move(s), on ' + activeName());
      // The reader presses something in the sidebar: this document holds the focus again, and the
      // refused ask stays refused. It is not kept for later on purpose (games/market/panel.js says
      // the same thing in mkFocusAfter): honoured on the next quiet repaint it would be the theft
      // above with a delay on it, and this window still opened on a tab nobody pressed
      h.hasFocus = true;
      h.hostSend({ type: 'bj', op: 'open', n: 90001 }); advance(3000);
      ok('and a repaint takes nothing either: the focus has never been in this panel',
        moves() === 0 && atBody(), moves() + ' focus move(s), on ' + activeName());
      // ...and the table is not mute. It waits to be TOUCHED, and from then on the same repaint
      // hands the keyboard back, which is what says the two assertions above are refusals rather
      // than a table that has stopped calling focus() altogether
      const d = $('bjDeal');
      d.focus(); d.blur();                 // the focus in it, then dropped as a repaint drops it
      const before = moves();
      h.hostSend({ type: 'bj', op: 'open', n: 90002 }); advance(3000);
      ok('and the table takes it back once the focus has been in there',
        active() === $('bjDeal') && moves() > before, activeName());
      ok('no handler threw', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
      return;
    }

    // --- a panel the focus has NEVER BEEN IN ------------------------------------------------------
    //
    // The page loaded with the editor holding the focus, so nothing on the way in could take it:
    // opening a coin sets `wantFocus` and the ask is refused on the spot and not kept. What is left
    // is the state the report describes. The coin screen is open, its beat is running, and
    // `activeElement` is body, which is the same reading a repaint that DROPPED the focus leaves.
    if (MODE === 'focus-untouched') {
      openGame('market');
      const row = doc.querySelector('#mkList .mk-row');
      ok('the market list is drawn', !!row, h.bodyTabs());
      row.click(); advance(50);
      ok('a coin is open', !!$('mkCoin') && !$('mkCoin').hidden, h.bodyTabs());
      ok('opening it took no keyboard from the editor', moves() === 0 && atBody(),
        moves() + ' focus move(s), on ' + activeName());

      // one press anywhere in the sidebar, on nothing in particular: this document holds the focus
      // again and `document.hasFocus()` stops refusing anything, while this panel has still never
      // held it. From here the old rule took the keyboard on every beat
      h.hasFocus = true;
      const asks = h.sent('mk').filter((m) => m.op === 'open').length;
      advance(2500);
      const beats = h.sent('mk').filter((m) => m.op === 'open').length - asks;
      ok('the coin screen is still beating', beats >= 2, beats + ' ask(s) in 2.5s');
      ok('and a panel the focus was never in takes nothing from the reader',
        moves() === 0 && atBody(), moves() + ' focus move(s), on ' + activeName());

      // ...and it is not simply mute. Once the focus HAS been in this panel, the very same beat
      // hands it back: without this a market that had stopped calling focus() altogether would pass
      // everything above
      const back = $('mkBack');
      back.focus(); back.blur();          // in it, then dropped as a repaint drops it
      const before = moves();
      advance(1200);
      ok('and the same beat hands it back once the focus has been in there',
        moves() > before && !atBody() && $('panelMarket').contains(active()), activeName());
      ok('no handler threw', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
      return;
    }

    // --- the five screens -------------------------------------------------------------------------
    //
    // `root` is the panel the focus is allowed to be in, `open` leaves the screen in the state a
    // player would have left it in, and `n` is a request number nobody is waiting on
    let req = 90000;
    const GAMES = [
      { id: 'blackjack', key: 'bj', root: 'panelTable', open: () => { openGame('blackjack'); } },
      { id: 'hilo', key: 'hl', root: 'panelHiLo', open: () => { openGame('hilo'); } },
      { id: 'slots', key: 'sl', root: 'panel-slots', open: () => { openGame('slots'); } },
      { id: 'wheel', key: 'wh', root: 'panel-wheel', open: () => { openGame('wheel'); } },
      {
        // the market's focus rule only runs with a coin open (the list has its own row focus), and
        // the coin screen is also where the reported repaint happens
        id: 'market', key: 'mk', root: 'panelMarket',
        open: () => { openGame('market'); doc.querySelector('#mkList .mk-row').click(); advance(50); }
      }
    ];

    for (const g of GAMES) {
      const root = () => $(g.root);
      const inside = () => { const a = active(); return !!a && a !== doc.body && root().contains(a); };
      const repaint = () => { h.hostSend({ type: g.key, op: 'open', n: ++req }); advance(3000); };

      h.hasFocus = true;
      g.open();
      ok(g.id + ': opened from the webview, the screen takes the keyboard', inside(), activeName());

      // the user goes back to the chat input: this document stops holding the focus, and the
      // element inside it that had it is no longer the active one
      h.hasFocus = false;
      const before = moves();
      repaint();
      ok(g.id + ': a repaint while the editor holds the focus moves nothing',
        moves() === before && atBody(), (moves() - before) + ' focus move(s), on ' + activeName());

      h.hasFocus = true;
      const handBack = moves();
      repaint();
      ok(g.id + ': and the same repaint hands the keyboard back once the webview holds it',
        inside(), activeName());
      // the same hand-back, read as an ASK: a bare focus() would scroll the sidebar to the control,
      // and nothing is keeping that page where the reader put it except this flag
      const back = asksSince(handBack);
      ok(g.id + ': and hands it back without scrolling the sidebar to it',
        back.length > 0 && back.every((f) => f.preventScroll === true), JSON.stringify(back));
    }

    // --- the reported case, end to end ------------------------------------------------------------
    //
    // Not a repaint posted by this file: the market's OWN beat, which asks the host once a second
    // for as long as the coin screen is open (games/market/panel.js, MK_T.tick). This is what the
    // user was hitting, a character at a time, and the count of asks is what says the beat really
    // ran rather than the screen having gone quiet
    h.hasFocus = true;
    openGame('market');
    doc.querySelector('#mkList .mk-row').click(); advance(50);
    h.hasFocus = false;
    const was = moves(), asks = h.sent('mk').filter((m) => m.op === 'open').length;
    advance(2500);
    const beats = h.sent('mk').filter((m) => m.op === 'open').length - asks;
    ok('market: its own beat ran while the editor held the focus', beats >= 2, beats + ' ask(s) in 2.5s');
    ok('market: and those beats took nothing from the editor', moves() === was && atBody(),
      (moves() - was) + ' focus move(s), on ' + activeName());

    ok('no handler threw', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
  }
};
