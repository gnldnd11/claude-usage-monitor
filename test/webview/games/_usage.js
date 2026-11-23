// The Usage tab: the mascot's four states and what is left of the session.
//
// Not a game, so the file is named for what it is, beside _agents.js and _chrome.js for the reason
// those give: the harness reads one directory and a mode is one page, one script, one process.
//
// WHAT IS PINNED HERE, and why each one cost something to get wrong:
//   1. the picture changes only when the reading actually MOVES. The four steps used to be hard
//      lines against the raw percentage the host pushes, so a window sitting on the line flipped
//      the drawing on every push. The deadband is three points wide coming down.
//   2. the first push is a drawing, not a transition: no beat on first paint.
//   3. a transition is a beat, and the beat ends. A class left on would keep the sprite pressed.
//   4. the session has ONE showing. The bar and the ring were the same number, the bar is gone,
//      and the time left in the window, which only the bar carried, is under the ring.
//   5. the settings key that hides the session hides the ring, and the one that hides the mascot
//      hides its BOX (the box has a height of its own now, so hiding the picture alone would
//      leave a hole where the crab was).
//   6. THE SECOND AXIS. The step says which row of MASCOT_ART, and whether anything has been
//      answered in the last three minutes says which column, so the same step is two drawings.
//      The threshold is a clock and not a reading, so it has no deadband to walk (webview.js) and
//      what is walked here instead is the edge itself, in both directions, on two steps.
//   7. AND WHICH DRAWING IS IN WHICH SCENE. The shop sells drawings into five scenes (shop.js,
//      SLOTS) and the host puts the answer on every push, so a choice made anywhere changes the
//      picture with no reading having moved. Which CELL each scene governs is the thing to get
//      wrong, and EVERY ONE OF THE EIGHT IS GOVERNED (2026-11-24): the working step's busy cell
//      used to be governed by none of them, so nothing anybody chose could reach it, and it has a
//      scene of its own now whose default is the drawing it always had. What is walked below is
//      which cell each scene reaches and, just as much, which cells it does NOT.
//
// THE SECOND MODE, `usage-nosession`, is the account that has no five-hour window at all: an
// authenticated Ultra, where the host pushes five_hour: null for ever (2026-10-30). Half of this
// tab was drawn from that missing reading, so the ring was an empty donut with a bar through it,
// the Active tile said "—", and the crab could reach only two of its four states, for ever. What
// that mode pins is in its own section below.
'use strict';

const HOUR = 3600;
const DAY = 86400;

module.exports = {
  id: 'usage',
  modes: ['usage-mascot', 'usage-nosession', 'usage-cameo'],
  // the only mode in the harness whose clock repeats, because the only thing on this page that
  // happens without a push is in it (modes.js)
  timers: { 'usage-cameo': true },

  run: function (h, MODE) {
    if (MODE === 'usage-nosession') return noSession(h);
    if (MODE === 'usage-cameo') return cameo(h);
    return withWindow(h);
  }
};

