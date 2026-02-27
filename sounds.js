// sounds.js — Web Audio API sounds (no external files)

let _audioCtx = null;

function _ctx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function playSound(type) {
  try {
    const ctx = _ctx();
    const now = ctx.currentTime;

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'grab') {
      // short bubbly "pop"
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(580, now + 0.07);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.16);

    } else if (type === 'hit') {
      // soft underwater thud — calm collision sound
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.35);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);

    } else if (type === 'gameover') {
      // layer 1 — white noise swoosh through descending bandpass filter
      const dur = 1.6;
      const bufLen = Math.ceil(ctx.sampleRate * dur);
      const buf  = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.setValueAtTime(1800, now);
      filt.frequency.exponentialRampToValueAtTime(280, now + dur);
      filt.Q.value = 0.9;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0, now);
      noiseGain.gain.linearRampToValueAtTime(0.245, now + 0.25);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      noise.connect(filt);
      filt.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + dur);

      // layer 2 — low sine hum fading out
      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + dur);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.098, now + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.start(now);
      osc.stop(now + dur);

    } else if (type === 'levelup') {
      // rising blip when new shark spawns
      osc.type = 'square';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.12);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    }
  } catch (_) {
    // audio blocked or not supported — silently ignore
  }
}

// ── Background music — "He's a Pirate" approximation ─────────────────────────

let _bgGain  = null; // master gain node — non-null means music is active
let _bgTimer = null; // setTimeout handle for loop scheduling

// Note frequencies
const _D3=146.83, _A3=220.00;
const _D4=293.66, _E4=329.63, _F4=349.23, _G4=392.00, _A4=440.00, _Bb4=466.16;
const _D5=587.33, _E5=659.25, _F5=698.46, _G5=783.99, _A5=880.00;

// Melody — [frequency_hz, duration_in_16th_notes]  (0 = rest)
// "He's a Pirate" main theme, simplified loop ~10s
const _MELODY = [
  // phrase 1
  [_D5,2],[_E5,2],[_F5,3],[_E5,1],[_D5,2],[_A4,6],
  // phrase 2
  [_D5,2],[_E5,2],[_F5,3],[_E5,1],[_F5,2],[_G5,6],
  // phrase 3
  [_A5,6],[_G5,2],[_F5,2],[_G5,6],
  // phrase 4
  [_F5,2],[_E5,2],[_D5,6],[_A4,6],
  // Bb bridge
  [_Bb4,4],[_A4,2],[_Bb4,4],[_A4,2],[_G4,4],
  [_F4,2],[_G4,2],[_A4,4],[0,8],
  // repeat phrase 1 + 2
  [_D5,2],[_E5,2],[_F5,3],[_E5,1],[_D5,2],[_A4,6],
  [_D5,2],[_E5,2],[_F5,3],[_E5,1],[_F5,2],[_G5,6],
  // ending
  [_A5,8],[_G5,2],[_F5,2],[_E5,2],[_F5,2],
  [_D5,8],[0,8],
];

// Bass line — [frequency_hz, duration_in_16th_notes]
// Simple D / A alternating hits on strong beats
const _BASS = [
  [_D3,8],[_D3,8],        // phrase 1
  [_D3,8],[_A3,8],        // phrase 2
  [_A3,8],[_D3,8],        // phrase 3
  [_D3,8],[_A3,8],        // phrase 4
  [_Bb4*0.5,8],[_A3,8],   // bridge
  [_D3,8],[0,8],
  [_D3,8],[_D3,8],        // repeat 1
  [_D3,8],[_A3,8],        // repeat 2
  [_A3,8],[_D3,8],
  [_D3,8],[0,8],
];

function startBgMusic() {
  if (_bgGain) return;
  try {
    const ctx    = _ctx();
    const master = ctx.createGain();
    master.gain.value = 0.09;
    master.connect(ctx.destination);
    _bgGain = master;
    _scheduleLoop(ctx.currentTime + 0.2);
  } catch (_) {}
}

function stopBgMusic() {
  if (_bgTimer) { clearTimeout(_bgTimer); _bgTimer = null; }
  if (_bgGain) {
    try {
      const g   = _bgGain;
      const ctx = _ctx();
      _bgGain   = null;
      g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    } catch (_) {}
  }
}

function pauseBgMusic() {
  if (_audioCtx && _audioCtx.state === 'running') {
    try { _audioCtx.suspend(); } catch (_) {}
  }
}

function resumeBgMusic() {
  if (_audioCtx && _audioCtx.state === 'suspended' && _bgGain) {
    try { _audioCtx.resume(); } catch (_) {}
  }
}

function _scheduleLoop(startTime) {
  if (!_bgGain) return;
  const ctx  = _ctx();
  const BPM  = 140;
  const s16  = 60 / BPM / 4; // duration of one 16th note in seconds

  let totalTime = 0;

  // schedule melody
  let mt = startTime;
  for (const [freq, dur] of _MELODY) {
    const d = dur * s16;
    if (freq > 0) _bgNote(ctx, freq, mt, d, 'square', 0.32);
    mt += d;
  }
  totalTime = mt - startTime;

  // schedule bass (sine, one octave lower feel)
  let bt = startTime;
  for (const [freq, dur] of _BASS) {
    const d = dur * s16;
    if (freq > 0) _bgNote(ctx, freq, bt, d, 'sine', 0.55);
    bt += d;
  }

  // loop: re-schedule 0.4s before end to avoid gaps
  const loopMs = (totalTime - 0.4) * 1000;
  _bgTimer = setTimeout(() => _scheduleLoop(startTime + totalTime), Math.max(50, loopMs));
}

function _bgNote(ctx, freq, time, dur, type, vol) {
  if (!_bgGain) return;
  try {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.connect(env);
    env.connect(_bgGain);
    osc.type = type;
    osc.frequency.value = freq;
    const atk = 0.015;
    const rel = Math.min(dur * 0.3, 0.07);
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(vol, time + atk);
    env.gain.setValueAtTime(vol, time + dur - rel);
    env.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.start(time);
    osc.stop(time + dur + 0.01);
  } catch (_) {}
}
