// Chapter 4 · The Gold Vault
// Twenty years of real gold prices (weekly closes, 2005-2026, from the gold-bot research) as an
// avenue of gold bars in a dark vault: one bar per week, as tall as that week's price.
// Quest: walk through time; at six random moments the future hasn't been built yet. Guess:
// up or down next month? Then the honest part: how a coin would have done, and what 33
// tested strategies found. Fragment: Honesty.
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const SPACING = 0.42;          // world units between weekly bars
const TALL = 30;               // height of the tallest bar
const STOPS = 6;
const AHEAD = 4;               // a "month" = four weekly bars
const BAR_OFFSET = 6;          // bars stand this far to the right of the walker

const EVENTS = [
  ["2008-09", "2008", "the financial crisis"],
  ["2011-09", "2011", "$1,900: a peak that took nine years to beat"],
  ["2013-04", "2013", "the crash"],
  ["2020-03", "2020", "the pandemic"],
  ["2024-03", "2024", "new records"],
  ["2025-10", "2025", "past $4,000"],
];

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

// A floating label: a big year and a small caption, drawn on a canvas
function label(THREE, big, small) {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 256;
  const g = c.getContext("2d");
  g.textAlign = "center";
  g.fillStyle = "#ffd27a"; g.shadowColor = "rgba(255,170,60,.8)"; g.shadowBlur = 24;
  g.font = "650 120px Fraunces, Georgia, serif"; g.fillText(big, 512, 130);
  g.shadowBlur = 0; g.fillStyle = "rgba(255,236,200,.85)";
  g.font = "italic 400 52px Fraunces, Georgia, serif"; g.fillText(small, 512, 210);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(26, 6.5, 1);
  return s;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export default {
  id: "vault",
  title: "The Gold Vault",
  fragment: "Honesty",

  async build({ THREE, scene, frameFns, rig, renderer }) {
    const data = await fetch("story/assets/gold.json").then((r) => r.json());
    const disposables = [];
    const keep = (x) => { disposables.push(x); return x; };
    const fns = [];
    const every = (fn) => { fns.push(fn); frameFns.add(fn); };

    const P = data.closes, N = P.length, top = Math.max(...P);
    const start = new Date(data.start + "T00:00:00Z");
    const dateOf = (i) => new Date(start.getTime() + i * 7 * 86400000);
    const indexOf = (ym) => { const [y, m] = ym.split("-").map(Number); return Math.max(0, Math.min(N - 1, Math.round((Date.UTC(y, m - 1, 15) - start) / (7 * 86400000)))); };

    // ---------- The vault: black polished floor, warm haze, a reflective environment for the gold ----------
    scene.background = new THREE.Color(0x050403);
    scene.fog = new THREE.FogExp2(0x140d07, 0.016);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.02).texture;
    pmrem.dispose();
    scene.environment = env;
    disposables.push(env);
    scene.add(new THREE.HemisphereLight(0x8a7458, 0x0a0705, 1.1));
    const key = new THREE.DirectionalLight(0xffd9a0, 2.2);
    key.position.set(-20, 40, 30);
    scene.add(key);

    // The avenue: a gentle S-curve through time. Walker on the path, bars just to its right.
    const pathAt = (i) => {
      const x = i * SPACING, z = Math.sin((i / N) * Math.PI * 1.4) * 22;
      return new THREE.Vector3(x, 0, z);
    };
    const sideAt = (i) => {                                       // unit vector from path to the bars
      const a = pathAt(Math.max(0, i - 1)), b = pathAt(Math.min(N - 1, i + 1));
      const t = b.sub(a).normalize();
      return new THREE.Vector3(-t.z, 0, t.x);
    };
    const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(N * SPACING + 200, 260)),
      keep(new THREE.MeshStandardMaterial({ color: 0x0f0b08, metalness: 0.2, roughness: 0.6, envMapIntensity: 0.1 })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(N * SPACING / 2, 0, 0);
    scene.add(floor);

    // ---------- One gold bar per week ----------
    const barGeo = keep(new THREE.BoxGeometry(SPACING * 0.78, 1, 0.9));
    barGeo.translate(0, 0.5, 0);                                  // grows up from the floor
    const goldMat = keep(new THREE.MeshStandardMaterial({ color: 0xffd27a, metalness: 0.9, roughness: 0.32, envMapIntensity: 2.6, emissive: 0x3a2206 }));
    const bars = new THREE.InstancedMesh(barGeo, goldMat, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), col = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    const heightOf = (i) => 0.6 + (P[i] / top) * TALL;
    const shown = new Float32Array(N);                            // 0..1, how far each bar has risen
    const bornAt = new Float64Array(N);                           // when each bar was revealed (ms)
    function placeBar(i) {
      const side = sideAt(i), at = pathAt(i).addScaledVector(side, BAR_OFFSET);
      q.setFromAxisAngle(up, Math.atan2(side.x, side.z));
      m4.compose(p3.copy(at), q, s3.set(1, Math.max(0.001, heightOf(i) * shown[i]), 1));
      bars.setMatrixAt(i, m4);
    }
    for (let i = 0; i < N; i++) {
      // weeks that closed higher are bright gold, weeks that fell are a duller bronze
      bars.setColorAt(i, col.setHex(i && P[i] < P[i - 1] ? 0xb07a3a : 0xffffff));
      placeBar(i);
    }
    bars.count = 0;                                               // the future isn't built yet
    bars.frustumCulled = false;                                   // its bounds change as bars appear
    scene.add(bars);

    // ---------- Year and event labels, standing over the bars ----------
    const labels = EVENTS.map(([ym, big, small]) => {
      const i = indexOf(ym), L = label(THREE, big, small);
      keep(L.material.map); keep(L.material);
      const side = sideAt(i);
      L.position.copy(pathAt(i)).addScaledVector(side, BAR_OFFSET);
      L.position.y = heightOf(i) + 6;
      L.material.opacity = 0;
      scene.add(L);
      return { i, L };
    });

    // ---------- Columns of the vault on the far side of the path ----------
    const colGeo = keep(new THREE.CylinderGeometry(0.7, 0.85, 36, 10)), colMat = keep(new THREE.MeshStandardMaterial({ color: 0x241c15, roughness: 0.8 }));
    for (let i = 0; i < N; i += 40) {
      const c = new THREE.Mesh(colGeo, colMat);
      c.position.copy(pathAt(i)).addScaledVector(sideAt(i), -9);
      c.position.y = 18;
      scene.add(c);
    }

    // ---------- Gold dust in the air around the visitor ----------
    const dot = keep(softDot(THREE));
    const dustN = 400, dustPos = new Float32Array(dustN * 3), dust = [];
    for (let k = 0; k < dustN; k++) dust.push({ x: (Math.random() - 0.5) * 40, y: Math.random() * 20, z: (Math.random() - 0.5) * 40, s: Math.random() * 6 });
    const dustGeo = keep(new THREE.BufferGeometry());
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dustPts = new THREE.Points(dustGeo, keep(new THREE.PointsMaterial({ map: dot, size: 0.18, color: 0xffd58a, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending })));
    dustPts.frustumCulled = false;
    scene.add(dustPts);

    // A warm lantern that travels with the visitor
    const lantern = new THREE.PointLight(0xffc27a, 10, 24, 1.8);
    scene.add(lantern);

    // ---------- A price ticker in the corner ----------
    const ticker = document.createElement("div");
    ticker.className = "ticker";
    ticker.setAttribute("aria-hidden", "true");
    ticker.hidden = true;
    document.body.appendChild(ticker);
    const fmtDate = (i) => dateOf(i).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    const setTicker = (i) => { ticker.innerHTML = `<span>${fmtDate(i)}</span><b>$${Math.round(P[i]).toLocaleString("en-US")}</b>`; };

    // ---------- Reveal bars up to index n (they rise quickly) ----------
    let revealed = 0;
    function reveal(n) {
      n = Math.min(N, Math.max(n, revealed));
      const now = performance.now();
      for (let i = revealed; i < n; i++) bornAt[i] = now;
      bars.count = Math.max(bars.count, n);
      revealed = n;
    }
    // rise the newest bars over 0.4 s of real time (a timer keeps it going if frames pause)
    let risingFrom = 0;
    const rise = () => {
      const now = performance.now();
      let dirty = false;
      for (let i = risingFrom; i < revealed; i++) {
        if (shown[i] < 1) { shown[i] = Math.min(1, (now - bornAt[i]) / 400); placeBar(i); dirty = true; }
        else if (i === risingFrom) risingFrom++;
      }
      if (dirty) bars.instanceMatrix.needsUpdate = true;
    };
    const riseTimer = setInterval(rise, 100);
    every((t, dt) => {
      rise();
      // labels fade in once their bar exists
      labels.forEach(({ i, L }) => { L.material.opacity += ((i < revealed ? 1 : 0) - L.material.opacity) * Math.min(1, dt * 2); });
      // dust drifts around the visitor
      const cx = rig.position.x, cz = rig.position.z;
      dust.forEach((d, k) => {
        d.y += dt * 0.15; if (d.y > 20) d.y = 0;
        dustPos.set([cx + d.x + Math.sin(t * 0.3 + d.s) * 0.6, d.y, cz + d.z + Math.cos(t * 0.25 + d.s) * 0.6], k * 3);
      });
      dustGeo.attributes.position.needsUpdate = true;
      lantern.position.set(rig.position.x, 6, rig.position.z);
    });

    // ---------- The fragment, at the end of the avenue ----------
    const fragment = new THREE.Group();
    const gem = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(0.45, 0)), keep(new THREE.MeshBasicMaterial({ color: 0xff6b55 })));
    const gemHalo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: dot, color: 0xff6b55, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })));
    gemHalo.scale.set(3.4, 3.4, 1);
    const fhit = new THREE.Mesh(keep(new THREE.SphereGeometry(1.6, 8, 6)), keep(new THREE.MeshBasicMaterial({ visible: false })));
    fragment.add(gem, gemHalo, fhit);
    fragment.position.copy(pathAt(N - 1)).add(new THREE.Vector3(5, 2.4, 0));
    fragment.visible = false;
    scene.add(fragment);
    every((t, dt) => { gem.rotation.x += dt * 0.6; gem.rotation.y += dt * 0.9; gemHalo.material.opacity = 0.6 + Math.sin(t * 2.4) * 0.2; });

    return {
      N, P, pathAt, sideAt, reveal, ticker, setTicker, fmtDate, fragment, heightOf,
      // a point on the wall of bars a little ahead of week i, at a comfortable height
      wallAhead(i, eye) { const j = Math.min(N - 1, i + 6); return pathAt(j).addScaledVector(sideAt(j), BAR_OFFSET).setY(eye + 1.5); },
      get revealed() { return revealed; },
      dispose() {
        fns.forEach((f) => frameFns.delete(f));
        disposables.forEach((d) => d.dispose?.());
        ticker.remove(); clearInterval(riseTimer);
        scene.environment = null;
        scene.clear();
      },
    };
  },

  async play(ctx, world) {
    const { THREE, rig, cinema, card, fly, say, prompt, holdToWalk, tapObject, collect, wait, sound, frameFns } = ctx;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const { N, P, pathAt } = world;
    const EYE = 2.4;

    // 1. A slow push down the dark avenue; the first years rise out of the floor
    cinema(true);
    world.reveal(30);
    const a0 = pathAt(0);
    const intro = new THREE.CatmullRomCurve3([a0.clone().add(V(-30, 14, -16)), a0.clone().add(V(-14, 7, -6)), a0.clone().add(V(-2, EYE, 0))]);
    const flight = fly(intro, 10, { lookAt: pathAt(40).add(V(0, 3, 6)) });
    await wait(1000);
    await card("<span>Chapter four</span><b>The Gold Vault</b>", 3000);
    await flight;
    cinema(false);
    world.ticker.hidden = false;
    world.setTicker(0);
    await say([
      "Between the farm and the market sits the price.\nAnd prices move.",
      "This vault holds twenty years of real gold prices:\none bar for every week, from 2005 to 2026.",
      "I wanted to know if anyone could see the next bar coming.\nSo: can you?",
    ]);

    // 2. Walk through time. Six stops, each at a random week inside its stretch of years,
    //    so the moments aren't cherry-picked. At each one, guess the next month.
    const stops = [];
    for (let k = 0; k < STOPS; k++) {
      const lo = Math.floor(((k + 0.25) / (STOPS + 0.5)) * N), hi = Math.floor(((k + 0.85) / (STOPS + 0.5)) * N);
      stops.push(Math.min(N - AHEAD - 1, lo + Math.floor(Math.random() * (hi - lo))));
    }
    const segCurve = (a, b) => {
      const pts = [];
      for (let k = 0; k <= 12; k++) pts.push(pathAt(Math.round(a + ((b - a) * k) / 12)));
      return new THREE.CatmullRomCurve3(pts);
    };
    let at = 0, right = 0;
    const WALK = 'Hold (or space) to <b>walk through time</b><span class="meter"><i></i></span>';
    for (const stop of [...stops, N - 1]) {
      prompt(WALK);
      const from = at;
      await holdToWalk(segCurve(from, stop), {
        eye: EYE,
        speed: 0.035 * (N / Math.max(60, stop - from)),
        onProgress: (u) => { const i = Math.min(stop, Math.round(from + (stop - from) * u) + 30); world.reveal(i + 1); world.setTicker(i); },   // time builds ~7 months ahead, never past the next guess
      });
      at = stop;
      rig.target.copy(world.wallAhead(stop, EYE));   // the walk's look-ahead ends on itself; face the wall
      world.reveal(stop + 1);
      world.setTicker(stop);
      if (stop === N - 1) break;

      // The guess: the bars beyond this week don't exist yet
      const guess = await new Promise((resolve) => {
        prompt(`${world.fmtDate(stop)} · gold at <b>$${Math.round(P[stop]).toLocaleString("en-US")}</b>. Next month: <b>← down</b> or <b>up →</b>?<br><small>arrow keys, or tap the left or right side</small>`);
        const onKey = (e) => {
          if (e.code === "ArrowLeft" || e.code === "KeyA") finish(-1);
          if (e.code === "ArrowRight" || e.code === "KeyD") finish(1);
        };
        // a tap only counts if it starts after the question appears (not the end of the walking hold)
        let armed = false;
        const onDown = (e) => { if (!e.target.closest?.(".corner")) armed = true; };
        const onTap = (e) => { if (!armed || e.target.closest?.(".corner")) return; finish(e.clientX < innerWidth / 2 ? -1 : 1); };
        const finish = (g) => { removeEventListener("keydown", onKey); removeEventListener("pointerdown", onDown); removeEventListener("pointerup", onTap); resolve(g); };
        setTimeout(() => { addEventListener("keydown", onKey); addEventListener("pointerdown", onDown); addEventListener("pointerup", onTap); }, 250);
      });
      prompt(null);
      world.reveal(stop + 1 + AHEAD);
      const change = (P[stop + AHEAD] - P[stop]) / P[stop];
      const actual = change >= 0 ? 1 : -1, ok = actual === guess;
      if (ok) right++;
      ok ? sound?.chime?.(right + 2) : sound?.thud?.();
      await card(`<span>${actual > 0 ? "Up" : "Down"} ${Math.abs(change * 100).toFixed(1)}% · you said ${guess > 0 ? "up" : "down"}</span><b>${ok ? "✓ right" : "✗ wrong"}</b>`, 1800);
    }
    prompt(null);
    world.ticker.hidden = true;

    // 3. Look back along the whole wall of gold, then the honest part
    cinema(true);
    ctx.scene.fog.density = 0.007;                 // thin the haze so the whole wall shows
    const end = pathAt(N - 1);
    const back = new THREE.CatmullRomCurve3([end.clone().add(V(-2, EYE, 0)), end.clone().add(V(10, 10, -26)), end.clone().add(V(16, 26, -60))]);
    await fly(back, 8, { lookAt: pathAt(Math.floor(N * 0.45)).add(V(0, 6, 0)) });
    // chance of doing at least this well by flipping a coin
    const tail = [0, 1, 2, 3, 4, 5, 6].filter((k) => k >= right).reduce((s, k) => s + [1, 6, 15, 20, 15, 6, 1][k], 0) / 64;
    await say([
      `You called ${right} of ${STOPS}.`,
      right >= 5 ? `Impressive. Or lucky: a coin does that well ${Math.round(tail * 100)}% of the time.` :
        right <= 1 ? "Rough. But a coin does that badly sometimes too." : "That's about what a coin would do.",
      "I ran thirty-three strategies through these twenty years.\nReal costs, honest rules, and a correction for luck.",
      "None of them passed.\nOne survived its final exam, then failed on seven other markets.",
      "So it trades on a demo account, not on anyone's savings.",
    ]);
    cinema(false);
    ctx.scene.fog.density = 0.02;

    // 4. The fragment at the end of the avenue
    const toGem = new THREE.CatmullRomCurve3([rig.position.clone(), end.clone().add(V(-4, 8, -14)), end.clone().add(V(-1, EYE + 0.4, -3))]);
    world.fragment.visible = true;
    await fly(toGem, 6, { lookAt: world.fragment.position });
    prompt("Tap the light");
    await tapObject(world.fragment);
    prompt(null);
    collect(this.fragment);
    world.fragment.visible = false;
    await wait(500);
    await say([
      "Fragment found: Honesty.\nThe hardest result to publish is “it doesn't work.”",
      "So I looked up, at things that obey their equations.\nA rocket doesn't care about anyone's opinion of it.",
    ]);
  },
};
