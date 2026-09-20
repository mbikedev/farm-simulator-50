// Sons synthétisés avec la Web Audio API (aucun fichier audio requis).
// - Moteur : oscillateurs + bruit filtré, régime lié à la vitesse
// - Animaux : meuglement, bêlement, caquètement avec atténuation par distance

let ctx = null;
let master = null;
let engine = null;
let rainNode = null;
let muted = false;

function ensureContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function makeNoiseBuffer(c) {
  const len = c.sampleRate * 1.5;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// ---------- Moteur ----------

const ENGINE_PARAMS = {
  tractor: { base: 52, noise: 0.5, gain: 1.0 },
  harvester: { base: 48, noise: 0.7, gain: 1.1 },
  mixer: { base: 42, noise: 0.6, gain: 1.0 },
  excavator: { base: 36, noise: 0.8, gain: 1.1 },
  boat: { base: 62, noise: 1.0, gain: 0.9 },
};

function createEngine(c) {
  const out = c.createGain();
  out.gain.value = 0;
  out.connect(master);

  const osc1 = c.createOscillator();
  osc1.type = 'sawtooth';
  const osc1Gain = c.createGain();
  osc1Gain.gain.value = 0.5;
  osc1.connect(osc1Gain).connect(out);

  const osc2 = c.createOscillator();
  osc2.type = 'square';
  const osc2Gain = c.createGain();
  osc2Gain.gain.value = 0.22;
  osc2.connect(osc2Gain).connect(out);

  const lowpass = c.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 900;
  out.disconnect();
  out.connect(lowpass).connect(master);

  const noise = c.createBufferSource();
  noise.buffer = makeNoiseBuffer(c);
  noise.loop = true;
  const noiseFilter = c.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 500;
  noiseFilter.Q.value = 0.8;
  const noiseGain = c.createGain();
  noiseGain.gain.value = 0;
  noise.connect(noiseFilter).connect(noiseGain).connect(lowpass);

  osc1.start(); osc2.start(); noise.start();

  return {
    out, osc1, osc2, noiseGain, noiseFilter,
    kind: null,
    set(kind, throttle) {
      const t = ctx.currentTime;
      if (!kind || muted) {
        out.gain.setTargetAtTime(0, t, 0.08);
        this.kind = kind;
        return;
      }
      const p = ENGINE_PARAMS[kind] || ENGINE_PARAMS.tractor;
      const rpm = 0.28 + throttle * 0.72; // ralenti -> plein régime
      const f = p.base * (0.7 + rpm * 1.5);
      osc1.frequency.setTargetAtTime(f, t, 0.06);
      osc2.frequency.setTargetAtTime(f / 2, t, 0.06);
      noiseFilter.frequency.setTargetAtTime(350 + rpm * 900, t, 0.1);
      this.noiseGain.gain.setTargetAtTime(p.noise * (0.05 + rpm * 0.14), t, 0.1);
      out.gain.setTargetAtTime(p.gain * (0.05 + rpm * 0.11), t, 0.08);
      this.kind = kind;
    },
  };
}

// ---------- Pluie ----------

function createRain(c) {
  const src = c.createBufferSource();
  src.buffer = makeNoiseBuffer(c);
  src.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2400;
  const gain = c.createGain();
  gain.gain.value = 0;
  src.connect(filter).connect(gain).connect(master);
  src.start();
  return { gain };
}

// ---------- Cris d'animaux ----------

function envGain(c, t0, attack, hold, release, peak) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.setValueAtTime(peak, t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  return g;
}

function playMoo(vol) {
  const c = ensureContext(); if (!c) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(72, t0);
  osc.frequency.linearRampToValueAtTime(105, t0 + 0.35);
  osc.frequency.linearRampToValueAtTime(68, t0 + 1.15);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(420, t0);
  f.frequency.linearRampToValueAtTime(700, t0 + 0.3);
  f.frequency.linearRampToValueAtTime(300, t0 + 1.1);
  f.Q.value = 4;
  const g = envGain(c, t0, 0.12, 0.55, 0.5, 0.5 * vol);
  osc.connect(f).connect(g).connect(master);
  osc.start(t0); osc.stop(t0 + 1.3);
}

function playBaa(vol) {
  const c = ensureContext(); if (!c) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, t0);
  osc.frequency.linearRampToValueAtTime(180, t0 + 0.7);
  // trémolo du bêlement
  const lfo = c.createOscillator();
  lfo.frequency.value = 7.5;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 30;
  lfo.connect(lfoGain).connect(osc.frequency);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 900;
  f.Q.value = 1.2;
  const g = envGain(c, t0, 0.06, 0.4, 0.25, 0.4 * vol);
  osc.connect(f).connect(g).connect(master);
  osc.start(t0); osc.stop(t0 + 0.85);
  lfo.start(t0); lfo.stop(t0 + 0.85);
}

function playCluck(vol, alarm = false) {
  const c = ensureContext(); if (!c) return;
  const n = alarm ? 4 : 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const t0 = c.currentTime + i * (alarm ? 0.13 : 0.22);
    const osc = c.createOscillator();
    osc.type = 'square';
    const f0 = alarm ? 760 + Math.random() * 120 : 560 + Math.random() * 90;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.55, t0 + 0.09);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1300;
    f.Q.value = 1.5;
    const g = envGain(c, t0, 0.015, 0.03, 0.07, 0.22 * vol);
    osc.connect(f).connect(g).connect(master);
    osc.start(t0); osc.stop(t0 + 0.14);
  }
}

// ---------- API publique ----------

export const audio = {
  // à appeler sur un geste utilisateur (bouton SPELEN, etc.)
  unlock() {
    ensureContext();
    if (ctx && !engine) engine = createEngine(ctx);
    if (ctx && !rainNode) rainNode = createRain(ctx);
  },

  // bruit de pluie continu, intensité 0..1
  setRain(intensity) {
    if (!ctx || !rainNode) return;
    const v = muted ? 0 : 0.16 * intensity;
    rainNode.gain.gain.setTargetAtTime(v, ctx.currentTime, 0.4);
  },

  // moteur : kind = tractor|harvester|mixer|excavator|boat|null, throttle 0..1
  setEngine(kind, throttle) {
    if (!ctx || !engine) return;
    engine.set(kind, throttle);
  },

  // cri d'animal à distance donnée du joueur (atténuation simple)
  cry(type, dist) {
    if (muted || !ctx) return;
    const vol = Math.max(0, 1 - dist / 65);
    if (vol <= 0.02) return;
    if (type === 'cow') playMoo(vol);
    else if (type === 'sheep') playBaa(vol);
    else if (type === 'chicken') playCluck(vol, false);
    else if (type === 'chicken-alarm') playCluck(vol, true);
  },

  toggleMute() {
    muted = !muted;
    if (muted && engine) engine.set(null, 0);
    return muted;
  },

  get muted() { return muted; },
};
