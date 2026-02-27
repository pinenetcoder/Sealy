/* sprites.js — image-based sprites (PNG assets) + canvas fallback */

const PS = 4; // canvas-fallback pixel size

// ─── helpers ────────────────────────────────────────────────────────────────

function drawGrid(ctx, ox, oy, rows, pal, scale) {
  const s = Math.max(1, Math.round(PS * scale));
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const ch = rows[r][c];
      if (ch === '.' || !pal[ch]) continue;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(Math.round(ox + c * s), Math.round(oy + r * s), s, s);
    }
  }
}

// ─── SEAL ────────────────────────────────────────────────────────────────────
// Source: assets/seal-monk.png  160×32  — 5 frames of 32×32
// Sprites are magenta/purple toned → desaturate via ctx.filter to grey-brown

const SEAL_FRAME_W = 32;
const SEAL_FRAME_H = 32;
const SEAL_FRAME_COUNT = 5;

function drawSeal(ctx, x, y, scale, frameIdx) {
  const img = (typeof ASSETS !== 'undefined') ? ASSETS.seal : null;
  const ds  = (typeof DEVICE_SCALE !== 'undefined') ? DEVICE_SCALE : 1;
  const f = Math.floor(Math.abs(frameIdx || 0)) % SEAL_FRAME_COUNT;
  const dstW = Math.round(SEAL_FRAME_W * scale * ds);
  const dstH = Math.round(SEAL_FRAME_H * scale * ds);

  if (img && img.complete && img.naturalWidth > 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // shift purple hue → grey-brown seal
    ctx.filter = 'saturate(0.15) brightness(1.05)';
    ctx.drawImage(
      img,
      f * SEAL_FRAME_W, 0, SEAL_FRAME_W, SEAL_FRAME_H,
      Math.round(x), Math.round(y), dstW, dstH
    );
    ctx.restore();
  } else {
    _drawSealCanvas(ctx, x, y, scale);
  }
}

function sealSize(scale) {
  const ds = (typeof DEVICE_SCALE !== 'undefined') ? DEVICE_SCALE : 1;
  const s  = (scale || 1) * ds;
  return { w: Math.round(SEAL_FRAME_W * s), h: Math.round(SEAL_FRAME_H * s) };
}

// canvas fallback
const SEAL_PAL = {
  k:'#1c2b33', b:'#4a6475', g:'#6b8d9e', w:'#cce8f5', e:'#0a0a14', h:'#a0d8f0', f:'#2e4352',
};
const SEAL_GRID = [
  '....kkkkkk..',
  '...kbbbbbbk.',
  '..kbwwwwwgbk',
  '.kbwwehwwgbk',
  'kkbwwwwwwgbk',
  'kkbwwwwwwgbk',
  '.kbbwwwwbbk.',
  '.kk......kk.',
  '.ff......ff.',
];
function _drawSealCanvas(ctx, x, y, scale) {
  drawGrid(ctx, x, y, SEAL_GRID, SEAL_PAL, scale);
}

// ─── SHARK ───────────────────────────────────────────────────────────────────
// Source: assets/hai.png  592×564  — 4 cols × 4 rows, each cell 148×141
//   Row 0 (y=  0): top-down view
//   Row 1 (y=141): side-view facing LEFT  ← we use this
//   Row 2 (y=282): side-view facing RIGHT ← we use this
//   Row 3 (y=423): top-down (smaller)

const SHARK_CELL_W = 148;
const SHARK_CELL_H = 141;
const SHARK_FRAME_COUNT = 4;

// mouthOpen: 0 = closed, 1 = fully open (canvas overlay on sprite)
function drawShark(ctx, x, y, scale, mouthOpen, flipX, frameIdx) {
  const img = (typeof ASSETS !== 'undefined') ? ASSETS.shark : null;
  const ds  = (typeof DEVICE_SCALE !== 'undefined') ? DEVICE_SCALE : 1;
  mouthOpen = mouthOpen || 0;
  flipX     = flipX     || false;
  const f   = Math.floor(Math.abs(frameIdx || 0)) % SHARK_FRAME_COUNT;

  const dstW = Math.round(SHARK_CELL_W * scale * ds);
  const dstH = Math.round(SHARK_CELL_H * scale * ds);

  if (img && img.complete && img.naturalWidth > 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const srcRow = flipX ? 2 : 1;
    const srcX   = f * SHARK_CELL_W;
    const srcY   = srcRow * SHARK_CELL_H;

    const ox = Math.round(x);
    const oy = Math.round(y);
    ctx.drawImage(img, srcX, srcY, SHARK_CELL_W, SHARK_CELL_H, ox, oy, dstW, dstH);
    ctx.restore();
  } else {
    _drawSharkCanvas(ctx, x, y, scale, mouthOpen, flipX);
  }
}

