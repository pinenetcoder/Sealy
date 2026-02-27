let WIDTH  = window.innerWidth;
let HEIGHT = window.innerHeight;

const TARGET_FPS     = 60;
const FRAME_DURATION = 1000 / TARGET_FPS;
const KEY_SPEED      = 300; // px/s for arrow key movement

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
    const k  = this._keys;
    let dx = 0, dy = 0;
    if (k.ArrowLeft  || k.a) dx -= 1;
    if (k.ArrowRight || k.d) dx += 1;
    if (k.ArrowUp    || k.w) dy -= 1;
    if (k.ArrowDown  || k.s) dy += 1;
    if (dx === 0 && dy === 0) return;

    // normalise diagonal
    const len = Math.sqrt(dx * dx + dy * dy);
    dx = dx / len * KEY_SPEED * DEVICE_SCALE * dt;
    dy = dy / len * KEY_SPEED * DEVICE_SCALE * dt;

    this.seal.moveBy(dx, dy);
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


    // arrow key indicator (small, bottom-right corner, desktop hint)
    this._drawKeyHint(ctx);

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

  _drawKeyHint(ctx) {
    const k   = this._keys;
    const any = k.ArrowUp || k.ArrowDown || k.ArrowLeft || k.ArrowRight;
    // always show hint for first 5 seconds, then only when key pressed
    if (!any && this.survivalTime > 5) return;

    const bx = WIDTH  - 74;
    const by = HEIGHT - 72;
    const sz = 18;
    const gap = 2;

    const dirs = [
      { key: 'ArrowUp',    col: 1, row: 0, label: '▲' },
      { key: 'ArrowLeft',  col: 0, row: 1, label: '◀' },
      { key: 'ArrowDown',  col: 1, row: 1, label: '▼' },
      { key: 'ArrowRight', col: 2, row: 1, label: '▶' },
    ];

    ctx.save();
    ctx.font      = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const d of dirs) {
      const x = bx + d.col * (sz + gap);
      const y = by + d.row * (sz + gap);
      const active = k[d.key];

      ctx.fillStyle = active ? 'rgba(120,210,255,0.7)' : 'rgba(255,255,255,0.12)';
      ctx.strokeStyle = active ? 'rgba(120,210,255,0.9)' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, sz, sz, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = active ? '#fff' : 'rgba(255,255,255,0.4)';
      ctx.fillText(d.label, x + sz / 2, y + sz / 2 + 1);
    }
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

    // touch
    cv.addEventListener('touchstart', e => {
      e.preventDefault();
      const { x, y } = toGame(e.touches[0].clientX, e.touches[0].clientY);
      onDown(x, y);
    }, { passive: false });
    cv.addEventListener('touchmove', e => {
      e.preventDefault();
      const { x, y } = toGame(e.touches[0].clientX, e.touches[0].clientY);
      onMove(x, y);
    }, { passive: false });
    cv.addEventListener('touchend', e => { e.preventDefault(); onUp(); }, { passive: false });

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
      // scale relative to MacBook M4 15.3" reference (~900px short side)
      DEVICE_SCALE = Math.min(1.0, Math.min(WIDTH, HEIGHT) / 900);
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
