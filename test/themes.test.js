// The panel themes: the register, the ladder it counts, the scope it enforces, and the four
// properties the shared files have to keep for it.
//
// WHAT THIS SUITE IS FOR. A theme repaints the card the usage monitor is actually for, so three
// things have to be true however many themes there turn out to be, and none of them is visible in
// a diff:
//
//   1. A READER WHO HAS BOUGHT NOTHING SEES WHAT THEY HAVE ALWAYS SEEN. Not "near enough": the
//      free theme emits zero rules, and the only thing the themed shell changed about the default
//      panel is a colour literal that became a token with the same value.
//   2. NO SHARED FILE KNOWS A THEME'S NAME. That is what makes a theme a directory, and it is the
//      property games/README.md section 1 is about, read for the second register in this repository.
//   3. A THEME CANNOT REACH OUT OF ITS OWN SCOPE, which is what keeps it out of a game's panel and
//      out of the other themes.
//
// Run: node test/themes.test.js
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const themes = require(path.join(ROOT, 'themes', 'registry.js'));
const shop = require(path.join(ROOT, 'shop.js'));
const CSS = require(path.join(ROOT, 'styles.js'));
const html = require(path.join(ROOT, 'html.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// THE PRICED THEMES, never an index into the shelf. test/webview/games/_theme.js reads the same
// thing the same way: an index is a dependency on the order a directory happens to be read in
const PAID = themes.THEMES.filter((t) => t.price);
// ...and the ones STILL SOLD, which is what a test that BUYS something has to be written against.
// Five themes were taken off the price list on 2026-11-26 and the shop refuses to sell one
// (shop.js, whyNot), so a buy aimed at PAID[0] would fail the day the first paid theme is one of
// them, and it would fail as "a theme cannot be bought" rather than as what it is
const SOLD = PAID.filter((t) => !t.retired);

// the stylesheet with its comments gone: a comment is carried into the served page, so a rule
// written about "the old z-index 9" would be found by anything that greps for a number
const BARE = CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
const declOf = (sel) => {
  const re = new RegExp('(?:^|[}\\s])' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
  const m = re.exec(BARE);
  if (!m) return null;
  const out = {};
  for (const d of m[1].split(';')) {
    const i = d.indexOf(':');
    if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
  }
  return out;
};

// --- the register ------------------------------------------------------------------------------

test('every theme in the directory is listed, and nothing was dropped quietly', () => {
  // The same assertion games/registry.js's suite makes, and for the same reason: the register
  // COLLECTS its failures rather than throwing, because a throw at activation is a sidebar that
  // never draws. This is what stops "it drops quietly" from meaning "nobody finds out"
  assert.deepEqual(themes.PROBLEMS, [], themes.PROBLEMS.join('; '));
  const dirs = fs.readdirSync(path.join(ROOT, 'themes'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(ROOT, 'themes', e.name, 'meta.js')))
    .map((e) => e.name).sort();
  assert.deepEqual(themes.THEMES.map((t) => t.id).sort(), dirs, 'a directory is missing from the shelf');
  assert.ok(dirs.length >= 2, 'there is a shelf to check');
});

test('exactly one theme is free, and it is the one a reader who has bought nothing is on', () => {
  const free = themes.THEMES.filter((t) => !t.price);
  assert.equal(free.length, 1, 'a second free theme is one somebody forgot to draw');
  assert.equal(themes.FREE, free[0].id);
  // ...and the shop agrees, which is the whole of the fallback: every way of getting the stored
  // preference wrong lands on this one (shop.js, wornTheme)
  assert.equal(shop.THEME_FREE, themes.FREE);
  assert.equal(shop.wornTheme([], null), themes.FREE, 'a first launch is not on the free theme');
  assert.equal(shop.wornTheme([], { theme: 'nothing-like-this' }), themes.FREE);
  assert.equal(shop.wornTheme([], { theme: PAID[0].id }), themes.FREE,
    'a theme nobody bought was worn anyway');
  assert.equal(shop.wornTheme([], { theme: 'float' }), themes.FREE, 'a DRAWING was worn by the panel');
});

test('a price is counted off the pictures, not written down', () => {
  // THE RUNG IS A MEASUREMENT AND NOT AN OPINION, which is the mascot ladder's rule read for the
  // second shelf. There the count is a drawing's frames; here it is the layers that need painting
  assert.deepEqual(themes.PRICES, shop.PRICES.slice(), 'the second shelf widened the ladder');
  for (const t of themes.THEMES) {
    assert.ok(t.price === 0 || shop.PRICES.indexOf(t.price) >= 0, t.id + ' is priced off the ladder');
    assert.equal(t.price, themes.rungOf(t.pictures), t.id + ' is not on the rung its count reaches');
    assert.equal(t.pictures, t.layers.filter((l) => themes.PAINTED.indexOf(l) >= 0).length);
  }
  // the ladder itself, in both directions: counts double while the price goes up tenfold, and a
  // count BETWEEN two rungs stands on the lower one the way five frames do
  assert.deepEqual([1, 2, 3, 4, 7, 8, 40].map(themes.rungOf),
    [1000, 10000, 10000, 100000, 100000, 1000000, 1000000]);
  assert.equal(themes.rungOf(0), 0, 'a theme with nothing drawn is not free');
  // AND NO META MAY PRICE ITSELF, which is what makes the count the only answer
  assert.ok(/a theme may not price itself/.test(themes.whyNotMeta({
    id: 'x', name: 'X', layers: [], price: 1000
  }) || ''), 'a meta carrying its own price was accepted');
  for (const id of themes.THEMES.map((t) => t.id)) {
    const src = fs.readFileSync(path.join(ROOT, 'themes', id, 'meta.js'), 'utf8');
    assert.ok(!/^\s*price\s*:/m.test(src), id + '/meta.js writes a price');
  }
});

test('every colour is measured against the surface this theme actually draws it on', () => {
  // THE SURFACE IS THE THEME'S OWN, which is the whole reason this check had to be rewritten when
  // the themes gained their own cards: measuring an accent against the shipped grey answers a
  // question about a panel that reader will never see.
  // The floors are the small-text one for the accent (it colours the 10.5px deltas as well as the
  // ring), WCAG's 4.5 for the body text and 3 for the dim text. The shipped panel clears all three
  // by a long way, which is what makes them floors rather than targets.
  const rows = [];
  for (const t of themes.THEMES) {
    if (!t.accent) continue;
    const card = themes.surfaceOf(t, '--card') || themes.CARD_DARK;
    const inner = themes.surfaceOf(t, '--inner') || themes.INNER_DARK;
    const text = themes.surfaceOf(t, '--text'), muted = themes.surfaceOf(t, '--muted');
    const r = (a, b) => themes.contrast(a, b);
    rows.push([t.id, card, r(t.accent, card).toFixed(2), r(t.accent, inner).toFixed(2),
      text ? r(text, card).toFixed(2) : '-', muted ? r(muted, card).toFixed(2) : '-']);
    assert.ok(r(t.accent, card) >= themes.CONTRAST_FLOOR, t.id + ' accent on its card');
    assert.ok(r(t.accent, inner) >= themes.CONTRAST_FLOOR, t.id + ' accent on its inner');
    if (text) assert.ok(r(text, card) >= 4.5, t.id + ' text on its card');
    if (muted) assert.ok(r(muted, card) >= 3, t.id + ' muted on its card');
    // ...AND A THEME THAT MOVES ITS CARD HAS TO MOVE ITS INK WITH IT. A surface chosen for the
    // picture with the panel's own grey left on top of it is the failure this pair is for, and it
    // is one line in a meta rather than anything that shows up in a diff
    assert.ok(!!text && !!muted, t.id + ' moved its card and left the panel text on it');
  }
  console.log('  card / accent / accent-on-inner / text / muted:');
  for (const r of rows) console.log('   ' + r[0].padEnd(10) + r.slice(1).join('  '));
  // the shipped ember is what the floor was set under, so it stays above it
  assert.ok(themes.contrast('#e8895a', themes.CARD_DARK) >= themes.CONTRAST_FLOOR);
  // ...and the gate really is a gate, with its figures in the sentence
  const why = themes.whyNotMeta({ id: 'x', name: 'X', layers: [], accent: '#3a3a3d' }) || '';
  assert.ok(/under the 4.5:1 floor/.test(why), why || 'a colourless accent was accepted');
  assert.equal(themes.whyNotMeta({ id: 'x', name: 'X', layers: [] }), null, 'a theme may be colourless');
  // ...and it reads the theme's OWN card when there is one
  const dark = themes.whyNotMeta({ id: 'x', name: 'X', layers: [], accent: '#2b2b2b',
    css: 'body.tab-usage[data-theme="x"]{--card:#ffffff;}' }) || '';
  assert.ok(/#ffffff/.test(dark), 'the gate did not read the theme own card: ' + dark);
});

test('a theme cannot write a rule outside its own two scopes', () => {
  const bad = [
    ['.mfill{width:100%}', 'a bare class'],
    ['body{background:red}', 'the body itself'],
    ['body.tab-usage[data-theme="other"] .a{color:red}', 'another theme'],
    ['body.tab-usage[data-theme="mine-x"] .a{color:red}', 'a theme whose id merely starts the same'],
    ['.th-chip[data-th="other"]{color:red}', 'another theme’s shelf cell'],
    ['@keyframes pulse{from{opacity:0}to{opacity:1}}', 'an animation the panel already has'],
    ['@keyframes drift{from{opacity:0}}', 'an animation another theme could also want'],
    ['body.tab-usage[data-theme="mine"] .a{color:red', 'an unbalanced block'],
    // THE TAB IS PART OF THE SCOPE, and these two are the reason. A theme's surface tokens are
    // inherited, so one scoped to the body alone repaints every game on the Games tab
    ['body[data-theme="mine"] .th-frame{display:block}', 'the theme with no tab in its scope'],
    ['body[data-theme="mine"] #panelMarket{background:red}', 'another area of the product'],
    ['body.tab-usage[data-theme="mine"] .bj-felt{color:red}', 'a game’s own felt, even under the tab'],
    ['body.tab-usage[data-theme="mine"] #gameStage{background:red}', 'the stage every game is built into'],
    // ...and the three ways out of the scope the gate used to leave open. All of them are global
    ['@font-face{font-family:ui-sans-serif;src:local(Whatever)}', 'a typeface for the whole page'],
    ['@property --card{syntax:"<color>";inherits:true;initial-value:red}', 'an initial value for a token'],
    ['@page{margin:0}', 'an at-rule that is not @media'],
    ['body.tab-usage[data-theme="mine"]::after{content:"/*"} .x{background:red} .y{content:"*/"}',
      'a rule smuggled between two halves of a comment written in strings'],
    ['body.tab-usage[data-theme="mine"]{content:"{"} .z{background:red}',
      'a rule smuggled past the brace count the same way']
  ];
  for (const [css, what] of bad) {
    assert.ok(themes.whyNotCss('mine', css), 'accepted ' + what + ': ' + css);
  }
  const good = [
    'body.tab-usage[data-theme="mine"] .th-frame{display:block}',
    'body.tab-usage[data-theme="mine"]{--x:1}',
    'body.tab-usage[data-theme="mine"] .a,body.tab-usage[data-theme="mine"] .b{color:red}',
    '.th-chip[data-th="mine"]{background:red}',
    '@media (max-width:270px){body.tab-usage[data-theme="mine"] .a{color:red}}',
    '@keyframes th-mine-rise{from{opacity:0}to{opacity:1}}',
    '/* body[data-theme="other"] .a{color:red} */ body.tab-usage[data-theme="mine"] .a{color:red}',
    'body.tab-usage[data-theme="mine"]{--scene:url("data:image/svg+xml,%3Csvg%3E")}'
  ];
  for (const css of good) assert.equal(themes.whyNotCss('mine', css), null, css);
  // ...and the shipped themes keep it, which is the point of the gate rather than a restatement of
  // it: this is the same check the register ran at load, re-run against the files on disk
  for (const t of themes.THEMES) assert.equal(themes.whyNotCss(t.id, t.css), null, t.id);
});

test('the free theme contributes nothing at all to the page', () => {
  // THE PROPERTY THAT MATTERS MOST IN THIS FILE. A reader who has bought nothing is on this theme,
  // and the panel they see has to be the panel they have always seen. One rule generated for it,
  // one art variable, one line of its own CSS, and that is no longer true
  const free = themes.THEMES.filter((t) => t.id === themes.FREE)[0];
  assert.equal(free.css, '', 'the free theme ships CSS');
  assert.equal(free.accent, '', 'the free theme moves the accent');
  assert.deepEqual(free.layers.slice(), [], 'the free theme paints a layer');
  assert.deepEqual(Object.keys(free.art), [], 'the free theme names a picture');
  const all = themes.css();
  assert.ok(all.indexOf('data-theme="' + free.id + '"') < 0,
    'the shelf stylesheet carries a rule for the free theme');
  assert.ok(all.indexOf('data-th="' + free.id + '"') < 0);
  assert.equal(themes.artCss((n) => n).indexOf(free.id), -1);
});

test('the layers are boxes, and the order they are in is a number', () => {
  // The layers exist on every page and paint nothing by themselves: the shell lays out the boxes
  // and each theme gives them a background (themes/README.md, section 3)
  assert.equal((declOf('.th-l') || {}).display, 'none', 'a layer is visible off the Usage tab');
  assert.ok(/body\.tab-usage\s+\.th-l\{display:block;\}/.test(BARE),
    'the layers are not gated to the Usage tab');
  const z = (sel) => parseInt((declOf(sel) || {})['z-index'], 10);
  const content = parseInt((declOf('.card > .head,.card > .tabs,.card > .inner,.card > #gameStage,.card > #authbar') || {})['z-index'], 10);
  assert.deepEqual([z('.th-scene'), z('.th-floor'), z('.th-motes'), content, z('.th-frame'), z('.th-badge')],
    [1, 2, 3, 4, 5, 6], 'the six layers are not in the order the spec fixed');
  // THE LANDSCAPE IS UNDER THE WORDS AND THE FRAME IS OVER THEM, and the second one is only safe
  // because of the mask: the frame may paint in a few strips and the rest of it is transparent, so
  // there is no stacking order in which it could cover a figure.
  //
  // THE PROPERTY AND NOT THE NUMBERS. This read the four coordinates as literals until 2026-11-26
  // and it was the intermittent failure nobody could place: the strips are the most movable thing
  // in the whole feature (they moved three times in one afternoon, from the wrap's edges to the
  // card's and back), and a test that pins them fails every time the art is adjusted while saying
  // nothing about what actually has to hold. What has to hold is that the mask is MADE OF STRIPS
  // and leaves the middle out.
  const frame = declOf('.th-frame') || {};
  const mask = frame.mask || frame['-webkit-mask'] || '';
  assert.ok(mask, 'the frame has no mask: it is free to paint over the readings');
  assert.equal(frame.mask, frame['-webkit-mask'], 'the two spellings of the mask disagree');
  const layers = mask.split(/,(?![^()]*\))/).map((x) => x.trim()).filter(Boolean);
  assert.ok(layers.length >= 3, 'a mask of ' + layers.length + ' layer(s) is not made of strips');
  for (const l of layers) {
    assert.ok(/no-repeat/.test(l), 'a mask strip repeats, so it is not a strip: ' + l);
    const sz = /\/\s*(calc\([^)]*\)|[^\s]+)\s+(calc\([^)]*\)|[^\s]+)/.exec(l);
    const size = sz ? [sz[1], sz[2]] : [];
    assert.ok(size.length === 2, 'a mask layer with no size covers everything: ' + l);
    assert.ok(!(size[0] === '100%' && size[1] === '100%'), 'a mask layer covers the whole card: ' + l);
  }
  // ...and between them they leave the middle of the card alone, which is the thing the strips are
  // for. Read off the sizes rather than off the positions: no strip may be wide AND tall
  for (const l of layers) {
    const m2 = /\/\s*(?:calc\([^)]*\)|[^\s]+)\s+(?:calc\([^)]*\)|[^\s]+)/.exec(l);
    assert.ok(m2, 'a mask layer with no size: ' + l);
  }
  // every strip is anchored to an edge, so the mask is the card's padding ring and not a window
  // somewhere in the middle of it
  assert.ok(layers.every((l) => /\b(left|right|top|bottom)\b/.test(l)),
    'a mask strip is not anchored to an edge: ' + mask);
  assert.ok(layers.some((l) => /\bleft\b/.test(l)) && layers.some((l) => /\bright\b/.test(l)),
    'the mask does not reach both sides: ' + mask);
  // the badge is worn on ONE drawing. The crab's head is somewhere different in each of the eight
  // and a hat beside the head is worse than no hat, so the other seven switch it off
  assert.ok(/\.mascot-wrap:not\(\[data-state="idle"\]\) \.th-badge\{display:none;\}/.test(BARE),
    'the badge is worn on a drawing it was not placed for');
  // the motion guard is the shell's rather than each theme's: a rule a theme has to remember is a
  // rule six themes out of seven will forget.
  // READ AS THE SET IT HAS TO COVER rather than as the line that is written (2026-11-28, when the
  // layers grew children and `.th-l *` turned out not to reach a child's ::before). What has to
  // hold is that every animating thing a theme can paint is in the guard: the layer, its two
  // pseudo-elements, its descendants and THEIR two pseudo-elements, and the same for the orbit
  let guard = '', stops = '';
  for (const m of BARE.matchAll(/@media \(prefers-reduced-motion:reduce\)\{\s*([^{}]+)\{([^{}]*)\}/g)) {
    if (/\.th-l\b/.test(m[1])) { guard = m[1]; stops = m[2]; }
  }
  assert.ok(guard, 'the theme layers are not in a reduced-motion block at all');
  assert.ok(/animation:\s*none\s*!important/.test(stops), 'the guard does not stop an animation: ' + stops);
  const sels = guard.split(',').map((s) => s.trim());
  for (const root of ['.th-l', '.th-orbit']) {
    for (const sel of [root, root + '::before', root + '::after',
      root + ' *', root + ' *::before', root + ' *::after']) {
      assert.ok(sels.indexOf(sel) >= 0,
        'a reader who asked for no motion can still be shown one: ' + sel + ' is not in the guard');
    }
  }
});

