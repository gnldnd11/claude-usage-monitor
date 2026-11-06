// The page around the games: the header credits button, the compact Usage rules, an unknown stored
// tab, an asset catalog with no player sprite, and a reload coming back where it was.
//
// Not a game, which is why the file is named for what it is. It lives beside the games because the
// harness reads one directory (test/webview/modes.js) and because every one of these modes is the
// same thing the games are: one page, one script, one process.
'use strict';

module.exports = {
  id: 'chrome',
  modes: ['badtab', 'compact', 'header', 'header-reduce', 'nohero', 'resume-bj', 'resume-list'],
  // what the webview had stored when the page was loaded: a reload resuming where it was
  state: {
    compact: { tab: 'usage', compact: true },
    badtab: { tab: 'bogus' },
    'resume-list': { tab: 'games', lastTab: 'usage' },
    'resume-bj': { tab: 'games', game: 'blackjack', lastTab: 'agents' }
  },
  // an asset catalog without the player sprite: the seat stays empty and nothing else breaks
  html: function (html, mode) {
    if (mode !== 'nohero') return html;
    const m = /data-json='([^']*)'/.exec(html);
    const decode = (x) => x.replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&amp;/g, '&');
    const cat = JSON.parse(decode(m[1]));
    delete cat.npcs.player;
    return html.replace(m[1], JSON.stringify(cat).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;'));
  },

  run: function (h, MODE) {
    const { ok, advance, later, doc, $, notShown, bodyTabs, inGames, atTable, gameRow,
        openList, openTable, reopenTable, dealerCards, allCards, isBack, lineText, hdrBal,
        latchIdle, active, activeName, mouseClick, ledgerBalance, useSeed, standOut, watch,
        noStaleTimer, toWebview, sentOps, sentHl, errors, hostLog, roCbs, ext, bj, credits,
        registry, gs, config, EXT, path } = h;

    if (MODE === 'header' || MODE === 'header-reduce') {
    // the header credits line, re-checked on the real HTML now that it is a button
    const R = MODE === 'header-reduce';
    const box = $('hdCredits'), bal = $('ccBal'), coin = box.querySelector('.cc-coin');
    const base = { agents: [], agentActivity: { instances: [], stats: {} }, xp: {}, today: {}, count: 0, cfg: { panelHidden: [] } };
    const push = (c, extra) => { toWebview({ type: 'data', data: Object.assign({}, base, { credits: c }, extra || {}) }); };
    const C = (balance, frac, counting, today) => ({ balance, today: today || 0, frac: frac || 0, perCredit: 100000, counting: !!counting });
    const lit = () => doc.querySelectorAll('#hdCredits .cc-r.on').length;
    const clear = () => { bal.classList.remove('roll'); coin.classList.remove('flip'); advance(1000); };
    function paint(ms) { const out = []; for (let i = 0; i < ms; i += 16) { advance(16); out.push(bal.textContent); } return out.filter((v, i, a) => v !== a[i - 1]); }
    const num = (x) => Number(String(x).replace(/,/g, ''));
    push(C(0)); advance(600);
    ok('zero: "0", no rows', bal.textContent === '0' && lit() === 0, bal.textContent);
    ok('title: weighted wording and the way in', box.title === '0 credits · +0 today\n1 credit per 100k tokens, weighted by API price\nClick for games', JSON.stringify(box.title));
    clear(); push(C(12, 0.5, true)); advance(600);
    ok('counting: class, rows 3, title', box.classList.contains('counting') && lit() === 3 && box.title === 'Counting past sessions…\n12 credits so far\nClick for games', JSON.stringify(box.title));
    clear(); push(C(15370, 0.22)); const land = paint(600);
    ok('landing after counting: counted up, no flip, no roll', (R ? land.length === 1 : land.length > 3) && !coin.classList.contains('flip') && !bal.classList.contains('roll') && bal.textContent === '15,370', land.length + ' distinct');
    const mint = (from, to, frac) => { clear(); push(C(from, 0.9)); advance(700); clear(); push(C(to, frac || 0.05)); return { flip: coin.classList.contains('flip'), roll: bal.classList.contains('roll'), rows: lit() }; };
    let m = mint(15370, 15371);
    ok('+1: roll and coin flip (all rows lit)' + (R ? ' [reduced motion: none]' : ''), R ? (!m.flip && !m.roll) : (m.flip && m.roll && m.rows === 6), JSON.stringify(m));
    if (!R) { advance(200); ok('+1: fresh coin at 200ms', lit() === 0, 'rows ' + lit()); coin.dispatchEvent({ type: 'animationend', animationName: 'ccFlip' }); ok('flip class dropped on animationend', !coin.classList.contains('flip')); }
    m = mint(16000, 16019); ok('+19: still a mint' + (R ? ' [reduced motion: none]' : ''), R ? !m.flip : m.flip && m.roll, JSON.stringify(m));
    m = mint(17000, 17020); ok('+20: a landing, no flip, no roll', !m.flip && !m.roll, JSON.stringify(m));
    m = mint(18000, 18300); ok('+300: a landing, no flip, no roll', !m.flip && !m.roll, JSON.stringify(m));
    clear(); push(C(18300)); advance(700); clear(); push(C(18250)); const down = paint(600);
    ok('decrease: counts down, no flip, no roll', !coin.classList.contains('flip') && !bal.classList.contains('roll') && bal.textContent === '18,250' && down.every((v, i) => i === 0 || num(v) <= num(down[i - 1])), down.join('>'));
    // fit: the observer must watch the parent (.ttl), not the fit-content button
    const fitRec = roCbs.find((r) => r.targets.some((t) => t === box.parentNode));
    ok('fit observer watches the parent .ttl', !!fitRec && box.parentNode.classList.contains('ttl'));
    let W = 300; Object.defineProperty(box, 'clientWidth', { get: () => W, configurable: true });
    Object.defineProperty(box, 'scrollWidth', { get: () => 16 + (box.classList.contains('fit2') ? 0 : 4 + bal.textContent.length * 7) + (box.classList.contains('fit1') ? 0 : 49), configurable: true });
    const fit = () => fitRec.cb();
    fit(); ok('fit: wide -> nothing dropped', !box.classList.contains('fit1') && !box.classList.contains('fit2'));
    W = 70; fit(); ok('fit: 70px -> word dropped', box.classList.contains('fit1') && !box.classList.contains('fit2'));
    W = 30; fit(); ok('fit: 30px -> number dropped too', box.classList.contains('fit2'));
    W = 300; fit(); ok('fit: widening brings both back', !box.classList.contains('fit1') && !box.classList.contains('fit2'));
    push(C(18250), { cfg: { panelHidden: ['credits'] } }); advance(5);
    ok('hidden from settings', box.style.display === 'none');
    push(C(18250), { cfg: { panelHidden: [] } }); advance(5);
    ok('shown again', box.style.display === '');
    } else if (MODE === 'compact') {
    // Usage compact must survive the selector swap: tab-usage is on the body whenever Usage shows
    ok('initial load (stored tab usage, compact): body has tab-usage + compact', bodyTabs() === 'tab-usage compact', bodyTabs());
    $('hdCredits').click(); advance(20);
    ok('games: tab-usage gone (compact rules off), compact kept for later', bodyTabs() === 'tab-games compact', bodyTabs());
    ok('games: header chevron hidden by body:not(.tab-usage) rule', /body:not\(\.tab-usage\) \.toggle\{display:none;\}/.test(doc.querySelector('style').textContent));
    $('hdCredits').click(); advance(20);
    ok('back to usage: tab-usage + compact again', bodyTabs() === 'tab-usage compact', bodyTabs());
    $('tabAgents').click(); advance(5); ok('agents: tab-agents only', bodyTabs() === 'tab-agents compact', bodyTabs());
    $('tabUsage').click(); advance(5); ok('usage again', bodyTabs() === 'tab-usage compact', bodyTabs());
    const css = doc.querySelector('style').textContent;
    ok('no body:not(.tab-agents) selector left; six body.tab-usage.compact rules', !css.includes('body:not(.tab-agents)') && (css.match(/body\.tab-usage\.compact/g) || []).length === 6);
    } else if (MODE === 'nohero') {
    // no player sprite in the catalog: the seat is empty and everything else still works
    openTable();
    ok('no player sprite: nothing sits at the table', doc.querySelectorAll('#bjHands .bj-hero').length === 0);
    ok('no player sprite: the stake preview and Deal are there', doc.querySelector('#bjHands .bj-stake.preview b').textContent === '10' && !$('bjDeal').disabled);
    useSeed((st) => st.phase === 'player', 'nohero-');
    $('bjDeal').click(); advance(2); advance(1200);
    ok('no player sprite: a hand still deals and shows', allCards().length === 4 && lineText(0) && !$('bjPlay').hidden, 'cards ' + allCards().length);
    ok('no player sprite: still no hero after the deal', doc.querySelectorAll('#bjHands .bj-hero').length === 0);
    } else if (MODE === 'badtab') {
    ok('an unknown stored tab falls back to Usage', bodyTabs() === 'tab-usage' && $('panelUsage').style.display === '' && $('panelGames').style.display === 'none' && notShown('panelTable'), bodyTabs());
    } else {
    // a reloaded webview comes back where it was
    if (MODE === 'resume-list') {
      ok('reload with the list stored: the list is back', inGames() && !atTable() && $('panelGames').style.display === '' && notShown('panelTable'), bodyTabs());
      ok('reload with the list stored: no game state asked for', sentOps.filter((o) => o === 'open').length === 0, sentOps.join(','));
      $('hdCredits').click(); advance(5);
      ok('and it still leaves to the stored last tab', bodyTabs() === 'tab-usage', bodyTabs());
    } else {
      ok('reload with blackjack stored: the table is back', atTable() && $('panelTable').style.display === '' && $('panelGames').style.display === 'none', bodyTabs());
      ok('reload with blackjack stored: the host was asked for the round', sentOps.filter((o) => o === 'open').length === 1, sentOps.join(','));
      $('bjBack').click(); advance(5);
      ok('back still goes to the list', inGames() && !atTable(), bodyTabs());
      $('hdCredits').click(); advance(5);
      ok('and leaving goes to the stored last tab (agents)', bodyTabs() === 'tab-agents', bodyTabs());
    }
    }
  }
};
