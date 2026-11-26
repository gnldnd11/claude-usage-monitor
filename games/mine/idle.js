// WHAT THE CRAB DOES WHEN THERE IS NOTHING TO HIT.
//
// THE GAP WAS NOT ENOUGH, AND THAT IS A READING AND NOT A GUESS. Until now the whole of "the work
// has stopped" was the crab standing 12.6px back from the face with rock showing in between
// (games/mine/meta.js, .mn-drift.rest), and the argument for it was that it is a STATE rather
// than a switch: nothing turns grey, nothing is drawn that was not already there, and a reader
// who asked for less motion keeps it. All of that still holds. What it does not survive is the
// MOMENT: a swing that was running at 1,760ms stops between one frame and the next, and from then
// on nothing on the band moves at all. A screen on which nothing moves is a screen that has
// crashed -- that is what the reader said about it, in those words -- and a 12.6px gap is not a
// loud enough answer to carry an entire still picture.
//
// SO TWO DRAWINGS, AND EACH HAS ONE JOB.
//
//   the drop    THE MOMENT. It beads at the head and falls, once, as the work stops. It is the
//               beat that says the swing ENDED rather than froze, and it is over in 760ms: a
//               thing that is still falling a minute later is a loop and says nothing about when
//   the bubble  THE STATE. It pops up after the drop has gone and stays for as long as the window
//               is quiet, with three dots breathing in it. That breathing is the whole point --
//               it is the one pixel on this band still moving, so "waiting" and "crashed" are no
//               longer the same picture
//
// THE BUBBLE MAY MOVE AND THE REST OF THE BAND MAY NOT, and those two rules do not collide. The
// band's rule is that ONE thing turns at a time (docs/mine-mockup/spec.md), and at rest the count
// of things turning is zero: the swing is off, the camera is parked, the grit is cleared and the
// bite has healed. The dots are the one, and the moment a push arrives the bubble is gone before
// the first frame of the swing is drawn.
//
// NO WORD IS ADDED. Three dots are not an ellipsis, they are three squares that take turns, and
// the band is role="img" with its own aria-label, so nothing in here reaches the reader of a
// screen reader at all. The panel still prints no sentence (games/mine/panel.js).
//
// AND NOTHING HERE IS A NEW COLOUR. The bubble is cream on ink, which is the pick's own keyline
// and the hole's own floor, and the drop is steel in an ink ring, which is the grit's exact
// prescription (games/mine/tools.js) and is argued there against every face of this wall.
//
// NO SEMICOLON AND NO BRACE may appear in the SVG strings, for games/mine/ore.js's reason: they
// are spliced into a stylesheet and test/panel-css.test.js parses it by splitting on those two.
'use strict';
const { C, uri } = require('./ore');

// --- the bubble -----------------------------------------------------------------------------------
//
// 26x20 UNITS AT 26x20 PIXELS, so a unit is a pixel and the corners are whole ones. The viewBox is
// pulled out by 1 on every side because the outline is a 2-wide stroke centred on the path, and
// the half that falls outside the silhouette has to have somewhere to land or it is clipped off.
//
// THE CORNERS ARE CUT AND NOT ROUNDED. Two pixels off each one, drawn as two straight segments:
// a border-radius at this size is three shades of anti-aliased cream and reads as a smudge, and
// the strip beneath it is whole pixels (games/mine/tools.js draws its tool the same way).
//
// THE TAIL POINTS DOWN AND RIGHT, at the crab's head, which is where the speaker is: the bubble
// stands over the crab's left shoulder because that is the only part of this band with room in it
// (the face is 11.9px to the crab's right at rest and that gap is the resting signal itself, so
// nothing may be drawn in it). It is a straight triangle rather than a curl, for the corners'
// reason.
const BUBBLE = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='-1 -1 28 22'>"
  + "<path d='M2 0 L24 0 L24 2 L26 2 L26 13 L24 13 L24 15 L22 15 L22 19 L18 15 L2 15 L2 13"
  + " L0 13 L0 2 L2 2 Z' fill='" + C.cream + "' stroke='" + C.ink
  + "' stroke-width='2' stroke-linejoin='miter'/>"
  + '</svg>';