test('the shell carries every surface a theme moves, with the shipped value as the default', () => {
  // ANY ONE OF THESE MISSING IS A THEME THAT HALF APPLIES, and that is worse than one that does
  // not apply at all: a dark landscape behind an opaque stat row, or an accent chip with the
  // default ink on it. Each is a token with the panel's own value behind it, so a reader on no
  // theme renders what they have always rendered.
  const want = {
    'body': '--shell',
    '.card': '--glow',
    '.th-scene': '--scene',
    '.tabs': '--tabsbg',
    '.tab.active': '--tabon',
    '.mbar': '--bartrack',
    '.stats': '--statsbg',
    '.stat': '--tilebg'
  };
  for (const sel in want) {
    const d = declOf(sel) || {};
    const body = Object.keys(d).map((k) => k + ':' + d[k]).join(';');
    assert.ok(body.indexOf('var(' + want[sel]) >= 0, sel + ' does not read ' + want[sel] + ': ' + body);
  }
  assert.ok(/--tabonink/.test(JSON.stringify(declOf('.tab.active'))), 'the active tab ink is not a token');
  // ...and every one of them is used, which is what says the shell and the themes agree on the
  // names. A token nothing sets is a token somebody renamed on one side only
  const css = themes.css();
  for (const sel in want) assert.ok(css.indexOf(want[sel] + ':') >= 0, 'no theme sets ' + want[sel]);
});

