// The "Waiting on a result" block on the Agents tab: the rows a user can clear when a call has sat
// on "?" for hours with nothing written back.
//
// Not a game, which is why the file is named for what it is. It lives beside the games because the
// harness reads one directory (test/webview/modes.js) and because this mode is the same thing a
// game mode is: one page, one script, one process. Same reasoning as _chrome.js.
//
// What is pinned here, in order of how much it would cost to get wrong:
//   1. a healthy run has NO clear control anywhere on the page
//   2. the control is per INVOCATION, so clearing one of two parallel calls leaves the other
//   3. the row waits for the host's answer instead of vanishing on the click (the host decides)
//   4. the wording says "clear", never "stop" or "cancel": there are no hooks here, and a user who
//      believed this button had stopped an agent would be worse off than one who never saw it
'use strict';

const MIN = 60000;

module.exports = {
  id: 'agents',
  modes: ['agents-wait'],
  // the crew folded, so the compact strip renders too and its own wording can be read
  state: { 'agents-wait': { tab: 'agents', rosterCollapsed: true } },

  run: function (h) {
    const { ok, advance, later, doc, $, toWebview } = h;
    const NOW = Date.now();
    const base = {
      agents: [], xp: {}, today: {}, count: 0, cfg: { panelHidden: [] },
      credits: { balance: 0, today: 0, frac: 0, perCredit: 10000, counting: false }
    };
    // two calls of ONE agent plus a healthy run of another: the parallel pair is the case the
    // per-invocation key exists for
    const WAIT1 = { key: 'toolu_wait1', agent: 'code-reviewer', state: 'stuck', since: NOW - 80 * MIN, desc: 'review the engine' };
    const WAIT2 = { key: 'toolu_wait2', agent: 'code-reviewer', state: 'stuck', since: NOW - 30 * MIN, desc: 'review the panel' };
    const LIVE = { key: 'toolu_live', agent: 'test-runner', state: 'active', since: NOW - MIN, desc: 'run the suite' };

    const push = (list) => { toWebview({ type: 'data', data: Object.assign({}, base, { agentActivity: { instances: list, stats: {} } }) }); advance(20); };
    const box = () => $('waitBox');
    const clears = () => [...doc.querySelectorAll('#waitBox .wb-clear')];
    const keys = () => clears().map((b) => b.getAttribute('data-key'));
    const text = () => box().textContent;

    // 1. nothing waiting, and a run that is going fine: no block, and so no control at all
    push([]);
    ok('nothing waiting: the block is hidden and empty', box().hidden && clears().length === 0);
    push([LIVE]);
    ok('a healthy run offers nothing to clear', box().hidden && clears().length === 0, 'buttons ' + clears().length);

    // 2. two waiting calls of the same agent, one healthy run
    push([LIVE, WAIT1, WAIT2]);
    ok('the block appears with one row per waiting invocation', !box().hidden && clears().length === 2, 'buttons ' + clears().length);
    ok('rows are keyed by tool_use id, longest wait first', keys().join(',') === 'toolu_wait1,toolu_wait2', keys().join(','));
    ok('the healthy run is not among them', keys().indexOf('toolu_live') < 0);
    ok('the count beside the heading is the number of rows', doc.querySelector('#waitBox .wb-n').textContent === '2');
    ok('each row names its agent and its task', text().indexOf('code-reviewer') >= 0 && text().indexOf('review the engine') >= 0);
    ok('each row says how long it has waited', /1h 20m/.test(text()) && /30m/.test(text()), text());

    // 3. the wording. Both halves of the honest version have to be readable, and the button must
    //    not promise anything the extension cannot do
    ok('the note says it may still be working', /may still be working/.test(text()), text());
    ok('the note says the row clears itself after 4 hours', /by itself 4 hours after the call/.test(text()));
    ok('no em dash anywhere in the block', text().indexOf('—') < 0);
    const btn = clears()[0];
    ok('the control is labelled Clear', btn.textContent === 'Clear', btn.textContent);
    ok('its tooltip says it does not stop the agent', /does not stop the agent/.test(btn.title), btn.title);
    ok('nothing in the block offers to stop, cancel or kill', !/\b(stop|stops|cancel|kill|abort|terminate)\b/i.test(text().replace(btn.title, '')), text());

    // 4. the compact crew strip, same honesty, no em dash (it used to read "stuck?")
    const strip = doc.querySelector('#crewMini .cm-row.stuck');
    ok('the strip has a row for a waiting call', !!strip);
    ok('the strip states the fact rather than guessing "stuck?"', /No result written yet/.test(strip.textContent) && strip.textContent.indexOf('—') < 0, strip.textContent);
    ok('and carries the full explanation as its tooltip', /may still be working/.test(strip.title), strip.title);

    // 5. the click. The host owns the record, so the row holds until an answer comes back
    const answered = {};
    h.intercept = function (m) {
      if (m.type !== 'dismissAgentRun') return false;
      answered[m.key] = 1;
      later(1, () => push([LIVE, WAIT1, WAIT2].filter((s) => !answered[s.key])));
      return true;
    };
    clears()[0].click();
    ok('the row does not vanish on the click alone', clears().length === 2, 'buttons ' + clears().length);
    advance(5);
    ok('one Clear posts one dismissAgentRun, by invocation key', h.sent('dismissAgentRun').length === 1 && h.sent('dismissAgentRun')[0].key === 'toolu_wait1', JSON.stringify(h.sent('dismissAgentRun')));
    ok('the swept row is gone and its parallel sibling stays', keys().join(',') === 'toolu_wait2', keys().join(','));
    ok('the heading count follows', doc.querySelector('#waitBox .wb-n').textContent === '1');

    clears()[0].click(); advance(5);
    ok('clearing the last one hides the block again', box().hidden && clears().length === 0);
    ok('and the healthy run was never touched', h.sent('dismissAgentRun').length === 2 && h.sent('dismissAgentRun').every((m) => m.key !== 'toolu_live'));
    // 6. the room's own note. An empty room drew the same nothing for three different situations,
    //    and the one that is a fault (runs happened, none matched a folder open here) was the one
    //    that looked most like a quiet afternoon. The note exists to separate them, so what is
    //    pinned is which of the three it speaks for, not how it looks.
    // verdict is the host's word, exactly as computeAgentActivity sends it. The note reads that
    // and never re-derives it from the counts, so the log and the screen cannot disagree
    const pushScope = (scope, list) => {
      scope.verdict = !scope.calls ? 'no-runs' : scope.matched ? 'matched' : 'none-matched';
      toWebview({ type: 'data', data: Object.assign({}, base, { agentActivity: { instances: list || [], stats: {}, scope } }) });
      advance(20);
    };
    const note = () => $('wsNote');
    advance(3000); // let the last walkers finish leaving: "empty" has to mean empty
    pushScope({ all: false, calls: 0, matched: 0 });
    ok('nobody was invoked: the room says nothing', note().hidden, note().textContent);
    pushScope({ all: false, calls: 3, matched: 3 }, [LIVE]);
    ok('runs that matched need no note either', note().hidden, note().textContent);
    // the live run above has to finish walking out first: a note that appeared over someone still
    // on screen would be saying the room is empty while it plainly is not
    pushScope({ all: false, calls: 3, matched: 0 });
    ok('the note holds while the last walker is still leaving', note().hidden, note().textContent);
    advance(3000);
    pushScope({ all: false, calls: 3, matched: 0 });
    ok('runs happened and none matched: the room says so', !note().hidden, 'still hidden');
    ok('and it says how many, in plain words', /3 runs today, none from this folder/.test(note().textContent), note().textContent);
    ok('no em dash in it', note().textContent.indexOf('—') < 0, note().textContent);
    const sbtn = note().querySelector('button');
    ok('the way out is on the note itself', sbtn && sbtn.textContent === 'Show all folders', sbtn && sbtn.textContent);
    sbtn.click(); advance(5);
    ok('clicking it asks the host to widen the scope', h.sent('setAgentScope').length === 1 && h.sent('setAgentScope')[0].all === true, JSON.stringify(h.sent('setAgentScope')));
    // the host owns the setting, so the note only changes when the answer comes back
    pushScope({ all: true, calls: 3, matched: 0 }, [LIVE]);
    ok('with the scope widened the note says that is why', /every folder/.test(note().textContent) && !note().hidden, note().textContent);
    const rbtn = note().querySelector('button');
    ok('and the way back is on it too', rbtn.textContent === 'This folder only', rbtn.textContent);
    rbtn.click(); advance(5);
    ok('which asks for the narrow scope again', h.sent('setAgentScope').length === 2 && h.sent('setAgentScope')[1].all === false, JSON.stringify(h.sent('setAgentScope')));
    // an older host sends no scope at all: the note must not invent one
    toWebview({ type: 'data', data: Object.assign({}, base, { agentActivity: { instances: [], stats: {} } }) }); advance(20);
    ok('a host that sends no scope leaves the room quiet', note().hidden, note().textContent);

    ok('no handler threw', h.errors.length === 0, h.errors.map((e) => e.message).join('; '));
  }
};
