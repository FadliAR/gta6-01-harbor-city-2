// Synthesized audio only — no audio files. Engine hum, siren, pickup
// chime, mission jingle, crash thud, and a 3-station in-game radio
// (step-sequenced synth loops) while driving.
import { clamp } from './rng.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

const STATIONS = [
  {
    name: 'NEON FM', bpm: 100,
    // Am - F - C - G, 16th-note arp + soft bass
    bass: [45, 0, 0, 0, 45, 0, 0, 0, 41, 0, 0, 0, 41, 0, 0, 0, 48, 0, 0, 0, 48, 0, 0, 0, 43, 0, 0, 0, 43, 0, 0, 0],
    arp: [69, 72, 76, 79, 76, 72, 69, 72, 65, 69, 72, 77, 72, 69, 65, 69, 67, 72, 76, 79, 76, 72, 67, 72, 67, 71, 74, 79, 74, 71, 67, 71],
    hat: true,
  },
  {
    name: 'HARBOR ROCK', bpm: 132,
    bass: [45, 45, 0, 45, 0, 45, 0, 0, 45, 45, 0, 45, 43, 0, 43, 0, 45, 45, 0, 45, 0, 45, 0, 0, 50, 0, 48, 0, 43, 0, 43, 0],
    arp: [57, 0, 57, 60, 0, 57, 0, 64, 57, 0, 57, 60, 0, 62, 0, 64, 57, 0, 57, 60, 0, 57, 0, 64, 62, 0, 60, 0, 59, 0, 62, 0],
    hat: true,
  },
  {
    name: 'NIGHT DRIVE', bpm: 84,
    bass: [50, 0, 0, 0, 0, 0, 0, 0, 45, 0, 0, 0, 0, 0, 0, 0, 48, 0, 0, 0, 0, 0, 0, 0, 43, 0, 0, 0, 0, 0, 0, 0],
    arp: [74, 0, 77, 0, 81, 0, 77, 0, 69, 0, 72, 0, 76, 0, 72, 0, 72, 0, 76, 0, 79, 0, 76, 0, 71, 0, 74, 0, 78, 0, 74, 0],
    hat: false,
  },
];