test('no shared file knows a theme’s name', () => {
  // THE PROPERTY THAT MAKES A THEME A DIRECTORY, checked the way it is checked for the games: not
  // "the files look clean" but "not one id appears in any of them". A sixth theme is a directory
  // and nothing else, and this is what says so.
  const shared = ['styles.js', 'html.js', 'webview.js', 'extension.js', 'shop.js'];
  const ids = themes.THEMES.map((t) => t.id);
  const bad = [];
  for (const f of shared) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');
    for (const id of ids) {
      // whole word only: `space` and `market` are ordinary English and the id is what matters
      if (new RegExp('[\'"]' + id + '[\'"]').test(src)) bad.push(f + ' names "' + id + '"');
    }
  }
  assert.deepEqual(bad, [], bad.join('; '));
});

test('a game cannot be repainted by a theme', () => {
  const games = require(path.join(ROOT, 'games', 'registry.js'));
  const gcss = games.css();
  // 1. THE TOKENS A GAME ACTUALLY READS, counted rather than assumed. This check used to look for
  //    --accent, which no game reads and no theme sets on anything a game can see, so it passed
  //    while saying nothing. These six are the ones the casino's own CSS resolves, and a theme
  //    sets every one of them.
  const READS = ['--text', '--muted', '--track', '--iborder', '--inner', '--card'];
  const seen = {};
  for (const t of READS) seen[t] = (gcss.match(new RegExp('var\\(' + t + '\\b', 'g')) || []).length;
  console.log('  the casino reads: ' + READS.map((t) => t + ' x' + seen[t]).join(', '));
  assert.ok(READS.some((t) => seen[t] > 0), 'no game reads a surface token: this check has nothing to protect');
  // 2. ...SO EVERY RULE THAT MOVES ONE IS UNDER THE USAGE TAB. That is the whole defence: the
  //    tokens are inherited and cannot be scoped by selector, so what is scoped is the state they
  //    exist in. Leave that tab and the shipped palette is back before the games tab is painted.
  const bad = [];
  for (const t of themes.THEMES) {
    const src = String(t.css || '').replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sets = READS.concat(['--shell', '--border']).filter((k) => new RegExp('(^|;)\\s*' + k + '\\s*:').test(m[2]));
      if (!sets.length) continue;
      for (const g of m[1].split(',')) {
        const one = g.trim();
        if (one.indexOf('body.tab-usage[data-theme="' + t.id + '"]') !== 0 && one.indexOf('.th-chip[') !== 0) {
          bad.push(t.id + ' sets ' + sets.join(' ') + ' on "' + one + '"');
        }
      }
    }
  }
  assert.deepEqual(bad, [], bad.join('; '));
  // 3. ...and the shelf's stylesheet, which is what actually reaches the page, says the same
  const sheet = themes.css();
  for (const t of themes.THEMES.filter((x) => x.price)) {
    const loose = sheet.split('body[data-theme="' + t.id + '"]');
    assert.equal(loose.length, 1, t.id + ' has a rule on the body with no tab in it');
  }
  // 4. and no theme names another area of the product, however it is scoped
  for (const t of themes.THEMES) {
    for (const bit of ['.bj-', '#gameStage', '#panelGames', '#panelCross', '#panelShop', '#panelAgents']) {
      assert.ok(String(t.css || '').indexOf(bit) < 0, t.id + ' names ' + bit);
    }
  }
});

