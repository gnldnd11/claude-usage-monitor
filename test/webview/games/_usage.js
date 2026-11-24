// The Usage tab: the crab's one axis, and what is left of the session.
//
// Not a game, so the file is named for what it is, beside _agents.js and _chrome.js for the reason
// those give: the harness reads one directory and a mode is one page, one script, one process.
//
// WHAT THE CRAB IS NOW (2026-11-24). It used to be a LIMIT times a CLOCK: how much of the five-hour
// window was gone (or, on an account with no window, the pace the week was being spent at) picked a
// row of a four-by-two table, and whether a reply had landed in the last three minutes picked the
// column. That product does not name anything: 72% of a window that resets in four hours drew a
// crab in despair with nothing running at all. It is ONE LADDER WITH FIVE RUNGS now, and the rung
// is picked by `drive` (drive.js), which is the last hour of replies priced and decayed over the
// rate that would spend the week evenly. 1.0 is working at exactly the pace the week allows.
//
// WHAT IS PINNED HERE, and why each one cost something to get wrong:
//   1. THE LADDER, walked up and down over every edge. Entered at its figure and left at 0.8 of it,
//      which is one dial and not three: a fixed number of points has no meaning on a ratio.
//   2. AND A FLOOR ON HOW LONG A DRAWING STAYS. The deadband alone still let 26 of 268 changes
//      happen inside a minute, and a crab that changes twice in a minute reads as a fault. The one
//      transition exempt from it is the one out of quiet, which is the asymmetry the product wants.
//   3. BOTH ACCOUNT SHAPES WALK THE SAME LADDER. The account with a five-hour window and the one
//      without used to reach the crab through different arithmetic; they reach it through the same
//      field now, because the transcripts are the same on both. So the walk is written ONCE below
//      and both modes run it: two copies would be one copy fixed.
//   4. NO LIMIT REACHES THE CRAB. The ring, the bars, the tiles, the HUD and the wording are all
//      still limits and all still exactly where they were. What holds the two apart in the source
//      is test/panel-css.test.js section 2b; what is checked here is that the readings still draw
//      everything they always drew while the crab ignores them.
//   5. the first push is a drawing, not a transition: no beat on first paint. And it does not wait
//      on the network any more, because `drive` is read off the transcripts.
//   6. a transition is a beat, and the beat ends. A class left on would keep the sprite pressed.
//   7. the session has ONE showing. The bar and the ring were the same number, the bar is gone,
//      and the time left in the window, which only the bar carried, is under the ring.
//   8. the settings key that hides the session hides the ring, and the one that hides the mascot
//      hides its BOX (the box has a height of its own, so hiding the picture alone would leave a
//      hole where the crab was).
//   9. AND WHICH DRAWING IS IN WHICH RUNG. The shop sells drawings into five scenes (shop.js,
//      SLOTS) and this ladder has five rungs with the same five names, so the map between them is
//      the identity. That is the thing to get wrong: a scene that reaches no rung is a choice
//      nobody can see, and one that reaches two is a choice that flattens them together. Every
//      scene is therefore walked against every rung below, not just against its own.
//
// THE SECOND MODE, `usage-nosession`, is the account that has no five-hour window at all: an
// authenticated Ultra, where the host pushes five_hour: null for ever (2026-10-30). Half of this
// tab was drawn from that missing reading, so the ring was an empty donut with a bar through it and
// the Active tile drew a bare dash. What that mode still pins is in its own section; the crab's
// half of it is gone, because the crab no longer knows which account it is looking at.
'use strict';

const HOUR = 3600;
const DAY = 86400;

