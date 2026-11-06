// The Sword Forge: the one thing in the casino that outlives the window. The card games keep a
// round in memory and a reload voids it; a sword is the player's property, so it is stored in the
// credit ledger next to the bank (credits.js) and every window shares the one sword.
//
// Which is why this game is NOT on the round driver (games/tables.js) and keeps its own handler:
//
//  - the state is re-read before every message. memento.update rewrites and broadcasts all of the
//    extension's keys at once, so another window's write lands here, and that window may have
//    forged the sword since the last message this one answered. Acting on the copy in memory would
//    spend the fee on an attempt the merge then throws away, so every message starts from whichever
//    record is further along (credits.forgeNewer). A reload is the same thing taken to its limit:
//    nothing in memory, everything in storage.
//  - there is no live stake. An attempt IS the settlement: the fee goes the instant it is paid,
//    whatever it rolls, and a sale arrives at once. So held() is 0 in both directions, and one
//    write carries the money and the saved sword together.
//  - settling is its own (fgSettle) rather than the shared afterMove, because only the FEE rides
//    the bank's grow-only counters while what a SALE pays is `earned` inside the record.
'use strict';
const engine = require('../../forge');
const credits = require('../../credits');

module.exports = {
  id: 'forge',
  key: 'fg',
  name: 'Forge',
  icon: 'sword',
  thumb: 'game-forge.png',
  title: 'Sword Forge',
  hint: 'Enhance to Lv 10 · a failed attempt heats the forge · it can break from the level the glow starts',
  panel: 'games/forge/panel.js',
  cls: 'fg',
  order: 130,                // the list's order and its heading: see games/blackjack/meta.js
  // Not the bag the leftovers went into. These two are the games that leave something behind when
  // the window closes (a sword, a position), which is also why these two rows are the only ones
  // allowed a figure on the right: see docs/game-panels.md section 7
  group: 'What you keep',
  rowTitle: 'Sword Forge',   // the list row's tooltip: the name on the row is the short one

  // deps: reply, budget, random, ensureReplica, replica, record, storedForge, push, log, live
  createHandler(deps) {
    let sword = null;   // the sword, rebuilt from the ledger whenever storage is ahead of it
    let reqN = null;
    let seeds = deps.random; // tests swap this to pick the rolls (_test.setFgSeeds)

    // The sword as it stands, carrying the id of whichever window last wrote it
    function saved() { return engine.save(sword); }

    // ...and the record THIS window writes when it moves the sword: its own id settles a merge tie
    // (credits.forgeNewer), so a record without one loses every tie, which is the right way round:
    // a window that has not played has nothing to defend
    function record() { return Object.assign(saved(), { by: deps.replica() || '' }); }

    // Takes the stored sword when it is further along than the one in memory. Returns true if the
    // sword in memory changed, which is what a redraw hangs on
    function sync() {
      const stored = deps.storedForge();
      if (!sword || credits.forgeNewer(stored, saved())) {
        sword = engine.load(stored);
        return true;
      }
      return false;
    }

    function reply(error) { deps.reply('fg', engine, sword, reqN, error, false); }

    // One forced write carries the whole move: the sword, and the fee if there was one. What comes
    // back is the merged ledger, so this also finds out whether the move survived.
    //
    // A move that was dropped is shown as what it is: the sword another window moved, with no chip
    // on it and a line saying why. The fee for a dropped attempt is not refunded
    function settle() {
      const mine = record();
      const fee = sword.last.op === 'sell' ? 0 : sword.net;
      const ledger = deps.record(fee, { forge: mine });
      const landed = ledger && ledger.forge;
      const dropped = !landed || landed.moves !== mine.moves || landed.by !== mine.by;
      if (dropped) sword = engine.load(landed);
      // The merge may have raised a lifetime figure, and `by` is now this window's: take all of
      // them, so the sword in memory says exactly what storage says and the next sync has nothing
      // to do. Every field credits.FORGE_MAX_FIELDS maxes has to be listed here, `broke` included:
      // a figure left out would sit lower in memory than in storage, and sync() could not fix it,
      // because the two records have the same `moves` and neither is the later one
      else sword = Object.assign({}, sword, { by: landed.by, tries: landed.tries, best: landed.best, broke: landed.broke });
      reply(dropped ? 'another window moved the sword first' : null);
      try { deps.push(); } catch (e) { deps.log('forge: push after settle failed: ' + (e && e.message)); }
    }

    return {
      key: 'fg',
      handle(m) {
        reqN = Number.isSafeInteger(m.n) ? m.n : null;
        sync();
        if (m.op === 'open') return reply(null);
        if (engine.OPS.indexOf(m.op) < 0) return reply('unknown action');
        // What the screen was showing when the button was pressed. Another window can move the
        // sword between two messages, and the broadcast that says so arrives with no message of its
        // own, so a panel can be looking at a +0 sword the shop has since taken to +9. Forging it
        // anyway would charge a fee the screen never showed, so the level the screen drew comes
        // with the move and anything else is refused and redrawn. A message without one is taken as
        // it was before (the field is optional, so an older webview keeps working)
        if (Number.isSafeInteger(m.level) && m.level !== sword.level) {
          return reply('the sword has moved: it is +' + sword.level + ' now');
        }
        // The seed is made here and never leaves the host: one attempt, one seed, one roll. Nothing
        // the webview holds between two messages can say what the next attempt will do, because the
        // seed it will be rolled from does not exist yet
        const op = m.op === 'enhance' ? { op: m.op, seed: seeds() } : { op: m.op };
        const reason = engine.whyNot(sword, op, deps.budget('fg'));
        if (reason) return reply(reason);
        deps.ensureReplica();
        sword = engine.act(sword, op);
        settle(); // every accepted move settles, so this records exactly once per message
      },
      // The forge has nothing riding: its fee is gone the instant it is paid, so it never holds
      // credits back from the card games, and it is measured against what they have left like
      // everything else
      held() { return 0; },
      // A sword another window moved reaches this one as a globalState broadcast, which carries no
      // message to answer, so without this the panel would go on drawing the sword it last saw and
      // offering the fee of a level the sword has left. Every data push therefore checks the stored
      // record and redraws the forge if it has moved. The push already runs on a timer and on every
      // transcript write, so it costs nothing of its own, and it says nothing when nothing moved.
      // This narrows the gap; it does not close it, which is what the level on the message is for.
      //
      // It also answers the FIRST push of a window that has never opened the forge, and that is
      // not an accident of sync() being called earlier than it used to be. The sword's level is on
      // the games list (docs/game-panels.md, section 7), and the point of a figure there is that it
      // is the reason to open the panel: one that only appears once the panel has been opened
      // cannot be. The list rows exist from the first paint and the panel's fig() draws into them
      // whether the screen was built or not, so the only thing missing was a reply, and this is it.
      // The sword that reply describes is the stored one, or the +0 the shop gives away when there
      // is nothing stored, which is what the player owns either way.
      //
      // sync() is still what makes this say nothing when nothing moved: with no sword in memory it
      // loads one and answers once, and from then on it only answers a record that is further along
      onPush() {
        if (!deps.live()) return; // no webview to tell
        if (!sync()) return;
        reqN = null; // nothing asked for this one
        reply(null);
      },
      setSeeds(fn) { seeds = fn || deps.random; }
    };
  },

  css: `
  /* --- Sword Forge: the same structure as the felt with the colours swapped, lit from below.
     Contrast on this surface: ink 13.5:1, dim 6.5:1, the break red 6.1:1, the success green 10:1 --- */
  .fg-anvil{padding:12px 10px;border-radius:12px;color:var(--forge-ink);
    background:
      repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 1px, transparent 1px 2px),
      radial-gradient(90% 60% at 50% 108%, rgba(232,137,90,.22) 0%, rgba(232,137,90,0) 70%),
      radial-gradient(120% 100% at 50% 0%, var(--forge) 0%, var(--forge-lo) 100%);
    box-shadow:inset 0 0 0 1px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.05);}
  .fg-stage{display:flex;align-items:flex-end;gap:8px;}
  .fg-stage .bj-crab{position:relative;left:auto;bottom:auto;width:52px;height:56px;flex:none;}
  .fg-sword{position:relative;flex:none;width:48px;height:88px;line-height:0;}  /* 24x44 cells at 2px: 4 rows of headroom for the +10 flames */
  .fg-sword svg{display:block;}
  /* The four hammerings, one per size of press (FG_T.tap in panel.js: calm 120, mid 270, risk 360,
     brink 450). The duration here and the number there are the same fact written twice and have to
     move together, or the sword stands still for the rest of a beat the panel is still counting */
  .fg-sword.beat1{animation:fgBeat1 .12s steps(1) both;}
  .fg-sword.beat3{animation:fgBeat3 .27s steps(1) both;}
  .fg-sword.beat4{animation:fgBeat4 .36s steps(1) both;}
  .fg-sword.beat5{animation:fgBeat5 .45s steps(1) both;}
  .fg-sword.brace{animation:fgBrace .22s ease-out both;}   /* FG_T.brace: the brink's held breath */
  /* the blade's heat ring, breathing while a press that can break it is hammered. It repeats, so
     one keyframe set covers every beat length */
  .fg-ember{position:absolute;left:6px;top:0;width:36px;height:60px;border-radius:50%;pointer-events:none;
    background:radial-gradient(50% 50% at 50% 50%, rgba(232,137,90,.55) 0%, rgba(232,137,90,0) 72%);opacity:0;}
  .fg-sword.ember .fg-ember{animation:fgEmber .3s ease-in-out infinite;}
  .fg-sword.pop{animation:fgPop .18s ease-out both;}
  .fg-sword.drop{animation:fgDrop .16s ease-out both;}
  .fg-sword.gone{opacity:0;transition:opacity .12s linear;}
  .fg-sword.arrive{animation:fgArrive .2s ease-out both;}   /* the shop's replacement: FG_T.arriveIn */
  .fg-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;}
  .fg-flash.on{animation:fgFlash .18s ease-out both;}
  .fg-shard{position:absolute;left:22px;top:38px;width:4px;height:4px;pointer-events:none;animation:fgShard .42s ease-out both;}
  .fg-anvil.broke{animation:fgBroke .16s ease-out;}   /* this length is FG_T.brFlash in panel.js */
  .fg-lv{flex:1 1 auto;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-end;padding-bottom:6px;}
  .fg-lv b{font-size:22px;font-weight:800;line-height:1;color:var(--forge-ink);font-variant-numeric:tabular-nums;}
  .fg-lv span{font-size:11px;color:var(--forge-dim);margin-top:2px;}
  .fg-bar{display:flex;height:8px;margin-top:10px;border-radius:4px;overflow:hidden;background:rgba(0,0,0,.35);}
  .fg-bar i{display:block;height:100%;box-shadow:inset -1px 0 0 rgba(0,0,0,.35);}
  .fg-odds{display:flex;justify-content:space-between;gap:8px;margin-top:4px;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;}
  .fg-odds span:first-child{color:var(--forge-ink);}
  .fg-odds span:last-child{color:#f6836e;}
  /* what the gauge is worth, in the ember colour, so the bar and the number read as one thing */
  .fg-odds .fg-gain{flex:1 1 auto;text-align:center;color:#e8895a;}
  .fg-odds .fg-gain[hidden]{display:none;}
  /* the gauge: one cell a bar. Contrast on this surface: the lit ember 4.7:1 on the unlit track */
  .fg-heat{display:flex;gap:3px;height:6px;margin-top:6px;}
  .fg-heat[hidden]{display:none;}
  .fg-heat i{flex:1 1 0;border-radius:2px;background:rgba(0,0,0,.4);box-shadow:inset 0 0 0 1px rgba(255,255,255,.05);}
  .fg-heat i.on{background:linear-gradient(180deg,#f0a271,#e8895a);box-shadow:none;}
  .fg-heat.lit i.on.tip{animation:fgHeatLit .22s ease-out both;}   /* the bar a failure just bought */
  .fg-heat.spent i{animation:fgHeatSpent .3s ease-out both;}       /* and the whole row going out */
  .fg-anvil .bj-chip{background:rgba(0,0,0,.45);color:var(--forge-dim);}
  .fg-anvil .bj-chip.win{color:#7ee6a4;} .fg-anvil .bj-chip.lose{color:#f6836e;}
  /* the price on a button: the pixel coin at its own 2px grid, every row lit */
  .fg-cost{display:inline-flex;align-items:center;gap:3px;vertical-align:-3px;font-variant-numeric:tabular-nums;}
  .fg-cost .cc-coin{width:14px;height:14px;}
  .fg-cost .cc-r{opacity:1;}
  @keyframes fgBeat1{0%,100%{transform:none;}45%{transform:translateX(-2px);}}
  @keyframes fgBeat3{0%,100%{transform:none;}16%{transform:translateX(-1.5px);}33%{transform:translateX(1.5px);}50%{transform:translateX(-1.5px);}66%{transform:translateX(1.5px);}83%{transform:translateX(-1px);}}
  @keyframes fgBeat4{0%,100%{transform:none;}12%{transform:translateX(-1.5px);}25%{transform:translateX(1.5px);}37%{transform:translateX(-1.5px);}50%{transform:translateX(1.5px);}62%{transform:translateX(-1.5px);}75%{transform:translateX(1.5px);}87%{transform:translateX(-1px);}}
  @keyframes fgBeat5{0%,100%{transform:none;}10%{transform:translateX(-2px);}20%{transform:translateX(2px);}30%{transform:translateX(-2px);}40%{transform:translateX(2px);}50%{transform:translateX(-1.5px);}60%{transform:translateX(1.5px);}70%{transform:translateX(-1.5px);}80%{transform:translateX(1.5px);}90%{transform:translateX(-1px);}}
  @keyframes fgBrace{from{transform:none;}to{transform:translateY(-3px);}}
  @keyframes fgEmber{0%,100%{opacity:.18;}50%{opacity:.7;}}
  @keyframes fgHeatLit{from{transform:scaleY(2.2);filter:brightness(1.9);}to{transform:none;filter:none;}}
  @keyframes fgHeatSpent{from{opacity:1;}60%{opacity:.25;}to{opacity:1;}}
  @keyframes fgPop{0%{transform:scale(1);}45%{transform:scale(1.05);}100%{transform:scale(1);}}
  @keyframes fgDrop{from{transform:translateY(-4px);}to{transform:none;}}
  @keyframes fgArrive{from{opacity:0;}to{opacity:1;}}
  @keyframes fgFlash{from{opacity:.35;}to{opacity:0;}}
  @keyframes fgShard{from{transform:none;opacity:1;}to{transform:translate(var(--dx),var(--dy)) rotate(var(--rot));opacity:0;}}
  @keyframes fgBroke{0%{box-shadow:inset 0 0 0 1px rgba(0,0,0,.55), inset 0 0 0 999px rgba(229,72,77,.18);}100%{box-shadow:inset 0 0 0 1px rgba(0,0,0,.55);}}
  @media (prefers-reduced-motion:reduce){.fg-sword.beat1,.fg-sword.beat3,.fg-sword.beat4,.fg-sword.beat5,.fg-sword.brace,.fg-sword.ember .fg-ember,.fg-sword.pop,.fg-sword.drop,.fg-sword.arrive,.fg-flash.on,.fg-shard,.fg-anvil.broke,.fg-heat.lit i.on.tip,.fg-heat.spent i{animation:none;}.fg-sword.gone{transition:none;}}
`
};
