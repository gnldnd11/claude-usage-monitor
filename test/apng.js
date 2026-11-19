// Where the drawing actually IS inside an APNG, read out of the file.
//
// WHY A TEST NEEDS THIS. The mascot's six drawings are fitted into one fixed box (styles.js,
// .mascot-wrap) and the burn-rate bubble has a tail that points down at the crab's head, so where
// that bubble sits depends on where the ink starts. Until now the test computed that from the
// IHDR alone, which is the CANVAS, and a canvas is not a drawing: on 2026-11-19 two of the six were
// enlarged with transparent padding to bring the crab down to the size of the other four, and
// because the padding kept the ratio the canvas rendered at exactly the same size. The test saw
// nothing. The screen did: the bubble went on pointing at the top of the canvas, which is now empty
// space well above the crab.
//
// So this reads the PIXELS, and only what the question needs: the smallest rectangle outside which
// every frame is fully transparent. No image library is added for it (this repository has no
// dependencies and is not getting one), and none is needed: node's own zlib does the inflating and
// a PNG scanline filter is nine lines of arithmetic.
//
// WHAT IT HANDLES, and what it refuses rather than guesses at: 8-bit RGBA, non-interlaced, which is
// what all six of these files are (and what any export of them will be). Anything else throws,
// because a silently wrong answer here is a bubble pointing at nothing again.
'use strict';
const fs = require('fs');
const zlib = require('zlib');

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunksOf(buf) {
  const out = [];
  let p = 8;
  while (p + 12 <= buf.length) {
    const len = buf.readUInt32BE(p);
    out.push({ type: buf.toString('ascii', p + 4, p + 8), data: buf.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  return out;
}

// The IHDR, which is the canvas every frame is composed onto
function header(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  return {
    w: buf.readUInt32BE(16), h: buf.readUInt32BE(20),
    depth: buf[24], color: buf[25], interlace: buf[28]
  };
}

// One frame's scanlines, un-filtered in place. The five filters are the PNG spec's, and `a`, `b`
// and `c` are the pixel to the left, the one above and the one above-left, which read as zero
// outside the image rather than wrapping
function unfilter(raw, w, h) {
  const bpp = 4, stride = w * bpp;
  if (raw.length < h * (stride + 1)) throw new Error('short frame: ' + raw.length + ' for ' + w + 'x' + h);
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const o = y * stride, up = o - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[o + x - bpp] : 0;
      const b = y > 0 ? out[up + x] : 0;
      const c = (x >= bpp && y > 0) ? out[up + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else if (f !== 0) throw new Error('unknown PNG filter ' + f);
      out[o + x] = v & 0xff;
    }
  }
  return out;
}

// Every frame, as its own rectangle on the canvas plus its pixels. An APNG frame is announced by an
// fcTL; the FIRST one may be the IDAT (a file whose still image is also frame one, which all six of
// these are) and the rest arrive as fdAT chunks, each carrying a four-byte sequence number this
// does not need. One frame's zlib stream can be split across several chunks, so they are joined.
function framesOf(buf) {
  const ihdr = header(buf);
  if (ihdr.depth !== 8 || ihdr.color !== 6) throw new Error('expected 8-bit RGBA, got depth ' + ihdr.depth + ' colour type ' + ihdr.color);
  if (ihdr.interlace) throw new Error('interlaced PNGs are not read here');
  const out = [];
  const idat = [];
  let cur = null;
  let plays = null, delays = [];
  for (const c of chunksOf(buf)) {
    if (c.type === 'acTL') plays = c.data.readUInt32BE(4);   // 0 is "for ever"
    else if (c.type === 'fcTL') {
      // the frame's own delay, as the numerator and denominator the format stores it in
      delays.push({ num: c.data.readUInt16BE(20), den: c.data.readUInt16BE(22) || 100 });
    }
  }
  for (const c of chunksOf(buf)) {
    if (c.type === 'fcTL') {
      cur = {
        w: c.data.readUInt32BE(4), h: c.data.readUInt32BE(8),
        x: c.data.readUInt32BE(12), y: c.data.readUInt32BE(16), parts: [], still: false
      };
      out.push(cur);
    } else if (c.type === 'IDAT') {
      idat.push(c.data);
      if (cur) cur.still = true;            // this frame's data is the still image's
    } else if (c.type === 'fdAT') {
      if (cur) cur.parts.push(c.data.subarray(4));
    }
  }
  if (!out.length) throw new Error('no fcTL: this is not an animated PNG');
  for (const f of out) {
    const z = f.still ? Buffer.concat(idat) : Buffer.concat(f.parts);
    if (!z.length) throw new Error('a frame carried no data');
    f.px = unfilter(zlib.inflateSync(z), f.w, f.h);
  }
  return { ihdr, frames: out, plays, delays };
}

// The smallest rectangle on the canvas outside which a frame is wholly transparent, or null for a
// frame that is. Coordinates are the canvas's, which is what the frame's own offset is for
function inkOf(f) {
  let top = Infinity, bottom = -1, left = Infinity, right = -1;
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      if (f.px[(y * f.w + x) * 4 + 3] === 0) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (bottom < 0) return null;
  return { top: top + f.y, bottom: bottom + f.y, left: left + f.x, right: right + f.x };
}

// What a caller asks for: the canvas, and where the ink is in it.
//
// `ink` is the UNION over every frame, which is the highest the drawing ever reaches. That is the
// bound the bubble needs: a tail placed against it can never cover the crab's head in any frame,
// where a tail placed against the average or the last frame would be buried in the ones where the
// crab stands taller. `spread` is how far the top of the ink travels over the animation, so a
// drawing that moves far enough for that choice to matter says so out loud instead of being
// quietly averaged.
function read(file) {
  const buf = fs.readFileSync(file);
  const { ihdr, frames, plays, delays } = framesOf(buf);
  const boxes = frames.map(inkOf).filter(Boolean);
  if (!boxes.length) throw new Error('every frame is transparent: ' + file);
  const ink = boxes.reduce((a, b) => ({
    top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom),
    left: Math.min(a.left, b.left), right: Math.max(a.right, b.right)
  }));
  const tops = boxes.map((b) => b.top);
  return {
    w: ihdr.w, h: ihdr.h,
    frames: frames.length,
    drawn: boxes.length,
    // 0 means it loops for ever, which is what a mascot has to do: a drawing that plays once and
    // stops is a still picture a few hundred milliseconds after the panel opens
    plays,
    // milliseconds per frame, as the file states them
    delays: delays.map((d) => Math.round((d.num / d.den) * 1000)),
    ink,
    spread: Math.max(...tops) - Math.min(...tops)
  };
}

module.exports = { read, header };
