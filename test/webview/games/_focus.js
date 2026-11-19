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
// Each screen is therefore asked three things, and the third is what keeps the first two honest:
//
//   1. opened from inside the webview, the screen still takes the keyboard (the feature works)
//   2. a repaint nobody asked for, while the editor holds the focus, moves NOTHING
//   3. the same repaint, once the webview holds the focus again, DOES hand the keyboard back
//
// Without 3 a panel that simply stopped calling focus() would pass 2, and so would a repaint that
// never reached <key>FocusAfter() at all.
//
// The repaint nobody asked for is a real reply from the real host, fetched by sending `open` with a
// request number no panel is waiting on: that is what a late reply, another window's broadcast and
// the market's own beat all look like on the wire, and it is the path the five receive() bodies
// treat as "draw it as it stands".
'use strict';

module.exports = {
  id: 'focus',
  modes: ['focus', 'focus-boot-list', 'focus-boot-game'],
  // Five tables on one purse. Nothing here is refused for money: what is being measured is the
  // keyboard, and a refused deal would be a different reply with a different rule
  start: { focus: 20000 },
  // The two boot modes open on a stored tab with the editor's focus somewhere else, which is the
  // startup half of the same defect: `wantFocus` is set by entering a game, and entering happens on
  // a restored tab as well as on a press
  state: {
    // the LIST, which is behind the Games door of the crossroads (docs/shop-spec.md, section 4-4)
    'focus-boot-list': { tab: 'games', door: 'games' },
    'focus-boot-game': { tab: 'games', game: 'blackjack' }
  },
  focused: { 'focus-boot-list': false, 'focus-boot-game': false },

  run: function (h, MODE) {
    const { ok, advance, doc, $, openGame, activeName, errors } = h;
    const active = () => doc.activeElement;
    // Every focus() that actually moved the focus, since the page loaded. Counting the moves is what
    // says "nothing was taken" even when the thing taken would have been what already had it
    const moves = () => (doc.focusLog || []).length;
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
      h.hasFocus = true;
      h.hostSend({ type: 'bj', op: 'open', n: 90001 }); advance(3000);
      ok('and the table takes it once the webview holds the focus', active() === $('bjDeal'), activeName());
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
      repaint();
      ok(g.id + ': and the same repaint hands the keyboard back once the webview holds it',
        inside(), activeName());
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
