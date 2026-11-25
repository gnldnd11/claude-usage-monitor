# Adding a panel theme

> This is the contract. A theme that keeps it needs **no change** to `extension.js`, `webview.js`,
> `html.js`, `styles.js`, `shop.js` or `themes/registry.js`. **A theme is a directory and nothing
> else**, which is the same promise `games/README.md` makes about a game.

The stack is the extension's: **plain JavaScript, no dependencies, no build step.**

---

## 1. What you write

```
themes/<id>/meta.js      the whole of it
```

That is the list. There is no array to join: `themes/registry.js` reads this directory, and a
directory holding a `meta.js` is a theme. Nothing in it names any theme.

```js
'use strict';
module.exports = {
  id: 'mytheme',             // lower case, digits and dashes. It is a CSS attribute value,
                             // a DOM attribute and a record key, so it may hold nothing else
  name: 'My Theme',          // the shelf cell's label (its aria-label: the cell shows no words)
  order: 90,                 // where on the shelf. The shipped ones are spaced by ten
  layers: ['frame', 'floor', 'badge', 'motes'],   // WHICH AXES THIS THEME PAINTS. See below
  art: {},                   // optional: a PNG per picture layer, laid over the CSS. See section 5
  accent: '#8ed158',         // the one colour. Six hex digits, and it is MEASURED (see below)
  accentHi: '#bce88f',       // the bright end of the bars' gradient. Defaults to `accent`
  accentLight: '#3f7a22',    // optional: the accent on the LIGHT editor theme
  css: `...`                 // the whole of the theme, under your own scope. See section 3
};
```

**A theme carries its own surface and does not inherit the editor's.** A dark theme on a light
editor is the dark theme, not a dark drawing on a white card. So the token block is the first
thing in your `css`:

```css
body.tab-usage[data-theme="mytheme"]{
  --shell:#070e08;           /* the webview floor, outside the card */
  --card:#0f1a10;            /* the card. Every contrast in section 4 is measured against THIS */
  --inner:#0f1a10;
  --text:#e8f3df;--muted:#9bb48e;      /* MOVE THESE WITH THE CARD. See section 4 */
  --border:#1e3020;--iborder:#1e3020;
  --track:#24381f;--bartrack:rgba(0,0,0,.52);--ringtrack:rgba(0,0,0,.46);
  --glow:0 0 0 1px #24411f, 0 0 24px -4px rgba(163,217,74,.38);   /* the card's rim light */
  --scene:<the card's own backdrop>;                              /* see the layer table below */
  --tabsbg:rgba(0,0,0,.34);--tabon:var(--accent);--tabonink:#0d0d0f;
  --statsbg:transparent;--tilebg:transparent;  /* so the floor shows through the stat row */
}
```

Every one of those has the shipped panel's own value behind it in `styles.js`, so a theme that
sets none of them renders the panel exactly as it has always rendered.

**There is no `price` and you may not add one.** The register refuses a meta that carries it.

---

## 2. The four axes, and the price

```
frame   the card's border art. In from the top corners, MIDDLE LEFT CLEAR
floor   a landscape behind the bottom of the card, under the stat row
badge   something the mascot wears
motes   slow drifting specks, drawn by your CSS
```

**The rung is the number of PICTURES, which is `frame`, `floor` and `badge`.** Motes and the accent
are the stylesheet's and cost nobody a drawing, so they are not counted.

```
free    0 pictures    the default theme, and only it
1K      1 picture
10K     2 or 3
100K    4 to 7        unclaimed
1000K   8 or more     unclaimed
```

A theme stands on the **highest rung its count reaches**, the way four frames and five frames are
one rung on the mascot shelf. Taking a layer away makes a theme cheaper by itself and nobody has
to remember to edit a number.

The count is read off **`layers`, not off `art`**: the layer is what was designed, and a
placeholder painted in CSS is scaffolding rather than a cheaper theme. Counting the files would
make every theme free until the drawings land and then reprice the shelf under everyone who had
already bought one.

---

## 3. The CSS, and the two scopes

Your `css` is concatenated into the page's one stylesheet beside every game's and the panel's own,
so the register **checks** rather than trusts it. Two scopes and no more:

```
body.tab-usage[data-theme="<id>"] ...   the panel, while this theme is worn AND the
                                        Usage tab is open
.th-chip[data-th="<id>"] ...       your cell on the shelf, which is drawn whatever is worn
```

