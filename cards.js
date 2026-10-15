// Seeded card decks, shared by the crab's games. Pure: no vscode, no state, no game rules.
//
// Split out of blackjack.js when high-low arrived: two games dealing from two copies of the same
// shuffle is how the copies drift apart. Nothing here knows what a card is worth: that is a rule,
// and rules live in the game.
//
// A card is a code 0..51: suit * 13 + rank index, with the ranks in the order below. `cardOf` turns
// one into { r, s } for the webview; `codeOf` reads 'AS', '10H', 'KD' back, for stacked test shoes.

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['S', 'H', 'D', 'C'];
const DECKS = 6;

// FNV-1a: seed string -> 32-bit integer
function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// mulberry32: small, fast 32-bit PRNG, uniform in [0, 1)
function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One unshuffled deck, in code order: the only place that knows a deck is 52 cards
function freshDeck() {
  const deck = [];
  for (let c = 0; c < 52; c++) deck.push(c);
  return deck;
}

// An unshuffled shoe: DECKS full decks, in code order. Blackjack and high-low deal from six decks
// and draw poker from one, and neither count is a parameter: a deck count that only one game could
// pass is a difference waiting to appear
function freshShoe() {
  const shoe = [];
  for (let d = 0; d < DECKS; d++) for (const code of freshDeck()) shoe.push(code);
  return shoe;
}

// Fisher-Yates from the seed. Returns a new array; the input is left alone, so a caller may hand
// over the cards left from an earlier shoe without copying them first
function shuffle(codes, seed) {
  const rand = mulberry32(hashSeed(String(seed)));
  const out = codes.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}

function shuffledShoe(seed) {
  return shuffle(freshShoe(), seed);
}

// A seeded stream of uniform [0, 1) values, for a game that rolls odds instead of dealing cards
// (the forge). It is here and not in that game because this is where the one seeded source lives:
// a second copy of mulberry32 in the repo is how the two copies drift apart, which is the same
// reason the deck moved out of blackjack.js.
// One rule comes with it: a seed is either a shuffle's or a roll's, never both. A seed that names
// a deck must not also be rolled against, or the roll is a window onto cards still face down.
function rollsFrom(seed) {
  return mulberry32(hashSeed(String(seed)));
}

// 'AS', '10H', 'KD' -> card code (a stacked shoe, for tests and replays)
function codeOf(str) {
  const s = String(str);
  const r = RANKS.indexOf(s.slice(0, -1));
  const u = SUITS.indexOf(s.slice(-1));
  if (r < 0 || u < 0) throw new RangeError('bad card: ' + s);
  return u * 13 + r;
}

function cardOf(code) {
  return { r: RANKS[code % 13], s: SUITS[Math.floor(code / 13)] };
}

// hashSeed and mulberry32 stay inside: what a game needs is a shuffle or a stream of rolls, and a
// raw PRNG on the way out is an invitation to roll something else from a seed that is already a deck
module.exports = { RANKS, SUITS, DECKS, freshDeck, freshShoe, shuffle, shuffledShoe, rollsFrom, codeOf, cardOf };
