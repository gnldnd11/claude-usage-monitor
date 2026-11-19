// The Crew roster, from the keyboard.
//
// Not a game: same reasoning as _agents.js and _chrome.js for living here.
//
// The roster was built out of <div>s with one delegated click on the pool, which is invisible in a
// screenshot and total for anyone without a pointer: no card could be tabbed to, so neither the
// agent nor the gear behind it was reachable at all, and the "Hidden" row was the one way back from
// "every agent is hidden". Nothing in the DOM says which div a delegated handler listens for, so
// what is pinned here is the SHAPE the casino already uses for this (a wrapper holding two buttons,
// games/README.md section 7-3: .gm-row / .gm-open / .gm-fav) and the fact that every one of those
// controls answers Enter or Space.
'use strict';

module.exports = {
  id: 'crew',
  modes: ['crew-keys'],
  state: { 'crew-keys': { tab: 'agents' } },

  run: function (h) {
    const { ok, advance, doc, $, toWebview } = h;
    const AGENTS = [
      { name: 'code-reviewer', model: 'opus', description: 'Reviews a change.' },
      { name: 'test-runner', model: 'sonnet', description: 'Runs the suite.' },
      { name: 'designer', model: 'opus', description: 'Draws the screen.' },
      { name: 'old-helper', model: 'haiku', description: 'Put away.' }
    ];
    // The host owns the roster and the hidden set, so a test that wants a hidden agent pushes one
    // and answers the webview's request itself: the harness's own host has no agents on disk and
    // its reply would replace this roster with the three built-ins
    let hiddenNow = { 'old-helper': true }, activity = null, nicks = {};
    const pushRoster = () => {
      toWebview({
        type: 'data',
        data: {
          agents: AGENTS, xp: {}, today: {}, count: 0, cfg: { panelHidden: [] },
          hidden: Object.assign({}, hiddenNow), nicknames: Object.assign({}, nicks), roles: {},
          agentActivity: activity || { instances: [], stats: {} },
          credits: { balance: 0, today: 0, frac: 0, perCredit: 10000, counting: false }
        }
      });
      advance(20);
    };
    h.intercept = function (m) {
      if (m.type !== 'setHidden') return false;
      if (m.hidden) hiddenNow[m.name] = true; else delete hiddenNow[m.name];
      h.later(1, pushRoster);
      return true;
    };
    pushRoster();

    const pool = () => $('pool');
    const cards = () => [...doc.querySelectorAll('#pool .cr-card')];
    const pick = (name) => doc.querySelector('#pool .cr-card[data-agent="' + name + '"] .cr-pick');
    const gear = (name) => doc.querySelector('#pool .cr-card[data-agent="' + name + '"] .cr-gear');
    const card = (name) => doc.querySelector('#pool .cr-card[data-agent="' + name + '"]');
    // press whatever is focused, the way a keyboard does. A missing control is reported rather
    // than thrown, so a roster that is unreachable fails every check instead of only the first
    const press = (el, key) => {
      if (!el) { ok('  (there was a control here to press)', false); return; }
      el.focus(); doc.pressKey(key || 'Enter'); advance(5);
    };
    const attr = (el, k) => (el ? el.getAttribute(k) : null);
    const has = (el, c) => !!el && el.classList.contains(c);

    // 1. the shape. A card is a wrapper, and the thing a reader presses is a button inside it
    ok('the roster drew a card per visible agent', cards().length === 3, 'cards ' + cards().length);
    ok('every card holds a button that picks it',
      cards().every((c) => { const b = c.querySelector('.cr-pick'); return b && b.localName === 'button'; }));
    ok('and a button that opens its settings',
      cards().every((c) => { const g = c.querySelector('.cr-gear'); return g && g.localName === 'button'; }));
    ok('nothing in the roster is a bare div waiting for a mouse',
      doc.querySelectorAll('#pool div.hid-row, #pool div.hid-card, #pool div.cr-gear').length === 0);
    ok('the gear says whose settings it opens', /code-reviewer/.test(attr(gear('code-reviewer'), 'aria-label') || ''),
      attr(gear('code-reviewer'), 'aria-label'));
    ok('no card starts out pressed',
      cards().every((c) => attr(c.querySelector('.cr-pick'), 'aria-pressed') === 'false'));

    // 2. picking an agent, with the keyboard and nothing else
    press(pick('test-runner'));
    ok('Enter on a card picks that agent', has(card('test-runner'), 'selected'));
    ok('and says so where a screen reader can hear it', attr(pick('test-runner'), 'aria-pressed') === 'true');
    press(pick('test-runner'), ' ');
    ok('Space on the same card lets it go', !has(card('test-runner'), 'selected'));
    ok('and the state goes with it', attr(pick('test-runner'), 'aria-pressed') === 'false');

    // 3. the gear, which only exists once a card is picked, is reachable from there
    press(pick('designer'));
    ok('a second agent can be picked', attr(pick('designer'), 'aria-pressed') === 'true');
    ok('and the first one is no longer', attr(pick('test-runner'), 'aria-pressed') === 'false');
    press(gear('designer'));
    ok('Enter on the gear opens that agent’s settings', !$('agentModal').hidden);
    ok('and the sheet is about the agent that was picked', $('amTitle').textContent === 'designer', $('amTitle').textContent);
    press($('amClose'));
    ok('and closes again from the keyboard', $('agentModal').hidden);

    // 4. hidden agents: the way back has to be reachable too, or "every agent is hidden" is a
    //    dead end for anyone without a pointer
    const row = () => $('hidRow');
    ok('the Hidden row is a button', !!row() && row().localName === 'button');
    ok('and it says it is shut', attr(row(), 'aria-expanded') === 'false');
    press(row());
    ok('Enter opens the hidden pool', !!$('hidPool') && attr(row(), 'aria-expanded') === 'true');
    ok('and the focus follows the row that was rebuilt under it', !!row() && doc.activeElement === row(),
      doc.activeElement && doc.activeElement.id);
    const hidCard = doc.querySelector('#pool .hid-card');
    ok('a hidden agent is a button as well', !!hidCard && hidCard.localName === 'button');
    ok('its tooltip has no em dash', ((hidCard && hidCard.title) || '').indexOf('—') < 0, hidCard && hidCard.title);
    press(hidCard);
    ok('Enter on it asks the host to bring that agent back',
      h.sent('setHidden').length === 1 && h.sent('setHidden')[0].name === 'old-helper' && h.sent('setHidden')[0].hidden === false,
      JSON.stringify(h.sent('setHidden')));
    advance(30); // the host owns the set: the row only goes once the answer lands
    ok('and once the answer lands it is a card like any other', !!pick('old-helper') && !row());

    // 5. a live run still paints on the wrapper, which is what carries the ring and the badge,
    //    and a pick has to survive the rebuild a changed roster causes (a nickname landing here)
    press(pick('designer'));
    activity = { instances: [{ key: 'toolu_1', agent: 'code-reviewer', state: 'active', since: Date.now() - 5000, desc: 'review' }], stats: {} };
    nicks = { 'code-reviewer': 'Rev' };
    pushRoster();
    ok('a running agent is marked on its card', has(card('code-reviewer'), 'active'));
    ok('the roster was rebuilt under it', /Rev/.test((card('code-reviewer') || {}).textContent || ''),
      card('code-reviewer') && card('code-reviewer').textContent);
    ok('and the picked card came back pressed, not just ringed',
      has(card('designer'), 'selected') && attr(pick('designer'), 'aria-pressed') === 'true');

    ok('no handler threw', h.errors.length === 0, h.errors.map((e) => e.message).join('; '));
  }
};