Anything outside those **costs the theme its row**, with a line in `registry.PROBLEMS` that
`test/themes.test.js` asserts is empty, and which `extension.js` copies into the output channel so
a reader who has bought the theme can see why it stopped applying.

**The tab is in the scope and that is not tidiness.** A theme's surface tokens are inherited, and
the casino's own CSS reads six of them: `--text` 25 times, `--muted` 21, `--track` 7, `--iborder`
6, `--inner` 5, `--card` 4. Scoped to the body alone, buying a theme would repaint the blackjack
felt, the market and the mine, and the visual check this product needs would be multiplied by the
length of the shelf. On any other tab the class is off, the tokens are gone, and every game draws
in the palette it was drawn for.

**And a selector naming another area is refused however it is scoped**: `.bj-`, `#gameStage`,
`#panelGames`, `#panelCross`, `#panelShop`, `#panelAgents`. Scoping to the Usage tab already means
such a rule could not be seen; this is the difference between cannot be seen and cannot be written.

**At-rules are allowed by name.** `@media`, `@supports` and your own `@keyframes`, and nothing
else: `@font-face`, `@property` and `@page` are global and a theme would be reaching the whole
product through them.

**Every `@keyframes` you declare has to be named `th-<id>-...`.** An animation name is global to
the document, so a theme that declared `pulse` would restyle the panel from inside its own block,
and two themes that both declared `drift` would be one animation.

### What the register writes for you, so you do not write it five times

- `--accent` and `--accent-hi`, from the colours above, plus the active tab taking the accent
- the same two on your shelf chip
- a theme with a **floor** gets `#panelUsage`, `.stats` and `.stat` made see-through, because the
  landscape is behind an opaque panel otherwise and you have painted something nobody can see

Your own rules come **after** those, so you can override anything written for you.

### What the stylesheet already owns (`styles.js`, the `.th-l` block)

The six layer elements, their stacking order, the clip to the card, the frame's mask, the motes'
mask and the reduced-motion guard. **You give a layer a background; you do not place it.**

*** THE WHOLE OF `styles.js` IS ONE TEMPLATE LITERAL. A BACKTICK IN A COMMENT THERE STOPS THE
EXTENSION LOADING. *** It happened twice while this directory was being written.

```
1  .th-scene    the card's backdrop        -> --scene
2  .th-floor    230 x 156, on the floor    -> background
3  .th-motes    the drifting specks        -> background + animation
4  THE CARD'S CONTENT.  Every reading on the panel
5  .th-frame    250 x the panel, MASKED    -> background
6  .th-badge    88 x 74, the crab's box    -> background
   .th-orbit    inside the ring, off by default
```

**Five and six are over the words and that is not a slip.** In the reference the vines and the pit
timbers lie ON the card's corners. What keeps them off the text is not the z-index, it is the
**mask**: the frame may paint in four strips and the rest of it is transparent.

```
A  left post    x   0..24     full height    the header crab starts at x25
B  right post   x 227..250    full height    the fold button is x201..225
C  top left     x   0..62     y 0..40        an arch or a vine spills in here
D  top right    x 188..250    y 0..40        something hangs. It ENDS above the fold button (y46)
```

**C and D are why the card has 30px of top padding** instead of 14. The panel is 16px taller for
it, for every theme including the free one, so the two never differ in height.

The floor is the other way round and stays **under** the words, because a landscape is a long soft
shape with no edge to mask to. What keeps it legible is section 4's measurement and one rule:
**a bright object on the floor goes above or below the stat row's band, never across it.**

**The badge is drawn for the quiet crab and for no other.** The head is somewhere different in each
of the eight mascot drawings, so the other seven switch it off (`styles.js`); a hat floating beside
the head is worse than no hat.

### The floor's objects live in the bottom 34px

**Measured against the shipped panel and not against a mockup**, which is the mistake this
directory was built on once: the mockup carries three bars and three figures, the shipped panel
carries a `(7d)` second line, a resets line under each bar and a name under every stat, and a
156px landscape laid out against the first one is drawn straight across the second one's numbers.

Under the last line of the stat row there are **39px** that always stack up (a stat tile's own
bottom padding 10, the inner's 13, the card's 14, the border), whatever the bars above do. So:

- **every object is anchored to the card's floor** (`left Npx bottom Npx`, never a top offset) and
  fits in the bottom 34px