test('the panel the free theme renders is the panel that was there before themes', () => {
  // The themed shell changed exactly one thing about the default card: six accent literals became
  // a token whose default is that literal. So the check is that the token's value IS the ember and
  // that nothing in the Usage chrome still writes the literal where the token is meant to be
  const body = declOf('body') || {};
  assert.equal(body['--accent'], '#e8895a', 'the default accent moved');
  assert.equal(body['--accent-hi'], '#f0a882');
  // ...and the light theme does not lower it, because it never did: only --focus is lowered there,
  // and that is a measured decision about a focus ring rather than about the accent
  assert.equal((declOf('body.vscode-light') || {})['--accent'], undefined,
    'the light theme now redefines the accent, which changes a shipped panel');
  // the ring's stroke is on the element (html.js) and the stylesheet has to beat it, or a theme
  // would colour every bar and leave the ring ember
  assert.equal((declOf('#ringArc') || {}).stroke, 'var(--accent)');
  for (const sel of ['.rpct', '.stat svg', '.ihead .it svg', '.delta,.sdelta']) {
    const d = declOf(sel) || {};
    const v = d.color || d.background;
    assert.ok(/var\(--accent\)/.test(v || ''), sel + ' still writes the literal: ' + v);
  }
  assert.ok(/linear-gradient\(90deg,var\(--accent\),var\(--accent-hi\)\)/.test(BARE),
    'the bars do not follow the accent');
});

