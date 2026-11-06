// The casino's shared chrome: what every game's screen is built out of, so a new game draws the
// same table furniture without copying it. Per-game CSS lives in games/<id>/meta.js and is
// appended after this (see games/registry.js), so a game may override anything here.
//
// What belongs here: the pieces at least two games use. What does not: a game's own felt props.
// Moved out of styles.js unchanged, only regrouped.
const CSS = `
  /* --- the casino: chrome every game shares (chips, notices, controls, chips of credit) --- */
  .bj-chip{font-size:10.5px;font-weight:700;color:var(--text);padding:1px 6px;border-radius:6px;background:var(--track);white-space:nowrap;animation:bjPop .16s ease-out both;}
  .bj-chip.win{background:rgba(79,174,116,.22);}
  .bj-chip.bj{background:rgba(232,178,58,.28);}
  .bj-chip.lose{background:rgba(229,72,77,.16);}
  .bj-chip.still{animation:none;} /* a redraw of a result already shown */
  @keyframes bjPop{from{opacity:0;transform:scale(.85);}to{opacity:1;transform:none;}}
  .bj-note{margin-top:10px;font-size:11px;color:var(--muted);}
  .bj-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;} /* read out, not shown */
  /* the dealer: crab.png (the header crab), a still drawing standing on a shadow rather than glued
     to the felt. max-width:none is required: the webview stylesheet caps every img at 100% */
  .bj-crab{position:absolute;left:0;bottom:0;width:64px;height:52px;overflow:visible;pointer-events:none;}
  .bj-crab img{position:absolute;z-index:1;left:6px;bottom:6px;width:52px;height:auto;max-width:none;image-rendering:pixelated;display:block;}
  .bj-crab::after{content:'';position:absolute;left:12px;right:12px;bottom:4px;height:5px;
    background:radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,.38), rgba(0,0,0,0));}
  .bj-ctl{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px;}
  .bj-ctl[hidden],.bj-net[hidden],.bj-note[hidden],.bj-btn[hidden]{display:none;}
  .bj-stakes{display:flex;gap:2px;padding:2px;flex:none;background:var(--inner);border:1px solid var(--iborder);border-radius:9px;}
  .bj-stakes button{height:28px;padding:0 9px;border:0;border-radius:7px;background:transparent;font-family:inherit;font-size:12px;font-weight:700;color:var(--muted);cursor:pointer;font-variant-numeric:tabular-nums;}
  .bj-stakes button.on{background:var(--card);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.18);}
  .bj-stakes button:hover:not(.on):not(:disabled){color:var(--text);}
  .bj-stakes button:disabled{opacity:.35;cursor:not-allowed;}
  .bj-btn{flex:1 1 64px;height:34px;border:0;border-radius:8px;background:var(--track);color:var(--text);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;}
  .bj-btn:hover:not(:disabled){box-shadow:inset 0 0 0 1px var(--muted);}
  .bj-btn.primary{background:#e8895a;color:#1d1d1f;} /* white on this orange is 2.6:1 */
  .bj-btn.primary:hover:not(:disabled){box-shadow:none;filter:brightness(1.07);}
  .bj-btn:disabled{opacity:.4;cursor:default;}
  .bj-stakes button:focus-visible,.bj-btn:focus-visible{outline:2px solid var(--focus);outline-offset:2px;}
  .bj-btn.primary:focus-visible{outline-color:var(--text);}
  @media (prefers-reduced-motion:reduce){.bj-chip{animation:none;}.gm-sec svg{transition:none;}}
  /* --- the paytable, folded. Fourteen screens that each lay a table out are fourteen tables and no
     screens, so every ladder, every ways[] and every pays[] lives behind this one toggle and the
     one-line version lives in the heading's title= (docs/game-panels.md, section 5) --- */
  /* THE THREE PROPERTIES, NOT THE SHORTHAND. font:700 10.5px inherit is dropped whole, because the
     font shorthand takes no CSS-wide keyword in its family slot, and all fourteen screens were
     therefore rendering this at the page default (13.33px, weight 400, Arial) and breaking the six
     sizes section 2 allows. font:inherit on its own is legal and is left alone where it is used */
  .bj-why{margin-top:10px;padding:0;border:0;background:transparent;color:var(--muted);
    font-family:inherit;font-size:10.5px;font-weight:700;
    cursor:pointer;text-decoration:underline;text-underline-offset:2px;}
  .bj-why:hover{color:var(--text);}
  .bj-why:focus-visible{outline:2px solid var(--focus);outline-offset:2px;}
  .bj-pays{margin-top:6px;font-size:10.5px;color:var(--muted);font-variant-numeric:tabular-nums;}
  .bj-pays[hidden],.bj-why[hidden]{display:none;}
  /* --- what sits ON the felt, by family (docs/game-panels.md, section 3). The background changes
     twice in fourteen screens; the family is told by the thing standing on the table instead.
     A machine stands on a slate plate: the commonest sea symbol (kelp) is 3.25:1 on the felt and
     5.39:1 on this, and a common symbol that sinks into the floor is a machine where the jackpot
     symbol no longer looks like the jackpot. A board is DRAWN on the felt, in hairlines --- */
  .gm-plate{padding:8px;border-radius:8px;background:#15181c;
    box-shadow:inset 0 0 0 1px rgba(0,0,0,.6), 0 1px 0 rgba(255,255,255,.06);}
  /* THE PLATE THAT IS THE FELT'S OWN WIDTH. Three of the four machines stand something on it that
     is already as wide as the felt gives (152px at sidebar 250), so the shared 8px of side padding
     would push them over the edge: three 48px reels plus their pay-line gutters, three 48px columns
     plus two 4px gaps, and a 150px dial. Each of the three used to write its own figure here (4px,
     0 and 1px) and the three were never the same number, which is what made this look like three
     decisions. It is one: the SIDES GIVE WAY AND THE CONTENTS CENTRE THEMSELVES, and 4, 0 and 1 are
     then what is left over either side of 144, 152 and 150. Top and bottom are untouched, because
     nothing is tight there. The plinko board is 130px and keeps the plain plate */
  .gm-plate.tight{padding-left:0;padding-right:0;}
  .gm-rule{background:rgba(255,255,255,.1);}
  /* --- the die faces (Sic Bo, Shut the Box, Hazard). One hidden sprite in the page, drawn through
     CUC.die(). The body of a die follows the CELL's own color, so the colour is the game's: cream
     for a die that was rolled, #f6836e for Hazard's warning die (games/dice-faces.js) --- */
  .dc-sprite{display:none;}
  .dc{display:block;}
  /* --- the sea symbols (slots, scratch card). One hidden sprite in the page, 18 <use> --- */
  .sy-sprite{display:none;}
  .sy-cell{display:flex;width:48px;height:48px;border-radius:6px;background:#15181c;}
  .sy{width:100%;height:100%;display:block;}
  /* --- the market's chart well. The one screen with no table on it: it has no round, so there is
     no hand to lay down, and a red candle on green felt is the only candle that reads as an event
     (docs/game-panels.md, section 5-10) --- */
  .mk-well{padding:8px;border-radius:10px;background:var(--inner);
    box-shadow:inset 0 0 0 1px var(--iborder);}
  /* --- games list: the third view. A game screen opens from a row --- */
  .bj-games .ihead{margin-bottom:8px;}
  .gm-it svg{width:16px;height:16px;} /* the pixel coin needs its 2px grid */
  /* Four headings turn one scan of fourteen rows into four scans of four. Same recipe as
     .sheet-sec, and now a BUTTON, because the heading is also what folds the block away.
     The favourites alone do not shorten the list: measured, it is 680px now and 705 with a
     Favourites block of four (docs/game-panels.md, 7-0). Four rows kept and the rest folded is
     about 264, and that is the request the favourites could not answer on their own */
  .gm-grp{margin-top:10px;}
  .gm-grp[hidden]{display:none;}
  /* the first block that SHOWS, which :first-of-type cannot say: the Favourites block is in the
     page from the first paint and stays hidden until something is starred, and every heading is
     the first of its type inside its own block anyway */
  .gm-grp.gm-top{margin-top:2px;}
  .gm-sec{display:flex;align-items:center;gap:4px;width:100%;margin:0 0 3px;padding:0 10px;
    border:0;background:transparent;font-family:inherit;font-size:10px;text-transform:uppercase;
    letter-spacing:.6px;color:var(--muted);font-weight:700;text-align:left;}
  /* Favourites does not fold (folding what I put at the top says nothing), so its heading has no
     chevron. The indent is the chevron's, so the five headings read as one column */
  .gm-favs .gm-sec{padding-left:28px;}
  .gm-fold{cursor:pointer;}
  .gm-fold:hover{color:var(--text);}
  .gm-fold:focus-visible{outline:2px solid var(--focus);outline-offset:-2px;border-radius:6px;}
  /* the same chevron, the same 14px, the same flip as .ws-fold (styles.js): up while the block is
     open, down while it is shut. A second fold mark in one panel would be two vocabularies */
  .gm-sec svg{width:14px;height:14px;flex:none;transition:transform .3s ease;}
  .gm-grp.folded .gm-sec svg{transform:rotate(180deg);}
  .gm-grp.folded .gm-rows{display:none;}
  /* The row is a DIV with two buttons in it: a game cannot be opened and kept by the same button,
     and a button cannot be nested in a button. The hover and the rounding stay on the wrapper so
     the pair still reads as one row */
  .gm-row{display:flex;align-items:center;border-radius:10px;padding-right:6px;}
  .gm-row:hover{background:var(--track);}
  /* gap 6, not 8. At sidebar 250 the row has 172px and the tightest one (Sword Forge with a +7 on
     it) measures 10 + 24 + 6 + 78.8 + 6 + 12.5 + 4 + 20 + 6 = 167.3. At gap 8 it is over
     (docs/game-panels.md, 7-3) */
  .gm-open{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:6px;
    padding:8px 4px 8px 10px;border:0;border-radius:10px 0 0 10px;background:transparent;
    font-family:inherit;text-align:left;cursor:pointer;color:var(--text);}
  .gm-open:focus-visible{outline:2px solid var(--focus);outline-offset:-2px;}
  /* The star. Same 20x20 box as .ws-fold with a 16px glyph in it: the sidebar is a mouse surface,
     so this does not owe the 44px touch target */
  .gm-fav{flex:none;display:flex;width:20px;height:20px;padding:2px;border:0;border-radius:6px;
    background:transparent;color:var(--muted);cursor:pointer;opacity:0;}
  .gm-fav svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;
    stroke-linejoin:round;display:block;}
  /* while it is off it shows on hover and on focus only. opacity rather than visibility, because
     visibility:hidden cannot be reached by the Tab key */
  .gm-row:hover .gm-fav,.gm-row:focus-within .gm-fav{opacity:1;}
  .gm-fav:focus-visible{outline:2px solid var(--focus);outline-offset:-1px;opacity:1;}
  /* while it is on it always shows. The FILL is the state and the colour only helps */
  .gm-row.fav .gm-fav{opacity:1;color:#e8895a;}
  .gm-row.fav .gm-fav svg{fill:currentColor;}
  /* 24px, down from 48. Fourteen rows at the old size ran to 896px and the list was mostly
     scrolling; at 24 a row is 40px and the whole casino is about 640px.
     24 rather than 32 or 36 because the art is drawn on a 24-unit grid (games/tiles.js), so only a
     multiple of 24 keeps every edge on a whole pixel, and the painted four are 96px sources, which
     this divides exactly by four.
     The tile covers the glyph rather than replacing it: an alt="" image that fails to load draws
     nothing and the glyph shows through */
  .gm-ic{position:relative;flex:none;display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;background:var(--track);overflow:hidden;}
  .gm-row:hover .gm-ic{background:var(--card);}
  .gm-ic svg{width:14px;height:14px;color:#e8895a;display:block;}
  .gm-ic img{position:absolute;inset:0;width:24px;height:24px;max-width:none;display:block;image-rendering:pixelated;}
  /* The ten drawn tiles (games/tiles.js) sit in the same square as the four painted ones.
     Two classes deep on purpose: .gm-ic svg above is (0,1,1) and caps every glyph at 14px */
  .gm-ic .gm-tile{position:absolute;inset:0;width:24px;height:24px;display:block;}
  /* brightness only: a border fights the rounded corners baked into the art and a scale blurs the grid */
  .gm-row:hover .gm-ic img,.gm-row:hover .gm-ic .gm-tile{filter:brightness(1.1);}
  /* One line, not two. A 24px picture is shorter than a stacked name and sub-line, so a second line
     would make the two rows that have one 7px taller than the other twelve. Side by side every row
     is the same 40px and the sub-line still reads as the exception it is */
  .gm-txt{flex:1 1 auto;min-width:0;display:flex;align-items:baseline;gap:6px;overflow:hidden;}
  /* the safety net for the width above: a name that does not fit is cut with an ellipsis rather
     than cut through the middle of a letter by the overflow */
  .gm-nm{font-size:12.5px;font-weight:700;color:var(--text);white-space:nowrap;
    flex:0 1 auto;overflow:hidden;text-overflow:ellipsis;}
  .gm-sub{font-size:10.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}
  /* The right-hand figure, and only two rows get one: the market's open profit and the forge's
     sword level. A number on all fourteen rows is a number on none of them, because the point of
     the figure is that it MOVED while the panel was shut.
     These colours are the room's, not the table's (docs/game-panels.md, section 4): the felt's
     #7ee6a4 is 1.53:1 on a white background, so a felt colour may not be carried out here */
  .gm-fig{flex:none;font-size:11px;font-weight:700;color:var(--muted);
    font-variant-numeric:tabular-nums;white-space:nowrap;}
  .gm-fig:empty{display:none;}
  .gm-fig.gm-up{color:#4fae74;}   /* 5.70:1 on --card dark */
  .gm-fig.gm-dn{color:#f6836e;}   /* 6.26:1 on --card dark */
  /* the same two roles (it went up / it went down) brought down for a white card. Not new roles */
  body.vscode-light .gm-fig.gm-up{color:#1f7a49;}  /* 5.33:1 */
  body.vscode-light .gm-fig.gm-dn{color:#b32a2e;}  /* 6.39:1 */
  /* the lit star, brought down for a white card the same way. Measured: ember on light --inner
     (#f6f6f7) is 2.38:1, under the 3:1 a control owes; #c25a34 is 4.05:1 there and 3.44:1 on the
     hover track (#e4e4e7). Not a new colour, it is tiles.js's emberLo (the coin's rim) */
  body.vscode-light .gm-row.fav .gm-fav{color:#c25a34;}
  /* --- a game's heading: back arrow, title, and a corner for the game's own figure --- */
  .ihead.bj-head .it{flex:1 1 auto;}
  .bj-side{flex:none;font-size:10.5px;font-weight:700;color:var(--muted);font-variant-numeric:tabular-nums;}
  .bj-back{flex:none;margin-right:2px;padding:3px;border:0;border-radius:6px;background:transparent;color:var(--muted);cursor:pointer;display:flex;line-height:0;}
  .bj-back:hover{background:var(--track);color:var(--text);}
  .bj-back:focus-visible{outline:2px solid var(--focus);outline-offset:1px;}
  .bj-back svg{width:14px;height:14px;transform:rotate(-90deg);}
  /* --- the felt: the table surface itself. The heading, warnings and the buttons sit outside it,
     in the room the table stands in. Woven look from 1px lines on a 2px period, the same grid the
     pixel cards and coin use. No image --- */
  .bj-felt{padding:12px 10px;border-radius:12px;color:var(--felt-ink);
    background:
      repeating-linear-gradient(0deg, rgba(255,255,255,.03) 0 1px, transparent 1px 2px),
      repeating-linear-gradient(90deg, rgba(0,0,0,.05) 0 1px, transparent 1px 2px),
      radial-gradient(120% 100% at 50% 0%, var(--felt) 0%, var(--felt-lo) 100%);
    box-shadow:inset 0 0 0 1px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.07);}
  /* chips: a green tint cannot be read on green, so the colour moves to the text on a dark plate */
  .bj-felt .bj-chip{background:rgba(0,0,0,.42);color:var(--felt-dim);}
  .bj-felt .bj-chip.win{color:#7ee6a4;}
  .bj-felt .bj-chip.bj{color:#ffd166;}
  .bj-felt .bj-chip.lose{color:#f6836e;}
  /* --- the line under the felt: the pot or the verdict. High-Low, poker and the forge share it.
     ONE LINE, AT MOST TWO PIECES (docs/game-panels.md, section 2), and the wrap is not a third:
     the minefield and the tower put a figure and a chip on it, 160px of them, and the felt is 152px
     at sidebar 250. Those two each wrote this rule into their own CSS; at the narrowest width the
     two pieces have to fold, and at every other width there is nothing to fold --- */
  .hl-line{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-height:22px;margin-top:8px;}
  .hl-pot{display:flex;align-items:center;gap:4px;font-size:16px;font-weight:700;color:var(--felt-ink);font-variant-numeric:tabular-nums;}
  .hl-pot.preview{opacity:.55;}
  .hl-pot .cc-r{opacity:1;}
`;

module.exports = { CSS };