function sharkSize(scale) {
  const ds = (typeof DEVICE_SCALE !== 'undefined') ? DEVICE_SCALE : 1;
  const s  = (scale || 1) * ds;
  return { w: Math.round(SHARK_CELL_W * s), h: Math.round(SHARK_CELL_H * s) };
}

// canvas fallback (previous implementation)
const SH = { k:'#1c2b33', fin:'#37474f', g:'#546e7a', G:'#607d8b', w:'#e8f0f5' };
function _drawSharkCanvas(ctx, x, y, scale, mouthOpen, flipX) {
  const s = Math.round(PS * scale);
  const gw = 26;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flipX) { ctx.translate(Math.round(x + gw * s), 0); ctx.scale(-1, 1); x = 0; }
  const ox = Math.round(x), oy = Math.round(y);
  function rect(col, row, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(ox + col * s, oy + row * s, w * s, h * s);
  }
  rect(11,0,2,1,SH.fin); rect(10,1,3,1,SH.fin); rect(9,2,5,1,SH.fin); rect(9,3,6,1,SH.fin);
  rect(0,3,2,1,SH.fin); rect(0,4,3,1,SH.g); rect(0,8,3,1,SH.g); rect(0,9,2,1,SH.fin);
  rect(2,4,23,1,SH.k); rect(2,5,23,1,SH.G); rect(2,6,20,1,SH.w); rect(2,7,20,1,SH.w);
  rect(2,8,23,1,SH.G); rect(2,9,23,1,SH.k);
  rect(2,6,2,2,SH.g); rect(22,6,3,2,SH.g);
  rect(20,5,1,1,'#0a0a14');
  const MOUTH_TOP=5, MOUTH_BOT=8, jawDrop=Math.round((mouthOpen||0)*4);
  if ((mouthOpen||0) < 0.05) {
    rect(22,MOUTH_TOP,4,MOUTH_BOT-MOUTH_TOP,SH.g);
    rect(25,MOUTH_TOP+1,1,MOUTH_BOT-MOUTH_TOP-2,SH.fin);
  } else {
    rect(22,MOUTH_TOP,4,2,SH.g); rect(22,MOUTH_BOT-1+jawDrop,4,2,SH.g);
    ctx.fillStyle='#08080e';
    const gt=oy+(MOUTH_TOP+2)*s, gb=oy+(MOUTH_BOT-1+jawDrop)*s;
    if(gb>gt) ctx.fillRect(ox+22*s,gt,4*s,gb-gt);
    ctx.fillStyle='#f0f0f0';
    for(let t=0;t<4;t++) if(t%2===0) ctx.fillRect(ox+(22+t)*s,oy+(MOUTH_TOP+2)*s,s,s);
    if(jawDrop>=2){ ctx.fillStyle='#e0e0e0'; for(let t=0;t<4;t++) if(t%2===1) ctx.fillRect(ox+(22+t)*s,oy+(MOUTH_BOT-1+jawDrop)*s-s,s,s); }
  }
  ctx.restore();
}

// ─── ORCA ────────────────────────────────────────────────────────────────────
// Source: assets/whale.png  400×400
// Single best frame (row 4): complete horizontal orca, facing LEFT.
// Animation is done programmatically via a gentle sin() y-bob — no frame cycling.
// direction: -1 = left (default), 1 = right (flipped)
// time: seconds (from performance.now()/1000), used for bobbing

const ORCA_FRAME = { x: 0, y: 228, w: 148, h: 58 };

function drawOrca(ctx, x, y, scale, direction, time) {
  const img = (typeof ASSETS !== 'undefined') ? ASSETS.orca : null;
  const ds  = (typeof DEVICE_SCALE !== 'undefined') ? DEVICE_SCALE : 1;
  direction = (direction === undefined) ? -1 : direction;
  const t   = time || 0;

  // gentle bob: ±4px at ~1.2 Hz (scaled)
  const bob = Math.sin(t * 1.2 * Math.PI * 2) * 4 * ds;
  const frame = ORCA_FRAME;
  const dstW  = Math.round(frame.w * scale * ds);
  const dstH  = Math.round(frame.h * scale * ds);
  const drawY = Math.round(y + bob);

  if (img && img.complete && img.naturalWidth > 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (direction === 1) {
      ctx.translate(Math.round(x + dstW), 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, 0, drawY, dstW, dstH);
    } else {
      ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, Math.round(x), drawY, dstW, dstH);
    }
    ctx.restore();
  } else {
    _drawOrcaCanvas(ctx, x, drawY, scale, direction);
  }
}

function orcaSize(scale) {
  const ds = (typeof DEVICE_SCALE !== 'undefined') ? DEVICE_SCALE : 1;
  const s  = (scale || 1) * ds;
  return { w: Math.round(ORCA_FRAME.w * s), h: Math.round(ORCA_FRAME.h * s) };
}

