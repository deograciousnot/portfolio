// Chapter 1 · The Misty Forest
// A cinematic flight down through the canopy, the original intro as narration, then the visitor
// walks the path from deep blue night towards dawn. Lanterns light as they pass, leaves fall,
// moonbeams slant through the trees, and three carved stones hold lines from the notebook.
// Fragment: Curiosity.

// Gentle rolling ground, so the forest isn't a flat table
const heightAt = (x, z) => Math.sin(x * 0.08) * 0.9 + Math.cos(z * 0.06) * 0.7 + Math.sin((x + z) * 0.15) * 0.25;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Night and dawn palettes; the walk blends from one to the other
const NIGHT = { top: 0x060a18, horizon: 0x1b2e3d, fog: 0x1c2c33, hemiSky: 0x9cb6d6, hemiGround: 0x0d1210 };
const DAWN = { top: 0x2c4170, horizon: 0xf2a36f, fog: 0x8a7b74, hemiSky: 0xffe0c2, hemiGround: 0x6a5440 };

// The stones carry lines from the notebook, in Deogracious's own words
const STONES = [
  { u: 0.28, text: "Sometimes you don't break the loop.<b>You learn to walk it.</b>" },
  { u: 0.55, text: "Maybe the universe isn't quiet.<b>Maybe it's meditating.</b>" },
  { u: 0.8, text: "Could our choices be echoes of<b>a long ancestral algorithm, still running?</b>" },
];

