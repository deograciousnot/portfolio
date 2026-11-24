// Chapter 2 · Inside the Heartbeat
// The real average adult heart (19 CT scans, via heart3D) floats in the dark, beating to a real
// recorded heartbeat (PTB-XL record 00001). Its electrical wave sweeps the atria, then the
// ventricles, while the 3D heart vector traces its loop around it.
// Quest: tap in time with the beat. Then the camera follows the spark inside: SA node, AV node,
// down the septum to the apex, with time slowed so the wave can be seen washing over the walls.
// Fragment: Care.

const S = 5;                       // mesh units -> world units
const HIT_WINDOW = 0.2;            // seconds either side of the beat that count as "in time"
const HITS_NEEDED = 6;
const GIVE_UP_AFTER = 45;          // seconds: then the quest completes on its own

const vertexShader = /* glsl */ `
  attribute float act;
  attribute float repol;
  attribute float role;
  varying vec3 vN; varying vec3 vV; varying float vAct; varying float vRepol; varying float vRole;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    vAct = act; vRepol = repol; vRole = role;
    gl_Position = projectionMatrix * mv;
  }`;

const fragmentShader = /* glsl */ `
  uniform vec3 uBase; uniform vec3 uRim; uniform vec3 uGlow;
  uniform float uAlpha; uniform float uRimAlpha; uniform float uMode; uniform float uProgress; uniform float uFlash; uniform float uGain;
  varying vec3 vN; varying vec3 vV; varying float vAct; varying float vRepol; varying float vRole;
  void main() {
    float facing = abs(dot(normalize(vN), normalize(vV)));
    float rim = pow(1.0 - facing, 2.0);
    float vessel = vRole < 0.5 ? 1.0 : 0.0;
    vec3 col = uBase * (0.35 + 0.65 * rim) + uRim * rim * 0.7;
    float a = uAlpha * (1.0 - 0.4 * vessel) + rim * uRimAlpha;
    float lit = 0.0;
    bool atrial = uMode > 0.5 && uMode < 1.5 && vRole > 0.5 && vRole < 1.5;
    bool vent = uMode > 1.5 && uMode < 2.5 && vRole > 1.5;
    if (atrial || vent) {
      float d = uProgress - vAct;
      lit = exp(-pow(d / 0.07, 2.0)) * step(-0.05, d) + smoothstep(0.0, 0.12, d) * 0.3;
    }
    if (uMode > 2.5 && vRole > 1.5) lit = 0.3 * (1.0 - smoothstep(-0.02, 0.1, uProgress - vRepol));
    col += uGlow * (lit * 1.3 + uFlash * 0.25) * uGain;
    a += (lit * 0.55 + uFlash * 0.08) * uGain;
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));
  }`;

const decode = (b64, Type) => {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Type(bytes.buffer);
};

