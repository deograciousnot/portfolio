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

  // Blood rushing: low filtered noise that swells on each beat (see pulse())
  let rush = null;
  function bloodRush(out) {
    const src = ac.createBufferSource(); src.buffer = noiseBuffer(); src.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 180; lp.Q.value = 1.2;
    const g = ac.createGain(); g.gain.value = 0.12;
    src.connect(lp); lp.connect(g); g.connect(out.gain);
    src.start();
    rush = { lp, g };
    out.stops.push(() => { src.stop(); rush = null; });
  }

  // A deep, warm drone under everything
  function drone(out, hz = 55) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain();
    o.type = "sine"; o.frequency.value = hz; o2.type = "sine"; o2.frequency.value = hz * 1.5; o2.detune.value = 4;
    g.gain.value = 0.05;
    o.connect(g); o2.connect(g); g.connect(out.gain);
    o.start(); o2.start();
    out.stops.push(() => { o.stop(); o2.stop(); });
  }

  // One heartbeat: "lub" (a deep thump) then "dub" (a slightly higher, softer one)
  function thump(at, hz, level) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(hz, at); o.frequency.exponentialRampToValueAtTime(hz * 0.6, at + 0.14);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(level, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    o.connect(g); g.connect(master); o.start(at); o.stop(at + 0.25);
  }

  // Morning birds: quick rising or falling whistles, in little phrases
  function birds(out) {
    every(2200, () => {
      if (!enabled) return;
      const t = ac.currentTime, base = 2400 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 4), up = Math.random() < 0.5;
      for (let k = 0; k < n; k++) {
        const o = ac.createOscillator(), g = ac.createGain(), at = t + k * 0.13;
        o.type = "sine";
        o.frequency.setValueAtTime(base * (up ? 0.85 : 1.15), at); o.frequency.exponentialRampToValueAtTime(base * (up ? 1.2 : 0.8), at + 0.09);
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.02, at + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
        o.connect(g); g.connect(out.gain); o.start(at); o.stop(at + 0.12);
      }
    }, 2600);
  }

  // A slow clock ticking somewhere in the vault
  function clock(out) {
    let tock = false;
    every(1000, () => {
      if (!enabled) return;
      const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(), bp = ac.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = tock ? 1800 : 2400; bp.Q.value = 8;
      o.type = "square"; o.frequency.value = tock ? 900 : 1200; tock = !tock;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(bp); bp.connect(g); g.connect(out.gain); o.start(t); o.stop(t + 0.06);
    });
  }

  const SCENES = {
    forest(out) { wind(out, 0.6); crickets(out); owl(out); pad(out, 57); melody(out, 69); },
    heart(out) { drone(out, 55); bloodRush(out); pad(out, 52); melody(out, 64); },
    fields(out) { wind(out, 0.35); birds(out); pad(out, 60); melody(out, 72); },
    vault(out) { drone(out, 49); clock(out); pad(out, 50); melody(out, 62); },
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
    // A soft bell when something connects; each one a step higher up the scale
    chime(step = 0) {
      if (!ac || !enabled) return;
      const t = ac.currentTime, note = 72 + PENTATONIC[step % 5] + 12 * Math.floor(step / 5);
      [1, 2.01, 3.02].forEach((h, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = midiToHz(note) * h;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime([0.09, 0.03, 0.015][i], t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + 2.6);
      });
    },
    // A low thud (a wrong guess)
    thud() { if (ac && enabled) thump(ac.currentTime, 48, 0.4); },
    // A heartbeat, now. `speed` < 1 stretches the gap between lub and dub (slow motion).
    pulse(speed = 1) {
      if (!ac || !enabled) return;
      const t = ac.currentTime;
      thump(t, 62, 0.55);
      thump(t + 0.3 / Math.max(speed, 0.2), 78, 0.32);
      if (rush) {
        rush.lp.frequency.cancelScheduledValues(t);
        rush.lp.frequency.setValueAtTime(520, t); rush.lp.frequency.setTargetAtTime(180, t + 0.05, 0.25);
        rush.g.gain.setValueAtTime(0.22, t); rush.g.gain.setTargetAtTime(0.12, t + 0.05, 0.3);
      }
    },
  };
}