// ---------------------------------------------------------------------------------------------
// the account WITH a five-hour window (Pro, Max): nothing about this may move
// ---------------------------------------------------------------------------------------------
function withWindow(h) {
    const { ok, advance, doc, $, toWebview } = h;
    const base = {
      agents: [], xp: {}, today: {}, count: 0, cfg: { panelHidden: [] },
      credits: { balance: 0, today: 0, frac: 0, perCredit: 10000, counting: false }
    };
    const resets = () => Math.floor(Date.now() / 1000) + 3 * HOUR + 50 * 60;
    // one push of the host's own message. `wk` left out means the weekly reading has not landed,
    // `quietFor` is how long ago the last assistant message was (left out: just now, which is the
    // busy column of MASCOT_ART), and `slots` is which drawing is in which scene.
    // THE HOST WORKED THAT OUT, not the page: it reads the reader's stored choice against what
    // they own, in one place (shop.js, wornSlots), and what arrives here is the answer. So this
    // helper pushes answers and never a choice, which is what the page actually gets
    const WORN = { quiet: 'idle', typing: 'coding', work: 'working', burn: 'despair', spent: 'stunned' };
    const push = (sess, wk, hidden, quietFor, slots) => {
      toWebview({
        type: 'data',
        data: Object.assign({}, base, {
          cfg: { panelHidden: hidden || [] },
          fh: { used_percentage: sess, resets_at: resets() },
          sd: wk == null ? null : { used_percentage: wk, resets_at: resets() },
          last: quietFor === null ? null : { t: Date.now() - (quietFor || 0) },
          shop: {
            owned: slots && slots.burn === 'float' ? ['mascot:float'] : [],
            slots: Object.assign({}, WORN, slots || {})
          }
        })
      });
      advance(20);
    };
    const mascot = () => $('mascot');
    // which of the SIX drawings is on screen, by the data-* the page carries them in
    const DRAWINGS = ['idle', 'working', 'despair', 'stunned', 'coding', 'float'];
    const shown = () => {
      const m = mascot(), src = m.getAttribute('src');
      return DRAWINGS.filter((s) => m.getAttribute('data-' + s) === src)[0] || src;
    };
    const beating = () => mascot().classList.contains('beat');
    // THE INK LIFT FOLLOWS THE DRAWING, not the element. Some of the six carry ink that is the
    // same colour as a dark floor and some do not, so the page lifts the ones that do and leaves
    // the rest exactly as drawn (html.js, INK_LIFT; styles.js, .ink-lift). The wanted set is read
    // off the page rather than written here: panel-css.test.js is what checks that list against
    // the PNGs, and this checks that the class actually tracks it as the drawing changes.
    const WANTS_LIFT = (mascot().getAttribute('data-lift') || '').split(' ').filter(Boolean);
    const lifted = () => mascot().classList.contains('ink-lift');

    // 1 + 2. A walk up and down across all three lines. Each step says what should be on screen
    // and whether the page was allowed to beat; the pairs just inside and just outside an edge are
    // the whole point, so they are written as the readings a real window produces, not as the
    // thresholds in the code.
    // Every reading here lands while the account is BUSY (the push helper stamps the last message
    // as having just arrived), so the idle step draws `coding`: these are the same twelve steps
    // this mode has always walked, read down the busy column of MASCOT_ART.
    const walk = [
      { pct: 75, want: 'despair', beat: false, why: 'the first push is the first drawing' },
      { pct: 67.5, want: 'despair', beat: false, why: 'half a point inside the lower edge' },
      { pct: 66.9, want: 'working', beat: true, why: 'past it, so the picture changes' },
      { pct: 49.9, want: 'working', beat: false, why: 'the 50 line does not take it back' },
      { pct: 46.9, want: 'coding', beat: true, why: 'three points below it does' },
      { pct: 49.9, want: 'coding', beat: false, why: 'and coming back up needs the 50 line' },
      { pct: 50.1, want: 'working', beat: true },
      { pct: 89.9, want: 'despair', beat: true },
      { pct: 90.1, want: 'stunned', beat: true },
      { pct: 87.5, want: 'stunned', beat: false, why: 'the stun holds inside its own edge' },
      { pct: 86.9, want: 'despair', beat: true },
      { pct: 4, want: 'coding', beat: true, why: 'the window reset: one jump, one beat' }
    ];
    let drawn = [], beats = 0;
    for (const step of walk) {
      push(step.pct);
      drawn.push(shown());
      const beat = beating();
      if (beat) beats++;
      ok('at ' + step.pct + '% the crab is ' + step.want + (step.why ? ' (' + step.why + ')' : ''),
        shown() === step.want, 'drew ' + shown());
      // the box says which drawing is in it, because the drawing's top edge moves with its ratio
      // and the burn-rate bubble is placed against that edge (styles.js, .mascot-wrap[data-state])
      const box = $('pm_mascot');
      ok('  and the box says which drawing it holds', !!box && box.getAttribute('data-state') === step.want,
        box && box.getAttribute('data-state'));
      ok('  and it ' + (step.beat ? 'beats' : 'does not beat') + ' there', beat === step.beat);
      ok('  and the ink lift is ' + (WANTS_LIFT.indexOf(step.want) >= 0 ? 'on' : 'off') + ' for it',
        lifted() === (WANTS_LIFT.indexOf(step.want) >= 0),
        step.want + ' -> class ' + mascot().getAttribute('class'));
      advance(400); // let the beat finish before the next push arms another one
    }
    // and the walk is worth something only if it crossed both kinds of drawing
    ok('the walk covered a lifted drawing and an unlifted one',
      drawn.some((s) => WANTS_LIFT.indexOf(s) >= 0) && drawn.some((s) => WANTS_LIFT.indexOf(s) < 0),
      'lift list ' + WANTS_LIFT.join(' ') + ' | drew ' + [...new Set(drawn)].join(' '));
    ok('a walk over every edge changed the drawing exactly as often as the state changed',
      drawn.join(' ') === walk.map((s) => s.want).join(' '), drawn.join(' '));
    const changes = walk.filter((s, i) => i > 0 && s.want !== walk[i - 1].want).length;
    ok('and beat once per change, never on the first drawing', beats === changes, 'beats ' + beats + ' of ' + changes + ' changes');

    // 3. the beat ends on its own, and it is the only thing the script does to the picture: a
    //    crossfade or a filter on pixel art smears it, so neither may be written here
    push(95);              // push() itself advances 20ms past the message
    ok('a change presses the sprite', beating());
    advance(135);          // 155ms in
    ok('and it is still pressed just before 160ms', beating());
    advance(10);           // 165ms in
    ok('and let back up at 160ms', !beating(), mascot().getAttribute('class'));
    ok('nothing fades or filters the crab', !mascot().style.opacity && !mascot().style.filter);
    ok('a stunned crab can be poked', mascot().title === 'poke' && mascot().style.cursor === 'pointer');

    // the weekly reading stuns on its own, whatever the session says, and it must not teach the
    // session that it ever stood on the top step: a window at 88% stunned by a spent week would
    // then come back to 88% and read the top step's LOWER edge (87) as if it had crossed 90
    push(4, 100);
    ok('a spent week stuns a fresh session', shown() === 'stunned', shown());
    push(4, 40);
    ok('and lets go when the week turns over', shown() === 'coding', shown());
    push(88, 40);
    ok('a session at 88% on its own is despair', shown() === 'despair', shown());
    push(88, 100);
    ok('the week spending out stuns it', shown() === 'stunned', shown());
    push(88, 40);
    ok('and the week turning over hands it back to the session, which never reached 90',
      shown() === 'despair', shown());

    // 6. THE SECOND AXIS: the step picks the row, the clock picks the column.
    //
    // The threshold is 180s and it is counted rather than chosen (webview.js, QUIET_MS), so what is
    // walked here is the edge in both directions on the two steps that HAVE two columns, and then
    // that the other two steps have one. Each reading is pushed with an age for the last message:
    // the step cannot tell the difference and the drawing must.
    const AXIS = [
      { pct: 4, quiet: 0, want: 'coding', why: 'a reply just landed' },
      { pct: 4, quiet: 179000, want: 'coding', why: 'a second inside the threshold is still typing' },
      { pct: 4, quiet: 181000, want: 'idle', why: 'and a second past it is not' },
      { pct: 4, quiet: null, want: 'idle', why: 'a day with no reply at all is quiet' },
      { pct: 4, quiet: 0, want: 'coding', why: 'and typing again is an event, not a wait' },
      { pct: 55, quiet: 0, want: 'working', why: 'the working step, busy' },
      { pct: 55, quiet: 600000, want: 'idle', why: 'the working step, quiet: the old drawing' },
      { pct: 75, quiet: 0, want: 'despair', why: 'despair reads the same either way:' },
      { pct: 75, quiet: 600000, want: 'despair', why: 'the limit is the news, not the keyboard' },
      { pct: 95, quiet: 0, want: 'stunned' },
      { pct: 95, quiet: 600000, want: 'stunned', why: 'a blocked limit stops the replies anyway' }
    ];
    let axisDrawn = [];
    for (const step of AXIS) {
      push(step.pct, 40, null, step.quiet);
      axisDrawn.push(shown());
      ok('at ' + step.pct + '% with the last reply ' + (step.quiet === null ? 'never' : (step.quiet / 1000) + 's ago')
        + ' the crab is ' + step.want + (step.why ? ' (' + step.why + ')' : ''), shown() === step.want, 'drew ' + shown());
      advance(400);
    }
    // 7. THE SCENES, over that same table. Each row says which drawing is in which scene and which
    //    cell of the table that reaches. EVERY CELL IS REACHABLE NOW (2026-11-24): the working
    //    step's busy cell had no scene, so nothing anybody chose reached it. The rows at 55% are
    //    that cell: its own scene's default, the choice that now reaches it, and the two steps and
    //    columns beside it that the choice may NOT reach
    const SCENES = [
      { pct: 75, quiet: 0, slots: { burn: 'float' }, want: 'float', why: 'the burning scene, bought and worn' },
      { pct: 75, quiet: 600000, slots: { burn: 'float' }, want: 'float', why: 'both sides of that step, which has one picture' },
      { pct: 75, quiet: 0, want: 'despair', why: 'taken back out, and the drawing that was always there returns' },
      { pct: 4, quiet: 600000, slots: { burn: 'float' }, want: 'idle', why: 'the burning scene does not reach a quiet idle step' },
      { pct: 4, quiet: 0, slots: { burn: 'float' }, want: 'coding', why: 'nor a busy one' },
      { pct: 4, quiet: 0, slots: { typing: 'working' }, want: 'working', why: 'the typing scene IS the idle step\'s busy cell' },
      { pct: 4, quiet: 600000, slots: { typing: 'working' }, want: 'idle', why: 'and not its quiet one' },
      { pct: 55, quiet: 0, slots: { typing: 'working' }, want: 'working', why: 'the typing scene stops at the idle step:' },
      { pct: 55, quiet: 0, slots: { typing: 'coding' }, want: 'working', why: 'the working step has its own scene, whose default is the busy crab' },
      { pct: 55, quiet: 0, slots: { work: 'coding' }, want: 'coding', why: 'and THAT scene is what puts the laptop crab in this cell, which is what was asked for twice' },
      { pct: 55, quiet: 600000, slots: { work: 'coding' }, want: 'idle', why: 'and it reaches that cell only: the quiet side of the same step is the quiet scene' },
      { pct: 4, quiet: 0, slots: { work: 'coding', typing: 'working' }, want: 'working', why: 'nor the step below it, which is the typing scene and answers with what IT holds' },
      { pct: 55, quiet: 600000, slots: { quiet: 'idle' }, want: 'idle', why: 'its quiet cell is the quiet scene' },
      { pct: 95, quiet: 0, slots: { burn: 'float', typing: 'working' }, want: 'stunned', why: 'and the spent step is its own scene' }
    ];
    for (const step of SCENES) {
      push(step.pct, 40, null, step.quiet, step.slots);
      axisDrawn.push(shown());
      ok('at ' + step.pct + '%, ' + (step.quiet ? 'quiet' : 'busy') + ', with '
        + JSON.stringify(step.slots || {}) + ' the crab is ' + step.want
        + (step.why ? ' (' + step.why + ')' : ''), shown() === step.want, 'drew ' + shown());
      advance(400);
    }
    ok('all six drawings are reachable from the steps, the clock and the scenes together',
      new Set(axisDrawn.concat(drawn)).size === 6, [...new Set(axisDrawn.concat(drawn))].join(' '));
    // A CHOICE ALONE MOVES THE PICTURE. Nothing about the readings changes here: the same
    // percentage, the same stamp, one drawing swapped in one scene. This is also how a choice made
    // in ANOTHER window arrives, since what carries it is the push
    push(75, 40, null, 0); advance(400);
    ok('the burning step is the sinking crab', shown() === 'despair', shown());
    push(75, 40, null, 0, { burn: 'float' });
    ok('and the choice on its own turns it into the floating one, with the same beat as any change',
      shown() === 'float' && beating(), shown() + (beating() ? ' (beat)' : ' (no beat)'));
    advance(400);
    // the step is NOT what moved across the edge: the same reading, two drawings
    push(4, 40, null, 0); advance(400);
    const bodyBefore = doc.body.getAttribute('class');
    push(4, 40, null, 600000);
    ok('crossing the threshold changes the drawing and nothing about the state',
      shown() === 'idle' && beating() && doc.body.getAttribute('class') === bodyBefore,
      shown() + ' / ' + doc.body.getAttribute('class'));
    advance(400);
    // and the box follows the drawing, not the step: the bubble's tail is placed against the
    // drawing's top edge and coding, float and idle are three different edges (styles.js)
    push(4, 40, null, 0); advance(400);
    ok('the box says coding while the step is still idle', $('pm_mascot').getAttribute('data-state') === 'coding',
      $('pm_mascot').getAttribute('data-state'));
    push(4, 40, null, 600000); advance(400);
    ok('and says idle on the other side of the same step', $('pm_mascot').getAttribute('data-state') === 'idle',
      $('pm_mascot').getAttribute('data-state'));
    push(75, 40, null, 600000, { burn: 'float' }); advance(400);
    ok('and says float where the floating crab was put', $('pm_mascot').getAttribute('data-state') === 'float',
      $('pm_mascot').getAttribute('data-state'));

    // 4. the session's one showing
    ok('the Session bar is gone', !$('pm_session') && !$('s_pct') && !$('s_fill'));
    ok('three bars are left: weekly, fable, context',
      doc.querySelectorAll('#panelUsage .mbar').length === 3, String(doc.querySelectorAll('#panelUsage .mbar').length));
    ok('the ring is still the percentage', !!$('ringPct') && !!$('ringArc'));
    const sub = $('s_sub');
    ok('the time left in the window survived the bar', /left$/.test(sub.textContent) && /\d/.test(sub.textContent), sub.textContent);
    ok('and it reads under the ring, not somewhere else', !!$('pm_ring') && $('pm_ring').contains(sub));

    // 5. the two settings keys
    const shownBox = (id) => { const e = $(id); return !!e && e.style.display !== 'none'; };
    push(4, 40, ['session']);
    ok('hiding the session hides the ring and its countdown', !!$('pm_ring') && !shownBox('pm_ring'));
    ok('and leaves the crab alone', shownBox('pm_mascot'));
    push(4, 40, ['mascot']);
    ok('hiding the mascot hides the whole box, not just the picture',
      !!$('pm_mascot') && !shownBox('pm_mascot'), $('pm_mascot') && ($('pm_mascot').getAttribute('style') || ''));
    ok('and brings the ring back', shownBox('pm_ring'));
    // a list written before the two controls became one still says `ring`, and it meant this
    push(4, 40, ['ring']);
    ok('a setting that still says "ring" hides the ring', !shownBox('pm_ring'));
    const sessionBox = () => doc.querySelector('.pmk[data-k="session"]');
    ok('and the one switch that is left shows it as off', !!sessionBox() && !sessionBox().checked);

    // 6. AND IT IS NOT THE OTHER ACCOUNT. Everything the no-session state changes is reached
    //    through one class, so an account that HAS a window must never carry it, and the three
    //    pieces of wording that state rewrites have to read the way they always did
    push(42, 61);
    ok('a window means no no-session class on the body', !doc.body.classList.contains('no-session'), doc.body.getAttribute('class'));
    ok('the ring says "used", because the session is what it is drawing',
      doc.querySelector('.rtext').textContent === 'used', doc.querySelector('.rtext').textContent);
    ok('the tile is still "Active time"', $('st_time_lab').textContent === 'Active time', $('st_time_lab').textContent);
    ok('and it reads the window, not today', /^\dh \d\dm$/.test($('st_time').textContent), $('st_time').textContent);
    ok('the room HUD keeps its session piece and the dot before the week',
      !!$('wsHudS') && !!doc.querySelector('.ws-hud-sep') && /^5h 42%$/.test($('wsHudS').textContent),
      doc.querySelector('.ws-hud').textContent);
    // DETAILS IS WHERE IT HAS ALWAYS BEEN on this account: inside the Weekly bar's label. The ring
    // here is the SESSION, so a weekly control under it would point at the wrong number
    ok('Details is in the Weekly bar, and nothing has moved it',
      !!$('wkMore') && $('pm_weekly').contains($('wkMore')) && !$('pm_ring').contains($('wkMore'))
      && !$('wkMore').classList.contains('on-ring'),
      ($('wkMore').parentNode.getAttribute('class') || '') + ' ' + ($('wkMore').getAttribute('class') || ''));
    // a reading that has not landed yet is NOT "this account has none": one is waited for and the
    // other never comes, and they used to be the same em dash.
    // The count-up from the push above has to be let finish first: it owns #ringPct for 500ms and
    // would write the old figure over whatever these two pushes put there
    advance(600);
    toWebview({ type: 'data', data: Object.assign({}, base, { fh: null, sd: null, usageLoading: true }) });
    advance(20);
    ok('while the first call is still out, nothing is decided', !doc.body.classList.contains('no-session')
      && $('ringPct').textContent === '…', $('ringPct').textContent);
    toWebview({ type: 'data', data: Object.assign({}, base, { fh: null, sd: null, usageLoading: false }) });
    advance(20);
    ok('a call that came back with neither limit is a failure, not an account shape',
      !doc.body.classList.contains('no-session') && $('ringPct').textContent === '—', $('ringPct').textContent);

    // 7. THE FRESHNESS ROW. The only thing on this tab that is not live: the usage endpoint goes
    //    quiet on a 429, an expired token or a sign-out, and it does it without saying so. Three
    //    states and no fourth, which is what the dash was.
    const MIN = 60000;
    const head = () => $('uhead');
    const upd = () => $('upd').textContent;
    const freshness = (extra) => {
      toWebview({
        type: 'data',
        data: Object.assign({}, base, {
          fh: { used_percentage: 42, resets_at: resets() },
          sd: { used_percentage: 61, resets_at: resets() }
        }, extra)
      });
      advance(20);
    };
    ok('the tab does not say its own name back at the reader',
      !doc.querySelector('#panelUsage .it') && doc.querySelector('#panelUsage').textContent.indexOf('Usage summary') < 0);
    ok('and the class the other tabs head their sections with is untouched',
      !!doc.querySelector('#panelAgents .ihead .it') && !!$('uhead') && $('uhead').classList.contains('ihead'));
    freshness({ usageAt: Date.now() - 30000, usageLoading: false });
    ok('a reading from 30s ago says nothing at all', !head().classList.contains('stale')
      && !head().classList.contains('loading') && upd() === '', JSON.stringify(upd()));
    freshness({ usageAt: 0, usageLoading: true });
    ok('the first call still being out is a state of its own, with the live dot',
      head().classList.contains('loading') && !head().classList.contains('stale') && /Checking/.test(upd()), upd());
    freshness({ usageAt: Date.now() - 12 * MIN, usageLoading: false });
    ok('a reading twelve minutes old says how old it is', head().classList.contains('stale')
      && !head().classList.contains('loading') && /12m ago/.test(upd()), upd());
    // THE OLD DEFECT: a push happens every ten seconds whatever the endpoint is doing, and the
    // field used to be written from the age of that PUSH (refreshedAt), so it read "now" almost
    // always, including on a reading that had not moved in an hour. A push carrying a brand-new
    // refreshedAt and the same old reading may not make the row young again.
    // (The 1s tick itself cannot be driven here: the harness stubs setInterval. What pins the
    // single writer is the source-shape check in test/panel-css.test.js.)
    freshness({ usageAt: Date.now() - 12 * MIN, usageLoading: false, refreshedAt: Date.now() });
    ok('and a redraw does not make an old reading young: the panel refreshing is not an answer',
      head().classList.contains('stale') && /\d+m ago/.test(upd()), upd());
    // no stamp and not loading is the restored-reading case (extension.js, restoredUsageAt): an
    // age this window cannot state may not pass as a recent one
    freshness({ usageAt: 0, usageLoading: false });
    ok('a reading whose age cannot be stated is stale, not fresh',
      head().classList.contains('stale') && /not read yet/.test(upd()), upd());
    ok('nothing in this row ever draws a bare dash', upd().indexOf('—') < 0 && upd().indexOf('–') < 0, upd());
    freshness({ usageAt: Date.now(), usageLoading: false });
    ok('and an answer arriving takes the row away again',
      !head().classList.contains('stale') && !head().classList.contains('loading') && upd() === '', JSON.stringify(upd()));

    ok('no handler threw', h.errors.length === 0, h.errors.map((e) => e.message).join('; '));
}

