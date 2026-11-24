// Chapter 3 · The Fields
// The real ground of Uasin Gishu, Kenya's breadbasket: elevation from public terrain tiles
// (61 x 49 km, Eldoret in the west, the Elgeyo escarpment dropping into the Kerio Valley in the east).
// Sunrise over the escarpment, a patchwork of maize, wheat and pasture, mist in the valley.
// Quest: connect the farmers. Each farm you tap lights up and sends threads of light to the market
// and to the farms already connected: FarmConnect made visible.
// Fragment: Community.

const UNIT_M = 100;            // 1 world unit = 100 m on the ground
const EXAG = 2.5;              // vertical exaggeration, so the plateau's gentle relief reads from the air
const NEEDED = 5;

const FARMERS = [
  { name: "Chebet", place: "Kaptagat", text: "The rains came late this year.<b>Which maize held up for you?</b>" },
  { name: "Kiprono", text: "Forty bags of maize ready.<b>Who's buying near Eldoret?</b>" },
  { name: "Jepkoech", text: "My cows are giving less milk.<b>What feed are you using?</b>" },
  { name: "Kibet", text: "Is anyone else seeing<b>fall armyworm this season?</b>" },
  { name: "Cherono", text: "Potatoes ready next week.<b>Selling direct, no broker.</b>" },
  { name: "Kiptoo", text: "That wheat buyer paid on time last season.<b>I'd trade with them again.</b>" },
  { name: "Jeptoo", text: "Anyone with a tractor free<b>on Thursday?</b>" },
];