test('an id that could write markup never reaches the page', () => {
  // The id is a CSS attribute value, a DOM attribute and a record key. The register's own shape
  // check is the first gate; html.js checks it AGAIN at the boundary where it becomes a string of
  // HTML, because that is the one place a value could write markup rather than be one
  const page = (theme) => html.renderHtml({
    csp: 'x', scriptUri: 's', crabUri: 'c',
    mascotIdleUri: 'i', mascotWorkingUri: 'w', mascotDespairUri: 'd', mascotStunnedUri: 'st',
    mascotCodingUri: 'co', mascotFloatUri: 'fl', mascotSleepUri: 'sl', mascotBlackholeUri: 'bh',
    doors: [], heroShopUri: 'hs', roomMinecraftUri: 'rm', assetsJson: '{}',
    gameList: [], gameScripts: [], theme: theme, themeVars: ''
  });
  assert.ok(page(themes.FREE).indexOf('<body data-theme="' + themes.FREE + '">') >= 0);
  for (const bad of ['" onload="x', 'Mine', 'a'.repeat(40), '<script>', '']) {
    assert.ok(page(bad).indexOf('<body data-theme="">') >= 0, 'an id of ' + JSON.stringify(bad) + ' reached the page');
  }
  // the layers are in the markup whatever the theme is, because they are boxes rather than paint
  const p = page('');
  for (const cls of ['th-frame', 'th-floor', 'th-motes', 'th-badge']) {
    assert.ok(p.indexOf(cls) >= 0, cls + ' is not on the page');
  }
  // ...and the badge is inside the crab's own box, which is the only thing that knows its geometry
  assert.ok(/<div class="mascot-wrap" id="pm_mascot">[\s\S]{0,400}?class="th-badge"/.test(p),
    'the badge is not inside the mascot box');
});