// A soft round dot drawn once, used for mist, fireflies, leaves and glows
function softDot(THREE, inner = "rgba(255,255,255,1)") {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A carved spiral glyph for the stones
function glyph(THREE) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.strokeStyle = "#ff8f6b"; g.lineWidth = 6; g.lineCap = "round";
  g.shadowColor = "#ff6b55"; g.shadowBlur = 14;
  g.beginPath();
  for (let a = 0; a < Math.PI * 5; a += 0.1) {
    const r = 6 + a * 3.4;
    g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A vertical fade (bright at the top), used for the moonbeams
function beamTexture(THREE) {
  const c = document.createElement("canvas");
  c.width = 8; c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 128);
  return new THREE.CanvasTexture(c);
}

export default {
  id: "forest",
  title: "The Misty Forest",
  fragment: "Curiosity",

  build({ THREE, scene, frameFns, rig }) {
    const disposables = [];
    const keep = (x) => { disposables.push(x); return x; };
    const fns = [];
    const every = (fn) => { fns.push(fn); frameFns.add(fn); };
    const C = (hex) => new THREE.Color(hex);

    // ---------- Sky: a big dome with a vertical gradient and a glow where the sun will rise ----------
    const skyMat = keep(new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: C(NIGHT.top) }, horizon: { value: C(NIGHT.horizon) },
        sunDir: { value: new THREE.Vector3(0.1, 0.02, -1).normalize() }, sunGlow: { value: 0 },
      },
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform float sunGlow; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y * 1.6, 0.0, 1.0); vec3 col = mix(horizon, top, pow(h, 0.7));
        float s = max(dot(normalize(vDir), sunDir), 0.0); col += vec3(1.0, 0.62, 0.35) * pow(s, 24.0) * sunGlow * 1.4;
        col += vec3(1.0, 0.75, 0.5) * pow(s, 4.0) * sunGlow * 0.25; gl_FragColor = vec4(col, 1.0); }`,
    }));
    const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(280, 32, 16)), skyMat);
    scene.add(sky);
    scene.fog = new THREE.FogExp2(NIGHT.fog, 0.02);
    const hemi = new THREE.HemisphereLight(NIGHT.hemiSky, NIGHT.hemiGround, 1.0);
    const moonLight = new THREE.DirectionalLight(0xcfe0ff, 1.5);
    moonLight.position.set(-30, 60, 20);
    const sunLight = new THREE.DirectionalLight(0xffb27a, 0);
    sunLight.position.set(10, 8, -100);
    scene.add(hemi, moonLight, sunLight);

    // Stars, high on the dome; they fade at dawn
    const starN = 900, starPos = new Float32Array(starN * 3);
    for (let k = 0; k < starN; k++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(1 - Math.random() * 0.9);
      starPos.set([Math.sin(ph) * Math.cos(th) * 260, Math.cos(ph) * 260, Math.sin(ph) * Math.sin(th) * 260], k * 3);
    }
    const starGeo = keep(new THREE.BufferGeometry());
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = keep(new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false, depthWrite: false }));
    scene.add(new THREE.Points(starGeo, starMat));

    // ---------- The path ----------
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const z = 10 - k * 10;
      const x = Math.sin(k * 0.9) * 6 + Math.sin(k * 0.37) * 4;
      pts.push(new THREE.Vector3(x, heightAt(x, z), z));
    }
    const path = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.4);
    const pathSamples = path.getSpacedPoints(240);
    const distToPath = (x, z) => {
      let d = Infinity;
      for (let s = 0; s < pathSamples.length; s += 3) d = Math.min(d, Math.hypot(pathSamples[s].x - x, pathSamples[s].z - z));
      return d;
    };

    // ---------- Ground, with the trail worn into it ----------
    const groundGeo = keep(new THREE.PlaneGeometry(320, 320, 120, 120));
    groundGeo.rotateX(-Math.PI / 2);
    groundGeo.translate(0, 0, -50);   // the forest stretches ahead of the path
    const gp = groundGeo.attributes.position, colors = [];
    const moss = C(0x1d2b23), trail = C(0x5a5440);
    for (let k = 0; k < gp.count; k++) {
      const x = gp.getX(k), z = gp.getZ(k);
      gp.setY(k, heightAt(x, z) - 0.02);
      const c = moss.clone().lerp(trail, Math.max(0, 1 - distToPath(x, z) / 2.2) * 0.8);
      colors.push(c.r, c.g, c.b);
    }
    groundGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    groundGeo.computeVertexNormals();
    scene.add(new THREE.Mesh(groundGeo, keep(new THREE.MeshLambertMaterial({ vertexColors: true }))));

    // ---------- Trees: firs and round broadleaf trees, instanced for speed ----------
    const spots = [];
    let guard = 0;
    while (spots.length < 560 && guard++ < 8000) {
      const x = (Math.random() - 0.5) * 150, z = 30 - Math.random() * 170;
      if (distToPath(x, z) > 3.4) spots.push({ x, z, s: 0.7 + Math.random() * 0.9, r: Math.random() * Math.PI, broad: Math.random() < 0.28 });
    }
    const firs = spots.filter((t) => !t.broad), broads = spots.filter((t) => t.broad);
    const trunkMat = keep(new THREE.MeshLambertMaterial({ color: 0x2b211a, flatShading: true }));
    const trunks = new THREE.InstancedMesh(keep(new THREE.CylinderGeometry(0.18, 0.3, 2.4, 5)), trunkMat, spots.length);
    const cones = new THREE.InstancedMesh(keep(new THREE.ConeGeometry(1.7, 3.2, 6)), keep(new THREE.MeshLambertMaterial({ flatShading: true })), firs.length * 3);
    const crowns = new THREE.InstancedMesh(keep(new THREE.IcosahedronGeometry(1.9, 0)), keep(new THREE.MeshLambertMaterial({ flatShading: true })), broads.length * 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    const firGreens = [0x24503a, 0x2f6446, 0x3a7552, 0x1d4230];
    const leafGreens = [0x3d5a2a, 0x4a6b30, 0x56702f, 0x34502a];
    spots.forEach((t, k) => {
      const y = heightAt(t.x, t.z);
      q.setFromAxisAngle(up, t.r);
      m.compose(p.set(t.x, y + 1.2 * t.s, t.z), q, sc.set(t.s, t.s * (t.broad ? 1.3 : 1), t.s));
      trunks.setMatrixAt(k, m);
    });
    firs.forEach((t, k) => {
      const y = heightAt(t.x, t.z);
      q.setFromAxisAngle(up, t.r);
      for (let tier = 0; tier < 3; tier++) {
        const ts = t.s * (1 - tier * 0.22);
        m.compose(p.set(t.x, y + (2.4 + tier * 1.35) * t.s, t.z), q, sc.set(ts, ts, ts));
        cones.setMatrixAt(k * 3 + tier, m);
        cones.setColorAt(k * 3 + tier, col.setHex(firGreens[(k + tier) % firGreens.length]));
      }
    });
    broads.forEach((t, k) => {
      const y = heightAt(t.x, t.z);
      for (let b = 0; b < 2; b++) {
        q.setFromAxisAngle(up, t.r + b);
        const bs = t.s * (b ? 0.75 : 1);
        m.compose(p.set(t.x + (b ? 0.9 : 0) * t.s, y + (4 + b * 0.9) * t.s, t.z + (b ? 0.5 : 0) * t.s), q, sc.set(bs * 1.1, bs * 0.85, bs));
        crowns.setMatrixAt(k * 2 + b, m);
        crowns.setColorAt(k * 2 + b, col.setHex(leafGreens[(k + b) % leafGreens.length]));
      }
    });
    scene.add(trunks, cones, crowns);

    // Ferns along the edges of the trail
    const fernSpots = [];
    for (let k = 0; k < 900 && fernSpots.length < 340; k++) {
      const u = Math.random(), at = path.getPointAt(u), side = Math.random() < 0.5 ? -1 : 1;
      const tan = path.getTangentAt(u), off = 2.9 + Math.random() * 4;
      fernSpots.push([at.x - tan.z * off * side, at.z + tan.x * off * side]);
    }
    const ferns = new THREE.InstancedMesh(keep(new THREE.ConeGeometry(0.55, 0.5, 5)), keep(new THREE.MeshLambertMaterial({ flatShading: true })), fernSpots.length);
    fernSpots.forEach(([x, z], k) => {
      q.setFromAxisAngle(up, Math.random() * 6);
      const s = 0.4 + Math.random() * 0.5;
      m.compose(p.set(x, heightAt(x, z) + 0.2 * s, z), q, sc.set(s, s * 0.9, s));
      ferns.setMatrixAt(k, m);
      ferns.setColorAt(k, col.setHex(Math.random() < 0.5 ? 0x3f6b3a : 0x335a31));
    });
    scene.add(ferns);

    // ---------- Lanterns along the path: dark at first, they glow as the visitor passes ----------
    const glowTex = keep(softDot(THREE, "rgba(255,190,120,1)"));
    const postGeo = keep(new THREE.BoxGeometry(0.16, 1.1, 0.16));
    const bulbGeo = keep(new THREE.SphereGeometry(0.14, 10, 8));
    const postMat = keep(new THREE.MeshLambertMaterial({ color: 0x3a3530 }));
    const lanterns = [];
    for (let u = 0.06; u < 0.97; u += 0.075) {
      const at = path.getPointAt(u), tan = path.getTangentAt(u);
      const side = lanterns.length % 2 ? 1 : -1;
      const base = at.clone().add(new THREE.Vector3(-tan.z, 0, tan.x).normalize().multiplyScalar(1.7 * side));
      base.y = heightAt(base.x, base.z);
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(base.x, base.y + 0.55, base.z);
      const bulbMat = keep(new THREE.MeshBasicMaterial({ color: 0x3b3326 }));
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(base.x, base.y + 1.2, base.z);
      const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })));
      halo.scale.set(3.4, 3.4, 1);
      halo.position.copy(bulb.position);
      scene.add(post, bulb, halo);
      lanterns.push({ u, bulbMat, halo, lit: 0 });
    }

    // ---------- Carved stones with lines from the notebook ----------
    const glyphTex = keep(glyph(THREE)), dot = keep(softDot(THREE));
    const rockGeo = keep(new THREE.DodecahedronGeometry(0.8, 0)), rockMat = keep(new THREE.MeshLambertMaterial({ color: 0x5b5a55, flatShading: true }));
    const stones = STONES.map((def, i) => {
      const at = path.getPointAt(def.u), tan = path.getTangentAt(def.u);
      const side = i % 2 ? -1 : 1;
      const normal = new THREE.Vector3(-tan.z, 0, tan.x).normalize().multiplyScalar(side);
      const pos = at.clone().addScaledVector(normal, 2.7);
      pos.y = heightAt(pos.x, pos.z);
      const g = new THREE.Group();
      g.position.copy(pos);
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.scale.set(1, 1.5, 0.7);
      rock.position.y = 0.9;
      const face = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.9, 0.9)),
        keep(new THREE.MeshBasicMaterial({ map: glyphTex, transparent: true, opacity: 0.35, depthWrite: false })));
      face.position.set(0, 1.05, 0.58);
      const glow = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: dot, color: 0xff6b55, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })));
      glow.scale.set(3, 3, 1); glow.position.y = 1.1;
      // invisible, generous hit area for tapping on phones
      const hit = new THREE.Mesh(keep(new THREE.SphereGeometry(1.6, 8, 6)), keep(new THREE.MeshBasicMaterial({ visible: false })));
      hit.position.y = 1;
      g.add(rock, face, glow, hit);
      g.lookAt(at.x, pos.y, at.z);          // the carved face turns towards the path
      scene.add(g);
      return { ...def, group: g, face, glow, hit, read: false, near: false };
    });

    // ---------- Moonbeams slanting through the trees ----------
    const beamTex = keep(beamTexture(THREE));
    const beams = [];
    for (let k = 0; k < 7; k++) {
      const u = 0.1 + k * 0.13, at = path.getPointAt(Math.min(u, 0.98));
      const mat = keep(new THREE.MeshBasicMaterial({ map: beamTex, color: 0xbcd4ff, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      const beam = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.2 + Math.random() * 2, 34)), mat);
      beam.position.set(at.x + (Math.random() - 0.5) * 10, at.y + 15, at.z + (Math.random() - 0.5) * 6);
      beam.rotation.set(0, Math.random() * Math.PI, 0.45);
      scene.add(beam);
      beams.push({ mat, phase: Math.random() * 6 });
    }

    // ---------- Mist that rolls slowly across the path ----------
    const mistN = 280, mistPos = new Float32Array(mistN * 3);
    for (let k = 0; k < mistN; k++) mistPos.set([(Math.random() - 0.5) * 120, 0.4 + Math.random() * 3, 20 - Math.random() * 150], k * 3);
    const mistGeo = keep(new THREE.BufferGeometry());
    mistGeo.setAttribute("position", new THREE.BufferAttribute(mistPos, 3));
    const mistMat = keep(new THREE.PointsMaterial({ map: dot, size: 15, color: 0xbfd6cb, transparent: true, opacity: 0.09, depthWrite: false }));
    scene.add(new THREE.Points(mistGeo, mistMat));

    // ---------- Fireflies ----------
    const flyN = 140, flyPos = new Float32Array(flyN * 3), flySeed = [];
    for (let k = 0; k < flyN; k++) {
      const at = path.getPointAt(Math.random());
      flySeed.push([at.x + (Math.random() - 0.5) * 16, at.z + (Math.random() - 0.5) * 12, Math.random() * 10]);
    }
    const flyGeo = keep(new THREE.BufferGeometry());
    flyGeo.setAttribute("position", new THREE.BufferAttribute(flyPos, 3));
    const flyMat = keep(new THREE.PointsMaterial({ map: dot, size: 0.2, color: 0xffd98a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(new THREE.Points(flyGeo, flyMat));

    // ---------- Falling leaves, always around the visitor ----------
    const leafN = 120, leafPos = new Float32Array(leafN * 3), leafSeed = [];
    for (let k = 0; k < leafN; k++) leafSeed.push({ x: (Math.random() - 0.5) * 24, y: Math.random() * 10, z: (Math.random() - 0.5) * 24, s: Math.random() * 6, v: 0.6 + Math.random() * 0.6 });
    const leafGeo = keep(new THREE.BufferGeometry());
    leafGeo.setAttribute("position", new THREE.BufferAttribute(leafPos, 3));
    const leafCol = new Float32Array(leafN * 3);
    for (let k = 0; k < leafN; k++) col.setHex([0xc9803a, 0xa8642c, 0x8c9a3a, 0xd59a4a][k % 4]).toArray(leafCol, k * 3);
    leafGeo.setAttribute("color", new THREE.BufferAttribute(leafCol, 3));
    const leafMat = keep(new THREE.PointsMaterial({ size: 0.13, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
    scene.add(new THREE.Points(leafGeo, leafMat));

    // ---------- Moon, and the sun that rises at the end of the path ----------
    const moon = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: dot, color: 0xe6f0ff, transparent: true, opacity: 0.6, depthWrite: false, fog: false })));
    moon.scale.set(60, 60, 1);
    moon.position.set(-40, 70, -180);
    scene.add(moon);

    // ---------- The fragment waiting at the end of the path ----------
    const end = path.getPointAt(1);
    const fragment = new THREE.Group();
    const gem = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(0.32, 0)), keep(new THREE.MeshBasicMaterial({ color: 0xff6b55 })));
    const gemHalo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: dot, color: 0xff6b55, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })));
    gemHalo.scale.set(2.6, 2.6, 1);
    const hit = new THREE.Mesh(keep(new THREE.SphereGeometry(1.1, 8, 6)), keep(new THREE.MeshBasicMaterial({ visible: false })));
    fragment.add(gem, gemHalo, hit);
    fragment.position.set(end.x, end.y + 1.6, end.z - 3);
    fragment.visible = false;
    scene.add(fragment);

    // ---------- Night -> dawn ----------
    let warmth = 0;
    const tmp = new THREE.Color();
    function setWarmth(w) {
      warmth = w;
      skyMat.uniforms.top.value.setHex(NIGHT.top).lerp(tmp.setHex(DAWN.top), w);
      skyMat.uniforms.horizon.value.setHex(NIGHT.horizon).lerp(tmp.setHex(DAWN.horizon), w);
      skyMat.uniforms.sunGlow.value = smooth(0.2, 1, w);
      scene.fog.color.setHex(NIGHT.fog).lerp(tmp.setHex(DAWN.fog), w);
      hemi.color.setHex(NIGHT.hemiSky).lerp(tmp.setHex(DAWN.hemiSky), w);
      hemi.groundColor.setHex(NIGHT.hemiGround).lerp(tmp.setHex(DAWN.hemiGround), w);
      moonLight.intensity = 1.5 * (1 - w);
      sunLight.intensity = 1.8 * smooth(0.3, 1, w);
      starMat.opacity = 0.85 * (1 - smooth(0.1, 0.7, w));
      moon.material.opacity = 0.6 * (1 - smooth(0.3, 0.9, w));
      flyMat.color.setHex(0xffd98a);
      beams.forEach((b) => b.mat.color.setHex(0xbcd4ff).lerp(tmp.setHex(0xffc890), w));
    }
    setWarmth(0);

    every((t, dt) => {
      // mist rolls sideways, wrapping around
      for (let k = 0; k < mistN; k++) {
        let x = mistPos[k * 3] + dt * 0.6;
        if (x > 60) x -= 120;
        mistPos[k * 3] = x;
      }
      mistGeo.attributes.position.needsUpdate = true;
      // fireflies wander and blink (fewer at dawn)
      for (let k = 0; k < flyN; k++) {
        const [x, z, s] = flySeed[k];
        flyPos[k * 3] = x + Math.sin(t * 0.4 + s) * 1.2;
        flyPos[k * 3 + 1] = heightAt(x, z) + 1.6 + Math.sin(t * 0.7 + s * 2) * 0.6;
        flyPos[k * 3 + 2] = z + Math.cos(t * 0.35 + s) * 1.2;
      }
      flyGeo.attributes.position.needsUpdate = true;
      flyMat.opacity = (0.65 + Math.sin(t * 3) * 0.25) * (1 - warmth * 0.8);
      // leaves fall and sway around wherever the visitor is
      const cx = rig.position.x, cz = rig.position.z, cy = rig.position.y;
      leafSeed.forEach((L, k) => {
        L.y -= dt * L.v;
        if (L.y < -2) { L.y = 9; L.x = (Math.random() - 0.5) * 24; L.z = (Math.random() - 0.5) * 24; }
        leafPos[k * 3] = cx + L.x + Math.sin(t * 1.3 + L.s) * 0.8;
        leafPos[k * 3 + 1] = cy + L.y - 2;
        leafPos[k * 3 + 2] = cz + L.z + Math.cos(t * 1.1 + L.s) * 0.6;
      });
      leafGeo.attributes.position.needsUpdate = true;
      // moonbeams breathe
      beams.forEach((b) => { b.mat.opacity = (0.055 + Math.sin(t * 0.5 + b.phase) * 0.03) * (1 - warmth * 0.5); });
      // lanterns fade up once lit
      for (const L of lanterns) {
        if (L.lit > 0 && L.lit < 1) L.lit = Math.min(1, L.lit + dt * 1.5);
        L.halo.material.opacity = L.lit * (1 - warmth * 0.5);
        L.bulbMat.color.setHex(0x3b3326).lerp(tmp.setHex(0xffe2b0), L.lit);
      }
      // stones glow when the visitor is near, and stay bright once read
      stones.forEach((S) => {
        const target = S.read ? 0.55 : S.near ? 0.45 + Math.sin(t * 3) * 0.2 : 0;
        S.glow.material.opacity += (target - S.glow.material.opacity) * Math.min(dt * 3, 1);
        S.face.material.opacity = S.read ? 1 : S.near ? 0.8 : 0.35;
      });
      // the fragment bobs and spins
      gem.rotation.x += dt * 0.6; gem.rotation.y += dt * 0.9;
      fragment.position.y = end.y + 1.6 + Math.sin(t * 1.6) * 0.15;
      gemHalo.material.opacity = 0.6 + Math.sin(t * 2.4) * 0.2;
    });

    return {
      path, lanterns, stones, fragment, setWarmth,
      dispose() {
        fns.forEach((f) => frameFns.delete(f));
        disposables.forEach((d) => d.dispose?.());
        scene.clear();
      },
    };
  },

  // Slow drift above the start of the path, behind the title screen
  backdrop({ rig, frameFns }, world) {
    const a = world.path.getPointAt(0.02);
    frameFns.add((t) => {
      rig.position.set(a.x + Math.sin(t * 0.05) * 6, 6 + Math.sin(t * 0.08), a.z + 14);
      rig.target.set(a.x, 3, a.z - 20);
    });
  },

  async play(ctx, world) {
    const { THREE, camera, cinema, card, fly, say, prompt, holdToWalk, tapObject, collect, wait, sound } = ctx;
    const start = world.path.getPointAt(0);

    // 1. Cinematic: from above the canopy, under the stars, down onto the path
    cinema(true);
    const descent = new THREE.CatmullRomCurve3([
      new THREE.Vector3(start.x + 26, 34, start.z + 46),
      new THREE.Vector3(start.x + 14, 20, start.z + 26),
      new THREE.Vector3(start.x + 4, 7, start.z + 12),
      new THREE.Vector3(start.x, start.y + 1.7, start.z + 3),
    ]);
    const flight = fly(descent, 13, { lookAt: new THREE.Vector3(start.x, start.y + 1.5, start.z - 25) });
    await wait(1200);
    await card("<span>A story in eight worlds</span>", 2600);
    await card("<span>by</span><b>Deogracious Kiprop</b>", 3000);
    await flight;
    cinema(false);

    // 2. The original intro, as narration
    await say([
      "“Two roads diverged in a wood, and I—\nI took the one less traveled by,\nand that has made all the difference.”",
      "But not every path is taken out of boldness.\nSome are taken because silence pulled us there.",
      "Because questions echoed louder than answers.",
      "This is the story behind the story.\nThis is Deogracious.",
    ]);

    // 3. Quest: walk from night to dawn. Lanterns light as you pass; stones can be read on the way.
    const WALK = 'Hold anywhere (or space) to walk the path<span class="meter"><i></i></span>';
    const STONE = 'A carved stone is glowing: <b>tap it</b> (or press E)<span class="meter"><i></i></span>';
    prompt(WALK);
    world.fragment.visible = true;

    // Reading a stone: tap it (or press E) while it's glowing. Walking can carry on meanwhile.
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const read = (S) => {
      if (!S || S.read) return;
      S.read = true;
      card(S.text, 3600);
    };
    const nearest = () => world.stones.find((S) => S.near && !S.read);
    const onTap = (e) => {
      if (e.target.tagName !== "CANVAS") return;
      ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const S = world.stones.find((s) => s.near && ray.intersectObject(s.hit).length);
      if (S) read(S);
    };
    const onKey = (e) => { if (e.code === "KeyE") read(nearest()); };
    addEventListener("pointerup", onTap);
    addEventListener("keydown", onKey);

    let showingStone = false;
    await holdToWalk(world.path, {
      speed: 0.045,
      onProgress: (u) => {
        world.lanterns.forEach((L) => { if (u > L.u - 0.05 && !L.lit) L.lit = 0.01; });
        world.stones.forEach((S) => { S.near = Math.abs(u - S.u) < 0.06; });
        const w = smooth(0.08, 1, u);
        world.setWarmth(w);
        sound?.setWarmth(w);
        const want = !!nearest();
        if (want !== showingStone) { showingStone = want; prompt(want ? STONE : WALK); }
      },
    });
    removeEventListener("pointerup", onTap);
    removeEventListener("keydown", onKey);
    world.stones.forEach((S) => { S.near = false; });

    // 4. The fragment, in the first light
    prompt("Tap the light");
    await tapObject(world.fragment);
    prompt(null);
    collect(this.fragment);
    world.fragment.visible = false;
    await wait(500);
    const readCount = world.stones.filter((S) => S.read).length;
    await say([
      "Fragment found: Curiosity.\nThe reason for every path that follows.",
      readCount === 3 ? "You stopped to read every stone.\nCurious indeed." : `${readCount} of 3 stones read.\nThey'll still be here, if you walk this way again.`,
      "Somewhere ahead, under the trees,\nsomething is beating.",
    ]);
  },
};
