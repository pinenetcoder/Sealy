let WIDTH  = window.innerWidth;
let HEIGHT = window.innerHeight;

const TARGET_FPS     = 60;
const FRAME_DURATION = 1000 / TARGET_FPS;
const KEY_SPEED      = 300; // px/s for arrow key movement

// ─── Joystick sensitivity profiles ────────────────────────────────────────────
// speedMul : multiplier on top of KEY_SPEED * DEVICE_SCALE
// deadzone : fraction of outerR ignored near centre (0–1)
// curve    : exponent for response (1 = linear, >1 = slow start → fast finish)
// spring   : knob return speed coefficient (higher = snappier)
const JOY_PROFILES = [
  { label: '1', speedMul: 1.00, deadzone: 0.08, curve: 1.0,  spring: 14 }, // Balanced
  { label: '2', speedMul: 1.55, deadzone: 0.055, curve: 1.75, spring: 17 }, // Fast
];

// ─── AABB overlap ─────────────────────────────────────────────────────────────
function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// ─── format seconds → M:SS ────────────────────────────────────────────────────
function fmtTime(sec) {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + String(r).padStart(2, '0');
}

// ─── Game ─────────────────────────────────────────────────────────────────────
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');

    this.lastTime    = 0;
    this.accumulator = 0;
    this.running     = false;

    // 'start' | 'playing' | 'dying' | 'gameover'
    this.gameState     = 'start';
    this.paused        = false;
    this._pauseBtn     = { x: 8, y: 8, w: 28, h: 28 }; // top-left button bounds
    this.startTimer    = 0;
    this.survivalTime  = 0;
    this.gameOverTimer = 0;
    this.bestTime      = parseFloat(localStorage.getItem('sealBest') || '0');

    // difficulty
    this.nextSpawnAt   = 20;   // seconds until next spawn (shark or orca)
    this.spawnCounter  = 0;    // 0,1,2 = shark; 3 = orca, then repeat
    this.nextSpeedAt   = 30;   // seconds until next speed boost
    this.speedBoosts   = 0;

    this._pointerX = 0;
    this._pointerY = 0;

    // keyboard state
    this._keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
                   w: false, a: false, s: false, d: false };

    // touch device detection
    this._isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    // active joystick sensitivity profile index
    this._joyProfileIdx = 0;
    this._profileBtns   = []; // [{x,y,w,h,idx}] — updated each draw frame

    // virtual joystick state (populated in _setupResize, used in Steps 2-4)
    this._joy = {
      baseX: 0, baseY: 0,  // centre of outer ring (updated on resize)
      outerR: 0,           // outer ring radius
      knobR:  0,           // inner knob radius
      dx: 0, dy: 0,        // current knob offset from centre (-outerR … +outerR)
      active: false,       // finger currently on joystick
      touchId: null,       // which touch owns the joystick
      alpha: 0.28,         // current draw opacity (animated)
    };

    this.score     = 0;
    this._floatScores = []; // floating +1 texts

    this.ocean     = new Ocean();
    this.sharks    = spawnSharks();
    this.orcas     = spawnOrcas();
    this.crabs     = spawnCrabs();
    this.seal      = new Seal();
    this.particles = new ParticleSystem();

    this._boundLoop = this._loop.bind(this);
    this._setupResize();
    this._setupInput();
  }

  init() { this.running = true; }

  // ── Update ──────────────────────────────────────────────────────────────────
  update(dt) {
    this.ocean.update(dt);
    for (const o of this.orcas)  o.update(dt);
    for (const s of this.sharks) s.update(dt);
    for (const c of this.crabs)  c.update(dt);

    if (this.gameState === 'start') {
      this.startTimer += dt;
      this.seal.update(dt);

    } else if (this.gameState === 'playing') {
      this.survivalTime += dt;
      this.seal.update(dt);
      this.particles.update(dt);

      // joystick polish: smooth knob return + alpha fade
      if (this._isTouchDevice) {
        const joy = this._joy;
        if (!joy.active) {
          // spring knob back to centre using active profile's spring speed
          const sp = JOY_PROFILES[this._joyProfileIdx].spring;
          joy.dx += (0 - joy.dx) * Math.min(1, dt * sp);
          joy.dy += (0 - joy.dy) * Math.min(1, dt * sp);
        }
        // fade alpha toward target
        const targetAlpha = joy.active ? 0.75 : 0.28;
        joy.alpha += (targetAlpha - joy.alpha) * Math.min(1, dt * 7);
      }

      if (this.seal.grabbed) {
        this.seal.moveTo(this._pointerX, this._pointerY);
      }
      this._applyKeys(dt);
      this._updateDifficulty();
      this._checkCollisions();
      this._checkCrabEat();
      this._updateFloatScores(dt);

    } else if (this.gameState === 'dying') {
      this.seal.update(dt);
      this.particles.update(dt);
      if (this.seal.state === 'dead') {
        this.gameState     = 'gameover';
        this.gameOverTimer = 0;
        playSound('gameover');
        if (this.survivalTime > this.bestTime) {
          this.bestTime = this.survivalTime;
          localStorage.setItem('sealBest', this.bestTime);
        }
      }

    } else if (this.gameState === 'gameover') {
      this.gameOverTimer += dt;
    }
  }

  _applyKeys(dt) {
    // ── keyboard ──────────────────────────────────────────────────────────────
    const k  = this._keys;
    let dx = 0, dy = 0;
    if (k.ArrowLeft  || k.a) dx -= 1;
    if (k.ArrowRight || k.d) dx += 1;
    if (k.ArrowUp    || k.w) dy -= 1;
    if (k.ArrowDown  || k.s) dy += 1;
    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      this.seal.moveBy(
        dx / len * KEY_SPEED * DEVICE_SCALE * dt,
        dy / len * KEY_SPEED * DEVICE_SCALE * dt
      );
    }

    // ── virtual joystick (touch devices only) ─────────────────────────────────
    const joy  = this._joy;
    const prof = JOY_PROFILES[this._joyProfileIdx];
    if (joy.active && joy.outerR > 0) {
      const nx   = joy.dx / joy.outerR;
      const ny   = joy.dy / joy.outerR;
      const mag  = Math.hypot(nx, ny);
      const DEAD = prof.deadzone;
      if (mag > DEAD) {
        // remap [DEAD, 1] → [0, 1], then apply response curve
        const t = Math.pow((mag - DEAD) / (1 - DEAD), prof.curve);
        this.seal.moveBy(
          (nx / mag) * t * KEY_SPEED * prof.speedMul * DEVICE_SCALE * dt,
          (ny / mag) * t * KEY_SPEED * prof.speedMul * DEVICE_SCALE * dt
        );
      }
    }
  }

  _checkCollisions() {
    const sb = this.seal.getBounds();
    for (const shark of this.sharks) {
      if (aabbOverlap(sb, shark.getBounds())) { this._triggerDeath(shark); return; }
    }
    for (const orca of this.orcas) {
      if (aabbOverlap(sb, orca.getBounds())) { this._triggerDeath(orca); return; }
    }
  }

  _checkCrabEat() {
    const sb = this.seal.getBounds();
    for (let i = this.crabs.length - 1; i >= 0; i--) {
      const c = this.crabs[i];
      if (!c.alive) continue;
      if (aabbOverlap(sb, c.getBounds())) {
        c.alive = false;
        this.score++;
        this._floatScores.push({ x: c.x, y: c.y, life: 1 });
        playSound('grab');
        // respawn a new crab after a short delay
        setTimeout(() => {
          if (this.gameState === 'playing') this.crabs.push(spawnOneCrab());
        }, 2500);
        this.crabs.splice(i, 1);
      }
    }
  }

  _updateFloatScores(dt) {
    for (let i = this._floatScores.length - 1; i >= 0; i--) {
      const f = this._floatScores[i];
      f.y    -= 55 * dt;
      f.life -= dt * 1.6;
      if (f.life <= 0) this._floatScores.splice(i, 1);
    }
  }

  _triggerDeath(predator) {
    this.gameState    = 'dying';
    this.seal.grabbed = false;
    this.seal.state   = 'dying';
    predator.startBite();
    this.particles.spawnDeath(this.seal.x, this.seal.y);
  }

  _updateDifficulty() {
    // every 20 s: 3 sharks → 1 orca → 3 sharks → 1 orca …
    if (this.survivalTime >= this.nextSpawnAt) {
      if (this.spawnCounter < 3) {
        this.sharks.push(spawnOneShark());
      } else {
        this.orcas.push(spawnOneOrca());
        this.spawnCounter = -1; // incremented to 0 below
      }
      this.spawnCounter++;
      this.nextSpawnAt += 20;
      playSound('levelup');
    }
    // speed ×1.1 every 30 s
    if (this.survivalTime >= this.nextSpeedAt) {
      for (const s of this.sharks) s.speed = Math.min(s.speed * 1.1, 280);
      for (const o of this.orcas)  o.speed = Math.min(o.speed * 1.1, 150);
      this.nextSpeedAt += 30;
      this.speedBoosts++;
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    this.ocean.draw(ctx);
    for (const c of this.crabs)  c.draw(ctx);
    for (const o of this.orcas)  o.draw(ctx);
    for (const s of this.sharks) s.draw(ctx);
    this.seal.draw(ctx);
    this.particles.draw(ctx);
    this._drawFloatScores(ctx);

    if (this.gameState === 'start')    this._drawStartScreen(ctx);
    if (this.gameState === 'playing' ||
        this.gameState === 'dying')    this._drawHUD(ctx);
    if (this.gameState === 'playing' && this._isTouchDevice && !this.paused)
                                       this._drawJoystick(ctx);
    if (this.gameState === 'playing' && this._isTouchDevice)
                                       this._drawProfileSelector(ctx);
    if (this.gameState === 'playing' && this.paused) this._drawPauseOverlay(ctx);
    if (this.gameState === 'gameover') this._drawGameOver(ctx);
  }

  // ── Pause overlay ───────────────────────────────────────────────────────────
  _drawPauseOverlay(ctx) {
    const cx   = WIDTH / 2;
    const FONT = '"Press Start 2P", monospace';
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font      = `clamp(18px, 5vw, 30px) ${FONT}`;
    ctx.fillStyle = '#0a2233';
    ctx.fillText('ПАУЗА', cx + 3, HEIGHT * 0.44 + 3);
    ctx.fillStyle = '#7eddff';
    ctx.fillText('ПАУЗА', cx, HEIGHT * 0.44);
    ctx.font      = `clamp(7px, 1.6vw, 11px) ${FONT}`;
    ctx.fillStyle = '#4a8aaa';
    ctx.fillText('пробел или ⏸ для продолжения', cx, HEIGHT * 0.54);
    ctx.restore();
  }

  // ── Start screen ────────────────────────────────────────────────────────────
  _drawStartScreen(ctx) {
    const t = this.startTimer;

    // subtle dark vignette
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const cx = WIDTH / 2;
    const FONT = '"Press Start 2P", monospace';

    // title — fades in
    const titleAlpha = Math.min(1, t * 2);
    ctx.globalAlpha = titleAlpha;
    ctx.font        = `clamp(20px, 5vw, 36px) ${FONT}`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#0a2a3a';
    ctx.fillText('ТЮЛЕНЧИК', cx + 3, HEIGHT * 0.28 + 3);
    ctx.fillStyle = '#7eddff';
    ctx.fillText('ТЮЛЕНЧИК', cx, HEIGHT * 0.28);

    // subtitle
    ctx.font      = `clamp(8px, 2vw, 12px) ${FONT}`;
    ctx.fillStyle = '#4a9ab8';
    ctx.fillText('избеги акул и касаток', cx, HEIGHT * 0.36);

    // blink "start" prompt (only after 1 s)
    if (t > 1 && Math.sin(t * 3.5) > 0) {
      ctx.font      = `clamp(8px, 2vw, 11px) ${FONT}`;
      ctx.fillStyle = '#a0d8f0';
      ctx.fillText('нажми или нажми любую клавишу', cx, HEIGHT * 0.80);
    }

    // keyboard hint (desktop)
    if (t > 1.5) {
      ctx.globalAlpha = Math.min(0.7, (t - 1.5) * 1.4);
      ctx.font        = `clamp(7px, 1.5vw, 10px) ${FONT}`;
      ctx.fillStyle   = '#446688';
      ctx.fillText('←↑↓→  или  WASD  или  зажми тюленя', cx, HEIGHT * 0.87);
    }

    ctx.restore();
  }

  // ── HUD ─────────────────────────────────────────────────────────────────────
  _drawHUD(ctx) {
    const FONT = '"Press Start 2P", monospace';
    ctx.save();
    ctx.font         = 'clamp(10px, 2.5vw, 16px) ' + FONT;
    ctx.textBaseline = 'top';

    // survival time — right
    ctx.textAlign = 'right';
    const timeStr   = fmtTime(this.survivalTime);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(timeStr, WIDTH - 17, 21);
    ctx.fillStyle = '#a8e8ff';
    ctx.fillText(timeStr, WIDTH - 19, 19);

    // crab score — right, 8px gap left of time counter
    const timeW   = ctx.measureText(timeStr).width;
    const scoreX  = WIDTH - 19 - timeW - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillText(this.score + ' 🦀', scoreX + 1, 21);
    ctx.fillStyle = '#ffdd55';
    ctx.fillText(this.score + ' 🦀', scoreX, 19);

    // pause button — top-left
    const pb = this._pauseBtn;
    ctx.fillStyle = this.paused ? 'rgba(120,210,255,0.25)' : 'rgba(255,255,255,0.10)';
    ctx.strokeStyle = this.paused ? 'rgba(120,210,255,0.7)' : 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(pb.x, pb.y, pb.w, pb.h, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = this.paused ? '#a8e8ff' : 'rgba(255,255,255,0.55)';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.paused ? '▶' : '⏸', pb.x + pb.w / 2, pb.y + pb.h / 2 + 1);

    // best time — 8px gap after pause button (button ends at x=36)
    if (this.bestTime > 0) {
      ctx.textAlign = 'left';
      ctx.font = 'clamp(10px, 2.5vw, 16px) ' + FONT;
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillText('РЕК: ' + fmtTime(this.bestTime), 46, 21);
      ctx.fillStyle = '#ffd060';
      ctx.fillText('РЕК: ' + fmtTime(this.bestTime), 44, 19);
    }


    ctx.restore();
  }

  _drawJoystick(ctx) {
    const { baseX, baseY, outerR, knobR, dx, dy, alpha } = this._joy;
    ctx.save();

    // outer ring fill
    ctx.beginPath();
    ctx.arc(baseX, baseY, outerR, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(180,220,255,${alpha * 0.22})`;
    ctx.fill();

    // outer ring border
    ctx.strokeStyle = `rgba(180,220,255,${alpha})`;
    ctx.lineWidth   = 2;
    ctx.stroke();

    // cross-hair guide lines
    ctx.strokeStyle = `rgba(180,220,255,${alpha * 0.45})`;
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(baseX - outerR * 0.65, baseY);
    ctx.lineTo(baseX + outerR * 0.65, baseY);
    ctx.moveTo(baseX, baseY - outerR * 0.65);
    ctx.lineTo(baseX, baseY + outerR * 0.65);
    ctx.stroke();
    ctx.setLineDash([]);

    // knob — follows animated dx/dy
    const kx        = baseX + dx;
    const ky        = baseY + dy;
    const knobAlpha = Math.min(1, alpha * 1.15);

    ctx.beginPath();
    ctx.arc(kx, ky, knobR, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(
      kx - knobR * 0.28, ky - knobR * 0.28, knobR * 0.08,
      kx, ky, knobR
    );
    grad.addColorStop(0, `rgba(255,255,255,${knobAlpha})`);
    grad.addColorStop(1, `rgba(90,180,255,${knobAlpha * 0.75})`);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = `rgba(180,220,255,${knobAlpha})`;
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  _drawProfileSelector(ctx) {
    const FONT   = '"Press Start 2P", monospace';
    const btnW   = 28;
    const btnH   = 22;
    const gap    = 6;
    const total  = JOY_PROFILES.length * btnW + (JOY_PROFILES.length - 1) * gap;
    const startX = Math.round((WIDTH - total) / 2);
    const y      = 8;

    this._profileBtns = [];
    ctx.save();
    ctx.font         = `8px ${FONT}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    JOY_PROFILES.forEach((p, i) => {
      const x       = startX + i * (btnW + gap);
      const active  = i === this._joyProfileIdx;
      const alpha   = active ? 0.85 : 0.35;

      // store bounds for tap detection
      this._profileBtns.push({ x, y, w: btnW, h: btnH, idx: i });

      // background
      ctx.fillStyle   = active ? `rgba(120,210,255,0.30)` : `rgba(255,255,255,0.08)`;
      ctx.strokeStyle = active ? `rgba(120,210,255,${alpha})` : `rgba(255,255,255,0.22)`;
      ctx.lineWidth   = active ? 1.5 : 1;
      ctx.beginPath();
      ctx.roundRect(x, y, btnW, btnH, 5);
      ctx.fill();
      ctx.stroke();

      // label
      ctx.fillStyle = active ? '#a8e8ff' : `rgba(255,255,255,${alpha})`;
      ctx.fillText(p.label, x + btnW / 2, y + btnH / 2 + 1);
    });

    ctx.restore();
  }

  _drawFloatScores(ctx) {
    if (!this._floatScores.length) return;
    const FONT = '"Press Start 2P", monospace';
    ctx.save();
    ctx.font      = '12px ' + FONT;
    ctx.textAlign = 'center';
    for (const f of this._floatScores) {
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle   = '#fff176';
      ctx.fillText('+1', Math.round(f.x), Math.round(f.y));
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Game Over ────────────────────────────────────────────────────────────────
  _drawGameOver(ctx) {
    const t    = this.gameOverTimer;
    const cx   = WIDTH / 2;
    const FONT = '"Press Start 2P", monospace';

    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.72, t * 2)})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    // GAME OVER
    const goY = Math.min(HEIGHT * 0.38, HEIGHT * 0.1 + t * 600);
    ctx.font      = `clamp(18px, 5vw, 32px) ${FONT}`;
    ctx.fillStyle = '#1a0000';
    ctx.fillText('GAME OVER', cx + 3, goY + 3);
    ctx.fillStyle = '#ff3030';
    ctx.fillText('GAME OVER', cx, goY);

    if (t > 0.4) {
      ctx.font = `clamp(9px, 2vw, 13px) ${FONT}`;

      ctx.fillStyle = '#ccddff';
      ctx.fillText('Выжил: ' + fmtTime(this.survivalTime), cx, HEIGHT * 0.49);

      ctx.fillStyle = '#ffdd55';
      ctx.fillText('🦀 ' + this.score + ' крабов', cx, HEIGHT * 0.57);

      if (this.survivalTime >= this.bestTime && this.survivalTime > 2) {
        ctx.fillStyle = '#ffd700';
        ctx.fillText('РЕКОРД!', cx, HEIGHT * 0.61);
      } else {
        ctx.fillStyle = '#6688aa';
        ctx.fillText('Рекорд: ' + fmtTime(this.bestTime), cx, HEIGHT * 0.61);
      }
    }

    if (t > 0.8 && Math.sin(t * 3.5) > 0) {
      ctx.font      = `clamp(7px, 1.5vw, 10px) ${FONT}`;
      ctx.fillStyle = '#88bbdd';
      ctx.fillText('нажми чтобы начать заново', cx, HEIGHT * 0.74);
    }

    ctx.restore();
  }

  // ── Restart / Start ─────────────────────────────────────────────────────────
  startGame() {
    this.gameState    = 'playing';
    this.startTimer   = 0;
    this.survivalTime = 0;
    this.score        = 0;
    this._floatScores = [];
    this.sharks = spawnSharks();
    this.orcas  = spawnOrcas();
    this.crabs  = spawnCrabs();
    this.seal   = new Seal();
  }

  restart() {
    this.gameState     = 'playing';
    this.survivalTime  = 0;
    this.gameOverTimer = 0;
    this.score         = 0;
    this._floatScores  = [];
    this.nextSpawnAt   = 20;
    this.spawnCounter  = 0;
    this.nextSpeedAt   = 30;
    this.speedBoosts   = 0;
    this.sharks    = spawnSharks();
    this.orcas     = spawnOrcas();
    this.crabs     = spawnCrabs();
    this.seal      = new Seal();
    this.particles.clear();
  }

  // ── Loop ────────────────────────────────────────────────────────────────────
  start() { this.init(); requestAnimationFrame(this._boundLoop); }

  // clamp knob inside outer ring and store offset
  _updateJoystickKnob(gx, gy) {
    const { baseX, baseY, outerR } = this._joy;
    let dx = gx - baseX;
    let dy = gy - baseY;
    const dist = Math.hypot(dx, dy);
    if (dist > outerR) {
      dx = dx / dist * outerR;
      dy = dy / dist * outerR;
    }
    this._joy.dx = dx;
    this._joy.dy = dy;
  }

  _togglePause() {
    if (this.gameState !== 'playing') return;
    this.paused = !this.paused;
    // release seal grip on pause so it doesn't fly off on resume
    if (this.paused) {
      this.seal.grabbed = false;
      if (this.seal.state === 'grabbed') this.seal.state = 'idle';
    }
  }

  _loop(timestamp) {
    if (!this.running) return;
    const delta = timestamp - this.lastTime;
    this.lastTime = timestamp;
    if (!this.paused) {
      this.accumulator += Math.min(delta, 200);
      while (this.accumulator >= FRAME_DURATION) {
        this.update(FRAME_DURATION / 1000);
        this.accumulator -= FRAME_DURATION;
      }
    }
    this.render();
    requestAnimationFrame(this._boundLoop);
  }

  // ── Input ────────────────────────────────────────────────────────────────────
  _setupInput() {
    const cv = this.canvas;

    const toGame = (px, py) => {
      const r = cv.getBoundingClientRect();
      return {
        x: (px - r.left) * (WIDTH  / r.width),
        y: (py - r.top)  * (HEIGHT / r.height),
      };
    };

    const hitsSeal = (gx, gy) => {
      const b = this.seal.getGrabBounds();
      return gx >= b.x && gx <= b.x + b.w && gy >= b.y && gy <= b.y + b.h;
    };

    const hitsPauseBtn = (gx, gy) => {
      const b = this._pauseBtn;
      return gx >= b.x && gx <= b.x + b.w && gy >= b.y && gy <= b.y + b.h;
    };

    const onDown = (gx, gy) => {
      if (this.gameState === 'start') { this.startGame(); return; }
      if (this.gameState === 'gameover' && this.gameOverTimer > 0.8) { this.restart(); return; }
      if (this.gameState === 'playing' && hitsPauseBtn(gx, gy)) { this._togglePause(); return; }
      // profile selector buttons (touch only)
      if (this._isTouchDevice && this.gameState === 'playing') {
        for (const b of this._profileBtns) {
          if (gx >= b.x && gx <= b.x + b.w && gy >= b.y && gy <= b.y + b.h) {
            this._joyProfileIdx = b.idx;
            return;
          }
        }
      }
      if (this.paused) return; // block all other interaction while paused
      if (this.gameState === 'playing' && hitsSeal(gx, gy)) {
        this.seal.grabbed = true;
        this.seal.state   = 'grabbed';
        playSound('grab');
      }
      this._pointerX = gx; this._pointerY = gy;
    };

    const onMove = (gx, gy) => { this._pointerX = gx; this._pointerY = gy; };

    const onUp = () => {
      this.seal.grabbed = false;
      if (this.seal.state === 'grabbed') this.seal.state = 'idle';
    };

    // mouse
    cv.addEventListener('mousedown', e => onDown(...Object.values(toGame(e.clientX, e.clientY))));
    window.addEventListener('mousemove', e => onMove(...Object.values(toGame(e.clientX, e.clientY))));
    window.addEventListener('mouseup', onUp);

    // joystick hit-test (slightly larger than outerR for easy grab)
    const hitsJoy = (gx, gy) => {
      const { baseX, baseY, outerR } = this._joy;
      return Math.hypot(gx - baseX, gy - baseY) <= outerR * 1.25;
    };

    // touch — multi-touch aware: joystick and seal can be held simultaneously
    cv.addEventListener('touchstart', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const { x, y } = toGame(t.clientX, t.clientY);
        // joystick: claim first free touch that lands on the joystick zone
        if (this._isTouchDevice &&
            this.gameState === 'playing' &&
            !this.paused &&
            this._joy.touchId === null &&
            hitsJoy(x, y)) {
          this._joy.active  = true;
          this._joy.touchId = t.identifier;
          this._updateJoystickKnob(x, y);
        } else {
          onDown(x, y);
        }
      }
    }, { passive: false });

    cv.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const { x, y } = toGame(t.clientX, t.clientY);
        if (t.identifier === this._joy.touchId) {
          this._updateJoystickKnob(x, y);
        } else {
          onMove(x, y);
        }
      }
    }, { passive: false });

    const onTouchEnd = e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this._joy.touchId) {
          // release joystick — knob snaps to centre
          this._joy.active  = false;
          this._joy.touchId = null;
          this._joy.dx      = 0;
          this._joy.dy      = 0;
        } else {
          onUp();
        }
      }
    };
    cv.addEventListener('touchend',    onTouchEnd, { passive: false });
    cv.addEventListener('touchcancel', onTouchEnd, { passive: false });

    // keyboard
    const MOVE_KEYS = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d']);

    window.addEventListener('keydown', e => {
      if (MOVE_KEYS.has(e.key)) {
        e.preventDefault();
        if (!this.paused) this._keys[e.key] = true;
      }
      // Space → toggle pause
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        this._togglePause();
        return;
      }
      // any key on start screen → start game
      if (this.gameState === 'start') { this.startGame(); return; }
      // any key on game over → restart
      if (this.gameState === 'gameover' && this.gameOverTimer > 0.8) { this.restart(); return; }
    });

    window.addEventListener('keyup', e => {
      if (MOVE_KEYS.has(e.key)) this._keys[e.key] = false;
    });
  }

  // ── Resize ───────────────────────────────────────────────────────────────────
  _setupResize() {
    const resize = () => {
      WIDTH  = window.innerWidth;
      HEIGHT = window.innerHeight;
      this.canvas.width  = WIDTH;
      this.canvas.height = HEIGHT;
      this.canvas.style.width  = WIDTH  + 'px';
      this.canvas.style.height = HEIGHT + 'px';
      this.ocean._gradient = null;
      // scale relative to reference: iPhone 12 mini (375px) → 0.62, MacBook → 1.0
      DEVICE_SCALE = Math.min(1.0, Math.min(WIDTH, HEIGHT) / 605);

      // joystick geometry — sized to ~14% of short screen side, min 48px
      const shortSide = Math.min(WIDTH, HEIGHT);
      const outerR = Math.max(48, Math.round(shortSide * 0.14));
      const margin = Math.round(outerR * 0.6);
      this._joy.outerR = outerR;
      this._joy.knobR  = Math.round(outerR * 0.38);
      this._joy.baseX  = WIDTH  - outerR - margin;
      this._joy.baseY  = HEIGHT - outerR - margin;
    };
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 100));
    resize();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('gameCanvas');
  const game   = new Game(canvas);
  loadAssets(() => game.start());
});
