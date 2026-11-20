// Fit a drawing the user made into the box this panel draws mascots in, WITHOUT TOUCHING A PIXEL
// OF THE ART.
//
// The six (now eight) mascots are the user's own pixel art and this repository does not redraw
// them (CLAUDE.md, docs/shop-spec.md section 7-2). What it does do, and has done by hand twice, is
// move the transparent margin around them: the panel fits each canvas into one 88x74 box with
// `contain` and stands it on the floor, so the canvas's empty border is what decides how big the
// crab comes out and where its head is. Doing that by hand is how 2026-11-19 happened, when two
// canvases were padded and the speech bubble went on pointing at the space the padding made.
//
// So this does the one operation that is safe and states the result:
//
//   crop   cut the canvas down to the smallest rectangle that holds the ink of EVERY frame
//   pad    put a given margin back around it, symmetrically
//
// Both are lossless: no resampling, no recolouring, no frame dropped, and the delays, the loop
// count and the frame count come out the other side unchanged. The output is 8-bit RGBA,
// non-interlaced, every frame a full canvas with dispose/blend NONE/SOURCE, which is the shape
// test/apng.js reads and the shape the two inputs already had.
//
// Cropping to the ink has a second effect worth naming, because a test depends on it: the ink then
// fills the canvas exactly, so it is centred in the box by construction, and the "and at the middle
// of it" check in test/panel-css.test.js cannot fail by a drawing sitting off-centre in its own
// transparent border.
//
//   node tools/fit-mascot.mjs <in.png> <out.png> [--pad <px>]
//
// It prints the canvas, the ink box and the frame data of both ends so the numbers that go into
// docs/shop-spec.md are read off a run rather than worked out twice.
import fs from 'node:fs';
import zlib from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
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

