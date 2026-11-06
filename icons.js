// Inline SVG icon set injected into the webview HTML. Extracted from extension.js unchanged.
module.exports = {
  bars: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="12" width="4" height="8" rx="1.2"/><rect x="10" y="6" width="4" height="14" rx="1.2"/><rect x="17" y="3" width="4" height="17" rx="1.2"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5l3 1.8"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="#e8895a"><path d="M12 21s-8-5-8-11a4 4 0 018-1 4 4 0 018 1c0 6-8 11-8 11z"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.2 22 20H2z" fill="#e5484d" stroke="#e5484d" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 9.5v4.2" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.1" fill="#fff"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
  room: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18.5 20a5.5 5.5 0 0 0-3-4.9"/></svg>',
  coin: '<svg class="cc-coin" viewBox="0 0 8 8" width="16" height="16" shape-rendering="crispEdges" aria-hidden="true"><path fill="#c25a34" fill-rule="evenodd" d="M2 0h4v1h1v1h1v4h-1v1h-1v1h-4v-1h-1v-1h-1v-4h1v-1h1zM2 1v1h-1v4h1v1h4v-1h1v-4h-1v-1z"/><g class="cc-r" data-r="6"><rect x="2" y="1" width="4" height="1" fill="#e8b23a"/></g><g class="cc-r" data-r="5"><rect x="1" y="2" width="6" height="1" fill="#e8b23a"/><rect x="2" y="2" width="1" height="1" fill="#ffd166"/></g><g class="cc-r" data-r="4"><rect x="1" y="3" width="6" height="1" fill="#e8b23a"/><rect x="2" y="3" width="1" height="1" fill="#ffd166"/><rect x="4" y="3" width="1" height="1" fill="#c25a34"/></g><g class="cc-r" data-r="3"><rect x="1" y="4" width="6" height="1" fill="#e8b23a"/><rect x="2" y="4" width="1" height="1" fill="#ffd166"/><rect x="4" y="4" width="1" height="1" fill="#c25a34"/></g><g class="cc-r" data-r="2"><rect x="1" y="5" width="6" height="1" fill="#e8b23a"/></g><g class="cc-r" data-r="1"><rect x="2" y="6" width="4" height="1" fill="#e8b23a"/></g></svg>',
  cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="7" width="11" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h8.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-4"/></svg>',
  updown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9l4-4 4 4"/><path d="M8 15l4 4 4-4"/></svg>',
  spade: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.6 4.8 10c-2.4 2.5-1.6 6.6 1.7 7.8 1.6.6 3.3.2 4.4-.9l-1.2 4.5h4.6l-1.2-4.5c1.1 1.1 2.8 1.5 4.4.9 3.3-1.2 4.1-5.3 1.7-7.8z"/></svg>',
  sword: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5 15 6v8H9V6z"/><path d="M6.5 14h11"/><path d="M12 14v5"/><path d="M9.5 21.5h5"/></svg>',

  // --- the glyphs that only a game panel head uses ---
  //
  // THEY HAVE TO RIDE currentColor. `.ihead .it svg` in styles.js paints the head glyph ember
  // (#e8895a) through `color`, so a baked fill arrives in its own colour instead and the panel ends
  // up with a second accent. That is why heart, warn and coin above cannot sit in a head.
  //
  // THEY ARE READ AT 15 PIXELS, not at the 48 the list tiles get: `.ihead .it svg` is 15x15. The
  // 24-unit box therefore renders at 0.625 px per unit, so a 2-unit stroke is 1.25px and anything
  // under about 2.5 units across disappears. Nothing in here is finer than that, and the detail a
  // tile can afford (the bomb's casing highlight, the wheel's 28 wedges) is simply not drawn.
  //
  // EACH ONE NAMES THE SAME OBJECT AS THAT GAME'S TILE in games/tiles.js, because the player sees
  // the tile in the list and the glyph one click later. The tile's own header records which objects
  // already failed a squint: rising steps read as a bar chart (so the tower is a tower, not a
  // ladder), anything at twelve o'clock merges with the pointer into one arrow (so the wheel's
  // divisions stop at the rim and leave the top clear), and a dashed outline reads as a striped
  // post (so Red Dog's gap is left empty rather than outlined).
  //
  // TWO MORE READS WERE CAUGHT HERE, at 15px, and are the reason these shapes are not the obvious
  // ones. Full-diameter spokes made the wheel an encircled X, which is the cancel mark; the
  // divisions are six rim ticks instead. And a ticket with its foil panel, drawn for Scratch Card,
  // needs a fill so large that the head outweighs every other head in the set, so Scratch Card
  // keeps the plain `doc` page: a printed card is what it is, and nothing else wears `doc` in a head.
  reel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5v14M15 5v14"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/></svg>',
  tower: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2v5.4"/><path fill="currentColor" stroke="none" d="M12.9 3.4l4.8 1.7-4.8 1.7z"/><path d="M8.6 20V8.6h6.8V20"/><path d="M6 20h12"/></svg>',
  bomb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.6" cy="14.6" r="6" fill="currentColor"/><path d="M14.8 9.2l1.7-1.9"/><path d="M16.5 7.3c2.1-.3 3.2-1.6 3.2-3.4"/><circle cx="20.2" cy="2.6" r="1.5" fill="currentColor" stroke="none"/></svg>',
  pins: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="4.2" r="2.9"/><circle cx="12" cy="10.6" r="1.9"/><circle cx="6.8" cy="16" r="1.9"/><circle cx="17.2" cy="16" r="1.9"/><rect x="2.6" y="19.6" width="18.8" height="2.4" rx="1.2"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="2.6" y="2.6" width="5.6" height="5.6" rx="1.1"/><rect x="15.8" y="9.2" width="5.6" height="5.6" rx="1.1"/><rect x="9.2" y="15.8" width="5.6" height="5.6" rx="1.1"/><circle cx="12" cy="5.4" r="1.4"/><circle cx="18.6" cy="5.4" r="1.4"/><circle cx="5.4" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="5.4" cy="18.6" r="1.4"/><circle cx="18.6" cy="18.6" r="1.4"/></svg>',
  // tilted, as the tile's rocket is: stood upright it is a narrow pointed vertical with bars across
  // the bottom, which at 15px is the sword
  rocket: '<svg viewBox="0 0 24 24" fill="currentColor"><g transform="rotate(40 12 11.7)"><path d="M12 3.4c2.2 2.4 3.3 5.1 3.3 8.2v3.8H8.7v-3.8c0-3.1 1.1-5.8 3.3-8.2z"/><path d="M8.7 11.8L5.6 16.2h3.1zM15.3 11.8l3.1 4.4h-3.1z"/><path d="M12 20.6l-2.1-4.6h4.2z"/></g></svg>',
  wheel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="14" r="7.4"/><path d="M15.8 14h3.6M13.9 17.3l1.8 3.1M10.1 17.3l-1.8 3.1M8.2 14H4.6M10.1 10.7L8.3 7.6M13.9 10.7l1.8-3.1"/><circle cx="12" cy="14" r="1.8" fill="currentColor" stroke="none"/><path fill="currentColor" stroke="none" d="M12 7.4L8.6 1.6h6.8z"/></svg>',
  spread: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2" y="6.4" width="7" height="11.2" rx="1.4"/><rect x="15" y="6.4" width="7" height="11.2" rx="1.4"/><circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>'
};
