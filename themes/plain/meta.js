// THE PANEL AS IT HAS ALWAYS LOOKED, and the only theme that is free.
//
// It is a row on the shelf rather than the absence of one, for the reason the mascot shelf keeps
// the free drawings on it (shop.js, ITEMS): a shelf showing only what is on sale cannot tell "has
// not bought a theme" from "prefers the panel the way it came". The reader CHOOSES this, and
// choosing it is one press.
//
// IT DECLARES NOTHING AND THAT IS THE WHOLE OF IT. No layers, so the register counts zero pictures
// and the price comes out zero; no accent, so no token is overridden and the ember stays; no CSS,
// so not one rule reaches the page. A reader who has bought nothing is on this theme and the panel
// renders byte for byte what it rendered before any of this existed. test/themes.test.js pins that,
// because it is the one property of this file that a future edit could quietly take away.
'use strict';

// THE ID IS NOT `default`, AND THAT IS NOT A PREFERENCE. test/themes.test.js asserts that no
// shared file contains any theme's id as a quoted string, which is what makes a theme a directory
// (themes/README.md). `default` is a CSS keyword and an English word and it is quoted in
// webview.js for a cursor, so an id of `default` would make that check either fail on a false
// positive or have to be weakened, and a weakened check is the one that lets a real name through.
// What the reader sees is `name` and they see Default.
module.exports = {
  id: 'plain',
  name: 'Default',
  // first on the shelf: it is where every reader starts, and a shelf is read from the beginning
  order: 10,
  layers: []
};