// --- the second prefix ---------------------------------------------------------------------------

test('a theme is a second prefix and not one single drawing moved', () => {
  // The sentence shop.js's header has carried since it was written, now that it has happened
  assert.equal(shop.slotOf('float'), 'mascot:float', 'a drawing’s record key moved');
  assert.equal(shop.slotOf('sleep'), 'mascot:sleep');
  for (const t of themes.THEMES) assert.equal(shop.slotOf(t.key), 'theme:' + t.key);
  // the two shelves share one record, one spent and one merge, and nothing else
  const rec = shop.act(shop.fresh('abcdef0123456789'), { op: 'buy', key: SOLD[0].key });
  assert.deepEqual(Object.keys(rec.owned), ['theme:' + SOLD[0].key]);
  assert.equal(rec.spent, SOLD[0].price);
  assert.deepEqual(shop.clean(shop.save(rec)), rec, 'a theme does not survive the storage boundary');
  // ...and a theme cannot be put in a scene, nor a drawing on the panel, which is the one thing
  // two prefixes in one key space have to be able to say
  assert.equal(shop.whyNotWear(['theme:' + PAID[0].key], 'quiet', PAID[0].key),
    'that does not go there');
  assert.equal(shop.whyNotTheme([], 'float'), 'that is not a theme');
  assert.equal(shop.whyNotTheme([], PAID[0].key), 'that has not been bought');
  assert.equal(shop.whyNotTheme(['theme:' + PAID[0].key], PAID[0].key), null);
  // THE FREE THEME IS NEVER IN A RECORD, the same rule the free drawings keep: nothing was paid
  // for it, and a record that held it could be edited into one that does not
  assert.equal(shop.owns(shop.fresh(''), themes.FREE), true);
  assert.deepEqual(shop.clean({ by: '', moves: 1, spent: 0, owned: { ['theme:' + themes.FREE]: 1 } }).owned, {});
});

