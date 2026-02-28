// entities.js — NPC fish: Shark and Orca

// Global responsive scale factor.
// Reference: MacBook M4 15.3" viewport (~900px short side) = 1.0
// Smaller screens scale proportionally down. Updated by game.js on resize.
let DEVICE_SCALE = 1;

// ─── Base Fish ────────────────────────────────────────────────────────────────
class Fish {
  constructor(x, y, speed) {
    this.x     = x;
    this.y     = y;
    this.speed = speed;

    // angle in radians: 0 = right, π = left
    this.angle    = Math.random() < 0.5 ? 0 : Math.PI;
    this.targetAngle = this.angle;

    this.turnTimer    = 0;
    this.turnInterval = 2 + Math.random() * 3; // seconds between direction changes

    this.time = Math.random() * 100; // random phase offset
  }

  // soft random direction change
  _pickNewAngle() {
    // mostly horizontal swimming: bias angle toward 0 or π
    const base = Math.random() < 0.5 ? 0 : Math.PI;
    return base + (Math.random() - 0.5) * 0.5; // ±0.25 rad vertical tilt
  }

  update(dt) {
    this.time      += dt;
    this.turnTimer += dt;

    // pick new direction periodically
    if (this.turnTimer >= this.turnInterval) {
      this.turnTimer    = 0;
      this.turnInterval = 2 + Math.random() * 3;
      this.targetAngle  = this._pickNewAngle();
    }

    // soft boundary turning — push targetAngle away from edges
    // strength grows from 0 (at margin) to 1 (at edge), scaled by dt
    const MARGIN = 140 * DEVICE_SCALE;
    if (this.x < MARGIN) {
      const s = (1 - this.x / MARGIN) * dt * 3.5;
      this.targetAngle = _lerpAngle(this.targetAngle, 0, s);
    }
    if (this.x > WIDTH - MARGIN) {
      const s = (1 - (WIDTH - this.x) / MARGIN) * dt * 3.5;
      this.targetAngle = _lerpAngle(this.targetAngle, Math.PI, s);
    }
    if (this.y < MARGIN) {
      const s = (1 - this.y / MARGIN) * dt * 2.5;
      this.targetAngle = _lerpAngle(this.targetAngle, Math.PI * 0.5, s);
    }
    if (this.y > HEIGHT - MARGIN) {
      const s = (1 - (HEIGHT - this.y) / MARGIN) * dt * 2.5;
      this.targetAngle = _lerpAngle(this.targetAngle, -Math.PI * 0.5, s);
    }

    // smoothly turn current angle toward target — slower = more graceful arc
    const diff = _angleDiff(this.targetAngle, this.angle);
    this.angle += diff * Math.min(1, dt * 1.4);

    // move forward (speed scales with screen size)
    this.x += Math.cos(this.angle) * this.speed * DEVICE_SCALE * dt;
    this.y += Math.sin(this.angle) * this.speed * DEVICE_SCALE * dt;

    // hard clamp — last resort, should rarely trigger now
    this.x = _clamp(this.x, 0, WIDTH);
    this.y = _clamp(this.y, 20, HEIGHT - 20);
  }

  // axis-aligned bounding box (override in subclasses with correct size)
  getBounds() {
    return { x: this.x - 40, y: this.y - 20, w: 80, h: 40 };
  }

  // is fish visually facing right?
  get facingRight() {
    return Math.cos(this.angle) > 0;
  }
}