export function makeAudio() {
  const A = {
    ctx: null, master: null, muted: false,
    engineOsc1: null, engineOsc2: null, engineGain: null, engineFilter: null,
    sirenOsc: null, sirenGain: null, sirenLfo: null,
    radio: { station: 0, on: false, step: 0, nextTime: 0, timer: null },
  };

  function ensure() {
    if (A.ctx) return true;
    try {
      A.ctx = new (window.AudioContext || window.webkitAudioContext)();
      A.master = A.ctx.createGain();
      A.master.gain.value = 0.5;
      A.master.connect(A.ctx.destination);
      // engine: detuned saws through a lowpass
      A.engineFilter = A.ctx.createBiquadFilter();
      A.engineFilter.type = 'lowpass';
      A.engineFilter.frequency.value = 400;
      A.engineGain = A.ctx.createGain();
      A.engineGain.gain.value = 0;
      A.engineOsc1 = A.ctx.createOscillator();
      A.engineOsc1.type = 'sawtooth';
      A.engineOsc1.frequency.value = 55;
      A.engineOsc2 = A.ctx.createOscillator();
      A.engineOsc2.type = 'square';
      A.engineOsc2.frequency.value = 55.5;
      A.engineOsc1.connect(A.engineFilter);
      A.engineOsc2.connect(A.engineFilter);
      A.engineFilter.connect(A.engineGain);
      A.engineGain.connect(A.master);
      A.engineOsc1.start();
      A.engineOsc2.start();
      // siren: triangle, LFO flips pitch
      A.sirenOsc = A.ctx.createOscillator();
      A.sirenOsc.type = 'triangle';
      A.sirenOsc.frequency.value = 700;
      A.sirenGain = A.ctx.createGain();
      A.sirenGain.gain.value = 0;
      A.sirenOsc.connect(A.sirenGain);
      A.sirenGain.connect(A.master);
      A.sirenOsc.start();
      A.sirenLfo = A.ctx.createOscillator();
      A.sirenLfo.frequency.value = 0.55;
      const lfoGain = A.ctx.createGain();
      lfoGain.gain.value = 260;
      A.sirenLfo.connect(lfoGain);
      lfoGain.connect(A.sirenOsc.frequency);
      A.sirenLfo.start();
      return true;
    } catch (e) {
      return false;
    }
  }

  function blip(freq, t, dur, type = 'sine', vol = 0.25) {
    const o = A.ctx.createOscillator();
    const g = A.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(A.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noiseBurst(t, dur, vol, freq = 800) {
    const len = Math.floor(A.ctx.sampleRate * dur);
    const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = A.ctx.createBufferSource();
    src.buffer = buf;
    const f = A.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = A.ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(A.master);
    src.start(t);
  }

  A.init = () => {
    if (!ensure()) return;
    if (A.ctx.state === 'suspended') A.ctx.resume();
  };

  A.setEngine = (speedKmh, driving) => {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    const f = 45 + clamp(speedKmh, 0, 140) * 1.1;
    A.engineOsc1.frequency.setTargetAtTime(f, t, 0.08);
    A.engineOsc2.frequency.setTargetAtTime(f * 1.005, t, 0.08);
    A.engineFilter.frequency.setTargetAtTime(300 + speedKmh * 9, t, 0.1);
    A.engineGain.gain.setTargetAtTime(driving ? 0.05 + clamp(speedKmh / 140, 0, 1) * 0.05 : 0, t, 0.1);
  };

  A.setSiren = (level) => {
    if (!A.ctx) return;
    A.sirenGain.gain.setTargetAtTime(level > 0 ? 0.045 : 0, A.ctx.currentTime, 0.2);
  };

  A.pickup = () => {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    blip(880, t, 0.12);
    blip(1318, t + 0.09, 0.18);
  };

  A.jingle = () => {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => blip(f, t + i * 0.11, 0.22, 'triangle', 0.3));
  };

  A.busted = () => {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    [392, 330, 262].forEach((f, i) => blip(f, t + i * 0.22, 0.3, 'triangle', 0.28));
  };

  A.crash = () => {
    if (!A.ctx) return;
    noiseBurst(A.ctx.currentTime, 0.18, 0.4, 500);
  };

  A.toggleMute = () => {
    A.muted = !A.muted;
    if (A.master) A.master.gain.value = A.muted ? 0 : 0.5;
    return A.muted;
  };

  // ---- radio: lookahead step sequencer ------------------------------------
  function scheduleStep(station, step, t) {
    const bass = station.bass[step];
    if (bass) blip(NOTE(bass), t, 0.22, 'triangle', 0.22);
    const arp = station.arp[step];
    if (arp) blip(NOTE(arp), t, 0.14, 'square', 0.06);
    if (station.hat && step % 2 === 0) noiseBurst(t, 0.03, 0.05, 6000);
    if (step % 4 === 0) noiseBurst(t, 0.08, 0.12, 180); // soft kick
  }

  A.radioToggle = () => {
    A.radio.on = !A.radio.on;
    if (!A.ctx) return A.radio;
    if (A.radio.on) {
      const st = STATIONS[A.radio.station];
      A.radio.step = 0;
      A.radio.nextTime = A.ctx.currentTime + 0.06;
      const spb = 60 / st.bpm / 4;
      A.radio.timer = setInterval(() => {
        if (!A.radio.on) return;
        while (A.radio.nextTime < A.ctx.currentTime + 0.12) {
          scheduleStep(st, A.radio.step, A.radio.nextTime);
          A.radio.step = (A.radio.step + 1) % 32;
          A.radio.nextTime += spb;
        }
      }, 30);
    } else if (A.radio.timer) {
      clearInterval(A.radio.timer);
      A.radio.timer = null;
    }
    return A.radio;
  };

  A.radioNext = () => {
    A.radio.station = (A.radio.station + 1) % STATIONS.length;
    if (A.radio.on && A.radio.timer) {
      clearInterval(A.radio.timer);
      A.radio.timer = null;
      A.radio.on = false;
      A.radioToggle();
    }
    return STATIONS[A.radio.station].name;
  };

  A.radioName = () => STATIONS[A.radio.station].name;
  A.radioOn = () => A.radio.on;

  return A;
}