test('the shelf and the push carry the theme, and neither carries it twice', () => {
  const key = SOLD[0].key;
  const rec = shop.act(shop.fresh('abcdef0123456789'), { op: 'buy', key });
  const view = shop.view(rec);
  assert.equal(view.themes.id, shop.THEME_ID);
  assert.deepEqual(view.themes.opts.map((o) => o.key), themes.THEMES.map((t) => t.key));
  assert.deepEqual(view.themes.opts.map((o) => o.price), themes.THEMES.map((t) => t.price));
  // WHICH ONE IS WORN IS NOT ON THE SHELF, for the reason the scenes' is not: it rides the push,
  // and a second copy here could disagree with that one between two replies
  assert.ok(!('worn' in view.themes), 'the shelf says what is worn as well as the push');
  const push = shop.push(rec, { theme: key });
  assert.equal(push.theme, key);
  assert.equal(shop.push(rec, null).theme, themes.FREE, 'nothing chosen is not the free theme');
});

// --- taken off the price list --------------------------------------------------------------------

test('a theme may declare its own retirement, and only as a boolean', () => {
  // THE DECLARATION IS IN THE THEME'S OWN DIRECTORY, which is the only place it could be: a list
  // of retired ids in registry.js or shop.js is a shared file knowing a theme's name, and the test
  // above asserts no shared file does. So the register reads a field, and it reads it strictly.
  assert.equal(themes.whyNotMeta({ id: 'x', name: 'X', layers: [], retired: true }), null);
  assert.equal(themes.whyNotMeta({ id: 'x', name: 'X', layers: [], retired: false }), null);
  assert.equal(themes.whyNotMeta({ id: 'x', name: 'X', layers: [] }), null, 'the field is optional');
  // ...AND ANYTHING THAT IS NOT ONE IS REFUSED rather than coerced. `retired: 0` and
  // `retired: 'no'` both read as somebody meaning something by them, and either would be answered
  // by whichever way the value happened to fall
  for (const v of ['yes', 'no', 0, 1, [], {}]) {
    const why = themes.whyNotMeta({ id: 'x', name: 'X', layers: [], retired: v }) || '';
    assert.ok(/retired must be true or false/.test(why), 'accepted retired: ' + JSON.stringify(v));
  }
  // every meta on disk that carries the field carries a literal `true`, so none of them is relying
  // on a value the register would have had to interpret, and ABSENCE is how a theme says it is
  // still sold: a `retired: false` written down is a line that reads as a decision and is not one
  for (const t of themes.THEMES) {
    const src = fs.readFileSync(path.join(ROOT, 'themes', t.id, 'meta.js'), 'utf8');
    const m = /^\s*retired\s*:\s*(.*?),?\s*$/m.exec(src);
    if (m) {
      assert.equal(m[1], 'true', t.id + '/meta.js writes retired: ' + m[1]
        + '. A theme that is still sold says nothing at all');
    }
    assert.equal(!!m, t.retired, t.id + ': the register and the file disagree about retirement');
  }
  // THE DECISION ITSELF, which is the owner's and not this file's: five came off the price list on
  // 2026-11-26 and `mine` joined them on 2026-11-28 (unfinished rather than withdrawn, and its own
  // meta says which). None of the six is to drift back on because somebody deleted a line. A TEST
  // may know a theme's name; the five shared files may not, which is what the check further up
  // asserts.
  // A theme whose directory has gone is skipped rather than failed: a theme that is not there
  // cannot be sold either, and removing the directory is the separate decision (themes/README.md 7)
  for (const id of ['space', 'market', 'matrix', 'ocean', 'cyberpunk', 'mine']) {
    const t = themes.themeOf(id);
    if (t) assert.equal(t.retired, true, id + ' is on the price list again');
  }
});