const vertexShader = /* glsl */ `
  attribute float metres;
  varying vec3 vW; varying vec3 vN; varying float vM;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vM = metres;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

// Land cover drawn in the shader: farm parcels on the flat plateau, bush on the slopes,
// dry savanna down in the Kerio Valley. Hedgerows between parcels, rows inside the crops.
const fragmentShader = /* glsl */ `
  uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uAmb; uniform vec3 uFog; uniform float uFogD;
  varying vec3 vW; varying vec3 vN; varying float vM;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec3 n = normalize(vN);
    float slope = 1.0 - n.y;
    vec2 p = vW.xz;
    vec2 region = floor(p / 90.0);
    float ang = (hash(region) - 0.5) * 0.7;
    mat2 R = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec2 q = R * p;
    vec2 size = vec2(6.0 + 9.0 * hash(region + 3.1), 4.0 + 6.0 * hash(region + 7.7));
    q.x += floor(q.y / size.y) * size.x * 0.37;          // stagger rows so parcels don't line up like tiles
    vec2 cell = floor(q / size), f = fract(q / size);
    float h = hash(cell + region * 13.0);
    vec3 maize = vec3(0.30, 0.45, 0.17), wheat = vec3(0.78, 0.66, 0.34), pasture = vec3(0.40, 0.55, 0.24), soil = vec3(0.47, 0.33, 0.22);
    vec3 farm = h < 0.34 ? maize : h < 0.58 ? wheat : h < 0.86 ? pasture : soil;
    farm *= 0.85 + 0.3 * hash(cell * 1.7 + 0.3);
    farm *= 0.93 + 0.07 * sin(q.x * 7.0);
    float edge = min(min(f.x, 1.0 - f.x) * size.x, min(f.y, 1.0 - f.y) * size.y);
    farm = mix(vec3(0.15, 0.23, 0.11), farm, smoothstep(0.1, 0.3, edge));
    float farmland = smoothstep(0.13, 0.05, slope) * smoothstep(1800.0, 1980.0, vM);
    vec3 wild = mix(vec3(0.58, 0.49, 0.34), vec3(0.24, 0.33, 0.17), smoothstep(1250.0, 1900.0, vM));
    wild = mix(wild, vec3(0.17, 0.25, 0.13), smoothstep(0.08, 0.3, slope) * 0.75);
    vec3 col = mix(wild, farm, farmland);
    float diff = max(dot(n, normalize(uSun)), 0.0);
    col *= uAmb + uSunCol * diff;
    float d = length(vW - cameraPosition);
    col = mix(col, uFog, 1.0 - exp(-pow(d * uFogD, 2.0)));
    gl_FragColor = vec4(col, 1.0);
  }`;

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

// Small seeded random, so the farms land in the same places for everyone
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export default {
  id: "fields",
  title: "The Fields",
  fragment: "Community",

  async build({ THREE, scene, frameFns, rig }) {
    const data = await fetch("story/assets/fields.json").then((r) => r.json());
    const disposables = [];
    const keep = (x) => { disposables.push(x); return x; };
    const fns = [];
    const every = (fn) => { fns.push(fn); frameFns.add(fn); };

    // ---------- Heights ----------
    const bin = atob(data.heights), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const M = new Uint16Array(bytes.buffer);
    const GW = data.w, GH = data.h;
    const WX = data.box.km[0] * 1000 / UNIT_M, WZ = data.box.km[1] * 1000 / UNIT_M;
    const toY = (m) => (m - 2000) / UNIT_M * EXAG;
    const metresAt = (x, z) => {                               // bilinear lookup in the real grid
      const gx = Math.min(GW - 1.001, Math.max(0, (x / WX + 0.5) * (GW - 1)));
      const gz = Math.min(GH - 1.001, Math.max(0, (z / WZ + 0.5) * (GH - 1)));
      const x0 = Math.floor(gx), z0 = Math.floor(gz), fx = gx - x0, fz = gz - z0;
      const a = M[z0 * GW + x0], b = M[z0 * GW + x0 + 1], c = M[(z0 + 1) * GW + x0], d = M[(z0 + 1) * GW + x0 + 1];
      return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
    };
    const groundAt = (x, z) => toY(metresAt(x, z));
    const place = (u, v) => new THREE.Vector3((u - 0.5) * WX, 0, (v - 0.5) * WZ);

    // ---------- Terrain ----------
    const geo = keep(new THREE.PlaneGeometry(WX, WZ, GW - 1, GH - 1));
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, metres = new Float32Array(pos.count);
    for (let k = 0; k < pos.count; k++) {
      const gx = k % GW, gz = Math.floor(k / GW);
      const m = M[gz * GW + gx];
      metres[k] = m;
      pos.setY(k, toY(m));
    }
    geo.setAttribute("metres", new THREE.BufferAttribute(metres, 1));
    geo.computeVertexNormals();
    const uniforms = {
      uSun: { value: new THREE.Vector3(1, 0.15, -0.25).normalize() }, uSunCol: { value: new THREE.Color(0xffc690) },
      uAmb: { value: new THREE.Color(0x4a5a78) }, uFog: { value: new THREE.Color(0xf0a878) }, uFogD: { value: 0.0034 },
    };
    const landMat = keep(new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader }));
    scene.add(new THREE.Mesh(geo, landMat));
    // Beyond the 61 km of real data, the land carries on (edge heights stretched outwards) so there's no
    // visible edge; the part under the real map is sunk out of sight.
    const SK = 140, skirt = keep(new THREE.PlaneGeometry(WX * 6, WZ * 6, SK, SK));
    skirt.rotateX(-Math.PI / 2);
    const sp = skirt.attributes.position, sm = new Float32Array(sp.count);
    for (let k = 0; k < sp.count; k++) {
      const x = sp.getX(k), z = sp.getZ(k), m = metresAt(x, z);
      const inside = Math.abs(x) < WX / 2 - 2 && Math.abs(z) < WZ / 2 - 2;
      sm[k] = m;
      sp.setY(k, toY(m) - (inside ? 60 : 0.3));
    }
    skirt.setAttribute("metres", new THREE.BufferAttribute(sm, 1));
    skirt.computeVertexNormals();
    scene.add(new THREE.Mesh(skirt, landMat));

    // ---------- Sky: sunrise over the escarpment, in the east (+x) ----------
    const skyMat = keep(new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x26375f) }, horizon: { value: new THREE.Color(0xf0a878) }, sunDir: { value: uniforms.uSun.value }, glow: { value: 0.6 } },
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform float glow; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y * 1.8 + 0.05, 0.0, 1.0); vec3 col = mix(horizon, top, pow(h, 0.6));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += vec3(1.0, 0.78, 0.52) * pow(s, 300.0) * 2.0;     // the sun's disc
        col += vec3(1.0, 0.65, 0.38) * pow(s, 12.0) * glow;     // its glow
        gl_FragColor = vec4(col, 1.0); }`,
    }));
    const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(560, 32, 16)), skyMat);
    scene.add(sky);
    every(() => sky.position.copy(rig.position));
    scene.fog = new THREE.FogExp2(0xf0a878, 0.0034);

    // ---------- Morning mist pooled in the valleys ----------
    const dot = keep(softDot(THREE));
    const mistN = 420, mistPos = new Float32Array(mistN * 3), r = rng(7);
    for (let k = 0, tries = 0; k < mistN && tries < 20000; tries++) {
      const x = (r() - 0.5) * WX, z = (r() - 0.5) * WZ, m = metresAt(x, z);
      if (m > 1500 && !(m < 2050 && r() < 0.25)) continue;     // the Kerio Valley floor, plus a few river valleys
      mistPos.set([x, toY(m) + 1 + r() * 4, z], k * 3); k++;
    }
    const mistGeo = keep(new THREE.BufferGeometry());
    mistGeo.setAttribute("position", new THREE.BufferAttribute(mistPos, 3));
    const mistMat = keep(new THREE.PointsMaterial({ map: dot, size: 40, color: 0xffe6d2, transparent: true, opacity: 0.16, depthWrite: false }));
    const mist = new THREE.Points(mistGeo, mistMat);
    mist.frustumCulled = false;
    scene.add(mist);

    // ---------- Eldoret: the market town, its lights still on at dawn ----------
    const market = place(...data.places.Eldoret);
    market.y = groundAt(market.x, market.z);
    const townN = 260, townPos = new Float32Array(townN * 3);
    for (let k = 0; k < townN; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 22;
      const x = market.x + Math.cos(a) * d, z = market.z + Math.sin(a) * d;
      townPos.set([x, groundAt(x, z) + 0.4, z], k * 3);
    }
    const townGeo = keep(new THREE.BufferGeometry());
    townGeo.setAttribute("position", new THREE.BufferAttribute(townPos, 3));
    const townMat = keep(new THREE.PointsMaterial({ map: dot, size: 1.1, color: 0xffcf8a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(new THREE.Points(townGeo, townMat));
    const marketGlow = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: dot, color: 0xffb060, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })));
    marketGlow.scale.set(45, 45, 1);
    marketGlow.position.copy(market).add(new THREE.Vector3(0, 4, 0));
    scene.add(marketGlow);

    // ---------- The farms: on flat plateau ground, spread out, Kaptagat among them ----------
    const kaptagat = place(...data.places.Kaptagat);
    const spots = [kaptagat];
    const fr = rng(2026);
    for (let tries = 0; spots.length < FARMERS.length && tries < 5000; tries++) {
      const p = place(0.25 + fr() * 0.38, 0.16 + fr() * 0.72);
      const m = metresAt(p.x, p.z);
      const flat = Math.abs(metresAt(p.x + 3, p.z) - m) + Math.abs(metresAt(p.x, p.z + 3) - m) < 25;
      if (m > 2000 && flat && spots.every((s) => s.distanceTo(p) > 70) && p.distanceTo(market) > 60) spots.push(p);
    }
    const beaconMatBase = { map: dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
    const pillarTex = (() => {
      const c = document.createElement("canvas"); c.width = 8; c.height = 128;
      const g = c.getContext("2d"), grad = g.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, "rgba(255,255,255,0)"); grad.addColorStop(1, "rgba(255,255,255,0.9)");
      g.fillStyle = grad; g.fillRect(0, 0, 8, 128);
      return keep(new THREE.CanvasTexture(c));
    })();
    const roofMat = keep(new THREE.MeshLambertMaterial({ color: 0x8a4b2c, flatShading: true }));
    const wallMat = keep(new THREE.MeshLambertMaterial({ color: 0xe8dcc4, flatShading: true }));
    const hutWall = keep(new THREE.CylinderGeometry(0.9, 0.9, 1.2, 8)), hutRoof = keep(new THREE.ConeGeometry(1.25, 1.1, 8));
    const farms = FARMERS.map((f, i) => {
      const p = spots[i % spots.length].clone();
      p.y = groundAt(p.x, p.z);
      const g = new THREE.Group();
      g.position.copy(p);
      // a homestead: two round huts
      for (const [dx, dz] of [[0, 0], [2.4, 1.2]]) {
        const w = new THREE.Mesh(hutWall, wallMat); w.position.set(dx, 0.6, dz);
        const rf = new THREE.Mesh(hutRoof, roofMat); rf.position.set(dx, 1.75, dz);
        g.add(w, rf);
      }
      const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ ...beaconMatBase, color: 0xbfd8ff, opacity: 0.55 })));
      halo.scale.set(12, 12, 1); halo.position.y = 4;
      const pillar = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.2, 16)), keep(new THREE.MeshBasicMaterial({ map: pillarTex, color: 0xbfd8ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
      pillar.position.y = 8;
      const hit = new THREE.Mesh(keep(new THREE.SphereGeometry(9, 8, 6)), keep(new THREE.MeshBasicMaterial({ visible: false })));
      hit.position.y = 4;
      g.add(halo, pillar, hit);
      scene.add(g);
      return { ...f, pos: p, group: g, halo, pillar, hit, lit: 0, on: false };
    });

    // ---------- Threads of light between connected places ----------
    const threads = [];
    const threadMat = () => keep(new THREE.MeshBasicMaterial({ color: 0xffa94d, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    function connect(a, b) {
      const mid = a.clone().lerp(b, 0.5);
      mid.y = Math.max(a.y, b.y) + a.distanceTo(b) * 0.22;
      const curve = new THREE.QuadraticBezierCurve3(a.clone().add(new THREE.Vector3(0, 4, 0)), mid, b.clone().add(new THREE.Vector3(0, 4, 0)));
      const tube = keep(new THREE.TubeGeometry(curve, 64, 0.7, 6, false));
      const mesh = new THREE.Mesh(tube, threadMat());
      tube.setDrawRange(0, 0);
      scene.add(mesh);
      const pulse = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: dot, color: 0xfff1c9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
      pulse.scale.set(9, 9, 1);
      scene.add(pulse);
      threads.push({ curve, tube, mesh, pulse, grow: 0, born: performance.now(), phase: Math.random(), total: tube.index.count });
    }

    // ---------- Light and time of morning ----------
    let morning = 0;
    function setMorning(w) {
      morning = w;
      skyMat.uniforms.top.value.setHex(0x26375f).lerp(new THREE.Color(0x5b8fd0), w);
      skyMat.uniforms.horizon.value.setHex(0xf0a878).lerp(new THREE.Color(0xcfe0ee), w);
      skyMat.uniforms.glow.value = 0.6 * (1 - w * 0.6);
      uniforms.uSun.value.set(1, 0.15 + w * 0.5, -0.25).normalize();
      uniforms.uSunCol.value.setHex(0xffc690).lerp(new THREE.Color(0xfff2dc), w);
      uniforms.uAmb.value.setHex(0x4a5a78).lerp(new THREE.Color(0x7d8ea8), w);
      uniforms.uFog.value.copy(skyMat.uniforms.horizon.value);
      scene.fog.color.copy(uniforms.uFog.value);
      townMat.opacity = 0.9 * (1 - smooth(0.3, 0.9, w));
      mistMat.opacity = 0.16 * (1 - w * 0.6);
    }
    setMorning(0);

    every((t, dt) => {
      // mist drifts east, wrapping round
      for (let k = 0; k < mistN; k++) {
        mistPos[k * 3] += dt * 0.8;
        if (mistPos[k * 3] > WX / 2) mistPos[k * 3] -= WX;
      }
      mistGeo.attributes.position.needsUpdate = true;
      // farms: waiting ones breathe softly, connected ones glow gold
      for (const F of farms) {
        if (F.on && F.lit < 1) F.lit = Math.min(1, F.lit + dt * 1.5);
        F.halo.material.color.setHex(0xbfd8ff).lerp(new THREE.Color(0xffc060), F.lit);
        F.pillar.material.color.copy(F.halo.material.color);
        F.halo.material.opacity = F.on ? 0.75 : 0.4 + Math.sin(t * 2 + F.pos.x) * 0.15;
        F.pillar.material.opacity = F.on ? 0.35 : 0.15;
        F.pillar.lookAt(rig.position.x, F.pillar.getWorldPosition(new THREE.Vector3()).y, rig.position.z);
      }
      // threads grow out, then pulses run along them
      for (const T of threads) {
        if (T.grow < 1) { T.grow = Math.min(1, (performance.now() - T.born) / 1300); T.tube.setDrawRange(0, Math.floor(T.total * T.grow / 6) * 6); }
        const u = (t * 0.25 + T.phase) % 1;
        T.pulse.position.copy(T.curve.getPointAt(Math.min(u, T.grow)));
        T.pulse.material.opacity = T.grow < 1 ? 0 : 0.9;
      }
      marketGlow.material.opacity = 0.35 + threads.length * 0.03 + Math.sin(t * 1.5) * 0.05;
    });

    // ---------- The fragment, over the market once the network is built ----------
    const fragment = new THREE.Group();
    const gem = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(2.2, 0)), keep(new THREE.MeshBasicMaterial({ color: 0xff6b55 })));
    const gemHalo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: dot, color: 0xff6b55, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })));
    gemHalo.scale.set(16, 16, 1);
    const fhit = new THREE.Mesh(keep(new THREE.SphereGeometry(9, 8, 6)), keep(new THREE.MeshBasicMaterial({ visible: false })));
    fragment.add(gem, gemHalo, fhit);
    fragment.position.copy(market).add(new THREE.Vector3(0, 22, 0));
    fragment.visible = false;
    scene.add(fragment);
    every((t, dt) => { gem.rotation.x += dt * 0.6; gem.rotation.y += dt * 0.9; fragment.position.y = market.y + 22 + Math.sin(t * 1.4) * 1.2; });

    const center = farms.reduce((c, F) => c.add(F.pos), new THREE.Vector3()).multiplyScalar(1 / farms.length).lerp(market, 0.25);
    center.y = groundAt(center.x, center.z);

    return {
      farms, market, center, fragment, groundAt, setMorning, connect, WX, WZ,
      kaptagat: farms[0].pos,
      dispose() {
        fns.forEach((f) => frameFns.delete(f));
        disposables.forEach((d) => d.dispose?.());
        scene.clear();
      },
    };
  },

  async play(ctx, world) {
    const { THREE, camera, rig, cinema, card, fly, say, prompt, tapObject, collect, wait, calm, sound, frameFns } = ctx;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const { center, market, groundAt } = world;

    // Orbit used during the quest: wide, slow, looking down on all the farms
    const R = 150, ALT = 95;
    const orbitAt = (a) => V(center.x + Math.cos(a) * R, center.y + ALT, center.z + Math.sin(a) * R);
    const startAngle = Math.PI * 0.85;   // west-north-west of the farms, looking east to the sunrise

    // 1. Dawn: low over the plateau west of Eldoret, rising and turning towards the farms
    cinema(true);
    const m0 = market.clone();
    const g = (x, z, up) => V(x, groundAt(x, z) + up, z);
    const intro = new THREE.CatmullRomCurve3([
      g(m0.x - 120, m0.z + 60, 14), g(m0.x - 60, m0.z + 30, 10), g(m0.x + 10, m0.z - 10, 16), orbitAt(startAngle),
    ]);
    const lookTarget = V(world.WX * 0.5, groundAt(0, 0) + 10, -world.WZ * 0.1);   // towards the escarpment and the sun
    const dawn0 = performance.now();
    const sunrise = () => world.setMorning(Math.min(0.35, (performance.now() - dawn0) / 50000));
    frameFns.add(sunrise);
    const sunTimer = setInterval(sunrise, 200);
    const flight = fly(intro, 16, { lookAt: lookTarget });
    await wait(1200);
    await card("<span>Chapter three</span><b>The Fields</b>", 3000);
    await card("<span>Uasin Gishu, Kenya</span><b>the real ground</b>", 2800);
    await flight;
    // ease the gaze from the sunrise down to the farms
    const from = lookTarget.clone();
    await new Promise((res) => {
      const t0 = performance.now(), D = calm ? 300 : 2500;
      const step = () => { const u = Math.min(1, (performance.now() - t0) / D); rig.target.copy(from).lerp(center, u * u * (3 - 2 * u)); if (u >= 1) { frameFns.delete(step); clearInterval(tm); res(); } };
      frameFns.add(step); const tm = setInterval(step, 100);
    });
    cinema(false);

    await say([
      "Uasin Gishu: Kenya's breadbasket.\nThis is the real shape of the land, from satellite elevation data.",
      "Maize, wheat and dairy, as far as you can see.\nTo the east, the escarpment drops a kilometre into the Kerio Valley.",
      "But a farmer in one valley often can't ask\nthe farmer in the next one what worked.",
      "So I built FarmConnect: ask growers anywhere,\nsee what's selling, and trade directly.",
    ]);

    frameFns.delete(sunrise); clearInterval(sunTimer);
    world.setMorning(0.35);
    // 2. Quest: connect the farmers. The camera circles slowly; tap a glowing farm (or press E).
    let angle = startAngle;
    const orbit = (t, dt) => {
      if (!calm) angle += dt * 0.025;
      rig.position.copy(orbitAt(angle));
      rig.target.copy(center);
    };
    frameFns.add(orbit);
    const orbitTimer = setInterval(() => orbit(0, 0.1), 100);
    let count = 0;
    const meter = () => `Tap a glowing farm (or press E) to <b>connect it</b> · ${Math.min(count, NEEDED)}/${NEEDED}<span class="meter"><i style="width:${(count / NEEDED) * 100}%"></i></span>`;
    prompt(meter());
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    await new Promise((resolve) => {
      const light = (F) => {
        if (!F || F.on) return;
        const others = world.farms.filter((o) => o.on);
        F.on = true; count++;
        world.connect(F.pos, market);
        // link to the nearest farm already connected, so it grows into a web, not a star
        if (others.length) world.connect(F.pos, others.sort((a, b) => a.pos.distanceTo(F.pos) - b.pos.distanceTo(F.pos))[0].pos);
        sound?.chime?.(count);
        world.setMorning(0.35 + (count / world.farms.length) * 0.65);
        card(`<span>${F.name}${F.place ? ", " + F.place : ""}</span>${F.text}`, 2600);
        prompt(meter());
        if (count >= NEEDED) setTimeout(resolve, 3600);
      };
      const onTap = (e) => {
        if (e.target.tagName !== "CANVAS") return;
        ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        light(world.farms.find((F) => !F.on && ray.intersectObject(F.hit).length));
      };
      // E: the unconnected farm nearest the middle of the screen
      const onKey = (e) => {
        if (e.code !== "KeyE" && e.code !== "Enter") return;
        const best = world.farms.filter((F) => !F.on).map((F) => {
          const s = F.pos.clone().project(camera);
          return { F, d: Math.hypot(s.x, s.y) };
        }).sort((a, b) => a.d - b.d)[0];
        light(best?.F);
      };
      addEventListener("pointerup", onTap); addEventListener("keydown", onKey);
      const done = resolve;
      resolve = () => { removeEventListener("pointerup", onTap); removeEventListener("keydown", onKey); done(); };
    });
    prompt(null);

    await say([
      count === world.farms.length ? "Every farm connected." : `${count} farms connected, and the web holds.`,
      "Questions answered by someone who's already been through it.\nPrices out in the open. No broker in the middle.",
    ]);

    // 3. The fragment, over the market
    frameFns.delete(orbit); clearInterval(orbitTimer);
    cinema(true);
    const toMarket = new THREE.CatmullRomCurve3([rig.position.clone(), market.clone().add(V(40, 60, 60)), market.clone().add(V(22, 34, 30))]);
    world.fragment.visible = true;
    await fly(toMarket, 7, { lookAt: world.fragment.position });
    cinema(false);
    prompt("Tap the light above the market");
    await tapObject(world.fragment);
    prompt(null);
    collect(this.fragment);
    world.fragment.visible = false;
    await wait(500);
    await say([
      "Fragment found: Community.\nA marketplace is just people trusting each other at a distance.",
      "But prices still rise and fall like the weather.\nI started to wonder if anyone can really predict them…",
    ]);
  },
};
