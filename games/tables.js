// The driver every round-based game runs on: bet, play, settle once.
//
// Blackjack and High-Low were near-identical blocks in extension.js, and so was every card game
// written beside them. What actually differed between them was five things: the engine, the word for
// one round, the phase that counts as live, what a live round has riding on it, and whether anything
// carries from one round to the next. Those are the spec below; everything else is here, once.
//
// The rules this driver exists to keep (they are the ones reviews check):
//   - the host owns the round. The webview sends a bet, a selection and an action, nothing else
//   - a round settles exactly ONCE: only the move that turns the phase to 'done' records it
//   - the reply goes out BEFORE the data push, so the header balance never beats the cards
//   - a stake is only measured against the balance minus what the other games have riding
//     (deps.budget), because a stake does not leave the balance until its round settles
//   - EVERY message gets exactly one reply, an engine that throws included. A message with no
//     reply is a panel sitting out its four-second no-reply timeout, which reads as a hang
//
// A game with no bet and no round, that settles on the press and stores what it settles, does not
// belong here and keeps its own handler; see games/market/meta.js.
'use strict';

// spec:
//   key        the message type on the wire, and the game's short name in logs ('bj')
//   id         the game id, for log lines ('blackjack')
//   engine     the engine module: newRound/act/whyNot/view/OPS (see games/README.md)
//   minBet     the smallest bet the host will take
//   livePhase  the phase in which a round is in progress ('player' | 'play' | 'spin'), or LEFT OUT
//              by a game that is born 'done' and has no live phase at all (the slots: OPS is empty
//              and the deal IS the round)
//   noun       what one round is called in the refusals ('round' | 'run' | 'hand')
//   start      ({seed, id, bet, ...selection}, carry) -> a new round. `carry` is what the last left
//   stakeOf    (round) -> what a LIVE round has riding on it (held back from the other games)
//   carryOf    optional: (settled round) -> what the next round should start from (High-Low's shoe)
//   opArg      optional: (message) -> what the engine's whyNot/act are handed (the wheel's risk:
//              anything that travels WITH a move)
//   startArg   optional: (message) -> the DEAL's own selection, as the fields `start` will read
//              (anything the player chooses before the round exists). No game uses it today; the
//              driver keeps it because the hook is half of badStart's reason for existing
//   badStart   optional: (selection) -> the sentence the player is shown, or null. Asked on the
//              deal, before anything is staked, so a bad selection refuses like a bad bet
//
// deps (from extension.js):
//   reply(key, engine, state, reqN, error, withSeq)   one reply per message
//   afterMove(settled, net, reply, tag)               record, reply, then push
//   budget(key)                                       balance minus what the others hold
//   random()                                          a fresh seed / round id
//   ensureReplica()                                   this activation's bank key
//   log(line)                                         the output channel (optional in tests)

// Why a spec is not one this driver can run, or null.
// The register asks this BEFORE it lists a game (games/registry.js), so a spec that cannot work
// costs that one game its row and leaves the casino standing. createTable asks it too, for a caller
// that built a spec by hand, and throws there: by then the game is already on the list
function whyNotSpec(spec) {
  if (!spec || typeof spec !== 'object') return 'there is no table spec';
  for (const k of ['key', 'id', 'noun']) {
    if (typeof spec[k] !== 'string' || spec[k] === '') return 'table.' + k + ' must be a non-empty string';
  }
  const e = spec.engine;
  if (!e || typeof e !== 'object') return 'table.engine is missing';
  if (!Array.isArray(e.OPS)) return 'table.engine has no OPS array';
  for (const k of ['act', 'whyNot', 'view']) {
    if (typeof e[k] !== 'function') return 'table.engine has no ' + k + '()';
  }
  for (const k of ['start', 'stakeOf']) {
    if (typeof spec[k] !== 'function') return 'table.' + k + ' must be a function';
  }
  if (!Number.isSafeInteger(spec.minBet) || spec.minBet < 1) return 'table.minBet must be a whole number of at least 1';
  for (const k of ['carryOf', 'opArg', 'startArg', 'badStart']) {
    if (spec[k] != null && typeof spec[k] !== 'function') return 'table.' + k + ' must be a function when it is given';
  }
  // 'done' is the phase a SETTLED round is in. A spec that names it as the live phase deals exactly
  // one round per window and then refuses every deal after it with "a round is already in
  // progress", forever, which looks like a hang rather than a misconfigured game. The slot machine
  // is born 'done' and genuinely has no live phase: it leaves livePhase out
  if (spec.livePhase === 'done') return 'table.livePhase cannot be "done": a game born done leaves it out';
  if (spec.livePhase != null && (typeof spec.livePhase !== 'string' || spec.livePhase === '')) {
    return 'table.livePhase must be a non-empty string, or left out';
  }
  // Two halves of one fact, so they are checked against each other. A live phase with no op can
  // never be left, and its stake would sit on the purse for the rest of the activation; an op with
  // no live phase can never be played at all, because act() asks for the live phase first
  if (!!spec.livePhase !== (e.OPS.length > 0)) {
    return spec.livePhase
      ? 'table.livePhase is given but the engine has no OPS to leave it with'
      : 'the engine has OPS but the table names no livePhase to play them in';
  }
  return null;
}

