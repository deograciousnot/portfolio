// Original soundtrack, generated live with the Web Audio API: no audio files at all.
// Each world asks for a "scene" (forest, heart, ...); the music and ambience cross-fade between them.
// Everything is silent until the visitor turns sound on (browsers require a tap first anyway).

const PENTATONIC = [0, 3, 5, 7, 10];            // minor pentatonic: always sounds calm, never "wrong"
const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

export function createSound() {
  let ac = null, master = null, enabled = false, scene = null, warmth = 0;
  const layers = new Map();   // name -> { gain, stop() }
  const timers = new Set();

  function init() {
    if (ac) return;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = 0;
    // A touch of echo makes everything sound like it's happening in a big space
    const delay = ac.createDelay(1.5), feedback = ac.createGain(), wet = ac.createGain();
    delay.delayTime.value = 0.42; feedback.gain.value = 0.35; wet.gain.value = 0.25;
    master.connect(ac.destination);
    master.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(wet); wet.connect(ac.destination);
  }

  // ---- building blocks ----
  function noiseBuffer(seconds = 2) {
    const buf = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function layer(name, volume) {
    const g = ac.createGain();
    g.gain.value = 0;
    g.connect(master);
    g.gain.linearRampToValueAtTime(volume, ac.currentTime + 3);
    const entry = { gain: g, stops: [] };
    layers.set(name, entry);
    return entry;
  }
  function every(ms, fn, jitter = 0) {
    let id;
    const tick = () => { fn(); id = setTimeout(tick, ms + Math.random() * jitter); timers.add(id); };
    id = setTimeout(tick, Math.random() * ms); timers.add(id);
  }

  // Wind: filtered noise whose brightness slowly breathes
  function wind(out, level = 0.5) {
    const src = ac.createBufferSource(); src.buffer = noiseBuffer(); src.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 500; lp.Q.value = 0.7;
    const lfo = ac.createOscillator(), lfoGain = ac.createGain();
    lfo.frequency.value = 0.07; lfoGain.gain.value = 300;
    lfo.connect(lfoGain); lfoGain.connect(lp.frequency);
    const g = ac.createGain(); g.gain.value = level * 0.25;
    src.connect(lp); lp.connect(g); g.connect(out.gain);
    src.start(); lfo.start();
    out.stops.push(() => { src.stop(); lfo.stop(); });
  }

  // Crickets: quick high chirps in little bursts
  function crickets(out) {
    every(900, () => {
      if (!enabled || warmth > 0.7) return;           // they quieten as dawn comes
      const t = ac.currentTime, f = 4200 + Math.random() * 600;
      for (let k = 0; k < 3; k++) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = f; o.type = "sine";
        g.gain.setValueAtTime(0, t + k * 0.06);
        g.gain.linearRampToValueAtTime(0.025 * (1 - warmth), t + k * 0.06 + 0.01);
        g.gain.linearRampToValueAtTime(0, t + k * 0.06 + 0.04);
        o.connect(g); g.connect(out.gain); o.start(t + k * 0.06); o.stop(t + k * 0.06 + 0.05);
      }
    }, 1400);
  }

  // Owl: two soft falling hoots, now and then
  function owl(out) {
    every(14000, () => {
      if (!enabled || warmth > 0.5) return;
      const t = ac.currentTime;
      [[0, 0.35], [0.55, 0.6]].forEach(([at, len]) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(420, t + at); o.frequency.exponentialRampToValueAtTime(330, t + at + len);
        g.gain.setValueAtTime(0, t + at); g.gain.linearRampToValueAtTime(0.06, t + at + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
        o.connect(g); g.connect(out.gain); o.start(t + at); o.stop(t + at + len + 0.05);
      });
    }, 12000);
  }

  // Pad: slow, soft chords that drift between a few shapes; brighter as `warmth` rises
  function pad(out, root = 57) {
    const chords = [[0, 7, 15], [-4, 3, 12], [-2, 5, 14], [-5, 2, 10]];   // i, VI, VII, v-ish voicings
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700;
    lp.connect(out.gain);
    let voices = [];
    const play = (k) => {
      const t = ac.currentTime;
      voices.forEach(({ o, g }) => { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, 1.5); o.stop(t + 6); });
      voices = chords[k % chords.length].map((n, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = i ? "sine" : "triangle";
        o.frequency.value = midiToHz(root + n);
        o.detune.value = (Math.random() - 0.5) * 8;
        g.gain.value = 0; g.gain.setTargetAtTime(0.05, t, 2);
        o.connect(g); g.connect(lp); o.start(t);
        return { o, g };
      });
      lp.frequency.setTargetAtTime(600 + warmth * 1400, t, 3);
    };
    let k = 0;
    play(k);
    every(9000, () => play(++k));
    out.stops.push(() => voices.forEach(({ o }) => o.stop()));
  }

  // Piano-like notes: a soft attack and a long decay, picked from the pentatonic scale
  function melody(out, root = 69) {
    every(2600, () => {
      if (!enabled || Math.random() < 0.25) return;
      const t = ac.currentTime;
      const note = root + PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)] + (Math.random() < 0.3 ? 12 : 0);
      [1, 2].forEach((h, i) => {               // fundamental + a quiet octave for a bell-ish piano tone
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = midiToHz(note) * h;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(i ? 0.012 : 0.05, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
        o.connect(g); g.connect(out.gain); o.start(t); o.stop(t + 3.6);
      });
    }, 1800);
  }

  const SCENES = {
    forest(out) { wind(out, 0.6); crickets(out); owl(out); pad(out, 57); melody(out, 69); },
  };

  function stopScene() {
    timers.forEach(clearTimeout); timers.clear();
    for (const [name, L] of layers) {
      L.gain.gain.setTargetAtTime(0, ac.currentTime, 0.8);
      setTimeout(() => L.stops.forEach((s) => { try { s(); } catch {} }), 4000);
      layers.delete(name);
    }
  }

  return {
    get enabled() { return enabled; },
    // Turn sound on or off (must be called from a tap/click the first time)
    setEnabled(on) {
      init();
      enabled = on;
      if (on) ac.resume();
      master.gain.setTargetAtTime(on ? 0.9 : 0, ac.currentTime, 0.4);
      if (on && scene && !layers.size) this.scene(scene, true);
    },
    // Switch to a world's soundscape
    scene(name, force = false) {
      if (name === scene && !force) return;
      scene = name;
      if (!ac || !enabled) return;
      stopScene();
      SCENES[name]?.(layer(name, 1));
    },
    // 0 = night, 1 = dawn: brightens the pad and quietens the night creatures
    setWarmth(w) { warmth = w; },
  };
}