// THE RUNGS, as the page names them, and what each one draws when the reader has chosen nothing
// (webview.js, MASCOT_ART). The names are the shop's scene ids, which is the whole point of them
const RUNGS = ['quiet', 'typing', 'work', 'burn', 'spent'];
const FALLBACK = { quiet: 'idle', typing: 'coding', work: 'working', burn: 'despair', spent: 'stunned' };
// A drive that lands on each rung FROM ANYWHERE, deadband included: 2.5 is above 2.0 and below
// 2.64, 3.5 is above 3.3 and below 4.0, and 6 is above 5.0. So a rung can be asked for without the
// asking depending on which rung the page was standing on, which is what keeps the scenes section
// below about the scenes
const DRIVE_AT = { quiet: 0, typing: 0, work: 2.5, burn: 3.5, spent: 6 };
const DWELL = 60000;        // webview.js, DWELL_MS
const QUIET = 300000;       // webview.js, QUIET_MS

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
// THE LADDER, written once and run by both account shapes
// ---------------------------------------------------------------------------------------------
// `push(drive, opts)` is the mode's own: it decides what account shape the readings describe, and
// this decides nothing about the account at all. `opts` carries `quiet` (no reply for longer than
// the threshold), `quietFor` (an age in ms) and `slots` (which drawing is in which scene, as the
// HOST resolved it -- shop.js, wornSlots -- never as a choice).
//
// EVERY STEP SKIPS THE FLOOR FIRST. The floor is a minute of wall clock and the harness's own clock
// stands still (table.test.js, h.skipAhead), so a walk that did not step over it would measure the
// floor thirteen times and the ladder not once. The floor has a section of its own below.
function ladder(h, push, shown, mascot) {
  const { ok, advance, skipAhead } = h;
  const beating = () => mascot().classList.contains('beat');
  // THE INK LIFT FOLLOWS THE DRAWING, not the element. Some of the six carry ink that is the same
  // colour as a dark floor and some do not, so the page lifts the ones that do and leaves the rest
  // exactly as drawn (html.js, INK_LIFT; styles.js, .ink-lift). The wanted set is read off the page
  // rather than written here: panel-css.test.js is what checks that list against the PNGs, and this
  // checks that the class actually tracks it as the drawing changes.
  const WANTS_LIFT = (mascot().getAttribute('data-lift') || '').split(' ').filter(Boolean);
  const lifted = () => mascot().classList.contains('ink-lift');
  const step = (drive, opts) => { skipAhead(DWELL); push(drive, opts); };

  // 1. A walk up and down over every edge. The readings just inside and just outside an edge are the
  // whole point, so they are written as the drive a real hour produces rather than as the figures in
  // the code. Everything here lands while replies ARE arriving (the push stamps the last one as
  // having just landed), so the bottom rung is not reached by any of them: the bottom rung is
  // "nothing is being answered", and the last two rows are how it is reached.
  const was = shown();
  const walk = [
    { drive: 0.4, want: 'coding', why: 'a reply is landing and the machine is barely busy' },
    { drive: 1.99, want: 'coding', why: 'a hundredth under the line' },
    { drive: 2.0, want: 'working', why: 'and on it the limit is not what changed, the work is' },
    { drive: 1.7, want: 'working', why: 'the deadband holds it there' },
    { drive: 1.59, want: 'coding', why: '0.8 of the line is where it comes off' },
    { drive: 3.3, want: 'despair', why: 'two rungs in one push is one change' },
    { drive: 2.7, want: 'despair', why: 'inside its own lower edge' },
    { drive: 2.6, want: 'working', why: 'and a hundredth under it, back a rung' },
    { drive: 5.0, want: 'stunned', why: 'flat out' },
    { drive: 4.1, want: 'stunned', why: 'the top rung holds at 0.8 of its own line' },
    { drive: 3.9, want: 'despair' },
    { drive: 0, want: 'coding', why: 'the work stopped, but a reply landed a moment ago' },
    { drive: 0, quiet: true, want: 'idle', why: 'and five minutes on, none has' }
  ];
  // WHERE A BEAT BELONGS IS DERIVED, not listed: it is exactly where the drawing changes, which is
  // the rule, and a listed flag would be a second copy of this table that could disagree with it.
  // The sequence starts at whatever was on screen when this was called, because the two modes reach
  // the ladder from different places and the first row is a change in one of them and not the other
  const seq = [was].concat(walk.map((w) => w.want));
  const drawn = [];
  let beats = 0;
  for (let i = 0; i < walk.length; i++) {
    const s = walk[i];
    const wantBeat = seq[i + 1] !== seq[i];
    step(s.drive, { quiet: s.quiet });
    drawn.push(shown());
    const beat = beating();
    if (beat) beats++;
    ok('at a drive of ' + s.drive + (s.quiet ? ' with nothing answering' : '') + ' the crab is '
      + s.want + (s.why ? ' (' + s.why + ')' : ''), shown() === s.want, 'drew ' + shown());
    // the box says which drawing is in it, because the drawing's top edge moves with its ratio and
    // the burn-rate bubble is placed against that edge (styles.js, .mascot-wrap[data-state])
    const box = h.$('pm_mascot');
    ok('  and the box says which drawing it holds', !!box && box.getAttribute('data-state') === s.want,
      box && box.getAttribute('data-state'));
    ok('  and it ' + (wantBeat ? 'beats' : 'does not beat') + ' there', beat === wantBeat);
    ok('  and the ink lift is ' + (WANTS_LIFT.indexOf(s.want) >= 0 ? 'on' : 'off') + ' for it',
      lifted() === (WANTS_LIFT.indexOf(s.want) >= 0),
      s.want + ' -> class ' + mascot().getAttribute('class'));
    advance(400); // let the beat finish before the next push arms another one
  }
  ok('the walk covered a lifted drawing and an unlifted one',
    drawn.some((s) => WANTS_LIFT.indexOf(s) >= 0) && drawn.some((s) => WANTS_LIFT.indexOf(s) < 0),
    'lift list ' + WANTS_LIFT.join(' ') + ' | drew ' + [...new Set(drawn)].join(' '));
  ok('a walk over every edge changed the drawing exactly as often as the rung changed',
    drawn.join(' ') === walk.map((s) => s.want).join(' '), drawn.join(' '));
  const changes = seq.filter((s, i) => i > 0 && s !== seq[i - 1]).length;
  ok('and beat once per change and never otherwise', beats === changes,
    'beats ' + beats + ' of ' + changes + ' changes');
  ok('every rung of the ladder is reachable', new Set(drawn).size === RUNGS.length, drawn.join(' '));

  // 2. THE FLOOR. The deadband above cuts jitter in the READING; this cuts churn in the DRAWING,
  // and they are not the same thing: a reading that walks 2.1 -> 1.5 -> 2.1 inside a minute is three
  // honest readings and one drawing
  skipAhead(DWELL); push(0.4); advance(400);
  ok('a settled crab is on the rung its drive says', shown() === 'coding', shown());
  push(6);
  ok('and a reading four rungs up inside the minute does not move it', shown() === 'coding', shown());
  ok('nor does it beat, because nothing changed', !beating(), mascot().getAttribute('class') || '');
  skipAhead(DWELL); push(6);
  ok('a minute on, the same reading lands', shown() === 'stunned', shown());
  advance(400);
  // ...AND A READING THE FLOOR REFUSED LEAVES NOTHING BEHIND, which is the fault that two memories
  // caused. The deadband used to be remembered separately from the drawing and written on every
  // push, so one dip the floor hid took it down a rung and the drawing followed a minute later with
  // the drive sitting on ONE figure the whole time. The floor had not suppressed that dip, it had
  // postponed it, which is the exact thing it is there to stop.
  //
  // 2.8 is above the burning rung's own lower edge (0.8 x 3.3 = 2.64), so a crab that is burning at
  // 2.8 stays burning at 2.8, and a single 2.5 in between may not change that a minute later
  skipAhead(DWELL); push(3.5); advance(400);
  ok('a crab on the burning rung', shown() === 'despair', shown());
  push(2.5);                       // one dip under the lower edge, inside the floor
  ok('one dip under the edge inside the minute does not move it', shown() === 'despair', shown());
  push(2.8);                       // ...and back above it, still inside the floor
  ok('and nor does coming back above the edge', shown() === 'despair', shown());
  skipAhead(DWELL); push(2.8);
  ok('and a minute later 2.8 is still inside the burning rung, because the dip left nothing behind',
    shown() === 'despair', shown());
  advance(400);
  // the edge itself still works from there, so what was fixed was the memory and not the deadband
  push(2.6);
  ok('a reading that really is under the edge still comes off the rung', shown() === 'working', shown());
  advance(400);

  // ...AND THE ONE TRANSITION THAT IS EXEMPT. Typing shows at once and stopping is noticed slowly,
  // which is the same asymmetry the quiet threshold itself is built on: a reader who comes back to
  // the keyboard must not watch a minute of the wrong crab
  skipAhead(DWELL); push(0.4, { quiet: true }); advance(400);
  ok('nothing answering for five minutes is the bottom rung', shown() === 'idle', shown());
  push(0.4);
  ok('and a reply landing a second later is not made to wait out the floor',
    shown() === 'coding' && beating(), shown() + (beating() ? ' (beat)' : ' (no beat)'));
  advance(400);

  // ...and the threshold itself, in both directions. It is a clock and not a reading, so it has no
  // deadband to walk and what is walked is the edge (webview.js, QUIET_MS)
  const edge = [
    { quietFor: 0, want: 'coding', why: 'a reply just landed' },
    { quietFor: QUIET - 1000, want: 'coding', why: 'a second inside the threshold is still working' },
    { quietFor: QUIET + 1000, want: 'idle', why: 'and a second past it is not' },
    { quietFor: null, want: 'idle', why: 'a day with no reply at all is quiet' },
    { quietFor: 0, want: 'coding', why: 'and typing again is an event, not a wait' }
  ];
  for (const s of edge) {
    step(0.4, { quietFor: s.quietFor });
    ok('with the last reply ' + (s.quietFor === null ? 'never' : (s.quietFor / 1000) + 's ago')
      + ' the crab is ' + s.want + ' (' + s.why + ')', shown() === s.want, 'drew ' + shown());
    advance(400);
  }
  // THE BOTTOM RUNG IS THE BOTTOM RUNG, not an overlay: a machine working flat out that stops
  // answering is quiet, and that is the one thing the old two-axis table could not say. Its top two
  // rows drew the same picture on both sides of the clock, so heavy work and a silent machine were
  // one drawing
  step(6, {}); advance(400);
  ok('a machine flat out is the top rung', shown() === 'stunned', shown());
  step(6, { quiet: true });
  ok('and the same reading with nothing answering is quiet, which the old table could not say',
    shown() === 'idle', shown());
  advance(400);

  // A HOST OLDER THAN THIS PAGE pushes no drive at all, and the page may not then draw whatever it
  // was drawing before for ever: no figure to stand on is the bottom of the ladder, and the clock
  // is still an answer
  step(0.4, { noDrive: true }); advance(400);
  ok('a push with no drive in it still answers the clock', shown() === 'coding', shown());
  step(0.4, { noDrive: true, quiet: true }); advance(400);
  ok('and still goes quiet when nothing is answering', shown() === 'idle', shown());

  // 9. THE SCENES. Each rung IS a scene (shop.js, SLOTS) and the map between them is the identity,
  // so what is walked is every scene against every rung: the probe drawing shows on the one rung
  // whose scene it was put in and on no other. A scene that reached nothing is a choice nobody can
  // see; one that reached two rungs is a choice that flattens them together, which is what the
  // table this replaced actually did for a release.
  //
  // The probe is `float`, which is no rung's own drawing, so there is never a rung where "it showed"
  // and "it was already there" are the same thing. It is pushed into scenes the shop would not sell
  // it into as well: the page draws what the host resolved and does not second-guess it, and that is
  // the property being checked
  const scened = [];
  for (const scene of RUNGS) {
    for (const at of RUNGS) {
      const slots = {};
      slots[scene] = 'float';
      step(DRIVE_AT[at], { quiet: at === 'quiet', slots: slots });
      scened.push(shown());
      const want = at === scene ? 'float' : FALLBACK[at];
      ok('the ' + scene + ' scene ' + (at === scene ? 'IS' : 'does not reach') + ' the ' + at + ' rung',
        shown() === want, 'drew ' + shown() + ', wanted ' + want);
      advance(400);
    }
  }
  // ...and a host that pushes no scenes at all (a window updated before one of them existed) falls
  // back to the rung's own drawing rather than to nothing
  for (const at of RUNGS) {
    step(DRIVE_AT[at], { quiet: at === 'quiet', slots: null, noSlots: true });
    ok('with no scenes pushed, the ' + at + ' rung is its own drawing', shown() === FALLBACK[at],
      'drew ' + shown());
    advance(400);
  }
  ok('all six drawings are reachable from the ladder and the scenes together',
    new Set(drawn.concat(scened)).size === 6, [...new Set(drawn.concat(scened))].join(' '));

  // A CHOICE ALONE MOVES THE PICTURE, with no reading having moved: the same drive, the same stamp,
  // one drawing swapped in one scene. This is also how a choice made in ANOTHER window arrives,
  // since what carries it is the push
  step(3.5, {}); advance(400);
  ok('the burning rung is the sinking crab', shown() === 'despair', shown());
  push(3.5, { slots: { burn: 'float' } });
  ok('and the choice on its own turns it into the floating one, with the same beat as any change',
    shown() === 'float' && beating(), shown() + (beating() ? ' (beat)' : ' (no beat)'));
  advance(400);
  // THE FLOOR DOES NOT HOLD A CHOICE BACK, and that is deliberate: the floor is about a reading
  // that will not settle, and a reader pressing a button in the shop is not a reading
  push(3.5, {});
  ok('and taking it back out is immediate too, floor or no floor', shown() === 'despair', shown());
  advance(400);
}