// ---------------------------------------------------------------------------------------------
// the account with NO five-hour window (authenticated Ultra): the week is the only limit
// ---------------------------------------------------------------------------------------------
// WHAT IS PINNED HERE:
//   1. the state is told apart from "still loading" and from "the call failed", and it is carried
//      by ONE class. Six places used to decide it for themselves and five of them were wrong.
//   2. the ring draws the limit that actually binds the account, and SAYS which one it is.
//   3. the Active tile answers a question it can answer (today's span) and renames itself.
//   4. the crab can reach all four of its states, the point of the whole block. The weekly figure
//      goes in as a PACE, not raw, and the steps and the deadband are not touched: the same
//      percentage is a different picture early and late in the week, which is what a reader of a
//      weekly limit needs to know.
//   5. the room HUD drops the piece it cannot fill, and the separator with it.
function noSession(h) {
    const { ok, advance, doc, $, toWebview } = h;
    const nowS = () => Math.floor(Date.now() / 1000);
    const base = {
      agents: [], xp: {}, today: {}, count: 0, cfg: { panelHidden: [] },
      credits: { balance: 0, today: 0, frac: 0, perCredit: 10000, counting: false }
    };
    // THE HOST'S OWN SHAPE for this account: five_hour null, seven_day present (extension.js keeps
    // only the limits the account has). `left` is how much of the week is still to run, in days
    const push = (wk, left, extra) => {
      toWebview({
        type: 'data',
        data: Object.assign({}, base, {
          fh: null,
          sd: { used_percentage: wk, resets_at: nowS() + Math.round(left * DAY) },
          firstT: Date.now() - (4 * 3600 + 12 * 60) * 1000,
          last: { t: Date.now() - 60000 }
        }, extra || {})
      });
      advance(20);
    };
    const mascot = () => $('mascot');
    const shown = () => {
      const m = mascot(), src = m.getAttribute('src');
      return ['idle', 'working', 'despair', 'stunned', 'coding', 'float']
        .filter((s) => m.getAttribute('data-' + s) === src)[0] || src;
    };
    const beating = () => mascot().classList.contains('beat');

    // 1. the state, and the one class every rule for it hangs off
    push(18, 4.4);
    ok('an account with a week and no window is in the no-session state',
      doc.body.classList.contains('no-session'), doc.body.getAttribute('class'));
    ok('the weekly bar is still in the page, so the meters column still holds three',
      doc.querySelectorAll('#panelUsage .mbar').length === 3 && !!$('pm_weekly'),
      String(doc.querySelectorAll('#panelUsage .mbar').length));
    // It was hidden here for one release, on the reading that the ring now draws the same figure.
    // Fable (7d) stayed a bar, so what the reader got was a list of weekly limits with the main
    // one missing, and the owner reported the panel as broken twice. Nothing may hide it again.
    ok('and nothing hides it: no rule, no inline style',
      !/body\.no-session [^{]*#pm_weekly[^{]*\{[^}]*display\s*:\s*none/.test(doc.querySelector('style').textContent)
      && !/display:\s*none/.test($('pm_weekly').getAttribute('style') || ''),
      $('pm_weekly').getAttribute('style') || '(no inline style)');
    ok('and the row is centred, the same shape an account with a window gets',
      !/body\.no-session \.body\{align-items:flex-start;\}/.test(doc.querySelector('style').textContent));

    // 2. the ring draws the week, and says so
    ok('the ring is the weekly figure, not an empty donut', $('ringPct').textContent === '18', $('ringPct').textContent);
    ok('and it says which limit that is', doc.querySelector('.rtext').textContent === '7d used',
      doc.querySelector('.rtext').textContent);
    ok('the arc is drawn to the same circumference the session used (18% of 207.3)',
      Math.abs(parseFloat($('ringArc').style.strokeDashoffset) - 207.3 * 0.82) < 0.1,
      $('ringArc').style.strokeDashoffset);
    ok('the line under it counts the week down, not a window it does not have',
      /^4d\d+h left$/.test($('s_sub').textContent), $('s_sub').textContent);

    // 2b. AND THE WAY INTO THE WEEKLY SHEET STAYS WHERE IT HAS ALWAYS BEEN.
    //
    // #wkMore is the only entrance to it and it lives inside the weekly bar. While that bar was
    // hidden the script moved the button under the ring to keep the sheet reachable; with the bar
    // back there is one seat again, which is what a reader can learn once.
    ok('Details is on the screen, in the bar it names',
      !!$('wkMore') && $('pm_weekly').contains($('wkMore')) && !$('pm_ring').contains($('wkMore')),
      $('wkMore') ? ($('wkMore').parentNode.id || $('wkMore').parentNode.getAttribute('class')) : 'gone');
    ok('and it is the same button, with its listener and its name, not a second one drawn there',
      doc.querySelectorAll('.wk-more').length === 1
      && $('wkMore').title === 'This PC\'s use this week', doc.querySelectorAll('.wk-more').length + ' of them');
    // it opens the sheet, which is the whole point of it being reachable
    $('wkMore').click(); advance(20);
    ok('pressing it asks the host for the week and opens the sheet',
      !$('weeklyModal').hidden && h.sent('weeklyOpen').length === 1,
      ($('weeklyModal').hidden ? 'shut' : 'open') + ', ' + h.sent('weeklyOpen').length + ' ask(s)');
    $('wkClose').click(); advance(400);
    // the ring is a separate switch, and turning it off has nothing to do with this button now
    push(18, 4.4, { cfg: { panelHidden: ['session'] } });
    ok('turning the ring off leaves Details where it was',
      $('pm_weekly').contains($('wkMore')),
      $('wkMore').parentNode.getAttribute('class') || $('wkMore').parentNode.id);
    push(18, 4.4);

    // 3. the Active tile
    ok('the tile reads today\'s span, first message to last', $('st_time').textContent === '4h 11m', $('st_time').textContent);
    ok('and the label says that is what it is', $('st_time_lab').textContent === 'Active today', $('st_time_lab').textContent);
    ok('a day with nothing in it does not invent a span', (() => {
      push(18, 4.4, { firstT: 0, last: null });
      return $('st_time').textContent === '–';
    })(), $('st_time').textContent);

    // 4. THE CRAB, all four states.
    //
    // The expectations are written as the PACE a reader is on, not as the numbers in the code: a
    // pace of 1.0 spends the week exactly evenly and is the working line, 1.4 is despair and 1.8 is
    // stunned. With 4.4 days left of seven, an even spender would be at 37.14%, so each row below
    // is that times its pace. Nothing here knows what x50 is.
    const expected = (1 - 4.4 / 7) * 100;              // 37.1428…
    const at = (pace) => Math.round(expected * pace * 100) / 100;
    // This account is being used while it is read (the push above stamps the last message a minute
    // ago), so the busy column of MASCOT_ART is what these eight read down: the idle step is
    // `coding`. The pace is still what moves, which is the whole point of the walk.
    const walk = [
      { wk: at(0.97), want: 'coding', why: 'just under an even pace' },
      { wk: at(1.0), want: 'working', why: 'spending the week exactly evenly' },
      { wk: at(1.4), want: 'despair', why: 'on course to run out two days early' },
      { wk: at(1.8), want: 'stunned' },
      { wk: at(1.37), want: 'despair', why: 'the stun does not hold below its own edge' },
      { wk: at(1.35), want: 'despair', why: 'and despair holds inside its deadband' },
      { wk: at(1.31), want: 'working', why: 'three points below it does let go' },
      { wk: at(0.5), want: 'coding' }
    ];
    let drawn = [];
    for (const step of walk) {
      push(step.wk, 4.4);
      drawn.push(shown());
      ok('at ' + step.wk + '% of the week with 4.4 days left the crab is ' + step.want
        + (step.why ? ' (' + step.why + ')' : ''), shown() === step.want, 'drew ' + shown());
      advance(400);
    }
    ok('all four steps are reachable on an account with no session window',
      new Set(drawn).size === 4, drawn.join(' '));
    // and the activity axis works on this account too, off the same field: the step is a pace and
    // the column is a clock, so the two cannot be reading each other
    push(at(0.5), 4.4, { last: null }); advance(400);
    ok('a quiet week on a quiet day is the small crab', shown() === 'idle', shown());
    // and the scenes reach this account exactly as they reach the other one: the pace is what picks
    // the step and the step is what a scene hangs off.
    // THE PUSH NAMES FOUR OF THEM, which is this run's AN OLDER HOST: a window updated before the
    // fifth scene existed is pushed a set with no `work` in it, and every cell a scene is missing
    // for falls back to the table (webview.js, MASCOT_ART). Nothing read here is in that cell, so
    // the four are what this account needs and the fifth's absence is part of what is being checked
    push(at(1.4), 4.4, { shop: { owned: ['mascot:float'], slots: { quiet: 'idle', typing: 'coding', burn: 'float', spent: 'stunned' } } }); advance(400);
    ok('and the floating crab where the burning scene reaches, on this account too', shown() === 'float', shown());
    push(at(0.5), 4.4); advance(400);
    ok('and a reply landing brings the laptop back', shown() === 'coding', shown());
    // the same reading is a different picture depending on where in the week it is read, which is
    // the whole reason the raw percentage may not go in
    push(at(1.4), 4.4); advance(400);
    ok('52% four days from the reset is despair', shown() === 'despair', shown());
    push(at(1.4), 2.0); advance(400);
    ok('and the same 52% two days from it is the idle step, because that pace lands inside the week',
      shown() === 'coding', shown());
    // the first hours of a week: an even spender is at nearly 0%, so a pace has almost nothing to
    // divide by. Without the floor in mascotStrain this is a division blow-up and a stunned crab
    push(2, 7.0); advance(400);
    ok('2% in the first hour of the week is the idle step, not a crab stunned by arithmetic',
      shown() === 'coding', shown());
    // the weekly path that was already there, unchanged: a spent week stuns whatever the pace says
    push(100, 0.1);
    ok('a spent week still stuns', shown() === 'stunned', shown());
    // the reset: the figure drops to almost nothing and the window is nearly seven days wide again.
    // 5% in that first hour would still be working, because 5 is the floor the pace divides by and
    // a twentieth of a week spent in its first hour IS fast; 2% is the quiet morning after
    push(2, 6.9); advance(400);
    ok('and lets go when the week turns over', shown() === 'coding', shown());
    // the first push is a drawing and not a transition, on THIS account too, where the flag used
    // to hang off the session reading and so was never set
    push(at(1.8), 4.4);
    ok('a change of state still beats', beating(), mascot().getAttribute('class') || '');
    advance(400);

    // 5. the room HUD
    ok('the HUD drops the session piece it cannot fill', !$('wsHudS'));
    ok('and the dot that separated it from the week', !doc.querySelector('.ws-hud-sep'));
    ok('the week is still there, on its own', !!$('wsHudW') && /^7d \d+%$/.test($('wsHudW').textContent),
      doc.querySelector('.ws-hud').textContent);
    // and it comes BACK: the nodes are kept rather than dropped, because a push carrying a window
    // has to be able to put them where they were. Appending would leave the dot after the week
    toWebview({
      type: 'data',
      data: Object.assign({}, base, {
        fh: { used_percentage: 42, resets_at: nowS() + 2 * HOUR },
        sd: { used_percentage: 61, resets_at: nowS() + 3 * DAY }
      })
    });
    advance(20);
    ok('a push that does carry a window puts both back, in order',
      doc.querySelector('.ws-hud').textContent === '5h 42%·7d 61%', doc.querySelector('.ws-hud').textContent);
    ok('and the no-session class is gone with them', !doc.body.classList.contains('no-session'),
      doc.body.getAttribute('class'));

    ok('no handler threw', h.errors.length === 0, h.errors.map((e) => e.message).join('; '));
}

// ---------------------------------------------------------------------------------------------
// the drawing with no scene: it turns up on its own, and everything about it is WHEN IT MAY NOT
// ---------------------------------------------------------------------------------------------
// Everything else on this tab is drawn by a push. This is the one thing the page decides, so it is
// also the one place where "nothing happened" is the assertion that matters. What is pinned:
//
//   1. IT CANNOT BE SUMMONED. Nothing is sent to the host while one runs, no credit moves, and the
//      only input is a clock: a reader who spends more tokens does not get more of them.
//   2. IT GOES AWAY. The file loops for ever, so the panel is what ends it, and four seconds later
//      whatever the account's real state is, is back on screen.
//   3. IT NEVER COVERS BAD NEWS. Not at despair, not at stunned, and not under a raised burn-rate
//      bubble, however the coin falls. This is the half that would be expensive to get wrong: the
//      crab is the only thing on the panel that says the limit is gone.
//   4. AN EMPTY ROW MEANS NEVER. That is the whole of the off switch, so it has to be absolute.
//   5. IT MOVES NOTHING. The box is a fixed height and the picture goes in it; nothing is given an
//      inline style and the keyboard is not touched.
//
// The page's coin is seeded here (h.setRandom), because a test of "now and then" that waited on
// chance is a test that fails on some runs. Always-wins and never-wins are both run.
function cameo(h) {
  const { ok, advance, doc, $, toWebview, setRandom } = h;
  const WORN = { quiet: 'idle', typing: 'coding', work: 'working', burn: 'despair', spent: 'stunned' };
  const DRAWINGS = ['idle', 'working', 'despair', 'stunned', 'coding', 'float', 'sleep', 'blackhole'];
  const mascot = () => $('mascot');
  const shown = () => {
    const m = mascot(), src = m.getAttribute('src');
    return DRAWINGS.filter((s) => m.getAttribute('data-' + s) === src)[0] || src;
  };
  const resets = () => Math.floor(Date.now() / 1000) + 3 * HOUR;
  // one push. `pool` is what the HOST resolved (shop.js, randomPool), never a choice, and `burn`
  // raises the burn-rate bubble by handing the page a spike against a small average
  const push = (sess, pool, burn) => {
    toWebview({
      type: 'data',
      data: {
        agents: [], xp: {}, today: {}, count: burn ? 10 : 0, cfg: { panelHidden: [] },
        credits: { balance: 0, today: 0, frac: 0, perCredit: 10000, counting: false },
        fh: { used_percentage: sess, resets_at: resets() },
        sd: { used_percentage: 10, resets_at: resets() },
        last: { t: Date.now() },
        avg: burn ? 100 : 0, peak: burn ? { total: 1000, t: Date.now() } : null,
        shop: { owned: [], slots: WORN, pool: pool || [] }
      }
    });
    advance(20);
  };
  // how many DIFFERENT seconds in a stretch had the cameo on screen, and the longest unbroken run
  // of them, both counted a second at a time so a showing that overran would be visible as a
  // number rather than as a missing assertion
  const watchFor = (secs) => {
    let on = 0, run = 0, longest = 0, gapsOk = true, lastEnd = null, shortestGap = Infinity;
    for (let i = 0; i < secs; i++) {
      advance(1000);
      if (shown() === 'blackhole') {
        if (!run && lastEnd != null) {
          const gap = i - lastEnd;
          if (gap < 300) gapsOk = false;
          if (gap < shortestGap) shortestGap = gap;
        }
        on++; run++; if (run > longest) longest = run;
      } else {
        if (run) lastEnd = i;
        run = 0;
      }
    }
    return { on, longest, gapsOk, shortestGap };
  };

  // ---------- 1. the floor, counted from the panel OPENING ----------
  // A coin rigged to win every single second, straight after the first push. Even then the first
  // five minutes are silent: the floor is counted from a panel opening as well as from the last
  // showing, so the first thing a reader is shown is never this
  setRandom(() => 0);
  push(10, ['blackhole']);
  ok('the crab starts as the account’s own state, not as a gimmick', shown() === 'coding', shown());
  ok('a winning coin still shows nothing in the first five minutes a panel is open',
    watchFor(290).on === 0, 'in the first 290s');
  ok('and then the floor is out and it turns up', watchFor(60).on > 0);

  // ---------- 2. a coin that never wins ----------
  setRandom(() => 0.999);
  push(10, ['blackhole']);
  const w = watchFor(7200);
  ok('two hours of a coin that never wins show nothing at all', w.on === 0, w.on + ' second(s) of it');

  // ---------- 3. how long one lasts, and how close two may be ----------
  setRandom(() => 0);
  const run = watchFor(1200);
  ok('and then it does turn up', run.on > 0, run.on + ' second(s) of it in twenty minutes');
  // IT GOES AWAY. Four seconds is five whole loops of the drawing; a file that loops for ever and
  // a panel that never took it off would leave the crab as a vortex until the next push
  ok('and it is gone again four seconds later, never longer', run.longest === 4,
    'longest showing ' + run.longest + 's');
  ok('and two of them are never closer together than five minutes', run.gapsOk,
    'shortest gap ' + (run.shortestGap === Infinity ? 'n/a' : run.shortestGap + 's'));
  ok('the account’s own drawing is what is on screen the rest of the time', shown() === 'coding', shown());
  // 1. NOTHING IS SENT AND NOTHING IS OWED. The host is not told, so there is nothing to pay for
  // and nothing to win: the only input is the clock
  ok('nothing was sent to the host for any of it',
    h.sent('mascotPool').length === 0 && h.sent('shop').length === 0 && h.sent('mascotSlot').length === 0,
    JSON.stringify(h.hostLog.map((l) => l.type).filter((t, i, a) => a.indexOf(t) === i)));
  // 5. IT MOVES NOTHING. The box is a fixed height in the stylesheet and the picture is fitted into
  // it, so a showing may not put a length on anything
  ok('and nothing was given a size of its own, so the card cannot have moved',
    !$('pm_mascot').getAttribute('style') && !mascot().getAttribute('style'),
    ($('pm_mascot').getAttribute('style') || '') + ' / ' + (mascot().getAttribute('style') || ''));
  ok('and the keyboard was left where it was', doc.activeElement === doc.body,
    doc.activeElement && doc.activeElement.localName);

  // ---------- 4. where it may not go ----------
  // THE TWO STEPS WHERE THE DRAWING IS THE MESSAGE. A vortex over "the limit is used up" replaces
  // a warning with a joke, and the coin is rigged to win every second here
  push(95, ['blackhole']);
  ok('at a spent limit the crab is the one that says so', shown() === 'stunned', shown());
  let bad = watchFor(3600);
  ok('and an hour of a winning coin never covers it', bad.on === 0, bad.on + ' second(s) of it');
  push(75, ['blackhole']);
  ok('at a limit mostly gone the crab is the one that says so', shown() === 'despair', shown());
  bad = watchFor(3600);
  ok('and an hour of a winning coin never covers that either', bad.on === 0, bad.on + ' second(s) of it');
  // ...AND NOT UNDER A RAISED BUBBLE. That one is geometry rather than taste: the bubble's tail is
  // placed against the top of the ink of whatever is under it (styles.js, .mwarn), so swapping the
  // picture would point the tail at nothing
  push(10, ['blackhole'], true);
  ok('a burn-rate spike raises the bubble over the crab', !$('mwarn').hidden, 'hidden=' + $('mwarn').hidden);
  bad = watchFor(3600);
  ok('and nothing may go under it while it is up', bad.on === 0, bad.on + ' second(s) of it');
  // and the moment it comes down, the same account is open to one again
  push(10, ['blackhole']);
  ok('the bubble comes down with the spike', $('mwarn').hidden, 'hidden=' + $('mwarn').hidden);
  ok('and then one may turn up again', watchFor(1800).on > 0);

  // ---------- 5. the off switch ----------
  // Emptying the row is the whole of it, and it is a press on the drawing itself (the shop's last
  // row). Off has to mean never, or it is not an off switch
  push(10, []);
  const off = watchFor(7200);
  ok('an empty row means nothing ever turns up, however the coin falls', off.on === 0,
    off.on + ' second(s) of it in two hours');
  // and one that is running when the row is emptied in ANOTHER window goes away with it
  push(10, ['blackhole']);
  for (let i = 0; i < 400 && shown() !== 'blackhole'; i++) advance(1000);
  ok('one is on screen to interrupt', shown() === 'blackhole', shown());
  push(10, []);
  ok('and switching the row off in another window takes it off this screen at once',
    shown() === 'coding', shown());

  ok('no handler threw', h.errors.length === 0, h.errors.map((e) => e.message).join('; '));
}
