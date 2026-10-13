/* WebAudio sound design for the departure board.
   Everything is synthesized — relay clicks for flaps, a soft thunk when a
   leaf lands, and a two-tone station chime for completions/alarms.

   Perf notes: the noise waveform is generated ONCE and shared by every
   click (the previous version allocated+filled a buffer per tick — dozens
   per second during cascades, which is what made sounds stutter under
   load). All voices route through a compressor so stacked sounds from a
   busy page clip-soften instead of distorting. */

let ctx: AudioContext | null = null;
let bus: DynamicsCompressorNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let unlocked = false;
let masterEnabled = true;

export function setSoundEnabled(on: boolean) {
  masterEnabled = on;
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      // master bus: gentle limiting so simultaneous voices soften, never crackle
      bus = ctx.createDynamicsCompressor();
      bus.threshold.value = -20;
      bus.knee.value = 18;
      bus.ratio.value = 5;
      bus.attack.value = 0.002;
      bus.release.value = 0.12;
      bus.connect(ctx.destination);
      // shared 0.4s pink-ish noise source for every percussive click
      const len = Math.floor(0.4 * ctx.sampleRate);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = last * 0.82 + w * 0.18; // soften toward pink — less hiss, more body
        d[i] = last * 2.2;
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/* Browsers require a user gesture before audio — call once on first pointerdown. */
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  ac();
}

/* short filtered noise click — a relay snapping. Fast attack, exp decay. */
function click(c: AudioContext, freq: number, durMs: number, gain: number, q = 0.9, when = 0) {
  if (!noiseBuf || !bus) return;
  const t = c.currentTime + when;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.92 + Math.random() * 0.16; // vary each hit slightly
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.0015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + durMs / 1000);
  src.connect(f); f.connect(g); g.connect(bus);
  src.start(t);
  src.stop(t + durMs / 1000 + 0.02);
}

/* low thump — the leaf physically landing */
function thump(c: AudioContext, gain = 0.07, when = 0) {
  if (!bus) return;
  const t = c.currentTime + when;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(115, t);
  o.frequency.exponentialRampToValueAtTime(58, t + 0.08);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + 0.12);
}

function note(c: AudioContext, freq: number, start: number, dur: number, gain = 0.16, type: OscillatorType = 'triangle') {
  if (!bus) return;
  const t = c.currentTime + start;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + dur + 0.05);
}

/* relay click — a flap starting to move */
export function flapTick(gain = 0.045) {
  if (!masterEnabled) return;
  const c = ac(); if (!c) return;
  click(c, 2350, 9, gain, 0.8);
  click(c, 820, 16, gain * 0.55, 1.1); // low body of the clack
}

/* soft mechanical land — flap settling */
export function flapLand(gain = 0.07) {
  if (!masterEnabled) return;
  const c = ac(); if (!c) return;
  click(c, 640, 14, gain * 0.5, 0.9);
  thump(c, gain);
}

/* faint running tick each second while a countdown runs (visible view only) */
export function secondTick() {
  if (!masterEnabled) return;
  const c = ac(); if (!c) return;
  click(c, 1500, 5, 0.014, 1.4);
}

/* station departure chime — rising three-note phrase then a held answer */
export function stationChime() {
  if (!masterEnabled) return;
  const c = ac(); if (!c) return;
  const seq: [number, number, number][] = [
    [523.25, 0.0, 0.55],   // C5
    [659.25, 0.28, 0.55],  // E5
    [392.0, 0.62, 0.6],    // G4
    [523.25, 0.95, 0.9],   // C5
  ];
  seq.forEach(([f, s, d]) => {
    note(c, f, s, d, 0.12, 'triangle');
    note(c, f * 2, s, d * 0.5, 0.02, 'sine');
  });
}

/* repeating alarm — warm but insistent: three round beeps + chime tail */
export function alarmRing() {
  if (!masterEnabled) return null;
  const c = ac(); if (!c) return null;
  let stopped = false;
  const fire = () => {
    if (stopped) return;
    [784, 784, 988].forEach((f, i) => note(c, f, i * 0.24, 0.17, 0.09, 'triangle'));
    note(c, 523.25, 0.85, 0.6, 0.11, 'triangle');
    note(c, 659.25, 1.15, 0.7, 0.11, 'triangle');
  };
  fire();
  const iv = setInterval(fire, 2400);
  return () => { stopped = true; clearInterval(iv); };
}

/* generic short beep (kept API-compatible with old playBeep) */
export function playBeep(frequency = 440, duration = 200, volume = 0.1) {
  if (!masterEnabled) return;
  const c = ac(); if (!c) return;
  note(c, frequency, 0, duration / 1000, volume, 'sine');
}