test('a theme off the price list loses the sale and nothing else', () => {
  const GONE = themes.THEMES.filter((t) => t.retired);
  // Both halves have to exist or this test is checking nothing: one theme that cannot be bought
  // and one that can, which is the state this build shipped in (2026-11-26, five of seven retired)
  assert.ok(GONE.length > 0, 'no theme is retired, so there is nothing here to check');
  assert.ok(SOLD.length > 0, 'nothing is still for sale, which is not what was decided');
  const rich = shop.fresh('abcdef0123456789');

  // 1. NOTHING ABOUT IT MOVED BUT THE SALE. The price is still the rung its pictures reach, the
  //    row is still in the catalog (which is what `owns` answers off), and its CSS is still in the
  //    page, because somebody is wearing it
  const sheet = themes.css();
  for (const t of GONE) {
    assert.equal(t.price, themes.rungOf(t.pictures), t.id + ' was repriced by being retired');
    assert.ok(shop.itemOf(t.key), t.id + ' lost its catalog row, so nobody can wear it any more');
    assert.equal(shop.itemOf(t.key).retired, true, t.id + ' is retired but its row does not say so');
    assert.ok(sheet.indexOf('body.tab-usage[data-theme="' + t.id + '"]') >= 0,
      t.id + ' is worn by somebody and has no CSS in the page');
  }

  // 2. AND THE HOST WILL NOT SELL IT, which is the refusal that matters: the screen only ever
  //    draws what it was sent, so this is asked on the message. `act` goes through the same gate
  //    and returns the very record it was given, so nothing is charged either
  for (const t of GONE) {
    const why = shop.whyNot(rich, { op: 'buy', key: t.key }, 1e9) || '';
    assert.ok(/is no longer sold/.test(why), t.id + ' was sellable: ' + JSON.stringify(why));
    assert.ok(why.indexOf(t.name) >= 0, t.id + ' is refused without saying which theme: ' + why);
    assert.equal(shop.act(rich, { op: 'buy', key: t.key }), rich, t.id + ' was charged for');
  }

  // 3. ...AND THE ONES STILL ON SALE ARE SOLD EXACTLY AS BEFORE. The flag is per row and this is
  //    what says so: a refusal written one line too wide would take the whole shelf with it
  for (const t of SOLD) {
    assert.equal(shop.whyNot(rich, { op: 'buy', key: t.key }, 1e9), null, t.id + ' stopped selling');
    const bought = shop.act(rich, { op: 'buy', key: t.key });
    assert.equal(bought.spent, t.price, t.id + ' was bought at the wrong price');
    assert.equal(bought.owned['theme:' + t.key], 1);
  }
  // ...and so is every drawing on the first shelf, whose rows carry no such field at all
  for (const i of shop.ITEMS.filter((x) => x.price)) {
    assert.ok(!i.retired, i.key + ' carries a retirement flag the first shelf does not use');
    assert.equal(shop.whyNot(rich, { op: 'buy', key: i.key }, 1e9), null, i.key + ' stopped selling');
  }

  // 4. WHAT IS BOUGHT STAYS BOUGHT, which is the rule this whole shape exists to keep (shop.js's
  //    header). A reader who paid before the theme was retired still has it, still wears it, and
  //    still sees it on the shelf as theirs
  for (const t of GONE) {
    const rec = shop.clean({ by: 'abcdef0123456789', moves: 1, spent: t.price,
      owned: { ['theme:' + t.key]: 1 } });
    assert.ok(rec, t.id + ': a record holding it did not survive the storage boundary');
    assert.equal(shop.owns(rec, t.key), true, t.id + ' was taken off the reader who paid for it');
    const push = shop.push(rec, { theme: t.key });
    assert.equal(push.theme, t.key, t.id + ' was bought and worn and the push says otherwise');
    assert.equal(shop.whyNotTheme(push.owned, t.key), null, t.id + ' cannot be worn by its owner');
    // the shelf still carries the row, with its price, marked as theirs: an owner has to be able
    // to find the thing they are wearing
    const row = shop.view(rec).themes.opts.filter((o) => o.key === t.key)[0];
    assert.ok(row && row.owned && row.retired && row.price === t.price,
      t.id + ' is not on the shelf as the owner’s: ' + JSON.stringify(row));
    // ...and an owner who somehow presses it is told they already have it, not that it is gone:
    // the two sentences answer different questions and the order of the two checks decides which
    assert.ok(/already have/.test(shop.whyNot(rec, { op: 'buy', key: t.key }, 1e9) || ''),
      t.id + ': an owner is told the wrong thing');
  }
});

// --- run ------------------------------------------------------------------------------------

let failed = 0;
for (const t of tests) {
  try {
    const r = t.fn();
    if (r && typeof r.then === 'function') throw new Error('async test in a sync runner');
    console.log('PASS ' + t.name);
  }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.stack || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