// canvas fallback
const OR = { k:'#101010', K:'#1a1a1a', w:'#efefef', W:'#e0e0e0', f:'#080808' };
function _drawOrcaCanvas(ctx, x, y, scale, direction) {
  const s = Math.round(PS * scale);
  const gw = 28;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (direction === 1) { ctx.translate(Math.round(x + gw * s), 0); ctx.scale(-1, 1); x = 0; }
  const ox = Math.round(x), oy = Math.round(y);
  function rect(col, row, w, h, color) { ctx.fillStyle = color; ctx.fillRect(ox+col*s, oy+row*s, w*s, h*s); }
  rect(12,0,2,1,OR.k); rect(11,1,3,1,OR.k); rect(10,2,4,1,OR.k); rect(10,3,5,1,OR.k); rect(9,4,7,1,OR.k);
  rect(0,3,2,1,OR.k); rect(0,4,3,2,OR.k); rect(0,9,3,2,OR.k); rect(0,11,2,1,OR.k);
  rect(2,5,25,1,OR.K); rect(2,6,25,4,OR.k); rect(2,10,25,1,OR.K);
  rect(6,7,16,1,OR.W); rect(5,8,18,1,OR.w); rect(5,9,18,1,OR.w); rect(6,10,16,1,OR.W);
  rect(21,5,4,2,OR.w); rect(22,6,2,1,OR.k);
  rect(10,10,5,1,OR.f); rect(10,11,3,1,OR.f);
  ctx.restore();
}

// ─── CRAB ────────────────────────────────────────────────────────────────────
// Source: assets/crab.png  256×128 — 4 cols × 2 rows, each frame 64×64
// Rows: 0 = walk cycle top, 1 = walk cycle bottom (8 frames total)
// Variety: hue-rotate tints for different crab colors

const CRAB_FRAME_W = 64;
const CRAB_FRAME_H = 64;
const CRAB_COLS    = 4;
const CRAB_ROWS    = 2;
const CRAB_FRAMES  = CRAB_COLS * CRAB_ROWS; // 8 total

// tint per variety index (hue-rotate degrees, 0 = original orange)
const CRAB_TINTS = [
  '',                    // 0 — orange (original)
  'hue-rotate(200deg)',  // 1 — blue
  'hue-rotate(100deg)',  // 2 — green
  'hue-rotate(310deg)',  // 3 — purple/pink
];

function drawCrab(ctx, x, y, scale, frameIdx, variety) {
  const img = (typeof ASSETS !== 'undefined') ? ASSETS.crab : null;
  const ds  = (typeof DEVICE_SCALE !== 'undefined') ? DEVICE_SCALE : 1;
  const f   = Math.floor(Math.abs(frameIdx || 0)) % CRAB_FRAMES;
  const col = f % CRAB_COLS;
  const row = Math.floor(f / CRAB_COLS);
  const dw  = Math.round(CRAB_FRAME_W * scale * ds);
  const dh  = Math.round(CRAB_FRAME_H * scale * ds);

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  const tint = CRAB_TINTS[variety % CRAB_TINTS.length] || '';
  if (tint) ctx.filter = tint;

  if (img && img.complete && img.naturalWidth) {
    ctx.drawImage(
      img,
      col * CRAB_FRAME_W, row * CRAB_FRAME_H, CRAB_FRAME_W, CRAB_FRAME_H,
      Math.round(x), Math.round(y), dw, dh
    );
  } else {
    // fallback: simple coloured circle
    ctx.fillStyle = tint ? '#6699ff' : '#e05010';
    ctx.beginPath();
    ctx.ellipse(Math.round(x + dw/2), Math.round(y + dh/2), dw*0.4, dh*0.3, 0, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
}

function crabSize(scale) {
  const ds = (typeof DEVICE_SCALE !== 'undefined') ? DEVICE_SCALE : 1;
  const s  = (scale || 1) * ds;
  return { w: Math.round(CRAB_FRAME_W * s), h: Math.round(CRAB_FRAME_H * s) };
}

// ─── BUBBLE ──────────────────────────────────────────────────────────────────
function drawBubble(ctx, x, y, r) {
  const cx = Math.round(x), cy = Math.round(y), ri = Math.round(r);
  ctx.strokeStyle = 'rgba(180,220,255,0.6)';
  ctx.lineWidth = Math.max(1, Math.round(r * 0.15));
  ctx.beginPath(); ctx.arc(cx, cy, ri, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(200,235,255,0.08)';
  ctx.beginPath(); ctx.arc(cx, cy, ri, 0, Math.PI * 2); ctx.fill();
  const hx = cx - Math.round(r*0.3), hy = cy - Math.round(r*0.3), hr = Math.max(1, Math.round(r*0.25));
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill();
}