// --- the drop -------------------------------------------------------------------------------------
//
// 7x10, AND IT WAS 5x7 FIRST. That one was rendered beside the crab at full resolution and it is
// a dust speck: 5px of which 2 are the ring leaves a 3px core, and at that size the shape is a
// dot rather than a drop, so what the eye gets is a stray pixel on the rock. Seven across leaves
// a 4px core with a point on it, which is the smallest thing on this band that still reads as a
// drop. Two paths and no stroke -- an ink silhouette with the body inside it -- because a 1px
// stroke on a drawing this size is a grey haze rather than a line.
//
// CREAM AND NOT steel, for the same rendering. The grit is steel because it is stone, and this is
// not stone: beside a cream bubble a grey drop reads as a chip that failed to fly. Cream is the
// brightest thing in the palette and that is the point of it here -- the drop has 760ms to be
// seen at all, and it crosses from the dark hole onto the crab's own shell on the way down, which
// is most of this panel's range in one fall. The ink ring is what holds it over both (4.58:1 on
// the brightest rock), which is the grit's argument and the same prescription.
const DROP = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 7 10'>"
  + "<path d='M3.5 0 L6.3 4.7 L7 7.3 L5.2 10 L1.8 10 L0 7.3 L0.7 4.7 Z' fill='" + C.ink + "'/>"
  + "<path d='M3.5 2.3 L5.3 5.5 L5.7 7.3 L4.5 8.9 L2.5 8.9 L1.3 7.3 L1.7 5.5 Z' fill='"
  + C.cream + "'/>"
  + '</svg>';

// --- when ------------------------------------------------------------------------------------------
//
// THE DROP IS 760ms AND THE BUBBLE WAITS 380 OF THEM. The order is the story: the work stops, the
// crab sweats, and THEN it settles in to wait. Reversed, the bubble is already up while the drop
// is still falling and the two read as one busy instant rather than as a sequence.
//
// NONE OF THESE IS MN_DIG. Every other millisecond on this band is one swing at the current rung
// (games/mine/panel.js), and it has to be: the grit, the step and the bite are parts OF a swing.
// These two are not. They happen because the swinging has stopped, so there is no rung to ride --
// the rung is zero, which is the whole reason they are on screen.
const DROP_MS = 760;
const BUB_MS = 420;
const BUB_WAIT = 380;
// ...and the dots. 1,500ms each with a third of a beat between them, which is slow enough to read
// as breathing rather than as a progress bar. step-end, because the crab beside them is drawn in
// whole frames and a smoothly dimming dot is a dot from another screen
const DOT_MS = 1500;
const DOT_GAP = 180;
// ...and how long the claw comes up for when a step is bought while the window is quiet. It is
// the longest figure in this file on purpose: it is the only sight of a thing that was paid for,
// and it has to outlast a reader's glance back at the button they just pressed
const LIFT_MS = 1400;

