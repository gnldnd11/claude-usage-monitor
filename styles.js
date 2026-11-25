// Panel webview stylesheet. Pure static CSS (no interpolation) — inlined into the
// webview HTML via <style>${CSS}</style>. Extracted from extension.js unchanged.
module.exports = `
  *{box-sizing:border-box;}
  body{margin:0;padding:0;background:transparent;color:var(--text);font-size:12px;
    font-family:var(--vscode-font-family),-apple-system,"SF Pro",sans-serif;
    --card:#232326;--inner:#191919;--track:#3a3a3d;--text:#ececec;--muted:#8b8b90;
    --border:#303034;--iborder:#2c2c30;--ringtrack:#333;--bubble:#fff;--bubblebd:rgba(0,0,0,.06);
    --felt:#17462f;--felt-lo:#0f3423;--felt-ink:#f2f6f3;--felt-dim:#9fb9a9;
    /* the focus ring, as a token, because the casino writes one in eleven places (six in the shared
       chrome and five in the market's own CSS). Ember measures 6.8:1 on the dark --inner and 2.38:1
       on the light one, so the light theme lowers it (below) instead of each place deciding for
       itself */
    --focus:#e8895a;
    /* the one surface that does not follow the theme: the room note's plate is rgba(0,0,0,.82)
       in light and dark alike, so the lowered light --focus would sit at 3.25:1 on it while the
       ember sits at 5.5:1. A second token rather than a literal, for the same reason as above */
    --focus-plate:#e8895a;}
  body.vscode-light{--card:#ffffff;--inner:#f6f6f7;--track:#e4e4e7;--text:#1d1d1f;--muted:#78787f;
    --border:#e7e7ea;--iborder:#ededf0;--ringtrack:#e2e2e6;--bubble:#ffffff;--bubblebd:rgba(0,0,0,.14);
    /* 4.05:1 on --inner (#f6f6f7) and 3.44:1 on --track, where ember was 2.38:1. Same role, not a
       new colour: it is tiles.js's emberLo, the pixel coin's rim */
    --focus:#c25a34;}
  body.vscode-high-contrast{--card:#000;--inner:#000;--border:#6fc3df;--iborder:#6fc3df;--text:#fff;--track:#555;}
  .wrap{padding:10px;}
  .card{position:relative;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px;}
  .head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:13px;}
  .brand{display:flex;align-items:center;gap:8px;min-width:0;}
  .ttl{min-width:0;flex:1 1 auto;overflow:hidden;}
  .ttl .t2{color:var(--muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  /* A FIXED BOX, 44 x 34, and the drawing is fitted into it bottom-first, the same rule the big
     mascot follows (.mascot-wrap below), so the two crabs stand on their floors the same way.
     It is a box and not a width because the header's height is this element's now that the title
     is gone: crab.png is 261x195 (ratio 1.3385) and a width of 44 with height:auto comes out
     32.86 tall, so a redrawn crab that is a little squarer would make the whole panel taller and
     take the speech bubble with it (.bubble is placed against this box). 34 is the button height
     docs/game-panels.md section 2 already uses, and it is above 32.86, so today's drawing is not
     cropped by it. */
  .mascot{position:relative;flex:none;height:34px;display:flex;align-items:flex-end;}
  .mascot img{width:44px;height:100%;object-fit:contain;object-position:bottom;image-rendering:pixelated;display:block;}
  .bubble{position:absolute;top:-10px;right:-13px;background:var(--bubble);border:1px solid var(--bubblebd);
    border-radius:8px;padding:3px 4px;line-height:0;box-shadow:0 2px 5px rgba(0,0,0,.2);}
  .bubble svg{width:12px;height:12px;display:block;}
  .warnbar{display:flex;align-items:flex-start;gap:8px;padding:9px 11px;margin-bottom:11px;border-radius:9px;background:rgba(229,72,77,.13);border:1px solid rgba(229,72,77,.55);color:var(--text);font-size:11px;line-height:1.35;}
  .warnbar[hidden]{display:none;}
  .warnbar svg{width:15px;height:15px;flex:none;}
  .warnbar .wbmsg{flex:1 1 auto;min-width:0;overflow-wrap:anywhere;}
  .warnbar .wbq{display:block;margin-top:4px;color:var(--muted);font-style:italic;font-size:11px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .warnbar .wbx{flex:none;background:transparent;border:0;color:var(--muted);cursor:pointer;font-size:16px;line-height:1;padding:1px 5px;border-radius:5px;align-self:flex-start;}
  .warnbar .wbx:hover{background:rgba(255,255,255,.12);color:var(--text);}
  /* FIXED HEIGHT, and the drawing is bottom-aligned inside it (see .sparkle below).
     74px is the WORKING state's own height at 88px wide (320x268). The four APNGs have four
     different ratios, so at height:auto they rendered 49.5, 73.7, 104.5 and 49.5 and every state
     change shoved the stat tiles below. 74 is the designer's number and it is a choice, not the
     maximum: idle and stunned (160x90) are drawn 88x49.5 inside it with the slack above, working
     fills it, and DESPAIR (480x570) is the one state the box makes smaller, fitted to 62.3x74 from
     the 104.5 it used to take. It is still the tallest-looking of the four. What is pinned is the
     floor all four stand on. */
  .mascot-wrap{position:relative;display:inline-flex;align-items:flex-end;height:74px;margin-top:2px;}
  /* The bubble has a tail and the tail points down at the crab's head, so it is placed against the
     DRAWING and not against the box. The box is a fixed 74px and the drawing is fitted into it
     bottom-first, so where its top edge sits depends on the picture: working (424x286) and despair
     (423x298) are wider than they are tall and come out 59.4px and 62.0px tall, while idle and
     stunned (160x90) come out 49.5px tall and start 24.5px down. With one offset for all four the
     warning hung 24.5px above an idle
     crab with its tail on nothing. test/panel-css.test.js recomputes both numbers from the four
     PNGs' own headers, so a new drawing with a new ratio fails there rather than on screen. */
  .mwarn{position:absolute;top:-15px;left:50%;transform:translateX(-50%);background:#fff;border-radius:10px;padding:3px 5px 4px;box-shadow:0 3px 9px rgba(0,0,0,.25);cursor:pointer;z-index:6;}
  /* EIGHT DRAWINGS, EIGHT OFFSETS, and every one of them is read out of the file rather than chosen.
     The bubble has a tail pointing down at the crab's head, so it is placed against the top of the
     INK: contain fits each canvas into the 88x74 box and sits it on the bottom edge, and then the
     drawing starts wherever its own transparent padding ends. Those are two different things and
     treating them as one is a bug this file has had twice. The first time, one offset for four
     drawings left the bubble 24.5px above an idle crab with its tail on nothing. The second time,
     the offsets were computed from the CANVAS, which is why padding two of the canvases out to
     shrink the crab inside them (2026-11-19) moved the drawings down and left the bubbles where
     they were, pointing at empty space: coding's ink starts 40.63px down an unchanged 88x55.67
     canvas.
     -15 is the bubble's own lift, so each rule is (where the ink starts) - 15. The base value is
     what the box uses before any state has been drawn.
     test/panel-css.test.js recomputes all eight by DECODING THE FRAMES (test/apng.js) and fails if
     a rule and a drawing disagree by a pixel, so the next redraw breaks a test and not a screen.
     Four of the eight were cropped to their own ink before they came in (tools/fit-mascot.mjs):
     sleep and blackhole, and working and despair when they were redrawn (2026-11-24). That is why
     sleep's offset is the base value: with no transparent border left, the drawing starts where the
     canvas does, and the other three differ from the base only by how much shorter than the box
     their canvas comes out. Written out anyway rather than left to the fallback, so the list is
     eight long and a reader does not have to work out which one is missing and why. */
  .mascot-wrap[data-state="idle"] .mwarn{top:20.5px;}
  .mascot-wrap[data-state="working"] .mwarn{top:-0.4px;}
  .mascot-wrap[data-state="despair"] .mwarn{top:-3px;}
  .mascot-wrap[data-state="stunned"] .mwarn{top:12.8px;}
  .mascot-wrap[data-state="coding"] .mwarn{top:25.6px;}
  .mascot-wrap[data-state="float"] .mwarn{top:7.2px;}
  .mascot-wrap[data-state="sleep"] .mwarn{top:-15px;}
  .mascot-wrap[data-state="blackhole"] .mwarn{top:-8.4px;}
  .mwarn.calm{animation:none;cursor:default;}
  .mwarn.mid{animation:pulse 1.9s ease-in-out infinite;}
  .mwarn.high{animation:pulse 1.2s ease-in-out infinite;}
  .warnbar.mid{border-color:rgba(245,166,35,.6);}
  .mwarn[hidden]{display:none;}
  .mwarn svg{width:17px;height:17px;display:block;}
  .mwarn::after{content:'';position:absolute;bottom:-6px;left:50%;margin-left:-6px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid #fff;}
  .inner{position:relative;background:var(--inner);border:1px solid var(--iborder);border-radius:13px;padding:13px;}
  .ihead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;padding-right:5px;}
  /* The Usage tab's own header row, which is EMPTY unless there is something to say about how old
     the usage endpoint's answer is. Not there at all by default: an empty flex row would still
     hold its 12px of margin and leave a gap nothing explains.
     The pulsing dot belongs to ONE of the two states it does appear in. It means "live", which is
     true while the first call is still out and the opposite of true when the row is there to say
     the reading has gone old. */
  #uhead{display:none;}
  #uhead.loading,#uhead.stale{display:flex;}
  #uhead .d{display:none;}
  #uhead.loading .d{display:block;}
  .ihead .it{display:flex;align-items:center;gap:7px;font-weight:600;font-size:12.5px;color:var(--text);white-space:nowrap;min-width:0;overflow:hidden;flex:0 1 auto;}
  .ihead .it svg{width:15px;height:15px;color:#e8895a;}
  .upd{color:var(--muted);font-size:10.5px;display:flex;align-items:center;gap:5px;white-space:nowrap;flex:none;}
  .upd .d{width:6px;height:6px;border-radius:50%;background:#e8895a;box-shadow:0 0 3px #e8895a;flex:none;}
  .body{display:flex;gap:14px;align-items:center;flex-wrap:nowrap;}
  .meters{flex:1 1 auto;min-width:0;}
  .meter{margin-bottom:10px;}
  .meter:last-child{margin-bottom:0;}
  .mtop{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;}
  .mlabel{color:var(--muted);font-size:11px;}
  .mval{font-weight:700;font-size:12px;color:var(--text);}
  .mbar{position:relative;height:7px;border-radius:4px;background:var(--track);overflow:hidden;}
  .mfill{position:absolute;left:0;top:0;height:100%;border-radius:4px;
    background:linear-gradient(90deg,#e8895a,#f0a882);transition:width .5s ease;width:0;}
  .msub{color:var(--muted);font-size:10.5px;margin-top:3px;text-align:right;opacity:.85;}
  .ringbox{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;}
  .ringside{display:flex;flex-direction:column;align-items:center;}
  .ringwrap{position:relative;width:88px;height:88px;}
  .ringwrap svg{transform:rotate(-90deg);}
  .rtrack{stroke:var(--ringtrack);}
  .rcenter{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}
  .rpct{font-size:22px;font-weight:800;color:#e8895a;line-height:1;}
  .rpct span:last-child{font-size:12px;}
  .rtext{font-size:10.5px;color:var(--muted);margin-top:2px;}
  /* the session window's time left. It was the one thing the removed Session bar still owned */
  .rleft{font-size:10.5px;color:var(--muted);margin-top:4px;white-space:nowrap;}
  /* the mascot FILLS its fixed box and is fitted inside it, so the four states are one height and
     one floor. object-fit:contain keeps every pixel of the drawing (no crop) and
     object-position:bottom puts the crab's feet on the box's bottom edge. */
  .sparkle{width:88px;height:100%;object-fit:contain;object-position:bottom;image-rendering:pixelated;display:block;}
  /* THE DARK THEMES GIVE THE NEARLY-BLACK INK AN EDGE, because on a dark floor it is the floor.
     Measured off the files: mascot-coding's keystrokes are rgb(15..25) at alpha 255 and sit at
     1.21:1 on this card, 1.08:1 on --inner and 1.18:1 on the high-contrast black, against 18.6:1
     on the light card, where the same ink reads. The crab is bright and measures 11-17:1 either
     way, so what is needed is an edge on the DARK ink and nothing else. The filter is html.js's
     #cucInkEdge, and it is put here and not on the drawings because THE DRAWINGS ARE NOT OURS
     TO EDIT.
     ONE CLASS AND NO DRAWING NAMES. This file does not get to decide WHICH pictures are lifted,
     because that is a measurement and not a style: html.js states it once (INK_LIFT) beside the
     six it is about, and whatever draws one of them puts .ink-lift on the element. The first
     version of this rule named .sparkle, .sh-pic and #shArt instead, which lifted all six, and the
     ones that did not need it came back as stickers: the edge grows wherever near-black ink meets
     transparency, and five of the six are drawn with a black outline, so a drawing already reading
     at 5:1 gained a grey rim around the whole crab. It was worst in the shop's 36px cells.
     The three places a lifted drawing can appear are three different floors, and the edge clears
     3:1 on all of them: the Usage card (--card, 4.62:1), the shop's cells (--inner, 5.19:1), the
     shop's preview plate (--track, 3.34:1), and the high-contrast black (6.19:1).
     The theme half of the selector is "not light" rather than a list of dark themes, which is how
     the rest of this file splits the two (body.vscode-light above). */
  /* NO NEW COLOUR: --muted, the one this file already uses for everything that is present but not
     the point. The figures above are its contrast on each of those floors; the high-contrast theme
     does not redefine --muted, so it keeps this grey too. */
  #cucInkFlood{flood-color:var(--muted);}
  body:not(.vscode-light) .ink-lift{filter:url(#cucInkEdge);}
  /* NOT display:none, which is what .sy-sprite uses two files over and what this had first.
     A <use> resolves out of a display:none sprite; a <filter> resolves too, but its flood-color
     does not: Chrome computes it as the initial black, so the edge comes out black on a black
     floor and the whole rule silently does nothing. Measured, not guessed. Out of flow at zero
     size costs the same nothing and keeps the colour. */
  .cuc-fx{position:absolute;width:0;height:0;overflow:hidden;}
  /* the state change: one cut, one beat. The whole sprite is pressed 2 whole pixels down and let
     back up over 160ms in exactly two frames (steps(2,jump-none) renders 2px then 0px and nothing
     between), so it reads as a thump rather than a slide. transform ONLY: a crossfade, an opacity
     ramp or a blur on pixel art smears it, which is why they are not in here.
     The standing #cucInkEdge above is not an exception to that: it is not animated, and measured
     against the unfiltered render every pixel it changes is a background pixel, so the art itself
     comes out identical to the byte. */
  @keyframes mascotBeat{from{transform:translateY(2px);}to{transform:translateY(0);}}
  .sparkle.beat{animation:mascotBeat .16s steps(2,jump-none);}
  @media (prefers-reduced-motion:reduce){.sparkle.beat{animation:none;}}
  .stats{display:flex;gap:1px;margin-top:13px;background:var(--iborder);border-radius:11px;overflow:hidden;}
  .stat{flex:1;background:var(--inner);padding:10px 8px;min-width:0;position:relative;}
  .stat .stop{display:flex;align-items:center;gap:6px;margin-bottom:4px;}
  .stat svg{width:14px;height:14px;color:#e8895a;flex:none;}
  .stat .sval{font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .stat .slabel{color:var(--muted);font-size:10.5px;white-space:nowrap;}
  /* narrow panel: hide the stat tiles so values never truncate */
  body.narrow .stats{display:none;}
  .mgrp{display:flex;align-items:baseline;gap:6px;}
  .srow{display:flex;align-items:baseline;gap:5px;}
  .delta,.sdelta{color:#e8895a;font-weight:700;opacity:0;}
  .delta{font-size:11px;}
  .sdelta{font-size:10.5px;position:absolute;top:7px;right:8px;}
  .delta.show,.sdelta.show{animation:flash 1.9s ease forwards;}
  #ringArc{transition:stroke-dashoffset .6s ease, stroke .3s ease;}
  .roll{display:inline-block;animation:roll .45s ease;}
  .upd .d{animation:pulse 2.2s ease-in-out infinite;}
  .notrans *{transition:none !important;}
  .hactions{display:flex;align-items:center;gap:6px;flex:none;}
  .toggle{background:transparent;border:0;color:var(--muted);cursor:pointer;padding:4px;border-radius:6px;display:flex;line-height:0;}
  .toggle:hover{background:var(--track);color:var(--text);}
  .toggle svg{width:16px;height:16px;transition:transform .4s cubic-bezier(.34,1.56,.64,1);}
  .sheet{position:fixed;inset:0;background:rgba(0,0,0,.28);display:flex;align-items:flex-start;justify-content:center;padding:14px;z-index:1000;animation:fade .16s ease;}
  .sheet[hidden]{display:none;}
  .sheet-card{background:var(--inner);border:1px solid var(--iborder);border-radius:12px;width:100%;max-width:280px;padding:13px 15px;box-shadow:0 8px 28px rgba(0,0,0,.32);max-height:100%;overflow-y:auto;box-sizing:border-box;}
  .sheet-head{display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:13px;color:var(--text);margin-bottom:12px;}
  .sheet-x{background:transparent;border:0;color:var(--muted);cursor:pointer;padding:3px;border-radius:6px;display:flex;line-height:0;}
  .sheet-x:hover{background:var(--track);color:var(--text);}
  .sheet-x svg{width:15px;height:15px;transform:rotate(180deg);}
  .sheet-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:var(--text);}
  .sheet-row + .sheet-row{margin-top:11px;}
  .sheet-row label{color:var(--muted);}
  .sheet-row select{background:var(--track);color:var(--text);border:1px solid var(--iborder);border-radius:7px;padding:5px 8px;font-size:12px;cursor:pointer;}
  @keyframes fade{from{opacity:0}to{opacity:1}}
  .sheet-sec{font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin:15px 0 7px;font-weight:700;}
  .sheet-check{display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--text);cursor:pointer;padding:4px 0;}
  .sheet-check input{accent-color:#e8895a;cursor:pointer;width:14px;height:14px;flex:none;}
  /* .sparkle-hd is gone: it was a SECOND crab, a different drawing (sparkle.png), swapped in while
     compact hid the first one. Three crabs in one product is two too many, and a zero-width flex
     item still ate a gap on each side, which is where the 6px that nobody could account for
     between the crab and the chevron came from. Compact no longer hides the crab either. */
  .card,.inner{transition:padding .4s cubic-bezier(.4,0,.2,1),border-width .4s cubic-bezier(.4,0,.2,1);}
  .body{transition:gap .4s cubic-bezier(.4,0,.2,1);}
  .ttl .t2,.ihead,.stats{overflow:hidden;transition:max-height .4s cubic-bezier(.4,0,.2,1),opacity .3s ease,margin .4s cubic-bezier(.4,0,.2,1);}
  /* max-height, not just max-width: the collapsed box kept its full 180px of HEIGHT and only lost
     its width, so 27px of empty, unexplained band sat under the three bars in compact mode (the
     bars are 153 and the row was 180). 220 is above the box's real 180 so the open panel is
     unaffected, and it is a length rather than none because a transition needs two of them. */
  .ringbox{max-width:150px;max-height:220px;overflow:visible;transition:max-width .45s cubic-bezier(.4,0,.2,1),max-height .45s cubic-bezier(.4,0,.2,1),opacity .35s ease;}
  .ttl .t2{max-height:20px;}
  .ihead{max-height:34px;}
  .stats{max-height:90px;}
  /* compact mode is a Usage-tab concept (bars only). The Agents tab and the blackjack table
     have nothing to compress, so the hiding below applies on body.tab-usage only; otherwise
     switching views while compact leaves the section headers missing.
     WHAT COMPACT NO LONGER HIDES: the crab, and the credits. The crab is the product's mark and
     hiding it swapped in a second drawing (see .sparkle-hd above); the credits button is the ONLY
     way into the games, and one press of the chevron used to shut that door (header-fold-spec, 2-4).
     Neither is a reading, so neither is what a reader asked to compress. */
  body.tab-usage.compact .stats{max-height:0;opacity:0;margin-top:0;}
  /* The rule that hid .ihead in compact is gone with the title it was hiding. What is left in that
     row is the notice that the readings have gone old, and a folded panel is drawing those same
     readings, so folding may not be a way to make the notice go away. */
  /* FOLDED, the panel was half frame: 153px of bars inside 165px of card padding, headers, tabs,
     borders and that invisible box. The content is untouched and the frame is what goes:
     a border around a single block makes no hierarchy (design-craft, section 2), and 10px is
     already one of the panel's spacings (docs/game-panels.md, section 2). 440.59 -> 263. */
  .compact .ringbox{max-width:0;max-height:0;opacity:0;overflow:hidden;}
  .compact .body{gap:0;}
  .compact .card{padding:10px;}
  .compact .inner{padding:0;background:transparent;border-width:0;}
  .compact .head{margin-bottom:10px;}
  .compact .meter{margin-bottom:9px;}
  @keyframes flash{0%{opacity:0;transform:translateY(5px);}12%{opacity:1;transform:translateY(0);}70%{opacity:1;}100%{opacity:0;transform:translateY(-3px);}}
  @keyframes roll{0%{opacity:.25;transform:translateY(6px);}100%{opacity:1;transform:translateY(0);}}
  @keyframes pulse{0%,100%{opacity:.4;}50%{opacity:1;}}
  /* THIS ACCOUNT HAS NO FIVE-HOUR WINDOW (webview.js, noSessionWindow writes this class and
     nothing else does). An authenticated Ultra is held by the week alone, so the ring draws the
     week and these two rules are the rest of that state.
     The weekly bar STAYS. It was hidden here for one release on the "a figure is not drawn twice"
     rule (docs/game-panels.md, section 2), and that was the wrong reading of the rule. Fable (7d)
     is still a bar, so hiding its sibling leaves a list of weekly limits with the main one missing,
     and the ring is not where the eye goes looking for it: the owner reported the panel as broken
     twice. A number repeated between a ring and its own bar costs a glance; a limit that is simply
     absent costs trust in every other figure on the page. Section 2 is about two drawings of one
     figure competing to BE the reading, which is the session bar the ring replaced in 1.31.x, not
     about a gauge and the row that names it. */
  /* no .body rule here any more: it top-aligned a two-bar column against the ring, and with the
     weekly bar back the column is three bars again, the same shape state 1 centres. */
  body.wrapcols .body{flex-wrap:wrap;}
  body.wrapcols .ringbox{margin:6px auto 0;}
  @media (max-width:270px){.stat .slabel{display:none;}.stat .sval{font-size:11px;text-overflow:clip;}.stat .sdelta{display:none;}.stat{padding:8px 6px;}.munit{display:none;}}
  /* --- tab switcher + agent roster (tide pool) --- */
  .tabs{display:flex;gap:3px;margin-bottom:11px;background:var(--inner);border:1px solid var(--iborder);border-radius:10px;padding:3px;}
  .tab{position:relative;flex:1;display:inline-flex;align-items:center;justify-content:center;gap:5px;background:transparent;border:0;color:var(--muted);font-size:12px;font-weight:600;padding:6px 8px;border-radius:7px;cursor:pointer;font-family:inherit;transition:color .15s ease,background .15s ease;}
  .tab.active{background:var(--card);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.18);}
  .tab:hover:not(.active){color:var(--text);}
  .inner.agents{padding:11px 11px 14px;}
  .ws-head{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:10px;min-width:0;}
  /* flex:1 0 auto, not 1 1 auto: it still takes the slack at a comfortable width, and it is the
     one thing in this row that may NOT be squeezed. At a 232px sidebar the row is 158px and the
     three children want 173, and with both able to shrink the loser was the section's name
     ("Room" came out 16.3px wide and cut) while the room PICKER kept its full 87.7px. The picker
     is what gives way now: it has an ellipsis of its own and the name it loses is also the picture
     directly below it. */
  .ws-head .it{display:flex;align-items:center;gap:7px;font-weight:600;font-size:12.5px;color:var(--text);min-width:0;overflow:hidden;flex:1 0 auto;}
  .ws-head .it svg{width:15px;height:15px;color:#e8895a;flex:none;}
  .ws-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .ws-map{display:flex;align-items:center;gap:3px;flex:0 1 auto;min-width:0;max-width:60%;color:var(--text);background:var(--inner);border:1px solid var(--iborder);border-radius:8px;padding:3px 5px 3px 8px;font-size:11px;font-weight:600;font-family:inherit;cursor:pointer;line-height:1.2;}
  .ws-map:hover{border-color:var(--track);}
  .ws-map span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .ws-map svg{width:13px;height:13px;flex:none;color:var(--muted);transform:rotate(180deg);}
  .sheet-wide{max-width:340px;}
  .room-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:7px;}
  .room-opt{display:flex;flex-direction:column;gap:4px;padding:0 0 5px;border:1px solid var(--iborder);border-radius:9px;background:var(--card);cursor:pointer;overflow:hidden;font-family:inherit;text-align:center;transition:border-color .15s ease,transform .15s ease;}
  .room-opt:hover{border-color:#e8895a;transform:translateY(-1px);}
  .room-opt.on{border-color:#e8895a;box-shadow:0 0 0 1px #e8895a inset;}
  .room-opt img{width:100%;height:auto;display:block;image-rendering:pixelated;}
  .room-opt span{font-size:9.5px;font-weight:700;color:var(--text);padding:0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .room-opt.on span{color:#e8895a;}
  /* wide interior vignette: the art is cropped inside the room, so the frame fills edge to
     edge — no backdrop showing through (which is what made light mode look broken), and
     less than half the height of the old square. */
  /* isolate + z-index:0 pins every room child (walkers, HUD, pops) inside one stacking
     context, so their z-index can never compete with panel-level overlays. Without it the
     transformed walkers leaked out and painted over the hover card and the modal. */
  .ws-room{position:relative;isolation:isolate;z-index:0;width:100%;aspect-ratio:1.8/1;border-radius:11px;overflow:hidden;background:#0c0c0d;border:1px solid var(--iborder);transition:max-height .34s cubic-bezier(.4,0,.2,1),opacity .28s ease,border-width .34s ease;max-height:380px;}
  .room-collapsed .ws-room{max-height:0;opacity:0;border-width:0;}
  .ws-fold{flex:none;background:transparent;border:0;color:var(--muted);cursor:pointer;padding:3px;border-radius:6px;display:flex;line-height:0;}
  .ws-fold:hover{background:var(--track);color:var(--text);}
  .ws-fold svg{width:14px;height:14px;transition:transform .3s ease;}
  .ws-fold.folded svg{transform:rotate(180deg);}
  /* on the Agents tab both sections fold from their own headers, so the panel-level
     chevron beside the mascot has nothing left to do there */
  body:not(.tab-usage) .toggle{display:none;}
  /* .ihead reserves 5px on the right for text; the Crew header ends in the same fold
     button as Room, so drop it or the two chevrons sit on different columns */
  .ihead.crew-head{padding-right:0;}
  /* space-between with three children stranded "N agents" in the middle — let the
     title eat the slack so the count sits next to the chevron it belongs with.
     1 0 auto, the same as the room header above: it takes the slack and it is not the thing that
     gets squeezed when the row runs out. "Crew" is short enough that nothing is squeezing it today,
     but the rule the two headers follow has to be one rule or only one of them stays fixed. */
  .ihead.crew-head .it{flex:1 0 auto;}
  .ws-run{display:inline-flex;align-items:center;gap:3px;margin-left:2px;font-size:9px;font-weight:800;color:#e5484d;flex:none;}
  .ws-run::before{content:'';width:6px;height:6px;border-radius:50%;background:#e5484d;box-shadow:0 0 4px #e5484d;animation:pulse 1.4s ease-in-out infinite;}
  #panelAgents:not(.room-collapsed) .ws-run{display:none;} /* redundant while the room itself is visible */
  body.vscode-light .ws-room{background:#ececef;}
  .ws-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;}
  .ws-stage{position:absolute;inset:0;overflow:hidden;}
  .ws-hud{position:absolute;top:6px;left:7px;z-index:8;display:flex;align-items:center;gap:5px;font-size:9.5px;font-weight:700;letter-spacing:.2px;color:#fff;background:rgba(0,0,0,.68);padding:2px 8px;border-radius:8px;pointer-events:none;box-shadow:0 1px 5px rgba(0,0,0,.5);white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.6);}
  /* narrow: the room is tiny, so the HUD scales down instead of covering it.
     WHAT GOES, AND WHAT STAYS. The header row is 96px wide at a 170px sidebar and three things
     wanted it, so something had to be dropped: it used to be the SECTION'S NAME (the whole .it
     group was hidden, so the word "Room" vanished and the row read as an unlabelled dropdown).
     The name is what tells a reader which block this is, so what goes instead is the glyph and
     then the picker's own label (below). Same rule on the Crew header, which truncated its own
     title to "Cr..." while keeping "7 agents": the roster right below it is already the count. */
  body.narrow .ws-hud{font-size:8px;padding:1px 6px;gap:4px;top:4px;left:5px;}
  body.narrow .ws-hud-delta{font-size:9.5px;top:19px;left:6px;}
  body.narrow .ws-head .it svg,body.narrow .crew-head .it svg{display:none;}
  body.narrow .ws-head .it,body.narrow .crew-head .it{gap:0;}
  body.narrow .crew-head .upd{display:none;}
  /* and the picker becomes a glyph, the same shape as the fold button beside it. "Room" needs 34px
     of the 96 this row has, the fold takes 20 and the gaps 12, which leaves 30: a picker with 20px
     of room name in it is two letters and an ellipsis. The name it was showing is on its tooltip
     (webview.js, syncMapName) and the room itself is the picture directly below. */
  body.narrow .ws-map span{display:none;}
  body.narrow .ws-map{max-width:none;padding:3px 4px;}
  body.narrow .ws-map svg{margin:0 auto;}
  .ws-hud-sep{opacity:.45;font-weight:400;}
  .ws-hud-delta{position:absolute;top:26px;left:9px;z-index:8;font-size:11px;font-weight:800;color:#e8895a;letter-spacing:.2px;opacity:0;pointer-events:none;text-shadow:0 1px 3px rgba(0,0,0,.7);}
  .ws-hud-delta.show{animation:flash 1.9s ease forwards;}
  /* sits over a photographic background, so it carries its own opaque plate rather than
     relying on a text shadow: at 9.5px a shadow is not contrast. Centred on the floor so it
     reads as the room speaking, not as another HUD badge in the corner. */
  /* wraps rather than nowrap: at 232px (body.narrow, a width this panel supports) a nowrap row
     pushed the button off the plate and out of .ws-room's overflow, so the one way out of the
     state this note describes was the part that got clipped. It only shows over an empty room,
     so the extra line height covers nothing. z-index clears the walkers (73-80), which stand on
     the same centre spot when the scope is widened. */
  .ws-note{position:absolute;left:50%;bottom:7px;transform:translateX(-50%);z-index:90;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;text-align:center;gap:5px 7px;max-width:calc(100% - 14px);font-size:9.5px;font-weight:600;letter-spacing:.1px;color:#e9e4de;background:rgba(0,0,0,.82);padding:4px 9px;border-radius:9px;box-shadow:0 1px 6px rgba(0,0,0,.55);}
  .ws-note button{flex:none;border:0;border-radius:6px;padding:2px 7px;font:inherit;font-weight:700;color:#1a1715;background:#e8895a;cursor:pointer;}
  .ws-note button:hover{background:#f0a078;}
  .ws-note button:focus-visible{outline:2px solid var(--focus-plate);outline-offset:1px;}
  body.narrow .ws-note{font-size:8px;padding:3px 7px;gap:5px;bottom:5px;}
  .walker{position:absolute;transform:translate(-50%,-100%);transition:left 1.6s ease-in-out,top 1.6s ease-in-out,opacity .45s ease;pointer-events:none;}
  .wk-sprite{image-rendering:pixelated;}
  .wk-role,.wk-name{position:absolute;left:50%;transform:translateX(-50%);font-size:8.5px;font-weight:700;white-space:nowrap;letter-spacing:.2px;padding:1px 5px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.5);}
  .wk-role{bottom:100%;margin-bottom:3px;color:#ffcaa8;background:rgba(20,12,8,.82);}
  .wk-name{top:100%;margin-top:3px;color:#fff;background:rgba(20,12,8,.82);}
  .ws-stage.crowded .wk-role,.ws-stage.crowded .wk-name{display:none;}
  /* working: a busy typing bob + a blinking "..." bubble so an agent at the desk
     reads as WORKING, not just standing there */
  .walker.working .wk-sprite{animation:wkBob .46s steps(2) infinite;}
  @keyframes wkBob{0%,100%{transform:translateY(0);}50%{transform:translateY(-1.5px);}}
  .wk-dots{display:none;position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:3px;padding:2px 5px;border-radius:7px;background:rgba(20,12,8,.82);box-shadow:0 1px 3px rgba(0,0,0,.5);white-space:nowrap;line-height:0;}
  .walker.working .wk-dots{display:inline-flex;gap:2.5px;align-items:center;}
  .walker.working .wk-role{display:none;} /* dots take the overhead slot while working */
  .wk-dots i{width:3px;height:3px;border-radius:50%;background:#ffcaa8;display:inline-block;animation:wkDot 1.1s ease-in-out infinite;}
  .wk-dots i:nth-child(2){animation-delay:.18s;}
  .wk-dots i:nth-child(3){animation-delay:.36s;}
  @keyframes wkDot{0%,60%,100%{opacity:.25;transform:translateY(0);}30%{opacity:1;transform:translateY(-1.5px);}}
  .walker.stuck .wk-dots{display:none;} /* a wedged agent isn't typing */
  .walker.stuck .wk-sprite{animation:none;}
  /* display:block because this is a <span> inside the card's button (a <div> is not phrasing
     content and a button's content model is), and cropStyle gives it a width and a height */
  .cr-sprite{display:block;image-rendering:pixelated;cursor:pointer;}
  .pool{display:flex;flex-wrap:wrap;justify-content:center;row-gap:8px;padding:8px 2px 2px;overflow:hidden;max-height:600px;opacity:1;transition:max-height .34s cubic-bezier(.4,0,.2,1),opacity .24s ease;}
  .crew-mini{overflow:hidden;max-height:0;opacity:0;transition:max-height .34s cubic-bezier(.4,0,.2,1),opacity .24s ease;}
  .crew-collapsed .pool{max-height:0;opacity:0;padding-top:0;padding-bottom:0;}
  .crew-collapsed .crew-mini{max-height:420px;opacity:1;}
  /* the wrapper holds the ring, the gear and the two badges; the button inside it is the card a
     reader presses. The padding and the column stack went with the button, so the hover and the
     selected ring still cover the whole tile */
  .cr-card{position:relative;flex:0 0 25%;min-width:0;border-radius:10px;transition:opacity .3s ease,box-shadow .18s ease,background .18s ease;}
  .cr-pick{display:flex;flex-direction:column;align-items:center;width:100%;min-width:0;padding:5px 1px 8px;background:transparent;border:0;border-radius:10px;color:inherit;font-family:inherit;font-size:inherit;cursor:pointer;}
  .cr-pick:focus-visible{outline:2px solid var(--focus);outline-offset:-2px;}
  .cr-card:hover:not(.selected){background:rgba(127,127,127,.09);}
  .cr-card:hover .cr-sprite{filter:brightness(1.1);}
  .cr-card.selected{background:rgba(232,137,90,.13);box-shadow:0 0 0 1.5px #e8895a;}
  .cr-gear{position:absolute;top:2px;left:3px;display:none;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:6px;background:rgba(232,137,90,.92);color:#fff;cursor:pointer;line-height:0;box-shadow:0 1px 4px rgba(0,0,0,.3);z-index:5;}
  .cr-card.selected .cr-gear{display:inline-flex;}
  .cr-gear:hover{background:#e8895a;}
  .cr-gear:focus-visible{outline:2px solid var(--focus);outline-offset:1px;}
  .cr-gear svg{width:12px;height:12px;}
  /* agent settings modal */
  .sheet-row input[type=text]{background:var(--track);color:var(--text);border:1px solid var(--iborder);border-radius:7px;padding:5px 8px;font-size:12px;font-family:inherit;width:130px;}
  .am-appearance{display:block;}
  .am-tabs{display:flex;gap:4px;margin-bottom:10px;}
  .am-tab{flex:1;background:var(--track);border:0;color:var(--muted);font-size:11px;font-weight:600;padding:6px 4px;border-radius:7px;cursor:pointer;font-family:inherit;white-space:nowrap;}
  .am-tab.on{background:#e8895a;color:#fff;}
  .am-tab:hover:not(.on){color:var(--text);}
  .am-row{display:flex;flex-wrap:wrap;gap:6px;}
  .am-npc{width:50px;height:50px;border-radius:9px;border:2px solid transparent;background:var(--track);display:flex;align-items:flex-end;justify-content:center;overflow:hidden;cursor:pointer;}
  .am-npc:hover{border-color:var(--muted);}
  .am-npc.on{border-color:#e8895a;background:rgba(232,137,90,.18);}
  .am-npc .cr-sprite{image-rendering:pixelated;}
  .cr-modelsel.m-opus{background:rgba(232,137,90,.95);}
  .cr-modelsel.m-sonnet{background:rgba(90,154,232,.95);}
  .cr-modelsel.m-haiku{background:rgba(95,184,122,.95);}
  .cr-modelsel.m-other{background:rgba(127,127,127,.8);}
  .cr-badge{position:absolute;top:-3px;left:50%;transform:translateX(-50%) translateY(-4px);min-width:15px;height:15px;padding:0 2px;border-radius:8px;background:#4fae74;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s ease,transform .2s ease;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,.4);z-index:5;font-size:9px;font-weight:800;color:#fff;line-height:1;}
  .cr-badge svg{width:10px;height:10px;}
  .cr-card.stuck .cr-badge,.cr-card.done .cr-badge:not(:empty),.cr-card.active .cr-badge:not(:empty){opacity:1;transform:translateX(-50%) translateY(0);}
  .cr-card.active .cr-badge{background:#e5484d;}
  .cr-card.stuck .cr-badge{background:#f5a623;}
  .cr-card.active{animation:crPulseR 1.1s ease-in-out infinite;}
  .cr-card.done{animation:crPulseG 1.1s ease-in-out infinite;}
  .cr-card.stuck{animation:crPulseA 1.6s ease-in-out infinite;}
  @keyframes crPulseR{0%,100%{box-shadow:0 0 0 1.5px rgba(229,72,77,.5);}50%{box-shadow:0 0 0 2.5px rgba(229,72,77,1);}}
  @keyframes crPulseG{0%,100%{box-shadow:0 0 0 1.5px rgba(79,174,116,.5);}50%{box-shadow:0 0 0 2.5px rgba(79,174,116,1);}}
  @keyframes crPulseA{0%,100%{box-shadow:0 0 0 1.5px rgba(245,166,35,.5);}50%{box-shadow:0 0 0 2.5px rgba(245,166,35,1);}}
  .cr-card.active .cr-sprite{filter:drop-shadow(0 0 5px rgba(229,72,77,.55));}
  .cr-card.done .cr-sprite{filter:drop-shadow(0 0 5px rgba(79,174,116,.55));}
  .cr-card.stuck .cr-sprite{filter:grayscale(.55) drop-shadow(0 0 5px rgba(245,166,35,.55));}
  /* when any agent is active, dim the resting ones so the caller stands out */
  .pool.has-active .cr-card:not(.active):not(.done):not(.stuck){opacity:.42;}
  /* today's real per-agent cost (runs · tokens · median), parsed from the transcript */
  .cr-body{display:flex;align-items:flex-end;justify-content:center;width:100%;height:calc(52px * var(--cr-scale, 1));overflow:hidden;line-height:0;}
  .cr-body .cr-sprite{transform:scale(var(--cr-scale, 1));transform-origin:bottom center;}
  .cr-name{display:block;font-size:clamp(8px, calc(10.5px * var(--cr-scale, 1)), 10.5px);font-weight:600;color:var(--text);margin-top:3px;text-align:center;line-height:1.2;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .cr-role{display:block;font-size:clamp(7.5px, calc(9.5px * var(--cr-scale, 1)), 9.5px);font-weight:600;color:#e8895a;margin-top:2px;text-align:center;line-height:1.2;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  /* XP: level badge, "+N XP" float on completion, gold flash on level-up */
  .cr-lv{position:absolute;top:2px;right:3px;font-size:clamp(7px, calc(8.5px * var(--cr-scale, 1)), 8.5px);font-weight:800;color:var(--muted);background:var(--inner);border:1px solid var(--iborder);border-radius:6px;padding:1px 4px;line-height:1.2;pointer-events:none;z-index:4;font-variant-numeric:tabular-nums;}
  /* rises straight up over the head. The status badge shares that seat, so it waits
     out the 1.5s flash (.xp-flash) and lands after — a sequence, not a pile-up. */
  .xp-pop{position:absolute;top:6px;left:50%;font-size:10px;font-weight:800;color:#4fae74;background:var(--card);padding:0 4px;border-radius:5px;box-shadow:0 1px 3px rgba(0,0,0,.22);pointer-events:none;z-index:6;white-space:nowrap;animation:xpFloat 1.5s ease-out forwards;}
  .xp-pop.lvup{color:#e8b23a;letter-spacing:.4px;}
  /* On a white card these two are 2.75:1 and 2.21:1, both under 4.5. Same two roles, brought down
     for the light theme: this chip has an opaque --card background, so it is "the room" and the
     room follows the theme (docs/game-panels.md, section 4). The .wk variants below are not
     corrected here and must not be: they sit over the room art with a dark halo, not on --card */
  body.vscode-light .xp-pop{color:#1f7a49;}   /* 5.33:1 */
  body.vscode-light .xp-pop.lvup{color:#8a5a00;}  /* 4.84:1 */
  @keyframes xpFloat{0%{opacity:0;transform:translateX(-50%) translateY(7px);}15%{opacity:1;}100%{opacity:0;transform:translateX(-50%) translateY(-12px);}}
  .cr-card.xp-flash .cr-badge{opacity:0;}
  /* same pop over the room walker: sits above the head, where the role tag and the
     typing dots live, so those step aside for the 1.5s it is on screen */
  /* over the room art a filled chip reads as a sticker — bare text with a dark halo
     stays legible on both the light and the dark rooms */
  .xp-pop.wk{top:auto;bottom:100%;margin-bottom:5px;z-index:9;background:none;box-shadow:none;padding:0;font-size:11px;color:#7ee6a4;text-shadow:0 1px 3px rgba(0,0,0,.95),0 0 7px rgba(0,0,0,.8);}
  .xp-pop.wk.lvup{color:#ffd166;}
  .walker.xp-flash .wk-role,.walker.xp-flash .wk-dots{opacity:0;}
  .walker.done .wk-dots{display:none;}
  .walker.done .wk-sprite{animation:none;}
  .cr-card.levelup{animation:crLevelUp 1.4s ease;}
  @keyframes crLevelUp{0%,100%{box-shadow:none;}25%{box-shadow:0 0 0 2px rgba(232,178,58,.9),0 0 14px rgba(232,178,58,.55);background:rgba(232,178,58,.10);}70%{box-shadow:0 0 0 2px rgba(232,178,58,.45),0 0 8px rgba(232,178,58,.3);}}
  .cr-card.levelup .cr-lv{color:#e8b23a;border-color:rgba(232,178,58,.6);}
  /* hover profile: an employee-badge card — photo, name/role, XP bar, the level's receipts */
  .inner.agents{position:relative;}
  .prof-card{position:absolute;z-index:900;width:186px;background:var(--card);border:1px solid var(--iborder);border-radius:11px;padding:5px 11px 9px;box-shadow:0 8px 22px rgba(0,0,0,.4);pointer-events:none;opacity:0;transition:opacity .14s ease;font-size:10.5px;line-height:1.4;}
  .prof-card.show{opacity:1;}
  .pf-hole{width:24px;height:4px;border-radius:3px;background:var(--track);margin:2px auto 5px;}
  .pf-band{display:flex;align-items:center;justify-content:space-between;font-size:7.5px;font-weight:800;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase;padding-bottom:5px;border-bottom:1px dashed var(--iborder);margin-bottom:7px;}
  .pf-band .pf-lvl{font-size:10.5px;letter-spacing:.3px;color:#e8895a;}
  .pf-main{display:flex;align-items:center;gap:9px;}
  .pf-photo{flex:none;width:42px;height:46px;display:flex;align-items:center;justify-content:center;background:var(--inner);border:1px solid var(--iborder);border-radius:7px;}
  .pf-id{min-width:0;}
  .pf-nm{font-size:12px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .pf-tag{flex:none;font-size:7px;font-weight:800;color:var(--muted);border:1px solid var(--iborder);border-radius:4px;padding:0 3px;letter-spacing:.5px;}
  .pf-role{font-size:9.5px;font-weight:700;color:#e8895a;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .pf-orig{font-size:8.5px;color:var(--muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .pf-xpbar{height:5px;border-radius:3px;background:var(--track);margin-top:8px;overflow:hidden;}
  .pf-xpfill{height:100%;border-radius:3px;background:linear-gradient(90deg,#e8895a,#e8b23a);}
  .pf-xptxt{font-size:8.5px;font-weight:700;color:var(--muted);text-align:right;margin-top:2px;font-variant-numeric:tabular-nums;}
  .pf-stats{display:flex;margin-top:6px;border-top:1px dashed var(--iborder);padding-top:7px;}
  .pf-stats>div{flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;min-width:0;}
  .pf-stats b{font-size:11px;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums;white-space:nowrap;}
  .pf-stats span{font-size:7.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;}
  /* hidden agents: restore row + dimmed mini cards */
  /* both of these are buttons: the restore path out of "every agent is hidden" cannot be the one
     part of the roster a keyboard never reaches */
  .hid-row{flex:1 1 100%;display:flex;align-items:center;gap:6px;margin-top:8px;padding:5px 8px;border:0;border-radius:8px;background:transparent;font-family:inherit;font-size:10.5px;font-weight:700;color:var(--muted);cursor:pointer;user-select:none;text-align:left;}
  .hid-row:hover{background:var(--inner);}
  .hid-row:focus-visible{outline:2px solid var(--focus);outline-offset:-2px;}
  .hid-chev{display:inline-block;transition:transform .18s ease;font-size:12px;line-height:1;}
  .hid-chev.open{transform:rotate(90deg);}
  .hid-pool{flex:1 1 100%;display:flex;flex-wrap:wrap;gap:5px;padding:2px 4px 4px;}
  .hid-card{display:flex;align-items:center;gap:6px;padding:3px 8px 3px 5px;border-radius:8px;background:var(--inner);border:1px solid var(--iborder);font-family:inherit;font-size:inherit;cursor:pointer;opacity:.62;transition:opacity .15s ease;}
  .hid-card:hover{opacity:1;}
  .hid-card:focus-visible{outline:2px solid var(--focus);outline-offset:1px;opacity:1;}
  .hid-name{font-size:10px;font-weight:600;color:var(--text);max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .hid-restore{font-size:9px;font-weight:700;color:#e8895a;text-transform:uppercase;letter-spacing:.4px;}
  .am-hide{margin-top:10px;width:100%;padding:6px 0;border:1px solid var(--iborder);border-radius:8px;background:transparent;color:var(--muted);font-size:11px;font-weight:600;font-family:inherit;cursor:pointer;}
  .am-hide:hover{color:#e5484d;border-color:rgba(229,72,77,.45);}
  /* built-in Claude Code agents: present but visually second-class to the user's own */
  .cr-card.builtin .cr-role{color:var(--muted);text-transform:uppercase;letter-spacing:.5px;}
  .cr-card.builtin .cr-sprite{opacity:.85;}
  .pool-empty{flex:1 1 100%;color:var(--muted);font-size:11.5px;text-align:center;padding:22px 12px 14px;line-height:1.55;}
  /* collapsed Crew: compact "now running" strip */
  .crew-mini{padding:4px 2px 2px;}
  .crew-idle{color:var(--muted);font-size:11px;text-align:center;padding:12px 8px;}
  .cm-row{display:flex;align-items:center;gap:9px;padding:7px 4px;}
  .cm-row + .cm-row{border-top:1px solid var(--iborder);}
  .cm-sprite{flex:none;width:34px;height:38px;display:flex;align-items:flex-end;justify-content:center;overflow:hidden;}
  .cm-mid{flex:1 1 auto;min-width:0;}
  .cm-top{display:flex;align-items:baseline;gap:6px;}
  .cm-name{font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .cm-model{font-size:9px;font-weight:700;color:var(--muted);letter-spacing:.2px;flex:none;}
  .cm-desc{font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;}
  .cm-bar{position:relative;height:4px;border-radius:3px;background:var(--track);overflow:hidden;margin-top:5px;}
  .cm-bar::after{content:'';position:absolute;top:0;left:0;height:100%;width:40%;border-radius:3px;background:linear-gradient(90deg,#e8895a,#f0a882);animation:cmSweep 1.3s ease-in-out infinite;}
  .cm-row.done .cm-bar::after{width:100%;animation:none;background:#4fae74;}
  .cm-row.stuck .cm-bar::after{background:linear-gradient(90deg,#f5a623,#f7c46a);animation-duration:2.4s;}
  .cm-row.stuck .cm-desc{color:#f5a623;}
  .walker.stuck .wk-sprite{filter:grayscale(.55) drop-shadow(0 0 4px rgba(245,166,35,.6));}
  .walker.stuck .wk-name{color:#f5a623;}
  .cm-time{flex:none;font-size:9.5px;font-weight:600;color:var(--muted);font-variant-numeric:tabular-nums;}
  @keyframes cmSweep{0%{left:-40%;}100%{left:100%;}}
  /* "Waiting on a result": the amber of the "?" badge, bordered rather than filled so it reads as
     a notice and not as an error. Sits between the room and the Crew heading. */
  .wait-box{margin-top:11px;padding:9px 10px;border:1px solid rgba(245,166,35,.42);border-radius:10px;background:rgba(245,166,35,.07);}
  .wb-head{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#f5a623;letter-spacing:.2px;}
  .wb-head svg{width:13px;height:13px;flex:none;}
  .wb-n{margin-left:auto;font-size:10px;font-weight:700;color:#f5a623;background:rgba(245,166,35,.16);border-radius:7px;padding:1px 6px;font-variant-numeric:tabular-nums;}
  .wb-note{margin-top:5px;font-size:10px;line-height:1.5;color:var(--muted);}
  .wb-row{display:flex;align-items:center;gap:8px;margin-top:7px;padding-top:7px;border-top:1px solid rgba(245,166,35,.22);}
  .wb-mid{flex:1 1 auto;min-width:0;}
  .wb-nm{display:flex;align-items:baseline;gap:6px;font-size:11.5px;font-weight:700;color:var(--text);}
  .wb-el{font-size:9.5px;font-weight:600;color:#f5a623;font-variant-numeric:tabular-nums;}
  .wb-desc{font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;}
  .wb-clear{flex:none;padding:4px 9px;border:1px solid rgba(245,166,35,.5);border-radius:7px;background:transparent;color:#f5a623;font-family:inherit;font-size:10px;font-weight:700;cursor:pointer;}
  .wb-clear:hover{background:rgba(245,166,35,.16);}
  /* --- the crossroads: three doors, one row -----------------------------------------------------
     The drawings stand on the same floor (align-items:flex-end) and share the width equally, so no
     door is the bigger offer. The picture is the thing being pressed and the word under it is only
     its name. How MANY doors there are is the register's answer, not this file's (html.js).
     THE BOX IS THE COLUMN'S AND 1.7 TIMES AS WIDE AS IT IS TALL, with max-height as a ceiling. The
     ratio is the whole rule: every hero is narrower than 1.7:1 (hero-games 592x386 = 1.534,
     hero-shop 646x526 = 1.228, hero-mine 646x446 = 1.448), so inside the box HEIGHT ALWAYS BINDS
     and the three come out the same height on the same floor, each one only as wide as its own
     drawing needs. That is what makes them read as a set; before this they filled the column edge
     to edge and the shop stood 21.5px taller than the dealer (docs/shop-spec.md, section 2-2).
     The width left over inside each column is the air, and it is the point: the drawings no longer
     run wall to wall. max-height:72 is the ceiling, so a wider sidebar stops feeding the pictures
     instead of letting them eat the extra width.
     IT WAS 2/1 WHILE THERE WERE TWO DOORS (section 2-7). A third column takes each box from 132.5
     to 85.67 at a 351px sidebar, and at 2/1 that is a 42.83px box: the shop's drawing would render
     at 0.081x, where a 1px outline survives about one column in twelve. 1.7 buys back 5.6px of
     height, the drawing comes out at 0.096x, and the row is 15.86px SHORTER than the two-door row
     was, because the box got lower. The condition is the paragraph above, so this number cannot go
     past 1.534 without breaking the set; test/panel-css.test.js section 2c reads the PNG headers
     and holds it.
     A redrawn hero WIDER than the box would bind on width instead and sit on the floor of it, so
     the row still cannot grow past the ceiling whatever picture arrives.
     NOT PIXELATED, measured: the heroes carry 1px outlines and dithering, and nearest-neighbour at
     this scale (0.096x for the shop) drops most of them (section 2-4). The mascot and the tiles
     keep theirs. --- */
  .cr-pair{display:flex;align-items:flex-end;gap:8px;}
  .cr-door{position:relative;flex:1 1 0;min-width:0;display:block;padding:0 0 8px;border:0;border-radius:12px;
    background:transparent;cursor:pointer;font-family:inherit;text-align:center;}
  .cr-door:hover{background:var(--track);}
  .cr-door:focus-visible{outline:2px solid var(--focus);outline-offset:-2px;}
  .cr-art{display:block;width:100%;aspect-ratio:1.7/1;max-height:72px;}
  .cr-art img{width:100%;height:100%;object-fit:contain;object-position:bottom;display:block;}
  .cr-cap{display:block;margin-top:8px;font-size:12.5px;font-weight:700;color:var(--text);}
  /* HOW FINISHED THE ROOM BEHIND A DOOR IS, said before it is opened. Which doors wear it is the
     register's (games/registry.js's \`beta\`) and never this file's: a stylesheet that knew would
     be a stylesheet that knows a game's name.
     IT IS THE QUIETEST MARK ON THE CARD AND THAT IS THE POINT. A badge is a warning and not an
     offer, so it takes NO accent: ember is the one thing this panel highlights with and it is
     already spoken for twice over (the picked shop cell, and the mine's own reach line), and gold
     is money. Muted on the card's own surface with the inner border round it is the pair the
     panel already uses for a thing that is there to be read and not pressed, and both halves are
     tokens, so the light and high-contrast themes get it for free.
     IN THE TOP CORNER, which is air: every hero is bottom-aligned art on a transparent canvas,
     so the badge sits over none of the drawing. 7.5px with a little tracking, which is BELOW the
     six type sizes of docs/game-panels.md section 2 on purpose -- it is a stamp rather than a
     line of the page, the way a corner fold is not a paragraph. At a 250px sidebar a door is
     about 60px wide and the stamp is 30, so it stays inside its own column. */
  .cr-beta{position:absolute;top:0;right:0;padding:1px 4px;border-radius:5px;
    background:var(--card);box-shadow:inset 0 0 0 1px var(--iborder);
    font-size:7.5px;font-weight:700;letter-spacing:.06em;line-height:11px;color:var(--muted);
    pointer-events:none;}
  /* --- the shop. The casino's chrome is games/casino.js and every game's own CSS lives with that
     game, but the shop is not a game (docs/shop-spec.md, section 4-5), so its screen is here,
     beside the Agents tab's, and it borrows the chrome's heading, note, warning bar and button.
     It adds no colour and no type size: 12.5 for a scene's name, 11 for the price, 10.5 for when
     that scene shows and for a cell's word, which is three of the six (docs/game-panels.md,
     section 2). The one accent is the ember the roster's picked card already uses. --- */
  /* THE SCENES. Each is a line saying which moment it is and a row of cells saying what may
     be in it. The cells are a grid with the column count set from the DATA (webview.js), so a
     third drawing in any scene widens every row without a rule here changing, and a fifth scene
     (2026-11-24) added a row to the grid without one changing either */
  /* TWO SCENES ABREAST where there is room for two. A scene is as wide as its cells (two of 64 and
     the gap between them = 132), so the track is that and none of them can be half a scene; at a
     250px sidebar one track fits and they stack instead, which is what every other part of this
     panel does when the sidebar is narrow. WHAT THE TWO TRACKS ARE WORTH was measured on the
     version where the block and the button were always on screen: four scenes, the card 541 at a
     351px sidebar two-by-two against 703 in one column, and the difference is whether the button
     that buys something is above the fold on a 600px-tall sidebar. Neither figure is this version's,
     since nothing is on screen here until a price is pressed; the current ones are in
     docs/shop-spec.md section 3-1b, where the card opens at 616 with five scenes and 900 at 250. */
  .sh-slots{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:11px 8px;}
  .sh-shead{display:flex;flex-direction:column;min-width:0;}
  .sh-sn{font-size:12.5px;font-weight:700;color:var(--text);white-space:nowrap;}
  .sh-sw{font-size:10.5px;line-height:13px;color:var(--muted);white-space:nowrap;overflow:hidden;
    text-overflow:ellipsis;}
  .sh-opts{display:grid;gap:4px;margin-top:5px;}
  .sh-cell{position:relative;display:flex;flex-direction:column;align-items:center;
    justify-content:flex-end;gap:2px;
    height:64px;padding:0 0 4px;border:0;border-radius:9px;background:var(--inner);
    box-shadow:inset 0 0 0 1px var(--iborder);font-family:inherit;font-size:inherit;}
  .sh-pic{width:100%;height:36px;object-fit:contain;object-position:bottom;
    image-rendering:pixelated;display:block;}
  /* THE ONE IN USE, in the shape the roster's picked card already has (.cr-card.selected above):
     the same ember, the same tint, no new colour and no gold. The word in the cell says it too, so
     this is not the only way to see it */
  .sh-cell.on{background:rgba(232,137,90,.13);box-shadow:inset 0 0 0 1.5px #e8895a;}
  /* ...and the word in it carries the same weight as the ring, so the ring is never the only way
     to see it. The scene cells already got this through .owned; the last row's do not, because
     there the question is not whether you have the drawing but whether it is in play at all */
  .sh-cell.on .sh-tag{color:var(--text);}
  /* WHAT THE ONE BUTTON IS AIMED AT, in the same ember and a different shape. The ring above says
     what IS; this bar lies on the bottom edge, directly under the price, and says what Buy pays.
     A SHAPE AND NOT A SECOND COLOUR: the screen has one accent and the two marks never land on one
     cell, so the only place they have to hold apart is the row that shows both, where they sit side
     by side as a box and an underline. The bar is a fill rather than an outline so it survives the
     high-contrast theme, where --card and --inner are both black and a lifted plate would say
     nothing. And it is not the only way to see which one it is: the block above the button is
     filled from the same drawing and writes its name and its price out. */
  .sh-cell.aim::after{content:'';position:absolute;left:8px;right:8px;bottom:0;height:2px;
    border-radius:2px 2px 0 0;background:#e8895a;}
  /* ...and a cell is pressable in two senses (webview.js): a scene with more than one drawing of
     its own chooses between them, and a price points the button below at itself. A scene with one
     drawing is settled and is neither */
  .sh-cell.pick,.sh-cell.buy{cursor:pointer;}
  .sh-cell.pick:hover:not(.on),.sh-cell.buy:hover:not(.aim){background:rgba(127,127,127,.09);}
  .sh-cell.pick:focus-visible,.sh-cell.buy:focus-visible{outline:2px solid var(--focus);
    outline-offset:1px;}
  /* --- THE LAST ROW, which is not one of the scenes and is not drawn as one.
     WHY IT IS NOT IN THE GRID ABOVE, in two parts. Mechanically: that grid is a RECTANGLE, every
     scene given as many cells as the widest one has (webview.js), so a four-cell row among them
     would make all five of them four wide, eleven of the twenty empty, and the shelf drop from two
     columns to one. And in meaning: a scene holds exactly one drawing and always holds one, while
     this holds a SET that may be empty, and empty is the useful state in it. Two shapes, two
     places. So it sits under them, across the whole width, with a hairline between.
     THE HAIRLINE IS THE DIVIDER, not a card and not a second accent: a box around it would make it
     the loudest thing on a screen whose subject is the scenes above. */
  .sh-rand{margin-top:11px;padding-top:11px;border-top:1px solid var(--iborder);}
  /* FOUR ACROSS WHERE THERE IS ROOM, two by two where there is not, by the same auto-fit the shelf
     above uses and with the same 64px cell. Four of them plus the gaps come to 268 against the 273
     this panel is built for; at a 250px sidebar four would be 40 wide, which is narrower than the
     word inside them, and the row folds instead, which is what the scenes above do at that width */
  .sh-rand .sh-opts{grid-template-columns:repeat(auto-fit,minmax(60px,64px));}
  /* AN EMPTY SLOT: the frame, and the word in the middle of it. NO PICTURE, which is the one thing
     that tells it from a drawing nobody can press: that one has a crab in it and says when the
     crab shows up, and this says only that something will go here */
  .sh-cell.soon{justify-content:center;}
  /* a cell says what it is in WORDS as well as in weight: free, own, what it costs, or Soon */
  .sh-tag{font-size:10.5px;line-height:12px;font-weight:700;color:var(--muted);
    font-variant-numeric:tabular-nums;}
  .sh-cell.owned .sh-tag{color:var(--text);}
  /* WHAT IS ON SALE, next to the button that buys it, DRAWN IN THE BOX IT WILL BE DRAWN IN: 88 x
     74, fitted with contain and stood on the bottom edge, which is the mascot's own box to the
     pixel (.sparkle above). A preview with any other geometry is a promise the panel then breaks,
     and this one cannot drift because the rules are the same three. The plate behind it is
     --track, the surface this stylesheet already uses to lift a block off a card. */
  /* IT WRAPS RATHER THAN SQUEEZING THE NAME. The picture is a fixed 88 and the words beside it ask
     for 100, so at a 250px sidebar (144 of content) the two cannot share a line and the words drop
     under the picture instead: measured, the name and the price were cut off at 44px wide before
     this, which is a price a reader cannot read. The height follows, so min-height and not height */
  .sh-try{display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px;min-height:90px;margin-top:13px;
    padding:8px 14px;box-sizing:border-box;border-radius:12px;background:var(--track);}
  .sh-try[hidden]{display:none;}
  /* A PRESS ON A PRICE IS ANSWERED HERE. With one drawing on sale the cell it lands on is already
     the aimed one, so the shelf has nothing to move and the only honest answer is the block the
     price was sent to saying so. It is a step of attention and not decoration, which is the only
     reason there is motion on this screen at all */
  .sh-try.ping{animation:shPing .18s ease-out;}
  @keyframes shPing{0%{transform:scale(1);}45%{transform:scale(1.02);}100%{transform:scale(1);}}
  @media (prefers-reduced-motion:reduce){.sh-try.ping{animation:none;}}
  .sh-try img{width:88px;height:74px;object-fit:contain;object-position:bottom;
    image-rendering:pixelated;display:block;flex:none;}
  .sh-what{flex:1 1 100px;display:flex;flex-direction:column;gap:3px;min-width:0;padding-bottom:7px;}
  .sh-nm{font-size:12.5px;font-weight:700;color:var(--text);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .sh-price{display:inline-flex;align-items:center;gap:4px;
    font-size:11px;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums;}
  /* --- credits: header second line. The coin fills bottom-up in 6 rows toward the next credit --- */
  /* no margin on top: it used to sit under a 16px title and it is the only line in .ttl now */
  .ttl .t2.cc{display:flex;align-items:center;gap:4px;font-size:12px;line-height:16px;}
  .cc-coin{width:16px;height:16px;flex:none;display:block;shape-rendering:crispEdges;}
  .cc-r{opacity:.3;transition:opacity .25s ease;}
  .cc-r.on{opacity:1;}
  .cc-bal{font-weight:700;color:var(--text);font-variant-numeric:tabular-nums;white-space:nowrap;}
  .cc-unit{color:var(--muted);white-space:nowrap;}
  .cc.counting .cc-bal{color:var(--muted);}
  .cc.counting .cc-coin{animation:pulse 1.4s ease-in-out infinite;}
  .cc-coin.flip{animation:ccFlip .4s ease-in-out;}
  @keyframes ccFlip{0%,100%{transform:scaleX(1);}50%{transform:scaleX(.12);}}
  /* the word goes by width, not by measurement, so it doesn't blink when switching tabs
     (the Agents tab has no chevron and is 30px wider) */
  @media (max-width:290px){.cc-unit{display:none;}}
  .cc.fit1 .cc-unit{display:none;}
  .cc.fit2 .cc-bal{display:none;}
  @media (prefers-reduced-motion:reduce){.cc-coin.flip,.cc.counting .cc-coin{animation:none;}.cc-r{transition:none;}}
  /* --- header credits: the way into the blackjack table --- */
  button.cc{background:transparent;border:0;font-family:inherit;color:inherit;text-align:left;cursor:pointer;padding:1px 6px 1px 3px;border-radius:6px;width:fit-content;max-width:100%;}
  button.cc:hover,button.cc[aria-pressed="true"]{background:var(--track);}
  /* the same token as the casino's rings: this button is the door into it, and ember measures
     2.57:1 on the light --card (#ffffff) the ring is drawn inside */
  .wk-more{margin-left:6px;background:var(--track);border:0;color:var(--muted);font-size:10.5px;font-weight:600;padding:1px 7px;border-radius:6px;cursor:pointer;font-family:inherit;vertical-align:1px;}
  .wk-more:hover{color:var(--text);}
  .wk-card{max-width:420px;}
  .wk-empty{color:var(--muted);font-size:12px;padding:18px 0;text-align:center;}
  .wk-sheet{animation:wkFadeIn .2s ease-out;}
  .wk-sheet .sheet-card{animation:wkCardIn .26s cubic-bezier(.2,.8,.2,1);}
  .wk-sheet.closing{animation:wkFadeOut .18s ease-in forwards;}
  .wk-sheet.closing .sheet-card{animation:wkCardOut .18s ease-in forwards;}
  @keyframes wkFadeIn{from{opacity:0}to{opacity:1}}
  @keyframes wkFadeOut{from{opacity:1}to{opacity:0}}
  @keyframes wkCardIn{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}
  @keyframes wkCardOut{from{opacity:1;transform:none}to{opacity:0;transform:translateY(8px) scale(.98)}}
  .wk-in{animation:wkFadeIn .22s ease-out;}
  .wk-wait{display:flex;justify-content:center;padding:6px 0;}
  .wk-wait.big{padding:26px 0;}
  .wk-spin{width:16px;height:16px;border-radius:50%;border:2px solid var(--track);border-top-color:#e8895a;animation:wkSpin .7s linear infinite;}
  .wk-wait.big .wk-spin{width:22px;height:22px;}
  @keyframes wkSpin{to{transform:rotate(360deg)}}
  .wk-fold > summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:6px;user-select:none;}
  .wk-fold > summary::-webkit-details-marker{display:none;}
  .wk-fold > summary::before{content:'';width:0;height:0;border-left:4px solid currentColor;border-top:3.5px solid transparent;border-bottom:3.5px solid transparent;transition:transform .18s ease;flex:none;}
  .wk-fold[open] > summary::before{transform:rotate(90deg);}
  .wk-fold > summary:hover{color:var(--text);}
  .wk-fold-top{margin-left:auto;text-transform:none;letter-spacing:0;font-weight:500;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .wk-fold[open] .wk-fold-top{visibility:hidden;}
  .wk-fold[open] > .wk-rows{animation:wkFold .22s ease-out;}
  @keyframes wkFold{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
  .wk-right{text-align:right;}
  .wk-head-btns{display:flex;gap:2px;}
  .sheet-x.wk-refresh svg{transform:none;width:14px;height:14px;}
  .sheet-x.wk-refresh.busy svg{animation:wkSpin .8s linear infinite;}
  @media (prefers-reduced-motion:reduce){.wk-sheet,.wk-sheet .sheet-card,.wk-sheet.closing,.wk-sheet.closing .sheet-card,.wk-in,.wk-fold[open] > .wk-rows{animation:none;}}
  .wk-host{color:var(--muted);font-size:11px;margin:-6px 0 12px;}
  .wk-share{display:flex;align-items:baseline;gap:8px;}
  .wk-big{font-size:28px;font-weight:800;color:var(--text);line-height:1;}
  .wk-big small{font-size:14px;font-weight:700;}
  .wk-tot{color:var(--muted);font-size:16px;font-weight:700;}
  .wk-mwrap{position:relative;--other:rgba(140,140,140,.45);}
  .wk-legend{--other:rgba(140,140,140,.45);}
  .wk-meter{display:flex;height:10px;border-radius:5px;background:var(--track);margin:9px 0 4px;overflow:hidden;}
  .wk-meter i{display:block;height:100%;flex:none;cursor:default;transition:filter .12s;}
  .wk-meter i + i{box-shadow:inset 1px 0 0 var(--card);}
  .wk-meter i:hover{filter:brightness(1.18);}
  .wk-tip{position:absolute;top:100%;margin-top:-1px;z-index:2;white-space:nowrap;pointer-events:none;background:var(--text);color:var(--card);font-size:11px;font-weight:600;padding:3px 7px;border-radius:5px;}
  .wk-legend{display:flex;gap:12px;color:var(--muted);font-size:10.5px;}
  .wk-legend b{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;vertical-align:0;}
  .wk-note{color:var(--muted);font-size:10.5px;margin-top:6px;line-height:1.35;}
  .wk-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:12px;}
  .wk-stat{background:var(--track);border-radius:8px;padding:7px 8px;}
  .wk-stat .v{font-size:14px;font-weight:700;color:var(--text);}
  .wk-stat .l{font-size:10px;color:var(--muted);margin-top:1px;}
  .wk-chart{display:flex;align-items:flex-end;gap:5px;height:96px;margin-top:6px;}
  .wk-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0;height:100%;justify-content:flex-end;}
  .wk-bar{width:100%;max-width:30px;display:flex;flex-direction:column;justify-content:flex-end;border-radius:4px 4px 2px 2px;overflow:hidden;background:transparent;}
  .wk-bar .sub{background:rgba(232,137,90,.45);}
  .wk-bar .main{background:#e8895a;}
  .wk-col .n{font-size:9.5px;color:var(--muted);white-space:nowrap;}
  .wk-col .d{font-size:10px;color:var(--muted);}
  .wk-col.today .d{color:var(--text);font-weight:700;}
  .wk-rows{display:flex;flex-direction:column;gap:6px;}
  .wk-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;font-size:11.5px;color:var(--text);}
  .wk-row .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .wk-row .val{color:var(--muted);font-size:10.5px;white-space:nowrap;}
  .wk-row .tr{grid-column:1 / -1;height:4px;border-radius:3px;background:var(--track);overflow:hidden;}
  .wk-row .tr i{display:block;height:100%;background:#e8895a;border-radius:3px;}
  .wk-team-form{display:flex;flex-wrap:wrap;gap:6px;}
  .wk-team-form input{flex:1 1 140px;min-width:0;background:var(--track);color:var(--text);border:1px solid var(--iborder);border-radius:7px;padding:5px 8px;font-size:12px;font-family:inherit;}
  .wk-team-form button{background:#e8895a;color:#fff;border:0;border-radius:7px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;}
  .wk-team-form button.ghost{background:transparent;color:var(--muted);border:1px solid var(--iborder);}
  .wk-team{display:flex;flex-direction:column;gap:6px;}
  .wk-trow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;font-size:12px;color:var(--text);}
  .wk-trow .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .wk-trow .pc{font-weight:700;}
  .wk-trow .tr{grid-column:1 / -1;height:5px;border-radius:3px;background:var(--track);overflow:hidden;}
  .wk-trow .tr i{display:block;height:100%;background:rgba(232,137,90,.55);border-radius:3px;}
  .wk-trow.me .tr i{background:#e8895a;}
  .wk-trow.me .nm{font-weight:700;}
  .wk-trow.stale{opacity:.55;}
  .wk-note a{color:#e8895a;}
  button.cc:focus-visible{outline:none;box-shadow:inset 0 0 0 1.5px var(--focus);} /* .ttl clips outside outlines */
  /* The header crab used to be hidden in the games area, on the grounds that "the crab climbs down
     to deal". The one that deals is the dealer on the felt, a 16x22 drawing at card scale, and the
     two were never on screen together in a way a reader could confuse. A mark that disappears on
     two of three tabs is not a mark, so it stays on all of them (header-fold-spec, 3-4). The
     dealer crab is untouched. */
  /* Every game screen's CSS lives with that game: the casino chrome in games/casino.js and the
     rest in games/<id>/meta.js, appended after this stylesheet by games/registry.js. */
`;