// ─── Angle helpers ────────────────────────────────────────────────────────────
function _angleDiff(target, current) {
  let d = target - current;
  while (d >  Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function _lerpAngle(a, b, t) {
  return a + _angleDiff(b, a) * t;
}

function _clamp(v, lo, hi) {
  if (lo === undefined) return v; // called with 1 arg as no-op
  return Math.max(lo, Math.min(hi, v));
}

// ─── Shark ────────────────────────────────────────────────────────────────────
// 4–5 on screen, medium speed, scale ~0.55
const SHARK_SCALE   = 0.55;
const SHARK_COUNT   = 4;

class Shark extends Fish {
  constructor(x, y) {
    const speed = 60 + Math.random() * 50; // 60–110 px/s
    super(x, y, speed);
    this.scale     = SHARK_SCALE * (0.85 + Math.random() * 0.3); // slight size variety
    this.frameIdx  = Math.random() * 4;
    this.frameSpeed = 6 + Math.random() * 3; // frames per second
  }

  startBite() {
    this.biting    = true;
    this.biteTimer = 0;
  }

  update(dt) {
    super.update(dt);
    this.frameIdx += this.frameSpeed * dt;
    if (this.biting) {
      this.biteTimer += dt;
      if (this.biteTimer > 0.7) this.biting = false;
    }
  }

  getBounds() {
    const sz = sharkSize(this.scale);
    // use 70% of visual size for forgiving hitbox
    const pw = sz.w * 0.70;
    const ph = sz.h * 0.50;
    return {
      x: this.x - pw / 2,
      y: this.y - ph / 2,
      w: pw,
      h: ph,
    };
  }

  draw(ctx) {
    const sz  = sharkSize(this.scale);
    const ox  = Math.round(this.x - sz.w / 2);
    const oy  = Math.round(this.y - sz.h / 2);
    drawShark(ctx, ox, oy, this.scale, 0, this.facingRight, this.frameIdx);

    // red flash on bite
    if (this.biting && this.biteTimer < 0.35) {
      const alpha = 0.45 * (1 - this.biteTimer / 0.35);
      ctx.save();
      ctx.globalAlpha    = alpha;
      ctx.fillStyle      = '#ff2020';
      ctx.shadowColor    = '#ff4040';
      ctx.shadowBlur     = 20;
      ctx.beginPath();
      ctx.ellipse(Math.round(this.x), Math.round(this.y), sz.w * 0.45, sz.h * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

// ─── Orca ─────────────────────────────────────────────────────────────────────
// 2–3 on screen, slower and more majestic, scale ~1.4
const ORCA_SCALE = 1.4;
const ORCA_COUNT = 2;

class Orca extends Fish {
  constructor(x, y) {
    const speed = 45 + Math.random() * 30; // 45–75 px/s — slower than sharks
    super(x, y, speed);
    this.scale        = ORCA_SCALE * (0.9 + Math.random() * 0.2);
    this.turnInterval = 3 + Math.random() * 4; // turns less often
  }

  startBite() {
    this.biting    = true;
    this.biteTimer = 0;
  }

  update(dt) {
    super.update(dt);
    if (this.biting) {
      this.biteTimer += dt;
      if (this.biteTimer > 0.7) this.biting = false;
    }
  }

  getBounds() {
    const sz = orcaSize(this.scale);
    return {
      x: this.x - sz.w * 0.4,
      y: this.y - sz.h * 0.4,
      w: sz.w * 0.8,
      h: sz.h * 0.8,
    };
  }

  draw(ctx) {
    const sz  = orcaSize(this.scale);
    const ox  = Math.round(this.x - sz.w / 2);
    const oy  = Math.round(this.y - sz.h / 2);
    const dir = this.facingRight ? 1 : -1;
    drawOrca(ctx, ox, oy, this.scale, dir, this.time);

    // white flash on bite (orcas flash white, not red)
    if (this.biting && this.biteTimer < 0.35) {
      const alpha = 0.5 * (1 - this.biteTimer / 0.35);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = '#ffffff';
      ctx.shadowColor = '#aaddff';
      ctx.shadowBlur  = 24;
      ctx.beginPath();
      ctx.ellipse(Math.round(this.x), Math.round(this.y), sz.w * 0.45, sz.h * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

// ─── Seal (player) ───────────────────────────────────────────────────────────
const SEAL_SCALE_BASE = 2.2;

class Seal {
  constructor() {
    this.x     = WIDTH  / 2;
    this.y     = HEIGHT / 2;

    // idle drift
    this.driftAngle    = Math.random() * Math.PI * 2;
    this.driftTimer    = 0;
    this.driftInterval = 2.5 + Math.random() * 1.5;

    // visual
    this.scale        = SEAL_SCALE_BASE;
    this.targetScale  = SEAL_SCALE_BASE;
    this.frameIdx     = 0;
    this.time         = 0;

    // state
    this.state      = 'idle'; // 'idle' | 'grabbed' | 'dying' | 'dead'
    this.grabbed    = false;
    this.deathTimer = 0;
    this.alpha      = 1;

    // facing
    this.facingRight = true;
    this.prevX       = this.x;
  }

  // half-size of the visual circle (glow radius) used as screen margin
  _margin() {
    const sz = sealSize(this.scale);
    return Math.round(Math.max(sz.w, sz.h) * 0.55);
  }

  // called by Game for arrow key movement (direct offset)
  moveBy(dx, dy) {
    const m = this._margin();
    this.x = _clamp(this.x + dx, m, WIDTH  - m);
    this.y = _clamp(this.y + dy, m, HEIGHT - m);
    // update facing direction
    if (Math.abs(dx) > 0.1) this.facingRight = dx > 0;
  }

  // called by Game when pointer moves
  moveTo(px, py) {
    const m = this._margin();
    // clamp the TARGET so the seal never gets dragged outside the viewport
    const tx = _clamp(px, m, WIDTH  - m);
    const ty = _clamp(py, m, HEIGHT - m);
    // lerp toward clamped finger position
    this.x += (tx - this.x) * 0.25;
    this.y += (ty - this.y) * 0.25;
    // final hard clamp (in case of rounding or fast movement)
    this.x = _clamp(this.x, m, WIDTH  - m);
    this.y = _clamp(this.y, m, HEIGHT - m);
  }

  // hitbox with generous grab radius (+12px)
  getGrabBounds() {
    const sz = sealSize(this.scale);
    const pad = 12;
    return {
      x: this.x - sz.w / 2 - pad,
      y: this.y - sz.h / 2 - pad,
      w: sz.w + pad * 2,
      h: sz.h + pad * 2,
    };
  }

  // smaller hitbox for collision with sharks (70% of visual)
  getBounds() {
    const sz = sealSize(this.scale);
    const pw = sz.w * 0.70;
    const ph = sz.h * 0.70;
    return { x: this.x - pw / 2, y: this.y - ph / 2, w: pw, h: ph };
  }

  update(dt) {
    if (this.state === 'dead') return;

    if (this.state === 'dying') {
      this.deathTimer += dt;
      // shake X
      this.x += Math.sin(this.deathTimer * 60) * 3;
      // shrink + fade
      const t = Math.min(1, this.deathTimer / 0.55);
      this.scale = SEAL_SCALE_BASE * (1 - t);
      this.alpha = 1 - t;
      if (this.deathTimer >= 0.55) {
        this.state = 'dead';
        this.alpha = 0;
      }
      return;
    }

    this.time      += dt;
    this.frameIdx  += 5 * dt; // ~5 fps animation

    // facing direction based on horizontal movement
    const dx = this.x - this.prevX;
    if (Math.abs(dx) > 0.3) this.facingRight = dx > 0;
    this.prevX = this.x;

    if (this.state === 'idle') {
      // gentle bob on Y
      const bob = Math.sin(this.time * 1.8) * 3;

      // slow drift
      this.driftTimer += dt;
      if (this.driftTimer >= this.driftInterval) {
        this.driftTimer    = 0;
        this.driftInterval = 2.5 + Math.random() * 1.5;
        this.driftAngle    = Math.random() * Math.PI * 2;
      }
      this.x += Math.cos(this.driftAngle) * 15 * DEVICE_SCALE * dt;
      this.y += Math.sin(this.driftAngle) * 15 * DEVICE_SCALE * dt + bob * dt;
    }

    // scale lerp: bigger when grabbed
    this.targetScale = this.grabbed ? SEAL_SCALE_BASE * 1.15 : SEAL_SCALE_BASE;
    this.scale += (this.targetScale - this.scale) * Math.min(1, dt * 8);

    // universal clamp — applies in all states (idle, grabbed, dead)
    const m = this._margin();
    this.x = _clamp(this.x, m, WIDTH  - m);
    this.y = _clamp(this.y, m, HEIGHT - m);
  }

  draw(ctx) {
    if (this.state === 'dead' || this.scale <= 0) return;

    const sz = sealSize(this.scale);
    const ox = Math.round(this.x - sz.w / 2);
    const oy = Math.round(this.y - sz.h / 2);
    ctx.globalAlpha = this.alpha;

    // glow / shadow when grabbed
    if (this.grabbed) {
      ctx.save();
      ctx.shadowColor = 'rgba(120, 210, 255, 0.55)';
      ctx.shadowBlur  = 18;
      ctx.fillStyle   = 'rgba(120, 210, 255, 0.18)';
      ctx.beginPath();
      ctx.ellipse(
        Math.round(this.x), Math.round(this.y),
        sz.w * 0.55, sz.h * 0.45,
        0, 0, Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
    }

    // flip context if facing left
    ctx.save();
    if (!this.facingRight) {
      ctx.translate(Math.round(this.x) * 2, 0);
      ctx.scale(-1, 1);
    }
    drawSeal(ctx, ox, oy, this.scale, this.frameIdx);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// ─── Crab (collectible) ───────────────────────────────────────────────────────
// Slow bottom-dwellers, 4 visual varieties (color tint), random size

class Crab {
  constructor(x, y, variety) {
    this.x       = x;
    this.y       = y;
    this.variety = variety !== undefined ? variety : Math.floor(Math.random() * 4);
    this.scale   = 0.28 + Math.random() * 0.18;

    this.speed        = 18 + Math.random() * 22;
    this.angle        = Math.random() * Math.PI * 2;
    this.targetAngle  = this.angle;
    this.turnTimer    = 0;
    this.turnInterval = 2 + Math.random() * 4;

    this.frameIdx    = Math.random() * 8;
    this.frameSpeed  = 8 + Math.random() * 4;
    this.wobblePhase = Math.random() * Math.PI * 2;

    this.alive = true;
  }

  update(dt) {
    if (!this.alive) return;

    this.turnTimer += dt;
    if (this.turnTimer >= this.turnInterval) {
      this.turnTimer    = 0;
      this.turnInterval = 2 + Math.random() * 4;
      this.targetAngle  = Math.random() * Math.PI * 2;
    }

    // soft boundary push — same approach as Fish
    const MARGIN = 90;
    if (this.x < MARGIN) {
      const s = (1 - this.x / MARGIN) * dt * 3;
      this.targetAngle = _lerpAngle(this.targetAngle, 0, s);
    }
    if (this.x > WIDTH - MARGIN) {
      const s = (1 - (WIDTH - this.x) / MARGIN) * dt * 3;
      this.targetAngle = _lerpAngle(this.targetAngle, Math.PI, s);
    }
    if (this.y < MARGIN) {
      const s = (1 - this.y / MARGIN) * dt * 3;
      this.targetAngle = _lerpAngle(this.targetAngle, Math.PI * 0.5, s);
    }
    if (this.y > HEIGHT - MARGIN) {
      const s = (1 - (HEIGHT - this.y) / MARGIN) * dt * 3;
      this.targetAngle = _lerpAngle(this.targetAngle, -Math.PI * 0.5, s);
    }

    // smoothly steer toward target angle — crabs turn slower than fish
    const diff = _angleDiff(this.targetAngle, this.angle);
    this.angle += diff * Math.min(1, dt * 1.0);

    this.x += Math.cos(this.angle) * this.speed * DEVICE_SCALE * dt;
    this.y += Math.sin(this.angle) * this.speed * DEVICE_SCALE * dt;

    this.wobblePhase += dt * 1.8;
    this.frameIdx    += this.frameSpeed * dt;

    const cm = 30 * DEVICE_SCALE;
    this.x = _clamp(this.x, cm, WIDTH  - cm);
    this.y = _clamp(this.y, cm, HEIGHT - cm);
  }

  getBounds() {
    const sz = crabSize(this.scale);
    const pw = sz.w * 0.60;
    const ph = sz.h * 0.60;
    return { x: this.x - pw/2, y: this.y - ph/2, w: pw, h: ph };
  }

  draw(ctx) {
    if (!this.alive) return;
    const sz = crabSize(this.scale);

    // tilt based on horizontal component of swim angle + gentle oscillation
    const hDir = Math.cos(this.angle) >= 0 ? 1 : -1;
    const tilt  = hDir * 22 * Math.PI / 180
                + Math.sin(this.wobblePhase * 1.3) * 8 * Math.PI / 180;

    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    ctx.rotate(tilt);
    drawCrab(ctx, -Math.round(sz.w / 2), -Math.round(sz.h / 2), this.scale, this.frameIdx, this.variety);
    ctx.restore();
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

// random position at least minDist px away from screen center
function _safePos(minDist) {
  const cx = WIDTH / 2, cy = HEIGHT / 2;
  let x, y;
  do {
    x = 80 + Math.random() * (WIDTH  - 160);
    y = 80 + Math.random() * (HEIGHT - 160);
  } while (Math.hypot(x - cx, y - cy) < minDist);
  return { x, y };
}

function spawnSharks() {
  const sharks = [];
  for (let i = 0; i < SHARK_COUNT; i++) {
    const { x, y } = _safePos(220);
    sharks.push(new Shark(x, y));
  }
  return sharks;
}

// spawn a single creature from a random screen edge
function _edgeSpawn() {
  const edge = Math.floor(Math.random() * 4);
  if (edge === 0) return { x: Math.random() * WIDTH, y: 60 };
  if (edge === 1) return { x: Math.random() * WIDTH, y: HEIGHT - 60 };
  if (edge === 2) return { x: 60,           y: 80 + Math.random() * (HEIGHT - 160) };
  return              { x: WIDTH - 60,    y: 80 + Math.random() * (HEIGHT - 160) };
}

// spawn from the edge corner farthest from (sx, sy)
// both axes are constrained to the opposite half so the enemy is never near the seal
function _edgeSpawnAwayFrom(sx, sy) {
  const spawnLeft = sx >= WIDTH  / 2; // seal is right → spawn on left side
  const spawnTop  = sy >= HEIGHT / 2; // seal is bottom → spawn on top

  if (Math.random() < 0.5) {
    // horizontal edge, x biased to the opposite horizontal half
    return {
      x: spawnLeft
        ? Math.random() * (WIDTH / 2)
        : WIDTH / 2 + Math.random() * (WIDTH / 2),
      y: spawnTop ? 60 : HEIGHT - 60,
    };
  } else {
    // vertical edge, y biased to the opposite vertical half
    return {
      x: spawnLeft ? 60 : WIDTH - 60,
      y: spawnTop
        ? 80 + Math.random() * (HEIGHT / 2 - 80)
        : HEIGHT / 2 + Math.random() * (HEIGHT / 2 - 80),
    };
  }
}

function spawnOneShark(sx, sy) {
  const { x, y } = (sx != null) ? _edgeSpawnAwayFrom(sx, sy) : _edgeSpawn();
  return new Shark(x, y);
}

function spawnOneOrca(sx, sy) {
  const { x, y } = (sx != null) ? _edgeSpawnAwayFrom(sx, sy) : _edgeSpawn();
  return new Orca(x, y);
}

function spawnOrcas() {
  const orcas = [];
  for (let i = 0; i < ORCA_COUNT; i++) {
    const { x, y } = _safePos(220);
    orcas.push(new Orca(x, y));
  }
  return orcas;
}

const CRAB_COUNT = 4; // crabs alive at a time

function spawnCrabs() {
  const crabs = [];
  for (let i = 0; i < CRAB_COUNT; i++) {
    crabs.push(new Crab(
      80 + Math.random() * (WIDTH  - 160),
      80 + Math.random() * (HEIGHT - 160),
      i % 4
    ));
  }
  return crabs;
}

function spawnOneCrab() {
  return new Crab(
    80 + Math.random() * (WIDTH  - 160),
    80 + Math.random() * (HEIGHT - 160),
    Math.floor(Math.random() * 4)
  );
}
