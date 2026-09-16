// Tiny procedural WebAudio SFX kit — no audio files/assets, matches the "no heavy
// dependencies" requirement. Must be unlocked by a user gesture (join button click)
// before iOS/Chrome autoplay policies allow sound.
let ctx = null;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function unlockAudio() { ac(); }

function tone(freq, dur, { type = 'sine', gain = 0.18, glideTo = null, delay = 0 } = {}) {
  const c = ac();
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur, { gain = 0.16, delay = 0, hp = 200 } = {}) {
  const c = ac();
  const t0 = c.currentTime + delay;
  const bufSize = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, bufSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.value = hp;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt).connect(g).connect(c.destination);
  src.start(t0);
}

const SFX = {
  cast_offensive: () => tone(520, 0.12, { type: 'sawtooth', glideTo: 300, gain: 0.14 }),
  cast_defensive: () => tone(660, 0.18, { type: 'sine', glideTo: 880, gain: 0.14 }),
  cast_mobility: () => noise(0.18, { gain: 0.12, hp: 800 }),
  cast_control: () => tone(140, 0.22, { type: 'sine', gain: 0.16 }),
  cast_area: () => tone(200, 0.3, { type: 'triangle', glideTo: 90, gain: 0.18 }),
  impact: () => { noise(0.28, { gain: 0.28, hp: 120 }); tone(90, 0.28, { type: 'square', glideTo: 40, gain: 0.15 }); },
  killfeed: () => { tone(780, 0.1, { gain: 0.2 }); tone(1040, 0.14, { gain: 0.16, delay: 0.08 }); },
  death: () => tone(220, 0.5, { type: 'sawtooth', glideTo: 60, gain: 0.2 }),
  boss_warning: () => { tone(150, 0.5, { type: 'sawtooth', glideTo: 300, gain: 0.16 }); tone(150, 0.5, { type: 'sawtooth', glideTo: 300, gain: 0.16, delay: 0.5 }); },
  world_event: () => { tone(500, 0.16, { gain: 0.16 }); tone(700, 0.16, { gain: 0.16, delay: 0.12 }); tone(900, 0.2, { gain: 0.16, delay: 0.24 }); },
  upgrade: () => { tone(600, 0.12, { gain: 0.16 }); tone(900, 0.16, { gain: 0.16, delay: 0.1 }); },
  victory: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, { gain: 0.18, delay: i * 0.12 })); },
  defeat: () => { [400, 340, 260, 180].forEach((f, i) => tone(f, 0.32, { type: 'sawtooth', gain: 0.16, delay: i * 0.13 })); },
};

export function playSfx(name) { try { SFX[name] && SFX[name](); } catch (e) { /* ignore */ } }

export function castSfxFor(type) {
  const map = { OFFENSIVE: 'cast_offensive', DEFENSIVE: 'cast_defensive', MOBILITY: 'cast_mobility', CONTROL: 'cast_control', AREA: 'cast_area', GLOBAL: 'cast_area', TRICK: 'cast_mobility' };
  playSfx(map[type] || 'cast_offensive');
}