// An engine's throw, as the one sentence the player is shown.
//
// A RangeError is an engine's own ruling and its message is already that sentence ('mines must be
// one of 3, 5, 10'), so it is passed through. Anything else is a fault rather than a ruling: the
// player gets one plain sentence and the log keeps the original with its stack.
//
// This lives here rather than inside guard() because it is NOT only the driver's split any more:
// extension.js's gameReply() asks the same question of a view() that throws (games/README.md,
// section 5), and the two reading a throw differently would be two answers to one question
function refusal(err, what) {
  if (err instanceof RangeError) return (err && err.message) ? String(err.message) : String(err);
  return 'the table could not ' + what;
}

function createTable(spec, deps) {
  const bad = whyNotSpec(spec);
  if (bad) throw new Error('games/tables: ' + ((spec && spec.id) || 'a game') + ': ' + bad);

  const engine = spec.engine;
  const opArg = spec.opArg || ((m) => m.op);
  const livePhase = spec.livePhase || null;   // null: a game born done, with no live phase
  const log = deps.log || (() => {});
  let state = null;   // the current round, or the last finished one
  let carry = null;   // what the last settled round left behind (High-Low's shoe)
  let reqN = null;    // request number of the message being answered, echoed back
  let seeds = deps.random; // tests swap this to pick the cards (_test.setXxSeeds)

  // A round is in progress. A game with no live phase never is: its deal settles itself
  function isLive() {
    return !!(livePhase && state && state.phase === livePhase);
  }

  function reply(error, withSeq) {
    deps.reply(spec.key, engine, state, reqN, error, !!withSeq);
  }

  // Every call into an engine, and into the spec's own hooks, goes through here.
  //
  // Engines refuse a selection they will not take by THROWING: newRound raises a RangeError for a
  // mine count that is not on the board, a target off the dial, a risk that is not a risk. An
  // uncaught one would leave the message with NO reply, and the panel then sits out its four-second
  // no-reply timeout instead of being told no. So a throw is turned into a refusal.
  //
  // It also has to leave the round exactly as it was, which is why this returns the value rather
  // than assigning it: the caller only writes to `state` on { ok: true }.
  //
  // Which sentence a throw becomes is refusal()'s to say, above
  function guard(what, fn) {
    try { return { ok: true, value: fn() }; }
    catch (err) {
      const msg = (err && err.message) ? String(err.message) : String(err);
      log(spec.id + ': could not ' + what + ': ' + msg);
      reply(refusal(err, what));
      return { ok: false, value: null };
    }
  }

  // Settling is the ONE place the ledger moves, and it happens on the move that turned the round
  // to 'done'. The carry is taken before the reply so the next round cannot be dealt from a shoe
  // this round has not finished with.
  function afterMove() {
    const settled = state.phase === 'done';
    if (settled && spec.carryOf) carry = spec.carryOf(state);
    deps.afterMove(settled, state.net, reply, spec.id);
  }

  // Comparisons are written as !(a <= b) so a NaN (a broken ledger, a bad bet) refuses
  function deal(m) {
    if (isLive()) return reply('a ' + spec.noun + ' is already in progress');
    const bet = m.bet;
    if (!Number.isSafeInteger(bet) || !(bet >= spec.minBet)) return reply('bet must be a whole number of at least ' + spec.minBet);
    // The deal's own selection is read off the message HERE and nowhere else, and the trusted
    // fields are written OVER it below, so nothing the webview sends can reach `seed`, `id` or
    // `bet`: a startArg returning { bet: 1e9 } changes nothing
    const picked = spec.startArg ? guard('read the selection', () => spec.startArg(m)) : { ok: true, value: null };
    if (!picked.ok) return;
    // The host rules on the selection before the engine is asked to build a round from it. Where
    // the engine exports a check of its own this is where it is called, so a bad selection is a
    // refusal like any other instead of an exception path
    if (spec.badStart) {
      const why = guard('judge the selection', () => spec.badStart(picked.value));
      if (!why.ok) return;
      if (why.value) return reply(why.value);
    }
    if (!(bet <= deps.budget(spec.key))) return reply('not enough credits');
    deps.ensureReplica();
    const arg = Object.assign({}, picked.value, { seed: seeds(), id: deps.random(), bet: bet });
    const next = guard('deal', () => spec.start(arg, carry));
    if (!next.ok) return;
    state = next.value;
    afterMove();
  }

  function act(arg) {
    if (!isLive()) return reply('no ' + spec.noun + ' in progress');
    const why = guard('judge the move', () => engine.whyNot(state, arg, deps.budget(spec.key)));
    if (!why.ok) return;
    if (why.value) return reply(why.value);
    const next = guard('play the move', () => engine.act(state, arg));
    if (!next.ok) return;
    state = next.value;
    afterMove();
  }

  return {
    key: spec.key,
    // One reply per message. An unknown op is refused rather than ignored: a webview that asks for
    // something this host does not have has to be told, or it waits out its no-reply timeout
    handle(m) {
      reqN = Number.isSafeInteger(m.n) ? m.n : null;
      if (m.op === 'open') reply(null);
      else if (m.op === 'deal') deal(m);
      else if (engine.OPS.indexOf(m.op) >= 0) {
        const a = guard('read the move', () => opArg(m));
        if (a.ok) act(a.value);
      }
      else reply('unknown action');
    },
    // What this game's live round still has a claim on, for the other games' budgets.
    // Deliberately NOT inside guard(): this is a money rule, and the safe failure for a money rule
    // is loud. A catch here would have to answer 0, which is "nothing is riding", and a stake
    // reported as nothing is a stake the other games are allowed to bet a second time
    held() {
      return isLive() ? spec.stakeOf(state) : 0;
    },
    setSeeds(fn) { seeds = fn || deps.random; },
    carry() { return carry; }
  };
}

module.exports = { createTable, whyNotSpec, refusal };
