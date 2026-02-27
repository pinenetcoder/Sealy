// particles.js — death explosion effect

class Particle {
  constructor(x, y, color) {
    this.x     = x + (Math.random() - 0.5) * 24;
    this.y     = y + (Math.random() - 0.5) * 24;
    this.vx    = (Math.random() - 0.5) * 260;
    this.vy    = (Math.random() - 0.5) * 260 - 70; // slight upward bias
    this.size  = 3 + Math.random() * 6;
    this.color = color;
    this.life  = 1;
    this.decay = 1.1 + Math.random() * 0.9; // ~0.6–1.1s lifetime
  }

  update(dt) {
    this.vx *= 0.97;
    this.vy += 200 * dt; // gravity
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.life -= this.decay * dt;
  }

  draw(ctx) {
    if (this.life <= 0) return;
    const s = Math.max(1, Math.round(this.size * this.life));
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.fillStyle   = this.color;
    ctx.fillRect(Math.round(this.x - s / 2), Math.round(this.y - s / 2), s, s);
    ctx.restore();
  }
}

class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  spawnDeath(x, y) {
    const palette = [
      '#7abcd8', '#4a8aaa', '#a8d8f0', '#cce8ff',
      '#ffffff', '#5599bb', '#88ccee', '#aaddff', '#ffd0a0',
    ];
    for (let i = 0; i < 22; i++) {
      const color = palette[Math.floor(Math.random() * palette.length)];
      this.particles.push(new Particle(x, y, color));
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].update(dt);
      if (this.particles[i].life <= 0) this.particles.splice(i, 1);
    }
  }

  draw(ctx) {
    for (const p of this.particles) p.draw(ctx);
  }

  clear() { this.particles = []; }
}