- **the ground is the LAST background layer.** The first layer in CSS is the topmost, and a ground
  written first paints over everything after it: the first port of this had an ore cart, its
  wheels and its rails all under an opaque ground, and what reached the screen was a 4px lip of
  gold crossing a figure. The reader has called that kind of thing a bug before, and they are right
- **what will not read at 34px comes out.** A half-drawn object reads as a defect, not as scenery

### The motes paint where there is no text

The shell masks them to the card's top band and its bottom band (`styles.js`). A speck sitting on
a glyph does not read as weather, it reads as dirt on the screen. **Do not write a mask of your
own on `.th-motes`**; the one theme that did had a tighter one and it was dropped, because the
rule belongs to the shell rather than to whoever remembers it.

The layers are drawn on the **Usage tab only** (`body.tab-usage .th-l`). A game's screen, the
crossroads and the shop never see one.

## 4. The colours are measured, twice

**First against your own tokens**, at load, by the register:

```
accent  4.5:1   against YOUR --card and YOUR --inner
text    4.5:1   against YOUR --card
muted   3:1     against YOUR --card
```

Under that and the theme **costs itself its row**, with the measured figures in the message. The
surfaces are read out of your own token block, so a theme that moves its card and leaves the
panel's grey text on it fails here rather than on somebody's screen. Only the **dark** surfaces are
gated: ember itself measures 2.57:1 on the light card, so a gate the shipped panel fails is a gate
nobody can pass.

**And then against the render, which is the one that matters.** A figure on this panel does not sit
on a token, it sits on a stack of gradients and a landscape, and no arithmetic over the token
values can see that. Six failures hid behind a passing token table in the mockup, the worst of them
at 1.29:1 under the stat row. So:

```bash
node tools/shoot-panels.mjs --only usage --theme dark --width 250 --plain \
  --panel-theme mytheme --out <somewhere that is not media/>
```

`--plain` renders the scene with every reading taken off it, in place. Crop each band (the element
boxes come from `--probe rect:.stats,rect:#toggle,...`) and take the **2% and 98% luminance
quantiles** of it: the 98% is the brightest the scene gets under a figure, and that is what the
ratio is taken against. `docs/panel-themes/spec.md` section 6 holds the method and the ceilings.

## 5. The CSS is the finished article, and a PNG is an upgrade

**Every theme in this directory is drawn by the stylesheet and is complete with no asset at all.**
A PNG is a way to raise the quality of one layer later, not a thing the theme is waiting for.

The three picture layers still carry their boxes, so a drawing drops into one without anything else
moving, and the swap is **one declaration and one line**:

```js
art: { frame: 'theme-mytheme-frame.png' },   // 1. name the file (it lives in the repository ROOT)
```
```css
/* 2. and in your own css, where the gradients were: */
background:var(--th-frame) top center/100% auto no-repeat;
```

The host resolves each filename into a webview URI and the register emits it as `--th-frame`,
`--th-floor`, `--th-badge` (`themes/registry.js`, `artCss`). `media/**` is not published, so the
PNG goes in the repository root beside `hero-mine.png`.

**AND THE PRICE DOES NOT MOVE WHEN IT HAPPENS.** The rung is counted off `layers`, not off `art`:
what was designed is three pictures whether they are painted in CSS today or in a PNG next month.
Counting the files instead would make every theme in this directory free, which is the one reading
of "the CSS is the finished article" that would be wrong.

## 6. The eight

```
plain       Default         free      the panel as it has always looked
mine        Coal Face       10K
forest      Forest          10K
space       Deep Field      10K       the only one with something in the ring (.th-orbit)
market      Trading Floor   10K       a BLUE accent: see below
matrix      Phosphor        10K
ocean       Ocean           10K
cyberpunk   Cyberpunk       10K
```

Seven pictures of three layers each, so all seven land on the same rung. That is the count saying
they are the same amount of drawing, and if a ninth theme ships two layers or four it will price
itself.

**The trading floor is blue and not red-and-green**, which is the one palette decision in here that
is not taste: the burn ramp a theme may **not** touch is red (`webview.js`), so a market drawn in
red and green would be putting the warning colour on the decoration.

## 7. Running it

```bash
npm test          # test/themes.test.js is the register's, and there is no list to join
```

Then load the extension and look at the panel at a **250px** sidebar, which is the width this
product is built for and the width a frame is most likely to eat the content at.
