const fs = require('fs');

// Build the NPC sprite catalog. Each entry is per-sprite metadata (cell size, columns,
// which rows/frames are front-facing idle vs walk, category, sheet URL/size). The webview
// crops to the measured bounding box so every sprite renders at a consistent size.
//
// Dependencies are injected so this stays free of vscode/path specifics:
//   spriteUri(name) -> webview-safe URL string for the given asset file
//   bboxPath        -> absolute path to sprite-bbox.json (measured character bboxes)
function buildNpcCatalog(spriteUri, bboxPath) {
  const D = (o) => Object.assign({ cell: 64, cols: 6, idleRow: 0, idleCol: 0, idleFrames: 6, walkRow: 1, walkFrames: 6, cat: 'human' }, o);
  // Kenmi front-facing character sheets: row0 = front idle/walk. Cell size & frames verified per sheet.
  const FRONT = { idleRow: 0, idleCol: 0, idleFrames: 1, walkRow: 0 };
  const npcs = {};
  // --- human ---
  [['bartender', 384, 448], ['bartender2', 384, 448], ['chef', 384, 448], ['farmer', 384, 832], ['farmer2', 384, 832], ['fisherman', 576, 832], ['lumberjack', 384, 640], ['miner', 384, 640]]
    .forEach(([k, w, h]) => { npcs[k] = D({ u: spriteUri('npc-' + k + '.png'), w, h }); }); // NPCs: row0 idle / row1 walk
  npcs.witch = D(Object.assign({ u: spriteUri('hum-witch.png'), w: 192, h: 288, cell: 32, cols: 6, walkFrames: 6 }, FRONT));
  npcs.angel1 = D(Object.assign({ u: spriteUri('hum-angel1.png'), w: 512, h: 832, cell: 64, cols: 8, walkFrames: 6 }, FRONT));
  npcs.angel2 = D(Object.assign({ u: spriteUri('hum-angel2.png'), w: 512, h: 832, cell: 64, cols: 8, walkFrames: 6 }, FRONT));
  ['archer', 'spearman', 'swordman', 'templar'].forEach((k) => { npcs['knight_' + k] = D(Object.assign({ u: spriteUri('hum-knight-' + k + '.png'), w: 288, h: 624, cell: 48, cols: 6, walkFrames: 6 }, FRONT)); });
  // 32px front-facing humanoids (Santa, Desert NPCs, Player) — verified 32px, row0 front
  [['santa', 'hum-santa', 192, 320, 6], ['santa_helper', 'hum-santa-helper', 256, 320, 8], ['desert1', 'hum-desert1', 192, 320, 6], ['desert2', 'hum-desert2', 192, 320, 6], ['desert3', 'hum-desert3', 192, 320, 6], ['desert4', 'hum-desert4', 192, 320, 6], ['player', 'hum-player', 192, 320, 6], ['pharaoh', 'hum-pharaoh', 256, 320, 8]]
    .forEach(([k, file, w, h, cols]) => { npcs[k] = D(Object.assign({ u: spriteUri(file + '.png'), w, h, cell: 32, cols, walkFrames: 6 }, FRONT)); });
  // --- monster ---
  npcs.slime = D({ u: spriteUri('mon-slime.png'), w: 512, h: 192, cell: 64, cols: 8, idleFrames: 4, walkRow: 1, walkFrames: 8, cat: 'monster' });
  npcs.skeleton = D(Object.assign({ u: spriteUri('mon-skeleton.png'), w: 192, h: 320, cell: 32, cols: 6, walkFrames: 6, cat: 'monster' }, FRONT));
  npcs.goblin_thief = D(Object.assign({ u: spriteUri('mon-goblin-thief.png'), w: 192, h: 416, cell: 32, cols: 6, walkFrames: 4, cat: 'monster' }, FRONT));
  npcs.goblin_maceman = D(Object.assign({ u: spriteUri('mon-goblin-maceman.png'), w: 192, h: 416, cell: 32, cols: 6, walkFrames: 4, cat: 'monster' }, FRONT));
  npcs.goblin_archer = D(Object.assign({ u: spriteUri('mon-goblin-archer.png'), w: 288, h: 624, cell: 48, cols: 6, walkFrames: 4, cat: 'monster' }, FRONT));
  npcs.goblin_spearman = D(Object.assign({ u: spriteUri('mon-goblin-spearman.png'), w: 288, h: 624, cell: 48, cols: 6, walkFrames: 4, cat: 'monster' }, FRONT));
  // 32px front-facing undead (skeleton variants, mummy)
  [['skel_bowman', 'mon-skel-bowman', 192, 416, 6], ['skel_mage', 'mon-skel-mage', 256, 416, 8], ['skel_swordman', 'mon-skel-swordman', 256, 512, 8], ['mummy', 'mon-mummy', 192, 416, 6]]
    .forEach(([k, file, w, h, cols]) => { npcs[k] = D(Object.assign({ u: spriteUri(file + '.png'), w, h, cell: 32, cols, walkFrames: 6, cat: 'monster' }, FRONT)); });
  // big slimes (directionless: idle row0 / move row1), 5 colours
  ['blue', 'green', 'pink', 'red', 'yellow'].forEach((c) => { npcs['slime_big_' + c] = D({ u: spriteUri('mon-slime-big-' + c + '.png'), w: 512, h: 256, cell: 64, cols: 8, idleFrames: 4, walkRow: 1, walkFrames: 8, cat: 'monster' }); });
  // frog folded into monsters for now (animal category held back)
  npcs.frog = D({ u: spriteUri('ani-frog.png'), w: 320, h: 128, cell: 32, cols: 10, idleFrames: 2, walkRow: 1, walkFrames: 8, cat: 'monster' });
  // attach measured character bounding boxes ([x,y,w,h] in cell px) so the webview can crop to the character
  try {
    const bbox = JSON.parse(fs.readFileSync(bboxPath, 'utf8'));
    Object.keys(npcs).forEach((k) => { const fn = npcs[k].u.split('/').pop().split('?')[0]; if (bbox[fn]) npcs[k].bb = bbox[fn]; });
  } catch (e) { /* no bbox file → renderer falls back to full cell */ }
  return npcs;
}

module.exports = { buildNpcCatalog };