// --- reading ------------------------------------------------------------------------------------
// The same arithmetic test/apng.js uses, and deliberately the same refusals: anything that is not
// 8-bit RGBA non-interlaced throws rather than being guessed at, because a wrong guess here is a
// silently mangled drawing.
function unfilter(raw, w, h) {
  const bpp = 4, stride = w * bpp;
  if (raw.length < h * (stride + 1)) throw new Error('short frame');
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

function read(file) {
  const buf = fs.readFileSync(file);
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG: ' + file);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (buf[24] !== 8 || buf[25] !== 6) throw new Error('expected 8-bit RGBA, got depth ' + buf[24] + ' colour ' + buf[25]);
  if (buf[28]) throw new Error('interlaced PNGs are not read here');
  let plays = null;
  const frames = [];
  const idat = [];
  let cur = null;
  for (const c of chunksOf(buf)) {
    if (c.type === 'acTL') plays = c.data.readUInt32BE(4);
    else if (c.type === 'fcTL') {
      cur = {
        w: c.data.readUInt32BE(4), h: c.data.readUInt32BE(8),
        x: c.data.readUInt32BE(12), y: c.data.readUInt32BE(16),
        num: c.data.readUInt16BE(20), den: c.data.readUInt16BE(22) || 100,
        dispose: c.data[24], blend: c.data[25], parts: [], still: false
      };
      frames.push(cur);
    } else if (c.type === 'IDAT') { idat.push(c.data); if (cur) cur.still = true; }
    else if (c.type === 'fdAT') { if (cur) cur.parts.push(c.data.subarray(4)); }
  }
  if (!frames.length) throw new Error('no fcTL: not an animated PNG');
  // THE ONE SHAPE THIS TOOL WILL CROP. A frame smaller than the canvas, or one that blends onto or
  // keeps what came before it, means the frame as stored is not the frame as shown, and cropping
  // the stored one would move the composed one. Refuse instead: compositing here would be a second
  // renderer in a repository that has none.
  for (const f of frames) {
    if (f.w !== w || f.h !== h || f.x || f.y) throw new Error('a frame is not the whole canvas: this tool only crops full-canvas frames');
    if (f.dispose !== 0 || f.blend !== 0) throw new Error('a frame disposes or blends (' + f.dispose + '/' + f.blend + '): only NONE/SOURCE is cropped here');
    const z = f.still ? Buffer.concat(idat) : Buffer.concat(f.parts);
    if (!z.length) throw new Error('a frame carried no data');
    f.px = unfilter(zlib.inflateSync(z), w, h);
  }
  return { w, h, plays, frames };
}

// The smallest rectangle outside which EVERY frame is fully transparent
function inkUnion(img) {
  let top = Infinity, bottom = -1, left = Infinity, right = -1;
  for (const f of img.frames) {
    for (let y = 0; y < img.h; y++) {
      for (let x = 0; x < img.w; x++) {
        if (f.px[(y * img.w + x) * 4 + 3] === 0) continue;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bottom < 0) throw new Error('every frame is transparent');
  return { top, bottom, left, right };
}

// --- writing ------------------------------------------------------------------------------------
// One scanline, filtered the way every encoder does it: try the five and keep the one whose bytes
// sum smallest as signed values, which is a stand-in for how well the line will deflate.
function filterRows(px, w, h) {
  const bpp = 4, stride = w * bpp;
  const out = Buffer.alloc(h * (stride + 1));
  const cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];
  for (let y = 0; y < h; y++) {
    const o = y * stride, up = o - stride;
    const score = [0, 0, 0, 0, 0];
    for (let x = 0; x < stride; x++) {
      const v = px[o + x];
      const a = x >= bpp ? px[o + x - bpp] : 0;
      const b = y > 0 ? px[up + x] : 0;
      const c = (x >= bpp && y > 0) ? px[up + x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      const vals = [v, v - a, v - b, v - ((a + b) >> 1), v - pr];
      for (let f = 0; f < 5; f++) {
        const t = vals[f] & 0xff;
        cand[f][x] = t;
        score[f] += t < 128 ? t : 256 - t;
      }
    }
    let best = 0;
    for (let f = 1; f < 5; f++) if (score[f] < score[best]) best = f;
    out[y * (stride + 1)] = best;
    cand[best].copy(out, y * (stride + 1) + 1);
  }
  return out;
}

function write(file, w, h, plays, frames) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const actl = Buffer.alloc(8);
  actl.writeUInt32BE(frames.length, 0); actl.writeUInt32BE(plays >>> 0, 4);
  const parts = [SIG, chunk('IHDR', ihdr), chunk('acTL', actl)];
  let seq = 0;
  frames.forEach((f, i) => {
    const fctl = Buffer.alloc(26);
    fctl.writeUInt32BE(seq++, 0);
    fctl.writeUInt32BE(w, 4); fctl.writeUInt32BE(h, 8);
    fctl.writeUInt32BE(0, 12); fctl.writeUInt32BE(0, 16);
    fctl.writeUInt16BE(f.num, 20); fctl.writeUInt16BE(f.den, 22);
    fctl[24] = 0; fctl[25] = 0;
    parts.push(chunk('fcTL', fctl));
    const z = zlib.deflateSync(filterRows(f.px, w, h), { level: 9 });
    if (i === 0) parts.push(chunk('IDAT', z));
    else {
      const sn = Buffer.alloc(4);
      sn.writeUInt32BE(seq++, 0);
      parts.push(chunk('fdAT', Buffer.concat([sn, z])));
    }
  });
  parts.push(chunk('IEND', Buffer.alloc(0)));
  fs.writeFileSync(file, Buffer.concat(parts));
}

// --- the run ------------------------------------------------------------------------------------
const args = process.argv.slice(2);
const flags = {};
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--pad') { flags.pad = Number(args[++i]); continue; }
  if (args[i].startsWith('--')) { console.error('unknown flag ' + args[i]); process.exit(2); }
  files.push(args[i]);
}
if (files.length !== 2) { console.error('usage: node tools/fit-mascot.mjs <in.png> <out.png> [--pad <px>]'); process.exit(2); }
const pad = Number.isFinite(flags.pad) ? Math.max(0, Math.round(flags.pad)) : 0;

const src = read(files[0]);
const ink = inkUnion(src);
const iw = ink.right - ink.left + 1, ih = ink.bottom - ink.top + 1;
const ow = iw + pad * 2, oh = ih + pad * 2;
const frames = src.frames.map((f) => {
  const px = Buffer.alloc(ow * oh * 4);
  for (let y = 0; y < ih; y++) {
    f.px.copy(px, ((y + pad) * ow + pad) * 4, ((y + ink.top) * src.w + ink.left) * 4, ((y + ink.top) * src.w + ink.right + 1) * 4);
  }
  return { px, num: f.num, den: f.den };
});
write(files[1], ow, oh, src.plays, frames);

console.log('in   ' + files[0]);
console.log('     canvas ' + src.w + 'x' + src.h + ', ink ' + iw + 'x' + ih
  + ' at (' + ink.left + ',' + ink.top + '), ' + src.frames.length + ' frames, plays ' + src.plays
  + ', ' + src.frames.map((f) => Math.round((f.num / f.den) * 1000)).join('/') + 'ms');
console.log('out  ' + files[1]);
console.log('     canvas ' + ow + 'x' + oh + ', pad ' + pad + ', ' + fs.statSync(files[1]).size + ' bytes');
