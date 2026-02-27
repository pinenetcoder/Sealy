// ocean.js — animated underwater background

// ─── Bubble ──────────────────────────────────────────────────────────────────
class Bubble {
  constructor(x, y, r, speed, opacity) {
    this.x       = x;
    this.y       = y;
    this.r       = r;
    this.speed   = speed;
    this.opacity = opacity;
    this.wobble  = Math.random() * Math.PI * 2; // phase for horizontal drift
  }

  update(dt) {
    this.y       -= this.speed * dt;
    this.wobble  += dt * 1.2;
    this.x       += Math.sin(this.wobble) * 0.4;

    // respawn at bottom when off-screen
    if (this.y + this.r < 0) {
      this.y = HEIGHT + this.r;
      this.x = Math.random() * WIDTH;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.opacity;

    // rim
    ctx.strokeStyle = `rgba(160, 210, 255, 0.8)`;
    ctx.lineWidth   = Math.max(1, this.r * 0.12);
    ctx.beginPath();
    ctx.arc(Math.round(this.x), Math.round(this.y), this.r, 0, Math.PI * 2);
    ctx.stroke();

    // inner fill
    ctx.fillStyle = `rgba(180, 225, 255, 0.06)`;
    ctx.beginPath();
    ctx.arc(Math.round(this.x), Math.round(this.y), this.r, 0, Math.PI * 2);
    ctx.fill();

    // highlight
    const hx = Math.round(this.x - this.r * 0.3);
    const hy = Math.round(this.y - this.r * 0.3);
    const hr = Math.max(1, Math.round(this.r * 0.28));
    ctx.fillStyle = `rgba(255, 255, 255, 0.55)`;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// ─── Seaweed ─────────────────────────────────────────────────────────────────
class Seaweed {
  constructor(x) {
    this.x       = x;
    this.height  = 40 + Math.random() * 60;   // 40–100 px
    this.segments = Math.round(this.height / 14);
    this.phase   = Math.random() * Math.PI * 2;
    this.color   = Math.random() < 0.5 ? '#1a4a2a' : '#0e3020';
  }

  update(dt) {
    this.phase += dt * 0.9;
  }

  draw(ctx) {
    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    ctx.beginPath();
    const baseY = HEIGHT;
    ctx.moveTo(this.x, baseY);

    for (let i = 1; i <= this.segments; i++) {
      const t    = i / this.segments;
      const segY = baseY - t * this.height;
      const sway = Math.sin(this.phase + t * Math.PI) * 8 * t;
      ctx.lineTo(this.x + sway, segY);
    }

    ctx.stroke();
    ctx.restore();
  }
}

// ─── Ocean ───────────────────────────────────────────────────────────────────
class Ocean {
  constructor() {
    this.time = 0;

    // gradient cached on first draw
    this._gradient = null;

    // 3 layers of bubbles: small/slow, medium, large/fast
    this.bubbles = [];
    this._spawnBubbles(18, { rMin:  2, rMax:  5, sMin: 18, sMax: 30, oMin: 0.20, oMax: 0.40 });
    this._spawnBubbles(10, { rMin:  6, rMax: 10, sMin: 28, sMax: 45, oMin: 0.12, oMax: 0.25 });
    this._spawnBubbles( 6, { rMin: 11, rMax: 18, sMin: 40, sMax: 60, oMin: 0.07, oMax: 0.15 });

    // seaweed along the bottom
    this.seaweeds = [];
    const count = 14;
    for (let i = 0; i < count; i++) {
      const x = (WIDTH / count) * i + Math.random() * (WIDTH / count);
      this.seaweeds.push(new Seaweed(x));
    }

    // light shimmer phase
    this.shimmer = 0;
  }

  _spawnBubbles(n, { rMin, rMax, sMin, sMax, oMin, oMax }) {
    for (let i = 0; i < n; i++) {
      const r = rMin + Math.random() * (rMax - rMin);
      this.bubbles.push(new Bubble(
        Math.random() * WIDTH,
        Math.random() * HEIGHT,     // start scattered (not all at bottom)
        r,
        sMin + Math.random() * (sMax - sMin),
        oMin + Math.random() * (oMax - oMin)
      ));
    }
  }

  update(dt) {
    this.time    += dt;
    this.shimmer += dt;
    for (const b of this.bubbles)  b.update(dt);
    for (const s of this.seaweeds) s.update(dt);
  }

  draw(ctx) {
    // ── gradient background ─────────────────────────────────────────────────
    if (!this._gradient) {
      const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      g.addColorStop(0.00, '#1a2d44'); // surface (+15%)
      g.addColorStop(0.35, '#1c3350'); // deep blue (+15%)
      g.addColorStop(0.75, '#182840'); // deeper (+15%)
      g.addColorStop(1.00, '#142030'); // bottom (+15%)
      this._gradient = g;
    }
    ctx.fillStyle = this._gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // ── light shimmer (top caustics band) ──────────────────────────────────
    const shimmerAlpha = 0.018 + Math.sin(this.shimmer * 0.7) * 0.012;
    const sg = ctx.createLinearGradient(0, 0, 0, HEIGHT * 0.4);
    sg.addColorStop(0,   `rgba(80, 160, 220, ${shimmerAlpha})`);
    sg.addColorStop(0.5, `rgba(60, 130, 190, ${shimmerAlpha * 0.5})`);
    sg.addColorStop(1,   `rgba(0,   0,   0,  0)`);
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT * 0.4);

    // ── seaweed ─────────────────────────────────────────────────────────────
    for (const s of this.seaweeds) s.draw(ctx);

    // ── sandy/rocky bottom strip ─────────────────────────────────────────────
    ctx.fillStyle = 'rgba(20, 35, 25, 0.6)';
    ctx.fillRect(0, HEIGHT - 8, WIDTH, 8);

    // ── bubbles ─────────────────────────────────────────────────────────────
    for (const b of this.bubbles) b.draw(ctx);
  }
}