// ---------------------------------------------------------------------------------------------
// the account WITH a five-hour window (Pro, Max)
// ---------------------------------------------------------------------------------------------
function withWindow(h) {
    const { ok, advance, doc, $, toWebview, skipAhead, pageNow } = h;
    const base = {
      agents: [], xp: {}, today: {}, count: 0, cfg: { panelHidden: [] },
      credits: { balance: 0, today: 0, frac: 0, perCredit: 10000, counting: false }
    };
    // RESETS ARE READ OFF THE PAGE'S CLOCK, not the harness's: the walk above steps that clock over
    // the drawing floor a minute at a time, and a reset stamped from a clock that did not move would
    // crawl towards the page's present
    const resets = () => Math.floor(pageNow() / 1000) + 3 * HOUR + 50 * 60;
    // every scene filled, which is what the HOST resolves and pushes (shop.js, wornSlots). The page
    // is handed answers and never a choice
    const WORN = { quiet: 'idle', typing: 'coding', work: 'working', burn: 'despair', spent: 'stunned' };
    // One push of the host's own message. `drive` is the crab's whole axis; `sess` and `wk` are the
    // two limits, which everything on this tab EXCEPT the crab is drawn from
    const push = (drive, opts) => {
      opts = opts || {};
      const quietFor = opts.quiet ? QUIET + 1000 : (opts.quietFor === undefined ? 0 : opts.quietFor);
      const data = Object.assign({}, base, {
        cfg: { panelHidden: opts.hidden || [] },
        fh: opts.sess === null ? null : { used_percentage: opts.sess == null ? 42 : opts.sess, resets_at: resets() },
        sd: opts.wk === null ? null : { used_percentage: opts.wk == null ? 40 : opts.wk, resets_at: resets() },
        last: quietFor === null ? null : { t: pageNow() - quietFor },
        shop: {
          owned: opts.slots && opts.slots.burn === 'float' ? ['mascot:float'] : [],
          slots: opts.noSlots ? {} : Object.assign({}, WORN, opts.slots || {})
        }
      });
      if (!opts.noDrive) data.drive = drive;
      toWebview({ type: 'data', data: data });
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

    // 5. THE FIRST PAINT IS A DRAWING AND NOT A TRANSITION, and it has already happened: the page
    // was loaded and the HOST's own first push arrived before this mode ran (table.test.js). That
    // push carried a drive, because a drive is read off the transcripts and not off the network, so
    // the crab is already on a rung -- and it did not beat getting there.
    //
    // IT USED TO BE OTHERWISE, and that is as much of the change as anything on this tab. The crab
    // was measured against the usage endpoint's reading, so in this lane (a temp HOME with no
    // credentials) the host pushes both limits as null for ever and the crab sat undrawn until a
    // mode pushed it a reading by hand. On a real machine that was a crab waiting on the network,
    // and waiting for ever on a 429 or an expired token
    ok('the crab was already drawn by the page’s own first push, and did not beat getting there',
      !beating(), mascot().getAttribute('class') || '');
    ok('and this lane has no transcripts, so that first drawing is the bottom rung',
      shown() === 'idle', shown());

    // 1, 2, 9: the ladder. The same walk the other account shape runs
    ladder(h, push, shown, mascot);

    // 6. the beat ends on its own, and it is the only thing the script does to the picture: a
    //    crossfade or a filter on pixel art smears it, so neither may be written here
    skipAhead(DWELL);
    push(6);               // push() itself advances 20ms past the message
    ok('a change presses the sprite', beating());
    advance(135);          // 155ms in
    ok('and it is still pressed just before 160ms', beating());
    advance(10);           // 165ms in
    ok('and let back up at 160ms', !beating(), mascot().getAttribute('class'));
    ok('nothing fades or filters the crab', !mascot().style.opacity && !mascot().style.filter);
    ok('a crab flat out can be poked', mascot().title === 'poke' && mascot().style.cursor === 'pointer');

    // 4. AND NO LIMIT MOVES IT. The readings that used to decide the crab are walked over the whole
    //    range they can take, including the two that used to stun it outright, with the drive held
    //    still: a spent week and a spent window are news the bars and the ring carry, and a machine
    //    that is not being worked is not a crab on its back. A limit wired back into this axis fails
    //    here and in test/panel-css.test.js section 2b
    const held = shown();
    for (const limits of [{ sess: 0, wk: 0 }, { sess: 99, wk: 40 }, { sess: 4, wk: 100 }, { sess: 100, wk: 100 }]) {
      push(6, limits);
      ok('a session at ' + limits.sess + '% and a week at ' + limits.wk + '% draw the same crab',
        shown() === held, 'drew ' + shown() + ', wanted ' + held);
      advance(400);
    }
    // ...and the same, held at the bottom of the ladder: a spent week used to stun outright, which
    // is the one of these that was not merely a mapping but a branch of its own
    skipAhead(DWELL); push(0.4, { sess: 4, wk: 100 }); advance(400);
    ok('a spent week over an idle machine is the machine, not the week', shown() === 'coding', shown());
    push(0.4, { sess: 4, wk: 40 });
    ok('and the week turning over changes nothing, because it was never what was drawn',
      shown() === 'coding' && !beating(), shown());
    advance(400);

    // 7. the session's one showing
    ok('the Session bar is gone', !$('pm_session') && !$('s_pct') && !$('s_fill'));
    ok('three bars are left: weekly, fable, context',
      doc.querySelectorAll('#panelUsage .mbar').length === 3, String(doc.querySelectorAll('#panelUsage .mbar').length));
    ok('the ring is still the percentage', !!$('ringPct') && !!$('ringArc'));
    const sub = $('s_sub');
    ok('the time left in the window survived the bar', /left$/.test(sub.textContent) && /\d/.test(sub.textContent), sub.textContent);
    ok('and it reads under the ring, not somewhere else', !!$('pm_ring') && $('pm_ring').contains(sub));

    // 8. the two settings keys
    const shownBox = (id) => { const e = $(id); return !!e && e.style.display !== 'none'; };
    push(0.4, { hidden: ['session'] });
    ok('hiding the session hides the ring and its countdown', !!$('pm_ring') && !shownBox('pm_ring'));
    ok('and leaves the crab alone', shownBox('pm_mascot'));
    push(0.4, { hidden: ['mascot'] });
    ok('hiding the mascot hides the whole box, not just the picture',
      !!$('pm_mascot') && !shownBox('pm_mascot'), $('pm_mascot') && ($('pm_mascot').getAttribute('style') || ''));
    ok('and brings the ring back', shownBox('pm_ring'));
    // a list written before the two controls became one still says `ring`, and it meant this
    push(0.4, { hidden: ['ring'] });
    ok('a setting that still says "ring" hides the ring', !shownBox('pm_ring'));
    const sessionBox = () => doc.querySelector('.pmk[data-k="session"]');
    ok('and the one switch that is left shows it as off', !!sessionBox() && !sessionBox().checked);

    // 4b. AND IT IS NOT THE OTHER ACCOUNT. Everything the no-session state changes is reached
    //     through one class, so an account that HAS a window must never carry it, and the three
    //     pieces of wording that state rewrites have to read the way they always did
    push(0.4, { sess: 42, wk: 61 });
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
    toWebview({ type: 'data', data: Object.assign({}, base, { fh: null, sd: null, usageLoading: true, drive: 0.4 }) });
    advance(20);
    ok('while the first call is still out, nothing is decided', !doc.body.classList.contains('no-session')
      && $('ringPct').textContent === '…', $('ringPct').textContent);
    // ...AND THE CRAB IS ALREADY DRAWN, which is new. It used to wait on that call and sit on its
    // first drawing until the usage endpoint answered, for ever on a 429 or an expired token. The
    // drive is read off the transcripts, so a panel with no reading from the network still answers
    ok('and the crab is already on its rung, because its own reading does not come from the network',
      shown() === 'coding', shown());
    toWebview({ type: 'data', data: Object.assign({}, base, { fh: null, sd: null, usageLoading: false, drive: 0.4 }) });
    advance(20);
    ok('a call that came back with neither limit is a failure, not an account shape',
      !doc.body.classList.contains('no-session') && $('ringPct').textContent === '—', $('ringPct').textContent);
    ok('and it is still not the crab’s business', shown() === 'coding', shown());

    // 10. THE FRESHNESS ROW. The only thing on this tab that is not live: the usage endpoint goes
    //     quiet on a 429, an expired token or a sign-out, and it does it without saying so. Three
    //     states and no fourth, which is what the dash was.
    // THE AGES ARE STAMPED FROM THE PAGE'S CLOCK, not the harness's: the ladder above stepped that
    // clock over the drawing floor more than thirty times, and a stamp taken from a clock that did
    // not move with it would read as an hour old before this section asked anything
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
    freshness({ usageAt: pageNow() - 30000, usageLoading: false });
    ok('a reading from 30s ago says nothing at all', !head().classList.contains('stale')
      && !head().classList.contains('loading') && upd() === '', JSON.stringify(upd()));
    freshness({ usageAt: 0, usageLoading: true });
    ok('the first call still being out is a state of its own, with the live dot',
      head().classList.contains('loading') && !head().classList.contains('stale') && /Checking/.test(upd()), upd());
    freshness({ usageAt: pageNow() - 12 * MIN, usageLoading: false });
    ok('a reading twelve minutes old says how old it is', head().classList.contains('stale')
      && !head().classList.contains('loading') && /12m ago/.test(upd()), upd());
    // THE OLD DEFECT: a push happens every ten seconds whatever the endpoint is doing, and the
    // field used to be written from the age of that PUSH (refreshedAt), so it read "now" almost
    // always, including on a reading that had not moved in an hour. A push carrying a brand-new
    // refreshedAt and the same old reading may not make the row young again.
    // (The 1s tick itself cannot be driven here: the harness stubs setInterval. What pins the
    // single writer is the source-shape check in test/panel-css.test.js.)
    freshness({ usageAt: pageNow() - 12 * MIN, usageLoading: false, refreshedAt: pageNow() });
    ok('and a redraw does not make an old reading young: the panel refreshing is not an answer',
      head().classList.contains('stale') && /\d+m ago/.test(upd()), upd());
    // no stamp and not loading is the restored-reading case (extension.js, restoredUsageAt): an
    // age this window cannot state may not pass as a recent one
    freshness({ usageAt: 0, usageLoading: false });
    ok('a reading whose age cannot be stated is stale, not fresh',
      head().classList.contains('stale') && /not read yet/.test(upd()), upd());
    ok('nothing in this row ever draws a bare dash', upd().indexOf('—') < 0 && upd().indexOf('–') < 0, upd());
    freshness({ usageAt: pageNow(), usageLoading: false });
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
//   4. THE CRAB WALKS THE SAME LADDER AS EVERY OTHER ACCOUNT, which is the whole of this section
//      now. It used to walk a mapping of its own: the weekly percentage went in as a PACE, because
//      50% of a week on day four is on course and 50% of a five-hour window is halfway through the
//      afternoon. That mapping is gone with the axis it fed. Nothing about this account's shape
//      reaches the crab, so the walk is the shared one and this mode's only job is to run it on a
//      push with `fh: null` in it.
//   5. the room HUD drops the piece it cannot fill, and the separator with it.
function noSession(h) {
    const { ok, advance, doc, $, toWebview, pageNow } = h;
    const nowS = () => Math.floor(pageNow() / 1000);
    const base = {
      agents: [], xp: {}, today: {}, count: 0, cfg: { panelHidden: [] },
      credits: { balance: 0, today: 0, frac: 0, perCredit: 10000, counting: false }
    };
    const WORN = { quiet: 'idle', typing: 'coding', work: 'working', burn: 'despair', spent: 'stunned' };
    // THE HOST'S OWN SHAPE for this account: five_hour null, seven_day present (extension.js keeps
    // only the limits the account has). `left` is how much of the week is still to run, in days
    const pushWeek = (wk, left, extra) => {
      toWebview({
        type: 'data',
        data: Object.assign({}, base, {
          fh: null,
          sd: { used_percentage: wk, resets_at: nowS() + Math.round(left * DAY) },
          drive: 0.4,
          firstT: pageNow() - (4 * 3600 + 12 * 60) * 1000,
          last: { t: pageNow() - 60000 }
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

    // 1. the state, and the one class every rule for it hangs off
    pushWeek(18, 4.4);
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
    pushWeek(18, 4.4, { cfg: { panelHidden: ['session'] } });
    ok('turning the ring off leaves Details where it was',
      $('pm_weekly').contains($('wkMore')),
      $('wkMore').parentNode.getAttribute('class') || $('wkMore').parentNode.id);
    pushWeek(18, 4.4);

    // 3. the Active tile
    ok('the tile reads today\'s span, first message to last', $('st_time').textContent === '4h 11m', $('st_time').textContent);
    ok('and the label says that is what it is', $('st_time_lab').textContent === 'Active today', $('st_time_lab').textContent);
    ok('a day with nothing in it does not invent a span', (() => {
      pushWeek(18, 4.4, { firstT: 0, last: null });
      return $('st_time').textContent === '–';
    })(), $('st_time').textContent);

    // 4. THE CRAB, on the same ladder as every other account. This mode's push is the one thing
    //    that differs: `fh` is null and the week is the only limit, and neither of those reaches it
    const push = (drive, opts) => {
      opts = opts || {};
      const quietFor = opts.quiet ? QUIET + 1000 : (opts.quietFor === undefined ? 0 : opts.quietFor);
      const data = Object.assign({}, base, {
        cfg: { panelHidden: opts.hidden || [] },
        fh: null,
        sd: { used_percentage: opts.wk == null ? 18 : opts.wk, resets_at: nowS() + Math.round(4.4 * DAY) },
        firstT: pageNow() - (4 * 3600 + 12 * 60) * 1000,
        last: quietFor === null ? null : { t: pageNow() - quietFor },
        shop: {
          owned: opts.slots && opts.slots.burn === 'float' ? ['mascot:float'] : [],
          slots: opts.noSlots ? {} : Object.assign({}, WORN, opts.slots || {})
        }
      });
      if (!opts.noDrive) data.drive = drive;
      toWebview({ type: 'data', data: data });
      advance(20);
    };
    ladder(h, push, shown, mascot);
    // ...and the week is not what is drawn, at either end of it. A spent week used to stun outright
    // and the pace it was being spent at used to BE the rung: both of those are gone with the axis
    const held = shown();
    for (const wk of [0, 19, 65, 99, 100]) {
      push(3.5, { wk: wk });
      ok('a week at ' + wk + '% draws the crab the work says, not the week', shown() === held,
        'drew ' + shown() + ', wanted ' + held);
      advance(400);
    }
    // and the body class the rest of this mode hangs off is still on, so none of that was a window
    ok('and all of that happened on the account with no window', doc.body.classList.contains('no-session'),
      doc.body.getAttribute('class'));

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
        drive: 0.4,
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
//   3. IT NEVER COVERS BAD NEWS, and WHICH news that is was re-read when the axis changed
//      (2026-11-24). Not at the top rung and not under a raised burn-rate bubble, however the coin
//      falls. The top rung is a machine flat out, which is the one state the reader cannot have
//      missed noticing, and a joke over it is a joke at the worst moment to make one. The rung below
//      is open. Both halves are walked below, because the one that stayed shut is the expensive one.
//   4. AN EMPTY ROW MEANS NEVER. That is the whole of the off switch, so it has to be absolute.
//   5. IT MOVES NOTHING. The box is a fixed height and the picture goes in it; nothing is given an
//      inline style and the keyboard is not touched.
//   6. AND IT IS NOT SPENT WHERE NOBODY CAN SEE IT. The crab is in the Usage tab and the settings
//      sheet can hide its box, and a showing that started with either one true burned its four
//      seconds and the floor behind it in front of nobody: a reader who had bought a drawing for the
//      pool and left it on reported never once having seen it. Starting is gated on the crab being
//      visible, and ONLY starting, so one already on screen is not snatched away by a tab press.
//
// THE FLOOR IS SIX MINUTES, not four: it has to stay longer than the quiet threshold so a cameo can
// never be the SECOND thing that changes the crab inside one quiet transition, and that threshold
// was recounted at five (webview.js, QUIET_MS and CAMEO_FLOOR). Every count below is against 360.
//
// The page's coin is seeded here (h.setRandom), because a test of "now and then" that waited on
// chance is a test that fails on some runs. Always-wins and never-wins are both run, and so are
// the two coins either side of the odds themselves, which is how the rarity is pinned without
// averaging anything.
function cameo(h) {
  const { ok, advance, doc, $, toWebview, setRandom, skipAhead, pageNow } = h;
  const FLOOR = 360;
  const WORN = { quiet: 'idle', typing: 'coding', work: 'working', burn: 'despair', spent: 'stunned' };
  const DRAWINGS = ['idle', 'working', 'despair', 'stunned', 'coding', 'float', 'sleep', 'blackhole'];
  const mascot = () => $('mascot');
  const shown = () => {
    const m = mascot(), src = m.getAttribute('src');
    return DRAWINGS.filter((s) => m.getAttribute('data-' + s) === src)[0] || src;
  };
  const resets = () => Math.floor(pageNow() / 1000) + 3 * HOUR;
  // one push. `drive` picks the rung (drive.js), `pool` is what the HOST resolved (shop.js,
  // randomPool) and never a choice, and `burn` raises the burn-rate bubble by handing the page a
  // spike against a small average.
  // THE DRAWING FLOOR IS STEPPED OVER ON EVERY PUSH (webview.js, DWELL_MS): the pushes here change
  // the rung and the harness's own clock stands still, so without this the second one would be
  // refused and every count below would be measured on the wrong rung
  const push = (drive, pool, burn, hidden) => {
    skipAhead(DWELL);
    toWebview({
      type: 'data',
      data: {
        agents: [], xp: {}, today: {}, count: burn ? 10 : 0, cfg: { panelHidden: hidden || [] },
        credits: { balance: 0, today: 0, frac: 0, perCredit: 10000, counting: false },
        drive: drive,
        fh: { used_percentage: 20, resets_at: resets() },
        sd: { used_percentage: 10, resets_at: resets() },
        last: { t: pageNow() },
        avg: burn ? 100 : 0, peak: burn ? { total: 1000, t: pageNow() } : null,
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
          if (gap < FLOOR) gapsOk = false;
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
  // A coin rigged to win every single second, straight after the first push. Even then the first six
  // minutes are silent: the floor is counted from a panel opening as well as from the last showing,
  // so the first thing a reader is shown is never this.
  // BOTH SIDES OF IT ARE WALKED, because only a pair of assertions says where the floor is: 350
  // silent seconds and then one inside the next 20 puts it at 360 and nowhere else
  setRandom(() => 0);
  push(0.4, ['blackhole']);
  ok('the crab starts as the account’s own state, not as a gimmick', shown() === 'coding', shown());
  ok('a winning coin still shows nothing in the first six minutes a panel is open',
    watchFor(FLOOR - 10).on === 0, 'in the first ' + (FLOOR - 10) + 's');
  ok('and the floor is out at six minutes, not seven', watchFor(20).on > 0, 'by ' + (FLOOR + 10) + 's');

  // ---------- 2. a coin that never wins ----------
  setRandom(() => 0.999);
  push(0.4, ['blackhole']);
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
  ok('and two of them are never closer together than the floor', run.gapsOk,
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
  // THE ONE RUNG WHERE THE DRAWING IS THE MESSAGE. A vortex over a machine flat out replaces the one
  // state the reader cannot have missed noticing with a joke, and the coin is rigged to win every
  // second here
  push(6, ['blackhole']);
  ok('at the top rung the crab is the one that says so', shown() === 'stunned', shown());
  let bad = watchFor(3600);
  ok('and an hour of a winning coin never covers it', bad.on === 0, bad.on + ' second(s) of it');
  // ...AND THE RUNG BELOW IT IS OPEN. It was shut while the rung meant a LOAD of 70 and the reason
  // given was that a load is not a limit; on this axis it is a reader working hard, which is not an
  // emergency either, so the conclusion outlived the argument that reached it
  push(3.5, ['blackhole']);
  ok('at a heavy drive the crab is the one the rung says', shown() === 'despair', shown());
  const heavy = watchFor(1200);
  ok('and one may turn up over it, because working hard is not working flat out',
    heavy.on > 0, heavy.on + ' second(s) of it in twenty minutes');
  ok('still four seconds and no longer, at that rung like any other', heavy.longest === 4,
    'longest showing ' + heavy.longest + 's');
  for (let i = 0; i < 10 && shown() === 'blackhole'; i++) advance(1000);
  ok('and the rung’s own drawing is what is back when it ends', shown() === 'despair', shown());
  // ...AND NOT UNDER A RAISED BUBBLE. That one is geometry rather than taste: the bubble's tail is
  // placed against the top of the ink of whatever is under it (styles.js, .mwarn), so swapping the
  // picture would point the tail at nothing
  push(0.4, ['blackhole'], true);
  ok('a burn-rate spike raises the bubble over the crab', !$('mwarn').hidden, 'hidden=' + $('mwarn').hidden);
  bad = watchFor(3600);
  ok('and nothing may go under it while it is up', bad.on === 0, bad.on + ' second(s) of it');
  // and the moment it comes down, the same account is open to one again
  push(0.4, ['blackhole']);
  ok('the bubble comes down with the spike', $('mwarn').hidden, 'hidden=' + $('mwarn').hidden);
  ok('and then one may turn up again', watchFor(1800).on > 0);

  // ---------- 5. the off switch ----------
  // Emptying the row is the whole of it, and it is a press on the drawing itself (the shop's last
  // row). Off has to mean never, or it is not an off switch
  push(0.4, []);
  const off = watchFor(7200);
  ok('an empty row means nothing ever turns up, however the coin falls', off.on === 0,
    off.on + ' second(s) of it in two hours');
  // and one that is running when the row is emptied in ANOTHER window goes away with it
  push(0.4, ['blackhole']);
  for (let i = 0; i < 600 && shown() !== 'blackhole'; i++) advance(1000);
  ok('one is on screen to interrupt', shown() === 'blackhole', shown());
  push(0.4, []);
  ok('and switching the row off in another window takes it off this screen at once',
    shown() === 'coding', shown());

  // ---------- 6. not where nobody can see it ----------
  // The crab is in the Usage tab (html.js, #pm_mascot) and the settings sheet can hide its box, and
  // a showing under either one is four seconds and a floor spent in front of nobody. THE FLOOR IS
  // WALKED OFF FIRST with a coin that cannot win, so what every assertion below measures is the
  // start being refused and not the floor still being in the way
  setRandom(() => 0.999);
  push(0.4, ['blackhole']);
  watchFor(FLOOR - 60);                           // all but a minute of the floor served, nothing shown
  setRandom(() => 0);                             // and now a coin that wins every second
  $('hdCredits').click(); advance(5);
  ok('the games area is open, so the crab is not on screen', !h.showing('panelUsage'),
    'panelUsage display=' + ($('panelUsage').style.display || '(shown)'));
  let away = watchFor(1800);
  ok('half an hour of a winning coin on another tab shows nothing at all', away.on === 0,
    away.on + ' second(s) of it');
  // AND THE FLOOR WAS NEITHER RESET NOR FILLED IN BY THE TIME AWAY. 60 seconds is a sixth of the
  // floor, so one turning up inside them says the seconds served before the tab press were kept,
  // and the half hour away adding nothing is the assertion above
  $('tabUsage').click(); advance(5);
  ok('and back on the tab the crab is on, the very same coin shows one at once', watchFor(60).on > 0,
    'in 60s back on the tab, a sixth of the floor');
  // that one is let finish before the next thing is measured. One already on screen runs out its own
  // four seconds wherever the reader goes (section 6's last pair below is what pins that), so a
  // showing still running here would spend its last seconds inside the next assertion's count and
  // the number it reported would be about the wrong rule
  for (let i = 0; i < 10 && shown() === 'blackhole'; i++) advance(1000);
  // THE SETTINGS KEY IS THE SAME LOSS. It hides the box, not the picture, so this is read on the
  // box; the tab is unchanged here
  push(0.4, ['blackhole'], false, ['mascot']);
  ok('the box is hidden from settings', $('pm_mascot').style.display === 'none',
    'display=' + $('pm_mascot').style.display);
  away = watchFor(1800);
  ok('and a hidden box shows nothing either, however the coin falls', away.on === 0,
    away.on + ' second(s) of it');
  push(0.4, ['blackhole']);
  ok('the box is back', $('pm_mascot').style.display !== 'none');
  // and the count picks up where it paused rather than being reset or filled in. The showing that
  // ended before the box was hidden put it back to zero, so this is the whole floor again
  ok('and so is the chance of one', watchFor(FLOOR + 60).on > 0, 'in the floor plus a minute');
  // ONLY STARTING IS GATED. One already on screen runs out its four seconds wherever the reader
  // goes: its end is its own business, and snatching it away on a tab press would be a second rule
  // about the same four seconds
  push(0.4, ['blackhole']);
  for (let i = 0; i < 600 && shown() !== 'blackhole'; i++) advance(1000);
  ok('one is on screen to walk away from', shown() === 'blackhole', shown());
  $('hdCredits').click(); advance(5);
  ok('pressing a tab does not snatch it off the screen behind you', shown() === 'blackhole', shown());
  advance(5000);
  ok('and it still ends on its own four seconds, not when the tab comes back',
    shown() === 'coding', shown());
  $('tabUsage').click(); advance(5);

  // ---------- 7. the odds themselves ----------
  // A boundary and not a mood. `Math.random() * CAMEO_ODDS >= 1` wins below 1/ODDS, so a coin just
  // inside the odds turns one up and a coin just outside them never does: two assertions that pin
  // 400 from both sides without averaging chance, which is the thing that makes a test flaky
  setRandom(() => 1 / 500);                       // inside 1/400. Outside 1/900, which is what it was
  push(0.4, ['blackhole']);
  ok('a coin just inside the odds turns one up', watchFor(FLOOR + 240).on > 0, 'in the floor plus four minutes');
  setRandom(() => 1 / 350);                       // outside 1/400 by as little
  push(0.4, ['blackhole']);
  ok('and a coin just outside them never does, however long you wait', watchFor(3600).on === 0,
    'in an hour');

  ok('no handler threw', h.errors.length === 0, h.errors.map((e) => e.message).join('; '));
}