const CSS = `  /* THE BUBBLE. Inside .mn-dig, so it steps back the 12.6px with the crab rather than hanging
     where the crab used to be -- the same reason the pick is in that box (games/mine/meta.js).
     Every figure below is where the drawing lands AFTER that step.
     WHERE IT STANDS, and there was one place available. The band is 72px tall, the crab's shell
     tops out at y20.4 and the hole's ceiling is at y12, so there are 20 pixels of air above the
     head and 8 of them are inside the hole: a 22px bubble fits there and nowhere else. To the
     crab's left there is 9.2px of floor at a 250px sidebar, which is not a bubble, and to its
     right is the gap at the face, which is the resting signal and may not be drawn in.
     SO IT OVERLAPS THE UNDUG ROCK, and the 2px ink outline is what carries it there: cream on the
     brightest wall is 3.3:1 and the outline is 4.58:1 on the same wall, so the shape holds its
     edge whatever the grain is doing underneath it (games/mine/tools.js, the grit's measurement).
     opacity 0 AND NOT hidden, because what brings it in is an animation and an element that is
     display:none has nothing to animate */
  .mn-wait{position:absolute;left:calc(40% - 42.4px);top:0;width:28px;height:22px;z-index:6;
    opacity:0;pointer-events:none;background-image:url("${uri(BUBBLE)}");
    background-repeat:no-repeat;background-position:0 0;background-size:28px 22px;}
  /* ...AND IT IS A STATE, so .rest alone is what sets it standing. The animation is the pop and
     the pop is a luxury: take it away (reduced motion, below) and the bubble is simply there,
     which is the same bargain the gap at the face already makes */
  .mn-drift.rest .mn-wait{opacity:1;animation:mnWaitIn ${BUB_MS}ms ${BUB_WAIT}ms ease-out 1 both;}
  /* a pop with a small overshoot, from the tail: a bubble that grows out of the crab's head is
     coming FROM the crab, and one that fades in is a thing that was always there */
  @keyframes mnWaitIn{
    0%{opacity:0;transform:translate(4px,6px) scale(.5);}
    65%{opacity:1;transform:translate(0,0) scale(1.1);}
    100%{opacity:1;transform:translate(0,0) scale(1);}
  }
  /* THE THREE DOTS, 3px squares of ink on the cream. They are elements and not part of the drawing
     above because they take turns, and three turns is three delays */
  .mn-wait i{position:absolute;top:7px;width:3px;height:3px;background:${C.ink};}
  .mn-wait i:nth-child(1){left:7px;}
  .mn-wait i:nth-child(2){left:13px;}
  .mn-wait i:nth-child(3){left:19px;}
  .mn-drift.rest .mn-wait i{animation:mnWaitDot ${DOT_MS}ms step-end infinite;}
  .mn-drift.rest .mn-wait i:nth-child(1){animation-delay:${BUB_WAIT}ms;}
  .mn-drift.rest .mn-wait i:nth-child(2){animation-delay:${BUB_WAIT + DOT_GAP}ms;}
  .mn-drift.rest .mn-wait i:nth-child(3){animation-delay:${BUB_WAIT + DOT_GAP * 2}ms;}
  /* .28 AND NOT 0. A dot that goes out leaves a gap in the row and the three read as one dot
     walking from side to side. Held at a quarter they are three dots, one of which is lit */
  @keyframes mnWaitDot{
    0%{opacity:.28;}
    22%{opacity:1;}
    44%{opacity:.28;}
  }
  /* THE DROP, which is the only thing in this file the panel has to arm by hand: it plays ONCE as
     the work stops, so there is no class that is simply true for as long as the state lasts.
     IT FALLS ACROSS THE HEAD AND NOT INTO THE GAP. It beads at y14, which is in the dark hole
     above the shell, and lands at y26, which is on the shell itself. The gap at the face is 11.9px
     of rock to the crab's right and nothing is ever drawn there, resting being the one thing that
     band of rock says */
  /* A STEP BOUGHT WHILE NOBODY IS WORKING, WHICH IS WHEN IT IS BOUGHT. The rung is the WINDOW's
     (webview.js, driveStep) and this screen is opened because a reply is slow, so the band a
     reader is looking at while they press Upgrade is almost always the resting one. With the tool
     down, the one thing 12,500 credits changes is a drawing nobody can see: the number on the
     button goes up and the band does not move. That was measured on a render at band 4, step 440,
     and the resting picture was identical to bare hands at step 1.
     SO THE CLAW COMES UP FOR ONE BEAT. The new tool, at its new band, under its new light, for
     1,400ms, and then it goes back down and the crab is resting again. This is not the resting
     state blinking: it is the purchase being shown, in the only place the purchase is visible.
     NO TIMER AND NO FILL, which is what lets the panel leave the class on (games/mine/panel.js,
     mnLift). The last stop is opacity 0 and there is no fill, so when it is over the base rule
     above is what is in force again -- the tool is down because resting is what is true, not
     because something took a class off in time.
     IT IS NOT UNDER THE MOTION QUERY. A tool held up for a second and then put down is an opacity
     step and not a movement, and it is the only drawing of a thing the reader just paid for: a
     reader who asked for less motion did not ask to stop being shown what they bought */
  .mn-drift.rest .mn-pick.lift{animation:mnLift ${LIFT_MS}ms linear 1;}
  /* linear AND NOT step-end, which every other curve in this file is. The strip's whole-frame
     habit is about things that are drawn beside the crab's own sixteen frames, and this is the
     tool going up and coming down the way it does when the window goes quiet: the 160ms fade on
     .mn-pick is the same movement and the two have to agree (games/mine/meta.js). 10% of 1,400 is
     140ms up and the last 20% is 280ms down */
  @keyframes mnLift{
    0%{opacity:0;}
    10%{opacity:1;}
    80%{opacity:1;}
    100%{opacity:0;}
  }
  .mn-sweat{position:absolute;left:calc(40% - 9.4px);top:11px;width:7px;height:10px;z-index:5;
    opacity:0;pointer-events:none;background-image:url("${uri(DROP)}");
    background-repeat:no-repeat;background-position:0 0;background-size:7px 10px;}
  .mn-sweat.drip{animation:mnSweat ${DROP_MS}ms ease-in 1 both;}
  /* it swells where it beads, then goes. The last stop is opacity 0 at the bottom of the fall and
     not a landing, because a drop that stops on the shell is a drop that is still there */
  @keyframes mnSweat{
    0%{opacity:0;transform:translateY(-2px) scale(.4);}
    22%{opacity:1;transform:translateY(0) scale(1);}
    78%{opacity:1;transform:translateY(9px) scale(1);}
    100%{opacity:0;transform:translateY(14px) scale(.9);}
  }
  /* REDUCED MOTION KEEPS THE BUBBLE AND LOSES THE DROP, and the split is the same one the whole of
     section 8 makes: the bubble is a STATE (the window is quiet) and survives, the pop, the
     breathing and the fall are MOVEMENT and do not. .mn-drift.rest .mn-wait sets opacity 1 in its
     own right for exactly this -- take the animation away and the bubble is still standing.
     THE DROP IS NOTHING BUT ITS FALL, so what is left of it with the animation gone is its base
     opacity 0, which is absent. That is correct and not a loss: the moment it draws is a moment,
     and a reader who asked for less motion has the gap and the bubble for the state */
  @media (prefers-reduced-motion:reduce){
    .mn-drift.rest .mn-wait,.mn-drift.rest .mn-wait i,.mn-sweat.drip{animation:none;}
  }`;

module.exports = { CSS, BUBBLE, DROP, DROP_MS, BUB_MS, BUB_WAIT, DOT_MS, DOT_GAP, LIFT_MS };