function softDot(THREE, inner = "rgba(255,255,255,1)") {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d"), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner); grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A red blood cell seen face-on: a disc with a paler dip in the middle
function cellDot(THREE) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d"), grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0, "rgba(255,150,140,0.55)"); grad.addColorStop(0.45, "rgba(220,60,60,0.9)");
  grad.addColorStop(0.8, "rgba(170,30,40,0.9)"); grad.addColorStop(1, "rgba(120,10,20,0)");
  g.fillStyle = grad; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The heart's clock. Runs on real time (performance.now), so it keeps going even if the browser
// stops sending frames, and can be slowed down without jumping.
function heartClock() {
  let base = 0, anchor = performance.now(), scale = 1;
  return {
    now() { return base + (performance.now() - anchor) / 1000 * scale; },
    setScale(s) { base = this.now(); anchor = performance.now(); scale = s; },
    get scale() { return scale; },
  };
}

export default {
  id: "heart",
  title: "Inside the Heartbeat",
  fragment: "Care",

  async build({ THREE, scene, frameFns, rig, sound }) {
    const [mesh, beat] = await Promise.all([
      fetch("story/assets/heart.json").then((r) => r.json()),
      fetch("data/heartbeat.json").then((r) => r.json()),
    ]);
    const disposables = [];
    const keep = (x) => { disposables.push(x); return x; };
    const fns = [];
    const every = (fn) => { fns.push(fn); frameFns.add(fn); };

    // ---------- The recorded beat: one cycle, phase labelled per sample ----------
    const N = beat.phase.length, period = 60 / beat.bpm;
    const segs = [];                                           // [label, start, length]
    for (let i = 0; i < N; i++) {
      if (!segs.length || segs.at(-1)[0] !== beat.phase[i]) segs.push([beat.phase[i], i, 0]);
      segs.at(-1)[2]++;
    }
    const qrsStart = segs.find((s) => s[0] === 2)[1];
    const tStart = segs.find((s) => s[0] === 3)[1];
    const qrsTime = (qrsStart / N) * period;                   // seconds into each cycle
    // mode + progress for the shader at a fractional sample position
    function wave(f) {
      const i = Math.floor(f);
      const s = segs.find((g) => i >= g[1] && i < g[1] + g[2]);
      if (s[0] > 0) return [s[0], (f - s[1]) / s[2]];
      if (i >= qrsStart && i < tStart) return [2, 1 + (f - qrsStart) / N];   // ST: ventricles stay lit
      return [0, 0];
    }

    // ---------- The void: deep red dark, a little fog ----------
    scene.background = new THREE.Color(0x070203);
    scene.fog = new THREE.FogExp2(0x1a0507, 0.018);

    // ---------- The real heart ----------
    const uniforms = {
      uBase: { value: new THREE.Color(0xff5a4e) }, uRim: { value: new THREE.Color(0xffb3a3) },
      uGlow: { value: new THREE.Color(0xffd08a) }, uAlpha: { value: 0.06 }, uRimAlpha: { value: 0.4 },
      uMode: { value: 0 }, uProgress: { value: 0 }, uFlash: { value: 0 }, uGain: { value: 1 },
    };
    const heartMat = keep(new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    const heart = new THREE.Group();
    const parts = {};
    const all = new THREE.Box3();
    for (const part of mesh.parts) {
      const g = keep(new THREE.BufferGeometry());
      const n = part.count;
      const pos = decode(part.positions, Float32Array);
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setIndex(new THREE.BufferAttribute(decode(part.indices, part.index32 ? Uint32Array : Uint16Array), 1));
      g.computeVertexNormals();
      const role = ["LV", "RV"].includes(part.name) ? 2 : ["LA", "RA"].includes(part.name) ? 1 : 0;
      const u8 = (key) => (part[key] ? Float32Array.from(decode(part[key], Uint8Array), (x) => x / 255) : new Float32Array(n));
      g.setAttribute("role", new THREE.BufferAttribute(new Float32Array(n).fill(role), 1));
      g.setAttribute("act", new THREE.BufferAttribute(role === 1 ? u8("atria") : u8("normal"), 1));
      g.setAttribute("repol", new THREE.BufferAttribute(u8("repol"), 1));
      g.computeBoundingBox();
      all.union(g.boundingBox);
      parts[part.name] = pos;
      heart.add(new THREE.Mesh(g, heartMat));
    }
    const center = all.getCenter(new THREE.Vector3());
    heart.scale.setScalar(S);
    heart.position.copy(center).multiplyScalar(-S);
    scene.add(heart);
    const toWorld = (v) => v.clone().sub(center).multiplyScalar(S);

    // Landmarks for the flight, found from the anatomy itself
    const centroid = (p) => { const c = new THREE.Vector3(); for (let i = 0; i < p.length; i += 3) c.x += p[i], c.y += p[i + 1], c.z += p[i + 2]; return c.divideScalar(p.length / 3); };
    const extreme = (p, score) => { let best = null, b = -Infinity; for (let i = 0; i < p.length; i += 3) { const v = new THREE.Vector3(p[i], p[i + 1], p[i + 2]), s = score(v); if (s > b) { b = s; best = v; } } return best; };
    const cRA = centroid(parts.RA), cRV = centroid(parts.RV), cLV = centroid(parts.LV), cLA = centroid(parts.LA);
    const base = cLA.clone().add(centroid(parts.aorta)).multiplyScalar(0.5);
    const saNode = extreme(parts.RA, (v) => v.y + v.z * 0.3);                    // top of the right atrium
    const apexOut = extreme(parts.LV, (v) => v.distanceTo(base));                 // tip of the heart
    const lv = toWorld(cLV), apexW = toWorld(apexOut);
    const marks = {
      sa: toWorld(saNode.clone().lerp(cRA, 0.25)),
      av: toWorld(cRA.clone().lerp(cRV, 0.45).lerp(cLV, 0.2)),
      septum: toWorld(cLV.clone().lerp(cRV, 0.5)),
      lv,                                                    // middle of the left ventricle's cavity
      rest: lv.clone().lerp(apexW, 0.15),                    // where the flight stops
      apex: lv.clone().lerp(apexW, 0.62),                    // where the fragment waits, deep in the cavity
    };

    // ---------- Glow behind the heart that swells with each beat ----------
    const dot = keep(softDot(THREE));
    const aura = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: dot, color: 0xff3b30, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    aura.scale.set(34, 34, 1);
    aura.position.set(0, 0, -6);
    scene.add(aura);

    // ---------- The heart's electrical vector: one loop per beat, with a spark riding it ----------
    const V = beat.vector, loopPts = [];
    for (let i = 0; i < N; i++) loopPts.push(new THREE.Vector3(V[0][i], -V[1][i], -V[2][i]).multiplyScalar(13));
    // a thin glowing tube (WebGL lines are only one pixel wide)
    const loopGeo = keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loopPts, true), 400, 0.07, 6, true));
    const loopMat = keep(new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    const loop = new THREE.Mesh(loopGeo, loopMat);
    loop.position.set(0, 0, 0.5);
    scene.add(loop);
    const spark = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: dot, color: 0xfff1c9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    spark.scale.set(1.4, 1.4, 1);
    loop.add(spark);

    // ---------- Blood cells drifting around wherever the visitor is ----------
    const cellN = 700, cellPos = new Float32Array(cellN * 3), cells = [];
    for (let k = 0; k < cellN; k++) cells.push({ x: (Math.random() - 0.5) * 60, y: (Math.random() - 0.5) * 40, z: (Math.random() - 0.5) * 60, s: Math.random() * 6 });
    const cellGeo = keep(new THREE.BufferGeometry());
    cellGeo.setAttribute("position", new THREE.BufferAttribute(cellPos, 3));
    const cellMat = keep(new THREE.PointsMaterial({ map: keep(cellDot(THREE)), size: 0.55, transparent: true, opacity: 0.75, depthWrite: false }));
    const cellPoints = new THREE.Points(cellGeo, cellMat);
    cellPoints.frustumCulled = false;            // they follow the camera, so their bounds keep moving
    scene.add(cellPoints);

    // ---------- A small heart monitor in the corner, sweeping like a real one ----------
    const monitor = document.createElement("canvas");
    monitor.className = "monitor";
    monitor.setAttribute("aria-hidden", "true");
    monitor.width = 480; monitor.height = 140;
    monitor.hidden = true;
    document.body.appendChild(monitor);
    const mctx = monitor.getContext("2d");
    const L2 = beat.leadII, lMin = Math.min(...L2), lMax = Math.max(...L2);
    const leadAt = (t) => L2[Math.floor((((t % period) + period) % period) / period * N) % N];

    function drawMonitor(ht) {
      const W = monitor.width, H = monitor.height, windowS = 3;
      mctx.clearRect(0, 0, W, H);
      mctx.strokeStyle = "rgba(255,107,85,0.12)"; mctx.lineWidth = 1;
      for (let x = 0; x < W; x += 24) { mctx.beginPath(); mctx.moveTo(x, 0); mctx.lineTo(x, H); mctx.stroke(); }
      const head = ((ht % windowS) / windowS) * W;
      mctx.strokeStyle = "#ff6b55"; mctx.lineWidth = 3; mctx.shadowColor = "#ff6b55"; mctx.shadowBlur = 8;
      mctx.beginPath();
      let pen = false;
      for (let x = 0; x < W; x += 2) {
        const behind = (head - x + W) % W;
        if (behind < 0 || behind > W - 26) { pen = false; continue; }          // the gap just ahead of the sweep
        const v = leadAt(ht - (behind / W) * windowS);
        const y = H - 14 - ((v - lMin) / (lMax - lMin)) * (H - 28);
        pen ? mctx.lineTo(x, y) : mctx.moveTo(x, y);
        pen = true;
      }
      mctx.stroke();
      mctx.shadowBlur = 0;
      mctx.fillStyle = "#ff6b55"; mctx.font = "500 22px JetBrains Mono, monospace";
      mctx.fillText(`♥ ${Math.round(beat.bpm * clock.scale)} bpm`, 14, 30);
    }

    // ---------- The beat ----------
    const clock = heartClock();
    let lastBeat = -1, flash = 0, surge = 0;
    const listeners = new Set();                                 // things that want to know about each beat
    every((t, dt) => {
      const ht = clock.now();
      const f = ((((ht % period) + period) % period) / period) * N;
      const [mode, progress] = wave(f);
      uniforms.uMode.value = mode;
      uniforms.uProgress.value = progress;
      // a beat lands at the start of the QRS
      const k = Math.floor((ht - qrsTime) / period);
      if (k !== lastBeat) {
        if (lastBeat !== -1) { flash = 1; surge = 1; sound?.pulse?.(clock.scale); listeners.forEach((fn) => fn(k)); }
        lastBeat = k;
      }
      flash = Math.max(0, flash - dt * 3);
      surge = Math.max(0, surge - dt * 1.6);
      uniforms.uFlash.value = flash;
      aura.material.opacity = 0.14 + flash * 0.22;
      aura.scale.setScalar(32 + flash * 6);
      heart.scale.setScalar(S * (1 + flash * 0.018));
      // the vector loop and its spark
      const idx = Math.floor(f) % N;
      spark.position.copy(loopPts[idx]);
      spark.material.opacity = mode === 2 ? 1 : 0.5;
      loopMat.opacity = 0.18 + (mode === 2 ? 0.35 : 0) + flash * 0.2;
      // blood cells flow past, surging on each beat
      const cx = rig.position.x, cy = rig.position.y, cz = rig.position.z, push = dt * (1.2 + surge * 9);
      cells.forEach((c, n) => {
        c.z += push;
        if (c.z > 30) c.z -= 60;
        cellPos[n * 3] = cx + c.x + Math.sin(t * 0.5 + c.s) * 0.8;
        cellPos[n * 3 + 1] = cy + c.y + Math.cos(t * 0.4 + c.s) * 0.6;
        cellPos[n * 3 + 2] = cz + c.z;
      });
      cellGeo.attributes.position.needsUpdate = true;
      if (!monitor.hidden) drawMonitor(ht);
    });

    // ---------- The fragment, waiting at the apex ----------
    const fragment = new THREE.Group();
    const gem = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(0.28, 0)), keep(new THREE.MeshBasicMaterial({ color: 0xff6b55 })));
    const gemHalo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: dot, color: 0xff6b55, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })));
    gemHalo.scale.set(2.2, 2.2, 1);
    const hit = new THREE.Mesh(keep(new THREE.SphereGeometry(1.2, 8, 6)), keep(new THREE.MeshBasicMaterial({ visible: false })));
    fragment.add(gem, gemHalo, hit);
    fragment.position.copy(marks.apex);
    fragment.visible = false;
    scene.add(fragment);
    every((t, dt) => { gem.rotation.x += dt * 0.6; gem.rotation.y += dt * 0.9; gemHalo.material.opacity = 0.6 + Math.sin(t * 2.4) * 0.2; });

    // Inside the heart, many see-through walls overlap right in front of the camera: thin them out
    function setInside(on) {
      uniforms.uAlpha.value = on ? 0.045 : 0.06;
      uniforms.uRimAlpha.value = on ? 0.42 : 0.4;
      uniforms.uBase.value.setHex(on ? 0xff7a66 : 0xff5a4e);
      uniforms.uGain.value = on ? 0.3 : 1;       // walls are close inside: the wave would blind you
      loop.visible = !on;
      aura.visible = !on;
      cellMat.size = on ? 0.18 : 0.55;
      cellMat.opacity = on ? 0.55 : 0.75;
      scene.fog.color.setHex(on ? 0x2a090c : 0x1a0507);
      scene.fog.density = on ? 0.022 : 0.018;
    }

    // The spark the visitor follows inside: a bright point with a halo and a short glowing tail
    const guide = new THREE.Group();
    const guideCore = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: dot, color: 0xfff4d6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    guideCore.scale.set(0.35, 0.35, 1);
    const guideHalo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: dot, color: 0xffa060, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    guideHalo.scale.set(1.1, 1.1, 1);
    guide.add(guideHalo, guideCore);
    guide.visible = false;
    scene.add(guide);
    every((t) => { guideHalo.material.opacity = 0.55 + Math.sin(t * 9) * 0.2; });

    return {
      clock, period, qrsTime, marks, fragment, monitor, listeners, heart, setInside, guide,
      // seconds from the nearest beat (negative = early)
      offsetFromBeat() {
        const ht = clock.now();
        const k = Math.round((ht - qrsTime) / period);
        return { k, dt: ht - (k * period + qrsTime) };
      },
      dispose() {
        fns.forEach((f) => frameFns.delete(f));
        disposables.forEach((d) => d.dispose?.());
        monitor.remove();
        scene.clear();
      },
    };
  },

  async play(ctx, world) {
    const { THREE, rig, cinema, card, fly, say, prompt, tapObject, collect, wait, calm } = ctx;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    // 1. Out of the dark: the heart comes into view, already beating
    cinema(true);
    const approach = new THREE.CatmullRomCurve3([V(-30, 14, 70), V(-14, 8, 46), V(-4, 3, 30), V(0, 1, 22)]);
    const flight = fly(approach, 12, { lookAt: V(0, 0, 0) });
    await wait(1000);
    await card("<span>Chapter two</span><b>Inside the Heartbeat</b>", 3000);
    await flight;
    cinema(false);
    world.monitor.hidden = false;

    await say([
      "Before I knew how to build anything,\nI wanted to know how this works.",
      "A real heart: the average of nineteen CT scans.\nBeating to a real recorded heartbeat.",
      "An ECG only catches its shadows:\ntwelve flat lines, cast by one arrow swinging through the chest.",
      "So I rebuilt the arrow.\nThat golden loop is it, drawn once every beat.",
    ]);

    // 2. Quest: tap in time with the heartbeat
    if (window.story) window.story.heart = world;   // ?debug: lets the autotest find the beat
    let hits = 0;
    const counted = new Set();
    const meter = () => `Tap (or press space) <b>in time with the heartbeat</b> · ${hits}/${HITS_NEEDED}<span class="meter"><i style="width:${(hits / HITS_NEEDED) * 100}%"></i></span>`;
    prompt(meter());
    await new Promise((resolve) => {
      let finished = false, feedback = null;
      const done = () => {
        if (finished) return;
        finished = true;
        removeEventListener("pointerdown", onTap); removeEventListener("keydown", onKey);
        clearTimeout(giveUp);
        resolve();
      };
      const tapsPerBeat = new Map();
      const judge = () => {
        const { k, dt } = world.offsetFromBeat();
        tapsPerBeat.set(k, (tapsPerBeat.get(k) || 0) + 1);
        if (tapsPerBeat.get(k) > 1) {                    // mashing: one tap per beat, please
          if (counted.delete(k)) { hits--; prompt(meter()); }
          return;
        }
        if (Math.abs(dt) <= HIT_WINDOW && !counted.has(k)) {
          counted.add(k); hits++;
          prompt(meter());
          if (hits >= HITS_NEEDED) setTimeout(() => (hits >= HITS_NEEDED ? done() : prompt(meter())), 600);
        } else if (!counted.has(k)) {
          clearTimeout(feedback);
          prompt(`${dt < 0 ? "A little early" : "A little late"}. Listen for the thump.<span class="meter"><i style="width:${(hits / HITS_NEEDED) * 100}%"></i></span>`);
          feedback = setTimeout(() => !finished && prompt(meter()), 900);
        }
      };
      const onTap = (e) => { if (e.target.closest && e.target.closest(".corner")) return; judge(); };
      const onKey = (e) => { if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); if (!e.repeat) judge(); } };
      addEventListener("pointerdown", onTap); addEventListener("keydown", onKey);
      const giveUp = setTimeout(done, (calm ? 15 : GIVE_UP_AFTER) * 1000);
    });
    prompt(null);
    await say([
      hits >= HITS_NEEDED ? "In sync.\nSixty-four beats a minute, about ninety thousand a day." : "Close enough.\nIt keeps time for you anyway: about ninety thousand beats a day.",
      "Now follow the spark inside.\nI'll slow time down so you can see it.",
    ]);

    // 3. Into the heart along its wiring, with time slowed
    cinema(true);
    world.monitor.hidden = true;
    world.clock.setScale(calm ? 1 : 0.22);
    const m = world.marks;
    // Leg 1: swing round to the top of the right atrium, eyes on the spot where the beat starts
    const outside = new THREE.CatmullRomCurve3([V(0, 1, 22), m.sa.clone().add(V(-6, 6, 12)), m.sa.clone().add(V(-1.5, 1.5, 3.5))]);
    const leg1 = fly(outside, 8, { lookAt: m.sa });
    await wait(1500);
    await card("<span>The SA node</span><b>where every beat begins</b>", 2800);
    await leg1;
    // Leg 2: through the wall and along the wiring, down into the left ventricle
    world.setInside(true);
    const wiring = new THREE.CatmullRomCurve3([m.sa.clone().add(V(-1.5, 1.5, 3.5)), m.sa, m.av, m.septum, m.lv, m.rest], false, "catmullrom", 0.3);
    const LEG2 = 18;
    const leg2 = fly(wiring, LEG2, { lookAhead: 0.06 });
    // The spark runs just ahead of the camera, on the same timing as the flight
    const t0 = performance.now(), dur = (calm ? Math.min(LEG2, 1.5) : LEG2) * 1000;
    const lead = () => {
      const u = Math.min(1, (performance.now() - t0) / dur), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      world.guide.position.copy(wiring.getPointAt(Math.min(1, e + 0.07)));
    };
    lead();
    world.guide.visible = true;
    ctx.frameFns.add(lead);
    const leadTimer = setInterval(lead, 100);   // keeps up even when frames pause (background tab)
    await wait(2500);
    await card("<span>The AV node</span><b>a tenth-of-a-second pause</b>", 2800);
    await card("<span>Down the septum</span><b>the heart's own wiring</b>", 2800);
    await leg2;
    ctx.frameFns.delete(lead); clearInterval(leadTimer);
    world.guide.visible = false;
    rig.target.copy(m.apex);                  // face the fragment (the flight's look-ahead ends on itself)
    world.clock.setScale(1);
    cinema(false);

    // 4. The fragment at the apex
    world.fragment.visible = true;
    prompt("Tap the light");
    await tapObject(world.fragment);
    prompt(null);
    collect(this.fragment);
    world.fragment.visible = false;
    await wait(500);
    await say([
      "Fragment found: Care.\nCuriosity asks how something works.\nCare asks who it's for.",
      "Behind every one of those 21,799 recordings\nwas a real person, lying still, hoping it was nothing.",
      "Beyond the heart, the land is waiting.\nSomeone has to feed all these heartbeats.",
    ]);
  },
};
